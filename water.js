import { Mesh, BufferGeometry, BufferAttribute, ShaderMaterial, UniformsLib, UniformsUtils, Color, Vector2, Vector3, Matrix4, Plane, PerspectiveCamera, WebGLRenderTarget, HalfFloatType, LinearFilter, Frustum, Sphere, CustomBlending, OneFactor, ZeroFactor, AddEquation } from 'three';
import { MAP } from './layout.js';
import { terrainGlsl } from './terrain.js';
import { register, assert } from '../core/selftest.js';

const MARGIN = 5;
const GRID = 4;
const GRID_N = MAP.size / GRID;
const LIMIT = MAP.half + 60;
export const REFLECTION_LAYER = 1;
const REFLECTION_SCALE = 0.4;
const REFLECTION_RANGE = 320;
const SKY_BLEND = { blending: CustomBlending, blendSrc: OneFactor, blendDst: ZeroFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: ZeroFactor, blendEquation: AddEquation, blendEquationAlpha: AddEquation };
const SKY_KEYS = Object.keys(SKY_BLEND);

const VERTEX = `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aFlow;
attribute float aBank;
varying vec3 vWW;
varying vec4 vFlow;
varying float vBank;
void main() {
  vWW = (modelMatrix * vec4(position, 1.0)).xyz;
  vFlow = aFlow;
  vBank = aBank;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
${terrainGlsl}
uniform float uTime;
uniform sampler2D uBed;
uniform sampler2D uReflect;
uniform mat4 uReflectMatrix;
uniform float uPlaneY;
uniform vec3 uSunDir;
uniform vec3 uLight;
uniform vec3 uSunRadiance;
uniform vec3 uDeep;
uniform float uReflectOn;
uniform float uSkyIn;
varying vec3 vWW;
varying vec4 vFlow;
varying float vBank;

float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 wGrad(vec2 p) {
  float e = 0.3;
  float c = wNoise(p);
  return vec2(wNoise(p + vec2(e, 0.0)) - c, wNoise(p + vec2(0.0, e)) - c) / e;
}

void main() {
  float depth = vWW.y - terrainHeightAt(vWW.xz);
  float wet = depth + (wNoise(vWW.xz * 0.45) * 0.65 + wNoise(vWW.xz * 1.7 + 5.3) * 0.35 - 0.5) * 0.22;
  if (wet < -0.03) discard;
  vec3 toCam = cameraPosition - vWW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 fl = vFlow.xy;
  vec2 ax = vec2(-fl.y, fl.x);
  vec2 q = vec2(vFlow.z - uTime * 0.9, vFlow.w);
  float near = 1.0 - smoothstep(15.0, 80.0, dist);
  float mid = 1.0 - smoothstep(60.0, 300.0, dist);
  vec2 g = wGrad(q * vec2(0.32, 0.55)) * 0.45 * mid
    + wGrad(vec2(q.x - uTime * 0.5, q.y) * vec2(1.1, 1.5) + 7.0) * 0.32 * mid
    + wGrad(vec2(q.x - uTime * 1.2, q.y) * vec2(3.1, 3.7) + 3.0) * 0.22 * near;
  float calm = smoothstep(0.0, 0.5, depth);
  vec2 tilt = (fl * g.x + ax * g.y) * 0.15 * (0.5 + 0.5 * calm);
  vec3 N = normalize(vec3(-tilt.x, 1.0, -tilt.y));
  vec3 R = refract(-V, N, 0.75);
  float column = max(depth, 0.02);
  vec2 bedXZ = vWW.xz + R.xz / max(-R.y, 0.25) * min(column, 2.5);
  float bedDepth = max(vWW.y - terrainHeightAt(bedXZ), 0.04);
  vec3 bedAlb = texture2D(uBed, bedXZ / 1.8).rgb * 0.55;
  float murk = 0.8 + 0.4 * wNoise(vWW.xz * 0.015 + 3.7);
  vec3 absorb = exp(-vec3(1.05, 0.72, 0.95) * bedDepth * 1.2 * murk);
  vec3 body = (bedAlb * absorb + uDeep * murk * (1.0 - absorb)) * uLight;
  float cosV = max(dot(N, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
  vec3 Rr = reflect(-V, N);
  Rr.y = max(Rr.y, 0.002);
  float rl = max(length(Rr.xz), 0.001);
  vec2 rh = Rr.xz / rl;
  float cr = dot(rh, ax);
  float dB = clamp((vBank - vFlow.w * sign(cr)) /max(abs(cr), 0.08), 0.0, 240.0) + 4.0;
  vec2 hp = vWW.xz + rh * dB;
  float crown = 3.5 + 11.0 * wNoise(hp * 0.05) + 4.0 * wNoise(hp * 0.23 + 1.3);
  float tree = (1.0 - smoothstep(crown - 1.2, crown + 1.2, Rr.y / rl * dB)) * (1.0 - smoothstep(0.25, 0.45, Rr.y));
  vec3 treeCol = vec3(0.05, 0.075, 0.032) * (0.55 + 0.6 * wNoise(hp * 0.4)) * uLight * 0.32;
  vec3 skyEnv = mix(fogColor, fogColor * vec3(0.62, 0.8, 1.1), smoothstep(0.0, 0.6, Rr.y));
  vec3 envRefl = mix(skyEnv, treeCol, tree);
  vec4 rc = uReflectMatrix * vec4(vWW + vec3(N.x, 0.0, N.z) * 6.0, 1.0);
  vec4 rt = texture2D(uReflect, rc.xy / rc.w);
  vec3 skyPart = mix(skyEnv, rt.rgb, uSkyIn);
  vec3 sceneRefl = mix(mix(skyPart, treeCol, tree), rt.rgb, rt.a);
  float planeOk = (1.0 - smoothstep(0.6, 3.5, abs(vWW.y - uPlaneY))) * uReflectOn;
  vec3 refl = mix(envRefl, sceneRefl, planeOk);
  vec3 H = normalize(V + uSunDir);
  float rough = mix(0.07, 0.24, smoothstep(30.0, 400.0, dist));
  float a2 = rough * rough * rough * rough;
  float nh = max(dot(N, H), 0.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float fs = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  vec3 spec = uSunRadiance * min(a2 / (3.14159 * dd * dd) * fs * 0.25, 14.0) * max(uSunDir.y, 0.0);
  vec3 col = mix(body, refl, clamp(fresnel * 1.1, 0.0, 1.0)) + spec;
  gl_FragColor = vec4(col, smoothstep(-0.03, 0.14, wet));
  #include <fog_fragment>
}
`;

