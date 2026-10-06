import { Scene, PerspectiveCamera, Vector3, Box3, Mesh, PlaneGeometry, MeshStandardMaterial, Group, MathUtils } from 'three';
import { verticalFov, NEAR, FAR } from '../render/renderer.js';
import { createLighting } from '../render/lighting.js';
import { createViewmodel } from '../player/viewmodel.js';
import { VARIANTS } from '../player/ghillie.js';
import { WEAPONS, ORDER, CLIP_SETS } from '../weapons/defs.js';
import { provide, expose } from '../core/debug.js';
import { register, assert } from '../core/selftest.js';

const FOV = 90;
const GROUND = 400;
const TILE = 3.2;
const TEX = '/assets/textures/sparse_grass/sparse_grass_';
const EYE = 1.7;
const _v = new Vector3();

export async function createView(ctx) {
  const { render, assets, loop } = ctx;
  const repeat = GROUND / TILE;
  const texLoading = Promise.all(['diff', 'nor_gl', 'arm'].map(m => assets.texture(`${TEX}${m}.ktx2`, { repeat, srgb: m === 'diff' })));
  const crateLoading = Promise.all(['WoodenMilitaryCrate', 'Jerrycan'].map(n => assets.model(n, [0.6, 0.5, 0.6])));
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, NEAR, FAR);
  const lighting = createLighting(ctx, scene, 12.5);
  const vm = await createViewmodel(ctx);
  vm.link(lighting.sun, scene, () => lighting.vmEnvironment);
  render.onResize((w, h) => {
    camera.aspect = w / h;
    camera.fov = verticalFov(FOV, camera.aspect);
    camera.updateProjectionMatrix();
    vm.setAspect(w / h);
  });
  const [map, normalMap, arm] = await texLoading;
  const ground = new Mesh(new PlaneGeometry(GROUND, GROUND), new MeshStandardMaterial({ map, normalMap, aoMap: arm, roughnessMap: arm, metalness: 0, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const [crate, can] = await crateLoading;
  const props = [[crate, 0.6, 0, -3.2, 0.4], [crate, -0.9, 0, -3.8, -0.2], [can, 1.4, 0, -2.6, 0.8]];
  for (const [m, x, y, z, r] of props) {
    const o = m.scene.clone();
    o.position.set(x, y, z);
    o.rotation.y = r;
    scene.add(o);
  }
  camera.position.set(0, EYE, 0);
  camera.rotation.set(-0.08, 0, 0);

  const available = ORDER.filter(id => vm.info[id]);
  await vm.load(available);
  await vm.setVariant('woodland');
  await vm.equip(available[0], { instant: true });

  const turn = new Group();
  turn.position.set(0, -0.05, -0.9);
  turn.visible = false;
  vm.group.add(turn);
  const state = { turntable: false, spin: 0, clipIndex: 0, selected: null, label: null };
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:16px;bottom:12px;color:#e8e4d4;font:600 13px Barlow,sans-serif;text-shadow:0 1px 3px #000;pointer-events:none;white-space:pre';
  document.body.appendChild(label);

  const setTurntable = async (on, id, angle) => {
    state.turntable = !!on;
    vm.kick.visible = !on;
    turn.visible = !!on;
    if (!on) return true;
    const wid = id || vm.weaponId;
    const w = await assets.model(WEAPONS[wid].model);
    turn.clear();
    const o = w.scene.clone(true);
    o.traverse(x => { x.frustumCulled = false; });
    const box = new Box3().setFromObject(o);
    const size = box.getSize(new Vector3());
    o.position.sub(box.getCenter(new Vector3()));
    turn.scale.setScalar(Math.min(4, 0.85 / Math.max(size.x, size.y, size.z)));
    turn.add(o);
    state.spin = angle === undefined ? state.spin : MathUtils.degToRad(angle);
    turn.rotation.y = state.spin;
    return true;
  };

  const clipsOf = () => CLIP_SETS[WEAPONS[vm.weaponId].kind];
  const refresh = () => {
    const v = vm.variant;
    label.textContent = `${WEAPONS[vm.weaponId].label}  |  clip ${clipsOf()[state.clipIndex % clipsOf().length]}  |  ${v}${state.turntable ? '  |  turntable' : ''}\n[ ] weapon   , . clip   Space play   V variant   T turntable   A ads   S sprint`;
  };
  const cycle = (list, cur, d) => list[(list.indexOf(cur) + d + list.length) % list.length];
  const doEquip = async id => { await vm.equip(id, { instant: true }); state.clipIndex = 0; if (state.turntable) await setTurntable(true, id); refresh(); return vm.weaponId; };
  const doVariant = async id => { await vm.setVariant(id); refresh(); return vm.variant; };
  const doPlay = (name, speed = 1) => {
    vm.unfreeze();
    const c = vm.current.clips[name];
    if (!c) return 0;
    if (name === 'fire') vm.fire(0.1);
    else if (name === 'idle' || name === 'ads' || name === 'sprint') { vm.setAds(name === 'ads'); vm.setSprint(name === 'sprint'); }
    else vm.play(name, { speed });
    return c.duration;
  };

  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'BracketRight') doEquip(cycle(available, vm.weaponId, 1));
    if (e.code === 'BracketLeft') doEquip(cycle(available, vm.weaponId, -1));
    if (e.code === 'Period') { state.clipIndex++; refresh(); }
    if (e.code === 'Comma') { state.clipIndex += clipsOf().length - 1; refresh(); }
    if (e.code === 'Space') doPlay(clipsOf()[state.clipIndex % clipsOf().length]);
    if (e.code === 'KeyV') doVariant(cycle(VARIANTS.map(v => v.id), vm.variant, 1));
    if (e.code === 'KeyT') setTurntable(!state.turntable).then(refresh);
    if (e.code === 'KeyA') vm.setAds(!vm.adsWant);
    if (e.code === 'KeyS') vm.setSprint(!vm.sprintWant);
  });

  loop.addFrame('view/weapons', (alpha, dt) => {
    lighting.update(camera, loop.simTime);
    if (state.turntable) { state.spin += dt * 0.6; turn.rotation.y = state.spin; }
    vm.update(dt, camera);
  }, 20);
  vm.update(0, camera);
  refresh();

  provide('view', () => ({ name: 'weapons', weapon: vm.weaponId, variant: vm.variant, available, ads: vm.ads, sprint: vm.sprint, turntable: state.turntable, act: vm.act ? { name: vm.act.name, time: vm.act.time, weight: vm.act.weight } : null, muzzle: vm.muzzleWorld(_v).toArray().map(n => +n.toFixed(3)) }));
  expose('vmWeapon', doEquip, 'vmWeapon(id) -> show a weapon in the arms');
  expose('vmVariant', doVariant, 'vmVariant(id) -> ghillie variant of the arms');
  expose('vmPlay', doPlay, 'vmPlay(clip, speed?) -> play a clip (idle, ads, sprint hold their pose); returns its duration');
  expose('vmPose', (name, time) => { const ok = vm.pose(name, time); return ok; }, 'vmPose(clip, seconds) -> freeze the arms at a clip time');
  expose('vmFree', () => { vm.unfreeze(); return true; }, 'vmFree() -> leave a frozen pose');
  expose('vmAds', on => { vm.setAds(on); return vm.adsWant; }, 'vmAds(bool) -> aim down sights');
  expose('vmSprint', on => { vm.setSprint(on); return vm.sprintWant; }, 'vmSprint(bool) -> sprint pose');
  expose('vmTurntable', (on, id, angle) => setTurntable(on, id, angle).then(refresh), 'vmTurntable(bool, id?, angleDeg?) -> show the weapon model alone on a turntable');
  expose('vmSetTime', h => lighting.setTime(h), 'vmSetTime(hours) -> sun position');

  ctx.world = { scene, camera, lighting };
  return {
    scene, camera, sun: lighting.sun, vm, lighting, available, setTurntable,
    startHint: 'Weapon viewer: [ ] weapon, comma period clip, Space play, V ghillie variant, T turntable, A ads, S sprint',
    attachPost: post => vm.insertPass(post),
    restoreGpu: () => lighting.restoreGpu()
  };
}

