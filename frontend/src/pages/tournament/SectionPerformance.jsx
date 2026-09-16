import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { api } from "../../api.js";
import "../../css/SectionPerformance.css";

export default function SectionPerformance() {
  const { t } = useOutletContext();
  const { id } = useParams();
  const [sections, setSections] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getCageMatchSectionPerformance(id)
      .then((data) => {
        if (!cancelled) setSections(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  if (error) return <p className="sp-error">{error}</p>;
  if (!sections) return <p className="sp-loading">Loading…</p>;

  const names = t.cageMatch.competitors;

  return (
    <div className="sp-root">
      {sections.map((s) => (
        <div className="sp-card" key={s.sectionId}>
          <div className="sp-card-head">
            <h3>{s.label}</h3>
            <span className="sp-meta">
              {s.variant === "chess960" ? "Chess960" : "Standard"} ·{" "}
              {s.numberOfGames} game{s.numberOfGames === 1 ? "" : "s"}
            </span>
          </div>

          <table className="sp-table">
            <thead>
              <tr>
                <th>Competitor</th>
                <th>Played</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {["A", "B"].map((side) => (
                <tr key={side}>
                  <td className="sp-name-cell">{names[side].name}</td>
                  <td>{s[side].played}</td>
                  <td className="sp-win">{s[side].wins}</td>
                  <td className="sp-draw">{s[side].draws}</td>
                  <td className="sp-loss">{s[side].losses}</td>
                  <td className="sp-points">{s[side].points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
