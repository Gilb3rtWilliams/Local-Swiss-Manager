import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SHAPES = [
  ["original", "As is"],
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["circle", "Circle"],
  ["wide", "Wide 2:1"],
];

const VW = 280;
const viewH = (shape) => (shape === "wide" ? 140 : 280);
const radiusFrac = (shape) => (shape === "circle" ? 0.5 : shape === "rounded" ? 0.18 : shape === "wide" ? 0.04 : 0);

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Bake the chosen crop + shape into a transparent PNG so the brochure (and its
// exports) just draw a plain picture.
function bake(img, shape, zoom, nx, ny) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (shape === "original") {
    const k = Math.min(1, 600 / Math.max(iw, ih));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(iw * k));
    c.height = Math.max(1, Math.round(ih * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }
  const vh = viewH(shape);
  const out = shape === "wide" ? { w: 800, h: 400 } : { w: 480, h: 480 };
  const k = out.w / VW;
  const base = Math.max(VW / iw, vh / ih);
  const s = base * zoom;
  const c = document.createElement("canvas");
  c.width = out.w;
  c.height = out.h;
  const ctx = c.getContext("2d");
  roundRectPath(ctx, 0, 0, out.w, out.h, radiusFrac(shape) * out.w);
  ctx.clip();
  ctx.drawImage(
    img,
    (VW / 2 - (iw * s) / 2 + nx * VW) * k,
    (vh / 2 - (ih * s) / 2 + ny * vh) * k,
    iw * s * k,
    ih * s * k
  );
  return c.toDataURL("image/png");
}

export default function LogoCropper({ initial, hasNext, onSave, onCancel }) {
  const [shape, setShape] = useState(initial.shape || "original");
  const [zoom, setZoom] = useState(initial.crop?.zoom || 1);
  const [pos, setPos] = useState({ x: (initial.crop?.nx || 0) * VW, y: (initial.crop?.ny || 0) * viewH(initial.shape || "original") });
  const [dim, setDim] = useState(null);
  const imgEl = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      imgEl.current = im;
      setDim({ w: im.naturalWidth, h: im.naturalHeight });
    };
    im.src = initial.orig;
  }, [initial.orig]);

  const vh = viewH(shape);
  const isOriginal = shape === "original";

  const geo = useMemo(() => {
    if (!dim) return null;
    if (isOriginal) {
      const s = Math.min(VW / dim.w, vh / dim.h);
      return { s, max: { x: 0, y: 0 } };
    }
    const s = Math.max(VW / dim.w, vh / dim.h) * zoom;
    return { s, max: { x: Math.max(0, (dim.w * s - VW) / 2), y: Math.max(0, (dim.h * s - vh) / 2) } };
  }, [dim, zoom, vh, isOriginal]);

  const clamp = (p, g = geo) =>
    g ? { x: Math.max(-g.max.x, Math.min(g.max.x, p.x)), y: Math.max(-g.max.y, Math.min(g.max.y, p.y)) } : p;
  const at = geo ? clamp(pos) : pos;

  const changeShape = (sh) => {
    setShape(sh);
    setPos({ x: 0, y: 0 });
    setZoom(1);
  };

  const onDown = (e) => {
    if (isOriginal) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };
  const onUp = () => {
    drag.current = null;
  };

  const save = (asIs) => {
    if (!imgEl.current) return;
    const sh = asIs ? "original" : shape;
    const nx = at.x / VW;
    const ny = at.y / vh;
    onSave({
      orig: initial.orig,
      shape: sh,
      src: bake(imgEl.current, sh, zoom, nx, ny),
      crop: asIs ? null : { zoom, nx, ny },
    });
  };

  const style = {
    width: VW,
    height: vh,
    borderRadius: isOriginal ? 6 : `${radiusFrac(shape) * 100}%`,
  };
  if (shape === "wide") style.borderRadius = radiusFrac("wide") * VW;

  return createPortal(
    <div className="bc-back" role="dialog" aria-modal="true" aria-label="Crop logo">
      <div className="bc-box">
        <h3>Shape &amp; crop logo</h3>
        <div
          className={`bc-view${isOriginal ? " is-static" : ""}`}
          style={style}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => !isOriginal && setZoom((z) => Math.max(1, Math.min(5, z - e.deltaY * 0.002)))}
        >
          {geo && (
            <img
              src={initial.orig}
              alt=""
              draggable={false}
              style={{
                width: dim.w * geo.s,
                height: dim.h * geo.s,
                left: VW / 2 - (dim.w * geo.s) / 2 + at.x,
                top: vh / 2 - (dim.h * geo.s) / 2 + at.y,
              }}
            />
          )}
        </div>
        <div className="bc-shapes">
          {SHAPES.map(([k, l]) => (
            <button key={k} className={`bc-shape${shape === k ? " is-on" : ""}`} onClick={() => changeShape(k)}>
              {l}
            </button>
          ))}
        </div>
        {!isOriginal && (
          <label className="bs-field">
            <span>Zoom — drag the picture to reposition</span>
            <input
              className="bc-range"
              type="range"
              min="1"
              max="5"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
            />
          </label>
        )}
        <div className="bc-actions">
          <button className="bs-btn" onClick={onCancel}>{hasNext ? "Skip" : "Cancel"}</button>
          <button className="bs-btn bs-btn--primary" onClick={() => save(false)} disabled={!dim}>
            Use{hasNext ? " & next" : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
