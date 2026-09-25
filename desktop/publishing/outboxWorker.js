// publishing/outboxWorker.js
// ─────────────────────────────────────────────────────────────────────────
// Drains the outbox table to the publish API. Survives app restarts (it
// only ever reads/writes SQLite state, never keeps anything important in
// memory), survives being offline (unsent rows just accumulate; nothing is
// lost, nothing double-applies thanks to client_event_id), and pushes
// promptly rather than on a slow poll -- call kick() right after enqueueing
// something so a move shows up for viewers within about a second, not
// whenever the next poll happens to land.
//
// AUTH: getAuthToken() should return whatever proves this device belongs to
// a logged-in, paying user -- most likely a bearer token issued at login,
// since a desktop app has no browser session cookie. Wire it to your real
// auth; sent as `Authorization: Bearer <token>`. If it returns null (not
// logged in / no cached credential), the worker simply skips its cycle --
// it does not block local tournament use.

const MAX_EVENTS_PER_BATCH = 200; // must be <= the server's MAX_EVENTS_PER_BATCH
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const IDLE_DELAY_MS = 5000; // nothing to do -> check back this often

class OutboxWorker {
  constructor(db, { apiBaseUrl, getAuthToken, fetchImpl = fetch, onEvent }) {
    this.db = db;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
    this.getAuthToken = getAuthToken;
    this.fetch = fetchImpl;
    this.onEvent = onEvent || (() => {}); // (name, detail) => void, for logging/UI
    this._timer = null;
    this._running = false;
    this._stopped = true;
    this._delay = BASE_DELAY_MS;
  }

  start() {
    if (!this._stopped) return;
    this._stopped = false;
    this._scheduleNow();
  }

  stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  }

  // Call after enqueueing something so it goes out promptly instead of
  // waiting for the idle poll interval.
  kick() {
    if (this._stopped) return;
    this._scheduleNow();
  }

  _scheduleNow() {
    if (this._timer) clearTimeout(this._timer);
    if (this._running) return; // already mid-cycle; it'll pick up new work itself
    this._timer = setTimeout(() => this._runCycle(), 0);
  }

  _scheduleAfter(ms) {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._runCycle(), ms);
  }

  async _authHeaders() {
    const token = await this.getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  }

  async _runCycle() {
    if (this._stopped || this._running) return;
    this._running = true;
    let hadFailure = false;
    let hadWork = false;

    try {
      const headers = await this._authHeaders();
      if (!headers) {
        this.onEvent("skipped_no_auth", {});
      } else {
        // 1. Register any publishing tournament that hasn't been registered yet.
        for (const t of this._unregisteredTournaments()) {
          hadWork = true;
          const registered = await this._registerTournament(t, headers);
          if (!registered) hadFailure = true;
        }

        // 2. Push a batch for every publishing, registered tournament that
        // has pending events. Iterates tournaments so a slow/stuck one
        // can't starve the others.
        for (const t of this._registeredTournaments()) {
          const pending = this._nextBatch(t.tournament_id);
          if (!pending.length) continue;
          hadWork = true;
          const ok = await this._pushBatch(t, pending, headers);
          if (!ok) hadFailure = true;
        }
      }
    } catch (err) {
      hadFailure = true;
      this.onEvent("cycle_error", { error: err.message });
    } finally {
      this._running = false;
    }

    if (this._stopped) return;
    if (hadFailure) {
      this._delay = Math.min(this._delay * 2, MAX_DELAY_MS);
      this._scheduleAfter(this._delay + Math.floor(Math.random() * 250));
    } else {
      this._delay = BASE_DELAY_MS; // reset backoff after any clean cycle
      // Work just happened -> check again quickly in case more is queued
      // (e.g. a big batch capped at MAX_EVENTS_PER_BATCH). Otherwise idle.
      this._scheduleAfter(hadWork ? 250 : IDLE_DELAY_MS);
    }
  }

  _unregisteredTournaments() {
    const rows = this.db
      .prepare(
        `SELECT ps.tournament_id, t.data
         FROM publish_state ps JOIN tournaments t ON t.id = ps.tournament_id
         WHERE ps.server_tournament_id IS NULL`,
      )
      .all();

    return rows.map((row) => {
      const tournament = JSON.parse(row.data);
      return {
        tournament_id: row.tournament_id,
        name: tournament.name,
        format: tournament.format,
      };
    });
  }
  _registeredTournaments() {
    return this.db
      .prepare(
        `SELECT ps.tournament_id, ps.server_tournament_id
         FROM publish_state ps
         WHERE ps.server_tournament_id IS NOT NULL`,
      )
      .all();
  }

  _nextBatch(tournamentId) {
    return this.db
      .prepare(
        `SELECT id, client_event_id, type, payload, occurred_at
         FROM outbox
         WHERE tournament_id = ? AND status = 'pending'
         ORDER BY id
         LIMIT ?`,
      )
      .all(tournamentId, MAX_EVENTS_PER_BATCH);
  }

  async _registerTournament(t, headers) {
    try {
      const res = await this.fetch(
        `${this.apiBaseUrl}/api/publish/tournaments`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({
            localTournamentId: t.tournament_id,
            name: t.name,
            format: t.format,
          }),
        },
      );
      if (!res.ok) {
        this.onEvent("register_failed", {
          tournamentId: t.tournament_id,
          status: res.status,
        });
        return false;
      }
      const body = await res.json();
      this.db
        .prepare(
          `UPDATE publish_state SET server_tournament_id = ? WHERE tournament_id = ?`,
        )
        .run(body.tournamentId, t.tournament_id);
      this.onEvent("registered", {
        tournamentId: t.tournament_id,
        serverTournamentId: body.tournamentId,
      });
      return true;
    } catch (err) {
      this.onEvent("register_error", {
        tournamentId: t.tournament_id,
        error: err.message,
      });
      return false;
    }
  }

  async _pushBatch(t, rows, headers) {
    const events = rows.map((r) => ({
      clientEventId: r.client_event_id,
      type: r.type,
      payload: JSON.parse(r.payload),
      occurredAt: r.occurred_at,
    }));
    const markAttempt = (ids, error) => {
      const stmt = this.db.prepare(
        `UPDATE outbox SET attempts = attempts + 1, last_attempt_at = ?, last_error = ?
         WHERE id = ?`,
      );
      const now = new Date().toISOString();
      const tx = this.db.transaction((idList) => {
        for (const id of idList) stmt.run(now, error ?? null, id);
      });
      tx(ids);
    };

    try {
      const res = await this.fetch(
        `${this.apiBaseUrl}/api/publish/tournaments/${t.server_tournament_id}/events`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ events }),
        },
      );
      if (!res.ok) {
        markAttempt(
          rows.map((r) => r.id),
          `HTTP ${res.status}`,
        );
        this.onEvent("push_failed", {
          tournamentId: t.tournament_id,
          status: res.status,
        });
        return false;
      }
      const body = await res.json();
      const acked = new Set(body.acknowledgedIds || []);
      const ackedRowIds = rows
        .filter((r) => acked.has(r.client_event_id))
        .map((r) => r.id);
      const unackedRowIds = rows
        .filter((r) => !acked.has(r.client_event_id))
        .map((r) => r.id);

      const markSent = this.db.prepare(
        `UPDATE outbox SET status = 'sent', attempts = attempts + 1, last_attempt_at = ?, last_error = NULL WHERE id = ?`,
      );
      const now = new Date().toISOString();
      const tx = this.db.transaction((ids) => {
        for (const id of ids) markSent.run(now, id);
      });
      tx(ackedRowIds);
      if (unackedRowIds.length)
        markAttempt(unackedRowIds, "not acknowledged by server");

      this.onEvent("pushed", {
        tournamentId: t.tournament_id,
        count: ackedRowIds.length,
      });
      return unackedRowIds.length === 0;
    } catch (err) {
      markAttempt(
        rows.map((r) => r.id),
        err.message,
      );
      this.onEvent("push_error", {
        tournamentId: t.tournament_id,
        error: err.message,
      });
      return false;
    }
  }
}

module.exports = { OutboxWorker };
