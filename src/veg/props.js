import { InstancedMesh, Mesh, Group, BufferGeometry, BufferAttribute, Quaternion, Vector3, Matrix4, Color } from 'three';
import { CATALOG, BASES } from '../world/layout.js';
import { windUniforms } from './wind.js';
import { injectFog } from '../render/lighting.js';
import { register, assert } from '../core/selftest.js';

const CELL = { rock: 512, prop: 512, struct: 256 };
const CULL = { rock: 450, prop: 170, struct: 4000 };
const MAJOR = 3;
const DETAIL_RANGE = 100;
const SHADOW_DETAIL = 60;
const SHADOW_RANGE = { rock: 45, prop: 30, struct: 130 };
const MERGE_KEEP = new Set(['FlagPole', 'StoneBridge']);
const FLAG_COLORS = { red: new Color(1.0, 0.03, 0.0), blue: new Color(0.0, 0.1, 1.0), neutral: new Color(0.9, 0.9, 0.86) };
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0);

const FLAG_WAVE = `
float fw = clamp((position.x - 0.06) / 2.6, 0.0, 1.0);
float fph = uWindTime * 3.6 + fw * 7.0 + position.y * 0.9;
transformed.z += sin(fph) * 0.42 * fw * (0.55 + 0.45 * uWindAmp);
transformed.y += cos(fph * 0.7) * 0.05 * fw;
transformed.x -= fw * fw * 0.1 * (1.0 + sin(fph));
`;

