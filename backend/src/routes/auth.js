// routes/auth.js
// ─────────────────────────────────────────────────────────────────────────
//   POST /api/auth/login          desktop app exchanges email+password for
//                                 a long-lived bearer token, stored locally
//                                 via keytar (see desktop/publishing/authStore.js)
//   GET  /api/me/entitlement      what publishing/entitlement.js polls
//
// ASSUMPTION: users.password_hash holds a bcrypt hash. If your web app's
// existing signup/login already does this, point PASSWORD_COLUMN-handling
// below at that same column/hashing scheme instead of introducing a second
// one -- one password hash per user, not two different auth systems.

const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { signToken, requireAuth } = require("./auth-middleware");

const router = express.Router();
router.use(express.json());

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, email, password_hash, subscription_status FROM users WHERE email = $1`,
      [String(email).toLowerCase().trim()],
    );
    const user = rows[0];
    // Compare against a dummy hash even when no such user exists, so the
    // response time doesn't reveal whether an email is registered.
    const hash =
      user?.password_hash ||
      "$2a$10$C6UzMDM.H6dfI/f/IKcEeO4pRp4IB.hVCJXvhpjNjV/aC0DsY3.Se";
    const valid = await bcrypt.compare(password, hash);
    if (!user || !valid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    res.json({
      token: signToken(user),
      userId: user.id,
      email: user.email,
      subscriptionActive: user.subscription_status === "active",
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed.", detail: err.message });
  }
});

router.get("/me/entitlement", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT subscription_status FROM users WHERE id = $1`,
      [req.user.id],
    );
    res.json({
      userId: req.user.id,
      subscriptionActive: rows[0]?.subscription_status === "active",
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Could not check entitlement.", detail: err.message });
  }
});

module.exports = { router };
