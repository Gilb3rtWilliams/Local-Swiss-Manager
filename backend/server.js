require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const tournamentsRouter = require("./src/routes/tournaments");
const authRouter = require("./src/routes/routes-auth");

const app = express();
const PORT = process.env.PORT || 4000;

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

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Serve the built React app in production (after `npm run build` in /frontend).
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(
    `Local Swiss Manager backend running at http://localhost:${PORT}`,
  );
});
