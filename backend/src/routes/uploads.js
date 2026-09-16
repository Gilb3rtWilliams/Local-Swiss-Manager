// uploads.js
// ─────────────────────────────────────────────────────────────────────────
// Generic upload routes, not scoped to any one tournament. Lives at
// src/routes/uploads.js, sibling to tournaments.js — mount it the same way:
//
//   app.use("/api/uploads", require("./src/routes/uploads"));
//
// Static serving of the uploaded files back out (so the URLs this returns
// actually resolve) still needs to be added separately in server.js:
//
//   app.use("/uploads", express.static(path.join(__dirname, "src", "uploads")));

const express = require("express");
const imageUpload = require("../imageUpload");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

router.post(
  "/image",
  requireAdmin,
  imageUpload.uploadSingle,
  imageUpload.handleUpload,
  (err, req, res, next) => {
    // multer (and our fileFilter) surface errors with `err.status` /
    // `err.message` already shaped for the client — same convention as
    // tournaments.js's wrap().
    res
      .status(err.status || 400)
      .json({ error: err.message || "Upload failed" });
  },
);

module.exports = router;
