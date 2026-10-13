export type Tip = { tipper: string; amount: number; ruleId?: number };

export type Post = {
  id: number;
  author: string;
  text: string;
  createdAt: number; // ms timestamp
  tips: Tip[];
};

// Weights are in basis points and must sum to 10,000 (same as the contract)
export type Rule = {
  id: number;
  author: string;
  name: string;
  description: string;
  wRecency: number;
  wTips: number;
  wBackers: number;
};

export type RankedPost = Post & {
  totalTips: number;
  backers: number;
  score: number;
  parts: { r: number; t: number; b: number }; // what each ingredient added to the score
};
