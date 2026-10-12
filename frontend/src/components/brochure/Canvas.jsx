import { useLayoutEffect, useMemo, useRef } from "react";
import qrMatrix from "./qr.js";
import { buildBrochure, splitColumns, SIZES, THEMES, hasValue } from "./data.js";

function QrCode({ url }) {
  const d = useMemo(() => {
    try {
      const m = qrMatrix(url, "M");
      const q = 2; // quiet zone, in modules
      let path = "";
      m.forEach((row, y) =>
        row.forEach((on, x) => {
          if (on) path += `M${x + q} ${y + q}h1v1h-1z`;
        })
      );
      return { path, size: m.length + q * 2 };
    } catch {
      return null;
    }
  }, [url]);
  if (!d) return null;
  return (
    <svg
      className="bro-qr-svg"
      viewBox={`0 0 ${d.size} ${d.size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
    >
      <rect width={d.size} height={d.size} fill="#fff" />
      <path d={d.path} fill="#111" />
    </svg>
  );
}

function Qr({ qr, big }) {
  if (!qr) return null;
  return (
    <div className={`bro-qr${big ? " bro-qr--big" : ""}`}>
      <QrCode url={qr.url} />
      <span className="bro-qr-cap">{qr.caption}</span>
    </div>
  );
}

function Section({ s }) {
  return (
    <section className="bro-sec">
      <h3 className="bro-sec-title">{s.title}</h3>
      {hasValue(s.text) && <p className="bro-sec-text">{s.text}</p>}
      {s.rows && s.rows.length > 0 && (
        <dl className="bro-rows">
          {s.rows.map(([l, v], i) => (
            <div className={`bro-row${v === "" ? " is-solo" : ""}`} key={i}>
              <dt>{l}</dt>
              {v !== "" && <dd>{v}</dd>}
            </div>
          ))}
        </dl>
      )}
      {s.lines && s.lines.length > 0 && (
        <ul className="bro-list">
          {s.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Columns({ sections, cols }) {
  const groups = splitColumns(sections, cols);
  return (
    <div className="bro-cols" style={{ "--cols": groups.length }}>
      {groups.map((g, i) => (
        <div className="bro-col" key={i}>
          {g.map((s) => (
            <Section s={s} key={s.id} />
          ))}
        </div>
      ))}
    </div>
  );
}

const Badges = ({ list }) =>
  list.length > 0 && (
    <div className="bro-badges">
      {list.map((b) => (
        <span className="bro-badge" key={b}>{b}</span>
      ))}
    </div>
  );

function Logo({ logo, plate, h = 4.4 }) {
  if (!logo?.src) return null;
  return (
    <img
      className={`bro-logo${plate ? " has-plate" : ""}`}
      data-shape={logo.shape || "original"}
      style={{ height: `${h * (logo.scale || 1)}em` }}
      src={logo.src}
      alt=""
    />
  );
}

// The organizer's main logo, always top centre.
const Brand = ({ b }) =>
  b.mainLogo ? (
    <div className="bro-brand">
      <Logo logo={b.mainLogo} plate={b.logoPlate} h={5} />
    </div>
  ) : null;

// Sponsor logos in a quiet strip above the footer.
const Sponsors = ({ b }) =>
  b.sponsorLogos.length > 0 ? (
    <div className="bro-sponsors">
      {b.sponsorLabel && <span className="bro-sponsors-l">{b.sponsorLabel}</span>}
      <div className="bro-sponsors-row">
        {b.sponsorLogos.map((l) => (
          <Logo key={l.id || l.src.slice(-20)} logo={l} plate={b.logoPlate} h={3} />
        ))}
      </div>
    </div>
  ) : null;

// One or more posters (e.g. junior / ladies / senior), shown whole, never cropped.
const Posters = ({ b }) =>
  b.posters.length > 0 ? (
    <div
      className="bro-posters"
      style={{ "--n": Math.min(b.posters.length, 3) }}
      data-many={b.posters.length > 3 ? "1" : undefined}
    >
      {b.posters.map((q) => (
        <figure className="bro-poster" key={q.id || q.src.slice(-20)}>
          <img src={q.src} alt="" />
          {q.caption && <figcaption>{q.caption}</figcaption>}
        </figure>
      ))}
    </div>
  ) : null;

const Checker = () => <div className="bro-checker" aria-hidden="true" />;

/* ── Templates ─────────────────────────────────────────────────────────── */

function Classic({ b, cols, bodyRef }) {
  return (
    <div className="bro-frame">
      <Checker />
      <header className="bro-head">
        <Brand b={b} />
        <span className="bro-eyebrow">{b.eyebrow}</span>
        <h1 className="bro-title">{b.title}</h1>
        {b.tagline && <p className="bro-tagline">{b.tagline}</p>}
        <Badges list={b.badges} />
        {b.hero && <img className="bro-hero" src={b.hero} alt="" />}
      </header>
      {b.keyFacts.length > 0 && (
        <div className="bro-facts">
          {b.keyFacts.map(([l, v]) => (
            <div className="bro-fact" key={l}>
              <span className="bro-fact-l">{l}</span>
              <span className="bro-fact-v">{v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="bro-body" ref={bodyRef}>
        <Posters b={b} />
        <Columns sections={b.sections} cols={cols} />
      </div>
      <Sponsors b={b} />
      <footer className="bro-foot">
        <div className="bro-foot-text">
          {b.contactLine && <span>{b.contactLine}</span>}
        </div>
        <Qr qr={b.qr} />
      </footer>
      <Checker />
    </div>
  );
}

function Modern({ b, cols, bodyRef }) {
  return (
    <>
      <header className={`bro-head${b.hero ? " has-hero" : ""}`}>
        {b.hero && <img className="bro-hero" src={b.hero} alt="" />}
        <div className="bro-head-in">
          <Brand b={b} />
          <div className="bro-head-top">
            <span className="bro-eyebrow">{b.eyebrow}</span>
          </div>
          <h1 className="bro-title">{b.title}</h1>
          {b.tagline && <p className="bro-tagline">{b.tagline}</p>}
          <Badges list={b.badges} />
        </div>
      </header>
      {b.keyFacts.length > 0 && (
        <div className="bro-facts">
          {b.keyFacts.map(([l, v]) => (
            <div className="bro-fact" key={l}>
              <span className="bro-fact-l">{l}</span>
              <span className="bro-fact-v">{v}</span>
            </div>
          ))}
        </div>
      )}
      <div className="bro-body" ref={bodyRef}>
        <Posters b={b} />
        <Columns sections={b.sections} cols={cols} />
      </div>
      <Sponsors b={b} />
      <footer className="bro-foot">
        <div className="bro-foot-text">
          <strong>{b.title}</strong>
          {b.contactLine && <span>{b.contactLine}</span>}
        </div>
        <Qr qr={b.qr} />
      </footer>
    </>
  );
}

function Bold({ b, cols, bodyRef }) {
  return (
    <>
      <header className="bro-head">
        <Brand b={b} />
        <div className="bro-head-top">
          <span className="bro-eyebrow">{b.eyebrow}</span>
        </div>
        <h1 className="bro-title">{b.title}</h1>
        {b.tagline && <p className="bro-tagline">{b.tagline}</p>}
        <Badges list={b.badges} />
        {b.dates.big && (
          <div className="bro-date">
            <span className="bro-date-big">{b.dates.big}</span>
            <span className="bro-date-small">{b.dates.small}</span>
          </div>
        )}
        {b.hero && <img className="bro-hero" src={b.hero} alt="" />}
      </header>
      {b.keyFacts.filter(([l]) => l !== "When").length > 0 && (
        <ul className="bro-facts">
          {b.keyFacts
            .filter(([l]) => l !== "When")
            .map(([l, v]) => (
              <li className="bro-fact" key={l}>
                <span className="bro-fact-l">{l}</span>
                <span className="bro-fact-v">{v}</span>
              </li>
            ))}
        </ul>
      )}
      <div className="bro-body" ref={bodyRef}>
        <Posters b={b} />
        <Columns sections={b.sections} cols={cols} />
      </div>
      <Sponsors b={b} />
      <footer className="bro-foot">
        <div className="bro-foot-text">
          {b.contactLine && <span>{b.contactLine}</span>}
        </div>
        <Qr qr={b.qr} big />
      </footer>
    </>
  );
}

function Minimal({ b, cols, bodyRef }) {
  return (
    <>
      <header className="bro-head">
        <Brand b={b} />
        <div className="bro-head-top">
          <span className="bro-eyebrow">{b.eyebrow}</span>
        </div>
        <h1 className="bro-title">{b.title}</h1>
        {b.tagline && <p className="bro-tagline">{b.tagline}</p>}
        <Badges list={b.badges} />
      </header>
      {b.hero && <img className="bro-hero" src={b.hero} alt="" />}
      {b.keyFacts.length > 0 && (
        <dl className="bro-facts">
          {b.keyFacts.map(([l, v]) => (
            <div className="bro-fact" key={l}>
              <dt className="bro-fact-l">{l}</dt>
              <dd className="bro-fact-v">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="bro-body" ref={bodyRef}>
        <Posters b={b} />
        <Columns sections={b.sections} cols={cols} />
      </div>
      <Sponsors b={b} />
      <footer className="bro-foot">
        <div className="bro-foot-text">
          {b.contactLine && <span>{b.contactLine}</span>}
        </div>
        <Qr qr={b.qr} />
      </footer>
    </>
  );
}

export const TEMPLATES = {
  classic: { label: "Classic", note: "Framed, serif, formal", Comp: Classic },
  modern: { label: "Modern", note: "Colour header, cards", Comp: Modern },
  bold: { label: "Poster", note: "Big type, great for social", Comp: Bold },
  minimal: { label: "Minimal", note: "Light, saves ink", Comp: Minimal },
};

function themeVars(theme, template) {
  // The minimal template is always printed on white; the theme only picks
  // the accent colour.
  if (template === "minimal") {
    return {
      "--bg": "#ffffff", "--bg2": "#f4f4f6", "--ink": "#15151c",
      "--muted": "#6b6b78", "--accent": theme.accentOnLight,
      "--accent-ink": "#ffffff", "--line": "rgba(0,0,0,.14)",
    };
  }
  return {
    "--bg": theme.bg, "--bg2": theme.bg2, "--ink": theme.ink,
    "--muted": theme.muted, "--accent": theme.accent,
    "--accent-ink": theme.accentInk,
    "--line": theme.dark ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.14)",
  };
}

// Shrinks (or grows) the type until everything fits the page, so a long
// description never gets clipped and a sparse one doesn't leave a hollow page.
function useFit(rootRef, bodyRef, deps) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    if (!root || !body) return undefined;
    let dead = false;
    const run = () => {
      if (dead) return;
      let s = 1.3;
      root.style.setProperty("--fs", String(s));
      while (s > 0.4 && body.scrollHeight > body.clientHeight + 1) {
        s = Math.round((s - 0.025) * 1000) / 1000;
        root.style.setProperty("--fs", String(s));
      }
    };
    run();
    document.fonts?.ready?.then(run).catch(() => {});
    const imgs = Array.from(root.querySelectorAll("img"));
    imgs.forEach((im) => {
      if (!im.complete) im.addEventListener("load", run, { once: true });
    });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function BrochureCanvas({
  t, extras, links, template, themeKey, sizeKey, nodeRef,
}) {
  const size = SIZES[sizeKey] || SIZES.a4;
  const theme = THEMES[themeKey] || THEMES.slate;
  const tpl = TEMPLATES[template] || TEMPLATES.classic;
  const b = useMemo(() => buildBrochure(t, extras, links), [t, extras, links]);
  const localRef = useRef(null);
  const bodyRef = useRef(null);
  const rootRef = nodeRef || localRef;
  const tall = size.h / size.w > 1.6;

  useFit(rootRef, bodyRef, [b, template, sizeKey, themeKey]);

  const style = {
    "--bw": size.w,
    width: size.w,
    height: size.h,
    ...themeVars(theme, template),
  };
  const Comp = tpl.Comp;
  return (
    <div
      ref={rootRef}
      className={`bro bro-${template}${tall ? " is-tall" : ""}${theme.dark && template !== "minimal" ? " is-dark" : ""}`}
      style={style}
    >
      <Comp b={b} cols={size.cols} bodyRef={bodyRef} />
    </div>
  );
}
