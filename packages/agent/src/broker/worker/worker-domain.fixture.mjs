import { startWorkerEntry } from "./entry.js";
import { DomainError } from "./errors/index.js";

startWorkerEntry(async () => { throw new DomainError("ISSUE_CLOSED", "issue closed"); });
