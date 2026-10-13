"use client";

import dynamic from "next/dynamic";
import Preloader from "./Preloader";

// The app depends on the current time (post ages, ranking) and on the visitor's wallet,
// so it renders only in the browser. This keeps Next.js from freezing "now" at build time.
const Terrace = dynamic(() => import("./Terrace"), { ssr: false });

export default function ClientApp() {
  return (
    <>
      <Preloader />
      <Terrace />
    </>
  );
}
