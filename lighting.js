import { Scene, PerspectiveCamera, Vector3, Color, Mesh, CircleGeometry, MeshBasicMaterial, FogExp2, PMREMGenerator, MathUtils, WebGLRenderTarget, FloatType, ShaderChunk, Material } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createSun } from './sun.js';
import { register, assert, report } from '../core/selftest.js';

const SUN_AZIMUTH_OFFSET = -70;
const SUN_LATITUDE = 50;
const SUN_DECLINATION = 23;
const SOLAR_NOON = 13.33;
const TIME_RANGE = [5.5, 21];
const SUN_INTENSITY = 40;
const EXPOSURE = 0.2;
const SKY_PEAK = 40;
const SKY_DESAT = 0.55;
const SKY_ZENITH = 7.0;
const FOG_GAIN = 1.6;
const ENV_DESAT = 0.78;
const ENV_INTENSITY = 0.6;
const LOW_SUN_EXPOSURE = 2.2;
const SKY = { turbidity: 5.0, rayleigh: 0.75, mieCoefficient: 0.007, mieDirectionalG: 0.82, cloudCoverage: 0.42, cloudDensity: 1.1 };
const FOG = { density: 0.00015, base: 45, falloff: 0.0035 };
const SKY_PATCHES = {
  vertex: ['gl_Position.z = gl_Position.w;', '#ifdef USE_REVERSED_DEPTH_BUFFER\ngl_Position.z = 0.0;\n#else\ngl_Position.z = gl_Position.w;\n#endif\n'],
  fragment: ['gl_FragColor = vec4( texColor, 1.0 );', `texColor *= min( 1.0, ${SKY_PEAK.toFixed(1)} / max( dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 ) );
float skyLum = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
vec3 zenithColor = mix( vec3( skyLum ), texColor, ${SKY_DESAT.toFixed(2)} ) * vec3( 1.0, 1.05, 0.96 ) * ${SKY_ZENITH.toFixed(2)};
texColor = zenithColor * mix( 0.85, 1.0, smoothstep( 0.0, 0.5, direction.y ) ) + horizonColor * mix( 0.95, 0.12, smoothstep( 0.0, 0.5, direction.y ) );
gl_FragColor = vec4( mix( horizonColor, texColor, smoothstep( -0.005, 0.07, direction.y ) ), 1.0 );`],
  cloud: ['vec3 cloudColor = skyAmbient + sunColor * shade;', `float cloudCore = smoothstep( 0.02, 0.3, depth );
vec3 cloudColor = vec3( dot( skyAmbient * 1.2 + sunColor * shade * mix( 1.2, 0.62, cloudCore ), vec3( 0.3333 ) ) * 1.25 ) * mix( vec3( 1.0, 0.985, 0.96 ), vec3( 0.93, 0.95, 1.0 ), cloudCore ) + sunColor * silver * edge * 0.2;`]
};

const ENV_PATCH = ['gl_FragColor = vec4( texColor, 1.0 );', `texColor = mix( vec3( dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) ) ), texColor, ${ENV_DESAT.toFixed(2)} );
gl_FragColor = vec4( texColor, 1.0 );`];

const fogUniforms = { fogSunDir: { value: new Vector3(0, 1, 0) }, fogSunColor: { value: new Color(0, 0, 0) }, fogHeight: { value: [FOG.base, FOG.falloff] } };

