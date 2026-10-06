import { LightShadow, OrthographicCamera, PerspectiveCamera, Matrix4, Vector3, Vector4, Frustum, ShaderChunk } from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { PRESETS, NEAR, FAR, verticalFov } from './renderer.js';
import { register, assert, report } from '../core/selftest.js';

const CASCADES = PRESETS.high.shadowCascades;
const SPLIT_LAMBDA = 0.92;
const SPLIT_LOG_NEAR = 1;
const FADE = 0.1;
const SHADOW_NEAR = 0.5;
const BIAS = 0.00002;
const NORMAL_BIAS_TEXELS = 1.2;

const PATCHES = [
  ['#define SUN_LIGHT_CASCADES 2', `#define SUN_LIGHT_CASCADES ${CASCADES}`],
  ['vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 )', 'vec4( vSunShadowWorldPosition.xyz, 1.0 )'],
  ['sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition', 'sunShadowMatrix[ cascadeOffset + i ] * ( shadowWorldPosition + vec4( vSunShadowWorldNormal * sunLightShadow.shadowNormalBias * cascade.w, 0.0 ) )']
];
const unpatched = PATCHES.filter(([from]) => !ShaderChunk.shadowmap_pars_fragment.includes(from)).map(([from]) => from);
for (const [from, to] of PATCHES) ShaderChunk.shadowmap_pars_fragment = ShaderChunk.shadowmap_pars_fragment.replace(from, to);
if (unpatched.length) report('render/sun', new Error(`three changed the sun shadow chunk, cascade patch missing for: ${unpatched.join(' | ')}`));

const _orient = new Matrix4();
const _viewToLight = new Matrix4();
const _dir = new Vector3();
const _up = new Vector3();
const _origin = new Vector3();
const _pos = new Vector3();

function cascadeSplits(near, far, count, out = []) {
  out[0] = near;
  for (let i = 1; i < count; i++) {
    const a = i / count;
    out[i] = SPLIT_LAMBDA * SPLIT_LOG_NEAR * Math.pow(far / SPLIT_LOG_NEAR, a) + (1 - SPLIT_LAMBDA) * (near + (far - near) * a);
  }
  out[count] = far;
  return out;
}

class CascadedShadow extends LightShadow {
  constructor(count) {
    super(new OrthographicCamera(-5, 5, 5, -5, SHADOW_NEAR, 350));
    this.cols = Math.ceil(Math.sqrt(count));
    this._frameExtents.set(this.cols, Math.ceil(count / this.cols));
    this._viewportCount = count;
    this._viewports = [];
    this._cameras = [];
    this._matrices = [];
    this._frustums = [];
    this._cascadeData = [];
    this.centers = [];
    this.radii = new Array(count).fill(0);
    this.splits = new Array(count + 1).fill(0);
    for (let i = 0; i < count; i++) {
      this._viewports.push(new Vector4());
      this._cameras.push(new OrthographicCamera());
      this._matrices.push(new Matrix4());
      this._frustums.push(new Frustum());
      this._cascadeData.push(new Vector4());
      this.centers.push(new Vector3());
    }
  }

  getCamera(i = 0) { return this._cameras[i]; }

  getMatrix(i = 0) { return this._matrices[i]; }

  getFrustum(i = 0) { return this._frustums[i]; }

