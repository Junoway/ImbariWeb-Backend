// api/orders.js
// GET /api/orders?user=<userId>
// GET /api/orders?admin=true   (requires Authorization: Bearer <ADMIN_TOKEN> if set)
//
// Uses Vercel KV (persistent). You must have Vercel KV enabled for this project
// and install dependency: npm i @vercel/kv

import { getOrders } from "../lib/ordersStore.js";

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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    const userId = req.query.user || "";
    const isAdmin = String(req.query.admin || "").toLowerCase() === "true";

    // Optional admin protection:
    // If ADMIN_TOKEN is set, admin calls must include "Authorization: Bearer <ADMIN_TOKEN>"
    if (isAdmin && process.env.ADMIN_TOKEN) {
      const auth = req.headers.authorization || "";
      const expected = `Bearer ${process.env.ADMIN_TOKEN}`;
      if (auth !== expected) {
        return res.status(401).json({ error: "Unauthorized (admin)" });
      }
    }

    const orders = await getOrders(); // newest-first array

    if (isAdmin) {
      return res.status(200).json({ orders });
    }

    if (!userId) {
      return res.status(400).json({ error: "Missing ?user=<userId>" });
    }

    const userOrders = orders.filter((o) => String(o.userId) === String(userId));
    return res.status(200).json({ orders: userOrders });
  } catch (err) {
    console.error("orders error:", err);
    return res.status(500).json({ error: "Server error fetching orders" });
  }
}
