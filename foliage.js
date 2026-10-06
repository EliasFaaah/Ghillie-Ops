import { Group, BufferGeometry, BufferAttribute, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, MeshDepthMaterial, DoubleSide, Vector2, Vector3, Box3, ShaderChunk, DynamicDrawUsage } from 'three';
import { windUniforms, windGlsl } from './wind.js';
import { injectFog } from '../render/lighting.js';
import { extractPlanes } from '../core/cull.js';
import { register, assert, report } from '../core/selftest.js';

export const FOLIAGE = { leafPx: 1.4, r1Px: 4, branchPx: 0.7, shadowTexels: 1.5, full: false };
const PAGE = 512;
const CHUNK = 32;
const ORIGIN = -1100;
const GRID = 70;
const LEVELS = 14;
const RATIO = 0.58;
const LOG_RATIO = Math.log(RATIO);
const BRANCH_DIST = [0, 3, 6, 12, 24, 48, 96, 192, 384, 768, 1536];
const BRANCH_FOCAL = 960 / 0.7;
const BLEND = 0.5;

const PHYS_FROM = '\treflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const PHYS_TO = `${PHYS_FROM}
#ifdef LEAF_TRANS
\tfloat lBack = saturate( - dot( directLight.direction, geometryViewDir ) );
\treflectedLight.directDiffuse += directLight.color * RECIPROCAL_PI * material.diffuseContribution * vec3( 0.9, 1.25, 0.4 ) * ( lBack * lBack * 0.5 );
#endif`;
const physPatched = ShaderChunk.lights_physical_pars_fragment.includes(PHYS_FROM);
if (!physPatched) report('veg/foliage', new Error('three changed the physical direct light function, leaf translucency is missing'));
const PHYS_CHUNK = physPatched ? ShaderChunk.lights_physical_pars_fragment.replace(PHYS_FROM, PHYS_TO) : ShaderChunk.lights_physical_pars_fragment;

const COMMON_PARS = `
uniform vec3 uBoxC;
uniform vec3 uBoxH;
uniform vec3 uCrown;
uniform vec2 uSway;
${windGlsl}
`;

const LEAF_ATTRS = `
attribute vec3 iF;
attribute vec4 aLeaf;
attribute vec4 aN4;
attribute vec4 aCol;
float lHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
`;

const LEAF_PARS = `
${LEAF_ATTRS}
varying float vAO;
varying float vSeed;
varying float vFk;
varying vec3 vLeafCol;
`;

const LEAF_NORMAL = `
vec3 lcB = uBoxC + uBoxH * aLeaf.xyz;
float lNk = mix(0.3, 0.85, smoothstep(0.0, 0.8, 1.0 - iF.z));
objectNormal = normalize(mix(objectNormal, normalize(lcB - uCrown + vec3(0.0, 0.4, 0.0)), lNk));
`;

const LEAF_WIND = `
#ifdef USE_INSTANCING
{
  vec3 iPos = vec3(instanceMatrix[3]);
  float sc = length(vec3(instanceMatrix[0]));
  float hn = max(lcC.y, 0.0) / uSway.y;
  vec2 g = windGust(iPos);
  vec3 wd = vec3(g.x, 0.0, g.y) * (uSway.x * hn * hn);
  float ph = lHash(lcC * 7.31) * 43.98;
  wd += vec3(sin(uWindTime * 5.1 + ph), sin(uWindTime * 4.3 + ph * 1.7) * 0.5, cos(uWindTime * 4.7 + ph)) * (0.03 * hn * uWindAmp);
  transformed += (transpose(mat3(instanceMatrix)) * wd) / (sc * sc);
}
#endif
`;

const LEAF_BEGIN = `
vec3 lcC = uBoxC + uBoxH * aLeaf.xyz;
vec3 transformed = lcC + (uBoxC + uBoxH * position.xyz - lcC) * inversesqrt(max(iF.z, 1e-4));
vSeed = lHash(lcC * 7.31);
vFk = iF.z;
vAO = aN4.w;
vLeafCol = aCol.rgb;
${LEAF_WIND}
`;

