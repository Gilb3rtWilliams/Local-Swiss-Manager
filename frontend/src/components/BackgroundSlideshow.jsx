import { useEffect, useRef, useState } from "react";
import "../css/BackgroundSlideshow.css";

/**
 * Full-bleed, crossfading background image slideshow. Drop it inside any
 * `position: relative` (or fixed) container and it fills that container —
 * it doesn't size itself.
 *
 * Usage:
 *   <section style={{ position: "relative" }}>
 *     <BackgroundSlideshow images={["/images/hall/1.jpg", "/images/hall/2.jpg"]} />
 *     <div style={{ position: "relative", zIndex: 1 }}>...your content...</div>
 *   </section>
 *
 * With zero (or one) images it still renders a themed gradient fallback —
 * so pages using it don't break before you've added real photos.
 */
export default function BackgroundSlideshow({
  images = [],
  interval = 7000,
  overlay = "dark", // "dark" | "light" | "none"
  kenBurns = true,
  className = "",
}) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (images.length < 2) return undefined;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, interval);
    return () => clearInterval(timerRef.current);
  }, [images, interval]);

  if (images.length === 0) {
    return (
      <div className={`bgshow bgshow-fallback ${className}`} aria-hidden="true">
        {overlay !== "none" && <div className={`bgshow-overlay bgshow-overlay-${overlay}`} />}
      </div>
    );
  }

  return (
    <div className={`bgshow ${className}`} aria-hidden="true">
      {images.map((src, i) => (
        <div
          key={src}
          className={`bgshow-slide${i === index ? " bgshow-slide-active" : ""}${
            kenBurns ? " bgshow-slide-ken" : ""
          }`}
          style={{
            backgroundImage: `url(${src})`,
            animationDuration: kenBurns ? `${interval}ms` : undefined,
          }}
        />
      ))}
      {overlay !== "none" && <div className={`bgshow-overlay bgshow-overlay-${overlay}`} />}
      {images.length > 1 && (
        <div className="bgshow-dots">
          {images.map((src, i) => (
            <span key={src} className={i === index ? "bgshow-dot bgshow-dot-active" : "bgshow-dot"} />
          ))}
        </div>
      )}
    </div>
  );
}
