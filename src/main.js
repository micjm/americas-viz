import * as d3 from "d3";
import { feature } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import { COLUMBUS, EXPLORERS, EVENTS } from "./history.js";

const BASE = import.meta.env.BASE_URL;
const START = 1492.58;
const END = 2023;
const REGIONS = ["North America", "Central America", "Caribbean", "South America"];
const REGION_COLORS = { "North America": "#7fb3d5", "Central America": "#f0b35a", Caribbean: "#5ec4b6", "South America": "#d98cb3" };
const TYPE_COLORS = {
  slave: "#e8554e",
  migration: "#63d68c",
  migrationDoc: "#2fae62",
  exploration: "#f6c445",
};
const NATION_COLORS = {
  3: "#f6c445",
  6: "#3fbf7f",
  7: "#e8554e",
  8: "#f08c2e",
  9: "#5b8def",
  10: "#9b7bea",
  15: "#e6e6e6",
  30: "#9aa0a6",
  0: "#9aa0a6",
};
const ESTIMATE_NATION_TO_CODE = { 1: 3, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 15, 8: 30 };

const fmt = d3.format(",");
const fmtShort = (n) => (n >= 1e9 ? d3.format(".2f")(n / 1e9) + " billion" : n >= 1e6 ? d3.format(".1f")(n / 1e6) + " million" : fmt(Math.round(n)));
const fmtPct = d3.format("+.0%");

const state = {
  t: START,
  playing: false,
  speed: 3,
  scale: "log",
  layers: { bubbles: true, shade: true, trans: true, intra: true, migration: true, columbus: true },
};

const ALL_EXPLORERS = [...COLUMBUS.map((v) => ({ ...v, who: "Columbus" })), ...EXPLORERS.map((v) => ({ ...v, who: v.name.split(",")[0] }))];

const [pop, voy, est] = await Promise.all(
  ["population.json", "voyages.json", "estimates.json"].map((f) => fetch(`${BASE}data/${f}`).then((r) => r.json()))
);
document.getElementById("loading").remove();

const POP_START = pop.start;
const nYears = pop.end - pop.start + 1;
const popAt = (c, t) => {
  const x = Math.max(0, Math.min(nYears - 1, t - POP_START));
  const i = Math.floor(x);
  const f = x - i;
  const a = c.values[i];
  const b = c.values[Math.min(nYears - 1, i + 1)];
  return a + (b - a) * f;
};
const baseline = new Map(pop.countries.map((c) => [c.num, c]));
const regionTotals = REGIONS.map((r) => {
  const cs = pop.countries.filter((c) => c.region === r);
  return d3.range(nYears).map((i) => d3.sum(cs, (c) => c.values[i]));
});
const totalSeries = d3.range(nYears).map((i) => d3.sum(regionTotals, (s) => s[i]));
const totalAt = (t) => {
  const x = Math.max(0, Math.min(nYears - 1, t - POP_START));
  const i = Math.floor(x);
  return totalSeries[i] + (totalSeries[Math.min(nYears - 1, i + 1)] - totalSeries[i]) * (x - i);
};

const N = voy.year.length;
const yearStartIdx = new Map();
for (let i = N - 1; i >= 0; i--) yearStartIdx.set(voy.year[i], i);
const hash = (n) => {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};
const phase = Float32Array.from(voy.id, (id, i) => hash(id * 31 + i));

const estByYear = new Map(est.years.map((y) => [y.year, y]));
const cumEmb = new Map();
const cumDis = new Map();
{
  let e = 0;
  let dd = 0;
  for (let y = 1490; y <= 2025; y++) {
    const r = estByYear.get(y);
    if (r) {
      e += r.embarked;
      dd += r.disembarked;
    }
    cumEmb.set(y, e);
    cumDis.set(y, dd);
  }
}

const wrap = document.getElementById("map-wrap");
const baseSvg = d3.select("#map-base");
const overlay = d3.select("#map-overlay");
const trailsCanvas = document.getElementById("trails");
const shipsCanvas = document.getElementById("ships");
const tctx = trailsCanvas.getContext("2d");
const sctx = shipsCanvas.getContext("2d");
const tooltip = d3.select("#tooltip");

