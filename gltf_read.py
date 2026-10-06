import json, struct, numpy as np, os
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
class G:
    def __init__(self, d):
        f = [x for x in os.listdir(d) if x.endswith('.gltf')][0]
        self.d = d
        self.j = json.load(open(os.path.join(d, f)))
        self.bufs = [np.fromfile(os.path.join(d, b['uri']), dtype=np.uint8) for b in self.j['buffers']]
    def acc(self, i):
        a = self.j['accessors'][i]
        bv = self.j['bufferViews'][a['bufferView']]
        n = NC[a['type']]
        dt = np.dtype(CT[a['componentType']])
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', n * dt.itemsize)
        raw = self.bufs[bv['buffer']]
        if stride == n * dt.itemsize:
            arr = raw[off:off + a['count'] * stride].view(dt).reshape(a['count'], n)
        else:
            arr = np.lib.stride_tricks.as_strided(raw[off:], shape=(a['count'], n * dt.itemsize), strides=(stride, 1)).copy().view(dt).reshape(a['count'], n)
        return arr
    def prims(self):
        out = []
        for mi, m in enumerate(self.j['meshes']):
            for p in m['primitives']:
                out.append((mi, p, self.j['materials'][p['material']]['name']))
        return out
