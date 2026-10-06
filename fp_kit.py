import bpy, bmesh, math, os, json, random
from mathutils import Vector, Matrix, Quaternion, Euler

W = os.environ.get('GHILLIE_FP', os.path.join(os.environ.get('TEMP', '.'), 'ghillie_fp'))
TEX = os.path.join(W, 'tex')
EXP = os.path.join(W, 'exp')
PREV = os.path.join(W, 'prev')
MODELS = r'C:\Users\Leschke\Downloads\Models\GhillieOps'
for _d in (TEX, EXP, PREV):
    os.makedirs(_d, exist_ok=True)

VCOL = True
S2B = Matrix.Rotation(math.pi, 4, 'Z')
S2Bi = S2B.inverted()
BASE_BEVEL = 0.004
SHARP = math.radians(24)
SMOOTH = math.radians(34)


def B(v):
    return S2B @ Vector(v)


def BM(m):
    return S2B @ m @ S2Bi


def sc():
    s = bpy.data.scenes.get('GhillieFP') or bpy.data.scenes.new('GhillieFP')
    for w in bpy.context.window_manager.windows:
        if w.scene != s:
            w.scene = s
    return s


def purge(prefix):
    s = sc()
    for o in [o for o in bpy.data.objects if o.name.startswith(prefix)]:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [m for m in bpy.data.meshes if m.name.startswith(prefix) and m.users == 0]:
        bpy.data.meshes.remove(m)


_img = {}


def _image(path, srgb):
    k = (path, srgb)
    if k not in _img:
        im = bpy.data.images.load(path, check_existing=True)
        im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
        _img[k] = im
    return _img[k]


def _occ_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if not g:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


MATS = {}
TILES = {}


