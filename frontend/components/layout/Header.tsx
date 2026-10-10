"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useAccount, useDisconnect } from "wagmi";
import { ChevronDown, Copy, ExternalLink, Menu, X } from "lucide-react";
import { compactAddress } from "@/lib/formatters";
import { useHasRole } from "@/lib/contracts";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { ScrollProgressBar, EASE } from "@/components/ui/motion";

const NAV = [
  { href: "/sukuk", label: "Vault" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/transactions", label: "Ledger" },
  { href: "/protocol", label: "Protocol" },
  { href: "/auditor", label: "Auditor" },
];

export function BrandMark({ className = "" }: { className?: string }) {
  // Four quarter-tiles: the vault's quota, filled clockwise.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" rx="2.5" fill="#16603f" />
      <rect x="13" y="2" width="9" height="9" rx="2.5" fill="#8fc4a6" />
      <rect x="13" y="13" width="9" height="9" rx="2.5" fill="#cdebd9" />
      <rect x="2" y="13" width="9" height="9" rx="2.5" fill="#e3f3ea" />
    </svg>
  );
}

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: hasProtocolRole } = useHasRole("PROTOCOL_ROLE", address);
  const { data: hasAgentRole } = useHasRole("AGENT_ROLE", address);
  const isAdmin = isConnected && !!hasProtocolRole;
  const isAgent = isConnected && !!hasAgentRole;

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
    setMenuOpen(false);
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const links = [
    ...NAV,
    ...(isAgent ? [{ href: "/compliance", label: "Compliance" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <>
      <ScrollProgressBar />
      <header
        className={`sticky top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled || mobileOpen
            ? "border-b border-line bg-white/85 shadow-[0_8px_30px_-22px_#16603f55] backdrop-blur-xl"
            : "border-b border-transparent bg-white"
        }`}
      >
        <div className="container flex h-[68px] items-center justify-between gap-6">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="Sukuk Vault home">
            <BrandMark className="h-6 w-6 transition-transform duration-500 [transition-timing-function:var(--ease)] group-hover:rotate-90" />
            <span className="title text-[17px] tracking-tight">Sukuk Vault</span>
          </Link>

          <nav aria-label="Main" className="hidden items-center rounded-full border border-line bg-mist p-1 lg:flex">
            {links.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                    active ? "text-forest-deep" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full border border-line bg-white shadow-[0_1px_2px_#0c1f170f]"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{n.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-mint-3" aria-hidden="true" />
              Sepolia
            </span>

            {isConnected ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="btn btn-ghost btn-sm font-mono"
                >
                  {address ? compactAddress(address) : ""}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_48px_-24px_#0c1f1740]"
                    >
                      <div className="px-3 py-2.5">
                        <p className="label">Connected wallet</p>
                        <p className="mt-1 font-mono text-[13px] font-medium">{address ? compactAddress(address) : ""}</p>
                        {isAdmin && <p className="mt-1 text-xs text-forest">Holds PROTOCOL_ROLE</p>}
                      </div>
                      <div className="my-1 h-px bg-line" />
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(address ?? "");
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium hover:bg-mist"
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Copy address
                      </button>
                      <a
                        role="menuitem"
                        href={`https://sepolia.etherscan.io/address/${address}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium hover:bg-mist"
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> View on Etherscan
                      </a>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          disconnect();
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-danger hover:bg-danger-soft"
                      >
                        Disconnect
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <WalletConnect />
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-mist lg:hidden"
            >
              {mobileOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              id="mobile-nav"
              aria-label="Mobile"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="overflow-hidden border-t border-line lg:hidden"
            >
              <ul className="container flex flex-col py-3">
                {links.map((n, i) => (
                  <motion.li
                    key={n.href}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: 0.04 * i, ease: EASE }}
                  >
                    <Link
                      href={n.href}
                      aria-current={pathname === n.href ? "page" : undefined}
                      className={`flex min-h-12 items-center justify-between rounded-xl px-3 text-[15px] font-medium ${
                        pathname === n.href ? "bg-mint text-forest-deep" : "text-ink hover:bg-mist"
                      }`}
                    >
                      {n.label}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}
