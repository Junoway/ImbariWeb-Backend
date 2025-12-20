// api/router.js
import * as auth from "../lib/handlers/auth.js";
import * as orders from "../lib/handlers/orders.js";
import * as subs from "../lib/handlers/subscriptions.js";
import * as admin from "../lib/handlers/admin.js";
import * as user from "../lib/handlers/users.js";
import { applyCors } from "../lib/cors.js";

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();

  // Normalize path (strip query string)
  // In Vercel Node functions, req.url is typically like "/api/auth/login?x=1"
  const pathname = (req.url || "").split("?")[0];

  // Always apply CORS at the router level so:
  // - OPTIONS preflight returns the right headers (fixes blocked preflight)
  // - 4xx/5xx responses still include CORS headers
  // - individual handlers can remain unchanged
  const ended = applyCors(req, res);
  if (ended) return;

  // ADMIN
  if (pathname === "/api/admin/analytics" && method === "GET") return admin.getAnalytics(req, res);
  if (pathname === "/api/admin/orders" && method === "GET") return admin.getOrders(req, res);

  // SUBSCRIPTIONS (single handler supports multiple verbs)
  if (pathname === "/api/subscriptions" && ["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    return subs.index(req, res);
  }

  // AUTH
  if (pathname === "/api/auth/login" && method === "POST") return auth.login(req, res);
  if (pathname === "/api/auth/signup" && method === "POST") return auth.signup(req, res);
  if (pathname === "/api/auth/verify-email" && method === "POST") return auth.verifyEmail(req, res);
  if (pathname === "/api/auth/resend-code" && method === "POST") return auth.resendCode(req, res);

  // USER
  if (pathname === "/api/user/me" && method === "GET") return user.me(req, res);

  // NOTE: Your original router had GET here; keep it exactly as-is.
  // If your frontend POSTs to this endpoint, you'll need to update this route later,
  // but this change is strictly for CORS/preflight correctness.
  if (pathname === "/api/user/subscription" && method === "GET") return user.subscription(req, res);

  // ORDERS
  if (pathname === "/api/orders" && method === "GET") return orders.list(req, res);

  res.statusCode = 404;
  res.end("Not Found");
}
