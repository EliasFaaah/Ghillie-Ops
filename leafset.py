import os, sys, json, math
import numpy as np
import scipy.sparse as sp
from scipy.sparse.csgraph import connected_components
from scipy import ndimage
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gltf_read import G

GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(GAME, 'assets', 'trees')
FRACTIONS = [0.58 ** k for k in range(14)]


def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255.0


def dilate_atlas(src, dst, thresh=14, margin=10):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    mask = im.max(axis=2) > thresh
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_erosion(mask, iterations=2)
    lin = srgb_to_lin(im)
    mean = lin_to_srgb(lin[mask].mean(axis=0))
    dist, (iy, ix) = ndimage.distance_transform_edt(~mask, return_indices=True)
    near = im[iy, ix]
    w = np.clip(1 - (dist - margin * 0.5) / (margin * 0.5), 0, 1)[..., None]
    out = np.where(mask[..., None], im, near * w + mean[None, None, :] * (1 - w))
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst, quality=94, subsampling=0)
    return out


def sample_atlas(atlas, uv):
    h, w = atlas.shape[:2]
    x = np.clip((uv[:, 0] * w).astype(np.int64), 0, w - 1)
    y = np.clip((uv[:, 1] * h).astype(np.int64), 0, h - 1)
    return atlas[y, x]


