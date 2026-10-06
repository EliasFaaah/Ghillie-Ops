import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP, HEIGHT, HORIZON, RIVER, ROAD_LINKS, BRIDGE, BASES, PADS, QUARRY, HILL, BUNKERS, CATALOG, trenchLine } from '../src/world/layout.js';

const OUT = resolve(import.meta.dirname, '..', 'assets', 'world');
const N = MAP.samples;
const CELLS = N - 1;
const H = MAP.half;

const hyp = (a, b) => Math.sqrt(a * a + b * b);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash2 = (x, z, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz, s), hash2(ix + 1, iz, s), u), lerp(hash2(ix, iz + 1, s), hash2(ix + 1, iz + 1, s), u), v) * 2 - 1;
}

function fbm(x, z, octaves, s) {
  let a = 1, f = 1, t = 0, n = 0;
  for (let i = 0; i < octaves; i++) { t += vnoise(x * f, z * f, s + i * 17) * a; n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}

function baseHeight(x, z) {
  const wx = x + 300 * vnoise(x * 0.0006, z * 0.0006, 1) + 80 * vnoise(x * 0.0021, z * 0.0021, 3);
  const wz = z + 300 * vnoise(x * 0.0006, z * 0.0006, 2) + 80 * vnoise(x * 0.0021, z * 0.0021, 4);
  const r = hyp(x, z);
  const massif = fbm(wx * 0.0008, wz * 0.0008, 3, 11);
  const f = fbm(wx * 0.0013, wz * 0.0013, 2, 21);
  const crest = clamp(1 - Math.sqrt(f * f + 0.012) * 2.1, 0, 1);
  const roll = fbm(wx * 0.003, wz * 0.003, 3, 12);
  const knoll = fbm(wx * 0.007, wz * 0.007, 3, 13);
  let h = 108 + 60 * massif + 70 * crest * crest + 64 * roll + 4 * knoll + 1.2 * fbm(wx * 0.03, wz * 0.03, 2, 14);
  h += smooth(1000, 2800, r) * (70 + 110 * (0.5 + 0.5 * fbm(x * 0.0009, z * 0.0009, 3, 14)));
  const rr = 1 - Math.abs(vnoise(x * 0.00042, z * 0.00042, 21));
  h += smooth(2400, 7000, r) * 300 * rr * rr;
  return h < 40 ? 40 - 14 * (1 - Math.exp(-(40 - h) / 14)) : h;
}

function densify(points, step) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.ceil(hyp(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push(a.map((v, c) => lerp(v, b[c], k / n)));
  }
  out.push(points[points.length - 1]);
  return out;
}

function stamp(samples, radius, sizeN, toCell, cell) {
  const dist = new Float32Array(sizeN * sizeN).fill(1e9);
  const attr = new Float32Array(sizeN * sizeN * 2);
  const rc = Math.ceil(radius / cell);
  for (const s of samples) {
    const [ci, cj] = toCell(s[0], s[1]);
    for (let j = Math.max(0, cj - rc); j <= Math.min(sizeN - 1, cj + rc); j++) {
      for (let i = Math.max(0, ci - rc); i <= Math.min(sizeN - 1, ci + rc); i++) {
        const [x, z] = [-H + i * cell, -H + j * cell];
        const d = hyp(x - s[0], z - s[1]);
        const k = j * sizeN + i;
        if (d < dist[k]) { dist[k] = d; attr[k * 2] = s[2] ?? 0; attr[k * 2 + 1] = s[3] ?? 0; }
      }
    }
  }
  return { dist, attr };
}

const toCell = (x, z) => [Math.round((x + H) / MAP.cell), Math.round((z + H) / MAP.cell)];
const riverSamples = densify(RIVER.map(([x, z, w, l]) => [x, z, l, w]), 1.5);
const river = stamp(riverSamples, 230, N, toCell, MAP.cell);
const trench = stamp(densify(trenchLine(), 1.5), 8, N, toCell, MAP.cell);

function riverLevelAt(x, z) {
  let best = 1e9, level = 0;
  for (const s of riverSamples) { const d = hyp(x - s[0], z - s[1]); if (d < best) { best = d; level = s[2]; } }
  return level;
}

const BRIDGE_LEVEL = riverLevelAt(BRIDGE.x, BRIDGE.z);

function preHeight(x, z, k) {
  let h = baseHeight(x, z);
  h += HILL.lift * Math.exp(-(((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / HILL.sigma ** 2));
  const d = river.dist[k], level = river.attr[k * 2], hw = river.attr[k * 2 + 1] / 2;
  if (d < 230) {
    const v = 1 - smooth(34, 150, d);
    h = lerp(h, level + 1.8 + 0.2 * Math.max(d - 14, 0), v);
    const channel = 1 - smooth(hw * 0.7, hw + 7, d);
    const bed = level - 0.35 - 1.6 * (1 - Math.min(1, (d / hw) ** 2));
    h = lerp(h, bed, channel);
  }
  return h;
}

const gridIndex = (x, z) => toCell(x, z)[1] * N + toCell(x, z)[0];
const flatAt = (x, z, r) => {
  let s = preHeight(x, z, gridIndex(x, z));
  for (let a = 0; a < 12; a++) { const px = x + Math.cos(a * 0.5236) * r * 0.7, pz = z + Math.sin(a * 0.5236) * r * 0.7; s += preHeight(px, pz, gridIndex(px, pz)); }
  return s / 13;
};
const padTargets = PADS.map(p => p.bridge ? BRIDGE_LEVEL + BRIDGE.deck : flatAt(p.x, p.z, p.r0));
const hillTop = preHeight(HILL.x, HILL.z, gridIndex(HILL.x, HILL.z));
const quarryFloor = flatAt(QUARRY.x, QUARRY.z, QUARRY.rIn) - QUARRY.depth;

function terrainHeight(x, z, k) {
  let h = preHeight(x, z, k);
  const channel = 1 - smooth(river.attr[k * 2 + 1] / 2 + 1, river.attr[k * 2 + 1] / 2 + 7, river.dist[k]);
  PADS.forEach((p, n) => { h = lerp(h, padTargets[n], (1 - smooth(p.r0, p.r1, hyp(x - p.x, z - p.z))) * (1 - channel)); });
  h = lerp(h, hillTop, 1 - smooth(HILL.padR0, HILL.padR1, hyp(x - HILL.x, z - HILL.z)));
  const ang = Math.atan2(z - QUARRY.z, x - QUARRY.x);
  const dq = hyp(x - QUARRY.x, z - QUARRY.z) * (1 + 0.38 * fbm(x * 0.016, z * 0.016, 3, 91) + 0.16 * Math.sin(ang * 3 + 1.3) + 0.08 * Math.sin(ang * 7));
  if (dq < QUARRY.rOut) {
    const u = smooth(QUARRY.rIn, QUARRY.rOut, dq);
    const raw = u * (h - quarryFloor), t = raw / QUARRY.step;
    const stepped = raw > 0 ? QUARRY.step * (Math.floor(t) + smooth(0.22, 0.62, t - Math.floor(t))) : raw;
    h = quarryFloor + lerp(stepped, raw, smooth(0.8, 1, u));
  }
  h -= 1.5 * (1 - smooth(0.9, 2.8, trench.dist[k]));
  return h;
}

const heights = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = clamp(terrainHeight(-H + i * MAP.cell, -H + j * MAP.cell, j * N + i), HEIGHT.min + 1, HEIGHT.min + HEIGHT.range - 1);

function heightLerp(x, z) {
  const fx = clamp((x + H) / MAP.cell, 0, CELLS - 1.001), fz = clamp((z + H) / MAP.cell, 0, CELLS - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  return lerp(lerp(heights[j * N + i], heights[j * N + i + 1], fx - i), lerp(heights[(j + 1) * N + i], heights[(j + 1) * N + i + 1], fx - i), fz - j);
}

function routeRoad(a, b) {
  const CS = 8, M = Math.round(MAP.size / CS);
  const cellOf = v => clamp(Math.floor((v + H) / CS), 0, M - 1);
  const open = new Uint8Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = -H + (i + 0.5) * CS, z = -H + (j + 0.5) * CS;
    const k = gridIndex(x, z);
    open[j * M + i] = river.dist[k] < river.attr[k * 2 + 1] / 2 + 9 && !(Math.abs(x - BRIDGE.x) < 14 && Math.abs(z - BRIDGE.z) < 60) ? 0 : 1;
  }
  const start = cellOf(a[1]) * M + cellOf(a[0]), goal = cellOf(b[1]) * M + cellOf(b[0]);
  const g = new Float32Array(M * M).fill(1e9), from = new Int32Array(M * M).fill(-1);
  const heap = [[0, start]];
  g[start] = 0;
  while (heap.length) {
    let bi = 0;
    for (let q = 1; q < heap.length; q++) if (heap[q][0] < heap[bi][0]) bi = q;
    const cur = heap.splice(bi, 1)[0][1];
    if (cur === goal) break;
    const cx = cur % M, cz = (cur / M) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= M || nz >= M || !open[nz * M + nx]) continue;
      const run = hyp(dx, dz) * CS;
      const grade = (heightLerp(-H + (nx + 0.5) * CS, -H + (nz + 0.5) * CS) - heightLerp(-H + (cx + 0.5) * CS, -H + (cz + 0.5) * CS)) / run;
      const c = g[cur] + run * (1 + 60 * grade * grade);
      if (c < g[nz * M + nx]) { g[nz * M + nx] = c; from[nz * M + nx] = cur; heap.push([c + hyp(nx - cellOf(b[0]), nz - cellOf(b[1])) * CS, nz * M + nx]); }
    }
  }
  let pts = [];
  for (let c = goal; c >= 0; c = from[c]) pts.push([-H + ((c % M) + 0.5) * CS, -H + (((c / M) | 0) + 0.5) * CS]);
  pts.reverse();
  pts[0] = [a[0], a[1]];
  pts[pts.length - 1] = [b[0], b[1]];
  for (let it = 0; it < 3; it++) {
    const next = [pts[0]];
    for (let q = 0; q + 1 < pts.length; q++) next.push([pts[q][0] * 0.75 + pts[q + 1][0] * 0.25, pts[q][1] * 0.75 + pts[q + 1][1] * 0.25], [pts[q][0] * 0.25 + pts[q + 1][0] * 0.75, pts[q][1] * 0.25 + pts[q + 1][1] * 0.75]);
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return densify(pts, 2);
}

const roadSamples = ROAD_LINKS.flatMap(link => {
  const path = link.reduce((acc, p, q) => q ? acc.concat(routeRoad(link[q - 1], p).slice(1)) : [link[0]], []);
  const hs = path.map(q => heightLerp(q[0], q[1]));
  return path.map((q, i) => {
    let s = 0, n = 0;
    for (let d = -14; d <= 14; d++) { const m = i + d; if (m >= 0 && m < path.length) { s += hs[m]; n++; } }
    return [q[0], q[1], s / n, 0];
  });
});
const roadStamp = stamp(roadSamples, 12, N, toCell, MAP.cell);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const k = j * N + i, d = roadStamp.dist[k];
  if (d < 11 && river.dist[k] > river.attr[k * 2 + 1] / 2 + 3 && !(Math.abs(-H + i * MAP.cell - BRIDGE.x) < 12 && Math.abs(-H + j * MAP.cell - BRIDGE.z) < 30)) heights[k] = lerp(heights[k], roadStamp.attr[k * 2], 1 - smooth(3.2, 10.5, d));
}

function ground(x, z) {
  const fx = (x + H) / MAP.cell, fz = (z + H) / MAP.cell;
  const i = clamp(Math.floor(fx), 0, CELLS - 1), j = clamp(Math.floor(fz), 0, CELLS - 1);
  const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const a = heights[j * N + i], b = heights[j * N + i + 1], c = heights[(j + 1) * N + i], d = heights[(j + 1) * N + i + 1];
  return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
}

const slopes = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, CELLS), j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, CELLS);
  slopes[j * N + i] = hyp((heights[j * N + i1] - heights[j * N + i0]) / ((i1 - i0) * MAP.cell), (heights[j1 * N + i] - heights[j0 * N + i]) / ((j1 - j0) * MAP.cell));
}
const slopeAt = (x, z) => slopes[clamp(Math.round((z + H) / MAP.cell), 0, CELLS) * N + clamp(Math.round((x + H) / MAP.cell), 0, CELLS)];
const hollowAt = (x, z) => (ground(x + 18, z) + ground(x - 18, z) + ground(x, z + 18) + ground(x, z - 18)) / 4 - ground(x, z);

