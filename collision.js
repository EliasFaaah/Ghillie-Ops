import { BufferGeometry, BufferAttribute, Matrix4, Quaternion, Vector3, Ray, Box3, Line3, DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { surfaceOf } from '../veg/models.js';
import { register, assert } from '../core/selftest.js';

const SURFACE_IDS = ['dirt', 'rock', 'wood', 'metal', 'water', 'flesh'];
const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _up = new Vector3(0, 1, 0), _v = new Vector3();

export function buildWorldGeometry(models, placements) {
  let nv = 0, ni = 0;
  const jobs = [];
  for (const [name, list] of Object.entries(placements)) {
    const model = models.get(name);
    if (!model || !model.collider) continue;
    const count = list.length / 5;
    nv += model.collider.positions.length / 3 * count;
    ni += model.collider.index.length * count;
    jobs.push([name, list, model.collider, SURFACE_IDS.indexOf(surfaceOf(name))]);
  }
  const positions = new Float32Array(nv * 3), index = new Uint32Array(ni);
  const surfaces = new Uint8Array(ni / 3);
  let vo = 0, io = 0, to = 0;
  for (const [, list, col, sid] of jobs) {
    const cv = col.positions.length / 3;
    for (let k = 0; k < list.length; k += 5) {
      _p.set(list[k], list[k + 1], list[k + 2]);
      _q.setFromAxisAngle(_up, list[k + 3]);
      _s.setScalar(list[k + 4]);
      _m.compose(_p, _q, _s);
      for (let i = 0; i < cv; i++) {
        _v.set(col.positions[i * 3], col.positions[i * 3 + 1], col.positions[i * 3 + 2]).applyMatrix4(_m);
        positions[(vo + i) * 3] = _v.x; positions[(vo + i) * 3 + 1] = _v.y; positions[(vo + i) * 3 + 2] = _v.z;
      }
      for (let i = 0; i < col.index.length; i++) index[io++] = col.index[i] + vo;
      surfaces.fill(sid, to, to + col.index.length / 3);
      to += col.index.length / 3;
      vo += cv;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setIndex(new BufferAttribute(index, 1));
  return { geometry: g, surfaces };
}

export function createCollision(terrain, water, models, placements) {
  const { geometry, surfaces } = buildWorldGeometry(models, placements);
  const bvh = new MeshBVH(geometry, { targetLeafSize: 8, indirect: true });
  const ray = new Ray();
  const segment = new Line3();
  const box = new Box3();
  const _hit = new Vector3();

  function raycast(origin, dir, far = 1000) {
    ray.origin.copy(origin);
    ray.direction.copy(dir);
    let best = null;
    const t = terrain.raycast(origin, dir, far);
    if (t) best = { point: t.point, normal: t.normal, distance: t.distance, surface: t.surface, kind: 'terrain' };
    const h = bvh.raycastFirst(ray, DoubleSide, 0, best ? best.distance : far);
    if (h) {
      const n = h.face.normal.clone();
      if (n.dot(dir) > 0) n.negate();
      best = { point: h.point, normal: n, distance: h.distance, surface: SURFACE_IDS[surfaces[h.faceIndex]], kind: 'object' };
    }
    if (best && water && water.depthAt(best.point.x, best.point.z) > 0.05 && best.kind === 'terrain' && dir.y < 0) {
      const level = water.levelAt(best.point.x, best.point.z);
      const t2 = (level - origin.y) / dir.y;
      if (t2 > 0 && t2 < best.distance) {
        best.point = origin.clone().addScaledVector(dir, t2);
        best.distance = t2;
        best.normal = new Vector3(0, 1, 0);
        best.surface = 'water';
      }
    }
    return best;
  }

  function groundAt(x, fromY, z, reach = 4) {
    _hit.set(x, fromY, z);
    const r = raycast(_hit, new Vector3(0, -1, 0), reach);
    return r ? r.point.y : terrain.heightAt(x, z);
  }

  function capsuleCollide(capsule, out = new Vector3()) {
    segment.start.copy(capsule.start);
    segment.end.copy(capsule.end);
    const r = capsule.radius;
    const sx = segment.start.x, sy = segment.start.y, sz = segment.start.z;
    box.makeEmpty();
    box.expandByPoint(segment.start);
    box.expandByPoint(segment.end);
    box.min.addScalar(-r);
    box.max.addScalar(r);
    const tp = new Vector3(), cp = new Vector3(), dir = new Vector3();
    bvh.shapecast({
      intersectsBounds: b => b.intersectsBox(box),
      intersectsTriangle: tri => {
        const d = tri.closestPointToSegment(segment, tp, cp);
        if (d < r) {
          const depth = r - d;
          dir.subVectors(cp, tp).normalize();
          segment.start.addScaledVector(dir, depth);
          segment.end.addScaledVector(dir, depth);
        }
        return false;
      }
    });
    out.set(segment.start.x - sx, segment.start.y - sy, segment.start.z - sz);
    const ground = terrain.heightAt(capsule.start.x + out.x, capsule.start.z + out.z);
    const low = capsule.start.y + out.y - r;
    if (low < ground) out.y += ground - low;
    return out;
  }

  return { bvh, geometry, surfaces, raycast, groundAt, capsuleCollide, triangles: surfaces.length };
}

register('world/collision', 'object BVH answers rays and capsules, terrain and water are merged in', ctx => {
  const c = ctx.world.collision;
  assert(c.triangles > 100000, `collision mesh has only ${c.triangles} triangles`);
  const bunker = ctx.world.data.models.Bunker;
  assert(bunker && bunker.length >= 5, 'bunkers missing from the placements');
  const [bx, by, bz] = bunker;
  const down = c.raycast(new Vector3(bx, by + 30, bz), new Vector3(0, -1, 0), 80);
  assert(down && down.kind === 'object' && down.surface === 'rock' && Math.abs(down.point.y - (by + 3.1)) < 0.3, `a ray onto the bunker roof must hit its collider at +3.1 m, got ${down && down.point.y - by}`);
  const grazing = c.raycast(new Vector3(bx - 8, by + 1.2, bz + 1.0), new Vector3(1, 0, 0), 80);
  assert(grazing && grazing.kind === 'object' && grazing.distance > 1 && grazing.distance < 6, `a horizontal ray must hit the bunker side wall, got ${grazing && grazing.kind} ${grazing && grazing.distance}`);
  const terrainHit = c.raycast(new Vector3(300, 400, 300), new Vector3(0, -1, 0), 1000);
  assert(terrainHit && terrainHit.kind === 'terrain' && Math.abs(terrainHit.point.y - ctx.world.terrain.heightAt(300, 300)) < 0.01, 'rays that miss all objects must hit the terrain');
  const pushed = c.capsuleCollide({ start: new Vector3(bx - 3.5, by + 0.5, bz - 1.2), end: new Vector3(bx - 3.5, by + 1.5, bz - 1.2), radius: 0.45 });
  assert(pushed.lengthSq() > 1e-4, 'a capsule overlapping the bunker must be pushed out');
  const free = c.capsuleCollide({ start: new Vector3(300, ctx.world.terrain.heightAt(300, 300) + 0.5, 300), end: new Vector3(300, ctx.world.terrain.heightAt(300, 300) + 1.5, 300), radius: 0.45 });
  assert(free.length() < 1e-3, `a capsule in open terrain must not move, got ${free.toArray()}`);
  const river = ctx.world.data.river.find(p => Math.abs(p[0] + 120) < 1) || ctx.world.data.river[5];
  const wet = c.raycast(new Vector3(river[0], river[3] + 20, river[1]), new Vector3(0, -1, 0), 100);
  assert(wet && wet.surface === 'water' && Math.abs(wet.point.y - ctx.world.water.levelAt(wet.point.x, wet.point.z)) < 0.01, 'a ray into the river must report water at the water level');
});
