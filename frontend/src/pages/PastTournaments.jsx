import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import "../css/PastTournaments.css";
import "../css/Dashboard.css"; // Imported to reuse the dashboard's filter styles

const FORMAT_LABEL = { individual: "Individual", team: "Team" };
const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};

export default function PastTournaments() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");

  // Filter states
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    // Swapped to listPublicTournaments() to view all existing tournaments
    api
      .listPublicTournaments()
      .then(setTournaments)
      .catch((e) => setError(e.message));
  }, []);

  // Filter logic mirroring the dashboard
  const filtered = useMemo(() => {
    if (!tournaments) return null;
    return tournaments.filter((t) => {
      if (formatFilter !== "all" && t.format !== formatFilter) return false;
      if (statusFilter === "active" && t.status === "finished") return false;
      if (statusFilter === "finished" && t.status !== "finished") return false;
      return true;
    });
  }, [tournaments, formatFilter, statusFilter]);

  return (
    <div className="pt-root">
      <div className="pt-bg" aria-hidden="true">
        <div className="pt-bg-scene" />
        <div className="pt-bg-scene" />
        <div className="pt-bg-scene" />
      </div>

      <div className="pt-shell">
        <span className="pt-eyebrow">Open to Everyone</span>
        <h1 className="pt-title">Past &amp; Live Tournaments</h1>
        <p className="pt-sub">
          Pairings and standings for every event on the platform.
        </p>

        {error && <div className="pt-error">{error}</div>}

        {tournaments === null && !error && <p className="pt-meta">Loading…</p>}

        {/* Filter UI */}
        {tournaments && tournaments.length > 0 && (
          <div className="dash-filters" style={{ marginBottom: "2rem" }}>
            <div className="dash-filter-group">
              <span className="dash-filter-label">Format</span>
              {["all", "individual", "team"].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`dash-chip${formatFilter === f ? " active" : ""}`}
                  onClick={() => setFormatFilter(f)}
                >
                  {f === "all" ? "All" : FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
            <div className="dash-filter-group">
              <span className="dash-filter-label">Status</span>
              {[
                ["all", "All"],
                ["active", "In progress"],
                ["finished", "Finished"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`dash-chip${statusFilter === val ? " active" : ""}`}
                  onClick={() => setStatusFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {tournaments && tournaments.length === 0 && (
          <div className="pt-empty">
            <div className="pt-empty-glyph">♟</div>
            <h2>No tournaments yet</h2>
            <p>When an organizer creates an event, it'll show up here.</p>
          </div>
        )}

        {/* Empty state for active filters */}
        {filtered && filtered.length === 0 && tournaments.length > 0 && (
          <div className="pt-empty">
            <p>No tournaments match these filters.</p>
          </div>
        )}

        {/* Render filtered array instead of full tournaments array */}
        {filtered && filtered.length > 0 && (
          <div className="pt-grid">
            {filtered.map((t) => (
              <div
                className="pt-card"
                key={t.id || t.publicViewToken}
                onClick={() => {
                  if (t.publicViewToken) {
                    navigate(`/results/${t.publicViewToken}`);
                  } else {
                    alert(
                      "This tournament does not have a public view token yet.",
                    );
                  }
                }}
              >
                <div className="pt-card-top">
                  <span className={`pt-status pt-status-${t.status}`}>
                    {t.status}
                  </span>
                  <span className="pt-system">
                    {SYSTEM_LABEL[t.system] || t.system}
                  </span>
                </div>
                <h3 className="pt-card-name">{t.name}</h3>
                <div className="pt-card-meta">
                  <span>{FORMAT_LABEL[t.format]}</span>
                  {t.federation && <span>{t.federation}</span>}
                </div>
                <div className="pt-card-progress">
                  Round {t.currentRound} / {t.totalRounds} · {t.competitorCount}{" "}
                  {t.format === "team" ? "teams" : "players"}
                </div>
                {t.status === "finished" && t.winner && (
                  <div className="pt-card-winner">🏆 {t.winner}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
