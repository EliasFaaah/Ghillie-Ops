import { Group, Mesh, BufferGeometry, BufferAttribute, MeshStandardMaterial, DataTexture, RedFormat, RGBAFormat, FloatType, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, NearestFilter, ClampToEdgeWrapping, RepeatWrapping, Color, SRGBColorSpace, Vector3 } from 'three';
import { MAP, HEIGHT, HORIZON } from './layout.js';
import { windUniforms, windGlsl } from '../veg/wind.js';
import { register, assert } from '../core/selftest.js';

const N = MAP.samples;
const CELLS = N - 1;
const H = MAP.half;
const CHUNKS = CELLS / MAP.chunk;
const LOD_RANGES = [230, 520, 1000];
const SUPER = 4;
const LAYERS = [['grass', 2.6], ['forest', 3.0], ['rock', 4.5], ['dirt', 2.2], ['bed', 1.8]];
const LAYER_AVG = [[0.274, 0.398, 0.08], [0.256, 0.267, 0.16], [0.398, 0.362, 0.33], [0.338, 0.272, 0.198], [0.358, 0.328, 0.289]];
const LAYER_LUM = (() => { const c = new Color().setRGB(LAYER_AVG[0][0], LAYER_AVG[0][1], LAYER_AVG[0][2], SRGBColorSpace); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; })();
const ROUGH = [0.9, 0.95, 0.8, 0.94, 0.72];
const SKIRT = 3;
const HORIZON_SKIRT = 30;

export const terrainGlsl = `
uniform sampler2D uHeightTex;
float terrainHeightAt(vec2 p) {
  vec2 f = (p + ${H.toFixed(1)}) / ${MAP.cell.toFixed(1)};
  ivec2 c = clamp(ivec2(floor(f)), ivec2(0), ivec2(${CELLS - 1}));
  vec2 u = clamp(f - vec2(c), 0.0, 1.0);
  float a = texelFetch(uHeightTex, c, 0).r, b = texelFetch(uHeightTex, c + ivec2(1, 0), 0).r;
  float cc = texelFetch(uHeightTex, c + ivec2(0, 1), 0).r, d = texelFetch(uHeightTex, c + ivec2(1, 1), 0).r;
  return u.x + u.y <= 1.0 ? a + u.x * (b - a) + u.y * (cc - a) : d + (1.0 - u.x) * (cc - d) + (1.0 - u.y) * (b - d);
}
`;

export const meadowGlsl = `
float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mHash(i), mHash(i + vec2(1.0, 0.0)), u.x), mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 meadowTint(vec2 wp) {
  float a = mNoise(wp * 0.0065 + 3.0) * 0.6 + mNoise(wp * 0.021) * 0.4;
  float b = mNoise(wp * 0.0042 + 17.0) * 0.55 + mNoise(wp * 0.0135 + 9.0) * 0.45;
  vec3 t = mix(vec3(0.84, 0.94, 0.82), vec3(1.10, 1.03, 0.90), smoothstep(0.28, 0.62, a));
  t = mix(t, vec3(1.22, 1.08, 0.74), smoothstep(0.55, 0.82, b) * 0.65);
  return t * (0.9 + 0.2 * mNoise(wp * 0.11));
}
float meadowDry(vec2 wp) {
  return 0.05 + 0.30 * smoothstep(0.5, 0.85, mNoise(wp * 0.0052 + 23.0) * 0.6 + mNoise(wp * 0.017 + 5.0) * 0.4);
}
float meadowHeight(vec2 wp) { return 0.72 + 0.46 * smoothstep(0.25, 0.75, mNoise(wp * 0.0085 + 41.0)); }
vec3 meadowMean(vec2 wp) {
  return mix(vec3(0.052, 0.092, 0.024) * meadowTint(wp), vec3(0.170, 0.135, 0.075), meadowDry(wp) * 0.8) * 0.88;
}
`;

