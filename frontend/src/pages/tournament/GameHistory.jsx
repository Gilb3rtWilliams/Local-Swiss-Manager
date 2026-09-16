import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/GameHistory.css";

const RESULT_LABELS = {
  "1-0": "1–0",
  "0-1": "0–1",
  "1/2-1/2": "½–½",
  "1F-0F": "1F–0F",
  "0F-1F": "0F–1F",
  "0F-0F": "0F–0F",
};

const SOURCE_LABELS = {
  section: null, // shown via sectionLabel instead
  tiebreak_miniMatch: "Tiebreak",
  armageddon: "Armageddon",
};

function movesAsPairs(moves) {
  const pairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ num: i / 2 + 1, white: moves[i], black: moves[i + 1] });
  }
  return pairs;
}

export default function GameHistory() {
  const { t } = useOutletContext();
  const { id } = useParams();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getCageMatchHistory(id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever the tournament data changes elsewhere (a move or
    // result recorded on the Cage Match tab) so this stays in sync without
    // needing its own polling.
  }, [id, t]);

  if (error) return <p className="gh-error">{error}</p>;
  if (!rows) return <p className="gh-loading">Loading…</p>;
  if (rows.length === 0) return <p className="gh-loading">No games yet.</p>;

  return (
    <div className="gh-root">
      {rows.map((g) => {
        const isOpen = openId === g.id;
        const label = SOURCE_LABELS[g.source] ?? g.sectionLabel;
        return (
          <div className="gh-row-wrap" key={g.id}>
            <button
              type="button"
              className="gh-row"
              onClick={() => setOpenId(isOpen ? null : g.id)}
              aria-expanded={isOpen}
            >
              <span className="gh-section-tag">{label}</span>
              <span className="gh-game-num">#{g.gameNum}</span>
              <span className="gh-players">
                {g.whiteName} <span className="gh-vs">vs</span> {g.blackName}
              </span>
              <span className="gh-result">
                {g.result ? RESULT_LABELS[g.result] || g.result : "—"}
              </span>
              <span className="gh-chevron">{isOpen ? "▾" : "▸"}</span>
            </button>

            {isOpen && (
              <div className="gh-detail">
                {g.moves && g.moves.length > 0 ? (
                  <div className="gh-movelist">
                    {movesAsPairs(g.moves).map((p) => (
                      <span className="gh-move-pair" key={p.num}>
                        <span className="gh-move-num">{p.num}.</span>
                        <span className="gh-move">{p.white}</span>
                        {p.black && <span className="gh-move">{p.black}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="gh-no-moves">
                    No moves recorded for this game — only the final result was
                    entered.
                  </p>
                )}
                {g.pgn && (
                  <details className="gh-pgn">
                    <summary>PGN</summary>
                    <pre>{g.pgn}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
