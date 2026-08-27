require("dotenv").config();

// Fail loudly at startup rather than confusingly at request time. Without
// this, a missing JWT_SECRET in particular doesn't crash anything — it
// just makes every admin request (including your own login) come back as
// "Not logged in", which sends you debugging the wrong problem. DATABASE_URL
// is already validated the same way inside store.js. ADMIN_PASSWORD_HASH's
// absence surfaces at first login attempt today (see auth.js) — checking it
// here just moves that discovery earlier, before anyone's actually trying
// to log in.
const REQUIRED_ENV_VARS = ["JWT_SECRET", "ADMIN_PASSWORD_HASH"];
const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvVars.join(", ")}. ` +
      "Refusing to start — see .env.example.",
  );
  process.exit(1);
}

// FRONTEND_ORIGIN has an intentional localhost fallback below for local
// dev, so it doesn't belong in the hard-fail list above — but silently
// falling back to localhost in production means your real deployed
// frontend gets rejected by CORS with no explanation, so at least warn.
if (!process.env.FRONTEND_ORIGIN && process.env.NODE_ENV === "production") {
  console.warn(
    "FRONTEND_ORIGIN is not set in production — CORS will default to " +
      "http://localhost:5173, which is almost certainly not what you want.",
  );
}

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const tournamentsRouter = require("./src/routes/tournaments");
const authRouter = require("./src/routes/routes-auth");
const tournamentService = require("./src/tournamentService");
const store = require("./src/store");

const app = express();
const PORT = process.env.PORT || 4000;

// Managed hosts (Render, Railway, etc.) terminate TLS at a reverse proxy in
// front of this app. Without this, every request appears to come from the
// proxy's own IP — which breaks IP-based rate limiting (routes-auth.js's
// login limiter) and can affect how Express detects HTTPS for secure
// cookies. `1` trusts exactly one hop, matching a typical single-proxy
// setup; skip this entirely if running with no reverse proxy in front
// (e.g. bare VPS with no load balancer).
app.set("trust proxy", 1);

// Credentialed (cookie-based) requests require an explicit origin — `cors()`
// with no options defaults to `*`, which the Fetch/CORS spec disallows
// alongside credentials: "include". FRONTEND_ORIGIN should be your Vite dev
// server locally (e.g. http://localhost:5173) and your real frontend URL
// (e.g. the Vercel deployment) in production.
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/tournaments", tournamentsRouter);

app.get("/api/health", async (req, res) => {
  try {
    await store.ping();
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(503).json({ ok: false, db: "unreachable" });
  }
});

// Serve the built React app in production (after `npm run build` in /frontend).
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) next();
  });
});

async function start() {
  // Must resolve before the app starts accepting requests — otherwise the
  // first wave of requests could hit route handlers while `db` is still the
  // empty { tournaments: {} } placeholder from tournamentService.js's module
  // scope, which would look like every tournament vanished.
  try {
    await tournamentService.init();
  } catch (err) {
    console.error("Failed to load tournament data from the database:", err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(
      `Local Swiss Manager backend running at http://localhost:${PORT}`,
    );
  });
}

start();
