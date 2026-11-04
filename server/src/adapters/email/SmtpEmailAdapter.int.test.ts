/** A1: send a real message through SMTP to Mailpit (docker-compose.yml) and read it back from Mailpit's HTTP API. */
import { describe, expect, it } from 'vitest';
import { SmtpEmailAdapter } from './SmtpEmailAdapter';
import { verificationEmail } from './templates';

const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025';

describe('A1: SmtpEmailAdapter against Mailpit', () => {
  it('delivers the verification code to the right recipient', async () => {
    const to = `adapter-test-${Date.now()}@e.ntu.edu.sg`;
    const smtp = new SmtpEmailAdapter({ host: 'localhost', port: 1025, from: 'Campus Hop <no-reply@campushop.local>' });
    await smtp.send({ to, ...verificationEmail('482913', 10) });
    const list = (await (await fetch(`${MAILPIT_API}/api/v1/search?query=${encodeURIComponent('to:' + to)}`)).json()) as {
      messages: { ID: string; To: { Address: string }[]; Subject: string }[];
    };
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0]?.To[0]?.Address).toBe(to);
    const full = (await (await fetch(`${MAILPIT_API}/api/v1/message/${list.messages[0]!.ID}`)).json()) as { Text: string };
    expect(full.Text).toContain('482913');
  });
});
