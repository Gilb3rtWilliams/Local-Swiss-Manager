import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BackgroundSlideshow from "../components/BackgroundSlideshow.jsx";
import "../css/Welcome.css";
import useTypingEffect from "/hooks/useTypingEffect.js";

// Drop your own photos in /public/images/hall/ and list them here — the
// slideshow (and this page) look fine with an empty array too, it just
// falls back to a themed gradient until you do.
const HERO_IMAGES = [
  "src/images/slide1.jpg",
  "src/images/slide2.jpg",
  "src/images/slide3.jpg",
  "src/images/slide4.jpg",
  "src/images/slide5.jpg",
];

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
];

const SPORTS = [
  { icon: "⚽", label: "Football knockout cups" },
  { icon: "🏀", label: "Basketball tournaments" },
  { icon: "🏓", label: "Table tennis ladders" },
  { icon: "🎮", label: "Esports brackets" },
  { icon: "🏸", label: "Badminton leagues" },
  { icon: "🎳", label: "Club league nights" },
];

export default function Welcome() {
  const navigate = useNavigate();

  const welcomeMessage = useTypingEffect("Local Swiss Manager", 50);
  const subMessage = useTypingEffect(
    "Pairings, standings, and results — run entirely on your machine.",
    30,
  );

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
              className="btn-secondary btn-lg welcome-admin-cta"
              onClick={() => navigate("/login")}
            >
              Admin Sign In
            </button>
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
          <h2>Five ways to run an event</h2>
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
              Any of the five formats above can run as a team event — standard
              team matches, league play, or Bughouse, where partners on two
              boards share a clock and pass captured pieces to each other
              mid-game.
            </p>
          </div>
        </Reveal>
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

        <Reveal className="sport-row">
          {SPORTS.map((s) => (
            <div className="sport-chip" key={s.label}>
              <span className="sport-chip-icon">{s.icon}</span>
              <span>{s.label}</span>
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
