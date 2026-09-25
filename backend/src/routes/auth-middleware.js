// routes/auth-middleware.js
// ─────────────────────────────────────────────────────────────────────────
// Verifies the bearer token issued by POST /api/auth/login and attaches
// req.user. This replaces the requireAuth/requireActiveSubscription
// PLACEHOLDERS in publish.js from earlier -- those were stubs waiting for
// exactly this.
//
// ASSUMPTION: your web app's own login may already use session cookies
// rather than JWTs -- that's fine, they don't need to be the same
// mechanism. This module is specifically for API clients that send
// `Authorization: Bearer <token>` (the desktop app, and optionally your web
// SPA's own fetch calls if you want to unify on one mechanism later).
//
// JWT_SECRET must be set in the environment. Rotating it invalidates every
// issued token -- everyone has to log in again -- so treat it like any
// other production secret (Railway's env var UI, not committed to git).

const jwt = require("jsonwebtoken");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return secret;
}

function signToken(user) {
  // Kept intentionally minimal -- subscription status is NOT baked into the
  // token, so a cancellation takes effect on the next entitlement check
  // rather than only once this (possibly long-lived) token expires.
  return jwt.sign({ sub: user.id, email: user.email }, getSecret(), {
    expiresIn: "90d",
  });
}

function requireAuth(req, res, next) {
  const header = req.header("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

function requireActiveSubscription(pool) {
  // No real subscriptions/users table exists — single-admin app, everyone
  // who passes requireAuth is entitled. Mirrors publishing/entitlement.js's
  // isEntitled() bypass on the client side. Revisit if real per-customer
  // subscriptions are ever built.
  return (req, res, next) => next();
}

module.exports = { signToken, requireAuth, requireActiveSubscription };
