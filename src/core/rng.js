import { register, assert } from './selftest.js';

function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function createRng(seed) {
  seed >>>= 0;
  let s = seed;
  const mix = () => {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix();
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor((hi - lo + 1) * next()),
    stream: name => createRng(hash32(name) ^ Math.imul(seed, 0x9e3779b1))
  };
}

register('core/rng', 'determinism and range', () => {
  const a = createRng(1234), b = createRng(1234), c = createRng(1235);
  let same = true, differ = false, sum = 0, lo = 1, hi = 0;
  for (let i = 0; i < 20000; i++) {
    const x = a.next(), y = b.next(), z = c.next();
    same = same && x === y;
    differ = differ || x !== z;
    sum += x; lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  assert(same, 'same seed must give the same sequence');
  assert(differ, 'different seeds must give different sequences');
  assert(lo >= 0 && hi < 1, `next() out of [0,1): ${lo}..${hi}`);
  assert(Math.abs(sum / 20000 - 0.5) < 0.01, `mean ${sum / 20000} is not near 0.5`);
  const r = createRng(7), seen = new Set();
  for (let i = 0; i < 2000; i++) { const n = r.int(1, 6); assert(n >= 1 && n <= 6, `int(1,6) gave ${n}`); seen.add(n); }
  assert(seen.size === 6, 'int(1,6) must reach both bounds');
});

register('core/rng', 'independent named streams', () => {
  const base = createRng(99);
  const s1 = base.stream('bots'), s2 = createRng(99).stream('bots'), s3 = base.stream('spawns');
  assert(s1.next() === s2.next(), 'stream with same name and seed must repeat');
  assert(base.stream('bots').next() !== s3.next(), 'streams with different names must differ');
});
