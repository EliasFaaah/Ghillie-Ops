exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_r_cards.py').read())

NAMES = {'OakTree': 'Oak', 'BeechTree': 'Beech', 'LindenTree': 'Linden', 'BirchTree': 'Birch', 'SpruceTree': 'Spruce', 'SpruceTreeB': 'SpruceB', 'SpruceTreeC': 'SpruceC', 'BushA': 'Bush'}


def solid_object(S, faces, mats, name):
    ids = S['tv'][faces]
    used, inv = np.unique(ids.ravel(), return_inverse=True)
    F = len(faces)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(used))
    me.vertices.foreach_set('co', S['co'][used].ravel())
    me.loops.add(F * 3)
    me.loops.foreach_set('vertex_index', inv.astype(np.int32))
    me.polygons.add(F)
    me.polygons.foreach_set('loop_start', np.arange(0, F * 3, 3, dtype=np.int32))
    me.polygons.foreach_set('loop_total', np.full(F, 3, np.int32))
    me.polygons.foreach_set('material_index', S['mat'][faces].astype(np.int32))
    me.update()
    uv = me.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', S['uv'][S['tl'][faces]].ravel())
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def decimate_to(o, target):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()
    for _ in range(4):
        t = len(o.data.polygons)
        if t <= target * 1.1:
            break
        md = o.modifiers.new('dec', 'DECIMATE')
        md.ratio = max(0.001, target / t)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=md.name)
    for p in o.data.polygons:
        p.use_smooth = True


