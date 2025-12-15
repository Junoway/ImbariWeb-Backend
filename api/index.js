// api/index.js
require("dotenv").config();
const express = require("express");
const Stripe = require("stripe");

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

app.use(express.json({ limit: "1mb" }));

// ---- CORS (safer for credentials) ----
const allowedOrigins = (process.env.ALLOWED_ORIGIN || "https://www.imbaricoffee.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    // If you need multi-origin + credentials, do NOT use "*"
    // Leave unset when origin is not allowed.
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// small helpers
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toCents = (n) => Math.max(0, Math.round(Number(n) * 100));

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    // Defensive body handling (prevents req.body undefined issues)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

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
      return res.status(400).json({ error: "No items provided" });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY on server" });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";

    // ---- Server-side discount validation (do not trust client) ----
    const normalizedCode = (discountCode || "").trim().toUpperCase();
    const discountAllowed = normalizedCode === "UBUNTU88";

    // Compute discount ratio for proportional price reduction
    const subtotalNum = round2(Number(subtotal) || 0);
    const discountNum = discountAllowed ? round2(Number(discountAmount) || 0) : 0;

    // Guard discount (cannot exceed subtotal)
    const clampedDiscount = Math.min(discountNum, subtotalNum);
    const discountRatio = subtotalNum > 0 ? clampedDiscount / subtotalNum : 0;

    // ---- Build Stripe line_items ----
    const line_items = items.map((item) => {
      const name = String(item.name || "Item");
      const qty = Math.max(1, Number(item.quantity || 1));

      // Apply discount proportionally by reducing unit price
      const unitPrice = round2(Number(item.price || 0));
      const discountedUnitPrice = round2(unitPrice * (1 - discountRatio));

      const product_data = {
        name,
        ...(item.image ? { images: [item.image] } : {}),
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

    // Add extras as positive line items (Stripe-safe)
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

    return res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    return res.status(500).json({ error: error?.message || "Server error" });
  }
});

// NOTE ABOUT VERCEL:
// If this is deployed as a Vercel Serverless Function, DO NOT app.listen().
// If it's a traditional server (EC2/Render/etc.), app.listen is fine.
const PORT = process.env.PORT || 3001;
if (process.env.VERCEL !== "1") {
  app.listen(PORT, () => console.log(`✅ Imbari Coffee API running on port ${PORT}`));
}

module.exports = app;
