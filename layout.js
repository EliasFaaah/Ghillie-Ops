import { register, assert } from '../core/selftest.js';

export const MAP = Object.freeze({ size: 2048, half: 1024, cell: 2, samples: 1025, chunk: 64 });
export const HEIGHT = Object.freeze({ min: -20, range: 500 });
export const HORIZON = Object.freeze({ half: 8192, cell: 32, samples: 513 });

export const RIVER = Object.freeze([
  [-1500, -120, 16, 50], [-1024, -80, 16, 48], [-760, -20, 17, 45], [-520, 60, 18, 42], [-300, 50, 19, 40],
  [-120, 0, 20, 38], [60, -10, 20, 37], [230, 60, 19, 35], [430, 150, 19, 33], [640, 120, 18, 31],
  [860, 20, 17, 30], [1024, -30, 16, 29], [1500, -60, 16, 27]
]);

export const BRIDGE = Object.freeze({ x: -60, z: -6, length: 40, width: 7, deck: 3.2 });

export const BASES = Object.freeze({
  red: { x: -160, z: -760, yaw: 0, team: 'red' },
  blue: { x: 170, z: 880, yaw: Math.PI, team: 'blue' },
  A: { x: -610, z: -170, name: 'Farm' },
  B: { x: 470, z: -170, name: 'Radio tower' },
  C: { x: -10, z: 280, name: 'Village' },
  D: { x: 700, z: 510, name: 'Quarry' }
});

export const ROAD_LINKS = Object.freeze([
  [[BASES.red.x, BASES.red.z], [BRIDGE.x, BRIDGE.z - 30]],
  [[BRIDGE.x, BRIDGE.z + 24], [BASES.C.x, BASES.C.z], [BASES.blue.x, BASES.blue.z]],
  [[BRIDGE.x, BRIDGE.z - 30], [BASES.A.x, BASES.A.z]],
  [[BRIDGE.x, BRIDGE.z - 30], [BASES.B.x, BASES.B.z]],
  [[BASES.C.x, BASES.C.z], [BASES.D.x, BASES.D.z]],
  [[BASES.C.x - 90, BASES.C.z], [BASES.C.x + 90, BASES.C.z]]
]);

export const PADS = Object.freeze([
  { x: -160, z: -760, r0: 44, r1: 96 },
  { x: 170, z: 880, r0: 44, r1: 96 },
  { x: -610, z: -170, r0: 30, r1: 75 },
  { x: -10, z: 280, r0: 44, r1: 100 },
  { x: -60, z: -40, r0: 8, r1: 46, bridge: -1 },
  { x: -60, z: 28, r0: 8, r1: 46, bridge: 1 }
]);

export const QUARRY = Object.freeze({ x: 700, z: 510, rIn: 42, rOut: 100, depth: 24, step: 6 });
export const HILL = Object.freeze({ x: 470, z: -170, sigma: 110, lift: 16, padR0: 20, padR1: 70 });

const TRENCH = Object.freeze([[-430, -219], [-408, -219], [-386, -213], [-364, -213], [-342, -211], [-320, -205], [-298, -201], [-276, -201], [-254, -203], [-232, -205], [-210, -213], [-188, -227], [-166, -241], [-144, -249], [-122, -235], [-100, -221], [-78, -207], [-56, -193], [-34, -187], [-12, -197], [10, -193], [32, -197], [54, -211], [76, -225], [98, -233], [120, -223], [142, -213], [164, -209], [186, -195], [208, -197], [230, -193]]);
export const trenchLine = () => TRENCH.map(p => [p[0], p[1]]);

export const BUNKERS = Object.freeze([[-364, -213, 0], [-254, -203, 0], [-144, -249, 0], [10, -193, 0], [142, -213, 0]]);

export const BOOKMARKS = Object.freeze([
  { name: 'overview', from: [-700, 38, -560], to: [60, 0, 120] },
  { name: 'river_bridge', from: [-66, 3.8, -56], to: [-60, 5, 8] },
  { name: 'meadow_ground', from: [-330, 0.7, 70], to: [-250, 14, -60] },
  { name: 'farm', from: [-555, 2.6, -147], to: [-610, 4, -170] },
  { name: 'radio_tower', from: [516, 2.8, -150], to: [470, 22, -170] },
  { name: 'village', from: [16, 2.6, 215], to: [-10, 5, 280] },
  { name: 'quarry', from: [620, 34, 430], to: [700, 0, 510] },
  { name: 'red_base', from: [-120, 3.2, -690], to: [-160, 6, -760] }
]);

