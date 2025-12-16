// api/orders.js
import { getOrders } from "../lib/ordersStore.js";

function setCors(req, res) {
  const allowedOrigins = (process.env.ALLOWED_ORIGIN || "https://www.imbaricoffee.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    // Optional fallback: if no Origin header (curl/server-to-server), allow your primary site
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0] || "https://www.imbaricoffee.com");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export default function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  // GET /api/orders?user=userId
  // GET /api/orders?admin=true
  const userId = req.query?.user;
  const isAdmin = req.query?.admin === "true";

  const allOrders = getOrders();

  if (isAdmin) {
    return res.status(200).json({ orders: allOrders });
  }

  if (userId) {
    const userOrders = allOrders.filter((o) => String(o.user || "") === String(userId));
    return res.status(200).json({ orders: userOrders });
  }

  // For now, return empty instead of 401 to avoid breaking your UI while testing
  return res.status(200).json({ orders: [] });
}
