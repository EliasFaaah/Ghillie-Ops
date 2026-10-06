const checks = [];
const reported = new Set();
export const result = { running: false, done: false, total: 0, passed: 0, failed: 0, failures: [] };

class CheckError extends Error {}

function locate(stack, skip = '/src/core/selftest.js') {
  for (const line of String(stack || '').split('\n')) {
    const m = /(\/src\/[^\s():]+):(\d+):\d+/.exec(line);
    if (m && m[1] !== skip) return `${m[1].slice(1)}:${m[2]}`;
  }
  return null;
}

export function assert(cond, reason) {
  if (!cond) throw new CheckError(reason);
}

export function register(module, name, fn) {
  checks.push({ module, name, fn, where: locate(new Error().stack.split('\n').slice(2).join('\n'), null) || 'unknown' });
}

export function report(module, err, where) {
  const reason = err && err.message ? err.message : String(err);
  const at = (err && locate(err.stack)) || where || 'unknown';
  const key = `${module}|${at}|${reason}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`[${module}] ${at} - ${reason}`);
}

export async function run(ctx, timeoutMs = 30000) {
  if (result.running) return result;
  Object.assign(result, { running: true, done: false, total: checks.length, passed: 0, failed: 0, failures: [] });
  for (const c of checks) {
    let timer;
    try {
      const timeout = new Promise((_, fail) => { timer = setTimeout(() => fail(new CheckError(`timed out after ${timeoutMs} ms`)), timeoutMs); });
      await Promise.race([Promise.resolve().then(() => c.fn(ctx)), timeout]);
      result.passed++;
    } catch (e) {
      const where = locate(e && e.stack) || c.where;
      const reason = e && e.message ? e.message : String(e);
      result.failed++;
      result.failures.push({ module: c.module, name: c.name, where, reason });
      console.error(`[selftest] FAIL ${c.module} "${c.name}" at ${where} - ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
  result.running = false;
  result.done = true;
  return result;
}

register('core/selftest', 'locate and assert', () => {
  let err;
  try { assert(false, 'probe'); } catch (e) { err = e; }
  assert(err instanceof CheckError && err.message === 'probe', 'assert(false) must throw CheckError with the reason');
  assert(locate('Error\n    at f (http://localhost:8790/src/core/selftest.js:1:1)\n    at g (http://localhost:8790/src/views/test.js:42:7)') === 'src/views/test.js:42', 'locate must skip selftest frames and return file:line');
  assert(locate('Error\n    at http://localhost:8790/vendor/three/build/three.module.js:5:5') === null, 'locate must ignore vendor frames');
});
