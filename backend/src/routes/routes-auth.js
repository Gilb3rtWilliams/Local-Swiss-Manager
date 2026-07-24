const express = require("express");
const {
  COOKIE_NAME,
  cookieOptions,
  verifyPassword,
  signToken,
  verifyToken,
} = require("../auth");

const router = express.Router();

router.post("/login", async (req, res) => {
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