const FRAGMENT_PARS = `
${meadowGlsl}
${windGlsl}
uniform sampler2D tA0, tA1, tA2, tA3, tA4, tN0, tN1, tN2, tN3, tN4, tMask, tNz;
float gNz(vec2 p, float lambda, int ch) {
  vec4 t = texture2D(tNz, p / (lambda * 256.0));
  return ch == 0 ? t.r : (ch == 1 ? t.g : (ch == 2 ? t.b : t.a));
}
float grassPattern(vec2 wp) {
  vec2 a = vec2(dot(wp, uWindDir), dot(wp, vec2(-uWindDir.y, uWindDir.x)));
  float f = (gNz(wp, 0.3, 0) - 0.5) * 0.35 + (gNz(vec2(a.x * 0.45, a.y * 1.9), 1.2, 1) - 0.5) * 0.5 + (gNz(wp, 3.6, 2) - 0.5) * 0.55 + (gNz(vec2(a.x * 0.6, a.y * 1.6), 14.0, 3) - 0.5) * 0.6 + (gNz(wp + 17.0, 55.0, 0) - 0.5) * 0.5 + (gNz(wp + 53.0, 210.0, 1) - 0.5) * 0.4;
  vec2 gg = windGust(vec3(wp.x, 0.0, wp.y));
  float wave = sin(a.x * 0.19 - uWindTime * 2.6 + gNz(wp, 40.0, 2) * 6.0) * 0.03;
  return clamp(1.0 + f * 0.4 + (length(gg) - 0.7) * 0.06 + wave * 0.5, 0.6, 1.5);
}
uniform vec3 tAvg[5];
varying vec3 vTW;
varying vec3 vTN;
vec3 tWN;
float tRoughV;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 gDx;
vec2 gDy;
vec3 gDx3;
vec3 gDy3;
vec2 tHexOff(vec2 v) { return fract(sin(vec2(dot(v, vec2(127.1, 311.7)), dot(v, vec2(269.5, 183.3)))) * 43758.5453); }
void tHexW(vec2 uv, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
  vec2 st = uv * 3.4641016;
  vec2 sk = vec2(st.x - 0.57735027 * st.y, 1.15470054 * st.y);
  vec2 bid = floor(sk);
  vec3 f = vec3(fract(sk), 0.0);
  f.z = 1.0 - f.x - f.y;
  float s = step(0.0, -f.z);
  float s2 = 2.0 * s - 1.0;
  w = vec3(-f.z * s2, s - f.y * s2, s - f.x * s2);
  v1 = bid + vec2(s);
  v2 = bid + vec2(s, 1.0 - s);
  v3 = bid + vec2(1.0 - s, s);
}
vec3 tHexRgb(sampler2D t, vec2 uv, vec2 dx, vec2 dy) {
  vec3 w; vec2 v1, v2, v3;
  tHexW(uv, w, v1, v2, v3);
  vec3 g = textureGrad(t, uv + tHexOff(v1), dx, dy).rgb * w.x + textureGrad(t, uv + tHexOff(v2), dx, dy).rgb * w.y + textureGrad(t, uv + tHexOff(v3), dx, dy).rgb * w.z;
  vec3 m = textureLod(t, vec2(0.5), 9.0).rgb;
  return max(m + (g - m) / sqrt(dot(w, w)), 0.0);
}
vec2 tHexRg(sampler2D t, vec2 uv, vec2 dx, vec2 dy) {
  vec3 w; vec2 v1, v2, v3;
  tHexW(uv, w, v1, v2, v3);
  vec2 g = textureGrad(t, uv + tHexOff(v1), dx, dy).rg * w.x + textureGrad(t, uv + tHexOff(v2), dx, dy).rg * w.y + textureGrad(t, uv + tHexOff(v3), dx, dy).rg * w.z;
  vec2 m = textureLod(t, vec2(0.5), 9.0).rg;
  return (m + (g - m) / sqrt(dot(w, w))) * 2.0 - 1.0;
}
vec3 tAlbedo(sampler2D t, vec2 p, float s, float k) {
  return k > 0.01 ? tHexRgb(t, p / s, gDx / s, gDy / s) : texture2D(t, p / s).rgb;
}
vec2 tNormalTs(sampler2D t, vec2 p, float s, float k) {
  return k > 0.01 ? tHexRg(t, p / s, gDx / s, gDy / s) : texture2D(t, p / s).rg * 2.0 - 1.0;
}
vec3 tTriAlbedo(sampler2D t, vec3 p, vec3 w, float s) {
  vec3 c = vec3(0.0);
  float sum = 0.0;
  if (w.x > 0.05) { c += tHexRgb(t, p.zy / s, gDx3.zy / s, gDy3.zy / s) * w.x; sum += w.x; }
  if (w.y > 0.05) { c += tHexRgb(t, p.xz / s, gDx3.xz / s, gDy3.xz / s) * w.y; sum += w.y; }
  if (w.z > 0.05) { c += tHexRgb(t, p.xy / s, gDx3.xy / s, gDy3.xy / s) * w.z; sum += w.z; }
  return c / max(sum, 1e-3);
}
vec3 tTriNormal(sampler2D t, vec3 p, vec3 w, float s) {
  vec3 n = vec3(0.0);
  float sum = 0.0;
  if (w.x > 0.05) { vec2 x = tHexRg(t, p.zy / s, gDx3.zy / s, gDy3.zy / s); n += vec3(0.0, x.y, x.x) * w.x; sum += w.x; }
  if (w.y > 0.05) { vec2 y = tHexRg(t, p.xz / s, gDx3.xz / s, gDy3.xz / s); n += vec3(y.x, 0.0, y.y) * w.y; sum += w.y; }
  if (w.z > 0.05) { vec2 z = tHexRg(t, p.xy / s, gDx3.xy / s, gDy3.xy / s); n += vec3(z.x, z.y, 0.0) * w.z; sum += w.z; }
  return n / max(sum, 1e-3);
}
`;

