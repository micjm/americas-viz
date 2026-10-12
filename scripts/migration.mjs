import XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { annualMigrationFlows } from "./annual-migrations.mjs";

// Free (non-slave) migration flows into the Americas, 1500–1960.
// Combines official statistics (US DHS Yearbook 2019, Statistics Canada A350) with
// hand-coded published estimates (Eltis 1983; INDEC/IBGE historical compilations;
// Lai 1993 / Tinker 1974 for indenture; Stewart 1951 for the coolie trade).
// Everything before 1820, plus Argentina/Brazil/indenture/coolie series, is REPRESENTATIVE
// (decade totals spread across years), not documented voyages.
//
// Flows: { y0, y1, n, f: [lon,lat], t: [lon,lat], o: origin label, d: dest label,
//          load: people per representative ship, doc: documented? }
// A flow may instead carry `destinations`: eligible gateways per year, each with
// { y0, y1, t, d, note?, waypoints? }. build-data rotates representative ships
// evenly across the eligible gateways; this is an ILLUSTRATIVE distribution,
// not measured destination shares.

const flow = (y0, y1, n, f, t, o, d, load = 150, doc = false) => ({ y0, y1, n, f, t, o, d, load, doc });

// ---- ports [lon, lat] ----
const P = {
  lisbon: [-9.14, 38.7],
  cadiz: [-6.29, 36.53],
  seville: [-6.35, 36.78],
  coruna: [-8.4, 43.37],
  liverpool: [-2.99, 53.4],
  london: [-0.08, 51.5],
  bristol: [-2.59, 51.45],
  hamburg: [10.0, 53.55],
  bremen: [8.8, 53.08],
  rotterdam: [4.48, 51.92],
  lehavre: [0.1, 49.49],
  marseille: [5.37, 43.3],
  genoa: [8.93, 44.4],
  naples: [14.27, 40.84],
  palermo: [13.36, 38.12],
  trieste: [13.77, 45.65],
  gdansk: [18.66, 54.35],
  odessa: [30.73, 46.48],
  constantinople: [28.98, 41.01],
  calcutta: [88.36, 22.57],
  madras: [80.27, 13.08],
  hongkong: [114.17, 22.3],
  macao: [113.55, 22.17],
  yokohama: [139.65, 35.45],
  shanghai: [121.47, 31.23],
  hongkong_pacific: [140.0, 22.3],
  macao_pacific: [140.0, 22.17],
  // destinations
  newyork: [-74.0, 40.6],
  boston: [-70.9, 42.4],
  philadelphia: [-75.1, 39.9],
  baltimore: [-76.6, 39.25],
  neworleans: [-90.05, 29.3],
  sanfrancisco: [-122.42, 37.77],
  mazatlan: [-106.42, 23.23],
  vancouver: [-123.12, 49.28],
  quebec: [-71.3, 46.85],
  halifax: [-63.6, 44.65],
  jamestown: [-76.78, 37.21],
  bridgetown: [-59.62, 13.1],
  veracruz: [-96.1, 19.2],
  santodomingo: [-69.9, 18.47],
  havana: [-82.37, 23.11],
  sanjuan: [-66.1, 18.45],
  rio: [-43.21, -22.9],
  santos: [-46.33, -23.98],
  salvador: [-38.5, -12.97],
  buenosaires: [-58.4, -34.6],
  callao: [-77.15, -12.05],
  panama: [-79.52, 8.97],
  caracas: [-66.9, 10.6],
  cartagena: [-75.55, 10.42],
  montevideo: [-56.2, -34.9],
  valparaiso: [-71.6, -33.04],
  georgetown: [-58.16, 6.8],
  paramaribo: [-55.2, 5.87],
  portofspain: [-61.52, 10.65],
  kingston: [-76.8, 17.98],
  fortdefrance: [-61.07, 14.6],
  pointeapytre: [-61.53, 16.24],
  cayenne: [-52.33, 4.93],
  recife: [-34.9, -8.05],
  nassau: [-77.35, 25.05],
  belizecity: [-88.2, 17.5],
  nombrededios: [-79.48, 9.58],
  portobelo: [-79.65, 9.55],
  laguaira: [-66.93, 10.6],
};

const PERU_ISTHMUS_NOTE =
  "Schematic path combines the Atlantic voyage, an overland isthmus crossing (Nombre de Dios until 1596, Portobelo from 1597, then Panama City), and a separate Pacific voyage.";

