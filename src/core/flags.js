import { register, assert } from './selftest.js';

const MODES = ['normal', 'team', 'conquer'];
const PRESETS = ['medium', 'high', 'ultra'];
const KNOWN = ['mode', 'autostart', 'bench', 'seed', 'netsim', 'selftest', 'view', 'preset', 'scale'];

export function parseFlags(search) {
  const q = new URLSearchParams(search);
  const errors = [];
  const bool = key => {
    const v = q.get(key);
    if (v === null || v === '0' || v === 'false') return false;
    if (v === '' || v === '1' || v === 'true') return true;
    errors.push(`${key}=${v} must be 1 or 0`);
    return false;
  };
  const oneOf = (key, list, fallback) => {
    const v = q.get(key);
    if (v === null) return fallback;
    if (list.includes(v.toLowerCase())) return v.toLowerCase();
    errors.push(`${key}=${v} must be one of ${list.join('|')}`);
    return fallback;
  };
  const number = (key, ok, fallback, rule) => {
    if (!q.has(key)) return fallback;
    const n = Number(q.get(key));
    if (q.get(key) !== '' && ok(n)) return n;
    errors.push(`${key}=${q.get(key)} must be ${rule}`);
    return fallback;
  };
  let netsim = null;
  if (q.has('netsim')) {
    const p = q.get('netsim').split(',').map(Number);
    if (p.length === 3 && p.every(x => Number.isFinite(x) && x >= 0) && p[2] <= 100) netsim = Object.freeze({ latency: p[0], jitter: p[1], loss: p[2] });
    else errors.push(`netsim=${q.get('netsim')} must be latencyMs,jitterMs,lossPercent`);
  }
  const view = q.has('view') ? q.get('view').toLowerCase() : null;
  const flags = {
    mode: oneOf('mode', MODES, null),
    autostart: bool('autostart'),
    bench: bool('bench'),
    seed: number('seed', n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff, null, 'an integer 0..4294967295'),
    netsim,
    selftest: bool('selftest'),
    view,
    preset: oneOf('preset', PRESETS, 'high'),
    scale: number('scale', n => n >= 0.25 && n <= 2, 1, 'a number 0.25..2')
  };
  for (const key of q.keys()) if (!KNOWN.includes(key)) errors.push(`unknown flag ${key}`);
  flags.errors = Object.freeze(errors);
  return Object.freeze(flags);
}

export const flags = parseFlags(location.search);

register('core/flags', 'parse valid flags', () => {
  const f = parseFlags('?mode=Team&autostart=1&bench=0&seed=42&netsim=200,60,5&selftest=true&view=test&preset=ultra&scale=0.5');
  assert(f.errors.length === 0, `unexpected errors: ${f.errors.join('; ')}`);
  assert(f.mode === 'team' && f.autostart && !f.bench && f.seed === 42 && f.selftest, 'mode/autostart/bench/seed/selftest parsed wrong');
  assert(f.netsim.latency === 200 && f.netsim.jitter === 60 && f.netsim.loss === 5, 'netsim parsed wrong');
  assert(f.view === 'test' && f.preset === 'ultra' && f.scale === 0.5, 'view/preset/scale parsed wrong');
  const d = parseFlags('');
  assert(d.mode === null && d.seed === null && d.netsim === null && d.preset === 'high' && d.scale === 1 && !d.autostart, 'defaults wrong');
});

register('core/flags', 'reject invalid flags', () => {
  const f = parseFlags('?mode=deathmatch&seed=-3&netsim=200,60&scale=9&autostart=yes&foo=1');
  assert(f.errors.length === 6, `expected 6 errors, got ${f.errors.length}: ${f.errors.join('; ')}`);
  assert(f.mode === null && f.seed === null && f.netsim === null && f.scale === 1 && !f.autostart, 'invalid values must fall back to defaults');
});
