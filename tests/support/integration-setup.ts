import { join } from "node:path";
import { tmpdir } from "node:os";
import { requireTestDatabaseUrl } from "./test-db";

process.env.DATABASE_URL = requireTestDatabaseUrl();
process.env.E2E_TEST_MODE = "1";
process.env.E2E_MAIL_OUTBOX ??= join(tmpdir(), "astu-feedback-integration-mail.ndjson");
process.env.WEB_ORIGIN ??= "http://127.0.0.1:4300";
