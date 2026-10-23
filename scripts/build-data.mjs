import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { csvParse } from "d3-dsv";
import { migrationFlows } from "./migration.mjs";

const RAW = new URL("../data-raw/", import.meta.url).pathname;
const OUT = new URL("../public/data/", import.meta.url).pathname;
mkdirSync(RAW, { recursive: true });
mkdirSync(RAW + "mig", { recursive: true });
mkdirSync(OUT, { recursive: true });

const SOURCES = {
  "population.csv":
    "https://ourworldindata.org/grapher/population.csv?v=1&csvType=full&useColumnShortNames=true",
  "tastdb.zip":
    "https://raw.githubusercontent.com/SlaveVoyages/voyages-contribute/HEAD/scripts/impute-transpiler/corpus/tastdb-exp-2019.zip",
  "iam.zip":
    "https://raw.githubusercontent.com/SlaveVoyages/voyages-contribute/HEAD/scripts/impute-transpiler/corpus/I-Am1.0.zip",
  "geographical.json":
    "https://raw.githubusercontent.com/IQSS/voyages/main/initialdata/geographical.json",
  "estimates.json":
    "https://raw.githubusercontent.com/IQSS/voyages/main/initialdata/estimates.json",
  "estimates_starter.json":
    "https://raw.githubusercontent.com/IQSS/voyages/main/initialdata/estimates_starter.json",
  "mig/dhs.zip":
    "https://ohss.dhs.gov/sites/default/files/2023-12/yrbk_2019_lpr_excel_final.zip",
  "mig/a350.csv":
    "https://www150.statcan.gc.ca/n1/pub/11-516-x/sectiona/A350-eng.csv",
};

for (const [file, url] of Object.entries(SOURCES)) {
  if (!existsSync(RAW + file)) {
    console.log(`downloading ${file}`);
    execSync(`curl -fsSL -o "${RAW + file}" "${url}"`);
  }
}
if (!existsSync(RAW + "tastdb-exp-2019.csv")) execSync(`unzip -o tastdb.zip`, { cwd: RAW });
if (!existsSync(RAW + "I-Am1.0.csv")) execSync(`unzip -o iam.zip`, { cwd: RAW });
if (!existsSync(RAW + "mig/fy2019_table2.xlsx")) execSync(`unzip -o mig/dhs.zip -d mig`, { cwd: RAW });

const COUNTRIES = [
  ["USA", "840", "North America", -98, 39],
  ["CAN", "124", "North America", -97, 55],
  ["MEX", "484", "North America", -102, 23.5],
  ["GRL", "304", "North America", -41, 72],
  ["SPM", "666", "North America", -56.3, 46.9],
  ["GTM", "320", "Central America", -90.3, 15.6],
  ["BLZ", "084", "Central America", -88.7, 17.2],
  ["HND", "340", "Central America", -86.6, 14.8],
  ["SLV", "222", "Central America", -88.9, 13.7],
  ["NIC", "558", "Central America", -85, 12.9],
  ["CRI", "188", "Central America", -84.1, 9.9],
  ["PAN", "591", "Central America", -80.1, 8.5],
  ["CUB", "192", "Caribbean", -79, 21.7],
  ["HTI", "332", "Caribbean", -72.7, 19],
  ["DOM", "214", "Caribbean", -70.5, 18.8],
  ["JAM", "388", "Caribbean", -77.3, 18.1],
  ["PRI", "630", "Caribbean", -66.5, 18.2],
  ["BHS", "044", "Caribbean", -77.4, 24.5],
  ["BRB", "052", "Caribbean", -59.55, 13.17],
  ["TTO", "780", "Caribbean", -61.3, 10.5],
  ["ATG", "028", "Caribbean", -61.8, 17.1],
  ["DMA", "212", "Caribbean", -61.35, 15.4],
  ["GRD", "308", "Caribbean", -61.7, 12.1],
  ["KNA", "659", "Caribbean", -62.75, 17.3],
  ["LCA", "662", "Caribbean", -60.97, 13.9],
  ["VCT", "670", "Caribbean", -61.2, 13.25],
  ["GLP", "312", "Caribbean", -61.55, 16.2],
  ["MTQ", "474", "Caribbean", -61, 14.65],
  ["ABW", "533", "Caribbean", -69.97, 12.5],
  ["AIA", "660", "Caribbean", -63.05, 18.22],
  ["MSR", "500", "Caribbean", -62.19, 16.74],
  ["VIR", "850", "Caribbean", -64.8, 18.34],
  ["TCA", "796", "Caribbean", -71.8, 21.8],
  ["BRA", "076", "South America", -51, -10],
  ["ARG", "032", "South America", -64, -34],
  ["COL", "170", "South America", -73.5, 4.5],
  ["PER", "604", "South America", -75, -9.5],
  ["VEN", "862", "South America", -66.5, 7.5],
  ["CHL", "152", "South America", -71, -33],
  ["ECU", "218", "South America", -78.4, -1.5],
  ["BOL", "068", "South America", -64.7, -16.7],
  ["PRY", "600", "South America", -58.4, -23.4],
  ["URY", "858", "South America", -56, -32.8],
  ["GUY", "328", "South America", -58.9, 5],
  ["SUR", "740", "South America", -55.9, 4.1],
  ["GUF", "254", "South America", -53.1, 4],
  ["FLK", "238", "South America", -59.5, -51.7],
];

