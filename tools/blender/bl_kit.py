exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_common.py').read())

import numpy as np
import shutil
TEX = os.path.join(W, 'tex')
LEAF = os.path.join(W, 'leaf')
_mats = {}


def _img(path, srgb):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    return im


def _occ_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if not g:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def material(name, tex=None, diff=None, color=(1, 1, 1), rough=0.8, metal=0.0, alpha_img=None, tint=None, sat=None, val=None, arm=True):
    if name in _mats:
        return _mats[name]
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
    if tex or diff:
        d = nt.nodes.new('ShaderNodeTexImage')
        d.image = _img(diff or os.path.join(TEX, tex, 'diff.jpg'), True)
        last = d.outputs['Color']
        if sat is not None or val is not None:
            hs = nt.nodes.new('ShaderNodeHueSaturation')
            hs.inputs['Saturation'].default_value = sat if sat is not None else 1
            hs.inputs['Value'].default_value = val if val is not None else 1
            nt.links.new(last, hs.inputs['Color'])
            last = hs.outputs['Color']
        if tint is not None:
            mx = nt.nodes.new('ShaderNodeMix')
            mx.data_type = 'RGBA'
            mx.blend_type = 'MULTIPLY'
            mx.inputs['Factor'].default_value = 1.0
            mx.inputs['B'].default_value = (*tint, 1)
            nt.links.new(last, mx.inputs['A'])
            last = mx.outputs['Result']
        nt.links.new(last, bsdf.inputs['Base Color'])
        if alpha_img:
            nt.links.new(d.outputs['Alpha'], bsdf.inputs['Alpha'])
        if tex:
            p = os.path.join(TEX, tex)
            if os.path.exists(os.path.join(p, 'nor.jpg')):
                n = nt.nodes.new('ShaderNodeTexImage')
                n.image = _img(os.path.join(p, 'nor.jpg'), False)
                nm = nt.nodes.new('ShaderNodeNormalMap')
                nt.links.new(n.outputs['Color'], nm.inputs['Color'])
                nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
            if arm and os.path.exists(os.path.join(p, 'arm.jpg')):
                a = nt.nodes.new('ShaderNodeTexImage')
                a.image = _img(os.path.join(p, 'arm.jpg'), False)
                sp = nt.nodes.new('ShaderNodeSeparateColor')
                nt.links.new(a.outputs['Color'], sp.inputs['Color'])
                nt.links.new(sp.outputs['Green'], bsdf.inputs['Roughness'])
                nt.links.new(sp.outputs['Blue'], bsdf.inputs['Metallic'])
                grp = nt.nodes.new('ShaderNodeGroup')
                grp.node_tree = _occ_group()
                nt.links.new(sp.outputs['Red'], grp.inputs['Occlusion'])
    m.surface_render_method = 'BLENDED' if alpha_img else 'DITHERED'
    m.use_backface_culling = not alpha_img
    _mats[name] = m
    return m


def bake_tint(name, src, tint, sat=1.0, val=1.0):
    d = os.path.join(TEX, name)
    os.makedirs(d, exist_ok=True)
    im = bpy.data.images.load(os.path.join(TEX, src, 'diff.jpg'), check_existing=False)
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    a = a.reshape(h, w, 4)
    rgb = a[..., :3]
    lum = (rgb * np.array([0.2126, 0.7152, 0.0722])).sum(-1, keepdims=True)
    rgb = np.clip((lum + (rgb - lum) * sat) * np.array(tint) * val, 0, 1)
    a[..., :3] = rgb
    out = bpy.data.images.new('tint_tmp', w, h, alpha=False)
    out.pixels.foreach_set(a.reshape(-1))
    out.filepath_raw = os.path.join(d, 'diff.jpg')
    out.file_format = 'JPEG'
    out.save()
    bpy.data.images.remove(out)
    for f in ('nor.jpg', 'arm.jpg'):
        if os.path.exists(os.path.join(TEX, src, f)):
            shutil.copy(os.path.join(TEX, src, f), os.path.join(d, f))
    return name


