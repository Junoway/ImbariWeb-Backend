// api/orders.js
import { sql } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId, email } = ident;
  const sessionId = req.query?.session_id ? String(req.query.session_id).trim() : null;

  try {
    if (sessionId) {
      const rows = await sql`
        select
          session_id, status, total, currency, email, user_id, customer_name,
          created_at, paid_at, error,
          items, location, shipping, tax, discount_code, discount_amount, tip_amount
        from orders
        where session_id = ${sessionId}
          and (user_id = ${userId} or lower(email) = ${email})
        limit 1
      `;
      return res.status(200).json({ orders: rows });
    }

    const rows = await sql`
      select
        session_id, status, total, currency, email, user_id, customer_name,
        created_at, paid_at, error,
        items, location, shipping, tax, discount_code, discount_amount, tip_amount
      from orders
      where user_id = ${userId}
         or (user_id is null and lower(email) = ${email})
      order by created_at desc
      limit 200
    `;

    return res.status(200).json({ orders: rows });
  } catch (err) {
    console.error("orders error:", err);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
}
