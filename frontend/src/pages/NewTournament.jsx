import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { FIDE_FEDERATIONS } from "../federations.js";
import ThemePicker from "../components/ThemePicker.jsx";
import { useTheme } from "../themes.js";
import "../css/theme.css";
import "../css/NewTournament.css";

/* ── Round-count helpers ─────────────────────────────────────────────── */

function suggestedRounds(n) {
  if (n < 2) return 1;
  return Math.ceil(Math.log2(n));
}

function roundRobinRounds(n, system) {
  if (n < 2) return 0;
  const single = n % 2 === 0 ? n - 1 : n;
  return system === "double_round_robin" ? single * 2 : single;
}

function eliminationRounds(n, system) {
  if (n < 2) return 0;
  const wbRounds = Math.ceil(Math.log2(n));
  if (system !== "double_elimination") return wbRounds;
  const lbRounds = wbRounds <= 1 ? 0 : 2 * (wbRounds - 1);
  return wbRounds + lbRounds + 1;
}

/* ── Row factories ───────────────────────────────────────────────────── */

let uidCounter = 0;
function rowId() {
  return `row-${++uidCounter}`;
}

function emptyPlayer() {
  return { key: rowId(), title: "", name: "", rating: "", fideId: "" };
}
function emptyTeam() {
  return { key: rowId(), name: "", players: [emptyPlayer(), emptyPlayer()] };
}
function emptyCageSection() {
  return {
    key: rowId(),
    label: "",
    numberOfGames: 4,
    variant: "standard",
    timeControl: "",
  };
}
function emptyCompetitor() {
  return {
    name: "",
    title: "",
    rating: "",
    fideId: "",
    pictureUrl: "",
    uploading: false,
  };
}

function avgRating(list) {
  const rated = list.filter(
    (p) => p.rating !== "" && !Number.isNaN(Number(p.rating)),
  );
  if (!rated.length) return null;
  return Math.round(
    rated.reduce((s, p) => s + Number(p.rating), 0) / rated.length,
  );
}

/* ── Constants ───────────────────────────────────────────────────────── */

const AVAILABLE_TIEBREAKS = [
  { id: "buchholz_cut1", label: "Buchholz Cut 1" },
  { id: "buchholz", label: "Buchholz" },
  { id: "sonneborn_berger", label: "Sonneborn-Berger" },
  { id: "direct_encounter", label: "Direct Encounter" },
];

const CHESS_TITLES = ["", "GM", "IM", "FM", "CM", "WGM", "WIM", "WFM", "WCM"];

const SCORING_LABELS = {
  standard: "Standard (1 / 0.5 / 0)",
  "3-1-0": "3-1-0 Football Scoring",
  double_round: "Double Win Points (2 / 1 / 0)",
};

const VARIANT_LABELS = {
  standard: "Standard",
  chess960: "Chess960",
  league: "League",
  bughouse: "Bughouse",
};

const SYSTEM_LABELS = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};

// topFormat drives the 4-way format choice. `format` stays
// "individual" | "team" | "match" — exactly what the backend expects — and
// is kept in sync by handleTopFormatChange. Match Tournament means
// "individual or team, plus matchPlay on", so its roster type is chosen
// separately instead of getting a format value of its own.
const FORMAT_CHOICES = [
  {
    value: "individual",
    glyph: "♟",
    label: "Individual",
    blurb: "Players compete one-on-one.",
  },
  {
    value: "team",
    glyph: "♜",
    label: "Team",
    blurb: "Teams play together across boards.",
  },
  {
    value: "cage",
    glyph: "⚔",
    label: "Cage Match",
    blurb: "Two competitors, several time formats.",
  },
  {
    value: "matchplay",
    glyph: "♛",
    label: "Match Tournament",
    blurb: "Every pairing is a best-of-N mini-match.",
  },
];

function initialForm() {
  return {
    // Format
    topFormat: "individual",
    format: "individual",
    matchPlayEnabled: false,
    matchPlayNumberOfGames: 2,

    // Details
    name: "",
    category: "Open",
    federation: "",
    venue: "",
    description: "",

    // Organizer, contact & schedule
    organizerName: "",
    organizerContact: "",
    chiefArbiter: "",
    deputyChiefArbiter: "",
    dateFrom: "",
    dateTo: "",
    fideRated: false,
    isTest: false,

    // Rules
    variant: "standard",
    system: "swiss",
    timeControl: "",
    autoRounds: true,
    totalRounds: 5,
    chess960: false,
    // Only read by the backend for single-elimination brackets.
    thirdPlaceMatch: false,

    // Advanced rules
    ratingType: "standard",
    maxHalfPointByes: 2,
    byeCutoffRound: "",
    scoringSystem: "standard",
    tiebreaks: [
      "buchholz_cut1",
      "buchholz",
      "sonneborn_berger",
      "direct_encounter",
    ],

    // Roster
    players: [emptyPlayer(), emptyPlayer(), emptyPlayer(), emptyPlayer()],
    teams: [emptyTeam(), emptyTeam()],

    // Cage match
    compA: emptyCompetitor(),
    compB: emptyCompetitor(),
    cageSections: [emptyCageSection()],
  };
}

/* ── Small presentational components ─────────────────────────────────── */

