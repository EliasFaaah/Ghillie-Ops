exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_r_tree.py').read())


def load(name):
    d = wdir(name)
    z = np.load(os.path.join(d, 'src.npz'))
    meta = json.load(open(os.path.join(d, 'src.json')))
    return {k: z[k] for k in z.files}, meta


def leaf_mask(meta, name, mat):
    keys = SPECIES[name]['leaf']
    idx = [i for i, m in enumerate(meta['mats']) if any(k in m.lower() for k in keys)]
    return np.isin(mat, idx), idx


def merged_vertex_ids(co):
    k = np.round(co * 2e4).astype(np.int64)
    h = k[:, 0] * 73856093 ^ k[:, 1] * 19349663 ^ k[:, 2] * 83492791
    _, inv = np.unique(h, return_inverse=True)
    return inv


def label_islands(tvm):
    a, b, c = tvm[:, 0], tvm[:, 1], tvm[:, 2]
    n = int(tvm.max()) + 1
    lab = np.arange(n)
    for _ in range(400):
        old = lab.copy()
        m = np.minimum(np.minimum(lab[a], lab[b]), lab[c])
        np.minimum.at(lab, a, m)
        np.minimum.at(lab, b, m)
        np.minimum.at(lab, c, m)
        lab = lab[lab]
        if (lab == old).all():
            break
    fl = lab[a]
    _, inv = np.unique(fl, return_inverse=True)
    return inv


