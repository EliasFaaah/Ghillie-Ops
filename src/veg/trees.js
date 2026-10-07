import { InstancedMesh, InstancedBufferAttribute, DynamicDrawUsage, StaticDrawUsage, Group, Vector3, Vector4, MeshStandardMaterial, MeshBasicMaterial, MeshDepthMaterial, BufferGeometry, BufferAttribute, DoubleSide, ShaderChunk } from 'three';
import { windUniforms, windGlsl } from './wind.js';
import { injectFog } from '../render/lighting.js';
import { REFLECTION_LAYER } from '../world/water.js';
import { register, assert, report } from '../core/selftest.js';

export const TREE_VARIANTS = {
  OakTree: [['OakTree', 13], ['BeechTree', 12.5]],
  SpruceTree: [['SpruceTree', 19]],
  BirchTree: [['BirchTree', 11]]
};
export const BUSH_MODEL = 'BushA';

const TREE_LODS = [
  { lod: 0, from: -10, to: 28, shadow: true, cap: 1400 },
  { lod: 1, from: 28, to: 85, cap: 5000 },
  { lod: 2, from: 85, to: 320, cap: 9000, cone: true },
  { imp: true, from: 320, to: 1e6 },
  { kind: 'shadow', from: 30, to: 360 },
  { kind: 'reflect', from: 12, to: 300 }
];
const BUSH_LODS = [
  { lod: 0, from: -10, to: 55, cap: 6000 },
  { lod: 1, from: 55, to: 170, cap: 9000, cone: true },
  { imp: true, from: 170, to: 1e6 }
];
const CONE_STEP = 0.3;
const BAND = 12;
const MOVE_THRESHOLD = 3;
const GRID = 64;
const PROXY_SHIFT = 3;
const proxyShift = { value: new Vector3() };

const VERTEX_PARS = `
${windGlsl}
uniform vec3 uCamPos;
uniform vec4 uFade;
uniform vec2 uSway;
varying float vFade;
`;

const VERTEX_WIND = `
#ifdef USE_INSTANCING
{
  vec3 iPos = vec3(instanceMatrix[3]);
  float id = distance(iPos.xz, uCamPos.xz);
  vFade = smoothstep(uFade.x, uFade.y, id) * (1.0 - smoothstep(uFade.z, uFade.w, id));
  float sc = length(vec3(instanceMatrix[0]));
  float hn = max(transformed.y, 0.0) / uSway.y;
  vec2 g = windGust(iPos);
  vec3 wd = vec3(g.x, 0.0, g.y) * (uSway.x * hn * hn);
  #ifdef LEAF_FLUTTER
    float ph = dot(transformed, vec3(12.9, 78.2, 37.7));
    wd += vec3(sin(uWindTime * 5.1 + ph), sin(uWindTime * 4.3 + ph * 1.7) * 0.5, cos(uWindTime * 4.7 + ph)) * (0.05 * hn * uWindAmp);
  #endif
  transformed += (transpose(mat3(instanceMatrix)) * wd) / (sc * sc);
}
#endif
`;

const TREE_IGN = 'float treeIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }';
const FRAGMENT_PARS = `
varying float vFade;
${TREE_IGN}
`;

const HASH_ALPHA = 'if ( impAl < treeIgn( gl_FragCoord.xy + vec2( vImpSeed * 7.3, vImpSeed * 3.1 ) ) * 0.8 + 0.1 ) discard;';
const IMP_PARS = `
uniform vec4 uImp;
uniform float uFrames;
varying vec2 vImpUV;
varying vec3 vImpW;
varying vec2 vImpA;
varying vec2 vImpB;
varying vec2 vImpC;
varying vec2 vRot;
varying float vImpSeed;
`;

const IMP_VERT_FN = `
vec2 impOct(vec3 d) {
  float s = abs(d.x) + max(d.y, 0.0) + abs(d.z) + 1e-5;
  vec2 o = vec2(d.x, d.z) / s;
  return vec2(o.x + o.y, o.x - o.y) * 0.5 + 0.5;
}
`;

