import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";
import MoveEntryBoard from "../../components/MoveEntryBoard.jsx";
import {
  BOARD_THEMES,
  DEFAULT_BOARD_THEME,
  PIECE_THEMES,
  DEFAULT_PIECE_THEME,
} from "../../components/chessThemes.js";
import "../../css/CageMatch.css";

// Same keys Chess960.jsx persists under — a board/piece theme picked on
// either page carries over to the other, rather than tracking two
// independent preferences for what's really one setting.
const THEME_STORAGE_KEY = "c960-board-theme";
const PIECE_THEME_STORAGE_KEY = "c960-piece-theme";

// Same list NewTournament.jsx offers when a player/competitor is created —
// kept in sync manually since the two pages don't currently share a
// constants module.
const CHESS_TITLES = ["", "GM", "IM", "FM", "CM", "WGM", "WIM", "WFM", "WCM"];

const RESULT_OPTIONS = [
  { value: "", label: "—" },
  { value: "1-0", label: "1–0 (White wins)" },
  { value: "0-1", label: "0–1 (Black wins)" },
  { value: "1/2-1/2", label: "½–½ (Draw)" },
  { value: "1F-0F", label: "1F–0F (Black forfeits)" },
  { value: "0F-1F", label: "0F–1F (White forfeits)" },
  { value: "0F-0F", label: "0F–0F (Double forfeit)" },
];

function resultLabel(result) {
  const opt = RESULT_OPTIONS.find((o) => o.value === result);
  return opt ? opt.label : result;
}