const MAP_FRAGMENT = `
{
  vec2 wp = vTW.xz;
  gDx = dFdx(wp);
  gDy = dFdy(wp);
  gDx3 = dFdx(vTW);
  gDy3 = dFdy(vTW);
  float dist = distance(vTW, cameraPosition);
  vec3 gN = normalize(vTN);
  vec4 mk = texture2D(tMask, (wp + ${H.toFixed(1)}) / ${MAP.size.toFixed(1)}) * (1.0 - smoothstep(${(H - 90).toFixed(1)}, ${H.toFixed(1)}, max(abs(wp.x), abs(wp.y))));
  float n1 = tNoise(wp * 0.05), n2 = tNoise(wp * 0.23), n3 = tNoise(wp * 0.011);
  float wR = clamp(mk.g + 1.0 - smoothstep(0.50, 0.72, gN.y + (n1 - 0.5) * 0.12), 0.0, 1.0);
  float rest = 1.0 - wR;
  float bedK = smoothstep(0.55, 0.9, mk.b);
  float wB = rest * bedK;
  rest -= wB;
  float wet = smoothstep(0.02, 0.5, mk.b) * (1.0 - bedK);
  float wD = rest * clamp(mk.r + wet, 0.0, 1.0);
  rest -= wD;
  float wF = rest * mk.a;
  float wG = rest - wF;
  float nearK = 1.0 - smoothstep(60.0, 260.0, dist);
  float mixK = smoothstep(0.3, 0.7, n1 * 0.6 + n2 * 0.4);
  vec3 col = vec3(0.0);
  vec3 gcol = meadowMean(wp);
  vec3 gEarth = vec3(0.050, 0.037, 0.024);
  vec3 nrm = gN;
  tRoughV = 0.9;
  float detail = 1.0 - smoothstep(50.0, 220.0, dist);
  if (dist > 750.0) {
    col = tAvg[1] * wF + tAvg[2] * wR + tAvg[3] * wD + tAvg[4] * wB;
  } else {
    vec2 tdir = vec2(0.0);
    vec3 T = normalize(vec3(1.0, 0.0, 0.0) - gN * gN.x);
    vec3 B = cross(T, gN);
    float rough = 0.0;
    float dirtK = 0.78;
    if (wG > 0.01) {
      vec3 gt = tAlbedo(tA0, wp, ${LAYERS[0][1].toFixed(2)}, nearK);
      float gl = pow(clamp(dot(gt, vec3(0.2126, 0.7152, 0.0722)) / ${LAYER_LUM.toFixed(4)}, 0.4, 2.0), 0.8 * nearK + 0.001);
      gcol = mix(gcol * mix(1.0, gl, 0.6), (gEarth * 0.6 + gcol * 0.4) * gl, 0.75 * (1.0 - smoothstep(10.0, 90.0, dist)));
      gcol *= grassPattern(wp);
      if (detail > 0.01) tdir += wG * tNormalTs(tN0, wp, ${LAYERS[0][1].toFixed(2)}, nearK);
      rough += wG * ${ROUGH[0].toFixed(2)};
    }
    if (wF > 0.01) { col += wF * tAlbedo(tA1, wp, ${LAYERS[1][1].toFixed(2)}, nearK); if (detail > 0.01) tdir += wF * tNormalTs(tN1, wp, ${LAYERS[1][1].toFixed(2)}, nearK); rough += wF * ${ROUGH[1].toFixed(2)}; }
    if (wD > 0.01) { col += wD * tAlbedo(tA3, wp, ${LAYERS[3][1].toFixed(2)}, nearK) * (1.0 - 0.45 * wet) * dirtK; if (detail > 0.01) tdir += wD * tNormalTs(tN3, wp, ${LAYERS[3][1].toFixed(2)}, nearK); rough += wD * mix(${ROUGH[3].toFixed(2)}, 0.5, wet); }
    if (wB > 0.01) { col += wB * tAlbedo(tA4, wp, ${LAYERS[4][1].toFixed(2)}, nearK) * 0.8; if (detail > 0.01) tdir += wB * tNormalTs(tN4, wp, ${LAYERS[4][1].toFixed(2)}, nearK); rough += wB * ${ROUGH[4].toFixed(2)}; }
    nrm = normalize(gN + (T * tdir.x + B * tdir.y) * detail * 0.9);
    if (wR > 0.01) {
      vec3 tw = pow(abs(gN), vec3(4.0));
      tw /= tw.x + tw.y + tw.z;
      vec3 rp = vec3(vTW.x, vTW.y, vTW.z);
      col += wR * tTriAlbedo(tA2, rp, tw, ${LAYERS[2][1].toFixed(2)});
      if (detail > 0.01) nrm = normalize(nrm + wR * tTriNormal(tN2, rp, tw, ${LAYERS[2][1].toFixed(2)}) * detail);
      rough += wR * ${ROUGH[2].toFixed(2)};
    }
    tRoughV = rough;
  }
  float n4 = tNoise(wp * 0.0029 + 40.0), n5 = tNoise(wp * 0.0071 + 11.0);
  col *= mix(0.78, 1.22, n3 * 0.45 + n1 * 0.25 + n5 * 0.3) * mix(0.95, 1.05, n2);
  col *= mix(vec3(0.9, 1.0, 1.08), vec3(1.14, 1.02, 0.84), n4);
  col = col * 1.1 + gcol * wG;
  tWN = nrm;
  diffuseColor.rgb *= col;
}
`;

