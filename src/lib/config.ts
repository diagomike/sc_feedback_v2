import "server-only";
import { headers } from "next/headers";

// Re-exported from constants.ts so existing imports keep working. The values live there
// because this module cannot be loaded outside Next (server-only + next/headers), and the
// seed script needs them.
export { DEFAULT_WEB_ORIGIN, DEFAULT_SMTP_PORT } from "./constants";
import { DEFAULT_WEB_ORIGIN } from "./constants";

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
