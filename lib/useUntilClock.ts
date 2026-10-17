"use client";
import { useEffect, useState } from "react";

/** Tick only while a displayed countdown or transient reaction needs time updates. */
export function useUntilClock(until: number, interval: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= until) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [until, interval]);
  return now;
}
