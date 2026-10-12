import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import BrochureCanvas, { TEMPLATES } from "./Canvas.jsx";
import LogoCropper from "./LogoCropper.jsx";
import { DEFAULT_EXTRAS, SIZES, THEMES, resolveQr, hasValue } from "./data.js";
import "./brochure.css";

const uid = () => Math.random().toString(36).slice(2, 9);
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

const readOrig = (file) =>
  readImage(file, 700, file.type === "image/jpeg" ? "image/jpeg" : "image/png");

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
  const [extras, setExtras] = useState(() => {
    const x = { ...DEFAULT_EXTRAS, ...(saved?.extras || {}) };
    // Older saves kept a single plain logo picture.
    if (x.logo && !x.mainLogo) {
      x.mainLogo = { id: "legacy", src: x.logo, orig: x.logo, shape: "original", scale: 1, crop: null };
    }
    delete x.logo;
    return x;
  });
  const [crop, setCrop] = useState(null);
  const [saveWarn, setSaveWarn] = useState(false);
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
        setSaveWarn(false);
      } catch {
        // Storage full or blocked: the brochure still works this session.
        setSaveWarn(true);
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

  /* ── logos ─────────────────────────────────────────────────────────── */
  const nextInQueue = async (queue, target) => {
    if (!queue.length) {
      setCrop(null);
      return;
    }
    try {
      const orig = await readOrig(queue[0]);
      setCrop({ target, initial: { orig, shape: "original" }, queue: queue.slice(1) });
    } catch (err) {
      setError(err.message);
      setCrop(null);
    }
  };
  const startLogo = async (files, target) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setError("");
    try {
      const orig = await readOrig(list[0]);
      setCrop({
        target,
        initial: { orig, shape: "original" },
        queue: target === "main" ? [] : list.slice(1),
      });
    } catch (err) {
      setError(err.message);
    }
  };
  const saveCrop = (result) => {
    const c = crop;
    const item = { id: c.id || uid(), scale: c.scale ?? 1, ...result };
    setExtras((p) =>
      c.target === "main"
        ? { ...p, mainLogo: item }
        : c.id
        ? { ...p, sponsorLogos: p.sponsorLogos.map((l) => (l.id === c.id ? item : l)) }
        : { ...p, sponsorLogos: [...p.sponsorLogos, item] }
    );
    nextInQueue(c.id ? [] : c.queue, c.target);
  };
  const editLogo = (target, l) =>
    setCrop({ target, id: l.id, scale: l.scale, initial: l, queue: [] });
  const setSponsorScale = (id, v) =>
    setExtras((p) => ({ ...p, sponsorLogos: p.sponsorLogos.map((l) => (l.id === id ? { ...l, scale: v } : l)) }));
  const moveItem = (key, i, d) =>
    setExtras((p) => {
      const a = [...p[key]];
      const j = i + d;
      if (j < 0 || j >= a.length) return p;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...p, [key]: a };
    });

  /* ── posters ───────────────────────────────────────────────────────── */
  const addPosters = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    try {
      const added = [];
      for (const f of files) {
        added.push({ id: uid(), src: await readImage(f, 1400, "image/jpeg"), caption: "" });
      }
      setExtras((p) => ({ ...p, posters: [...p.posters, ...added] }));
    } catch (err) {
      setError(err.message);
    }
  };
  const setCaption = (id, v) =>
    setExtras((p) => ({ ...p, posters: p.posters.map((q) => (q.id === id ? { ...q, caption: v } : q)) }));

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
          {saveWarn && (
            <p className="bs-note" style={{ marginBottom: 12 }}>
              Your images are too large to remember on this device. They work
              for now, so download your brochure before closing.
            </p>
          )}
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

          <Group title="Logos">
            <div className="bs-field">
              <span>Main logo (top centre)</span>
              {extras.mainLogo ? (
                <div className="bs-item">
                  <div className="bs-item-thumb"><img src={extras.mainLogo.src} alt="" /></div>
                  <div className="bs-item-body">
                    <label className="bs-size">
                      Size
                      <input
                        type="range" min="0.4" max="1.8" step="0.05"
                        value={extras.mainLogo.scale ?? 1}
                        onChange={(e) =>
                          setExtras((p) => ({ ...p, mainLogo: { ...p.mainLogo, scale: +e.target.value } }))
                        }
                      />
                    </label>
                  </div>
                  <div className="bs-item-actions">
                    <button className="bs-mini" onClick={() => editLogo("main", extras.mainLogo)}>Crop</button>
                    <button className="bs-mini" onClick={() => setExtras((p) => ({ ...p, mainLogo: null }))}>✕</button>
                  </div>
                </div>
              ) : (
                <input type="file" accept="image/*" onChange={(e) => { startLogo(e.target.files, "main"); e.target.value = ""; }} />
              )}
            </div>

            <div className="bs-field">
              <span>Sponsor &amp; partner logos</span>
              {extras.sponsorLogos.map((l, i) => (
                <div className="bs-item" key={l.id}>
                  <div className="bs-item-thumb"><img src={l.src} alt="" /></div>
                  <div className="bs-item-body">
                    <label className="bs-size">
                      Size
                      <input
                        type="range" min="0.4" max="2" step="0.05"
                        value={l.scale ?? 1}
                        onChange={(e) => setSponsorScale(l.id, +e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="bs-item-actions">
                    <button className="bs-mini" onClick={() => editLogo("sponsor", l)}>Crop</button>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="bs-mini" disabled={i === 0} onClick={() => moveItem("sponsorLogos", i, -1)}>←</button>
                      <button className="bs-mini" disabled={i === extras.sponsorLogos.length - 1} onClick={() => moveItem("sponsorLogos", i, 1)}>→</button>
                      <button className="bs-mini" onClick={() => setExtras((p) => ({ ...p, sponsorLogos: p.sponsorLogos.filter((x) => x.id !== l.id) }))}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
              <input
                type="file" accept="image/*" multiple
                onChange={(e) => { startLogo(e.target.files, "sponsor"); e.target.value = ""; }}
              />
              <p className="bs-hint">Pick several files at once; you can shape and crop each one.</p>
            </div>
            {field("Label above sponsor logos", "sponsorLabel", { placeholder: "Supported by" })}
            <label className="bs-check">
              <input type="checkbox" checked={extras.logoPlate} onChange={setX("logoPlate")} />
              White backing behind logos (helps dark logos on dark designs)
            </label>
          </Group>

          <Group title="Posters & banner">
            <div className="bs-field">
              <span>Posters (e.g. Junior, Ladies, Senior)</span>
              {extras.posters.map((q, i) => (
                <div className="bs-item" key={q.id}>
                  <div className="bs-item-thumb is-poster"><img src={q.src} alt="" /></div>
                  <div className="bs-item-body">
                    <input
                      type="text" placeholder="Caption, e.g. Junior section"
                      value={q.caption} onChange={(e) => setCaption(q.id, e.target.value)}
                    />
                  </div>
                  <div className="bs-item-actions">
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="bs-mini" disabled={i === 0} onClick={() => moveItem("posters", i, -1)}>↑</button>
                      <button className="bs-mini" disabled={i === extras.posters.length - 1} onClick={() => moveItem("posters", i, 1)}>↓</button>
                    </div>
                    <button className="bs-mini" onClick={() => setExtras((p) => ({ ...p, posters: p.posters.filter((x) => x.id !== q.id) }))}>✕</button>
                  </div>
                </div>
              ))}
              <input type="file" accept="image/*" multiple onChange={addPosters} />
              <p className="bs-hint">
                Posters are shown whole, side by side, never cropped. Several
                posters need room, so A4 or a tall social size works best.
              </p>
            </div>
            <div className="bs-field">
              <span>Header banner photo (cropped to fill the header)</span>
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

      {crop && (
        <LogoCropper
          key={(crop.id || "new") + crop.initial.orig.length}
          initial={crop.initial}
          hasNext={crop.queue.length > 0}
          onSave={saveCrop}
          onCancel={() => nextInQueue(crop.queue, crop.target)}
        />
      )}

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