const impVertex = shift => `
vec3 iBase = vec3(instanceMatrix[3]);
float iSc = length(vec3(instanceMatrix[0]));
mat3 iM = mat3(instanceMatrix);
vec3 iCenter = iBase + iM * uImp.xyz;
vec3 toCamW = normalize(cameraPosition - iCenter);
vec3 iRight = cross(vec3(0.0, 1.0, 0.0), toCamW);
iRight = length(iRight) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(iRight);
vec3 iUp = cross(toCamW, iRight);
vec3 wpos = iCenter + (iRight * position.x + iUp * position.y) * (uImp.w * iSc)${shift};
vec3 transformed = transpose(iM) * (wpos - iBase) / (iSc * iSc);
vec3 toCamM = normalize(transpose(iM) * toCamW);
vec2 impG = impOct(toCamM) * (uFrames - 1.0);
vec2 impCell = min(floor(impG), vec2(uFrames - 2.0));
vec2 impF = impG - impCell;
if (impF.x + impF.y < 1.0) {
  vImpA = impCell; vImpB = impCell + vec2(1.0, 0.0); vImpC = impCell + vec2(0.0, 1.0);
  vImpW = vec3(1.0 - impF.x - impF.y, impF.x, impF.y);
} else {
  vImpA = impCell + vec2(1.0, 1.0); vImpB = impCell + vec2(0.0, 1.0); vImpC = impCell + vec2(1.0, 0.0);
  vImpW = vec3(impF.x + impF.y - 1.0, 1.0 - impF.x, 1.0 - impF.y);
}
vImpW *= vImpW;
vImpW /= vImpW.x + vImpW.y + vImpW.z;
vImpUV = uv;
vImpSeed = fract(dot(iBase.xz, vec2(0.7548, 0.5698))) * 64.0;
vRot = vec2(instanceMatrix[0].x, -instanceMatrix[0].z) / iSc;
`;

const IMP_ALPHA = `
vec2 impUV = vec2(vImpUV.x, 1.0 - vImpUV.y);
vec4 impA0 = texture2D(tImpA, (vImpA + impUV) / uFrames);
vec4 impA1 = texture2D(tImpA, (vImpB + impUV) / uFrames);
vec4 impA2 = texture2D(tImpA, (vImpC + impUV) / uFrames);
float impW0 = vImpW.x * impA0.a, impW1 = vImpW.y * impA1.a, impW2 = vImpW.z * impA2.a;
float impAl = impW0 + impW1 + impW2;
${HASH_ALPHA}
`;

const IMP_MAP = `${IMP_ALPHA}
diffuseColor.rgb = (impA0.rgb * impW0 + impA1.rgb * impW1 + impA2.rgb * impW2) / impAl;
`;

const IMP_NORMAL = `
float faceDirection = 1.0;
vec3 normal;
{
  vec3 n0 = texture2D(tImpN, (vImpA + impUV) / uFrames).rgb * vImpW.x + texture2D(tImpN, (vImpB + impUV) / uFrames).rgb * vImpW.y + texture2D(tImpN, (vImpC + impUV) / uFrames).rgb * vImpW.z;
  vec3 nb = normalize(n0 * 2.0 - 1.0);
  vec3 nm = vec3(nb.x, nb.z, -nb.y);
  vec3 nw = vec3(vRot.x * nm.x + vRot.y * nm.z, nm.y, -vRot.y * nm.x + vRot.x * nm.z);
  vec3 eyeW = normalize(transpose(mat3(viewMatrix)) * vViewPosition);
  normal = normalize((viewMatrix * vec4(normalize(mix(nw, normalize(eyeW * 0.6 + vec3(0.0, 0.5, 0.0)), 0.4)), 0.0)).xyz);
}
vec3 nonPerturbedNormal = normal;
`;