const SPANISH_GATEWAYS = [
  {
    y0: 1500,
    y1: 1820,
    t: P.santodomingo,
    d: "Caribbean — Santo Domingo",
    waypoints: [[-67.7, 20], [-67.8, 17.7]],
  },
  {
    y0: 1519,
    y1: 1820,
    t: P.veracruz,
    d: "New Spain — Veracruz / San Juan de Ulúa",
    waypoints: [[-73, 29], [-79, 27.5], [-79.5, 24], [-84, 24]],
  },
  {
    y0: 1519,
    y1: 1820,
    t: P.havana,
    d: "Cuba — Havana",
    waypoints: [[-73, 29], [-79, 27.5], [-79.5, 24], [-82.5, 23.6]],
  },
  { y0: 1521, y1: 1820, t: P.sanjuan, d: "Puerto Rico — San Juan" },
  {
    y0: 1533,
    y1: 1820,
    t: P.cartagena,
    d: "Northern South America — Cartagena",
    waypoints: [[-67.7, 20], [-67.8, 17.7], [-76, 12], [-76, 11]],
  },
  {
    y0: 1519,
    y1: 1596,
    t: P.callao,
    d: "Peru — Callao (via Panama isthmus)",
    note: PERU_ISTHMUS_NOTE,
    landCrossing: true,
    waypoints: [
      [-67.7, 20],
      [-67.8, 17.7],
      [-75, 13],
      [-79.48, 9.58],
      [-79.55, 9.1],
      [-79.52, 8.97],
      [-79.9, 7.6],
      [-80.8, 6.6],
      [-83.5, 0],
      [-82.5, -5],
      [-81, -8],
    ],
  },
  {
    y0: 1597,
    y1: 1820,
    t: P.callao,
    d: "Peru — Callao (via Panama isthmus)",
    note: PERU_ISTHMUS_NOTE,
    landCrossing: true,
    waypoints: [
      [-67.7, 20],
      [-67.8, 17.7],
      [-75, 13],
      [-79.65, 9.55],
      [-79.55, 9.1],
      [-79.52, 8.97],
      [-79.9, 7.6],
      [-80.8, 6.6],
      [-83.5, 0],
      [-82.5, -5],
      [-81, -8],
    ],
  },
  {
    y0: 1740,
    y1: 1820,
    t: P.callao,
    d: "Peru — Callao (Cape Horn route)",
    note: "Direct Spain–Pacific voyages around Cape Horn became more prominent from the 1740s; the isthmus route did not close completely.",
    waypoints: [
      [-22, 30],
      [-25, 20],
      [-30, -10],
      [-48, -30],
      [-58, -45],
      [-63, -53],
      [-64, -55.8],
      [-67, -56.5],
      [-71, -56],
      [-76.5, -53],
      [-78, -46],
      [-78, -38],
      [-77.5, -20],
    ],
  },
  {
    y0: 1589,
    y1: 1820,
    t: P.laguaira,
    d: "Venezuela — La Guaira",
    waypoints: [[-67.7, 20], [-67.8, 17.7]],
  },
  {
    y0: 1778,
    y1: 1820,
    t: P.buenosaires,
    d: "Río de la Plata — Buenos Aires",
    note: "Buenos Aires received earlier restricted traffic; it joins this illustrative network at the broader 1778 trade opening.",
    waypoints: [[-22, 30], [-25, 20], [-30, -10], [-48, -30], [-54, -36]],
  },
];

const noted = (fl, note) => ({ ...fl, note });

const VIRGINIA_CO_NOTE =
  "Virginia Company sent roughly 7,000 people in 1607–1624 (about 1,800 before the 1619 Sandys reforms); only ~1,200 were alive at the 1625 muster.";
const CHESAPEAKE_NOTE =
  "Approximate period total (Horn; Menard): ~110,000 English migrants to the Chesapeake 1625–1699, mostly indentured servants.";
const NEW_ENGLAND_NOTE =
  "Plymouth (1620) held only a few hundred settlers by 1630; ~20,000 arrived in the 1630s Great Migration (Anderson), and arrivals fell off after 1640.";
const CARIBBEAN_NOTE =
  "St Kitts (1624) and Barbados (1627) drew roughly 190,000 English and Irish migrants in the 17th century (Gemery; Galenson) — more than any mainland colony.";

const spanishFlow = (y0, y1, n, f) => ({
  ...flow(y0, y1, n, f, P.santodomingo, "Spain", "Spanish America"),
  destinations: SPANISH_GATEWAYS,
});

