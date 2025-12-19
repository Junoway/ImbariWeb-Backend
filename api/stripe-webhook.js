// api/stripe-webhook.js
import Stripe from "stripe";
import { sql } from "../lib/db.js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // leave unpinned unless you pin everywhere consistently
});

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function centsToMajorUnits(cents) {
  if (typeof cents !== "number") return null;
  return Math.round(cents) / 100;
}

export async function stripeWebhook(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: "Missing STRIPE_WEBHOOK_SECRET" });

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
    const type = event.type;
    const session = event.data?.object;

    if (!session || session.object !== "checkout.session") {
      return res.status(200).json({ received: true, ignored: type });
    }

    const sessionId = session.id;
    const currency = (session.currency || "usd").toLowerCase();
    const total = centsToMajorUnits(session.amount_total);
    const email = session.customer_details?.email || session.customer_email || null;
    const customerName = session.customer_details?.name || null;

    const userId = session.metadata?.userId ? String(session.metadata.userId).trim() : null;

    const createdAt =
      typeof session.created === "number"
        ? new Date(session.created * 1000).toISOString()
        : null;

    async function upsertOrder({ status, setPaidAt = false, error = null }) {
      if (setPaidAt) {
        await sql`
          insert into orders (session_id, status, total, currency, email, user_id, customer_name, created_at, paid_at, error)
          values (${sessionId}, ${status}, ${total ?? 0}, ${currency}, ${email}, ${userId}, ${customerName},
                  coalesce(${createdAt}::timestamptz, now()), now(), ${error})
          on conflict (session_id) do update set
            status = excluded.status,
            paid_at = coalesce(orders.paid_at, excluded.paid_at),
            total = coalesce(excluded.total, orders.total),
            currency = coalesce(excluded.currency, orders.currency),
            email = coalesce(excluded.email, orders.email),
            user_id = coalesce(excluded.user_id, orders.user_id),
            customer_name = coalesce(excluded.customer_name, orders.customer_name),
            error = excluded.error
        `;
        return;
      }

      await sql`
        insert into orders (session_id, status, total, currency, email, user_id, customer_name, created_at, error)
        values (${sessionId}, ${status}, ${total ?? 0}, ${currency}, ${email}, ${userId}, ${customerName},
                coalesce(${createdAt}::timestamptz, now()), ${error})
        on conflict (session_id) do update set
          status = case when orders.status = 'paid' then orders.status else excluded.status end,
          total = coalesce(excluded.total, orders.total),
          currency = coalesce(excluded.currency, orders.currency),
          email = coalesce(excluded.email, orders.email),
          user_id = coalesce(excluded.user_id, orders.user_id),
          customer_name = coalesce(excluded.customer_name, orders.customer_name),
          error = case when orders.status = 'paid' then orders.error else excluded.error end
      `;
    }

    if (type === "checkout.session.completed") {
      if (session.payment_status !== "paid") return res.status(200).json({ received: true, ignored: "not_paid" });
      await upsertOrder({ status: "paid", setPaidAt: true, error: null });
      return res.status(200).json({ received: true });
    }

    if (type === "checkout.session.async_payment_succeeded") {
      await upsertOrder({ status: "paid", setPaidAt: true, error: null });
      return res.status(200).json({ received: true });
    }

    if (type === "checkout.session.expired") {
      await upsertOrder({ status: "expired", setPaidAt: false, error: "checkout_session_expired" });
      return res.status(200).json({ received: true });
    }

    if (type === "checkout.session.async_payment_failed") {
      await upsertOrder({ status: "failed", setPaidAt: false, error: "async_payment_failed" });
      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true, ignored: type });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
