exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_r_asm.py').read())


def hemi_dir(u, v):
    px, py = u * 2 - 1, v * 2 - 1
    x = (px + py) * 0.5
    z = (px - py) * 0.5
    y = 1.0 - abs(x) - abs(z)
    n = np.array([x, y, z])
    return n / np.linalg.norm(n)


def imp_params(name):
    S, meta = load(name)
    P = S['co'][np.unique(S['tv'])]
    lo, hi = P.min(0), P.max(0)
    c = (lo + hi) / 2
    R = float(np.percentile(np.linalg.norm(P - c, axis=1), 99.97))
    return S, meta, c, R


def bake_impostor(name, G=8, size=256, start=0, count=64):
    S, meta, c, R = imp_params(name)
    d = wdir(name)
    sc = scene_s2r()
    for o in list(sc.objects):
        if o.type != 'CAMERA' and o.name != 'IMP_FULL':
            bpy.data.objects.remove(o, do_unlink=True)
    have = {m.name[2:]: m for m in bpy.data.materials if m.name.startswith('P_')}
    if not have:
        objs = import_glb(SPECIES[name]['src'])
        have = pass_materials()
        for o in list(bpy.data.objects):
            if o.name != 'IMP_FULL':
                bpy.data.objects.remove(o, do_unlink=True)
    mats = [have[n] for n in meta['mats']]
    full = bpy.data.objects.get('IMP_FULL')
    if full is None or full.get('species') != name:
        if full:
            bpy.data.objects.remove(full, do_unlink=True)
        full = tmp_object(S, np.arange(len(S['tv'])), mats, 'IMP_FULL')
        full['species'] = name
    for o in sc.objects:
        o.hide_render = o is not full
    render_setup(sc, size, 32)
    od = os.path.join(d, 'imp')
    os.makedirs(od, exist_ok=True)
    Rc = R * 1.6
    cb = Vector((c[0], c[1], c[2]))
    for k in range(start, min(start + count, G * G)):
        fx, fy = k % G, k // G
        dg = hemi_dir(fx / (G - 1), fy / (G - 1))
        back = np.array([dg[0], -dg[2], dg[1]])
        up_w = np.array([0, 0, 1.0]) if abs(back[2]) < 0.999 else np.array([0, 1.0, 0])
        right = np.cross(up_w, back)
        right /= np.linalg.norm(right)
        up = np.cross(back, right)
        pos = c + back * Rc
        ortho_cam(sc, pos, right, up, back, 2 * R, 0.05, Rc * 2 + R)
        for pk, tr, ch in ((0, 'Standard', 'a'), (1, 'Raw', 'n'), (2, 'Raw', 'd')):
            sc.view_settings.view_transform = tr
            set_pass(pk, Rc - R, Rc + R)
            sc.render.filepath = os.path.join(od, '%03d_%s.png' % (k, ch))
            bpy.ops.render.render(write_still=True)
    json.dump({'center': c.tolist(), 'radius': R, 'frames': G, 'size': size}, open(os.path.join(d, 'imp.json'), 'w'))
    return {'baked': min(start + count, G * G) - start, 'R': round(R, 2), 'center': c.round(2).tolist()}
