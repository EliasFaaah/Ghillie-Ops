SHO = Vector((0.17, -0.10, -0.22))
ELB = Vector((0.20, -0.10, -0.54))
WRI = Vector((0.20, 0.19, -0.54))
PALM = 0.092
FINGERS = {
    'index': dict(x=-0.0295, y=0.090, segs=(0.047, 0.027, 0.023), rx=0.0108, rz=0.0092),
    'middle': dict(x=-0.0100, y=0.094, segs=(0.051, 0.030, 0.024), rx=0.0110, rz=0.0094),
    'ring': dict(x=0.0095, y=0.088, segs=(0.047, 0.029, 0.023), rx=0.0104, rz=0.0090),
    'pinky': dict(x=0.0285, y=0.079, segs=(0.037, 0.022, 0.020), rx=0.0094, rz=0.0082),
}
THUMB = dict(base=Vector((-0.030, 0.012, -0.006)), dir=Vector((-0.55, 0.80, -0.22)).normalized(), segs=(0.044, 0.035, 0.029), rx=0.0120, rz=0.0110)
FNAMES = ['thumb', 'index', 'middle', 'ring', 'pinky']
GROUPS = []


def mir(v):
    return Vector((-v.x, v.y, v.z))


def P(side, v):
    return v if side == 'R' else mir(v)


def finger_chain(name):
    if name == 'thumb':
        pts = [WRI + THUMB['base']]
        for L in THUMB['segs']:
            pts.append(pts[-1] + THUMB['dir'] * L)
    else:
        f = FINGERS[name]
        pts = [WRI + Vector((f['x'], f['y'], 0.0))]
        for L in f['segs']:
            pts.append(pts[-1] + Vector((0, L, 0)))
    return pts


