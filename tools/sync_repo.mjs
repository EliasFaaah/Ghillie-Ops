import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MODELS_SRC = resolve(ROOT, '..', 'Models', 'GhillieOps');
const REMOTE = 'https://github.com/EliasFaaah/Ghillie-Ops.git';
const LIMIT = 95 * 1024 * 1024;
const message = process.argv.slice(2).join(' ') || 'Sync local build';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fail = (where, why) => { console.error(`[sync_repo] ${where}: ${why}`); process.exit(1); };

try {
  if (!existsSync(join(ROOT, '.git'))) {
    git('init', '-q', '-b', 'main');
    git('remote', 'add', 'origin', REMOTE);
    git('config', 'user.name', 'EliasFaaah');
    git('config', 'user.email', 'elias.l4@schule.bremen.de');
    git('config', 'core.autocrlf', 'false');
  }
  git('fetch', '-q', 'origin', 'main');
  git('reset', '-q', 'origin/main');
} catch (e) { fail('git setup', e.stderr || e.message); }

try {
  if (existsSync(MODELS_SRC)) {
    mkdirSync(join(ROOT, 'models'), { recursive: true });
    try { execFileSync('robocopy', [MODELS_SRC, join(ROOT, 'models'), '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'ignore' }); }
    catch (e) { if (e.status >= 8) throw new Error(`robocopy exit ${e.status}`); }
  }
} catch (e) { fail('models mirror', e.message); }

const big = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'qa') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (st.size > LIMIT) big.push(relative(ROOT, full).replaceAll('\\', '/'));
  }
};
walk(ROOT);
mkdirSync(join(ROOT, '.git', 'info'), { recursive: true });
writeFileSync(join(ROOT, '.git', 'info', 'exclude'), big.map(p => '/' + p).join('\n') + '\n');

try {
  git('add', '-A');
  if (!git('status', '--porcelain')) { console.log('[sync_repo] nothing to commit'); process.exit(0); }
  git('commit', '-q', '-m', `${message}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
  execFileSync('git', ['push', '-q', 'origin', 'HEAD:main'], { cwd: ROOT, stdio: 'inherit' });
  console.log(`[sync_repo] pushed ${git('rev-parse', '--short', 'HEAD')}${big.length ? `; skipped >95 MB: ${big.join(', ')}` : ''}`);
} catch (e) { fail('commit/push', e.stderr || e.message); }
