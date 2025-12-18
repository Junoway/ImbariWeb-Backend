import { sql } from "../lib/db.js";
import { requireUser } from "../lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId } = ident;
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { isSubscribed } = body;

  await sql`
    update users
    set is_subscribed = ${!!isSubscribed}
    where id = ${userId}
  `;

  return res.status(200).json({ ok: true });
}
