import { Scene, PerspectiveCamera, Vector3, Euler, MathUtils } from 'three';
import { verticalFov, NEAR, FAR } from '../render/renderer.js';
import { createLighting } from '../render/lighting.js';
import { createTerrain } from '../world/terrain.js';
import { createWater } from '../world/water.js';
import { createCollision } from '../world/collision.js';
import { createNav } from '../world/nav.js';
import { loadModels } from '../veg/models.js';
import { createProps } from '../veg/props.js';
import { createVegetation, createImpostors, loadImpostors, TREE_VARIANTS, BUSH_MODEL } from '../veg/trees.js';
import { createGrass, GRASS } from '../veg/grass.js';
import { loadFoliage, createFoliage, FOLIAGE } from '../veg/foliage.js';
import { createHorizon } from '../world/horizon.js';
import { updateWind } from '../veg/wind.js';
import { BOOKMARKS, CATALOG, BASES, MAP, bookmarkPose } from '../world/layout.js';
import { provide, expose } from '../core/debug.js';
import { register, assert } from '../core/selftest.js';

const TREE_SPECIES = [
  { place: 'OakTree', variants: [{ name: 'OakA', sway: 0.55, height: 12.6 }, { name: 'OakB', sway: 0.55, height: 12 }, { name: 'OakC', sway: 0.55, height: 12.6 }, { name: 'Beech', sway: 0.5, height: 12.9 }] },
  { place: 'SpruceTree', variants: [{ name: 'FirA', sway: 0.3, height: 18 }, { name: 'FirB', sway: 0.3, height: 16.2 }, { name: 'FirC', sway: 0.3, height: 14.5 }] },
  { place: 'BirchTree', variants: [{ name: 'Birch', sway: 0.6, height: 11.9 }] }
];

function splitList(list, k, part) {
  const out = [];
  for (let i = part; i < list.length / 5; i += k) out.push(list[i * 5], list[i * 5 + 1], list[i * 5 + 2], list[i * 5 + 3], list[i * 5 + 4]);
  return out;
}

const FOV = 100;
const SENSITIVITY = 0.0012;
const EYE = { stand: 1.7, crouch: 1.1 };
const RADIUS = 0.4;
const LIMIT = MAP.half + 120;
const UP = new Vector3(0, 1, 0);
const _euler = new Euler(0, 0, 0, 'YXZ');
const _dir = new Vector3();

export function createCam() {
  return { pos: new Vector3(), prev: new Vector3(), vel: new Vector3(), wish: new Vector3(), yaw: 0, pitch: 0, mode: 'fly', feet: 0, eye: EYE.stand };
}

export function moveCam(cam, input, dt, world) {
  cam.prev.copy(cam.pos);
  const f = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0);
  const s = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
  const sprint = input.down('sprint');
  if (cam.mode === 'fly') {
    const u = (input.down('jump') ? 1 : 0) - (input.down('crouch') ? 1 : 0);
    cam.wish.set(s, 0, -f).applyAxisAngle(UP, cam.yaw);
    cam.wish.y = u;
    if (cam.wish.lengthSq() > 1) cam.wish.normalize();
    cam.wish.multiplyScalar(sprint ? 70 : 9);
    cam.vel.lerp(cam.wish, 1 - Math.exp(-dt * 8));
    cam.pos.addScaledVector(cam.vel, dt);
    cam.pos.y = Math.max(world.terrain.heightAt(cam.pos.x, cam.pos.z) + 0.3, cam.pos.y);
  } else {
    cam.wish.set(s, 0, -f).applyAxisAngle(UP, cam.yaw);
    if (cam.wish.lengthSq() > 1) cam.wish.normalize();
    cam.wish.multiplyScalar(sprint ? 7.5 : 4.2);
    cam.vel.x += (cam.wish.x - cam.vel.x) * (1 - Math.exp(-dt * 10));
    cam.vel.z += (cam.wish.z - cam.vel.z) * (1 - Math.exp(-dt * 10));
    cam.pos.x += cam.vel.x * dt;
    cam.pos.z += cam.vel.z * dt;
    const c = world.collision.capsuleCollide({ start: new Vector3(cam.pos.x, cam.feet + 0.5, cam.pos.z), end: new Vector3(cam.pos.x, cam.feet + 1.4, cam.pos.z), radius: RADIUS });
    cam.pos.x += c.x;
    cam.pos.z += c.z;
    const ground = world.collision.groundAt(cam.pos.x, cam.feet + 1.4, cam.pos.z, 3.5);
    cam.feet += (ground - cam.feet) * Math.min(1, dt * (ground > cam.feet ? 16 : 9));
    const eyeTarget = input.down('crouch') ? EYE.crouch : EYE.stand;
    cam.eye += (eyeTarget - cam.eye) * Math.min(1, dt * 10);
    cam.pos.y = cam.feet + cam.eye;
  }
  cam.pos.x = MathUtils.clamp(cam.pos.x, -LIMIT, LIMIT);
  cam.pos.z = MathUtils.clamp(cam.pos.z, -LIMIT, LIMIT);
}

