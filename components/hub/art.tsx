// Server-rendered shelf illustrations: one camera, material palette and light for every game.
// Mappa's map geometry stays out of the hub's client bundle.
import type { ReactNode } from "react";
import MAP from "@/lib/map-data.json";
import { CONTINENTS, WORLD } from "@/lib/world";
import { BOARD } from "@/games/grand-tour/board";
import ChessPiece from "@/games/echecs/ui/Piece";
import DraughtsPiece from "@/games/dames/ui/Piece";
import type { Cell } from "@/games/echecs/rules";

const CREAM = "#ede4cf", EDGE = "#6c604e", GREEN = "#66866b";
// The same oblique projection is used for the map, cards and boards.
const plane = (x: number, y: number) => [200 + x - .55 * y, 111 + .18 * x + .65 * y];
const CAMERA = "matrix(1 .18 -.55 .65 200 111)";
const TERR = MAP.territories as Record<string, { rings: number[][][] }>;
const CONTINENT_COLOR = Object.fromEntries(CONTINENTS.map((c) => [c.id, c.color]));
const ringPath = (ring: number[][]) => {
  const pts = ring.length > 12 ? ring.filter((_, i) => i % 2 === 0) : ring;
  return "M" + pts.map(([x, y]) => `${x} ${y}`).join("L") + "Z";
};

function Scene({ children }: { children: ReactNode }) {
  return (
    <svg className="shelf-art" viewBox="0 0 400 250" aria-hidden="true" focusable="false">
      <ellipse cx="200" cy="193" rx="139" ry="15" fill="#000" opacity=".25" />
      <g className="shelf-art-object">{children}</g>
    </svg>
  );
}

function Slab({ width = 180, height = 180, fill = CREAM, children }: {
  width?: number; height?: number; fill?: string; children?: ReactNode;
}) {
  return (
    <>
      <g transform="translate(0 8)">
        <g transform={CAMERA}>
          <rect x={-width / 2 - 5} y={-height / 2 - 5} width={width + 10} height={height + 10} rx="6" fill={EDGE} />
        </g>
      </g>
      <g transform={CAMERA}>
        <rect x={-width / 2 - 5} y={-height / 2 - 5} width={width + 10} height={height + 10} rx="6" fill={CREAM} />
        <rect x={-width / 2} y={-height / 2} width={width} height={height} rx="2" fill={fill} />
        {children}
      </g>
    </>
  );
}

function Token({ x, y, color }: { x: number; y: number; color: string }) {
  const [cx, cy] = plane(x, y);
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <ellipse cy="2" rx="8" ry="4" fill="#000" opacity=".25" />
      <path d="M-6 0L-4-13H4L6 0Q0 5-6 0" fill={color} stroke="#332f2b" strokeWidth="1.2" />
      <circle cy="-16" r="5" fill={color} stroke="#332f2b" strokeWidth="1.2" />
      <path d="M-2-18V-15" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function MappaArt() {
  const [x, y, w, h] = MAP.viewBox;
  return (
    <Scene>
      <Slab width={236} height={154} fill="#253d48">
        <svg x="-113" y="-73" width="226" height="146" viewBox={`${x} ${y} ${w} ${h}`}>
          {WORLD.map((t) => (
            <path key={t.id} d={TERR[t.id].rings.map(ringPath).join("")} fill={CONTINENT_COLOR[t.continent]} stroke="#253d48" strokeWidth="3" strokeLinejoin="round" />
          ))}
        </svg>
      </Slab>
      <Token x={-61} y={-21} color="#e78b62" />
      <Token x={22} y={-24} color="#d9bd66" />
      <Token x={30} y={25} color="#84aa82" />
    </Scene>
  );
}

const CARDS = [
  { color: "#d96a55", symbol: "7" }, { color: "#d9b951", symbol: "2" },
  { color: "#6d9a76", symbol: "+2" }, { color: "#6592b4", symbol: "4" },
  { color: "#655b7b", symbol: "+4" },
];
function PiocheArt() {
  return (
    <Scene>
      <g transform="translate(0 9)">
        <g transform={CAMERA}>
          <rect x="-45" y="-69" width="90" height="138" rx="9" fill={EDGE} />
        </g>
      </g>
      <g transform={CAMERA}>
        {[3, 2, 1].map((i) => <rect key={i} x="-45" y={-73 + i * 2} width="90" height="138" rx="9" fill={CREAM} stroke="#a79a84" />)}
        {CARDS.map(({ color, symbol }, i) => (
          <g key={color} transform={`rotate(${(i - 2) * 17} 0 107) translate(0 -12)`}>
            <rect x="-40" y="-68" width="80" height="120" rx="8" fill={CREAM} stroke={EDGE} strokeWidth="1.3" />
            <rect x="-34" y="-62" width="68" height="108" rx="5" fill={color} />
            <ellipse cx="0" cy="-8" rx="24" ry="40" transform="rotate(24 0 -8)" fill={CREAM} />
            <text x="0" y="2" textAnchor="middle" fontFamily="var(--font-app)" fontWeight="800" fontSize={symbol.length > 1 ? 26 : 38} fill={color}>{symbol}</text>
            <text x="-28" y="-44" fontFamily="var(--font-app)" fontWeight="700" fontSize="11" fill={CREAM}>{symbol}</text>
          </g>
        ))}
      </g>
    </Scene>
  );
}

const STREETS: Record<string, string> = {
  brown: "#a57c60", sky: "#8bb6c9", pink: "#c994a6", orange: "#d89459",
  red: "#cd6b5e", yellow: "#d7bb63", green: "#749c77", navy: "#647f9e",
};
function House({ x, y, color }: { x: number; y: number; color: string }) {
  const [cx, cy] = plane(x, y);
  return (
    <g transform={`translate(${cx} ${cy})`} stroke="#494a3b" strokeWidth=".9" strokeLinejoin="round">
      <path d="M-9-9L0-14L9-9V2L0 7L-9 2Z" fill={color} />
      <path d="M-11-9L-2-19L10-13L1-3Z" fill="#f0d5a2" />
      <path d="M1-3V7L9 2V-10" fill="#000" fillOpacity=".17" />
    </g>
  );
}
function GrandTourArt() {
  return (
    <Scene>
      <Slab fill={GREEN}>
        {BOARD.map((s, i) => {
          const side = Math.floor(i / 10), step = i % 10;
          const [x, y] = [[-90 + step * 18, -90], [72, -90 + step * 18], [72 - step * 18, 72], [-90, 72 - step * 18]][side];
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect width="18" height="18" fill={CREAM} stroke="#b1a78e" strokeWidth=".6" />
              {s.kind === "city" ? <rect x="2" y="2" width="14" height="5" fill={STREETS[s.group]} /> : <circle cx="9" cy="9" r="2.6" fill={s.kind === "go" ? GREEN : "#b1a78e"} />}
            </g>
          );
        })}
        <rect x="-29" y="-24" width="28" height="40" rx="3" fill="#d7bb63" transform="rotate(-12)" stroke={CREAM} strokeWidth="2" />
        <rect x="8" y="-12" width="28" height="40" rx="3" fill="#d38d77" transform="rotate(12)" stroke={CREAM} strokeWidth="2" />
      </Slab>
      <House x={-35} y={-81} color="#8fac79" />
      <House x={28} y={-81} color="#8fac79" />
      <House x={81} y={12} color="#d38d77" />
      <Token x={-81} y={18} color="#d9bd66" />
      <Token x={25} y={81} color="#e78b62" />
    </Scene>
  );
}

