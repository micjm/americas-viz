import XLSX from "xlsx";
import { readFileSync } from "node:fs";

// Free (non-slave) migration flows into the Americas, 1500–1960.
// Combines official statistics (US DHS Yearbook 2019, Statistics Canada A350) with
// hand-coded published estimates (Eltis 1983; INDEC/IBGE historical compilations;
// Lai 1993 / Tinker 1974 for indenture; Stewart 1951 for the coolie trade).
// Everything before 1820, plus Argentina/Brazil/indenture/coolie series, is REPRESENTATIVE
// (decade totals spread across years), not documented voyages.
//
// Flows: { y0, y1, n, f: [lon,lat], t: [lon,lat], o: origin label, d: dest label,
//          load: people per representative ship, doc: documented? }

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
  // destinations
  newyork: [-74.0, 40.6],
  boston: [-70.9, 42.4],
  philadelphia: [-75.1, 39.9],
  baltimore: [-76.6, 39.25],
  neworleans: [-90.05, 29.3],
  quebec: [-71.3, 46.85],
  halifax: [-63.6, 44.65],
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

const SPANISH_GATEWAYS = [
  {
    y0: 1500, y1: 1820, t: P.santodomingo, d: "Caribbean — Santo Domingo",
    waypoints: [[-67.7, 20], [-67.8, 17.7]],
  },
  {
    y0: 1519, y1: 1820, t: P.veracruz, d: "New Spain — Veracruz / San Juan de Ulúa",
    waypoints: [[-73, 29], [-79, 27.5], [-79.5, 24], [-84, 24]],
  },
  {
    y0: 1519, y1: 1820, t: P.havana, d: "Cuba — Havana",
    waypoints: [[-73, 29], [-79, 27.5], [-79.5, 24], [-82.5, 23.6]],
  },
  { y0: 1521, y1: 1820, t: P.sanjuan, d: "Puerto Rico — San Juan" },
  {
    y0: 1533, y1: 1820, t: P.cartagena, d: "Northern South America — Cartagena",
    waypoints: [[-67.7, 20], [-67.8, 17.7], [-76, 12], [-76, 11]],
  },
  {
    y0: 1519, y1: 1596, t: P.nombrededios, d: "Panama — Nombre de Dios (Atlantic gateway)",
    note: "Onward travel to Peru required an isthmus crossing and a separate Pacific voyage; those legs are not drawn.",
    waypoints: [[-67.7, 20], [-67.8, 17.7], [-75, 13]],
  },
  {
    y0: 1597, y1: 1820, t: P.portobelo, d: "Panama — Portobelo (Atlantic gateway)",
    note: "Onward travel to Peru required an isthmus crossing and a separate Pacific voyage; those legs are not drawn.",
    waypoints: [[-67.7, 20], [-67.8, 17.7], [-75, 13]],
  },
  {
    y0: 1589, y1: 1820, t: P.laguaira, d: "Venezuela — La Guaira",
    waypoints: [[-67.7, 20], [-67.8, 17.7]],
  },
  {
    y0: 1778, y1: 1820, t: P.buenosaires, d: "Río de la Plata — Buenos Aires",
    note: "Buenos Aires received earlier restricted traffic; it joins this illustrative network at the broader 1778 trade opening.",
    waypoints: [[-22, 30], [-25, 20], [-30, -10], [-48, -30], [-54, -36]],
  },
];

const spanishFlow = (y0, y1, n, f) => ({
  ...flow(y0, y1, n, f, P.santodomingo, "Spain", "Spanish America"),
  destinations: SPANISH_GATEWAYS,
});