function placeCam(cam, camera, alpha) {
  camera.position.lerpVectors(cam.prev, cam.pos, alpha);
  camera.quaternion.setFromEuler(_euler.set(cam.pitch, cam.yaw, 0));
}

export async function createView(ctx) {
  const { render, assets, loop, input } = ctx;
  const dataLoading = fetch('/assets/world/world.json').then(r => r.json());
  const impostorLoading = loadImpostors(assets);
  const treeModels = [...Object.values(TREE_VARIANTS).flat().map(v => v[0]), BUSH_MODEL];
  const foliageLoading = loadFoliage(assets, TREE_SPECIES.flatMap(g => g.variants.map(v => v.name)));
  const modelsLoading = loadModels(assets, [...new Set([...Object.keys(CATALOG), ...treeModels])]);
  const terrainLoading = createTerrain(ctx, dataLoading);
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, NEAR, FAR);
  render.onResize((w, h) => {
    camera.aspect = w / h;
    camera.fov = verticalFov(FOV, camera.aspect);
    camera.updateProjectionMatrix();
  });
  const lighting = createLighting(ctx, scene);
  const [data, models, terrain, impostorAtlas, foliageData] = [await dataLoading, await modelsLoading, await terrainLoading, await impostorLoading, await foliageLoading];
  const water = await createWater(ctx, terrain, data.river, lighting);
  const placements = data.models;
  const props = createProps(models, placements, Object.keys(CATALOG).filter(n => CATALOG[n].kind === 'rock' || CATALOG[n].kind === 'prop' || CATALOG[n].kind === 'struct'));
  const vegetation = createVegetation(models, { ...placements, OakTree: [], SpruceTree: [], BirchTree: [] }, lighting.sun, createImpostors(impostorAtlas));
  const foliage = createFoliage(foliageData, TREE_SPECIES.flatMap(g => g.variants.map((v, i) => ({ ...v, list: splitList(placements[g.place] || [], g.variants.length, i) }))), lighting.sun);
  const horizon = createHorizon(terrain);
  const grass = createGrass(models, terrain, render);
  scene.add(terrain.group, water.mesh, props.group, vegetation.group, foliage.group, ...grass.group);
  terrain.group.traverse(o => o.layers.enable(water.layer));
  lighting.sky.layers.enable(water.layer);
  for (const m of props.cells) if (m.name === 'StoneBridge') m.layers.enable(water.layer);
  const collision = createCollision(terrain, water, models, placements);
  const nav = createNav(terrain, water, collision);

  const world = { scene, camera, lighting, terrain, water, props, vegetation, foliage, horizon, grass, collision, nav, models, data, placements };
  ctx.world = world;
  const cam = createCam();
  world.cam = cam;

  const pose = b => bookmarkPose(typeof b === 'number' ? BOOKMARKS[b] : BOOKMARKS.find(x => x.name === b), terrain.heightAt);
  let bookmarkIndex = -1;
  const place = (x, y, z, yaw = cam.yaw, pitch = cam.pitch) => {
    cam.pos.set(x, y, z);
    cam.prev.copy(cam.pos);
    cam.vel.set(0, 0, 0);
    cam.feet = collision.groundAt(x, y, z, 6);
    Object.assign(cam, { yaw, pitch });
    horizon.refreshAll(x, y, z);
    apply(1);
    return [x, y, z, yaw, pitch];
  };
  const gotoBookmark = b => {
    const p = pose(b);
    cam.mode = 'fly';
    place(p.eye[0], p.eye[1], p.eye[2], p.yaw, p.pitch);
    return p;
  };
  const apply = (alpha, dt = 1 / 60) => {
    placeCam(cam, camera, alpha);
    camera.updateMatrixWorld();
    lighting.update(camera, loop.simTime);
    terrain.update(camera.position);
    camera.getWorldDirection(_dir);
    const flat = Math.max(Math.hypot(_dir.x, _dir.z), 1e-4);
    const tanH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    vegetation.update(camera.position, false, { x: _dir.x / flat, z: _dir.z / flat, cosReach: Math.cos(Math.min(Math.PI, Math.atan(tanH / Math.max(flat, 0.2)) + 0.55)) });
    props.update(camera.position);
    horizon.refresh(camera.position.x, camera.position.y, camera.position.z);
    foliage.update(camera, render.gl.drawingBufferHeight, horizon);
    grass.update(camera.position, dt, { camera, heightPx: render.gl.drawingBufferHeight, horizon });
    water.update(loop.simTime, camera);
    updateWind(loop.simTime);
  };

  loop.addTick('world/camera', dt => {
    moveCam(cam, input, dt, world);
    if (cam.mode === 'walk') grass.actor('player', cam.pos.x, cam.pos.z, cam.vel.x * 0.5, cam.vel.z * 0.5, 0.9);
    else grass.removeActor('player');
  }, 20);
  loop.addFrame('world/camera', (alpha, dt) => {
    const { dx, dy } = input.look();
    if (!loop.paused) {
      cam.yaw -= dx * SENSITIVITY;
      cam.pitch = MathUtils.clamp(cam.pitch - dy * SENSITIVITY, -1.55, 1.55);
    }
    apply(alpha, dt);
  }, 10);
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyF') {
      cam.mode = cam.mode === 'fly' ? 'walk' : 'fly';
      cam.feet = collision.groundAt(cam.pos.x, cam.pos.y, cam.pos.z, 400);
    }
    if (e.code === 'KeyB') gotoBookmark(bookmarkIndex = (bookmarkIndex + 1) % BOOKMARKS.length);
  });

  const start = pose(0);
  place(start.eye[0], start.eye[1], start.eye[2], start.yaw, start.pitch);

  provide('view', () => ({
    name: 'world', mode: cam.mode, time: lighting.time, camera: { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z, yaw: cam.yaw, pitch: cam.pitch, ground: terrain.heightAt(cam.pos.x, cam.pos.z) },
    bookmarks: BOOKMARKS.map(b => b.name), trees: Object.fromEntries(vegetation.sets.map(s => [s.name, s.counts()])),
    foliage: foliage.stats(), collisionTriangles: collision.triangles, navOpen: nav.openFraction, draw: { propCells: props.cells.length }
  }));
  expose('teleport', place, 'teleport(x, y, z, yaw?, pitch?) -> move the world camera');
  expose('bookmark', b => { const p = gotoBookmark(b); return { eye: p.eye, yaw: p.yaw, pitch: p.pitch }; }, 'bookmark(name|index) -> fly camera to a map bookmark');
  expose('mode', m => { cam.mode = m === 'walk' ? 'walk' : 'fly'; cam.feet = collision.groundAt(cam.pos.x, cam.pos.y, cam.pos.z, 400); return cam.mode; }, 'mode(fly|walk) -> free-fly or ground-following walk camera');
  expose('setTime', h => lighting.setTime(h), 'setTime(hours 5..19) -> move the sun, rebuild sky lighting and fog');
  expose('foliage', cfg => Object.assign(FOLIAGE, cfg), 'foliage({ leafPx, r1Px, branchPx, shadowTexels, full }) -> tune or force full detail of the foliage LOD');
  expose('grass', cfg => Object.assign(GRASS, cfg), 'grass({ px, cover, ref: { x, z, r } | null, cov }) -> tune the grass LOD, force a full-detail reference disc or draw coverage only');
  expose('flatten', (x, z, r = 6) => grass.flatten(x, z, r, 1), 'flatten(x, z, radius) -> flatten grass like a grenade blast');

  return {
    scene, camera, sun: lighting.sun, world,
    startHint: 'Ghillie Ops world: WASD move, Shift fast, Space up, C down, F walk or fly, B next map bookmark',
    restoreGpu: () => lighting.restoreGpu()
  };
}

