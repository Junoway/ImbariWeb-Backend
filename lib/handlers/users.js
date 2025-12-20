import { sql } from "../db.js";
import { requireUser } from "../auth.js";
import { applyCors } from "../cors.js";

/**
 * Robust JSON body parser for Vercel Node functions.
 * - Works when req.body is an object (some runtimes)
 * - Works when req.body is a string
 * - Works when req.body is undefined by reading the raw stream
 */
async function readJsonBody(req) {
  // If body already exists (framework/runtime provided it)
  if (req && req.body != null) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (typeof req.body === "object") return req.body;
    return {};
  }

  // Otherwise read from the stream
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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

/**
 * /api/user/subscription
 * - GET  -> returns current subscription flag from users table
 * - POST -> updates users.is_subscribed based on { isSubscribed: boolean }
 */
export async function subscription(req, res) {
  if (applyCors(req, res)) return;

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  try {
    if (req.method === "GET") {
      const rows = await sql`
        select is_subscribed
        from users
        where id = ${String(userId)}
        limit 1
      `;
      if (!rows.length) return res.status(404).json({ error: "User not found" });

      return res.status(200).json({ ok: true, isSubscribed: !!rows[0].is_subscribed });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);

      // Accept either camelCase or snake_case
      const nextSubscribedRaw =
        body?.isSubscribed != null ? body.isSubscribed :
        body?.is_subscribed != null ? body.is_subscribed :
        null;

      if (nextSubscribedRaw == null) {
        return res.status(400).json({ error: "Missing isSubscribed" });
      }

      const nextSubscribed = !!nextSubscribedRaw;

      const updated = await sql`
        update users
        set is_subscribed = ${nextSubscribed}
        where id = ${String(userId)}
        returning is_subscribed
      `;

      if (!updated.length) return res.status(404).json({ error: "User not found" });

      return res.status(200).json({ ok: true, isSubscribed: !!updated[0].is_subscribed });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    // Log full error so you can see it in Vercel logs
    console.error("user subscription error:", err);
    return res.status(500).json({ error: "Failed to fetch subscription" });
  }
}