def material(key, tex=None, color=(1, 1, 1), rough=0.6, metal=0.0, tile=0.12, tint=None, val=1.0, alpha=None, emit=None, emit_strength=0.0, arm=True, sheen=None, coat=None):
    name = 'M_' + key
    if name in bpy.data.materials:
        m = bpy.data.materials[name]
        MATS[key] = m
        TILES[key] = tile
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if tex:
        p = os.path.join(TEX, tex)
        d = nt.nodes.new('ShaderNodeTexImage')
        d.image = _image(os.path.join(p, 'diff.png') if os.path.exists(os.path.join(p, 'diff.png')) else os.path.join(p, 'diff.jpg'), True)
        last = d.outputs['Color']
        if tint is not None or val != 1.0:
            mx = nt.nodes.new('ShaderNodeMix')
            mx.data_type = 'RGBA'
            mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = 1.0
            t = tint if tint is not None else (1, 1, 1)
            mx.inputs['B'].default_value = (t[0] * val, t[1] * val, t[2] * val, 1)
            nt.links.new(last, mx.inputs['A'])
            last = mx.outputs['Result']
        nt.links.new(last, bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(d.outputs['Alpha'], bsdf.inputs['Alpha'])
        if os.path.exists(os.path.join(p, 'nor.jpg')):
            n = nt.nodes.new('ShaderNodeTexImage')
            n.image = _image(os.path.join(p, 'nor.jpg'), False)
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(n.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        if arm and os.path.exists(os.path.join(p, 'arm.jpg')):
            a = nt.nodes.new('ShaderNodeTexImage')
            a.image = _image(os.path.join(p, 'arm.jpg'), False)
            sp = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(a.outputs['Color'], sp.inputs['Color'])
            if rough is not None:
                rm = nt.nodes.new('ShaderNodeMath')
                rm.operation = 'MULTIPLY'
                rm.inputs[1].default_value = rough
                nt.links.new(sp.outputs['Green'], rm.inputs[0])
                nt.links.new(rm.outputs['Value'], bsdf.inputs['Roughness'])
            if metal > 0.5:
                nt.links.new(sp.outputs['Blue'], bsdf.inputs['Metallic'])
            grp = nt.nodes.new('ShaderNodeGroup')
            grp.node_tree = _occ_group()
            nt.links.new(sp.outputs['Red'], grp.inputs['Occlusion'])
    m.surface_render_method = 'DITHERED'
    m.use_backface_culling = True
    MATS[key] = m
    TILES[key] = tile
    return m


def std_materials():
    material('steel', 'Metal038', color=(1, 1, 1), rough=1.0, metal=1.0, tile=0.16, val=0.36)
    material('steel_dark', 'Metal038', color=(1, 1, 1), rough=1.0, metal=0.7, tile=0.2, val=0.13)
    material('blued', 'Metal029', color=(1, 1, 1), rough=1.0, metal=1.0, tile=0.16, val=1.0)
    material('anodized', 'Metal061B', color=(1, 1, 1), rough=1.0, metal=0.5, tile=0.24, val=0.16)
    material('alu_dark', 'Metal061B', color=(1, 1, 1), rough=1.0, metal=0.5, tile=0.24, val=0.10, tint=(0.96, 0.96, 0.98))
    material('stainless', 'Metal055A', color=(1, 1, 1), rough=1.0, metal=1.0, tile=0.16, val=0.55)
    material('brass', 'Metal042A', color=(1, 1, 1), rough=1.0, metal=1.0, tile=0.1, val=1.0)
    material('polymer', 'Plastic012A', color=(1, 1, 1), rough=1.0, tile=0.09, val=0.6)
    material('polymer_fde', 'Plastic012A', color=(1, 1, 1), rough=1.0, tile=0.09, val=1.0, tint=(0.62, 0.5, 0.34))
    material('polymer_smooth', 'Plastic011', color=(1, 1, 1), rough=1.0, tile=0.1, val=0.55)
    material('rubber', 'Rubber004', color=(1, 1, 1), rough=1.0, tile=0.1, val=0.75)
    material('wood', 'Wood066', color=(1, 1, 1), rough=1.0, tile=0.28, val=0.75)
    material('leather', 'Leather027', color=(1, 1, 1), rough=1.0, tile=0.12, val=0.9)
    material('lens', None, color=(0.02, 0.05, 0.06), rough=0.04, metal=0.0)
    material('lens_coat', None, color=(0.025, 0.03, 0.045), rough=0.03, metal=0.0)
    material('reticle', None, color=(1, 0.05, 0.02), rough=0.5, emit=(1, 0.04, 0.02), emit_strength=18.0)
    material('tritium', None, color=(0.5, 0.9, 0.2), rough=0.5, emit=(0.3, 0.9, 0.1), emit_strength=2.0)
    material('white_paint', None, color=(0.85, 0.85, 0.82), rough=0.55)
    material('red_paint', None, color=(0.5, 0.04, 0.03), rough=0.5)
    material('olive', 'Fabric066', color=(1, 1, 1), rough=1.0, tile=0.12, val=0.38, tint=(0.8, 0.9, 0.55))
    material('od_steel', 'Metal038', color=(0.30, 0.34, 0.2), rough=1.0, metal=0.85, tile=0.12, val=0.7)
    material('foam', None, color=(0.015, 0.015, 0.016), rough=0.9)
    material('yellow_paint', None, color=(0.62, 0.50, 0.06), rough=0.55)
    material('bandage', 'Fabric081C', color=(1, 1, 1), rough=1.0, tile=0.08, val=0.78, tint=(0.95, 0.92, 0.84))


class G:
    def __init__(self, name):
        self.name = name
        self.groups = {}
        self.sockets = {}
        self.objs = {}
        self.root = None
        self.pivots = {}

    def add(self, bm, mat, group='body', bevel=0.0012, sharp=SHARP, flat=False):
        g = self.groups.setdefault(group, {'bm': bmesh.new(), 'mats': []})
        if mat not in g['mats']:
            g['mats'].append(mat)
        mi = g['mats'].index(mat)
        out = g['bm']
        bw = out.edges.layers.float.get('bevel_weight_edge') or out.edges.layers.float.new('bevel_weight_edge')
        uv = out.loops.layers.uv.get('UVMap') or out.loops.layers.uv.new('UVMap')
        w = min(1.0, bevel / BASE_BEVEL) if bevel > 0 else 0.0
        if bm.edges.layers.float.get('bevel_weight_edge') is None:
            bm.edges.layers.float.new('bevel_weight_edge')
        sbw = bm.edges.layers.float.get('bevel_weight_edge')
        if bm.loops.layers.uv.get('UVMap') is None:
            bm.loops.layers.uv.new('UVMap')
        for e in bm.edges:
            if flat:
                e[sbw] = 0.0
            elif len(e.link_faces) == 2 and e.calc_face_angle(0.0) > sharp:
                e[sbw] = w
            elif len(e.link_faces) == 1:
                e[sbw] = w
            else:
                e[sbw] = 0.0
        for f in bm.faces:
            f.material_index = mi
        me = bpy.data.meshes.new('tmp')
        bm.to_mesh(me)
        bm.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)

    def socket(self, name, loc, rot=None, size=0.02):
        e = bpy.data.objects.new(f'{self.name}__{name}', None)
        e.empty_display_type = 'ARROWS'
        e.empty_display_size = size
        sc().collection.objects.link(e)
        m = Matrix.Translation(loc) @ (rot.to_4x4() if rot is not None else Matrix.Identity(4))
        e.matrix_world = S2B @ m
        self.sockets[name] = e
        return e

    def build_group(self, group, bevel_segments=2, smooth=SMOOTH):
        g = self.groups[group]
        bm = g['bm']
        me = bpy.data.meshes.new(f'{self.name}__{group}')
        for v in bm.verts:
            v.co = S2B @ v.co
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        for k in g['mats']:
            me.materials.append(MATS[k])
        ob = bpy.data.objects.new(f'{self.name}__{group}', me)
        sc().collection.objects.link(ob)
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.limit_method = 'WEIGHT'
        m.width = BASE_BEVEL
        m.segments = bevel_segments
        m.profile = 0.6
        m.use_clamp_overlap = True
        m.harden_normals = False
        m.offset_type = 'OFFSET'
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        me2 = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
        me2.name = ob.name
        ob.modifiers.clear()
        old = ob.data
        ob.data = me2
        bpy.data.meshes.remove(old)
        bm2 = bmesh.new()
        bm2.from_mesh(me2)
        uvl = bm2.loops.layers.uv.get('UVMap') or bm2.loops.layers.uv.new('UVMap')
        mats = g['mats']
        for f in bm2.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            t = TILES.get(mats[f.material_index], 0.12)
            for l in f.loops:
                c = l.vert.co
                a, b = [(1, 2), (0, 2), (0, 1)][ax]
                l[uvl].uv = (c[a] / t, c[b] / t)
        for f in bm2.faces:
            f.smooth = True
        for e in bm2.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > smooth:
                e.smooth = False
        bm2.to_mesh(me2)
        bm2.free()
        if group in self.pivots:
            p = S2B @ Vector(self.pivots[group])
            for v in me2.vertices:
                v.co -= p
            ob.location = p
        self.objs[group] = ob
        return ob

    def finish(self, groups=None, bevel_segments=2):
        names = list(self.groups.keys())
        for gname in names:
            self.build_group(gname, bevel_segments)
        self.groups = {}
        return self.objs


def _bm_from(verts, faces):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def box(c, s, taper=None):
    cx, cy, cz = c
    sx, sy, sz = s
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((cx + v.co.x * sx, cy + v.co.y * sy, cz + v.co.z * sz))
    return bm


def extrude(pts, plane, lo, hi):
    n = len(pts)
    verts = []
    for p in pts:
        a, b = p
        verts.append({'YZ': (lo, a, b), 'XZ': (a, lo, b), 'XY': (a, b, lo)}[plane])
    for p in pts:
        a, b = p
        verts.append({'YZ': (hi, a, b), 'XZ': (a, hi, b), 'XY': (a, b, hi)}[plane])
    faces = [list(range(n)), list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    return _bm_from(verts, faces)


def loft(secs, axis='Y', caps=True):
    verts = []
    faces = []
    k = len(secs[0][1])
    for pos, poly in secs:
        for a, b in poly:
            verts.append({'Y': (a, pos, b), 'X': (pos, a, b), 'Z': (a, b, pos)}[axis])
    for i in range(len(secs) - 1):
        for j in range(k):
            jn = (j + 1) % k
            faces.append([i * k + j, i * k + jn, (i + 1) * k + jn, (i + 1) * k + j])
    if caps:
        faces.append(list(range(k)))
        faces.append(list(range((len(secs) - 1) * k, len(secs) * k)))
    return _bm_from(verts, faces)


def rrect(w, h, r, n=3, cx=0.0, cz=0.0):
    r = min(r, w / 2 - 1e-5, h / 2 - 1e-5)
    pts = []
    for (sx, sz, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ccx = cx + sx * (w / 2 - r)
        ccz = cz + sz * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((ccx + r * math.cos(a), ccz + r * math.sin(a)))
    return pts


def cyl(axis, c, r, length, segs=20, r2=None, caps=True):
    r2 = r if r2 is None else r2
    sec = [(-length / 2, [(r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs)) for i in range(segs)]), (length / 2, [(r2 * math.cos(2 * math.pi * i / segs), r2 * math.sin(2 * math.pi * i / segs)) for i in range(segs)])]
    bm = loft(sec, axis, caps)
    for v in bm.verts:
        v.co += Vector(c)
    return bm


def lathe(pairs, axis='Y', c=(0, 0, 0), segs=24, closed=False):
    verts = []
    faces = []
    rings = []
    for pos, r in pairs:
        if r < 1e-6:
            idx = len(verts)
            verts.append({'Y': (0, pos, 0), 'X': (pos, 0, 0), 'Z': (0, 0, pos)}[axis])
            rings.append((idx, 1))
        else:
            idx = len(verts)
            for i in range(segs):
                a = 2 * math.pi * i / segs
                p = (r * math.cos(a), r * math.sin(a))
                verts.append({'Y': (p[0], pos, p[1]), 'X': (pos, p[0], p[1]), 'Z': (p[0], p[1], pos)}[axis])
            rings.append((idx, segs))
    cnt = len(rings)
    pairs_idx = [(i, i + 1) for i in range(cnt - 1)]
    if closed:
        pairs_idx.append((cnt - 1, 0))
    for i, j in pairs_idx:
        a, na = rings[i]
        b, nb = rings[j]
        if na == 1 and nb == 1:
            continue
        for k in range(segs):
            kn = (k + 1) % segs
            if na == 1:
                faces.append([a, b + kn, b + k])
            elif nb == 1:
                faces.append([a + k, a + kn, b])
            else:
                faces.append([a + k, a + kn, b + kn, b + k])
    bm = _bm_from(verts, faces)
    for v in bm.verts:
        v.co += Vector(c)
    return bm


def xf(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), pivot=(0, 0, 0)):
    m = Matrix.Translation(loc) @ Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    pv = Vector(pivot)
    for v in bm.verts:
        v.co = m @ (v.co - pv) + pv
    return bm


def merge(*bms):
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
        b.free()
    return out


def cut(bm, *cutters):
    me = bpy.data.meshes.new('cutbase')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('cutbase', me)
    sc().collection.objects.link(ob)
    tmp = []
    for c in cutters:
        cme = bpy.data.meshes.new('cutter')
        c.to_mesh(cme)
        c.free()
        co = bpy.data.objects.new('cutter', cme)
        sc().collection.objects.link(co)
        tmp.append(co)
        m = ob.modifiers.new('bool', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = co
        m.solver = 'EXACT'
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me2 = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
    res = bmesh.new()
    res.from_mesh(me2)
    bpy.data.meshes.remove(me2)
    for o in tmp + [ob]:
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(d)
    return res


def sweep(path, radii, segs=12, flat=1.0, caps=True):
    pts = [Vector(p) for p in path]
    secs = []
    t0 = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t0.z) < 0.9 else Vector((1, 0, 0))
    u = t0.cross(ref).normalized()
    rings = []
    for i, p in enumerate(pts):
        tn = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = (u - tn * u.dot(tn)).normalized()
        w = tn.cross(u)
        r = radii[i] if not isinstance(radii[i], tuple) else radii[i][0]
        r2 = radii[i] if not isinstance(radii[i], tuple) else radii[i][1]
        ring = [p + u * (r * math.cos(2 * math.pi * k / segs)) + w * (r2 * flat * math.sin(2 * math.pi * k / segs)) for k in range(segs)]
        rings.append(ring)
    verts = [v for ring in rings for v in ring]
    faces = []
    for i in range(len(rings) - 1):
        for k in range(segs):
            kn = (k + 1) % segs
            faces.append([i * segs + k, i * segs + kn, (i + 1) * segs + kn, (i + 1) * segs + k])
    if caps:
        faces.append(list(range(segs)))
        faces.append(list(range((len(rings) - 1) * segs, len(rings) * segs)))
    return _bm_from(verts, faces)


def lights_and_world(strength=0.55):
    s = sc()
    if not s.world:
        s.world = bpy.data.worlds.new('fpw')
    w = s.world
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    gr = nt.nodes.new('ShaderNodeTexGradient')
    gr.gradient_type = 'LINEAR'
    mp = nt.nodes.new('ShaderNodeMapping')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.18, 0.2, 0.22, 1)
    ramp.color_ramp.elements[1].color = (0.75, 0.85, 1.0, 1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.65
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    nt.links.new(gr.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    for o in [o for o in bpy.data.objects if o.name.startswith('LIGHT_')]:
        bpy.data.objects.remove(o, do_unlink=True)
    for name, loc, energy, kind in (('LIGHT_key', B((1.0, 1.0, 1.2)), 60, 'AREA'), ('LIGHT_fill', B((-1.2, 0.4, 0.5)), 20, 'AREA'), ('LIGHT_rim', B((0.0, -1.4, 1.0)), 40, 'AREA')):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.size = 0.8
        lo = bpy.data.objects.new(name, ld)
        s.collection.objects.link(lo)
        lo.location = loc
        d = Vector((0, 0, 0.1)) - Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def shot(path, cam_loc, target, res=(1400, 900), lens=50, hide=None, engine='BLENDER_EEVEE', samples=24, up=(0, 0, 1)):
    s = sc()
    s.render.engine = engine
    s.render.resolution_x, s.render.resolution_y = res
    s.render.image_settings.file_format = 'PNG'
    s.render.filepath = path
    s.view_settings.view_transform = 'AgX'
    s.render.film_transparent = False
    if engine == 'BLENDER_EEVEE':
        s.eevee.taa_render_samples = samples
    cam = bpy.data.objects.get('SHOTCAM')
    if not cam:
        cam = bpy.data.objects.new('SHOTCAM', bpy.data.cameras.new('SHOTCAM'))
        s.collection.objects.link(cam)
    cam.data.lens = lens
    cam.data.clip_start = 0.01
    cam.data.clip_end = 50
    cl, tg = B(cam_loc), B(target)
    cam.location = cl
    f = (tg - cl).normalized()
    r = f.cross(B(up)).normalized()
    u = r.cross(f)
    cam.matrix_world = Matrix([[r.x, u.x, -f.x, cl.x], [r.y, u.y, -f.y, cl.y], [r.z, u.z, -f.z, cl.z], [0, 0, 0, 1]])
    s.camera = cam
    bpy.ops.render.render(write_still=True)
    return path


def tri_count(objs):
    t = 0
    for o in objs:
        if o.type == 'MESH':
            t += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return t


def assemble(g, origin_S):
    off = S2B @ Vector(origin_S)
    root = bpy.data.objects.new(g.name, None)
    root.empty_display_type = 'PLAIN_AXES'
    sc().collection.objects.link(root)
    for o in list(g.objs.values()) + list(g.sockets.values()):
        o.parent = root
        o.location = o.location - off
    g.root = root
    if VCOL:
        bake_vcol(g)
    return root


def zmin_S(g):
    z = 1e9
    for o in g.objs.values():
        for v in o.data.vertices:
            z = min(z, (o.matrix_world @ v.co).z)
    return z


def show_only(prefix):
    for o in bpy.data.objects:
        match = o.name == prefix or o.name.startswith(prefix + '__')
        if o.name.startswith('Wpn'):
            hide = not match
        elif o.name.startswith('FP'):
            hide = prefix.startswith('FP') and not match
        else:
            continue
        o.hide_viewport = hide
        o.hide_render = hide


def bbox_S(prefix):
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in bpy.data.objects:
        if o.type == 'MESH' and (o.name == prefix or o.name.startswith(prefix + '__')) and not o.hide_render:
            for v in o.data.vertices:
                w = S2Bi @ (o.matrix_world @ v.co)
                for i in range(3):
                    lo[i] = min(lo[i], w[i])
                    hi[i] = max(hi[i], w[i])
    return lo, hi


VIEWS = {'side': (1, 0, 0.15), 'left': (-1, 0, 0.15), 'three': (0.8, 0.9, 0.55), 'threeb': (0.8, -0.9, 0.5), 'top': (0, 0.001, 1), 'front': (0, 1, 0.1), 'rear': (0, -1, 0.1), 'under': (0.5, 0.2, -1)}


def look(prefix, name, view='side', res=(1400, 800), dist=1.0, lens=60, center=None):
    lo, hi = bbox_S(prefix)
    c = (lo + hi) / 2 if center is None else Vector(center)
    size = max((hi - lo).length, 0.05)
    d = Vector(VIEWS[view]).normalized() * size * dist * (lens / 36.0) * 0.62
    return shot(os.path.join(PREV, name + '.png'), tuple(c + d), tuple(c), res, lens)


def bake_vcol(g, rays=14, dist=0.035, small=0.022, thin=0.0016):
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    verts, tris, spans = [], [], []
    for o in g.objs.values():
        mw = o.matrix_world
        base = len(verts)
        me = o.data
        verts.extend(mw @ v.co for v in me.vertices)
        me.calc_loop_triangles()
        tris.extend((base + t.vertices[0], base + t.vertices[1], base + t.vertices[2]) for t in me.loop_triangles)
    tree = BVHTree.FromPolygons(verts, tris)
    dirs = []
    for i in range(rays):
        u = (i + 0.5) / rays
        r = math.sqrt(u)
        a = i * 2.399963
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(1 - u))))
    for o in g.objs.values():
        me = o.data
        mw = o.matrix_world
        rot = mw.to_3x3()
        nl = len(me.loops)
        ao_v = {}
        out = [1.0, 1.0, 1.0, 0.0] * nl
        normals = me.corner_normals
        for poly in me.polygons:
            ext = max((me.vertices[me.loops[li].vertex_index].co - me.vertices[me.loops[poly.loop_start].vertex_index].co).length for li in poly.loop_indices)
            width = 2.0 * poly.area / max(1e-9, sum((me.vertices[me.loops[li].vertex_index].co - me.vertices[me.loops[poly.loop_start + (k + 1) % poly.loop_total].vertex_index].co).length for k, li in enumerate(poly.loop_indices)))
            wear = 1.0 if width < thin else 0.0
            is_small = ext < small
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                ao = 1.0
                if is_small:
                    if (vi, li) not in ao_v:
                        n = (rot @ normals[li].vector).normalized()
                        p = mw @ me.vertices[vi].co + n * 0.0004
                        t = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized()
                        b = n.cross(t)
                        hit = 0
                        for d in dirs:
                            w = t * d.x + b * d.y + n * d.z
                            if tree.ray_cast(p, w, dist)[0] is not None:
                                hit += 1
                        ao_v[(vi, li)] = 1.0 - 0.82 * hit / rays
                    ao = ao_v[(vi, li)]
                pos = me.vertices[vi].co
                nz = (math.sin(pos.x * 913.7 + pos.y * 477.3 + pos.z * 1131.1) * 43758.5453) % 1.0
                k4 = li * 4
                out[k4] = out[k4 + 1] = out[k4 + 2] = ao
                out[k4 + 3] = wear * (0.30 + 0.70 * nz)
        while me.color_attributes.get('Col'):
            me.color_attributes.remove(me.color_attributes['Col'])
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        ca.data.foreach_set('color', out)
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = list(me.color_attributes).index(ca)