class MeshB:
    def __init__(self, name, mats):
        self.name = name
        self.mats = mats
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.normals = {}

    def vert(self, co, n=None):
        v = self.bm.verts.new(co)
        if n is not None:
            self.normals[v.index if v.index >= 0 else len(self.bm.verts) - 1] = Vector(n).normalized()
        return v

    def face(self, vs, mat, uvs):
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = mat
        for l, uv in zip(f.loops, uvs):
            l[self.uv].uv = uv
        f.smooth = True
        return f

    def build(self, parent=None):
        self.bm.verts.ensure_lookup_table()
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        o = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(o)
        if self.normals and len(self.normals) == len(me.vertices):
            me.normals_split_custom_set_from_vertices([tuple(self.normals[i]) for i in range(len(me.vertices))])
        if parent:
            o.parent = parent
        return o


def tube(b, pts, radii, sides, mat, tile=1.5, circ_scale=1.0):
    pts = [Vector(p) for p in pts]
    rings = []
    t = (pts[1] - pts[0]).normalized()
    ref = Vector((0, 0, 1)) if abs(t.z) < 0.95 else Vector((1, 0, 0))
    u = t.cross(ref).normalized()
    dist = 0.0
    for i, p in enumerate(pts):
        if i + 1 < len(pts):
            tn = (pts[i + 1] - p).normalized()
        else:
            tn = (p - pts[i - 1]).normalized()
        if i > 0:
            dist += (p - pts[i - 1]).length
        u = (u - tn * u.dot(tn)).normalized()
        w = tn.cross(u)
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            d = u * math.cos(a) + w * math.sin(a)
            ring.append(b.vert(p + d * radii[i], d))
        rings.append((ring, dist))
    for i in range(len(rings) - 1):
        r0, d0 = rings[i]
        r1, d1 = rings[i + 1]
        for s in range(sides):
            s1 = (s + 1) % sides
            c = circ_scale * 2 * math.pi * radii[i] / tile
            u0, u1 = s / sides * c, (s + 1) / sides * c
            b.face([r0[s], r0[s1], r1[s1], r1[s]], mat, [(u0, d0 / tile), (u1, d0 / tile), (u1, d1 / tile), (u0, d1 / tile)])
    return rings


def card(b, center, right, up, w, h, mat, nrm=None, fold=0.18):
    c = Vector(center)
    r = Vector(right).normalized() * (w / 2)
    u = Vector(up).normalized() * (h / 2)
    f = (r.cross(u)).normalized() * (w * fold)
    pts = [c - r - u, c - u + f, c + r - u, c + r + u, c + u + f, c - r + u]
    n = Vector(nrm) if nrm is not None else (r.cross(u)).normalized()
    vs = [b.vert(p, n) for p in pts]
    b.face([vs[0], vs[1], vs[4], vs[5]], mat, [(0, 0), (0.5, 0), (0.5, 1), (0, 1)])
    b.face([vs[1], vs[2], vs[3], vs[4]], mat, [(0.5, 0), (1, 0), (1, 1), (0.5, 1)])


def box_col(name, center, size, parent):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0] + center[0], v.co.y * size[1] + center[1], v.co.z * size[2] + center[2]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    return o


def cyl_col(name, center, r, h, parent, sides=8):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r, radius2=r, depth=h)
    for v in bm.verts:
        v.co = v.co + Vector(center)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = parent
    return o


def root(name):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    bpy.context.scene.collection.objects.link(e)
    return e


def export_root(rt):
    d = os.path.join(EXP, rt.name)
    os.makedirs(d, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    rt.select_set(True)
    for c in rt.children_recursive:
        c.select_set(True)
    bpy.context.view_layer.objects.active = rt
    bpy.ops.export_scene.gltf(filepath=os.path.join(d, rt.name + '.gltf'), use_selection=True, export_format='GLTF_SEPARATE', export_apply=True, export_yup=True, export_image_format='AUTO', export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False)
    return d


def report(rt):
    tot = 0
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for c in rt.children_recursive:
        if c.type == 'MESH' and not c.name.startswith('col_'):
            tot += tris(c)
            a, b = dims(c)
            lo = Vector((min(lo.x, a.x), min(lo.y, a.y), min(lo.z, a.z)))
            hi = Vector((max(hi.x, b.x), max(hi.y, b.y), max(hi.z, b.z)))
    return {'tris': tot, 'size': [round(hi[i] - lo[i], 2) for i in range(3)], 'min': [round(lo[i], 2) for i in range(3)]}
