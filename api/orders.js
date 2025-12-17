// api/orders.js
import { sql } from "../lib/db.js";

const allowedOrigins = (process.env.ALLOWED_ORIGIN || "https://www.imbaricoffee.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0] || "https://www.imbaricoffee.com");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const isAdmin = req.query?.admin === "true";
  const email = req.query?.email ? String(req.query.email).trim().toLowerCase() : null;
  const sessionId = req.query?.session_id ? String(req.query.session_id).trim() : null;

  // NOTE: For real production, protect admin with auth (JWT) or an API key header.
  try {
    if (sessionId) {
      const rows = await sql`
        select
          session_id, status, total, currency, email,
          created_at, paid_at, error,
          items, location, shipping, tax, discount_code, discount_amount, tip_amount
        from orders
        where session_id = ${sessionId}
        limit 1
      `;
      return res.status(200).json({ orders: rows });
    }

    if (isAdmin) {
      const rows = await sql`
        select
          session_id, status, total, currency, email,
          created_at, paid_at, error,
          items, location, shipping, tax, discount_code, discount_amount, tip_amount
        from orders
        order by created_at desc
        limit 200
      `;
      return res.status(200).json({ orders: rows });
    }

    if (email) {
      const rows = await sql`
        select
          session_id, status, total, currency, email,
          created_at, paid_at, error,
          items, location, shipping, tax, discount_code, discount_amount, tip_amount
        from orders
        where lower(email) = ${email}
        order by created_at desc
        limit 200
      `;
      return res.status(200).json({ orders: rows });
    }

    return res.status(200).json({ orders: [] });
  } catch (err) {
    console.error("orders error:", err);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
}
