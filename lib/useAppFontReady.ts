"use client";
import { useEffect, useState } from "react";
import { loadAppFont } from "./typography";

/** Canvas textures must be painted after the font is available, including on a cold load. */
export function useAppFontReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const finish = () => { if (active) setReady(true); };
    void loadAppFont().then(finish, finish);
    return () => { active = false; };
  }, []);
  return ready;
}
