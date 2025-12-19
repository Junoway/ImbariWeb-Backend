import { Resend } from "resend";

let resendClient = null;

function getResendClient() {
  if (resendClient) return resendClient;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Don't crash on import; only fail when an email send is attempted
    throw new Error("RESEND_API_KEY is not set");
  }

  resendClient = new Resend(key);
  return resendClient;
}

export async function sendVerificationEmail({ to, code }) {
  const resend = getResendClient();

  return resend.emails.send({
    from: process.env.EMAIL_FROM || "Imbari Coffee <no-reply@imbaricoffee.com>",
    to,
    subject: "Your Imbari Coffee verification code",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2>Verify your email</h2>
        <p>Your verification code is:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:4px;margin:16px 0">
          ${code}
        </div>
        <p>This code expires in 15 minutes.</p>
        <p>If you didn’t create an account, ignore this email.</p>
      </div>
    `,
  });
}
