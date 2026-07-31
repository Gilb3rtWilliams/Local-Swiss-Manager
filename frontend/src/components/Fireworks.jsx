import { useEffect, useRef } from "react";

const CANVAS_STYLE = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 1002,
};

const COLORS = [
  "#d4a853",
  "#ffffff",
  "#e5b964",
  "#4caf50",
  "#2196f3",
  "#f44336",
];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

export default function Fireworks({ duration = 6000, launchInterval = 500 }) {
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
        vy: -(9 + Math.random() * 3),
        color: randomColor(),
        trail: [],
      });
    }

    function explode(rocket) {
      const count = 55 + Math.floor(Math.random() * 25);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 2.2 + Math.random() * 3.8;
        const isWillow = Math.random() < 0.35; // 35% long gold willow dust

        sparks.push({
          x: rocket.x,
          y: rocket.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: isWillow ? "#d4a853" : rocket.color,
          life: 1,
          decay: isWillow
            ? 0.007 + Math.random() * 0.006
            : 0.014 + Math.random() * 0.012,
          gravity: isWillow ? 0.025 : 0.048,
          flicker: isWillow,
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
        r.vy += 0.05;

        r.trail.forEach((p, i) => {
          ctx.globalAlpha = i / r.trail.length;
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalAlpha = 1;
        if (r.vy >= 0 || r.y <= r.targetY) {
          explode(r);
          return false;
        }
        return true;
      });

      sparks = sparks.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += s.gravity;
        s.vx *= 0.982;
        s.life -= s.decay;

        if (s.life <= 0) return false;

        const flickerAlpha = s.flicker
          ? Math.max(0, s.life) * (0.4 + Math.random() * 0.6)
          : Math.max(0, s.life);

        ctx.globalAlpha = flickerAlpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.flicker ? 1.8 : 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      if (elapsed < duration + 3000 || rockets.length || sparks.length) {
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