const countries = feature(world, world.objects.countries);
const graticule = d3.geoGraticule10();
const projection = d3.geoNaturalEarth1().rotate([45, 0]);
const geoPath = d3.geoPath(projection);
let W = 0;
let H = 0;
let dpr = 1;
let pathCache = new Map();

const gSphere = baseSvg.append("path").attr("class", "sphere");
const gGrat = baseSvg.append("path").attr("class", "graticule");
const gCountries = baseSvg.append("g");
const gColumbus = overlay.append("g").attr("class", "columbus");
const gBubbles = overlay.append("g").attr("class", "bubbles");

const countryPaths = gCountries
  .selectAll("path")
  .data(countries.features)
  .join("path")
  .attr("class", (d) => (baseline.has(d.id) ? "country americas" : "country"));

const shade = d3.scaleDiverging([Math.log(1 / 20), 0, Math.log(20)], (x) => d3.interpolateRdBu(x)).clamp(true);

const rScale = d3.scaleSqrt().domain([0, 350e6]);

const bubbleData = pop.countries.slice().sort((a, b) => b.values[nYears - 1] - a.values[nYears - 1]);
const bubbles = gBubbles
  .selectAll("circle")
  .data(bubbleData, (d) => d.iso)
  .join("circle")
  .attr("class", "bubble")
  .on("mousemove", (ev, c) => {
    const p = popAt(c, state.t);
    const b = popAt(c, START);
    showTip(
      ev,
      `<b>${c.name}</b><br>${fmtShort(p)} people in ${Math.floor(state.t)}<br><span class="muted">${fmtPct(p / b - 1)} vs 1492 (${fmtShort(b)})</span>`
    );
  })
  .on("mouseleave", hideTip);

const columbusGroups = gColumbus
  .selectAll("g")
  .data(ALL_EXPLORERS)
  .join("g")
  .attr("class", "cvoyage");
columbusGroups.append("path").attr("class", "c-route-bg");
columbusGroups.append("path").attr("class", "c-route");
columbusGroups.append("circle").attr("class", "c-ship").attr("r", 5);
columbusGroups.append("text").attr("class", "c-label");

function resize() {
  const rect = wrap.getBoundingClientRect();
  W = Math.max(320, rect.width);
  H = Math.max(260, rect.height);
  dpr = window.devicePixelRatio || 1;
  for (const c of [trailsCanvas, shipsCanvas]) {
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = W + "px";
    c.style.height = H + "px";
  }
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  baseSvg.attr("width", W).attr("height", H);
  overlay.attr("width", W).attr("height", H);
  projection.fitExtent(
    [
      [8, 8],
      [W - 8, H - 8],
    ],
    {
      type: "MultiPoint",
      coordinates: [
        [-128, 62],
        [42, 62],
        [-128, -56],
        [42, -56],
        [-45, 66],
        [-45, -57],
      ],
    }
  );
  rScale.range([0, Math.min(W, H) * 0.085]);
  pathCache = new Map();
  gSphere.attr("d", geoPath({ type: "Sphere" }));
  gGrat.attr("d", geoPath(graticule));
  countryPaths.attr("d", geoPath);
  bubbles.attr("cx", (c) => projection([c.lon, c.lat])[0]).attr("cy", (c) => projection([c.lon, c.lat])[1]);
  for (const v of ALL_EXPLORERS) v.projected = buildColumbusPath(v);
  columbusGroups.select(".c-route-bg").attr("d", (v) => v.projected.d);
  columbusGroups.select(".c-route").attr("d", (v) => v.projected.d);
  tctx.clearRect(0, 0, W, H);
  renderStatic();
}

function sampleGreatCircle(a, b, n) {
  const interp = d3.geoInterpolate(a, b);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(interp(i / n));
  return out;
}

