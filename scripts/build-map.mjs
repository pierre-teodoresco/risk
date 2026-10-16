// Builds lib/map-data.json: the 42 territories as stylised real-world shapes.
//
// Source: Natural Earth 10m admin-1 (states/provinces), grouped into Risk territories,
// projected with Equal Earth (true areas), softly enlarged around Europe and the
// North Atlantic so small territories stay playable, then simplified.
//
// Run (the geo packages are only needed here, they are not app dependencies):
//   curl -L -o /tmp/admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//   npm i --no-save d3-geo topojson-server topojson-client topojson-simplify polylabel polygon-clipping
//   npx tsx scripts/build-map.mjs /tmp/admin1.geojson
import fs from "node:fs";
import * as d3 from "d3-geo";
import { topology } from "topojson-server";
import { feature } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";
import polylabel from "polylabel";
import polygonClipping from "polygon-clipping";
import { WORLD } from "../lib/world.ts";

const SIMPLIFY = 5; // px², higher = more stylised coastlines
const MIN_AREA = 40; // px², drops tiny islands

// Countries that map to a single territory. Split countries are handled in assign().
const BY_TERRITORY = {
  greenland: ["GRL"],
  central: "MEX GTM BLZ HND SLV NIC CRI PAN CUB JAM HTI DOM BHS PRI",
  venezuela: "VEN COL GUY SUR TTO",
  peru: "PER ECU BOL",
  brazil: "BRA",
  argentina: "ARG CHL URY PRY FLK",
  iceland: "ISL",
  britain: "GBR IRL IMN",
  scandinavia: "NOR SWE FIN DNK FRO ALD",
  northeu: "DEU POL CZE NLD BEL LUX",
  westeu: "FRA ESP PRT AND CHE",
  southeu: "ITA AUT SVN HRV BIH SRB MNE KOS ALB MKD GRC BGR ROU HUN SVK SMR VAT MCO LIE MLT",
  ukraine: "UKR BLR LTU LVA EST MDA",
  northafrica: "MAR SAH DZA TUN LBY MRT MLI NER TCD SEN GMB GNB GIN SLE LBR CIV BFA GHA TGO BEN NGA",
  egypt: "EGY",
  eastafrica: "SDN SDS ETH ERI DJI SOM SOL KEN UGA RWA BDI TZA",
  congo: "COD COG GAB GNQ CMR CAF AGO",
  southafrica: "ZAF NAM BWA ZWE MOZ ZMB MWI LSO SWZ",
  madagascar: "MDG",
  middleeast: "TUR SYR LBN ISR PSX JOR IRQ IRN SAU KWT QAT ARE OMN YEM BHR GEO ARM AZE CYP CYN",
  afghanistan: "AFG KAZ TKM UZB KGZ TJK KAB",
  india: "IND PAK BGD NPL BTN LKA KAS",
  siam: "THA MMR LAO KHM VNM",
  china: "CHN TWN HKG MAC",
  mongolia: "MNG PRK KOR",
  japan: "JPN",
  indonesia: "IDN PHL BRN TLS SGP",
  newguinea: "PNG",
  eastaus: "NZL",
};
const byCountry = {};
for (const [t, list] of Object.entries(BY_TERRITORY))
  for (const c of [list].flat().join(" ").split(" ")) byCountry[c] = t;

