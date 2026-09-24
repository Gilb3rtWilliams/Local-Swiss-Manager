import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import BackgroundSlideshow from "../components/BackgroundSlideshow.jsx";
import "../css/Welcome.css";
import useTypingEffect from "/hooks/useTypingEffect.js";
import slide1 from "../images/slide1.jpg";
import slide2 from "../images/slide2.jpg";
import slide3 from "../images/slide3.jpg";
import slide4 from "../images/slide4.jpg";
import slide5 from "../images/slide5.jpg";

// Drop your own photos in /public/images/hall/ and list them here — the
// slideshow (and this page) look fine with an empty array too, it just
// falls back to a themed gradient until you do.
const HERO_IMAGES = [slide1, slide2, slide3, slide4, slide5];

// ─── Reveal-on-scroll wrapper ────────────────────────────────────────────────
function Reveal({ as: Tag = "div", className = "", children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.18 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal${visible ? " reveal-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

// ─── Small ink-line format diagrams ──────────────────────────────────────────
// Same thin-line, walnut-ink language as the bracket page — these are meant
// to feel like diagrams sketched on a pairing sheet, not stock icons.

function SwissIcon() {
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M8 6 L32 26" />
        <path d="M8 16 L32 36" />
        <path d="M8 26 L32 6" />
        <path d="M8 36 L32 16" />
      </g>
      <g fill="currentColor">
        {[6, 16, 26, 36].map((y) => (
          <circle key={`l${y}`} cx="8" cy={y} r="2.2" />
        ))}
        {[6, 16, 26, 36].map((y) => (
          <circle key={`r${y}`} cx="32" cy={y} r="2.2" />
        ))}
      </g>
    </svg>
  );
}

function RoundRobinIcon({ double = false }) {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = (-90 + i * 72) * (Math.PI / 180);
    return [20 + 13 * Math.cos(a), 20 + 13 * Math.sin(a)];
  });
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) edges.push([pts[i], pts[j]]);
  }
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      {double && (
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.5"
        />
      )}
      <g stroke="currentColor" strokeWidth="1.1" opacity="0.7">
        {edges.map(([[x1, y1], [x2, y2]], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <g fill="currentColor">
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.4" />
        ))}
      </g>
    </svg>
  );
}

function SingleElimIcon() {
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M6 4 L20 9 L6 14" />
        <path d="M6 26 L20 31 L6 36" />
        <path d="M20 9 L34 20 L20 31" />
      </g>
      <circle cx="34" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
}

function DoubleElimIcon() {
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M6 4 L18 9 L6 14" />
        <path d="M18 9 L34 19" />
        <path d="M6 26 L18 31 L6 36" strokeDasharray="2.5 3" />
        <path d="M18 31 L34 21" strokeDasharray="2.5 3" />
      </g>
      <circle cx="34" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
}

function BughouseIcon() {
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="12" width="14" height="14" rx="1.5" />
        <rect x="22" y="12" width="14" height="14" rx="1.5" />
      </g>
      <g
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      >
        <path d="M18 15 L22 15" markerEnd="url(#arrow)" />
        <path d="M22 23 L18 23" markerEnd="url(#arrow)" />
      </g>
      <defs>
        <marker
          id="arrow"
          markerWidth="6"
          markerHeight="6"
          refX="4"
          refY="2"
          orient="auto"
        >
          <path d="M0 0 L4 2 L0 4 Z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  );
}

// Two competitors, several games between them — the "best of N, in one
// continuous sitting" shape a Cage Match's sections are built from.
function CageMatchIcon() {
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      <g fill="currentColor">
        <circle cx="7" cy="20" r="3.4" />
        <circle cx="33" cy="20" r="3.4" />
      </g>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M11 13 L29 13" />
        <path d="M11 20 L29 20" />
        <path d="M11 27 L29 27" />
      </g>
    </svg>
  );
}

// Two pairings, each a doubled ("best of N") line, feeding forward the same
// way a Swiss round or a bracket already does — Match Play layered on top
// of any format above, rather than a shape of its own.
function MatchPlayIcon() {
  return (
    <svg viewBox="0 0 40 40" className="format-icon" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <path d="M6 8 L20 8" />
        <path d="M6 12 L20 12" />
        <path d="M6 28 L20 28" />
        <path d="M6 32 L20 32" />
        <path d="M20 10 L34 10" />
        <path d="M20 30 L34 30" />
        <path d="M34 10 L34 30" strokeDasharray="2.5 3" />
      </g>
      <g fill="currentColor">
        <circle cx="6" cy="10" r="2" />
        <circle cx="6" cy="30" r="2" />
        <circle cx="34" cy="10" r="2" />
        <circle cx="34" cy="30" r="2" />
      </g>
    </svg>
  );
}

// ─── Content data ─────────────────────────────────────────────────────────────

