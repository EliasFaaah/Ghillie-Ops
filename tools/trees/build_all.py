import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import leafset
import branches
from gltf_read import G

PH = os.environ.get('GHILLIE_PH', 'C:/Users/Leschke/AppData/Local/Temp/claude/C--Users-Leschke-Downloads/447c3e6d-e9a0-43dd-9c9d-341e12b584a0/scratchpad/ph/mod')

SPECS = {
    'OakA': {'stripPlates': True, 'dir': PH + '/island_tree_01', 'leaf': [1], 'branch': [0, 2], 'trunkPrims': [0], 'scale': 2.5, 'atlas': 'textures/island_tree_01_leaves_diff_1k.jpg', 'seed': 3},
    'OakB': {'stripPlates': True, 'dir': PH + '/island_tree_03', 'leaf': [1], 'branch': [0, 2], 'trunkPrims': [0], 'scale': 4.6, 'atlas': 'textures/island_tree_03_leaves_diff_1k.jpg', 'seed': 5},
    'OakC': {'stripPlates': True, 'dir': PH + '/island_tree_02', 'leaf': [1], 'branch': [0, 2], 'trunkPrims': [0], 'scale': 3.7, 'atlas': 'textures/island_tree_02_leaves_diff_1k.jpg', 'seed': 9},
    'Beech': {'dir': PH + '/jacaranda_tree', 'leaf': [2], 'branch': [0, 1], 'trunkPrims': [1], 'scale': 0.66, 'atlas': 'textures/jacaranda_tree_leaves_diff_1k.jpg', 'seed': 11},
    'Birch': {'dir': PH + '/tree_small_02', 'leaf': [1], 'branch': [0, 2], 'trunkPrims': [2], 'scale': 2.6, 'atlas': 'textures/tree_small_02_leaves_diff_1k.jpg', 'seed': 13, 'uvset': 0},
    'FirA': {'dir': PH + '/fir_tree_01', 'leaf': [2], 'branch': [0, 1, 3], 'trunkPrims': [1], 'scale': 0.95, 'atlas': 'textures/fir_tree_01_twig_diff_1k.jpg', 'seed': 15, 'ao_gs': 0.35},
    'FirB': {'dir': PH + '/fir_tree_01', 'leaf': [6], 'branch': [4, 5, 7], 'trunkPrims': [5], 'scale': 1.15, 'atlas': 'textures/fir_tree_01_twig_diff_1k.jpg', 'seed': 17, 'ao_gs': 0.35},
    'FirC': {'dir': PH + '/fir_tree_01', 'leaf': [9], 'branch': [8, 11, 10], 'trunkPrims': [11], 'scale': 1.1, 'atlas': 'textures/fir_tree_01_twig_diff_1k.jpg', 'seed': 19, 'ao_gs': 0.35}
}


def trunk_offset(spec):
    g = G(spec['dir'])
    p = g.prims()[spec['trunkPrims'][0]][1]
    pos = g.acc(p['attributes']['POSITION']).astype(np.float64)
    lo = pos[:, 1].min()
    if spec.get('stripPlates'):
        idx = g.acc(p['indices']).ravel().astype(np.uint32)
        kept, _ = branches.strip_plates((pos - np.array([0.0, lo, 0.0])) * spec['scale'], idx, 0.0, spec['scale'])
        used = np.unique(kept)
        lo = pos[used, 1].min() + 0.05 / spec['scale']
        pos = pos[used]
    sel = pos[pos[:, 1] < lo + 0.2 / max(spec['scale'], 0.2)]
    return [float(sel[:, 0].mean()), float(lo), float(sel[:, 2].mean())]


def branch_bounds(spec):
    g = G(spec['dir'])
    prims = g.prims()
    lo = np.full(3, 1e9)
    hi = np.full(3, -1e9)
    for pi in spec['branch']:
        pos = (g.acc(prims[pi][1]['attributes']['POSITION']).astype(np.float64) - np.array(spec['offset'])) * spec['scale']
        lo = np.minimum(lo, pos.min(0))
        hi = np.maximum(hi, pos.max(0))
    return [float(x) for x in lo], [float(x) for x in hi]


def build(name):
    spec = dict(SPECS[name], name=name)
    spec['offset'] = trunk_offset(spec)
    spec['extra_lo'], spec['extra_hi'] = branch_bounds(spec)
    meta = leafset.build_leaves(spec)[0]
    b = branches.run(spec)
    return meta, b


if __name__ == '__main__':
    for n in sys.argv[1:] or list(SPECS):
        meta, b = build(n)
        print(n, meta['leaves'], 'leaves', meta['verts0'], 'verts', round(meta['height'], 2), 'm', [(p['name'], len(p['lods'])) for p in b['parts']], flush=True)
