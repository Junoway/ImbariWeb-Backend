// api/user/subscription.js
import { sql } from "../../lib/db.js";
import { requireUser } from "../../lib/auth.js";

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
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
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

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;
  const body = parseBody(req);

  const nextSubscribed = !!body?.isSubscribed;

  try {
    const rows = await sql`
      update users
      set is_subscribed = ${nextSubscribed}
      where id = ${userId}
      returning id, is_subscribed
    `;

    if (!rows.length) return res.status(404).json({ error: "User not found" });

    return res.status(200).json({ ok: true, isSubscribed: !!rows[0].is_subscribed });
  } catch (err) {
    console.error("user/subscription error:", err);
    return res.status(500).json({ error: "Failed to update subscription status" });
  }
}
