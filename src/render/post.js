import { HalfFloatType, FloatType } from 'three';
import { EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, EdgeDetectionMode, BloomEffect, ToneMappingEffect, ToneMappingMode, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { PRESETS } from './renderer.js';
import { register, assert, report } from '../core/selftest.js';

const BLOOM_INPUT_CAP = 8;
const REVERSED_DEFINE = '#define REVERSEDEPTH\n';
const BLOOM_PATCH = ['gl_FragColor=texel*mask;', `gl_FragColor=texel*mask*min(1.0,${BLOOM_INPUT_CAP.toFixed(1)}/max(l,1e-4));`];

export function createPost(render, scene, camera) {
  const { renderer } = render;
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0, stencilBuffer: false, depthBuffer: true });
  const scenePass = new RenderPass(scene, camera);
  const ao = new N8AOPostPass(scene, camera, render.width, render.height);
  Object.assign(ao.configuration, { aoRadius: 1.6, distanceFalloff: 0.6, intensity: 1.7, depthAwareUpsampling: true, gammaCorrection: false });
  ao.copyQuad.material.depthTest = false;
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0, luminanceSmoothing: 0.01, intensity: 0.04, radius: 0.75 });
  const lum = bloom.luminanceMaterial;
  if (lum.fragmentShader.includes(BLOOM_PATCH[0])) {
    lum.fragmentShader = lum.fragmentShader.replace(BLOOM_PATCH[0], BLOOM_PATCH[1]);
    lum.needsUpdate = true;
  } else report('render/post', new Error('postprocessing changed the luminance shader, the bloom input cap is not applied'));
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR });
  const grade = new HueSaturationEffect({ saturation: 0.12 });
  const finish = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.07 });
  const vignette = new VignetteEffect({ offset: 0.5, darkness: 0.28 });
  const hdrPass = new EffectPass(camera, bloom, tone, grade, finish, vignette);
  const aaPass = new EffectPass(camera, smaa);
  aaPass.dithering = true;
  for (const pass of [scenePass, ao, hdrPass, aaPass]) composer.addPass(pass);
  render.onResize((w, h) => composer.setSize(w, h));
  render.onPreset(p => {
    ao.setQualityMode(p.aoQuality);
    ao.configuration.halfRes = p.aoHalfRes;
    const q = ao.depthDownsampleQuad;
    if (q && renderer.capabilities.reversedDepthBuffer && !q.material.fragmentShader.startsWith(REVERSED_DEFINE)) {
      q.material.fragmentShader = REVERSED_DEFINE + q.material.fragmentShader;
      q.material.needsUpdate = true;
    }
  });
  return {
    composer,
    passes: { scene: scenePass, ao, hdr: hdrPass, aa: aaPass },
    effects: { bloom, tone, smaa, grade, finish, vignette },
    render(dt) { composer.render(dt); }
  };
}

register('render/post', 'post chain order, HDR buffers, float depth, bloom cap, dithering', ctx => {
  const { composer, passes, effects } = ctx.post;
  const order = composer.passes;
  assert(order[0] === passes.scene && order.indexOf(passes.ao) < order.indexOf(passes.hdr) && order[order.length - 1] === passes.aa, 'pass order must be scene, ao, hdr (bloom + tone mapping), aa last');
  assert(composer.inputBuffer.texture.type === HalfFloatType, 'composer buffers must be half float for HDR');
  assert(composer.inputBuffer.depthTexture && composer.inputBuffer.depthTexture.type === FloatType, 'the scene depth buffer must be float for reversed depth');
  assert(passes.ao.configuration.gammaCorrection === false, 'AO must not gamma correct before tone mapping');
  assert(passes.ao.copyQuad.material.depthTest === false, 'the AO output copy must not depth test, a reversed depth buffer would reject it');
  assert(passes.aa.renderToScreen && passes.aa.dithering === true, 'the last pass must render to screen with dithering');
  assert(effects.bloom.luminanceMaterial.fragmentShader.includes(BLOOM_PATCH[1]), 'bloom input must be capped before the first downsample');
});

register('render/post', 'AO quality follows the render preset', ctx => {
  const { ao } = ctx.post.passes;
  const before = ctx.render.presetName;
  const samples = ao.configuration.denoiseSamples;
  const halfResReversed = () => !ao.configuration.halfRes || ao.depthDownsampleQuad.material.fragmentShader.startsWith(REVERSED_DEFINE);
  try {
    for (const name of ['ultra', 'medium', 'high']) {
      ctx.render.setPreset(name);
      assert(ao.configuration.halfRes === PRESETS[name].aoHalfRes, `AO resolution did not follow preset ${name}`);
      assert(halfResReversed(), `half resolution AO depth downsampling must decode reversed depth (preset ${name})`);
    }
    ctx.render.setPreset(before === 'medium' ? 'ultra' : 'medium');
    assert(ao.configuration.denoiseSamples !== samples, 'AO quality did not change with the preset');
  } finally {
    ctx.render.setPreset(before);
  }
  assert(ao.configuration.denoiseSamples === samples && halfResReversed(), 'AO settings were not restored with the preset');
});

register('render/post', 'the chain writes a visible, opaque frame to the canvas', ctx => {
  const gl = ctx.gl;
  ctx.post.render(0);
  ctx.render.renderer.setRenderTarget(null);
  const px = new Uint8Array(4);
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  for (const [fx, fy] of [[0.5, 0.25], [0.5, 0.75], [0.1, 0.5], [0.9, 0.5]]) {
    gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    assert(px[3] === 255 && Math.max(px[0], px[1], px[2]) > 8, `canvas pixel at ${fx},${fy} is ${[...px]}, the frame did not reach the screen`);
  }
});