// Returns a territory id, null to drop the region, or undefined when unmapped.
function assign(p) {
  const c = p.adm0_a3, n = p.name, lon = p.longitude;
  if (c === "USA") return n === "Alaska" ? "alaska" : n === "Hawaii" ? null : lon < -97 ? "westus" : "eastus";
  if (c === "CAN") {
    if (["Yukon", "Northwest Territories", "Nunavut"].includes(n)) return "nw";
    if (["British Columbia", "Alberta"].includes(n)) return "alberta";
    if (["Saskatchewan", "Manitoba", "Ontario"].includes(n)) return "ontario";
    return "quebec";
  }
  // Asia is reshaped so touching shapes match the classic adjacency: Mongolia reaches the
  // Pacific (Kamchatka, Japan) through Manchuria and Korea, Ural meets China at the Altai,
  // and only Ural borders Kazakhstan (Afghanistan) on the Russian side; China fills the Altai
  // corner so Kazakhstan does not seem to touch Mongolia.
  if (c === "CHN" && ["Inner Mongol", "Heilongjiang", "Jilin", "Liaoning"].includes(n)) return "mongolia";
  if (c === "MNG" && n === "Bayan-Ölgiy") return "china";
  if (c === "RUS") {
    if (n === "Gorno-Altay") return "china";
    if (["Altay", "Novosibirsk"].includes(n)) return "ural";
    if (n === "Sakha (Yakutia)") return "yakutsk";
    if (["Irkutsk", "Buryat", "Chita", "Amur"].includes(n)) return "irkutsk";
    if (["Kamchatka", "Chukchi Autonomous Okrug", "Maga Buryatdan", "Khabarovsk", "Primor'ye", "Yevrey", "Sakhalin"].includes(n)) return "kamchatka";
    if (lon >= 76) return "siberia";
    if (lon >= 54 || ["Komi", "Nenets"].includes(n)) return "ural";
    return "ukraine";
  }
  if (c === "AUS") {
    if (["Macquarie Island", "Lord Howe Island"].includes(n)) return null;
    return ["Western Australia", "Northern Territory", "South Australia"].includes(n) ? "westaus" : "eastaus";
  }
  if (c === "IDN") return n.startsWith("Papua") ? "newguinea" : "indonesia";
  if (c === "MYS") return ["Sabah", "Sarawak", "Labuan"].includes(n) ? "indonesia" : "siam";
  if (c === "FRA") return n === "Guyane française" ? "venezuela" : lon < -10 || lon > 20 ? null : "westeu";
  if ((c === "ESP" && lon < -10) || (c === "PRT" && lon < -12) || (c === "NOR" && p.latitude > 74)) return null;
  return byCountry[c];
}

