exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_r_common.py').read())
import bmesh

SPECIES = {'fine': 0, 'broad': 1, 'dry': 2, 'stalk': 3, 'head': 4, 'clover': 5, 'flower': 6, 'fstalk': 7}
TAU = math.pi * 2


class Tuft:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.col = self.bm.loops.layers.float_color.new('Col')
        self.nrm = []

    def vert(self, co, n):
        v = self.bm.verts.new(co)
        self.nrm.append(Vector(n).normalized())
        return v

    def face(self, vs, info):
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return
        f.smooth = True
        for loop, inf in zip(f.loops, info):
            loop[self.uv].uv = (inf[0], inf[1])
            loop[self.col] = inf[2]

    def build(self, parent):
        self.bm.verts.ensure_lookup_table()
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        me.normals_split_custom_set_from_vertices([tuple(n) for n in self.nrm])
        me.color_attributes.active_color = me.color_attributes['Col']
        me.color_attributes.render_color_index = 0
        o = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = parent
        return o


def rodrigues(v, axis, ang):
    return Matrix.Rotation(ang, 3, axis) @ v


def strip(T, base, az, height, w0, bend, lean, twist, nseg, species, rid, thr, keel, prof=None, bend_pow=1.3, widen=1.0):
    fwd = Vector((math.cos(az), math.sin(az), 0.0))
    side0 = Vector((-math.sin(az), math.cos(az), 0.0))
    pos = Vector(base)
    frames = []
    for k in range(nseg + 1):
        t = k / nseg
        theta = lean + bend * t ** bend_pow
        tan = Vector((fwd.x * math.sin(theta), fwd.y * math.sin(theta), math.cos(theta)))
        if k > 0:
            tm = (k - 0.5) / nseg
            thm = lean + bend * tm ** bend_pow
            pos = pos + Vector((fwd.x * math.sin(thm), fwd.y * math.sin(thm), math.cos(thm))) * (height / nseg)
        side = rodrigues(side0, tan, twist * t)
        nrm = tan.cross(side).normalized()
        frames.append((pos.copy(), tan, side, nrm, t))
    code = SPECIES[species] / 8.0
    rows = []
    for k, (p, tan, side, nrm, t) in enumerate(frames[:-1]):
        w = 0.5 * w0 * widen * (prof(t) if prof else (0.62 + 0.38 * min(1.0, t / 0.18)) * (1.0 - t ** 2.3) ** 0.75)
        sgl = math.atan2(-side.y, side.x) / math.pi * 0.5 + 0.5
        rows.append((p, side, nrm, w, t, sgl))
    tip_p, tip_tan, tip_side, tip_n, _ = frames[-1]
    vrows = []
    for p, side, nrm, w, t, sgl in rows:
        info = lambda sgn: ((sgn * w * 100.0), t, (rid, thr, code, sgl))
        if keel:
            vl = T.vert(p - side * w + nrm * w * 0.35, (nrm + side * 0.55))
            vm = T.vert(p, nrm)
            vr = T.vert(p + side * w + nrm * w * 0.35, (nrm - side * 0.55))
            vrows.append(((vl, info(-1)), (vm, info(0)), (vr, info(1))))
        else:
            vl = T.vert(p - side * w, nrm + side * 0.3)
            vr = T.vert(p + side * w, nrm - side * 0.3)
            vrows.append(((vl, info(-1)), (vr, info(1))))
    tip = T.vert(tip_p, tip_n)
    tinfo = (0.0, 1.0, (rid, thr, code, math.atan2(-tip_side.y, tip_side.x) / math.pi * 0.5 + 0.5))
    for a, b in zip(vrows[:-1], vrows[1:]):
        for i in range(len(a) - 1):
            T.face([a[i][0], a[i + 1][0], b[i + 1][0], b[i][0]], [a[i][1], a[i + 1][1], b[i + 1][1], b[i][1]])
    last = vrows[-1]
    for i in range(len(last) - 1):
        T.face([last[i][0], last[i + 1][0], tip], [last[i][1], last[i + 1][1], tinfo])
    return frames[-1][0], frames[-1][1], frames[-1][2], frames[-1][3]


def seed_head(T, p, tan, side, rid, thr, length, width):
    tipn = Vector((0, 0, 1))
    for k in range(2):
        s = rodrigues(side, tan, k * math.pi / 2)
        n = tan.cross(s).normalized()
        prof = [(0.0, 0.0), (0.18, 0.55), (0.5, 1.0), (0.82, 0.62), (1.0, 0.0)]
        vs = []
        for t, f in prof:
            c = p + tan * (length * t)
            w = width * f * 0.5
            code = SPECIES['head'] / 8.0
            sgl = math.atan2(-s.y, s.x) / math.pi * 0.5 + 0.5
            if f == 0.0:
                vs.append(((T.vert(c, n), (0.0, t, (rid, thr, code, sgl))),))
            else:
                vs.append(((T.vert(c - s * w, n + s * 0.4), (-w * 100, t, (rid, thr, code, sgl))), (T.vert(c + s * w, n - s * 0.4), (w * 100, t, (rid, thr, code, sgl)))))
        T.face([vs[0][0][0], vs[1][0][0], vs[1][1][0]], [vs[0][0][1], vs[1][0][1], vs[1][1][1]])
        for a, b in zip(vs[1:-2], vs[2:-1]):
            T.face([a[0][0], a[1][0], b[1][0], b[0][0]], [a[0][1], a[1][1], b[1][1], b[0][1]])
        T.face([vs[-2][0][0], vs[-2][1][0], vs[-1][0][0]], [vs[-2][0][1], vs[-2][1][1], vs[-1][0][1]])


