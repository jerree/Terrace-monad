"use client";

import { useEffect, useRef } from "react";

/* ================= TUNING KNOBS ================= */
const ACCENT_DEFAULT = "#D9A441"; // glow colour on dark themes
const ACCENT_LIGHT_DEFAULT = "var(--pitch)"; // glow colour on light themes (deep Monad purple, so it shows on a bright page)
const CHALK_DEFAULT = "auto"; // line colour at rest. "auto" = the page's text colour (works in light and dark themes)
const FIT = "cover" as "cover" | "contain"; // cover = pitch fills the screen, contain = whole pitch visible
const OVERSCAN = 1.04; // cover only: >1 crops the pitch edges a little
const BASE_ALPHA = 0.05; // how visible the chalk lines are with no cursor
const LINE_WIDTH = 1.5; // chalk line thickness (px)
const GLOW_WIDTH = 8; // soft halo thickness (px)
const GLOW_ALPHA = 0.16; // halo strength at full heat
const CORE_ALPHA = 0.7; // brightest a lit line gets (lower = calmer behind text)
const LIGHT_RADIUS = 190; // how far the light reaches from the cursor (px)
const MARKING_BOOST = 0.45; // extra glow on the whole marking nearest the cursor
const MARKING_REACH = 2.5; // how close the cursor must be for that whole-marking boost (x light radius squared)
const RISE_MS = 90; // how fast lines light up
const DECAY_MS = 750; // how slowly they cool after the cursor leaves
const LAMP_FOLLOW_MS = 110; // how smoothly the light glides after the pointer
const LAMP_RADIUS = 300; // size of the soft light pool (px)
const LAMP_ALPHA = 0.1; // strength of the light pool
const SEGMENT_PX = 26; // lines are cut into pieces this long so each lights up on its own
const MAX_DPR = 2; // pixel ratio cap
// Light theme only: a bright page needs darker, stronger marks to be seen
const LIGHT_BASE_ALPHA = 0.09; // chalk lines with no cursor
const LIGHT_GLOW_WIDTH = 10; // halo thickness (px)
const LIGHT_GLOW_ALPHA = 0.24; // halo strength at full heat
const LIGHT_CORE_MULT = 2.4; // lit line thickness, times LINE_WIDTH
const LIGHT_LAMP_RADIUS = 340; // size of the tinted light pool under the cursor (px)
const LIGHT_LAMP_ALPHA = 0.28; // strength of that pool
/* ================================================= */

type RGB = [number, number, number];
type Pt = [number, number];
type Props = { accent?: string; accentLight?: string; chalk?: string; fit?: "cover" | "contain" };

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

let scratch: CanvasRenderingContext2D | null = null;
function toRGB(input: string): RGB {
  scratch = scratch ?? document.createElement("canvas").getContext("2d")!;
  scratch.fillStyle = "#000";
  scratch.fillStyle = input;
  const v = String(scratch.fillStyle);
  if (v[0] === "#") return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  const m = (v.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
  return [m[0], m[1], m[2]];
}

// Turns "var(--accent)" into the real colour for the current theme
function resolve(input: string): string {
  const m = input.match(/^var\((--[^,)]+)(?:,\s*(.+))?\)$/);
  if (!m) return input;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v || m[2] || ACCENT_DEFAULT;
}

/* A real pitch is 105 x 68 metres. Every marking is a polyline in metres. */
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });

