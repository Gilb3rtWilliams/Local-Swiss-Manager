// publishing/publishSync.js
// ─────────────────────────────────────────────────────────────────────────
// Keeps every tournament the arbiter has switched "Live Publish" on for in
// step with the website, automatically.
//
// How it works (whole-tournament sync, no event log):
//   • Every few seconds it looks at each publishing tournament's saved data
//     (the JSON blob in SQLite) and hashes it. If the hash differs from what
//     was last uploaded, it PUTs the blob to the server.
//   • After an upload it VERIFIES: it checks the server echoed the exact
//     bytes back (hash) and reads the PUBLIC results page the way a
//     spectator would, confirming the round counts match. Only then is the
//     tournament "live" — so the badge can't claim more than is true.
//   • Failures are never silent: each is recorded with a kind (network /
//     auth / subscription / server / verify) and retried with backoff.
//     Offline is normal at a venue — changes just wait and go up later.
//   • Turning publishing OFF hides the tournament on the website (the
//     server keeps the data). If that can't be done right now (offline) it
//     is remembered and retried, so "off" always eventually takes effect.
//
// It only ever READS the tournaments table and writes its own publish_sync
// table, so it can't interfere with the local app's saves.
//
// Uses only prepare().get/all/run and exec() on the db handle, so it works
// with better-sqlite3 (the app) and node:sqlite (tests) alike.

const crypto = require("crypto");

const POLL_MS = 3000;
const IDLE_REVERIFY_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 60000; // a sleeping Render instance can take ~50s to wake
const MAX_BACKOFF_MS = 60000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const nowIso = () => new Date().toISOString();

// What a spectator can check on the public page. Kept deliberately to
// counts that both the local blob and the public payload carry.
function localSignature(t) {
  return {
    currentRound: Number(t.currentRound) || 0,
    rounds: Array.isArray(t.rounds) ? t.rounds.length : 0,
    queued: Array.isArray(t.queuedRounds) ? t.queuedRounds.length : 0,
    status: t.status ? String(t.status) : null,
  };
}
function publicSignature(p) {
  return {
    currentRound: Number(p.currentRound) || 0,
    rounds: Array.isArray(p.rounds) ? p.rounds.length : 0,
    queued: Array.isArray(p.queuedRounds) ? p.queuedRounds.length : 0,
    status: p.status ? String(p.status) : null,
  };
}
function signaturesMatch(local, pub) {
  return (
    local.currentRound === pub.currentRound &&
    local.rounds === pub.rounds &&
    local.queued === pub.queued &&
    (pub.status === null ||
      local.status === null ||
      local.status === pub.status)
  );
}

class SyncError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'network' | 'auth' | 'subscription' | 'server' | 'verify'
  }
}

class PublishSync {
  constructor(
    db,
    {
      apiBaseUrl,
      webOrigin,
      getAuthToken,
      isEntitled = () => true,
      fetchImpl = fetch,
      pollMs = POLL_MS,
      timeoutMs = TIMEOUT_MS,
      reverifyMs = IDLE_REVERIFY_MS,
      onEvent,
    },
  ) {
    this.db = db;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
    this.webOrigin = (webOrigin || apiBaseUrl).replace(/\/+$/, "");
    this.getAuthToken = getAuthToken;
    this.isEntitled = isEntitled;
    this.fetch = fetchImpl;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
    this.reverifyMs = reverifyMs;
    this.onEvent = onEvent || (() => {});
    this._timer = null;
    this._running = false;
    this._again = false;
    this._stopped = true;
    // In-memory, per tournament: things that don't need to survive a restart.
    this._mem = new Map();
    this._ensureTable();
  }