def kmeans(pts, k, iters=14, seed=3):
    rng = np.random.default_rng(seed)
    cen = pts[rng.choice(len(pts), k, replace=False)].copy()
    for _ in range(iters):
        d = ((pts[:, None, :] - cen[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for j in range(k):
            m = lab == j
            if m.any():
                cen[j] = pts[m].mean(0)
    d = ((pts[:, None, :] - cen[None, :, :]) ** 2).sum(-1)
    return d.argmin(1), cen


def cluster(name, tag, K, seed=3):
    S, meta = load(name)
    lm, _ = leaf_mask(meta, name, S['mat'])
    fi = np.nonzero(lm)[0]
    vid = merged_vertex_ids(S['co'])
    isl = label_islands(vid[S['tv'][fi]])
    ni = isl.max() + 1
    fc = S['co'][S['tv'][fi]].mean(1)
    cnt = np.bincount(isl, minlength=ni).astype(np.float64)
    ic = np.stack([np.bincount(isl, weights=fc[:, k], minlength=ni) / cnt for k in range(3)], 1)
    lab, cen = kmeans(ic, K, seed=seed)
    flab = lab[isl]
    crown = fc.mean(0)
    cards = []
    for j in range(K):
        sel = fi[flab == j]
        if len(sel) == 0:
            continue
        P = S['co'][S['tv'][sel]].reshape(-1, 3)
        if len(P) > 30000:
            P = P[np.random.default_rng(1).choice(len(P), 30000, replace=False)]
        c = P.mean(0)
        w, v = np.linalg.eigh(np.cov((P - c).T))
        e0, e1, e2 = v[:, 2], v[:, 1], v[:, 0]
        out = c - crown
        out = out / (np.linalg.norm(out) + 1e-6)
        n = e2 if np.dot(e2, out) >= 0 else -e2
        u = e0 - n * np.dot(e0, n)
        u /= np.linalg.norm(u) + 1e-9
        vv = np.cross(n, u)
        if vv[2] < 0:
            u, vv = -u, -vv
            n = np.cross(u, vv)
        r = P - c
        pu, pv, pn = r @ u, r @ vv, r @ n
        ext = lambda x: float(np.percentile(x, 99.0) - np.percentile(x, 1.0))
        cards.append({'id': j, 'faces': int(len(sel)), 'c': c.tolist(), 'u': u.tolist(), 'v': vv.tolist(), 'n': n.tolist(), 'eu': ext(pu), 'ev': ext(pv), 'en': ext(pn), 'cu': float((np.percentile(pu, 99) + np.percentile(pu, 1)) / 2), 'cv': float((np.percentile(pv, 99) + np.percentile(pv, 1)) / 2), 'cn': float((np.percentile(pn, 99) + np.percentile(pn, 1)) / 2)})
    d = wdir(name)
    np.savez(os.path.join(d, 'cl_%s.npz' % tag), fi=fi, flab=flab)
    json.dump({'cards': cards, 'crown': crown.tolist()}, open(os.path.join(d, 'cl_%s.json' % tag), 'w'))
    return {'islands': int(ni), 'cards': len(cards), 'faces_per_card': [int(np.percentile([c['faces'] for c in cards], p)) for p in (0, 50, 100)]}


def pass_materials(prefix='P_'):
    out = {}
    for m in list(bpy.data.materials):
        if m.node_tree is None or m.name.startswith(prefix) or m.name.startswith('Grass'):
            continue
        b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b is None:
            continue
        c = m.copy()
        c.name = prefix + m.name
        nt = c.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        outn = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        ea = nt.nodes.new('ShaderNodeEmission')
        bc = bsdf.inputs['Base Color']
        if bc.is_linked:
            nt.links.new(bc.links[0].from_socket, ea.inputs['Color'])
        else:
            ea.inputs['Color'].default_value = bc.default_value
        en = nt.nodes.new('ShaderNodeEmission')
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        mm = nt.nodes.new('ShaderNodeVectorMath')
        mm.operation = 'MULTIPLY_ADD'
        mm.inputs[1].default_value = (0.5, 0.5, 0.5)
        mm.inputs[2].default_value = (0.5, 0.5, 0.5)
        nt.links.new(geo.outputs['Normal'], mm.inputs[0])
        nt.links.new(mm.outputs['Vector'], en.inputs['Color'])
        ed = nt.nodes.new('ShaderNodeEmission')
        cam = nt.nodes.new('ShaderNodeCameraData')
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.name = 'DEPTH'
        mr.clamp = True
        mr.inputs['From Min'].default_value = 0.0
        mr.inputs['From Max'].default_value = 1.0
        nt.links.new(cam.outputs['View Z Depth'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], ed.inputs['Color'])
        pv = nt.nodes.new('ShaderNodeValue')
        pv.name = 'PASS'
        g1 = nt.nodes.new('ShaderNodeMath')
        g1.operation = 'GREATER_THAN'
        g1.inputs[1].default_value = 0.5
        g2 = nt.nodes.new('ShaderNodeMath')
        g2.operation = 'GREATER_THAN'
        g2.inputs[1].default_value = 1.5
        nt.links.new(pv.outputs[0], g1.inputs[0])
        nt.links.new(pv.outputs[0], g2.inputs[0])
        m1 = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(g1.outputs[0], m1.inputs[0])
        nt.links.new(ea.outputs[0], m1.inputs[1])
        nt.links.new(en.outputs[0], m1.inputs[2])
        m2 = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(g2.outputs[0], m2.inputs[0])
        nt.links.new(m1.outputs[0], m2.inputs[1])
        nt.links.new(ed.outputs[0], m2.inputs[2])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        m3 = nt.nodes.new('ShaderNodeMixShader')
        al = bsdf.inputs['Alpha']
        if al.is_linked:
            nt.links.new(al.links[0].from_socket, m3.inputs[0])
        else:
            m3.inputs[0].default_value = al.default_value
        nt.links.new(tr.outputs[0], m3.inputs[1])
        nt.links.new(m2.outputs[0], m3.inputs[2])
        nt.links.new(m3.outputs[0], outn.inputs['Surface'])
        c.surface_render_method = 'DITHERED'
        c.use_backface_culling = False
        out[m.name] = c
    return out


def set_pass(k, near=None, far=None):
    for m in bpy.data.materials:
        if m.name.startswith('P_') and m.node_tree:
            m.node_tree.nodes['PASS'].outputs[0].default_value = float(k)
            if near is not None:
                mr = m.node_tree.nodes['DEPTH']
                mr.inputs['From Min'].default_value = near
                mr.inputs['From Max'].default_value = far


def tmp_object(S, faces, mats, name='TMP'):
    F = len(faces)
    verts = S['co'][S['tv'][faces]].reshape(-1, 3)
    me = bpy.data.meshes.new(name)
    me.vertices.add(F * 3)
    me.vertices.foreach_set('co', verts.ravel())
    me.loops.add(F * 3)
    me.loops.foreach_set('vertex_index', np.arange(F * 3, dtype=np.int32))
    me.polygons.add(F)
    me.polygons.foreach_set('loop_start', np.arange(0, F * 3, 3, dtype=np.int32))
    me.polygons.foreach_set('loop_total', np.full(F, 3, np.int32))
    me.polygons.foreach_set('material_index', S['mat'][faces].astype(np.int32))
    me.update()
    uv = me.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', S['uv'][S['tl'][faces]].ravel())
    for m in mats:
        me.materials.append(m)
    names = {n.layer_name or 'Col' for m in mats if m.node_tree for n in m.node_tree.nodes if n.type == 'VERTEX_COLOR'}
    for cn in names:
        ca = me.color_attributes.new(cn, 'FLOAT_COLOR', 'CORNER')
        ca.data.foreach_set('color', np.ones(F * 3 * 4, np.float32))
    if names:
        me.color_attributes.active_color = me.color_attributes[sorted(names)[0]]
        me.color_attributes.render_color_index = 0
    nr = S['nr'][S['tl'][faces]].reshape(-1, 3)
    me.normals_split_custom_set(nr.tolist())
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def ortho_cam(sc, pos, right, up, back, scale, near, far):
    for c in [o for o in sc.objects if o.type == 'CAMERA']:
        bpy.data.objects.remove(c, do_unlink=True)
    cd = bpy.data.cameras.new('RC')
    cd.type = 'ORTHO'
    cd.ortho_scale = scale
    cd.clip_start = near
    cd.clip_end = far
    co = bpy.data.objects.new('RC', cd)
    sc.collection.objects.link(co)
    m = Matrix([[right[0], up[0], back[0], pos[0]], [right[1], up[1], back[1], pos[1]], [right[2], up[2], back[2], pos[2]], [0, 0, 0, 1]])
    co.matrix_world = m
    sc.camera = co
    return co


def render_setup(sc, res, samples=24):
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.eevee.taa_render_samples = samples
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    w = bpy.data.worlds.get('S2R_world') or bpy.data.worlds.new('S2R_world')
    w.use_nodes = True
    sc.world = w


def render_tiles(name, tag, start, count, res=128):
    S, meta = load(name)
    d = wdir(name)
    cl = json.load(open(os.path.join(d, 'cl_%s.json' % tag)))
    z = np.load(os.path.join(d, 'cl_%s.npz' % tag))
    fi, flab = z['fi'], z['flab']
    sc = bpy.context.scene
    for o in sc.objects:
        o.hide_render = True
    have = {m.name[2:]: m for m in bpy.data.materials if m.name.startswith('P_')}
    pm = have if have else pass_materials()
    mats = [pm[n] for n in meta['mats']]
    render_setup(sc, res)
    td = os.path.join(d, 'tiles_' + tag)
    os.makedirs(td, exist_ok=True)
    done = 0
    for ci in range(start, min(start + count, len(cl['cards']))):
        card = cl['cards'][ci]
        faces = fi[flab == card['id']]
        o = tmp_object(S, faces, mats)
        u, v, n = np.array(card['u']), np.array(card['v']), np.array(card['n'])
        c = np.array(card['c']) + u * card['cu'] + v * card['cv'] + n * card['cn']
        views = [('f', u, v, n, max(card['eu'], card['ev']), card['en']), ('s', -n, v, u, max(card['en'], card['ev']), card['eu'])]
        for tn, right, up, back, ext, thick in views:
            S_ = ext * 1.08 + 0.02
            far_r = thick / 2 + 1.0
            pos = c + back * far_r
            ortho_cam(sc, pos, right, up, back, S_, 0.05, far_r * 2 + thick)
            for pk, tr in ((0, 'Standard'), (2, 'Raw')):
                sc.view_settings.view_transform = tr
                set_pass(pk, far_r - thick / 2, far_r + thick / 2)
                sc.render.filepath = os.path.join(td, '%03d_%s_%s.png' % (ci, tn, 'a' if pk == 0 else 'd'))
                bpy.ops.render.render(write_still=True)
        card['S_f'] = max(card['eu'], card['ev']) * 1.08 + 0.02
        card['S_s'] = max(card['en'], card['ev']) * 1.08 + 0.02
        card['cc'] = c.tolist()
        bpy.data.objects.remove(o, do_unlink=True)
        for me in [m for m in bpy.data.meshes if m.users == 0]:
            bpy.data.meshes.remove(me)
        done += 1
    json.dump(cl, open(os.path.join(d, 'cl_%s.json' % tag), 'w'))
    return {'rendered': done}
