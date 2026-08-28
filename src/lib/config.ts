import "server-only";
import { headers } from "next/headers";

// Local-dev fallback values, used only when neither an incoming request nor the
// corresponding env var (WEB_ORIGIN / SMTP_PORT) supplies one. Keep in sync with
// package.json's dev script port and .claude/launch.json.
export const DEFAULT_WEB_ORIGIN = "http://localhost:4300";
export const DEFAULT_SMTP_PORT = 4025;

/**
 * The origin to build absolute links against (invite/registration emails, campaign
 * invite links, the instant-campaign public guest link). Derives it from the
 * incoming request's Host header first, so it's correct automatically on every
 * domain the app is actually reached through — the production alias, a Vercel
 * preview URL, a later custom domain — with no env var to keep in sync. Falls back
 * to WEB_ORIGIN (for the rare call site with no request in scope) and then to the
 * local-dev default.
 */
export async function getWebOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws when called outside a request scope — fall through to the env var.
  }
  return process.env.WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN;
}