function voyagePath(i) {
  let p = pathCache.get(i);
  if (p) return p;
  const from = voy.places[voy.from[i]];
  const to = voy.places[voy.to[i]];
  const a = [from[2], from[3]];
  const b = [to[2], to[3]];
  const legs = [];
  const waypoints = voy.kind[i] === 2 ? voy.migrationModels?.[voy.org[i]]?.waypoints : null;
  if (waypoints?.length) {
    const stops = [a, ...waypoints, b];
    for (let j = 1; j < stops.length; j++) legs.push([stops[j - 1], stops[j]]);
  } else if (a[0] > 22 && a[0] < 135 && b[0] < 0) {
    legs.push([a, [33, -34]], [[33, -34], [18, -36]], [[18, -36], b]);
  } else if (b[0] > 22 && b[0] < 135 && a[0] < 0) {
    legs.push([a, [18, -36]], [[18, -36], [33, -34]], [[33, -34], b]);
  } else {
    legs.push([a, b]);
  }
  const pts = [];
  for (const [p0, p1] of legs) {
    const dist = d3.geoDistance(p0, p1);
    const n = Math.max(4, Math.ceil(dist * 40));
    const s = sampleGreatCircle(p0, p1, n);
    if (pts.length) s.shift();
    pts.push(...s);
  }
  const xy = new Float32Array(pts.length * 2);
  const cum = new Float32Array(pts.length);
  let total = 0;
  pts.forEach((g, k) => {
    const [x, y] = projection(g);
    xy[k * 2] = x;
    xy[k * 2 + 1] = y;
    if (k > 0) total += Math.hypot(x - xy[k * 2 - 2], y - xy[k * 2 - 1]);
    cum[k] = total;
  });
  p = { xy, cum, total };
  pathCache.set(i, p);
  return p;
}

function pointAt(p, f) {
  const target = Math.max(0, Math.min(1, f)) * p.total;
  let lo = 0;
  let hi = p.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const k = Math.max(1, lo);
  const c0 = p.cum[k - 1];
  const c1 = p.cum[k];
  const g = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
  return [p.xy[(k - 1) * 2] + g * (p.xy[k * 2] - p.xy[(k - 1) * 2]), p.xy[(k - 1) * 2 + 1] + g * (p.xy[k * 2 + 1] - p.xy[(k - 1) * 2 + 1])];
}

function buildColumbusPath(v) {
  const pts = [];
  for (let j = 1; j < v.pts.length; j++) {
    const s = sampleGreatCircle(v.pts[j - 1], v.pts[j], Math.max(4, Math.ceil(d3.geoDistance(v.pts[j - 1], v.pts[j]) * 60)));
    if (pts.length) s.shift();
    pts.push(...s);
  }
  const xy = new Float32Array(pts.length * 2);
  const cum = new Float32Array(pts.length);
  let total = 0;
  let d = "";
  pts.forEach((g, k) => {
    const [x, y] = projection(g);
    xy[k * 2] = x;
    xy[k * 2 + 1] = y;
    if (k > 0) {
      total += Math.hypot(x - xy[k * 2 - 2], y - xy[k * 2 - 1]);
      d += `L${x.toFixed(1)},${y.toFixed(1)}`;
    } else d = `M${x.toFixed(1)},${y.toFixed(1)}`;
    cum[k] = total;
  });
  return { d, xy, cum, total };
}

function columbusPosition(v, t) {
  const f = Math.max(0, Math.min(1, (t - v.y0) / (v.y1 - v.y0)));
  return { xy: pointAt(v.projected, f), f };
}

