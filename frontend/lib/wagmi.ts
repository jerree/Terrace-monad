import { createConfig, fallback, http } from "wagmi";
import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz", "https://monad-testnet.drpc.org"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

// Fallback across two public RPCs + retries: testnet-rpc.monad.xyz rate-limits
// and a single failed request used to blank the whole feed with "RPC Request failed".
// No fixed wallet: wagmi finds every installed wallet (MetaMask, OKX, Rabby...)
// and the Connect button lets the user pick one.
export const config = createConfig({
  chains: [monadTestnet],
  connectors: [],
  transports: {
    [monadTestnet.id]: fallback(
      [
        http("https://testnet-rpc.monad.xyz", { batch: true, retryCount: 3, retryDelay: 500 }),
        http("https://monad-testnet.drpc.org", { batch: true, retryCount: 3, retryDelay: 500 }),
      ],
      { retryCount: 3, retryDelay: 500 }
    ),
  },
  ssr: true,
});
