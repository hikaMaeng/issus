import { DomainError } from "../../worker/errors/index.js";
import { eventProvenance } from "../../../common/index.js";
import { randomUUID } from "node:crypto";
import { deterministicEventId } from "../../../server/index.js";
import type { EventEnvelope, IngressEvent } from "../../../common/index.js";
import type { EventQueueTransport } from "../../queue/transport.js";
import { EventStore } from "../../event-store/store.js";
import { toEventDraft, toResultDraft } from "../../ingress/event-draft.js";
import { toProgressDraft } from "../../ingress/event-draft.js";
import { runWorker, type WorkerPool, WorkerLostError } from "../../worker/pool.js";
import type { MetricsRegistry } from "../../metrics/registry.js";
import type { BrokerLoop } from "../log-tail/index.js";
import { ExecutionStore, type ResultPayload } from "../../idempotency/store.js";
import { nextReadBackoff, wait } from "../backoff.js";

function resultId(event: EventEnvelope): string { return deterministicEventId(`result:${event.transactionKey}:${event.streamId}:${event.replyChannel ?? event.channel}`); }
function conflictId(event: EventEnvelope): string { return deterministicEventId(`conflict:${event.eventId}`); }
class TerminalPersistenceError extends Error {}

export function terminalPersistenceVisibilitySeconds(readCount: number, visibilitySeconds: number, maxSeconds: number): number {
  return Math.min(maxSeconds, visibilitySeconds * 2 ** Math.min(6, Math.max(0, readCount - 1)));
}

/**
 * A worker server consumes one PGMQ command queue and produces nothing but log
 * rows.
 *
 * There used to be a second half to this: a result queue, and an outbox row
 * written in the same transaction as the terminal event so the two could not
 * disagree. Both are gone. Appending to the log *is* the publish, so there is
 * no other system for the append to get out of step with, and nothing left to
 * bridge.
 */
