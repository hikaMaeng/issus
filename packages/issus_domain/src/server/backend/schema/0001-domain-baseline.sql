-- design.md v2.1 §2.1, §5.5, §6.2. Apply once inside the P4 migration transaction/lock.
CREATE SCHEMA IF NOT EXISTS issus;

CREATE TABLE issus.owner (
 id uuid PRIMARY KEY, name text NOT NULL, supervisor_alias_id uuid,
 CONSTRAINT owner_name_nonempty CHECK (length(name)>0)
);
CREATE UNIQUE INDEX owner_name_folded ON issus.owner (casefold(name COLLATE pg_catalog."pg_unicode_fast"));

CREATE TABLE issus.alias (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES issus.owner(id),
 name text NOT NULL, folded_name text NOT NULL, status text NOT NULL DEFAULT 'active',
 renamed_to uuid, registered_at timestamptz NOT NULL DEFAULT now(),
 role text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', scope text NOT NULL DEFAULT '',
 UNIQUE (owner_id, id), UNIQUE (owner_id,folded_name),
 CHECK (folded_name=lower(name)), CHECK (length(name) BETWEEN 2 AND 24),
 CHECK (status IN ('active','renamed')), CHECK ((status='renamed')=(renamed_to IS NOT NULL)),
 CHECK (renamed_to IS NULL OR renamed_to<>id),
 FOREIGN KEY (owner_id,renamed_to) REFERENCES issus.alias(owner_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE issus.owner ADD CONSTRAINT owner_supervisor_scope FOREIGN KEY (id,supervisor_alias_id) REFERENCES issus.alias(owner_id,id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE issus.repo (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES issus.owner(id), slug text NOT NULL,
 project_code text NOT NULL, next_issue_number integer NOT NULL DEFAULT 1,
 board_issue_id integer, auto_board boolean NOT NULL DEFAULT true,
 UNIQUE(owner_id,id), UNIQUE(owner_id,slug), UNIQUE(owner_id,project_code),
 CHECK(length(slug)>0), CHECK(project_code ~ '^[a-z0-9]{2,6}$'), CHECK(next_issue_number>=1)
);
CREATE TABLE issus.alias_repo (
 owner_id uuid NOT NULL, alias_id uuid NOT NULL, repo_id uuid NOT NULL,
 PRIMARY KEY(alias_id,repo_id),
 FOREIGN KEY(owner_id,alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,repo_id) REFERENCES issus.repo(owner_id,id)
);
CREATE INDEX alias_repo_repo ON issus.alias_repo(repo_id,alias_id);

CREATE TABLE issus.session (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, alias_id uuid NOT NULL, sid text NOT NULL,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 kind text NOT NULL DEFAULT 'agent',
 UNIQUE(alias_id,sid), UNIQUE(owner_id,id), UNIQUE(owner_id,id,alias_id),
 FOREIGN KEY(owner_id,alias_id) REFERENCES issus.alias(owner_id,id),
 CHECK(sid ~ '^[a-z0-9-]{1,12}$'), CHECK(kind IN ('agent','service')),
 CHECK(token_hash ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX session_one_active_writer ON issus.session(alias_id) WHERE revoked_at IS NULL;
CREATE INDEX session_expires ON issus.session(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE issus.subscription (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, session_id uuid NOT NULL,
 channels text[] NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 last_heartbeat_at timestamptz NOT NULL DEFAULT now(), transport text NOT NULL,
 FOREIGN KEY(owner_id,session_id) REFERENCES issus.session(owner_id,id),
 CHECK(cardinality(channels)<=32), CHECK(transport IN ('websocket','sse'))
);
CREATE INDEX subscription_active_session ON issus.subscription(session_id) WHERE closed_at IS NULL;

CREATE TABLE issus.issue (
 owner_id uuid NOT NULL, repo_id uuid NOT NULL, number integer NOT NULL,
 title text NOT NULL, body text NOT NULL, state text NOT NULL, owner_alias_id uuid NOT NULL,
 is_open boolean NOT NULL DEFAULT true, close_reason text, reply_in text,
 compact_comment_id bigint, is_board boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repo_id,number), UNIQUE(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,repo_id) REFERENCES issus.repo(owner_id,id),
 FOREIGN KEY(owner_id,owner_alias_id) REFERENCES issus.alias(owner_id,id),
 CHECK(number>=1), CHECK(revision>=1),
 CHECK(state IN ('queued','running','blocked','hold','done','failed','cancelled','pending-user')),
 CHECK(is_open OR state IN ('done','failed','cancelled'))
);
CREATE UNIQUE INDEX issue_one_board ON issus.issue(repo_id) WHERE is_board;
CREATE INDEX issue_listing ON issus.issue(repo_id,is_open,number);
CREATE INDEX issue_owner ON issus.issue(owner_alias_id,is_open);
ALTER TABLE issus.repo ADD CONSTRAINT repo_board_issue FOREIGN KEY(id,board_issue_id) REFERENCES issus.issue(repo_id,number) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE issus.comment_counter (
 id smallint PRIMARY KEY CHECK(id=1), last_id bigint NOT NULL CHECK(last_id>=999999)
);
INSERT INTO issus.comment_counter(id,last_id) VALUES(1,999999);
CREATE TABLE issus.comment (
 id bigint PRIMARY KEY, owner_id uuid NOT NULL, repo_id uuid NOT NULL, issue_number integer NOT NULL,
 body text NOT NULL, envelope jsonb NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 author_alias_id uuid NOT NULL, author_session_id uuid NOT NULL, posted_by_alias_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), char_count integer NOT NULL, validity text NOT NULL DEFAULT 'v2',
 UNIQUE(owner_id,id), UNIQUE(owner_id,repo_id,issue_number,id),
 FOREIGN KEY(owner_id,repo_id,issue_number) REFERENCES issus.issue(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,author_alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,posted_by_alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,author_session_id,posted_by_alias_id) REFERENCES issus.session(owner_id,id,alias_id),
 CHECK(id>=1000000), CHECK(validity IN ('v2','noenv')),
 CHECK(char_count=char_length(body)), CHECK(char_count>=0),
 CHECK(validity='noenv' OR char_count<=4000),
 CHECK(jsonb_typeof(envelope)='object'), CHECK(jsonb_typeof(metadata)='object'),
 CHECK(NOT (metadata ? 'compactPacketToken'))
);
CREATE INDEX comment_issue_tail ON issus.comment(repo_id,issue_number,id);
CREATE INDEX comment_author ON issus.comment(author_alias_id,id);
CREATE INDEX comment_type ON issus.comment(repo_id,issue_number,(envelope->>'TYPE'),id);
CREATE INDEX comment_duplicate_candidates ON issus.comment(repo_id,issue_number,author_alias_id,md5(body));
ALTER TABLE issus.issue ADD CONSTRAINT issue_compact_comment FOREIGN KEY(owner_id,repo_id,number,compact_comment_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION issus.reject_comment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'comment is append-only' USING ERRCODE='55000'; END;
$$;
CREATE TRIGGER comment_append_only BEFORE UPDATE OR DELETE ON issus.comment FOR EACH ROW EXECUTE FUNCTION issus.reject_comment_mutation();

CREATE TABLE issus.directive (
 owner_id uuid NOT NULL, comment_id bigint PRIMARY KEY, recipient_alias_id uuid NOT NULL,
 type text NOT NULL, ack_by timestamptz NOT NULL, acked_by_comment_id bigint,
 superseded_by bigint, applied_by_comment_id bigint, hold_released_by bigint,
 UNIQUE(owner_id,comment_id),
 FOREIGN KEY(owner_id,comment_id) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,recipient_alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,acked_by_comment_id) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,superseded_by) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,applied_by_comment_id) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,hold_released_by) REFERENCES issus.comment(owner_id,id),
 CHECK(type IN ('ASK','HOLD','DECISION','HANDOFF')),
 CHECK(applied_by_comment_id IS NULL OR acked_by_comment_id IS NOT NULL),
 CHECK(hold_released_by IS NULL OR type='HOLD')
);
CREATE INDEX directive_waiting ON issus.directive(recipient_alias_id,ack_by) WHERE acked_by_comment_id IS NULL AND superseded_by IS NULL;
CREATE INDEX directive_active_hold ON issus.directive(recipient_alias_id) WHERE type='HOLD' AND hold_released_by IS NULL;
CREATE TABLE issus.directive_recipient (
 owner_id uuid NOT NULL, comment_id bigint NOT NULL, alias_id uuid NOT NULL,
 via text NOT NULL, ack_comment_id bigint, applied_comment_id bigint,
 PRIMARY KEY(comment_id,alias_id),
 FOREIGN KEY(owner_id,comment_id) REFERENCES issus.directive(owner_id,comment_id),
 FOREIGN KEY(owner_id,alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,ack_comment_id) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,applied_comment_id) REFERENCES issus.comment(owner_id,id),
 CHECK(via IN ('to','mention'))
);
CREATE INDEX directive_recipient_alias ON issus.directive_recipient(alias_id,comment_id);

