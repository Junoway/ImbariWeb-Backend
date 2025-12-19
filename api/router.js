// api/router.js
import * as auth from "../lib/handlers/auth.js";
import * as orders from "../lib/handlers/orders.js";
import * as subs from "../lib/handlers/subscriptions.js";
import * as admin from "../lib/handlers/admin.js";
import * as user from "../lib/handlers/users.js";

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();

  // Normalize path (strip query string)
  // In Vercel Node functions, req.url is typically like "/api/auth/login?x=1"
  const pathname = (req.url || "").split("?")[0];

  // Global preflight fast-path (safe default)
  // Handlers that need to set CORS headers should still do so; this prevents random 405/404 on preflight.
  if (method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

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
  if (pathname === "/api/user/subscription" && method === "GET") return user.subscription(req, res);

  // ORDERS
  if (pathname === "/api/orders" && method === "GET") return orders.list(req, res);

  res.statusCode = 404;
  res.end("Not Found");
}