function renderStatic() {
  const t = state.t;
  if (state.layers.shade) {
    countryPaths
      .classed("americas", false)
      .attr("fill", (d) => {
        const c = baseline.get(d.id);
        if (!c) return "#141f33";
        const b = popAt(c, START);
        const ratio = b > 0 ? popAt(c, t) / b : 1;
        return shade(Math.log(Math.max(ratio, 1e-6)));
      });
  } else {
    countryPaths.attr("fill", null).classed("americas", (d) => baseline.has(d.id));
  }
  bubbles.style("display", state.layers.bubbles ? null : "none").attr("r", (c) => rScale(popAt(c, t)));
  gColumbus.style("display", state.layers.columbus ? null : "none");
  columbusGroups.each(function (v) {
    const g = d3.select(this);
    if (t < v.y0 - 0.02 || !state.layers.columbus) {
      g.style("opacity", 0);
      return;
    }
    const t1 = v.y1 + 0.4;
    const len = v.projected.total * Math.max(0, Math.min(1, (t - v.y0) / (v.y1 - v.y0)));
    const total = v.projected.total;
    const fade = t > t1 ? Math.max(0.15, 1 - (t - t1) / 6) : 1;
    g.style("opacity", fade);
    g.select(".c-route").attr("stroke-dasharray", `${len} ${total}`);
    const pos = columbusPosition(v, t);
    const active = t <= t1;
    g.select(".c-ship").attr("cx", pos.xy[0]).attr("cy", pos.xy[1]).style("display", active ? null : "none");
    g.select(".c-label")
      .attr("x", pos.xy[0] + 9)
      .attr("y", pos.xy[1] - 9)
      .style("display", active ? null : "none")
      .text(() => (v.who && v.who !== v.name ? `${v.who} · ${v.name}` : v.name));
  });

  updatePanel();
  updateCursor();
}

let activeShips = [];

function drawShips(dtYears) {
  const t = state.t;
  sctx.clearRect(0, 0, W, H);
  tctx.save();
  tctx.globalCompositeOperation = "destination-out";
  tctx.fillStyle = "rgba(0,0,0,0.035)";
  tctx.fillRect(0, 0, W, H);
  tctx.restore();
  activeShips = [];
  if (!state.layers.trans && !state.layers.intra && !state.layers.migration) return;
  const effSpeed = effectiveSpeed();
  const durTrans = Math.max(0.12, effSpeed * 1.3);
  const durIntra = Math.max(0.06, effSpeed * 0.6);
  const yFrom = Math.floor(t) - 1;
  const yTo = Math.floor(t + durTrans) + 1;
  let i = undefined;
  for (let y = yFrom; y <= yTo && i === undefined; y++) i = yearStartIdx.get(y);
  if (i === undefined) return;
  tctx.lineCap = "round";
  for (; i < N && voy.year[i] <= yTo; i++) {
    const kind = voy.kind[i];
    if (kind === 0 && !state.layers.trans) continue;
    if (kind === 1 && !state.layers.intra) continue;
    if (kind === 2 && !state.layers.migration) continue;
    const arrive = voy.year[i] + phase[i];
    const dur = kind === 0 || kind === 2 ? durTrans : durIntra;
    const depart = arrive - dur;
    if (t < depart || t > arrive) continue;
    const f = (t - depart) / dur;
    const p = voyagePath(i);
    const [x, y] = pointAt(p, f);
    const prevF = Math.max(0, f - dtYears / dur);
    const [px, py] = pointAt(p, prevF);
    const color =
      kind === 2 ? (voy.doc[i] ? TYPE_COLORS.migrationDoc : TYPE_COLORS.migration) : TYPE_COLORS.slave;
    const people = voy.emb[i] || voy.dis[i] || 150;
    const r = kind === 1 ? 1 + Math.sqrt(people) / 10 : kind === 2 ? 0.9 + Math.sqrt(people) / 14 : 1.2 + Math.sqrt(people) / 9;
    tctx.strokeStyle = color;
    tctx.globalAlpha = kind === 2 ? 0.3 : kind === 0 ? 0.55 : 0.4;
    tctx.lineWidth = Math.max(0.8, r * 0.8);
    tctx.beginPath();
    tctx.moveTo(px, py);
    tctx.lineTo(x, y);
    tctx.stroke();
    sctx.fillStyle = color;
    sctx.globalAlpha = kind === 2 ? 0.75 : 0.95;
    sctx.beginPath();
    sctx.arc(x, y, r, 0, Math.PI * 2);
    sctx.fill();
    activeShips.push({ i, x, y, r });
  }
  tctx.globalAlpha = 1;
  sctx.globalAlpha = 1;
}

function effectiveSpeed() {
  return state.t < 1505 ? Math.min(state.speed, 0.6) : state.speed;
}

