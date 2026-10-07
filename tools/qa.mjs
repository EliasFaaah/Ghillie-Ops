import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { summarize, histogramText } from '../src/core/stats.js';

const ROOT = resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:8790';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const GPU_FLAGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
const GPU_COST_FLAGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const FULL_CLOCK = 0.85;
const FULL_SHARE = 0.95;
const DRAIN_SECONDS = 4;
const MIN_GPU_COVERAGE = 0.9;
const DEFAULT_STEPS = [
  { until: 'window.__GO && __GO.state().boot.ready', timeout: 90 },
  { wait: 2 },
  { shot: 'view.png' },
  { stats: 'idle', seconds: 5 }
];
const KEYS = { Space: [' ', 32], ShiftLeft: ['Shift', 16], ControlLeft: ['Control', 17], Escape: ['Escape', 27], Tab: ['Tab', 9], Enter: ['Enter', 13] };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { 'User-Agent': 'GhillieOpsQA/1.0 (local game QA tool)' };

async function fetchRefs(step, out) {
  const count = step.count || 6, prefix = step.prefix || 'ref_', got = [];
  let items = [];
  if (step.commons) {
    const q = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '50', gsrsearch: step.commons, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1920' });
    const j = await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: UA })).json();
    items = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index)
      .map(p => ({ p, i: p.imageinfo && p.imageinfo[0] }))
      .filter(({ i }) => i && i.mime === 'image/jpeg' && i.width >= 1600 && i.width > i.height * 1.2)
      .map(({ p, i }) => ({ url: i.thumburl || i.url, source: i.descriptionurl, title: p.title, license: i.extmetadata && i.extmetadata.LicenseShortName ? i.extmetadata.LicenseShortName.value : null }));
  } else {
    const j = await (await fetch(`https://store.steampowered.com/api/appdetails?appids=${step.steam}`, { headers: UA })).json();
    const d = j[step.steam] && j[step.steam].data;
    items = ((d && d.screenshots) || []).map(s => ({ url: s.path_full, source: `https://store.steampowered.com/app/${step.steam}`, title: `${d.name} screenshot ${s.id}`, license: 'store screenshot' }));
  }
  for (const it of items) {
    if (got.length >= count) break;
    const r = await fetch(it.url, { headers: UA }).catch(() => null);
    if (!r || !r.ok) continue;
    const file = `${prefix}${got.length + 1}.jpg`;
    writeFileSync(join(out, file), Buffer.from(await r.arrayBuffer()));
    got.push({ file, ...it });
  }
  return got;
}

function parseArgs(argv) {
  const a = { url: '/?autostart=1', out: null, size: '3840x1080', steps: null, timeout: 300, serve: true, flags: [], gpuCost: false, allowHosts: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--url') a.url = v, i++;
    else if (k === '--out') a.out = v, i++;
    else if (k === '--size') a.size = v, i++;
    else if (k === '--steps') a.steps = v, i++;
    else if (k === '--timeout') a.timeout = Number(v), i++;
    else if (k === '--flag') a.flags.push(v), i++;
    else if (k === '--allow-host') a.allowHosts.push(v), i++;
    else if (k === '--gpu-cost') a.gpuCost = true;
    else if (k === '--no-serve') a.serve = false;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.out) throw new Error('--out <folder> is required');
  const [w, h] = a.size.split('x').map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`bad --size ${a.size}`);
  a.width = w; a.height = h;
  a.url = /^[a-z]+:/i.test(a.url) ? a.url : BASE + (a.url.startsWith('/') ? '' : '/') + a.url;
  a.steps = !a.steps ? DEFAULT_STEPS : JSON.parse(a.steps.trim().startsWith('[') ? a.steps : readFileSync(a.steps, 'utf8'));
  return a;
}

async function probeServer() {
  try { return (await (await fetch(BASE + '/__ghillieops', { signal: AbortSignal.timeout(1500) })).json()).app === 'ghillie-ops'; } catch { return false; }
}

