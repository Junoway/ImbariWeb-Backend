// lib/ordersStore.js
// Vercel-safe in-memory store (NO fs). Not persistent across cold starts.

const STORE_KEY = "__IMBARI_ORDERS__";

// Ensure a single shared store per lambda container
function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = [];
  }
  return globalThis[STORE_KEY];
}

export function logOrder(order) {
  const store = getStore();
  const safeOrder = {
    ...order,
    timestamp: new Date().toISOString(),
  };
  store.push(safeOrder);
  return safeOrder;
}

export function getOrders() {
  return getStore();
}

export function clearOrders() {
  globalThis[STORE_KEY] = [];
}