register('views/world', 'placed objects stand on the terrain and the map layout is respected', ctx => {
  const w = ctx.world;
  const checked = { n: 0 };
  for (const [name, list] of Object.entries(w.placements)) {
    if (name === 'StoneBridge') continue;
    const kind = CATALOG[name].kind;
    for (let i = 0; i < list.length; i += 5) {
      const tol = kind === 'struct' ? 3.5 : 1.5 + (CATALOG[name].sink || 0) * CATALOG[name].size[1] * list[i + 4];
      const g = w.terrain.heightAt(list[i], list[i + 2]);
      assert(Math.abs(list[i + 1] - g) < tol, `${name} at ${list[i]},${list[i + 2]} floats or sinks: y=${list[i + 1]} ground=${g.toFixed(2)}`);
      if (kind === 'tree') assert(w.water.depthAt(list[i], list[i + 2]) < 0.3, `${name} stands in the river at ${list[i]},${list[i + 2]}`);
      checked.n++;
    }
  }
  assert(checked.n > 20000, `only ${checked.n} placed objects`);
  for (const key of ['red', 'blue', 'A', 'B', 'C', 'D']) {
    const b = BASES[key];
    const poles = w.placements.FlagPole || [];
    let near = false;
    for (let i = 0; i < poles.length; i += 5) if (Math.hypot(poles[i] - b.x, poles[i + 2] - b.z) < 45) near = true;
    assert(near, `base ${key} has no flag pole`);
  }
  const trees = ['OakTree', 'SpruceTree', 'BirchTree'].filter(n => (w.placements[n] || []).length > 500);
  assert(trees.length === 3, 'three tree species must be planted in quantity');
});

