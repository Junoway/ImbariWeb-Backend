// api/router.js
import * as auth from "../lib/handlers/auth.js";
import * as orders from "../lib/handlers/orders.js";
import * as subs from "../lib/handlers/subscriptions.js";
import * as admin from "../lib/handlers/admin.js";
import * as user from "../lib/handlers/user.js";

export default async function handler(req, res) {
  const method = req.method || "GET";

  // Normalize path (strip query string)
  // In Vercel Node functions, req.url is typically like "/api/auth/login?x=1"
  const pathname = (req.url || "").split("?")[0];

  // ADMIN
  if (pathname === "/api/admin/analytics" && method === "GET") return admin.getAnalytics(req, res);
  if (pathname === "/api/admin/orders" && method === "GET") return admin.getOrders(req, res);

  // SUBSCRIPTIONS (single handler supports multiple verbs)
  if (pathname === "/api/subscriptions" && ["GET", "POST", "PATCH", "DELETE", "OPTIONS"].includes(method)) {
    return subs.index(req, res);
  }

  // AUTH
  if (pathname === "/api/auth/login" && method === "POST") return auth.login(req, res);
  if (pathname === "/api/auth/signup" && method === "POST") return auth.signup(req, res);
  if (pathname === "/api/auth/verify-email" && method === "POST") return auth.verifyEmail(req, res);
  if (pathname === "/api/auth/resend-code" && method === "POST") return auth.resendCode(req, res);

  // USER
  if (pathname === "/api/user/me" && ["GET", "OPTIONS"].includes(method)) return user.me(req, res);
  if (pathname === "/api/user/subscription" && ["GET", "OPTIONS"].includes(method)) return user.subscription(req, res);

  // ORDERS
  if (pathname === "/api/orders" && ["GET", "OPTIONS"].includes(method)) return orders.list(req, res);

  res.statusCode = 404;
  res.end("Not Found");
}