const START = 1492;
const END = 2023;

function buildPopulation() {
  const rows = csvParse(readFileSync(RAW + "population.csv", "utf8"));
  const byCode = new Map();
  for (const r of rows) {
    if (!r.code) continue;
    const year = +r.year;
    if (year < 1400) continue;
    if (!byCode.has(r.code)) byCode.set(r.code, { name: r.entity, pts: [] });
    byCode.get(r.code).pts.push([year, +r.population_historical]);
  }
  const years = [];
  for (let y = START; y <= END; y++) years.push(y);
  const countries = [];
  for (const [iso, num, region, lon, lat] of COUNTRIES) {
    const d = byCode.get(iso);
    if (!d) throw new Error("missing " + iso);
    const pts = d.pts.sort((a, b) => a[0] - b[0]);
    const values = years.map((y) => {
      let i = pts.findIndex((p) => p[0] >= y);
      if (i === -1) return pts[pts.length - 1][1];
      if (pts[i][0] === y || i === 0) return pts[i][1];
      const [y0, v0] = pts[i - 1];
      const [y1, v1] = pts[i];
      const f = (y - y0) / (y1 - y0);
      if (v0 > 0 && v1 > 0) return Math.round(Math.exp(Math.log(v0) + f * (Math.log(v1) - Math.log(v0))));
      return Math.round(v0 + f * (v1 - v0));
    });
    const sourceYears = pts.filter((p) => p[0] >= 1400).map((p) => p[0]);
    countries.push({ iso, num, name: d.name, region, lon, lat, values, sourceYears: sourceYears.filter((y) => y <= 1800) });
  }
  writeFileSync(OUT + "population.json", JSON.stringify({ start: START, end: END, countries }));
  console.log(`population: ${countries.length} countries x ${years.length} years`);
}

const NATIONS = {
  3: "Spain / Uruguay",
  6: "Portugal / Brazil",
  7: "Great Britain",
  8: "Netherlands",
  9: "U.S.A.",
  10: "France",
  15: "Denmark / Baltic",
  30: "Other",
};