// ============================================================================
// Pre-1820 European settlement (Eltis 1983, decadal; Gemery; Boyd-Bowman)
// ============================================================================
const FLOWS = [
  // Spanish America (via Seville/Cádiz; Caribbean + Veracruz + Cartagena + Panama + later Cape Horn / Buenos Aires)
  spanishFlow(1500, 1580, 120000, P.seville),
  spanishFlow(1580, 1640, 200000, P.seville),
  spanishFlow(1640, 1700, 100000, P.cadiz),
  spanishFlow(1700, 1760, 150000, P.cadiz),
  spanishFlow(1760, 1820, 100000, P.cadiz),
  // Brazil (Portugal)
  flow(1500, 1580, 20000, P.lisbon, P.salvador, "Portugal", "Brazil"),
  flow(1580, 1640, 120000, P.lisbon, P.salvador, "Portugal", "Brazil"),
  flow(1640, 1700, 150000, P.lisbon, P.recife, "Portugal", "Brazil"),
  flow(1700, 1760, 300000, P.lisbon, P.rio, "Portugal", "Brazil"),
  flow(1760, 1820, 100000, P.lisbon, P.rio, "Portugal", "Brazil"),
  // British America: each destination starts at its founding date, and periods
  // are split so a period total is not spread back into the years before a colony grew.
  noted(flow(1607, 1618, 1800, P.london, P.jamestown, "Britain", "British America — Virginia (Jamestown)"), VIRGINIA_CO_NOTE),
  noted(flow(1619, 1624, 5000, P.london, P.jamestown, "Britain", "British America — Virginia (Jamestown)"), VIRGINIA_CO_NOTE),
  noted(flow(1625, 1639, 15000, P.london, P.jamestown, "Britain", "British America — Chesapeake (Virginia)"), CHESAPEAKE_NOTE),
  noted(flow(1640, 1699, 95000, P.bristol, P.jamestown, "Britain", "British America — Chesapeake (Virginia & Maryland)"), CHESAPEAKE_NOTE),
  noted(flow(1620, 1629, 1000, P.london, P.boston, "Britain", "British America — New England (Plymouth & Boston)"), NEW_ENGLAND_NOTE),
  noted(flow(1630, 1640, 20000, P.london, P.boston, "Britain", "British America — New England (Plymouth & Boston)"), NEW_ENGLAND_NOTE),
  noted(flow(1641, 1699, 5000, P.london, P.boston, "Britain", "British America — New England (Plymouth & Boston)"), NEW_ENGLAND_NOTE),
  noted(flow(1627, 1639, 20000, P.london, P.bridgetown, "Britain", "British Caribbean — Barbados & Leewards"), CARIBBEAN_NOTE),
  noted(flow(1640, 1699, 170000, P.bristol, P.bridgetown, "Britain & Ireland", "British Caribbean — Barbados & Leewards"), CARIBBEAN_NOTE),
  noted(flow(1682, 1699, 12000, P.bristol, P.philadelphia, "Britain & Ireland", "British America — Philadelphia"), "Pennsylvania was founded in 1682; earlier middle-colony arrivals are not modeled."),
  flow(1700, 1759, 400000, P.liverpool, P.philadelphia, "Britain, Ireland & Germany", "British America — Philadelphia"),
  flow(1760, 1780, 100000, P.liverpool, P.newyork, "Britain & Ireland", "British America — New York"),
  // French America (Quebec founded 1608; ~300 colonists by 1640)
  flow(1608, 1639, 1000, P.lehavre, P.quebec, "France", "New France"),
  flow(1640, 1699, 15000, P.lehavre, P.quebec, "France", "New France"),
  flow(1700, 1760, 10000, P.lehavre, P.quebec, "France", "New France"),
  flow(1700, 1760, 8000, P.lehavre, P.neworleans, "France", "Louisiana"),
  // Dutch America (first New Netherland settlers 1624)
  flow(1624, 1664, 10000, P.rotterdam, P.newyork, "Netherlands", "New Netherland"),
  flow(1630, 1654, 6000, P.rotterdam, P.recife, "Netherlands", "Dutch Brazil"),
];

