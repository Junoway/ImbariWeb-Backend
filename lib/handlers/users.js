import { sql } from "../db.js";
import { requireUser } from "../auth.js";
import { applyCors } from "../cors.js";

// GET /api/user/me
export async function me(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  try {
    const rows = await sql`
      select id, first_name, last_name, email, is_subscribed, email_verified, created_at
      from users
      where id = ${String(userId)}
      limit 1
    `;
    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const u = rows[0];
    return res.status(200).json({
      user: {
        id: u.id,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        isSubscribed: u.is_subscribed,
        emailVerified: u.email_verified,
        createdAt: u.created_at,
      },
    });
  } catch (err) {
    console.error("user me error:", err);
    return res.status(500).json({ error: "Failed to fetch user profile" });
  }
}

// GET /api/user/subscription (example stub — wire to your DB/Stripe logic)
export async function subscription(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  try {
    // If you track subscription in users table, return it from there.
    // Or join to a subscriptions table if you have one.
    return res.status(200).json({ ok: true, status: "not_implemented" });
  } catch (err) {
    console.error("user subscription error:", err);
    return res.status(500).json({ error: "Failed to fetch subscription" });
  }
}