-- Immediate compatibility-reference index (§4.3). All TYPEs, all SUPERSEDES authors.
CREATE TABLE issus.comment_reference (
 owner_id uuid NOT NULL, comment_id bigint NOT NULL, referenced_comment_id bigint NOT NULL,
 kind text NOT NULL, author_alias_id uuid NOT NULL,
 PRIMARY KEY(comment_id,kind,referenced_comment_id),
 FOREIGN KEY(owner_id,comment_id) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,referenced_comment_id) REFERENCES issus.comment(owner_id,id),
 FOREIGN KEY(owner_id,author_alias_id) REFERENCES issus.alias(owner_id,id),
 CHECK(kind IN ('RE','SUPERSEDES'))
);
CREATE INDEX comment_reference_target ON issus.comment_reference(referenced_comment_id,kind,author_alias_id);

CREATE TABLE issus.claim (
 owner_id uuid NOT NULL, comment_id bigint PRIMARY KEY, alias_id uuid NOT NULL,
 repo_id uuid NOT NULL, issue_number integer NOT NULL, due_at timestamptz NOT NULL, released_by_comment_id bigint,
 FOREIGN KEY(owner_id,repo_id,issue_number,comment_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id),
 FOREIGN KEY(owner_id,alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,repo_id,issue_number) REFERENCES issus.issue(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,released_by_comment_id) REFERENCES issus.comment(owner_id,id)
);
CREATE INDEX claim_open ON issus.claim(repo_id,issue_number,due_at) WHERE released_by_comment_id IS NULL;
CREATE TABLE issus.handoff (
 owner_id uuid NOT NULL, comment_id bigint PRIMARY KEY,
 source_repo_id uuid NOT NULL, source_issue_number integer NOT NULL,
 target_repo_id uuid NOT NULL, target_issue_number integer NOT NULL,
 recipient_alias_id uuid NOT NULL, acked_by bigint, status text NOT NULL DEFAULT 'pending',
 FOREIGN KEY(owner_id,source_repo_id,source_issue_number,comment_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id),
 FOREIGN KEY(owner_id,source_repo_id,source_issue_number) REFERENCES issus.issue(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,target_repo_id,target_issue_number) REFERENCES issus.issue(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,recipient_alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,acked_by) REFERENCES issus.comment(owner_id,id),
 CHECK(status IN ('pending','accepted','completed')), CHECK(status='pending' OR acked_by IS NOT NULL)
);
CREATE INDEX handoff_pending ON issus.handoff(source_repo_id,source_issue_number) WHERE status<>'completed';