// ============================================================================
// US: DHS Yearbook 2019 Table 2 (decade × origin) + Table 1 (annual totals)
// ============================================================================
function usFlows() {
  const wb = XLSX.readFile(new URL("../data-raw/mig/fy2019_table2.xlsx", import.meta.url).pathname);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  const header = rows[3];
  const decLabels = [];
  for (let c = 1; c < header.length; c++) {
    const m = /^(\d{4}) to (\d{4})$/.exec(String(header[c] ?? ""));
    decLabels.push(m ? [+m[1], +m[2]] : null);
  }
  // origin -> [port, label, include?]
  const ORIGIN = {
    "Austria-Hungary": [P.trieste, "Austria-Hungary"],
    Austria: [P.trieste, "Austria"],
    Hungary: [P.trieste, "Hungary"],
    Belgium: [P.rotterdam, "Belgium"],
    Denmark: [P.hamburg, "Denmark"],
    France: [P.lehavre, "France"],
    Germany: [P.hamburg, "Germany"],
    Greece: [P.naples, "Greece"],
    Ireland: [P.liverpool, "Ireland"],
    Italy: [P.naples, "Italy"],
    Netherlands: [P.rotterdam, "Netherlands"],
    "Norway-Sweden": [P.hamburg, "Norway & Sweden"],
    Norway: [P.hamburg, "Norway"],
    Sweden: [P.hamburg, "Sweden"],
    Poland: [P.gdansk, "Poland"],
    Portugal: [P.lisbon, "Portugal"],
    Romania: [P.constantinople, "Romania"],
    Russia: [P.odessa, "Russia"],
    Spain: [P.cadiz, "Spain"],
    Switzerland: [P.lehavre, "Switzerland"],
    "United Kingdom": [P.liverpool, "United Kingdom"],
    Yugoslavia: [P.trieste, "Yugoslavia"],
    "Other Europe": [P.hamburg, "Other Europe"],
    China: [P.hongkong_pacific, "China"],
    India: [P.calcutta, "India"],
    Japan: [P.yokohama, "Japan"],
    "Other Asia": [P.hongkong_pacific, "Other Asia"],
  };
  const SKIP_PREFIX = [
    "Total", "Europe", "Asia", "America", "Africa", "Oceania", "Not Specified", "Canada", "Mexico",
    "Caribbean", "Cuba", "Dominican", "Haiti", "Jamaica", "Other Caribbean", "Central America", "Belize", "Costa Rica",
    "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panama", "South America", "Argentina", "Bolivia", "Brazil",
    "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela", "Other South",
    "Other America", "Egypt", "Ethiopia", "Liberia", "Morocco", "South Africa", "Other Africa", "Australia",
    "New Zealand", "Other Oceania", "Hong Kong", "Iran", "Israel", "Jordan", "Korea", "Philippines", "Syria",
    "Taiwan", "Turkey", "Vietnam", "Czechoslovakia", "Bulgaria", "Finland",
  ];
  const flows = [];
  for (const r of rows) {
    const name0 = typeof r[0] === "string" ? r[0].replace(/\d*$/, "").trim() : "";
    if (!name0) continue;
    const clean = name0.replace(/^\s+/, "");
    if (SKIP_PREFIX.some((s) => clean === s || clean.startsWith(s))) continue;
    const key = Object.keys(ORIGIN).find((k) => clean.startsWith(k));
    if (!key) continue;
    const [port, label] = ORIGIN[key];
    const destPort = key === "China" || key === "Japan" || key === "Other Asia" ? P.sanfrancisco : P.newyork;
    for (let c = 1; c < r.length && c <= decLabels.length; c++) {
      const dl = decLabels[c - 1];
      if (!dl) continue; // annual 2010+ columns: beyond our range, skip
      const v = typeof r[c] === "number" ? r[c] : 0;
      if (v <= 0) continue;
      const [y0, y1] = dl;
      if (y0 > 1960) continue;
      const yy1 = Math.min(y1, 1960);
      if (yy1 < y0) continue;
      const frac = (yy1 - y0 + 1) / (y1 - y0 + 1);
      flows.push(flow(y0, yy1, Math.round(v * frac), port, destPort, label, "United States", 400, true));
    }
  }
  return flows;
}