function flagMaterial(base) {
  const m = base.clone();
  m.onBeforeCompile = shader => {
    injectFog(shader);
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;\nuniform float uWindAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FLAG_WAVE}`);
  };
  m.customProgramCacheKey = () => 'flag';
  return m;
}

export const flagTeam = (x, z) => {
  for (const side of ['red', 'blue']) if (Math.hypot(x - BASES[side].x, z - BASES[side].z) < 130) return side;
  return 'neutral';
};

function textureKey(t) {
  if (!t) return '';
  const d = t.mipmaps && t.mipmaps.length ? t.mipmaps[0].data : null;
  if (!d || !d.length) return t.uuid;
  let h = d.length;
  for (let i = 0; i < 96; i++) h = (Math.imul(h, 31) + d[Math.floor(i * (d.length - 1) / 95)]) >>> 0;
  return `${d.length}.${h}`;
}

const materialKey = m => [m.name, m.color.getHex(), m.roughness, m.metalness, m.side, m.alphaTest, textureKey(m.map), textureKey(m.normalMap), textureKey(m.roughnessMap)].join('|');

function mergeStatic(parts) {
  let nv = 0, ni = 0;
  for (const part of parts) {
    nv += part.geometry.attributes.position.count;
    ni += part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const { geometry, x, y, z, yaw, scale } of parts) {
    _q.setFromAxisAngle(_up, yaw);
    const { position, normal, uv: uvs } = geometry.attributes;
    for (let k = 0; k < position.count; k++) {
      _p.set(position.getX(k), position.getY(k), position.getZ(k)).multiplyScalar(scale).applyQuaternion(_q);
      pos.set([_p.x + x, _p.y + y, _p.z + z], (vo + k) * 3);
      _p.set(normal.getX(k), normal.getY(k), normal.getZ(k)).applyQuaternion(_q);
      nor.set([_p.x, _p.y, _p.z], (vo + k) * 3);
      if (uvs) uv.set([uvs.getX(k), uvs.getY(k)], (vo + k) * 2);
    }
    if (geometry.index) for (let k = 0; k < geometry.index.count; k++) idx[io++] = geometry.index.getX(k) + vo;
    else for (let k = 0; k < position.count; k++) idx[io++] = vo + k;
    vo += position.count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export function createProps(models, placements, names) {
  const group = new Group();
  group.name = 'props';
  const cells = [];
  const merged = new Map();
  for (const name of names) {
    const list = placements[name];
    const model = models.get(name);
    if (!list || !model) continue;
    const kind = model.kind;
    const visuals = model.visuals.filter(v => v.lod === 0).sort((a, b) => (b.geometry.index ? b.geometry.index.count : b.geometry.attributes.position.count) - (a.geometry.index ? a.geometry.index.count : a.geometry.attributes.position.count));
    const buckets = new Map();
    for (let i = 0; i < list.length; i += 5) {
      const key = `${Math.floor((list[i] + 1024) / CELL[kind])},${Math.floor((list[i + 2] + 1024) / CELL[kind])}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
    }
    if (kind === 'struct' && !MERGE_KEEP.has(name)) {
      for (const [cell, ids] of buckets) {
        for (const v of visuals) {
          const key = `${cell}|${materialKey(v.material)}`;
          if (!merged.has(key)) merged.set(key, { cell, material: v.material, parts: [] });
          for (const i of ids) merged.get(key).parts.push({ geometry: v.geometry, x: list[i], y: list[i + 1], z: list[i + 2], yaw: list[i + 3], scale: list[i + 4] });
        }
      }
      continue;
    }
    for (const [key, ids] of buckets) {
      const [ci, cj] = key.split(',').map(Number);
      visuals.forEach((v, rank) => {
        const mesh = new InstancedMesh(v.geometry, v.material.name === 'Flag' ? flagMaterial(v.material) : v.material, ids.length);
        ids.forEach((i, n) => {
          _p.set(list[i], list[i + 1], list[i + 2]);
          _q.setFromAxisAngle(_up, list[i + 3]);
          _s.setScalar(list[i + 4]);
          mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
          if (name === 'FlagPole' && v.material.name === 'Flag') mesh.setColorAt(n, FLAG_COLORS[flagTeam(list[i], list[i + 2])]);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name = name;
        const cx = -1024 + (ci + 0.5) * CELL[kind], cz = -1024 + (cj + 0.5) * CELL[kind], bs = mesh.boundingSphere;
        mesh.userData = { rank, cx, cz, radius: CELL[kind] * Math.SQRT1_2, sx: bs.center.x, sz: bs.center.z, sr: bs.radius, cull: CULL[kind] || 500, shadow: SHADOW_RANGE[kind] || 150, count: ids.length };
        group.add(mesh);
        cells.push(mesh);
      });
    }
  }
  const byCell = new Map();
  for (const { cell, material, parts } of merged.values()) {
    const geometry = mergeStatic(parts);
    const mesh = new Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'structure';
    const [ci, cj] = cell.split(',').map(Number);
    const cx = -1024 + (ci + 0.5) * CELL.struct, cz = -1024 + (cj + 0.5) * CELL.struct, radius = CELL.struct * Math.SQRT1_2;
    mesh.userData = { rank: 0, cx, cz, radius, sx: cx, sz: cz, sr: radius, cull: CULL.struct, shadow: SHADOW_RANGE.struct, count: parts.length, tris: geometry.index.count / 3 };
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push(mesh);
  }
  for (const list of byCell.values()) {
    list.sort((a, b) => b.userData.tris - a.userData.tris).forEach((mesh, rank) => {
      mesh.userData.rank = rank;
      group.add(mesh);
      cells.push(mesh);
    });
  }
  return {
    group, cells,
    update(cam) {
      for (const mesh of cells) {
        const u = mesh.userData;
        const d = Math.hypot(u.cx - cam.x, u.cz - cam.z) - u.radius;
        const ds = Math.hypot(u.sx - cam.x, u.sz - cam.z) - u.sr;
        mesh.visible = d < u.cull && (u.rank < MAJOR || d < DETAIL_RANGE);
        mesh.castShadow = ds < u.shadow && (u.rank < MAJOR || ds < SHADOW_DETAIL);
      }
    }
  };
}

register('veg/props', 'static props are instanced or merged per cell and culled by distance', ctx => {
  const p = ctx.world.props;
  assert(p.cells.length > 40, `expected many instanced cells, got ${p.cells.length}`);
  let total = 0;
  for (const m of p.cells) total += m.userData.count;
  assert(total > 300, `only ${total} static instances`);
  const structures = p.cells.filter(m => m.name === 'structure');
  assert(structures.length > 20 && structures.length < 240, `merged structure meshes: ${structures.length}`);
  const far = { x: 100000, z: 100000 };
  p.update(far);
  const hidden = p.cells.filter(m => !m.visible && m.userData.cull < 2000).length;
  p.update({ x: 0, z: 0 });
  assert(hidden > 0, 'distance culling hides nothing');
  const flags = p.cells.filter(m => m.name === 'FlagPole' && m.instanceColor);
  assert(flags.length > 0, 'flag cloth needs per-instance team colors');
  assert(CATALOG.FlagPole && FLAG_COLORS.red.r > FLAG_COLORS.red.b, 'flag colors defined');
});
