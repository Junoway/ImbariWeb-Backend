// api/subscriptions.js
import { sql } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

  // Auth (never on OPTIONS)
  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  try {
    if (req.method === "GET") {
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
      return res.status(200).json({ items: rows });
    }

    if (req.method === "POST") {
      const body = parseBody(req);

      const productId = Number(body?.productId);
      const quantity = clampQty(body?.quantity);

      const name = String(body?.name || "").trim();
      const size = body?.size != null ? String(body.size).trim() : null;

      const price = Number(body?.price);
      const image = body?.image != null ? String(body.image).trim() : null;

      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ error: "Invalid productId" });
      }

      // For subscription UX, you typically want a stable snapshot of name/price/image.
      // If you prefer authoritative product catalog later, we can switch to join by productId instead.
      if (!name) return res.status(400).json({ error: "Missing item name" });
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Invalid price" });

      await sql`
        insert into subscription_items (
          user_id, product_id, name, size, price, image, quantity, created_at, updated_at
        )
        values (
          ${userId}, ${productId}, ${name}, ${size}, ${price}, ${image}, ${quantity}, now(), now()
        )
        on conflict (user_id, product_id) do update set
          name = excluded.name,
          size = excluded.size,
          price = excluded.price,
          image = excluded.image,
          quantity = subscription_items.quantity + excluded.quantity,
          updated_at = now()
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
    console.error("subscriptions error:", err);
    // Most common early failure will be missing table -> "relation subscription_items does not exist"
    return res.status(500).json({ error: err?.message || "Subscriptions API failed" });
  }
}
