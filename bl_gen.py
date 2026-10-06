exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_mats.py').read())


def noise2(size, cells, seed):
    rnd = np.random.RandomState(seed)
    g = rnd.rand(cells, cells).astype(np.float32)
    u = np.linspace(0, cells, size, endpoint=False)
    i = np.floor(u).astype(int)
    f = u - i
    f = f * f * (3 - 2 * f)
    i1 = (i + 1) % cells
    a = g[np.ix_(i, i)] * (1 - f)[:, None] * (1 - f)[None, :]
    b = g[np.ix_(i, i1)] * (1 - f)[:, None] * f[None, :]
    c = g[np.ix_(i1, i)] * f[:, None] * (1 - f)[None, :]
    d = g[np.ix_(i1, i1)] * f[:, None] * f[None, :]
    return a + b + c + d


def fbm2(size, cells, seed, octaves=4):
    t, a, n = 0, 1.0, 0
    for o in range(octaves):
        t = t + noise2(size, cells * 2 ** o, seed + o * 11) * a
        n += a
        a *= 0.5
    return t / n


def save_jpg(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new('gen_tmp', w, h, alpha=False)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :3] = np.clip(arr[..., :3], 0, 1)
    im.pixels.foreach_set(rgba.reshape(-1))
    im.filepath_raw = path
    im.file_format = 'JPEG'
    im.save()
    bpy.data.images.remove(im)


def save_png_rgba(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new('gen_tmp', w, h, alpha=True)
    im.alpha_mode = 'STRAIGHT'
    im.pixels.foreach_set(np.clip(arr, 0, 1).reshape(-1))
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)


def normal_from_height(h, strength):
    gy, gx = np.gradient(h)
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def gen_set(name, diff, nor, arm=None):
    d = os.path.join(TEX, name)
    os.makedirs(d, exist_ok=True)
    save_jpg(diff, os.path.join(d, 'diff.jpg'))
    save_jpg(nor, os.path.join(d, 'nor.jpg'))
    if arm is not None:
        save_jpg(arm, os.path.join(d, 'arm.jpg'))


def hesco_texture():
    size, cells = 512, 4
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    fu, fv = (x * cells) % 1.0, (y * cells) % 1.0
    pillow = (np.sin(np.pi * fu) * np.sin(np.pi * fv)) ** 0.6
    wire = np.clip(1.0 - np.minimum(np.minimum(fu, 1 - fu), np.minimum(fv, 1 - fv)) * cells * size / 7.0, 0, 1)
    weave = fbm2(size, 64, 5, 3)
    fabric = np.array([0.58, 0.52, 0.38]) * (0.86 + 0.22 * weave[..., None]) * (0.82 + 0.18 * pillow[..., None])
    dirt = fbm2(size, 6, 9, 4)
    fabric *= (0.8 + 0.3 * dirt[..., None])
    col = fabric * (1 - wire[..., None]) + np.array([0.12, 0.12, 0.12]) * wire[..., None]
    h = pillow * 0.9 - wire * 0.5 + weave * 0.05
    nor = normal_from_height(h, 9.0)
    arm = np.stack([np.ones_like(h), 0.85 - 0.3 * wire, wire * 0.8], -1)
    gen_set('gen_hesco', col, nor, arm)


def camo_texture():
    size = 1024
    a = fbm2(size, 8, 21, 4)
    b = fbm2(size, 12, 33, 4)
    c = fbm2(size, 20, 47, 5)
    base = np.array([0.22, 0.27, 0.12])
    col = np.broadcast_to(base, (size, size, 3)).copy()
    col = np.where((a > 0.52)[..., None], np.array([0.12, 0.16, 0.07]), col)
    col = np.where((b > 0.58)[..., None], np.array([0.27, 0.22, 0.11]), col)
    col = np.where((c > 0.66)[..., None], np.array([0.06, 0.08, 0.04]), col)
    col = col * (0.85 + 0.3 * fbm2(size, 80, 7, 2)[..., None])
    holes = fbm2(size, 40, 61, 3)
    alpha = np.clip((holes - 0.34) * 12, 0, 1)
    rgba = np.concatenate([col, alpha[..., None]], -1).astype(np.float32)
    save_png_rgba(rgba, os.path.join(TEX, 'camo.png'))


def canvas_texture():
    size = 512
    weave = fbm2(size, 128, 3, 2)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    thread = 0.5 + 0.5 * np.sin(x * 2 * np.pi / 4) * np.sin(y * 2 * np.pi / 4)
    stain = fbm2(size, 5, 77, 5)
    col = np.array([0.30, 0.33, 0.18]) * (0.85 + 0.15 * thread[..., None]) * (0.7 + 0.5 * stain[..., None])
    nor = normal_from_height(thread * 0.5 + weave * 0.2, 2.5)
    arm = np.stack([np.ones((size, size)), np.full((size, size), 0.92), np.zeros((size, size))], -1)
    gen_set('gen_canvas', col, nor, arm)