const PHYS_FROM = '\treflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const PHYS_TO = `${PHYS_FROM}
#ifdef LEAF_TRANS
\tfloat lBack = saturate( - dot( directLight.direction, geometryViewDir ) );
\treflectedLight.directDiffuse += directLight.color * RECIPROCAL_PI * material.diffuseContribution * vec3( 0.9, 1.25, 0.4 ) * ( lBack * lBack * 0.45 );
#endif`;
const physPatched = ShaderChunk.lights_physical_pars_fragment.includes(PHYS_FROM);
if (!physPatched) report('veg/trees', new Error('three changed the physical direct light function, leaf translucency is missing'));
const PHYS_CHUNK = physPatched ? ShaderChunk.lights_physical_pars_fragment.replace(PHYS_FROM, PHYS_TO) : ShaderChunk.lights_physical_pars_fragment;

const COPY = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaTest', 'side', 'transparent', 'depthWrite', 'roughness', 'metalness', 'name', 'vertexColors'];

function softMaterial(base) {
  const m = new MeshStandardMaterial();
  for (const k of COPY) if (base[k] !== undefined) m[k] = base[k];
  m.color.copy(base.color);
  m.normalScale.copy(base.normalScale);
  return m;
}

function fadeMaterial(base, fade, sway, flutter) {
  const soft = flutter || /^solid_/i.test(base.name);
  const m = soft ? softMaterial(base) : base.clone();
  m.roughness = Math.max(m.roughness, flutter ? 0.85 : 0.9);
  if (flutter) { m.alphaTest = 0; m.alphaHash = true; }
  const uniforms = { uCamPos: { value: new Vector3() }, uFade: { value: fade }, uSway: { value: sway } };
  m.userData.treeUniforms = uniforms;
  m.onBeforeCompile = function (shader) {
    injectFog(shader);
    Object.assign(shader.uniforms, windUniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_WIND}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('void main() {', 'void main() {\n  if (vFade < 0.995 && vFade < treeIgn(gl_FragCoord.xy)) discard;');
    if (flutter) {
      shader.vertexShader = '#define LEAF_FLUTTER\n' + shader.vertexShader;
      shader.fragmentShader = '#define LEAF_TRANS\n' + shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', PHYS_CHUNK).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= 0.25;\nreflectedLight.indirectSpecular *= 0.2;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.05;');
    }
  };
  m.customProgramCacheKey = () => `tree${flutter ? 'L' : ''}`;
  return m;
}

