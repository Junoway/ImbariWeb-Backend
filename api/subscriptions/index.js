// api/subscriptions/index.js
import { sql } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

export default async function handler(req, res) {
  // CORS (reuse your pattern)
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;

  // ─────────────────────────────
  // GET – list subscriptions
  // ─────────────────────────────
  if (req.method === "GET") {
    const rows = await sql`
      select *
      from subscription_items
      where user_id = ${userId}
      order by created_at desc
    `;
    return res.status(200).json({ items: rows });
  }

  // ─────────────────────────────
  // POST – add subscription item
  // ─────────────────────────────
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      productId,
      name,
      price,
      image,
      quantity = 1,
      interval = "monthly",
    } = body || {};

    if (!productId || !name || !price) {
      return res.status(400).json({ error: "Missing subscription fields" });
    }

    await sql`
      insert into subscription_items (
        user_id, product_id, name, price, image, quantity, interval, created_at
      )
      values (
        ${userId},
        ${String(productId)},
        ${name},
        ${price},
        ${image || null},
        ${quantity},
        ${interval},
        now()
      )
      on conflict do nothing
    `;

    return res.status(201).json({ ok: true });
  }

  // ─────────────────────────────
  // DELETE – remove subscription item
  // ─────────────────────────────
  if (req.method === "DELETE") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing id" });

    await sql`
      delete from subscription_items
      where id = ${id} and user_id = ${userId}
    `;

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