def bag(s, c, size, m, rnd, yaw=0.0, roll=0.0, cuts=2):
    b = s.mesh()
    mi = s.idx[m]
    tile = s.mat_tile[mi]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    seed = rnd.random() * 10
    for v in bm.verts:
        p = v.co.copy()
        p = p.lerp(p.normalized() * 0.5, 0.62)
        ex = abs(p.x * 2)
        p.y *= 1.0 - 0.34 * ex ** 3
        p.z *= (1.0 - 0.3 * ex ** 3) * (1.0 + 0.08 * (1 - ex ** 2))
        if p.z < 0:
            p.z *= 0.55
        p.z -= 0.05 * (p.y * 2) ** 2 * (1 - ex)
        v.co = Vector((p.x * size[0], p.y * size[1], p.z * size[2])) + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.006
    bm.normal_update()
    R = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(roll, 3, 'X')
    for f in bm.faces:
        vs, uvs = [], []
        n = R @ f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        u, w = UVAX[ax]
        for v in f.verts:
            wp = Vector(c) + R @ v.co
            vs.append(b.vert(wp, R @ v.normal))
            uvs.append((wp[u] / tile, wp[w] / tile))
        b.face(vs, mi, uvs)
    bm.free()


S.bag = bag


def pillow_box(s, c, size, m, cell, bulge, rnd=None, sub=4, tile=0.5):
    b = s.mesh()
    mi = s.idx[m]
    sx, sy, sz = size
    faces = [((1, 0, 0), (0, 1, 0), (0, 0, 1), sy, sz, sx), ((-1, 0, 0), (0, -1, 0), (0, 0, 1), sy, sz, sx),
             ((0, 1, 0), (-1, 0, 0), (0, 0, 1), sx, sz, sy), ((0, -1, 0), (1, 0, 0), (0, 0, 1), sx, sz, sy),
             ((0, 0, 1), (1, 0, 0), (0, 1, 0), sx, sy, sz), ((0, 0, -1), (1, 0, 0), (0, -1, 0), sx, sy, sz)]
    for nrm, ua, va, lu, lv, depth in faces:
        nrm, ua, va = Vector(nrm), Vector(ua), Vector(va)
        ncu, ncv = max(1, round(lu / cell)), max(1, round(lv / cell))
        nu, nv = ncu * sub, ncv * sub

        def P(i, j):
            fu, fv = i / nu, j / nv
            cu, cv = (fu * ncu) % 1.0, (fv * ncv) % 1.0
            if i == nu:
                cu = 1.0
            if j == nv:
                cv = 1.0
            edge = min(fu, 1 - fu, fv, 1 - fv)
            k = bulge * (math.sin(math.pi * cu) * math.sin(math.pi * cv)) ** 0.6 * min(1.0, edge * 8)
            pos = Vector(c) + ua * ((fu - 0.5) * lu) + va * ((fv - 0.5) * lv) + nrm * (depth / 2 + k)
            return pos, nrm

        grid = [[P(i, j) for j in range(nv + 1)] for i in range(nu + 1)]
        for i in range(nu):
            for j in range(nv):
                q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
                cc = (q[0][0] + q[2][0]) / 2
                nn = ((q[1][0] - q[0][0]).cross(q[3][0] - q[0][0])).normalized()
                if nn.dot(nrm) < 0:
                    q = q[::-1]
                vs = [b.vert(p, (p - Vector(c)).normalized() * 0.4 + nrm * 0.6) for p, _ in q]
                uvs = [(((p - Vector(c)).dot(ua)) / tile, ((p - Vector(c)).dot(va)) / tile) for p, _ in q]
                b.face(vs, mi, uvs)


S.pillow_box = pillow_box

hesco_texture()
camo_texture()
canvas_texture()
MT['sandbag'] = (material('M_sandbag2', tex=bake_tint('gen_sandbag', 'hessian_380', (0.66, 0.62, 0.48), 0.85, 0.95), rough=0.95), 0.45)
MT['earth'] = (material('M_earth', tex=bake_tint('gen_earth', 'leafy_grass', (0.78, 1.0, 0.52), 1.3, 0.8), rough=0.95), 2.5)
MT['hesco'] = (material('M_hesco', tex='gen_hesco', rough=0.95), 0.5)
MT['canvas'] = (material('M_canvas', tex='gen_canvas', rough=0.95), 1.0)
MT['camo'] = (material('Leaf_camo', diff=os.path.join(TEX, 'camo.png'), alpha_img=True, rough=0.95), 1.0)