export async function createWater(ctx, terrain, river, lighting) {
  const { renderer } = ctx.render;
  const samples = [];
  for (let i = 0; i + 1 < river.length; i++) {
    const a = river[i], b = river[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
    for (let k = 0; k < n; k++) samples.push(a.map((v, c) => v + (b[c] - v) * k / n));
  }
  samples.push(river[river.length - 1]);
  const kept = samples.filter(s => Math.abs(s[0]) < LIMIT && Math.abs(s[1]) < LIMIT);
  const pos = new Float32Array(kept.length * 6), flow = new Float32Array(kept.length * 8), bank = new Float32Array(kept.length * 2), idx = [];
  let along = 0;
  kept.forEach((s, i) => {
    const prev = kept[Math.max(i - 1, 0)], next = kept[Math.min(i + 1, kept.length - 1)];
    const tx = next[0] - prev[0], tz = next[1] - prev[1], len = Math.hypot(tx, tz) || 1;
    if (i > 0) along += Math.hypot(s[0] - prev[0], s[1] - prev[1]);
    const nx = -tz / len, nz = tx / len, half = s[2] / 2 + MARGIN;
    pos.set([s[0] + nx * half, s[3], s[1] + nz * half, s[0] - nx * half, s[3], s[1] - nz * half], i * 6);
    flow.set([tx / len, tz / len, along, half, tx / len, tz / len, along, -half], i * 8);
    bank.set([s[2] / 2, s[2] / 2], i * 2);
    if (i + 1 < kept.length) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2, i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aFlow', new BufferAttribute(flow, 4));
  geometry.setAttribute('aBank', new BufferAttribute(bank, 1));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();

  const target = new WebGLRenderTarget(2, 2, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
  const uniforms = Object.assign(UniformsUtils.clone(UniformsLib.fog), {
    uTime: { value: 0 }, uBed: terrain.uniforms.tA4, uHeightTex: terrain.uniforms.uHeightTex, uReflect: { value: target.texture },
    uReflectMatrix: { value: new Matrix4() }, uPlaneY: { value: 0 }, uSunDir: { value: new Vector3(0, 1, 0) }, uLight: { value: new Vector3(1, 1, 1) },
    uSunRadiance: { value: new Vector3(1, 1, 1) }, uDeep: { value: new Color(0.022, 0.03, 0.016) },
    uReflectOn: { value: 0 }, uSkyIn: { value: 0 }
  });
  const material = new ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, fog: true });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'river';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  const reflectCam = new PerspectiveCamera();
  const clip = new Plane(new Vector3(0, 1, 0), 0);
  const normal = new Vector3(0, 1, 0);
  const _p = new Vector3(), _v = new Vector3(), _r = new Matrix4(), _size = new Vector2(), _look = new Vector3(), _aim = new Vector3();
  let planeY = kept[0][3];
  const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  function nearestLevel(x, z) {
    let best = 1e18, level = planeY;
    for (let i = 0; i < kept.length; i += 2) {
      const d = (kept[i][0] - x) ** 2 + (kept[i][1] - z) ** 2;
      if (d < best) { best = d; level = kept[i][3]; }
    }
    return [Math.sqrt(best), level];
  }

  let reflecting = false;
  let reflect = false;
  mesh.onBeforeRender = (rend, scene, camera) => {
    if (reflecting || !reflect) return;
    const [, level] = nearestLevel(camera.position.x, camera.position.z);
    planeY = level;
    uniforms.uPlaneY.value = planeY;
    rend.getDrawingBufferSize(_size);
    const w = Math.max(2, Math.floor(_size.x * REFLECTION_SCALE)), h = Math.max(2, Math.floor(_size.y * REFLECTION_SCALE));
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    _p.set(0, planeY, 0);
    _v.setFromMatrixPosition(camera.matrixWorld);
    _v.sub(_p).reflect(normal).negate().add(_p);
    _r.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_r).add(_aim.setFromMatrixPosition(camera.matrixWorld));
    const targetPoint = _aim.copy(_p).sub(_look).reflect(normal).negate().add(_p);
    reflectCam.position.copy(_v);
    reflectCam.up.set(0, 1, 0).applyMatrix4(_r).reflect(normal);
    reflectCam.lookAt(targetPoint);
    reflectCam.near = camera.near;
    reflectCam.far = camera.far;
    reflectCam.fov = camera.fov;
    reflectCam.aspect = camera.aspect;
    reflectCam.updateProjectionMatrix();
    reflectCam.updateMatrixWorld();
    reflectCam.matrixWorldInverse.copy(reflectCam.matrixWorld).invert();
    reflectCam.layers.set(REFLECTION_LAYER);
    uniforms.uReflectMatrix.value.copy(BIAS).multiply(reflectCam.projectionMatrix).multiply(reflectCam.matrixWorldInverse);
    clip.constant = -planeY + 0.05;
    const prevTarget = rend.getRenderTarget(), prevShadow = rend.shadowMap.autoUpdate, prevClip = rend.clippingPlanes, prevAlpha = rend.getClearAlpha();
    const sky = lighting.sky && lighting.sky.material;
    const skyBlend = sky ? SKY_KEYS.map(k => sky[k]) : null;
    if (sky) Object.assign(sky, SKY_BLEND);
    uniforms.uSkyIn.value = sky ? 1 : 0;
    reflecting = true;
    mesh.visible = false;
    rend.shadowMap.autoUpdate = false;
    rend.clippingPlanes = [clip];
    rend.setRenderTarget(target);
    rend.setClearAlpha(0);
    rend.clear();
    rend.render(scene, reflectCam);
    rend.setClearAlpha(prevAlpha);
    if (sky) SKY_KEYS.forEach((k, i) => { sky[k] = skyBlend[i]; });
    rend.clippingPlanes = prevClip;
    rend.shadowMap.autoUpdate = prevShadow;
    rend.setRenderTarget(prevTarget);
    mesh.visible = true;
    reflecting = false;
  };

  const level = new Float32Array(GRID_N * GRID_N).fill(-1e9);
  for (const s of samples) {
    const r = s[2] / 2 + MARGIN + GRID;
    const ci = Math.floor((s[0] + MAP.half) / GRID), cj = Math.floor((s[1] + MAP.half) / GRID), rc = Math.ceil(r / GRID);
    for (let j = Math.max(0, cj - rc); j <= Math.min(GRID_N - 1, cj + rc); j++) {
      for (let i = Math.max(0, ci - rc); i <= Math.min(GRID_N - 1, ci + rc); i++) {
        const x = -MAP.half + (i + 0.5) * GRID, z = -MAP.half + (j + 0.5) * GRID;
        if (Math.hypot(x - s[0], z - s[1]) <= r) level[j * GRID_N + i] = s[3];
      }
    }
  }
  const levelAt = (x, z) => {
    const i = Math.floor((x + MAP.half) / GRID), j = Math.floor((z + MAP.half) / GRID);
    return i < 0 || j < 0 || i >= GRID_N || j >= GRID_N ? -1e9 : level[j * GRID_N + i];
  };
  const depthAt = (x, z) => Math.max(0, levelAt(x, z) - terrain.heightAt(x, z));

  const probes = kept.filter((_, i) => i % 4 === 0);
  const frustum = new Frustum(), viewProj = new Matrix4(), inverse = new Matrix4(), probe = new Sphere(new Vector3(), 40);
  const sunTint = new Color();
  return {
    mesh, uniforms, levelAt, depthAt, target, layer: REFLECTION_LAYER,
    update(simTime, camera) {
      uniforms.uTime.value = simTime;
      viewProj.multiplyMatrices(camera.projectionMatrix, inverse.copy(camera.matrixWorld).invert());
      frustum.setFromProjectionMatrix(viewProj, camera.coordinateSystem, camera.reversedDepth);
      let any = false;
      reflect = false;
      for (const p of probes) {
        probe.center.set(p[0], p[3], p[1]);
        if (!frustum.intersectsSphere(probe)) continue;
        any = true;
        if ((p[0] - camera.position.x) ** 2 + (p[1] - camera.position.z) ** 2 < REFLECTION_RANGE ** 2) reflect = true;
      }
      mesh.visible = any;
      uniforms.uReflectOn.value = reflect ? 1 : 0;
      const sun = lighting.sun;
      uniforms.uSunDir.value.copy(sun.position).normalize();
      sunTint.copy(sun.color).multiplyScalar(sun.intensity / Math.PI);
      uniforms.uSunRadiance.value.set(sunTint.r, sunTint.g, sunTint.b);
      const ambient = lighting.fogColor;
      uniforms.uLight.value.set(sunTint.r * 0.62 + ambient.r * 1.6, sunTint.g * 0.62 + ambient.g * 1.6, sunTint.b * 0.62 + ambient.b * 1.6);
    }
  };
}

register('world/water', 'river water depth follows the channel and reflects the surroundings', ctx => {
  const w = ctx.world.water;
  const river = ctx.world.data.river;
  const mid = river.find(p => Math.abs(p[0] + 120) < 1) || river[5];
  assert(w.depthAt(mid[0], mid[1]) > 0.5, `the river centre at ${mid[0]},${mid[1]} must be under water, depth ${w.depthAt(mid[0], mid[1])}`);
  assert(w.depthAt(mid[0], mid[1] + 160) === 0, 'terrain far from the river must be dry');
  assert(w.mesh.material.transparent && w.mesh.geometry.index.count > 100 && w.mesh.geometry.attributes.aFlow, 'water mesh must be a flowing ribbon');
  assert(w.target.texture && w.mesh.onBeforeRender, 'water needs a reflection target');
  assert(w.mesh.geometry.attributes.aBank && w.mesh.geometry.attributes.aBank.count === w.mesh.geometry.attributes.aFlow.count, 'water needs the bank half width per vertex');
  assert(!(ctx.world.lighting.sky && ctx.world.lighting.sky.material) || ctx.world.lighting.sky.material.blending !== CustomBlending, 'the sky blending must be restored after the reflection pass');
});
