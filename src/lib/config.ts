// Single source of truth for local-dev fallback values, used only when the
// corresponding env var (WEB_ORIGIN / SMTP_PORT) is unset. Keep in sync with
// package.json's dev script port and .claude/launch.json.
export const DEFAULT_WEB_ORIGIN = "http://localhost:4300";
export const DEFAULT_SMTP_PORT = 4025;
