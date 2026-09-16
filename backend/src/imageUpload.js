// imageUpload.js
// ─────────────────────────────────────────────────────────────────────────
// First file-upload feature in this project — scaffolds a small, swappable
// pipeline rather than wiring competitor pictures directly to a specific
// provider. Today: local disk storage under UPLOAD_DIR, served statically.
// Later, if you move to S3/Cloudinary/etc., only this file and the two
// lines in your server entrypoint that reference UPLOAD_DIR need to change
// — every caller (cage match competitor pictures now, team logos or player
// photos later) just deals with { url } and never touches the filesystem
// directly.
//
// Requires the `multer` package: npm install multer

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

// Where uploaded files live on disk, and the URL path they're served under.
// Kept as plain constants (not env-driven) for now to match the rest of
// this codebase's style — promote to process.env.UPLOAD_DIR /
// process.env.UPLOAD_URL_PREFIX later if you deploy somewhere the local
// filesystem isn't durable (e.g. a PaaS with ephemeral disks), since at
// that point you'd want S3 anyway.
const UPLOAD_DIR = path.join(__dirname, "uploads", "images");
const URL_PREFIX = "/uploads/images";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a competitor headshot

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext =
      EXT_BY_MIME[file.mimetype] || path.extname(file.originalname) || "";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const e = new Error(
      `Unsupported image type "${file.mimetype}" — expected JPEG, PNG, or WEBP.`,
    );
    e.status = 400;
    return cb(e);
  }
  cb(null, true);
}

// Single-file upload middleware, field name "image" — mount as:
//   router.post("/image", imageUpload.uploadSingle, imageUpload.handleUpload)
const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
}).single("image");

// Route handler run after multer has already placed the file — wraps up
// the response as { url, filename }. Kept separate from uploadSingle so a
// caller could also drop this into an existing wrap()-style error handler
// if their router uses one (as tournaments.js's wrap() does elsewhere).
function handleUpload(req, res) {
  if (!req.file) {
    return res
      .status(400)
      .json({
        error: 'No image file was uploaded (expected multipart field "image").',
      });
  }
  res.json({
    url: `${URL_PREFIX}/${req.file.filename}`,
    filename: req.file.filename,
  });
}

// Deletes a previously uploaded image by its URL (e.g. when a competitor's
// picture is replaced). Silently no-ops on a missing/foreign URL rather
// than throwing — losing track of an old file is a minor disk-space
// annoyance, never worth failing the request that's replacing it.
function deleteByUrl(url) {
  if (!url || !url.startsWith(URL_PREFIX)) return;
  const filename = path.basename(url);
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.unlink(fullPath, () => {}); // fire-and-forget
}

module.exports = {
  UPLOAD_DIR,
  URL_PREFIX,
  uploadSingle,
  handleUpload,
  deleteByUrl,
};
