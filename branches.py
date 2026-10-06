import os, sys, json, shutil
import numpy as np
import scipy.sparse as sp
from scipy.sparse.csgraph import connected_components
import meshoptimizer as mo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gltf_read import G

GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(GAME, 'assets', 'trees')
DISTANCES = [3, 6, 12, 24, 48, 96, 192, 384, 768, 1536]
PX_ERROR = [0.6, 0.8, 1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 3.5, 4.0]
FOCAL = 805.0
FRAC_BRANCH = [0.3, 0.1, 0.04, 0.018, 0.008, 0.004, 0.0022, 0.0012, 0.0006, 0.0003]
FRAC_TRUNK = [0.6, 0.35, 0.2, 0.12, 0.07, 0.04, 0.025, 0.016, 0.01, 0.006]


def texture_of(g, mat, key):
    pbr = mat.get('pbrMetallicRoughness', {})
    if key == 'diff':
        t = pbr.get('baseColorTexture')
    elif key == 'arm':
        t = pbr.get('metallicRoughnessTexture')
    else:
        t = mat.get('normalTexture')
    if t is None:
        return None, None
    tex = g.j['textures'][t['index']]
    uri = g.j['images'][tex['source']]['uri']
    xf = (t.get('extensions') or {}).get('KHR_texture_transform')
    return os.path.join(g.d, uri), xf