def make_rig():
    purge('FPRig')
    arm = bpy.data.armatures.new('FPRig')
    ob = bpy.data.objects.new('FPRig', arm)
    sc().collection.objects.link(ob)
    for o in bpy.data.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    E = arm.edit_bones

    def bone(name, head, tail, parent=None, connect=False, deform=True, up=(0, 0, 1)):
        b = E.new(name)
        b.head = B(head)
        b.tail = B(tail)
        b.align_roll(Vector(up))
        b.use_deform = deform
        if parent:
            b.parent = E[parent]
            b.use_connect = connect
        return b

    bone('root', Vector((0, 0, 0)), Vector((0, 0.05, 0)))
    bone('weapon', Vector((0, 0, 0)), Vector((0, 0.10, 0)), 'root')
    for side in 'RL':
        s = 1 if side == 'R' else -1
        sh, el, wr = (P(side, p) for p in (SHO, ELB, WRI))
        bone(f'shoulder.{side}', sh, sh + Vector((0.06 * s, 0, 0)), 'root', deform=False)
        bone(f'upper_arm.{side}', sh, el, f'shoulder.{side}', up=(0, 1, 0))
        bone(f'forearm.{side}', el, wr, f'upper_arm.{side}', True)
        bone(f'hand.{side}', wr, wr + Vector((0, PALM, 0)), f'forearm.{side}', True)
        for fn in FNAMES:
            pts = [P(side, p) for p in finger_chain(fn)]
            for k in range(3):
                bone(f'{fn}_{k + 1:02d}.{side}', pts[k], pts[k + 1], f'hand.{side}' if k == 0 else f'{fn}_{k:02d}.{side}', k > 0)
        bone(f'hand_ik.{side}', wr, wr + Vector((0, PALM, 0)), 'root', deform=False)
        bone(f'pole.{side}', Vector((s * 0.60, 0.10, -0.70)), Vector((s * 0.60, 0.10, -0.65)), 'root', deform=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    pb = ob.pose.bones
    for side in 'RL':
        ik = pb[f'forearm.{side}'].constraints.new('IK')
        ik.target = ob
        ik.subtarget = f'hand_ik.{side}'
        ik.pole_target = ob
        ik.pole_subtarget = f'pole.{side}'
        ik.pole_angle = math.radians(105 if side == 'R' else 75)
        ik.chain_count = 2
        ik.use_tail = True
        cr = pb[f'hand.{side}'].constraints.new('COPY_ROTATION')
        cr.target = ob
        cr.subtarget = f'hand_ik.{side}'
        for n in [f'hand.{side}', f'hand_ik.{side}', f'shoulder.{side}'] + [f'{fn}_{k + 1:02d}.{side}' for fn in FNAMES for k in range(3)]:
            pb[n].rotation_mode = 'QUATERNION'
    pb['weapon'].rotation_mode = 'QUATERNION'
    ob.display_type = 'WIRE'
    ob.show_in_front = True
    return ob


def chain_weights(p, bones, blend=0.012):
    best = None
    for i, (name, h, t) in enumerate(bones):
        ax = t - h
        L = ax.length
        u = ax / L
        s = max(0.0, min(L, (p - h).dot(u)))
        d = (p - (h + u * s)).length
        if best is None or d < best[0] - 1e-9:
            best = (d, i, s, L)
    d, i, s, L = best
    w = {bones[i][0]: 1.0}
    if s < blend and i > 0:
        a = 0.5 * (1 - s / blend)
        w[bones[i][0]] = 1 - a
        w[bones[i - 1][0]] = w.get(bones[i - 1][0], 0) + a
    if L - s < blend and i < len(bones) - 1:
        a = 0.5 * (1 - (L - s) / blend)
        w[bones[i][0]] = 1 - a
        w[bones[i + 1][0]] = w.get(bones[i + 1][0], 0) + a
    return w


def bone_list(names):
    arm = bpy.data.objects['FPRig'].data
    out = []
    for n in names:
        b = arm.bones[n]
        out.append((b.name, S2Bi @ Vector(b.head_local), S2Bi @ Vector(b.tail_local)))
    return out


def skin(bm, wfun):
    dl = bm.verts.layers.deform.verify()
    for v in bm.verts:
        for nm, w in wfun(v.co).items():
            v[dl][GROUPS.index(nm)] = w
    return bm


def arm_items(rng):
    sh, el, wr = SHO, ELB, WRI
    arm_b = bone_list(['upper_arm.R', 'forearm.R', 'hand.R'])
    hand_b = bone_list(['forearm.R', 'hand.R'])
    fw = lambda p: chain_weights(p, arm_b, 0.05)
    items = []
    up = sweep([sh + (el - sh) * (i / 10) for i in range(11)], [0.052 - 0.004 * i / 10 for i in range(11)], 20)
    items.append((skin(up, fw), 'sleeve'))
    fa_path = [el + (wr - el) * (i / 14) for i in range(15)] + [wr + Vector((0, 0.028, 0))]
    fr = [0.047 - 0.009 * (i / 14) ** 1.3 for i in range(15)] + [0.0385]
    items.append((skin(sweep(fa_path, fr, 22), fw), 'sleeve'))
    items.append((skin(sweep([wr + Vector((0, 0.012, 0)), wr + Vector((0, 0.034, 0))], [0.0405, 0.0410], 22), fw), 'strap'))
    pm = [(-0.030, 0.066, 0.046), (-0.012, 0.067, 0.045), (0.006, 0.070, 0.042), (0.024, 0.075, 0.039), (0.042, 0.081, 0.036), (0.060, 0.086, 0.033), (0.076, 0.090, 0.030), (0.090, 0.092, 0.028), (0.100, 0.088, 0.024)]
    palm = loft([(y, rrect(w, h, min(w, h) * 0.34, 5, 0, -0.002)) for (y, w, h) in pm], 'Y')
    for v in palm.verts:
        v.co += wr
    items.append((skin(palm, lambda p: chain_weights(p, hand_b, 0.03)), 'glove_fabric'))
    mound = sweep([wr + Vector((-0.030, 0.012, -0.008)), wr + Vector((-0.030, 0.044, -0.014))], [0.0185, 0.0165], 14)
    items.append((skin(mound, lambda p: {'hand.R': 1.0}), 'glove_leather'))
    kp = loft([(y, rrect(w, 0.0075, 0.003, 3, 0, 0.0152 - 0.0005 * k)) for k, (y, w) in enumerate([(0.052, 0.078), (0.066, 0.083), (0.080, 0.086), (0.094, 0.082)])], 'Y')
    for v in kp.verts:
        v.co += wr
    items.append((skin(kp, lambda p: {'hand.R': 1.0}), 'glove_hard'))
    st = loft([(y, rrect(0.0765, 0.0545, 0.016, 5, 0, -0.002)) for y in (-0.010, 0.014)], 'Y')
    for v in st.verts:
        v.co += wr
    items.append((skin(st, lambda p: chain_weights(p, hand_b, 0.03)), 'strap'))
    tab = box((0.020, 0.002, 0.0245), (0.030, 0.026, 0.004))
    for v in tab.verts:
        v.co += wr
    items.append((skin(tab, lambda p: {'hand.R': 1.0}), 'glove_hard'))
    for fn in FNAMES:
        pts = finger_chain(fn)
        bl = bone_list([f'{fn}_01.R', f'{fn}_02.R', f'{fn}_03.R'])
        rx, rz = (THUMB['rx'], THUMB['rz']) if fn == 'thumb' else (FINGERS[fn]['rx'], FINGERS[fn]['rz'])
        d0 = (pts[1] - pts[0]).normalized()
        path = [pts[0] - d0 * 0.012]
        rad = [(rx * 0.92, rz * 0.92)]
        for k in range(3):
            for j in range(4):
                s = j / 4
                path.append(pts[k] + (pts[k + 1] - pts[k]) * s)
                bulge = 1.0 + 0.07 * math.exp(-(s / 0.12) ** 2) * (1 if k > 0 else 0.4) + 0.05 * math.exp(-((s - 1.0) / 0.12) ** 2)
                taper = 1.0 - 0.10 * (k + s) / 3
                rad.append((rx * bulge * taper, rz * bulge * taper))
        dl = (pts[3] - pts[2]).normalized()
        path += [pts[3] - dl * 0.0035, pts[3] + dl * 0.0020]
        rad += [(rx * 0.72, rz * 0.74), (rx * 0.40, rz * 0.42)]
        items.append((skin(sweep(path, rad, 12), lambda p, bl=bl: chain_weights(p, bl, 0.010)), 'glove_fabric'))
        tip = sweep([pts[3] - dl * 0.012, pts[3] - dl * 0.004, pts[3] + dl * 0.0030], [(rx * 0.74, rz * 0.76), (rx * 0.72, rz * 0.74), (rx * 0.36, rz * 0.38)], 12)
        items.append((skin(tip, lambda p, bl=bl: {bl[2][0]: 1.0}), 'glove_leather'))
    return items


def strand_bm(rng, lanes=8):
    sh, el, wr = SHO, ELB, WRI
    bones = bone_list(['upper_arm.R', 'forearm.R'])
    verts, faces, uvs, wts, cols = [], [], [], [], []

    def card(p0, d0, w0, L, lane, stiff, segs=5):
        pts = [p0]
        d = d0.normalized()
        g = Vector((0, 0, -1))
        for k in range(segs):
            d = (d * (1 - stiff) + g * stiff).normalized()
            pts.append(pts[-1] + d * (L / segs))
        sv = d0.cross(Vector((0, 0, 1)))
        if sv.length < 0.25:
            sv = d0.cross(Vector((1, 0, 0)))
        sv.normalize()
        base = len(verts)
        ww = chain_weights(p0, bones, 0.06)
        tone = rng.uniform(0.82, 1.12)
        for k, p in enumerate(pts):
            t = k / segs
            wd = w0 * (1.0 - 0.5 * t * t) * 0.5
            verts.extend([p + sv * wd, p - sv * wd])
            uvs.extend([((lane + 0.05) / lanes, t), ((lane + 0.95) / lanes, t)])
            wts.extend([ww, ww])
            c = (0.28 + 0.72 * min(1.0, t / 0.5) ** 0.8) * tone
            cols.extend([c, c])
        for k in range(segs):
            a = base + 2 * k
            faces.append((a, a + 1, a + 3, a + 2))

    for (h, t, rad0, rad1, rows, around, lmin, lmax, s0, s1) in ((sh, el, 0.052, 0.048, 12, 20, 0.10, 0.22, 0.03, 0.97), (el, wr + Vector((0, 0.014, 0)), 0.047, 0.040, 22, 20, 0.07, 0.19, 0.04, 0.86)):
        ax = t - h
        for r in range(rows):
            s = s0 + (s1 - s0) * (r + rng.random() * 0.7) / rows
            c = h + ax * s
            rad = rad0 + (rad1 - rad0) * s
            for a in range(around):
                phi = 2 * math.pi * (a + rng.random() * 0.8) / around
                radial = Vector((math.cos(phi), 0, math.sin(phi))) if abs(ax.z) < abs(ax.y) else Vector((math.cos(phi), math.sin(phi), 0))
                if radial.z < -0.5 and rng.random() < 0.6:
                    continue
                p0 = c + radial * rad * 0.99
                back = -ax.normalized()
                d0 = radial * 0.7 + back * (0.3 + 0.5 * rng.random()) + Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(0.0, 0.25)))
                L = rng.uniform(lmin, lmax) * (0.55 + 0.45 * s if rad1 < 0.045 else 1.0)
                wdt = rng.uniform(0.011, 0.024)
                card(p0, d0, wdt, L, rng.randrange(lanes), rng.uniform(0.22, 0.45))
                if rng.random() < 0.5:
                    card(p0 + radial * 0.002, d0 + Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), 0)), wdt * 0.85, L * rng.uniform(0.7, 1.0), rng.randrange(lanes), rng.uniform(0.25, 0.5))
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    col = bm.loops.layers.float_color.new('Col')
    dl = bm.verts.layers.deform.verify()
    vs = [bm.verts.new(v) for v in verts]
    for v, w in zip(vs, wts):
        for nm, ww in w.items():
            v[dl][GROUPS.index(nm)] = ww
    for f in faces:
        try:
            fc = bm.faces.new([vs[i] for i in f])
        except ValueError:
            continue
        for l, i in zip(fc.loops, f):
            l[uvl].uv = uvs[i]
            l[col] = (cols[i], cols[i], cols[i], 1.0)
    return bm