// Shared result dropdown used for section games, mini-match games, and the
// Armageddon result. Selecting a value only stages it locally — nothing is
// submitted until Submit is clicked, and the button is disabled until the
// pending selection actually differs from the persisted result. The blank
// placeholder option is always rendered (never filtered out), since hiding
// it while still controlling the <select> with an empty-string value was
// exactly what caused the previous silent-default-to-"1-0" bug: with no
// matching <option value=""> in the DOM, the browser fell back to
// displaying the first real option without that ever counting as a
// selection, so clicking that same option again fired no onChange at all.
function ResultPicker({ value, onSet, onClear = () => {}, disabled, busy }) {
  const [pending, setPending] = useState(value || "");

  // Stay in sync with the real persisted value — e.g. once a submit
  // resolves and refresh() brings the new result back, or if it changed
  // from elsewhere. A local, unsent edit only survives until then or until
  // Submit is clicked.
  useEffect(() => {
    setPending(value || "");
  }, [value]);

  const hasChanged = pending !== (value || "");

  function handleSubmit() {
    if (!hasChanged) return;
    if (pending === "") {
      onClear();
    } else {
      onSet(pending);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select
        value={pending}
        disabled={disabled}
        onChange={(e) => setPending(e.target.value)}
      >
        {RESULT_OPTIONS.map((o) => (
          <option key={o.value || "none"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={disabled || busy || !hasChanged}
        onClick={handleSubmit}
      >
        Submit
      </button>
    </div>
  );
}

// FIDE's public ratings-card page — the standard place to link a player's
// FIDE ID to. Opens in a new tab since it navigates away from the match.
function fideProfileUrl(fideId) {
  return `https://ratings.fide.com/profile/${fideId}`;
}

// Rating + FIDE ID line under a competitor's name. Renders nothing if
// neither is set, rather than an empty row. `stopPropagation` on the link
// isn't strictly needed today (nothing above it currently handles clicks),
// but it's a One vs. One name/avatar block that may grow a "view profile"
// click target later, so it's cheap insurance against a future regression.
function CompetitorMeta({ competitor }) {
  const hasRating =
    competitor.rating !== null && competitor.rating !== undefined;
  const hasFideId = Boolean(competitor.fideId);
  if (!hasRating && !hasFideId) return null;

  return (
    <div className="cm-competitor-meta">
      {hasRating && (
        <span className="cm-competitor-rating">{competitor.rating}</span>
      )}
      {hasRating && hasFideId && (
        <span className="cm-competitor-meta-sep">·</span>
      )}
      {hasFideId && (
        <a
          href={fideProfileUrl(competitor.fideId)}
          target="_blank"
          rel="noopener noreferrer"
          className="cm-competitor-fideid-link"
          onClick={(e) => e.stopPropagation()}
        >
          FIDE {competitor.fideId}
        </a>
      )}
    </div>
  );
}

// Inline edit form for a competitor's name/title/rating/fideId — swapped in
// for the normal name+meta display when that side is being edited. Picture
// stays out of this form; it's still handled by the Avatar's own
// upload-on-hover affordance, since replacing it has its own upload/cleanup
// flow distinct from this plain-field PATCH.
function CompetitorEditForm({ competitor, busy, onSave, onCancel }) {
  const [name, setName] = useState(competitor.name);
  const [title, setTitle] = useState(competitor.title || "");
  const [rating, setRating] = useState(
    competitor.rating === null || competitor.rating === undefined
      ? ""
      : String(competitor.rating),
  );
  const [fideId, setFideId] = useState(competitor.fideId || "");

  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      title: title || null,
      rating: rating === "" ? null : rating,
      fideId: fideId ? fideId.trim() : null,
    });
  }

  return (
    <div className="cm-competitor-edit">
      <div className="cm-competitor-edit-row">
        <select
          className={`cm-competitor-edit-title ${title ? "has-title" : ""}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        >
          {CHESS_TITLES.map((t) => (
            <option key={t} value={t}>
              {t || "—"}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="cm-competitor-edit-name"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="cm-competitor-edit-row">
        <input
          type="text"
          className="cm-competitor-edit-fideid"
          placeholder="FIDE ID"
          inputMode="numeric"
          value={fideId}
          onChange={(e) => setFideId(e.target.value)}
        />
        <input
          type="number"
          className="cm-competitor-edit-rating"
          placeholder="Rating"
          min="0"
          max="3500"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
        />
      </div>
      <div className="cm-competitor-edit-actions">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={busy || !canSave}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Avatar({ competitor, onFileSelected, uploading }) {
  return (
    <div className={`cm-avatar-wrap ${uploading ? "uploading" : ""}`}>
      {competitor.pictureUrl ? (
        <img className="cm-avatar" src={competitor.pictureUrl} alt="" />
      ) : (
        <div className="cm-avatar cm-avatar-placeholder">🎓</div>
      )}
      <label className="cm-avatar-edit-label">
        {uploading ? "…" : "Change"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="cm-avatar-edit-input"
          disabled={uploading}
          onChange={(e) => onFileSelected(e.target.files && e.target.files[0])}
        />
      </label>
    </div>
  );
}

function GameRow({
  game,
  isOpen,
  onToggleBoard,
  onSetResult,
  onClearResult,
  onMove,
  onUndo,
  busy,
  theme,
  pieceTheme,
}) {
  return (
    <div className="cm-game-row-wrap">
      <div className="cm-game-row">
        <span className="cm-game-num">#{game.gameNum}</span>
        <span className="cm-game-players">
          {game.whiteName} <span className="cm-vs-tiny">vs</span>{" "}
          {game.blackName}
        </span>
        <span className={`cm-game-status cm-status-${game.status}`}>
          {game.result
            ? resultLabel(game.result)
            : game.status === "in_progress"
            ? "In progress"
            : "Pending"}
        </span>
        <ResultPicker
          value={game.result}
          disabled={busy}
          busy={busy}
          onSet={onSetResult}
          onClear={onClearResult}
        />
        <button
          type="button"
          className="cm-toggle-board"
          onClick={onToggleBoard}
        >
          {isOpen ? "Hide Board" : "Open Board"}
        </button>
      </div>

      {isOpen && (
        <div className="cm-board-panel">
          <MoveEntryBoard
            game={game}
            disabled={busy}
            onMove={onMove}
            onUndo={game.moves.length ? onUndo : null}
            theme={theme}
            pieceTheme={pieceTheme}
          />
          {game.suggestedResult && game.status !== "complete" && (
            <div className="cm-suggested-result">
              <span>
                Board shows {game.boardStatus.kind.replace(/_/g, " ")} — confirm
                result?
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => onSetResult(game.suggestedResult)}
              >
                Confirm {game.suggestedResult}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArmageddonPanel({ armageddon, busy, onBid, onResult }) {
  const [bidA, setBidA] = useState("");
  const [bidB, setBidB] = useState("");

  if (
    armageddon.status === "awaiting_bids" ||
    armageddon.status === "bid_tie"
  ) {
    return (
      <div className="cm-armageddon-panel">
        <h4>Armageddon — Collect Bids</h4>
        {armageddon.status === "bid_tie" && (
          <p className="cm-armageddon-tie">
            That pair of bids came out tied — ask both players for a fresh bid.
          </p>
        )}
        <p className="cm-hint">
          Ask each player privately how many seconds they'd accept playing Black
          for. Enter both below — the lower bid gets Black with draw odds; the
          higher bid gets White.
        </p>
        <div className="cm-armageddon-bids">
          <label>
            <span>Competitor A bid (seconds)</span>
            <input
              type="number"
              min="1"
              value={bidA}
              onChange={(e) => setBidA(e.target.value)}
            />
          </label>
          <label>
            <span>Competitor B bid (seconds)</span>
            <input
              type="number"
              min="1"
              value={bidB}
              onChange={(e) => setBidB(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !bidA || !bidB}
            onClick={() => onBid(Number(bidA), Number(bidB))}
          >
            Reveal
          </button>
        </div>
      </div>
    );
  }

  if (armageddon.status === "awaiting_result") {
    return (
      <div className="cm-armageddon-panel">
        <h4>Armageddon</h4>
        <p className="cm-armageddon-reveal">
          <strong>{armageddon.whiteName}</strong> plays White (bid{" "}
          {armageddon.bidA < armageddon.bidB
            ? armageddon.bidB
            : armageddon.bidA}
          s) · <strong>{armageddon.blackName}</strong> plays Black with draw
          odds (bid{" "}
          {armageddon.bidA < armageddon.bidB
            ? armageddon.bidA
            : armageddon.bidB}
          s)
        </p>
        <div className="cm-armageddon-result-row">
          <span>Result:</span>
          <ResultPicker
            value={armageddon.result}
            disabled={busy}
            busy={busy}
            onSet={onResult}
          />
        </div>
      </div>
    );
  }

  // complete
  return (
    <div className="cm-armageddon-panel">
      <h4>Armageddon — Recorded</h4>
      <p>
        {armageddon.whiteName} (White) vs {armageddon.blackName} (Black):{" "}
        {resultLabel(armageddon.result)}
      </p>
    </div>
  );
}

export default function CageMatch() {
  const { t, refresh } = useOutletContext();
  const { id } = useParams();
  const cm = t.cageMatch;

  const [openGameKey, setOpenGameKey] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingSide, setUploadingSide] = useState(null);
  const [editingSide, setEditingSide] = useState(null);
  const [pubBusy, setPubBusy] = useState(false);
  const [pubError, setPubError] = useState("");
  const [pubCopied, setPubCopied] = useState(false);

  // Same route shape Overview.jsx builds for every other tournament type —
  // the public results page already reads cageMatch off the payload
  // GET /public-view/:token returns, so no separate cage-match-specific
  // public route is needed here.
  const publicResultsLink = t.publicViewToken
    ? `${window.location.origin}/results/${t.publicViewToken}`
    : null;

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved && BOARD_THEMES[saved] ? saved : DEFAULT_BOARD_THEME;
    } catch {
      return DEFAULT_BOARD_THEME;
    }
  });
  const [pieceTheme, setPieceTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(PIECE_THEME_STORAGE_KEY);
      return saved && PIECE_THEMES[saved] ? saved : DEFAULT_PIECE_THEME;
    } catch {
      return DEFAULT_PIECE_THEME;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled — theme just won't persist, no big deal.
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(PIECE_THEME_STORAGE_KEY, pieceTheme);
    } catch {
      // Same as above — non-fatal.
    }
  }, [pieceTheme]);

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarChange(side, file) {
    if (!file) return;
    setUploadingSide(side);
    setError("");
    try {
      const { url } = await api.uploadImage(file);
      await api.setCageMatchCompetitorPicture(id, side, url);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingSide(null);
    }
  }

  async function handleSaveCompetitorDetails(side, payload) {
    setBusy(true);
    setError("");
    try {
      await api.updateCageMatchCompetitorDetails(id, side, payload);
      await refresh();
      setEditingSide(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePublicView() {
    setPubBusy(true);
    setPubError("");
    try {
      if (t.publicViewOpen) {
        await api.disablePublicView(id);
      } else {
        await api.enablePublicView(id);
      }
      await refresh();
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

  function toggleBoard(key) {
    setOpenGameKey((prev) => (prev === key ? null : key));
  }

  const selectStyle = {
    background: "#1a1a24",
    border: "1px solid #353545",
    color: "#e8e8e8",
    padding: "6px 12px",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 12,
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div className="cm-root">
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="Board theme"
          style={selectStyle}
        >
          {Object.entries(BOARD_THEMES).map(([key, th]) => (
            <option key={key} value={key}>
              {th.label}
            </option>
          ))}
        </select>
        <select
          value={pieceTheme}
          onChange={(e) => setPieceTheme(e.target.value)}
          aria-label="Piece theme"
          style={selectStyle}
        >
          {Object.entries(PIECE_THEMES).map(([key, pt]) => (
            <option key={key} value={key}>
              {pt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="cm-scoreboard">
        <div className="cm-competitor">
          <Avatar
            competitor={cm.competitors.A}
            uploading={uploadingSide === "A"}
            onFileSelected={(f) => handleAvatarChange("A", f)}
          />
          <div className="cm-competitor-info">
            {editingSide === "A" ? (
              <CompetitorEditForm
                competitor={cm.competitors.A}
                busy={busy}
                onSave={(payload) => handleSaveCompetitorDetails("A", payload)}
                onCancel={() => setEditingSide(null)}
              />
            ) : (
              <>
                <div className="cm-competitor-name-row">
                  <span className="cm-competitor-name">
                    {cm.competitors.A.title && (
                      <span className="cm-competitor-title-badge">
                        {cm.competitors.A.title}
                      </span>
                    )}
                    {cm.competitors.A.name}
                  </span>
                  <button
                    type="button"
                    className="cm-competitor-edit-btn"
                    onClick={() => setEditingSide("A")}
                    aria-label="Edit Competitor A details"
                    title="Edit details"
                  >
                    ✎
                  </button>
                </div>
                <CompetitorMeta competitor={cm.competitors.A} />
              </>
            )}
          </div>
        </div>
        <div className="cm-score">
          <span className="cm-score-num">{cm.score.A}</span>
          <span className="cm-score-sep">–</span>
          <span className="cm-score-num">{cm.score.B}</span>
        </div>
        <div className="cm-competitor">
          <Avatar
            competitor={cm.competitors.B}
            uploading={uploadingSide === "B"}
            onFileSelected={(f) => handleAvatarChange("B", f)}
          />
          <div className="cm-competitor-info">
            {editingSide === "B" ? (
              <CompetitorEditForm
                competitor={cm.competitors.B}
                busy={busy}
                onSave={(payload) => handleSaveCompetitorDetails("B", payload)}
                onCancel={() => setEditingSide(null)}
              />
            ) : (
              <>
                <div className="cm-competitor-name-row">
                  <span className="cm-competitor-name">
                    {cm.competitors.B.title && (
                      <span className="cm-competitor-title-badge">
                        {cm.competitors.B.title}
                      </span>
                    )}
                    {cm.competitors.B.name}
                  </span>
                  <button
                    type="button"
                    className="cm-competitor-edit-btn"
                    onClick={() => setEditingSide("B")}
                    aria-label="Edit Competitor B details"
                    title="Edit details"
                  >
                    ✎
                  </button>
                </div>
                <CompetitorMeta competitor={cm.competitors.B} />
              </>
            )}
          </div>
        </div>
      </div>

      {error && <p className="cm-error">{error}</p>}

      {cm.status === "finished" && (
        <div className="cm-winner-banner">
          🏆 {cm.winnerName} wins the match!
        </div>
      )}

      {cm.tieAlert && !cm.tiebreak && (
        <div className="cm-tie-banner">
          <span>
            Scores are level at {cm.tieAlert.scoreA}–{cm.tieAlert.scoreB} across
            every section. Start the tiebreak mini-match?
          </span>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => run(() => api.startCageMatchTiebreak(id))}
          >
            Start Tiebreak
          </button>
        </div>
      )}

      <div className="cm-section-card">
        <div className="cm-section-head">
          <h3>Public Link</h3>
          <button
            type="button"
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
        </div>
        <p
          className="cm-hint"
          style={{
            marginBottom: t.publicViewOpen && publicResultsLink ? 10 : 0,
          }}
        >
          {t.publicViewOpen
            ? "Anyone with this link can follow the match live — score, games, and the tiebreak if it gets there — read-only, no sign-in needed."
            : "Turn this on to share a read-only link where players and spectators can follow the match live, any time during the event."}
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
                borderRadius: 8,
                border: "1px solid #252532",
                background: "rgba(19, 19, 26, 0.85)",
                color: "#e8e8e8",
                fontFamily: "inherit",
                fontSize: "0.82rem",
              }}
            />
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleCopyPublicLink}
            >
              {pubCopied ? "Copied ✓" : "Copy Link"}
            </button>
          </div>
        )}
        {pubError && (
          <p className="cm-error" style={{ marginTop: 8 }}>
            {pubError}
          </p>
        )}
      </div>

      {cm.sections.map((section) => (
        <div className="cm-section-card" key={section.id}>
          <div className="cm-section-head">
            <h3>{section.label}</h3>
            <span className="cm-section-meta">
              {section.variant === "chess960" ? "Chess960" : "Standard"}
              {section.timeControl ? ` · ${section.timeControl}` : ""}
            </span>
          </div>

          <div className="cm-game-list">
            {section.games.map((game) => {
              const key = `${section.id}:${game.id}`;
              return (
                <GameRow
                  key={game.id}
                  game={game}
                  busy={busy}
                  theme={theme}
                  pieceTheme={pieceTheme}
                  isOpen={openGameKey === key}
                  onToggleBoard={() => toggleBoard(key)}
                  onSetResult={(result) =>
                    run(() =>
                      api.setCageMatchGameResult(
                        id,
                        section.id,
                        game.id,
                        result,
                      ),
                    )
                  }
                  onClearResult={() =>
                    run(() =>
                      api.clearCageMatchGameResult(id, section.id, game.id),
                    )
                  }
                  onMove={(move) =>
                    run(() =>
                      api.recordCageMatchMove(id, section.id, game.id, move),
                    )
                  }
                  onUndo={() =>
                    run(() => api.undoCageMatchMove(id, section.id, game.id))
                  }
                />
              );
            })}
          </div>
        </div>
      ))}

      {cm.tiebreak && (
        <div className="cm-section-card cm-tiebreak-card">
          <div className="cm-section-head">
            <h3>Tiebreak — Mini-Match (first to 2.5 points)</h3>
            <span className="cm-section-meta">
              {cm.tiebreak.miniMatch.score.A} – {cm.tiebreak.miniMatch.score.B}
            </span>
          </div>

          <div className="cm-game-list">
            {cm.tiebreak.miniMatch.games.map((game) => (
              <div className="cm-game-row" key={game.id}>
                <span className="cm-game-num">#{game.gameNum}</span>
                <span className="cm-game-players">
                  {game.whiteName} <span className="cm-vs-tiny">vs</span>{" "}
                  {game.blackName}
                </span>
                <span className={`cm-game-status cm-status-${game.status}`}>
                  {game.result ? resultLabel(game.result) : "Pending"}
                </span>
                <ResultPicker
                  value={game.result}
                  disabled={busy || !!game.result}
                  busy={busy}
                  onSet={(result) =>
                    run(() =>
                      api.recordCageMatchTiebreakResult(id, game.id, result),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <p className="cm-hint" style={{ margin: "6px 2px 0" }}>
            Manual move entry isn't available for tiebreak games yet — record
            the final result directly once each game is decided.
          </p>

          {cm.tiebreak.status === "armageddon" && cm.tiebreak.armageddon && (
            <ArmageddonPanel
              armageddon={cm.tiebreak.armageddon}
              busy={busy}
              onBid={(a, b) =>
                run(() => api.recordCageMatchArmageddonBids(id, a, b))
              }
              onResult={(r) =>
                run(() => api.recordCageMatchArmageddonResult(id, r))
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
