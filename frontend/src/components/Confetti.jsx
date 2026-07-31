import { useEffect, useRef } from "react";

const COLORS = [
  "#d4a853",
  "#ffffff",
  "#4caf50",
  "#f44336",
  "#2196f3",
  "#e5b964",
];

export default function Confetti({ duration = 5000 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    let particles;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function makeParticle() {
      return {
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.3,
        w: 7 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vy: 2.2 + Math.random() * 3.5,
        vx: -1.5 + Math.random() * 3,
        rot: Math.random() * 360,
        vrot: -4 + Math.random() * 8,
        flip: Math.random() * Math.PI * 2,
        vflip: 0.04 + Math.random() * 0.08,
      };
    }
    particles = Array.from({ length: 180 }, makeParticle);

    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.flip += p.vflip;

        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }

        // 3D Foil flip scale calculation
        const scaleY = Math.cos(p.flip);
        const lightIntensity = 0.6 + Math.abs(scaleY) * 0.4;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.scale(1, scaleY); // 3D metallic flip perspective

        ctx.globalAlpha = lightIntensity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < duration) {
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
  }, [duration]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1001,
      }}
    />
  );
}
