// api/orders.js
import Stripe from "stripe";
import { sql } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

/**
 * CORS
 */
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

  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/**
 * Stripe (lazy init)
 */
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });
}

function dollarsFromCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n) / 100;
}

function normalizeStripeItems(lineItems) {
  // Filter out “non-product” line items that you inject (optional)
  const ignoreNames = new Set(["shipping", "tax", "tip (support our farmers)", "tip"]);

  return (lineItems || [])
    .map((li) => {
      const nameRaw = String(li?.description || li?.price?.product?.name || li?.price?.nickname || "Item");
      const name = nameRaw.trim();
      const nameLower = name.toLowerCase();

      const quantity = Math.max(1, Number(li?.quantity || 1));

      // Try to get product image
      const product = li?.price?.product;
      const image =
        product && Array.isArray(product.images) && product.images.length > 0
          ? String(product.images[0])
          : undefined;

      // Unit price: prefer unit_amount; otherwise infer from amount_total/qty
      let unitAmountCents = li?.price?.unit_amount;
      if (!Number.isFinite(Number(unitAmountCents)) && Number.isFinite(Number(li?.amount_total))) {
        unitAmountCents = Math.round(Number(li.amount_total) / quantity);
      }
      const price = dollarsFromCents(unitAmountCents);

      return { name, nameLower, quantity, image, price };
    })
    .filter((x) => x.name && !ignoreNames.has(x.nameLower))
    .map(({ name, quantity, image, price }) => ({
      name,
      quantity,
      ...(image ? { image } : {}),
      ...(typeof price === "number" ? { price } : {}),
    }));
}

/**
 * Fetch + persist Stripe line items for an order if items are missing
 * - Reads from Stripe
 * - Writes back to orders.items (cache)
 */
async function enrichOrderFromStripeIfMissing(orderRow, stripe) {
  const hasItems =
    Array.isArray(orderRow?.items) ? orderRow.items.length > 0 : !!orderRow?.items;

  if (hasItems) return orderRow;
  if (!stripe) return orderRow;

  const sessionId = String(orderRow.session_id || "").trim();
  if (!sessionId) return orderRow;

  try {
    // 1) Pull line items (expand product for images)
    const lineItemsRes = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      expand: ["data.price.product"],
    });

    const normalizedItems = normalizeStripeItems(lineItemsRes?.data || []);

    // If nothing useful, don’t overwrite with empty
    if (!normalizedItems.length) return orderRow;

    // 2) Cache into DB
    await sql`
      update orders
      set items = ${JSON.stringify(normalizedItems)}
      where session_id = ${sessionId}
    `;

    // 3) Return enriched row (so the caller sends items immediately)
    return { ...orderRow, items: normalizedItems };
  } catch (err) {
    // Fail “softly” — do not break the orders API if Stripe is unavailable.
    console.error("orders enrich error:", err?.message || err);
    return orderRow;
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  // Preflight
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Auth (GET only)
  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId, email } = ident;
  const sessionId = req.query?.session_id ? String(req.query.session_id).trim() : null;

  const stripe = getStripe();

  try {
    // Single order by session_id
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

      if (!rows?.length) return res.status(200).json({ orders: [] });

      const enriched = await enrichOrderFromStripeIfMissing(rows[0], stripe);
      return res.status(200).json({ orders: [enriched] });
    }

    // List orders
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

    // Enrich only a small number per request to keep response fast
    // (Older orders missing items will be “filled in” across a few page loads.)
    const MAX_ENRICH = 10;
    let enrichedCount = 0;

    const out = [];
    for (const row of rows) {
      const needsItems =
        !row?.items || (Array.isArray(row.items) && row.items.length === 0);

      if (needsItems && stripe && enrichedCount < MAX_ENRICH) {
        out.push(await enrichOrderFromStripeIfMissing(row, stripe));
        enrichedCount += 1;
      } else {
        out.push(row);
      }
    }

    return res.status(200).json({ orders: out });
  } catch (err) {
    console.error("orders error:", err);
    return res.status(500).json({ error: "Failed to fetch orders" });
  }
}

