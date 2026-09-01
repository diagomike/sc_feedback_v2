/**
 * Local-dev fallbacks, used only when neither an incoming request nor the corresponding
 * env var (WEB_ORIGIN / SMTP_PORT) supplies one. Keep in sync with package.json's dev
 * script port and .claude/launch.json.
 *
 * Kept OUT of config.ts, which imports `server-only` and `next/headers`: those resolve
 * only inside Next's bundler, so anything importing them cannot run under `tsx` — and the
 * seed script and the real-data loader both need these two values.
 */
export const DEFAULT_WEB_ORIGIN = "http://localhost:4300";
export const DEFAULT_SMTP_PORT = 4025;
