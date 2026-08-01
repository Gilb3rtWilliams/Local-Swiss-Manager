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

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="tdc-field">
      <span className="tdc-field-label">{label}</span>
      <span className="tdc-field-value">{value}</span>
    </div>
  );
}

function Panel({ title, reserved, children, visible = true }) {
  if (!visible) return null;
  const kids = Array.isArray(children)
    ? children.filter(Boolean)
    : [children].filter(Boolean);
  if (kids.length === 0) return null;
  return (
    <div className="tdc-panel">
      <div className="tdc-panel-head">
        <span className="tdc-panel-title">{title}</span>
        {reserved && <span className="tdc-reserved-tag">Reserved</span>}
      </div>
      <div className="tdc-panel-body">{kids}</div>
    </div>
  );
}

export default function TournamentDetailsCard({ t }) {
  const isTeam = t.format === "team";
  const isElimination =
    t.system === "single_elimination" || t.system === "double_elimination";
  const dateRange = formatDateRange(t.dateFrom, t.dateTo);
  const hasOfficials =
    t.organizerName ||
    t.organizerContact ||
    t.chiefArbiter ||
    t.deputyChiefArbiter;

  return (
    <div className="tdc-card">
      <div className="tdc-header">
        <div className="tdc-header-top">
          <h2 className="tdc-name">{t.name}</h2>
          <span className={`tdc-status tdc-status-${t.status}`}>
            {t.status}
          </span>
        </div>
        <div className="tdc-badges">
          {t.category && <span className="tdc-badge">{t.category}</span>}
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
      </div>

      <div className="tdc-panels">
        {/* Description Panel */}
        <Panel title="Rules & Announcements" visible={!!t.description}>
          <div
            style={{
              whiteSpace: "pre-wrap",
              color: "#e8e8e8",
              fontSize: "0.95rem",
              lineHeight: 1.6,
            }}
          >
            {t.description}
          </div>
        </Panel>

        <Panel title="Event">
          <Field label="Federation" value={t.federation} />
          <Field label="Venue" value={t.venue} />
          <Field label="Time Control" value={t.timeControl} />
          <Field label="Dates" value={dateRange} />
        </Panel>

        <Panel title="Format & System">
          <Field label="Format" value={isTeam ? "Team" : "Individual"} />
          {isTeam && (
            <Field
              label="Variant"
              value={VARIANT_LABEL[t.variant] || t.variant}
            />
          )}
          <Field label="System" value={SYSTEM_LABEL[t.system] || t.system} />
          {isElimination ? (
            <>
              <Field label="Bracket Size" value={t.bracket?.size} />
              <Field label="Champion" value={t.bracket?.champion?.name} />
            </>
          ) : (
            <Field
              label="Rounds"
              value={`${t.currentRound} / ${t.totalRounds}`}
            />
          )}
        </Panel>

        <Panel title="Officials" visible={!!hasOfficials}>
          <Field
            label="Organizer"
            value={
              t.organizerName && t.organizerContact
                ? `${t.organizerName} (${t.organizerContact})`
                : t.organizerName || t.organizerContact
            }
          />
          <Field label="Chief Arbiter" value={t.chiefArbiter} />
          <Field label="Deputy Chief Arbiter" value={t.deputyChiefArbiter} />
        </Panel>

        <Panel title="Rules & Ratings" reserved>
          {t.fideRated && (
            <Field
              label="Rating Type"
              value={RATING_TYPE_LABEL[t.ratingType] || t.ratingType}
            />
          )}
          <Field
            label="Scoring System"
            value={SCORING_LABEL[t.scoringSystem] || t.scoringSystem}
          />
          <Field
            label="Tiebreak Order"
            value={(t.tiebreaks || [])
              .map((tb) => TIEBREAK_LABEL[tb] || tb)
              .join(" → ")}
          />
          <Field label="Max Half-Point Byes" value={t.maxHalfPointByes} />
          <Field
            label="Bye Cutoff Round"
            value={
              t.byeCutoffRound
                ? `No byes from Round ${t.byeCutoffRound} on`
                : null
            }
          />
        </Panel>
      </div>
    </div>
  );
}
