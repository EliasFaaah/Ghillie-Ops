import { TextureLoader, SRGBColorSpace, NoColorSpace, RepeatWrapping, Group, Mesh, BoxGeometry, MeshStandardMaterial, DataTexture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { register, assert } from './selftest.js';

const MODELS_URL = '/models/';
const ESTIMATED_BYTES = Object.freeze({ models: 4e6, textures: 2e6 });
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];

function createTracker() {
  const jobs = new Map();
  return {
    add(key, kind) {
      const j = { kind, loaded: 0, total: 0, done: false };
      jobs.set(key, j);
      return {
        progress: e => { if (e && e.lengthComputable && e.total > 0) { j.total = e.total; j.loaded = Math.min(e.loaded, e.total); } },
        finish: () => { j.done = true; }
      };
    },
    fraction() {
      let loaded = 0, total = 0;
      for (const j of jobs.values()) {
        const size = j.total || ESTIMATED_BYTES[j.kind];
        total += size;
        loaded += j.done ? size : Math.min(j.loaded, size * 0.99);
      }
      return total ? loaded / total : 0;
    },
    pending() {
      let n = 0;
      for (const j of jobs.values()) if (!j.done) n++;
      return n;
    },
    status() {
      const kinds = new Map();
      for (const j of jobs.values()) {
        const k = kinds.get(j.kind) || { done: 0, count: 0 };
        k.count++;
        if (j.done) k.done++;
        kinds.set(j.kind, k);
      }
      for (const [kind, k] of kinds) if (k.done < k.count) return `Loading ${kind} ${k.done}/${k.count}`;
      return '';
    }
  };
}

export function createAssets(renderer, anisotropy) {
  const draco = new DRACOLoader().setDecoderPath(import.meta.resolve('three/addons/libs/draco/gltf/'));
  const ktx2 = new KTX2Loader().setTranscoderPath(import.meta.resolve('three/addons/libs/basis/')).detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new TextureLoader();
  const cache = new Map();
  const tracker = createTracker();
  const placeholders = [];
  const textures = new Set();
  const progress = { errors: 0 };
  let level = anisotropy;

  const filter = tex => {
    tex.anisotropy = Math.min(level, renderer.capabilities.getMaxAnisotropy());
    textures.add(tex);
  };

  const placeholderModel = (url, size) => {
    const group = new Group();
    group.name = `placeholder:${url}`;
    group.userData.placeholder = url;
    const mesh = new Mesh(new BoxGeometry(size[0], size[1], size[2]), new MeshStandardMaterial({ color: 0xff00ff, roughness: 0.7 }));
    mesh.position.y = size[1] / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    placeholders.push(url);
    return { scene: group, animations: [], placeholder: true, extensions: [] };
  };

  const gltf = (url, placeholderSize = [1, 1, 1], name = null) => {
    if (cache.has(url)) return cache.get(url);
    const t = tracker.add(url, 'models');
    const p = new Promise(resolve => {
      gltfLoader.load(url, g => {
        t.finish();
        g.scene.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = o.receiveShadow = true;
          for (const m of [o.material].flat()) for (const slot of TEXTURE_SLOTS) if (m[slot]) filter(m[slot]);
        });
        if (name && !g.scene.getObjectByName(name)) console.warn(`[assets] ${url} has no node named "${name}"; pack with gltfpack -kn so the file name equals the object name`);
        resolve({ scene: g.scene, animations: g.animations, placeholder: false, extensions: g.parser.json.extensionsUsed || [] });
      }, t.progress, err => {
        t.finish();
        progress.errors++;
        console.error(`[assets] could not load ${url}, using a placeholder: ${err && err.message ? err.message : err}`);
        resolve(placeholderModel(url, placeholderSize));
      });
    });
    cache.set(url, p);
    return p;
  };

  const texture = (url, { srgb = false, repeat = null } = {}) => {
    const key = `${url}|${srgb}|${repeat}`;
    if (cache.has(key)) return cache.get(key);
    const t = tracker.add(key, 'textures');
    const loader = url.endsWith('.ktx2') ? ktx2 : textureLoader;
    const p = new Promise(resolve => {
      loader.load(url, tex => {
        t.finish();
        if (loader === textureLoader) tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        if (repeat) { tex.wrapS = tex.wrapT = RepeatWrapping; tex.repeat.set(repeat, repeat); }
        filter(tex);
        resolve(tex);
      }, t.progress, err => {
        t.finish();
        progress.errors++;
        console.error(`[assets] could not load texture ${url}: ${err && err.message ? err.message : err}`);
        const fallback = new DataTexture(new Uint8Array([255, 0, 255, 255]), 1, 1);
        fallback.needsUpdate = true;
        fallback.userData.placeholder = url;
        placeholders.push(url);
        resolve(fallback);
      });
    });
    cache.set(key, p);
    return p;
  };

  return {
    progress,
    placeholders,
    gltf,
    texture,
    model: (name, placeholderSize) => gltf(`${MODELS_URL}${encodeURIComponent(name)}.glb`, placeholderSize, name),
    fraction: tracker.fraction,
    pending: tracker.pending,
    status: tracker.status,
    setAnisotropy(n) {
      level = n;
      for (const tex of textures) {
        tex.anisotropy = Math.min(level, renderer.capabilities.getMaxAnisotropy());
        tex.needsUpdate = true;
      }
    }
  };
}