export const CATALOG = Object.freeze({
  OakTree: { kind: 'tree', size: [12.95, 11.89, 11.46], sink: 0.02 },
  SpruceTree: { kind: 'tree', size: [9.87, 19.37, 10.18], sink: 0.02 },
  BirchTree: { kind: 'tree', size: [6.68, 11.16, 6.2], sink: 0.02 },
  BushA: { kind: 'bush', size: [1.58, 1.67, 1.6] },
  Fern: { kind: 'bush', size: [1.1, 0.48, 0.99] },
  RockA: { kind: 'rock', size: [1.21, 1.03, 2.3], sink: 0.15 },
  RockMoss1: { kind: 'rock', size: [1.82, 1.21, 3], sink: 0.15 },
  RockMoss2: { kind: 'rock', size: [1.59, 1.05, 2.4], sink: 0.15 },
  RockMoss3: { kind: 'rock', size: [1.63, 0.77, 2], sink: 0.15 },
  RockMoss4: { kind: 'rock', size: [2.8, 1.23, 2.01], sink: 0.15 },
  RockMoss5: { kind: 'rock', size: [2.2, 0.96, 1.79], sink: 0.15 },
  RockFaceA: { kind: 'rock', size: [4.95, 3.57, 3.83], sink: 0.3 },
  RockFaceB: { kind: 'rock', size: [2.71, 2.48, 2.13], sink: 0.3 },
  FallenLog: { kind: 'prop', size: [3.4, 0.32, 0.31], sink: 0.1 },
  Stump: { kind: 'prop', size: [1.42, 0.57, 1.59], sink: 0.05 },
  Barrel: { kind: 'prop', size: [0.63, 0.93, 0.64] },
  OilBarrel: { kind: 'prop', size: [0.56, 0.88, 0.56] },
  MilitaryCrate: { kind: 'prop', size: [1.82, 0.3, 0.98] },
  ConcreteBarrier: { kind: 'prop', size: [1.56, 1.11, 0.44] },
  Tyre: { kind: 'prop', size: [0.6, 0.6, 0.16] },
  WoodenMilitaryCrate: { kind: 'prop', size: [1, 0.47, 0.6] },
  Jerrycan: { kind: 'prop', size: [0.35, 0.5, 0.17] },
  HouseA: { kind: 'struct', size: [10.2, 10.11, 8.82] },
  HouseB: { kind: 'struct', size: [8.56, 7.91, 11.7] },
  HouseC: { kind: 'struct', size: [17.4, 5.85, 7.62] },
  Chapel: { kind: 'struct', size: [7.65, 14.8, 15.4] },
  Farmhouse: { kind: 'struct', size: [12.6, 6.82, 8.44] },
  Barn: { kind: 'struct', size: [15.2, 7.2, 10.28] },
  FarmShed: { kind: 'struct', size: [5.7, 2.83, 4.47] },
  Well: { kind: 'struct', size: [3.03, 3.55, 1.85] },
  HayBale: { kind: 'prop', size: [1.4, 1.38, 1.2] },
  WoodFence: { kind: 'prop', size: [4.14, 1.3, 0.14] },
  Bunker: { kind: 'struct', size: [14.2, 3.65, 7.7] },
  SandbagWall: { kind: 'prop', size: [2.84, 0.94, 0.61] },
  SandbagNest: { kind: 'prop', size: [4.45, 0.94, 2.88] },
  CamoNet: { kind: 'struct', size: [8, 3.14, 6] },
  StoneWall: { kind: 'prop', size: [4.31, 1.13, 0.63] },
  WoodPile: { kind: 'prop', size: [2, 1.01, 1.1] },
  MilTruck: { kind: 'struct', size: [2.68, 2.53, 8.44] },
  CoveredCar: { kind: 'prop', size: [1.79, 1.29, 4.38] },
  ChainlinkFence: { kind: 'prop', size: [1.91, 2.37, 0.05] },
  BaseHQ: { kind: 'struct', size: [17.1, 8, 12.25] },
  WatchTower: { kind: 'struct', size: [4.7, 10.76, 4.62] },
  MilitaryTent: { kind: 'struct', size: [9.24, 2.97, 7.63] },
  Hesco: { kind: 'prop', size: [2.09, 1.45, 1.09] },
  FlagPole: { kind: 'struct', size: [3, 9.6, 0.68] },
  RadioTower: { kind: 'struct', size: [7, 48.38, 7] },
  RadioHut: { kind: 'struct', size: [7.8, 9.05, 6.47] },
  QuarryCrusher: { kind: 'struct', size: [22.6, 11.2, 9.1] },
  QuarryOffice: { kind: 'struct', size: [9.3, 3.32, 4.65] },
  ShippingContainer: { kind: 'struct', size: [12.24, 2.61, 2.46] },
  FuelTank: { kind: 'struct', size: [6.98, 8.3, 6.4] },
  GravelPile: { kind: 'struct', size: [11.44, 3, 11.37] },
  StoneBridge: { kind: 'struct', size: [7.65, 7.93, 40.6] }
});

export function bookmarkPose(b, heightAt) {
  const eye = [b.from[0], heightAt(b.from[0], b.from[2]) + b.from[1], b.from[2]];
  const target = [b.to[0], heightAt(b.to[0], b.to[2]) + b.to[1], b.to[2]];
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  return { eye, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

register('world/layout', 'map features lie inside the map and bases are distinct', () => {
  const inside = (x, z, m = 0) => Math.abs(x) <= MAP.half - m && Math.abs(z) <= MAP.half - m;
  const names = Object.keys(BASES);
  for (const n of names) assert(inside(BASES[n].x, BASES[n].z, 100), `base ${n} too close to the border`);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = BASES[names[i]], b = BASES[names[j]];
    assert(Math.hypot(a.x - b.x, a.z - b.z) > 250, `bases ${names[i]} and ${names[j]} are closer than 250 m`);
  }
  assert(BASES.red.team === 'red' && BASES.blue.team === 'blue' && Math.hypot(BASES.red.x - BASES.blue.x, BASES.red.z - BASES.blue.z) > 1500, 'team bases must sit at opposite ends');
  assert(BOOKMARKS.length === 8, `expected 8 bookmarks, got ${BOOKMARKS.length}`);
  for (const b of BOOKMARKS) assert(inside(b.from[0], b.from[2]) && inside(b.to[0], b.to[2]), `bookmark ${b.name} outside the map`);
  for (const link of ROAD_LINKS) for (const [x, z] of link) assert(inside(x, z), `road point ${x},${z} outside the map`);
});
