// api/auth/verify-email.js
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db.js";
import { applyCors } from "../../lib/cors.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export default async function handler(req, res) {
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
