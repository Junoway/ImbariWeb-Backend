// api/create-checkout-session.js
import Stripe from "stripe";
import { sql } from "../lib/db.js";
import { getUserFromRequest, extractUserIdentity } from "../lib/auth.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const toCents = (n) => Math.max(0, Math.round(Number(n) * 100));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { items = [], location, shipping = 0, tax = 0, discountCode, discountAmount = 0, tipAmount = 0, subtotal = 0, total, email } = body || {};

    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Items array is required" });

    // Optional identity
    const decoded = getUserFromRequest(req);
    const { userId, email: tokenEmail } = extractUserIdentity(decoded);

    const providedEmail = typeof email === "string" ? email.trim().toLowerCase() : null;
    const effectiveEmail = tokenEmail || providedEmail || null;

    const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.imbaricoffee.com";

    const normalizedCode = (discountCode || "").trim().toUpperCase();
    const discountAllowed = normalizedCode === "UBUNTU88";

    const subtotalNum = round2(Number(subtotal) || 0);
    const discountNum = discountAllowed ? round2(Number(discountAmount) || 0) : 0;
    const clampedDiscount = Math.min(discountNum, subtotalNum);
    const discountRatio = subtotalNum > 0 ? clampedDiscount / subtotalNum : 0;

    const shippingNum = round2(Number(shipping) || 0);
    const taxNum = round2(Number(tax) || 0);
    const tipNum = round2(Number(tipAmount) || 0);
    const totalNum = round2(Number(total) || 0);

    const line_items = items.map((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const unitPrice = round2(Number(item.price || 0));
      const discountedUnitPrice = round2(unitPrice * (1 - discountRatio));

      return {
        price_data: {
          currency: "usd",
          product_data: { name: String(item.name || "Item") },
          unit_amount: toCents(discountedUnitPrice),
        },
        quantity: qty,
      };
    });

    if (tipNum > 0) line_items.push({ price_data: { currency: "usd", product_data: { name: "Tip" }, unit_amount: toCents(tipNum) }, quantity: 1 });
    if (shippingNum > 0) line_items.push({ price_data: { currency: "usd", product_data: { name: "Shipping" }, unit_amount: toCents(shippingNum) }, quantity: 1 });
    if (taxNum > 0) line_items.push({ price_data: { currency: "usd", product_data: { name: "Tax" }, unit_amount: toCents(taxNum) }, quantity: 1 });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/checkout/canceled`,
      customer_email: effectiveEmail || undefined,
      metadata: {
        userId: userId || "",
        email: effectiveEmail || "",
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

    await sql`
      insert into orders (session_id, status, total, currency, email, user_id, created_at, items, location, shipping, tax, discount_code, discount_amount, tip_amount)
      values (
        ${session.id}, 'pending', ${totalNum}, 'usd', ${effectiveEmail}, ${userId},
        now(), ${JSON.stringify(items)}, ${location || null}, ${shippingNum}, ${taxNum},
        ${discountAllowed ? normalizedCode : null}, ${clampedDiscount}, ${tipNum}
      )
      on conflict (session_id) do update set
        email = coalesce(excluded.email, orders.email),
        user_id = coalesce(excluded.user_id, orders.user_id),
        items = excluded.items,
        total = excluded.total
    `;

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

