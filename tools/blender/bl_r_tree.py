exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_r_common.py').read())
import numpy as np
import bmesh

WORK = os.path.join(SCRATCH, 'r_work')
PH = os.path.join(SCRATCH, 'r_trees')
OBJ = os.path.join(SCRATCH, 'objv', 'glb')

SPECIES = {
    'OakTree': dict(src=PH + r'\island_tree_01\island_tree_01.gltf', height=13.0, leaf=['leaves'], pick=None, ground=(0.15, 0.55), trunk_r=0.55),
    'BeechTree': dict(src=PH + r'\jacaranda_tree\jacaranda_tree.gltf', height=12.5, leaf=['leaves'], pick=None, ground=None, trunk_r=0.5),
    'LindenTree': dict(src=PH + r'\tree_small_02\tree_small_02.gltf', height=10.5, leaf=['leaves'], pick=None, ground=None, trunk_r=0.28),
    'BirchTree': dict(src=OBJ + r'\23a16e74154443d7b67149db31eee816.glb', height=11.0, leaf=['leaves'], pick=None, ground=None, trunk_r=0.22),
    'SpruceTree': dict(src=PH + r'\fir_tree_01\fir_tree_01.gltf', height=19.0, leaf=['twig'], pick='fir_tree_01_a_LOD0', ground=None, trunk_r=0.4),
    'SpruceTreeB': dict(src=PH + r'\fir_tree_01\fir_tree_01.gltf', height=17.0, leaf=['twig'], pick='fir_tree_01_b_LOD0', ground=None, trunk_r=0.35),
    'SpruceTreeC': dict(src=PH + r'\fir_tree_01\fir_tree_01.gltf', height=17.0, leaf=['twig'], pick='fir_tree_01_c_LOD0', ground=None, trunk_r=0.3),
    'BushA': dict(src=OBJ + r'\8db54bf299954daa9ee29b233e923672.glb', height=1.6, leaf=['leaf'], pick=None, ground=None, trunk_r=0.05)
}


def wdir(name):
    d = os.path.join(WORK, name)
    os.makedirs(d, exist_ok=True)
    return d


def extract(ob):
    me = ob.data
    M = np.array(ob.matrix_world)
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = (M[:3, :3] @ co.reshape(-1, 3).T).T + M[:3, 3]
    me.calc_loop_triangles()
    lt = me.loop_triangles
    F = len(lt)
    tv = np.empty(F * 3, np.int32)
    lt.foreach_get('vertices', tv)
    tl = np.empty(F * 3, np.int32)
    lt.foreach_get('loops', tl)
    mat = np.empty(F, np.int32)
    lt.foreach_get('material_index', mat)
    uvl = me.uv_layers.active.data
    uv = np.empty(len(uvl) * 2, np.float32)
    uvl.foreach_get('uv', uv)
    nr = np.empty(len(me.loops) * 3, np.float32)
    me.corner_normals.foreach_get('vector', nr)
    nr = (M[:3, :3] @ nr.reshape(-1, 3).T).T
    return co.astype(np.float32), tv.reshape(F, 3), tl.reshape(F, 3), mat, uv.reshape(-1, 2), nr.astype(np.float32)


def prep(name):
    cfg = SPECIES[name]
    sc = scene_s2r()
    clear(sc)
    objs = import_glb(cfg['src'])
    ms = [o for o in objs if o.type == 'MESH']
    if cfg['pick']:
        ms = [o for o in ms if o.name.startswith(cfg['pick'])]
    for o in [o for o in objs if o not in ms]:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in ms:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    for o in ms:
        o.select_set(True)
    bpy.context.view_layer.objects.active = ms[0]
    if len(ms) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = 'SRC_' + name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    co, tv, tl, mat, uv, nr = extract(ob)
    mats = [m.name for m in ob.data.materials]
    zmin = float(co[:, 2].min())
    zmax = float(co[:, 2].max())
    low = co[:, 2] < zmin + 0.3
    cx, cy = float(co[low, 0].mean()), float(co[low, 1].mean())
    s = cfg['height'] / (zmax - zmin)
    co = (co - np.array([cx, cy, zmin], np.float32)) * s
    keep = np.ones(len(tv), bool)
    if cfg['ground']:
        zc, rc = cfg['ground']
        fc = co[tv].mean(1)
        keep &= ~((fc[:, 2] < zc * s) & (np.hypot(fc[:, 0], fc[:, 1]) > rc))
    d = wdir(name)
    np.savez(os.path.join(d, 'src.npz'), co=co, tv=tv[keep], tl=tl[keep], mat=mat[keep], uv=uv, nr=nr)
    json.dump({'mats': mats, 'scale': s, 'center': [cx, cy, zmin], 'height': cfg['height']}, open(os.path.join(d, 'src.json'), 'w'))
    return {'name': name, 'F': int(keep.sum()), 'mats': mats, 'scale': round(s, 3), 'size': (co.max(0) - co.min(0)).round(2).tolist()}