register('core/assets', 'progress is weighted by bytes and never complete while empty', () => {
  const t = createTracker();
  assert(t.fraction() === 0 && t.status() === '', 'an empty tracker must report 0, not complete');
  const big = t.add('big.ktx2', 'textures');
  const small = t.add('small.glb', 'models');
  assert(t.fraction() === 0 && t.pending() === 2, 'registered jobs that have not started must report 0');
  assert(t.status() === 'Loading textures 0/1', `status text was "${t.status()}"`);
  big.progress({ lengthComputable: true, loaded: 4e6, total: 8e6 });
  small.progress({ lengthComputable: true, loaded: 0, total: 1e3 });
  assert(Math.abs(t.fraction() - 4e6 / (8e6 + 1e3)) < 1e-9, `half of the big file must count as half of all bytes, got ${t.fraction()}`);
  small.finish();
  assert(t.fraction() < 0.51 && t.status() === 'Loading textures 0/1', 'a finished small file must barely move the bar');
  big.progress({ lengthComputable: true, loaded: 8e6, total: 8e6 });
  assert(t.fraction() < 1, 'a downloaded but unfinished job must not complete the bar');
  big.finish();
  assert(t.fraction() === 1 && t.pending() === 0 && t.status() === '', 'all finished jobs must give 1');
  const unknown = createTracker();
  unknown.add('a.glb', 'models').progress({ lengthComputable: false, loaded: 5e5, total: 0 });
  assert(unknown.fraction() === 0, 'a job of unknown size must use its estimated weight and report no progress');
});

register('core/assets', 'draco, meshopt and KTX2 decoders', async ctx => {
  const d = await ctx.assets.gltf('/assets/selftest/draco.glb');
  assert(!d.placeholder, 'draco fixture fell back to a placeholder');
  assert(d.extensions.includes('KHR_draco_mesh_compression'), 'draco fixture does not use KHR_draco_mesh_compression');
  let mesh = null;
  d.scene.traverse(o => { if (o.isMesh) mesh = o; });
  assert(mesh && mesh.geometry.attributes.position.count === 24, 'draco cube must decode to 24 vertices');
  const m = await ctx.assets.gltf('/assets/selftest/meshopt_ktx2.glb');
  assert(!m.placeholder, 'meshopt/ktx2 fixture fell back to a placeholder');
  assert(m.extensions.includes('EXT_meshopt_compression') && m.extensions.includes('KHR_texture_basisu'), `meshopt fixture extensions: ${m.extensions.join(',')}`);
  mesh = null;
  m.scene.traverse(o => { if (o.isMesh) mesh = o; });
  assert(mesh && mesh.geometry.index.count === 6, 'meshopt quad must decode to 6 indices');
  assert(mesh.material.map && mesh.material.map.isCompressedTexture, 'KTX2 base color must be a compressed GPU texture');
  assert(mesh.material.map.colorSpace === SRGBColorSpace, 'KTX2 base color must be sRGB');
  assert(mesh.material.map.anisotropy > 1, 'model textures must get the preset anisotropy');
});

register('core/assets', 'unloadable model becomes a placeholder, unnamed model warns, live state untouched', async ctx => {
  const assets = createAssets(ctx.render.renderer, 1);
  const broken = 'data:model/gltf-binary;base64,bm90IGEgbW9kZWw=';
  const unnamed = `data:model/gltf+json;base64,${btoa(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{}] }))}`;
  const live = { errors: ctx.assets.progress.errors, placeholders: ctx.assets.placeholders.length };
  const logged = [];
  const original = { error: console.error, warn: console.warn };
  console.error = (...a) => logged.push(['error', a.join(' ')]);
  console.warn = (...a) => logged.push(['warn', a.join(' ')]);
  let r, n;
  try {
    r = await assets.gltf(broken, [0.5, 2, 0.5]);
    n = await assets.gltf(unnamed, [1, 1, 1], 'Expected');
  } finally {
    Object.assign(console, original);
  }
  assert(r.placeholder && r.scene.userData.placeholder === broken && assets.placeholders.includes(broken), 'unloadable model must resolve to a listed placeholder');
  assert(logged.some(([l, t]) => l === 'error' && t.includes('[assets]') && t.includes(broken)), 'unloadable model must log an error naming the file');
  assert(assets.progress.errors === 1, `error count ${assets.progress.errors}, expected 1`);
  let box = null;
  r.scene.traverse(o => { if (o.isMesh) box = o; });
  assert(box && Math.abs(box.geometry.parameters.height - 2) < 1e-6, 'placeholder must use the requested size');
  assert(!n.placeholder && logged.some(([l, t]) => l === 'warn' && t.includes('"Expected"')), 'a model without a node named like its file must warn');
  assert(logged.length === 2, `expected exactly one error and one warning, got ${logged.length}`);
  assert(ctx.assets.progress.errors === live.errors && ctx.assets.placeholders.length === live.placeholders, 'the check must not touch the live asset state');
});