register('views/weapons', 'every exported weapon has its full clip set and sockets, no placeholders', async ctx => {
  const v = ctx.view;
  assert(v.vm && v.available.length > 0, 'viewer must expose the viewmodel and at least one weapon');
  for (const id of v.available) {
    const w = await v.vm.load([id]).then(() => v.vm.weapon(id));
    assert(!w.placeholder, `${id} model is a placeholder`);
    for (const n of CLIP_SETS[WEAPONS[id].kind]) assert(w.clips[n], `${id} lacks arms clip ${n}`);
    for (const s of ['muzzle', 'eject', 'ads_anchor', 'sight', 'grip_r', 'grip_l']) assert(w.sockets[s], `${id} lacks socket ${s}`);
    for (const p of WEAPONS[id].parts) assert(w.parts[p], `${id} lacks part node ${p}`);
  }
});

register('views/weapons', 'sights align with the camera in the ads pose, muzzles point forward in the hip pose', async ctx => {
  const { vm, camera, available } = ctx.view;
  const keep = vm.weaponId;
  const eye = new Vector3(), tmp = new Vector3(), dir = new Vector3(), fwd = new Vector3();
  try {
    for (const id of available) {
      if (!CLIP_SETS[WEAPONS[id].kind].includes('ads')) continue;
      await vm.equip(id, { instant: true });
      vm.pose('ads', 0);
      vm.update(0, camera);
      camera.getWorldPosition(eye);
      vm.socketWorld('ads_anchor', tmp);
      assert(tmp.distanceTo(eye) < 0.006, `${id}: ads_anchor is ${(tmp.distanceTo(eye) * 1000).toFixed(1)} mm from the camera in the ads pose`);
      vm.pose('idle', 0);
      vm.update(0, camera);
      vm.muzzleDirection(dir);
      camera.getWorldDirection(fwd);
      assert(dir.angleTo(fwd) < 0.35, `${id}: muzzle points ${(dir.angleTo(fwd) * 57.3).toFixed(0)} degrees away from the view direction at the hip`);
    }
  } finally {
    vm.unfreeze();
    await vm.equip(keep, { instant: true });
    vm.update(0, camera);
  }
});