const LEAF_DEPTH_BEGIN = `
vec3 lcC = uBoxC + uBoxH * aLeaf.xyz;
vec3 transformed = lcC + (uBoxC + uBoxH * position.xyz - lcC) * inversesqrt(max(iF.z, 1e-4));
${LEAF_WIND}
`;

const LEAF_CULL = '#include <project_vertex>\nif (aLeaf.w < iF.x || aLeaf.w >= iF.y) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);';

const BRANCH_BEGIN = `
vec3 transformed = uBoxC + uBoxH * position.xyz;
#ifdef USE_INSTANCING
{
  vec3 iPos = vec3(instanceMatrix[3]);
  float sc = length(vec3(instanceMatrix[0]));
  float hn = max(transformed.y, 0.0) / uSway.y;
  vec2 g = windGust(iPos);
  vec3 wd = vec3(g.x, 0.0, g.y) * (uSway.x * hn * hn);
  transformed += (transpose(mat3(instanceMatrix)) * wd) / (sc * sc);
}
#endif
`;

const LEAF_FRAGMENT_PARS = `
varying float vAO;
varying float vSeed;
varying float vFk;
varying vec3 vLeafCol;
uniform vec3 uMean;
`;

const leafColor = r1 => `
${r1 ? 'diffuseColor.rgb = sRGBTransferEOTF(vec4(vLeafCol, 1.0)).rgb;' : ''}
{
  float hv = vSeed - 0.5;
  vec3 lcol = diffuseColor.rgb * vec3(1.0 + 0.2 * hv, 1.0 + 0.1 * hv + 0.08 * fract(vSeed * 13.7), 1.0 - 0.24 * hv);
  diffuseColor.rgb = mix(uMean, lcol, pow(clamp(vFk, 0.0, 1.0), 0.18));
}
`;

const AO_FRAGMENT = `
#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vAO;
reflectedLight.directDiffuse *= mix(0.55, 1.0, vAO);
`;

function leafMaterial(sp, r1) {
  const m = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.62, metalness: 0, map: r1 ? null : sp.leafTex });
  m.onBeforeCompile = shader => {
    injectFog(shader);
    Object.assign(shader.uniforms, windUniforms, sp.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_PARS}\n${LEAF_PARS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${LEAF_NORMAL}`)
      .replace('#include <begin_vertex>', LEAF_BEGIN)
      .replace('#include <project_vertex>', LEAF_CULL);
    shader.fragmentShader = '#define LEAF_TRANS\n' + shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LEAF_FRAGMENT_PARS}`)
      .replace('#include <lights_physical_pars_fragment>', PHYS_CHUNK)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${leafColor(r1)}`)
      .replace('#include <aomap_fragment>', AO_FRAGMENT)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= 0.25;\nreflectedLight.indirectSpecular *= 0.2;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.04;');
  };
  m.customProgramCacheKey = () => `foliageLeaf${r1 ? 1 : 0}`;
  return m;
}

function leafDepthMaterial(sp) {
  const m = new MeshDepthMaterial();
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, windUniforms, sp.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_PARS}\n${LEAF_ATTRS}`)
      .replace('#include <begin_vertex>', LEAF_DEPTH_BEGIN)
      .replace('#include <project_vertex>', LEAF_CULL);
  };
  m.customProgramCacheKey = () => 'foliageLeafDepth';
  return m;
}

