import { Scene, PerspectiveCamera, Group, Vector3, Quaternion, AnimationMixer, AnimationUtils, AdditiveAnimationBlendMode, LoopOnce, LoopRepeat, DoubleSide, MathUtils } from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RenderPass } from 'postprocessing';
import { WEAPONS, CLIP_SETS, SOCKETS, ORDER } from '../weapons/defs.js';
import { applyVariant, variantById, VARIANTS } from './ghillie.js';
import { register, assert } from '../core/selftest.js';

const NEAR = 0.01;
const FAR = 20;
const FOV = 62;
const FOV_ADS = 55;
const ADS_TIME = 0.2;
const SPRINT_TIME = 0.22;
const FADES = { draw: [0, 0.05], holster: [0.05, 0], throw: [0.05, 0.14], pull_pin: [0.1, 0.06], cook: [0.06, 0.0], reload: [0.16, 0.14], reload_empty: [0.16, 0.14], unwrap: [0.12, 0.0], apply: [0.0, 0.18], default: [0.12, 0.12] };
const BONE_REST = new Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0);
const WEAR = shader => {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_COLOR_ALPHA
float wear = vColor.a;
#else
float wear = 0.0;
#endif`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
float bare = step(0.3, metalnessFactor);
vec3 worn = mix(diffuseColor.rgb * 1.7 + 0.01, vec3(0.30, 0.30, 0.32), bare);
diffuseColor.rgb = mix(diffuseColor.rgb, worn, wear * 0.7);
roughnessFactor = mix(roughnessFactor, mix(min(1.0, roughnessFactor + 0.12), roughnessFactor * 0.45 + 0.1, bare), wear);`);
};
const _q = new Quaternion();
const _s = new Vector3();

function spring(k, d) {
  return { x: 0, v: 0, t: 0, k, d, step(dt) { const a = this.k * (this.t - this.x) - this.d * this.v; this.v += a * dt; this.x += this.v * dt; } };
}

export async function createViewmodel(ctx, { fov = FOV } = {}) {
  const { assets } = ctx;
  const clipsLoading = fetch('/assets/weapons/clips.json').then(r => r.json());
  const armsLoading = assets.model('FPArms', [0.4, 0.4, 0.8]);
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, NEAR, FAR);
  const group = new Group();
  const kick = new Group();
  const root = new Group();
  root.rotation.y = Math.PI;
  group.add(kick);
  kick.add(root);
  scene.add(group);
  const info = await clipsLoading;
  const armsGltf = await armsLoading;
  const armsRoot = cloneSkinned(armsGltf.scene);
  root.add(armsRoot);
  const weaponBone = armsRoot.getObjectByName('weapon');
  const materials = {};
  armsRoot.traverse(o => {
    o.frustumCulled = false;
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = true;
    o.material = o.material.clone();
    materials[o.material.name] = o.material;
    if (o.material.name === 'M_strands') Object.assign(o.material, { alphaTest: 0.45, transparent: false, depthWrite: true, side: DoubleSide });
  });
  const armsMixer = new AnimationMixer(armsRoot);
  const armsClips = new Map(armsGltf.animations.map(c => [c.name, c]));
  const additive = new Map();
  const loaded = new Map();
  const strandTex = new Map();
  const sun = new SunLight(0xffffff, 1);
  scene.add(sun);
  const spr = { yaw: spring(70, 11), pitch: spring(70, 11), roll: spring(60, 10), back: spring(260, 24), kp: spring(240, 20), ky: spring(240, 20), kr: spring(240, 20), dip: spring(120, 14), bx: spring(120, 14), by: spring(120, 14) };
  const vm = {
    scene, camera, group, kick, root, materials, info, armsRoot, sun,
    fov, fovAds: FOV_ADS, weaponId: null, variant: 'woodland', ads: 0, sprint: 0, adsWant: false, sprintWant: false, speed: 0, grounded: true, crouch: false, bobPhase: 0, timeScale: 1,
    current: null, act: null, shot: null, swapping: false, passes: null, worldSun: null, worldScene: null, events: new Map(), aspect: 1
  };

  vm.setAspect = a => { vm.aspect = a; camera.aspect = a; camera.updateProjectionMatrix(); };
  vm.setFov = v => { camera.fov = v; camera.updateProjectionMatrix(); };

  async function loadWeapon(id) {
    if (loaded.has(id)) return loaded.get(id);
    const def = WEAPONS[id];
    if (!def) throw new Error(`unknown weapon "${id}"`);
    const m = await assets.model(def.model, [0.1, 0.2, 0.6]);
    const g = m.scene.clone(true);
    g.traverse(o => {
      o.frustumCulled = false;
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.material.onBeforeCompile = WEAR;
      }
    });
    const sockets = {};
    for (const s of SOCKETS) sockets[s] = g.getObjectByName(s);
    const parts = {};
    for (const p of def.parts) parts[p] = g.getObjectByName(p);
    const partClips = new Map(m.animations.map(c => [c.name, c]));
    const clips = {};
    for (const n of CLIP_SETS[def.kind]) clips[n] = armsClips.get(`${id}.${n}`) || null;
    const w = { def, group: g, sockets, parts, partClips, clips, mixer: new AnimationMixer(g), placeholder: m.placeholder };
    loaded.set(id, w);
    return w;
  }

  function armsAction(clip, mode = 'normal') {
    if (mode === 'additive') {
      if (!additive.has(clip)) {
        const c = clip.clone();
        AnimationUtils.makeClipAdditive(c, 0, c, 60);
        additive.set(clip, c);
      }
      const a = armsMixer.clipAction(additive.get(clip));
      a.blendMode = AdditiveAnimationBlendMode;
      return a;
    }
    return armsMixer.clipAction(clip);
  }

  function startBase(w) {
    armsMixer.stopAllAction();
    w.base = {};
    for (const n of ['idle', 'ads', 'sprint']) {
      const c = w.clips[n];
      if (!c) continue;
      const a = armsAction(c);
      a.setLoop(LoopRepeat, Infinity);
      a.enabled = true;
      a.setEffectiveWeight(n === 'idle' ? 1 : 0);
      a.play();
      w.base[n] = a;
    }
  }

  function attach(w) {
    if (vm.current) weaponBone.remove(vm.current.group);
    vm.current = w;
    vm.weaponId = w.def.id;
    w.group.quaternion.copy(BONE_REST);
    weaponBone.add(w.group);
    startBase(w);
    vm.act = null;
    vm.shot = null;
  }

  vm.weapon = id => loaded.get(id);
  vm.load = async ids => {
    const list = await Promise.all((ids || ORDER).map(loadWeapon));
    return list.map(w => w.def.id);
  };

  vm.setVariant = async id => {
    const v = variantById(id);
    let tex = null;
    if (v.id !== 'woodland') {
      if (!strandTex.has(v.id)) strandTex.set(v.id, await assets.texture(v.strands, { srgb: true }));
      tex = strandTex.get(v.id);
    } else {
      if (!strandTex.has('woodland')) strandTex.set('woodland', await assets.texture(VARIANTS[0].strands, { srgb: true }));
      tex = strandTex.get('woodland');
    }
    vm.variant = applyVariant(materials, tex, v.id).id;
    return vm.variant;
  };

  const baseWeights = () => {
    const w = vm.current;
    if (!w) return;
    const sp = vm.sprint, ad = vm.ads * (1 - sp);
    const aw = vm.act ? vm.act.weight : 0;
    const k = 1 - aw;
    const set = (n, v) => { if (w.base[n]) w.base[n].setEffectiveWeight(Math.max(0, v) * k + (n === 'idle' && aw < 1 ? 1e-4 : 0)); };
    set('idle', (1 - ad) * (1 - sp));
    set('ads', ad);
    set('sprint', sp);
    if (w.base.sprint) w.base.sprint.timeScale = MathUtils.clamp(0.55 + vm.speed * 0.6, 0.5, 1.3);
  };

  vm.equip = async (id, { instant = false } = {}) => {
    const next = await loadWeapon(id);
    if (vm.swapping || (vm.current && vm.current.def.id === id)) return false;
    vm.swapping = true;
    vm.adsWant = false;
    vm.sprintWant = false;
    if (vm.current && !instant && vm.current.clips.holster) await vm.play('holster');
    attach(next);
    vm.swapping = false;
    if (!instant && next.clips.draw) await vm.play('draw');
    return true;
  };

  vm.play = (name, { speed = 1, loop = false, onEvent = null } = {}) => new Promise(resolve => {
    const w = vm.current;
    const clip = w && w.clips[name];
    if (!clip) { resolve(false); return; }
    if (vm.act) vm.cancel(0);
    const a = armsAction(clip);
    a.reset();
    a.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    const pc = w.partClips.get(name);
    let pa = null;
    if (pc) {
      pa = w.mixer.clipAction(pc);
      pa.reset();
      pa.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
      pa.clampWhenFinished = true;
      pa.timeScale = speed;
      pa.play();
    }
    const [fi, fo] = FADES[name] || FADES.default;
    const events = Object.entries((info[w.def.id] && info[w.def.id][name] && info[w.def.id][name].events) || {}).map(([k, t]) => ({ name: k, t, fired: false })).sort((x, y) => x.t - y.t);
    vm.act = { name, a, pa, speed, loop, fi, fo, dur: clip.duration, time: 0, weight: 0, events, onEvent, resolve, cancel: null, from: 0 };
  });

  vm.cancel = (fade = 0.15) => {
    const act = vm.act;
    if (!act) return;
    if (fade <= 0) { finishAct(act, false); return; }
    act.cancel = { t: 0, fade };
    act.from = act.weight;
  };

  vm.stop = (fade = 0.12) => {
    if (vm.act && vm.act.loop) vm.cancel(fade);
  };

  function finishAct(act, done) {
    act.a.stop();
    if (act.pa) act.pa.stop();
    if (vm.act === act) vm.act = null;
    act.resolve(done);
  }

  vm.fire = (interval = 0.1) => {
    const w = vm.current;
    const clip = w && w.clips.fire;
    if (!clip) return false;
    const speed = Math.max(1, clip.duration / (interval * 0.92));
    const a = armsAction(clip, 'additive');
    a.reset();
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = false;
    a.timeScale = speed;
    a.setEffectiveWeight(vm.ads > 0.5 ? 0.7 : 1);
    a.play();
    const pc = w.partClips.get('fire');
    if (pc) {
      const pa = w.mixer.clipAction(pc);
      pa.reset();
      pa.setLoop(LoopOnce, 1);
      pa.clampWhenFinished = false;
      pa.timeScale = speed;
      pa.play();
    }
    return true;
  };

  vm.recoil = ({ pitch = 0.012, yaw = 0, back = 0.012, roll = 0 } = {}) => {
    spr.kp.v += pitch * 40;
    spr.ky.v += yaw * 40;
    spr.kr.v += roll * 40;
    spr.back.v -= back * 40;
  };

  vm.look = (dx, dy) => {
    spr.yaw.v += MathUtils.clamp(dx, -80, 80) * 0.0011;
    spr.pitch.v += MathUtils.clamp(dy, -80, 80) * 0.0011;
    spr.roll.v += MathUtils.clamp(dx, -80, 80) * 0.0007;
  };

  vm.landing = (strength = 1) => { spr.dip.v -= 0.5 * strength; };
  vm.setAds = on => { vm.adsWant = !!on && !!(vm.current && vm.current.clips.ads); };
  vm.setSprint = on => { vm.sprintWant = !!on; };
  vm.locomotion = ({ speed = 0, grounded = true, crouch = false } = {}) => { vm.speed = speed; vm.grounded = grounded; vm.crouch = crouch; };
  vm.on = (name, fn) => vm.events.set(name, fn);
  vm.clipInfo = (id, name) => (info[id] && info[id][name]) || null;
  vm.pose = (name, time = 0) => {
    const w = vm.current;
    if (!w || !w.clips[name]) return false;
    vm.cancel(0);
    for (const k of Object.keys(w.base)) w.base[k].setEffectiveWeight(0);
    const a = armsAction(w.clips[name]);
    a.reset();
    a.setLoop(LoopRepeat, Infinity);
    a.play();
    a.time = time;
    a.paused = true;
    a.setEffectiveWeight(1);
    const pc = w.partClips.get(name);
    if (pc) { const pa = w.mixer.clipAction(pc); pa.reset(); pa.play(); pa.time = time; pa.paused = true; }
    vm.frozen = { a, name };
    armsMixer.update(0);
    w.mixer.update(0);
    return true;
  };
  vm.unfreeze = () => {
    if (!vm.frozen) return;
    vm.frozen.a.stop();
    const w = vm.current;
    const pc = w.partClips.get(vm.frozen.name);
    if (pc) w.mixer.clipAction(pc).stop();
    vm.frozen = null;
    startBase(w);
  };

  vm.socketWorld = (name, out = new Vector3()) => {
    const s = vm.current && vm.current.sockets[name];
    return s ? s.getWorldPosition(out) : out.set(0, 0, 0);
  };
  vm.muzzleWorld = out => vm.socketWorld('muzzle', out);
  vm.ejectWorld = out => vm.socketWorld('eject', out);
  vm.muzzleDirection = (out = new Vector3()) => {
    const s = vm.current && vm.current.sockets.muzzle;
    if (!s) return out.set(0, 0, -1);
    s.getWorldQuaternion(_q);
    return out.set(0, 0, -1).applyQuaternion(_q);
  };

  vm.link = (worldSun, worldScene, environment = null) => {
    vm.worldSun = worldSun;
    vm.worldScene = worldScene;
    vm.environment = environment;
    sun.shadow = worldSun.shadow;
    sun.castShadow = true;
  };

  vm.createPass = () => {
    const pass = new RenderPass(scene, camera);
    pass.skipShadowMapUpdate = true;
    pass.ignoreBackground = true;
    pass.clearPass.color = false;
    pass.clearPass.depth = true;
    pass.clearPass.stencil = false;
    vm.pass = pass;
    return pass;
  };

  vm.insertPass = post => {
    const pass = vm.pass || vm.createPass();
    post.composer.addPass(pass, post.composer.passes.indexOf(post.passes.hdr));
    return pass;
  };

  vm.update = (dt, worldCamera) => {
    dt = Math.min(dt, 0.05);
    const w = vm.current;
    if (worldCamera) {
      worldCamera.updateMatrixWorld();
      worldCamera.matrixWorld.decompose(group.position, group.quaternion, _s);
      camera.position.copy(group.position);
      camera.quaternion.copy(group.quaternion);
    }
    if (vm.worldSun) {
      sun.position.copy(vm.worldSun.position);
      sun.color.copy(vm.worldSun.color);
      sun.intensity = vm.worldSun.intensity;
    }
    if (vm.worldScene) {
      scene.environment = vm.environment ? vm.environment() : vm.worldScene.environment;
      scene.environmentIntensity = vm.worldScene.environmentIntensity;
    }
    const adsRate = 1 / (w ? ADS_TIME : 1);
    const wantAds = vm.adsWant && !vm.sprintWant && !(vm.act && !vm.act.loop && vm.act.name !== 'fire');
    vm.ads = MathUtils.clamp(vm.ads + (wantAds ? 1 : -1) * adsRate * dt, 0, 1);
    vm.sprint = MathUtils.clamp(vm.sprint + ((vm.sprintWant && !vm.adsWant) ? 1 : -1) * dt / SPRINT_TIME, 0, 1);
    const se = vm.ads * vm.ads * (3 - 2 * vm.ads);
    camera.fov = MathUtils.lerp(vm.fov, vm.fovAds, se);
    camera.updateProjectionMatrix();
    const act = vm.act;
    if (act) {
      act.time += dt * act.speed;
      let wgt = 1;
      if (act.fi > 0) wgt = Math.min(wgt, act.time / act.fi);
      if (!act.loop && act.fo > 0) wgt = Math.min(wgt, (act.dur - act.time) / act.fo);
      wgt = MathUtils.clamp(wgt, 0, 1);
      act.weight = wgt * wgt * (3 - 2 * wgt);
      if (act.cancel) {
        act.cancel.t += dt;
        const k = Math.max(0, 1 - act.cancel.t / act.cancel.fade);
        act.weight = Math.min(act.weight, act.from * k);
        if (k <= 0) finishAct(act, false);
      }
      if (vm.act === act) {
        act.a.setEffectiveWeight(act.weight);
        for (const e of act.events) if (!e.fired && act.time >= e.t) {
          e.fired = true;
          if (act.onEvent) act.onEvent(e.name);
          const fn = vm.events.get(e.name);
          if (fn) fn(act.name);
        }
        if (!act.loop && act.time >= act.dur) finishAct(act, true);
      }
    }
    if (w && !vm.frozen) baseWeights();
    if (w) {
      armsMixer.update(dt);
      w.mixer.update(dt);
    }
    for (const k of Object.keys(spr)) {
      const s = spr[k];
      s.step(dt);
    }
    const moving = vm.grounded ? Math.min(1, vm.speed) : 0;
    const bobAmp = moving * (1 - vm.ads * 0.85) * (1 - vm.sprint * 0.5) * (vm.crouch ? 0.6 : 1);
    vm.bobPhase += dt * (4.5 + vm.speed * 5.5);
    const ph = vm.bobPhase;
    kick.position.set(spr.yaw.x * -0.12 + Math.sin(ph) * 0.0042 * bobAmp, -spr.pitch.x * 0.1 + spr.dip.x * 0.05 + Math.abs(Math.sin(ph)) * 0.0050 * bobAmp, spr.back.x);
    const adsScale = 1 - vm.ads * 0.7;
    kick.rotation.set((spr.pitch.x * 0.5 + spr.kp.x + Math.sin(ph * 2) * 0.0015 * bobAmp) * adsScale, (spr.yaw.x * 0.6 + spr.ky.x) * adsScale, (spr.roll.x * 0.4 + spr.kr.x + Math.sin(ph) * 0.004 * bobAmp) * adsScale);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  };

  vm.dispose = () => { armsMixer.stopAllAction(); scene.remove(group); };

  await vm.setVariant('woodland');
  return vm;
}

register('player/viewmodel', 'arms rig bones and camera setup', async ctx => {
  const vm = await createViewmodel(ctx);
  try {
    assert(vm.armsRoot.getObjectByName('weapon') && vm.armsRoot.getObjectByName('forearmR') && vm.armsRoot.getObjectByName('index_02L'), 'arms rig must contain weapon, forearmR and index_02L bones');
    assert(vm.camera.near <= 0.02 && vm.camera.fov > 50, 'viewmodel camera needs its own near plane and fov');
  } finally {
    vm.dispose();
  }
});
