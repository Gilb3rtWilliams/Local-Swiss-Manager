const express = require("express");
const svc = require("../reviewsService");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

function wrap(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      res.json(result);
    } catch (err) {
      res
        .status(err.status || 500)
        .json({ error: err.message || "Server error" });
    }
  };
}

// Public — testimonials are meant to be seen. Only writing/removing them
// needs the admin gate below.
router.get(
  "/",
  wrap(() => svc.listReviews()),
);

router.post(
  "/",
  requireAdmin,
  wrap((req) => svc.createReview(req.body)),
);

router.delete(
  "/:id",
  requireAdmin,
  wrap((req) => svc.deleteReview(req.params.id)),
);

module.exports = router;