const FOG_PATCHES = [
  ['fog_pars_vertex', '#ifdef USE_FOG\n\tvarying float vFogDepth;\n#endif', '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogView;\n#endif'],
  ['fog_vertex', '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n#endif', '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogView = mvPosition.xyz;\n#endif'],
  ['fog_pars_fragment', '#ifdef USE_FOG\n\tuniform vec3 fogColor;', '#ifdef USE_FOG\n\tuniform vec3 fogColor;\n\tvarying vec3 vFogView;\n\tuniform vec3 fogSunDir;\n\tuniform vec3 fogSunColor;\n\tuniform vec2 fogHeight;'],
  ['fog_fragment', '\t\tfloat fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );', `
\t\tfloat fogLen = max(length(vFogView), 1e-4);
\t\tvec3 fogRay = transpose(mat3(viewMatrix)) * (vFogView / fogLen);
\t\tfloat fogK = fogHeight.y;
\t\tfloat fogDy = fogRay.y * fogLen * fogK;
\t\tfloat fogTerm = abs(fogDy) < 1e-3 ? 1.0 : (1.0 - exp(-fogDy)) / fogDy;
\t\tfloat fogFactor = 1.0 - exp( - fogDensity * fogLen * exp(-fogK * (cameraPosition.y - fogHeight.x)) * fogTerm );
\t\tvec3 fogColorSun = mix(fogColor * vec3(0.78, 0.9, 1.1), fogColor, fogFactor) + fogSunColor * pow(max(dot(fogRay, fogSunDir), 0.0), 5.0);`],
  ['fog_fragment', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColorSun, fogFactor );']
];
const unpatchedFog = [];
for (const [chunk, from, to] of FOG_PATCHES) {
  if (!ShaderChunk[chunk].includes(from)) { unpatchedFog.push(`${chunk}: ${from.slice(0, 40)}`); continue; }
  ShaderChunk[chunk] = ShaderChunk[chunk].replace(from, to);
}
if (unpatchedFog.length) report('render/lighting', new Error(`three changed the fog chunks, height fog patch missing for: ${unpatchedFog.join(' | ')}`));

export function injectFog(shader) {
  Object.assign(shader.uniforms, fogUniforms);
}
Material.prototype.onBeforeCompile = injectFog;

export const sunDirection = hours => {
  const lat = MathUtils.degToRad(SUN_LATITUDE), decl = MathUtils.degToRad(SUN_DECLINATION);
  const h = MathUtils.degToRad((hours - SOLAR_NOON) * 15);
  const elevation = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h));
  const azimuth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
  return new Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, MathUtils.degToRad(SUN_AZIMUTH_OFFSET + 90) + azimuth);
};

export function createLighting(ctx, scene, startTime = 13.5) {
  const { render } = ctx;
  const { renderer } = render;
  const sky = new Sky();
  sky.scale.setScalar(5000);
  sky.frustumCulled = false;
  scene.add(sky);
  const envScene = new Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(10);
  for (const s of [sky, envSky]) for (const [k, value] of Object.entries(SKY)) s.material.uniforms[k].value = value;
  envSky.material.uniforms.showSunDisc.value = 0;
  envSky.material.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace(...ENV_PATCH); };
  envScene.add(envSky);
  const groundMaterial = new MeshBasicMaterial({ color: 0x000000 });
  const ground = new Mesh(new CircleGeometry(60, 16), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  envScene.add(ground);

  renderer.toneMappingExposure = EXPOSURE;
  const sun = createSun(render, 0xffe2c0, SUN_INTENSITY);
  scene.add(sun);
  scene.fog = new FogExp2(0x9aa3a8, FOG.density);
  scene.environmentIntensity = ENV_INTENSITY;
  const skyPatched = { vertex: false, fragment: false, cloud: false };
  sky.material.uniforms.horizonColor = { value: scene.fog.color };
  sky.material.onBeforeCompile = shader => {
    skyPatched.vertex = shader.vertexShader.includes(SKY_PATCHES.vertex[0]);
    skyPatched.fragment = shader.fragmentShader.includes(SKY_PATCHES.fragment[0]);
    skyPatched.cloud = shader.fragmentShader.includes(SKY_PATCHES.cloud[0]);
    shader.vertexShader = shader.vertexShader.replace(...SKY_PATCHES.vertex);
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform vec3 horizonColor;')
      .replace(...SKY_PATCHES.fragment)
      .replace(...SKY_PATCHES.cloud);
  };

  const pmrem = new PMREMGenerator(renderer);
  const probe = new WebGLRenderTarget(16, 4, { type: FloatType });
  const probeCam = new PerspectiveCamera(2, 4, 0.1, 100);
  let envTarget = null, vmTarget = null, time = startTime;
  const setTime = hours => {
    time = MathUtils.clamp(hours, TIME_RANGE[0], TIME_RANGE[1]);
    const dir = sunDirection(time);
    sky.material.uniforms.sunPosition.value.copy(dir);
    envSky.material.uniforms.sunPosition.value.copy(dir);
    sun.position.copy(dir);
    const warm = MathUtils.smoothstep(dir.y, 0.05, 0.6);
    sun.color.setRGB(1, 0.72 + 0.24 * warm, 0.5 + 0.42 * warm);
    sun.intensity = SUN_INTENSITY * MathUtils.smoothstep(dir.y, -0.02, 0.12);
    renderer.toneMappingExposure = EXPOSURE * MathUtils.lerp(LOW_SUN_EXPOSURE, 1, MathUtils.smoothstep(dir.y, 0.03, 0.35));
    ground.visible = false;
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
    scene.fog.color.setRGB(sum[0] * FOG_GAIN * 0.97, sum[1] * FOG_GAIN, sum[2] * FOG_GAIN * 1.06);
    ground.visible = true;
    groundMaterial.color.setRGB(sum[0] * 0.5, sum[1] * 0.62, sum[2] * 0.3);
    const old = envTarget;
    envTarget = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = envTarget.texture;
    if (old) old.dispose();
    const gc = groundMaterial.color.clone();
    const lum = (gc.r + gc.g + gc.b) / 3;
    groundMaterial.color.setRGB(lum * 1.15, lum * 0.95, lum * 0.78);
    const oldVm = vmTarget;
    vmTarget = pmrem.fromScene(envScene, 0, 0.1, 100);
    groundMaterial.color.copy(gc);
    if (oldVm) oldVm.dispose();
    fogUniforms.fogSunDir.value.copy(dir);
    fogUniforms.fogSunColor.value.setRGB(sum[0] * 0.5 * sun.color.r, sum[1] * 0.4 * sun.color.g, sum[2] * 0.25 * sun.color.b);
    return time;
  };
  setTime(startTime);

  return {
    sky, sun, skyPatched, setTime, fogColor: scene.fog.color,
    get vmEnvironment() { return vmTarget.texture; },
    get time() { return time; },
    update(camera, simTime) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = simTime;
    },
    restoreGpu() { envTarget = null; vmTarget = null; setTime(time); }
  };
}