register('views/weapons', 'six ghillie variants change sleeve color and strand texture, fire clips return to their start pose', async ctx => {
  const { vm } = ctx.view;
  const before = vm.variant;
  const seen = new Set();
  try {
    for (const v of VARIANTS) {
      await vm.setVariant(v.id);
      seen.add(`${vm.materials.M_sleeve.color.getHexString()}${vm.materials.M_strands.map.uuid}`);
    }
  } finally {
    await vm.setVariant(before);
  }
  assert(seen.size === 6, `variants produce ${seen.size} distinct looks, expected 6`);
  for (const id of ctx.view.available) {
    const clip = vm.weapon(id).clips.fire;
    if (!clip) continue;
    for (const t of clip.tracks) if (t.name.endsWith('.quaternion')) {
      const n = t.getValueSize(), a = t.values.slice(0, n), b = t.values.slice(t.values.length - n);
      assert(a.every((x, k) => Math.abs(x - b[k]) < 2e-3), `${id}: fire clip does not return to its start pose on ${t.name}`);
    }
  }
});

register('views/weapons', 'equip plays holster and draw, the throw clip fires its release event, fire starts an additive clip', async ctx => {
  const { vm } = ctx.view;
  if (!vm.weapon('frag') || !vm.weapon('carbine')) return;
  const keep = vm.weaponId;
  try {
    await vm.equip('frag', { instant: true });
    let released = null;
    const done = await vm.play('throw', { speed: 2.5, onEvent: n => { if (n === 'release') released = vm.act.time; } });
    assert(done === true && released !== null && Math.abs(released - 0.4) < 0.12, `throw finished ${done}, release event at ${released}`);
    await vm.equip('carbine');
    assert(vm.weaponId === 'carbine' && vm.act === null && vm.swapping === false, 'a normal equip must end with the new weapon drawn and no clip running');
    assert(vm.fire(0.1) === true, 'fire must start the fire clips');
    const before = vm.ads;
    vm.setAds(true);
    assert(vm.adsWant === true && vm.ads >= before, 'setAds must request the aim pose');
    vm.setAds(false);
  } finally {
    await vm.equip(keep, { instant: true });
  }
});
