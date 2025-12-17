// api/admin/orders.js
import { sql } from "../../lib/db.js";

function requireAdmin(req, res) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;

  try {
    const rows = await sql`
      select
        session_id, status, total, currency, email, user_id, customer_name,
        created_at, paid_at, error,
        items, location, shipping, tax, discount_code, discount_amount, tip_amount
      from orders
      order by created_at desc
      limit 500
    `;
    return res.status(200).json({ orders: rows });
  } catch (err) {
    console.error("admin orders error:", err);
    return res.status(500).json({ error: "Failed to fetch admin orders" });
  }
}
