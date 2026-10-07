import { Mesh, InstancedBufferGeometry, BufferAttribute, MeshLambertMaterial, DoubleSide, DataTexture, RGBAFormat, RGFormat, FloatType, UnsignedByteType, NearestFilter, LinearFilter, RepeatWrapping, ClampToEdgeWrapping, Vector3, ShaderChunk } from 'three';
import { windUniforms, windGlsl } from './wind.js';
import { terrainGlsl, meadowGlsl } from '../world/terrain.js';
import { injectFog } from '../render/lighting.js';
import { MAP } from '../world/layout.js';
import { extractPlanes, boxInside } from '../core/cull.js';
import { register, assert, report } from '../core/selftest.js';

const _dir = new Vector3();
export const GRASS = { px: 1.4, cover: 1, ref: null, cov: 0 };
const INTERACT = { size: 128, span: 64, radius: 31 };
const W0 = 0.0058;
const TIER_COUNT = 6;
const CELL0 = 0.3;
const SEGS = [4, 3, 2, 2, 1, 1];
const CHUNK_CELLS = 8;
const LIST_W = 512;
const LIST_H = 16;
const LIST_CAP = LIST_W * LIST_H;
const REACH = 3700;
const BLADE_TOP = 1.5;
const HG = 16;
const HGN = MAP.size / HG;

const LAMBERT_FROM = '\treflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n}';
const LAMBERT_TO = `\treflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
\tfloat gBack = saturate( - dot( directLight.direction, geometryViewDir ) );
\tfloat gTrans = gBack * gBack * gBack * ( 0.3 + 0.7 * vGrassV );
\treflectedLight.directDiffuse += directLight.color * RECIPROCAL_PI * material.diffuseColor * vec3( 1.0, 1.3, 0.45 ) * ( gTrans * 0.85 );
}`;
const lambertPatched = ShaderChunk.lights_lambert_pars_fragment.includes(LAMBERT_FROM);
if (!lambertPatched) report('veg/grass', new Error('three changed the Lambert direct light function, grass translucency is missing'));
const LAMBERT_CHUNK = lambertPatched ? ShaderChunk.lights_lambert_pars_fragment.replace(LAMBERT_FROM, LAMBERT_TO) : ShaderChunk.lights_lambert_pars_fragment;

const VERTEX_PARS = `
${terrainGlsl}
${windGlsl}
${meadowGlsl}
uniform sampler2D uGrassTex;
uniform sampler2D uNormalTex;
uniform sampler2D uInteract;
uniform sampler2D uChunks;
uniform vec3 uCam;
uniform vec4 uTier;
uniform vec3 uGrass;
uniform vec3 uFwd;
uniform vec3 uRef;
uniform float uCov;
attribute vec4 aT;
attribute vec4 aB;
attribute float aS;
varying vec3 vGrassColor;
varying float vGrassV;
varying float vGrassAO;
vec2 gHash2(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}
vec3 grassColor(int sp, float rid, float v, vec3 tint, float dryAmt) {
  float r2 = fract(rid * 7.31), r3 = fract(rid * 3.77 + 0.3);
  vec3 live = mix(vec3(0.040, 0.060, 0.020), vec3(0.115, 0.160, 0.052), smoothstep(0.0, 0.3, v));
  live = mix(live, vec3(0.200, 0.250, 0.095), smoothstep(0.35, 1.0, v) * 0.45);
  live *= tint * vec3(0.9 + 0.2 * rid, 0.93 + 0.14 * r2, 0.85 + 0.3 * r3);
  vec3 straw = vec3(0.170, 0.135, 0.075) * (0.8 + 0.5 * rid);
  straw = mix(straw * 0.5, straw * 1.5, smoothstep(0.0, 0.8, v));
  if (sp == 1) live *= vec3(0.86, 0.96, 0.92);
  float dk = sp == 2 ? 1.0 : clamp((dryAmt * 0.6 - rid) / 0.1 + 0.5, 0.0, 1.0);
  return mix(live, straw, dk);
}
`;