const FORMATS = [
  {
    icon: <SwissIcon />,
    title: "Swiss System",
    body: "Every round pairs competitors with similar scores who haven't already met. No one is eliminated — the field converges on a fair ranking over a fixed number of rounds.",
  },
  {
    icon: <RoundRobinIcon />,
    title: "Single Round Robin",
    body: "Every competitor faces every other exactly once. No seed can hide from anyone — it's the most complete test a field can get.",
  },
  {
    icon: <RoundRobinIcon double />,
    title: "Double Round Robin",
    body: "The same round robin, run twice, with colors reversed the second time. The standard for leagues where one result shouldn't decide the table.",
  },
  {
    icon: <SingleElimIcon />,
    title: "Single Elimination",
    body: "A seeded bracket, standard tournament draw. Lose once and you're out — the fewest possible rounds to a champion.",
  },
  {
    icon: <DoubleElimIcon />,
    title: "Double Elimination",
    body: "One loss drops you to the losers bracket, not out the door. It takes two losses to be finished, including a Grand Final reset if the losers'-bracket finalist beats the winners'-bracket champion.",
  },
  {
    icon: <CageMatchIcon />,
    title: "Cage Match",
    body: "Two competitors, one continuous event: several timed sections — Classical, Rapid, Blitz, whatever you set — each a short series of games. A tie goes to a sudden-death mini-match, and Armageddon if it's still level after that.",
  },
  {
    icon: <MatchPlayIcon />,
    title: "Match Play",
    body: "Any format above, with a twist: every pairing plays a best-of-N mini-match instead of a single game. Match points feed the standings or bracket as usual, with a tiebreak mini-match and Armageddon on hand for whenever one comes out level.",
  },
];

const SPORTS = [
  {
    icon: "⚽",
    label: "Football knockout cups",
    body: "Single or double elimination for a cup draw, seeded by league table or ranking, with a third-place playoff if you want one.",
  },
  {
    icon: "🏀",
    label: "Basketball tournaments",
    body: "Round-robin pool play feeding a single-elimination bracket — the same two-stage shape most club and school tournaments already run.",
  },
  {
    icon: "🏓",
    label: "Table tennis ladders",
    body: "Swiss pairings let a large open ladder converge on a fair final standing without every player needing to face everyone.",
  },
  {
    icon: "🎮",
    label: "Esports brackets",
    body: "Double elimination with a Grand Final reset — the standard format for LAN and online events, where one bad game shouldn't end a run.",
  },
  {
    icon: "🏸",
    label: "Badminton leagues",
    body: "Double round robin for a home-and-away league season, or single round robin for a one-off club night.",
  },
  {
    icon: "🎳",
    label: "Club league nights",
    body: "Swiss or round robin for a casual weekly night, where the pairing engine works out who plays whom instead of the organizer.",
  },
  {
    icon: "🏐",
    label: "Volleyball tournaments",
    body: "Pool-play round robin into a single-elimination knockout — the standard two-phase shape for club and school volleyball days.",
  },
  {
    icon: "🎾",
    label: "Tennis & padel ladders",
    body: "Swiss or round robin for a club ladder, with games or sets won standing in for chess's tiebreak scores.",
  },
  {
    icon: "🥊",
    label: "Combat sports fight cards",
    body: "Single elimination seeded by weight class or ranking — a standard fight-night bracket, with byes handled automatically on an odd-numbered field.",
  },
  {
    icon: "♟️",
    label: "Other board & card games",
    body: "Checkers, Go, backgammon, bridge, Magic — anything decided by a single head-to-head result drops straight into any format above.",
  },
];

