// lib/ordersStore.js
// Persistent order storage using Vercel KV.
// Install: npm i @vercel/kv
// In Vercel: Storage → KV → connect to this backend project.

import { kv } from "@vercel/kv";

const ORDERS_KEY = "orders:list";

// Save an order object (newest first)
export async function logOrder(order) {
  const safeOrder = {
    ...order,
    timestamp: order?.timestamp || new Date().toISOString(),
  };

  // Store as JSON string to keep list consistent
  await kv.lpush(ORDERS_KEY, JSON.stringify(safeOrder));

  // Optional: keep list from growing forever (keep latest 500)
  await kv.ltrim(ORDERS_KEY, 0, 499);

  return safeOrder;
}

// Fetch newest-first orders
export async function getOrders() {
  const raw = await kv.lrange(ORDERS_KEY, 0, 499);
  if (!raw || raw.length === 0) return [];

  const parsed = [];
  for (const item of raw) {
    try {
      parsed.push(typeof item === "string" ? JSON.parse(item) : item);
    } catch {
      // ignore bad entry
    }
  }
  return parsed;
}
