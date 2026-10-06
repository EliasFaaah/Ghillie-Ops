import { WebGLRenderer, WebGLRenderTarget, DepthTexture, FloatType, SRGBColorSpace, NoToneMapping, PCFShadowMap, MathUtils, Scene, Mesh, PlaneGeometry, MeshBasicMaterial, PerspectiveCamera } from 'three';
import { register, assert, report } from '../core/selftest.js';

export const PRESETS = Object.freeze({
  medium: Object.freeze({ shadowMapSize: 2048, shadowCascades: 4, shadowFar: 350, shadowRadius: 0.5, aoQuality: 'Low', aoHalfRes: true, anisotropy: 4 }),
  high: Object.freeze({ shadowMapSize: 3072, shadowCascades: 4, shadowFar: 350, shadowRadius: 0.35, aoQuality: 'Medium', aoHalfRes: true, anisotropy: 8 }),
  ultra: Object.freeze({ shadowMapSize: 4096, shadowCascades: 4, shadowFar: 350, shadowRadius: 0.35, aoQuality: 'High', aoHalfRes: false, anisotropy: 16 })
});

export const NEAR = 0.1;
export const FAR = 12000;

export function verticalFov(horizontalFov16x9, aspect) {
  const tanH = Math.tan(MathUtils.degToRad(horizontalFov16x9) / 2);
  const tanV = tanH / (16 / 9);
  return MathUtils.radToDeg(2 * Math.atan(aspect < 16 / 9 ? tanH / aspect : tanV));
}

function brokenPrograms(gl, programs) {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  const broken = [];
  const pending = [];
  for (const p of programs) {
    if (parallel && !gl.getProgramParameter(p.program, parallel.COMPLETION_STATUS_KHR)) { pending.push(p); continue; }
    if (gl.getProgramParameter(p.program, gl.LINK_STATUS)) continue;
    const shaderLogs = gl.getAttachedShaders(p.program).map(sh => gl.getShaderInfoLog(sh)).join(' ');
    broken.push(`${p.name || 'unnamed'}: ${gl.getProgramInfoLog(p.program)} ${shaderLogs}`.trim());
  }
  return { broken, pending };
}