export default function Welcome() {
  const navigate = useNavigate();

  const welcomeMessage = useTypingEffect("Local Swiss Manager", 50);
  const subMessage = useTypingEffect(
    "Pairings, standings, and results — run entirely on your machine.",
    30,
  );

  const [showLoginBtn, setShowLoginBtn] = useState(false);
  const isLoggedIn = Boolean(localStorage.getItem("adminToken"));

  const handleDashboardClick = () => {
    if (!isLoggedIn) {
      toast.error("You have to log in as an admin to access this page.", {
        position: "top-right",
        autoClose: 3000,
      });
      setShowLoginBtn(true);
    } else {
      navigate("/dashboard");
    }
  };

  function scrollToFormats() {
    document.getElementById("formats")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="welcome-page">
      <section className="welcome-hero">
        <BackgroundSlideshow images={HERO_IMAGES} className="welcome-hero-bg" />

        <div className="welcome-hero-content">
          <div className="welcome-glyph">♞</div>
          <h1 className="welcome-title">{welcomeMessage}</h1>
          <p className="welcome-tagline">{subMessage}</p>
          <div className="welcome-hero-ctas">
            <button
              className="btn-primary btn-lg"
              onClick={() => navigate("/tournaments")}
            >
              Browse Tournaments
            </button>
            <button
              className="btn-primary btn-lg"
              onClick={handleDashboardClick}
            >
              Admin Dashboard
            </button>

            {!isLoggedIn && showLoginBtn && (
              <button
                className="btn-secondary btn-lg welcome-admin-cta"
                onClick={() => navigate("/login")}
              >
                Admin Sign In
              </button>
            )}
          </div>
          <p className="welcome-credit">by Gilbert Williams</p>
        </div>

        <button
          className="welcome-scroll-cue"
          onClick={scrollToFormats}
          aria-label="Scroll to learn more"
        >
          <span>See how it works</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M6 9 L12 15 L18 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="welcome-hero-edge" aria-hidden="true" />
      </section>

      <section className="welcome-section" id="formats">
        <Reveal className="welcome-section-head">
          <p className="welcome-eyebrow">Tournament Formats</p>
          <h2>Seven ways to run an event</h2>
          <p className="welcome-lede">
            Every format shares the same pairing engine underneath — pick the
            shape that fits your field, and switch between them tournament to
            tournament.
          </p>
        </Reveal>

        <div className="format-grid">
          {FORMATS.map((f, i) => (
            <Reveal key={f.title} className="format-card" delay={i * 60}>
              <div className="format-icon-wrap">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="bughouse-callout">
          <div className="format-icon-wrap format-icon-wrap-callout">
            <BughouseIcon />
          </div>
          <div>
            <h3>Plus team play, including Bughouse</h3>
            <p>
              Any of the five pairing formats above can run as a team event —
              standard team matches, league play, or Bughouse, where partners on
              two boards share a clock and pass captured pieces to each other
              mid-game.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="welcome-section" id="tiebreaks">
        <Reveal className="welcome-section-head">
          <p className="welcome-eyebrow">Tie-break systems</p>
          <h2>Buchholz, Sonneborn–Berger, and more</h2>
          <p className="welcome-lede">
            When two or more players finish with the same score, these systems
            break the tie without another game being played. Most prioritize the
            strength of a player's opponents rather than raw results — Buchholz
            (and its Cut 1 variant) is the usual primary tie-break in Swiss
            events, Sonneborn–Berger is common in round-robin formats or as a
            secondary tie-break, and Number of Wins is a simple decisive-results
            check that's easy to explain on the spot.
          </p>
        </Reveal>

        <div className="welcome-tiebreak-grid">
          <Reveal className="format-card" delay={60}>
            <h3>Buchholz Score</h3>
            <p>
              Buchholz Score measures the overall strength of a player's
              schedule. It is calculated by summing the final tournament scores
              of all opponents a player faced. Variations like Buchholz Cut 1
              drop the lowest-scoring opponent to mitigate the impact of an
              exceptionally weak pairing.
            </p>
          </Reveal>

          <Reveal className="format-card" delay={120}>
            <h3>Sonneborn–Berger Score</h3>
            <p>
              Sonneborn–Berger Score (specifically the Neustadtl variant)
              weights results by opponent strength. It is calculated by adding
              the full final score of every opponent a player defeated and half
              the final score of every opponent they drew with; losses
              contribute zero. This system rewards players for scoring points
              against stronger competition.
            </p>
          </Reveal>

          <Reveal className="format-card" delay={180}>
            <h3>Buchholz Cut 1</h3>
            <p>
              Buchholz Cut 1 starts from the same idea as the plain Buchholz
              Score — sum the final scores of every opponent a player faced —
              but drops the single lowest-scoring opponent before adding up the
              rest. One weak pairing, whether from a bye-heavy schedule or an
              opponent who withdrew early, no longer drags the whole total down
              on its own, which is why it's the more common default in Swiss
              events over the uncut version.
            </p>
          </Reveal>

          <Reveal className="format-card" delay={240}>
            <h3>Number of Wins</h3>
            <p>
              Number of Wins counts how many games a player won outright,
              setting draws and losses aside entirely. As a tiebreaker it
              rewards a more decisive record over a cautious one: two players
              can finish with the same total score, but whoever won more games —
              rather than drew their way to the same number — ranks higher.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="welcome-section welcome-versatility" id="versatility">
        <Reveal className="welcome-section-head">
          <p className="welcome-eyebrow">Beyond Chess</p>
          <h2>Built for any head-to-head competition</h2>
          <p className="welcome-lede">
            The round robin and elimination engines don't know they're running a
            chess tournament — no chess assumption is baked into the seeding or
            bracket math. Run a five-a-side football knockout, a table-tennis
            ladder, or a local esports cup with the same seeded brackets, the
            same bracket-reset logic, and the same standings.
          </p>
        </Reveal>

        <Reveal className="sport-grid">
          {SPORTS.map((s) => (
            <div className="sport-card" key={s.label}>
              <span className="sport-card-icon">{s.icon}</span>
              <div>
                <h4>{s.label}</h4>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="welcome-section welcome-cta">
        <Reveal>
          <h2>Ready to set the pairings?</h2>
          <p className="welcome-cta-sub">
            Organizing an event? Sign in to create and run a tournament.
          </p>
          <button
            className="btn-primary btn-lg"
            onClick={() => navigate("/login")}
          >
            Admin Sign In
          </button>
          <p className="welcome-cta-alt">
            Just here to check results?{" "}
            <button
              className="welcome-cta-link"
              onClick={() => navigate("/tournaments")}
            >
              Browse tournaments →
            </button>
          </p>
        </Reveal>
      </section>

      <footer className="welcome-footer">
        <p>by Gilbert Williams</p>
      </footer>
    </div>
  );
}
