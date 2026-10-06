import { BufferGeometry, BufferAttribute, Matrix4, Matrix3, Vector3, DoubleSide } from 'three';
import { CATALOG } from '../world/layout.js';
import { register, assert } from '../core/selftest.js';

const SURFACES = {
  rock: ['RockA', 'RockMoss1', 'RockMoss2', 'RockMoss3', 'RockMoss4', 'RockMoss5', 'RockFaceA', 'RockFaceB', 'Bunker', 'StoneBridge', 'Chapel', 'Well', 'RadioHut', 'ConcreteBarrier', 'HouseA', 'HouseB', 'HouseC', 'Farmhouse', 'QuarryOffice'],
  metal: ['RadioTower', 'QuarryCrusher', 'ShippingContainer', 'FuelTank', 'BaseHQ', 'Barrel', 'OilBarrel', 'Jerrycan', 'FlagPole'],
  wood: ['OakTree', 'SpruceTree', 'BirchTree', 'FallenLog', 'Stump', 'Barn', 'FarmShed', 'WatchTower', 'WoodFence', 'WoodenMilitaryCrate', 'MilitaryCrate']
};

export const surfaceOf = name => {
  for (const [surface, list] of Object.entries(SURFACES)) if (list.includes(name)) return surface;
  return 'dirt';
};

const FOLIAGE = /^leaf_/i;
const ALBEDO_TRIM = 0.9;

function bake(mesh, inverse) {
  const rel = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
  const nm = new Matrix3().getNormalMatrix(rel);
  const src = mesh.geometry;
  const g = new BufferGeometry();
  const v = new Vector3();
  for (const key of ['position', 'normal', 'uv', 'color']) {
    const a = src.attributes[key];
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);
      if (key === 'position') { v.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]).applyMatrix4(rel); out.set([v.x, v.y, v.z], i * 3); }
      if (key === 'normal') { v.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]).applyMatrix3(nm).normalize(); out.set([v.x, v.y, v.z], i * 3); }
    }
    g.setAttribute(key, new BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(new BufferAttribute(Uint32Array.from(src.index.array), 1));
  g.computeBoundingSphere();
  return g;
}

function isCollider(o) {
  for (; o; o = o.parent) if (o.name.startsWith('col_')) return true;
  return false;
}

function lodOf(mesh) {
  for (let o = mesh; o; o = o.parent) {
    const m = /lod(\d)$/.exec(o.name);
    if (m) return +m[1];
  }
  return 0;
}

function prepMaterial(m) {
  if (FOLIAGE.test(m.name)) {
    m.alphaTest = 0.5;
    m.transparent = false;
    m.depthWrite = true;
    m.side = DoubleSide;
  }
  if (m.isMeshStandardMaterial && m.metalness > 0.25) { m.metalness = 0.25; m.roughness = Math.max(m.roughness, 0.6); }
  if (m.name === 'Flag') m.side = DoubleSide;
  else if (m.name === 'M_sandbag') m.color.setRGB(0.5, 0.42, 0.28);
  else if (/^bark_/i.test(m.name)) m.color.setRGB(1.1, 1.0, 0.86);
  else if (!FOLIAGE.test(m.name) && !/^(solid_|grass)/i.test(m.name)) m.color.multiplyScalar(ALBEDO_TRIM);
  return m;
}

export function processModel(name, gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const root = scene.getObjectByName(name) || scene;
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const visuals = [];
  const cols = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (isCollider(o)) { cols.push(bake(o, inverse)); return; }
    const materials = [o.material].flat();
    visuals.push({ lod: lodOf(o), name: o.name, geometry: bake(o, inverse), material: prepMaterial(materials[0]) });
  });
  const collider = cols.length ? mergeColliders(cols) : null;
  return { name, visuals, collider, kind: CATALOG[name] ? CATALOG[name].kind : 'prop', placeholder: !!gltf.placeholder };
}

function mergeColliders(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const positions = new Float32Array(nv * 3), index = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    positions.set(g.attributes.position.array, vo * 3);
    const n = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io++] = g.index.array[i] + vo;
    else for (let i = 0; i < n; i++) index[io++] = vo + i;
    vo += n;
  }
  return { positions, index };
}

export async function loadModels(assets, names) {
  const loaded = await Promise.all(names.map(n => assets.model(n, CATALOG[n] ? CATALOG[n].size : [1, 1, 1])));
  const out = new Map();
  names.forEach((n, i) => out.set(n, processModel(n, loaded[i])));
  return out;
}

register('veg/models', 'every catalog model loads with visuals, no placeholders', ctx => {
  const models = ctx.world.models;
  for (const name of Object.keys(CATALOG)) {
    const m = models.get(name);
    assert(m && !m.placeholder, `${name} missing or a placeholder`);
    assert(m.visuals.length > 0, `${name} has no visual mesh`);
  }
  for (const name of ['OakTree', 'SpruceTree', 'BirchTree']) {
    const m = models.get(name);
    assert([0, 1, 2].every(l => m.visuals.some(v => v.lod === l && /^leaf_/i.test(v.material.name)) && m.visuals.some(v => v.lod === l && !/^leaf_/i.test(v.material.name))) && m.collider, `${name} needs lod0 to lod2 with trunk and leaf cards and a trunk collider`);
  }
  for (const name of ['HouseA', 'Bunker', 'StoneBridge', 'RadioTower', 'RockA']) assert(models.get(name).collider, `${name} needs a collider`);
  assert(surfaceOf('RockA') === 'rock' && surfaceOf('OakTree') === 'wood' && surfaceOf('FuelTank') === 'metal', 'surface table wrong');
});
