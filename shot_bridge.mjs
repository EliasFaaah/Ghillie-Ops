import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';

const BRIDGE = resolve(import.meta.dirname);
const arg = k => { const i = process.argv.indexOf(k); return i > 1 ? process.argv[i + 1] : null; };
const GAME = resolve(arg('--game') || 'C:/Users/Leschke/Downloads/GhillieOps');
const BRANCH = arg('--branch') || 'claude/busy-mendel-qu7ij2';
const POLL = Number(arg('--poll') || 20) * 1000;
const REQ = join(BRIDGE, 'qa', 'bridge', 'requests');
const OUT = join(BRIDGE, 'qa', 'bridge', 'out');

function fail(section, e) {
  const m = /shot_bridge\.mjs:(\d+)/.exec(String(e && e.stack));
  console.error(`[bridge] shot_bridge.mjs:${m ? m[1] : '?'} ${section}: ${e && e.message ? e.message : e}`);
}

function git(...a) {
  const r = spawnSync('git', a, { cwd: BRIDGE, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${(r.stderr || r.stdout || '').trim()}`);
  return r.stdout.trim();
}

const inside = (base, p) => { const r = relative(base, p); return !!r && !r.startsWith('..') && !isAbsolute(r); };

function start() {
  if (!existsSync(join(GAME, 'tools', 'qa.mjs'))) throw new Error(`${GAME} has no tools/qa.mjs, pass --game <GhillieOps folder>`);
  if (!existsSync(join(BRIDGE, '.git'))) throw new Error(`${BRIDGE} is not a git clone of the Ghillie-Ops repo`);
  for (const [k, v] of [['user.name', 'Ghillie Bridge'], ['user.email', 'bridge@ghillie.local']]) if (spawnSync('git', ['config', k], { cwd: BRIDGE }).status !== 0) git('config', k, v);
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== BRANCH) git('checkout', '-q', BRANCH);
}

function pending() {
  if (!existsSync(REQ)) return [];
  return readdirSync(REQ).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(id => !existsSync(join(OUT, id, 'done.json'))).sort();
}

function deploy(id, files) {
  const backup = join(GAME, 'qa', 'bridge_backup', id);
  for (const [src, dst] of Object.entries(files || {})) {
    const from = resolve(BRIDGE, src), to = resolve(GAME, dst);
    if (isAbsolute(dst) || !inside(BRIDGE, from) || !inside(GAME, to)) throw new Error(`path outside the project: ${src} -> ${dst}`);
    if (!existsSync(from)) throw new Error(`missing ${src} in the bridge clone`);
    if (existsSync(to)) { mkdirSync(dirname(join(backup, dst)), { recursive: true }); copyFileSync(to, join(backup, dst)); }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

function shoot(req, out) {
  writeFileSync(join(out, 'steps.json'), JSON.stringify(req.steps, null, 2));
  const r = spawnSync(process.execPath, [join('tools', 'qa.mjs'), '--out', out, '--size', req.size || '1920x1080', '--url', req.url || '/?autostart=1', '--steps', join(out, 'steps.json'), '--timeout', String(req.timeout || 600)], { cwd: GAME, encoding: 'utf8' });
  return { qaExit: r.status, qaLog: `${r.stdout || ''}${r.stderr || ''}`.slice(-4000) };
}

function handle(id) {
  const out = join(OUT, id);
  mkdirSync(out, { recursive: true });
  const done = { id, started: new Date().toISOString(), errors: [] };
  let req = null;
  try {
    req = JSON.parse(readFileSync(join(REQ, `${id}.json`), 'utf8'));
    if (!Array.isArray(req.steps)) throw new Error('steps must be an array');
  } catch (e) { req = null; done.errors.push(`request: ${e.message}`); }
  if (req) try { deploy(id, req.files); } catch (e) { done.errors.push(`deploy: ${e.message}`); }
  if (req && !done.errors.length) try { Object.assign(done, shoot(req, out)); } catch (e) { done.errors.push(`qa: ${e.message}`); }
  done.finished = new Date().toISOString();
  writeFileSync(join(out, 'done.json'), JSON.stringify(done, null, 2));
  git('add', '--', relative(BRIDGE, out));
  git('commit', '-q', '-m', `bridge: shots ${id}`);
  console.log(`[bridge] ${id} done${done.errors.length ? ' with errors: ' + done.errors.join('; ') : ''}`);
}

function tick() {
  try {
    git('pull', '-q', '--rebase', '--autostash', 'origin', BRANCH);
    for (const id of pending()) {
      try { handle(id); } catch (e) { fail(`request ${id}`, e); }
    }
    if (Number(git('rev-list', '--count', `origin/${BRANCH}..HEAD`)) > 0) git('push', '-q', 'origin', BRANCH);
  } catch (e) { fail('sync', e); }
}

try { start(); } catch (e) { fail('start', e); process.exit(1); }
console.log(`[bridge] watching ${BRANCH} every ${POLL / 1000} s, game folder ${GAME}`);
tick();
setInterval(tick, POLL);
