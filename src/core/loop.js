import { register, assert, report } from './selftest.js';

export const TICK = 1 / 60;
const MAX_TICKS_PER_FRAME = 8;
const MAX_FRAME_DT = 0.25;

export function createLoop(onError = report) {
  const ticks = [];
  const frames = [];
  let acc = 0;
  const add = (list, name, fn, order) => {
    list.push({ name, fn, order });
    list.sort((a, b) => a.order - b.order);
  };
  const call = (s, a, b) => {
    try { s.fn(a, b); } catch (e) { onError(`loop/${s.name}`, e); }
  };
  const loop = {
    tick: 0,
    frame: 0,
    simTime: 0,
    alpha: 0,
    paused: false,
    lastTicks: 0,
    addTick(name, fn, order = 50) { add(ticks, name, fn, order); },
    addFrame(name, fn, order = 50) { add(frames, name, fn, order); },
    remove(name) {
      for (const list of [ticks, frames]) for (let i = list.length - 1; i >= 0; i--) if (list[i].name === name) list.splice(i, 1);
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        for (const s of ticks) call(s, TICK);
        loop.tick++;
        loop.simTime = loop.tick * TICK;
      }
    },
    advance(dt) {
      dt = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
      let n = 0;
      if (!loop.paused) {
        acc += dt;
        while (acc >= TICK && n < MAX_TICKS_PER_FRAME) { loop.step(1); acc -= TICK; n++; }
        if (acc >= TICK) acc %= TICK;
        loop.alpha = acc / TICK;
      }
      for (const s of frames) call(s, loop.alpha, dt);
      loop.frame++;
      loop.lastTicks = n;
      return n;
    }
  };
  return loop;
}

register('core/loop', 'fixed 60 Hz ticks with interpolation alpha', () => {
  const errors = [];
  const loop = createLoop((m, e) => errors.push(`${m}: ${e.message}`));
  let ticks = 0, lastAlpha = -1, order = [];
  loop.addTick('count', dt => { ticks++; assert(dt === TICK, 'tick dt must be 1/60'); }, 10);
  loop.addTick('first', () => order.push('first'), 1);
  loop.addTick('second', () => order.push('second'), 5);
  loop.addFrame('alpha', a => { lastAlpha = a; });
  for (let i = 0; i < 144; i++) loop.advance(1 / 144);
  assert(Math.abs(ticks - 60) <= 1, `144 frames of 1/144 s must give 60 ticks, got ${ticks}`);
  assert(lastAlpha >= 0 && lastAlpha < 1, `alpha out of range: ${lastAlpha}`);
  assert(order[0] === 'first' && order[1] === 'second', 'tick systems must run in order');
  const before = loop.tick;
  loop.advance(5);
  assert(loop.tick - before === 8, `a long frame must be capped at 8 ticks, got ${loop.tick - before}`);
  loop.paused = true;
  const frozen = loop.tick;
  loop.advance(0.1);
  assert(loop.tick === frozen && loop.frame > 0, 'paused loop must not tick but must still render frames');
  loop.paused = false;
  loop.addTick('bad', () => { throw new Error('probe'); }, 20);
  loop.step(3);
  assert(ticks === frozen + 3 && errors.length === 3, 'a throwing system must not stop the others');
  assert(Math.abs(loop.simTime - loop.tick * TICK) < 1e-9, 'simTime must equal tick * TICK');
  loop.remove('bad');
  loop.step(1);
  assert(errors.length === 3, 'remove() must detach a system');
});