CREATE TABLE issus.inbox_clock (
 owner_id uuid NOT NULL, alias_id uuid PRIMARY KEY, last_ordinal bigint NOT NULL DEFAULT 0,
 FOREIGN KEY(owner_id,alias_id) REFERENCES issus.alias(owner_id,id), CHECK(last_ordinal>=0)
);
CREATE TABLE issus.delivery (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, source_event_id uuid NOT NULL,
 source_stream_id text NOT NULL, source_sequence bigint NOT NULL, comment_id bigint,
 recipient_alias_id uuid NOT NULL, classification text NOT NULL, ordinal bigint NOT NULL,
 state text NOT NULL DEFAULT 'posted', ack_required boolean NOT NULL,
 ack_by timestamptz, attempt integer NOT NULL DEFAULT 0, next_attempt_at timestamptz,
 version integer NOT NULL DEFAULT 1, alias_event_sequence bigint NOT NULL DEFAULT 0,
 content jsonb NOT NULL,
 UNIQUE(source_event_id,recipient_alias_id), UNIQUE(recipient_alias_id,ordinal),
 UNIQUE(owner_id,id), UNIQUE(owner_id,id,recipient_alias_id),
 FOREIGN KEY(owner_id,recipient_alias_id) REFERENCES issus.alias(owner_id,id),
 FOREIGN KEY(owner_id,comment_id) REFERENCES issus.comment(owner_id,id),
 CHECK(classification IN ('ME','CC','ALL','OTHER')),
 CHECK(state IN ('posted','delivered','acked','applied','superseded')),
 CHECK(ordinal>0), CHECK(source_sequence>0), CHECK(attempt BETWEEN 0 AND 3), CHECK(version>=1),
 CHECK(alias_event_sequence>=0), CHECK(jsonb_typeof(content)='object'),
 CHECK(NOT ack_required OR (comment_id IS NOT NULL AND ack_by IS NOT NULL)),
 CHECK(ack_required OR state NOT IN ('acked','applied'))
);
CREATE INDEX delivery_due ON issus.delivery(next_attempt_at) WHERE next_attempt_at IS NOT NULL;
CREATE INDEX delivery_comment ON issus.delivery(comment_id,recipient_alias_id);
CREATE INDEX delivery_refresh ON issus.delivery(recipient_alias_id,alias_event_sequence);
CREATE TABLE issus.delivery_receipt (
 owner_id uuid NOT NULL, delivery_id uuid NOT NULL, session_id uuid NOT NULL,
 alias_id uuid NOT NULL, attempt integer NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 transport text NOT NULL, evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(delivery_id,session_id,attempt),
 FOREIGN KEY(owner_id,delivery_id,alias_id) REFERENCES issus.delivery(owner_id,id,recipient_alias_id),
 FOREIGN KEY(owner_id,session_id,alias_id) REFERENCES issus.session(owner_id,id,alias_id),
 CHECK(attempt BETWEEN 0 AND 3), CHECK(transport IN ('websocket','sse','http','ack-evidence'))
);
CREATE TABLE issus.processed (
 owner_id uuid NOT NULL, alias_id uuid NOT NULL, delivery_id uuid NOT NULL, disposition text NOT NULL,
 evidence_comment_id bigint, reason text, recorded_by_session uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(alias_id,delivery_id),
 FOREIGN KEY(owner_id,delivery_id,alias_id) REFERENCES issus.delivery(owner_id,id,recipient_alias_id),
 FOREIGN KEY(owner_id,recorded_by_session,alias_id) REFERENCES issus.session(owner_id,id,alias_id),
 FOREIGN KEY(owner_id,evidence_comment_id) REFERENCES issus.comment(owner_id,id),
 CHECK(disposition IN ('acked','replied','ignored')),
 CHECK((disposition='ignored' AND reason IS NOT NULL AND length(btrim(reason))>0) OR (disposition<>'ignored' AND evidence_comment_id IS NOT NULL))
);