def disc(T, c, tilt_n, radius, species, rid, thr, n=6, rot=0.0):
    n_v = Vector(tilt_n).normalized()
    ref = Vector((0, 0, 1)) if abs(n_v.z) < 0.95 else Vector((1, 0, 0))
    u = n_v.cross(ref).normalized()
    w = n_v.cross(u).normalized()
    code = SPECIES[species] / 8.0
    cv = T.vert(c, n_v)
    ring = []
    for i in range(n):
        a = rot + TAU * i / n
        d = u * math.cos(a) + w * math.sin(a)
        ring.append((T.vert(c + d * radius, n_v), d))
    for i in range(n):
        j = (i + 1) % n
        sg = lambda d: math.atan2(-d.y, d.x) / math.pi * 0.5 + 0.5
        T.face([cv, ring[i][0], ring[j][0]], [(0.0, 0.0, (rid, thr, code, sg(ring[i][1]))), (radius * 100, 1.0, (rid, thr, code, sg(ring[i][1]))), (radius * 100, 1.0, (rid, thr, code, sg(ring[j][1])))])


def build_tuft(name, cfg, seed):
    rnd = random.Random(seed)
    T = Tuft(name)
    tillers = []
    for i in range(cfg['tillers']):
        a = rnd.uniform(0, TAU)
        r = cfg['radius'] * math.sqrt(rnd.random()) * 0.8
        tillers.append((Vector((math.cos(a) * r, math.sin(a) * r, 0.0)), a))
    plan = []
    for species, n in cfg['blades']:
        plan += [species] * n
    rnd.shuffle(plan)
    for species in plan:
        c, ta = tillers[rnd.randrange(len(tillers))]
        off = rnd.uniform(0, 0.05) * cfg['radius'] / 0.2
        ao = rnd.uniform(0, TAU)
        base = c + Vector((math.cos(ao) * off, math.sin(ao) * off, 0.0))
        az = ta + rnd.gauss(0, 0.9)
        if cfg.get('uniform'):
            ur = cfg['radius'] * math.sqrt(rnd.random())
            base = Vector((math.cos(ao) * ur, math.sin(ao) * ur, 0.0))
            az = rnd.uniform(0, TAU)
        rid = rnd.random()
        thr = 0.0
        if species == 'fine':
            h, w, bend, lean = rnd.uniform(0.55, 1.0), 0.0058, math.radians(rnd.uniform(28, 78)), math.radians(rnd.uniform(3, 16))
        elif species == 'broad':
            h, w, bend, lean = rnd.uniform(0.4, 0.82), 0.0125, math.radians(rnd.uniform(40, 100)), math.radians(rnd.uniform(5, 20))
        elif species == 'dry':
            h, w, bend, lean = rnd.uniform(0.7, 1.05), 0.0054, math.radians(rnd.uniform(6, 40)), math.radians(rnd.uniform(2, 12))
        elif species == 'low':
            h, w, bend, lean = rnd.uniform(0.12, 0.32), 0.0052, math.radians(rnd.uniform(30, 90)), math.radians(rnd.uniform(5, 25))
        sp = 'fine' if species == 'low' else species
        if species == 'low':
            base = c + Vector((math.cos(ao) * off * 2.5, math.sin(ao) * off * 2.5, 0.0))
        strip(T, base, az, h, w * cfg['widen'], bend, lean, math.radians(rnd.uniform(-70, 70)), cfg['nseg'], sp, rid, thr, cfg['keel'], prof=cfg.get('prof'))
    for i in range(cfg.get('stalks', 0)):
        c, ta = tillers[rnd.randrange(len(tillers))]
        base = c + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), 0.0))
        rid = rnd.random()
        thr = rnd.uniform(0.0, 0.85)
        h = rnd.uniform(0.9, 1.2)
        tip, tan, side, nrm = strip(T, base, ta + rnd.gauss(0, 0.6), h, 0.0034, math.radians(rnd.uniform(4, 16)), math.radians(rnd.uniform(1, 8)), 0.0, 3, 'stalk', rid, thr, False, prof=lambda t: 1.0 - 0.3 * t, widen=1.0)
        seed_head(T, tip, tan, side, rid, thr, rnd.uniform(0.055, 0.09), 0.008)
    for i in range(cfg.get('clover', 0)):
        a = rnd.uniform(0, TAU)
        r = cfg['radius'] * math.sqrt(rnd.random()) * 0.9
        base = Vector((math.cos(a) * r, math.sin(a) * r, rnd.uniform(0.04, 0.1)))
        rid = rnd.random()
        thr = rnd.uniform(0.35, 0.9)
        for k in range(3):
            ang = a + TAU * k / 3 + rnd.uniform(-0.3, 0.3)
            d = Vector((math.cos(ang), math.sin(ang), 0.0))
            c = base + d * 0.026
            disc(T, c, Vector((d.x * 0.35, d.y * 0.35, 1.0)), 0.023, 'clover', rid, thr, 6, ang)
    for i in range(cfg.get('flowers', 0)):
        a = rnd.uniform(0, TAU)
        r = cfg['radius'] * math.sqrt(rnd.random()) * 0.9
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0.0))
        rid = rnd.random()
        thr = rnd.uniform(0.82, 0.98)
        tip, tan, side, nrm = strip(T, base, a, rnd.uniform(0.3, 0.7), 0.003, math.radians(rnd.uniform(8, 24)), math.radians(rnd.uniform(2, 8)), 0.0, 3, 'fstalk', rid, thr, False, prof=lambda t: 1.0)
        disc(T, tip + Vector((0, 0, 0.004)), Vector((tan.x * 0.5, tan.y * 0.5, 1.0)), rnd.uniform(0.013, 0.02), 'flower', rid, thr, 8, rnd.uniform(0, 1))
    return T