function Checkerboard({ size, children }: { size: number; children: ReactNode }) {
  const cell = 180 / size;
  return (
    <Scene>
      <Slab>
        {Array.from({ length: size * size }, (_, i) => {
          const row = Math.floor(i / size), col = i % size;
          return <rect key={i} x={-90 + col * cell} y={-90 + row * cell} width={cell} height={cell} fill={(row + col) % 2 ? GREEN : CREAM} />;
        })}
      </Slab>
      {children}
    </Scene>
  );
}
function EchecsArt() {
  const pieces: [number, number, Exclude<Cell, null>][] = [
    [1, 0, "br"], [3, 0, "bq"], [5, 0, "bk"], [2, 1, "bp"], [4, 2, "bp"],
    [3, 4, "wp"], [5, 5, "wn"], [1, 6, "wp"], [2, 7, "wk"], [6, 7, "wr"],
  ];
  return (
    <Checkerboard size={8}>
      {pieces.sort((a, b) => plane(a[0], a[1])[1] - plane(b[0], b[1])[1]).map(([col, row, piece]) => {
        const [x, y] = plane(-90 + (col + .5) * 22.5, -90 + (row + .5) * 22.5);
        return (
          <g key={`${col}-${row}`}>
            <ellipse cx={x} cy={y + 2} rx="10" ry="4" fill="#000" opacity=".2" />
            <svg x={x - 13} y={y - 31} width="26" height="35"><ChessPiece cell={piece} /></svg>
          </g>
        );
      })}
    </Checkerboard>
  );
}
function DamesArt() {
  const pieces = [
    [1, 0, "b"], [3, 0, "b"], [5, 0, "b"], [7, 0, "b"], [9, 0, "b"],
    [0, 1, "b"], [2, 1, "b"], [6, 1, "b"], [8, 1, "b"], [5, 2, "b"], [4, 3, "b"],
    [3, 6, "w"], [8, 5, "w"], [0, 7, "w"], [2, 7, "w"], [6, 7, "w"],
    [1, 8, "w"], [5, 8, "w"], [7, 8, "w"], [9, 8, "w"], [0, 9, "w"], [4, 9, "w"], [8, 9, "w"],
  ] as const;
  return (
    <Checkerboard size={10}>
      {pieces.map(([col, row, piece]) => {
        const [x, y] = plane(-90 + (col + .5) * 18, -90 + (row + .5) * 18);
        return <svg key={`${col}-${row}`} x={x - 9} y={y - 12} width="18" height="18"><DraughtsPiece cell={piece} /></svg>;
      })}
    </Checkerboard>
  );
}
function LoupGarouArt() {
  return (
    <Scene>
      <circle cx="200" cy="105" r="62" fill={CREAM} />
      <path d="M144 166L150 72L183 105H217L250 72L256 166L200 195Z" fill="#655b7b" />
      <path d="M169 139L188 146M212 146L231 139" stroke="#d9bd66" strokeWidth="6" />
    </Scene>
  );
}
function DiceArt() {
  return <Scene><Slab width={90} height={90}><circle r="9" fill={EDGE} /></Slab></Scene>;
}
const ARTS: Record<string, () => ReactNode> = {
  mappa: MappaArt, pioche: PiocheArt, "grand-tour": GrandTourArt,
  echecs: EchecsArt, dames: DamesArt, "loup-garou": LoupGarouArt,
};
export const boxArt = (id: string) => (ARTS[id] ?? DiceArt)();