register('views/world', 'every placed object touches every rendered terrain level of detail within 5 cm', ctx => {
  const w = ctx.world;
  const bad = [];
  let n = 0;
  for (const [name, list] of Object.entries(w.placements)) {
    if (name === 'StoneBridge') continue;
    const skip = new Set((w.data.elevated && w.data.elevated[name]) || []);
    for (let i = 0; i < list.length / 5; i++) {
      if (skip.has(i)) continue;
      const x = list[i * 5], y = list[i * 5 + 1], z = list[i * 5 + 2];
      n++;
      for (const stride of [1, 2, 4]) {
        const gap = y - w.terrain.surfaceLod(x, z, stride);
        if (gap > 0.05) { if (bad.length < 4) bad.push(`${name} at ${x},${z} hovers ${gap.toFixed(2)} m above terrain level ${stride}`); else bad.length++; break; }
      }
    }
  }
  assert(n > 20000 && bad.length === 0, `${bad.length} of ${n} placed objects hover: ${bad.slice(0, 4).join('; ')}`);
});

register('views/world', 'free-fly and walk camera move on fixed ticks and the walk camera follows the ground', ctx => {
  const w = ctx.world;
  const input = { down: a => a === 'forward' };
  const cam = createCam();
  cam.mode = 'walk';
  cam.pos.set(250, w.terrain.heightAt(250, 250) + 1.7, 250);
  cam.prev.copy(cam.pos);
  cam.feet = w.terrain.heightAt(250, 250);
  const start = cam.pos.clone();
  for (let i = 0; i < 120; i++) moveCam(cam, input, 1 / 60, w);
  const moved = Math.hypot(cam.pos.x - start.x, cam.pos.z - start.z);
  assert(moved > 4 && moved < 9, `two seconds of walking must cover about 6 m, got ${moved.toFixed(2)}`);
  const ground = w.collision.groundAt(cam.pos.x, cam.pos.y, cam.pos.z, 4);
  assert(Math.abs(cam.pos.y - 1.7 - ground) < 0.35, `walk camera is ${(cam.pos.y - ground).toFixed(2)} m above the ground, expected eye height`);
  cam.mode = 'fly';
  cam.pos.set(0, 10, 0);
  const t0 = cam.pos.clone();
  for (let i = 0; i < 60; i++) moveCam(cam, input, 1 / 60, w);
  assert(cam.pos.distanceTo(t0) > 3, 'the free-fly camera must move');
  const hit = w.collision.raycast(new Vector3(w.placements.Bunker[0] - 30, w.placements.Bunker[1] + 1.5, w.placements.Bunker[2] + 1.0), new Vector3(1, 0, 0), 100);
  assert(hit, 'collision must be reachable from the view');
  for (const b of BOOKMARKS) {
    const p = bookmarkPose(b, w.terrain.heightAt);
    assert(p.eye[1] > w.terrain.heightAt(p.eye[0], p.eye[2]) + 0.25, `bookmark ${b.name} is below the ground`);
  }
});