CREATE TABLE issus.compact_segment (
 owner_id uuid NOT NULL, repo_id uuid NOT NULL, issue_number integer NOT NULL,
 previous_compact_id bigint, through_id bigint, count integer NOT NULL DEFAULT 0,
 chars bigint NOT NULL DEFAULT 0, due_reasons text[] NOT NULL DEFAULT '{}', generation integer NOT NULL DEFAULT 0,
 PRIMARY KEY(repo_id,issue_number),
 FOREIGN KEY(owner_id,repo_id,issue_number) REFERENCES issus.issue(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,repo_id,issue_number,previous_compact_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id),
 FOREIGN KEY(owner_id,repo_id,issue_number,through_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id),
 CHECK(count>=0), CHECK(chars>=0), CHECK(generation>=0),
 CHECK(due_reasons <@ ARRAY['comments','chars','before-decision','before-handoff','before-close']::text[])
);
-- §6.2 opaque packet record: only a token hash is persisted.
CREATE TABLE issus.compact_packet (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, repo_id uuid NOT NULL, issue_number integer NOT NULL,
 previous_compact_id bigint, through_id bigint NOT NULL,
 through_comment_id bigint GENERATED ALWAYS AS (nullif(through_id,0)) STORED,
 snapshot_revision integer NOT NULL,
 packet_hash text NOT NULL, token_hash text NOT NULL UNIQUE, snapshot jsonb NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,repo_id,issue_number) REFERENCES issus.issue(owner_id,repo_id,number),
 FOREIGN KEY(owner_id,repo_id,issue_number,previous_compact_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id),
 FOREIGN KEY(owner_id,repo_id,issue_number,through_comment_id) REFERENCES issus.comment(owner_id,repo_id,issue_number,id),
 CHECK(through_id>=0), CHECK(snapshot_revision>=1),
 CHECK(packet_hash ~ '^[0-9a-f]{64}$'), CHECK(token_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX compact_packet_expiry ON issus.compact_packet(expires_at);

CREATE TABLE issus.command_result (
 principal_id uuid NOT NULL, idempotency_key uuid NOT NULL, request_hash text NOT NULL,
 operation_id uuid NOT NULL UNIQUE, status text NOT NULL, http_status integer, response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(principal_id,idempotency_key),
 CHECK(status IN ('pending','queued','running','done','failed')),
 CHECK(http_status IS NULL OR http_status BETWEEN 100 AND 599),
 CHECK(request_hash ~ '^[0-9a-f]{64}$')
);
CREATE TABLE issus.projection_applied (
 projection_name text NOT NULL, source_event_id uuid NOT NULL,
 applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(projection_name,source_event_id)
);
CREATE TABLE issus.schedule (
 kind text NOT NULL, entity_id text NOT NULL, generation integer NOT NULL,
 run_at timestamptz NOT NULL, attempt integer NOT NULL DEFAULT 0, state text NOT NULL DEFAULT 'pending',
 PRIMARY KEY(kind,entity_id,generation), CHECK(generation>=0), CHECK(attempt>=0),
 CHECK(state IN ('pending','running','done','cancelled'))
);
CREATE INDEX schedule_due ON issus.schedule(run_at,kind,entity_id) WHERE state='pending';