register('render/lighting', 'height fog patch is applied and the sun is a four cascade SunLight', ctx => {
  assert(unpatchedFog.length === 0, `fog patch missing: ${unpatchedFog.join(' | ')}`);
  assert(ShaderChunk.fog_fragment.includes('fogHeight') && ShaderChunk.fog_vertex.includes('vFogView'), 'height fog chunks not installed');
  const l = ctx.world.lighting;
  assert(l.sun.isSunLight && l.sun.castShadow && l.sun.shadow.getViewportCount() >= 4, 'sun must be a SunLight with at least 4 shadow cascades');
  assert(l.skyPatched.vertex && l.skyPatched.fragment && l.skyPatched.cloud, `sky shader patch missing: ${JSON.stringify(l.skyPatched)}`);
  assert(ctx.world.scene.fog.isFogExp2 && ctx.world.scene.environment, 'scene needs height fog and an environment map');
});

register('render/lighting', 'setTime moves the sun, environment and fog together', ctx => {
  const l = ctx.world.lighting;
  const before = l.time;
  const exposure = ctx.render.renderer.toneMappingExposure;
  try {
    l.setTime(10);
    assert(l.sun.position.y > 0.55 && l.sun.position.y < 0.8, `10:00 sun elevation y=${l.sun.position.y}`);
    const env = ctx.world.scene.environment;
    const fog = ctx.world.scene.fog.color.clone();
    l.setTime(16);
    assert(ctx.world.scene.environment !== env && !ctx.world.scene.fog.color.equals(fog), 'environment and fog must be rebuilt for a new time');
    l.setTime(13.5);
    assert(l.sun.position.y > 0.8 && l.sun.color.g > 0.9, `default time must be a bright, warm but not golden sun, y=${l.sun.position.y} g=${l.sun.color.g}`);
    for (const t of [TIME_RANGE[0], 18, TIME_RANGE[1]]) {
      l.setTime(t);
      assert(l.sun.position.y > 0.02 && l.sun.intensity > 0.2 * SUN_INTENSITY, `${t}:00 must still be daylight, sun y=${l.sun.position.y} intensity=${l.sun.intensity}`);
    }
    assert(ctx.render.renderer.toneMappingExposure > EXPOSURE, 'a low sun must raise the exposure');
  } finally {
    l.setTime(before);
  }
  assert(l.time === before && ctx.render.renderer.toneMappingExposure === exposure, 'setTime must restore the time and exposure');
});
