// api/stripe-webhook.js
import Stripe from "stripe";
import { sql } from "../lib/db.js";

export const config = {
  api: { bodyParser: false }, // IMPORTANT: Stripe needs the raw body
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

// Read raw request body (required for signature verification)
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");

  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).send("Missing Stripe-Signature header");

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Payment succeeded for Checkout
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // Update order in Neon by session_id
      await sql`
        update orders
        set status = 'paid',
            paid_at = now()
        where session_id = ${session.id}
      `;

      return res.status(200).json({ received: true });
    }

    // Optional: record failures (helpful for debugging)
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;

      await sql`
        update orders
        set status = 'failed',
            error = 'async_payment_failed'
        where session_id = ${session.id}
      `;

      return res.status(200).json({ received: true });
    }

    // Ignore other event types for now
    return res.status(200).json({ received: true, ignored: event.type });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).send("Webhook handler failed");
  }
}