async function ensureServer() {
  if (await probeServer()) return null;
  const child = spawn(process.execPath, [join(ROOT, 'server.js')], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 50; i++) { if (await probeServer()) return child; await sleep(200); }
  child.kill();
  throw new Error('server.js did not start');
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { ok, fail } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? fail(new Error(`${m.error.message} ${m.error.data || ''}`)) : ok(m.result);
      } else if (m.method) for (const fn of this.listeners.get(m.method) || []) fn(m.params, m.sessionId || 'page');
    };
  }
  open() { return new Promise((ok, fail) => { this.ws.onopen = ok; this.ws.onerror = () => fail(new Error('CDP websocket failed')); }); }
  send(method, params = {}, sessionId = null) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, fail) => this.pending.set(id, { ok, fail }));
  }
  on(method, fn) { this.listeners.set(method, [...(this.listeners.get(method) || []), fn]); }
}

async function launchChrome(args, profile) {
  const flags = [
    '--headless=new', ...GPU_FLAGS, ...(args.gpuCost ? GPU_COST_FLAGS : []), ...args.flags,
    `--window-size=${args.width},${args.height}`, `--user-data-dir=${profile}`, '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio',
    '--disable-background-networking', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', 'about:blank'
  ];
  const proc = spawn(CHROME, flags, { stdio: 'ignore', windowsHide: true });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error('Chrome did not open a DevTools port');
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json().catch(() => []);
    page = list.find(t => t.type === 'page');
    if (!page) await sleep(100);
  }
  if (!page) throw new Error('no page target');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { proc, page, version: version.Browser, flags };
}

