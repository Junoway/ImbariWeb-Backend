// api/auth/login.js
import bcrypt from "bcryptjs";
import { sql } from "../../lib/db.js";
import { signJwt } from "../../lib/auth.js";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");

    if (!email || !password) return res.status(400).json({ error: "Missing credentials" });

    const rows = await sql`
      select id, first_name, last_name, email, password_hash, is_subscribed, email_verified
      from users
      where lower(email) = ${email}
      limit 1
    `;
    if (rows.length === 0) return res.status(401).json({ error: "Invalid email or password" });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    if (!u.email_verified) return res.status(403).json({ error: "Email not verified" });

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
