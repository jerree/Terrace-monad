# Terrace

**Open talk, ranked by rules the community writes.** Built on Monad for the Metropolis Hackathon, Track 03: Social, Attention & Culture.

## The problem

On most social platforms, a company's hidden algorithm decides what you see, and the people who create the posts and the people who write good ranking logic earn nothing from it.

## What Terrace does

Terrace is a community feed where the **ranking rule is a public, onchain object that anyone can write.**

- A **rule** is a recipe of three weights: how much to favour recent posts, tipped posts, and posts backed by many different people.
- People **pick a rule** and the feed re-ranks instantly. Switching rules reshuffles the same posts.
- People **tip posts**. Every tip is split onchain: **90% to the post author, 10% to the author of the rule in use.**
- So people who write rules the community likes get paid when others use them, and attention turns into real, verifiable ownership.

## Built for any topic, starting with football

Terrace itself is not about one subject. Think of how a new account on X or TikTok asks you to pick the topics you care about: each topic gets its own feed. In Terrace, a topic is a feed of posts, and a ranking rule is just three weights (recency, tips and different backers), so any topic can have its own feed and its own community-written rules. Football is the first topic we launched with, because football fans are passionate, easy to reach and love to argue about who deserves attention. Music, film, tech and crypto, local news and creator communities would work the same way. Letting people choose their topics when they join is the next step on the roadmap.

## How ranking works

```
score = (wRecency x R + wTips x T + wBackers x B) / 10,000

R = 1 / (1 + ageInHours / 12)
T = post's total tips / highest total tips of any post
B = post's different tippers / highest different tippers of any post
```

The three weights are stored onchain per rule and always sum to 10,000 (basis points), so anyone can check exactly why a post ranks where it does.

## Architecture

```
Browser (Next.js)  <-->  Monad Testnet
  - reads rules, posts, tips      RuleRegistry   publish and read rules (weights)
  - ranks posts with the          Feed           posts, tips, 90/10 split, withdraw
    selected rule's weights
  - sends tips / posts / rules
```

- **RuleRegistry contract:** stores each rule (author, name, three weights that sum to 10,000).
- **Feed contract:** stores posts and tips, splits each tip between the post author and the rule author, and lets both withdraw their balance (pull payments).
- **Frontend:** reads onchain data, ranks it in the browser with the chosen rule, and sends transactions through the user's wallet.

## Tech stack

- **Contracts:** Solidity, Foundry
- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Wallet and chain access:** wagmi, viem
- **Network:** Monad Testnet (chain ID 10143)

## Setup

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. You need a browser wallet (MetaMask, Rabby, OKX) set to Monad Testnet. Free test MON is available from the Monad faucet.

### Contracts

```bash
cd contracts
forge install foundry-rs/forge-std   # test dependency
forge test
```

Deploy to Monad Testnet (the signer comes from your Foundry account, never from the source):

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --account deployer --broadcast
forge script script/Seed.s.sol:Seed --rpc-url monad_testnet --account deployer --broadcast   # optional demo data
```

Deployed on Monad Testnet (chain ID 10143):

| Contract | Address |
|---|---|
| RuleRegistry | `0x19464E21c96d011e0fd47370e404A4128fB655A0` |
| Feed | `0x5dAf8F7F033d0f65F19D7D6859CdC23E5cF4ED12` |

The ABI files used by the frontend are in `contracts/abi/`, and the addresses are also in `contracts/deployments/10143.json`.

## Growth plan

We start with football fan communities that already live in crypto circles, because they are easy to reach and have strong opinions about what deserves attention. Next we bring in creators (match-reaction accounts, fan podcasts) who earn from tips on their posts and from the rules they write, then open more topics.

## Traction

TODO: wallets that connected, posts, tips and rules published, with explorer links and screenshots from our test group.

## Known limits

- Posts live on a public blockchain, so they are permanent and cannot be deleted. Moderation would happen in the app, not on the chain.
- Nicknames are stored in the browser for now, not onchain, so they only show on the device that set them.
- Tips are a fixed 0.01 MON in the app (the contract accepts any amount of at least 0.01 MON). One person can tip a post more than once; they count as a single backer.
- The leaderboard sums each rule author's 10% cut of every tip from onchain events, so it never drops when they withdraw (it falls back to current balances only if the RPC refuses log reads).

## Demo

- Demo video: TODO
- Live app: TODO

## AI tools disclosure

AI coding tools were used in this project: Claude (Anthropic) and other AI coding assistants helped plan the project, write and debug code, and draft this documentation.

## Team

- TODO: name and role (frontend)
- David: smart contracts
