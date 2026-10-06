import { Vector3 } from 'three';
import { MAP, BRIDGE, BASES } from './layout.js';
import { register, assert } from '../core/selftest.js';

const CELL = 2;
const N = MAP.size / CELL;
const H = MAP.half;
const MAX_SLOPE = 0.62;
const DEEP_WATER = 0.85;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  push(k, v) {
    let i = this.keys.length;
    this.keys.push(k); this.vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= k) break;
      this.keys[i] = this.keys[p]; this.vals[i] = this.vals[p];
      i = p;
    }
    this.keys[i] = k; this.vals[i] = v;
  }
  pop() {
    const topV = this.vals[0];
    const lastK = this.keys.pop(), lastV = this.vals.pop();
    const n = this.keys.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.keys[c + 1] < this.keys[c]) c++;
        if (this.keys[c] >= lastK) break;
        this.keys[i] = this.keys[c]; this.vals[i] = this.vals[c];
        i = c;
      }
      this.keys[i] = lastK; this.vals[i] = lastV;
    }
    return topV;
  }
}

export function createNav(terrain, water, collision) {
  const cost = new Uint8Array(N * N);
  const nv = new Vector3();
  const cellOf = v => Math.min(N - 1, Math.max(0, Math.floor((v + H) / CELL)));
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -H + (i + 0.5) * CELL, z = -H + (j + 0.5) * CELL;
      const slope = 1 - terrain.normalAt(x, z, nv).y;
      const depth = water.depthAt(x, z);
      cost[j * N + i] = slope > MAX_SLOPE || depth > DEEP_WATER ? 0 : 1 + Math.min(6, Math.round(slope * 8)) + (depth > 0.1 ? 4 : 0);
    }
  }
  const { positions, index } = { positions: collision.geometry.attributes.position.array, index: collision.geometry.index.array };
  const pad = 0.35;
  for (let t = 0; t < index.length; t += 3) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let k = 0; k < 3; k++) {
      const o = index[t + k] * 3;
      x0 = Math.min(x0, positions[o]); x1 = Math.max(x1, positions[o]);
      y0 = Math.min(y0, positions[o + 1]); y1 = Math.max(y1, positions[o + 1]);
      z0 = Math.min(z0, positions[o + 2]); z1 = Math.max(z1, positions[o + 2]);
    }
    const g = terrain.heightAt((x0 + x1) / 2, (z0 + z1) / 2);
    if (y1 < g + 0.4 || y0 > g + 2.0 || y0 > g + 1.0 && y1 - y0 < 0.3) continue;
    for (let j = cellOf(z0 - pad); j <= cellOf(z1 + pad); j++) for (let i = cellOf(x0 - pad); i <= cellOf(x1 + pad); i++) cost[j * N + i] = 0;
  }
  const bi0 = cellOf(BRIDGE.x - 2.4), bi1 = cellOf(BRIDGE.x + 2.4), bj0 = cellOf(BRIDGE.z - BRIDGE.length / 2), bj1 = cellOf(BRIDGE.z + BRIDGE.length / 2);
  for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) cost[j * N + i] = 1;

  const walkable = (x, z) => cost[cellOf(z) * N + cellOf(x)] > 0;

  function nearest(x, z) {
    const ci = cellOf(x), cj = cellOf(z);
    if (cost[cj * N + ci]) return [ci, cj];
    for (let r = 1; r < 40; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < N && j < N && cost[j * N + i]) return [i, j];
        }
      }
    }
    return null;
  }

  const g = new Float32Array(N * N);
  const from = new Int32Array(N * N);
  const seen = new Uint32Array(N * N);
  let stamp = 0;

  function path(ax, az, bx, bz) {
    const a = nearest(ax, az), b = nearest(bx, bz);
    if (!a || !b) return null;
    const start = a[1] * N + a[0], goal = b[1] * N + b[0];
    stamp++;
    const open = new MinHeap();
    g[start] = 0; from[start] = -1; seen[start] = stamp;
    open.push(0, start);
    const h = (i, j) => Math.hypot(i - b[0], j - b[1]);
    const closed = new Set();
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const ci = cur % N, cj = (cur - ci) / N;
      for (const [di, dj, w] of DIRS) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const k = j * N + i;
        const c = cost[k];
        if (!c) continue;
        if (di && dj && (!cost[cj * N + i] || !cost[j * N + ci])) continue;
        const ng = g[cur] + w * c;
        if (seen[k] !== stamp || ng < g[k]) {
          seen[k] = stamp; g[k] = ng; from[k] = cur;
          open.push(ng + h(i, j), k);
        }
      }
    }
    if (seen[goal] !== stamp) return null;
    const out = [];
    for (let k = goal; k !== -1; k = from[k]) out.push({ x: -H + ((k % N) + 0.5) * CELL, z: -H + (Math.floor(k / N) + 0.5) * CELL });
    return out.reverse();
  }

  let open = 0;
  for (let i = 0; i < cost.length; i++) if (cost[i]) open++;
  return { cost, cell: CELL, size: N, walkable, path, nearest, openFraction: open / cost.length };
}

register('world/nav', 'navigation grid is mostly open, blocks water and buildings, and routes between the bases over the bridge', ctx => {
  const nav = ctx.world.nav;
  assert(nav.openFraction > 0.6 && nav.openFraction < 0.99, `walkable fraction ${nav.openFraction.toFixed(3)} implausible`);
  const farm = BASES.A;
  assert(nav.nearest(farm.x, farm.z), 'the farm needs walkable ground');
  const deep = ctx.world.data.river.find(p => Math.abs(p[0] + 400) < 120);
  assert(!nav.walkable(deep[0] + 0.5, deep[1] + 0.5) || ctx.world.water.depthAt(deep[0], deep[1]) < DEEP_WATER, 'deep river must be blocked');
  const p = nav.path(BASES.red.x, BASES.red.z + 40, BASES.blue.x, BASES.blue.z - 40);
  assert(p && p.length > 100, 'no route between the team bases');
  const len = p.reduce((s, q, i) => i ? s + Math.hypot(q.x - p[i - 1].x, q.z - p[i - 1].z) : 0, 0);
  const straight = Math.hypot(BASES.red.x - BASES.blue.x, BASES.red.z - BASES.blue.z) - 80;
  assert(len < straight * 1.6, `route ${len.toFixed(0)} m is too long for ${straight.toFixed(0)} m straight`);
  assert(p.some(q => Math.abs(q.x - BRIDGE.x) < 4 && Math.abs(q.z - BRIDGE.z) < 22), 'the only crossing is the bridge, the route must use it');
  for (const key of ['A', 'B', 'C', 'D']) {
    const zone = Array.from({ length: 8 }, (_, k) => nav.path(BASES.red.x, BASES.red.z + 60, BASES[key].x + 16 * Math.cos(k * Math.PI / 4), BASES[key].z + 16 * Math.sin(k * Math.PI / 4)));
    assert(zone.some(Boolean), `no route into the capture zone of base ${key}`);
  }
});
