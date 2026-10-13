"use client";

import { useEffect, useRef, useState } from "react";

/* A small bouncing arrow that says "there is more below".
   It sits at the bottom right, just outside the cards on wide screens, and fades away on its own
   once the visitor scrolls a little. It comes back if they return to the top. */

/* ================= TUNING KNOBS ================= */
const HIDE_AFTER_PX = 80; // hides once the page is scrolled this far
const MIN_EXTRA_PX = 120; // only shows when there is at least this much page below the fold
const SIZE = 32; // circle size (px)
const BOTTOM = "1.5rem"; // distance from the bottom edge
const BOUNCE_PX = 6; // how far it jumps
const BOUNCE_MS = 1400; // time for one jump
/* ================================================= */

export default function ScrollHint() {
  const [show, setShow] = useState(false);
  const bob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => {
      const more = document.documentElement.scrollHeight > window.innerHeight + MIN_EXTRA_PX;
      const wide = window.innerWidth >= 640; // on phones it would sit on top of the content, so it stays hidden
      setShow(wide && more && window.scrollY < HIDE_AFTER_PX);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const t = setTimeout(check, 600); // content (fonts, feed) may change the page height just after load
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  useEffect(() => {
    const el = bob.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = el.animate(
      [{ transform: "translateY(0)" }, { transform: `translateY(${BOUNCE_PX}px)` }, { transform: "translateY(0)" }],
      { duration: BOUNCE_MS, iterations: Infinity, easing: "ease-in-out" }
    );
    return () => a.cancel();
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: BOTTOM,
        // just outside the cards on wide screens, tucked to the edge on narrow ones
        right: "max(0.75rem, calc(50vw - 36rem - 2.75rem))",
        zIndex: 40,
        pointerEvents: "none",
        opacity: show ? 1 : 0,
        transition: "opacity 0.3s",
      }}
    >
      <div
        ref={bob}
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: "var(--accent)",
          color: "var(--on-accent)",
          border: "1px solid var(--edge)",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 9l7 7 7-7" />
        </svg>
      </div>
    </div>
  );
}
