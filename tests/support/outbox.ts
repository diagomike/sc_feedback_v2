import { existsSync, readFileSync, rmSync } from "node:fs";
import type { CapturedMailMessage } from "../../src/server/mail/mail";

export function clearOutbox(path = process.env.E2E_MAIL_OUTBOX): void {
  if (path && existsSync(path)) rmSync(path);
}

export function readOutbox(path = process.env.E2E_MAIL_OUTBOX): CapturedMailMessage[] {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedMailMessage);
}

export function linksIn(message: CapturedMailMessage): string[] {
  return [...message.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

export function latestLinkFor(
  recipient: string,
  pathPrefix: "/register/" | "/respond/",
  messages = readOutbox(),
): string {
  const message = [...messages].reverse().find((candidate) => candidate.to.toLowerCase() === recipient.toLowerCase());
  const link = message?.html ? linksIn(message).find((candidate) => new URL(candidate).pathname.startsWith(pathPrefix)) : null;
  if (!link) throw new Error(`No ${pathPrefix} link captured for ${recipient}`);
  return link;
}

export function rawTokenFrom(link: string): string {
  return new URL(link).pathname.split("/").filter(Boolean).at(-1)!;
}