function branchMaterial(sp, part) {
  const t = part.textures;
  const m = new MeshStandardMaterial({ map: t.diff || null, normalMap: t.nor || null, roughnessMap: t.arm || null, roughness: 1, metalness: 0, side: DoubleSide });
  m.onBeforeCompile = shader => {
    injectFog(shader);
    Object.assign(shader.uniforms, windUniforms, sp.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_PARS}`)
      .replace('#include <begin_vertex>', BRANCH_BEGIN);
  };
  m.customProgramCacheKey = () => 'foliageBranch';
  return m;
}

function branchDepthMaterial(sp) {
  const m = new MeshDepthMaterial();
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, windUniforms, sp.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON_PARS}`)
      .replace('#include <begin_vertex>', BRANCH_BEGIN);
  };
  m.customProgramCacheKey = () => 'foliageBranchDepth';
  return m;
}

function shareGeometry(base) {
  const g = new BufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) g.setAttribute(k, a);
  g.setIndex(base.index);
  g.setDrawRange(base.drawRange.start, base.drawRange.count);
  return g;
}

function leafGeometry0(meta, buf) {
  const nv = meta.verts0, ni = meta.idx0, n = meta.leaves;
  let o = 0;
  const p = new Int16Array(buf, o, nv * 4); o += nv * 8;
  const nr = new Int8Array(buf, o, nv * 4); o += nv * 4;
  const uv = new Uint16Array(buf, o, nv * 2); o += nv * 4;
  const lc = new Int16Array(buf, o, nv * 4); o += nv * 8;
  const idx = new Uint32Array(buf, o, ni); o += ni * 4;
  const cum = new Uint32Array(buf, o, n + 1);
  const g = new BufferGeometry();
  const na = new BufferAttribute(nr, 4, true);
  g.setAttribute('position', new BufferAttribute(p, 4, true));
  g.setAttribute('normal', na);
  g.setAttribute('aN4', na);
  g.setAttribute('aCol', na);
  g.setAttribute('uv', new BufferAttribute(uv, 2, true));
  g.setAttribute('aLeaf', new BufferAttribute(lc, 4, true));
  g.setIndex(new BufferAttribute(idx, 1));
  return { geometry: g, cum };
}

function leafGeometry1(meta, buf) {
  const n = meta.leaves, nq = n * 4;
  let o = 0;
  const p = new Int16Array(buf, o, nq * 4); o += nq * 8;
  const nr = new Int8Array(buf, o, nq * 4); o += nq * 4;
  const col = new Uint8Array(buf, o, nq * 4); o += nq * 4;
  const lc = new Int16Array(buf, o, nq * 4); o += nq * 8;
  const idx = new Uint32Array(buf, o, n * 6);
  const g = new BufferGeometry();
  const na = new BufferAttribute(nr, 4, true);
  g.setAttribute('position', new BufferAttribute(p, 4, true));
  g.setAttribute('normal', na);
  g.setAttribute('aN4', na);
  g.setAttribute('aCol', new BufferAttribute(col, 4, true));
  g.setAttribute('aLeaf', new BufferAttribute(lc, 4, true));
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

function branchGeometry(bb, lod) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Int16Array(bb, lod.pos, lod.verts * 4), 4, true));
  g.setAttribute('normal', new BufferAttribute(new Int8Array(bb, lod.nrm, lod.verts * 4), 4, true));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(bb, lod.uv, lod.verts * 2), 2));
  g.setIndex(new BufferAttribute(new Uint32Array(bb, lod.index, lod.idx), 1));
  return g;
}

export async function loadFoliage(assets, names) {
  const out = new Map();
  await Promise.all(names.map(async name => {
    const base = `/assets/trees/${name}`;
    const [meta, r0, r1, bb] = await Promise.all([fetch(`${base}.json`).then(r => r.json()), ...['r0', 'r1', 'b'].map(k => fetch(`${base}.${k}.bin`).then(r => r.arrayBuffer()))]);
    const leafTex = await assets.texture(meta.atlas, { srgb: true });
    leafTex.flipY = false;
    const parts = await Promise.all(meta.branches.parts.map(async p => {
      const entries = await Promise.all(Object.entries(p.files).map(async ([k, u]) => { const t = await assets.texture(u, { srgb: k === 'diff' }); t.flipY = false; return [k, t]; }));
      return { meta: p, textures: Object.fromEntries(entries) };
    }));
    out.set(name, { name, meta, r0, r1, bb, leafTex, parts });
  }));
  return out;
}

