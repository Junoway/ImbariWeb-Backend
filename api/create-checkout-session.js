// api/create-checkout-session.js
import Stripe from "stripe";
import { sql } from "../lib/db.js";
import { getUserFromRequest, extractUserIdentity } from "../lib/auth.js";
import { applyCors } from "../lib/cors.js";
import { pesapalCreateOrder } from "../lib/pesapal.js";

/**
 * Stripe client
 * Keep apiVersion consistent with your Stripe SDK usage
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

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

  // Convert /images/... to absolute using FRONTEND_URL
  if (image.startsWith("/")) {
    const base = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";
    return `${base}${image}`;
  }
  return null;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toCents = (n) => Math.max(0, Math.round(Number(n) * 100));

export default async function handler(req, res) {
  // Standardized CORS + OPTIONS handling (preflight)
  // applyCors() returns true if it already ended the response (OPTIONS).
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // Hard requirements
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: "Missing DATABASE_URL" });
    }


    const body = parseBody(req);
    const paymentMethod = (body.paymentMethod || "stripe").toLowerCase();

    // Accept both shapes to remain backward-compatible:
    // - older: { cartItems, customerEmail }
    // - newer: { items, email, subtotal, total, ... }
    const legacyCartItems = Array.isArray(body.cartItems) ? body.cartItems : null;
    const legacyEmail = typeof body.customerEmail === "string" ? body.customerEmail : null;

    const items = Array.isArray(body.items)
      ? body.items
      : legacyCartItems
      ? legacyCartItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: typeof i.unitAmount === "number" ? i.unitAmount / 100 : i.price, // support unitAmount cents
          image: i.image,
        }))
      : [];

    const providedEmail =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : legacyEmail
        ? legacyEmail.trim().toLowerCase()
        : null;

    const {
      location = null,
      shipping = 0,
      tax = 0,
      discountCode = null,
      discountAmount = 0,
      tipAmount = 0,
      subtotal = 0,
      total = null,
    } = body || {};


    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    // Pesapal mobile money flow
    if (paymentMethod === "pesapal") {
      // Only basic validation for now; add more as needed
      if (!process.env.PESAPAL_CONSUMER_KEY || !process.env.PESAPAL_CONSUMER_SECRET) {
        return res.status(500).json({ error: "Missing Pesapal credentials" });
      }

      // Compose order details
      const pesapalOrder = {
        amount: totalNum,
        currency: "UGX", // TODO: support other currencies if needed
        description: `Coffee order for ${effectiveEmail || "guest"}`,
        callback_url: `${FRONTEND_URL}/checkout/pesapal-callback`,
        reference: `order-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        customer: {
          email_address: effectiveEmail,
          phone_number: body.phoneNumber || "",
          first_name: body.firstName || "",
          last_name: body.lastName || "",
        },
        payment_method: "MOBILE_MONEY",
      };

      let pesapalRes;
      try {
        pesapalRes = await pesapalCreateOrder(pesapalOrder);
      } catch (err) {
        console.error("Pesapal order error:", err);
        return res.status(500).json({ error: "Pesapal order failed" });
      }

      // Store order with pesapal reference
      await sql`
        insert into orders (
          session_id, status, total, currency, email, user_id, created_at,
          items, location, shipping, tax, discount_code, discount_amount, tip_amount, payment_method
        )
        values (
          ${pesapalRes.order_tracking_id},
          'pending',
          ${totalNum},
          'UGX',
          ${effectiveEmail},
          ${userId},
          now(),
          ${JSON.stringify(items)},
          ${location || null},
          ${shippingNum},
          ${taxNum},
          ${discountAllowed ? normalizedCode : null},
          ${clampedDiscount},
          ${tipNum},
          'pesapal'
        )
        on conflict (session_id) do update set
          total = excluded.total,
          currency = excluded.currency,
          email = coalesce(excluded.email, orders.email),
          user_id = coalesce(excluded.user_id, orders.user_id),
          items = excluded.items,
          location = coalesce(excluded.location, orders.location),
          shipping = excluded.shipping,
          tax = excluded.tax,
          discount_code = excluded.discount_code,
          discount_amount = excluded.discount_amount,
          tip_amount = excluded.tip_amount,
          payment_method = excluded.payment_method
      `;

      return res.status(200).json({
        url: pesapalRes.redirect_url,
        sessionId: pesapalRes.order_tracking_id,
        paymentProvider: "pesapal",
      });
    }

    // Optional identity bridging (does NOT require login)
    const decoded = getUserFromRequest(req);
    const { userId, email: tokenEmail } = extractUserIdentity(decoded);

    // Prefer authenticated email if available
    const effectiveEmail = tokenEmail || providedEmail || null;

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";

    // Discount validation (server-side authority)
    const normalizedCode = (discountCode || "").trim().toUpperCase();
    const discountAllowed = normalizedCode === "UBUNTU88";

    const subtotalNum = round2(Number(subtotal) || 0);
    const discountNum = discountAllowed ? round2(Number(discountAmount) || 0) : 0;
    const clampedDiscount = Math.min(discountNum, subtotalNum);
    const discountRatio = subtotalNum > 0 ? clampedDiscount / subtotalNum : 0;

    const shippingNum = round2(Number(shipping) || 0);
    const taxNum = round2(Number(tax) || 0);
    const tipNum = round2(Number(tipAmount) || 0);

    // If client didn’t send total, compute it safely
    const computedItemsTotal = round2(
      items.reduce((sum, it) => {
        const qty = Math.max(1, Number(it.quantity || 1));
        const price = round2(Number(it.price || 0));
        const discounted = round2(price * (1 - discountRatio));
        return sum + discounted * qty;
      }, 0)
    );
    const computedTotal = round2(computedItemsTotal + shippingNum + taxNum + tipNum);
    const totalNum = round2(total != null ? Number(total) : computedTotal);


    // Stripe line items (default)
    const line_items = items.map((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const unitPrice = round2(Number(item.price || 0));
      const discountedUnitPrice = round2(unitPrice * (1 - discountRatio));
      const imageUrl = normalizeImageUrl(item.image);
      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: String(item.name || "Item"),
            ...(imageUrl ? { images: [imageUrl] } : {}),
          },
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

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout/canceled`,
      customer_email: effectiveEmail || undefined,
      metadata: {
        // Identity bridge (critical for order history)
        userId: userId || "",
        email: effectiveEmail || "",

        // Order metadata for reconciliation/analytics
        location: location || "",
        discountCode: discountAllowed ? normalizedCode : "",
        subtotal: String(subtotalNum),
        discountAmount: String(clampedDiscount),
        shipping: String(shippingNum),
        tax: String(taxNum),
        tipAmount: String(tipNum),
        total: String(totalNum),
      },
    });

    // Store pending order row (this is what powers order history)
    await sql`
      insert into orders (
        session_id, status, total, currency, email, user_id, created_at,
        items, location, shipping, tax, discount_code, discount_amount, tip_amount
      )
      values (
        ${session.id},
        'pending',
        ${totalNum},
        'usd',
        ${effectiveEmail},
        ${userId},
        now(),
        ${JSON.stringify(items)},
        ${location || null},
        ${shippingNum},
        ${taxNum},
        ${discountAllowed ? normalizedCode : null},
        ${clampedDiscount},
        ${tipNum}
      )
      on conflict (session_id) do update set
        total = excluded.total,
        currency = excluded.currency,
        email = coalesce(excluded.email, orders.email),
        user_id = coalesce(excluded.user_id, orders.user_id),
        items = excluded.items,
        location = coalesce(excluded.location, orders.location),
        shipping = excluded.shipping,
        tax = excluded.tax,
        discount_code = excluded.discount_code,
        discount_amount = excluded.discount_amount,
        tip_amount = excluded.tip_amount
    `;

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
