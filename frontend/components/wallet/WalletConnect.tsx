"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useConnect } from "wagmi";

export function WalletConnect() {
  const { connectors, connect } = useConnect();

  const handleDirectInjectedConnect = async (openConnectModal: () => void) => {
    const injectedConn = connectors.find((c) => c.id === "injected" || c.type === "injected");
    if (injectedConn) {
      try {
        if (typeof window !== "undefined" && (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<unknown> } }).ethereum) {
          const eth = (window as unknown as { ethereum: { request: (args: { method: string }) => Promise<unknown> } }).ethereum;
          await eth.request({ method: "eth_requestAccounts" });
        }
        connect({ connector: injectedConn });
        return;
      } catch (err) {
        console.warn("Direct injected connect notice:", err);
      }
    }
    // No injected wallet, or it refused: fall back to the RainbowKit modal.
    openConnectModal();
  };

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={() => handleDirectInjectedConnect(openConnectModal)}
                    type="button"
                    className="btn btn-primary btn-sm"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="btn btn-sm bg-danger text-white hover:opacity-90"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2">
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="btn btn-ghost btn-sm font-mono"
                  >
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}