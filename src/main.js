import { flags } from './core/flags.js';
import { createRng, randomSeed } from './core/rng.js';
import { register, assert, report, run as runSelftest, result as selftestResult } from './core/selftest.js';
import { provide, expose } from './core/debug.js';
import { createLoop } from './core/loop.js';
import { createInput, readLayout } from './core/input.js';
import { createAssets } from './core/assets.js';
import { createPerf } from './core/perf.js';
import { createRenderer } from './render/renderer.js';
import { createPost } from './render/post.js';
import { createLoading } from './ui/loading.js';
import { createPause } from './ui/pause.js';

const VIEWS = { world: () => import('./views/world.js'), test: () => import('./views/test.js'), weapons: () => import('./views/weapons.js') };
const DEFAULT_VIEW = 'world';

const foreignRequests = [];
new PerformanceObserver(list => {
  for (const e of list.getEntries()) if (!e.name.startsWith(location.origin) && !/^(data|blob):/.test(e.name)) foreignRequests.push(e.name);
}).observe({ type: 'resource', buffered: true });

const loading = createLoading(document.getElementById('loading'));
const pause = createPause(document.getElementById('pause'));
const boot = { ready: false, view: flags.view || DEFAULT_VIEW, seed: null, error: null, contextLost: false };
const ctx = { flags, boot };
window.__ctx = ctx;
provide('boot', () => ({ ready: boot.ready, view: boot.view, seed: boot.seed, error: boot.error, contextLost: boot.contextLost, flags: { ...flags, errors: [...flags.errors] } }));

for (const e of flags.errors) console.warn(`[flags] ${e}`);

async function refreshLayout() {
  const layout = await readLayout();
  if (layout) ctx.input.setLayout(layout);
  pause.setBindings(ctx.input.rows());
}

function setPaused(paused, heading = 'Paused', action = 'Click to resume', note = '') {
  ctx.loop.paused = paused;
  if (!paused) return pause.hide();
  pause.show(heading, action, note);
  refreshLayout();
}

async function resume() {
  if (boot.contextLost) return;
  if (await ctx.input.lock()) setPaused(false);
  else pause.show('Paused', 'Click to resume', 'Mouse capture was refused by the browser. Click again.');
}

function wireSession() {
  const { input, loop, render } = ctx;
  pause.onClick(resume);
  render.canvas.addEventListener('click', () => { if (!loop.paused && !input.state.locked) input.lock(); });
  input.onLockChange(locked => { if (!locked && !loop.paused) setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !loop.paused) setPaused(true); });
  render.canvas.addEventListener('webglcontextlost', () => {
    boot.contextLost = true;
    setPaused(true, 'Graphics reset', 'Restoring graphics', 'The graphics driver was reset. Waiting for the GPU to come back.');
  });
  render.canvas.addEventListener('webglcontextrestored', () => {
    boot.contextLost = false;
    ctx.view.restoreGpu();
    setPaused(true, 'Paused', 'Click to resume', 'Graphics restored.');
  });
  if (!flags.autostart) setPaused(true, 'Ghillie Ops', 'Click to start', ctx.view.startHint || '');
}

function exposeDebug() {
  const { loop, render, input, assets, perf } = ctx;
  provide('loop', () => ({ tick: loop.tick, frame: loop.frame, simTime: loop.simTime, alpha: loop.alpha, paused: loop.paused, lastTicks: loop.lastTicks }));
  provide('render', () => {
    const info = render.renderer.info;
    return { gpu: render.gpu, width: render.width, height: render.height, scale: render.scale, preset: render.presetName, drawingBuffer: [render.gl.drawingBufferWidth, render.gl.drawingBufferHeight], calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : 0 };
  });
  provide('input', () => ({ locked: input.state.locked, raw: input.state.raw, lockError: input.state.lockError, held: input.heldCodes(), lookX: input.state.lookX, lookY: input.state.lookY, moveEvent: input.moveEvent, bindings: input.rows() }));
  provide('assets', () => ({ fraction: assets.fraction(), pending: assets.pending(), placeholders: [...assets.placeholders], errors: assets.progress.errors }));
  provide('perf', () => ({ gpuTimer: perf.gpuTimer }));
  provide('selftest', () => selftestResult);
  expose('pause', p => { setPaused(p !== false); return loop.paused; }, 'pause(true|false) -> pause or resume the simulation without pointer lock');
  expose('step', n => { loop.step(n || 1); return loop.tick; }, 'step(n) -> run n fixed 60 Hz ticks immediately');
  expose('setScale', s => { render.setScale(s); return render.scale; }, 'setScale(0.25..2) -> change the render scale');
  expose('setPreset', name => { render.setPreset(name); return render.presetName; }, 'setPreset(medium|high|ultra) -> switch the graphics preset at runtime');
  expose('perfReset', () => perf.reset(), 'perfReset() -> start a new frame-time measurement window');
  expose('perfSamples', () => perf.samples(), 'perfSamples() -> per-frame cpu/gpu/interval ms since perfReset');
  expose('perf', () => perf.summary(), 'perf() -> p50/p95/p99/histogram since perfReset');
  expose('selftest', () => runSelftest(ctx), 'selftest() -> run every registered check, resolves to the result');
  expose('loadModel', name => assets.model(name).then(m => ({ placeholder: m.placeholder, extensions: m.extensions })), 'loadModel(name) -> load /models/<name>.glb through the game loader');
}