class Lane {
  constructor(parent, makeSpecs, cascade) {
    this.parent = parent;
    this.makeSpecs = makeSpecs;
    this.cascade = cascade;
    this.specs = null;
    this.pages = [];
    this.n = 0;
  }

  make(pi) {
    if (!this.specs) this.specs = this.makeSpecs();
    const { list, wantF } = this.specs;
    const f = wantF ? new InstancedBufferAttribute(new Float32Array(PAGE * 3), 3).setUsage(DynamicDrawUsage) : null;
    let matrix = null;
    const cascade = this.cascade;
    const meshes = list.map(spec => {
      const g = shareGeometry(spec.geometry);
      if (f) g.setAttribute('iF', f);
      const mesh = new InstancedMesh(g, cascade ? spec.depthMaterial : spec.material, PAGE);
      if (matrix) mesh.instanceMatrix = matrix; else { matrix = mesh.instanceMatrix; matrix.setUsage(DynamicDrawUsage); }
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      mesh.count = 0;
      mesh.userData.n = 0;
      if (cascade) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.customDepthMaterial = spec.depthMaterial;
        mesh.onBeforeShadow = function (r, o, c, shadowCamera) { o.count = shadowCamera === cascade.shadow.getCamera(cascade.index) ? o.userData.n : 0; };
        mesh.onBeforeRender = function () { this.count = 0; };
      } else {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      }
      this.parent.add(mesh);
      return mesh;
    });
    this.pages[pi] = { matrix, f, meshes };
    return this.pages[pi];
  }

  push(x, y, z, c, s, sc, lo, hi, kf) {
    const pi = (this.n / PAGE) | 0, k = this.n - pi * PAGE;
    const pg = this.pages[pi] || this.make(pi);
    const a = pg.matrix.array, o = k * 16;
    a[o] = c; a[o + 1] = 0; a[o + 2] = -s; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sc; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    if (pg.f) { const q = k * 3; pg.f.array[q] = lo; pg.f.array[q + 1] = hi; pg.f.array[q + 2] = kf; }
    this.n++;
  }

  begin() { this.n = 0; }

  end() {
    const n = this.n;
    for (let pi = 0; pi < this.pages.length; pi++) {
      const pg = this.pages[pi];
      const cnt = Math.max(0, Math.min(PAGE, n - pi * PAGE));
      for (const m of pg.meshes) { m.visible = cnt > 0; m.userData.n = cnt; if (!this.cascade) m.count = cnt; }
      if (cnt > 0) {
        pg.matrix.clearUpdateRanges();
        pg.matrix.addUpdateRange(0, cnt * 16);
        pg.matrix.needsUpdate = true;
        if (pg.f) {
          pg.f.clearUpdateRanges();
          pg.f.addUpdateRange(0, cnt * 3);
          pg.f.needsUpdate = true;
        }
      }
    }
  }
}

class PassSet {
  constructor(sp, cascade) {
    this.sp = sp;
    this.cascade = cascade;
    this.r0 = null;
    this.r1 = [];
    this.br = [];
    this.all = [];
  }

  add(lane) {
    this.all.push(lane);
    return lane;
  }

  lane0() {
    return this.r0 || (this.r0 = this.add(new Lane(this.sp.group, () => this.sp.specsR0(), null)));
  }

  lane1(k) {
    return this.r1[k] || (this.r1[k] = this.add(new Lane(this.sp.group, () => this.sp.specsR1(k), this.cascade)));
  }

  laneB(m) {
    return this.br[m] || (this.br[m] = this.add(new Lane(this.sp.group, () => this.sp.specsBranch(m), this.cascade)));
  }

