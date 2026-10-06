exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_kit.py').read())

FACES = [
    ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1), 0),
    ((-1, 1, -1), (-1, -1, -1), (-1, -1, 1), (-1, 1, 1), 0),
    ((1, 1, -1), (-1, 1, -1), (-1, 1, 1), (1, 1, 1), 1),
    ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1), 1),
    ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1), 2),
    ((-1, 1, -1), (1, 1, -1), (1, -1, -1), (-1, -1, -1), 2),
]
UVAX = {0: (1, 2), 1: (0, 2), 2: (0, 1)}


def rot_euler(rx, ry, rz):
    return Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X')


class S:
    def __init__(self, name):
        self.name = name
        self.mat_list = []
        self.mat_tile = []
        self.idx = {}
        self.b = None
        self.cols = []

    def mat(self, key, material, tile=1.0):
        if key not in self.idx:
            self.idx[key] = len(self.mat_list)
            self.mat_list.append(material)
            self.mat_tile.append(tile)
        return key

    def mesh(self):
        if self.b is None:
            self.b = MeshB(self.name + '_lod0', self.mat_list)
        return self.b

    def box(self, c, size, m, rot=(0, 0, 0), uvo=(0, 0, 0), tile=None, faces=(0, 1, 2, 3, 4, 5)):
        b = self.mesh()
        mi = self.idx[m]
        tile = tile or self.mat_tile[mi]
        R = rot_euler(*rot)
        cc = Vector(c)
        aligned = not any(rot)
        for fi in faces:
            a, bb, cx, d, ax = FACES[fi]
            sgn = a[ax]
            n = R @ Vector([1 if ax == 0 else 0, 1 if ax == 1 else 0, 1 if ax == 2 else 0]) * sgn
            u, v = UVAX[ax]
            verts, uvs = [], []
            for corner in (a, bb, cx, d):
                loc = Vector((corner[0] * size[0] / 2, corner[1] * size[1] / 2, corner[2] * size[2] / 2))
                base = (cc + loc) if aligned else (loc + Vector(uvo))
                uvs.append((base[u] / tile, base[v] / tile))
                verts.append(b.vert(cc + R @ loc, n))
            b.face(verts, mi, uvs)

    def beam(self, p0, p1, w, h, m, tile=None):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        if d.length < 1e-4:
            return
        z = d.normalized()
        ref = Vector((0, 0, 1)) if abs(z.z) < 0.99 else Vector((1, 0, 0))
        x = ref.cross(z).normalized()
        y = z.cross(x)
        eul = Matrix((x, y, z)).transposed().to_euler()
        self.box((p0 + p1) / 2, (w, h, d.length), m, rot=tuple(eul), tile=tile)

    def col(self, c, size, rot=0.0):
        self.cols.append((tuple(c), tuple(size), rot))

    def poly(self, pts, m, hint=None, tile=None, smooth_n=None):
        b = self.mesh()
        mi = self.idx[m]
        tile = tile or self.mat_tile[mi]
        pts = [Vector(p) for p in pts]
        n = Vector((0, 0, 0))
        for i in range(len(pts)):
            a, c = pts[i], pts[(i + 1) % len(pts)]
            n += Vector(((a.y - c.y) * (a.z + c.z), (a.z - c.z) * (a.x + c.x), (a.x - c.x) * (a.y + c.y)))
        if n.length < 1e-9:
            return
        n.normalize()
        if hint is not None and n.dot(Vector(hint)) < 0:
            pts = pts[::-1]
            n = -n
        ax = max(range(3), key=lambda i: abs(n[i]))
        u, v = UVAX[ax]
        vs = [b.vert(p, smooth_n(p) if smooth_n else n) for p in pts]
        b.face(vs, mi, [(p[u] / tile, p[v] / tile) for p in pts])

    def prism(self, axis, pos, poly, thick, m, tile=None):
        def P(a, z, s):
            return Vector((pos + s, a, z)) if axis == 'x' else Vector((a, pos + s, z))
        lo = [P(a, z, -thick / 2) for a, z in poly]
        hi = [P(a, z, thick / 2) for a, z in poly]
        d = Vector((1, 0, 0)) if axis == 'x' else Vector((0, 1, 0))
        self.poly(lo, m, -d, tile)
        self.poly(hi, m, d, tile)
        cen = sum(lo + hi, Vector()) / (2 * len(lo))
        for i in range(len(poly)):
            j = (i + 1) % len(poly)
            q = [lo[i], lo[j], hi[j], hi[i]]
            self.poly(q, m, sum(q, Vector()) / 4 - cen, tile)

    def cyl(self, c, r0, r1, h, sides, m, tile=None, rot=(0, 0, 0), caps=(True, True), open_top=False):
        b = self.mesh()
        mi = self.idx[m]
        tile = tile or self.mat_tile[mi]
        R = rot_euler(*rot)
        cc = Vector(c)
        for i in range(sides):
            a0, a1 = 2 * math.pi * i / sides, 2 * math.pi * (i + 1) / sides
            pts = []
            for a, rr, z in ((a0, r0, -h / 2), (a1, r0, -h / 2), (a1, r1, h / 2), (a0, r1, h / 2)):
                pts.append(Vector((math.cos(a) * rr, math.sin(a) * rr, z)))
            ns = [Vector((math.cos(a), math.sin(a), (r0 - r1) / h * 0.5)).normalized() for a in (a0, a1, a1, a0)]
            vs = [b.vert(cc + R @ p, R @ n) for p, n in zip(pts, ns)]
            u0, u1 = i / sides * 2 * math.pi * r0 / tile, (i + 1) / sides * 2 * math.pi * r0 / tile
            b.face(vs, mi, [(u0, 0), (u1, 0), (u1, h / tile), (u0, h / tile)])
        for z, rr, cap, sgn in ((-h / 2, r0, caps[0], -1), (h / 2, r1, caps[1], 1)):
            if cap and rr > 1e-4:
                pts = [cc + R @ Vector((math.cos(2 * math.pi * i / sides) * rr, math.sin(2 * math.pi * i / sides) * rr, z)) for i in range(sides)]
                self.poly(pts, m, R @ Vector((0, 0, sgn)), tile)

    def wall(self, axis, fixed, a0, a1, z0, z1, t, m, openings=(), col=True, tile=None):
        cur = a0
        pieces = []
        for (cn, w, sill, h) in sorted(openings):
            o0, o1 = cn - w / 2, cn + w / 2
            if o0 > cur + 1e-3:
                pieces.append((cur, o0, z0, z1))
            if sill > 1e-3:
                pieces.append((o0, o1, z0, z0 + sill))
            if z0 + sill + h < z1 - 1e-3:
                pieces.append((o0, o1, z0 + sill + h, z1))
            cur = o1
        if a1 > cur + 1e-3:
            pieces.append((cur, a1, z0, z1))
        for (p0, p1, q0, q1) in pieces:
            la, lz = p1 - p0, q1 - q0
            if axis == 'x':
                c, s = ((p0 + p1) / 2, fixed, (q0 + q1) / 2), (la, t, lz)
            else:
                c, s = (fixed, (p0 + p1) / 2, (q0 + q1) / 2), (t, la, lz)
            self.box(c, s, m, tile=tile)
            if col:
                self.col(c, s)

    def _at(self, axis, fixed, a, z, dt=0.0):
        return (a, fixed + dt, z) if axis == 'x' else (fixed + dt, a, z)

    def _sz(self, axis, la, lz, th):
        return (la, th, lz) if axis == 'x' else (th, la, lz)

    def window(self, axis, fixed, cn, w, sill, h, t, frame, glass, z0=0.0, shutter=None):
        fw = 0.07
        zc = z0 + sill + h / 2
        at, sz = (lambda a, z, dt=0.0: self._at(axis, fixed, a, z, dt)), (lambda la, lz, th: self._sz(axis, la, lz, th))
        self.box(at(cn, zc), sz(w - 0.04, h - 0.04, 0.03), glass)
        for dz in (-h / 2 + fw / 2, h / 2 - fw / 2):
            self.box(at(cn, zc + dz), sz(w, fw, t * 0.5 + 0.06), frame)
        for da in (-w / 2 + fw / 2, w / 2 - fw / 2):
            self.box(at(cn + da, zc), sz(fw, h, t * 0.5 + 0.06), frame)
        self.box(at(cn, zc), sz(fw * 0.6, h, t * 0.5 + 0.04), frame)
        self.box(at(cn, z0 + sill - 0.04), sz(w + 0.2, 0.07, t + 0.14), frame)
        if shutter:
            for sgn in (-1, 1):
                self.box(at(cn + sgn * (w / 2 + 0.26), zc, -t / 2 - 0.03), sz(0.5, h, 0.04), shutter)

    def door(self, axis, fixed, cn, w, h, t, leaf, frame, z0=0.0):
        at, sz = (lambda a, z, dt=0.0: self._at(axis, fixed, a, z, dt)), (lambda la, lz, th: self._sz(axis, la, lz, th))
        fw = 0.08
        self.box(at(cn, z0 + h + fw / 2), sz(w + 2 * fw, fw, t + 0.06), frame)
        for da in (-w / 2 - fw / 2, w / 2 + fw / 2):
            self.box(at(cn + da, z0 + h / 2), sz(fw, h + fw, t + 0.06), frame)
        self.box(at(cn, z0 + h / 2), sz(w, h, 0.05), leaf)
        self.col(at(cn, z0 + h / 2), sz(w, h, t))

    def gable(self, axis, c0, c1, e0, e1, zeave, pitch, over, thick, m, tile=None, gable_mat=None, gable_t=0.3, col_roof=True):
        tn = math.tan(pitch)
        half = (e1 - e0) / 2
        mid = (e0 + e1) / 2
        run = half + over
        L = run / math.cos(pitch)
        length = c1 - c0 + 2 * over
        cc = (c0 + c1) / 2
        zc = zeave + (half - run / 2) * tn - thick * 0.5 * math.cos(pitch)
        for sgn in (-1, 1):
            across = mid + sgn * run / 2
            if axis == 'x':
                self.box((cc, across, zc), (length, L, thick), m, rot=(-sgn * pitch, 0, 0), tile=tile)
            else:
                self.box((across, cc, zc), (L, length, thick), m, rot=(0, sgn * pitch, 0), tile=tile)
        ridge_z = zeave + half * tn
        if axis == 'x':
            self.box((cc, mid, ridge_z + 0.02), (length + 0.1, 0.4, 0.14), m, tile=tile)
        else:
            self.box((mid, cc, ridge_z + 0.02), (0.4, length + 0.1, 0.14), m, tile=tile)
        if gable_mat:
            poly = [(e0, zeave), (e1, zeave), (mid, ridge_z)]
            for pos in (c0 + gable_t / 2, c1 - gable_t / 2):
                self.prism(axis, pos, poly, gable_t, gable_mat)

    def pyramid(self, c, w, d, h, m, tile=None):
        cx, cy, z = c
        base = [Vector((cx - w / 2, cy - d / 2, z)), Vector((cx + w / 2, cy - d / 2, z)), Vector((cx + w / 2, cy + d / 2, z)), Vector((cx - w / 2, cy + d / 2, z))]
        apex = Vector((cx, cy, z + h))
        cen = Vector((cx, cy, z + h / 3))
        for i in range(4):
            tri = [base[i], base[(i + 1) % 4], apex]
            self.poly(tri, m, sum(tri, Vector()) / 3 - cen, tile)

    def lumpy(self, c, size, m, rnd, rot=0.0, cuts=2, round_=0.55, tile=None, noise=0.04):
        b = self.mesh()
        mi = self.idx[m]
        tile = tile or self.mat_tile[mi]
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
        for v in bm.verts:
            p = v.co.copy()
            q = p.normalized() * 0.5
            v.co = p.lerp(q, round_)
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
            v.co += Vector((rnd.uniform(-noise, noise), rnd.uniform(-noise, noise), rnd.uniform(-noise, noise)))
        bm.normal_update()
        R = Matrix.Rotation(rot, 3, 'Z')
        cache = {}
        for f in bm.faces:
            vs = []
            for v in f.verts:
                if v.index not in cache:
                    cache[v.index] = b.vert(Vector(c) + R @ v.co, R @ v.normal)
                vs.append(b.vert(Vector(c) + R @ v.co, R @ v.normal))
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            u, w = UVAX[ax]
            b.face(vs, mi, [((Vector(c) + R @ v.co)[u] / tile, (Vector(c) + R @ v.co)[w] / tile) for v in f.verts])
        bm.free()

    def build(self):
        rt = root(self.name)
        o = self.mesh().build(rt)
        o.name = self.name + '_lod0'
        if self.cols:
            bm = bmesh.new()
            for (c, size, rot) in self.cols:
                tmp = bmesh.new()
                bmesh.ops.create_cube(tmp, size=1.0)
                R = Matrix.Rotation(rot, 3, 'Z')
                vs = [bm.verts.new(Vector(c) + R @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))) for v in tmp.verts]
                tmp.verts.ensure_lookup_table()
                for f in tmp.faces:
                    try:
                        bm.faces.new([vs[v.index] for v in f.verts])
                    except ValueError:
                        pass
                tmp.free()
            me = bpy.data.meshes.new('col_boxes')
            bm.to_mesh(me)
            bm.free()
            co = bpy.data.objects.new('col_boxes', me)
            bpy.context.scene.collection.objects.link(co)
            co.parent = rt
        return rt


def T(key, tex, tile, **kw):
    return material(key, tex=tex, **kw), tile
