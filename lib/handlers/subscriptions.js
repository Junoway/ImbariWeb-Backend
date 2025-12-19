import { sql } from "../db.js";
import { requireUser } from "../../auth.js";

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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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

function normalizeImageUrl(image) {
  if (!image || typeof image !== "string") return null;
  if (image.startsWith("https://") || image.startsWith("http://")) return image;
  if (image.startsWith("/")) {
    const base = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";
    return `${base}${image}`;
  }
  return null;
}

async function ensureSchema() {
  if (String(process.env.ALLOW_SCHEMA_AUTO_CREATE || "").toLowerCase() !== "true") return;
  await sql`
    create table if not exists subscription_items (
      id bigserial primary key,
      user_id text not null,
      product_id text not null,
      name text not null,
      image text null,
      unit_price numeric null,
      quantity int not null default 1,
      cadence text not null default 'monthly',
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create unique index if not exists subscription_items_user_product_uq
    on subscription_items (user_id, product_id)
  `;
}

export async function index(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const ident = requireUser(req, res);
  if (!ident) return;
  const { userId } = ident;
  try {
    await ensureSchema();
    if (req.method === "GET") {
      const rows = await sql`
        select
          product_id, name, image, unit_price, quantity, cadence, active,
          created_at, updated_at
        from subscription_items
        where user_id = ${userId}
        order by active desc, updated_at desc
        limit 200
      `;
      return res.status(200).json({ items: rows });
    }
    if (req.method === "POST") {
      const body = parseBody(req);
      const productId = String(body?.productId || body?.product_id || "").trim();
      const name = String(body?.name || "").trim();
      const image = normalizeImageUrl(body?.image || null);
      const unitPrice =
        body?.unitPrice != null ? Number(body.unitPrice) :
        body?.unit_price != null ? Number(body.unit_price) :
        null;
      const quantityRaw = body?.quantity != null ? Number(body.quantity) : 1;
      const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;
      const cadenceRaw = String(body?.cadence || "monthly").trim().toLowerCase();
      const cadence = cadenceRaw === "monthly" ? "monthly" : "monthly";
      if (!productId || !name) {
        return res.status(400).json({ error: "Missing productId or name" });
      }
      await sql`
        insert into subscription_items (
          user_id, product_id, name, image, unit_price, quantity, cadence, active, updated_at
        )
        values (
          ${String(userId)}, ${productId}, ${name}, ${image}, ${unitPrice}, ${quantity}, ${cadence}, true, now()
        )
        on conflict (user_id, product_id)
        do update set
          name = excluded.name,
          image = coalesce(excluded.image, subscription_items.image),
          unit_price = coalesce(excluded.unit_price, subscription_items.unit_price),
          quantity = excluded.quantity,
          cadence = excluded.cadence,
          active = true,
          updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }
    if (req.method === "PATCH") {
      const body = parseBody(req);
      const productId = String(body?.productId || body?.product_id || "").trim();
      if (!productId) return res.status(400).json({ error: "Missing productId" });
      const quantityRaw = body?.quantity != null ? Number(body.quantity) : null;
      const quantity =
        quantityRaw == null ? null :
        Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : null;
      const active = body?.active == null ? null : !!body.active;
      const updated = await sql`
        update subscription_items
        set
          quantity = coalesce(${quantity}, quantity),
          active = coalesce(${active}, active),
          updated_at = now()
        where user_id = ${String(userId)}
          and product_id = ${productId}
        returning product_id
      `;
      if (!updated.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const productId = String(req.query?.productId || req.query?.product_id || "").trim();
      if (!productId) return res.status(400).json({ error: "Missing productId" });
      const del = await sql`
        delete from subscription_items
        where user_id = ${String(userId)}
          and product_id = ${productId}
        returning product_id
      `;
      if (!del.length) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("subscriptions error:", err);
    return res.status(500).json({ error: "Subscriptions API failed" });
  }
}

