import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import BrochureCanvas, { TEMPLATES } from "./Canvas.jsx";
import { DEFAULT_EXTRAS, SIZES, THEMES, resolveQr, hasValue } from "./data.js";
import "./brochure.css";

const storeKey = (id) => `swiss-brochure:${id}`;

function loadSaved(id) {
  try {
    const raw = localStorage.getItem(storeKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Downscale an uploaded picture so it stays light enough to keep and export.
function readImage(file, maxDim, mime) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Could not read that file."));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file is not a usable image."));
      img.onload = () => {
        const k = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const ctx = c.getContext("2d");
        if (mime === "image/jpeg") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, c.width, c.height);
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL(mime, 0.85));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const slug = (s) =>
  String(s || "tournament")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "tournament";

function Group({ title, open, children }) {
  return (
    <details className="bs-group" open={open}>
      <summary>{title}</summary>
      <div className="bs-group-body">{children}</div>
    </details>
  );
}

export default function BrochureStudio({ t, registrationUrl, resultsUrl, onClose }) {
  const saved = useMemo(() => loadSaved(t.id), [t.id]);
  const [template, setTemplate] = useState(saved?.template || "classic");
  const [themeKey, setThemeKey] = useState(saved?.themeKey || "slate");
  const [sizeKey, setSizeKey] = useState(saved?.sizeKey || "a4");
  const [extras, setExtras] = useState({ ...DEFAULT_EXTRAS, ...(saved?.extras || {}) });
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const links = useMemo(
    () => ({ registrationUrl, resultsUrl }),
    [registrationUrl, resultsUrl]
  );
  const size = SIZES[sizeKey];
  const canPrint = Boolean(size.print);
  const qr = resolveQr(extras, links);

  // Remember choices per tournament (this device).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(
          storeKey(t.id),
          JSON.stringify({ template, themeKey, sizeKey, extras })
        );
      } catch {
        /* storage full or blocked: the brochure still works, it just isn't remembered */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [t.id, template, themeKey, sizeKey, extras]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !printing && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, printing]);

  const setX = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setExtras((p) => ({ ...p, [k]: v }));
  };

  /* ── preview fit ───────────────────────────────────────────────────── */
  const stageRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const calc = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const w = el.clientWidth - padX;
      const h = el.clientHeight - padY;
      const k = Math.min(w / size.w, h / size.h, 1);
      setScale(Math.max(0.1, k));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h]);

  /* ── export ────────────────────────────────────────────────────────── */
  const nodeRef = useRef(null);

  const downloadPng = useCallback(async () => {
    if (!nodeRef.current) return;
    setBusy(true);
    setError("");
    try {
      await document.fonts?.ready;
      const url = await toPng(nodeRef.current, {
        pixelRatio: size.ratio,
        cacheBust: true,
        skipFonts: true,
        width: size.w,
        height: size.h,
        style: { transform: "none" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(t.name)}-brochure-${sizeKey}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(`Could not create the image: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }, [size, sizeKey, t.name]);

  const printIt = useCallback(async () => {
    setError("");
    setPrinting(true);
    document.body.classList.add("bro-printing");
    // Let the print copy mount and fit its text before the dialog opens.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      await document.fonts?.ready;
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 150));
    try {
      window.print();
    } finally {
      document.body.classList.remove("bro-printing");
      setPrinting(false);
    }
  }, []);

  const pickImage = (key, maxDim, mime) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const data = await readImage(file, maxDim, mime);
      setExtras((p) => ({ ...p, [key]: data }));
    } catch (err) {
      setError(err.message);
    }
  };

  const theme = THEMES[themeKey];
  const heavyInk =
    canPrint && theme.dark && template !== "minimal";

  const needsLink =
    (extras.qrMode === "registration" && !registrationUrl) ||
    (extras.qrMode === "results" && !resultsUrl) ||
    (extras.qrMode === "custom" && !hasValue(extras.qrCustom));

  const field = (label, key, props = {}) => (
    <label className="bs-field">
      <span>{label}</span>
      <input value={extras[key]} onChange={setX(key)} {...props} />
    </label>
  );
  const area = (label, key, placeholder) => (
    <label className="bs-field">
      <span>{label}</span>
      <textarea value={extras[key]} onChange={setX(key)} placeholder={placeholder} />
    </label>
  );

  const ui = (
    <div className="bs-overlay" role="dialog" aria-modal="true" aria-label="Tournament brochure">
      <div className="bs-top">
        <h2>Tournament Brochure</h2>
        <div className="bs-top-actions">
          <button className="bs-btn" onClick={downloadPng} disabled={busy}>
            {busy ? "Creating…" : "Download image"}
          </button>
          <button
            className="bs-btn bs-btn--primary"
            onClick={printIt}
            disabled={!canPrint || printing}
            title={canPrint ? "Print or save as PDF" : "Choose A4 or A5 to print"}
          >
            Print / Save PDF
          </button>
          <button className="bs-btn" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="bs-main">
        <div className="bs-panel">
          {error && <p className="bs-err">{error}</p>}
          {!canPrint && (
            <p className="bs-note" style={{ marginBottom: 12 }}>
              Social sizes are made for sharing as an image. Pick A4 or A5 to
              print or save a PDF.
            </p>
          )}
          {heavyInk && (
            <p className="bs-note" style={{ marginBottom: 12 }}>
              Dark designs use a lot of ink. For printing, try the Paper theme
              or the Minimal template.
            </p>
          )}

          <Group title="Design" open>
            <div className="bs-tpls">
              {Object.entries(TEMPLATES).map(([k, v]) => (
                <button
                  key={k}
                  className={`bs-tpl${template === k ? " is-on" : ""}`}
                  onClick={() => setTemplate(k)}
                >
                  <strong>{v.label}</strong>
                  <span>{v.note}</span>
                </button>
              ))}
            </div>
            <div className="bs-themes">
              {Object.entries(THEMES).map(([k, v]) => (
                <button
                  key={k}
                  className={`bs-theme${themeKey === k ? " is-on" : ""}`}
                  onClick={() => setThemeKey(k)}
                >
                  <span
                    className="bs-swatch"
                    style={{ background: `linear-gradient(135deg, ${v.bg} 50%, ${v.accent} 50%)` }}
                  />
                  {v.label}
                </button>
              ))}
            </div>
            <label className="bs-field">
              <span>Size</span>
              <select value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
                {Object.entries(SIZES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
          </Group>

          <Group title="Headline">
            {field("Tagline", "tagline", { placeholder: "e.g. Open to all ages and ratings" })}
          </Group>

          <Group title="Entry & prizes">
            {field("Entry fee", "entryFee", { placeholder: "e.g. KES 1,000 (juniors 500)" })}
            {field("Register by", "deadline", { placeholder: "e.g. 20 Oct 2026" })}
            {area("Payment details", "payment", "e.g. M-Pesa Paybill 123456")}
            {field("Prize fund", "prizeFund", { placeholder: "e.g. KES 100,000" })}
            {area("Prizes (one per line)", "prizes", "1st – KES 40,000 + trophy\n2nd – KES 25,000\n3rd – KES 15,000")}
          </Group>

          <Group title="Schedule & accommodation">
            {area("Schedule (one per line)", "schedule", "Registration | Sat 08:00\nRound 1 | Sat 09:30\nPrize giving | Sun 17:00")}
            <p className="bs-hint">
              Put “ | ” or “ — ” between the label and the time to line them up.
            </p>
            {area("Accommodation & travel", "accommodation", "Nearby hotels, discounts, directions…")}
          </Group>

          <Group title="Contact & extras">
            {field("Phone / WhatsApp", "phone", { placeholder: "+254 700 000 000" })}
            {field("Email", "email", { type: "email", placeholder: "info@club.org" })}
            {field("Website", "website", { placeholder: "club.org" })}
            {area("Sponsors", "sponsors", "Proudly supported by…")}
            {area("Please note", "notes", "Anything players should bring or know")}
            <label className="bs-check">
              <input type="checkbox" checked={extras.showRules} onChange={setX("showRules")} />
              Show scoring &amp; tiebreak rules
            </label>
            <label className="bs-check">
              <input type="checkbox" checked={extras.showOfficials} onChange={setX("showOfficials")} />
              Show organizer &amp; arbiters
            </label>
          </Group>

          <Group title="Images">
            <div className="bs-field">
              <span>Logo (club or sponsor)</span>
              <div className="bs-img-row">
                {extras.logo && <img src={extras.logo} alt="" />}
                <input type="file" accept="image/*" onChange={pickImage("logo", 500, "image/png")} />
                {extras.logo && (
                  <button className="bs-btn" onClick={() => setExtras((p) => ({ ...p, logo: null }))}>Remove</button>
                )}
              </div>
            </div>
            <div className="bs-field">
              <span>Banner photo</span>
              <div className="bs-img-row">
                {extras.hero && <img src={extras.hero} alt="" />}
                <input type="file" accept="image/*" onChange={pickImage("hero", 1600, "image/jpeg")} />
                {extras.hero && (
                  <button className="bs-btn" onClick={() => setExtras((p) => ({ ...p, hero: null }))}>Remove</button>
                )}
              </div>
            </div>
          </Group>

          <Group title="QR code">
            <label className="bs-field">
              <span>QR code points to</span>
              <select value={extras.qrMode} onChange={setX("qrMode")}>
                <option value="auto">Automatic (registration, else results)</option>
                <option value="registration">Registration page</option>
                <option value="results">Live results page</option>
                <option value="custom">A link I type</option>
                <option value="none">No QR code</option>
              </select>
            </label>
            {extras.qrMode === "custom" && field("Link", "qrCustom", { placeholder: "https://…" })}
            {field("Caption under the code", "qrCaption", { placeholder: "Scan to register" })}
            {needsLink && (
              <p className="bs-note">
                That link isn’t available yet, so no QR code is shown.
                {extras.qrMode === "registration" && " Enable the registration link on the Overview page."}
                {extras.qrMode === "results" && " Turn on the public results link on the Overview page."}
              </p>
            )}
            {qr && (
              <p className="bs-hint">
                Code opens: <b style={{ overflowWrap: "anywhere" }}>{qr.url}</b>
                <br />
                It only works for players once the tournament is online.
              </p>
            )}
          </Group>

          <button
            className="bs-btn"
            onClick={() => {
              if (window.confirm("Clear everything you added to this brochure?")) {
                setExtras({ ...DEFAULT_EXTRAS });
              }
            }}
          >
            Reset extras
          </button>
        </div>

        <div className="bs-stage" ref={stageRef}>
          <div
            className="bs-stage-inner"
            style={{ width: size.w * scale, height: size.h * scale }}
          >
            <div
              className="bs-stage-scale"
              style={{ width: size.w, height: size.h, transform: `scale(${scale})` }}
            >
              <BrochureCanvas
                t={t}
                extras={extras}
                links={links}
                template={template}
                themeKey={themeKey}
                sizeKey={sizeKey}
                nodeRef={nodeRef}
              />
            </div>
          </div>
        </div>
      </div>

      {printing &&
        createPortal(
          <div className="bro-print-portal">
            <style>{`@page { size: ${size.print} portrait; margin: 0; }`}</style>
            <BrochureCanvas
              t={t}
              extras={extras}
              links={links}
              template={template}
              themeKey={themeKey}
              sizeKey={sizeKey}
            />
          </div>,
          document.body
        )}
    </div>
  );

  return createPortal(ui, document.body);
}
