import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { DEFAULT_SMTP_PORT } from "@/lib/config";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Thin wrapper around Nodemailer/SMTP, ported from v1's MailService. A maildev-shaped
 * unauthenticated sink and a real provider (Gmail, Office365, …) go through the exact
 * same code path — auth is only attached once SMTP_USER is actually set.
 */
let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? DEFAULT_SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}),
  });
  return transporter;
}

const FROM = process.env.MAIL_FROM ?? "Feedback System <no-reply@university.local>";

/** Never throws — a mail failure must not break the calling request (e.g. CSV import
 *  of 200 people shouldn't fail because SMTP hiccuped on row 47). Logs and moves on. */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    await getTransporter().sendMail({ from: FROM, ...message });
  } catch (err) {
    console.error(`Failed to send mail to ${message.to}:`, (err as Error).message);
  }
}
