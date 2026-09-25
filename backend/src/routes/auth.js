// routes/auth.js
// ─────────────────────────────────────────────────────────────────────────
// Mount this at /api/account (NOT /api/auth -- that path is already taken
// by your existing admin login, routes-auth.js / ADMIN_PASSWORD_HASH):
//   POST /api/account/login          desktop app exchanges email+password
//                                    for a long-lived bearer token, stored
//                                    locally via desktop/publishing/authStore.js
//   GET  /api/account/entitlement    what publishing/entitlement.js polls
//
// This is a SEPARATE auth system from your existing admin login -- one is
// per-customer accounts with individual subscriptions (this one), the other
// is your own single-admin access (unchanged, untouched by any of this).
//
// ASSUMPTION: users.password_hash holds a bcrypt hash, and a `users` table
// exists with (id, email, password_hash, subscription_status) columns --
// confirm this table actually exists before running migrations/001, which
// assumes it (see the note where that migration is discussed).

const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { signToken, requireAuth } = require("./auth-middleware");

const router = express.Router();
router.use(express.json());

router.post("/login", async (req, res) => {
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

router.get("/entitlement", requireAuth, async (req, res) => {
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