// Two/three-option segmented toggle.
function SegmentedToggle({ name, value, onChange, options }) {
  return (
    <div className="nt-toggle" role="radiogroup">
      {options.map((opt) => (
        <label
          key={String(opt.value)}
          className={value === opt.value ? "checked" : ""}
        >
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// `group` renders a div instead of a label — use it when the control inside
// isn't a single input (toggles, chip rows, composite rows).
function Field({ label, hint, full, group, children }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className={`nt-field ${full ? "nt-field-full" : ""}`}>
      <span className="nt-field-label">{label}</span>
      {children}
      {hint && <span className="nt-field-hint">{hint}</span>}
    </Tag>
  );
}

// A titled block inside a step (Basics, Schedule, …).
function Block({ title, children }) {
  return (
    <div className="nt-block">
      {title && <h3 className="nt-block-title">{title}</h3>}
      {children}
    </div>
  );
}

// One group on the review step, with a shortcut back to its step.
// A row value of null/false omits the row; an empty string shows "Not set"
// so blank optional fields are visible when cross-checking.
function ReviewGroup({ title, onEdit, rows, children }) {
  const shown = rows.filter(
    ([, v]) => v !== null && v !== undefined && v !== false,
  );
  return (
    <div className="nt-review-group">
      <div className="nt-review-head">
        <h3>{title}</h3>
        <button type="button" className="nt-link" onClick={onEdit}>
          Edit
        </button>
      </div>
      {shown.length > 0 && (
        <dl>
          {shown.map(([label, value]) => (
            <div className="nt-review-row" key={label}>
              <dt>{label}</dt>
              <dd className={value === "" ? "nt-dim" : ""}>
                {value === "" ? "Not set" : value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </div>
  );
}

// Compact read-only roster table for the review step.
function ReviewPlayers({ list }) {
  return (
    <table className="nt-review-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>FIDE ID</th>
          <th>Rating</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p, i) => (
          <tr key={p.key}>
            <td>{i + 1}</td>
            <td>
              {p.title && <span className="nt-review-title">{p.title}</span>}
              {p.name.trim()}
            </td>
            <td className={p.fideId ? "" : "nt-dim"}>{p.fideId || "—"}</td>
            <td className={p.rating !== "" ? "" : "nt-dim"}>
              {p.rating !== "" ? p.rating : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Disclosure({ title, hint, open, onToggle, children }) {
  return (
    <div className="nt-disclosure">
      <button
        type="button"
        className="nt-disclosure-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="nt-disclosure-title">
          <span className="nt-chevron">{open ? "▾" : "▸"}</span>
          {title}
        </span>
        <span className="nt-disclosure-hint">{hint}</span>
      </button>
      {open && <div className="nt-disclosure-body">{children}</div>}
    </div>
  );
}

function TitleSelect({ value, onChange, className = "" }) {
  return (
    <select
      className={`nt-title-select ${value ? "has-title" : ""} ${className}`}
      value={value}
      onChange={onChange}
      aria-label="Title"
    >
      {CHESS_TITLES.map((t) => (
        <option key={t} value={t}>
          {t || "—"}
        </option>
      ))}
    </select>
  );
}

function RosterLegend({ nested }) {
  return (
    <div className={`nt-roster-legend ${nested ? "nested" : ""}`}>
      <span />
      <span>Name</span>
      <span>FIDE ID</span>
      <span>Rating</span>
      <span />
    </div>
  );
}

// One player row — shared by the individual roster and every team.
function PlayerRow({ idx, player, onChange, onRemove, removeLabel }) {
  return (
    <div className="nt-roster-row">
      <span className="nt-idx">{idx + 1}</span>
      <div className="nt-name-group">
        <TitleSelect
          value={player.title}
          onChange={(e) => onChange("title", e.target.value)}
        />
        <input
          type="text"
          placeholder="Player name"
          value={player.name}
          onChange={(e) => onChange("name", e.target.value)}
          aria-label="Player name"
        />
      </div>
      <input
        type="text"
        placeholder="e.g. 8603677"
        inputMode="numeric"
        value={player.fideId}
        onChange={(e) => onChange("fideId", e.target.value)}
        aria-label="FIDE ID"
      />
      <input
        type="number"
        placeholder="—"
        min="0"
        max="3500"
        value={player.rating}
        onChange={(e) => onChange("rating", e.target.value)}
        aria-label="Rating"
      />
      <button
        type="button"
        className="nt-remove"
        onClick={onRemove}
        title="Remove"
        aria-label={removeLabel}
      >
        ✕
      </button>
    </div>
  );
}

function AddRow({ children, onClick, variant = "" }) {
  return (
    <button type="button" className={`nt-add-row ${variant}`} onClick={onClick}>
      <span className="nt-add-icon">+</span> {children}
    </button>
  );
}

function CompetitorCard({ side, c, placeholder, onChange, onPicture }) {
  return (
    <div className="nt-competitor">
      <div className={`nt-avatar-wrap ${c.uploading ? "uploading" : ""}`}>
        {c.pictureUrl ? (
          <img className="nt-avatar" src={c.pictureUrl} alt="" />
        ) : (
          <div className="nt-avatar-placeholder">🎓</div>
        )}
        <label className="nt-avatar-label">
          {c.uploading ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={c.uploading}
            onChange={(e) => onPicture(side, e.target.files?.[0])}
          />
        </label>
      </div>
      <div className="nt-competitor-fields">
        <span className="nt-competitor-side">Competitor {side}</span>
        <input
          type="text"
          className="nt-competitor-name"
          placeholder={placeholder}
          value={c.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="nt-competitor-meta">
          <TitleSelect
            value={c.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <input
            type="text"
            placeholder="FIDE ID"
            inputMode="numeric"
            value={c.fideId}
            onChange={(e) => onChange({ fideId: e.target.value })}
          />
          <input
            type="number"
            placeholder="Rating"
            min="0"
            max="3500"
            value={c.rating}
            onChange={(e) => onChange({ rating: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function NewTournament() {
  const navigate = useNavigate();
  // Same mechanism as the dashboard: the theme tokens (--tp-*) only exist
  // inside an element carrying `tp-theme` + data-theme, so the page root
  // has to set both.
  const [theme, setTheme] = useTheme();

  const [f, setF] = useState(initialForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Secondary fields are collapsed by default: naming the tournament and
  // picking its shape is all most people need.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stepId, setStepId] = useState("format");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepId]);

  /* state helpers */
  const update = (key) => (value) => setF((s) => ({ ...s, [key]: value }));
  // Spread onto a plain text/number/select input.
  const bind = (key) => ({
    value: f[key],
    onChange: (e) => update(key)(e.target.value),
  });

  const setComp = (side, patch) =>
    setF((s) => {
      const key = side === "A" ? "compA" : "compB";
      return { ...s, [key]: { ...s[key], ...patch } };
    });

  const patchList = (key, idx, patch) =>
    setF((s) => ({
      ...s,
      [key]: s[key].map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    }));
  const removeFromList = (key, idx) =>
    setF((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== idx) }));

  const patchTeamPlayer = (tIdx, pIdx, patch) =>
    setF((s) => ({
      ...s,
      teams: s.teams.map((t, i) =>
        i !== tIdx
          ? t
          : {
              ...t,
              players: t.players.map((p, j) =>
                j === pIdx ? { ...p, ...patch } : p,
              ),
            },
      ),
    }));
  const addTeamPlayer = (tIdx) =>
    setF((s) => ({
      ...s,
      teams: s.teams.map((t, i) =>
        i === tIdx ? { ...t, players: [...t.players, emptyPlayer()] } : t,
      ),
    }));
  const removeTeamPlayer = (tIdx, pIdx) =>
    setF((s) => ({
      ...s,
      teams: s.teams.map((t, i) =>
        i === tIdx
          ? { ...t, players: t.players.filter((_, j) => j !== pIdx) }
          : t,
      ),
    }));

  function toggleTiebreak(id) {
    setF((s) => ({
      ...s,
      tiebreaks: s.tiebreaks.includes(id)
        ? s.tiebreaks.filter((t) => t !== id)
        : [...s.tiebreaks, id],
    }));
  }

  // Keeps the backend-facing `format` and `matchPlayEnabled` in sync with
  // whichever of the 4 format cards is active.
  function handleTopFormatChange(tf) {
    setF((s) => {
      const next = { ...s, topFormat: tf };
      if (tf === "individual") {
        next.format = "individual";
        next.matchPlayEnabled = false;
      } else if (tf === "team") {
        next.format = "team";
        next.matchPlayEnabled = false;
      } else if (tf === "cage") {
        next.format = "match";
        next.matchPlayEnabled = false;
      } else if (tf === "matchplay") {
        next.matchPlayEnabled = true;
        // "match" isn't a valid roster type here — default to Individual.
        if (s.format === "match") next.format = "individual";
        // Bughouse isn't supported with Match Play (see
        // tournamentService.js createTournament() validation).
        if (s.variant === "bughouse") next.variant = "standard";
      }
      return next;
    });
  }

  // Uploads immediately on selection so the picture is ready when the
  // tournament is created and image errors show up right away.
  async function handleCompetitorPicture(side, file) {
    if (!file) return;
    setComp(side, { uploading: true });
    setError("");
    try {
      const data = await api.uploadImage(file);
      setComp(side, { pictureUrl: data.url });
    } catch (err) {
      setError(err.message);
    } finally {
      setComp(side, { uploading: false });
    }
  }

  /* derived values */
  const {
    format,
    system,
    matchPlayEnabled,
    matchPlayNumberOfGames,
    autoRounds,
    totalRounds,
    chess960,
    thirdPlaceMatch,
    fideRated,
    teams,
    players,
  } = f;

  const isCage = format === "match";

  const competitorCount = isCage
    ? 2
    : format === "team"
    ? teams.length
    : players.filter((p) => p.name.trim()).length;

  const isRoundRobin =
    system === "round_robin" || system === "double_round_robin";
  const isElimination =
    system === "single_elimination" || system === "double_elimination";
  const isFixedRounds = isRoundRobin || isElimination;

  const rounds = isRoundRobin
    ? roundRobinRounds(Math.max(competitorCount, 2), system)
    : isElimination
    ? eliminationRounds(Math.max(competitorCount, 2), system)
    : autoRounds
    ? suggestedRounds(Math.max(competitorCount, 2))
    : totalRounds;

  const formatLabel = FORMAT_CHOICES.find((c) => c.value === f.topFormat).label;

  const submitLabel = submitting
    ? "Creating…"
    : isCage
    ? "Create Cage Match"
    : isElimination
    ? "Draw Bracket"
    : "Generate Round 1";

  const rulesHint = [
    matchPlayEnabled &&
      `Each pairing${format === "team" ? "/board" : ""} plays a best-of-${
        Number(matchPlayNumberOfGames) || "N"
      } mini-match instead of a single game — the winner (by match points) feeds into the same ${
        isElimination ? "bracket advancement" : "standings"
      } and tiebreaks as usual. A level mini-match can either stand as a draw or go to a tiebreak decider, your call once it happens. `,
    isCage &&
      "Time control, game count, and Chess960 are all set per section below — a Cage Match can mix Classical, Rapid, and Blitz sections, each with its own rules.",
    !isCage &&
      isRoundRobin &&
      `Every competitor faces every other competitor${
        system === "double_round_robin" ? ", twice (once per color)." : "."
      }`,
    !isCage &&
      system === "swiss" &&
      "Pairings adapt each round based on standings.",
    !isCage &&
      system === "single_elimination" &&
      "Single loss and you're out. The full bracket is drawn as soon as you create the tournament.",
    !isCage &&
      system === "single_elimination" &&
      (thirdPlaceMatch
        ? " The two semifinal losers play each other for 3rd place, alongside the final."
        : " Turn on the 3rd Place Playoff above to also draw a match between the two semifinal losers."),
    !isCage &&
      system === "double_elimination" &&
      "Lose once and you drop to the losers bracket; lose twice and you're out — unless you beat the winners-bracket champion in the Grand Final, which triggers a bracket reset.",
    !isCage &&
      chess960 &&
      (isElimination
        ? " Each bracket match gets its own random Chess960 starting position, rolled the moment both sides are known — check the match card before boards start."
        : " A new random Chess960 starting position is drawn each round — check the Chess960 tab before boards start."),
  ]
    .filter(Boolean)
    .join("");

  /* ── Wizard steps ───────────────────────────────────────────────────── */

  const steps = isCage
    ? [
        { id: "format", label: "Format" },
        { id: "details", label: "Details" },
        { id: "competitors", label: "Competitors" },
        { id: "sections", label: "Sections" },
        { id: "review", label: "Review" },
      ]
    : [
        { id: "format", label: "Format" },
        { id: "details", label: "Details" },
        { id: "rules", label: "Rules" },
        { id: "roster", label: format === "team" ? "Teams" : "Players" },
        { id: "review", label: "Review" },
      ];
  const stepIdx = Math.max(
    0,
    steps.findIndex((s) => s.id === stepId),
  );
  const isLast = stepIdx === steps.length - 1;

  function goTo(id) {
    setError("");
    setStepId(id);
  }

  function next() {
    if (stepId === "details" && !f.name.trim()) {
      setError("Give the tournament a name to continue.");
      return;
    }
    goTo(steps[stepIdx + 1].id);
  }

  function back() {
    if (stepIdx > 0) goTo(steps[stepIdx - 1].id);
  }

  /* ── Validation + submit ────────────────────────────────────────────── */

  const toPlayer = (p) => ({
    name: p.name.trim(),
    title: p.title || null,
    fideId: p.fideId ? p.fideId.trim() : null,
    rating: p.rating,
  });
  const toCompetitor = (c) => ({
    ...toPlayer(c),
    pictureUrl: c.pictureUrl || null,
  });

  // Returns { step, message } for the first problem found, or { payload }.
  function buildPayload() {
    if (!f.name.trim()) {
      return { step: "details", message: "Tournament name is required." };
    }

    const shared = {
      name: f.name,
      category: f.category,
      venue: f.venue,
      description: f.description,
      federation: f.federation,
      organizerName: f.organizerName,
      organizerContact: f.organizerContact,
      chiefArbiter: f.chiefArbiter,
      deputyChiefArbiter: f.deputyChiefArbiter,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      fideRated: f.fideRated,
      isTest: f.isTest,
    };

    if (isCage) {
      const { compA, compB } = f;
      if (!compA.name.trim() || !compB.name.trim()) {
        return {
          step: "competitors",
          message: "Both competitors need a name.",
        };
      }
      if (compA.uploading || compB.uploading) {
        return {
          step: "competitors",
          message: "Wait for the picture upload to finish before continuing.",
        };
      }
      const cleanSections = f.cageSections
        .map((s) => ({
          label: s.label.trim(),
          numberOfGames: Number(s.numberOfGames),
          variant: s.variant,
          timeControl: s.timeControl.trim(),
        }))
        .filter((s) => s.label && s.numberOfGames > 0);
      if (cleanSections.length === 0) {
        return {
          step: "sections",
          message:
            "Add at least one section (e.g. Classical, Rapid, Blitz) with a name and a number of games.",
        };
      }
      return {
        payload: {
          ...shared,
          format: "match",
          matchType: "cage",
          competitorA: toCompetitor(compA),
          competitorB: toCompetitor(compB),
          sections: cleanSections,
        },
      };
    }

    if (matchPlayEnabled) {
      const n = Number(matchPlayNumberOfGames);
      if (!Number.isInteger(n) || n < 1) {
        return {
          step: "format",
          message: "Games per pairing must be a positive whole number.",
        };
      }
    }

    const payload = {
      ...shared,
      ratingType: fideRated ? f.ratingType : "standard",
      maxHalfPointByes: Number(f.maxHalfPointByes) || 0,
      byeCutoffRound: f.byeCutoffRound ? Number(f.byeCutoffRound) : null,
      chess960,
      thirdPlaceMatch:
        system === "single_elimination" ? thirdPlaceMatch : false,
      format,
      variant: f.variant,
      system,
      scoringSystem: f.scoringSystem,
      tiebreaks: f.tiebreaks,
      timeControl: f.timeControl,
      totalRounds:
        isFixedRounds || autoRounds ? undefined : Number(totalRounds),
      matchPlay: matchPlayEnabled,
      matchPlayNumberOfGames: matchPlayEnabled
        ? Number(matchPlayNumberOfGames)
        : undefined,
    };

    if (format === "team") {
      const cleanTeams = teams
        .map((t) => ({
          name: t.name.trim(),
          players: t.players.filter((p) => p.name.trim()).map(toPlayer),
        }))
        .filter((t) => t.name);
      if (cleanTeams.length < 2) {
        return {
          step: "roster",
          message: "Add at least 2 teams (with names).",
        };
      }
      if (cleanTeams.some((t) => t.players.length === 0)) {
        return {
          step: "roster",
          message: "Every team needs at least 1 player.",
        };
      }
      payload.teams = cleanTeams;
    } else {
      const cleanPlayers = players.filter((p) => p.name.trim()).map(toPlayer);
      if (cleanPlayers.length < 2) {
        return { step: "roster", message: "Add at least 2 players." };
      }
      payload.players = cleanPlayers;
    }
    return { payload };
  }

  async function createTournament() {
    if (stepId !== "review") return;
    const result = buildPayload();
    if (!result.payload) {
      // Jump to the step that needs fixing so the message has context.
      setStepId(result.step);
      setError(result.message);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const t = await api.createTournament(result.payload);
      navigate(
        !isCage && isElimination
          ? `/tournament/${t.id}/module`
          : `/tournament/${t.id}`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Enter inside a field behaves like Continue. It never creates the
  // tournament: that only happens from the Create button on the review step.
  function handleSubmit(e) {
    e.preventDefault();
    if (!isLast) next();
  }

  // On the review step, run the same validation Create will run so problems
  // are shown (with a link to the step that fixes them) before submitting.
  const reviewCheck = stepId === "review" ? buildPayload() : null;
  const reviewBlocked = Boolean(reviewCheck && !reviewCheck.payload);

  /* ── Step copy ──────────────────────────────────────────────────────── */

  const STEP_COPY = {
    format: [
      "What kind of tournament is this?",
      "This decides which options come next. You can come back and change it.",
    ],
    details: [
      "Tournament details",
      "Name it and tell people where and when it happens.",
    ],
    rules: [
      "How will it be played?",
      "Pairing system, time control and rounds.",
    ],
    roster: [
      format === "team" ? "Add the teams" : "Who's playing?",
      format === "team"
        ? "At least two teams, each with a name and one or more players."
        : "Add at least two players. Empty rows are ignored.",
    ],
    competitors: [
      "Who's facing off?",
      "Both competitors need a name. Pictures, titles and ratings are optional.",
    ],
    sections: [
      "Match sections",
      "One section per time format — Classical, Rapid, Blitz, or anything you like.",
    ],
    review: [
      "Review & create",
      "Check everything over. Use Edit to jump back to any step.",
    ],
  };
  const [stepTitle, stepSubtitle] = STEP_COPY[stepId];

  const filledTeams = teams.filter((t) => t.name.trim()).length;

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <div className="nt-root tp-theme" data-theme={theme}>
      <div className="nt-shell">
        <header className="nt-header">
          <div>
            <h1>New Tournament</h1>
            <p>
              {isCage
                ? "Set up a head-to-head match in a few quick steps."
                : "Set up a tournament in a few quick steps."}
            </p>
          </div>
          <ThemePicker theme={theme} onChange={setTheme} />
        </header>

        <ol className="nt-stepper" aria-label="Progress">
          {steps.map((s, i) => {
            const state =
              i < stepIdx ? "done" : i === stepIdx ? "current" : "todo";
            return (
              <li key={s.id} className={`nt-stepper-item ${state}`}>
                <button
                  type="button"
                  className="nt-stepper-btn"
                  disabled={i > stepIdx}
                  onClick={() => goTo(s.id)}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  <span className="nt-stepper-dot">
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className="nt-stepper-label">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <form className="nt-card" onSubmit={handleSubmit} noValidate>
          <div className="nt-step-head">
            <span className="nt-eyebrow">
              Step {stepIdx + 1} of {steps.length}
            </span>
            <h2>{stepTitle}</h2>
            <p>{stepSubtitle}</p>
          </div>

          <div className="nt-step-body">
            {/* ── Format ─────────────────────────────────────────────── */}
            {stepId === "format" && (
              <>
                <div
                  className="nt-format-grid"
                  role="radiogroup"
                  aria-label="Tournament format"
                >
                  {FORMAT_CHOICES.map((c) => (
                    <button
                      type="button"
                      key={c.value}
                      role="radio"
                      aria-checked={f.topFormat === c.value}
                      className={`nt-format-card ${
                        f.topFormat === c.value ? "selected" : ""
                      }`}
                      onClick={() => handleTopFormatChange(c.value)}
                    >
                      <span className="nt-format-glyph" aria-hidden="true">
                        {c.glyph}
                      </span>
                      <span className="nt-format-name">{c.label}</span>
                      <span className="nt-format-blurb">{c.blurb}</span>
                    </button>
                  ))}
                </div>

                {f.topFormat === "matchplay" && (
                  <Block title="Match tournament options">
                    <div className="nt-grid">
                      <Field label="Roster type" group>
                        <SegmentedToggle
                          name="matchPlayRoster"
                          value={format}
                          onChange={update("format")}
                          options={[
                            { value: "individual", label: "Individual" },
                            { value: "team", label: "Team" },
                          ]}
                        />
                      </Field>
                      <Field
                        label="Games per pairing"
                        hint="Each pairing plays a best-of-N mini-match."
                      >
                        <input
                          type="number"
                          min="1"
                          {...bind("matchPlayNumberOfGames")}
                        />
                      </Field>
                    </div>
                  </Block>
                )}
              </>
            )}

            {/* ── Details ────────────────────────────────────────────── */}
            {stepId === "details" && (
              <>
                <div className="nt-grid">
                  <Field label="Tournament name" full>
                    <input
                      type="text"
                      placeholder="Nyeri Spring Open"
                      autoFocus
                      {...bind("name")}
                    />
                  </Field>
                  <Field label="Category">
                    <select {...bind("category")}>
                      <option value="Open">Open</option>
                      <option value="U18">U18 Youth</option>
                      <option value="Women">Women&apos;s Division</option>
                      <option value="Seniors">Seniors (50+)</option>
                    </select>
                  </Field>
                  <Field label="Federation">
                    <select {...bind("federation")}>
                      <option value="">— Select federation —</option>
                      {FIDE_FEDERATIONS.map((fed) => (
                        <option key={fed} value={fed}>
                          {fed}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Venue / location" full>
                    <input
                      type="text"
                      placeholder="Nyeri Club Hall, or 'Online'"
                      {...bind("venue")}
                    />
                  </Field>
                  <Field
                    label="Rules & announcements"
                    hint="Shown to players on the public page."
                    full
                  >
                    <textarea
                      rows={4}
                      placeholder="No phones in the playing hall. Increment applies from move 1. Default time is 30 minutes."
                      {...bind("description")}
                    />
                  </Field>
                </div>

                <Disclosure
                  title="Organizer, contact & schedule"
                  hint="Optional"
                  open={detailsOpen}
                  onToggle={() => setDetailsOpen((o) => !o)}
                >
                  <div className="nt-grid">
                    <Field label="Organizer">
                      <input
                        type="text"
                        placeholder="Gilbert Williams"
                        {...bind("organizerName")}
                      />
                    </Field>
                    <Field
                      label="Public contact info"
                      hint="Shown on the public page."
                    >
                      <input
                        type="text"
                        placeholder="Email or phone for inquiries"
                        {...bind("organizerContact")}
                      />
                    </Field>
                    <Field label="Chief arbiter">
                      <input
                        type="text"
                        placeholder="FA / IA name"
                        {...bind("chiefArbiter")}
                      />
                    </Field>
                    <Field label="Deputy chief arbiter">
                      <input
                        type="text"
                        placeholder="Optional"
                        {...bind("deputyChiefArbiter")}
                      />
                    </Field>
                    <Field label="Start date">
                      <input type="date" {...bind("dateFrom")} />
                    </Field>
                    <Field label="End date">
                      <input
                        type="date"
                        min={f.dateFrom || undefined}
                        {...bind("dateTo")}
                      />
                    </Field>
                    <Field label="FIDE rated" group>
                      <SegmentedToggle
                        name="fideRated"
                        value={fideRated}
                        onChange={update("fideRated")}
                        options={[
                          { value: true, label: "Yes" },
                          { value: false, label: "No" },
                        ]}
                      />
                    </Field>
                    <Field label="Tournament type" group>
                      <SegmentedToggle
                        name="isTest"
                        value={f.isTest}
                        onChange={update("isTest")}
                        options={[
                          { value: false, label: "Real" },
                          { value: true, label: "Test" },
                        ]}
                      />
                    </Field>
                  </div>
                </Disclosure>
              </>
            )}

            {/* ── Rules ──────────────────────────────────────────────── */}
            {stepId === "rules" && (
              <>
                <div className="nt-grid">
                  {format === "team" && (
                    <Field label="Team variant" full>
                      <select {...bind("variant")}>
                        <option value="league">
                          League (Team A vs Team B)
                        </option>
                        {!matchPlayEnabled && (
                          <option value="bughouse">Bughouse</option>
                        )}
                        <option value="standard">Standard team match</option>
                      </select>
                    </Field>
                  )}
                  <Field label="Pairing system">
                    <select {...bind("system")}>
                      {Object.entries(SYSTEM_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Time control" hint="For example 90+30 or 5+0.">
                    <input
                      type="text"
                      placeholder="90+30"
                      {...bind("timeControl")}
                    />
                  </Field>
                  <Field
                    label="Rounds"
                    group
                    hint={
                      isFixedRounds
                        ? "Set by the system and the number of competitors."
                        : autoRounds
                        ? "Suggested from the number of competitors."
                        : "Enter the number of rounds."
                    }
                  >
                    <div className="nt-rounds-row">
                      <input
                        type="number"
                        min="1"
                        value={rounds}
                        disabled={autoRounds || isFixedRounds}
                        onChange={(e) => update("totalRounds")(e.target.value)}
                        aria-label="Rounds"
                      />
                      {!isFixedRounds && (
                        <label className="nt-check">
                          <input
                            type="checkbox"
                            checked={autoRounds}
                            onChange={(e) =>
                              update("autoRounds")(e.target.checked)
                            }
                          />
                          Auto
                        </label>
                      )}
                    </div>
                  </Field>
                  <Field label="Chess960 (Fischer Random)" group>
                    <SegmentedToggle
                      name="chess960"
                      value={chess960}
                      onChange={update("chess960")}
                      options={[
                        { value: false, label: "Off" },
                        { value: true, label: "On" },
                      ]}
                    />
                  </Field>
                  {system === "single_elimination" && (
                    <Field label="3rd place playoff" group>
                      <SegmentedToggle
                        name="thirdPlaceMatch"
                        value={thirdPlaceMatch}
                        onChange={update("thirdPlaceMatch")}
                        options={[
                          { value: false, label: "Off" },
                          { value: true, label: "On" },
                        ]}
                      />
                    </Field>
                  )}
                </div>

                {rulesHint && <p className="nt-note">{rulesHint}</p>}

                <Disclosure
                  title="Advanced rules & tiebreaks"
                  hint="Optional"
                  open={advancedOpen}
                  onToggle={() => setAdvancedOpen((o) => !o)}
                >
                  <div className="nt-grid">
                    {fideRated && (
                      <Field label="Rating type">
                        <select {...bind("ratingType")}>
                          <option value="standard">Standard</option>
                          <option value="rapid">Rapid</option>
                          <option value="blitz">Blitz</option>
                        </select>
                      </Field>
                    )}
                    <Field label="Max 0.5-point byes">
                      <input
                        type="number"
                        min="0"
                        max="5"
                        {...bind("maxHalfPointByes")}
                      />
                    </Field>
                    <Field label="Bye cutoff round">
                      <input
                        type="number"
                        min="1"
                        placeholder="None"
                        {...bind("byeCutoffRound")}
                      />
                    </Field>
                    <Field label="Scoring system">
                      <select {...bind("scoringSystem")}>
                        <option value="standard">Standard (1 / 0.5 / 0)</option>
                        <option value="3-1-0">3-1-0 Football Scoring</option>
                        <option value="double_round">
                          Double Win Points (2 / 1 / 0)
                        </option>
                      </select>
                    </Field>
                    <Field
                      label="Active tiebreaks (click to toggle)"
                      full
                      group
                    >
                      <div className="nt-chips">
                        {AVAILABLE_TIEBREAKS.map((t) => {
                          const active = f.tiebreaks.includes(t.id);
                          return (
                            <button
                              type="button"
                              key={t.id}
                              className={`nt-chip ${active ? "active" : ""}`}
                              onClick={() => toggleTiebreak(t.id)}
                              aria-pressed={active}
                            >
                              {t.label} {active ? "✓" : "+"}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                  <p className="nt-note">
                    These aren&apos;t wired up to pairing/scoring logic yet —
                    set them now if you like, but they won&apos;t affect this
                    tournament until that&apos;s built.
                  </p>
                </Disclosure>
              </>
            )}

            {/* ── Roster: players ────────────────────────────────────── */}
            {stepId === "roster" && format !== "team" && (
              <>
                <RosterLegend />
                <div className="nt-rows">
                  {players.map((p, idx) => (
                    <PlayerRow
                      key={p.key}
                      idx={idx}
                      player={p}
                      onChange={(field, value) =>
                        patchList("players", idx, { [field]: value })
                      }
                      onRemove={() => removeFromList("players", idx)}
                      removeLabel={`Remove player ${idx + 1}`}
                    />
                  ))}
                </div>
                <AddRow
                  onClick={() =>
                    setF((s) => ({
                      ...s,
                      players: [...s.players, emptyPlayer()],
                    }))
                  }
                >
                  Add player
                </AddRow>
                <p className="nt-roster-summary">
                  {competitorCount} added
                  {avgRating(players) !== null &&
                    ` · average rating ${avgRating(players)}`}
                </p>
              </>
            )}

            {/* ── Roster: teams ──────────────────────────────────────── */}
            {stepId === "roster" && format === "team" && (
              <div className="nt-team-list">
                {teams.map((t, tIdx) => (
                  <div className="nt-team" key={t.key}>
                    <div className="nt-team-header">
                      <span className="nt-idx nt-idx-team">{tIdx + 1}</span>
                      <input
                        type="text"
                        className="nt-team-name"
                        placeholder={`Team ${tIdx + 1} name`}
                        value={t.name}
                        onChange={(e) =>
                          patchList("teams", tIdx, { name: e.target.value })
                        }
                        aria-label={`Team ${tIdx + 1} name`}
                      />
                      {avgRating(t.players) !== null && (
                        <span className="nt-team-avg">
                          Avg {avgRating(t.players)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="nt-remove"
                        onClick={() => removeFromList("teams", tIdx)}
                        aria-label={`Remove team ${tIdx + 1}`}
                      >
                        ✕
                      </button>
                    </div>

                    <RosterLegend nested />
                    <div className="nt-rows nested">
                      {t.players.map((p, pIdx) => (
                        <PlayerRow
                          key={p.key}
                          idx={pIdx}
                          player={p}
                          onChange={(field, value) =>
                            patchTeamPlayer(tIdx, pIdx, { [field]: value })
                          }
                          onRemove={() => removeTeamPlayer(tIdx, pIdx)}
                          removeLabel={`Remove player ${pIdx + 1} from team ${
                            tIdx + 1
                          }`}
                        />
                      ))}
                    </div>
                    <AddRow
                      variant="nested"
                      onClick={() => addTeamPlayer(tIdx)}
                    >
                      Add player to {t.name || `Team ${tIdx + 1}`}
                    </AddRow>
                  </div>
                ))}
                <AddRow
                  variant="team"
                  onClick={() =>
                    setF((s) => ({ ...s, teams: [...s.teams, emptyTeam()] }))
                  }
                >
                  Add team
                </AddRow>
              </div>
            )}

            {/* ── Cage match: competitors ────────────────────────────── */}
            {stepId === "competitors" && (
              <div className="nt-cage-pair">
                <CompetitorCard
                  side="A"
                  c={f.compA}
                  placeholder="Magnus Carlsen"
                  onChange={(patch) => setComp("A", patch)}
                  onPicture={handleCompetitorPicture}
                />
                <span className="nt-vs">VS</span>
                <CompetitorCard
                  side="B"
                  c={f.compB}
                  placeholder="Hikaru Nakamura"
                  onChange={(patch) => setComp("B", patch)}
                  onPicture={handleCompetitorPicture}
                />
              </div>
            )}

            {/* ── Cage match: sections ───────────────────────────────── */}
            {stepId === "sections" && (
              <>
                <div className="nt-legend nt-section-grid">
                  <span />
                  <span>Section</span>
                  <span>Games</span>
                  <span>Variant</span>
                  <span>Time control</span>
                  <span />
                </div>
                <div className="nt-rows">
                  {f.cageSections.map((s, idx) => (
                    <div className="nt-row nt-section-grid" key={s.key}>
                      <span className="nt-idx">{idx + 1}</span>
                      <input
                        type="text"
                        placeholder="Classical, Rapid, Blitz…"
                        value={s.label}
                        onChange={(e) =>
                          patchList("cageSections", idx, {
                            label: e.target.value,
                          })
                        }
                        aria-label="Section name"
                      />
                      <input
                        type="number"
                        min="1"
                        value={s.numberOfGames}
                        onChange={(e) =>
                          patchList("cageSections", idx, {
                            numberOfGames: e.target.value,
                          })
                        }
                        aria-label="Number of games"
                      />
                      <select
                        value={s.variant}
                        onChange={(e) =>
                          patchList("cageSections", idx, {
                            variant: e.target.value,
                          })
                        }
                        aria-label="Variant"
                      >
                        <option value="standard">Standard</option>
                        <option value="chess960">Chess960</option>
                      </select>
                      <input
                        type="text"
                        placeholder="90+30"
                        value={s.timeControl}
                        onChange={(e) =>
                          patchList("cageSections", idx, {
                            timeControl: e.target.value,
                          })
                        }
                        aria-label="Time control"
                      />
                      <button
                        type="button"
                        className="nt-remove"
                        onClick={() => removeFromList("cageSections", idx)}
                        title="Remove"
                        aria-label={`Remove section ${idx + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <AddRow
                  onClick={() =>
                    setF((s) => ({
                      ...s,
                      cageSections: [...s.cageSections, emptyCageSection()],
                    }))
                  }
                >
                  Add section
                </AddRow>
                <p className="nt-note">
                  If the combined score across every section ends level, a
                  4-game mini-match (first to 2.5) decides it, followed by
                  Armageddon if that&apos;s still tied.
                </p>
              </>
            )}

            {/* ── Review ─────────────────────────────────────────────── */}
            {stepId === "review" && (
              <div className="nt-review">
                {reviewBlocked ? (
                  <div className="nt-review-alert warn" role="alert">
                    <div>
                      <strong>Fix this before creating</strong>
                      <p>{reviewCheck.message}</p>
                    </div>
                    <button
                      type="button"
                      className="nt-btn-ghost"
                      onClick={() => goTo(reviewCheck.step)}
                    >
                      Fix it
                    </button>
                  </div>
                ) : (
                  <div className="nt-review-alert ok">
                    <div>
                      <strong>Ready to create</strong>
                      <p>
                        Look through the details below. Use Edit on any group to
                        change it — nothing is created until you press the
                        button at the bottom.
                      </p>
                    </div>
                  </div>
                )}

                <ReviewGroup
                  title="Format"
                  onEdit={() => goTo("format")}
                  rows={[
                    ["Type", formatLabel],
                    [
                      "Roster",
                      matchPlayEnabled
                        ? format === "team"
                          ? "Teams"
                          : "Individual players"
                        : null,
                    ],
                    [
                      "Games per pairing",
                      matchPlayEnabled
                        ? `Best of ${Number(matchPlayNumberOfGames) || "N"}`
                        : null,
                    ],
                  ]}
                />

                <ReviewGroup
                  title="Details"
                  onEdit={() => goTo("details")}
                  rows={[
                    ["Name", f.name.trim()],
                    ["Category", f.category],
                    ["Federation", f.federation],
                    ["Venue", f.venue.trim()],
                    [
                      "Dates",
                      f.dateFrom
                        ? f.dateTo
                          ? `${f.dateFrom} → ${f.dateTo}`
                          : f.dateFrom
                        : "",
                    ],
                    ["Organizer", f.organizerName.trim()],
                    ["Public contact", f.organizerContact.trim()],
                    ["Chief arbiter", f.chiefArbiter.trim()],
                    ["Deputy chief arbiter", f.deputyChiefArbiter.trim()],
                    ["FIDE rated", f.fideRated ? "Yes" : "No"],
                    ["Tournament type", f.isTest ? "Test" : "Real"],
                  ]}
                >
                  {f.description.trim() && (
                    <div className="nt-review-text">
                      <span>Rules &amp; announcements</span>
                      <p>{f.description.trim()}</p>
                    </div>
                  )}
                </ReviewGroup>

                {isCage ? (
                  <>
                    {[
                      ["A", f.compA],
                      ["B", f.compB],
                    ].map(([side, c]) => (
                      <ReviewGroup
                        key={side}
                        title={`Competitor ${side}`}
                        onEdit={() => goTo("competitors")}
                        rows={[
                          ["Name", c.name.trim()],
                          ["Title", c.title],
                          ["FIDE ID", c.fideId.trim()],
                          ["Rating", c.rating],
                          ["Picture", c.pictureUrl ? "Uploaded" : "None"],
                        ]}
                      />
                    ))}
                    <ReviewGroup
                      title="Sections"
                      onEdit={() => goTo("sections")}
                      rows={f.cageSections
                        .filter((s) => s.label.trim())
                        .map((s) => [
                          s.label.trim(),
                          `${s.numberOfGames} game${
                            Number(s.numberOfGames) === 1 ? "" : "s"
                          } · ${VARIANT_LABELS[s.variant] || s.variant} · ${
                            s.timeControl.trim() || "no time control"
                          }`,
                        ])}
                    />
                  </>
                ) : (
                  <>
                    <ReviewGroup
                      title="Rules"
                      onEdit={() => goTo("rules")}
                      rows={[
                        ["System", SYSTEM_LABELS[system]],
                        [
                          "Rounds",
                          `${rounds || "—"}${
                            !isFixedRounds && autoRounds ? " (auto)" : ""
                          }`,
                        ],
                        ["Time control", f.timeControl.trim()],
                        ["Chess960", chess960 ? "On" : "Off"],
                        [
                          "3rd place playoff",
                          system === "single_elimination"
                            ? thirdPlaceMatch
                              ? "On"
                              : "Off"
                            : null,
                        ],
                        [
                          "Team variant",
                          format === "team"
                            ? VARIANT_LABELS[f.variant] || f.variant
                            : null,
                        ],
                        [
                          "Rating type",
                          fideRated
                            ? VARIANT_LABELS[f.ratingType] || f.ratingType
                            : null,
                        ],
                        [
                          "Scoring",
                          SCORING_LABELS[f.scoringSystem] || f.scoringSystem,
                        ],
                        ["Max 0.5-point byes", f.maxHalfPointByes],
                        ["Bye cutoff round", f.byeCutoffRound || "None"],
                        [
                          "Tiebreaks",
                          f.tiebreaks.length
                            ? AVAILABLE_TIEBREAKS.filter((t) =>
                                f.tiebreaks.includes(t.id),
                              )
                                .map((t) => t.label)
                                .join(", ")
                            : "None",
                        ],
                      ]}
                    />

                    {format === "team" ? (
                      <ReviewGroup
                        title={`Teams (${filledTeams})`}
                        onEdit={() => goTo("roster")}
                        rows={[]}
                      >
                        <div className="nt-review-teams">
                          {teams
                            .filter((t) => t.name.trim())
                            .map((t) => {
                              const named = t.players.filter((p) =>
                                p.name.trim(),
                              );
                              return (
                                <div className="nt-review-team" key={t.key}>
                                  <div className="nt-review-team-head">
                                    <strong>{t.name.trim()}</strong>
                                    <span>
                                      {named.length} player
                                      {named.length === 1 ? "" : "s"}
                                      {avgRating(named) !== null &&
                                        ` · avg ${avgRating(named)}`}
                                    </span>
                                  </div>
                                  {named.length > 0 ? (
                                    <ReviewPlayers list={named} />
                                  ) : (
                                    <p className="nt-review-note">
                                      No players yet.
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                        {teams.length > filledTeams && (
                          <p className="nt-review-note">
                            {teams.length - filledTeams} unnamed team
                            {teams.length - filledTeams === 1 ? "" : "s"} will
                            be ignored.
                          </p>
                        )}
                      </ReviewGroup>
                    ) : (
                      <ReviewGroup
                        title={`Players (${competitorCount})`}
                        onEdit={() => goTo("roster")}
                        rows={[
                          [
                            "Average rating",
                            avgRating(players) !== null
                              ? avgRating(players)
                              : null,
                          ],
                        ]}
                      >
                        <ReviewPlayers
                          list={players.filter((p) => p.name.trim())}
                        />
                        {players.length > competitorCount && (
                          <p className="nt-review-note">
                            {players.length - competitorCount} empty row
                            {players.length - competitorCount === 1
                              ? ""
                              : "s"}{" "}
                            will be ignored.
                          </p>
                        )}
                      </ReviewGroup>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="nt-error" role="alert">
              {error}
            </p>
          )}

          <footer className="nt-footer">
            {stepIdx > 0 ? (
              <button type="button" className="nt-btn-ghost" onClick={back}>
                ← Back
              </button>
            ) : (
              <span />
            )}
            {isLast ? (
              <button
                key="create"
                type="button"
                className="nt-btn-primary"
                disabled={submitting || reviewBlocked}
                onClick={createTournament}
              >
                {submitLabel}
              </button>
            ) : (
              <button
                key="continue"
                type="button"
                className="nt-btn-primary"
                onClick={next}
              >
                Continue →
              </button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}
