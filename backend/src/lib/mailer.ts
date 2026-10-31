import nodemailer from 'nodemailer';
import { config } from '../config.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

// Last messages kept in memory so tests (and local debugging) can inspect what was "sent".
export const outbox: MailMessage[] = [];

const transport = config.smtp.host
  ? nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: false })
  : null;

export async function sendMail(message: MailMessage): Promise<void> {
  outbox.push(message);
  if (outbox.length > 50) outbox.shift();

  if (transport) {
    try {
      await transport.sendMail({ from: config.smtp.from, ...message });
      return;
    } catch (error) {
      console.error('[mail] SMTP delivery failed, falling back to console:', (error as Error).message);
    }
  }
  if (!config.isTest) {
    console.log(`\n[mail] To: ${message.to}\n[mail] Subject: ${message.subject}\n${message.text}\n`);
  }
}
