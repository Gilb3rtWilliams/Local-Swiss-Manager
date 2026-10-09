import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { api } from "../../api.js";
import PairingsIndividual from "../../components/PairingsIndividual.jsx";
import PairingsTeam from "../../components/PairingsTeam.jsx";
import MiniMatchPanel from "../../components/MiniMatchPanel.jsx";

// Results already saved on the server for the open round, in the same shape
// this page keeps them locally: { [pairIdx]: result } for individual events,
// { "pairIdx-boardNum": result } for team events.
function resultsFromPairings(pairings, isTeam) {
  const out = {};
  (pairings || []).forEach((p) => {
    if (isTeam) {
      if (p.type !== "match") return;
      p.boards.forEach((b) => {
        if (!b.sitOut && b.result) out[`${p.idx}-${b.boardNum}`] = b.result;
      });
    } else if (p.type === "individual" && p.result) {
      out[p.idx] = p.result;
    }
  });
  return out;
}

// Unsaved edits are kept as a per-round overlay on top of what's saved on the
// server: { [key]: result } where a null result means "cleared locally". Only
// keys that differ from the saved value are ever kept in the overlay, so its
// size is exactly the number of unsaved changes.
function applyDraft(saved, draft) {
  const out = { ...saved };
  Object.entries(draft || {}).forEach(([k, v]) => {
    if (v === null) delete out[k];
    else out[k] = v;
  });
  return out;
}

// Played / total games in one round's pairings, given its results map.
function countGames(pairings, isTeam, results) {
  let total = 0;
  let played = 0;
  (pairings || []).forEach((p) => {
    if (isTeam) {
      if (p.type !== "match") return;
      p.boards.forEach((b) => {
        if (b.sitOut) return;
        total += 1;
        if (results[`${p.idx}-${b.boardNum}`]) played += 1;
      });
    } else if (p.type === "individual") {
      total += 1;
      if (results[p.idx]) played += 1;
    }
  });
  return { played, total };
}

