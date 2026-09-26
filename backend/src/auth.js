// ─── Admin authentication ───────────────────────────────────────────────────
// Single-operator model, deliberately: there's one admin (you), not a users
// table. The password lives as a bcrypt hash in an env var, never in code or
// in the data store. A successful login gets a JWT in an httpOnly cookie —
// no server-side session storage needed, which fits the current in-memory/
// local setup (nothing to lose on a restart, nothing to migrate later if
// this moves to a real DB).

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "admin_token";
const TOKEN_EXPIRY = "7d";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, in ms — keep in sync with TOKEN_EXPIRY
  };
}

async function verifyPassword(password) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    // Fail loudly at request time rather than silently accepting everything
    // — a missing env var should never mean "no password required."
    throw new Error(
      "ADMIN_PASSWORD_HASH is not set on the server — see hash-password.js",
    );
  }
  return bcrypt.compare(password, hash);
}

function signToken() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set on the server");
  }
  return jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

// Throws if the token is missing, expired, or tampered with — callers
// (requireAdmin middleware, the /me route) decide what to do with that.
function verifyToken(token) {
  if (!token) throw new Error("No token");
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  COOKIE_NAME,
  cookieOptions,
  verifyPassword,
  signToken,
  verifyToken,
};