const VERTEX_BEGIN = `
vec3 objectNormal = vec3(0.0, 1.0, 0.0);
vec3 transformed = vec3(0.0);
bool gCull = true;
vGrassColor = vec3(0.0);
vGrassV = 0.0;
vGrassAO = 1.0;
{
  int id = gl_InstanceID;
  int slot = id >> 6;
  vec2 chunk = texelFetch(uChunks, ivec2(slot & ${LIST_W - 1}, slot >> 9), 0).rg;
  vec2 cell = chunk * ${CHUNK_CELLS.toFixed(1)} + vec2(float(id & 7), float((id >> 3) & 7));
  vec2 h2 = gHash2(cell + uTier.w);
  vec2 wxz = (cell + h2) * uTier.x;
  vec2 h3 = gHash2(cell + 71.7 + uTier.w);
  vec2 h4 = gHash2(cell + 13.1 + uTier.w);
  vec2 rel = wxz - uCam.xz;
  float dist = length(vec3(rel.x, uCam.y - uGrass.y, rel.y));
  float dens = texture2D(uGrassTex, (wxz + ${MAP.half.toFixed(1)}) / ${MAP.size.toFixed(1)}).r * (1.0 - smoothstep(${(MAP.half - 40).toFixed(1)}, ${(MAP.half + 60).toFixed(1)}, max(abs(wxz.x), abs(wxz.y))));
  float ell = max(0.0, log2(dist * uGrass.x) * 0.5);
  bool refCull = false;
  if (uRef.z > 0.0) {
    vec2 dr = wxz - uRef.xy;
    if (dot(dr, dr) < uRef.z) { if (uTier.z < 0.5) ell = 0.0; else refCull = true; }
  }
  float tt = ell - uTier.z;
  float alpha = tt <= 0.0 ? (uTier.z < 0.5 ? 1.0 : clamp(1.0 + tt, 0.0, 1.0)) : (tt >= 1.0 ? 0.0 : (1.0 - tt * pow(4.0, tt - 1.0)) * pow(4.0, -tt));
  alpha *= mix(1.0, uGrass.z, smoothstep(0.3, 1.6, ell));
  float present = step(h3.x, smoothstep(0.04, 0.42, dens));
  float keep = step(fract(aT.w + h3.y * 0.9173 + h4.y), alpha);
  gCull = refCull || keep < 0.5 || present < 0.5 || dens < 0.03 || dot(rel, uFwd.xy) < uFwd.z * length(rel) && length(rel) > 6.0;
  vec3 center = vec3(wxz.x, 0.0, wxz.y);
  if (!gCull) {
    center.y = terrainHeightAt(wxz);
    vec4 clip = projectionMatrix * viewMatrix * vec4(center + vec3(0.0, 0.6, 0.0), 1.0);
    gCull = clip.w < -3.0 || abs(clip.x) > clip.w * 1.4 + 8.0 || abs(clip.y) > clip.w * 1.4 + 8.0;
  }
  float ground = center.y;
  if (!gCull) {
    float v = aT.x;
    int sp = int(aS + 0.5);
    float sc = mix(0.5, 1.0, smoothstep(0.1, 0.8, dens)) * meadowHeight(wxz) * (0.85 + 0.3 * h3.y) * (1.0 + dist * 0.0004);
    vec3 push = vec3(0.0);
    float flatAmt = 0.0;
    if (dist < ${INTERACT.radius.toFixed(1)}) {
      vec4 it = texture2D(uInteract, wxz / ${INTERACT.span.toFixed(1)});
      push = vec3((it.r - 0.5) * 2.0, 0.0, (it.g - 0.5) * 2.0);
      flatAmt = it.b;
    }
    sc *= 1.0 - flatAmt * 0.82;
    float yaw = h4.x * 6.2831853;
    float cy = cos(yaw), sy = sin(yaw);
    float bendW = pow(v, 1.6);
    vec2 fwd = vec2(cos(aB.z), sin(aB.z));
    vec2 base2 = aB.xy * uTier.y;
    vec3 local = vec3(base2.x + fwd.x * position.x * sc, position.y * sc, base2.y + fwd.y * position.x * sc);
    vec3 rot = vec3(local.x * cy + local.z * sy, local.y, -local.x * sy + local.z * cy);
    vec2 g = windGust(center);
    float flutter = sin(uWindTime * (2.2 + aT.w * 2.4) + dot(wxz, vec2(0.7, 0.4)) * 1.9 + aT.w * 40.0);
    float bendK = 1.0 / (1.0 + 0.6 * uTier.z);
    vec3 wind = vec3(g.x, -0.1 * length(g), g.y) * (0.22 * bendW * sc) * bendK + vec3(uWindDir.x, 0.0, uWindDir.y) * (flutter * 0.03 * bendW * sc * uWindAmp * bendK);
    vec3 away = push * (1.26 * bendW * sc);
    float prof = (0.62 + 0.38 * min(1.0, v / 0.18)) * pow(max(1.0 - pow(v, 2.3), 0.0), 0.75);
    float wr = ${W0.toFixed(4)} * aB.w * exp2(2.0 * ell);
    vec2 sideL = vec2(-fwd.y, fwd.x);
    vec3 sideW = vec3(sideL.x * cy + sideL.y * sy, 0.0, -sideL.x * sy + sideL.y * cy);
    transformed = center + rot + wind + away + sideW * (aT.y * 0.5 * wr * prof);
    transformed.y -= flatAmt * 0.1 * bendW;
    vec3 tan3 = vec3(fwd.x * sin(aT.z), cos(aT.z), fwd.y * sin(aT.z));
    vec3 tanW = vec3(tan3.x * cy + tan3.z * sy, tan3.y, -tan3.x * sy + tan3.z * cy);
    vec3 nb = normalize(cross(sideW, tanW));
    if (dot(nb, transformed - uCam) > 0.0) nb = -nb;
    nb = normalize(nb + sideW * aT.y * 0.45);
    vec2 tn = texture2D(uNormalTex, ((wxz + ${MAP.half.toFixed(1)}) / ${MAP.cell.toFixed(1)} + 0.5) / ${MAP.samples.toFixed(1)}).rg * 2.0 - 1.0;
    vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(tn.x, sqrt(max(0.0, 1.0 - dot(tn, tn))), tn.y), 0.75));
    float colK = exp2(-ell);
    objectNormal = normalize(mix(up, nb, 0.62 * colK + 0.1));
    vec3 tint = meadowTint(wxz);
    vec3 col = grassColor(sp, aT.w, v, tint, meadowDry(wxz) * (0.85 + 0.3 * h3.y));
    col = mix(col, col * 1.18, flatAmt * 0.4);
    vGrassColor = mix(meadowMean(wxz) * (0.85 + 0.3 * v), col, colK);
    vGrassV = v;
    vGrassAO = mix(mix(0.3, 1.0, smoothstep(0.0, 0.55, v)), 0.92, 1.0 - colK);
  }
}
`;

