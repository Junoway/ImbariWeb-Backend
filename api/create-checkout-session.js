// api/create-checkout-session.js
import Stripe from "stripe";
import { sql } from "../lib/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const allowedOrigins = (process.env.ALLOWED_ORIGIN || "https://www.imbaricoffee.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
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

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toCents = (n) => Math.max(0, Math.round(Number(n) * 100));

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY on server" });
    }
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: "Missing DATABASE_URL on server" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      items = [],
      location,
      shipping = 0,
      tax = 0,
      discountCode,
      discountAmount = 0,
      tipAmount = 0,
      subtotal = 0,
      total,
      email, // optional: pass from frontend if available
    } = body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";

    // Validate discount server-side
    const normalizedCode = (discountCode || "").trim().toUpperCase();
    const discountAllowed = normalizedCode === "UBUNTU88";

    const subtotalNum = round2(Number(subtotal) || 0);
    const discountNum = discountAllowed ? round2(Number(discountAmount) || 0) : 0;
    const clampedDiscount = Math.min(discountNum, subtotalNum);
    const discountRatio = subtotalNum > 0 ? clampedDiscount / subtotalNum : 0;

    const shippingNum = round2(Number(shipping) || 0);
    const taxNum = round2(Number(tax) || 0);
    const tipNum = round2(Number(tipAmount) || 0);

    const line_items = items.map((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const unitPrice = round2(Number(item.price || 0));
      const discountedUnitPrice = round2(unitPrice * (1 - discountRatio));

      const imageUrl = normalizeImageUrl(item.image);
      const product_data = {
        name: String(item.name || "Item"),
        ...(imageUrl ? { images: [imageUrl] } : {}),
      };

      return {
        price_data: {
          currency: "usd",
          product_data,
          unit_amount: toCents(discountedUnitPrice),
        },
        quantity: qty,
      };
    });

    if (tipNum > 0) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Tip (Support our Farmers)" },
          unit_amount: toCents(tipNum),
        },
        quantity: 1,
      });
    }

    if (shippingNum > 0) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Shipping" },
          unit_amount: toCents(shippingNum),
        },
        quantity: 1,
      });
    }

    if (taxNum > 0) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Tax" },
          unit_amount: toCents(taxNum),
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout/canceled`,
      customer_email: email || undefined,
      metadata: {
        location: location || "",
        discountCode: discountAllowed ? normalizedCode : "",
        subtotal: String(subtotalNum),
        discountAmount: String(clampedDiscount),
        shipping: String(shippingNum),
        tax: String(taxNum),
        tipAmount: String(tipNum),
        total: total != null ? String(total) : "",
      },
    });

    // Professional best practice: minimal pending order insert
    await sql`
      insert into orders (session_id, status, total, currency, email, created_at)
      values (${session.id}, 'pending', ${Number(total) || 0}, 'usd', ${email || null}, now())
      on conflict (session_id) do nothing
    `;

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
