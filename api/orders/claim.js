// api/orders/claim.js
import { sql } from "../../lib/db.js";
import { requireUser } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const ident = requireUser(req, res);
  if (!ident) return;

  const { userId, email } = ident;

  try {
    // Claim only orders with same email AND no user_id yet
    await sql`
      update orders
      set user_id = ${userId}
      where user_id is null
        and email is not null
        and lower(email) = ${email}
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("claim error:", err);
    return res.status(500).json({ error: "Failed to claim orders" });
  }
}
