import { summarize } from './stats.js';
import { register, assert } from './selftest.js';

const MAX_QUERIES = 1024;

export function createPerf(gl, capacity = 36000) {
  let ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const cpu = new Float32Array(capacity);
  const gpu = new Float32Array(capacity);
  const interval = new Float32Array(capacity);
  const pending = [];
  const pool = [];
  let frame = 0, first = 0, t0 = 0, last = 0, active = false;
  const reset = restored => {
    ext = restored ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    pending.length = pool.length = 0;
  };
  gl.canvas.addEventListener('webglcontextlost', () => reset(false));
  gl.canvas.addEventListener('webglcontextrestored', () => reset(true));

  const poll = () => {
    if (!ext) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const p of pending) pool.push(p.query);
      pending.length = 0;
      return;
    }
    while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
      const p = pending.shift();
      if (p.frame >= first && frame - p.frame < capacity) gpu[p.frame % capacity] = gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6;
      pool.push(p.query);
    }
  };

  const perf = {
    gpuTimer: !!ext,
    begin(now = performance.now()) {
      const i = frame % capacity;
      interval[i] = last ? now - last : NaN;
      gpu[i] = NaN;
      last = t0 = now;
      if (ext && pending.length < MAX_QUERIES) {
        const query = pool.pop() || gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        pending.push({ query, frame });
        active = true;
      }
    },
    end(now = performance.now()) {
      if (active) { if (ext) gl.endQuery(ext.TIME_ELAPSED_EXT); active = false; }
      cpu[frame % capacity] = now - t0;
      frame++;
      poll();
    },
    reset() { first = frame; },
    samples() {
      const from = Math.max(first, frame - capacity);
      const pick = arr => Array.from({ length: frame - from }, (_, k) => { const v = arr[(from + k) % capacity]; return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null; });
      return { cpu: pick(cpu), gpu: pick(gpu), dt: pick(interval).filter(v => v !== null) };
    },
    summary() {
      const s = perf.samples();
      return { frames: s.cpu.length, cpu: summarize(s.cpu), gpu: summarize(s.gpu.filter(v => v !== null)), interval: summarize(s.dt) };
    }
  };
  return perf;
}

register('core/perf', 'frame sampling and timer query results', async ctx => {
  const perf = ctx.perf;
  assert(perf.gpuTimer === !!ctx.gl.getExtension('EXT_disjoint_timer_query_webgl2'), 'gpuTimer flag must match extension availability');
  const f0 = ctx.loop.frame;
  await new Promise(r => setTimeout(r, 700));
  const all = perf.samples();
  const n = Math.min(ctx.loop.frame - f0, all.cpu.length);
  const s = { cpu: all.cpu.slice(-n), gpu: all.gpu.slice(-n) };
  assert(n > 10, `expected frames after 0.7 s, got ${n}`);
  assert(s.cpu.every(v => v !== null && v >= 0), 'cpu samples must be finite and non-negative');
  if (perf.gpuTimer) {
    const settled = s.gpu.slice(0, -6);
    const covered = settled.filter(v => v !== null && v > 0).length;
    assert(covered >= 0.9 * settled.length, `GPU timer covered ${covered} of ${settled.length} frames, expected at least 90 percent`);
  }
});