def components(idx, n):
    e = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]]])
    a = sp.coo_matrix((np.ones(len(e), dtype=np.int8), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    return connected_components(a, directed=False)


def voxel_ao(centres, areas, normals, gs=0.3, dirs=40, steps=16, gain=0.5):
    lo = centres.min(0) - gs * 2
    hi = centres.max(0) + gs * 2
    dims = np.ceil((hi - lo) / gs).astype(int) + 1
    cell = np.floor((centres - lo) / gs).astype(int)
    rho = np.zeros(dims, dtype=np.float32)
    np.add.at(rho, (cell[:, 0], cell[:, 1], cell[:, 2]), areas / gs ** 3)
    rho = ndimage.gaussian_filter(rho, 0.8)
    sigma = rho * gain
    k = np.arange(dirs) + 0.5
    phi = math.pi * (1 + 5 ** 0.5) * k
    cosv = 1 - 2 * k / dirs
    sinv = np.sqrt(1 - cosv ** 2)
    d = np.stack([np.cos(phi) * sinv, cosv, np.sin(phi) * sinv], 1)
    wt = 0.3 + 0.7 * (d[:, 1] * 0.5 + 0.5) ** 2
    ao = np.zeros(len(centres), dtype=np.float32)
    chunk = 20000
    for s in range(0, len(centres), chunk):
        c = centres[s:s + chunk]
        nrm = normals[s:s + chunk]
        acc = np.zeros(len(c), dtype=np.float32)
        wsum = 0.0
        for di in range(dirs):
            tau = np.zeros(len(c), dtype=np.float32)
            for st in range(1, steps + 1):
                p = c + d[di] * (gs * (st + 0.5))
                g = np.floor((p - lo) / gs).astype(int)
                ok = (g >= 0).all(1) & (g[:, 0] < dims[0]) & (g[:, 1] < dims[1]) & (g[:, 2] < dims[2])
                gg = np.clip(g, 0, dims - 1)
                tau += np.where(ok, sigma[gg[:, 0], gg[:, 1], gg[:, 2]], 0) * gs
            acc += np.exp(-tau) * wt[di]
            wsum += wt[di]
        ao[s:s + chunk] = acc / wsum
    return ao


def pca_frames(pos, lab, nc, cnt, centres):
    rel = pos - centres[lab]
    cov = np.zeros((nc, 9), dtype=np.float64)
    outer = (rel[:, :, None] * rel[:, None, :]).reshape(-1, 9)
    np.add.at(cov, lab, outer)
    cov = (cov / np.maximum(cnt, 1)[:, None]).reshape(nc, 3, 3)
    w, v = np.linalg.eigh(cov)
    major = v[:, :, 2]
    minor = v[:, :, 1]
    normal = v[:, :, 0]
    return major, minor, normal


def build_leaves(spec):
    name = spec['name']
    g = G(spec['dir'])
    prims = g.prims()
    leaf_ids = spec['leaf']
    poss, nrms, uvs, idxs = [], [], [], []
    base = 0
    for pi in leaf_ids:
        mi, p, mat = prims[pi]
        poss.append(g.acc(p['attributes']['POSITION']).astype(np.float32))
        nrms.append(g.acc(p['attributes']['NORMAL']).astype(np.float32))
        uvs.append(g.acc(p['attributes']['TEXCOORD_0']).astype(np.float32))
        idxs.append(g.acc(p['indices']).reshape(-1, 3).astype(np.int64) + base)
        base += len(poss[-1])
    pos = np.concatenate(poss)
    nrm = np.concatenate(nrms)
    uv = np.concatenate(uvs)
    idx = np.concatenate(idxs)
    off = np.array(spec.get('offset', [0, 0, 0]), dtype=np.float32)
    scale = spec['scale']
    pos = (pos - off) * scale
    nc, lab = components(idx, len(pos))
    used = np.zeros(len(pos), dtype=bool)
    used[idx.ravel()] = True
    tri_lab = lab[idx[:, 0]]
    comp_ids = np.unique(tri_lab)
    remap = -np.ones(nc, dtype=np.int64)
    remap[comp_ids] = np.arange(len(comp_ids))
    n = len(comp_ids)
    rng = np.random.default_rng(spec.get('seed', 7))
    perm = rng.permutation(n)
    rank_of = np.empty(n, dtype=np.int64)
    rank_of[perm] = np.arange(n)
    leaf_of_vert = np.where(used, remap[lab], -1)
    vert_rank = np.where(used, rank_of[np.maximum(leaf_of_vert, 0)], n)
    vorder = np.lexsort((np.arange(len(pos)), vert_rank))
    vorder = vorder[:int(used.sum())]
    vnew = -np.ones(len(pos), dtype=np.int64)
    vnew[vorder] = np.arange(len(vorder))
    pos, nrm, uv = pos[vorder], nrm[vorder], uv[vorder]
    leaf_v = rank_of[remap[lab[vorder]]]
    idx = vnew[idx]
    tri_rank = rank_of[remap[tri_lab]]
    torder = np.argsort(tri_rank, kind='stable')
    idx = idx[torder]
    tri_rank = tri_rank[torder]
    cnt_v = np.bincount(leaf_v, minlength=n).astype(np.float64)
    cnt_t = np.bincount(tri_rank, minlength=n)
    cum_idx = np.concatenate([[0], np.cumsum(cnt_t * 3)]).astype(np.uint32)
    ctr = np.zeros((n, 3), dtype=np.float64)
    np.add.at(ctr, leaf_v, pos)
    ctr /= np.maximum(cnt_v, 1)[:, None]
    e1 = pos[idx[:, 1]] - pos[idx[:, 0]]
    e2 = pos[idx[:, 2]] - pos[idx[:, 0]]
    area = np.zeros(n)
    np.add.at(area, tri_rank, 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1))
    lnorm = np.zeros((n, 3))
    np.add.at(lnorm, leaf_v, nrm)
    lnorm /= np.maximum(np.linalg.norm(lnorm, axis=1, keepdims=True), 1e-6)
    os.makedirs(OUT, exist_ok=True)
    atlas = dilate_atlas(os.path.join(spec['dir'], spec['atlas']), os.path.join(OUT, name + '_leaf.jpg'))
    bary = np.array([[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45], [0.45, 0.45, 0.1], [0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]])
    tc = np.zeros((len(idx), 3))
    for b in bary:
        tri_uv = uv[idx[:, 0]] * b[0] + uv[idx[:, 1]] * b[1] + uv[idx[:, 2]] * b[2]
        tc += srgb_to_lin(sample_atlas(atlas, tri_uv))
    tc /= len(bary)
    tri_area = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1)
    col = np.zeros((n, 3))
    np.add.at(col, tri_rank, tc * tri_area[:, None])
    mean_lin = (col.sum(0) / max(area.sum(), 1e-9))
    col = lin_to_srgb(col / np.maximum(area, 1e-9)[:, None])
    ao = voxel_ao(ctr.astype(np.float32), area.astype(np.float32), lnorm, spec.get('ao_gs', 0.3))
    major, minor, pnorm = pca_frames(pos.astype(np.float64), leaf_v, n, cnt_v, ctr)
    sgn = np.sign(np.einsum('ij,ij->i', pnorm, lnorm))
    sgn[sgn == 0] = 1
    pnorm *= sgn[:, None]
    hand = np.sign(np.einsum('ij,ij->i', np.cross(major, minor), pnorm))
    hand[hand == 0] = 1
    minor = minor * hand[:, None]
    rel = pos - ctr[leaf_v]
    pa = np.einsum('ij,ij->i', rel, major[leaf_v])
    pb = np.einsum('ij,ij->i', rel, minor[leaf_v])
    amin = np.full(n, 1e9); amax = np.full(n, -1e9); bmin = np.full(n, 1e9); bmax = np.full(n, -1e9)
    np.minimum.at(amin, leaf_v, pa); np.maximum.at(amax, leaf_v, pa)
    np.minimum.at(bmin, leaf_v, pb); np.maximum.at(bmax, leaf_v, pb)
    L = amax - amin
    W = 2 * area / np.maximum(L, 1e-6)
    ac = (amax + amin) / 2
    bc = (bmax + bmin) / 2
    c0 = ctr + major * ac[:, None] + minor * bc[:, None]
    quad = np.stack([c0 - major * (L / 2)[:, None], c0 - minor * (W / 2)[:, None], c0 + major * (L / 2)[:, None], c0 + minor * (W / 2)[:, None]], 1)
    quad_n = np.repeat(pnorm[:, None, :], 4, axis=1)
    lo = np.minimum(pos.min(0), quad.reshape(-1, 3).min(0))
    hi = np.maximum(pos.max(0), quad.reshape(-1, 3).max(0))
    boxc = (lo + hi) / 2
    boxh = (hi - lo) / 2 * 1.0005

    def q16(p):
        return np.clip(np.round((p - boxc) / boxh * 32767), -32767, 32767).astype(np.int16)

    def q8(v):
        return np.clip(np.round(v * 127), -127, 127).astype(np.int8)

    rank_u = np.clip(np.round((np.arange(n) + 0.5) / n * 32767), 0, 32767).astype(np.int16)
    ao8 = np.clip(np.round(ao * 127), 0, 127).astype(np.int8)
    os.makedirs(OUT, exist_ok=True)
    nv = len(pos)
    p4 = np.zeros((nv, 4), dtype=np.int16); p4[:, :3] = q16(pos)
    n4 = np.zeros((nv, 4), dtype=np.int8); n4[:, :3] = q8(nrm); n4[:, 3] = ao8[leaf_v]
    uv16 = np.clip(np.round(uv * 65535), 0, 65535).astype(np.uint16)
    lc4 = np.zeros((nv, 4), dtype=np.int16); lc4[:, :3] = q16(ctr)[leaf_v]; lc4[:, 3] = rank_u[leaf_v]
    with open(os.path.join(OUT, name + '.r0.bin'), 'wb') as f:
        for a in (p4, n4, uv16, lc4, idx.astype(np.uint32).ravel(), cum_idx):
            f.write(np.ascontiguousarray(a).tobytes())
    q4 = np.zeros((n * 4, 4), dtype=np.int16); q4[:, :3] = q16(quad.reshape(-1, 3))
    qn = np.zeros((n * 4, 4), dtype=np.int8); qn[:, :3] = q8(quad_n.reshape(-1, 3)); qn[:, 3] = np.repeat(ao8, 4)
    qc = np.zeros((n * 4, 4), dtype=np.uint8); qc[:, :3] = np.clip(np.round(np.repeat(col, 4, axis=0)), 0, 255).astype(np.uint8); qc[:, 3] = 255
    ql = np.zeros((n * 4, 4), dtype=np.int16); ql[:, :3] = np.repeat(q16(ctr), 4, axis=0); ql[:, 3] = np.repeat(rank_u, 4)
    base_idx = (np.arange(n)[:, None] * 4 + np.array([[0, 1, 2, 0, 2, 3]])).astype(np.uint32).ravel()
    with open(os.path.join(OUT, name + '.r1.bin'), 'wb') as f:
        for a in (q4, qn, qc, ql, base_idx):
            f.write(np.ascontiguousarray(a).tobytes())
    meta = {
        'name': name, 'leaves': int(n), 'verts0': int(nv), 'idx0': int(len(idx) * 3),
        'boxC': [float(x) for x in boxc], 'boxH': [float(x) for x in boxh],
        'leafSize': float(np.sqrt(np.median(area))), 'leafArea': float(area.sum()),
        'crown': [float(x) for x in np.average(ctr, axis=0, weights=area)],
        'crownRadius': float(np.sqrt(np.average(((ctr - np.average(ctr, axis=0, weights=area)) ** 2).sum(1), weights=area))),
        'fractions': FRACTIONS, 'atlas': f'/assets/trees/{name}_leaf.jpg', 'cutout': bool(spec.get('cutout', False)),
        'height': float(hi[1]), 'meanColor': [float(x) for x in mean_lin]
    }
    json.dump(meta, open(os.path.join(OUT, name + '.json'), 'w'))
    return meta, (pos, nrm, idx), (g, prims)


if __name__ == '__main__':
    spec = json.loads(sys.argv[1])
    print(build_leaves(spec)[0])
