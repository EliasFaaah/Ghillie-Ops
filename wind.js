import { Vector2 } from 'three';
import { register, assert } from '../core/selftest.js';

export const windUniforms = {
  uWindTime: { value: 0 },
  uWindDir: { value: new Vector2(0.85, 0.53).normalize() },
  uWindAmp: { value: 1 }
};

export const windGlsl = `
uniform float uWindTime;
uniform vec2 uWindDir;
uniform float uWindAmp;
vec2 windGust(vec3 wp) {
  float along = dot(wp.xz, uWindDir);
  float g1 = sin(along * 0.021 - uWindTime * 0.9);
  float g2 = sin(along * 0.057 - uWindTime * 1.7 + wp.x * 0.013);
  float gust = 0.55 + 0.3 * g1 + 0.15 * g2;
  gust = gust * gust * 1.3;
  float side = sin(uWindTime * 1.3 + wp.x * 0.11 + wp.z * 0.07) * 0.25;
  return (uWindDir * gust + vec2(-uWindDir.y, uWindDir.x) * side) * uWindAmp;
}
`;

export function updateWind(simTime) {
  windUniforms.uWindTime.value = simTime;
}

register('veg/wind', 'wind uniforms advance with simulation time', () => {
  const before = windUniforms.uWindTime.value;
  updateWind(12.5);
  assert(windUniforms.uWindTime.value === 12.5 && Math.abs(windUniforms.uWindDir.value.length() - 1) < 1e-6, 'wind time or direction wrong');
  updateWind(before);
});
