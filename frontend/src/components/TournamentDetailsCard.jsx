import "../css/TournamentDetailsCard.css";

const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};
const VARIANT_LABEL = {
  standard: "Standard team match",
  bughouse: "Bughouse",
  league: "League (Team A vs Team B)",
};
const RATING_TYPE_LABEL = {
  standard: "Standard",
  rapid: "Rapid",
  blitz: "Blitz",
};
const SCORING_LABEL = {
  standard: "Standard (1 / ½ / 0)",
  "3-1-0": "3-1-0 (Win / Draw / Loss)",
  double_round: "Double Round",
};
const TIEBREAK_LABEL = {
  buchholz_cut1: "Buchholz (Cut 1)",
  buchholz: "Buchholz",
  sonneborn_berger: "Sonneborn-Berger",
  direct_encounter: "Direct Encounter",
};

function formatDateRange(from, to) {
  if (!from && !to) return null;
  const opts = { year: "numeric", month: "short", day: "numeric" };
  const f = from
    ? new Date(from + "T00:00:00").toLocaleDateString(undefined, opts)
    : null;
  const tt = to
    ? new Date(to + "T00:00:00").toLocaleDateString(undefined, opts)
    : null;
  if (f && tt && f !== tt) return `${f} – ${tt}`;
  return f || tt;
}

const hasValue = (v) => v !== null && v !== undefined && v !== "";

// A quiet definition list. Rows without a value are left out entirely, so a
// section with nothing to show disappears instead of rendering an empty box.
function Section({ title, tag, rows }) {
  const shown = rows.filter(([, value]) => hasValue(value));
  if (shown.length === 0) return null;
  return (
    <section className="tdc-section">
      <h3 className="tdc-section-title">
        {title}
        {tag && <span className="tdc-section-tag">{tag}</span>}
      </h3>
      <dl className="tdc-facts">
        {shown.map(([label, value]) => (
          <div className="tdc-fact" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function TournamentDetailsCard({ t }) {
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";
  const dateRange = formatDateRange(t.dateFrom, t.dateTo);

  // Headline numbers shown in the strip under the title.
  const stats = [
    ["System", SYSTEM_LABEL[t.system] || t.system],
    ...(isElimination
      ? [
          ["Bracket size", t.bracket?.size],
          ["Champion", t.bracket?.champion?.name],
        ]
      : [["Rounds", `${t.currentRound} / ${t.totalRounds}`]]),
    ["Time control", t.timeControl],
  ].filter(([, value]) => hasValue(value));

  const organizer =
    t.organizerName && t.organizerContact
      ? `${t.organizerName} (${t.organizerContact})`
      : t.organizerName || t.organizerContact;

  const tiebreaks = (t.tiebreaks || [])
    .map((tb) => TIEBREAK_LABEL[tb] || tb)
    .join(" → ");

  return (
    <article className="tdc-card">
      <header className="tdc-header">
        <div className="tdc-header-top">
          <div className="tdc-title-block">
            {t.category && <span className="tdc-eyebrow">{t.category}</span>}
            <h2 className="tdc-name">{t.name}</h2>
          </div>
          <span className={`tdc-status tdc-status-${t.status}`}>
            {String(t.status || "").replace(/_/g, " ")}
          </span>
        </div>

        {(t.fideRated || t.chess960 || t.isTest) && (
          <div className="tdc-badges">
            {t.fideRated && (
              <span className="tdc-badge tdc-badge-fide">FIDE Rated</span>
            )}
            {t.chess960 && (
              <span className="tdc-badge tdc-badge-960">Chess960</span>
            )}
            {t.isTest && (
              <span className="tdc-badge tdc-badge-test">Test Event</span>
            )}
          </div>
        )}
      </header>

      {t.description && (
        <div className="tdc-description">
          <span className="tdc-description-label">
            Rules &amp; Announcements
          </span>
          <p className="tdc-description-text">{t.description}</p>
        </div>
      )}

      {stats.length > 0 && (
        <div className="tdc-stats">
          {stats.map(([label, value]) => (
            <div className="tdc-stat" key={label}>
              <span className="tdc-stat-label">{label}</span>
              <span className="tdc-stat-value">{value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tdc-sections">
        <Section
          title="Event"
          rows={[
            ["Federation", t.federation],
            ["Venue", t.venue],
            ["Dates", dateRange],
          ]}
        />
        <Section
          title="Format"
          rows={[
            ["Format", isTeam ? "Team" : "Individual"],
            ["Variant", isTeam ? VARIANT_LABEL[t.variant] || t.variant : null],
          ]}
        />
        <Section
          title="Officials"
          rows={[
            ["Organizer", organizer],
            ["Chief Arbiter", t.chiefArbiter],
            ["Deputy Chief Arbiter", t.deputyChiefArbiter],
          ]}
        />
        <Section
          title="Rules & Ratings"
          tag="Reserved"
          rows={[
            [
              "Rating Type",
              t.fideRated
                ? RATING_TYPE_LABEL[t.ratingType] || t.ratingType
                : null,
            ],
            [
              "Scoring System",
              SCORING_LABEL[t.scoringSystem] || t.scoringSystem,
            ],
            ["Tiebreak Order", tiebreaks],
            ["Max Half-Point Byes", t.maxHalfPointByes],
            [
              "Bye Cutoff Round",
              t.byeCutoffRound
                ? `No byes from Round ${t.byeCutoffRound} on`
                : null,
            ],
          ]}
        />
      </div>
    </article>
  );
}