const CLEARINGS = [[BASES.red.x, BASES.red.z, 110], [BASES.blue.x, BASES.blue.z, 110], [BASES.A.x, BASES.A.z, 110], [BASES.C.x, BASES.C.z, 150], [QUARRY.x, QUARRY.z, 140], [HILL.x, HILL.z, 70]];

function forestAt(x, z, k) {
  let f = smooth(0.0, 0.3, fbm(x * 0.0028 + 7, z * 0.0028 - 3, 4, 41) + clamp(hollowAt(x, z) * 0.012, -0.12, 0.2));
  f *= smooth(18, 34, river.dist[k]) * smooth(7, 16, roadStamp.dist[k]) * smooth(5, 10, trench.dist[k]) * (1 - smooth(0.5, 0.7, slopeAt(x, z)));
  for (const [cx, cz, r] of CLEARINGS) f *= smooth(r * 0.75, r, hyp(x - cx, z - cz));
  return f;
}

const MASK = N - 1;
const mask = new Uint8Array(MASK * MASK * 4);
const grass = new Uint8Array(MASK * MASK);
const forestField = new Float32Array(MASK * MASK);
for (let j = 0; j < MASK; j++) {
  for (let i = 0; i < MASK; i++) {
    const x = -H + i * 2 + 1, z = -H + j * 2 + 1;
    const k = Math.min(j * N + i, N * N - 1);
    const n = vnoise(x * 0.09, z * 0.09, 5);
    let road = 1 - smooth(2.4, 4.4, roadStamp.dist[k] + 1.1 * n);
    road = Math.max(road, 1 - smooth(1.1, 3.0, trench.dist[k]));
    for (const p of [BASES.red, BASES.blue]) road = Math.max(road, 0.6 * (1 - smooth(34, 62, hyp(x - p.x, z - p.z) + 12 * n)));
    road = Math.max(road, 0.35 * (1 - smooth(18, 52, hyp(x - BASES.A.x, z - BASES.A.z) + 10 * n)));
    road = Math.max(road, 0.3 * (1 - smooth(22, 70, hyp(x - BASES.C.x, z - BASES.C.z) + 10 * n)));
    const dq = hyp(x - QUARRY.x, z - QUARRY.z) * (1 + 0.3 * fbm(x * 0.018, z * 0.018, 3, 91));
    const rockPatch = smooth(0.62, 0.8, fbm(x * 0.012, z * 0.012, 3, 51)) * smooth(0.3, 0.5, slopeAt(x, z));
    const rock = Math.max((1 - smooth(QUARRY.rIn + 8, QUARRY.rOut + 25, dq + 6 * n)) * smooth(0.18, 0.5, slopeAt(x, z)), rockPatch, smooth(0.85, 1.25, slopeAt(x, z)));
    road = Math.max(road, 0.9 * (1 - smooth(QUARRY.rIn - 6, QUARRY.rIn + 18, dq + 5 * n)));
    const hw = river.attr[k * 2 + 1] / 2;
    const bed = 1 - smooth(hw + 0.5, hw + 5.5, river.dist[k] + 1.2 * n);
    const f = forestAt(x, z, k);
    forestField[j * MASK + i] = f;
    const o = (j * MASK + i) * 4;
    mask[o] = Math.round(clamp(road, 0, 1) * 255);
    mask[o + 1] = Math.round(clamp(rock, 0, 1) * 255);
    mask[o + 2] = Math.round(clamp(bed, 0, 1) * 255);
    mask[o + 3] = Math.round(clamp(f, 0, 1) * 255);
    const meadow = 0.85 + 0.15 * smooth(-0.15, 0.3, fbm(x * 0.006 + 3, z * 0.006 + 9, 3, 61));
    const free = clamp(1 - road - rock - bed * 1.3 - f * 0.55, 0, 1) * (1 - smooth(0.85, 1.2, slopeAt(x, z)));
    grass[j * MASK + i] = Math.round(free * meadow * 255);
  }
}

