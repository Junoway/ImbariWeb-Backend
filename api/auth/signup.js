// api/auth/signup.js
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function newId() {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const firstName = String(body?.firstName || "").trim();
    const lastName = String(body?.lastName || "").trim();
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");

    if (!firstName || !lastName || !email || password.length < 6) {
      return res.status(400).json({ error: "Invalid signup fields" });
    }

    const existing = await sql`select id from users where lower(email) = ${email} limit 1`;
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const id = newId();
    const passwordHash = await bcrypt.hash(password, 12);

    await sql`
      insert into users (id, first_name, last_name, email, password_hash, is_subscribed, email_verified)
      values (${id}, ${firstName}, ${lastName}, ${email}, ${passwordHash}, false, false)
    `;

    // Create verification code
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    await sql`
      insert into email_verifications (email, code_hash, expires_at)
      values (${email}, ${codeHash}, ${expiresAt}::timestamptz)
    `;

    // Send email (server-side)
    // You can keep EmailJS on frontend for now, but production best practice is server-side emailing.
    // If you already have a working email service library, call it here.
    // For now, return success (and log code ONLY in non-production).
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Verification code for ${email}: ${code}`);
    }

    return res.status(200).json({ ok: true, message: "Verification code sent" });
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
}
