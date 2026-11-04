/**
 * Task A1: sends e-mail through SMTP with nodemailer. In development the settings point at Mailpit (docker-compose.yml:
 * localhost:1025, inbox at http://localhost:8025); in production at a real provider. Changing provider means changing
 * environment variables, nothing else.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { AppError } from '../../errors/AppError';
import type { Logger } from '../../logging/types';
import type { EmailAdapter, EmailMessage } from '../EmailAdapter';

export interface SmtpSettings {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** Give up after this long, so a dead mail server cannot hang a request. */
  timeoutMs?: number;
}

export type EmailLogger = Pick<Logger, 'warn'>;

export class SmtpEmailAdapter implements EmailAdapter {
  private readonly transporter: Transporter;

  constructor(
    private readonly settings: SmtpSettings,
    private readonly logger?: EmailLogger,
    transporter?: Transporter,
  ) {
    const timeout = settings.timeoutMs ?? 5000;
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.port === 465,
        auth: settings.user ? { user: settings.user, pass: settings.pass ?? '' } : undefined,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
      });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.settings.from, to: message.to, subject: message.subject, text: message.body });
    } catch (cause) {
      // Log who and why, never the body: it holds the verification code.
      this.logger?.warn({ to: message.to, reason: cause instanceof Error ? cause.message : String(cause) }, 'e-mail not sent');
      throw new AppError('EXTERNAL_SERVICE_UNAVAILABLE', { cause });
    }
  }
}
