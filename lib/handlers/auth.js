import bcrypt from "bcryptjs";
import { sql } from "../db.js";
import { signJwt } from "../../auth.js";
import { applyCors } from "../../cors.js";
import { sendVerificationEmail } from "../../mailer.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function newId() {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function login(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }
    const rows = await sql`
      select id, first_name, last_name, email, password_hash, is_subscribed, email_verified
      from users
      where lower(email) = ${email}
      limit 1
    `;
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!u.email_verified) {
      return res.status(403).json({ error: "Email not verified" });
    }
    const token = signJwt({ sub: u.id, email: u.email });
    return res.status(200).json({
      token,
      user: {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        isSubscribed: u.is_subscribed,
      },
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
}

export async function signup(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
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
    // Create verification code record
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
    await sql`
      insert into email_verifications (email, code_hash, expires_at)
      values (${email}, ${codeHash}, ${expiresAt}::timestamptz)
    `;
    await sendVerificationEmail({ to: email, code });
    return res.status(200).json({ ok: true, message: "Verification code sent" });
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
}

export async function verifyEmail(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || "").trim();
    if (!email || code.length !== 6) {
      return res.status(400).json({ error: "Invalid email or code" });
    }
    const rows = await sql`
      select id, code_hash, expires_at, used_at
      from email_verifications
      where lower(email) = ${email}
      order by created_at desc
      limit 5
    `;
    const now = Date.now();
    const candidate = rows.find((r) => !r.used_at && new Date(r.expires_at).getTime() > now);
    if (!candidate) {
      return res.status(400).json({ error: "Code expired or not found" });
    }
    const ok = await bcrypt.compare(code, candidate.code_hash);
    if (!ok) {
      return res.status(400).json({ error: "Invalid code" });
    }
    await sql`update email_verifications set used_at = now() where id = ${candidate.id}`;
    await sql`update users set email_verified = true where lower(email) = ${email}`;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("verify email error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
}

export async function resendCode(req, res) {
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