export default function Pairings() {
  const { t, refresh, setTournament } = useOutletContext();
  const navigate = useNavigate();
  const isTeam = t.format === "team";
  const isBughouse = t.variant === "bughouse";
  const isMatchPlay = !!t.matchPlay;

  // Every round that can be worked on: the open round, then any that were
  // paired in advance (oldest first). Results can be entered in any of them;
  // only the open round can be submitted, and nothing touches the standings
  // until it is.
  const queuedRounds = t.queuedRounds || [];
  const openRounds = t.currentPairings
    ? [
        { round: t.currentRound, pairings: t.currentPairings, queued: false },
        ...queuedRounds.map((q) => ({
          round: q.round,
          pairings: q.pairings,
          queued: true,
        })),
      ]
    : [];
  const [selectedRound, setSelectedRound] = useState(t.currentRound);
  const view =
    openRounds.find((r) => r.round === selectedRound) || openRounds[0] || null;
  const viewRound = view ? view.round : t.currentRound;
  const viewPairings = view ? view.pairings : null;
  const isQueuedView = Boolean(view && view.queued);

  // Unsaved edits per round, so switching rounds never loses (or mixes up)
  // anything that hasn't been saved yet.
  const [drafts, setDrafts] = useState({});
  const draft = drafts[viewRound] || {};
  const savedResults = resultsFromPairings(viewPairings, isTeam);
  const results = applyDraft(savedResults, draft);
  const dirtyKeys = isMatchPlay ? [] : Object.keys(draft);

  const DECISIVE_RESULTS = new Set(["1-0", "0-1", "1F-0F", "0F-1F"]);
  function boardsNeedingDecision(p) {
    const real = p.boards.filter((b) => !b.sitOut);
    if (!isBughouse) return real;
    const decisive = real.find((b) =>
      DECISIVE_RESULTS.has(results[`${p.idx}-${b.boardNum}`]),
    );
    return decisive ? [decisive] : real;
  }

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const [error, setError] = useState("");
  // { pairIndex, boardNum? } — identifier only, not a snapshot, so the
  // mini-match shown always reflects the latest data after refresh()
  // rather than going stale the moment something changes inside it.
  const [activeMiniMatch, setActiveMiniMatch] = useState(null);

  const [lateOpen, setLateOpen] = useState(false);
  const [lateName, setLateName] = useState("");
  const [lateRating, setLateRating] = useState("");
  const [lateTeam, setLateTeam] = useState("");
  const [lateError, setLateError] = useState("");

  // A different tournament: nothing carries over.
  useEffect(() => {
    setDrafts({});
    setSelectedRound(t.currentRound);
    setSavedNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);

  // The set of open rounds changed (the open round was submitted and a queued
  // one promoted, or queued rounds were added/discarded): drop edits for
  // rounds that no longer exist and fall back to the open round if the one
  // being viewed is gone. Edits for a round that was just promoted are kept —
  // it's the same round, just open now.
  const roundKey = `${t.id}:${t.currentRound}:${t.currentPairings ? 1 : 0}:${
    queuedRounds.length
  }`;
  useEffect(() => {
    const lastRound = t.currentPairings
      ? t.currentRound + queuedRounds.length
      : -1;
    const alive = (r) => Number(r) >= t.currentRound && Number(r) <= lastRound;
    setDrafts((all) =>
      Object.fromEntries(Object.entries(all).filter(([r]) => alive(r))),
    );
    setSelectedRound((r) => (alive(r) ? r : t.currentRound));
    setSavedNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  // Don't let a refresh/close silently throw away entries that were never
  // saved — in ANY round, not just the one on screen.
  const hasUnsaved =
    !isMatchPlay &&
    Object.values(drafts).some((d) => Object.keys(d).length > 0);
  useEffect(() => {
    if (!hasUnsaved) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  if (!t.currentPairings) {
    return (
      <div
        style={{
          background: "var(--tp-bg, #13131a)",
          border: "1px solid var(--tp-border, #252532)",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "var(--tp-muted, #8a8a9a)",
          fontFamily: "Georgia, 'Times New Roman', Times, serif",
          fontSize: 14,
        }}
      >
        <p style={{ margin: "0 0 16px 0" }}>No round is currently open.</p>
        <button
          type="button"
          onClick={() => navigate(`/tournament/${t.id}/overview`)}
          style={{
            background: "var(--tp-border, #252532)",
            border: "1px solid var(--tp-border-strong, #353545)",
            color: "var(--tp-text, #e8e8e8)",
            fontSize: 11,
            fontFamily: "Georgia, 'Times New Roman', Times, serif",
            fontWeight: 600,
            letterSpacing: "0.05em",
            padding: "10px 18px",
            borderRadius: 8,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          Go generate the next round →
        </button>
      </div>
    );
  }

  // Picking the result that's already selected clears it — the way to take
  // back a mis-click without a separate "clear" control. null (not delete) so
  // the clear is visible as a difference from what's saved, and gets sent.
  // Records an edit for the round on screen. If it lands back on what's
  // already saved there's nothing to save, so the edit is dropped from the
  // overlay rather than kept as a no-op.
  function setDraftEntry(key, next) {
    setDrafts((all) => {
      const cur = { ...(all[viewRound] || {}) };
      if ((savedResults[key] ?? null) === next) delete cur[key];
      else cur[key] = next;
      return { ...all, [viewRound]: cur };
    });
    setSavedNote("");
  }
  function setIndividualResult(pairIdx, result) {
    setDraftEntry(String(pairIdx), results[pairIdx] === result ? null : result);
  }
  function setBoardResult(pairIdx, boardNum, result) {
    const key = `${pairIdx}-${boardNum}`;
    setDraftEntry(key, results[key] === result ? null : result);
  }

  function toEntry(key, result) {
    if (isTeam) {
      const [pairIndex, boardNum] = key.split("-").map(Number);
      return { pairIndex, boardNum, result };
    }
    return { pairIndex: Number(key), result };
  }
  const unsavedEntries = () => dirtyKeys.map((k) => toEntry(k, draft[k]));

  // Once a save lands, the server's copy is the truth for that round: take
  // the response straight into the shared tournament (same pattern as the
  // Overview page's actions) and drop that round's overlay. Falls back to a
  // refetch if the layout doesn't expose setTournament.
  async function applySaved(round, updated) {
    if (setTournament && updated) setTournament(updated);
    else await refresh();
    setDrafts((all) => {
      const next = { ...all };
      delete next[round];
      return next;
    });
  }

  // Derived fresh from t on every render (not a snapshot captured at open
  // time) so the panel reflects the latest state right after refresh().
  const activePairing = activeMiniMatch
    ? t.currentPairings[activeMiniMatch.pairIndex]
    : null;
  const activeMM = activePairing
    ? activeMiniMatch.boardNum !== undefined
      ? activePairing.boards?.find(
          (b) => b.boardNum === activeMiniMatch.boardNum,
        )?.miniMatch
      : activePairing.miniMatch
    : null;

  const activeGames = viewPairings.filter((p) => p.type !== "bye");
  // For Match Play, a pairing/board's result is set incrementally by its
  // mini-match resolving (via MiniMatchPanel), not by a pick made on this
  // page — so "decided" means pairing.result/board.result is already set on
  // the server, not that this page's local `results` state has an entry.
  const totalDecisions = isTeam
    ? activeGames.reduce((sum, p) => sum + boardsNeedingDecision(p).length, 0)
    : activeGames.length;
  const decidedCount = isTeam
    ? activeGames.reduce(
        (sum, p) =>
          sum +
          boardsNeedingDecision(p).filter((b) =>
            isMatchPlay ? b.result : results[`${p.idx}-${b.boardNum}`],
          ).length,
        0,
      )
    : activeGames.filter((p) => (isMatchPlay ? p.result : results[p.idx]))
        .length;
  const allSet = totalDecisions === decidedCount;

  async function handleSubmitResults() {
    setBusy(true);
    setError("");
    try {
      // Match Play: every active pairing/board already has its result set
      // by its mini-match resolving — this call's only job left is closing
      // the round now that everything's decided, same as
      // tournamentService.js's submitResults() already expects (it reads
      // pairing.result/board.result directly, not this payload, once
      // they're already populated).
      // Save anything still unsaved first. Submitting only ever ADDS results,
      // so a result that was cleared locally would otherwise still be sitting
      // on the server and get counted.
      // (Submit is only offered for the open round, so viewRound is it.)
      if (dirtyKeys.length > 0) {
        await api.saveResults(t.id, unsavedEntries(), t.currentRound);
      }
      const payload = isMatchPlay
        ? []
        : Object.entries(results)
            .filter(([, result]) => result)
            .map(([key, result]) => toEntry(key, result));
      await api.submitResults(t.id, payload);
      // Drop only the submitted round's edits — a queued round that was
      // promoted keeps whatever the organizer had typed into it.
      setDrafts((all) => {
        const next = { ...all };
        delete next[t.currentRound];
        return next;
      });
      refresh();
      navigate(`/tournament/${t.id}/standings`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProgress() {
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const entries = unsavedEntries();
      const round = viewRound;
      const updated = await api.saveResults(t.id, entries, round);
      await applySaved(round, updated);
      setSavedNote(
        `Saved ${entries.length} change${entries.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLate(e) {
    e.preventDefault();
    setLateError("");
    if (!lateName.trim()) {
      setLateError("Enter a name.");
      return;
    }
    if (isTeam && !lateTeam) {
      setLateError("Choose a team.");
      return;
    }
    try {
      await api.addLatePlayer(t.id, {
        name: lateName,
        rating: lateRating,
        teamId: isTeam ? lateTeam : undefined,
      });
      setLateName("");
      setLateRating("");
      refresh();
    } catch (err) {
      setLateError(err.message);
    }
  }

  const inputStyle = {
    background: "var(--tp-surface, #1a1a24)",
    border: "1px solid var(--tp-border-strong, #353545)",
    color: "var(--tp-text, #e8e8e8)",
    padding: "10px 12px",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const btnStyle = (disabled) => ({
    background: disabled
      ? "var(--tp-surface, #1a1a24)"
      : "var(--tp-border, #252532)",
    border: `1px solid ${
      disabled
        ? "var(--tp-border, #252532)"
        : "var(--tp-border-strong, #353545)"
    }`,
    color: disabled ? "var(--tp-dim, #6b6b7b)" : "var(--tp-text, #e8e8e8)",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    padding: "10px 18px",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    textTransform: "uppercase",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
        color: "var(--tp-text, #e8e8e8)",
        background:
          "radial-gradient(circle at 50% 0%, var(--tp-surface-2, #1f1f2e) 0%, transparent 70%)",
        padding: "8px 0",
        borderRadius: "16px",
      }}
    >
      <div
        style={{
          background: "var(--tp-bg, #13131a)",
          border: "1px solid var(--tp-border, #252532)",
          borderRadius: 12,
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 24,
            borderBottom: "1px solid var(--tp-border, #252532)",
            paddingBottom: 12,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--tp-text, #e8e8e8)",
              margin: 0,
            }}
          >
            Round {viewRound} Pairings
          </h2>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 8px",
              borderRadius: 4,
              background: "var(--tp-border, #252532)",
              color: "var(--tp-brass, #d4a853)",
              border: "1px solid var(--tp-border-strong, #353545)",
            }}
          >
            {isQueuedView ? "Queued · " : ""}Round {viewRound} / {t.totalRounds}
          </span>
        </div>

        {/* Round switcher — only when rounds were paired in advance. Each tab
            shows how many of that round's games have a result (saved or
            typed), and a dot if that round has unsaved edits. */}
        {openRounds.length > 1 && (
          <div
            role="tablist"
            aria-label="Rounds"
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
            {openRounds.map((r) => {
              const rDraft = drafts[r.round] || {};
              const { played, total } = countGames(
                r.pairings,
                isTeam,
                applyDraft(resultsFromPairings(r.pairings, isTeam), rDraft),
              );
              const active = r.round === viewRound;
              const hasDraft = !isMatchPlay && Object.keys(rDraft).length > 0;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  key={r.round}
                  onClick={() => {
                    setSelectedRound(r.round);
                    setSavedNote("");
                  }}
                  style={{
                    background: active
                      ? "var(--tp-border-strong, #353545)"
                      : "transparent",
                    border: `1px solid ${
                      active
                        ? "var(--tp-brass, #d4a853)"
                        : "var(--tp-border-strong, #353545)"
                    }`,
                    color: active
                      ? "var(--tp-heading, #ffffff)"
                      : "var(--tp-muted, #8a8a9a)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    padding: "8px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    fontFamily: "inherit",
                  }}
                >
                  Round {r.round}
                  <span
                    style={{
                      marginLeft: 8,
                      fontWeight: 500,
                      letterSpacing: 0,
                      color: "var(--tp-dim, #6b6b7b)",
                    }}
                  >
                    {r.queued ? "queued" : "open"} · {played}/{total}
                  </span>
                  {hasDraft && (
                    <span
                      title="Unsaved changes"
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--tp-brass, #d4a853)",
                        marginLeft: 8,
                        verticalAlign: "middle",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {isQueuedView && (
          <div
            style={{
              background: "rgba(var(--tp-accent-rgb, 212, 168, 83), 0.08)",
              border: "1px solid rgba(var(--tp-accent-rgb, 212, 168, 83), 0.3)",
              color: "var(--tp-brass, #d4a853)",
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Round {viewRound} hasn't started yet.{" "}
            {isMatchPlay
              ? "Its games can be played once it opens, after Round " +
                t.currentRound +
                " is submitted."
              : `Results you enter here are saved with the round but don't change the standings — they count once Round ${t.currentRound} is submitted and this round opens.`}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "rgba(255, 107, 107, 0.1)",
              border: "1px solid rgba(255, 107, 107, 0.3)",
              color: "var(--tp-danger, #ff6b6b)",
              padding: "12px 16px",
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {isTeam ? (
          <PairingsTeam
            pairings={viewPairings}
            results={results}
            onSetBoardResult={setBoardResult}
            onOpenMiniMatch={(pairIndex, boardNum) =>
              setActiveMiniMatch({ pairIndex, boardNum })
            }
            isBughouse={isBughouse}
            miniMatchLocked={isQueuedView}
          />
        ) : (
          <PairingsIndividual
            pairings={viewPairings}
            results={results}
            onSetResult={setIndividualResult}
            onOpenMiniMatch={(pairIndex) =>
              setActiveMiniMatch({ pairIndex, boardNum: undefined })
            }
            miniMatchLocked={isQueuedView}
          />
        )}

        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          {!isMatchPlay && (
            <button
              type="button"
              disabled={dirtyKeys.length === 0 || busy || saving}
              onClick={handleSaveProgress}
              style={
                dirtyKeys.length > 0 && !busy && !saving
                  ? {
                      ...btnStyle(false),
                      border: "1px solid var(--tp-brass, #d4a853)",
                      color: "var(--tp-brass, #d4a853)",
                    }
                  : btnStyle(true)
              }
            >
              {saving
                ? "SAVING…"
                : dirtyKeys.length > 0
                ? `SAVE PROGRESS (${dirtyKeys.length})`
                : "PROGRESS SAVED"}
            </button>
          )}
          {/* Only the open round can be closed — a queued round has to wait
              its turn, because closing is what scores it. */}
          {!isQueuedView && (
            <button
              type="button"
              disabled={!allSet || busy || saving}
              onClick={handleSubmitResults}
              style={btnStyle(!allSet || busy || saving)}
            >
              {busy
                ? "SUBMITTING…"
                : t.currentRound === t.totalRounds
                ? "FINISH TOURNAMENT"
                : "SUBMIT & PAIR NEXT ROUND"}
            </button>
          )}
          <span
            style={{ fontSize: 11, color: "var(--tp-muted, #8a8a9a)" }}
            aria-live="polite"
          >
            {decidedCount} of {totalDecisions} results entered
            {dirtyKeys.length > 0 ? ` · ${dirtyKeys.length} unsaved` : ""}
            {savedNote && dirtyKeys.length === 0 ? ` · ${savedNote}` : ""}
          </span>
        </div>
      </div>

      {t.currentRound <= 1 &&
        t.status !== "finished" &&
        queuedRounds.length === 0 && (
          <div
            style={{
              background: "var(--tp-bg, #13131a)",
              border: "1px solid var(--tp-border, #252532)",
              borderRadius: 12,
              padding: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                marginBottom: lateOpen ? 20 : 0,
                borderBottom: lateOpen
                  ? "1px solid var(--tp-border, #252532)"
                  : "none",
                paddingBottom: lateOpen ? 12 : 0,
              }}
              onClick={() => setLateOpen((o) => !o)}
            >
              <h2
                style={{
                  color: "var(--tp-muted, #8a8a9a)",
                  fontSize: 14,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: 0,
                }}
              >
                Late Registration
              </h2>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLateOpen((o) => !o);
                }}
                style={{
                  background: "var(--tp-border, #252532)",
                  border: "1px solid var(--tp-border-strong, #353545)",
                  color: "var(--tp-text, #e8e8e8)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  padding: "6px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                }}
              >
                {lateOpen ? "− Late Registration" : "+ Late Registration"}
              </button>
            </div>
            {lateOpen && (
              <form onSubmit={handleAddLate}>
                <p
                  style={{
                    color: "var(--tp-muted, #8a8a9a)",
                    fontSize: 12,
                    lineHeight: 1.5,
                    marginTop: 0,
                    marginBottom: 16,
                  }}
                >
                  Add a competitor who missed the start. They receive a BYE (+1)
                  if Round 1 is already open, and join from the next round
                  onward.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <input
                    type="text"
                    placeholder="Player name"
                    value={lateName}
                    onChange={(e) => setLateName(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    placeholder="Rating"
                    min="0"
                    max="3500"
                    value={lateRating}
                    onChange={(e) => setLateRating(e.target.value)}
                    style={inputStyle}
                  />
                  {isTeam && (
                    <select
                      value={lateTeam}
                      onChange={(e) => setLateTeam(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Choose team…</option>
                      {t.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    type="submit"
                    style={{
                      background: "var(--tp-border, #252532)",
                      border: "1px solid var(--tp-border-strong, #353545)",
                      color: "var(--tp-text, #e8e8e8)",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      padding: "10px 18px",
                      borderRadius: 8,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      fontFamily: "inherit",
                    }}
                  >
                    Add Late Joiner
                  </button>
                  {lateError && (
                    <span
                      style={{
                        color: "var(--tp-danger, #ff6b6b)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {lateError}
                    </span>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

      {activeMiniMatch && (
        <MiniMatchPanel
          tournamentId={t.id}
          target={{
            pairIndex: activeMiniMatch.pairIndex,
            boardNum: activeMiniMatch.boardNum,
          }}
          miniMatch={activeMM}
          onChanged={refresh}
          onClose={() => setActiveMiniMatch(null)}
        />
      )}
    </div>
  );
}
