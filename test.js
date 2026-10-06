import { Scene, PerspectiveCamera, Vector3, Euler, Mesh, PlaneGeometry, MeshStandardMaterial, FogExp2, PMREMGenerator, MathUtils, WebGLRenderTarget, FloatType, FrontSide } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { verticalFov, NEAR, FAR, PRESETS } from '../render/renderer.js';
import { createSun } from '../render/sun.js';
import { createLoop } from '../core/loop.js';
import { createInput } from '../core/input.js';
import { provide, expose } from '../core/debug.js';
import { register, assert } from '../core/selftest.js';

const FOV = 90;
const SENSITIVITY = 0.0012;
const START_TIME = 14;
const SUN_AZIMUTH_OFFSET = -70;
const SUN_INTENSITY = 32;
const EXPOSURE = 0.38;
const SKY_PEAK = 40;
const GROUND_SIZE = 8000;
const GROUND_TILE = 3.2;
const TEX = '/assets/textures/sparse_grass/sparse_grass_';
const UP = new Vector3(0, 1, 0);
const SKY = { turbidity: 5.5, rayleigh: 1.4, mieCoefficient: 0.0012, mieDirectionalG: 0.96, cloudCoverage: 0.32 };
const PROPS = [
  ['WoodenMilitaryCrate', 0.1, 0, -5.4, 0.32],
  ['WoodenMilitaryCrate', -1.35, 0, -6.1, -0.18],
  ['WoodenMilitaryCrate', -1.35, 0.465, -6.1, -0.09],
  ['Jerrycan', 1.25, 0, -4.55, 0.9],
  ['Jerrycan', 1.7, 0, -5.05, 1.35]
];
const SKY_PATCHES = {
  vertex: ['gl_Position.z = gl_Position.w;', '#ifdef USE_REVERSED_DEPTH_BUFFER\ngl_Position.z = 0.0;\n#else\ngl_Position.z = gl_Position.w;\n#endif\n'],
  fragment: ['gl_FragColor = vec4( texColor, 1.0 );', `texColor *= min( 1.0, ${SKY_PEAK.toFixed(1)} / max( dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ) );
gl_FragColor = vec4( mix( horizonColor, texColor, smoothstep( -0.005, 0.05, direction.y ) ), 1.0 );`]
};

function sunDirection(hours) {
  const day = MathUtils.clamp((hours - 6) / 12, 0, 1);
  const elevation = MathUtils.degToRad(Math.sin(day * Math.PI) * 56 - 2);
  const azimuth = MathUtils.degToRad(SUN_AZIMUTH_OFFSET + day * 180);
  return new Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
}

function groundMaterial(map, normalMap, arm) {
  const mat = new MeshStandardMaterial({ map, normalMap, aoMap: arm, roughnessMap: arm, metalness: 0, roughness: 1 });
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vGroundXZ;
float groundHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float groundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), u.x), mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec3 groundNear = texture2D(map, vMapUv).rgb;
  vec3 groundFar = texture2D(map, vMapUv * 0.173 + vec2(0.41, 0.23)).rgb;
  float groundMix = smoothstep(0.3, 0.7, groundNoise(vGroundXZ * 0.07) * 0.7 + groundNoise(vGroundXZ * 0.31) * 0.3);
  vec3 groundColor = mix(groundNear, groundFar, groundMix) * mix(0.8, 1.12, groundNoise(vGroundXZ * 0.013));
  diffuseColor.rgb *= groundColor;
#endif`);
  };
  return mat;
}

function createCam() {
  return { pos: new Vector3(-0.6, 1.65, -1.3), prev: new Vector3(-0.6, 1.65, -1.3), vel: new Vector3(), wish: new Vector3(), yaw: -0.08, pitch: -0.13 };
}

function moveCamera(cam, input, dt) {
  cam.prev.copy(cam.pos);
  const f = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0);
  const s = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
  const u = (input.down('jump') ? 1 : 0) - (input.down('crouch') ? 1 : 0);
  cam.wish.set(s, 0, -f).applyAxisAngle(UP, cam.yaw);
  cam.wish.y = u;
  if (cam.wish.lengthSq() > 1) cam.wish.normalize();
  cam.wish.multiplyScalar(input.down('sprint') ? 24 : 5);
  cam.vel.lerp(cam.wish, 1 - Math.exp(-dt * 9));
  cam.pos.addScaledVector(cam.vel, dt);
  cam.pos.y = Math.max(0.3, cam.pos.y);
}

const _euler = new Euler(0, 0, 0, 'YXZ');
function placeCamera(cam, camera, alpha) {
  camera.position.lerpVectors(cam.prev, cam.pos, alpha);
  camera.quaternion.setFromEuler(_euler.set(cam.pitch, cam.yaw, 0));
}