function showTip(ev, html) {
  const rect = wrap.getBoundingClientRect();
  tooltip.html(html).style("opacity", 1);
  const size = tooltip.node().getBoundingClientRect();
  const x = Math.max(8, Math.min(rect.width - size.width - 8, ev.clientX - rect.left + 14));
  let y = ev.clientY - rect.top + 14;
  if (y + size.height > rect.height - 8) y = ev.clientY - rect.top - size.height - 14;
  y = Math.max(8, Math.min(rect.height - size.height - 8, y));
  tooltip.style("left", x + "px").style("top", y + "px");
}
function hideTip() {
  tooltip.style("opacity", 0);
}

wrap.addEventListener("mousemove", (ev) => {
  if (ev.target.classList && ev.target.classList.contains("bubble")) return;
  const rect = wrap.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  let best = null;
  let bd = 64;
  for (const s of activeShips) {
    const dd = (s.x - mx) ** 2 + (s.y - my) ** 2;
    if (dd < bd) {
      bd = dd;
      best = s;
    }
  }
  if (!best) return hideTip();
  const i = best.i;
  const from = voy.places[voy.from[i]][1];
  const to = voy.places[voy.to[i]][1];
  const dep = voy.dep[i] >= 0 ? voy.places[voy.dep[i]][1] : null;
  const ship = voy.ship[i] || "Unnamed vessel";
  const people = [];
  if (voy.emb[i]) people.push(`${fmt(voy.emb[i])} embarked`);
  if (voy.dis[i]) people.push(`${fmt(voy.dis[i])} landed`);
  const kind = voy.kind[i];
  const model = kind === 2 ? voy.migrationModels?.[voy.org[i]] : null;
  const modelNote = model ? `<br><span class="muted">${model.allocation}${model.note ? `<br>${model.note}` : ""}</span>` : "";
  const html =
    kind === 2
      ? `<b>${voy.org[i]}</b> <span class="muted">(${voy.year[i]})</span><br>Free migration${voy.doc[i] ? "" : " (representative)"}<br>~${fmt(voy.emb[i])} people per ship${modelNote}`
      : `<b>${ship}</b> <span class="muted">(${voy.year[i]})</span><br>${voy.nations[voy.nat[i]] || "Flag unknown"}${dep ? ` · sailed from ${dep}` : ""}<br>${from} → ${to}<br>${people.join(", ") || "number of captives unknown"}<br><span class="muted">${kind === 0 ? "Trans-Atlantic" : "Intra-American"} slave voyage #${voy.id[i]}</span>`;
  showTip(ev, html);
});
wrap.addEventListener("mouseleave", hideTip);

const yearEl = document.getElementById("year");
const yearNote = document.getElementById("year-note");
const eventEl = document.getElementById("event");
const topList = d3.select("#top-list");

const voyagesPerYear = d3.rollup(
  d3.range(N),
  (ix) => ({
    trans: ix.filter((i) => voy.kind[i] === 0).length,
    intra: ix.filter((i) => voy.kind[i] === 1).length,
    mig: ix.filter((i) => voy.kind[i] === 2).length,
    migPeople: d3.sum(ix.filter((i) => voy.kind[i] === 2), (i) => voy.emb[i]),
  }),
  (i) => voy.year[i]
);

