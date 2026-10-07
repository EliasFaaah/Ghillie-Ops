import { register, assert } from './selftest.js';

export function createDebugApi() {
  const providers = {};
  const usage = {};
  const api = {
    state() {
      const out = {};
      for (const [name, fn] of Object.entries(providers)) {
        try { out[name] = fn(); } catch (e) { out[name] = { error: e.message }; }
      }
      return JSON.parse(JSON.stringify(out));
    },
    help() {
      return { state: 'state() -> read-only snapshot of every module', help: 'help() -> this list', ...usage };
    }
  };
  return {
    api,
    provide(name, fn) {
      if (providers[name]) throw new Error(`state provider "${name}" registered twice`);
      providers[name] = fn;
    },
    expose(name, fn, help) {
      if (name in api) throw new Error(`__GO.${name} registered twice`);
      Object.defineProperty(api, name, { value: fn, enumerable: true });
      usage[name] = help;
    }
  };
}

const debug = createDebugApi();
export const provide = debug.provide;
export const expose = debug.expose;
window.__GO = debug.api;

register('core/debug', 'isolated providers and unique commands', () => {
  const d = createDebugApi();
  d.provide('ok', () => ({ v: 1, nested: { w: 2 } }));
  d.provide('broken', () => { throw new Error('boom'); });
  const s = d.api.state();
  assert(s.ok.v === 1 && s.broken.error === 'boom', 'a failing provider must not hide the others');
  s.ok.nested.w = 5;
  assert(d.api.state().ok.nested.w === 2, 'state() must return a copy');
  d.expose('ping', () => 'pong', 'ping()');
  assert(d.api.ping() === 'pong' && d.api.help().ping === 'ping()', 'expose must add a command with usage');
  let threw = false;
  try { d.expose('ping', () => 0, ''); } catch { threw = true; }
  assert(threw, 'duplicate command names must be rejected');
});
