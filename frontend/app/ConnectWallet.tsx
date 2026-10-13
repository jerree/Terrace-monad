"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/wagmi";

export default function ConnectWallet() {
  const [open, setOpen] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, variables, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="relative flex flex-col items-start sm:items-end">
        <button
          onClick={() => {
            reset();
            setOpen(!open);
          }}
          className="btn btn-y"
          aria-expanded={open}
        >
          Connect wallet
        </button>

        {open && (
          <div
            className="box z-10 mt-3 w-72 p-2 sm:absolute sm:right-0 sm:top-full"
            style={{ boxShadow: "4px 4px 0 var(--shadow)" }}
          >
            <div className="px-2 py-1 font-semibold">Choose a wallet</div>
            {connectors.length === 0 && (
              <div className="px-2 py-2 text-sm" style={{ color: "var(--muted)" }}>
                No wallet found in this browser. Install MetaMask or Rabby, then refresh the page.
              </div>
            )}
            {connectors.map((c) => {
              const waiting = isPending && variables?.connector === c;
              return (
                <button
                  key={c.uid}
                  onClick={() => connect({ connector: c }, { onSuccess: () => setOpen(false) })}
                  disabled={isPending}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-black/5 disabled:opacity-60"
                >
                  {c.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.icon} alt="" className="h-7 w-7 rounded-md" />
                  ) : (
                    <span className="h-7 w-7 rounded-md bg-black/10" />
                  )}
                  <span className="flex-1 font-semibold">{c.name}</span>
                  {waiting && (
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      Open the wallet popup
                    </span>
                  )}
                </button>
              );
            })}
            {isPending && (
              <button onClick={() => reset()} className="mt-1 w-full px-2 py-2 text-left text-sm underline">
                Stuck? Cancel and try again
              </button>
            )}
            {error && !isPending && (
              <div className="px-2 py-2 text-sm" style={{ color: "var(--muted)" }}>
                Connection was cancelled or refused. Pick a wallet to try again.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (chainId !== monadTestnet.id) {
    return (
      <div className="flex items-center gap-3">
        <button onClick={() => switchChain({ chainId: monadTestnet.id })} disabled={switching} className="btn btn-y">
          {switching ? "Switching..." : "Switch to Monad Testnet"}
        </button>
        <button onClick={() => disconnect()} className="text-sm underline">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="box px-3 py-1.5 font-semibold" title={address}>
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </span>
      <button onClick={() => disconnect()} className="text-sm underline">
        Disconnect
      </button>
    </div>
  );
}