def mirror_to_left(bm):
    dl = bm.verts.layers.deform.verify()
    remap = {GROUPS.index(n): GROUPS.index(n[:-2] + '.L') for n in GROUPS if n.endswith('.R')}
    for v in bm.verts:
        v.co.x = -v.co.x
        w = {remap.get(k, k): val for k, val in v[dl].items()}
        for k in list(v[dl].keys()):
            del v[dl][k]
        for k, val in w.items():
            v[dl][k] = val
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def arms_materials():
    material('sleeve', 'Fabric066', color=(1, 1, 1), rough=1.0, tile=0.14, val=1.0, tint=(0.30, 0.34, 0.20))
    material('strap', 'Fabric066', color=(1, 1, 1), rough=1.0, tile=0.08, val=1.0, tint=(0.18, 0.2, 0.12))
    material('glove_fabric', 'Fabric030', color=(1, 1, 1), rough=1.0, tile=0.09, val=1.0, tint=(0.07, 0.07, 0.075))
    material('glove_leather', 'Leather027', color=(1, 1, 1), rough=1.0, tile=0.08, val=1.0, tint=(0.08, 0.08, 0.085))
    material('glove_hard', 'Rubber004', color=(1, 1, 1), rough=1.0, tile=0.08, val=1.0, tint=(0.4, 0.4, 0.4))
    m = material('strands', 'strands_woodland', color=(1, 1, 1), rough=0.95, tile=0.12, val=1.0, alpha=True, arm=False)
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False