const HS = HORIZON.samples;
const horizon = new Uint16Array(HS * HS);
for (let j = 0; j < HS; j++) {
  for (let i = 0; i < HS; i++) {
    const x = -HORIZON.half + i * HORIZON.cell, z = -HORIZON.half + j * HORIZON.cell;
    let h = baseHeight(x, z) + HILL.lift * Math.exp(-(((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / HILL.sigma ** 2));
    let d = 1e9, level = 0;
    for (let q = 0; q < riverSamples.length; q += 4) { const s = riverSamples[q], e = hyp(x - s[0], z - s[1]); if (e < d) { d = e; level = s[2]; } }
    if (d < 230) h = lerp(h, level + 1.8 + 0.2 * Math.max(d - 14, 0), 1 - smooth(34, 150, d));
    horizon[j * HS + i] = Math.round(clamp((h - HEIGHT.min) / HEIGHT.range, 0, 1) * 65535);
  }
}

const rng = mulberry(20260930);
const models = {};
const warned = new Set();
const elevated = {};
const FOOT = { tree: 0.5, rock: 0.38, prop: 0.4, struct: 0.4 };
function lowestUnder(name, x, z, scale) {
  const c = CATALOG[name];
  const f = FOOT[c.kind];
  let y = ground(x, z);
  if (!f || name === 'StoneBridge') return y;
  const r = c.kind === 'tree' ? Math.min(0.5 * scale, 1.2) : f * Math.min(Math.max(c.size[0], c.size[2]) * scale, 24) * 0.5;
  if (r < 0.15) return y;
  for (let a = 0; a < 8; a++) y = Math.min(y, ground(x + Math.cos(a * 0.7854) * r, z + Math.sin(a * 0.7854) * r));
  return y;
}
function put(name, x, z, yaw, scale = 1, dy = 0, sink = null) {
  const c = CATALOG[name];
  if (!c) { if (!warned.has(name)) { warned.add(name); console.warn(`bake: model ${name} is not in the catalog, skipped`); } return false; }
  const y = lowestUnder(name, x, z, scale) + dy - (sink ?? c.sink ?? 0) * c.size[1] * scale;
  const list = (models[name] ||= []);
  if (dy > 0.05) (elevated[name] ||= []).push(list.length / 5);
  list.push(+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), +yaw.toFixed(3), +scale.toFixed(3));
  return true;
}
const jitter = (step, margin, fn) => {
  for (let cz = -H + margin; cz < H - margin; cz += step) for (let cx = -H + margin; cx < H - margin; cx += step) fn(cx + rng() * step, cz + rng() * step);
};
const field = (x, z) => forestField[clamp(Math.floor((z + H) / 2), 0, MASK - 1) * MASK + clamp(Math.floor((x + H) / 2), 0, MASK - 1)];
const kAt = (x, z) => gridIndex(clamp(x, -H, H), clamp(z, -H, H));

const treeAt = (x, z, scale) => {
  const n = vnoise(x * 0.004, z * 0.004, 77) + (ground(x, z) - 85) / 110;
  const r = rng();
  const species = n > 0.3 ? (r < 0.8 ? 'SpruceTree' : r < 0.92 ? 'OakTree' : 'BirchTree') : n < -0.3 ? (r < 0.45 ? 'BirchTree' : r < 0.9 ? 'OakTree' : 'SpruceTree') : (r < 0.2 ? 'SpruceTree' : r < 0.65 ? 'OakTree' : 'BirchTree');
  put(species, x, z, rng() * 6.283, scale);
};
jitter(7.2, 14, (x, z) => {
  if (rng() > Math.pow(field(x, z), 0.55) * 1.15) return;
  treeAt(x, z, 0.82 + rng() * 0.5);
});
jitter(4.2, 14, (x, z) => {
  if (rng() > 0.55 * Math.pow(field(x, z), 1.1)) return;
  treeAt(x, z, 0.26 + rng() * 0.26);
});
jitter(26, 40, (x, z) => {
  const k = kAt(x, z);
  if (field(x, z) > 0.08 || rng() > 0.14 || slopeAt(x, z) > 0.45 || river.dist[k] < 30 || roadStamp.dist[k] < 12) return;
  for (let g = 0; g < 1 + Math.floor(rng() * 3); g++) treeAt(x + (rng() - 0.5) * 16, z + (rng() - 0.5) * 16, 0.8 + rng() * 0.45);
});
jitter(5, 14, (x, z) => {
  const f = field(x, z), k = kAt(x, z), d = river.dist[k];
  let p = 0.015 + 0.2 * f + (f > 0.04 && f < 0.5 ? 0.12 : 0) + (d > 16 && d < 42 ? 0.3 : 0);
  if (roadStamp.dist[k] < 7 || trench.dist[k] < 6 || slopeAt(x, z) > 0.7) p = 0;
  for (const [cx, cz, r] of CLEARINGS) if (hyp(x - cx, z - cz) < r * 0.6) p *= 0.15;
  if (rng() > p) return;
  rng();
  put('BushA', x, z, rng() * 6.283, 0.7 + rng() * 0.8);
});
jitter(4.4, 14, (x, z) => {
  const p = 0.6 * smooth(0.2, 0.7, field(x, z));
  if (rng() < p) put('Fern', x, z, rng() * 6.283, 0.8 + rng() * 0.7);
});
const ROCKS = ['RockA', 'RockMoss1', 'RockMoss2', 'RockMoss3', 'RockMoss4', 'RockMoss5'];
jitter(30, 30, (x, z) => {
  const k = kAt(x, z), s = slopeAt(x, z);
  const p = 0.05 + 0.5 * smooth(0.3, 0.55, s) + (river.dist[k] < 34 ? 0.22 : 0);
  if (rng() > p || roadStamp.dist[k] < 8) return;
  put(ROCKS[Math.floor(rng() * ROCKS.length)], x, z, rng() * 6.283, 0.8 + rng() * 1.5, 0, 0.18);
});
jitter(22, 30, (x, z) => {
  const s = slopeAt(x, z);
  if (s < 0.62 || rng() > 0.55) return;
  const e = 2, nx = ground(x - e, z) - ground(x + e, z), nz = ground(x, z - e) - ground(x, z + e);
  put(rng() < 0.5 ? 'RockFaceA' : 'RockFaceB', x, z, Math.atan2(nx, nz), 1 + rng() * 1.6, 0, 0.3);
});
jitter(22, 30, (x, z) => { if (field(x, z) > 0.4 && rng() < 0.35) put('FallenLog', x, z, rng() * 6.283, 0.8 + rng() * 0.6, 0, 0.1); });
jitter(18, 30, (x, z) => { if (field(x, z) > 0.3 && rng() < 0.3) put('Stump', x, z, rng() * 6.283, 0.8 + rng() * 0.5, 0, 0.05); });

const along = (pts, step, fn) => {
  const d = densify(pts, 0.5);
  let acc = step;
  for (let i = 1; i < d.length; i++) {
    acc += hyp(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
    if (acc >= step) { acc = 0; fn(d[i][0], d[i][1], Math.atan2(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1])); }
  }
};
const local = (cx, cz, yaw, ox, oz) => [cx + ox * Math.cos(yaw) + oz * Math.sin(yaw), cz - ox * Math.sin(yaw) + oz * Math.cos(yaw)];
const compose = (cx, cz, yaw, list) => { for (const [name, ox, oz, ry = 0, sc = 1, dy = 0] of list) { const [x, z] = local(cx, cz, yaw, ox, oz); put(name, x, z, yaw + ry, sc, dy); } };
const strip = (cx, cz, yaw, name, a, b, step, ry = 0, jit = 0) => {
  const n = Math.max(1, Math.round(hyp(b[0] - a[0], b[1] - a[1]) / step));
  for (let i = 0; i <= n; i++) {
    const [x, z] = local(cx, cz, yaw, lerp(a[0], b[0], i / n) + (rng() - 0.5) * jit, lerp(a[1], b[1], i / n) + (rng() - 0.5) * jit);
    put(name, x, z, yaw + ry + (rng() - 0.5) * jit * 0.2, 1);
  }
};
const stack = (cx, cz, yaw, ox, oz, ry, levels) => levels.forEach((n, i) => compose(cx, cz, yaw, [[n, ox, oz, ry + (i % 2) * 0.3, 1, levels.slice(0, i).reduce((sum, m) => sum + CATALOG[m].size[1], 0)]]));

put('StoneBridge', BRIDGE.x, BRIDGE.z, 0, 1, BRIDGE_LEVEL - ground(BRIDGE.x, BRIDGE.z));
models.StoneBridge && (models.StoneBridge[1] = +BRIDGE_LEVEL.toFixed(2));
for (const dz of [-30, 30]) {
  compose(BRIDGE.x, BRIDGE.z + dz, 0, [['SandbagNest', -5.5, 0, dz < 0 ? Math.PI : 0], ['SandbagNest', 5.5, 0, dz < 0 ? Math.PI : 0], ['ConcreteBarrier', -2.6, 3 * Math.sign(dz), 0.15], ['ConcreteBarrier', 2.6, 3 * Math.sign(dz), -0.15]]);
}

for (const [x, z, yaw] of BUNKERS) {
  put('Bunker', x, z, yaw, 1);
  compose(x, z, yaw, [['SandbagNest', -9, 5, Math.PI], ['SandbagNest', 9, 5, Math.PI], ['MilitaryCrate', 4, -6, 0.3], ['MilitaryCrate', 5.1, -6.5, 0.9], ['Barrel', -4.5, -6.4, 0]]);
}
BUNKERS.forEach(([x, z, yaw], i) => { if (i % 2 === 0) compose(x, z, yaw, [['CamoNet', 0, -9, 0.1]]); });
const tl = trenchLine();
for (let i = 0; i + 1 < tl.length; i++) {
  const a = tl[i], b = tl[i + 1];
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const [lx, lz] = local(mx, mz, yaw, 3.2, 0);
  put('SandbagWall', lx, lz, yaw + Math.PI / 2, 1);
  if (i % 2 === 0) { const [rx, rz] = local(mx, mz, yaw, -3.2, 0); put('SandbagWall', rx, rz, yaw + Math.PI / 2, 1); }
  if (i % 5 === 2) { const [nx, nz] = local(mx, mz, yaw, 3.2, 0); put('SandbagNest', nx + Math.cos(yaw) * 2.4, nz - Math.sin(yaw) * 2.4, yaw + Math.PI / 2 + Math.PI, 1); }
  if (i % 4 === 1) { const [cx, cz] = local(mx, mz, yaw, -2.4, 0); put('MilitaryCrate', cx, cz, yaw + 0.3, 1); }
}

const baseCompound = side => {
  const b = BASES[side];
  const f = Math.PI;
  const list = [['BaseHQ', 0, -8, 0], ['FlagPole', 0, 15, 0], ['WatchTower', -27, 23, 0.1], ['WatchTower', 27, 23, -0.1]];
  for (let k = 0; k < 3; k++) { list.push(['MilitaryTent', -22, -17 + k * 14, f]); list.push(['MilitaryTent', 22, -17 + k * 14, 0]); }
  list.push(['CamoNet', 20, -19, 0.1], ['MilTruck', 17, -19, 0.1], ['MilTruck', 23, -20, -0.1], ['CoveredCar', -9, -22, 1.2], ['ShippingContainer', 8, -25, 0], ['ShippingContainer', 8, -25, 0, 1, CATALOG.ShippingContainer.size[1]], ['ShippingContainer', -8, -25, 0.05]);
  list.push(['WoodPile', -27, 24, 0.3], ['Barrel', -13, 14, 0], ['OilBarrel', -14.5, 14.6, 0], ['OilBarrel', -13.8, 13.2, 0], ['Tyre', -15.2, 12.9, 0.2], ['SandbagWall', -10, 7, 0], ['SandbagWall', 10, 7, 0], ['SandbagWall', -4, 2.5, 1.2], ['SandbagWall', 4, 2.5, -1.2]);
  compose(b.x, b.z, b.yaw, list);
  stack(b.x, b.z, b.yaw, 12, -3, 0.4, ['MilitaryCrate', 'MilitaryCrate']);
  stack(b.x, b.z, b.yaw, 13.4, -2.4, 0.9, ['MilitaryCrate']);
  stack(b.x, b.z, b.yaw, -12, -5, 0.2, ['MilitaryCrate', 'MilitaryCrate']);
  strip(b.x, b.z, b.yaw, 'Hesco', [-31, 28], [-7.5, 28], 2.02, 0);
  strip(b.x, b.z, b.yaw, 'Hesco', [7.5, 28], [31, 28], 2.02, 0);
  strip(b.x, b.z, b.yaw, 'Hesco', [-31, -28], [-6, -28], 2.02, 0);
  strip(b.x, b.z, b.yaw, 'Hesco', [6, -28], [31, -28], 2.02, 0);
  strip(b.x, b.z, b.yaw, 'Hesco', [-32, -26], [-32, 26], 2.02, Math.PI / 2);
  strip(b.x, b.z, b.yaw, 'Hesco', [32, -26], [32, 26], 2.02, Math.PI / 2);
  compose(b.x, b.z, b.yaw, [['SandbagNest', -33, 29, f], ['SandbagNest', 33, 29, f], ['SandbagNest', -9, 31, f], ['SandbagNest', 9, 31, f], ['SandbagNest', -33, -29, 0], ['SandbagNest', 33, -29, 0], ['ConcreteBarrier', -5, 34, 0.2], ['ConcreteBarrier', -2, 36, 0], ['ConcreteBarrier', 2.5, 34, -0.2], ['ConcreteBarrier', 5.2, 36, 0.1]]);
  strip(b.x, b.z, b.yaw, 'ConcreteBarrier', [-4, 24], [-4, 18], 1.7, Math.PI / 2, 0.2);
  strip(b.x, b.z, b.yaw, 'ConcreteBarrier', [4, 24], [4, 18], 1.7, Math.PI / 2, 0.2);
};
baseCompound('red');
baseCompound('blue');

compose(BASES.A.x, BASES.A.z, 0.35, [
  ['Farmhouse', 0, 0, 0], ['Barn', 34, -8, 1.4], ['FarmShed', -26, 22, 0.2], ['Well', 14, 22, 0], ['HayBale', 22, 24, 0.5], ['HayBale', 25.2, 25, 1.2], ['HayBale', 23, 28, 2.4], ['HayBale', 24, 26, 0.3, 1, 1.38],
  ['MilitaryCrate', -8, 14, 0.3], ['Barrel', -6, 17, 0], ['FlagPole', 6, 14, 0], ['CoveredCar', -12, -16, 0.5], ['WoodPile', -20, 8, 1.5], ['WoodPile', 10, -14, 0.1],
  ['SandbagNest', 12, 10, Math.PI], ['SandbagNest', -14, 12, Math.PI], ['SandbagNest', 48, 6, Math.PI / 2], ['SandbagWall', 4, 12, 0.1], ['SandbagWall', -4, 10, 0.1], ['CamoNet', 36, 14, 0.3], ['MilTruck', 34, 14, 1.5]
]);
along([[-44, 38], [-44, -34], [-10, -44]], 4, (x, z, yaw) => put('WoodFence', BASES.A.x + x, BASES.A.z + z, yaw + Math.PI / 2, 1));
strip(BASES.A.x, BASES.A.z, 0.35, 'StoneWall', [-40, 34], [-12, 40], 4.1, 0.2);
strip(BASES.A.x, BASES.A.z, 0.35, 'StoneWall', [52, -20], [54, 24], 4.1, Math.PI / 2);
strip(BASES.A.x, BASES.A.z, 0.35, 'Hesco', [-18, 20], [-6, 24], 2.02, 0.3);

compose(BASES.B.x, BASES.B.z, 0, [
  ['RadioTower', 0, 0, 0], ['RadioHut', 15, 8, 0.4], ['Barrel', 20, 17, 0], ['OilBarrel', 21.5, 17.6, 0], ['MilitaryCrate', 10, -14, 0.3], ['FlagPole', -16, -4, 0], ['CamoNet', 20, -8, 0.4], ['MilTruck', 20, -8, 1.2],
  ['SandbagNest', 0, 18, Math.PI], ['SandbagNest', 14, 22, Math.PI], ['SandbagNest', -14, 20, Math.PI], ['SandbagNest', -20, -6, Math.PI * 1.5], ['SandbagNest', 4, -20, 0], ['SandbagNest', 26, -2, Math.PI / 2],
  ['ConcreteBarrier', -10, 14, 0.2], ['ConcreteBarrier', -4.2, 16, 0.1], ['ConcreteBarrier', 2, 17, 0.05], ['SandbagWall', 8, 14, 0.2], ['SandbagWall', -8, -12, 0.1], ['Hesco', -22, 6, 1.57], ['Hesco', -22, 8, 1.57], ['Hesco', -22, 10, 1.57]
]);

const VILLAGE_N = [['HouseA', -62, 0.05], ['HouseB', -36, -0.05], ['Chapel', 2, 0], ['HouseC', 36, 0.1], ['HouseA', 66, -0.05]];
const VILLAGE_S = [['HouseB', -54, 0.1], ['HouseA', -26, -0.05], ['HouseC', 8, 0.05], ['FarmShed', 40, 0.1], ['HouseB', 66, 0.2]];
const VC = BASES.C;
for (const [n, x, r] of VILLAGE_N) compose(VC.x, VC.z, 0, [[n, x, -24, r]]);
for (const [n, x, r] of VILLAGE_S) compose(VC.x, VC.z, 0, [[n, x, 22, Math.PI + r]]);
compose(VC.x, VC.z, 0, [
  ['Well', 14, 3, 0], ['FlagPole', 28, 4, 0], ['CoveredCar', -30, 7, 0.1], ['CoveredCar', 52, -9, 3.0], ['Barrel', 20, 8, 0], ['MilitaryCrate', 30, 9, 0.5], ['Tyre', 33, 11, 0.2], ['WoodPile', -48, -12, 0], ['WoodPile', 50, 36, 1.6], ['HayBale', 60, 34, 0.4],
  ['SandbagNest', -76, 2, Math.PI * 1.5], ['SandbagNest', 78, -2, Math.PI / 2], ['ConcreteBarrier', -70, -4, 1.57], ['ConcreteBarrier', -70, 2, 1.57], ['ConcreteBarrier', 72, 3, 1.57], ['ConcreteBarrier', 72, -3, 1.57],
  ['SandbagWall', -20, -4, 0.1], ['SandbagWall', 20, -6, -0.1], ['SandbagWall', -4, 8, 0.2], ['MilitaryCrate', -2, -4, 0.4], ['MilitaryCrate', 0.2, -4.8, 1.0],
  ['WoodPile', -62, -11, 0.3], ['HayBale', 40, -10, 0.2], ['HayBale', 41.6, -9.2, 0.5], ['Barrel', -38, -12, 0], ['Barrel', -36.8, -12.8, 0], ['OilBarrel', -20, 13, 0], ['MilitaryCrate', 48, 12, 0.7], ['Tyre', 60, 12, 0.3], ['CoveredCar', 20, 14, -0.1], ['CoveredCar', -64, 8, 1.4], ['WoodPile', 24, 38, 0.1], ['WoodPile', -48, 40, 0.2], ['Well', -40, -12, 0], ['HayBale', 70, 40, 0.4], ['HayBale', 71.8, 41, 1.2]
]);
strip(VC.x, VC.z, 0, 'StoneWall', [-40, -12], [-4, -12], 4.1, 0);
strip(VC.x, VC.z, 0, 'StoneWall', [10, -12], [30, -12], 4.1, 0);
strip(VC.x, VC.z, 0, 'WoodFence', [-70, -10], [-44, -10], 4.1, 0);
strip(VC.x, VC.z, 0, 'WoodFence', [-60, 11], [-34, 11], 4.1, 0);
strip(VC.x, VC.z, 0, 'WoodFence', [-14, 10], [20, 10], 4.1, 0);
strip(VC.x, VC.z, 0, 'WoodFence', [48, 10], [76, 10], 4.1, 0);
strip(VC.x, VC.z, 0, 'StoneWall', [-70, 40], [10, 42], 4.1, 0);

compose(QUARRY.x, QUARRY.z, 0.5, [
  ['QuarryCrusher', 0, 0, 0], ['QuarryOffice', 30, 14, 0.2], ['ShippingContainer', -24, 20, 0.1], ['ShippingContainer', -24, 24.6, 0.12], ['ShippingContainer', -24, 20, 0.1, 1, CATALOG.ShippingContainer.size[1]], ['FuelTank', 22, -22, 0], ['GravelPile', -14, -18, 0.3], ['GravelPile', 18, 30, 1.1], ['GravelPile', 6, 22, 2.0, 0.7],
  ['FlagPole', 10, 10, 0], ['OilBarrel', 36, 4, 0], ['Barrel', 34.5, 6, 0], ['Tyre', 40, 20, 0], ['MilTruck', -8, 14, 1.57], ['MilTruck', 10, -14, 0.2], ['CoveredCar', 36, 26, 0.7],
  ['SandbagNest', 12, 18, Math.PI], ['SandbagNest', -12, 6, Math.PI * 1.5], ['SandbagNest', 24, -8, Math.PI / 2], ['SandbagNest', 32, 32, Math.PI], ['Hesco', 18, 6, 0.4], ['Hesco', 20, 7.8, 0.4], ['Hesco', 22, 9.6, 0.4], ['ConcreteBarrier', 38, 12, 1.2], ['ConcreteBarrier', 38.4, 14.2, 1.2], ['MilitaryCrate', 26, 4, 0.5], ['MilitaryCrate', 28, 3, 0.1]
]);

const YARDS = { HouseA: 11, HouseB: 11, HouseC: 12, Chapel: 12, Farmhouse: 13, Barn: 15, FarmShed: 8, QuarryOffice: 9, QuarryCrusher: 16, RadioHut: 9, BaseHQ: 14, MilitaryTent: 7, ShippingContainer: 8, FuelTank: 8, Well: 5, FlagPole: 5 };
for (const [name, r] of Object.entries(YARDS)) {
  const list = models[name] || [];
  for (let q = 0; q < list.length; q += 5) {
    const cx = list[q], cz = list[q + 2];
    for (let j = Math.max(0, Math.floor((cz - r - H) / 2) - 1); j <= Math.min(MASK - 1, Math.ceil((cz + r + H) / 2)); j++) {
      for (let i = Math.max(0, Math.floor((cx - r - H) / 2) - 1); i <= Math.min(MASK - 1, Math.ceil((cx + r + H) / 2)); i++) {
        const d = hyp(-H + i * 2 + 1 - cx, -H + j * 2 + 1 - cz);
        if (d > r) continue;
        const k = 1 - smooth(r * 0.45, r, d);
        const o = (j * MASK + i) * 4;
        mask[o] = Math.max(mask[o], Math.round(255 * 0.62 * k));
        grass[j * MASK + i] = Math.round(grass[j * MASK + i] * (1 - 0.9 * k));
      }
    }
  }
}

mkdirSync(OUT, { recursive: true });
const u16 = new Uint16Array(N * N);
for (let i = 0; i < u16.length; i++) u16[i] = Math.round(clamp((heights[i] - HEIGHT.min) / HEIGHT.range, 0, 1) * 65535);
const buf = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
writeFileSync(resolve(OUT, 'height.bin'), buf(u16));
writeFileSync(resolve(OUT, 'mask.bin'), buf(mask));
writeFileSync(resolve(OUT, 'grass.bin'), buf(grass));
writeFileSync(resolve(OUT, 'horizon.bin'), buf(horizon));
const water = RIVER.map(([x, z, w, l]) => [x, z, w, l]);
writeFileSync(resolve(OUT, 'world.json'), JSON.stringify({ seed: 20260930, river: water, models, elevated }));
console.log(`bake: height ${N}x${N}, mask ${MASK}x${MASK}, horizon ${HS}x${HS}, ${Object.entries(models).map(([n, a]) => `${n}:${a.length / 5}`).join(' ')}`);