  _ensureTable() {
    // Also declared in local-schema.sql; repeated here so the module works
    // even against a database file created before that table existed.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS publish_sync (
        tournament_id     TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE,
        pushed_hash       TEXT,
        pushed_at         TEXT,
        verified_hash     TEXT,
        verified_at       TEXT,
        public_token      TEXT,
        unpublish_pending INTEGER NOT NULL DEFAULT 0,
        opted_in          INTEGER NOT NULL DEFAULT 0,
        last_error        TEXT,
        last_error_kind   TEXT,
        last_attempt_at   TEXT
      );
    `);
    // The first version of this table had no opted_in column.
    const cols = this.db.prepare(`PRAGMA table_info(publish_sync)`).all();
    if (!cols.some((c) => c.name === "opted_in")) {
      this.db.exec(
        `ALTER TABLE publish_sync ADD COLUMN opted_in INTEGER NOT NULL DEFAULT 0`,
      );
    }
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  start() {
    if (!this._stopped) return;
    this._stopped = false;
    this._schedule(0);
  }
  stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }
  // Run a cycle now (after the arbiter did something, or on "Sync now").
  kick() {
    if (this._stopped) return;
    if (this._running) {
      this._again = true;
      return;
    }
    this._schedule(0);
  }
  // After signing in (or any other reason to stop waiting): drop all
  // backoff and "blocked" flags and try everything now.
  resume() {
    for (const m of this._mem.values()) {
      m.nextAttemptAt = 0;
      m.failures = 0;
      m.blocked = null;
    }
    this.kick();
  }
  syncNow(tournamentId) {
    this._memFor(tournamentId).nextAttemptAt = 0;
    this.kick();
  }
  _schedule(ms) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._runCycle(), ms);
  }

  // ── toggle ─────────────────────────────────────────────────────────────
  enable(tournamentId) {
    if (!this.isEntitled()) {
      return { ok: false, error: "Subscription required to publish." };
    }
    this.db
      .prepare(
        `INSERT INTO publish_state (tournament_id, enabled) VALUES (?, 1)
         ON CONFLICT (tournament_id) DO UPDATE SET enabled = 1`,
      )
      .run(tournamentId);
    // Forget what was uploaded: if it was hidden earlier, a fresh upload is
    // what makes it visible again.
    this.db
      .prepare(
        `INSERT INTO publish_sync (tournament_id, opted_in) VALUES (?, 1)
         ON CONFLICT (tournament_id) DO UPDATE SET
           opted_in = 1, pushed_hash = NULL, verified_hash = NULL,
           unpublish_pending = 0, last_error = NULL, last_error_kind = NULL`,
      )
      .run(tournamentId);
    const m = this._memFor(tournamentId);
    m.nextAttemptAt = 0;
    m.failures = 0;
    m.blocked = null;
    this.kick();
    return { ok: true };
  }

  disable(tournamentId) {
    // Deliberately not gated on the subscription — see publish.js.
    this.db
      .prepare(
        `INSERT INTO publish_state (tournament_id, enabled) VALUES (?, 0)
         ON CONFLICT (tournament_id) DO UPDATE SET enabled = 0`,
      )
      .run(tournamentId);
    this.db
      .prepare(
        `INSERT INTO publish_sync (tournament_id, unpublish_pending) VALUES (?, 1)
         ON CONFLICT (tournament_id) DO UPDATE SET
           unpublish_pending = 1, last_error = NULL, last_error_kind = NULL`,
      )
      .run(tournamentId);
    const m = this._memFor(tournamentId);
    m.nextAttemptAt = 0;
    m.failures = 0;
    m.blocked = null;
    this.kick();
    return { ok: true };
  }

  // ── status for the UI ──────────────────────────────────────────────────
  status(tournamentId) {
    const base = {
      webOrigin: this.webOrigin,
      adminUrl: `${this.webOrigin}/tournament/${tournamentId}`,
    };
    const ps = this.db
      .prepare(`SELECT enabled FROM publish_state WHERE tournament_id = ?`)
      .get(tournamentId);
    const sy = this.db
      .prepare(`SELECT * FROM publish_sync WHERE tournament_id = ?`)
      .get(tournamentId);
    const m = this._memFor(tournamentId);
    const publicUrl = sy?.public_token
      ? `${this.webOrigin}/results/${sy.public_token}`
      : null;

    // A publish_state row left over from the older publishing code is NOT an
    // opt-in: only tournaments switched on through the current toggle sync.
    if (!ps || !ps.enabled || !sy?.opted_in) {
      const hiding = Boolean(sy?.unpublish_pending);
      return {
        ...base,
        enabled: false,
        state: hiding ? "hiding" : "off",
        synced: !hiding,
        steps: { saved: true, uploaded: false, verified: false },
        pendingChanges: false,
        lastSyncedAt: null,
        publicUrl: null,
        error: hiding ? sy?.last_error || null : null,
        errorKind: hiding ? sy?.last_error_kind || null : null,
        cloudTournamentId: null,
      };
    }

    const localHash = m.localHash || null;
    const uploaded = Boolean(localHash && sy?.pushed_hash === localHash);
    const verified = Boolean(localHash && sy?.verified_hash === localHash);

    let state;
    if (m.blocked) state = m.blocked; // 'needs_login' | 'subscription'
    else if (sy?.last_error_kind === "network") state = "offline";
    else if (sy?.last_error) state = "error";
    else if (verified) state = "live";
    else state = "syncing";

    return {
      ...base,
      enabled: true,
      state,
      synced: state === "live",
      steps: { saved: true, uploaded, verified },
      // Changes made on this computer that the website doesn't have yet.
      pendingChanges: localHash !== null && !uploaded,
      lastSyncedAt: sy?.verified_at || sy?.pushed_at || null,
      publicUrl,
      error: sy?.last_error || null,
      errorKind: sy?.last_error_kind || null,
      cloudTournamentId: tournamentId,
    };
  }

  // ── the loop ───────────────────────────────────────────────────────────
  _memFor(id) {
    let m = this._mem.get(id);
    if (!m) {
      m = { nextAttemptAt: 0, failures: 0, blocked: null, localHash: null };
      this._mem.set(id, m);
    }
    return m;
  }

  async _runCycle() {
    if (this._stopped || this._running) return;
    this._running = true;
    try {
      const rows = this.db
        .prepare(
          `SELECT ps.tournament_id AS id,
                  CASE WHEN ps.enabled = 1 AND COALESCE(sy.opted_in, 0) = 1
                       THEN 1 ELSE 0 END AS enabled,
                  COALESCE(sy.unpublish_pending, 0) AS unpublish_pending
           FROM publish_state ps
           LEFT JOIN publish_sync sy ON sy.tournament_id = ps.tournament_id`,
        )
        .all();
      for (const r of rows) {
        if (this._stopped) break;
        try {
          if (r.enabled) await this._syncOne(r.id);
          else if (r.unpublish_pending) await this._unpublishOne(r.id);
        } catch (err) {
          this._recordFailure(r.id, err);
          // The server is unreachable (or asleep): the others would only time
          // out one after another. Try them all again next cycle instead.
          if (err instanceof SyncError && err.kind === "network") break;
        }
      }
    } catch (err) {
      this.onEvent("cycle_error", { error: err.message });
    } finally {
      this._running = false;
    }
    if (this._stopped) return;
    const again = this._again;
    this._again = false;
    this._schedule(again ? 0 : this.pollMs);
  }

  _recordFailure(id, err) {
    const kind = err instanceof SyncError ? err.kind : "server";
    const m = this._memFor(id);
    m.failures += 1;
    const delay = Math.min(1000 * 2 ** Math.min(m.failures, 6), MAX_BACKOFF_MS);
    m.nextAttemptAt = Date.now() + delay + Math.floor(Math.random() * 300);
    if (kind === "auth") m.blocked = "needs_login";
    else if (kind === "subscription") m.blocked = "subscription";
    this._upsertSync(id, {
      last_error: err.message,
      last_error_kind: kind,
      last_attempt_at: nowIso(),
    });
    // Report a problem when it first appears or changes, then only now and
    // then — not on every retry.
    if (m.lastLogged !== err.message || m.failures % 10 === 0) {
      m.lastLogged = err.message;
      this.onEvent(`${kind}_error`, { tournamentId: id, error: err.message });
    }
  }

  _upsertSync(id, fields) {
    const keys = Object.keys(fields);
    const cols = keys.join(", ");
    const marks = keys.map(() => "?").join(", ");
    const sets = keys.map((k) => `${k} = excluded.${k}`).join(", ");
    this.db
      .prepare(
        `INSERT INTO publish_sync (tournament_id, ${cols}) VALUES (?, ${marks})
         ON CONFLICT (tournament_id) DO UPDATE SET ${sets}`,
      )
      .run(id, ...keys.map((k) => fields[k]));
  }

  _clearError(id) {
    const m = this._memFor(id);
    m.failures = 0;
    m.blocked = null;
    this._upsertSync(id, { last_error: null, last_error_kind: null });
  }

  async _token() {
    const token = await this.getAuthToken();
    if (!token) {
      throw new SyncError("auth", "Sign in to publish this tournament.");
    }
    return token;
  }

  async _http(url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetch(url, { ...options, signal: ctrl.signal });
    } catch (err) {
      throw new SyncError(
        "network",
        err?.name === "AbortError"
          ? "The server took too long to answer."
          : "Couldn't reach the server. Changes will upload when you're back online.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async _failFromResponse(res, what, bytes) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 413) {
      const size = bytes ? ` (${(bytes / 1e6).toFixed(1)} MB)` : "";
      throw new SyncError(
        "server",
        `This tournament is too large${size} for the website to accept — the server's upload size limit was exceeded.`,
      );
    }
    const msg = body.error || `${what} failed (HTTP ${res.status}).`;
    if (res.status === 401)
      throw new SyncError("auth", "Session expired — sign in again.");
    if (res.status === 402 || res.status === 403)
      throw new SyncError("subscription", msg);
    throw new SyncError("server", msg);
  }

  async _syncOne(id) {
    const m = this._memFor(id);
    const row = this.db
      .prepare(`SELECT data FROM tournaments WHERE id = ?`)
      .get(id);
    if (!row) return; // not saved locally (yet)
    const hash = sha256(row.data);
    m.localHash = hash;

    const sy =
      this.db
        .prepare(`SELECT * FROM publish_sync WHERE tournament_id = ?`)
        .get(id) || {};
    const now = Date.now();
    if (now < m.nextAttemptAt) return; // backing off after a failure

    const upToDate = sy.pushed_hash === hash;
    const verified = sy.verified_hash === hash;
    const verifiedFresh =
      verified &&
      sy.verified_at &&
      now - Date.parse(sy.verified_at) < this.reverifyMs;
    if (upToDate && verifiedFresh) return; // nothing to do

    const token = await this._token();
    if (!this.isEntitled()) {
      throw new SyncError(
        "subscription",
        "Publishing requires an active subscription.",
      );
    }
    m.blocked = null;

    if (!upToDate) {
      this._upsertSync(id, { last_attempt_at: nowIso() });
      const res = await this._http(
        `${this.apiBaseUrl}/api/publish/tournaments/${id}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data: row.data }),
        },
      );
      if (!res.ok) await this._failFromResponse(res, "Upload", row.data.length);
      const body = await res.json().catch(() => ({}));
      if (body.receivedHash && body.receivedHash !== hash) {
        throw new SyncError(
          "verify",
          "The server received different data than was sent. Retrying.",
        );
      }
      // An up-to-date server answers with the results token and a hash of
      // what it received. An older one answers with just the id: fall back to
      // the token the tournament itself carries, and say so if there is none.
      const localToken = JSON.parse(row.data).publicViewToken || null;
      const token_ =
        body.publicViewToken || localToken || sy.public_token || null;
      this._upsertSync(id, {
        pushed_hash: hash,
        pushed_at: nowIso(),
        public_token: token_,
        verified_hash: null,
      });
      sy.public_token = token_;
      this.onEvent("uploaded", { tournamentId: id });
    }

    await this._verify(id, row.data, sy.public_token);
  }

  // Reads the public results page like a spectator would.
  async _verify(id, data, publicToken) {
    if (!publicToken) {
      throw new SyncError(
        "server",
        "Uploaded, but the website is running an older version and can't confirm it. Deploy the latest server update to the website.",
      );
    }
    const res = await this._http(
      `${
        this.apiBaseUrl
      }/api/tournaments/public-view/${publicToken}?_=${Date.now()}`,
      { headers: { "cache-control": "no-store" } },
    );
    if (res.status === 403) {
      // "Results aren't public right now": the organizer switched the
      // Pairings & Standings link off on purpose. The upload itself was
      // confirmed byte-for-byte, so that counts as verified.
      this._upsertSync(id, {
        verified_hash: sha256(data),
        verified_at: nowIso(),
      });
      this._clearError(id);
      this.onEvent("verified", { tournamentId: id, publicLinkOff: true });
      return;
    }
    if (!res.ok) {
      // The upload "succeeded" yet the public page can't see it. Force a
      // fresh upload next time rather than trusting the stale record.
      this._upsertSync(id, { pushed_hash: null, verified_hash: null });
      throw new SyncError(
        "verify",
        res.status === 404
          ? "Uploaded, but the public page can't find it yet. Retrying."
          : `Uploaded, but the public page returned HTTP ${res.status}. Retrying.`,
      );
    }
    const pub = await res.json().catch(() => null);
    const local = localSignature(JSON.parse(data));
    if (!pub || !signaturesMatch(local, publicSignature(pub))) {
      this._upsertSync(id, { pushed_hash: null, verified_hash: null });
      throw new SyncError(
        "verify",
        "The public page doesn't match this computer yet. Retrying.",
      );
    }
    const hash = sha256(data);
    this._upsertSync(id, { verified_hash: hash, verified_at: nowIso() });
    this._clearError(id);
    this.onEvent("verified", { tournamentId: id });
  }

  async _unpublishOne(id) {
    const m = this._memFor(id);
    if (Date.now() < m.nextAttemptAt) return;
    const token = await this._token();
    const res = await this._http(
      `${this.apiBaseUrl}/api/publish/tournaments/${id}/unpublish`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } },
    );
    // 404 = the server never had it, which is exactly the state we want.
    if (!res.ok && res.status !== 404)
      await this._failFromResponse(res, "Unpublishing");
    this._upsertSync(id, {
      unpublish_pending: 0,
      pushed_hash: null,
      verified_hash: null,
      last_error: null,
      last_error_kind: null,
    });
    m.failures = 0;
    m.blocked = null;
    this.onEvent("unpublished", { tournamentId: id });
  }
}

module.exports = {
  PublishSync,
  SyncError,
  localSignature,
  publicSignature,
  signaturesMatch,
};
