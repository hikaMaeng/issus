// baseline migration SQL은 tsc가 복사하지 않는다. 바이트 그대로 dist에 둔다(P3 요청, P4 migration 실행기가 읽는다).
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("dist/server/backend/schema", { recursive: true });
cpSync("src/server/backend/schema", "dist/server/backend/schema", { recursive: true, filter: (p) => !p.endsWith(".ts") });