def build_arms(seed=7, strands=True):
    global GROUPS
    rig = bpy.data.objects.get('FPRig') or make_rig()
    purge('FPArms')
    GROUPS = [b.name for b in rig.data.bones if b.use_deform]
    arms_materials()
    mats = ['sleeve', 'strands', 'strap', 'glove_fabric', 'glove_leather', 'glove_hard']
    items = arm_items(random.Random(seed))
    if strands:
        items.append((strand_bm(random.Random(seed + 1)), 'strands'))
    out = bmesh.new()
    out.loops.layers.uv.new('UVMap')
    out.loops.layers.float_color.new('Col')
    out.verts.layers.deform.verify()
    parts = []
    for bm, mat in items:
        for f in bm.faces:
            f.material_index = mats.index(mat)
        cl = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')
        if mat != 'strands':
            for f in bm.faces:
                for l in f.loops:
                    l[cl] = (1.0, 1.0, 1.0, 1.0)
        parts.append(bm)
    for bm in parts:
        left = bm.copy()
        mirror_to_left(left)
        for b in (bm, left):
            me = bpy.data.meshes.new('tmp')
            b.to_mesh(me)
            b.free()
            out.from_mesh(me)
            bpy.data.meshes.remove(me)
    for v in out.verts:
        v.co = S2B @ v.co
    out.normal_update()
    uvl = out.loops.layers.uv.get('UVMap')
    for f in out.faces:
        m = mats[f.material_index]
        if m == 'strands':
            continue
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        t = TILES.get(m, 0.12)
        for l in f.loops:
            c = l.vert.co
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            l[uvl].uv = (c[a] / t, c[b] / t)
    for f in out.faces:
        f.smooth = True
    me = bpy.data.meshes.new('FPArms')
    out.to_mesh(me)
    out.free()
    ob = bpy.data.objects.new('FPArms', me)
    sc().collection.objects.link(ob)
    for g in GROUPS:
        ob.vertex_groups.new(name=g)
    for m in mats:
        me.materials.append(MATS[m])
    ob.parent = rig
    md = ob.modifiers.new('arm', 'ARMATURE')
    md.object = rig
    return ob
