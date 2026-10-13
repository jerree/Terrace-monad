import { Post, Rule, RankedPost } from "./types";

export function rankPosts(posts: Post[], rule: Rule): RankedPost[] {
  const now = Date.now();
  const stats = posts.map((p) => ({
    p,
    ageHours: (now - p.createdAt) / 3600000,
    totalTips: p.tips.reduce((a, t) => a + t.amount, 0),
    backers: new Set(p.tips.map((t) => t.tipper)).size,
  }));
  const maxTips = Math.max(1, ...stats.map((s) => s.totalTips));
  const maxBackers = Math.max(1, ...stats.map((s) => s.backers));

  return stats
    .map((s) => {
      const recency = 1 / (1 + s.ageHours / 12); // 1 = brand new, fades over time
      // How much each ingredient contributed to the score (they add up to the score)
      const parts = {
        r: (rule.wRecency * recency) / 10000,
        t: (rule.wTips * (s.totalTips / maxTips)) / 10000,
        b: (rule.wBackers * (s.backers / maxBackers)) / 10000,
      };
      const score = parts.r + parts.t + parts.b;
      return { ...s.p, totalTips: s.totalTips, backers: s.backers, score, parts };
    })
    .sort((a, b) => b.score - a.score);
}
