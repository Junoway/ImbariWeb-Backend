// lib/cors.js

const ALLOWED_ORIGINS = new Set([
  "https://www.imbaricoffee.com",
  "https://imbaricoffee.com",
  "http://localhost:3000",
]);

export function applyCors(req, res) {
  const origin = req.headers.origin;

  // Always set vary to prevent CDN/cache mixing origins
  res.setHeader("Vary", "Origin");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Allow common methods
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  // Echo requested headers when present (best practice for preflight reliability)
  const reqHeaders = req.headers["access-control-request-headers"];
  if (reqHeaders) {
    res.setHeader("Access-Control-Allow-Headers", reqHeaders);
  } else {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  // Preflight request
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}
