import { MAP } from './layout.js';
import { register, assert } from '../core/selftest.js';

const BINS = 1024;
const TAU = Math.PI * 2;
const NEAR_STEP = 4;
const NEAR_RANGE = 600;
const FAR_STEP = 12;
const FAR_RANGE = 3300;
const NEAR_STEPS = NEAR_RANGE / NEAR_STEP;
const STEPS = NEAR_STEPS + Math.ceil((FAR_RANGE - NEAR_RANGE) / FAR_STEP);
const ALWAYS = 36;
const PER_FRAME = 64;
const MARGIN = 1.5;
const N = MAP.samples;
const H = MAP.half;

export function createHorizon(terrain) {
  const heights = terrain.heights;
  const table = new Float32Array(BINS * STEPS).fill(-1e9);
  const ox = new Float32Array(BINS), oy = new Float32Array(BINS), oz = new Float32Array(BINS);
  const valid = new Uint8Array(BINS);
  const cam = { x: 0, y: 0, z: 0 };
  let cursor = 0;

  const sample = (x, z) => {
    const i = ((x + H) * 0.5 + 0.5) | 0, j = ((z + H) * 0.5 + 0.5) | 0;
    return i < 0 || j < 0 || i >= N || j >= N ? -1e9 : heights[j * N + i];
  };

  function computeBin(b, x, y, z) {
    const a = (b + 0.5) / BINS * TAU, dx = Math.cos(a), dz = Math.sin(a);
    let run = -1e9;
    const base = b * STEPS;
    for (let s = 0; s < STEPS; s++) {
      const r = s < NEAR_STEPS ? (s + 1) * NEAR_STEP : NEAR_RANGE + (s - NEAR_STEPS + 1) * FAR_STEP;
      const t = (sample(x + dx * r, z + dz * r) - y) / r;
      if (t > run) run = t;
      table[base + s] = run;
    }
    ox[b] = x; oy[b] = y; oz[b] = z;
    valid[b] = 1;
  }

  const stepOf = r => r < NEAR_RANGE ? Math.max(0, Math.ceil(r / NEAR_STEP) - 2) : Math.min(STEPS - 1, NEAR_STEPS + Math.ceil((r - NEAR_RANGE) / FAR_STEP) - 2);

  function level(b, r) {
    if (!valid[b]) return -1e9;
    const d = Math.hypot(cam.x - ox[b], cam.z - oz[b]) + Math.abs(cam.y - oy[b]);
    return table[b * STEPS + stepOf(r)] - (d + MARGIN) / r;
  }

  const horizon = {
    version: 0,
    bins: BINS,
    refresh(x, y, z, count = PER_FRAME) {
      cam.x = x; cam.y = y; cam.z = z;
      for (let k = 0; k < count; k++) {
        computeBin(cursor, x, y, z);
        cursor = (cursor + 1) % BINS;
      }
      horizon.version++;
    },
    refreshAll(x, y, z) {
      horizon.refresh(x, y, z, BINS);
    },
    visible(x0, z0, x1, z1, top) {
      const dx0 = x0 - cam.x, dx1 = x1 - cam.x, dz0 = z0 - cam.z, dz1 = z1 - cam.z;
      const nx = dx0 > 0 ? dx0 : dx1 < 0 ? -dx1 : 0, nz = dz0 > 0 ? dz0 : dz1 < 0 ? -dz1 : 0;
      const rn = Math.sqrt(nx * nx + nz * nz);
      if (rn < ALWAYS) return true;
      const ac = Math.atan2((dz0 + dz1) * 0.5, (dx0 + dx1) * 0.5);
      let lo = 0, hi = 0;
      for (let q = 0; q < 4; q++) {
        let d = Math.atan2(q & 1 ? dz1 : dz0, q & 2 ? dx1 : dx0) - ac;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      const ax = Math.max(Math.abs(dx0), Math.abs(dx1)), az = Math.max(Math.abs(dz0), Math.abs(dz1));
      const rf = Math.sqrt(ax * ax + az * az), rm = (rn + rf) * 0.5;
      const dy = top - cam.y;
      const tn = dy / rn, tm = dy / rm, tf = dy / rf;
      const b0 = Math.floor((ac + lo) / TAU * BINS), b1 = Math.floor((ac + hi) / TAU * BINS);
      for (let b = b0; b <= b1; b++) {
        const bi = ((b % BINS) + BINS) % BINS;
        if (tn >= level(bi, rn) || tm >= level(bi, rm) || tf >= level(bi, rf)) return true;
      }
      return false;
    }
  };
  return horizon;
}

register('world/horizon', 'a hill hides what lies behind it and never hides what is in front', ctx => {
  const w = ctx.world;
  const hz = createHorizon(w.terrain);
  const x = -330, z = 70, y = w.terrain.heightAt(x, z) + 1.7;
  hz.refreshAll(x, y, z);
  let hidden = 0, total = 0, wrong = 0;
  for (let gx = -1000; gx < 1000; gx += 32) {
    for (let gz = -1000; gz < 1000; gz += 32) {
      const top = w.terrain.heightAt(gx + 16, gz + 16) + 12;
      const vis = hz.visible(gx, gz, gx + 32, gz + 32, top);
      total++;
      if (!vis) hidden++;
      if (!vis) {
        const o = { x, y, z }, tx = gx + 16, tz = gz + 16, ty = top;
        const steps = Math.ceil(Math.hypot(tx - x, tz - z) / 2);
        let blocked = false;
        for (let s = 1; s < steps && !blocked; s++) {
          const f = s / steps;
          if (w.terrain.heightAt(o.x + (tx - o.x) * f, o.z + (tz - o.z) * f) > o.y + (ty - o.y) * f + 0.2) blocked = true;
        }
        if (!blocked) wrong++;
      }
    }
  }
  assert(wrong === 0, `${wrong} chunks were declared hidden although the ray to their top is free`);
  assert(hidden > total * 0.05 && hidden < total, `horizon culling hid ${hidden} of ${total} chunks`);
});
