import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail({ to, code }) {
  return resend.emails.send({
    from: process.env.EMAIL_FROM,
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
