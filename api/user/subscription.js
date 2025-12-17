// api/user/subscription.js
import { sql } from "../../lib/db.js";
import { requireUser } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const next = !!body?.isSubscribed;

    await sql`
      update users
      set is_subscribed = ${next}
      where id = ${userId}
    `;

    return res.status(200).json({ ok: true, isSubscribed: next });
  } catch (err) {
    console.error("subscription error:", err);
    return res.status(500).json({ error: "Failed to update subscription" });
  }
}
