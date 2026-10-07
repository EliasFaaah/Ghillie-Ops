exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_mats.py').read())
R = {}
rad = math.radians


def radiotower():
    s = new_struct('RadioTower', ['steel', 'red', 'white', 'plate', 'roughconc', 'black'])
    H, n = 42.0, 14
    b0, b1 = 1.9, 0.6
    half = lambda z: b0 + (b1 - b0) * z / H
    s.box((0, 0, 0.25), (7.0, 7.0, 0.5), 'roughconc')
    s.col((0, 0, 0.25), (7.0, 7.0, 0.5))
    for k in range(n):
        za, zb = H * k / n, H * (k + 1) / n
        pa, pb = half(za), half(zb)
        m = 'red' if (k // 2) % 2 == 0 else 'white'
        for sx in (-1, 1):
            for sy in (-1, 1):
                s.beam((sx * pa, sy * pa, za), (sx * pb, sy * pb, zb), 0.2, 0.2, m)
        for (sx, sy, ex, ey) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            s.beam((sx * pb, sy * pb, zb), (ex * pb, ey * pb, zb), 0.1, 0.1, 'steel')
            if k % 2 == 0:
                s.beam((sx * pa, sy * pa, za), (ex * pb, ey * pb, zb), 0.07, 0.07, 'steel')
            else:
                s.beam((ex * pa, ey * pa, za), (sx * pb, sy * pb, zb), 0.07, 0.07, 'steel')
    for k in range(0, 6):
        za = 7.0 * k
        zb = za + 7.0
        p = half((za + zb) / 2)
        for sx in (-1, 1):
            for sy in (-1, 1):
                s.col((sx * p, sy * p, (za + zb) / 2), (0.4, 0.4, 7.0))
    for zp in (21.0, 36.0):
        p = half(zp)
        s.box((0, 0, zp), (p * 2 + 1.4, p * 2 + 1.4, 0.12), 'plate')
        for (a, b2, c, d) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            s.beam((a * (p + 0.7), b2 * (p + 0.7), zp + 1.0), (c * (p + 0.7), d * (p + 0.7), zp + 1.0), 0.05, 0.05, 'steel')
            s.beam((a * (p + 0.7), b2 * (p + 0.7), zp), (a * (p + 0.7), b2 * (p + 0.7), zp + 1.0), 0.05, 0.05, 'steel')
    s.beam((0, 0, H), (0, 0, H + 6.0), 0.14, 0.14, 'white')
    s.beam((0, 0, H + 3.0), (0, 0, H + 6.0), 0.1, 0.1, 'red')
    for sy in (-1, 1):
        s.cyl((0, sy * 0.9, H - 2.0), 0.7, 0.05, 0.3, 14, 'white', rot=(rad(90 + sy * 20), 0, 0))
    for zz in (H - 6.0, H - 10.0):
        for sx in (-1, 1):
            s.box((sx * 0.9, 0, zz), (0.12, 0.35, 1.6), 'white')
    s.box((0, 0, H + 6.2), (0.3, 0.3, 0.3), 'red')
    return s


def radiohut():
    s = new_struct('RadioHut', ['concrete', 'roughconc', 'steel', 'frame', 'glass', 'greenmetal', 'black'])
    W, D, t, H = 6.6, 5.2, 0.3, 3.0
    hx, hy = W / 2, D / 2
    s.box((0, 0, 0.1), (W + 0.4, D + 0.4, 0.3), 'roughconc')
    z0 = 0.25
    s.wall('x', -hy, -hx, hx, z0, H, t, 'concrete', [(-1.5, 1.1, 0, 2.1), (1.8, 0.9, 1.4, 0.4)])
    s.wall('x', hy, -hx, hx, z0, H, t, 'concrete')
    s.wall('y', -hx, -hy, hy, z0, H, t, 'concrete')
    s.wall('y', hx, -hy, hy, z0, H, t, 'concrete', [(0.0, 0.9, 1.4, 0.4)])
    s.door('x', -hy, -1.5, 1.1, 2.1, t, 'greenmetal', 'frame', z0=z0)
    s.window('x', -hy, 1.8, 0.9, 1.4, 0.4, t, 'frame', 'glass', z0=z0)
    s.box((0, 0, H + 0.1), (W + 0.4, D + 0.4, 0.3), 'roughconc')
    s.col((0, 0, H + 0.1), (W + 0.4, D + 0.4, 0.3))
    s.box((hx + 0.5, 0.5, 0.7), (1.0, 1.4, 1.2), 'steel')
    s.col((hx + 0.5, 0.5, 0.7), (1.0, 1.4, 1.2))
    s.beam((-2.0, 1.0, H + 0.25), (-2.0, 1.0, H + 6.0), 0.1, 0.1, 'steel')
    s.beam((2.0, -1.0, H + 0.25), (2.0, -1.0, H + 4.0), 0.08, 0.08, 'steel')
    s.box((1.0, 1.4, H + 0.65), (1.6, 1.0, 0.6), 'greenmetal')
    s.box((0, 0, 0.0), (W - 0.4, D - 0.4, 0.04), 'roughconc')
    return s


def quarrycrusher():
    s = new_struct('QuarryCrusher', ['greenmetal', 'steel', 'roughconc', 'plate', 'rusty', 'black', 'corrug'])
    s.box((0, 0, 0.4), (11.0, 8.0, 0.8), 'roughconc')
    s.col((0, 0, 0.4), (11.0, 8.0, 0.8))
    for sx in (-1, 1):
        for sy in (-1, 1):
            s.box((sx * 2.8, sy * 2.2, 5.2), (0.4, 0.4, 8.8), 'steel')
            s.col((sx * 2.8, sy * 2.2, 5.2), (0.5, 0.5, 8.8))
    for z in (2.4, 5.0, 7.6, 9.4):
        for (a, b, c, d) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            s.beam((a * 2.8, b * 2.2, z), (c * 2.8, d * 2.2, z), 0.22, 0.22, 'steel')
    s.box((0, 0, 3.6), (5.4, 4.2, 5.6), 'greenmetal')
    s.col((0, 0, 3.6), (5.6, 4.4, 5.6))
    s.box((0, 0, 7.8), (5.6, 4.4, 0.3), 'corrug')
    top = 9.4
    hop = [Vector((-3.4, -2.8, top + 1.8)), Vector((3.4, -2.8, top + 1.8)), Vector((3.4, 2.8, top + 1.8)), Vector((-3.4, 2.8, top + 1.8))]
    low = [Vector((-1.0, -0.8, top - 0.2)), Vector((1.0, -0.8, top - 0.2)), Vector((1.0, 0.8, top - 0.2)), Vector((-1.0, 0.8, top - 0.2))]
    cen = Vector((0, 0, top + 0.8))
    for i in range(4):
        j = (i + 1) % 4
        q = [hop[i], hop[j], low[j], low[i]]
        s.poly(q, 'rusty', cen - sum(q, Vector()) / 4)
        s.poly(q[::-1], 'rusty', sum(q, Vector()) / 4 - cen)
    s.col((0, 0, top + 1.0), (6.8, 5.6, 2.0))
    p0, p1 = Vector((-17.0, 0.0, 1.6)), Vector((-3.0, 0.0, 8.0))
    d = (p1 - p0)
    for off in (-0.7, 0.7):
        s.beam(p0 + Vector((0, off, 0.0)), p1 + Vector((0, off, 0.0)), 0.12, 0.5, 'plate')
    s.beam(p0 + Vector((0, 0, 0.18)), p1 + Vector((0, 0, 0.18)), 1.3, 0.1, 'black')
    for k in range(1, 8):
        base = p0 + d * (k / 8.0)
        s.beam((base.x, -0.7, 0), (base.x, -0.7, base.z - 0.2), 0.14, 0.14, 'steel')
        s.beam((base.x, 0.7, 0), (base.x, 0.7, base.z - 0.2), 0.14, 0.14, 'steel')
        s.col((base.x, 0, base.z * 0.5), (0.3, 1.8, base.z))
    for k in range(17):
        s.box((3.4 + 0.4 * (k % 2 == 0), -3.2, 0.25 + k * 0.5), (0.7, 0.7, 0.08), 'plate')
    s.beam((3.2, -3.5, 0), (3.2, -3.5, 9.2), 0.05, 0.05, 'steel')
    s.box((0, 4.4, 1.0), (4.0, 1.4, 2.0), 'rusty')
    s.col((0, 4.4, 1.0), (4.0, 1.4, 2.0))
    s.box((-5.6, 0.0, 0.1), (3.0, 7.0, 0.18), 'roughconc')
    return s


def quarryoffice():
    s = new_struct('QuarryOffice', ['white', 'corrug', 'frame', 'glass', 'greenmetal', 'steel', 'roughconc', 'planks'])
    W, D, H = 9.0, 3.2, 2.7
    z0 = 0.5
    for x in (-3.8, 0.0, 3.8):
        for y in (-1.2, 1.2):
            s.box((x, y, 0.25), (0.4, 0.4, 0.5), 'roughconc')
    s.box((0, 0, z0 - 0.05), (W, D, 0.15), 'steel')
    s.col((0, 0, z0 - 0.05), (W, D, 0.2))
    s.wall('x', -D / 2, -W / 2, W / 2, z0, z0 + H, 0.12, 'white', [(-3.0, 1.0, 0, 2.0), (-0.5, 1.5, 0.9, 1.1), (2.0, 1.5, 0.9, 1.1), (3.6, 1.2, 0.9, 1.1)])
    s.wall('x', D / 2, -W / 2, W / 2, z0, z0 + H, 0.12, 'white', [(-2.0, 1.5, 0.9, 1.1), (1.0, 1.5, 0.9, 1.1)])
    s.wall('y', -W / 2, -D / 2, D / 2, z0, z0 + H, 0.12, 'white')
    s.wall('y', W / 2, -D / 2, D / 2, z0, z0 + H, 0.12, 'white')
    s.door('x', -D / 2, -3.0, 1.0, 2.0, 0.12, 'greenmetal', 'frame', z0=z0)
    for c in (-0.5, 2.0, 3.6):
        s.window('x', -D / 2, c, 1.5 if c < 3 else 1.2, 0.9, 1.1, 0.12, 'frame', 'glass', z0=z0)
    for c in (-2.0, 1.0):
        s.window('x', D / 2, c, 1.5, 0.9, 1.1, 0.12, 'frame', 'glass', z0=z0)
    s.box((0, 0, z0 + H + 0.06), (W + 0.3, D + 0.3, 0.12), 'corrug')
    s.col((0, 0, z0 + H + 0.06), (W + 0.3, D + 0.3, 0.14))
    s.box((-3.0, -D / 2 - 0.7, 0.25), (1.6, 1.2, 0.5), 'planks')
    s.col((-3.0, -D / 2 - 0.7, 0.25), (1.6, 1.2, 0.5))
    return s


def shippingcontainer():
    s = new_struct('ShippingContainer', ['corrug', 'rusty', 'steel', 'greenmetal'])
    L, W, H = 12.2, 2.44, 2.6
    s.box((0, 0, H / 2), (L - 0.2, W - 0.1, H - 0.2), 'greenmetal')
    for sy in (-1, 1):
        s.box((0, sy * (W / 2 - 0.02), H / 2), (L - 0.3, 0.06, H - 0.3), 'corrug')
    s.box((0, 0, H - 0.02), (L - 0.3, W - 0.2, 0.06), 'corrug')
    for sx in (-1, 1):
        for sy in (-1, 1):
            s.box((sx * (L / 2 - 0.08), sy * (W / 2 - 0.08), H / 2), (0.16, 0.16, H), 'rusty')
            for sz in (0.08, H - 0.08):
                s.box((sx * (L / 2 - 0.08), sy * (W / 2 - 0.08), sz), (0.16, 0.16, 0.16), 'rusty')
    for sy in (-1, 1):
        for sz in (0.08, H - 0.08):
            s.box((0, sy * (W / 2 - 0.08), sz), (L, 0.16, 0.16), 'rusty')
    for sx in (-1, 1):
        for sz in (0.08, H - 0.08):
            s.box((sx * (L / 2 - 0.08), 0, sz), (0.16, W, 0.16), 'rusty')
    for off in (-0.6, -0.2, 0.2, 0.6):
        s.box((-L / 2 - 0.02, off, H / 2), (0.05, 0.05, H - 0.3), 'steel')
    s.col((0, 0, H / 2), (L, W, H))
    return s


def fueltank():
    s = new_struct('FuelTank', ['steel', 'rusty', 'roughconc', 'plate'])
    r, h = 3.0, 7.0
    s.cyl((0, 0, h / 2 + 0.4), r, r, h, 20, 'rusty')
    s.cyl((0, 0, h + 0.4 + 0.45), r, 0.2, 0.9, 20, 'steel')
    s.cyl((0, 0, 0.2), r + 0.2, r + 0.2, 0.4, 20, 'roughconc')
    for k in range(18):
        a = 0.6
        s.box((r * math.cos(a) + 0.12, r * math.sin(a), 0.7 + k * 0.4), (0.06, 0.8, 0.06), 'steel')
    s.cyl((r + 0.6, 1.2, 1.0), 0.18, 0.18, 2.0, 10, 'steel', rot=(0, 0, 0))
    s.beam((r - 0.1, 1.2, 1.8), (r + 0.6, 1.2, 1.8), 0.14, 0.14, 'steel')
    s.col((0, 0, h / 2 + 0.4), (r * 2 - 0.4, r * 2 - 0.4, h))
    return s


def gravelpile():
    rnd = random.Random(12)
    s = new_struct('GravelPile', ['gravel'])
    b = s.mesh()
    mi = s.idx['gravel']
    Rr, Hh = 5.6, 3.0
    rings, segs = 7, 28
    pts = []
    for i in range(rings + 1):
        t = i / rings
        row = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            rad_ = Rr * (1 - t) * (1 + 0.12 * math.sin(a * 3 + 1) + rnd.uniform(-0.04, 0.04))
            z = Hh * (1 - (1 - t) ** 1.7) * (1 + rnd.uniform(-0.03, 0.03)) if i < rings else Hh
            row.append(Vector((math.cos(a) * rad_, math.sin(a) * rad_, z)))
        pts.append(row)
    for i in range(rings):
        for j in range(segs):
            j2 = (j + 1) % segs
            q = [pts[i][j], pts[i][j2], pts[i + 1][j2], pts[i + 1][j]]
            cen = sum(q, Vector()) / 4
            n = Vector((cen.x, cen.y, 2.0)).normalized()
            vs = [b.vert(p, Vector((p.x, p.y, 2.2)).normalized()) for p in q]
            b.face(vs, mi, [(p.x / 1.6, p.y / 1.6) for p in q])
    s.col((0, 0, 0.5), (9.2, 9.2, 1.0))
    s.col((0, 0, 1.5), (6.2, 6.2, 1.0))
    s.col((0, 0, 2.4), (3.0, 3.0, 0.9))
    return s


def stonebridge():
    s = new_struct('StoneBridge', ['stone', 'stonedark', 'roughconc', 'dirt'])
    width = 6.8
    top = 3.2
    spring, rise = 0.2, 1.9
    prof = [(-20.0, top), (20.0, top), (20.0, -3.5)]
    arches = [(-10.5, 4.5), (0.0, 4.5), (10.5, 4.5)]
    Rd = ((2 * 4.5) ** 2 / 4 + rise ** 2) / (2 * rise)
    for c, hs in reversed(arches):
        prof += [(c + hs + 0.0, -3.5), (c + hs, spring)]
        for k in range(1, 12):
            a = -hs + 2 * hs * (1 - k / 12)
            prof.append((c + a, spring + rise - (Rd - math.sqrt(Rd * Rd - a * a))))
        prof += [(c - hs, spring), (c - hs, -3.5)]
    prof.append((-20.0, -3.5))
    cleaned = []
    for p in prof:
        if not cleaned or (abs(cleaned[-1][0] - p[0]) > 1e-4 or abs(cleaned[-1][1] - p[1]) > 1e-4):
            cleaned.append(p)
    s.prism('x', 0.0, cleaned, width, 'stone', tile=1.6)
    for sx in (-1, 1):
        s.box((sx * (width / 2 + 0.05), 0, top + 0.55), (0.55, 40.4, 1.1), 'stonedark')
        s.box((sx * (width / 2 + 0.05), 0, top + 1.15), (0.75, 40.6, 0.16), 'stone')
        s.col((sx * (width / 2 + 0.05), 0, top + 0.55), (0.6, 40.4, 1.1))
    s.box((0, 0, top + 0.02), (width - 0.1, 40.0, 0.06), 'dirt')
    s.col((0, 0, top - 0.7), (width, 40.0, 1.6))
    for y in (-5.25, 5.25):
        s.col((0, y, -1.0), (width, 1.5, 5.0))
    for y in (-17.5, 17.5):
        s.col((0, y, -0.3), (width, 5.0, 6.8))
    return s


for fn in (radiotower, radiohut, quarrycrusher, quarryoffice, shippingcontainer, fueltank, gravelpile, stonebridge):
    finish(fn(), R)
bpy.context.view_layer.update()
layout_row(R, 8.0)
