import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, parseAbiItem, parseEther } from "viem";
import { posts as seedPosts, rules as seedRules } from "./mockData";
import { Post, Rule } from "./types";
import { FEED_ADDRESS, FIRST_ID, LIVE, REGISTRY_ADDRESS, TIP_AMOUNT, feedAbi, registryAbi } from "./contracts";
import { monadTestnet } from "./wagmi";

export type Backer = { tipper: string; amount: number; ruleId: number };

// One hook the page uses for everything. Demo mode = fake data in the browser.
// Live mode = real reads and writes on Monad. The page does not care which.
export function useTerrace() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: monadTestnet.id });
  const { writeContractAsync } = useWriteContract();

  const [rules, setRules] = useState<Rule[]>(LIVE ? [] : seedRules);
  const [posts, setPosts] = useState<Post[]>(LIVE ? [] : seedPosts);
  const [balance, setBalance] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ who: string; amount: number }[]>([]);
  const [leaderboardAllTime, setLeaderboardAllTime] = useState(false);
  const [loading, setLoading] = useState(LIVE);
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [nicknames, setNicknames] = useState<Record<string, string>>(() => {    // No nicknameOf onchain — nicknames are local-only, so persist them per browser.
    try {
      return JSON.parse(localStorage.getItem("terrace-nicknames") ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("terrace-nicknames", JSON.stringify(nicknames));
    } catch {}
  }, [nicknames]);

  const firstLoad = useRef(true);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // All-time earnings cache: rule-author address -> wei earned (10% of every tip).
  // Persisted so repeat visits don't re-scan the chain; each refresh only reads new blocks.
  const loadEarned = (): Map<string, bigint> => {
    try {
      const raw = JSON.parse(localStorage.getItem("terrace-earned") ?? "[]") as [string, string][];
      return new Map(raw.map(([k, v]) => [k, BigInt(v)]));
    } catch {
      return new Map<string, bigint>();
    }
  };
  const loadCursor = (): bigint | null => {
    try {
      const raw = localStorage.getItem("terrace-earned-cursor");
      return raw ? BigInt(raw) : null;
    } catch {
      return null;
    }
  };
  const earnedCache = useRef<Map<string, bigint>>(loadEarned());
  const logsCursor = useRef<bigint | null>(loadCursor());

  // Backers per post, collected from Tipped events going forward.
  // Creator-only in the UI (rendered on your own profile card); like all chain
  // data it is technically public to anyone querying the RPC directly.
  // Tips are grouped per tipper: one user tipping 5 x 0.01 shows as one backer of 0.05.
  const mergeBackers = (list: Backer[]): Backer[] => {
    const byTipper = new Map<string, Backer>();
    for (const b of list) {
      const prev = byTipper.get(b.tipper);
      if (prev) prev.amount += b.amount;
      else byTipper.set(b.tipper, { ...b });
    }
    return [...byTipper.values()].slice(-100);
  };
  const loadBackers = (): Record<number, Backer[]> => {
    try {
      const raw = JSON.parse(localStorage.getItem("terrace-backers") ?? "{}") as Record<number, Backer[]>;
      return Object.fromEntries(Object.entries(raw).map(([k, v]) => [Number(k), mergeBackers(v)]));
    } catch {
      return {};
    }
  };
  const [backers, setBackers] = useState<Record<number, Backer[]>>(loadBackers);
  const backersRef = useRef<Record<number, Backer[]>>(loadBackers());

  useEffect(() => {
    try {
      localStorage.setItem("terrace-backers", JSON.stringify(backersRef.current));
    } catch {}
  }, [backers]);

  const load = useCallback(async () => {
    if (!LIVE || !client) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rd = (a: `0x${string}`, abi: any, fn: string, args: unknown[] = []) =>
      client.readContract({ address: a, abi, functionName: fn, args }) as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    // Testnet RPCs flake — retry a few times before giving up.
    const withRetry = async <T,>(fn: () => Promise<T>, tries = 3): Promise<T> => {
      let last: unknown;
      for (let i = 0; i < tries; i++) {
        try {
          return await fn();
        } catch (e) {
          last = e;
          if (i < tries - 1) await sleep(600 * (i + 1));
        }
      }
      throw last;
    };
    try {
      const [rc, pc] = await withRetry(() =>
        Promise.all([
          rd(REGISTRY_ADDRESS, registryAbi, "ruleCount"),
          rd(FEED_ADDRESS, feedAbi, "postCount"),
        ])
      );
      const ids = (n: bigint) => Array.from({ length: Number(n) }, (_, i) => BigInt(i + FIRST_ID));
      const rIds = ids(rc);
      const pIds = ids(pc);
      // One bad item must not kill the whole feed — keep whatever resolves.
      const [ruleSettled, postSettled] = await Promise.all([
        Promise.allSettled(rIds.map((id) => withRetry(() => rd(REGISTRY_ADDRESS, registryAbi, "getRule", [id]), 2))),
        Promise.allSettled(pIds.map((id) => withRetry(() => rd(FEED_ADDRESS, feedAbi, "getPost", [id]), 2))),
      ]);
      const goodRules = ruleSettled
        .map((s, i) => ({ s, id: rIds[i] }))
        .filter((x) => x.s.status === "fulfilled") as { s: PromiseFulfilledResult<any>; id: bigint }[];
      const goodPosts = postSettled
        .map((s, i) => ({ s, id: pIds[i] }))
        .filter((x) => x.s.status === "fulfilled") as { s: PromiseFulfilledResult<any>; id: bigint }[];
      // If the RPC dropped everything, keep the old feed instead of blanking it.
      if (goodRules.length === 0 && rIds.length > 0) throw new Error("RPC dropped all rule reads — keeping last good data");

      const nextRules: Rule[] = goodRules.map(({ s, id }) => {
        const r = s.value;
        return {
          id: Number(id),
          author: String(r.author).toLowerCase(),
          name: r.name,
          description: "Published onchain",
          wRecency: Number(r.wRecency),
          wTips: Number(r.wTips),
          wBackers: Number(r.wBackers),
        };
      });

      // getPost already carries totalTips + backerCount, so no tipStats call needed.
      // Ranking only needs totals and backer counts, so rebuild simple tips from those.
      const nextPosts: Post[] = goodPosts.map(({ s, id }) => {
        const p = s.value;
        const total = p.totalTips as bigint;
        const backers = Number(p.backerCount);
        const sum = Number(formatEther(total));
        return {
          id: Number(id),
          author: String(p.author).toLowerCase(),
          text: p.text as string,
          createdAt: Number(p.createdAt) * 1000,
          tips: backers > 0 ? Array.from({ length: backers }, (_, k) => ({ tipper: `${id}-${k}`, amount: sum / backers })) : [],
        };
      });

      // All-time leaderboard: each rule author's 10% cut of every tip.
      // Monad makes a block every ~300ms and public RPCs cap eth_getLogs at
      // ~100 blocks per call, so scanning full history needs 5,000+ calls and
      // is not viable in the browser. Instead: seed once from current pending
      // balances (exact while nobody has withdrawn — true for our fresh testnet
      // deploy), then add each new tip from small-range log reads going forward.
      // The exact fix is a lifetime mapping in Feed.sol (snippet with David);
      // until then this never shrinks on withdraw and the heading says so.
      // Falls back to current balances if log reads fail.
      const authorOf = new Map(nextRules.map((r) => [r.id, r.author]));
      const tippedEvent = parseAbiItem(
        "event Tipped(uint256 indexed postId, address indexed tipper, uint256 indexed ruleId, uint256 amount)"
      );
      const absorb = (logs: { args: { postId?: bigint; tipper?: string; ruleId?: bigint; amount?: bigint } }[]) => {
        for (const log of logs) {
          const postId = Number(log.args.postId ?? BigInt(0));
          const tipper = String(log.args.tipper ?? "").toLowerCase();
          const ruleId = Number(log.args.ruleId ?? BigInt(0));
          const amount = log.args.amount ?? BigInt(0);
          const author = authorOf.get(ruleId);
          if (author) {
            earnedCache.current.set(author, (earnedCache.current.get(author) ?? BigInt(0)) + (amount * BigInt(1000)) / BigInt(10000));
          }
          // Backers panel: who tipped which post and how much, grouped per tipper
          // (newest first, cap 100). Note backerCount onchain already counts
          // unique tippers the same way.
          if (postId > 0 && tipper) {
            const list = backersRef.current[postId] ?? [];
            const prev = list.find((b) => b.tipper === tipper);
            if (prev) prev.amount += Number(formatEther(amount));
            else list.unshift({ tipper, amount: Number(formatEther(amount)), ruleId });
            backersRef.current[postId] = list.slice(0, 100);
          }
        }
      };
      // 100-block slices stay under every public Monad RPC's getLogs cap.
      const scan = async (from: bigint, to: bigint) => {
        let start = from;
        while (start <= to) {
          const end = start + BigInt(99) > to ? to : start + BigInt(99);
          const logs = await withRetry(
            () => client.getLogs({ address: FEED_ADDRESS, event: tippedEvent, fromBlock: start, toBlock: end }),
            2
          );
          absorb(logs);
          start = end + BigInt(1);
        }
      };
      let board: { who: string; amount: number }[] = [];
      let allTime = false;
      try {
        const latest = await withRetry(() => client.getBlockNumber());
        if (logsCursor.current === null) {
          // First visit: seed from balances (exact while nobody has withdrawn),
          // unless a previous full backfill already filled the cache — trust that.
          if (earnedCache.current.size === 0) {
            const authors = [...new Set(nextRules.map((r) => r.author))];
            const bals = await Promise.all(
              authors.map((a) => withRetry(() => rd(FEED_ADDRESS, feedAbi, "pendingBalance", [a]), 2))
            );
            authors.forEach((a, i) => earnedCache.current.set(a, bals[i] as bigint));
          }
        } else if (latest > logsCursor.current) {
          const gap = latest - (logsCursor.current as bigint);
          if (gap > BigInt(2000)) {
            // Slept too long to catch up exactly — re-seed from balances.
            const authors = [...new Set(nextRules.map((r) => r.author))];
            earnedCache.current.clear();
            const bals = await Promise.all(
              authors.map((a) => withRetry(() => rd(FEED_ADDRESS, feedAbi, "pendingBalance", [a]), 2))
            );
            authors.forEach((a, i) => earnedCache.current.set(a, bals[i] as bigint));
          } else {
            await scan((logsCursor.current as bigint) + BigInt(1), latest);
          }
        }
        logsCursor.current = latest;
        try {
          localStorage.setItem("terrace-earned", JSON.stringify([...earnedCache.current.entries()].map(([k, v]) => [k, v.toString()])));
          localStorage.setItem("terrace-earned-cursor", latest.toString());
        } catch {}
        board = [...earnedCache.current.entries()]
          .map(([who, wei]) => ({ who, amount: Number(formatEther(wei)) }))
          .filter((x) => x.amount > 0)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);
        allTime = true;
      } catch {
        // Log reads failed — fall back to current balances.
        const authors = [...new Set(nextRules.map((r) => r.author))];
        const bals = await Promise.all(authors.map((a) => rd(FEED_ADDRESS, feedAbi, "pendingBalance", [a]).catch(() => BigInt(0))));
        board = authors
          .map((who, i) => ({ who, amount: Number(formatEther(bals[i] as bigint)) }))
          .filter((x) => x.amount > 0)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);
      }

      // No nicknameOf onchain — nicknames stay local-only (persisted above).
      // Keep whatever the user already typed; do not wipe on reload.

      if (address) {
        try {
          const bal = await rd(FEED_ADDRESS, feedAbi, "pendingBalance", [address]);
          setBalance(Number(formatEther(bal)));
        } catch {
          // keep last balance on a flaky read
        }
      } else {
        setBalance(null);
      }
      setRules(nextRules);
      setPosts(nextPosts);
      setLeaderboard(board);
      setLeaderboardAllTime(allTime);
      setBackers({ ...backersRef.current });
      setLoadError("");
    } catch (e) {
      // Only shout when there is nothing to show yet. Background refreshes fail quietly
      // and keep the last good feed instead of flashing "RPC Request failed".
      const err = e as { shortMessage?: string; message?: string };
      setRules((prev) => {
        if (prev.length === 0 && firstLoad.current) {
          setLoadError(`Could not read the contracts: ${err.shortMessage ?? err.message ?? "unknown error"} — retrying...`);
        }
        return prev;
      });
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [client, address]);

  useEffect(() => {
    if (!LIVE) return;
    load();
    const id = setInterval(load, 20000); // 10s hammered the public RPC into rate-limits; 20s is gentler
    return () => clearInterval(id);
  }, [load]);

  const run = async (send: () => Promise<`0x${string}`>) => {
    if (!address) {
      setError("Connect your wallet first.");
      return false;
    }
    setError("");
    setTxPending(true);
    try {
      const hash = await send();
      await client!.waitForTransactionReceipt({ hash });
      await load();
      return true;
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Transaction failed.");
      return false;
    } finally {
      setTxPending(false);
    }
  };

  const tip = async (postId: number, ruleId: number) => {
    if (!LIVE) {
      setPosts((ps) =>
        ps.map((p) => (p.id === postId ? { ...p, tips: [...p.tips, { tipper: "you", amount: 1, ruleId }] } : p))
      );
      return true;
    }
    return run(() =>
      writeContractAsync({
        address: FEED_ADDRESS,
        abi: feedAbi,
        functionName: "tip",
        args: [BigInt(postId), BigInt(ruleId)],
        value: parseEther(TIP_AMOUNT),
        chainId: monadTestnet.id,
      })
    );
  };

  const addPost = async (text: string) => {
    if (!LIVE) {
      setPosts((ps) => [{ id: Math.max(...ps.map((p) => p.id)) + 1, author: "you", text, createdAt: Date.now(), tips: [] }, ...ps]);
      return true;
    }
    return run(() =>
      writeContractAsync({ address: FEED_ADDRESS, abi: feedAbi, functionName: "createPost", args: [text], chainId: monadTestnet.id })
    );
  };

  // Weights are basis points and must add up to 10,000
  const publishRule = async (name: string, wRecency: number, wTips: number, wBackers: number) => {
    if (!LIVE) {
      setRules((rs) => [
        ...rs,
        { id: Math.max(...rs.map((r) => r.id)) + 1, author: "you", name, description: "Written by you", wRecency, wTips, wBackers },
      ]);
      return true;
    }
    return run(() =>
      writeContractAsync({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: "publishRule",
        args: [name, wRecency, wTips, wBackers],
        chainId: monadTestnet.id,
      })
    );
  };

  const setNickname = async (name: string) => {
    // No setNickname onchain — store locally so the UI still works.
    const me = address?.toLowerCase();
    if (me) setNicknames((n) => ({ ...n, [me]: name.trim().slice(0, 20) }));
    else setNicknames((n) => ({ ...n, you: name.trim().slice(0, 20) }));
    return true;
  };

  const withdraw = async () => {
    if (!LIVE) return true;
    return run(() => writeContractAsync({ address: FEED_ADDRESS, abi: feedAbi, functionName: "withdraw", chainId: monadTestnet.id }));
  };

  return {
    live: LIVE,
    address: address?.toLowerCase(),
    rules,
    posts,
    balance,
    leaderboard,
    leaderboardAllTime,
    backers,
    loading,
    txPending,
    error: error || loadError,
    tipLabel: LIVE ? `Tip ${TIP_AMOUNT} MON` : "Tip 1",
    tip,
    addPost,
    publishRule,
    withdraw,
    nicknames,
    setNickname,
  };
}
