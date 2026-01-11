// api/pesapal-webhook.js
// Pesapal IPN/webhook handler for payment notifications
import { sql } from "../lib/db.js";
import { applyCors } from "../lib/cors.js";
import { pesapalQueryStatus } from "../lib/pesapal.js";

export default async function handler(req, res) {
  // CORS for webhook (allow Pesapal IPN server)
  if (applyCors(req, res)) return;

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Accept both POST (body) and GET (query params) for Pesapal IPN
  let orderTrackingId, notificationType, ipnId;
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    orderTrackingId = body.order_tracking_id || body.OrderTrackingId;
    notificationType = body.notification_type || body.NotificationType;
    ipnId = body.ipn_id || body.IpnId;
  } else if (req.method === "GET") {
    orderTrackingId = req.query?.order_tracking_id || req.query?.OrderTrackingId;
    notificationType = req.query?.notification_type || req.query?.NotificationType;
    ipnId = req.query?.ipn_id || req.query?.IpnId;
  }

  if (!orderTrackingId) {
    return res.status(400).json({ error: "Missing order_tracking_id" });
  }

  // Optionally log or store ipnId for audit/debug
  if (ipnId) {
    console.log("Received Pesapal IPN ID:", ipnId);
    // You may also store ipnId in the DB if needed
  }

  // Query Pesapal for latest status
  let statusRes;
  try {
    statusRes = await pesapalQueryStatus(orderTrackingId);
  } catch (err) {
    console.error("Pesapal status query error:", err);
    return res.status(500).json({ error: "Failed to query Pesapal status" });
  }

  // Update order in DB
  try {
    await sql`
      update orders
      set status = ${statusRes.status},
          paid_at = CASE WHEN ${statusRes.status} = 'COMPLETED' THEN now() ELSE paid_at END,
          ipn_id = ${ipnId}
      where session_id = ${orderTrackingId}
    `;
  } catch (err) {
    console.error("Pesapal DB update error:", err);
    return res.status(500).json({ error: "Failed to update order status" });
  }

  // Respond to Pesapal (must be 200 OK)
  res.status(200).json({ success: true });
}