export async function createView(ctx) {
  const { render, assets, loop, input } = ctx;
  const { renderer } = render;
  const repeat = GROUND_SIZE / GROUND_TILE;
  const texturesLoading = Promise.all(['diff', 'nor_gl', 'arm'].map(m => assets.texture(`${TEX}${m}.ktx2`, { repeat })));
  const names = [...new Set(PROPS.map(p => p[0]))];
  const modelsLoading = Promise.all(names.map(name => assets.model(name, [0.6, 0.5, 0.6])));
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, NEAR, FAR);
  render.onResize((w, h) => {
    camera.aspect = w / h;
    camera.fov = verticalFov(FOV, camera.aspect);
    camera.updateProjectionMatrix();
  });

  const sky = new Sky();
  sky.scale.setScalar(5000);
  scene.add(sky);
  const envScene = new Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(10);
  for (const s of [sky, envSky]) for (const [k, value] of Object.entries(SKY)) s.material.uniforms[k].value = value;
  envSky.material.uniforms.showSunDisc.value = 0;
  envScene.add(envSky);

  renderer.toneMappingExposure = EXPOSURE;
  const sun = createSun(render, 0xffe2c0, SUN_INTENSITY);
  scene.add(sun);
  scene.fog = new FogExp2(0x9aa3a8, 0.0012);
  const skyPatched = { vertex: false, fragment: false };
  sky.material.uniforms.horizonColor = { value: scene.fog.color };
  sky.material.onBeforeCompile = shader => {
    skyPatched.vertex = shader.vertexShader.includes(SKY_PATCHES.vertex[0]);
    skyPatched.fragment = shader.fragmentShader.includes(SKY_PATCHES.fragment[0]);
    shader.vertexShader = shader.vertexShader.replace(...SKY_PATCHES.vertex);
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform vec3 horizonColor;')
      .replace(...SKY_PATCHES.fragment);
  };

  const pmrem = new PMREMGenerator(renderer);
  const probe = new WebGLRenderTarget(16, 4, { type: FloatType });
  const probeCam = new PerspectiveCamera(2, 4, 0.1, 100);
  let envTarget = null, time = START_TIME;
  const setTime = hours => {
    time = MathUtils.clamp(hours, 5, 19);
    const dir = sunDirection(time);
    sky.material.uniforms.sunPosition.value.copy(dir);
    envSky.material.uniforms.sunPosition.value.copy(dir);
    sun.position.copy(dir);
    const warm = MathUtils.smoothstep(dir.y, 0.05, 0.6);
    sun.color.setRGB(1, 0.72 + 0.24 * warm, 0.5 + 0.42 * warm);
    sun.intensity = SUN_INTENSITY * MathUtils.smoothstep(dir.y, -0.02, 0.12);
    const old = envTarget;
    envTarget = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = envTarget.texture;
    if (old) old.dispose();
    const px = new Float32Array(16 * 4 * 4), sum = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      probeCam.rotation.set(MathUtils.degToRad(1.5), i * Math.PI / 2, 0, 'YXZ');
      probeCam.updateMatrixWorld();
      renderer.setRenderTarget(probe);
      renderer.render(envScene, probeCam);
      renderer.readRenderTargetPixels(probe, 0, 0, 16, 1, px);
      for (let j = 0; j < 16; j++) for (let c = 0; c < 3; c++) sum[c] += px[j * 4 + c] / 64;
    }
    renderer.setRenderTarget(null);
    scene.fog.color.setRGB(sum[0], sum[1], sum[2]);
    return time;
  };
  setTime(START_TIME);

  const [map, normalMap, arm] = await texturesLoading;
  const ground = new Mesh(new PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMaterial(map, normalMap, arm));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  const loaded = await modelsLoading;
  for (const [name, x, y, z, rot] of PROPS) {
    const o = loaded[names.indexOf(name)].scene.clone();
    o.position.set(x, y, z);
    o.rotation.y = rot;
    o.name = name;
    scene.add(o);
  }

  const cam = createCam();
  loop.addTick('view/test/camera', dt => moveCamera(cam, input, dt), 20);
  const applyCamera = alpha => {
    placeCamera(cam, camera, alpha);
    sky.position.copy(camera.position);
  };
  loop.addFrame('view/test/camera', alpha => {
    const { dx, dy } = input.look();
    if (!loop.paused) {
      cam.yaw -= dx * SENSITIVITY;
      cam.pitch = MathUtils.clamp(cam.pitch - dy * SENSITIVITY, -1.55, 1.55);
    }
    applyCamera(alpha);
    sky.material.uniforms.time.value = loop.simTime;
  }, 10);
  applyCamera(1);

  provide('view', () => ({ name: 'test', time, camera: { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z, yaw: cam.yaw, pitch: cam.pitch }, sun: sun.position.toArray(), props: PROPS.map(p => p[0]) }));
  expose('teleport', (x, y, z, yaw = cam.yaw, pitch = cam.pitch) => {
    cam.pos.set(x, y, z);
    cam.prev.copy(cam.pos);
    cam.vel.set(0, 0, 0);
    Object.assign(cam, { yaw, pitch });
    applyCamera(1);
    return [x, y, z, yaw, pitch];
  }, 'teleport(x, y, z, yaw?, pitch?) -> move the test camera');
  expose('setTime', setTime, 'setTime(hours 5..19) -> move the sun, rebuild sky lighting and fog');

  return {
    scene, camera, sun, ground, skyPatched, setTime,
    startHint: 'Temporary test scene: fly with WASD, Space up, C down, Shift for speed',
    restoreGpu: () => { envTarget = null; setTime(time); },
    get time() { return time; }
  };
}