// d3 reads a polygon larger than a hemisphere as "everything but this shape": rewind those.
function rewind(g) {
  const fix = (poly) => (d3.geoArea({ type: "Polygon", coordinates: poly }) > 2 * Math.PI ? poly.map((r) => r.slice().reverse()) : poly);
  return g.type === "Polygon" ? { ...g, coordinates: fix(g.coordinates) } : { ...g, coordinates: g.coordinates.map(fix) };
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
const inRing = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

const source = JSON.parse(fs.readFileSync(process.argv[2] ?? "admin1.geojson", "utf8"));
const feats = [], unmapped = new Set();
for (const f of source.features) {
  const t = assign(f.properties);
  if (t === null) continue;
  if (t === undefined) { unmapped.add(f.properties.admin); continue; }
  feats.push({ type: "Feature", properties: { t }, geometry: rewind(f.geometry) });
}
if (unmapped.size) console.error("Not mapped (small islands are expected):", [...unmapped].join(", "));

// Equal Earth, centred so the cut falls in the Bering Strait.
const projection = d3.geoEqualEarth().rotate([-11, 0]).precision(0.1);
projection.fitWidth(1600, { type: "MultiPoint", coordinates: [[-168.9, 0], [190.9, 0]] });
// Soft fisheye lenses, applied in order; each centre is placed where earlier lenses moved it.
const LENSES = [];
for (const [ll, k, r] of [[[13, 50], 0.9, 150], [[-42, 73], 0.5, 100], [[-18.5, 65], 0.75, 26]])
  LENSES.push([...lens(...projection(ll)), k, r]);
function lens(x, y) {
  for (const [cx, cy, k, r] of LENSES) {
    const dx = x - cx, dy = y - cy, f = 1 + k * Math.exp(-(dx * dx + dy * dy) / (r * r));
    x = cx + dx * f; y = cy + dy * f;
  }
  return [x, y];
}
// Projects through d3's stream (antimeridian clipping). Exteriors come out clockwise, holes counter-clockwise.
function project(g) {
  const polys = [];
  let rings = [], ring = null;
  d3.geoStream(g, projection.stream({
    polygonStart() { rings = []; },
    polygonEnd() {
      const ext = rings.filter((r) => ringArea(r) > 0).map((r) => [r]);
      for (const h of rings.filter((r) => ringArea(r) < 0)) ext.find((p) => inRing(h[0], p[0]))?.push(h);
      polys.push(...ext);
    },
    lineStart() { ring = []; },
    lineEnd() { if (ring.length > 2) rings.push([...ring, ring[0]]); ring = null; },
    point(x, y) { ring?.push(lens(x, y)); },
    sphere() {},
  }));
  return { type: "MultiPolygon", coordinates: polys };
}
const projected = { type: "FeatureCollection", features: feats.map((f) => ({ ...f, geometry: project(f.geometry) })) };

// Simplify in a shared topology so neighbours keep identical borders.
let topo = topology({ land: projected }, 1e5);
topo = presimplify(topo, (tri) => Math.abs((tri[0][0] - tri[2][0]) * (tri[1][1] - tri[0][1]) - (tri[0][0] - tri[1][0]) * (tri[2][1] - tri[0][1])) / 2);
topo = simplify(topo, SIMPLIFY);
const geoms = topo.objects.land.geometries;

const round = ([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
const territories = {};
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const t of WORLD) {
  // topojson's merge breaks on rings that pinch at a point, so union geometrically.
  const parts = feature(topo, { type: "GeometryCollection", geometries: geoms.filter((g) => g.properties.t === t.id) }).features
    .flatMap((f) => (f.geometry?.type === "Polygon" ? [f.geometry.coordinates] : f.geometry?.coordinates ?? []))
    .filter((p) => p[0].length > 3 && Math.abs(ringArea(p[0])) > 0.01);
  // Outer rings only: lakes inside a territory are filled in.
  const polys = polygonClipping.union(...parts.map((p) => [p])).filter((p) => Math.abs(ringArea(p[0])) > MIN_AREA);
  const biggest = polys.reduce((a, b) => (Math.abs(ringArea(a[0])) > Math.abs(ringArea(b[0])) ? a : b));
  for (const p of polys) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  territories[t.id] = {
    center: polylabel(biggest, 0.5).slice(0, 2).map(Math.round),
    area: Math.round(polys.reduce((s, p) => s + Math.abs(ringArea(p[0])), 0)),
    rings: polys.map((p) => p[0].map(round)),
  };
}

// Neighbour pairs whose shapes don't touch get a dotted sea route on the board.
const touching = new Set(), owners = {};
for (const g of geoms)
  for (const a of JSON.stringify(g.arcs).match(/-?\d+/g)?.map(Number) ?? []) (owners[a < 0 ? ~a : a] ??= new Set()).add(g.properties.t);
for (const set of Object.values(owners)) for (const a of set) for (const b of set) if (a !== b) touching.add(a + "|" + b);
const sea = [];
for (const t of WORLD) for (const n of t.neighbors) if (t.id < n && !touching.has(t.id + "|" + n)) sea.push([t.id, n]);
// A shared border without adjacency shows an attack the rules refuse.
const neighbors = new Set(WORLD.flatMap((t) => t.neighbors.map((n) => t.id + "|" + n)));
const stray = [...touching].filter((pair) => !neighbors.has(pair) && pair.split("|")[0] < pair.split("|")[1]);
if (stray.length) console.error("Shapes touching without adjacency:", stray.join(", "));

const out = { viewBox: [Math.floor(x0) - 12, Math.floor(y0) - 12, Math.ceil(x1 - x0) + 24, Math.ceil(y1 - y0) + 24], territories, sea };
fs.writeFileSync(new URL("../lib/map-data.json", import.meta.url), JSON.stringify(out));
console.error(`lib/map-data.json: ${WORLD.length} territories, ${sea.length} sea routes`);
