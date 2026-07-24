const { COOKIE_NAME, verifyToken } = require("../auth");

// Protects a route by requiring a valid admin session cookie. Put this as
// the second argument on any route that shouldn't be reachable without
// logging in first — everything except the token-based public routes
// (/register/:token, /public-view/:token).
function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  try {
    verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Not logged in — please sign in again." });
  }
}

module.exports = requireAdmin;