function buildVoyages() {
  const geo = JSON.parse(readFileSync(RAW + "geographical.json", "utf8"));
  const lookup = new Map();
  for (const g of geo) {
    const f = g.fields;
    const name = f.place || f.region || f.broad_region;
    lookup.set(+f.value, { name, lon: +f.longitude, lat: +f.latitude });
  }
  const resolve = (port, region) => {
    const p = lookup.get(+port);
    if (p && Number.isFinite(p.lon) && p.lon !== 0) return +port;
    const r = lookup.get(+region);
    if (r && Number.isFinite(r.lon)) return +region;
    const br = lookup.get(Math.floor(+region / 10000) * 10000);
    if (br) return Math.floor(+region / 10000) * 10000;
    return null;
  };

  const placeIndex = new Map();
  const places = [];
  let nextMigCode = 900001;
  const idx = (code) => {
    if (code == null) return -1;
    if (typeof code === "object") {
      const lon = +code.lon.toFixed(3);
      const lat = +code.lat.toFixed(3);
      const key = JSON.stringify(["migration", code.name, lon, lat]);
      if (!placeIndex.has(key)) {
        placeIndex.set(key, places.length);
        places.push([nextMigCode++, code.name, lon, lat]);
      }
      return placeIndex.get(key);
    }
    if (!placeIndex.has(code)) {
      const p = lookup.get(code);
      placeIndex.set(code, places.length);
      places.push([code, p.name, +p.lon.toFixed(3), +p.lat.toFixed(3)]);
    }
    return placeIndex.get(code);
  };

  const cols = { year: [], from: [], to: [], dep: [], emb: [], dis: [], nat: [], ship: [], kind: [], id: [], doc: [], org: [] };
  let skipped = 0;
  const push = (r, kind, k) => {
    const year = +r[k("YEARAM")];
    const from = resolve(r[k("MJBYPTIMP")], r[k("MAJBYIMP")]);
    const to = resolve(r[k("MJSLPTIMP")], r[k("MJSELIMP")]);
    if (!year || from == null || to == null || from === to) {
      skipped++;
      return;
    }
    cols.year.push(year);
    cols.from.push(idx(from));
    cols.to.push(idx(to));
    cols.dep.push(idx(resolve(r[k("PTDEPIMP")], Math.floor(+r[k("PTDEPIMP")] / 100) * 100)));
    cols.emb.push(Math.round(+r[k("SLAXIMP")] || 0));
    cols.dis.push(Math.round(+r[k("SLAMIMP")] || 0));
    cols.nat.push(+r[k("NATINIMP")] || 0);
    cols.ship.push((r[k("SHIPNAME")] || "").trim());
    cols.kind.push(kind);
    cols.id.push(+r[k("VOYAGEID")]);
    cols.doc.push(1);
    cols.org.push("");
  };

  const tast = csvParse(readFileSync(RAW + "tastdb-exp-2019.csv", "utf8"));
  for (const r of tast) push(r, 0, (c) => c);
  const iam = csvParse(readFileSync(RAW + "I-Am1.0.csv", "utf8"));
  for (const r of iam) push(r, 1, (c) => c.toLowerCase());

  // Representative free-migration ships (see migration.mjs for sources).
  // kind 2 = migration; each ship stands for `load` migrants over a flow's year range.
  let migShips = 0, migPeople = 0;
  const migrationModels = {};
  const flows = migrationFlows(RAW + "mig/a350.csv");
  let seed = 1234567;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const fl of flows) {
    const span = fl.y1 - fl.y0 + 1;
    const perYear = fl.n / span;
    const shipsPerYear = perYear / fl.load;
    let carry = 0;
    let destinationCursor = 0;
    for (let y = fl.y0; y <= fl.y1; y++) {
      const destinations = fl.destinations?.filter((d) => y >= d.y0 && y <= d.y1) ?? [fl];
      if (!destinations.length) throw new Error(`No migration gateway for ${fl.o} in ${y}`);
      carry += shipsPerYear;
      const nShips = Math.floor(carry + rand());
      carry -= nShips;
      if (nShips <= 0) continue;
      const fi = idx({ name: fl.o + " (departure)", lon: fl.f[0], lat: fl.f[1] });
      for (let s = 0; s < nShips; s++) {
        const destination = destinations[destinationCursor++ % destinations.length];
        const label = `${fl.o} → ${destination.d}`;
        const ti = idx({ name: destination.d + " (arrival)", lon: destination.t[0], lat: destination.t[1] });
        if (fl.destinations) {
          migrationModels[label] = {
            allocation: "Illustrative, evenly rotated gateways; not measured destination shares.",
            note: destination.note ?? "",
            waypoints: [[-10, 35], ...(destination.waypoints ?? [])],
          };
        }
        cols.year.push(y);
        cols.from.push(fi);
        cols.to.push(ti);
        cols.dep.push(fi);
        cols.emb.push(fl.load);
        cols.dis.push(fl.load);
        cols.nat.push(0);
        cols.ship.push(label);
        cols.kind.push(2);
        cols.id.push(0);
        cols.doc.push(fl.doc ? 1 : 0);
        cols.org.push(label);
        migShips++;
        migPeople += fl.load;
      }
    }
  }
  const llOf = (code) => lookup.get(code) ?? places[placeIndex.get(code)];

  const order = cols.year.map((_, i) => i).sort((a, b) => cols.year[a] - cols.year[b]);
  const sorted = {};
  for (const k of Object.keys(cols)) sorted[k] = order.map((i) => cols[k][i]);

  writeFileSync(OUT + "voyages.json", JSON.stringify({ nations: NATIONS, places, migrationModels, ...sorted }));
  console.log(`voyages: ${order.length} kept (${migShips} migration ≈ ${migPeople.toLocaleString()} people), ${skipped} skipped, ${places.length} places`);
}

function buildEstimates() {
  const est = JSON.parse(readFileSync(RAW + "estimates.json", "utf8"));
  const starter = JSON.parse(readFileSync(RAW + "estimates_starter.json", "utf8"));
  const importRegionArea = new Map();
  const areas = {};
  const nations = {};
  for (const s of starter) {
    if (s.model === "assessment.importregion") importRegionArea.set(s.pk, s.fields.import_area);
    if (s.model === "assessment.importarea") areas[s.pk] = s.fields.name;
    if (s.model === "assessment.nation") nations[s.pk] = s.fields.name;
  }
  const byYear = new Map();
  for (const e of est) {
    const f = e.fields;
    if (!byYear.has(f.year)) byYear.set(f.year, { year: f.year, embarked: 0, disembarked: 0, byNation: {}, byArea: {} });
    const y = byYear.get(f.year);
    y.embarked += f.embarked_slaves || 0;
    y.disembarked += f.disembarked_slaves || 0;
    y.byNation[f.nation] = (y.byNation[f.nation] || 0) + (f.embarked_slaves || 0);
    const area = importRegionArea.get(f.disembarkation_region);
    y.byArea[area] = (y.byArea[area] || 0) + (f.disembarked_slaves || 0);
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year).map((y) => ({
    year: y.year,
    embarked: Math.round(y.embarked),
    disembarked: Math.round(y.disembarked),
    byNation: Object.fromEntries(Object.entries(y.byNation).map(([k, v]) => [k, Math.round(v)])),
    byArea: Object.fromEntries(Object.entries(y.byArea).map(([k, v]) => [k, Math.round(v)])),
  }));
  writeFileSync(OUT + "estimates.json", JSON.stringify({ nations, areas, years }));
  const tot = years.reduce((s, y) => s + y.embarked, 0);
  console.log(`estimates: ${years.length} years, ${tot.toLocaleString()} embarked`);
}

buildPopulation();
buildVoyages();
buildEstimates();