function pitchLines(): Pt[][] {
  const L = 105, W = 68, cy = W / 2, TAU = Math.PI * 2;
  const out: Pt[][] = [
    [[0, 0], [L, 0], [L, W], [0, W], [0, 0]], // touchlines and goal lines
    [[L / 2, 0], [L / 2, W]], // halfway line
    arc(L / 2, cy, 9.15, 0, TAU, 48), // centre circle
    arc(L / 2, cy, 0.35, 0, TAU, 8), // centre spot
  ];
  for (const side of [0, 1]) {
    const f = (x: number) => (side ? L - x : x);
    const box = (d: number, hw: number): Pt[] => [[f(0), cy - hw], [f(d), cy - hw], [f(d), cy + hw], [f(0), cy + hw]];
    out.push(box(16.5, 20.16)); // penalty area
    out.push(box(5.5, 9.16)); // six-yard box
    out.push(arc(f(11), cy, 0.35, 0, TAU, 8)); // penalty spot
    const a = Math.acos((16.5 - 11) / 9.15); // penalty arc, only the part outside the box
    out.push(side ? arc(f(11), cy, 9.15, Math.PI - a, Math.PI + a, 20) : arc(f(11), cy, 9.15, -a, a, 20));
    out.push(arc(f(0), 0, 1, side ? Math.PI / 2 : 0, side ? Math.PI : Math.PI / 2, 6)); // corner arcs
    out.push(arc(f(0), W, 1, side ? Math.PI : -Math.PI / 2, side ? 1.5 * Math.PI : 0, 6));
  }
  return out;
}

/* Maps the pitch onto the screen and cuts every line into short segments */
function build(w: number, h: number, lines: Pt[][], fit: "cover" | "contain") {
  const portrait = h > w; // on phones the pitch turns to run top to bottom
  const Lm = portrait ? 68 : 105, Wm = portrait ? 105 : 68;
  const sx = w / Lm, sy = h / Wm;
  const s = fit === "cover" ? Math.max(sx, sy) * OVERSCAN : Math.min(sx, sy) * 0.92;
  const ox = (w - Lm * s) / 2, oy = (h - Wm * s) / 2;
  const map = ([x, y]: Pt): Pt => (portrait ? [ox + y * s, oy + x * s] : [ox + x * s, oy + y * s]);

  const x1: number[] = [], y1: number[] = [], x2: number[] = [], y2: number[] = [];
  const mx: number[] = [], my: number[] = [], id: number[] = [];
  lines.forEach((poly, k) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, ay] = map(poly[i]);
      const [bx, by] = map(poly[i + 1]);
      const pieces = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / SEGMENT_PX));
      for (let p = 0; p < pieces; p++) {
        const t0 = p / pieces, t1 = (p + 1) / pieces;
        x1.push(ax + (bx - ax) * t0); y1.push(ay + (by - ay) * t0);
        x2.push(ax + (bx - ax) * t1); y2.push(ay + (by - ay) * t1);
        mx.push(ax + (bx - ax) * (t0 + t1) / 2); my.push(ay + (by - ay) * (t0 + t1) / 2);
        id.push(k);
      }
    }
  });
  return { n: x1.length, x1, y1, x2, y2, mx, my, id };
}

