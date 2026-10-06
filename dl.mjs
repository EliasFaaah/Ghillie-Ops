import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUT = process.env.GHILLIE_WORK || 'C:/Users/Leschke/Downloads/GhillieWork';
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
const save = async (url, file) => { if (existsSync(file)) return; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, await get(url)); };

const textures = [
  ['leafy_grass', '2k'], ['forrest_ground_01', '2k'], ['rock_face_03', '2k'], ['brown_mud_dry', '1k'], ['river_small_rocks', '1k'],
  ['bark_brown_02', '1k'], ['pine_bark', '1k'], ['bark_platanus', '1k'],
  ['beige_wall_001', '1k'], ['white_plaster_02', '1k'], ['plastered_stone_wall', '1k'], ['broken_brick_wall', '1k'], ['brick_wall_005', '1k'],
  ['clay_roof_tiles_02', '1k'], ['roof_tiles_14', '1k'], ['weathered_planks', '1k'], ['wood_planks_grey', '1k'], ['old_planks_02', '1k'],
  ['concrete_wall_004', '1k'], ['precast_concrete_wall', '1k'], ['corrugated_iron_02', '1k'], ['rusty_metal_02', '1k'], ['green_metal_rust', '1k'],
  ['hessian_230', '1k'], ['hessian_380', '1k'], ['old_stone_wall', '1k'], ['stone_wall_02', '1k'], ['reed_roof_03', '1k'], ['metal_plate', '1k'], ['rough_concrete', '1k'], ['dirt_floor', '1k']
];
const models = ['rock_07', 'rock_09', 'rock_moss_set_01', 'rock_moss_set_02', 'boulder_01', 'rock_face_01', 'rock_face_02', 'stone_01', 'shrub_02', 'shrub_03', 'shrub_04', 'fern_02', 'dead_tree_trunk', 'tree_stump_01', 'dry_branches_medium_01', 'barrel_03', 'Barrel_01', 'wooden_barrels_01', 'wooden_crate_01', 'old_military_crate', 'concrete_road_barrier_02', 'old_tyre', 'utility_box_01', 'ammo_box'];

const only = process.argv[2];
for (const [id, res] of textures) {
  if (only && only !== 'tex') break;
  const j = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [slot, name] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']]) {
    if (!j[slot]) { console.log('missing', id, slot); continue; }
    const f = j[slot][res].jpg;
    await save(f.url, join(OUT, 'tex', id, `${name}.jpg`));
  }
  console.log('tex', id);
}
for (const id of models) {
  if (only && only !== 'mod') break;
  const j = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = j.gltf['1k'].gltf;
  await save(g.url, join(OUT, 'mod', id, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include)) await save(f.url, join(OUT, 'mod', id, rel));
  console.log('model', id);
}
