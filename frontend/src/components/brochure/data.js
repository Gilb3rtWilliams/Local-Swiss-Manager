// Turns a tournament + the organizer's brochure extras into one plain model
// that every template renders. Anything without a value is left out, so a
// template never has to guard against empty fields itself.

const SYSTEM_LABEL = {
  swiss: "Swiss",
  round_robin: "Round Robin",
  double_round_robin: "Double Round Robin",
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
};
const VARIANT_LABEL = {
  standard: "Team match",
  bughouse: "Bughouse",
  league: "League (Team A vs Team B)",
};
const RATING_TYPE_LABEL = { standard: "Standard", rapid: "Rapid", blitz: "Blitz" };
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

export const hasValue = (v) =>
  v !== null && v !== undefined && String(v).trim() !== "";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: +m[3] };
}

// "12–14 Oct 2026", "30 Oct – 2 Nov 2026" or "12 Oct 2026".
// big/small feed the poster templates (big numerals, small month + year).
export function formatDates(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (!a && !b) return { text: null, big: null, small: null };
  const f = a || b;
  const e = b || a;
  const same = f.y === e.y && f.m === e.m && f.d === e.d;
  if (same) {
    const small = `${MONTHS[f.m]} ${f.y}`;
    return { text: `${f.d} ${small}`, big: `${f.d}`, small };
  }
  if (f.y === e.y && f.m === e.m) {
    const small = `${MONTHS[f.m]} ${f.y}`;
    return { text: `${f.d}–${e.d} ${small}`, big: `${f.d}–${e.d}`, small };
  }
  if (f.y === e.y) {
    return {
      text: `${f.d} ${MONTHS[f.m]} – ${e.d} ${MONTHS[e.m]} ${f.y}`,
      big: `${f.d} ${MONTHS[f.m]} – ${e.d} ${MONTHS[e.m]}`,
      small: `${f.y}`,
    };
  }
  return {
    text: `${f.d} ${MONTHS[f.m]} ${f.y} – ${e.d} ${MONTHS[e.m]} ${e.y}`,
    big: `${f.d} ${MONTHS[f.m]} ${f.y}`,
    small: `to ${e.d} ${MONTHS[e.m]} ${e.y}`,
  };
}