  begin() { for (const l of this.all) l.begin(); }

  end() { for (const l of this.all) l.end(); }
}

class Species {
  constructor(data, list, opts, shadow) {
    this.name = data.name;
    this.data = data;
    const meta = data.meta;
    this.meta = meta;
    this.group = new Group();
    this.group.name = data.name;
    this.n = list.length / 5;
    this.uniforms = {
      uBoxC: { value: new Vector3(...meta.boxC) },
      uBoxH: { value: new Vector3(...meta.boxH) },
      uCrown: { value: new Vector3(...meta.crown) },
      uSway: { value: new Vector2(opts.sway, opts.height) },
      uMean: { value: new Vector3(...meta.meanColor) }
    };
    const g0 = leafGeometry0(meta, data.r0);
    this.geo0 = g0.geometry;
    this.cum0 = g0.cum;
    this.geo1 = leafGeometry1(meta, data.r1);
    this.leafTex = data.leafTex;
    this.levelGeo = [];
    this.branchGeo = new Map();
    this.leafMat0 = leafMaterial(this, false);
    this.leafMat1 = leafMaterial(this, true);
    this.leafDepth = leafDepthMaterial(this);
    this.branchDepth = branchDepthMaterial(this);
    this.partMats = data.parts.map(p => branchMaterial(this, p));
    this.hMid = (meta.boxC[1] + meta.boxH[1]) * 0.5;
    this.radius = Math.max(meta.boxH[0], meta.boxH[2]);
    this.top = meta.boxC[1] + meta.boxH[1];
    this.leafSize = meta.leafSize;
    this.build(list);
    this.main = new PassSet(this, null);
    this.casters = shadow.map((s, i) => new PassSet(this, { shadow: s, index: i }));
  }