function updatePanel() {
  const t = state.t;
  const y = Math.floor(t);
  yearEl.textContent = y;
  yearNote.textContent = state.t < 1505 && state.playing ? "slow motion" : "";
  const total = totalAt(t);
  const base = totalAt(START);
  document.getElementById("stat-pop").textContent = fmtShort(total);
  document.getElementById("stat-pop-delta").innerHTML = `<span class="${total < base ? "neg" : "pos"}">${fmtPct(total / base - 1)}</span> vs 1492 (${fmtShort(base)})`;
  const vy = voyagesPerYear.get(y) || { trans: 0, intra: 0, mig: 0, migPeople: 0 };
  document.getElementById("stat-voyages").textContent = fmt(vy.trans + vy.intra);
  document.getElementById("stat-voyages-sub").textContent =
    `${fmt(vy.trans)} trans-Atlantic · ${fmt(vy.intra)} intra-American` + (vy.mig ? ` · ~${fmtShort(vy.migPeople)} free migrants` : "");
  const e = cumEmb.get(Math.min(2025, y)) || 0;
  const dis = cumDis.get(Math.min(2025, y)) || 0;
  const thisYear = estByYear.get(y);
  document.getElementById("stat-embarked").textContent = fmt(e);
  document.getElementById("stat-embarked-sub").innerHTML =
    (thisYear ? `${fmt(thisYear.embarked)} this year · ` : "") + `${fmt(e - dis)} died at sea`;

  const top = pop.countries
    .map((c) => ({ c, v: popAt(c, t) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  const max = top[0].v;
  topList
    .selectAll("li")
    .data(top, (d) => d.c.iso)
    .join("li")
    .html(
      (d) =>
        `<span class="name">${d.c.name}</span><span class="val">${fmtShort(d.v)}</span><span class="bar" style="width:${(d.v / max) * 100}%;background:${REGION_COLORS[d.c.region]}"></span>`
    );

  let ev = null;
  for (const e2 of EVENTS) if (e2[0] <= t && t - e2[0] < 14) ev = e2;
  if (ev) {
    eventEl.innerHTML = `<span class="ev-year">${Math.floor(ev[0])}</span>${ev[1]}`;
    eventEl.style.opacity = 1;
  } else eventEl.style.opacity = 0;
}

{
  const legend = d3.select("#map-legend");
  legend.append("div").attr("class", "lg-title").text("Ships");
  legend
    .append("div")
    .attr("class", "nation-legend")
    .selectAll("span")
    .data([
      ["Slave ship (documented)", TYPE_COLORS.slave],
      ["Migration (representative)", TYPE_COLORS.migration],
      ["Exploration", TYPE_COLORS.exploration],
    ])
    .join("span")
    .html(([name, c]) => `<i style="background:${c}"></i>${name}`);
  const stops = [1 / 20, 1 / 5, 1 / 2, 1, 2, 5, 20];
  legend.append("div").attr("class", "lg-title lg-second").text("Population vs 1492");
  const row = legend.append("div").attr("class", "lg-row");
  row
    .selectAll("span")
    .data(stops)
    .join("span")
    .style("background", (s) => shade(Math.log(s)))
    .attr("title", (s) => `${s}×`);
  const lab = legend.append("div").attr("class", "lg-labels");
  lab.selectAll("span").data(["÷20", "", "", "same", "", "", "×20"]).join("span").text((d) => d);
  legend.append("div").attr("class", "lg-title lg-second").html('<i class="dot"></i> circle area = population');
}

const chartMargin = { top: 34, right: 16, bottom: 22, left: 56 };
const popSvg = d3.select("#pop-chart");
const tradeSvg = d3.select("#trade-chart");
let popX;
let tradeX;

function drawCharts() {
  const pw = popSvg.node().getBoundingClientRect().width || 600;
  const ph = 190;
  popSvg.attr("height", ph).selectAll("*").remove();
  popX = d3.scaleLinear([1492, END], [chartMargin.left, pw - chartMargin.right]);
  const years = d3.range(nYears).map((i) => POP_START + i);
  let y;
  if (state.scale === "log") {
    y = d3.scaleLog([1e5, 1.5e9], [ph - chartMargin.bottom, chartMargin.top]).clamp(true);
  } else {
    y = d3.scaleLinear([0, d3.max(totalSeries)], [ph - chartMargin.bottom, chartMargin.top]);
  }
  popSvg.append("g").attr("class", "axis").attr("transform", `translate(0,${ph - chartMargin.bottom})`).call(d3.axisBottom(popX).ticks(8).tickFormat(d3.format("d")));
  popSvg.append("g").attr("class", "axis").attr("transform", `translate(${chartMargin.left},0)`).call(
    state.scale === "log" ? d3.axisLeft(y).ticks(4, ".0s") : d3.axisLeft(y).ticks(5, ".2s")
  );
  const line = d3
    .line()
    .x((d, i) => popX(years[i]))
    .y((d) => y(Math.max(state.scale === "log" ? 1e5 : 0, d)));
  const series = [...REGIONS.map((r, k) => ({ name: r, values: regionTotals[k], color: REGION_COLORS[r] })), { name: "Americas total", values: totalSeries, color: "#fff" }];
  popSvg
    .append("g")
    .selectAll("path")
    .data(series)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", (s) => s.color)
    .attr("stroke-width", (s) => (s.name === "Americas total" ? 1.8 : 1.2))
    .attr("d", (s) => line(s.values));
  const legend = popSvg.append("g").attr("class", "chart-legend").attr("transform", `translate(${chartMargin.left + 8},10)`);
  series.forEach((s, k) => {
    const g = legend.append("g").attr("transform", `translate(${k * 118},0)`);
    g.append("line").attr("x1", 0).attr("x2", 14).attr("y1", 3).attr("y2", 3).attr("stroke", s.color).attr("stroke-width", 2);
    g.append("text").attr("x", 18).attr("y", 6).text(s.name);
  });
  popSvg.append("line").attr("class", "cursor").attr("y1", chartMargin.top).attr("y2", ph - chartMargin.bottom);
  popSvg.append("text").attr("class", "cursor-label").attr("y", chartMargin.top - 6);
  attachScrub(popSvg, () => popX);

  const tw = tradeSvg.node().getBoundingClientRect().width || 600;
  tradeSvg.attr("height", ph).selectAll("*").remove();
  tradeX = d3.scaleLinear([1492, 1870], [chartMargin.left, tw - chartMargin.right]);
  const nationKeys = [...new Set(est.years.flatMap((yr) => Object.keys(yr.byNation)))].sort((a, b) => +a - +b);
  const stack = d3
    .stack()
    .keys(nationKeys)
    .value((yr, k) => yr.byNation[k] || 0);
  const layers = stack(est.years);
  const ty = d3.scaleLinear([0, d3.max(layers.at(-1), (d) => d[1]) || 1], [ph - chartMargin.bottom, chartMargin.top]);
  tradeSvg.append("g").attr("class", "axis").attr("transform", `translate(0,${ph - chartMargin.bottom})`).call(d3.axisBottom(tradeX).ticks(8).tickFormat(d3.format("d")));
  tradeSvg.append("g").attr("class", "axis").attr("transform", `translate(${chartMargin.left},0)`).call(d3.axisLeft(ty).ticks(5, ".2s"));
  const area = d3
    .area()
    .x((d) => tradeX(d.data.year))
    .y0((d) => ty(d[0]))
    .y1((d) => ty(d[1]));
  tradeSvg
    .append("g")
    .selectAll("path")
    .data(layers)
    .join("path")
    .attr("fill", (l) => NATION_COLORS[ESTIMATE_NATION_TO_CODE[l.key] ?? 30])
    .attr("fill-opacity", 0.85)
    .attr("d", area);
  const tlegend = tradeSvg.append("g").attr("class", "chart-legend").attr("transform", `translate(${chartMargin.left + 8},10)`);
  nationKeys.forEach((k, j) => {
    const g = tlegend.append("g").attr("transform", `translate(${j * 108},0)`);
    g.append("rect").attr("width", 10).attr("height", 3).attr("y", 1).attr("fill", NATION_COLORS[ESTIMATE_NATION_TO_CODE[k] ?? 30]);
    g.append("text").attr("x", 14).attr("y", 6).text(voy.nations[ESTIMATE_NATION_TO_CODE[k] ?? 30]);
  });
  const totEmb = d3.sum(est.years, (yr) => yr.embarked);
  const totDis = d3.sum(est.years, (yr) => yr.disembarked);
  tradeSvg
    .append("text")
    .attr("class", "chart-note")
    .attr("x", tw - chartMargin.right)
    .attr("y", 12)
    .attr("text-anchor", "end")
    .text(`${fmt(totEmb)} embarked · ${fmt(totDis)} survived the crossing`);
  tradeSvg.append("line").attr("class", "cursor").attr("y1", chartMargin.top).attr("y2", ph - chartMargin.bottom);
  tradeSvg.append("text").attr("class", "cursor-label").attr("y", chartMargin.top - 6);
  attachScrub(tradeSvg, () => tradeX);
  updateCursor();
}

function updateCursor() {
  if (!popX || !tradeX) return;
  const t = state.t;
  const y = Math.floor(t);
  popSvg.select(".cursor").attr("x1", popX(t)).attr("x2", popX(t));
  popSvg
    .select(".cursor-label")
    .attr("x", popX(t) + (popX(t) > popX.range()[1] - 150 ? -6 : 6))
    .attr("text-anchor", popX(t) > popX.range()[1] - 150 ? "end" : "start")
    .text(`${y}: ${fmtShort(totalAt(t))}`);
  tradeSvg.select(".cursor").attr("x1", tradeX(t)).attr("x2", tradeX(t));
  const r = estByYear.get(y);
  tradeSvg
    .select(".cursor-label")
    .attr("x", tradeX(t) + (tradeX(t) > tradeX.range()[1] - 150 ? -6 : 6))
    .attr("text-anchor", tradeX(t) > tradeX.range()[1] - 150 ? "end" : "start")
    .text(r ? `${y}: ${fmt(r.embarked)}` : `${y}`);
}

function attachScrub(svg, getX) {
  const handler = (ev) => {
    const [mx] = d3.pointer(ev, svg.node());
    setTime(getX().invert(mx), true);
  };
  svg.on("pointerdown", (ev) => {
    handler(ev);
    svg.on("pointermove", handler);
    window.addEventListener("pointerup", () => svg.on("pointermove", null), { once: true });
  });
}

const slider = document.getElementById("slider");
const playBtn = document.getElementById("play");

function setTime(t, scrub = false) {
  state.t = Math.max(START, Math.min(END, t));
  slider.value = state.t;
  if (scrub) {
    tctx.clearRect(0, 0, W, H);
    drawShips(0);
  }
  renderStatic();
}

slider.addEventListener("input", () => setTime(+slider.value, true));
playBtn.addEventListener("click", () => {
  if (!state.playing && state.t >= END) setTime(START, true);
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? "❚❚" : "▶";
  playBtn.classList.toggle("on", state.playing);
});
document.getElementById("speed").addEventListener("change", (e) => (state.speed = +e.target.value));
document.querySelectorAll("#scale-toggle button").forEach((b) =>
  b.addEventListener("click", () => {
    state.scale = b.dataset.scale;
    document.querySelectorAll("#scale-toggle button").forEach((x) => x.classList.toggle("on", x === b));
    drawCharts();
  })
);
for (const [id, key] of [
  ["t-bubbles", "bubbles"],
  ["t-shade", "shade"],
  ["t-trans", "trans"],
  ["t-intra", "intra"],
  ["t-migration", "migration"],
  ["t-columbus", "columbus"],
]) {
  document.getElementById(id).addEventListener("change", (e) => {
    state.layers[key] = e.target.checked;
    if (key === "trans" || key === "intra" || key === "migration") tctx.clearRect(0, 0, W, H);
    renderStatic();
    drawShips(0);
  });
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "SELECT" && e.target.tagName !== "INPUT") {
    e.preventDefault();
    playBtn.click();
  }
});

{
  const ticks = d3.select("#ticks");
  for (const y of [1500, 1600, 1700, 1800, 1900, 2000]) {
    ticks
      .append("span")
      .style("left", `${((y - START) / (END - START)) * 100}%`)
      .text(y);
  }
}

let last = performance.now();
let staticAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let dtYears = 0;
  if (state.playing) {
    dtYears = dt * effectiveSpeed();
    state.t = Math.min(END, state.t + dtYears);
    slider.value = state.t;
    staticAcc += dt;
    if (staticAcc > 1 / 30) {
      staticAcc = 0;
      renderStatic();
    }
    if (state.t >= END) {
      state.playing = false;
      playBtn.textContent = "▶";
      playBtn.classList.remove("on");
      renderStatic();
    }
  }
  drawShips(dtYears);
  requestAnimationFrame(frame);
}

new ResizeObserver(() => {
  resize();
  drawCharts();
}).observe(wrap);
resize();
drawCharts();
requestAnimationFrame(frame);
