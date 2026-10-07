import { HalfFloatType, FloatType, SRGBColorSpace } from 'three';
import { EffectComposer, RenderPass, EffectPass, Effect, BlendFunction, SMAAEffect, SMAAPreset, EdgeDetectionMode, BloomEffect, ToneMappingEffect, ToneMappingMode, HueSaturationEffect, BrightnessContrastEffect, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { PRESETS } from './renderer.js';
import { register, assert, report } from '../core/selftest.js';

const BLOOM_INPUT_CAP = 8;
const REVERSED_DEFINE = '#define REVERSEDEPTH\n';
const BLOOM_PATCH = ['gl_FragColor=texel*mask;', `gl_FragColor=texel*mask*min(1.0,${BLOOM_INPUT_CAP.toFixed(1)}/max(l,1e-4));`];
const LOOK_SHADER = `void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 lookColor = clamp(inputColor.rgb, 0.0, 1.0);
  float lookLum = dot(lookColor, vec3(0.2126, 0.7152, 0.0722));
  float lookGreen = clamp((lookColor.g - lookColor.b) * 2.5, 0.0, 1.0) * clamp((lookColor.g - lookColor.r) * 6.0 + 0.6, 0.0, 1.0);
  lookColor = mix(vec3(lookLum), lookColor, 1.0 - 0.2 * lookGreen);
  lookColor *= vec3(1.0 - 0.05 * lookGreen, 1.0, 1.0 + 0.06 * lookGreen);
  lookColor = mix(lookColor, lookColor * lookColor * (3.0 - 2.0 * lookColor), 0.28);
  float lookTone = dot(lookColor, vec3(0.2126, 0.7152, 0.0722));
  lookColor *= mix(vec3(0.96, 0.985, 1.05), vec3(1.0), smoothstep(0.0, 0.35, lookTone));
  lookColor *= mix(vec3(1.0), vec3(1.025, 1.0, 0.965), smoothstep(0.55, 1.0, lookTone));
  outputColor = vec4(clamp(lookColor, 0.0, 1.0), inputColor.a);
}`;

function createLook() {
  const look = new Effect('LookEffect', LOOK_SHADER, { blendFunction: BlendFunction.SRC });
  look.inputColorSpace = SRGBColorSpace;
  return look;
}

export function createPost(render, scene, camera) {
  const { renderer } = render;
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0, stencilBuffer: false, depthBuffer: true });
  const scenePass = new RenderPass(scene, camera);
  const ao = new N8AOPostPass(scene, camera, render.width, render.height);
  Object.assign(ao.configuration, { aoRadius: 2.2, distanceFalloff: 0.6, intensity: 1.9, depthAwareUpsampling: true, gammaCorrection: false });
  ao.copyQuad.material.depthTest = false;
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0, luminanceSmoothing: 0.01, intensity: 0.04, radius: 0.75 });
  const lum = bloom.luminanceMaterial;
  if (lum.fragmentShader.includes(BLOOM_PATCH[0])) {
    lum.fragmentShader = lum.fragmentShader.replace(BLOOM_PATCH[0], BLOOM_PATCH[1]);
    lum.needsUpdate = true;
  } else report('render/post', new Error('postprocessing changed the luminance shader, the bloom input cap is not applied'));
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR });
  const grade = new HueSaturationEffect({ saturation: 0.04 });
  const finish = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.05 });
  const look = createLook();
  const vignette = new VignetteEffect({ offset: 0.5, darkness: 0.28 });
  const hdrPass = new EffectPass(camera, bloom, tone, grade, finish, look, vignette);
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
    effects: { bloom, tone, smaa, grade, finish, look, vignette },
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
  const fx = passes.hdr.effects;
  assert(fx.indexOf(effects.tone) < fx.indexOf(effects.look) && fx.indexOf(effects.finish) < fx.indexOf(effects.look) && effects.look.inputColorSpace === SRGBColorSpace, 'the look grade must run after tone mapping on display encoded colour');
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
