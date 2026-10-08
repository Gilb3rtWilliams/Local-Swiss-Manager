import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import RoundHistory from "../../components/RoundHistory.jsx";
import MiniMatchPanel from "../../components/MiniMatchPanel.jsx";

// Import the 'api' object directly (adjust relative path if needed)
import { api } from "../../api";

export default function RoundHistoryPage() {
  const { t, refresh: refreshTournament } = useOutletContext();
  const isMatchPlay = !!t?.matchPlay;
  const [historyRound, setHistoryRound] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // { pairIndex, boardNum? } into the currently selected historical round —
  // reset whenever the round tab changes, since these indices are only
  // meaningful within whichever round they were opened from.
  const [activeMiniMatch, setActiveMiniMatch] = useState(null);

  useEffect(() => {
    if (!t?.rounds || t.rounds.length === 0) {
      setHistoryRound(null);
      return;
    }
    setHistoryRound((prev) =>
      prev && t.rounds.some((r) => r.round === prev)
        ? prev
        : t.rounds[t.rounds.length - 1].round,
    );
  }, [t?.rounds]);

  if (!t?.rounds || t.rounds.length === 0) {
    return (
      <div
        style={{
          background: "var(--tp-bg, #13131a)",
          border: "1px solid var(--tp-border, #252532)",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: "var(--tp-muted, #8a8a9a)",
          fontFamily: "var(--tp-font-ui, Georgia, 'Times New Roman', serif)",
          fontSize: 14,
        }}
      >
        <p style={{ margin: 0 }}>
          No rounds completed yet — results will appear here once Round 1 is
          submitted.
        </p>
      </div>
    );
  }

  const selectedRoundData = t.rounds.find((r) => r.round === historyRound);
  const isLatestCompletedRound =
    historyRound === t.rounds[t.rounds.length - 1]?.round;

  const activePairing = activeMiniMatch
    ? selectedRoundData?.pairings[activeMiniMatch.pairIndex]
    : null;
  const activeMM = activePairing
    ? activeMiniMatch.boardNum !== undefined
      ? activePairing.boards?.find(
          (b) => b.boardNum === activeMiniMatch.boardNum,
        )?.miniMatch
      : activePairing.miniMatch
    : null;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  // Edit a game or team board result
  const handleResultChange = async (pairIndex, result, boardNum = null) => {
    try {
      setLoading(true);
      setError(null);

      const payload =
        t.format === "team"
          ? { pairIndex, boardNum, result }
          : { pairIndex, result };

      await api.editResult(t.id, historyRound, payload);
      await refreshTournament();
    } catch (err) {
      setError(err.message || "Failed to update result.");
    } finally {
      setLoading(false);
    }
  };

  // Delete the latest round
  const handleDeleteRound = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete Round ${historyRound}? This will undo round results and revert standings.`,
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await api.deleteRound(t.id, historyRound);
      await refreshTournament();
    } catch (err) {
      setError(err.message || "Failed to delete round.");
    } finally {
      setLoading(false);
    }
  };

  // Delete current round and generate new pairings immediately
  const handleDeleteAndRegenerate = async () => {
    if (
      !window.confirm(`Delete Round ${historyRound} and generate new pairings?`)
    ) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await api.deleteRound(t.id, historyRound);
      await api.generateNextRound(t.id);
      await refreshTournament();
    } catch (err) {
      setError(err.message || "Failed to regenerate pairings.");
    } finally {
      setLoading(false);
    }
  };

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
        {/* Header Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            borderBottom: "1px solid var(--tp-border, #252532)",
            paddingBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.08em",
                margin: 0,
                textTransform: "uppercase",
              }}
            >
              Round History
            </h2>

            {/* Round Selection Tabs */}
            <div style={{ display: "flex", gap: "6px" }}>
              {t.rounds.map((r) => (
                <button
                  key={r.round}
                  onClick={() => {
                    setHistoryRound(r.round);
                    setIsEditing(false);
                    setActiveMiniMatch(null);
                  }}
                  style={{
                    background:
                      historyRound === r.round
                        ? "var(--tp-border-strong, #3b3b54)"
                        : "var(--tp-surface, #1a1a24)",
                    color:
                      historyRound === r.round
                        ? "var(--tp-heading, #ffffff)"
                        : "var(--tp-muted, #8a8a9a)",
                    border: "1px solid var(--tp-border, #252532)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  R{r.round}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            {!isMatchPlay && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  background: isEditing
                    ? "#e5a93c"
                    : "var(--tp-border, #252532)",
                  color: isEditing
                    ? "var(--tp-bg, #13131a)"
                    : "var(--tp-text, #e8e8e8)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {isEditing ? "Done Editing" : "Edit Results"}
              </button>
            )}

            {isLatestCompletedRound && (
              <>
                <button
                  onClick={handleDeleteRound}
                  disabled={loading}
                  style={{
                    background:
                      "color-mix(in srgb, var(--tp-loss, #f44336) 14%, var(--tp-card-solid, #191924))",
                    color: "var(--tp-danger, #ff6b6b)",
                    border:
                      "1px solid color-mix(in srgb, var(--tp-loss, #f44336) 35%, var(--tp-card-solid, #191924))",
                    borderRadius: "6px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete Round
                </button>

                <button
                  onClick={handleDeleteAndRegenerate}
                  disabled={loading}
                  style={{
                    background:
                      "color-mix(in srgb, var(--tp-win, #4caf50) 16%, var(--tp-card-solid, #191924))",
                    color: "#4ade80",
                    border:
                      "1px solid color-mix(in srgb, var(--tp-win, #4caf50) 35%, var(--tp-card-solid, #191924))",
                    borderRadius: "6px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Delete & Regenerate
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: "16px",
              background:
                "color-mix(in srgb, var(--tp-loss, #f44336) 14%, var(--tp-card-solid, #191924))",
              border:
                "1px solid color-mix(in srgb, var(--tp-loss, #f44336) 35%, var(--tp-card-solid, #191924))",
              borderRadius: "6px",
              color: "var(--tp-danger, #ff8888)",
              fontSize: "12px",
            }}
          >
            {error}
          </div>
        )}

        {/* Round History Details & Interactive Pairing List */}
        {selectedRoundData && (
          <RoundHistory
            format={t.format}
            variant={t.variant}
            round={selectedRoundData}
            isEditing={isEditing}
            onResultChange={handleResultChange}
            loading={loading}
            matchPlay={isMatchPlay}
            onOpenMiniMatch={(pairIndex, boardNum) =>
              setActiveMiniMatch({ pairIndex, boardNum })
            }
          />
        )}
      </div>

      {activeMiniMatch && (
        <MiniMatchPanel
          tournamentId={t.id}
          target={{
            pairIndex: activeMiniMatch.pairIndex,
            boardNum: activeMiniMatch.boardNum,
          }}
          miniMatch={activeMM}
          readOnly
          onChanged={refreshTournament}
          onClose={() => setActiveMiniMatch(null)}
        />
      )}
    </div>
  );
}
