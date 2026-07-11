import { useEffect, useRef } from "react";

// Self-contained styling via inline styles (not a CSS class) so this
// component has no dependency on whatever global stylesheet is in play —
// it only needs to be a full-screen, click-through, top-layer canvas.
const CANVAS_STYLE = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 1001, // above Confetti's z-index: 1000
};

const COLORS = [
  "#e94560",
  "#533483",
  "#ffd700",
  "#4caf50",
  "#29b6f6",
  "#ff6ec7",
  "#eaeaea",
];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

export default function Fireworks({ duration = 5000, launchInterval = 550 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let rockets = [];
    let sparks = [];
    let lastLaunch = 0;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function launchRocket() {
      const x = canvas.width * (0.15 + Math.random() * 0.7);
      const targetY = canvas.height * (0.15 + Math.random() * 0.35);
      rockets.push({
        x,
        y: canvas.height,
        targetY,
        vy: -(8 + Math.random() * 3),
        color: randomColor(),
        trail: [],
      });
    }

    function explode(rocket) {
      const count = 46 + Math.floor(Math.random() * 24);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 2 + Math.random() * 3.2;
        sparks.push({
          x: rocket.x,
          y: rocket.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: rocket.color,
          life: 1,
          decay: 0.012 + Math.random() * 0.012,
        });
      }
    }

    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (elapsed < duration && now - lastLaunch > launchInterval) {
        lastLaunch = now;
        launchRocket();
      }

      rockets = rockets.filter((r) => {
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 8) r.trail.shift();
        r.y += r.vy;
        r.vy += 0.05; // gravity gradually kills the climb
        r.trail.forEach((p, i) => {
          ctx.globalAlpha = i / r.trail.length;
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        const reachedApex = r.vy >= 0 || r.y <= r.targetY;
        if (reachedApex) {
          explode(r);
          return false;
        }
        return true;
      });

      sparks = sparks.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.045; // gravity
        s.vx *= 0.985; // air drag
        s.life -= s.decay;
        if (s.life <= 0) return false;
        ctx.globalAlpha = Math.max(s.life, 0);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      if (elapsed < duration + 2500 || rockets.length || sparks.length) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [duration, launchInterval]);

  return <canvas ref={canvasRef} style={CANVAS_STYLE} />;
}
