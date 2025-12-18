// api/auth/resend-code.js
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";
import { sendVerificationEmail } from "../../lib/mailer.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const email = normalizeEmail(body?.email);

    if (!email) return res.status(400).json({ error: "Missing email" });

    // Check user exists
    const users = await sql`
      select id, email_verified
      from users
      where lower(email) = ${email}
      limit 1
    `;

    if (users.length === 0) {
      return res.status(404).json({ error: "No account found for this email" });
    }

    if (users[0].email_verified) {
      return res.status(200).json({ ok: true, message: "Email already verified" });
    }

    // Create new verification code
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await sql`
      insert into email_verifications (email, code_hash, expires_at)
      values (${email}, ${codeHash}, ${expiresAt}::timestamptz)
    `;

    await sendVerificationEmail({ to: email, code });

    return res.status(200).json({ ok: true, message: "Verification code resent" });
  } catch (err) {
    console.error("resend code error:", err);
    return res.status(500).json({ error: "Failed to resend code" });
  }
}