function createMaterial(tier, shared) {
  const m = new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide });
  const uniforms = { uTier: { value: [tier.cell, 2 ** tier.k, tier.k, tier.k * 17.3] }, uChunks: { value: tier.tex } };
  m.onBeforeCompile = function (shader) {
    injectFog(shader);
    Object.assign(shader.uniforms, windUniforms, shared, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', VERTEX_BEGIN)
      .replace('#include <begin_vertex>', '')
      .replace('#include <project_vertex>', '#include <project_vertex>\nif (gCull) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassColor;\nvarying float vGrassV;\nvarying float vGrassAO;')
      .replace('#include <lights_lambert_pars_fragment>', LAMBERT_CHUNK)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassColor;')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= vGrassAO;\nreflectedLight.directDiffuse *= mix(0.35, 1.0, vGrassAO);');
  };
  m.customProgramCacheKey = () => 'grass3';
  return m;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBlades() {
  const rnd = mulberry(7311);
  const range = (a, b) => a + (b - a) * rnd();
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.87;
  const tillers = [];
  for (let i = 0; i < 9; i++) { const a = range(0, Math.PI * 2), r = 0.24 * Math.sqrt(rnd()) * 0.9; tillers.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a }); }
  const plan = [];
  for (const [sp, n] of [[0, 44], [1, 12], [2, 8], [3, 32]]) for (let i = 0; i < n; i++) plan.push(sp);
  for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; }
  const deg = Math.PI / 180;
  return plan.map(sp => {
    const t = tillers[Math.floor(rnd() * tillers.length)];
    const off = range(0, 0.05), ao = range(0, Math.PI * 2);
    const base = { x: t.x + Math.cos(ao) * off * (sp === 3 ? 2.5 : 1), z: t.z + Math.sin(ao) * off * (sp === 3 ? 2.5 : 1) };
    const az = t.a + gauss() * 0.9;
    const rid = rnd();
    if (sp === 0) return { ...base, az, rid, sp: 0, h: range(0.55, 1.0), wm: 1, bend: range(28, 78) * deg, lean: range(3, 16) * deg };
    if (sp === 1) return { ...base, az, rid, sp: 1, h: range(0.4, 0.82), wm: 2.15, bend: range(40, 100) * deg, lean: range(5, 20) * deg };
    if (sp === 2) return { ...base, az, rid, sp: 2, h: range(0.7, 1.05), wm: 0.93, bend: range(6, 40) * deg, lean: range(2, 12) * deg };
    return { ...base, az, rid, sp: 0, h: range(0.12, 0.32), wm: 0.9, bend: range(30, 90) * deg, lean: range(5, 25) * deg };
  });
}