  updateMatrices(light, view) {
    if (!view) return;
    const count = this._viewportCount;
    const inset = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.x);
    const resolution = this.mapSize.x * (1 - 2 * inset);
    for (let i = 0; i < count; i++) this._viewports[i].set(i % this.cols + inset, Math.floor(i / this.cols) + inset, 1 - 2 * inset, 1 - 2 * inset);
    const near = view.near;
    const far = Math.max(near + 1e-3, Math.min(this.camera.far, view.far));
    const splits = cascadeSplits(near, far, count, this.splits);
    const k = Math.hypot(1 / view.projectionMatrix.elements[0], 1 / view.projectionMatrix.elements[5]);
    _dir.setFromMatrixPosition(light.matrixWorld).negate().normalize();
    _up.set(0, 1, 0);
    if (Math.abs(_up.dot(_dir)) > 0.99) _up.set(0, 0, 1);
    _orient.lookAt(_origin.set(0, 0, 0), _dir, _up);
    _viewToLight.copy(_orient).transpose().multiply(view.matrixWorld);
    let ceiling = -Infinity;
    let from = near;
    for (let i = 0; i < count; i++) {
      const to = splits[i + 1];
      const fadeStart = to - FADE * (to - splits[i]);
      let depth = (from + to) * (1 + k * k) / 2;
      let radius;
      if (depth >= to) { depth = to; radius = k * to; } else radius = Math.hypot(depth - from, k * from);
      radius /= 1 - 1 / resolution;
      this._cascadeData[i].set(i === 0 ? -1e10 : from, to, fadeStart, 2 * radius / resolution);
      this.centers[i].set(0, 0, -depth).applyMatrix4(_viewToLight);
      this.radii[i] = radius;
      ceiling = Math.max(ceiling, this.centers[i].z + radius);
      from = fadeStart;
    }
    ceiling += far;
    for (let i = 0; i < count; i++) {
      const c = this.centers[i];
      const radius = this.radii[i];
      const texel = this._cascadeData[i].w;
      _pos.set(Math.round(c.x / texel) * texel, Math.round(c.y / texel) * texel, ceiling + SHADOW_NEAR).applyMatrix4(_orient);
      const cam = this._cameras[i];
      cam.position.copy(_pos);
      cam.quaternion.setFromRotationMatrix(_orient);
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.near = SHADOW_NEAR;
      cam.far = ceiling - c.z + radius + 2 * SHADOW_NEAR;
      cam.coordinateSystem = this.camera.coordinateSystem;
      cam._reversedDepth = this.camera.reversedDepth;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this._updateMatrix(cam, this._matrices[i], this._frustums[i], this._viewports[i]);
    }
  }
}

export function createSun(render, color, intensity) {
  const sun = new SunLight(color, intensity);
  sun.shadow = new CascadedShadow(CASCADES);
  sun.shadow.bias = BIAS;
  sun.shadow.normalBias = NORMAL_BIAS_TEXELS;
  sun.castShadow = true;
  render.onPreset(p => {
    sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    sun.shadow.camera.far = p.shadowFar;
    sun.shadow.radius = p.shadowRadius;
  });
  return sun;
}

register('render/sun', 'cascade count is compiled into the shadow chunk', () => {
  assert(unpatched.length === 0, `shadow chunk patch missing: ${unpatched.join(' | ')}`);
  assert(ShaderChunk.shadowmap_pars_fragment.includes(`#define SUN_LIGHT_CASCADES ${CASCADES}`), 'SUN_LIGHT_CASCADES define not patched');
  for (const [name, p] of Object.entries(PRESETS)) assert(p.shadowCascades === CASCADES, `preset ${name} has ${p.shadowCascades} cascades, the shaders are compiled for ${CASCADES}`);
  assert(CASCADES >= 4, `at least 4 cascades required, got ${CASCADES}`);
});

register('render/sun', 'cascades reach 300 m and stay sharp near the player at 3840x1080', () => {
  const view = new PerspectiveCamera(verticalFov(90, 32 / 9), 32 / 9, NEAR, FAR);
  view.position.set(0, 1.7, 0);
  view.rotation.set(-0.1, 0.4, 0);
  view.updateMatrixWorld();
  const light = new SunLight();
  light.position.set(0.8, 0.3, 0.2).normalize();
  light.updateMatrixWorld();
  for (const [name, p] of Object.entries(PRESETS)) {
    const shadow = new CascadedShadow(p.shadowCascades);
    shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    shadow.camera.far = p.shadowFar;
    shadow.radius = p.shadowRadius;
    shadow.updateMatrices(light, view);
    const d = shadow._cascadeData;
    const last = d[d.length - 1];
    assert(last.z >= 300, `${name}: shadows fade out at ${last.z.toFixed(1)} m, must be fully shadowed to at least 300 m`);
    for (let i = 1; i < d.length; i++) assert(d[i].x < d[i - 1].y && d[i].w > d[i - 1].w, `${name}: cascade ${i} must overlap cascade ${i - 1} and be coarser`);
    if (name === 'high') {
      assert(d[0].y >= 9 && d[0].y <= 13, `high: first cascade ends at ${d[0].y.toFixed(2)} m, expected 10-12 m`);
      assert(d[0].w <= 0.03, `high: first cascade texel ${(d[0].w * 100).toFixed(2)} cm, must be <= 3 cm`);
    }
    const cam = shadow.getCamera(0);
    assert(Math.abs(cam.right - cam.left - shadow.radii[0] * 2) < 1e-6 && shadow.getViewport(d.length - 1).y >= 1, `${name}: cascade cameras or atlas layout wrong`);
  }
});