function loadBinary(url, Type) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.arrayBuffer();
  }).then(b => new Type(b));
}

function dataTexture(data, w, h, format, type, filter) {
  const t = new DataTexture(data, w, h, format, type);
  t.minFilter = t.magFilter = filter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function createTerrainMaterial(uniforms) {
  const mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = position;\nvTN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRoughV;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tWN, 0.0)).xyz);\nnormal = faceDirection * normal;');
  };
  return mat;
}

export async function createTerrain(ctx, placementsPromise = null) {
  const { assets } = ctx;
  const base = '/assets/world/';
  const textureJobs = LAYERS.flatMap(([name]) => ['a', 'n'].map(k => assets.texture(`/assets/textures/terrain/terrain_${name}_${k}.ktx2`, { repeat: 1 })));
  const [u16, maskBytes, grassBytes, horizonU16, ...layerTextures] = await Promise.all([
    loadBinary(`${base}height.bin`, Uint16Array), loadBinary(`${base}mask.bin`, Uint8Array), loadBinary(`${base}grass.bin`, Uint8Array), loadBinary(`${base}horizon.bin`, Uint16Array), ...textureJobs
  ]);
  const heights = new Float32Array(N * N);
  for (let i = 0; i < heights.length; i++) heights[i] = HEIGHT.min + (u16[i] / 65535) * HEIGHT.range;

  const lifted = new Map();
  const triangleAt = (x, z, s) => {
    const cells = CELLS / s, fx = (x + H) / (MAP.cell * s), fz = (z + H) / (MAP.cell * s);
    const i = Math.min(cells - 1, Math.max(0, Math.floor(fx))), j = Math.min(cells - 1, Math.max(0, Math.floor(fz)));
    return { i, j, u: Math.min(1, Math.max(0, fx - i)), v: Math.min(1, Math.max(0, fz - j)) };
  };
  const surfaceLod = (x, z, s) => {
    const arr = s === 1 ? heights : lifted.get(s) || heights;
    const { i, j, u, v } = triangleAt(x, z, s);
    const at = (a, b) => arr[b * s * N + a * s];
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  };
  if (placementsPromise && !location.search.includes('nolift')) {
    const world = await placementsPromise;
    for (const s of [2, 4, 8]) {
      const arr = heights.slice();
      for (const [name, list] of Object.entries(world.models)) {
        const skip = new Set((world.elevated && world.elevated[name]) || []);
        for (let k = 0; k < list.length / 5; k++) {
          if (skip.has(k)) continue;
          const x = list[k * 5], y = list[k * 5 + 1], z = list[k * 5 + 2];
          const { i, j, u, v } = triangleAt(x, z, s);
          const at = (a, b) => arr[b * s * N + a * s];
          const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
          const surf = u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
          const deficit = y - 0.02 - surf;
          if (deficit <= 0) continue;
          const ids = u + v <= 1 ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j], [i, j + 1], [i + 1, j + 1]];
          for (const [ci, cj] of ids) arr[cj * s * N + ci * s] += deficit;
        }
      }
      lifted.set(s, arr);
    }
  }

  const heightTex = dataTexture(heights, N, N, RedFormat, FloatType, NearestFilter);
  const normalBytes = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const l = heights[j * N + Math.max(i - 1, 0)], r = heights[j * N + Math.min(i + 1, CELLS)], d = heights[Math.max(j - 1, 0) * N + i], u = heights[Math.min(j + 1, CELLS) * N + i];
      const len = Math.hypot(l - r, 2 * MAP.cell, d - u), o = (j * N + i) * 4;
      normalBytes[o] = Math.round(((l - r) / len * 0.5 + 0.5) * 255);
      normalBytes[o + 1] = Math.round(((d - u) / len * 0.5 + 0.5) * 255);
      normalBytes[o + 3] = 255;
    }
  }
  const normalTex = dataTexture(normalBytes, N, N, RGBAFormat, UnsignedByteType, LinearFilter);
  const maskTex = dataTexture(maskBytes, MAP.size / 2, MAP.size / 2, RGBAFormat, UnsignedByteType, LinearFilter);
  const grassTex = dataTexture(grassBytes, MAP.size / 2, MAP.size / 2, RedFormat, UnsignedByteType, LinearFilter);
  const noiseBytes = new Uint8Array(256 * 256 * 4);
  let seed = 12345;
  for (let i = 0; i < noiseBytes.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noiseBytes[i] = seed >>> 24; }
  const noiseTex = new DataTexture(noiseBytes, 256, 256, RGBAFormat, UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping;
  noiseTex.magFilter = LinearFilter;
  noiseTex.minFilter = LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  const uniforms = { uHeightTex: { value: heightTex }, tMask: { value: maskTex }, tNz: { value: noiseTex }, tAvg: { value: LAYER_AVG.map(c => new Color().setRGB(c[0], c[1], c[2], SRGBColorSpace)) } };
  LAYERS.forEach((_, i) => { uniforms[`tA${i}`] = { value: layerTextures[i * 2] }; uniforms[`tN${i}`] = { value: layerTextures[i * 2 + 1] }; });
  const material = createTerrainMaterial(uniforms);

  function heightAt(x, z) {
    const fx = (x + H) / MAP.cell, fz = (z + H) / MAP.cell;
    const i = Math.min(CELLS - 1, Math.max(0, Math.floor(fx))), j = Math.min(CELLS - 1, Math.max(0, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const a = heights[j * N + i], b = heights[j * N + i + 1], c = heights[(j + 1) * N + i], d = heights[(j + 1) * N + i + 1];
    return u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  function normalAt(x, z, out = new Vector3()) {
    const e = MAP.cell;
    return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  }

  function maskAt(x, z, out = [0, 0, 0, 0]) {
    const fx = Math.min(MAP.size / 2 - 1, Math.max(0, Math.floor((x + H) / 2))), fz = Math.min(MAP.size / 2 - 1, Math.max(0, Math.floor((z + H) / 2)));
    const o = (fz * (MAP.size / 2) + fx) * 4;
    for (let c = 0; c < 4; c++) out[c] = maskBytes[o + c] / 255;
    return out;
  }

  const grassAt = (x, z) => grassBytes[Math.min(MAP.size / 2 - 1, Math.max(0, Math.floor((z + H) / 2))) * (MAP.size / 2) + Math.min(MAP.size / 2 - 1, Math.max(0, Math.floor((x + H) / 2)))] / 255;

  const _m = [0, 0, 0, 0];
  const surfaceAt = (x, z) => {
    maskAt(x, z, _m);
    return _m[1] > 0.5 || normalAt(x, z).y < 0.74 ? 'rock' : 'dirt';
  };

  const _n = new Vector3();
  function chunkGeometry(ci, cj, lod, span = 1) {
    const stride = 1 << lod, cells = span * MAP.chunk / stride, v = cells + 1;
    const skirt = (SKIRT + 1.5 * stride);
    const total = v * v + 4 * v;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const surface = stride === 1 ? heights : lifted.get(stride) || heights;
    const write = (o, a, b, drop) => {
      const i = ci * MAP.chunk + a * stride, j = cj * MAP.chunk + b * stride;
      pos[o * 3] = -H + i * MAP.cell;
      pos[o * 3 + 1] = surface[j * N + i] - drop;
      pos[o * 3 + 2] = -H + j * MAP.cell;
      const l = heights[j * N + Math.max(i - 1, 0)], r = heights[j * N + Math.min(i + 1, CELLS)], d = heights[Math.max(j - 1, 0) * N + i], u = heights[Math.min(j + 1, CELLS) * N + i];
      _n.set(l - r, 2 * MAP.cell, d - u).normalize();
      nor[o * 3] = _n.x; nor[o * 3 + 1] = _n.y; nor[o * 3 + 2] = _n.z;
    };
    for (let b = 0; b < v; b++) for (let a = 0; a < v; a++) write(b * v + a, a, b, 0);
    const edges = [(k) => [k, 0], (k) => [k, cells], (k) => [0, k], (k) => [cells, k]];
    edges.forEach((e, n) => { for (let k = 0; k < v; k++) { const [a, b] = e(k); write(v * v + n * v + k, a, b, skirt); } });
    const idx = new Uint32Array((cells * cells * 2 + 4 * cells * 4) * 3);
    let p = 0;
    for (let b = 0; b < cells; b++) {
      for (let a = 0; a < cells; a++) {
        const A = b * v + a, B = A + 1, C = A + v, D = C + 1;
        idx[p++] = A; idx[p++] = C; idx[p++] = B;
        idx[p++] = B; idx[p++] = C; idx[p++] = D;
      }
    }
    const rim = [(k) => k, (k) => cells * v + k, (k) => k * v, (k) => k * v + cells];
    for (let n = 0; n < 4; n++) {
      for (let k = 0; k < cells; k++) {
        const t0 = rim[n](k), t1 = rim[n](k + 1), s0 = v * v + n * v + k, s1 = s0 + 1;
        idx[p++] = t0; idx[p++] = s0; idx[p++] = t1; idx[p++] = t1; idx[p++] = s0; idx[p++] = s1;
        idx[p++] = t0; idx[p++] = t1; idx[p++] = s0; idx[p++] = t1; idx[p++] = s1; idx[p++] = s0;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setIndex(new BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  const group = new Group();
  group.name = 'terrain';
  const chunks = [];
  for (let cj = 0; cj < CHUNKS; cj++) {
    for (let ci = 0; ci < CHUNKS; ci++) {
      const mesh = new Mesh(undefined, material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData = { ci, cj, lod: -1, geometries: [], cx: -H + (ci + 0.5) * MAP.chunk * MAP.cell, cz: -H + (cj + 0.5) * MAP.chunk * MAP.cell };
      chunks.push(mesh);
      group.add(mesh);
    }
  }

  function tier(span, lod) {
    const n = CHUNKS / span, size = span * MAP.chunk * MAP.cell, meshes = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const mesh = new Mesh(chunkGeometry(i * span, j * span, lod, span), material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        mesh.userData = { x0: -H + i * size, z0: -H + j * size, size, ci: i * span, cj: j * span };
        meshes.push(mesh);
        group.add(mesh);
      }
    }
    return { span, n, meshes };
  }
  const mids = tier(2, 1);
  const supers = tier(SUPER, 2);
  const cover = (t, u) => t.meshes[Math.floor(u.cj / t.span) * t.n + Math.floor(u.ci / t.span)];
  const edgeDistance = (u, cam) => Math.hypot(Math.max(u.x0 - cam.x, 0, cam.x - u.x0 - u.size), Math.max(u.z0 - cam.z, 0, cam.z - u.z0 - u.size));

  function setLod(mesh, lod) {
    const u = mesh.userData;
    u.geometries[lod] ||= chunkGeometry(u.ci, u.cj, lod);
    mesh.geometry = u.geometries[lod];
    u.lod = lod;
  }

  function update(cam) {
    for (const mesh of supers.meshes) mesh.visible = edgeDistance(mesh.userData, cam) > LOD_RANGES[1] * (mesh.visible ? 0.92 : 1.04);
    for (const mesh of mids.meshes) mesh.visible = !cover(supers, mesh.userData).visible && edgeDistance(mesh.userData, cam) > LOD_RANGES[0] * (mesh.visible ? 0.92 : 1.04);
    for (const mesh of chunks) {
      const u = mesh.userData;
      mesh.visible = !cover(mids, u).visible && !cover(supers, u).visible;
      if (!mesh.visible) continue;
      const d = Math.hypot(u.cx - cam.x, u.cz - cam.z) - MAP.chunk * MAP.cell * 0.5;
      let lod = 0;
      while (lod < LOD_RANGES.length && d > LOD_RANGES[lod] * (u.lod > lod ? 0.92 : 1)) lod++;
      if (lod !== u.lod) setLod(mesh, lod);
    }
  }

  function horizonRing(half, cell, hole, skirt) {
    const per = half * 2 / cell, v = per + 1;
    const pos = new Float32Array(v * v * 3), nor = new Float32Array(v * v * 3);
    const base = (HORIZON.half - half) / HORIZON.cell, step = cell / HORIZON.cell, last = HORIZON.samples - 1;
    const sample = (a, b) => HEIGHT.min + (horizonU16[Math.min(last, Math.max(0, base + b * step)) * HORIZON.samples + Math.min(last, Math.max(0, base + a * step))] / 65535) * HEIGHT.range;
    for (let b = 0; b < v; b++) {
      for (let a = 0; a < v; a++) {
        const o = b * v + a;
        pos[o * 3] = -half + a * cell; pos[o * 3 + 1] = sample(a, b); pos[o * 3 + 2] = -half + b * cell;
        _n.set(sample(a - 1, b) - sample(a + 1, b), 2 * cell, sample(a, b - 1) - sample(a, b + 1)).normalize();
        nor[o * 3] = _n.x; nor[o * 3 + 1] = _n.y; nor[o * 3 + 2] = _n.z;
      }
    }
    const holeCells = hole / cell, lo = per / 2 - holeCells, hi = per / 2 + holeCells;
    const idx = [];
    for (let b = 0; b < per; b++) {
      for (let a = 0; a < per; a++) {
        if (a >= lo && a < hi && b >= lo && b < hi) continue;
        const A = b * v + a, B = A + 1, C = A + v, D = C + 1;
        idx.push(A, C, B, B, C, D);
      }
    }
    const extraPos = [], extraNor = [];
    const sk = (o) => { extraPos.push(pos[o * 3], pos[o * 3 + 1] - skirt, pos[o * 3 + 2]); extraNor.push(nor[o * 3], nor[o * 3 + 1], nor[o * 3 + 2]); return v * v + extraPos.length / 3 - 1; };
    for (let k = lo; k < hi; k++) {
      const edge = [[lo, k, 0], [hi, k, 1], [k, lo, 2], [k, hi, 3]];
      for (const [a, b, side] of edge) {
        const next = side < 2 ? [a, b + 1] : [a + 1, b];
        const o0 = b * v + a, o1 = next[1] * v + next[0];
        const s0 = sk(o0), s1 = sk(o1);
        idx.push(o0, o1, s0, o1, s1, s0, o0, s0, o1, o1, s0, s1);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([...pos, ...extraPos]), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array([...nor, ...extraNor]), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  const horizon = [horizonRing(4096, 32, MAP.half, HORIZON_SKIRT), horizonRing(8192, 128, 4096, HORIZON_SKIRT * 2)].map(g => {
    const m = new Mesh(g, material);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.name = 'horizon';
    group.add(m);
    return m;
  });

  function raycast(origin, dir, far = 5000, out = null) {
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    const hlen = Math.hypot(dx, dz);
    let tBest = Infinity;
    let hit = null;
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) return;
      const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) return;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) return;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t >= 0 && t < tBest) {
        tBest = t;
        hit = [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
      }
    };
    const cellTest = (i, j) => {
      if (i < 0 || j < 0 || i >= CELLS || j >= CELLS) return;
      const x0 = -H + i * MAP.cell, z0 = -H + j * MAP.cell, x1 = x0 + MAP.cell, z1 = z0 + MAP.cell;
      const a = heights[j * N + i], b = heights[j * N + i + 1], c = heights[(j + 1) * N + i], d = heights[(j + 1) * N + i + 1];
      tri(x0, a, z0, x0, c, z1, x1, b, z0);
      tri(x1, b, z0, x0, c, z1, x1, d, z1);
    };
    if (hlen < 1e-9) { cellTest(Math.floor((ox + H) / MAP.cell), Math.floor((oz + H) / MAP.cell)); } else {
      let t = 0, i = Math.floor((ox + H) / MAP.cell), j = Math.floor((oz + H) / MAP.cell);
      const sx = Math.sign(dx), sz = Math.sign(dz);
      const nextX = sx > 0 ? (i + 1) * MAP.cell - H : i * MAP.cell - H, nextZ = sz > 0 ? (j + 1) * MAP.cell - H : j * MAP.cell - H;
      let tx = dx === 0 ? Infinity : (nextX - ox) / dx, tz = dz === 0 ? Infinity : (nextZ - oz) / dz;
      const dtx = dx === 0 ? Infinity : MAP.cell / Math.abs(dx), dtz = dz === 0 ? Infinity : MAP.cell / Math.abs(dz);
      const tMax = far / Math.max(hlen, 1e-9) * hlen;
      while (t <= tMax && t < tBest) {
        cellTest(i, j);
        if (tx < tz) { t = tx; tx += dtx; i += sx; } else { t = tz; tz += dtz; j += sz; }
        if (i < -1 || j < -1 || i > CELLS || j > CELLS) break;
      }
    }
    if (!hit || tBest > far) return null;
    const n = new Vector3(hit[0], hit[1], hit[2]).normalize();
    if (n.y < 0) n.negate();
    const point = new Vector3(ox + dx * tBest, oy + dy * tBest, oz + dz * tBest);
    const r = out || {};
    r.point = point; r.normal = n; r.distance = tBest; r.surface = surfaceAt(point.x, point.z);
    return r;
  }

  const slopeAt = (x, z) => 1 - normalAt(x, z, _n).y;

  return { group, material, uniforms, heights, heightAt, surfaceLod, normalAt, slopeAt, maskAt, grassAt, surfaceAt, raycast, update, chunks, mids, supers, horizon, textures: { height: heightTex, mask: maskTex, grass: grassTex, normal: normalTex }, chunkGeometry };
}

register('world/terrain', 'height data, triangulation, raycast and chunk geometry agree', async ctx => {
  const t = ctx.world.terrain;
  assert(t.chunks.length === CHUNKS * CHUNKS, `expected ${CHUNKS * CHUNKS} chunks, got ${t.chunks.length}`);
  t.update({ x: 0, z: 0 });
  const farSupers = t.supers.meshes.filter(m => m.visible).length, nearMids = t.mids.meshes.filter(m => m.visible).length, drawn = t.chunks.filter(m => m.visible).length;
  assert(farSupers > 0 && nearMids > 0 && drawn > 0 && drawn + farSupers * SUPER * SUPER + nearMids * 4 === CHUNKS * CHUNKS, `terrain tiers must cover every chunk once: ${drawn} chunks, ${nearMids} mid and ${farSupers} far meshes`);
  t.update(ctx.world.camera.position);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < t.heights.length; i += 997) { lo = Math.min(lo, t.heights[i]); hi = Math.max(hi, t.heights[i]); }
  assert(lo > HEIGHT.min && hi < HEIGHT.min + HEIGHT.range && hi - lo > 50, `height range ${lo.toFixed(1)}..${hi.toFixed(1)} must be hilly and inside the 16-bit window`);
  for (const [x, z] of [[0, 0], [-333.3, 412.7], [701.1, -90.4]]) {
    const g = t.chunkGeometry(Math.floor((x + H) / 128), Math.floor((z + H) / 128), 0);
    const p = g.attributes.position.array;
    const idx = g.index.array;
    let found = false;
    for (let k = 0; k < idx.length && !found; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const minX = Math.min(p[a], p[b], p[c]), maxX = Math.max(p[a], p[b], p[c]), minZ = Math.min(p[a + 2], p[b + 2], p[c + 2]), maxZ = Math.max(p[a + 2], p[b + 2], p[c + 2]);
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const d = (p[b + 2] - p[c + 2]) * (p[a] - p[c]) + (p[c] - p[b]) * (p[a + 2] - p[c + 2]);
      if (Math.abs(d) < 1e-9) continue;
      const w1 = ((p[b + 2] - p[c + 2]) * (x - p[c]) + (p[c] - p[b]) * (z - p[c + 2])) / d;
      const w2 = ((p[c + 2] - p[a + 2]) * (x - p[c]) + (p[a] - p[c]) * (z - p[c + 2])) / d;
      const w3 = 1 - w1 - w2;
      if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
      found = true;
      const y = w1 * p[a + 1] + w2 * p[b + 1] + w3 * p[c + 1];
      assert(Math.abs(y - t.heightAt(x, z)) < 0.01, `heightAt ${t.heightAt(x, z).toFixed(3)} differs from the LOD0 mesh ${y.toFixed(3)} at ${x},${z}`);
    }
    assert(found, `no LOD0 triangle found at ${x},${z}`);
  }
  const o = new Vector3(120.5, 400, -310.2);
  const hit = t.raycast(o, new Vector3(0, -1, 0), 1000);
  assert(hit && Math.abs(hit.point.y - t.heightAt(o.x, o.z)) < 1e-3 && hit.normal.y > 0.3, 'a downward ray must hit the heightfield at heightAt');
  const slant = t.raycast(new Vector3(-800, t.heightAt(-800, 100) + 60, 100), new Vector3(0.8, -0.3, 0.5).normalize(), 3000);
  assert(slant && slant.point.y === t.heightAt(slant.point.x, slant.point.z) || slant && Math.abs(slant.point.y - t.heightAt(slant.point.x, slant.point.z)) < 0.01, 'a slanted ray must land on the surface');
  assert(t.raycast(new Vector3(0, 900, 0), new Vector3(0, 1, 0), 1000) === null, 'an upward ray must miss');
  const m = t.maskAt(-60, -6);
  assert(m.length === 4 && m.every(v => v >= 0 && v <= 1), 'mask values must be 0..1');
  const g0 = t.chunkGeometry(3, 3, 0), g3 = t.chunkGeometry(3, 3, 3);
  assert(g0.attributes.position.count === 65 * 65 + 4 * 65 && g3.attributes.position.count === 9 * 9 + 4 * 9, 'chunk vertex counts per LOD are wrong');
  assert(t.horizon.length === 2, 'two horizon rings expected');
});