export function startWorkerConsumer(input: { queue: EventQueueTransport; commandQueues: readonly string[]; eventStore: EventStore; executions: ExecutionStore; pool: WorkerPool; metrics: MetricsRegistry; visibilitySeconds: number; pollSeconds: number; batchSize: number; maxInFlight: number; maxExecutionAttempts: number; terminalPersistenceAlertAttempts?: number; terminalPersistenceBackoffMaxSeconds?: number; reactionQueues?: readonly string[]; onPoll?: (queue: string, healthy: boolean) => void }): BrokerLoop {
  let stopped = false;
  const persistResult = async (draft: Parameters<EventStore["append"]>[0]): Promise<EventEnvelope> => input.eventStore.append(draft);
  const process = async (message: { id: string; event: IngressEvent; readCount: number; queueName: string }): Promise<void> => {
    const commandQueue = message.queueName;
    const reaction = input.reactionQueues?.includes(commandQueue) || message.event.sourceEventId !== undefined;
    if (reaction) {
      try {
        eventProvenance(message.event, true);
        const identity = deterministicEventId(`react:${commandQueue}:${message.event.sourceEventId}`);
        if (message.event.eventId !== identity || message.event.transactionKey !== identity) throw new Error("reaction identity mismatch");
      } catch (error) {
        console.error(JSON.stringify({ event: "worker.reaction.source.invalid", messageId: message.id, queue: commandQueue }));
        throw error;
      }
    }
    const command = await input.eventStore.append(toEventDraft(message.event));
    const attemptId = randomUUID();
    let claim: Awaited<ReturnType<ExecutionStore["claim"]>>;
    try { claim = await input.executions.claim(command, attemptId); }
    catch (error) {
      await input.executions.release(command.transactionKey, attemptId).catch(() => undefined);
      throw error;
    }
    if (claim.kind === "conflict") {
      await persistResult(toResultDraft(command, { eventId: conflictId(command), action: `${command.action}.conflict`, channel: command.replyChannel ?? command.channel, createdAt: new Date().toISOString(), source: "worker", payload: { ok: false, error: { code: "idempotency_conflict", message: claim.reason } } }));
      await input.queue.delete(commandQueue, message.id);
      input.metrics.increment("queueDeletes");
      return;
    }
    if (claim.kind === "joined" && !claim.completed) {
      input.metrics.increment("processingJoined");
      // See docs/constraints.md#내구성-경계: this can be a visibility redelivery of
      // the still-running source command. Keeping it lets a later lease expiry
      // reclaim the execution instead of orphaning the transaction.
      if (claim.requestEventId !== command.eventId) {
        await input.queue.delete(commandQueue, message.id);
        input.metrics.increment("queueDeletes");
      } else await input.executions.recordRedelivery(command.transactionKey);
      return;
    }
    let payload: ResultPayload;
    try {
      if (claim.kind === "claimed") {
        input.metrics.increment("workerStarted");
        const controller = new AbortController();
        let leaseLost = false;
        const heartbeat = setInterval(() => {
          // DB ownership fences execution. A transient PGMQ set_vt failure may duplicate delivery,
          // but must not abort the owner: the retained source command is safe to reclaim later.
          void input.executions.renew(command.transactionKey, claim.attemptId).then((owned) => {
            if (!owned) { leaseLost = true; controller.abort(); }
          }).catch(() => { leaseLost = true; controller.abort(); });
          void input.queue.extendVisibility(commandQueue, message.id, input.visibilitySeconds).catch((error) => {
            input.metrics.increment("queueVisibilityRenewFailures");
            console.error(JSON.stringify({ event: "worker.visibility.renew.failed", messageId: message.id, error: error instanceof Error ? error.message : String(error) }));
          });
        }, Math.max(1_000, Math.floor(input.visibilitySeconds * 1_000 / 3)));
        // A handler observation becomes a durable event on the reply channel, so
        // a client that reconnects mid-execution replays it from the event store.
        // Progress is best-effort: losing one must not fail an otherwise healthy
        // execution, so the append error is logged and swallowed.
        //
        // These appends run in parallel and are deliberately not ordered here.
        // Commit order does not agree with emit order — each append races for
        // the `event_stream_sequence` row — and nothing downstream needs it to.
        // A handler that emits a burst numbers it, and each reader puts a late
        // arrival back in place. Serialising the writes to buy an ordering
        // guarantee no one relies on would only add latency to a stream.
        let progressSeq = 0;
        let unsafeEmission = false;
        const onProgress = (progress: Record<string, unknown>): void => {
          // A superseded attempt stops writing here, not at its next await.
          // Losing the lease means another worker was told this execution was
          // dead and is redoing it; anything this one writes from now on is a
          // second opinion nobody asked for.
          if (leaseLost) return;
          if (progress.kind !== undefined && progress.kind !== "progress") {
            unsafeEmission = true; controller.abort();
            console.error(JSON.stringify({ event: "worker.emit.fact.forbidden", transactionKey: command.transactionKey }));
            return;
          }
          const seq = progressSeq++;
          const action = typeof progress.action === "string" ? progress.action : `${command.action}.progress`;
          // Progress observations can be retried; durable facts use the app UoW.
          const key = typeof progress.key === "string" && progress.key ? progress.key : null;
          void persistResult(toProgressDraft(command, {
            eventId: key
              ? deterministicEventId(`fact:${command.streamId}:${key}`)
              : deterministicEventId(`progress:${command.transactionKey}:${command.streamId}:${seq}`),
            action,
            kind: "progress",
            // A handler marks its own worker-to-worker traffic. The broker reads
            // the mark and still knows nothing about what the action means.
            ...(progress.audience === "worker" ? { audience: "worker" as const } : {}),
            payload: progress,
          })).catch((error) => console.error(JSON.stringify({ event: "worker.progress.persist.failed", transactionKey: command.transactionKey, error: error instanceof Error ? error.message : String(error) })));
        };
        /**
         * The authoritative answer to "is this still mine?".
         *
         * The heartbeat asks the same question on a timer, and the abort signal
         * carries its answer — but only as of the last tick. A handler about to
         * do something it cannot take back should not act on a stale yes, so it
         * can ask now and get the current truth, which also renews the lease it
         * is about to need.
         */
        const fence = async (): Promise<boolean> => {
          if (leaseLost) return false;
          try {
            const owned = await input.executions.renew(command.transactionKey, claim.attemptId);
            if (!owned) { leaseLost = true; controller.abort(); }
            return owned;
          } catch {
            // Unreachable database means unproven ownership, and an unproven
            // owner must not proceed as though it were the owner.
            leaseLost = true;
            controller.abort();
            return false;
          }
        };
        try {
          // The lane is passed on: a worker watching several queues routes on it.
          const worker = await runWorker(input.pool, command, controller.signal, undefined, onProgress, commandQueue, fence);
          if (unsafeEmission) throw new Error("durable facts must use an awaited domain UoW append");
          if (leaseLost) throw new WorkerLostError("worker lost the execution lease");
          const value = worker.value as { ok?: unknown; error?: { code?: unknown; message?: unknown } } | null;
          payload = value && value.ok === false && typeof value.error?.code === "string" && typeof value.error.message === "string"
            ? { ok: false, error: { code: value.error.code, message: value.error.message } }
            : { ok: true, value: worker.value };
        }
        finally { clearInterval(heartbeat); }
        input.metrics.increment("workerCompleted");
        if (!await input.executions.complete(command.transactionKey, claim.attemptId, payload)) throw new WorkerLostError("worker lost the execution lease");
      } else {
        if (!claim.result) throw new Error("completed execution has no durable result");
        payload = claim.result;
      }
    } catch (error) {
      if (!(error instanceof DomainError)) {
        // Infrastructure and unknown failures retain the original queue record at every attempt count.
        if (claim.kind === "claimed") await input.executions.release(command.transactionKey, claim.attemptId);
        throw error;
      }
      payload = { ok: false, error: { code: error.code, message: error.message } };
      input.metrics.increment("workerFailed");
      if (claim.kind === "claimed") {
        try {
          if (!await input.executions.complete(command.transactionKey, claim.attemptId, payload)) throw new WorkerLostError("worker lost the execution lease");
        } catch (completionError) {
          await input.executions.release(command.transactionKey, claim.attemptId).catch(() => undefined);
          throw completionError;
        }
      }
    }
    try {
      const recipients = await input.executions.recipients(command.transactionKey);
      for (const recipient of recipients) {
        await persistResult(toResultDraft(recipient, { eventId: resultId(recipient), action: `${recipient.action}.result`, channel: recipient.replyChannel ?? recipient.channel, createdAt: new Date().toISOString(), source: "worker", payload }));
      }
      await input.queue.delete(commandQueue, message.id);
      input.metrics.increment("queueDeletes");
    } catch (error) { throw new TerminalPersistenceError(error instanceof Error ? error.message : String(error)); }
  };
  // One budget across every watched queue. Two lanes reading two queues must
  // not each be allowed the full ceiling.
  const inFlight = new Set<Promise<void>>();
  const schedule = (message: { id: string; event: IngressEvent; readCount: number; queueName: string }): void => {
    let task: Promise<void>;
    task = process(message).catch(async (error) => {
      if (error instanceof TerminalPersistenceError) {
        input.metrics.increment("terminalPersistenceRetries");
        const retryAfterSeconds = terminalPersistenceVisibilitySeconds(message.readCount, input.visibilitySeconds, input.terminalPersistenceBackoffMaxSeconds ?? 300);
        await input.queue.extendVisibility(message.queueName, message.id, retryAfterSeconds).catch((visibilityError) => console.error(JSON.stringify({ event: "worker.terminal.retry.backoff.failed", messageId: message.id, error: visibilityError instanceof Error ? visibilityError.message : String(visibilityError) })));
        console.error(JSON.stringify({ event: "worker.terminal.retry", messageId: message.id, error: error.message }));
        if (message.readCount >= (input.terminalPersistenceAlertAttempts ?? 10)) {
          input.metrics.increment("terminalPersistenceAlerts");
          console.error(JSON.stringify({ event: "worker.terminal.persistence.alert", messageId: message.id, readCount: message.readCount, threshold: input.terminalPersistenceAlertAttempts ?? 10, error: error.message }));
        }
      } else {
        input.metrics.increment("processingFailures");
        console.error(JSON.stringify({ event: "worker.command.retry", messageId: message.id, error: error instanceof Error ? error.message : String(error) }));
      }
    }).finally(() => inFlight.delete(task));
    inFlight.add(task);
  };
  /** One reading lane per watched queue. They share the in-flight budget above. */
  const lane = async (queueName: string): Promise<void> => { let backoffMs = 100; while (!stopped) {
    try {
      const messages = await input.queue.read(queueName, { visibilityTimeoutSeconds: input.visibilitySeconds, quantity: input.batchSize, pollSeconds: input.pollSeconds });
      input.onPoll?.(queueName, true);
      input.metrics.increment("queueReads"); input.metrics.increment("queueMessages", messages.length);
      backoffMs = 100;
      for (const message of messages) {
        while (!stopped && inFlight.size >= input.maxInFlight) await Promise.race(inFlight);
        if (stopped) break;
        schedule({ id: message.id, event: message.event as IngressEvent, readCount: message.readCount, queueName });
      }
    } catch (error) { input.onPoll?.(queueName, false); input.metrics.increment("brokerReadFailures"); console.error(JSON.stringify({ event: "worker.consumer.retry", queue: queueName, backoffMs, error: error instanceof Error ? error.message : String(error) })); await wait(backoffMs); backoffMs = nextReadBackoff(backoffMs); }
  } };
  const done = Promise.all(input.commandQueues.map((queueName) => lane(queueName))).then(async () => { await Promise.allSettled(inFlight); });
  return { stop: () => { stopped = true; }, done };
}
