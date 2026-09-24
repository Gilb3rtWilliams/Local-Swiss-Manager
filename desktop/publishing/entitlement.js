// publishing/entitlement.js
// ─────────────────────────────────────────────────────────────────────────
// Checks the account's subscription status and caches it locally, so the
// app keeps working at a venue with no internet. Two independent time
// windows matter here, and it's worth being explicit about which is which:
//   - the SUBSCRIPTION's own validity (does Stripe say this account is
//     paid up) -- decided entirely server-side, this module doesn't know
//     or care how it's computed.
//   - the CACHE's grace period (how long we trust the last answer we got
//     before insisting on a fresh check) -- decided here, via
//     GRACE_PERIOD_MS. This is what lets an arbiter run a multi-day
//     tournament at a venue with no wifi without getting locked out.
//
// This module answers "is this account entitled right now" -- what you gate
// on that (local app usage entirely, or just the publish feature) is a
// product decision left to whoever wires this in.

const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days offline grace
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check at most this often when online

class Entitlement {
  constructor(
    db,
    { apiBaseUrl, getAuthToken, fetchImpl = fetch, now = () => new Date() },
  ) {
    this.db = db;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
    this.getAuthToken = getAuthToken;
    this.fetch = fetchImpl;
    this.now = now;
  }

  _row() {
    return this.db
      .prepare(`SELECT * FROM entitlement_cache WHERE id = 1`)
      .get();
  }

  _save({ userId, active, validUntil }) {
    this.db
      .prepare(
        `INSERT INTO entitlement_cache (id, user_id, active, checked_at, valid_until)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           user_id = excluded.user_id, active = excluded.active,
           checked_at = excluded.checked_at, valid_until = excluded.valid_until`,
      )
      .run(
        userId ?? null,
        active ? 1 : 0,
        this.now().toISOString(),
        validUntil,
      );
  }

  // Refreshes from the server if possible. Safe to call often (e.g. on app
  // start, and every RECHECK_INTERVAL_MS after) -- it no-ops quietly if
  // there's no token yet or the network call fails, since isEntitled() below
  // is what actually decides based on whatever was last cached.
  async refresh() {
    const token = await this.getAuthToken();
    if (!token) return;

    const cached = this._row();
    const lastCheck = cached?.checked_at
      ? new Date(cached.checked_at).getTime()
      : 0;
    if (this.now().getTime() - lastCheck < RECHECK_INTERVAL_MS) return; // checked recently enough

    try {
      const res = await this.fetch(`${this.apiBaseUrl}/api/me/entitlement`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return; // leave the existing cache alone; don't punish a transient 500
      const body = await res.json();
      const validUntil = new Date(
        this.now().getTime() + GRACE_PERIOD_MS,
      ).toISOString();
      this._save({
        userId: body.userId,
        active: !!body.subscriptionActive,
        validUntil,
      });
    } catch {
      // offline or unreachable -- keep using the existing cache
    }
  }

  // The actual gate to call before letting someone publish (or, if you
  // choose to, before letting them use the app at all). True if the last
  // known answer was "active" AND that answer is still within its grace
  // period.
  isEntitled() {
    const row = this._row();
    if (!row || !row.active) return false;
    if (!row.valid_until) return false;
    return this.now().getTime() <= new Date(row.valid_until).getTime();
  }
}

module.exports = { Entitlement, GRACE_PERIOD_MS, RECHECK_INTERVAL_MS };