const FLOWS = [
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
  // British America
  flow(1600, 1640, 60000, P.london, P.boston, "Britain", "British America — Boston"),
  flow(1640, 1700, 250000, P.bristol, P.philadelphia, "Britain & Ireland", "British America — Philadelphia"),
  flow(1700, 1760, 400000, P.liverpool, P.philadelphia, "Britain, Ireland & Germany", "British America — Philadelphia"),
  flow(1760, 1780, 100000, P.liverpool, P.newyork, "Britain & Ireland", "British America — New York"),
  // French America
  flow(1600, 1640, 10000, P.lehavre, P.quebec, "France", "New France"),
  flow(1640, 1700, 15000, P.lehavre, P.quebec, "France", "New France"),
  flow(1700, 1760, 10000, P.lehavre, P.quebec, "France", "New France"),
  flow(1700, 1760, 8000, P.lehavre, P.neworleans, "France", "Louisiana"),
  // Dutch America
  flow(1620, 1664, 10000, P.rotterdam, P.newyork, "Netherlands", "New Netherland"),
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
    "Austria": [P.trieste, "Austria"],
    "Hungary": [P.trieste, "Hungary"],
    "Belgium": [P.rotterdam, "Belgium"],
    "Denmark": [P.hamburg, "Denmark"],
    "France": [P.lehavre, "France"],
    "Germany": [P.hamburg, "Germany"],
    "Greece": [P.naples, "Greece"],
    "Ireland": [P.liverpool, "Ireland"],
    "Italy": [P.naples, "Italy"],
    "Netherlands": [P.rotterdam, "Netherlands"],
    "Norway-Sweden": [P.hamburg, "Norway & Sweden"],
    "Norway": [P.hamburg, "Norway"],
    "Sweden": [P.hamburg, "Sweden"],
    "Poland": [P.gdansk, "Poland"],
    "Portugal": [P.lisbon, "Portugal"],
    "Romania": [P.constantinople, "Romania"],
    "Russia": [P.odessa, "Russia"],
    "Spain": [P.cadiz, "Spain"],
    "Switzerland": [P.lehavre, "Switzerland"],
    "United Kingdom": [P.liverpool, "United Kingdom"],
    "Yugoslavia": [P.trieste, "Yugoslavia"],
    "Other Europe": [P.hamburg, "Other Europe"],
    "China": [P.hongkong, "China"],
    "India": [P.calcutta, "India"],
    "Japan": [P.yokohama, "Japan"],
    "Other Asia": [P.hongkong, "Other Asia"],
  };
  const SKIP_PREFIX = ["Total", "Europe", "Asia", "America", "Africa", "Oceania", "Not Specified", "Canada", "Mexico",
    "Caribbean", "Cuba", "Dominican", "Haiti", "Jamaica", "Other Caribbean", "Central America", "Belize", "Costa Rica",
    "El Salvador", "Guatemala", "Honduras", "Nicaragua", "Panama", "South America", "Argentina", "Bolivia", "Brazil",
    "Chile", "Colombia", "Ecuador", "Guyana", "Paraguay", "Peru", "Suriname", "Uruguay", "Venezuela", "Other South",
    "Other America", "Egypt", "Ethiopia", "Liberia", "Morocco", "South Africa", "Other Africa", "Australia",
    "New Zealand", "Other Oceania", "Hong Kong", "Iran", "Israel", "Jordan", "Korea", "Philippines", "Syria",
    "Taiwan", "Turkey", "Vietnam", "Czechoslovakia", "Bulgaria", "Finland"];
  const flows = [];
  for (const r of rows) {
    const name0 = typeof r[0] === "string" ? r[0].replace(/\d*$/, "").trim() : "";
    if (!name0) continue;
    const clean = name0.replace(/^\s+/, "");
    if (SKIP_PREFIX.some((s) => clean === s || clean.startsWith(s))) continue;
    const key = Object.keys(ORIGIN).find((k) => clean.startsWith(k));
    if (!key) continue;
    const [port, label] = ORIGIN[key];
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
      flows.push(flow(y0, yy1, Math.round(v * frac), port, P.newyork, label, "United States", 400, true));
    }
  }
  return flows;
}

