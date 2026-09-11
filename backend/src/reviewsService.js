// Testimonials from tournament organizers, shown on the Dashboard. Submission
// is admin-gated (see requireAdmin in the router) — this isn't an open public
// form, since a shared single-admin login is the only account this app has;
// you enter reviews after hearing them from organizers, rather than
// organizers having their own accounts to log in and post directly.
//
// Shares the same Postgres pool as store.js rather than opening a second
// connection — one DATABASE_URL, one pool, two tables.

const crypto = require("crypto");
const { pool } = require("./store");

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Swiss Manager user',
      quote TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  schemaReady = true;
}

function serializeReview(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    quote: row.quote,
    rating: row.rating,
    createdAt: row.created_at,
  };
}

// Public — read-only, no admin gate. Testimonials are meant to be seen;
// only submitting/removing them needs to be locked down.
async function listReviews() {
  await ensureSchema();
  const { rows } = await pool.query(
    "SELECT * FROM reviews ORDER BY created_at DESC LIMIT 50",
  );
  return rows.map(serializeReview);
}

function validateReviewInput({ name, role, quote, rating }) {
  if (!name || !name.trim()) {
    const e = new Error("Name is required");
    e.status = 400;
    throw e;
  }
  if (!quote || !quote.trim()) {
    const e = new Error("Review text is required");
    e.status = 400;
    throw e;
  }
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    const e = new Error("Rating must be a whole number from 1 to 5");
    e.status = 400;
    throw e;
  }
  // A generous but real cap — this is a testimonial, not a support ticket.
  // Rejecting absurdly long input at the door is cheaper than storing it.
  if (name.trim().length > 100 || quote.trim().length > 1000) {
    const e = new Error("Name or review text is too long");
    e.status = 400;
    throw e;
  }
  return {
    name: name.trim(),
    role: role && role.trim() ? role.trim() : "Swiss Manager user",
    quote: quote.trim(),
    rating: ratingNum,
  };
}

async function createReview(input) {
  await ensureSchema();
  const clean = validateReviewInput(input);
  const { rows } = await pool.query(
    `INSERT INTO reviews (id, name, role, quote, rating)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [crypto.randomUUID(), clean.name, clean.role, clean.quote, clean.rating],
  );
  return serializeReview(rows[0]);
}

async function deleteReview(id) {
  await ensureSchema();
  const { rowCount } = await pool.query("DELETE FROM reviews WHERE id = $1", [
    id,
  ]);
  if (rowCount === 0) {
    const e = new Error("Review not found");
    e.status = 404;
    throw e;
  }
  return { ok: true };
}

module.exports = { listReviews, createReview, deleteReview };