function killTree(proc) {
  if (proc.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  else proc.kill('SIGKILL');
}

function gpuMaxClocks() {
  const r = spawnSync('nvidia-smi', ['--query-gpu=clocks.max.gr,clocks.max.mem', '--format=csv,noheader,nounits'], { encoding: 'utf8', windowsHide: true });
  const [gr, mem] = r.status === 0 ? r.stdout.trim().split(',').map(Number) : [];
  return gr > 0 && mem > 0 ? { gr, mem } : null;
}

function sampleGpuState(max) {
  const lines = [];
  let proc = null;
  if (max) {
    proc = spawn('nvidia-smi', ['--query-gpu=pstate,clocks.gr,clocks.mem,utilization.gpu', '--format=csv,noheader,nounits', '-lms', '100'], { windowsHide: true });
    let buf = '';
    proc.stdout.on('data', d => { buf += d; const parts = buf.split('\n'); buf = parts.pop(); lines.push(...parts.filter(Boolean)); });
    proc.on('error', () => { proc = null; });
  }
  return () => {
    if (proc) killTree(proc);
    const samples = lines.map(l => l.split(',').map(v => v.trim())).filter(p => p.length === 4).map(([pstate, gr, mem, util]) => ({ pstate, gr: Number(gr), mem: Number(mem), util: Number(util) }));
    if (!samples.length) return { available: false, samples: 0, fullClockShare: 0 };
    const full = samples.filter(x => x.pstate === 'P0' || (x.gr >= FULL_CLOCK * max.gr && x.mem >= FULL_CLOCK * max.mem)).length / samples.length;
    const pstates = {};
    for (const x of samples) pstates[x.pstate] = (pstates[x.pstate] || 0) + 1;
    const gr = samples.map(x => x.gr), mem = samples.map(x => x.mem);
    return { available: true, samples: samples.length, fullClockShare: Math.round(full * 1000) / 1000, pstates, graphicsMHz: { min: Math.min(...gr), p50: summarize(gr).p50, max: Math.max(...gr) }, memoryMHz: { min: Math.min(...mem), max: Math.max(...mem) }, maxMHz: max, utilization: { mean: summarize(samples.map(x => x.util)).mean } };
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  const report = { url: args.url, size: `${args.width}x${args.height}`, started: new Date().toISOString(), chrome: null, flags: null, gpuCost: args.gpuCost, allowedHosts: [...LOCAL_HOSTS, ...args.allowHosts], gpu: null, viewport: null, console: [], pageErrors: [], failedRequests: [], foreignRequests: [], workers: [], steps: [], results: {}, stats: {}, shots: [], problems: [] };
  const server = args.serve ? await ensureServer() : null;
  const profile = mkdtempSync(join(tmpdir(), 'ghillieops-qa-'));
  let chrome;
  const deadline = setTimeout(() => { report.problems.push(`global timeout ${args.timeout}s`); finish(); }, args.timeout * 1000);
  let finished = false;
  const bad = c => c.level === 'error' || c.level === 'warning' || c.level === 'assert';
  async function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    if (chrome) killTree(chrome.proc);
    if (server) killTree(server);
    for (let i = 0; i < 20; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(250); } }
    const ok = !report.problems.length && !report.pageErrors.length && !report.failedRequests.length && !report.foreignRequests.length && !report.console.some(bad);
    report.ok = ok;
    report.finished = new Date().toISOString();
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
    const lines = [`qa: ${ok ? 'OK' : 'PROBLEMS'} ${args.url}${args.gpuCost ? ' (gpu-cost mode)' : ''}`, `gpu: ${report.gpu ? `${report.gpu.renderer} | timer query: ${report.gpu.timerQuery}` : 'unknown'}`];
    for (const c of report.console.filter(bad)) lines.push(`console ${c.level}: ${c.text} ${c.where || ''}`);
    for (const e of report.pageErrors) lines.push(`page error: ${e}`);
    for (const f of report.failedRequests) lines.push(`failed request: ${f.status || f.error} ${f.url}`);
    for (const f of report.foreignRequests) lines.push(`foreign request: ${f}`);
    for (const p of report.problems) lines.push(`problem: ${p}`);
    for (const [k, s] of Object.entries(report.stats)) {
      const g = s.gpuState;
      lines.push(`${k}: frames ${s.frames}, main thread ${s.mainThreadMsPerFrame} ms/frame, gpu coverage ${s.gpuCoverage}, gpu ${s.gpuValid ? 'VALID' : 'INVALID'} (${g.available ? `full clock ${Math.round(g.fullClockShare * 100)}%, ${JSON.stringify(g.pstates)}, graphics ${g.graphicsMHz.min}-${g.graphicsMHz.max} MHz, memory ${g.memoryMHz.min}-${g.memoryMHz.max} MHz, util ${g.utilization.mean}%` : 'nvidia-smi unavailable'})`);
      lines.push(histogramText(s.cpu, `${k} cpu`), histogramText(s.gpu, `${k} gpu`));
    }
    console.log(lines.join('\n'));
    process.exit(ok ? 0 : 1);
  }

  try {
    chrome = await launchChrome(args, profile);
    report.chrome = chrome.version;
    report.flags = chrome.flags.filter(f => !f.startsWith('--user-data-dir'));
    const cdp = new Cdp(chrome.page.webSocketDebuggerUrl);
    await cdp.open();
    const requests = new Map();
    const allowed = new Set(report.allowedHosts);
    const checkHost = url => {
      if (!/^(https?|wss?):/i.test(url)) return;
      const host = new URL(url).host.replace(/:\d+$/, '');
      if (!allowed.has(host)) report.foreignRequests.push(url);
    };
    const where = st => st && st.callFrames && st.callFrames[0] ? `${st.callFrames[0].url.replace(/^https?:\/\/[^/]+/, '')}:${st.callFrames[0].lineNumber + 1}` : '';
    cdp.on('Runtime.consoleAPICalled', p => report.console.push({ level: p.type === 'warning' ? 'warning' : p.type, text: p.args.map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(' '), where: where(p.stackTrace) }));
    cdp.on('Runtime.exceptionThrown', p => report.pageErrors.push(`${p.exceptionDetails.exception ? p.exceptionDetails.exception.description : p.exceptionDetails.text} ${p.exceptionDetails.url || ''}:${p.exceptionDetails.lineNumber + 1}`));
    cdp.on('Log.entryAdded', p => { if (p.entry.level !== 'verbose') report.console.push({ level: p.entry.level, text: `[${p.entry.source}] ${p.entry.text}`, where: p.entry.url || '' }); });
    cdp.on('Network.requestWillBeSent', (p, s) => { requests.set(`${s}:${p.requestId}`, p.request.url); checkHost(p.request.url); });
    cdp.on('Network.webSocketCreated', p => checkHost(p.url));
    cdp.on('Network.responseReceived', p => { if (p.response.status >= 400) report.failedRequests.push({ url: p.response.url, status: p.response.status }); });
    cdp.on('Network.loadingFailed', (p, s) => { if (!p.canceled) report.failedRequests.push({ url: requests.get(`${s}:${p.requestId}`), error: p.errorText }); });
    cdp.on('Target.attachedToTarget', async p => {
      report.workers.push({ type: p.targetInfo.type, url: p.targetInfo.url });
      await cdp.send('Network.enable', {}, p.sessionId).catch(() => {});
      await cdp.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId).catch(() => {});
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: args.width, height: args.height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });

    const evaluate = async expression => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
      return r.result.value;
    };
    const taskSeconds = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value;
    report.gpu = await evaluate(`(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return { renderer: 'no webgl2', vendor: '', timerQuery: false, hardware: false };
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const vendor = d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      const timerQuery = !!gl.getExtension('EXT_disjoint_timer_query_webgl2');
      gl.getExtension('WEBGL_lose_context').loseContext();
      return { renderer, vendor, timerQuery, hardware: !/swiftshader|llvmpipe|basic render|software|microsoft/i.test(renderer) && /angle/i.test(renderer) };
    })()`);
    if (!report.gpu.hardware) report.problems.push(`not running on the hardware GPU: ${report.gpu.renderer}`);
    if (!report.gpu.timerQuery) report.problems.push('EXT_disjoint_timer_query_webgl2 unavailable');

    const navigate = async url => {
      const loaded = new Promise(r => cdp.on('Page.loadEventFired', r));
      await cdp.send('Page.navigate', { url: /^[a-z]+:/i.test(url) ? url : BASE + url });
      await Promise.race([loaded, sleep(30000)]);
    };
    await navigate(args.url);
    report.viewport = await evaluate('({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
    if (report.viewport.w !== args.width || report.viewport.h !== args.height) report.problems.push(`viewport ${report.viewport.w}x${report.viewport.h} differs from ${report.size}`);

    const maxClocks = gpuMaxClocks();
    report.gpu.maxClocksMHz = maxClocks;
    const mouse = { x: Math.round(args.width / 2), y: Math.round(args.height / 2) };
    for (const [i, step] of args.steps.entries()) {
      const t0 = Date.now();
      const rec = { i, step };
      let bootFailed = false;
      try {
        if (step.wait !== undefined) await sleep(step.wait * 1000);
        else if (step.goto) { await navigate(step.goto); }
        else if (step.viewport) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: step.viewport[0], height: step.viewport[1], deviceScaleFactor: step.viewport[2] || 1, mobile: false });
          await sleep(300);
        }
        else if (step.until) {
          const end = Date.now() + (step.timeout || 30) * 1000;
          let v = false;
          while (Date.now() < end) {
            v = await evaluate(`(() => { try { const b = window.__GO && __GO.state().boot; if (b && b.error) return { bootError: b.error }; return !!(${step.until}); } catch { return false; } })()`);
            if (v && v.bootError) { bootFailed = true; throw new Error(`boot failed: ${v.bootError}`); }
            if (v) break;
            await sleep(250);
          }
          if (!v) throw new Error(`timeout waiting for ${step.until}`);
        } else if (step.eval) {
          const v = await evaluate(step.eval);
          if (step.as) report.results[step.as] = v;
          rec.value = v;
        } else if (step.shot) {
          const r = await cdp.send('Page.captureScreenshot', /\.jpe?g$/i.test(step.shot) ? { format: 'jpeg', quality: 90 } : { format: 'png' });
          writeFileSync(join(out, step.shot), Buffer.from(r.data, 'base64'));
          report.shots.push(join(out, step.shot));
        } else if (step.stats) {
          const seconds = step.seconds || 5;
          const stopGpuState = sampleGpuState(maxClocks);
          await evaluate('__GO.perfReset()');
          const task0 = await taskSeconds();
          await sleep(seconds * 1000);
          const frames = await evaluate('__GO.perfSamples().cpu.length');
          const task1 = await taskSeconds();
          const gpuState = stopGpuState();
          let s, coverage = 0;
          for (let t = 0; t <= DRAIN_SECONDS * 4; t++) {
            const all = await evaluate('__GO.perfSamples()');
            s = { cpu: all.cpu.slice(0, frames), gpu: all.gpu.slice(0, frames), dt: all.dt.slice(0, frames) };
            coverage = frames ? Math.round(s.gpu.filter(x => x !== null).length / frames * 1000) / 1000 : 0;
            if (coverage >= 0.99 || !report.gpu.timerQuery) break;
            await sleep(250);
          }
          const gpuValid = gpuState.available && gpuState.fullClockShare >= FULL_SHARE;
          report.stats[step.stats] = { seconds, frames, cpu: summarize(s.cpu), gpu: summarize(s.gpu.filter(x => x !== null)), interval: summarize(s.dt), mainThreadMsPerFrame: frames ? Math.round((task1 - task0) * 1e6 / frames) / 1000 : null, gpuCoverage: coverage, gpuValid, gpuState };
          if (report.gpu.timerQuery && coverage < MIN_GPU_COVERAGE) report.problems.push(`stats ${step.stats}: GPU timer covered ${Math.round(coverage * 100)}% of frames, expected at least ${MIN_GPU_COVERAGE * 100}%`);
        } else if (step.commons || step.steam) {
          const got = await fetchRefs(step, out);
          (report.results.refs ||= []).push(...got);
          rec.value = got.length;
          if (!got.length) throw new Error(`no reference images for ${step.commons || step.steam}`);
        } else if (step.key) {
          const [key, code] = KEYS[step.key] || (/^Key[A-Z]$/.test(step.key) ? [step.key[3].toLowerCase(), step.key.charCodeAt(3)] : /^Digit\d$/.test(step.key) ? [step.key[5], step.key.charCodeAt(5)] : [step.key, 0]);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: step.key, key, windowsVirtualKeyCode: code });
          await sleep((step.hold || 0.05) * 1000);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: step.key, key, windowsVirtualKeyCode: code });
        } else if (step.click) {
          [mouse.x, mouse.y] = step.click;
          const button = step.button || 'left';
          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button, clickCount: 1 });
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button, clickCount: 1 });
        } else if (step.move) {
          const n = step.steps || 10;
          for (let k = 0; k < n; k++) {
            mouse.x += step.move[0] / n; mouse.y += step.move[1] / n;
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y });
            await sleep(16);
          }
        } else throw new Error('unknown step');
      } catch (e) {
        rec.error = e.message;
        report.problems.push(`step ${i} ${JSON.stringify(step)}: ${e.message}`);
      }
      rec.ms = Date.now() - t0;
      report.steps.push(rec);
      if (bootFailed) break;
    }
    await sleep(300);
    await cdp.send('Browser.close').catch(() => {});
    await sleep(500);
  } catch (e) {
    report.problems.push(e.message);
  }
  await finish();
}

main().catch(e => { console.error(e.message); process.exit(2); });