// ============================================================================
// Argentina 1857–1960 (INDEC compilations; gross entries by nationality, decadal)
// ============================================================================
const ARG = [
  // [decade, total, {Italian, Spanish, French, German, Ottoman, Russian, Portuguese}]
  [1857, 1869, 160000, { it: 0.45, es: 0.30, fr: 0.12, de: 0.04, pt: 0.02 }],
  [1870, 1879, 430000, { it: 0.50, es: 0.25, fr: 0.08, de: 0.04, ot: 0.03, ru: 0.02 }],
  [1880, 1889, 840000, { it: 0.55, es: 0.20, fr: 0.07, de: 0.03, ot: 0.04, ru: 0.04 }],
  [1890, 1899, 650000, { it: 0.50, es: 0.25, fr: 0.04, de: 0.03, ot: 0.05, ru: 0.05 }],
  [1900, 1909, 1130000, { it: 0.48, es: 0.30, fr: 0.03, de: 0.03, ot: 0.06, ru: 0.04 }],
  [1910, 1919, 1060000, { it: 0.42, es: 0.35, fr: 0.02, de: 0.02, ot: 0.06, ru: 0.03, pt: 0.02 }],
  [1920, 1929, 1120000, { it: 0.35, es: 0.35, fr: 0.02, de: 0.03, ot: 0.03, ru: 0.05, po: 0.04 }],
  [1930, 1939, 300000, { it: 0.30, es: 0.30, de: 0.08, po: 0.06 }],
  [1940, 1949, 250000, { it: 0.35, es: 0.35, de: 0.05 }],
  [1950, 1960, 350000, { it: 0.45, es: 0.30, de: 0.04 }],
];
const ARG_PORT = { it: P.genoa, es: P.coruna, fr: P.marseille, de: P.hamburg, ot: P.constantinople, ru: P.odessa, pt: P.lisbon, po: P.gdansk };
const ARG_LABEL = { it: "Italy", es: "Spain", fr: "France", de: "Germany", ot: "Ottoman Empire", ru: "Russia", pt: "Portugal", po: "Poland" };
for (const [y0, y1, total, mix] of ARG) {
  for (const [k, share] of Object.entries(mix)) {
    const n = Math.round(total * share);
    if (n < 500) continue;
    FLOWS.push(flow(y0, y1, n, ARG_PORT[k], P.buenosaires, ARG_LABEL[k], "Argentina", 600));
  }
}

// ============================================================================
// Brazil 1820–1960 (IBGE Estatísticas Históricas, by nationality, decadal)
// ============================================================================
const BRA = [
  [1820, 1869, 200000, { pt: 0.75, de: 0.10, it: 0.05, es: 0.02 }],
  [1870, 1879, 400000, { pt: 0.40, it: 0.30, de: 0.08, es: 0.05, jp: 0.0 }],
  [1880, 1889, 500000, { pt: 0.30, it: 0.45, de: 0.06, es: 0.08 }],
  [1890, 1899, 1200000, { pt: 0.22, it: 0.55, de: 0.05, es: 0.10, jp: 0.01 }],
  [1900, 1909, 650000, { pt: 0.30, it: 0.25, es: 0.18, jp: 0.06, ot: 0.08 }],
  [1910, 1919, 550000, { pt: 0.35, it: 0.20, es: 0.12, jp: 0.10, ot: 0.08, ru: 0.05 }],
  [1920, 1929, 850000, { pt: 0.30, it: 0.12, es: 0.08, jp: 0.15, ru: 0.08, de: 0.05 }],
  [1930, 1939, 400000, { pt: 0.25, it: 0.08, jp: 0.25, de: 0.10, po: 0.08 }],
  [1940, 1949, 150000, { pt: 0.30, jp: 0.15, it: 0.10, es: 0.10 }],
  [1950, 1960, 400000, { pt: 0.40, it: 0.10, jp: 0.10, es: 0.08, de: 0.06 }],
];
const BRA_PORT = { ...ARG_PORT, jp: P.yokohama };
for (const [y0, y1, total, mix] of BRA) {
  for (const [k, share] of Object.entries(mix)) {
    const n = Math.round(total * share);
    if (n < 500) continue;
    const dest = k === "jp" ? P.santos : P.rio;
    FLOWS.push(flow(y0, y1, n, BRA_PORT[k], dest, ARG_LABEL[k] ?? "Japan", "Brazil", 600));
  }
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
  // Grenada/St Lucia/St Vincent ~14k combined
  flow(1856, 1885, 9000, P.calcutta, P.georgetown, "India (indentured)", "Windward Islands", 350),
  // Cuba (Chinese) ~125k via Macao
  flow(1847, 1874, 125000, P.macao, P.havana, "China (coolie trade)", "Cuba", 300),
  // Peru (Chinese) ~95k via Macao
  flow(1849, 1874, 95000, P.macao, P.callao, "China (coolie trade)", "Peru", 300),
  // Panama railroad (Chinese) ~20k
  flow(1850, 1855, 20000, P.hongkong, P.panama, "China (railroad labor)", "Panama", 300),
  // British Guiana West-African/Azorean supplemental ~ skip
];
FLOWS.push(...INDENT);

