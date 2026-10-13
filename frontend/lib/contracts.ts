import { parseAbi } from "viem";

// 1. Live addresses on Monad Testnet (chain ID 10143), deployed by David.
export const REGISTRY_ADDRESS = "0x19464E21c96d011e0fd47370e404A4128fB655A0" as `0x${string}`;
export const FEED_ADDRESS = "0x5dAf8F7F033d0f65F19D7D6859CdC23E5cF4ED12" as `0x${string}`;

// 2. Do David's ids start at 0 or 1? Set this to match.
export const FIRST_ID = 1;

// 3. Amount sent with each tip, in MON.
export const TIP_AMOUNT = "0.01";

export const LIVE = Boolean(REGISTRY_ADDRESS && FEED_ADDRESS);

// 4. Exact ABI matching David's deployed contracts (src/RuleRegistry.sol, src/Feed.sol).
//    NOTE: getRule returns (author, wRecency, wTips, wBackers, createdAt, name) — name is LAST.
//    getPost returns (author, createdAt, backerCount, totalTips, text).
//    tipStats / ruleEarned / setNickname / nicknameOf do NOT exist onchain.
export const registryAbi = parseAbi([
  "function publishRule(string name, uint16 wRecency, uint16 wTips, uint16 wBackers) returns (uint256 ruleId)",
  "function getRule(uint256 ruleId) view returns ((address author, uint16 wRecency, uint16 wTips, uint16 wBackers, uint64 createdAt, string name))",
  "function ruleCount() view returns (uint256)",
  "function ruleAuthor(uint256 ruleId) view returns (address)",
]);

export const feedAbi = parseAbi([
  "function createPost(string text) returns (uint256 postId)",
  "function tip(uint256 postId, uint256 ruleId) payable",
  "function withdraw()",
  "function postCount() view returns (uint256)",
  "function getPost(uint256 postId) view returns ((address author, uint64 createdAt, uint32 backerCount, uint256 totalTips, string text))",
  "function pendingBalance(address account) view returns (uint256)",
  "event Tipped(uint256 indexed postId, address indexed tipper, uint256 indexed ruleId, uint256 amount)",
]);
