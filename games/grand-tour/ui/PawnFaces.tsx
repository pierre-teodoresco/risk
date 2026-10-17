"use client";
import { createContext, useEffect, useRef, useState, type ReactNode } from "react";

/** SVG data URLs prepared by the page; keep react-dom/server out of the browser. */
export const PawnFaces = createContext<readonly string[]>([]);

export function PawnFacesProvider({ faces, children }: { faces: ReactNode; children: ReactNode }) {
  const source = useRef<HTMLDivElement>(null);
  const [urls, setUrls] = useState<readonly string[]>([]);
  useEffect(() => {
    setUrls(Array.from(source.current!.querySelectorAll("svg"), (svg) =>
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.outerHTML),
    ));
  }, []);
  return (
    <PawnFaces.Provider value={urls}>
      <div hidden aria-hidden="true" ref={source}>{faces}</div>
      {children}
    </PawnFaces.Provider>
  );
}
