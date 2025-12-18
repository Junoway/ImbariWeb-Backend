// api/subscriptions/[productId].js
import { sql } from "../../lib/db.js";
import { requireUser } from "../../lib/auth.js";

const ALLOWED_ORIGINS = new Set([
  "https://www.imbaricoffee.com",
  "https://imbaricoffee.com",
  "http://localhost:3000",
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

const clampQty = (n) => Math.max(1, Math.min(99, Number(n || 1)));

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  const productIdRaw = req.query?.productId;
  const productId = Number(productIdRaw);

  if (!Number.isFinite(productId) || productId <= 0) {
    return res.status(400).json({ error: "Invalid productId" });
  }

  try {
    if (req.method === "PATCH") {
      const body = parseBody(req);
      const quantity = clampQty(body?.quantity);

      await sql`
        update subscription_items
        set quantity = ${quantity}, updated_at = now()
        where user_id = ${userId} and product_id = ${productId}
      `;

      const rows = await sql`
        select
          product_id as "productId",
          name,
          size,
          price,
          image,
          quantity,
          created_at,
          updated_at
        from subscription_items
        where user_id = ${userId}
        order by updated_at desc nulls last, created_at desc
      `;

      return res.status(200).json({ ok: true, items: rows });
    }

    if (req.method === "DELETE") {
      await sql`
        delete from subscription_items
        where user_id = ${userId} and product_id = ${productId}
      `;

      const rows = await sql`
        select
          product_id as "productId",
          name,
          size,
          price,
          image,
          quantity,
          created_at,
          updated_at
        from subscription_items
        where user_id = ${userId}
        order by updated_at desc nulls last, created_at desc
      `;

      return res.status(200).json({ ok: true, items: rows });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("subscriptions product error:", err);
    return res.status(500).json({ error: err?.message || "Subscription item update failed" });
  }
}