export default function PitchGlow({ accent = ACCENT_DEFAULT, accentLight = ACCENT_LIGHT_DEFAULT, chalk = CHALK_DEFAULT, fit = FIT }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const lines = pitchLines();

    let w = 0, h = 0;
    let geo = build(1, 1, lines, fit);
    let heat = new Float32Array(0);
    let acc: RGB = [217, 164, 65], ink: RGB = [237, 233, 220], darkBg = true;
    let mx = 0, my = 0, active = false, lampX = 0, lampY = 0, lampP = 0;
    let raf = 0, last = 0;

    const colors = () => {
      ink = toRGB(chalk === "auto" ? getComputedStyle(document.body).color : resolve(chalk));
      darkBg = 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2] > 140; // light chalk means a dark page
      acc = toRGB(resolve(darkBg ? accent : accentLight));
    };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo = build(w, h, lines, fit);
      heat = new Float32Array(geo.n);
    };

    const paint = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = rgba(ink, (darkBg ? BASE_ALPHA : LIGHT_BASE_ALPHA) * (w < 640 ? 0.5 : 1)); // half as strong on phones
      ctx.lineWidth = LINE_WIDTH;
      ctx.beginPath();
      for (let i = 0; i < geo.n; i++) {
        ctx.moveTo(geo.x1[i], geo.y1[i]);
        ctx.lineTo(geo.x2[i], geo.y2[i]);
      }
      ctx.stroke();

      if (lampP > 0.004) { // soft pool of light (dark theme) or tint (light theme)
        const R = darkBg ? LAMP_RADIUS : LIGHT_LAMP_RADIUS;
        ctx.globalCompositeOperation = darkBg ? "lighter" : "multiply";
        const g = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, R);
        g.addColorStop(0, rgba(acc, (darkBg ? LAMP_ALPHA : LIGHT_LAMP_ALPHA) * lampP));
        g.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = g;
        ctx.fillRect(lampX - R, lampY - R, R * 2, R * 2);
      }

      ctx.globalCompositeOperation = darkBg ? "lighter" : "source-over";
      ctx.lineCap = "butt";
      const gw = darkBg ? GLOW_WIDTH : LIGHT_GLOW_WIDTH;
      const ga = darkBg ? GLOW_ALPHA : LIGHT_GLOW_ALPHA;
      const cw = LINE_WIDTH * (darkBg ? 1.6 : LIGHT_CORE_MULT);
      for (let i = 0; i < geo.n; i++) {
        const v = heat[i];
        if (v < 0.02) continue;
        ctx.beginPath();
        ctx.moveTo(geo.x1[i], geo.y1[i]);
        ctx.lineTo(geo.x2[i], geo.y2[i]);
        ctx.strokeStyle = rgba(acc, v * ga);
        ctx.lineWidth = gw;
        ctx.stroke();
        ctx.strokeStyle = rgba(acc, Math.min(CORE_ALPHA, v * (darkBg ? 1 : 1.1)));
        ctx.lineWidth = cw;
        ctx.stroke();
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const kRise = 1 - Math.exp(-dt / RISE_MS);
      const kDecay = Math.exp(-dt / DECAY_MS);
      const kLamp = 1 - Math.exp(-dt / LAMP_FOLLOW_MS);

      if (active) {
        lampX += (mx - lampX) * kLamp;
        lampY += (my - lampY) * kLamp;
        lampP += (1 - lampP) * kRise;
      } else {
        lampP *= kDecay;
      }

      // which marking is closest to the light?
      let bestD = Infinity, bestId = -1;
      if (active) {
        for (let i = 0; i < geo.n; i++) {
          const dx = geo.mx[i] - lampX, dy = geo.my[i] - lampY;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; bestId = geo.id[i]; }
        }
      }
      const R2 = LIGHT_RADIUS * LIGHT_RADIUS;
      const boost = bestId >= 0 ? MARKING_BOOST * Math.exp(-bestD / (R2 * MARKING_REACH)) : 0;

      let peak = 0;
      for (let i = 0; i < geo.n; i++) {
        let target = 0;
        if (active) {
          const dx = geo.mx[i] - lampX, dy = geo.my[i] - lampY;
          target = Math.exp(-(dx * dx + dy * dy) / R2);
          if (geo.id[i] === bestId) target += boost;
          if (target > 1) target = 1;
        }
        let v = heat[i];
        v = target > v ? v + (target - v) * kRise : Math.max(target, v * kDecay);
        heat[i] = v;
        if (v > peak) peak = v;
      }

      paint();
      if (active || peak > 0.004 || lampP > 0.004) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0; // everything has cooled down, so the loop stops until the next move
        heat.fill(0);
        lampP = 0;
        paint();
      }
    };

    const start = () => {
      if (raf || reduced.matches) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!active) {
        active = true;
        if (lampP < 0.01) { lampX = mx; lampY = my; }
      }
      start();
    };
    const onLeave = () => {
      active = false;
      start();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") onLeave();
    };
    const onResize = () => {
      size();
      paint();
    };
    const onMotionChange = () => {
      if (reduced.matches) {
        cancelAnimationFrame(raf);
        raf = 0;
        active = false;
        heat.fill(0);
        lampP = 0;
        paint();
      }
    };

    colors();
    size();
    paint(); // with reduced motion this single frame is all you get

    if (!reduced.matches) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("blur", onLeave);
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    window.addEventListener("resize", onResize);
    reduced.addEventListener("change", onMotionChange);
    const themeWatch = new MutationObserver(() => {
      colors();
      paint();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      reduced.removeEventListener("change", onMotionChange);
      themeWatch.disconnect();
    };
  }, [accent, accentLight, chalk, fit]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-variant="pitch-glow"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: -1 }}
    />
  );
}