def make_cards(name, tag, cl, keep, grow, rng_seed, crown, mats_leaf, objname):
    rnd = np.random.default_rng(rng_seed)
    cols, rows, size = cl['atlas']['cols'], cl['atlas']['rows'], cl['atlas']['size']
    W, H = cols * size, rows * size
    verts, uvs, nrms, fcol, faces = [], [], [], [], []
    crown = np.array(crown)
    R = 0.0
    for c in cl['cards']:
        R = max(R, np.linalg.norm(np.array(c['cc']) - crown))
    for c in cl['cards']:
        if rnd.random() > keep:
            continue
        cc = np.array(c['cc'])
        out = cc - crown
        d = np.linalg.norm(out)
        nv = out / (d + 1e-6) * 0.78 + np.array([0, 0, 0.22])
        nv /= np.linalg.norm(nv)
        ao = 0.66 + 0.34 * min(1.0, d / R) ** 0.8
        tint = 1.0 + rnd.uniform(-0.07, 0.07)
        col = (ao * tint, ao, ao * (2 - tint), 1.0)
        for tn, right, up, S in (('f', np.array(c['u']), np.array(c['v']), c['S_f']), ('s', -np.array(c['n']), np.array(c['v']), c['S_s'])):
            h = S * grow * 0.5
            slot = c['slot_' + tn]
            x0, y0 = (slot % cols) * size, (slot // cols) * size
            u0, u1 = x0 / W, (x0 + size) / W
            v1, v0 = 1 - y0 / H, 1 - (y0 + size) / H
            base = len(verts)
            for sx, sy, uu, vv in ((-1, -1, u0, v0), (1, -1, u1, v0), (1, 1, u1, v1), (-1, 1, u0, v1)):
                verts.append(cc + right * sx * h + up * sy * h)
                uvs.append((uu, vv))
                nrms.append(nv)
                fcol.append(col)
            faces.append((base, base + 1, base + 2, base + 3))
    me = bpy.data.meshes.new(objname)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.uv_layers.new(name='UVMap')
    uvl = me.uv_layers.active.data
    uvflat = np.array(uvs, np.float32)
    lv = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', lv)
    uvl.foreach_set('uv', uvflat[lv].ravel())
    me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    cl_arr = np.array(fcol, np.float32)[lv]
    me.color_attributes['Col'].data.foreach_set('color', cl_arr.ravel())
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = 0
    me.normals_split_custom_set([tuple(np.array(nrms)[i]) for i in lv])
    me.materials.append(mats_leaf)
    o = bpy.data.objects.new(objname, me)
    bpy.context.scene.collection.objects.link(o)
    return o, len(faces) * 2


def assemble(name, tag='l0', lods=((0, 14000, 1.0, 1.0), (1, 3500, 0.3, 1.8), (2, 700, 0.45, 1.5)), export=True):
    cfg = SPECIES[name]
    S, meta = load(name)
    d = wdir(name)
    cl = json.load(open(os.path.join(d, 'cl_%s.json' % tag)))
    sc = scene_s2r()
    clear(sc)
    objs = import_glb(cfg['src'])
    src_mats = {m.name: m for m in bpy.data.materials if m.node_tree and not m.name.startswith('P_')}
    for o in [o for o in bpy.data.objects]:
        bpy.data.objects.remove(o, do_unlink=True)
    short = NAMES[name]
    mats = []
    for i, mn in enumerate(meta['mats']):
        m = src_mats[mn]
        if any(k in mn.lower() for k in cfg['leaf']):
            m = src_mats[mn]
        else:
            m.name = 'bark_%s_%d' % (short, i)
        mats.append(m)
    leaf, idx = leaf_mask(meta, name, S['mat'])
    solid_faces = np.nonzero(~leaf)[0]
    vid = merged_vertex_ids(S['co'])
    sisl = label_islands(vid[S['tv'][solid_faces]])
    ssize = np.bincount(sisl)
    sorder = np.argsort(-ssize)
    scum = np.cumsum(ssize[sorder])
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    lm = bpy.data.materials.new('Leaf_' + short)
    lm.use_nodes = True
    nt = lm.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    img = bpy.data.images.load(os.path.join(d, 'leaf_atlas_%s.png' % tag))
    img.colorspace_settings.name = 'sRGB'
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = img
    nt.links.new(tx.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tx.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.7
    lm.surface_render_method = 'DITHERED'
    lm.use_backface_culling = False
    res = {}
    for lod, target, keep, grow in lods:
        kept = sorder[:int(np.searchsorted(scum, 2.2 * target)) + 1]
        so = solid_object(S, solid_faces[np.isin(sisl, kept)], mats, '%s_s_lod%d' % (name, lod))
        decimate_to(so, target)
        so.parent = root
        co, nq = make_cards(name, tag, cl, keep, grow, 5 + lod, cl['crown'], lm, '%s_c_lod%d' % (name, lod))
        co.parent = root
        res['lod%d' % lod] = {'solid': len(so.data.polygons), 'cards': nq}
    if cfg['height'] > 4:
        r = cfg['trunk_r']
        cm = bpy.data.meshes.new('col_trunk')
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r, radius2=r * 0.85, depth=5.0)
        for v in bm.verts:
            v.co.z += 2.5
        bm.to_mesh(cm)
        bm.free()
        col = bpy.data.objects.new('col_trunk', cm)
        sc.collection.objects.link(col)
        col.parent = root
    if export:
        res['export'] = export_tree(root, name)
    return res


def export_tree(root, name):
    import subprocess
    d = os.path.join(SCRATCH, 'r_exp', name)
    os.makedirs(d, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for c in root.children_recursive:
        c.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=os.path.join(d, name + '.gltf'), use_selection=True, use_active_scene=True, export_format='GLTF_SEPARATE', export_apply=True, export_yup=True, export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True, export_cameras=False, export_lights=False, export_extras=False, export_image_format='AUTO')
    r = subprocess.run([os.path.join(GAME, 'tools', 'gltfpack.exe'), '-i', os.path.join(d, name + '.gltf'), '-o', os.path.join(EXPORT, name + '.glb'), '-cc', '-tc', '-tu', 'normal,attrib', '-kn', '-km', '-kv', '-vtf'], capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()[-300:]
