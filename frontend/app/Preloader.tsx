"use client";

import { useEffect, useState } from "react";

// Quick splash: logo bounces while the app boots, then fades away.
// Shows for ~2s — just enough to feel intentional, never blocking.
export default function Preloader() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1700);
    const t2 = setTimeout(() => setGone(true), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      aria-hidden="true"
      className="preload-wrap"
      data-leaving={leaving ? "true" : "false"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/terrace-logo.svg" alt="" className="preload-logo" />
      <div className="preload-word">TERRACE</div>
    </div>
  );
}
