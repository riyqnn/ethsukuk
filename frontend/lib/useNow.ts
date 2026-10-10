"use client";

import { useSyncExternalStore } from "react";

const TICK = 5;

/** Wall-clock seconds, refreshed every few seconds, so countdowns advance on their own. */
export function useNowSeconds(): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, TICK * 1000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 1000 / TICK) * TICK,
    () => 0,
  );
}