function impostorMaterial(imp, fade) {
  const m = new MeshStandardMaterial({ roughness: 1, metalness: 0, color: 0xffffff });
  const uniforms = { uCamPos: { value: new Vector3() }, uFade: { value: fade } };
  m.userData.treeUniforms = uniforms;
  m.onBeforeCompile = function (shader) {
    injectFog(shader);
    Object.assign(shader.uniforms, imp.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}\n${IMP_PARS}\n${IMP_VERT_FN}`)
      .replace('#include <begin_vertex>', `${impVertex('')}\nvFade = smoothstep(uFade.x, uFade.y, distance(iBase.xz, uCamPos.xz)) * (1.0 - smoothstep(uFade.z, uFade.w, distance(iBase.xz, uCamPos.xz)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}\n${IMP_PARS}\nuniform sampler2D tImpA;\nuniform sampler2D tImpN;`)
      .replace('void main() {', 'void main() {\n  if (vFade < 0.995 && vFade < treeIgn(gl_FragCoord.xy)) discard;')
      .replace('#include <map_fragment>', IMP_MAP)
      .replace('#include <normal_fragment_begin>', IMP_NORMAL)
      .replace('#include <lights_physical_pars_fragment>', PHYS_CHUNK)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular = vec3( 0.0 );\nreflectedLight.indirectSpecular *= 0.2;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.05;');
    shader.fragmentShader = '#define LEAF_TRANS\n' + shader.fragmentShader;
  };
  m.customProgramCacheKey = () => 'treeImp';
  return m;
}

function impostorDepthMaterial(imp) {
  const m = new MeshDepthMaterial();
  m.onBeforeCompile = function (shader) {
    Object.assign(shader.uniforms, imp.uniforms, { uProxyShift: proxyShift });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uProxyShift;\n${IMP_PARS}\n${IMP_VERT_FN}`)
      .replace('#include <begin_vertex>', impVertex(' + uProxyShift'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TREE_IGN}\n${IMP_PARS}\nuniform sampler2D tImpA;`)
      .replace('#include <map_fragment>', IMP_ALPHA);
  };
  m.customProgramCacheKey = () => 'treeImpDepth';
  return m;
}

function leafDepthMaterial(base) {
  const m = new MeshDepthMaterial({ map: base.map });
  m.alphaHash = true;
  m.onBeforeCompile = function (shader) {
    shader.uniforms.uProxyShift = proxyShift;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uProxyShift;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed += (transpose(mat3(instanceMatrix)) * uProxyShift) / dot(vec3(instanceMatrix[0]), vec3(instanceMatrix[0]));\n#endif');
  };
  m.customProgramCacheKey = () => 'treeLeafDepth';
  return m;
}

const QUAD = (() => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

class InstanceSet {
  constructor(name, model, data, lods, sway, height, imp) {
    this.name = name;
    this.n = data.length / 5;
    this.data = data;
    this.cos = new Float32Array(this.n);
    this.sin = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { this.cos[i] = Math.cos(data[i * 5 + 3]) * data[i * 5 + 4]; this.sin[i] = Math.sin(data[i * 5 + 3]) * data[i * 5 + 4]; }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, data[i * 5]); maxX = Math.max(maxX, data[i * 5]);
      minZ = Math.min(minZ, data[i * 5 + 2]); maxZ = Math.max(maxZ, data[i * 5 + 2]);
    }
    this.gx = minX;
    this.gz = minZ;
    this.gnx = Math.floor((maxX - minX) / GRID) + 1;
    this.gnz = Math.floor((maxZ - minZ) / GRID) + 1;
    const cellOf = i => Math.floor((data[i * 5 + 2] - minZ) / GRID) * this.gnx + Math.floor((data[i * 5] - minX) / GRID);
    this.start = new Uint32Array(this.gnx * this.gnz + 1);
    for (let i = 0; i < this.n; i++) this.start[cellOf(i) + 1]++;
    for (let k = 0; k < this.gnx * this.gnz; k++) this.start[k + 1] += this.start[k];
    const fill = this.start.slice(0, -1);
    this.order = new Uint32Array(this.n);
    for (let i = 0; i < this.n; i++) this.order[fill[cellOf(i)]++] = i;
    this.lods = [];
    this.group = new Group();
    this.group.name = name;
    for (const cfg of lods) {
      const isImp = !!(cfg.imp || cfg.kind);
      if (isImp && !imp) continue;
      const visuals = isImp ? [{ geometry: QUAD, material: null }] : model.visuals.filter(v => v.lod === cfg.lod);
      if (!visuals.length) continue;
      const cap = Math.min(this.n, cfg.cap || this.n);
      const fixed = cfg.imp === true;
      const cone = !!cfg.cone;
      const matrix = new InstancedBufferAttribute(new Float32Array(cap * 16), 16);
      matrix.setUsage(fixed ? StaticDrawUsage : DynamicDrawUsage);
      const fade = [cfg.from === -10 ? -2 : cfg.from - BAND, cfg.from === -10 ? -1 : cfg.from + BAND, cfg.to - BAND, cfg.to + BAND];
      const meshes = visuals.map(v => {
        const caster = cfg.kind === 'shadow';
        let material;
        if (isImp) material = caster ? new MeshBasicMaterial({ colorWrite: false, depthWrite: false }) : impostorMaterial(imp, fade.slice());
        else material = fadeMaterial(v.material, fade.slice(), [sway, height], /^leaf_/i.test(v.material.name));
        const mesh = new InstancedMesh(v.geometry, material, cap);
        mesh.instanceMatrix = matrix;
        mesh.count = 0;
        mesh.frustumCulled = false;
        if (caster) mesh.customDepthMaterial = impostorDepthMaterial(imp);
        else if (cfg.shadow && /^leaf_/i.test(v.material.name)) mesh.customDepthMaterial = leafDepthMaterial(v.material);
        mesh.castShadow = caster || !!cfg.shadow;
        mesh.receiveShadow = !caster;
        mesh.name = `${name}_${cfg.kind || 'lod' + cfg.lod}`;
        if (cfg.kind === 'reflect') mesh.layers.set(REFLECTION_LAYER);
        this.group.add(mesh);
        return mesh;
      });
      const entry = { cfg, cap, matrix, meshes, count: 0, fixed, cone, uniforms: meshes.map(m => m.material.userData.treeUniforms).filter(Boolean) };
      if (fixed) {
        for (let i = 0; i < this.n; i++) this.place(entry, entry.count++, i);
        for (const m of meshes) m.count = entry.count;
      }
      this.lods.push(entry);
    }
    this.dynamic = this.lods.filter(l => !l.fixed);
    this.range = Math.max(...this.dynamic.map(l => l.cfg.to + BAND + 4));
    this.lastX = 1e9;
    this.lastZ = 1e9;
    this.lastYaw = 1e9;
  }

  place(l, slot, i) {
    const a = l.matrix.array, o = slot * 16, c = this.cos[i], s = this.sin[i], d = this.data, sc = d[i * 5 + 4];
    a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sc; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = d[i * 5]; a[o + 13] = d[i * 5 + 1]; a[o + 14] = d[i * 5 + 2]; a[o + 15] = 1;
  }

  update(cam, force = false, view = null) {
    const yaw = view ? Math.atan2(view.x, view.z) : 0;
    let dyaw = Math.abs(yaw - this.lastYaw);
    if (dyaw > Math.PI) dyaw = 2 * Math.PI - dyaw;
    const moved = Math.hypot(cam.x - this.lastX, cam.z - this.lastZ) >= MOVE_THRESHOLD;
    if (!force && !moved && dyaw < CONE_STEP) {
      for (const l of this.lods) for (const u of l.uniforms) u.uCamPos.value.copy(cam);
      return;
    }
    this.lastX = cam.x;
    this.lastZ = cam.z;
    this.lastYaw = yaw;
    const { data, dynamic, order, start, gnx, gnz, range } = this;
    for (const l of dynamic) l.count = 0;
    const x0 = Math.max(0, Math.floor((cam.x - range - this.gx) / GRID)), x1 = Math.min(gnx - 1, Math.floor((cam.x + range - this.gx) / GRID));
    const z0 = Math.max(0, Math.floor((cam.z - range - this.gz) / GRID)), z1 = Math.min(gnz - 1, Math.floor((cam.z + range - this.gz) / GRID));
    const cosReach = view ? view.cosReach : -2;
    const vx = view ? view.x : 0, vz = view ? view.z : 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = cz * gnx + cx;
        for (let k = start[cell]; k < start[cell + 1]; k++) {
          const i = order[k];
          const dx = data[i * 5] - cam.x, dz = data[i * 5 + 2] - cam.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          const inCone = d < 60 || dx * vx + dz * vz >= cosReach * d;
          for (const l of dynamic) {
            const { from, to } = l.cfg;
            if (d < from - BAND - 4 || d > to + BAND + 4 || l.count >= l.cap || (l.cone && !inCone)) continue;
            this.place(l, l.count++, i);
          }
        }
      }
    }
    for (const l of dynamic) {
      l.matrix.clearUpdateRanges();
      l.matrix.addUpdateRange(0, Math.max(1, l.count) * 16);
      l.matrix.needsUpdate = true;
      for (const m of l.meshes) m.count = l.count;
    }
    for (const l of this.lods) for (const u of l.uniforms) u.uCamPos.value.copy(cam);
  }

  counts() {
    return this.lods.map(l => l.count);
  }
}

export async function loadImpostors(assets) {
  const data = await fetch('/assets/textures/trees/impostors.json').then(r => r.json());
  const names = Object.keys(data);
  const textures = await Promise.all(names.map(n => Promise.all([assets.texture(`/assets/textures/trees/${n}_imp_a.ktx2`), assets.texture(`/assets/textures/trees/${n}_imp_n.ktx2`)])));
  return { data, textures: Object.fromEntries(names.map((n, i) => [n, { a: textures[i][0], n: textures[i][1] }])) };
}

export function createImpostors(atlas) {
  const out = new Map();
  for (const [name, e] of Object.entries(atlas.data)) {
    const a = atlas.textures[name];
    if (!a) continue;
    out.set(name, { uniforms: { uImp: { value: new Vector4(e.center[0], e.center[1], e.center[2], e.radius) }, uFrames: { value: e.frames }, tImpA: { value: a.a }, tImpN: { value: a.n } } });
  }
  return out;
}

function splitPlacements(list, k) {
  const parts = Array.from({ length: k }, () => []);
  const n = list.length / 5;
  for (let i = 0; i < n; i++) parts[i % k].push(list[i * 5], list[i * 5 + 1], list[i * 5 + 2], list[i * 5 + 3], list[i * 5 + 4]);
  return parts;
}

export function createVegetation(models, placements, sun, impostors) {
  const group = new Group();
  group.name = 'vegetation';
  const sets = [];
  const add = (name, modelName, list, lods, sway, height) => {
    const model = models.get(modelName);
    if (!list || !list.length || !model) return;
    const s = new InstanceSet(name, model, Float32Array.from(list), lods, sway, height, impostors.get(modelName) || null);
    sets.push(s);
    group.add(s.group);
  };
  for (const [place, variants] of Object.entries(TREE_VARIANTS)) {
    const parts = splitPlacements(placements[place] || [], variants.length);
    variants.forEach(([modelName, h], i) => add(i === 0 ? place : modelName, modelName, parts[i], TREE_LODS, 0.55, h));
  }
  add('BushA', BUSH_MODEL, placements.BushA, BUSH_LODS, 0.12, 1.8);
  for (const [name, h, far] of [['Fern', 0.5, 70]]) add(name, name, placements[name], [{ lod: 0, from: -10, to: far, shadow: false }], 0.12, h);
  return {
    group, sets,
    update(cam, force = false, view = null) {
      proxyShift.value.copy(sun.position).multiplyScalar(-PROXY_SHIFT);
      for (const s of sets) s.update(cam, force, view);
    }
  };
}

register('veg/trees', 'bush sets pick LODs by distance, keep dither fades and draw every bush as an impostor', ctx => {
  const veg = ctx.world.vegetation;
  const bush = veg.sets.find(s => s.name === 'BushA');
  assert(bush && bush.n > 500, 'bush instances missing');
  assert(physPatched, 'leaf translucency patch missing');
  veg.update(new Vector3(0, 50, 0), true);
  const imp = bush.lods.find(l => l.fixed);
  assert(imp && imp.count === bush.n, 'the impostor list must hold every bush, whatever its size or distance');
  veg.update(new Vector3(60000, 50, 60000), true);
  assert(bush.dynamic.every(l => l.count === 0), 'bushes far from the camera must not be in the near lists');
  veg.update(ctx.world.camera.position, true);
  for (const l of bush.lods) assert(l.meshes.every(m => m.material.onBeforeCompile && m.material.userData.treeUniforms.uFade.value.length === 4), 'LOD fade uniforms missing');
});
