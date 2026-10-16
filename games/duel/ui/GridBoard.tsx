"use client";
// React wrapper of the 3D square board: one engine per mount, state passed through.
import { useEffect, useRef } from "react";
import { GridBoardEngine, type GridConfig, type GridState } from "./grid3d";

export default function GridBoard({ config, state, onSquare }: { config: GridConfig; state: GridState; onSquare: (i: number) => void }) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<GridBoardEngine | null>(null),
    click = useRef(onSquare);
  click.current = onSquare;
  useEffect(() => {
    const e = new GridBoardEngine(host.current!, config, (i) => click.current(i));
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
    // The board's size and pieces never change for a mounted game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    engine.current?.setState(state);
  }, [state]);
  return <div className="gt-canvas du-canvas" ref={host} />;
}
