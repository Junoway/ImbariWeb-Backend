// lib/auth.js
import jwt from "jsonwebtoken";

export function signJwt(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET");
  return jwt.sign(payload, secret, { expiresIn: "30d" });
}

export function getUserFromRequest(req) {
  const auth = req.headers?.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;

  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

export function extractUserIdentity(decoded) {
  if (!decoded || typeof decoded !== "object") return { userId: null, email: null };

  const userId = decoded.sub || decoded.id || null;
  const emailRaw = decoded.email || null;
  const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : null;

  return { userId: userId ? String(userId) : null, email };
}

export function requireUser(req, res) {
  const decoded = getUserFromRequest(req);
  const { userId, email } = extractUserIdentity(decoded);
  if (!userId || !email) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return { userId, email };
}
