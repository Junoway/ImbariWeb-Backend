// api/user/me.js
import { sql } from "../../lib/db.js";
import { requireUser } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  try {
    const rows = await sql`
      select id, first_name, last_name, email, is_subscribed
      from users
      where id = ${userId}
      limit 1
    `;

    if (!rows || rows.length === 0) return res.status(404).json({ error: "User not found" });

    const u = rows[0];

    return res.status(200).json({
      user: {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        isSubscribed: !!u.is_subscribed,
      },
    });
  } catch (err) {
    console.error("me error:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
}


cd C:\Users\User\Documents\imbari-coffee-backend
New-Item -ItemType Directory -Force -Path .\api\user | Out-Null