  build(list) {
    const n = this.n;
    const cells = GRID * GRID;
    const cell = new Uint32Array(n);
    const count = new Uint32Array(cells + 1);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(GRID - 1, Math.max(0, Math.floor((list[i * 5] - ORIGIN) / CHUNK))), cz = Math.min(GRID - 1, Math.max(0, Math.floor((list[i * 5 + 2] - ORIGIN) / CHUNK)));
      cell[i] = cz * GRID + cx;
      count[cell[i] + 1]++;
    }
    for (let c = 0; c < cells; c++) count[c + 1] += count[c];
    this.data5 = new Float32Array(n * 5);
    this.cs = new Float32Array(n);
    this.sn = new Float32Array(n);
    const ids = [];
    for (let c = 0; c < cells; c++) if (count[c + 1] > count[c]) ids.push(c);
    this.chunks = Uint32Array.from(ids);
    this.start = new Uint32Array(ids.length + 1);
    this.box = new Float32Array(ids.length * 6);
    this.cellSlot = new Int32Array(cells).fill(-1);
    ids.forEach((c, k) => { this.cellSlot[c] = k; this.start[k + 1] = this.start[k] + (count[c + 1] - count[c]); });
    const pos = this.start.slice(0, -1);
    for (let k = 0; k < ids.length; k++) { this.box[k * 6] = 1e9; this.box[k * 6 + 1] = 1e9; this.box[k * 6 + 2] = 1e9; this.box[k * 6 + 3] = -1e9; this.box[k * 6 + 4] = -1e9; this.box[k * 6 + 5] = -1e9; }
    for (let i = 0; i < n; i++) {
      const k = this.cellSlot[cell[i]];
      const d = pos[k]++;
      const sc = list[i * 5 + 4];
      for (let q = 0; q < 5; q++) this.data5[d * 5 + q] = list[i * 5 + q];
      this.cs[d] = Math.cos(list[i * 5 + 3]) * sc;
      this.sn[d] = Math.sin(list[i * 5 + 3]) * sc;
      const r = this.radius * sc, b = this.box, o = k * 6;
      b[o] = Math.min(b[o], list[i * 5] - r); b[o + 1] = Math.min(b[o + 1], list[i * 5 + 1]); b[o + 2] = Math.min(b[o + 2], list[i * 5 + 2] - r);
      b[o + 3] = Math.max(b[o + 3], list[i * 5] + r); b[o + 4] = Math.max(b[o + 4], list[i * 5 + 1] + this.top * sc); b[o + 5] = Math.max(b[o + 5], list[i * 5 + 2] + r);
    }
  }

  levelGeometry(k) {
    if (!this.levelGeo[k]) {
      const g = shareGeometry(this.geo1);
      g.setDrawRange(0, 6 * Math.min(this.meta.leaves, Math.ceil(Math.pow(RATIO, k) * this.meta.leaves)));
      this.levelGeo[k] = g;
    }
    return this.levelGeo[k];
  }

  partGeometry(pi, m) {
    const part = this.data.parts[pi].meta;
    let lod = part.lods[0];
    for (const l of part.lods) if (l.dist <= BRANCH_DIST[m]) lod = l;
    const key = `${pi}.${lod.dist}`;
    if (!this.branchGeo.has(key)) this.branchGeo.set(key, branchGeometry(this.data.bb, lod));
    return this.branchGeo.get(key);
  }

  specsR0() {
    return { wantF: true, list: [{ geometry: this.geo0, material: this.leafMat0, depthMaterial: this.leafDepth }] };
  }

  specsR1(k) {
    return { wantF: true, list: [{ geometry: this.levelGeometry(k), material: this.leafMat1, depthMaterial: this.leafDepth }] };
  }

  specsBranch(m) {
    return { wantF: false, list: this.data.parts.map((p, pi) => ({ geometry: this.partGeometry(pi, m), material: this.partMats[pi], depthMaterial: this.branchDepth })) };
  }

  cullMain(planes, cx, cy, cz, pxPerRad, horizon) {
    const pass = this.main;
    pass.begin();
    const { chunks, start, box, data5, cs, sn } = this;
    const leafK = this.leafSize * pxPerRad, qB = BRANCH_FOCAL * FOLIAGE.branchPx / pxPerRad, rr = this.radius, hm = this.hMid;
    const target = FOLIAGE.leafPx, r1Px = FOLIAGE.r1Px, full = FOLIAGE.full;
    for (let k = 0; k < chunks.length; k++) {
      const o = k * 6;
      const x0 = box[o], y0 = box[o + 1], z0 = box[o + 2], x1 = box[o + 3], y1 = box[o + 4], z1 = box[o + 5];
      let inside = true;
      for (let p = 0; p < 16; p += 4) {
        const a = planes[p], b = planes[p + 1], c = planes[p + 2];
        if (a * (a >= 0 ? x1 : x0) + b * (b >= 0 ? y1 : y0) + c * (c >= 0 ? z1 : z0) + planes[p + 3] < 0) { inside = false; break; }
      }
      if (!inside) continue;
      if (horizon && !horizon.visible(x0, z0, x1, z1, y1)) continue;
      for (let i = start[k], e = start[k + 1]; i < e; i++) {
        const q = i * 5;
        const sc = data5[q + 4], x = data5[q], y = data5[q + 1], z = data5[q + 2];
        const dx = x - cx, dy = y + hm * sc - cy, dz = z - cz;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.6 * rr * sc, 0.8);
        const c = cs[i], s = sn[i];
        const leafPx = leafK * sc / d;
        if (full || leafPx >= r1Px * (1 + BLEND)) pass.lane0().push(x, y, z, c, s, sc, 0, 1, 1);
        else if (leafPx >= r1Px) {
          const a = (leafPx - r1Px) / (r1Px * BLEND);
          pass.lane0().push(x, y, z, c, s, sc, 0, a, 1);
          pass.lane1(0).push(x, y, z, c, s, sc, a, 1, 1);
        } else if (leafPx >= target) pass.lane1(0).push(x, y, z, c, s, sc, 0, 1, 1);
        else {
          const f = Math.max(leafPx * leafPx / (target * target), Math.pow(RATIO, LEVELS - 1));
          const lv = Math.min(LEVELS - 1, Math.max(0, Math.ceil(Math.log(f) / LOG_RATIO - 1e-6)));
          pass.lane1(lv).push(x, y, z, c, s, sc, 0, f, f);
        }
        const lim = qB * d / sc;
        let m = 0;
        while (m + 1 < BRANCH_DIST.length && BRANCH_DIST[m + 1] <= lim) m++;
        pass.laneB(m).push(x, y, z, c, s, sc, 0, 1, 1);
      }
    }
    pass.end();
  }

  cullShadow(i, frustum, texel, box3, view) {
    const pass = this.casters[i];
    pass.begin();
    const { start, box, data5, cs, sn, cellSlot } = this;
    const { planes, fx, fy, fz, base, near, far, sx, sy, sz, cx, cz, reach } = view;
    const leafT = this.leafSize / texel, st = FOLIAGE.shadowTexels, qB = BRANCH_FOCAL * st * texel;
    const g0x = Math.max(0, Math.floor((cx - reach - ORIGIN) / CHUNK)), g1x = Math.min(GRID - 1, Math.floor((cx + reach - ORIGIN) / CHUNK));
    const g0z = Math.max(0, Math.floor((cz - reach - ORIGIN) / CHUNK)), g1z = Math.min(GRID - 1, Math.floor((cz + reach - ORIGIN) / CHUNK));
    for (let gz = g0z; gz <= g1z; gz++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const k = cellSlot[gz * GRID + gx];
        if (k < 0) continue;
        const o = k * 6;
        const x0 = box[o], y0 = box[o + 1], z0 = box[o + 2], x1 = box[o + 3], y1 = box[o + 4], z1 = box[o + 5];
        box3.min.set(x0, y0, z0);
        box3.max.set(x1, y1, z1);
        if (!frustum.intersectsBox(box3)) continue;
        const t = Math.min(160, (y1 - y0 + 14) * sy);
        const wx = -sx * t, wy = -t * view.sunY, wz = -sz * t;
        const bx0 = Math.min(x0, x0 + wx), bx1 = Math.max(x1, x1 + wx), by0 = Math.min(y0, y0 + wy), bz0 = Math.min(z0, z0 + wz), bz1 = Math.max(z1, z1 + wz);
        let inside = true;
        for (let p = 0; p < 16; p += 4) {
          const a = planes[p], b = planes[p + 1], c = planes[p + 2];
          if (a * (a >= 0 ? bx1 : bx0) + b * (b >= 0 ? y1 : by0) + c * (c >= 0 ? bz1 : bz0) + planes[p + 3] < 0) { inside = false; break; }
        }
        if (!inside) continue;
        const dMax = fx * (fx >= 0 ? bx1 : bx0) + fy * (fy >= 0 ? y1 : by0) + fz * (fz >= 0 ? bz1 : bz0) - base;
        const dMin = fx * (fx >= 0 ? bx0 : bx1) + fy * (fy >= 0 ? by0 : y1) + fz * (fz >= 0 ? bz0 : bz1) - base;
        if (dMax < near || dMin > far) continue;
        for (let j = start[k], e = start[k + 1]; j < e; j++) {
          const q = j * 5;
          const sc = data5[q + 4], x = data5[q], y = data5[q + 1], z = data5[q + 2];
          const c = cs[j], s = sn[j];
          const texels = leafT * sc;
          const f = Math.min(1, Math.max(texels * texels / (st * st), Math.pow(RATIO, LEVELS - 1)));
          const lv = Math.min(LEVELS - 1, Math.max(0, Math.ceil(Math.log(f) / LOG_RATIO - 1e-6)));
          pass.lane1(lv).push(x, y, z, c, s, sc, 0, f, f);
          const lim = qB / sc;
          let m = 0;
          while (m + 1 < BRANCH_DIST.length && BRANCH_DIST[m + 1] <= lim) m++;
          pass.laneB(m).push(x, y, z, c, s, sc, 0, 1, 1);
        }
      }
    }
    pass.end();
  }

  counts() {
    return { r0: this.main.r0 ? this.main.r0.n : 0, r1: this.main.r1.map(l => l.n), branch: this.main.br.map(l => l.n) };
  }

  triangles(pass) {
    const t = { r0: 0, r1: 0, branch: 0, trees: 0 };
    if (pass.r0) t.r0 = pass.r0.n * this.meta.idx0 / 3;
    pass.r1.forEach((l, k) => { if (l) t.r1 += l.n * 2 * Math.min(this.meta.leaves, Math.ceil(Math.pow(RATIO, k) * this.meta.leaves)); });
    pass.br.forEach((l, m) => {
      if (!l) return;
      let c = 0;
      this.data.parts.forEach((p, pi) => { c += this.partGeometry(pi, m).index.count / 3; });
      t.branch += l.n * c;
    });
    return t;
  }
}

