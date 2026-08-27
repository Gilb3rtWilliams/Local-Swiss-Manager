const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  COOKIE_NAME,
  cookieOptions,
  verifyPassword,
  signToken,
  verifyToken,
} = require("../auth");

const router = express.Router();

// Single admin account, no lockout, no MFA — rate limiting is the only
// thing standing between a public URL and someone scripting password
// guesses. bcrypt already slows each individual comparison down, but that
// alone doesn't stop a sustained scripted attempt once this isn't just
// reachable from your home network anymore.
//
// 10 attempts per 15 minutes per IP: generous enough that you fat-fingering
// your own password a few times never locks you out, tight enough to make
// scripted guessing impractical. Successful logins don't count against the
// limit, so it only ever penalizes repeated failures.
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Server error" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

// Lets the frontend check "am I still logged in?" on page load, without
// needing to hit an actual admin route just to find out.
router.get("/me", (req, res) => {
  try {
    verifyToken(req.cookies?.[COOKIE_NAME]);
    res.json({ authenticated: true });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;
