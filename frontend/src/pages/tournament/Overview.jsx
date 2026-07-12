import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/Overview.css";

const VARIANT_LABEL = {
  standard: "Standard team match",
  bughouse: "Bughouse",
  league: "League (Team A vs Team B)",
};
const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};

export default function Overview() {
  const { t, refresh } = useOutletContext();
  const navigate = useNavigate();
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState("");
  const [copied, setCopied] = useState(false);

  const [pubBusy, setPubBusy] = useState(false);
  const [pubError, setPubError] = useState("");
  const [pubCopied, setPubCopied] = useState(false);

  const registrationEligible =
    !isElimination &&
    t.system !== "round_robin" &&
    t.system !== "double_round_robin" &&
    t.currentRound <= 1;

  const registrationLink = t.registrationToken
    ? `${window.location.origin}/register/${t.registrationToken}`
    : null;

  async function handleToggleRegistration() {
    setRegBusy(true);
    setRegError("");
    try {
      if (t.registrationOpen) {
        await api.disableRegistration(t.id);
      } else {
        await api.enableRegistration(t.id);
      }
      refresh();
    } catch (e) {
      setRegError(e.message);
    } finally {
      setRegBusy(false);
    }
  }

  function handleCopyLink() {
    if (!registrationLink) return;
    navigator.clipboard.writeText(registrationLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  // Unlike registration, the results link has no eligibility window — it's
  // useful before, during, and after the event. Not offered yet for
  // elimination brackets (bracket sharing is a separate follow-up).
  const publicResultsLink = t.publicViewToken
    ? `${window.location.origin}/results/${t.publicViewToken}`
    : null;

  async function handleTogglePublicView() {
    setPubBusy(true);
    setPubError("");
    try {
      if (t.publicViewOpen) {
        await api.disablePublicView(t.id);
      } else {
        await api.enablePublicView(t.id);
      }
      refresh();
    } catch (e) {
      setPubError(e.message);
    } finally {
      setPubBusy(false);
    }
  }

  function handleCopyPublicLink() {
    if (!publicResultsLink) return;
    navigator.clipboard.writeText(publicResultsLink).then(() => {
      setPubCopied(true);
      setTimeout(() => setPubCopied(false), 1800);
    });
  }

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editFederation, setEditFederation] = useState("");
  const [editTimeControl, setEditTimeControl] = useState("");
  const [editVariant, setEditVariant] = useState("");
  const [editTotalRounds, setEditTotalRounds] = useState(1);
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  function openEdit() {
    setEditName(t.name);
    setEditFederation(t.federation || "");
    setEditTimeControl(t.timeControl || "");
    setEditVariant(t.variant || "standard");
    setEditTotalRounds(t.totalRounds);
    setEditError("");
    setEditOpen(true);
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditError("");
    if (!editName.trim()) {
      setEditError("Name is required.");
      return;
    }
    setEditBusy(true);
    try {
      const updates = {
        name: editName,
        federation: editFederation,
        timeControl: editTimeControl,
      };
      if (isTeam) updates.variant = editVariant;
      // Total rounds is fixed by the schedule for round-robin AND elimination
      // systems — only send it for Swiss, matching what the backend allows.
      if (
        t.status !== "finished" &&
        !isElimination &&
        t.system !== "round_robin" &&
        t.system !== "double_round_robin"
      ) {
        updates.totalRounds = Number(editTotalRounds);
      }
      await api.updateTournamentDetails(t.id, updates);
      setEditOpen(false);
      refresh();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function handleGenerateRound() {
    setBusy(true);
    setError("");
    try {
      await api.generateRound(t.id);
      refresh();
      navigate(`/tournament/${t.id}/pairings`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtend() {
    setBusy(true);
    setError("");
    try {
      await api.extendTournament(t.id);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ov-root">
      <div className="card">
        <div className="section-header">
          <h2>Tournament Details</h2>
          <button className="btn-secondary btn-sm" onClick={openEdit}>
            ✎ Edit Details
          </button>
        </div>

        <div className="info-bar">
          <div>
            {isTeam ? "Teams" : "Players"}:{" "}
            <span>{isTeam ? t.teams.length : t.players.length}</span>
          </div>
          <div>
            System: <span>{SYSTEM_LABEL[t.system] || t.system}</span>
          </div>
          {isElimination ? (
            <>
              {t.bracket && (
                <div>
                  Bracket size: <span>{t.bracket.size}</span>
                </div>
              )}
              {t.bracket?.champion && (
                <div>
                  Champion: <span>{t.bracket.champion.name}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                Total rounds: <span>{t.totalRounds}</span>
              </div>
              <div>
                Current round: <span>{t.currentRound}</span>
              </div>
            </>
          )}
          <div>
            Status: <span>{t.status}</span>
          </div>
          {isTeam && (
            <div>
              Variant: <span>{VARIANT_LABEL[t.variant] || t.variant}</span>
            </div>
          )}
        </div>

        {error && <div className="banner-error">{error}</div>}

        {editOpen && (
          <form onSubmit={handleSaveEdit} style={{ marginTop: 10 }}>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Federation / Club</span>
                <input
                  type="text"
                  value={editFederation}
                  onChange={(e) => setEditFederation(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Time Control</span>
                <input
                  type="text"
                  value={editTimeControl}
                  onChange={(e) => setEditTimeControl(e.target.value)}
                />
              </label>
              {isTeam && (
                <label className="field">
                  <span>Variant</span>
                  <select
                    value={editVariant}
                    onChange={(e) => setEditVariant(e.target.value)}
                  >
                    <option value="league">League (Team A vs Team B)</option>
                    <option value="bughouse">Bughouse</option>
                    <option value="standard">Standard team match</option>
                  </select>
                </label>
              )}
              {!isElimination &&
                t.system !== "round_robin" &&
                t.system !== "double_round_robin" && (
                  <label className="field">
                    <span>Total Rounds</span>
                    <input
                      type="number"
                      min={t.currentRound || 1}
                      value={editTotalRounds}
                      disabled={t.status === "finished"}
                      onChange={(e) => setEditTotalRounds(e.target.value)}
                    />
                    {t.status === "finished" && (
                      <span className="hint">
                        Finished — use "Add Extra Round" instead.
                      </span>
                    )}
                  </label>
                )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginTop: 14,
              }}
            >
              <button className="btn-primary" disabled={editBusy}>
                {editBusy ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              {editError && <span className="inline-error">{editError}</span>}
            </div>
          </form>
        )}
      </div>

      {registrationEligible && (
        <div className="card ov-registration-card">
          <div className="section-header">
            <h2>Registration Link</h2>
            <button
              className={
                t.registrationOpen
                  ? "btn-secondary btn-sm"
                  : "btn-primary btn-sm"
              }
              disabled={regBusy}
              onClick={handleToggleRegistration}
            >
              {regBusy
                ? "Working…"
                : t.registrationOpen
                  ? "Close Registration"
                  : "Enable Registration Link"}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 10 }}>
            {t.registrationOpen
              ? isTeam
                ? "Share this link so team captains can register their own team before Round 1."
                : "Share this link so players can add themselves before Round 1."
              : "Enable a link players can use to register themselves, instead of typing every entry in by hand. Only available before Round 1 starts."}
          </p>
          {t.registrationOpen && registrationLink && (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                readOnly
                value={registrationLink}
                onClick={(e) => e.target.select()}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  border: "1px solid #d9d2c0",
                  borderRadius: 6,
                  fontSize: "0.85rem",
                }}
              />
              <button className="btn-secondary btn-sm" onClick={handleCopyLink}>
                {copied ? "Copied ✓" : "Copy Link"}
              </button>
            </div>
          )}
          {regError && <div className="inline-error">{regError}</div>}
        </div>
      )}

      <div className="card ov-registration-card">
        <div className="section-header">
          <h2>Pairings &amp; Standings Link</h2>
          {!isElimination && (
            <button
              className={
                t.publicViewOpen ? "btn-secondary btn-sm" : "btn-primary btn-sm"
              }
              disabled={pubBusy}
              onClick={handleTogglePublicView}
            >
              {pubBusy
                ? "Working…"
                : t.publicViewOpen
                  ? "Turn Off Public Link"
                  : "Enable Public Link"}
            </button>
          )}
        </div>
        {isElimination ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Coming soon — a public link for following the bracket live isn't
            available yet.
          </p>
        ) : (
          <>
            <p className="muted" style={{ marginBottom: 10 }}>
              {t.publicViewOpen
                ? "Anyone with this link can browse pairings for every round and current standings — read-only, no sign-in needed."
                : "Turn this on to share a read-only link where players and spectators can check pairings and standings themselves, any time during the event."}
            </p>
            {t.publicViewOpen && publicResultsLink && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={publicResultsLink}
                  onClick={(e) => e.target.select()}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    border: "1px solid #d9d2c0",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                  }}
                />
                <button
                  className="btn-secondary btn-sm"
                  onClick={handleCopyPublicLink}
                >
                  {pubCopied ? "Copied ✓" : "Copy Link"}
                </button>
              </div>
            )}
            {pubError && <div className="inline-error">{pubError}</div>}
          </>
        )}
      </div>

      {isElimination ? (
        <div className="card">
          <h2>{t.bracket?.champion ? "🏆 Bracket Complete" : "Bracket"}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {t.bracket?.champion
              ? `Congratulations, ${t.bracket.champion.name}!`
              : t.system === "double_elimination"
                ? "The full winners and losers bracket was drawn when this tournament was created. Enter results match by match as they finish."
                : "The full bracket was drawn when this tournament was created. Enter results match by match as they finish."}
          </p>
          <button
            className="btn-primary"
            onClick={() => navigate(`/tournament/${t.id}/module`)}
          >
            View Bracket →
          </button>
        </div>
      ) : (
        <>
          {t.status === "finished" && (
            <div className="card finished-banner">
              <h2>🏆 Tournament Complete!</h2>
              <p>
                {t.winner
                  ? `Congratulations, ${t.winner}!`
                  : "Final standings are ready."}
              </p>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={handleExtend}
              >
                + Add Extra Round (e.g. playoff / tiebreak)
              </button>
            </div>
          )}

          {t.status !== "finished" && !t.currentPairings && (
            <div className="card">
              <h2>
                {t.currentRound === 0
                  ? "Ready to begin"
                  : `Round ${t.currentRound + 1}`}
              </h2>
              <p className="muted" style={{ marginBottom: 12 }}>
                {t.currentRound === 0
                  ? "Generate Round 1 pairings to start the tournament."
                  : "Generate pairings for the next round."}
              </p>
              <button
                className="btn-primary"
                disabled={busy}
                onClick={handleGenerateRound}
              >
                {busy
                  ? "Generating…"
                  : `Generate ${t.currentRound === 0 ? "Round 1" : `Round ${t.currentRound + 1}`} Pairings`}
              </button>
            </div>
          )}

          {t.currentPairings && (
            <div className="card">
              <p className="muted">
                Round {t.currentRound} is in progress — head to the{" "}
                <strong>Pairings</strong> tab to enter results.
              </p>
              <button
                className="btn-secondary btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => navigate(`/tournament/${t.id}/pairings`)}
              >
                Go to Pairings →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
