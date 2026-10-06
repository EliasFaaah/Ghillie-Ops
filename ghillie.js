import { register, assert } from '../core/selftest.js';

const TEX = '/assets/textures/ghillie/strands_';

export const VARIANTS = Object.freeze([
  Object.freeze({ id: 'woodland', label: 'Woodland', sleeve: [0.30, 0.34, 0.20], glove: [0.07, 0.07, 0.075], strands: `${TEX}woodland.ktx2` }),
  Object.freeze({ id: 'desert', label: 'Desert', sleeve: [0.75, 0.62, 0.40], glove: [0.40, 0.33, 0.22], strands: `${TEX}desert.ktx2` }),
  Object.freeze({ id: 'snow', label: 'Snow', sleeve: [0.90, 0.93, 1.0], glove: [0.62, 0.65, 0.70], strands: `${TEX}snow.ktx2` }),
  Object.freeze({ id: 'autumn', label: 'Autumn', sleeve: [0.52, 0.34, 0.15], glove: [0.10, 0.085, 0.065], strands: `${TEX}autumn.ktx2` }),
  Object.freeze({ id: 'swamp', label: 'Swamp', sleeve: [0.18, 0.22, 0.13], glove: [0.05, 0.06, 0.05], strands: `${TEX}swamp.ktx2` }),
  Object.freeze({ id: 'urban', label: 'Urban', sleeve: [0.26, 0.27, 0.29], glove: [0.08, 0.08, 0.09], strands: `${TEX}urban.ktx2` })
]);

export const variantById = id => VARIANTS.find(v => v.id === id) || VARIANTS[0];

export function applyVariant(materials, tex, id) {
  const v = variantById(id);
  if (materials.M_sleeve) materials.M_sleeve.color.setRGB(...v.sleeve);
  if (materials.M_strap) materials.M_strap.color.setRGB(...v.sleeve).multiplyScalar(0.6);
  for (const k of ['M_glove_fabric', 'M_glove_leather']) if (materials[k]) materials[k].color.setRGB(...v.glove);
  if (materials.M_glove_hard) materials.M_glove_hard.color.setRGB(...v.glove).multiplyScalar(5);
  if (materials.M_strands && tex && materials.M_strands.map !== tex) {
    materials.M_strands.map = tex;
    materials.M_strands.needsUpdate = true;
  }
  return v;
}

register('player/ghillie', 'six variants with unique ids and textures', () => {
  assert(VARIANTS.length === 6 && VARIANTS[0].id === 'woodland', 'woodland must be the default of six variants');
  assert(new Set(VARIANTS.map(v => v.id)).size === 6 && new Set(VARIANTS.map(v => v.strands)).size === 6, 'variant ids and strand textures must be unique');
  for (const id of ['woodland', 'desert', 'snow', 'autumn', 'swamp', 'urban']) assert(variantById(id).id === id, `variant ${id} missing`);
  assert(variantById('nope').id === 'woodland', 'unknown variants must fall back to woodland');
});