const _planes = new Float64Array(16);
const _box = new Box3();
const _sun = new Vector3();

export function createFoliage(data, variants, sun) {
  const group = new Group();
  group.name = 'foliage';
  const shadow = Array.from({ length: sun.shadow.getViewportCount() }, () => sun.shadow);
  const sets = [];
  for (const v of variants) {
    const d = data.get(v.name);
    if (!d || !v.list.length) continue;
    const sp = new Species(d, v.list, v, shadow);
    sets.push(sp);
    group.add(sp.group);
  }
  return {
    group, sets,
    stats() {
      const out = {};
      for (const sp of sets) out[sp.name] = { main: sp.triangles(sp.main), cascades: sp.casters.map(c => sp.triangles(c)) };
      return out;
    },
    update(camera, heightPx, horizon = null, withShadows = true) {
      camera.updateMatrixWorld();
      const planes = extractPlanes(camera, _planes);
      const pxPerRad = camera.projectionMatrix.elements[5] * heightPx * 0.5;
      const pos = camera.position;
      for (const sp of sets) sp.cullMain(planes, pos.x, pos.y, pos.z, pxPerRad, horizon);
      if (!withShadows) return;
      sun.shadow.updateMatrices(sun, camera);
      const cascades = sun.shadow._cascadeData;
      const e = camera.matrixWorld.elements;
      const fx = -e[8], fy = -e[9], fz = -e[10];
      const sd = _sun.copy(sun.position).normalize();
      const view = { planes, fx, fy, fz, base: fx * pos.x + fy * pos.y + fz * pos.z, near: 0, far: 0, sx: sd.x, sy: 1 / Math.max(sd.y, 0.2), sz: sd.z, sunY: sd.y, cx: pos.x, cz: pos.z, reach: 0 };
      for (let i = 0; i < cascades.length; i++) {
        view.near = i === 0 ? -1e9 : cascades[i].x - 4;
        view.far = cascades[i].y + 4;
        view.reach = cascades[i].y + 80;
        const frustum = sun.shadow.getFrustum(i);
        for (const sp of sets) sp.cullShadow(i, frustum, cascades[i].w, _box, view);
      }
    }
  };
}

register('veg/foliage', 'leaf and branch lanes follow screen size and never list a tree twice', ctx => {
  const f = ctx.world.foliage;
  assert(physPatched, 'leaf translucency patch missing');
  assert(f && f.sets.length > 0, 'foliage sets missing');
  const sp = f.sets[0];
  f.update(ctx.world.camera, 1080);
  const c = sp.counts();
  assert(c.r0 + c.r1.reduce((a, b) => a + (b || 0), 0) <= sp.n * 2, `leaf lists hold ${c.r0} + ${c.r1} entries for ${sp.n} trees`);
});
