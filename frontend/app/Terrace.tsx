"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { rules as baseRules } from "@/lib/mockData";
import { useTerrace } from "@/lib/useTerrace";
import { rankPosts } from "@/lib/rank";
import ConnectWallet from "./ConnectWallet";
import PitchGlow from "@/components/backgrounds/PitchGlow";
import ScrollHint from "./ScrollHint";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "900"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"] });

const COL = { r: "var(--light)", t: "var(--tips)", b: "var(--fans)" };
const MUTED = { color: "var(--muted)" };
const PROFILE_PAGE_SIZE = 10; // posts shown at a time on the profile card

const THEMES = [
  { id: "monad", label: "Monad", a: "#3B1D8F", b: "#B8A6FF" },
  { id: "monad-dark", label: "Monad Dark", a: "#0F0A1E", b: "#836EF9" },
];

type W = { r: number; t: number; b: number }; // percents, always sum to 100

const short = (a: string) => (a.startsWith("0x") && a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);

const ago = (t: number) => {
  const h = (Date.now() - t) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

// Move one slider; the other two share what is left, so the total stays 100
function adjust(w: W, key: keyof W, v: number): W {
  const keys: (keyof W)[] = ["r", "t", "b"];
  const [a, b] = keys.filter((k) => k !== key);
  const rest = 100 - v;
  const sum = w[a] + w[b];
  const na = sum === 0 ? Math.round(rest / 2) : Math.round((w[a] / sum) * rest);
  return { ...w, [key]: v, [a]: na, [b]: rest - na } as W;
}

function Bar({ r, t, b, dark }: { r: number; t: number; b: number; dark?: boolean }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: dark ? "var(--track-inv)" : "var(--track)" }}>
      <div style={{ flex: r, background: COL.r }} />
      <div style={{ flex: t, background: COL.t }} />
      <div style={{ flex: b, background: COL.b }} />
    </div>
  );
}

const arrowStyle = (side: "left" | "right"): CSSProperties => ({
  position: "absolute",
  top: 37,
  [side]: -12,
  transform: "translateY(-50%)",
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  zIndex: 5,
});

