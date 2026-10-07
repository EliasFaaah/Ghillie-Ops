import { register, assert } from './selftest.js';

export function summarize(values, bucketMs = 1, maxMs = 34) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = p => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
  const round = x => Math.round(x * 1000) / 1000;
  const hist = new Array(Math.ceil(maxMs / bucketMs) + 1).fill(0);
  for (const x of v) hist[Math.min(hist.length - 1, Math.floor(x / bucketMs))]++;
  return {
    n: v.length,
    mean: round(v.reduce((a, b) => a + b, 0) / v.length),
    p50: round(rank(0.5)),
    p95: round(rank(0.95)),
    p99: round(rank(0.99)),
    max: round(v[v.length - 1]),
    bucketMs,
    hist
  };
}

export function histogramText(s, label) {
  if (!s) return `${label}: no samples`;
  const peak = Math.max(...s.hist);
  const rows = s.hist.map((c, i) => c ? `${String(i * s.bucketMs).padStart(3)}${i === s.hist.length - 1 ? '+' : ' '} ms ${String(c).padStart(6)} ${'#'.repeat(Math.ceil(40 * c / peak))}` : null).filter(Boolean);
  return [`${label}: n=${s.n} mean=${s.mean} p50=${s.p50} p95=${s.p95} p99=${s.p99} max=${s.max} ms`, ...rows].join('\n');
}

register('core/stats', 'percentiles and histogram', () => {
  const s = summarize([...Array.from({ length: 100 }, (_, i) => 100 - i), NaN, null]);
  assert(s.n === 100 && s.mean === 50.5 && s.p50 === 50 && s.p95 === 95 && s.p99 === 99 && s.max === 100, `summary ${JSON.stringify({ n: s.n, mean: s.mean, p50: s.p50, p95: s.p95, p99: s.p99, max: s.max })}`);
  assert(s.hist.length === 35 && s.hist[1] === 1 && s.hist[33] === 1 && s.hist[34] === 67 && s.hist.reduce((a, b) => a + b, 0) === 100, 'histogram buckets wrong');
  assert(summarize([]) === null && summarize([NaN]) === null, 'no samples must give null');
  const one = summarize([2.4, 2.6, 5.5]);
  assert(one.hist[2] === 2 && one.hist[5] === 1 && one.p50 === 2.6, 'fractional values must fall into their 1 ms bucket');
  const text = histogramText(one, 'gpu').split('\n');
  assert(text[0] === 'gpu: n=3 mean=3.5 p50=2.6 p95=5.5 p99=5.5 max=5.5 ms' && text.length === 3 && text[1].startsWith('  2  ms      2 '), `histogram text wrong: ${text.join(' / ')}`);
});