async function start() {
  const viewName = boot.view;
  if (!VIEWS[viewName]) throw new Error(`unknown view "${viewName}", known views: ${Object.keys(VIEWS).join(', ')}`);
  loading.set(0.02, 'Starting engine');
  boot.seed = flags.seed ?? randomSeed();
  ctx.rng = createRng(boot.seed);
  ctx.loop = createLoop();
  ctx.render = createRenderer(document.getElementById('app'), flags.preset, flags.scale);
  ctx.gl = ctx.render.gl;
  ctx.perf = createPerf(ctx.gl);
  ctx.input = createInput(ctx.render.canvas);
  ctx.assets = createAssets(ctx.render.renderer, ctx.render.preset.anisotropy);
  ctx.render.onPreset(p => ctx.assets.setAnisotropy(p.anisotropy));
  exposeDebug();
  await refreshLayout();
  const module = await VIEWS[viewName]().catch(e => { e.where = `src/views/${viewName}.js or a module it imports`; throw e; });
  const viewReady = module.createView(ctx);
  let tracking = true;
  const track = () => {
    if (!tracking) return;
    loading.set(0.05 + 0.85 * ctx.assets.fraction(), ctx.assets.status() || 'Building scene');
    requestAnimationFrame(track);
  };
  track();
  ctx.view = await viewReady;
  tracking = false;
  ctx.post = createPost(ctx.render, ctx.view.scene, ctx.view.camera);
  if (ctx.view.attachPost) ctx.view.attachPost(ctx.post);
  loading.set(0.92, 'Compiling shaders');
  await ctx.render.renderer.compileAsync(ctx.view.scene, ctx.view.camera);
  ctx.post.render(0);
  ctx.render.verifyPrograms();
  ctx.loop.addTick('input', () => ctx.input.endTick(), 1000);
  ctx.loop.addFrame('render', (alpha, dt) => ctx.post.render(dt), 1000);
  ctx.loop.addFrame('render/verify', () => { if (ctx.loop.frame % 120 === 0) ctx.render.verifyPrograms(); }, 1001);
  wireSession();
  let last = 0;
  const frame = now => {
    requestAnimationFrame(frame);
    ctx.perf.begin();
    ctx.render.beginFrame();
    ctx.loop.advance((now - last) / 1000);
    last = now;
    ctx.perf.end();
  };
  requestAnimationFrame(now => { last = now; frame(now); });
  loading.set(1, 'Ready');
  loading.hide();
  boot.ready = true;
  if (flags.selftest) await runSelftest(ctx);
}

register('main', 'import map resolves every vendored library locally, no request leaves localhost', async () => {
  const three = await import('three');
  assert(three.REVISION === '186', `three revision ${three.REVISION}, VERSIONS.txt pins 0.186.1`);
  const bvh = await import('three-mesh-bvh');
  assert(typeof bvh.MeshBVH === 'function' && typeof bvh.acceleratedRaycast === 'function', 'three-mesh-bvh exports missing');
  const pp = await import('postprocessing');
  assert(typeof pp.EffectComposer === 'function', 'postprocessing exports missing');
  const ao = await import('n8ao');
  assert(typeof ao.N8AOPostPass === 'function', 'n8ao exports missing');
  await import('peerjs');
  assert(window.peerjs && typeof window.peerjs.Peer === 'function', 'peerjs did not define window.peerjs.Peer');
  assert(foreignRequests.length === 0, `requests to other hosts: ${foreignRequests.join(', ')}`);
});

register('main', 'engine wiring and debug API', ctx => {
  for (const key of ['rng', 'loop', 'render', 'gl', 'perf', 'input', 'assets', 'view', 'post']) assert(ctx[key], `ctx.${key} missing`);
  assert(ctx.view.scene && ctx.view.camera && typeof ctx.view.restoreGpu === 'function', 'view must provide scene, camera and restoreGpu');
  for (const cmd of ['state', 'help', 'pause', 'step', 'setScale', 'setPreset', 'perfReset', 'perfSamples', 'perf', 'selftest', 'loadModel']) assert(typeof window.__GO[cmd] === 'function', `__GO.${cmd} missing`);
  const s = window.__GO.state();
  assert(s.boot.ready === true && s.boot.error === null && s.loop.frame > 0, 'state() must report a running engine');
  assert(s.assets.placeholders.length === 0 && s.assets.errors === 0, `placeholders in use: ${s.assets.placeholders.join(', ')}, load errors ${s.assets.errors}`);
  assert(s.input.bindings.length === 19 && document.querySelectorAll('#pause dt').length === 19, 'the pause overlay must list every binding');
});

start().catch(e => {
  boot.error = e.message;
  report('boot', e, e.where);
  loading.fail(`Failed to start: ${e.message}`);
});