export function createRenderer(container, presetName, scale) {
  const renderer = new WebGLRenderer({ antialias: false, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance', reversedDepthBuffer: true });
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) throw new Error('WebGL2 is required');
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.debug.checkShaderErrors = false;
  renderer.info.autoReset = false;
  renderer.domElement.id = 'view';
  container.appendChild(renderer.domElement);

  const listeners = [];
  const presetListeners = [];
  const verified = new WeakSet();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  let applied = '';
  function apply() {
    r.width = Math.max(1, innerWidth);
    r.height = Math.max(1, innerHeight);
    applied = `${r.width}x${r.height}@${devicePixelRatio}*${r.scale}`;
    renderer.setPixelRatio(devicePixelRatio * r.scale);
    renderer.setSize(r.width, r.height);
    for (const fn of listeners) fn(r.width, r.height);
  }
  const r = {
    renderer,
    gl,
    canvas: renderer.domElement,
    presetName,
    preset: PRESETS[presetName],
    scale,
    width: 1,
    height: 1,
    gpu: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    onResize(fn) { listeners.push(fn); fn(r.width, r.height); },
    onPreset(fn) { presetListeners.push(fn); fn(r.preset); },
    setScale(s) { r.scale = MathUtils.clamp(s, 0.25, 2); apply(); },
    setPreset(name) {
      if (!PRESETS[name]) throw new Error(`unknown preset "${name}", known presets: ${Object.keys(PRESETS).join(', ')}`);
      r.presetName = name;
      r.preset = PRESETS[name];
      for (const fn of presetListeners) fn(r.preset);
    },
    beginFrame() {
      if (applied !== `${Math.max(1, innerWidth)}x${Math.max(1, innerHeight)}@${devicePixelRatio}*${r.scale}`) apply();
      renderer.info.reset();
    },
    verifyPrograms() {
      const fresh = renderer.info.programs.filter(p => !verified.has(p));
      const { broken, pending } = brokenPrograms(gl, fresh);
      for (const p of fresh) if (!pending.includes(p)) verified.add(p);
      for (const b of broken) report('render', new Error(`shader program failed to link: ${b}`));
      return broken.length;
    }
  };
  apply();
  return r;
}

register('render/renderer', 'WebGL2 context, color pipeline, shadows, render scale', ctx => {
  const r = ctx.render;
  assert(r.gl instanceof WebGL2RenderingContext, 'context is not WebGL2');
  assert(r.renderer.outputColorSpace === SRGBColorSpace, 'output must be sRGB');
  assert(r.renderer.toneMapping === NoToneMapping, 'renderer tone mapping must be off because post does it');
  assert(r.renderer.shadowMap.enabled, 'shadows must be enabled');
  const old = r.scale;
  r.setScale(0.5);
  const half = r.gl.drawingBufferWidth;
  r.setScale(old);
  const full = r.gl.drawingBufferWidth;
  assert(Math.abs(half * 2 - full) <= 2, `render scale 0.5 must halve the drawing buffer (${half} vs ${full})`);
  assert(full === Math.floor(r.width * devicePixelRatio * old), `drawing buffer ${full} does not match width*dpr*scale`);
});

register('render/renderer', 'Hor+ field of view', () => {
  assert(Math.abs(verticalFov(90, 16 / 9) - 58.72) < 0.05, `90 deg at 16:9 must be 58.72 deg vertical, got ${verticalFov(90, 16 / 9)}`);
  assert(Math.abs(verticalFov(90, 32 / 9) - verticalFov(90, 16 / 9)) < 1e-9, 'wider screens must keep the vertical fov (Hor+)');
  assert(verticalFov(90, 4 / 3) > verticalFov(90, 16 / 9), 'narrower screens must widen the vertical fov to keep 90 deg horizontal');
});

register('render/renderer', 'presets are complete and setPreset notifies listeners', ctx => {
  const keys = Object.keys(PRESETS.high).sort().join();
  for (const [name, p] of Object.entries(PRESETS)) assert(Object.keys(p).sort().join() === keys, `preset ${name} has fields ${Object.keys(p).sort().join()}, expected ${keys}`);
  const r = ctx.render;
  const before = r.presetName;
  try {
    r.setPreset('medium');
    assert(r.preset === PRESETS.medium && r.presetName === 'medium', 'setPreset must switch the preset');
    let threw = false;
    try { r.setPreset('extreme'); } catch { threw = true; }
    assert(threw && r.preset === PRESETS.medium, 'an unknown preset must be rejected without changing the preset');
  } finally {
    r.setPreset(before);
  }
});

register('render/renderer', 'reversed float depth separates quads 0.3 m apart at 2 km', ctx => {
  const { renderer } = ctx.render;
  const view = ctx.view.camera;
  assert(renderer.capabilities.reversedDepthBuffer === true, 'the renderer must run with a reversed depth buffer (EXT_clip_control)');
  assert(view.near <= NEAR && view.far >= 10000, `view camera near ${view.near} far ${view.far}, expected far >= 10 km`);
  const size = 64;
  const target = new WebGLRenderTarget(size, size, { depthTexture: new DepthTexture(size, size, FloatType) });
  const scene = new Scene();
  const plane = new PlaneGeometry(1000, 1000);
  const back = new Mesh(plane, new MeshBasicMaterial({ color: 0xff0000 }));
  const front = new Mesh(plane, new MeshBasicMaterial({ color: 0x00ff00 }));
  back.position.z = -2000;
  front.position.z = -1999.7;
  front.rotation.x = back.rotation.x = 0.35;
  scene.add(back, front);
  const cam = new PerspectiveCamera(4, 1, view.near, view.far);
  const px = new Uint8Array(size * size * 4);
  let worst = 0;
  try {
    for (let i = 0; i < 12; i++) {
      cam.position.set(Math.sin(i * 1.7) * 0.37, 1.7 + Math.cos(i * 2.3) * 0.21, Math.sin(i * 0.9) * 0.53);
      cam.updateMatrixWorld();
      renderer.setRenderTarget(target);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, px);
      let red = 0;
      for (let p = 0; p < px.length; p += 4) if (px[p] > 128) red++;
      worst = Math.max(worst, red);
    }
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    plane.dispose();
    back.material.dispose();
    front.material.dispose();
  }
  assert(worst === 0, `the far quad showed through the near quad on ${worst} of ${size * size} pixels (z-fighting)`);
});

register('render/renderer', 'shader link verification replaces three shader logging', async ctx => {
  const gl = ctx.gl;
  assert(ctx.render.renderer.debug.checkShaderErrors === false, 'three shader logging must be off, verifyPrograms reports failures');
  const make = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const vs = make(gl.VERTEX_SHADER, `#version 300 es
void main() { gl_Position = vec4(0.0); }`);
  const fs = make(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
out vec4 c;
void main() { c = missingSymbol; }`);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  let res = brokenPrograms(gl, [{ name: 'selftest-probe', program }]);
  for (let i = 0; i < 60 && res.pending.length; i++) {
    await new Promise(r => requestAnimationFrame(r));
    res = brokenPrograms(gl, [{ name: 'selftest-probe', program }]);
  }
  gl.deleteProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  assert(res.broken.length === 1 && res.broken[0].startsWith('selftest-probe'), 'a program that fails to link must be detected');
  assert(brokenPrograms(gl, ctx.render.renderer.info.programs).broken.length === 0, 'engine shader programs failed to link');
});
