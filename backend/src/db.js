// db.js
// Thin Postgres pool wrapper. If you already have a `pg` Pool set up
// elsewhere (likely, given the existing Express backend), delete this file
// and import your existing pool into publish.js / tournamentsPublic.js
// instead -- this is only here so those two files run standalone.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Railway injects this
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : undefined,
});

module.exports = { pool };