const lines = (s) =>
  String(s || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

// "Round 1 | Sat 09:00" / "Round 1 — Sat 09:00" -> [label, value]
function scheduleRows(s) {
  return lines(s).map((l) => {
    const m = /^(.*?)\s*(?:\||—|–|\t| - )\s*(.+)$/.exec(l);
    return m ? [m[1], m[2]] : [l, ""];
  });
}

export const DEFAULT_EXTRAS = {
  tagline: "",
  entryFee: "",
  deadline: "",
  payment: "",
  prizeFund: "",
  prizes: "",
  schedule: "",
  accommodation: "",
  phone: "",
  email: "",
  website: "",
  sponsors: "",
  notes: "",
  mainLogo: null, // { id, src, orig, shape, scale, crop }
  sponsorLogos: [], // same shape as mainLogo
  sponsorLabel: "Supported by",
  logoPlate: false, // white backing behind logos
  hero: null,
  posters: [], // { id, src, caption }
  showRules: true,
  showOfficials: true,
  qrMode: "auto", // auto | registration | results | custom | none
  qrCustom: "",
  qrCaption: "",
};

export function resolveQr(x, links) {
  const reg = links?.registrationUrl || null;
  const res = links?.resultsUrl || null;
  let url = null;
  let caption = "";
  if (x.qrMode === "none") return null;
  if (x.qrMode === "custom") {
    url = hasValue(x.qrCustom) ? x.qrCustom.trim() : null;
    caption = "Scan for details";
  } else if (x.qrMode === "results") {
    url = res;
    caption = "Scan for live results";
  } else if (x.qrMode === "registration" || x.qrMode === "auto") {
    url = reg || (x.qrMode === "auto" ? res : null);
    caption = reg ? "Scan to register" : "Scan for live results";
  }
  if (!url) return null;
  if (hasValue(x.qrCaption)) caption = x.qrCaption.trim();
  return { url, caption };
}

export function buildBrochure(t, extras, links) {
  const x = { ...DEFAULT_EXTRAS, ...(extras || {}) };
  const isTeam = t.format === "team";
  const isElim =
    t.system === "single_elimination" || t.system === "double_elimination";
  const dates = formatDates(t.dateFrom, t.dateTo);

  const system = SYSTEM_LABEL[t.system] || t.system;
  const roundsText = isElim
    ? t.bracket?.size
      ? `Bracket of ${t.bracket.size}`
      : null
    : t.totalRounds
    ? `${t.totalRounds} round${t.totalRounds === 1 ? "" : "s"}`
    : null;
  const formatText = [
    system,
    roundsText,
    isTeam ? `Team${t.variant && t.variant !== "standard" ? ` · ${VARIANT_LABEL[t.variant] || t.variant}` : ""}` : "Individual",
  ]
    .filter(hasValue)
    .join(" · ");

  const place = [t.venue, t.federation].filter(hasValue).join(", ");

  const badges = [];
  if (t.fideRated) badges.push("FIDE Rated");
  if (t.chess960) badges.push("Chess960");
  if (t.fideRated && t.ratingType)
    badges.push(RATING_TYPE_LABEL[t.ratingType] || t.ratingType);

  const keyFacts = [
    ["When", dates.text],
    ["Where", place],
    ["Time control", t.timeControl],
    ["Format", formatText],
  ].filter(([, v]) => hasValue(v));

  const organizer =
    t.organizerName && t.organizerContact
      ? `${t.organizerName} (${t.organizerContact})`
      : t.organizerName || t.organizerContact;

  const tiebreaks = (t.tiebreaks || [])
    .map((tb) => TIEBREAK_LABEL[tb] || tb)
    .join(" → ");

  const rows = (list) => list.filter(([, v]) => hasValue(v));
  const sections = [];
  const add = (s) => {
    const empty =
      !(s.rows && s.rows.length) && !(s.lines && s.lines.length) && !hasValue(s.text);
    if (!empty) sections.push(s);
  };

  add({ id: "about", title: "Rules & Announcements", text: t.description });
  add({
    id: "entry",
    title: "Entry & Registration",
    rows: rows([
      ["Entry fee", x.entryFee],
      ["Register by", x.deadline],
      ["Payment", x.payment],
    ]),
  });
  add({
    id: "prizes",
    title: "Prizes",
    rows: rows([["Prize fund", x.prizeFund]]),
    lines: lines(x.prizes),
  });
  add({ id: "schedule", title: "Schedule", rows: scheduleRows(x.schedule) });
  if (x.showRules) {
    add({
      id: "rules",
      title: "Rules & Ratings",
      rows: rows([
        ["Scoring", SCORING_LABEL[t.scoringSystem] || t.scoringSystem],
        ["Tiebreaks", tiebreaks],
        ["Half-point byes", t.maxHalfPointByes],
        [
          "Byes",
          t.byeCutoffRound ? `None from round ${t.byeCutoffRound}` : null,
        ],
      ]),
    });
  }
  add({ id: "stay", title: "Accommodation", text: x.accommodation });
  if (x.showOfficials) {
    add({
      id: "people",
      title: "Officials & Contact",
      rows: rows([
        ["Organizer", organizer],
        ["Chief arbiter", t.chiefArbiter],
        ["Deputy arbiter", t.deputyChiefArbiter],
        ["Phone", x.phone],
        ["Email", x.email],
        ["Website", x.website],
      ]),
    });
  } else {
    add({
      id: "people",
      title: "Contact",
      rows: rows([
        ["Phone", x.phone],
        ["Email", x.email],
        ["Website", x.website],
      ]),
    });
  }
  add({ id: "sponsors", title: "Sponsors", text: x.sponsors });
  add({ id: "notes", title: "Please Note", text: x.notes });

  return {
    title: t.name || "Chess Tournament",
    eyebrow: t.category || (isTeam ? "Team Chess Tournament" : "Chess Tournament"),
    tagline: x.tagline,
    badges,
    dates,
    place,
    timeControl: t.timeControl,
    formatText,
    keyFacts,
    sections,
    qr: resolveQr(x, links),
    mainLogo: x.mainLogo?.src ? x.mainLogo : null,
    sponsorLogos: (x.sponsorLogos || []).filter((l) => l?.src),
    sponsorLabel: x.sponsorLabel,
    logoPlate: !!x.logoPlate,
    hero: x.hero,
    posters: (x.posters || []).filter((q) => q?.src),
    contactLine: [x.phone, x.email, x.website].filter(hasValue).join("  ·  "),
  };
}

// Greedy split into N columns by rough visual weight so columns end up level.
export function splitColumns(sections, n) {
  if (n <= 1) return [sections];
  const weight = (s) =>
    3 +
    (s.rows ? s.rows.length * 2 : 0) +
    (s.lines ? s.lines.length * 1.5 : 0) +
    (s.text ? Math.ceil(String(s.text).length / 38) : 0);
  const cols = Array.from({ length: n }, () => ({ w: 0, items: [] }));
  const total = sections.reduce((a, s) => a + weight(s), 0);
  let i = 0;
  // Keep reading order: fill column 0 up to its share, then move on.
  for (const s of sections) {
    if (i < n - 1 && cols[i].w >= total / n) i++;
    cols[i].items.push(s);
    cols[i].w += weight(s);
  }
  return cols.map((c) => c.items);
}

export const SIZES = {
  a4: { label: "A4 poster (print)", w: 794, h: 1122, cols: 2, print: "A4", ratio: 3 },
  a5: { label: "A5 flyer (print)", w: 559, h: 793, cols: 1, print: "A5", ratio: 3 },
  square: { label: "Social post · square 1:1", w: 1080, h: 1080, cols: 2, ratio: 1 },
  portrait: { label: "Social post · portrait 4:5", w: 1080, h: 1350, cols: 2, ratio: 1 },
  story: { label: "Story / WhatsApp status 9:16", w: 1080, h: 1920, cols: 1, ratio: 1 },
};

export const THEMES = {
  slate: {
    label: "Slate & Gold", dark: true,
    bg: "#14141c", bg2: "#1d1d2a", ink: "#ececf2", muted: "#9a9aae",
    accent: "#d4a853", accentInk: "#1a1405", accentOnLight: "#a9812f",
  },
  burgundy: {
    label: "Ivory & Burgundy", dark: false,
    bg: "#faf6ee", bg2: "#f1e9da", ink: "#2a1a1a", muted: "#7a6a64",
    accent: "#8c1c2b", accentInk: "#ffffff", accentOnLight: "#8c1c2b",
  },
  emerald: {
    label: "Emerald", dark: true,
    bg: "#0e1f19", bg2: "#17302a", ink: "#e9f5ef", muted: "#8fb5a5",
    accent: "#34d399", accentInk: "#06281c", accentOnLight: "#0f7f58",
  },
  royal: {
    label: "Royal Blue", dark: false,
    bg: "#f3f6ff", bg2: "#e3eaff", ink: "#101a3a", muted: "#5a6590",
    accent: "#2f5bd8", accentInk: "#ffffff", accentOnLight: "#2f5bd8",
  },
  crimson: {
    label: "Black & Crimson", dark: true,
    bg: "#0e0e10", bg2: "#1b1b1f", ink: "#ffffff", muted: "#a3a3ad",
    accent: "#ef4444", accentInk: "#ffffff", accentOnLight: "#c42a2a",
  },
  sunset: {
    label: "Sunset", dark: true,
    bg: "#2a1230", bg2: "#3b1c43", ink: "#fff4ea", muted: "#d2a9c0",
    accent: "#ff9a3c", accentInk: "#2a1230", accentOnLight: "#d9701a",
  },
  paper: {
    label: "Paper (ink-saving)", dark: false,
    bg: "#ffffff", bg2: "#f2f2f2", ink: "#111111", muted: "#666666",
    accent: "#222222", accentInk: "#ffffff", accentOnLight: "#222222",
  },
};