function Chevron({ dir }: { dir: number }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function Move({ d }: { d: number }) {
  if (!d) return <div className="h-4" />;
  return (
    <div
      className={`${mono.className} text-xs font-medium`}
      style={{ color: d > 0 ? "var(--tips)" : "#B3261E" }}
      aria-label={d > 0 ? `up ${d}` : `down ${-d}`}
    >
      {d > 0 ? "▲" : "▼"}
      {Math.abs(d)}
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState("monad");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("terrace-theme");
      if (saved && THEMES.some((x) => x.id === saved)) setTheme(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("terrace-theme", theme);
    } catch {}
  }, [theme]);
  const t = useTerrace();
  const { rules, posts } = t;
  const [ruleId, setRuleId] = useState<number | null>(null);
  const rule = rules.find((r) => r.id === ruleId) ?? rules[0];
  const ranked = useMemo(() => (rule ? rankPosts(posts, rule) : []), [posts, rule]);
  const topScore = ranked[0]?.score || 1;

  // "Write your own rule" form
  const [name, setName] = useState("");
  const [w, setW] = useState<W>({ r: 34, t: 33, b: 33 });
  const [published, setPublished] = useState("");

  useEffect(() => setMounted(true), []);

  // New post box
  const [draft, setDraft] = useState("");
  const addPost = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await t.addPost(text)) setDraft("");
  };

  // Earnings (demo mode): every tip splits 90% to the post author, 10% to the rule author.
  const [withdrawn, setWithdrawn] = useState(0);
  const earned = useMemo(() => {
    const m = new Map<string, { post: number; rule: number }>();
    const add = (who: string, k: "post" | "rule", v: number) => {
      const e = m.get(who) ?? { post: 0, rule: 0 };
      e[k] += v;
      m.set(who, e);
    };
    posts.forEach((p) =>
      p.tips.forEach((tp) => {
        const rid = tp.ruleId ?? baseRules[p.id % baseRules.length].id;
        const cut = tp.amount * 0.1;
        add(p.author, "post", tp.amount - cut);
        const ra = rules.find((r) => r.id === rid)?.author;
        if (ra) add(ra, "rule", cut);
      })
    );
    return m;
  }, [posts, rules]);
  const mine = earned.get("you") ?? { post: 0, rule: 0 };
  const balance = t.live ? (t.balance ?? 0) : mine.post + mine.rule - withdrawn;
  const topRuleAuthors: [string, { rule: number }][] = t.live
    ? t.leaderboard.map((x) => [x.who, { rule: x.amount }])
    : [...earned.entries()]
        .filter(([, e]) => e.rule > 0)
        .sort((a, b) => b[1].rule - a[1].rule)
        .slice(0, 3);
  // Two decimals. A balance too small for that (for example 0.001 from one tip) shows its real value, never 0.00
  const fmt = (n: number) => {
    const s = n.toFixed(2);
    if (n <= 0 || s !== "0.00") return s;
    const t = n.toFixed(4).replace(/0+$/, "");
    return t.endsWith(".") ? "<0.0001" : t;
  };

  // Profile: nickname plus your own posts. In demo mode you are "you", in live mode your wallet address.
  const me = t.live ? t.address : "you";
  const label = (a: string) => t.nicknames[a] || short(a);
  const myName = me ? t.nicknames[me] ?? "" : "";
  const myPosts = posts.filter((p) => p.author === me).sort((a, b) => b.createdAt - a.createdAt);
  const tipsOn = (p: { tips: { amount: number }[] }) => p.tips.reduce((x, tp) => x + tp.amount, 0);
  const myTips = myPosts.reduce((x, p) => x + tipsOn(p), 0);
  const [nick, setNick] = useState("");
  const [myPage, setMyPage] = useState(0);
  const [openBackers, setOpenBackers] = useState<Set<number>>(new Set()); // collapsed by default
  const toggleBackers = (id: number) =>
    setOpenBackers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pages = Math.max(1, Math.ceil(myPosts.length / PROFILE_PAGE_SIZE));
  const pg = Math.min(myPage, pages - 1);
  const shown = myPosts.slice(pg * PROFILE_PAGE_SIZE, (pg + 1) * PROFILE_PAGE_SIZE);
  const saveNick = async () => {
    const n = nick.trim();
    if (!n) return;
    if (await t.setNickname(n)) setNick("");
  };

  // Slide posts to their new spots, and remember how far each one moved
  const els = useRef(new Map<number, HTMLElement>());
  const prevTop = useRef(new Map<number, number>());
  const prevRank = useRef(new Map<number, number>());
  const prevSig = useRef("");
  const [moves, setMoves] = useState<Map<number, number>>(new Map());
  useLayoutEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ranked.forEach((p) => {
      const el = els.current.get(p.id);
      if (!el) return;
      const top = el.offsetTop;
      const before = prevTop.current.get(p.id);
      if (!calm && before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 450,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
      prevTop.current.set(p.id, top);
    });
    const sig = ranked.map((p) => p.id).join(",");
    if (sig !== prevSig.current) {
      if (prevSig.current) {
        const m = new Map<number, number>();
        ranked.forEach((p, i) => {
          const before = prevRank.current.get(p.id);
          if (before !== undefined && before !== i) m.set(p.id, before - i);
        });
        setMoves(m);
      }
      prevSig.current = sig;
      prevRank.current = new Map(ranked.map((p, i) => [p.id, i]));
    }
  }, [ranked]);

  const tip = (id: number) => t.tip(id, rule.id);

  // Arrow buttons on the edges scroll the rule tabs, and only show when there is more to see
  const tabsRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const [hot, setHot] = useState<"l" | "r" | null>(null); // which arrow is being pointed at
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const check = () => setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [rules.length, !!rule]);
  const scrollTabs = (dir: number) => tabsRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  const selectNewest = useRef(false);
  useEffect(() => {
    if (selectNewest.current && rules.length) {
      setRuleId(Math.max(...rules.map((r) => r.id)));
      selectNewest.current = false;
    }
  }, [rules]);
  const publish = async () => {
    const clean = name.trim();
    if (!clean) return;
    selectNewest.current = true;
    const ok = await t.publishRule(clean, w.r * 100, w.t * 100, w.b * 100);
    if (!ok) {
      selectNewest.current = false;
      return;
    }
    setPublished(clean);
    setName("");
  };

  const sliders: { key: keyof W; label: string; c: string }[] = [
    { key: "r", label: "Recency", c: COL.r },
    { key: "t", label: "Tips", c: COL.t },
    { key: "b", label: "Different backers", c: COL.b },
  ];

  if (!rule) {
    return (
      <div className={`${body.className} flex min-h-screen items-center justify-center px-5 text-center`}>
        {t.loading ? "Loading the feed..." : t.error || "No rules are published yet. Ask David to run the seed script."}
      </div>
    );
  }

  const legend = [
    { label: "Recency", v: rule.wRecency, c: COL.r },
    { label: "Tips", v: rule.wTips, c: COL.t },
    { label: "Different backers", v: rule.wBackers, c: COL.b },
  ];

  return (
    <div className={`${body.className} min-h-screen`}>
      <PitchGlow />
      <ScrollHint />
      <header>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-5 pb-3 pt-6 sm:px-8">
          <div>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/terrace-logo.svg" alt="" className="h-10 w-10 shrink-0 sm:h-20 sm:w-20" />
              <h1 className={`${display.className} text-5xl font-black leading-[0.82] tracking-tight sm:text-8xl`}>TERRACE</h1>
            </div>
            <p className={`${mono.className} mt-2 text-xs`} style={MUTED}>
              Open talk, ranked by the rule you choose.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
          <div className="flex items-center gap-2" role="group" aria-label="Colour theme">
              <span className={`${mono.className} hidden text-xs sm:inline`} style={MUTED}>
                Theme:
              </span>
              {THEMES.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setTheme(x.id)}
                  aria-pressed={theme === x.id}
                  aria-label={`${x.label} theme`}
                  title={x.label}
                  className="swatch h-7 w-7 rounded-full sm:h-8 sm:w-8"
                  style={{
                    background: `linear-gradient(135deg, ${x.a} 50%, ${x.b} 50%)`,
                    border: "1.5px solid var(--edge)",
                    boxShadow: theme === x.id ? "0 0 0 3px var(--paper), 0 0 0 5px var(--edge)" : "none",
                  }}
                />
              ))}
            </div>
            <ConnectWallet />
          </div>
        </div>
        <div className="grass" />
      </header>

      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Topics">
          <span className={`${mono.className} mr-1 hidden text-xs sm:inline`} style={MUTED}>
            Topic
          </span>
          <span
            className="flex items-center gap-2 rounded-full px-3 py-0.5 text-xs font-semibold sm:px-3.5 sm:py-1 sm:text-sm"
            style={{ background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--edge)" }}
            aria-current="true"
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--on-accent)" }} />
            Football
          </span>
          {["Music", "Film", "Tech"].map((x) => (
            <span
              key={x}
              title="Coming soon"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs sm:px-3 sm:py-1 sm:text-sm"
              style={{ border: "1px dashed var(--edge)", color: "var(--muted)", opacity: 0.8 }}
            >
              {x}
              <span className={`${mono.className} text-[10px]`}>soon</span>
            </span>
          ))}
          <span
            className={`${mono.className} ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs`}
            style={{ border: "1px solid var(--edge)", color: "var(--muted)" }}
            title={t.live ? "Reading and writing real contracts on Monad Testnet" : "Fake data until the contracts are connected"}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.live ? "var(--tips)" : "var(--light)" }} />
            {t.live ? "Live on Monad Testnet" : "Demo data"}
          </span>
        </div>
      </div>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 pb-8 pt-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <h2 className={`${display.className} mb-2 text-3xl font-bold`}>Pick a ranking rule</h2>
          <div className="relative">
            <div className="overflow-hidden">
          <div ref={tabsRef} role="tablist" className="scroll-x -mb-6 flex snap-x gap-3 overflow-x-auto pb-10 pr-3 pt-1">
            {rules.map((r) => {
              const on = r.id === rule.id;
              return (
                <button
                  key={r.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setRuleId(r.id)}
                  className="box min-w-44 shrink-0 snap-start p-3 text-left transition-transform"
                  style={{
                    background: on ? "var(--ink)" : "var(--card)",
                    color: on ? "var(--paper)" : "var(--ink)",
                  }}
                >
                  <div className="mb-2 font-semibold leading-tight">{r.name}</div>
                  <Bar r={r.wRecency} t={r.wTips} b={r.wBackers} dark={on} />
                </button>
              );
            })}
          </div>
            </div>
            {edge.l && (
              <button
                className="btn btn-y btn-flat"
                style={{ ...arrowStyle("left"), opacity: hot === "l" ? 1 : 0.5, transition: "opacity .15s" }}
                onMouseEnter={() => setHot("l")}
                onMouseLeave={() => setHot(null)}
                aria-label="Scroll rules left" onClick={() => scrollTabs(-1)}>
                <Chevron dir={-1} />
              </button>
            )}
            {edge.r && (
              <button
                className="btn btn-y btn-flat"
                style={{ ...arrowStyle("right"), opacity: hot === "r" ? 1 : 0.5, transition: "opacity .15s" }}
                onMouseEnter={() => setHot("r")}
                onMouseLeave={() => setHot(null)}
                aria-label="Scroll rules right" onClick={() => scrollTabs(1)}>
                <Chevron dir={1} />
              </button>
            )}
          </div>

          <div className="box mb-6 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2.5 text-sm sm:px-4 sm:py-3">
            <span className={`${mono.className} flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs sm:gap-x-5`}>
              {legend.map((x) => (
                <span key={x.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: x.c }} />
                  {x.label === "Different backers" ? (
                    <>
                      <span className="hidden sm:inline">Different</span> backers
                    </>
                  ) : (
                    x.label
                  )}{" "}
                  <b>{x.v / 100}%</b>
                </span>
              ))}
            </span>
            <span className="ml-auto" style={MUTED}>
              Rule by {label(rule.author)}
            </span>
          </div>

          <section className="box mb-4 p-4">
            <label className="block">
              <span className={`${display.className} text-2xl font-bold`}>Share a football take</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 280))}
                rows={3}
                placeholder="Who is your player of the season?"
                className="field mt-2"
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <span className={`${mono.className} text-xs`} style={MUTED}>
                {draft.length}/280
              </span>
              <button onClick={addPost} disabled={!draft.trim() || t.txPending} className="btn btn-y">
                Post
              </button>
            </div>
          </section>

          {t.txPending && (
            <div role="status" className="box mb-3 px-3 py-2 text-sm">
              Confirm in your wallet, then wait a moment for the transaction to land...
            </div>
          )}
          {t.error && (
            <div role="alert" className="mb-3 rounded-xl px-3 py-2 text-sm text-white" style={{ background: "#B3261E" }}>
              {t.error}
            </div>
          )}

          {mounted && (
            <ol className="relative flex flex-col gap-3">
              {ranked.map((p, i) => (
                <li
                  key={p.id}
                  ref={(el) => {
                    if (el) els.current.set(p.id, el);
                  }}
                  className="box rise flex gap-3 p-3 sm:gap-4 sm:p-4"
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                >
                  <div className="w-9 shrink-0 text-center sm:w-14">
                    <div
                      className={`${display.className} text-4xl font-black leading-none sm:text-5xl`}
                      style={{ color: i === 0 ? "var(--focus)" : "var(--ink)" }}
                    >
                      {i + 1}
                    </div>
                    <Move d={moves.get(p.id) ?? 0} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[17px] leading-snug">{p.text}</p>
                    <div
                      className="mt-3 h-2 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--track)" }}
                      title="Yellow: recency. Green: tips. Blue: different backers."
                    >
                      <div className="flex h-full" style={{ width: `${(p.score / topScore) * 100}%` }}>
                        <div style={{ flex: p.parts.r, background: COL.r }} />
                        <div style={{ flex: p.parts.t, background: COL.t }} />
                        <div style={{ flex: p.parts.b, background: COL.b }} />
                      </div>
                    </div>
                    <div className={`${mono.className} mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs`} style={MUTED}>
                      <b title={p.author} style={{ color: "var(--ink)" }}>{label(p.author)}</b>
                      <span>{ago(p.createdAt)}</span>
                      <span>{p.totalTips} tipped</span>
                      <span>
                        {p.backers} {p.backers === 1 ? "backer" : "backers"}
                      </span>
                      <button onClick={() => tip(p.id)} disabled={t.txPending} className="btn btn-y btn-flat ml-auto">
                        {t.tipLabel}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-6 lg:mt-11 lg:self-start">
          <section className="box p-4">
            <h2 className={`${display.className} text-2xl font-bold`}>Your profile</h2>
            {t.live && !me ? (
              <p className="mt-1 text-sm" style={MUTED}>
                Connect your wallet to set a nickname and see your posts.
              </p>
            ) : (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-semibold">{myName || "No nickname yet"}</span>
                  {t.live && me && (
                    <span className={`${mono.className} text-xs`} style={MUTED}>
                      {short(me)}
                    </span>
                  )}
                </div>
                <div className={`${mono.className} mt-1 text-[10px]`} style={MUTED}>
                  {myPosts.length} {myPosts.length === 1 ? "post" : "posts"}, {fmt(myTips)} tipped to you
                </div>
                <label className="mt-3 block">
                  <span className="text-sm font-semibold">{myName ? "Change nickname" : "Choose a nickname"}</span>
                  <div className="mt-1 flex gap-2">
                    <input value={nick} onChange={(e) => setNick(e.target.value.slice(0, 20))} placeholder="e.g. CR7fan" className="field" />
                    <button onClick={saveNick} disabled={!nick.trim() || nick.trim() === myName || t.txPending} className="btn btn-y">
                      Save
                    </button>
                  </div>
                </label>
                <div className="mt-4 text-sm font-semibold">Your posts</div>
                {!mounted || myPosts.length === 0 ? (
                  <p className="mt-1 text-sm" style={MUTED}>
                    Nothing yet. Share a take below.
                  </p>
                ) : (
                  <>
                  <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                    {shown.map((p) => {
                      const b = t.backers[p.id] ?? [];
                      const open = openBackers.has(p.id);
                      return (
                      <li key={p.id} className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--track)" }}>
                        <p className="leading-snug">{p.text}</p>
                        <div className={`${mono.className} mt-1 text-xs`} style={MUTED}>
                          {ago(p.createdAt)}, {fmt(tipsOn(p))} tipped
                        </div>
                        {b.length > 0 && (
                          <button
                            onClick={() => toggleBackers(p.id)}
                            aria-expanded={open}
                            className={`${mono.className} mt-1 text-xs underline`}
                          >
                            {b.length} {b.length === 1 ? "backer" : "backers"} {open ? "▾" : "▸"}
                          </button>
                        )}
                        {open && b.length > 0 && (
                          <ul className="mt-1 flex flex-col gap-1 border-t border-black/10 pt-1">
                            {b.map((tip, i) => (
                              <li key={`${tip.tipper}-${i}`} className={`${mono.className} flex justify-between text-xs`}>
                                <span title={tip.tipper}>{label(tip.tipper)}</span>
                                <span>{fmt(tip.amount)} MON</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                  {pages > 1 && (
                    <div className={`${mono.className} mt-3 flex items-center justify-between text-xs`} style={MUTED}>
                      <button className="btn btn-flat" style={{ padding: "0.2rem 0.7rem" }} disabled={pg === 0} onClick={() => setMyPage(pg - 1)}>
                        Newer
                      </button>
                      <span>
                        Page {pg + 1} of {pages}
                      </span>
                      <button className="btn btn-flat" style={{ padding: "0.2rem 0.7rem" }} disabled={pg >= pages - 1} onClick={() => setMyPage(pg + 1)}>
                        Older
                      </button>
                    </div>
                  )}
                  </>
                )}
              </>
            )}
          </section>

          <section
            className="p-4"
            style={{ background: "var(--pitch)", color: "var(--onpitch)", border: "1px solid var(--edge)", borderRadius: 16 }}
          >
            <div className={`${mono.className} text-xs opacity-80`}>Your earnings</div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div>
                <div className={`${display.className} text-7xl font-black leading-[0.85]`} style={{ color: "var(--accent)" }}>
                  {fmt(balance)}
                </div>
                <div className={`${mono.className} mt-1 text-[10px] opacity-80`}>ready to withdraw</div>
              </div>
              <button
                onClick={() => (t.live ? t.withdraw() : setWithdrawn(mine.post + mine.rule))}
                disabled={balance <= 0 || t.txPending}
                className="btn btn-y"
                style={{ fontSize: "10px", padding: "0.3rem 0.8rem" }}
              >
                Withdraw
              </button>
            </div>
            {!t.live && (
              <div className={`${mono.className} mt-3 text-[10px] opacity-80`}>
                {fmt(mine.post)} from your posts, {fmt(mine.rule)} from your rules
              </div>
            )}
            <div className="mt-4 border-t border-white/25 pt-3 text-sm">
              <div className="mb-1 font-semibold">{t.live && !t.leaderboardAllTime ? "Rule authors, by balance held" : "Rule authors earning the most"}</div>
              {topRuleAuthors.length === 0 ? (
                <div className="opacity-80">No tips yet. Tip a post and the rule author gets 10%.</div>
              ) : (
                topRuleAuthors.map(([who, e], i) => (
                  <div key={who} className={`${mono.className} flex justify-between py-0.5 text-[10px]`}>
                    <span>
                      {i + 1}. {label(who)}
                    </span>
                    <span className="font-medium" style={{ color: "var(--accent)" }}>
                      {fmt(e.rule)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className={`${mono.className} mt-3 text-[10px] opacity-60`}>Each tip: 90% to the post author, 10% to the rule author.</div>
          </section>


          <section className="box p-4">
            <h2 className={`${display.className} text-2xl font-bold`}>Write your own rule</h2>
            <p className="mb-3 mt-1 text-sm" style={MUTED}>
              Decide what counts. If people use your rule, you earn 10% of their tips.
            </p>
            <label className="block">
              <span className="text-sm font-semibold">Rule name</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value.slice(0, 30));
                  setPublished("");
                }}
                placeholder="e.g. Derby day heat"
                className="field mt-1"
              />
            </label>
            <div className="mt-4 flex flex-col gap-3">
              {sliders.map((s) => (
                <label key={s.key} className="block">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.c }} />
                    <span className="flex-1 font-semibold">{s.label}</span>
                    <span className={`${mono.className} font-medium`}>{w[s.key]}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={w[s.key]}
                    onChange={(e) => setW(adjust(w, s.key, Number(e.target.value)))}
                    className="mt-1 w-full"
                    style={{ accentColor: "var(--ink)" }}
                    aria-label={`${s.label} weight`}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3">
              <Bar r={w.r} t={w.t} b={w.b} />
              <div className={`${mono.className} mt-1 text-xs`} style={MUTED}>
                The three always add up to 100%.
              </div>
            </div>
            <button onClick={publish} disabled={!name.trim() || t.txPending} className="btn btn-y mt-4 w-full">
              Publish rule
            </button>
            {published ? (
              <div className="mt-2 text-sm font-semibold" role="status" style={{ color: "var(--focus)" }}>
                Published. The feed now ranks by {published}.
              </div>
            ) : (
              !name.trim() && (
                <div className="mt-2 text-sm" style={MUTED}>
                  Give your rule a name to publish it.
                </div>
              )
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