// ============================================================================
// Indian indenture (Lai 1993 / Tinker 1974) and Chinese coolie trade (Stewart 1951)
// ============================================================================
const INDENT = [
  // Guyana (Demerara) ~239k
  flow(1838, 1917, 239000, P.calcutta, P.georgetown, "India (indentured)", "British Guiana", 350),
  // Trinidad ~144k
  flow(1845, 1917, 144000, P.calcutta, P.portofspain, "India (indentured)", "Trinidad", 350),
  // Jamaica ~36k
  flow(1845, 1916, 36000, P.calcutta, P.kingston, "India (indentured)", "Jamaica", 350),
  // Suriname ~34k
  flow(1873, 1916, 34000, P.calcutta, P.paramaribo, "India (indentured)", "Suriname", 350),
  // Guadeloupe ~42k, Martinique ~26k
  flow(1854, 1889, 42000, P.calcutta, P.pointeapytre, "India (indentured)", "Guadeloupe", 350),
  flow(1854, 1889, 26000, P.calcutta, P.fortdefrance, "India (indentured)", "Martinique", 350),
  // French Guiana ~19k
  flow(1854, 1889, 19000, P.calcutta, P.cayenne, "India (indentured)", "French Guiana", 350),
  // Grenada/St Lucia/St Vincent ~9k combined
  flow(1856, 1885, 9000, P.calcutta, P.georgetown, "India (indentured)", "Windward Islands", 350),
  // Cuba (Chinese) ~125k via Macao
  flow(1847, 1874, 125000, P.macao, P.havana, "China (coolie trade)", "Cuba", 300),
  // Peru (Chinese) ~95k via Macao
  flow(1849, 1874, 95000, P.macao_pacific, P.callao, "China (coolie trade)", "Peru", 300),
  // Panama railroad (Chinese) ~20k
  flow(1850, 1855, 20000, P.hongkong_pacific, P.panama, "China (railroad labor)", "Panama", 300),
];
FLOWS.push(...INDENT);

// ============================================================================
// Chile, Mexico, Puerto Rico, Colombia, others 1820–1960
// (Argentina, Brazil, Uruguay, Cuba, and Venezuela use source-backed annual series)
// ============================================================================
const OTHER = [
  flow(1820, 1930, 100000, P.cadiz, P.sanjuan, "Spain", "Puerto Rico", 300),
  flow(1845, 1914, 60000, P.coruna, P.valparaiso, "Spain", "Chile", 400),
  flow(1880, 1914, 40000, P.hamburg, P.valparaiso, "Germany", "Chile", 400),
  flow(1845, 1914, 40000, P.lehavre, P.veracruz, "France", "Mexico", 400),
  flow(1880, 1910, 15000, P.genoa, P.veracruz, "Italy", "Mexico", 400),
  flow(1900, 1930, 12000, P.yokohama, P.mazatlan, "Japan", "Mexico", 400),
  flow(1820, 1900, 40000, P.cadiz, P.cartagena, "Spain", "Colombia", 300),
  flow(1820, 1900, 30000, P.cadiz, P.callao, "Spain", "Peru", 300),
  flow(1900, 1914, 14000, P.yokohama, P.callao, "Japan", "Peru", 400),
  flow(1920, 1960, 20000, P.yokohama, P.callao, "Japan", "Peru", 400),
  flow(1840, 1880, 10000, P.liverpool, P.belizecity, "Britain", "Central America", 200),
  flow(1850, 1914, 30000, P.liverpool, P.kingston, "Britain", "Jamaica", 300),
  flow(1838, 1860, 40000, P.liverpool, P.georgetown, "Africa (free, post-emancipation)", "British Guiana", 300),
  flow(1838, 1870, 14000, P.macao, P.georgetown, "China (indentured)", "British Guiana", 300),
  flow(1852, 1862, 3000, P.hongkong, P.georgetown, "China (indentured)", "British Guiana", 300),
  flow(1841, 1867, 36000, P.liverpool, P.portofspain, "Madeira & Africa", "Trinidad", 300),
  flow(1850, 1914, 8000, P.hongkong_pacific, P.panama, "China", "Panama", 300),
  flow(1854, 1885, 11000, P.hongkong, P.portofspain, "China (indentured)", "Trinidad", 300),
  flow(1858, 1866, 2500, P.hongkong, P.kingston, "China (indentured)", "Jamaica", 300),
];
FLOWS.push(...OTHER);

export function migrationFlows(a350Path) {
  const flows = [...FLOWS, ...usFlows(), ...annualMigrationFlows(P, flow, noted)];

  // Canada official annual arrivals (StatCan A350), 1852–1960.
  // Column pairs "Year","Number" are laid out 5 across; values like "73,912".
  const text = readFileSync(a350Path, "utf8");
  for (const m of text.matchAll(/(18[5-9]\d|19[0-6]\d)\s*,\s*"([\d,]+)"/g)) {
    const y = +m[1];
    if (y < 1852 || y > 1960) continue;
    const n = +m[2].replaceAll(",", "");
    if (!n) continue;
    flows.push(flow(y, y, n, P.liverpool, P.quebec, "Mostly Britain & Europe", "Canada", 400, true));
  }
  return flows;
}
