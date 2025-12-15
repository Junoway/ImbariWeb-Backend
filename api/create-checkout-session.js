import Stripe from "stripe";
import { logOrder } from "../lib/ordersStore.js";

// Helper to normalize image URLs for Stripe
function normalizeImageUrl(image) {
  if (!image || typeof image !== "string") return null;
  if (image.startsWith("https://") || image.startsWith("http://")) return image;

  if (image.startsWith("/")) {
    const base = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";
    return `${base}${image}`;
  }
  return null;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const allowedOrigins = (process.env.ALLOWED_ORIGIN || "https://www.imbaricoffee.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toCents = (n) => Math.max(0, Math.round(Number(n) * 100));

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

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY on server" });
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
    } = body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";

    // validate discount server-side
    const normalizedCode = (discountCode || "").trim().toUpperCase();
    const discountAllowed = normalizedCode === "UBUNTU88";

    const subtotalNum = round2(Number(subtotal) || 0);
    const discountNum = discountAllowed ? round2(Number(discountAmount) || 0) : 0;
    const clampedDiscount = Math.min(discountNum, subtotalNum);
    const discountRatio = subtotalNum > 0 ? clampedDiscount / subtotalNum : 0;

    // Log the order attempt (status: pending)
    logOrder({
      user: req.user ? req.user.id : null,
      items,
      location,
      shipping,
      tax,
      discountCode,
      discountAmount,
      tipAmount,
      subtotal,
      total,
      status: "pending",
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
    });

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

    const tipNum = round2(Number(tipAmount) || 0);
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

    const shippingNum = round2(Number(shipping) || 0);
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

    const taxNum = round2(Number(tax) || 0);
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

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout/canceled`,
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

    // Log success
    logOrder({
      user: req.user ? req.user.id : null,
      items,
      location,
      shipping,
      tax,
      discountCode,
      discountAmount,
      tipAmount,
      subtotal,
      total,
      status: "success",
      sessionId: session.id,
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    // Log failure
    try {
      logOrder({
        user: req.user ? req.user.id : null,
        items: req.body?.items,
        location: req.body?.location,
        shipping: req.body?.shipping,
        tax: req.body?.tax,
        discountCode: req.body?.discountCode,
        discountAmount: req.body?.discountAmount,
        tipAmount: req.body?.tipAmount,
        subtotal: req.body?.subtotal,
        total: req.body?.total,
        status: "failed",
        error: err?.message,
        ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress,
      });
    } catch (_) {}

    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