register('views/test', 'scene content is lit, shadowed and fully loaded', async ctx => {
  const v = ctx.view;
  assert(v.scene.environment && v.scene.fog, 'environment lighting and fog must be set');
  assert(v.sun.isSunLight && v.sun.castShadow && v.sun.shadow.getViewportCount() >= 4, 'sun must be a SunLight with at least 4 shadow cascades');
  assert(v.skyPatched.vertex && v.skyPatched.fragment, `sky shader patch missing: ${JSON.stringify(v.skyPatched)}`);
  const props = v.scene.children.filter(o => o.name === 'WoodenMilitaryCrate' || o.name === 'Jerrycan');
  assert(props.length === PROPS.length, `expected ${PROPS.length} props, found ${props.length}`);
  for (const p of props) {
    assert(!p.userData.placeholder, `${p.name} is a placeholder`);
    let meshes = 0;
    p.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      const m = o.material;
      assert(o.castShadow && m.map && m.map.isCompressedTexture && m.normalMap && m.roughnessMap, `${p.name} mesh must cast shadows and use compressed PBR maps`);
      assert(m.aoMap && m.aoMap.source === m.roughnessMap.source, `${p.name} must use the ARM red channel as ambient occlusion`);
      assert(m.side === FrontSide, `${p.name} is a closed mesh and must not be double sided`);
    });
    assert(meshes > 0, `${p.name} has no meshes`);
  }
  for (const name of new Set(PROPS.map(p => p[0]))) {
    const m = await ctx.assets.model(name);
    assert(m.scene.getObjectByName(name), `${name}.glb must contain a node named ${name}`);
  }
  const m = v.ground.material;
  assert(m.map.isCompressedTexture && m.normalMap.isCompressedTexture && m.roughnessMap.isCompressedTexture, 'ground textures must be KTX2 compressed');
  assert(v.ground.receiveShadow, 'ground must receive shadows');
});

register('views/test', 'camera moves on fixed ticks and renders interpolated', () => {
  const errors = [];
  const loop = createLoop((name, e) => errors.push(`${name}: ${e.message}`));
  const source = new EventTarget();
  const doc = new EventTarget();
  doc.pointerLockElement = null;
  const input = createInput(document.createElement('div'), source, doc);
  const cam = createCam();
  const camera = new PerspectiveCamera();
  cam.prev.set(0, 1, 0);
  cam.pos.set(2, 1, 0);
  placeCamera(cam, camera, 0.25);
  assert(Math.abs(camera.position.x - 0.5) < 1e-6, `alpha 0.25 must render a quarter of the way, got x=${camera.position.x}`);
  cam.pos.set(0, 2, 0);
  cam.yaw = 0;
  loop.addTick('camera', dt => moveCamera(cam, input, dt), 20);
  loop.addTick('input', () => input.endTick(), 1000);
  source.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  loop.step(60);
  source.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  assert(errors.length === 0, errors.join('; '));
  assert(cam.pos.z < -3 && Math.abs(cam.pos.x) < 1e-6 && Math.abs(loop.simTime - 1) < 1e-9, `holding W for 1 s must move about 4 m along -z, got ${cam.pos.toArray().map(n => n.toFixed(2))}`);
});

register('views/test', 'sun shadow follows the preset', ctx => {
  const v = ctx.view;
  const before = ctx.render.presetName;
  const other = before === 'medium' ? 'high' : 'medium';
  try {
    ctx.render.setPreset(other);
    assert(v.sun.shadow.mapSize.x === PRESETS[other].shadowMapSize && v.sun.shadow.camera.far === PRESETS[other].shadowFar, `sun shadow map ${v.sun.shadow.mapSize.x} did not follow preset ${other}`);
  } finally {
    ctx.render.setPreset(before);
  }
  assert(v.sun.shadow.mapSize.x === PRESETS[before].shadowMapSize, 'sun shadow map size was not restored');
});

register('views/test', 'setTime moves the sun and rebuilds lighting', ctx => {
  const v = ctx.view;
  const before = v.time;
  const env = v.scene.environment;
  const fog = v.scene.fog.color.clone();
  try {
    v.setTime(12);
    assert(v.sun.position.y > 0.75, `noon sun must be high, y=${v.sun.position.y}`);
    assert(v.scene.environment !== env, 'environment map must be rebuilt');
    assert(!v.scene.fog.color.equals(fog), 'fog color must follow the sky');
  } finally {
    v.setTime(before);
  }
  assert(v.sun.position.y > 0.6 && v.sun.position.y < 0.8 && v.sun.color.g > 0.9, `default time must be an early afternoon sun, warm but not golden, y=${v.sun.position.y} green=${v.sun.color.g}`);
});