// ============================================================================
// Chile, Cuba (Spanish post-independence), Mexico, Puerto Rico, others 1820–1960
// ============================================================================
const OTHER = [
  flow(1820, 1960, 200000, P.cadiz, P.havana, "Spain", "Cuba", 300),
  flow(1820, 1930, 100000, P.cadiz, P.sanjuan, "Spain", "Puerto Rico", 300),
  flow(1845, 1914, 60000, P.coruna, P.valparaiso, "Spain", "Chile", 400),
  flow(1880, 1914, 40000, P.hamburg, P.valparaiso, "Germany", "Chile", 400),
  flow(1845, 1914, 40000, P.lehavre, P.veracruz, "France", "Mexico", 400),
  flow(1880, 1910, 15000, P.genoa, P.veracruz, "Italy", "Mexico", 400),
  flow(1900, 1930, 12000, P.yokohama, P.veracruz, "Japan", "Mexico", 400),
  flow(1820, 1900, 60000, P.cadiz, P.cartagena, "Spain", "Colombia & Venezuela", 300),
  flow(1820, 1900, 30000, P.cadiz, P.callao, "Spain", "Peru", 300),
  flow(1900, 1914, 14000, P.yokohama, P.callao, "Japan", "Peru", 400),
  flow(1920, 1960, 20000, P.yokohama, P.callao, "Japan", "Peru", 400),
  flow(1830, 1900, 40000, P.cadiz, P.montevideo, "Spain & Italy", "Uruguay", 400),
  flow(1880, 1930, 130000, P.genoa, P.montevideo, "Italy", "Uruguay", 600),
  flow(1880, 1930, 80000, P.cadiz, P.montevideo, "Spain", "Uruguay", 600),
  flow(1840, 1880, 10000, P.liverpool, P.belizecity, "Britain", "Central America", 200),
  flow(1850, 1914, 30000, P.liverpool, P.kingston, "Britain", "Jamaica", 300),
  flow(1838, 1860, 40000, P.liverpool, P.georgetown, "Africa (free, post-emancipation)", "British Guiana", 300),
  flow(1838, 1870, 14000, P.macao, P.georgetown, "China (indentured)", "British Guiana", 300),
  flow(1852, 1862, 3000, P.hongkong, P.georgetown, "China (indentured)", "British Guiana", 300),
  flow(1841, 1867, 36000, P.liverpool, P.portofspain, "Madeira & Africa", "Trinidad", 300),
  flow(1850, 1914, 8000, P.hongkong, P.panama, "China", "Panama", 300),
  flow(1854, 1885, 11000, P.hongkong, P.portofspain, "China (indentured)", "Trinidad", 300),
  flow(1858, 1866, 2500, P.hongkong, P.kingston, "China (indentured)", "Jamaica", 300),
];
FLOWS.push(...OTHER);

export function migrationFlows(a350Path) {
  const flows = [...FLOWS, ...usFlows()];

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