function centerline(b, t) {
  const steps = 24, n = Math.max(1, Math.round(steps * t));
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / steps * (t / (n / steps));
    const th = b.lean + b.bend * Math.pow(Math.min(1, s), 1.3);
    x += Math.sin(th) * b.h * (t / n);
    y += Math.cos(th) * b.h * (t / n);
  }
  return { x, y, th: b.lean + b.bend * Math.pow(t, 1.3) };
}

function tuftGeometry(blades, segs) {
  const pos = [], aT = [], aB = [], aS = [], idx = [];
  for (const b of blades) {
    const first = pos.length / 3;
    for (let r = 0; r <= segs; r++) {
      const t = r / segs;
      const c = centerline(b, t);
      const rows = r === segs ? [0] : [-1, 1];
      for (const side of rows) {
        pos.push(c.x, c.y, 0);
        aT.push(t, side, c.th, b.rid);
        aB.push(b.x, b.z, b.az, b.wm);
        aS.push(b.sp);
      }
    }
    for (let r = 0; r < segs - 1; r++) {
      const a = first + r * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const last = first + (segs - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(aT), 4));
  g.setAttribute('aB', new BufferAttribute(new Float32Array(aB), 4));
  g.setAttribute('aS', new BufferAttribute(new Float32Array(aS), 1));
  g.setIndex(new BufferAttribute(new Uint32Array(idx), 1));
  g.instanceCount = 0;
  return g;
}

export function createGrass(models, terrain, render) {
  const field = new Uint8Array(INTERACT.size * INTERACT.size * 4);
  const interact = new DataTexture(field, INTERACT.size, INTERACT.size, RGBAFormat, UnsignedByteType);
  interact.wrapS = interact.wrapT = RepeatWrapping;
  interact.minFilter = interact.magFilter = LinearFilter;
  interact.generateMipmaps = false;
  for (let i = 0; i < field.length; i += 4) { field[i] = field[i + 1] = 128; field[i + 2] = 0; field[i + 3] = 255; }
  interact.needsUpdate = true;

  const camUniform = { value: new Vector3() };
  const grassUniform = { value: [1, 0, 0.4] };
  const fwdUniform = { value: new Vector3(0, 1, -1) };
  const refUniform = { value: new Vector3(0, 0, 0) };
  const covUniform = { value: 0 };
  const shared = {
    uHeightTex: terrain.uniforms.uHeightTex,
    uGrassTex: { value: terrain.textures.grass },
    uNormalTex: { value: terrain.textures.normal },
    uInteract: { value: interact },
    uCam: camUniform,
    uGrass: grassUniform,
    uFwd: fwdUniform,
    uRef: refUniform,
    uCov: covUniform
  };

  const hmin = new Float32Array(HGN * HGN).fill(1e9), hmax = new Float32Array(HGN * HGN).fill(-1e9);
  const N = MAP.samples;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = Math.min(HGN - 1, Math.floor(j * MAP.cell / HG)) * HGN + Math.min(HGN - 1, Math.floor(i * MAP.cell / HG));
    const h = terrain.heights[j * N + i];
    if (h < hmin[c]) hmin[c] = h;
    if (h > hmax[c]) hmax[c] = h;
  }
  const bounds = (x0, z0, x1, z1, out) => {
    const i0 = Math.max(0, Math.min(HGN - 1, Math.floor((x0 + MAP.half) / HG))), i1 = Math.max(0, Math.min(HGN - 1, Math.floor((x1 + MAP.half) / HG)));
    const j0 = Math.max(0, Math.min(HGN - 1, Math.floor((z0 + MAP.half) / HG))), j1 = Math.max(0, Math.min(HGN - 1, Math.floor((z1 + MAP.half) / HG)));
    let lo = 1e9, hi = -1e9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = j * HGN + i; if (hmin[c] < lo) lo = hmin[c]; if (hmax[c] > hi) hi = hmax[c]; }
    out[0] = lo; out[1] = hi;
  };

  const blades = makeBlades();
  const tiers = Array.from({ length: TIER_COUNT }, (_, k) => {
    const cell = CELL0 * 2 ** k;
    const data = new Float32Array(LIST_CAP * 2);
    const tex = new DataTexture(data, LIST_W, LIST_H, RGFormat, FloatType);
    tex.minFilter = tex.magFilter = NearestFilter;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const tier = { k, cell, chunk: cell * CHUNK_CELLS, data, tex, count: 0 };
    const geometry = tuftGeometry(blades, SEGS[k]);
    const mesh = new Mesh(geometry, createMaterial(tier, shared));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    mesh.name = `GrassTier${k}`;
    tier.mesh = mesh;
    tier.geometry = geometry;
    return tier;
  });

  const planes = new Float64Array(16);
  const gb = [0, 0];
  const selectChunks = (tier, cam, pxPerRad) => {
    const dFor = l => W0 * Math.pow(4, l) * pxPerRad / GRASS.px;
    const dLo = tier.k === 0 ? 0 : dFor(tier.k - 1), dHi = Math.min(REACH, dFor(tier.k + 1));
    const C = tier.chunk, lim = MAP.half + 80;
    const rf0 = tier.k === 0 && GRASS.ref ? GRASS.ref : null;
    const i0 = Math.floor(Math.max(-lim, rf0 ? Math.min(cam.x - dHi, rf0.x - rf0.r) : cam.x - dHi) / C), i1 = Math.floor(Math.min(lim, rf0 ? Math.max(cam.x + dHi, rf0.x + rf0.r) : cam.x + dHi) / C);
    const j0 = Math.floor(Math.max(-lim, rf0 ? Math.min(cam.z - dHi, rf0.z - rf0.r) : cam.z - dHi) / C), j1 = Math.floor(Math.min(lim, rf0 ? Math.max(cam.z + dHi, rf0.z + rf0.r) : cam.z + dHi) / C);
    const rc = C * 0.7072;
    let n = 0;
    const d = tier.data;
    const rf = tier.k === 0 && GRASS.ref ? GRASS.ref : null;
    for (let j = j0; j <= j1 && n < LIST_CAP; j++) {
      for (let i = i0; i <= i1; i++) {
        const x0 = i * C, z0 = j * C, cx = x0 + C * 0.5, cz = z0 + C * 0.5;
        const dist = Math.hypot(cx - cam.x, cz - cam.z);
        const inRef = rf && Math.hypot(cx - rf.x, cz - rf.z) < rf.r + rc;
        if (!inRef && (dist - rc > dHi || dist + rc < dLo)) continue;
        bounds(x0, z0, x0 + C, z0 + C, gb);
        const top = gb[1] + BLADE_TOP;
        if (view.planes && !boxInside(planes, x0, gb[0] - 0.2, z0, x0 + C, top, z0 + C)) continue;
        if (view.horizon && dist > 30 && !view.horizon.visible(x0, z0, x0 + C, z0 + C, top)) continue;
        d[n * 2] = i;
        d[n * 2 + 1] = j;
        n++;
        if (n >= LIST_CAP) break;
      }
    }
    tier.count = n;
    tier.tex.needsUpdate = true;
    tier.geometry.instanceCount = n * CHUNK_CELLS * CHUNK_CELLS;
    tier.mesh.visible = n > 0;
  };

  const view = { planes: null, horizon: null };
  const actors = new Map();
  const texel = INTERACT.span / INTERACT.size;
  const stampAt = (x, z, radius, px, pz, flatten, push) => {
    const r = Math.ceil(radius / texel);
    const cx = Math.floor(x / texel), cz = Math.floor(z / texel);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot((cx + dx + 0.5) * texel - x, (cz + dz + 0.5) * texel - z);
        if (d > radius) continue;
        const w = 1 - d / radius;
        const i = (((((cz + dz) % INTERACT.size) + INTERACT.size) % INTERACT.size) * INTERACT.size + ((((cx + dx) % INTERACT.size) + INTERACT.size) % INTERACT.size)) * 4;
        if (push) {
          const nx = d > 1e-3 ? ((cx + dx + 0.5) * texel - x) / d : 0, nz = d > 1e-3 ? ((cz + dz + 0.5) * texel - z) / d : 0;
          field[i] = Math.max(0, Math.min(255, field[i] + (nx * w * 120 + px * 40 * w)));
          field[i + 1] = Math.max(0, Math.min(255, field[i + 1] + (nz * w * 120 + pz * 40 * w)));
        }
        field[i + 2] = Math.min(255, Math.max(field[i + 2], flatten * w * 255));
      }
    }
  };

  const grass = {
    group: tiers.map(t => t.mesh),
    tiers,
    interact,
    shared,
    actor(id, x, z, vx = 0, vz = 0, radius = 0.9) { actors.set(id, { x, z, vx, vz, radius }); },
    removeActor(id) { actors.delete(id); },
    flatten(x, z, radius, strength = 1) { stampAt(x, z, radius, 0, 0, strength, true); },
    update(cam, dt, v = null) {
      camUniform.value.copy(cam);
      if (v && v.camera) {
        v.camera.getWorldDirection(_dir);
        v.dir = _dir;
        v.tanH = Math.tan(v.camera.fov * Math.PI / 360) * v.camera.aspect;
        const pxPerRad = v.camera.projectionMatrix.elements[5] * v.heightPx * 0.5;
        grassUniform.value[0] = GRASS.px / (pxPerRad * W0);
        grassUniform.value[1] = terrain.heightAt(cam.x, cam.z);
        grassUniform.value[2] = GRASS.cover;
        refUniform.value.set(GRASS.ref ? GRASS.ref.x : 0, GRASS.ref ? GRASS.ref.z : 0, GRASS.ref ? GRASS.ref.r * GRASS.ref.r : 0);
        covUniform.value = GRASS.cov;
        const h = Math.hypot(v.dir.x, v.dir.z), cosPitch = Math.max(h, 0.2);
        const reach = Math.min(Math.PI, Math.atan(v.tanH / cosPitch) + 0.35);
        fwdUniform.value.set(v.dir.x / Math.max(h, 1e-4), v.dir.z / Math.max(h, 1e-4), h < 0.55 ? -1 : Math.cos(reach));
        view.planes = extractPlanes(v.camera, planes);
        view.horizon = v.horizon || null;
        for (const t of tiers) selectChunks(t, cam, pxPerRad);
      }
      const k = Math.min(6, Math.max(0.2, dt * 60));
      for (let i = 0; i < field.length; i += 4) {
        if (field[i] !== 128) field[i] += field[i] > 128 ? -Math.min(field[i] - 128, 3 * k) : Math.min(128 - field[i], 3 * k);
        if (field[i + 1] !== 128) field[i + 1] += field[i + 1] > 128 ? -Math.min(field[i + 1] - 128, 3 * k) : Math.min(128 - field[i + 1], 3 * k);
        if (field[i + 2] > 0) field[i + 2] = Math.max(0, field[i + 2] - 1.2 * k);
      }
      for (const a of actors.values()) stampAt(a.x, a.z, a.radius, a.vx, a.vz, 0.55, true);
      interact.needsUpdate = true;
    }
  };
  return grass;
}

