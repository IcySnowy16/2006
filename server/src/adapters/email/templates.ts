/** Task A1: the text of the e-mails the system sends. Plain text only. */
export function verificationEmail(code: string, expiresInMin: number): { subject: string; body: string } {
  return {
    subject: 'Your Campus Hop verification code',
    body:
      `Your Campus Hop code is ${code}; it expires in ${expiresInMin} minutes.\n\n` +
      'Enter it in the app to finish creating your account. If you did not ask for this, you can ignore this e-mail.',
  };
}