def strip_plates(pos, idx, floor_y, scale):
    tri = idx.reshape(-1, 3)
    n = len(pos)
    e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]]])
    a = sp.coo_matrix((np.ones(len(e), dtype=np.int8), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    nc, lab = connected_components(a, directed=False)
    lo = np.full((nc, 3), 1e9); hi = np.full((nc, 3), -1e9)
    np.minimum.at(lo, lab, pos); np.maximum.at(hi, lab, pos)
    ext = hi - lo
    flat = (ext[:, 1] < 0.2 * np.maximum(ext[:, 0], ext[:, 2])) & (hi[:, 1] < floor_y + 0.3 * scale) & (np.maximum(ext[:, 0], ext[:, 2]) > 0.25 * scale)
    keep = ~flat[lab[tri[:, 0]]]
    return tri[keep].ravel().astype(np.uint32), int(flat.sum())


def weld(pos, idx):
    q = np.round(pos.astype(np.float64) * 1e4).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    return pos[first].astype(np.float32), inv[idx].astype(np.uint32), first


def simplify_part(pos, idx, budget, error0, error_max):
    err = np.zeros(1, dtype=np.float32)
    target = max(int(budget), 60) * 3
    best = idx
    e = error0
    while True:
        dst = np.zeros(len(idx), dtype=np.uint32)
        n = mo.simplify(dst, idx, pos, target_index_count=target, target_error=float(e), options=mo.SIMPLIFY_ERROR_ABSOLUTE | mo.SIMPLIFY_PRUNE, result_error=err)
        if n == 0:
            break
        best = dst[:n]
        if n <= target * 1.5 or e >= error_max:
            break
        e *= 1.6
    return best


def build_branches(spec, boxc, boxh):
    name = spec['name']
    g = G(spec['dir'])
    prims = g.prims()
    off = np.array(spec.get('offset', [0, 0, 0]), dtype=np.float32)
    scale = spec['scale']
    parts = []
    trunk_pts = []
    for pi in spec['branch']:
        mi, p, matname = prims[pi]
        mat = g.j['materials'][p['material']]
        pos = (g.acc(p['attributes']['POSITION']).astype(np.float32) - off) * scale
        nrm = g.acc(p['attributes']['NORMAL']).astype(np.float32)
        uv = g.acc(p['attributes']['TEXCOORD_%d' % spec.get('uvset', 0)]).astype(np.float32) if 'TEXCOORD_%d' % spec.get('uvset', 0) in p['attributes'] else np.zeros((len(pos), 2), np.float32)
        idx = g.acc(p['indices']).ravel().astype(np.uint32)
        if pi in spec.get('trunkPrims', []):
            idx, removed = strip_plates(pos, idx, float(pos[:, 1].min()), scale)
            print('plates removed', removed, flush=True)
        files = {}
        xform = None
        for key in ('diff', 'nor', 'arm'):
            path, xf = texture_of(g, mat, key)
            if path is None:
                continue
            dst = f'{name}_{pi}_{key}.jpg'
            shutil.copyfile(path, os.path.join(OUT, dst))
            files[key] = f'/assets/trees/{dst}'
            if key == 'diff' and xf:
                xform = xf
        if xform:
            sc = np.array(xform.get('scale', [1, 1]), dtype=np.float32)
            of = np.array(xform.get('offset', [0, 0]), dtype=np.float32)
            uv = uv * sc + of
        parts.append({'pos': pos, 'nrm': nrm, 'uv': uv, 'idx': idx, 'files': files, 'name': matname, 'trunk': pi in spec.get('trunkPrims', [])})
        if parts[-1]['trunk']:
            trunk_pts.append(pos)
    blobs = []
    cursor = 0

    def put(arr):
        nonlocal cursor
        raw = np.ascontiguousarray(arr).tobytes()
        pad = (-len(raw)) % 4
        blobs.append(raw + b'\0' * pad)
        o = cursor
        cursor += len(raw) + pad
        return o

    meta_parts = []
    for part in parts:
        lod_info = []
        prev_count = -1
        fracs = FRAC_TRUNK if part['trunk'] else FRAC_BRANCH
        full = len(part['idx']) // 3
        for li, D in enumerate([0] + DISTANCES):
            if D == 0:
                idx = part['idx']
            else:
                frac = fracs[li - 1]
                e0 = PX_ERROR[li - 1] * D / FOCAL
                if 'weld' not in part:
                    part['weld'] = weld(part['pos'], part['idx'])
                wpos, widx, first = part['weld']
                idx = first[simplify_part(wpos, widx, full * frac, e0, e0 * 6)].astype(np.uint32)
            if len(idx) == 0:
                break
            if prev_count >= 0 and len(idx) >= prev_count * 0.9 and D > 0:
                continue
            prev_count = len(idx)
            used, inv = np.unique(idx, return_inverse=True)
            pos = part['pos'][used]
            nrm = part['nrm'][used]
            uv = part['uv'][used]
            p16 = np.clip(np.round((pos - boxc) / boxh * 32767), -32767, 32767).astype(np.int16)
            p4 = np.zeros((len(pos), 4), dtype=np.int16); p4[:, :3] = p16
            n4 = np.zeros((len(pos), 4), dtype=np.int8); n4[:, :3] = np.clip(np.round(nrm * 127), -127, 127).astype(np.int8)
            lod_info.append({'dist': D, 'verts': int(len(pos)), 'idx': int(len(inv)), 'pos': put(p4), 'nrm': put(n4), 'uv': put(uv.astype(np.float32)), 'index': put(inv.astype(np.uint32))})
        meta_parts.append({'name': part['name'], 'files': part['files'], 'trunk': bool(part['trunk']), 'lods': lod_info})
    with open(os.path.join(OUT, name + '.b.bin'), 'wb') as f:
        for b in blobs:
            f.write(b)
    tp = np.concatenate(trunk_pts) if trunk_pts else np.concatenate([p['pos'] for p in parts])
    sel = tp[(tp[:, 1] > 0.8) & (tp[:, 1] < 1.6)]
    if len(sel) < 20:
        sel = tp[tp[:, 1] < 2.0]
    c = np.array([np.median(sel[:, 0]), np.median(sel[:, 2])])
    r = float(np.percentile(np.hypot(sel[:, 0] - c[0], sel[:, 2] - c[1]), 85))
    return {'parts': meta_parts, 'collider': {'x': float(c[0]), 'z': float(c[1]), 'r': r, 'h': 3.0}}


def run(spec):
    name = spec['name']
    meta = json.load(open(os.path.join(OUT, name + '.json')))
    b = build_branches(spec, np.array(meta['boxC']), np.array(meta['boxH']))
    meta['branches'] = b
    json.dump(meta, open(os.path.join(OUT, name + '.json'), 'w'))
    return b


if __name__ == '__main__':
    r = run(json.loads(sys.argv[1]))
    print(json.dumps({'collider': r['collider'], 'parts': [{'name': p['name'], 'lods': [(l['dist'], l['idx'] // 3) for l in p['lods']]} for p in r['parts']]}))
