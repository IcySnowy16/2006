/** Task K5: sending e-mail (the verification code, UC-1). The real adapter is SmtpEmailAdapter (task A1). */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailAdapter {
  /** Any failure surfaces as EXTERNAL_SERVICE_UNAVAILABLE (UC-1: the user is told to retry). */
  send(message: EmailMessage): Promise<void>;
}