PLATEAU = lambda t: 1.0 - max(0.0, (t - 0.55) / 0.45) ** 1.5 * 0.85

TIERS = {
    'GrassTuft0': dict(radius=0.2, tillers=6, blades=[('fine', 21), ('broad', 6), ('dry', 4), ('low', 6)], stalks=2, clover=1, flowers=1, nseg=4, keel=True, widen=1.05),
    'GrassTuft1': dict(radius=0.6, tillers=7, blades=[('fine', 16), ('broad', 8), ('dry', 2), ('low', 9)], nseg=3, keel=False, widen=1.5, uniform=True, prof=PLATEAU),
    'GrassTuft2': dict(radius=1.1, tillers=6, blades=[('fine', 20), ('broad', 7), ('dry', 2), ('low', 8)], nseg=2, keel=False, widen=2.2, uniform=True, prof=PLATEAU),
    'GrassTuft3': dict(radius=2.0, tillers=6, blades=[('fine', 15), ('broad', 6), ('dry', 3), ('low', 6)], nseg=2, keel=False, widen=3.4, uniform=True, prof=PLATEAU),
    'GrassTuft4': dict(radius=3.6, tillers=6, blades=[('fine', 12), ('broad', 6), ('dry', 3), ('low', 5)], nseg=1, keel=False, widen=5.0, uniform=True),
    'GrassTuft5': dict(radius=7.0, tillers=6, blades=[('fine', 14), ('broad', 6), ('dry', 4)], nseg=1, keel=False, widen=5.0, uniform=True),
    'GrassTuft6': dict(radius=15.0, tillers=6, blades=[('fine', 16), ('broad', 6), ('dry', 4)], nseg=1, keel=False, widen=5.0, uniform=True)
}


def build_all():
    sc = scene_s2r()
    clear(sc)
    out = {}
    for i, (name, cfg) in enumerate(TIERS.items()):
        rt = bpy.data.objects.new(name, None)
        sc.collection.objects.link(rt)
        T = build_tuft(name + '_lod0', cfg, 11 + i)
        o = T.build(rt)
        mat = bpy.data.materials.get('Grass') or bpy.data.materials.new('Grass')
        mat.use_nodes = True
        mat.diffuse_color = (0.15, 0.3, 0.05, 1)
        o.data.materials.append(mat)
        lo, hi = bounds([o])
        out[name] = {'tris': tris([o]), 'verts': len(o.data.vertices), 'size': [round(x, 3) for x in (hi - lo)]}
    return out


def export_pack(names, subdir='r_exp'):
    import subprocess
    sc = bpy.context.scene
    done = {}
    for n in names:
        rt = bpy.data.objects[n]
        d = os.path.join(SCRATCH, subdir, n)
        os.makedirs(d, exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        rt.select_set(True)
        for c in rt.children_recursive:
            c.select_set(True)
        bpy.context.view_layer.objects.active = rt
        bpy.ops.export_scene.gltf(filepath=os.path.join(d, n + '.gltf'), use_selection=True, export_format='GLTF_SEPARATE', use_active_scene=True, export_apply=True, export_yup=True, export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True, export_cameras=False, export_lights=False, export_extras=False)
        r = subprocess.run([os.path.join(GAME, 'tools', 'gltfpack.exe'), '-i', os.path.join(d, n + '.gltf'), '-o', os.path.join(EXPORT, n + '.glb'), '-cc', '-kn', '-km', '-kv', '-vtf', '-vp', '16'], capture_output=True, text=True)
        done[n] = (r.stdout + r.stderr).strip()[-160:]
    return done
