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

// GET/POST /api/user/subscription
// - GET returns current subscription status
// - POST updates users.is_subscribed based on body { isSubscribed: boolean }
export async function subscription(req, res) {
  if (applyCors(req, res)) return;

  const method = (req.method || "GET").toUpperCase();

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  try {
    // GET: return subscription status from users table
    if (method === "GET") {
      const rows = await sql`
        select is_subscribed
        from users
        where id = ${String(userId)}
        limit 1
      `;
      if (!rows.length) return res.status(404).json({ error: "User not found" });

      return res.status(200).json({ ok: true, isSubscribed: !!rows[0].is_subscribed });
    }

    // POST: update subscription status in users table
    if (method === "POST") {
      // Parse JSON safely (Vercel may provide req.body as object or string)
      let body = req.body || {};
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }

      // Accept either isSubscribed or is_subscribed
      const nextSubscribed = !!(body?.isSubscribed ?? body?.is_subscribed);

      const updated = await sql`
        update users
        set is_subscribed = ${nextSubscribed}, updated_at = now()
        where id = ${String(userId)}
        returning id, is_subscribed
      `;
      if (!updated.length) return res.status(404).json({ error: "User not found" });

      return res.status(200).json({ ok: true, isSubscribed: !!updated[0].is_subscribed });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("user subscription error:", err);
    return res.status(500).json({ error: "Failed to fetch subscription" });
  }
}
