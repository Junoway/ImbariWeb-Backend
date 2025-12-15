// Helper to normalize image URLs for Stripe
function normalizeImageUrl(image) {
  if (!image || typeof image !== "string") return null;

  // Already absolute
  if (image.startsWith("https://") || image.startsWith("http://")) {
    return image;
  }

  // Convert relative → absolute
  if (image.startsWith("/")) {
    const base = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";
    return `${base}${image}`;
  }

  // Anything else is invalid
  return null;
}
// Helper to check for valid http(s) URL
function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Helper to get absolute image URL or null
function toAbsoluteImageUrl(image) {
  if (!image) return null;

  // If the frontend sends a relative path like "/images/x.png", convert it
  if (typeof image === "string" && image.startsWith("/")) {
    const base = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";
    return `${base}${image}`;
  }

  // Otherwise only allow valid absolute http(s) urls
  if (typeof image === "string" && isValidHttpUrl(image)) return image;

  return null;
}
import Stripe from "stripe";

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

  if (req.method === "OPTIONS") return res.status(200).end();
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

    const line_items = items.map((item) => {
      const name = String(item.name || "Item");
      const qty = Math.max(1, Number(item.quantity || 1));
      const unitPrice = round2(Number(item.price || 0));
      const discountedUnitPrice = round2(unitPrice * (1 - discountRatio));


      // Helper to get absolute image URL or undefined
      function toAbsoluteImageUrl(image) {
        if (!image) return undefined;
        try {
          const url = new URL(image, process.env.FRONTEND_URL);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
          }
        } catch (e) {
          // Invalid URL, skip
        }
        return undefined;
      }

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

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
