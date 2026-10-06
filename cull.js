const _m = new Float64Array(16);

export function extractPlanes(camera, out) {
  const p = camera.projectionMatrix.elements, v = camera.matrixWorldInverse.elements;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += p[k * 4 + r] * v[c * 4 + k];
    _m[c * 4 + r] = s;
  }
  const set = (o, a, sg) => { for (let i = 0; i < 4; i++) out[o + i] = _m[i * 4 + 3] + sg * _m[i * 4 + a]; };
  set(0, 0, 1);
  set(4, 0, -1);
  set(8, 1, 1);
  set(12, 1, -1);
  return out;
}

export function boxInside(planes, x0, y0, z0, x1, y1, z1) {
  for (let p = 0; p < 16; p += 4) {
    const a = planes[p], b = planes[p + 1], c = planes[p + 2];
    if (a * (a >= 0 ? x1 : x0) + b * (b >= 0 ? y1 : y0) + c * (c >= 0 ? z1 : z0) + planes[p + 3] < 0) return false;
  }
  return true;
}