register('veg/grass', 'grass tiers follow the camera, bend away from actors and flatten from blasts', ctx => {
  const g = ctx.world.grass;
  assert(g.group.length === TIER_COUNT, `${TIER_COUNT} grass tiers expected`);
  assert(lambertPatched, 'grass translucency patch missing');
  const cam = ctx.world.camera;
  g.update(cam.position, 1 / 60, { camera: cam, heightPx: 1080, horizon: null });
  assert(g.tiers.filter(t => t.count > 0).length >= 4, `chunk lists empty: ${g.tiers.map(t => t.count)}`);
  const data = g.interact.image.data;
  const probe = (x, z) => { const t = INTERACT.span / INTERACT.size; const i = ((((Math.floor(z / t)) % 128) + 128) % 128 * 128 + (((Math.floor(x / t)) % 128) + 128) % 128) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  g.actor('selftest', 10.2, 10.2, 0, 0, 1.2);
  g.update(new Vector3(10, 0, 10), 1 / 60);
  const pushed = probe(10.7, 10.2);
  g.removeActor('selftest');
  assert(pushed[0] > 140, `grass next to an actor must lean away, got ${pushed}`);
  g.flatten(-30.2, 20.2, 3, 1);
  assert(probe(-30.2, 20.2)[2] > 200, 'a blast must flatten the grass');
  for (let i = 0; i < 400; i++) g.update(new Vector3(-30, 0, 20), 1 / 60);
  assert(probe(-30.2, 20.2)[2] < 5 && probe(10.7, 10.2)[0] < 132, 'bent and flattened grass must recover');
});
