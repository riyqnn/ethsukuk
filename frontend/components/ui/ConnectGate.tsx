import { WalletConnect } from "@/components/wallet/WalletConnect";
import { PageHeader } from "./PageHeader";
import { Reveal } from "./motion";

/** Shown instead of a wallet-only page, with the page's own title and the one action that unlocks it. */
export function ConnectGate({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="container pb-24">
      <PageHeader kicker={kicker} title={title} description={description} />
      <Reveal delay={0.1} className="panel-mist flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div>
          <p className="title text-xl">Connect a wallet to continue</p>
          <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
            This page reads data for a specific address. Nothing is signed until you confirm a transaction.
          </p>
        </div>
        <WalletConnect />
      </Reveal>
      {children}
    </div>
  );
}
