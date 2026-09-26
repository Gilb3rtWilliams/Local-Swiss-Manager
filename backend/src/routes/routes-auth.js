const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  COOKIE_NAME,
  cookieOptions,
  verifyPassword,
  signToken, // existing cookie-token signer, from ./auth — keep this
  verifyToken,
} = require("../auth");
const { signToken: signJwt } = require("./auth-middleware"); // NEW

const router = express.Router();

// Single shared admin — no real users table exists (see auth-middleware.js's
// comment about a `users` table this app never built). This synthetic
// identity is only ever used to shape the JWT payload for requireAuth's
// jwt.verify() to accept; it's not looked up anywhere.
const ADMIN_USER = { id: "admin", email: null };

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in a few minutes." },
});

router.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  try {
    const ok = await verifyPassword(password);
    if (!ok) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    res.cookie(COOKIE_NAME, signToken(), cookieOptions());
    // NEW: also issue a real JWT for API clients (the desktop app) that
    // send Authorization: Bearer <token> instead of relying on a cookie —
    // see main.js's auth:login handler, which stores whatever `token` this
    // returns.
    const jwtToken = signJwt(ADMIN_USER);
    res.json({ ok: true, token: jwtToken });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  try {
    verifyToken(req.cookies?.[COOKIE_NAME]);
    res.json({ authenticated: true });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;
