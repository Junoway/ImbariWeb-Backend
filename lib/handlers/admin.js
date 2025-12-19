import { sql } from "../db.js";

function requireAdmin(req, res) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export async function getAnalytics(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await sql`
      select
        count(*) filter (where status = 'paid')::int as successful_sales,
        count(*) filter (where status = 'failed')::int as failed_attempts,
        count(*) filter (where status = 'expired')::int as expired_sessions,
        count(*) filter (where status = 'pending')::int as pending_sessions,
        coalesce(sum(total) filter (where status = 'paid'), 0)::numeric as revenue_total
      from orders
    `;
    return res.status(200).json(rows[0] || {
      successful_sales: 0,
      failed_attempts: 0,
      expired_sessions: 0,
      pending_sessions: 0,
      revenue_total: 0
    });
  } catch (err) {
    console.error("admin analytics error:", err);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
}

export async function getOrders(req, res) {
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

