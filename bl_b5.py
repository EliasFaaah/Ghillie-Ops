exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_gen.py').read())
R = {}
rad = math.radians


def sandbagwall():
    rnd = random.Random(8)
    s = new_struct('SandbagWall', ['sandbag'])
    L, bl, bd, bh = 3.0, 0.56, 0.3, 0.17
    for row in range(6):
        for k in range(-3, 4):
            x = k * (bl + 0.012) + (bl / 2 if row % 2 else 0.0)
            if abs(x) > L / 2 - bl / 2 + 0.02:
                continue
            for y in (-0.15, 0.15):
                s.bag((x, y + rnd.uniform(-0.012, 0.012), bh / 2 + row * bh * 0.93), (bl * rnd.uniform(0.96, 1.04), bd, bh * rnd.uniform(0.95, 1.05)), 'sandbag', rnd, yaw=rnd.uniform(-0.05, 0.05), roll=rnd.uniform(-0.04, 0.04))
    s.col((0, 0, 0.5), (3.0, 0.8, 1.0))
    return s


def sandbagnest():
    rnd = random.Random(9)
    s = new_struct('SandbagNest', ['sandbag'])
    r0, bl, bh = 2.0, 0.6, 0.17
    for row in range(6):
        n = 14
        for k in range(n):
            a = math.radians(-100 + 200 * (k + (0.5 if row % 2 else 0.0)) / n) + math.pi / 2
            if row % 2 and k == n - 1:
                continue
            p = (math.cos(a) * r0, math.sin(a) * r0, bh / 2 + row * bh * 0.93)
            s.bag(p, (bl, 0.46, bh), 'sandbag', rnd, yaw=a + math.pi / 2 + rnd.uniform(-0.05, 0.05), roll=rnd.uniform(-0.04, 0.04), cuts=1)
    for sg in (-1, 1):
        s.col((sg * 1.95, 0.0, 0.5), (0.7, 2.6, 1.0))
    s.col((0, 1.95, 0.5), (3.2, 0.7, 1.0))
    return s


def hesco():
    rnd = random.Random(5)
    s = new_struct('Hesco', ['hesco', 'steel'])
    s.pillow_box((0, 0, 0.72), (2.0, 1.0, 1.36), 'hesco', 1.0, 0.045, sub=4, tile=0.3)
    for sx in (-1.0, 0.0, 1.0):
        for sy in (-0.5, 0.5):
            s.cyl((sx, sy, 0.7), 0.014, 0.014, 1.4, 6, 'steel')
    s.col((0, 0, 0.68), (2.0, 1.04, 1.36))
    return s


def militarytent():
    s = new_struct('MilitaryTent', ['canvas', 'steel', 'oldplanks', 'black', 'dirt'])
    L, W, eave, ridge = 6.4, 4.4, 1.55, 2.9
    hw = W / 2
    nx, ny = 10, 5
    sag = 0.1

    def roof(sgn):
        rows = []
        for j in range(ny + 1):
            t = j / ny
            row = []
            for i in range(nx + 1):
                x = -L / 2 + L * i / nx
                y = sgn * (hw + 0.2 - t * (hw + 0.2))
                z = eave + (ridge - eave) * t - sag * math.sin(math.pi * t) * (1 - abs(2 * i / nx - 1) ** 3) + 0.05 * math.sin(i * 2.1 + t * 3)
                row.append(Vector((x, y, z)))
            rows.append(row)
        return rows

    def grid(rows, m, flip):
        for j in range(len(rows) - 1):
            for i in range(len(rows[0]) - 1):
                q = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]
                cen = sum(q, Vector()) / 4
                s.poly(q, m, hint=Vector((0, 0, 1)) if flip is None else Vector((0, flip, 0)), tile=None)

    for sgn in (-1, 1):
        grid(roof(sgn), 'canvas', None)
        rows = []
        for j in range(3):
            t = j / 2
            rows.append([Vector((-L / 2 + L * i / nx, sgn * (hw + 0.2), t * eave + 0.02 * math.sin(i * 1.7 + j))) for i in range(nx + 1)])
        grid(rows, 'canvas', sgn)
    for sgn in (-1, 1):
        door = sgn == -1
        poly = [(-hw - 0.2, 0.0), (hw + 0.2, 0.0), (hw + 0.2, eave), (0.0, ridge), (-hw - 0.2, eave)]
        xs = sgn * L / 2
        if not door:
            s.poly([Vector((xs, a, z)) for a, z in poly], 'canvas', hint=Vector((sgn, 0, 0)))
        else:
            s.poly([Vector((xs, -hw - 0.2, 0.0)), Vector((xs, -0.7, 0.0)), Vector((xs, -0.7, 2.0)), Vector((xs, 0.0, ridge * 0.97)), Vector((xs, -hw - 0.2, eave))], 'canvas', hint=Vector((sgn, 0, 0)))
            s.poly([Vector((xs, 0.7, 0.0)), Vector((xs, hw + 0.2, 0.0)), Vector((xs, hw + 0.2, eave)), Vector((xs, 0.0, ridge * 0.97)), Vector((xs, 0.7, 2.0))], 'canvas', hint=Vector((sgn, 0, 0)))
            s.box((xs + sgn * 0.02, 0.0, 1.0), (0.04, 1.4, 2.0), 'black')
            for side in (-1, 1):
                s.poly([Vector((xs, side * 0.7, 0.0)), Vector((xs + sgn * 0.5, side * 1.15, 0.0)), Vector((xs + sgn * 0.5, side * 1.1, 1.9)), Vector((xs, side * 0.7, 2.0))], 'canvas', hint=Vector((0, side, 0)))
    s.box((0, 0, 0.0), (L - 0.2, W - 0.2, 0.06), 'dirt')
    for sx in (-L / 2, L / 2):
        s.cyl((sx, 0, ridge / 2), 0.04, 0.04, ridge, 8, 'oldplanks')
    s.cyl((0, 0, ridge), 0.035, 0.035, L + 0.1, 8, 'oldplanks', rot=(0, math.pi / 2, 0))
    for sx in (-L / 2 - 0.1, L / 2 + 0.1):
        for sy in (-1, 1):
            p0 = Vector((sx, sy * (hw + 0.2), eave - 0.1))
            p1 = Vector((sx + math.copysign(1.0, sx) * 1.3, sy * (hw + 1.6), 0.0))
            s.beam(p0, p1, 0.012, 0.012, 'steel')
            s.cyl((p1.x, p1.y, 0.1), 0.02, 0.02, 0.22, 6, 'steel')
    for sx in (-L / 4, L / 4):
        for sy in (-1, 1):
            s.beam(Vector((sx, sy * (hw + 0.2), eave - 0.1)), Vector((sx, sy * (hw + 1.5), 0.0)), 0.012, 0.012, 'steel')
    s.col((0, 0, 1.2), (L, W, 2.4))
    return s


def camonet():
    s = new_struct('CamoNet', ['camo', 'oldplanks', 'steel'])
    Lx, Ly, h = 8.0, 6.0, 3.0
    nx, ny = 10, 8
    rows = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            fx, fy = i / nx, j / ny
            x, y = (fx - 0.5) * Lx, (fy - 0.5) * Ly
            z = h - 0.55 * (1 - (1 - 2 * abs(fy - 0.5)) ** 0.7) + 0.12 * math.sin(i * 1.3 + j * 0.9) - 0.5 * (abs(2 * fx - 1) ** 4)
            row.append(Vector((x, y, z)))
        rows.append(row)
    b = s.mesh()
    mi = s.idx['camo']
    for j in range(ny):
        for i in range(nx):
            q = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]
            uvs = [(i / nx * 2, j / ny * 2), ((i + 1) / nx * 2, j / ny * 2), ((i + 1) / nx * 2, (j + 1) / ny * 2), (i / nx * 2, (j + 1) / ny * 2)]
            nn = (q[1] - q[0]).cross(q[3] - q[0]).normalized()
            for side in (1, -1):
                vs = [b.vert(p, Vector((nn.x * 0.3, nn.y * 0.3, 1.0 if side == 1 else -1.0)).normalized()) for p in (q if side == 1 else q[::-1])]
                b.face(vs, mi, uvs if side == 1 else uvs[::-1])
    for sx in (-1, 1):
        for sy in (-1, 1):
            s.cyl((sx * Lx * 0.46, sy * Ly * 0.46, h / 2 - 0.2), 0.05, 0.05, h - 0.4, 8, 'oldplanks')
            s.cyl((sx * Lx * 0.46, sy * Ly * 0.46, 0.0), 0.2, 0.2, 0.08, 8, 'steel')
    s.col((0, 0, 1.2), (0.3, 0.3, 2.4))
    return s


def flagpole():
    s = new_struct('FlagPole', ['steel', 'roughconc', 'flag'])
    s.cyl((0, 0, 0.2), 0.34, 0.34, 0.4, 12, 'roughconc')
    s.cyl((0, 0, 4.9), 0.055, 0.045, 9.0, 10, 'steel')
    s.cyl((0, 0, 9.5), 0.1, 0.1, 0.2, 10, 'steel')
    b = s.mesh()
    mi = s.idx['flag']
    nx, nz = 16, 8
    fw, fh = 2.6, 1.6
    z1 = 9.1
    for j in range(nz):
        for i in range(nx):
            p = [Vector((0.06 + fw * i / nx, 0, z1 - fh * j / nz)), Vector((0.06 + fw * (i + 1) / nx, 0, z1 - fh * j / nz)), Vector((0.06 + fw * (i + 1) / nx, 0, z1 - fh * (j + 1) / nz)), Vector((0.06 + fw * i / nx, 0, z1 - fh * (j + 1) / nz))]
            uv = [(i / nx, 1 - j / nz), ((i + 1) / nx, 1 - j / nz), ((i + 1) / nx, 1 - (j + 1) / nz), (i / nx, 1 - (j + 1) / nz)]
            for side, order in ((1, range(4)), (-1, range(3, -1, -1))):
                vs = [b.vert(p[k], Vector((0, -side, 0))) for k in order]
                b.face(vs, mi, [uv[k] for k in order])
    s.col((0, 0, 4.5), (0.3, 0.3, 9.0))
    return s


def stonewall():
    rnd = random.Random(14)
    s = new_struct('StoneWall', ['stonedark', 'stone'])
    for row in range(4):
        n = 7 - (row % 2)
        w = 4.0 / n
        for k in range(n):
            x = -2.0 + w * (k + 0.5)
            s.lumpy((x, 0, 0.14 + row * 0.24), (w * 0.97, 0.52 + rnd.uniform(-0.04, 0.04), 0.24), 'stonedark', rnd, rot=rnd.uniform(-0.04, 0.04), cuts=1, round_=0.35, noise=0.02, tile=1.2)
    for k in range(8):
        s.lumpy((-1.9 + k * 0.54, 0, 1.04), (0.52, 0.6, 0.14), 'stone', rnd, cuts=1, round_=0.3, noise=0.02, tile=1.2)
    s.col((0, 0, 0.55), (4.0, 0.55, 1.1))
    return s


def woodpile():
    rnd = random.Random(15)
    s = new_struct('WoodPile', ['oldplanks', 'planks'])
    r = 0.11
    rows = [9, 8, 7, 6, 5]
    for j, n in enumerate(rows):
        for i in range(n):
            x = (i - (n - 1) / 2) * r * 2.05
            s.cyl((x + rnd.uniform(-0.01, 0.01), 0, r + j * r * 1.78), r * rnd.uniform(0.85, 1.05), r * rnd.uniform(0.85, 1.05), 1.1, 9, 'oldplanks', rot=(math.pi / 2, 0, 0), tile=0.5)
    s.col((0, 0, 0.5), (2.0, 1.1, 1.0))
    return s


def truck():
    s = new_struct('MilTruck', ['greenmetal', 'canvas', 'black', 'glass', 'steel', 'oldplanks', 'frame'])
    s.box((0, 0.1, 0.78), (2.0, 6.3, 0.28), 'black')
    s.box((0, -2.55, 1.35), (2.35, 1.5, 1.35), 'greenmetal')
    s.box((0, -3.55, 1.0), (2.25, 1.15, 0.95), 'greenmetal')
    s.box((0, -2.58, 1.95), (2.2, 1.3, 0.12), 'greenmetal')
    s.box((0, -3.3, 1.63), (2.18, 0.04, 0.5), 'black')
    s.box((0, -3.12, 1.85), (2.0, 0.04, 0.6), 'glass')
    for sx in (-1, 1):
        s.box((sx * 1.18, -2.55, 1.55), (0.04, 0.9, 0.55), 'glass')
        s.box((sx * 1.04, -4.15, 0.62), (0.34, 0.12, 0.2), 'frame')
        s.cyl((sx * 1.3, -3.0, 1.9), 0.04, 0.04, 0.45, 6, 'steel')
    s.box((0, -4.2, 0.55), (2.3, 0.3, 0.3), 'steel')
    s.box((0, -4.15, 0.95), (1.2, 0.05, 0.4), 'black')
    s.box((0, 1.15, 1.3), (2.35, 4.2, 0.1), 'oldplanks')
    for sx in (-1, 1):
        s.box((sx * 1.15, 1.15, 1.62), (0.07, 4.2, 0.55), 'oldplanks')
    s.box((0, -0.95, 1.62), (2.3, 0.07, 0.55), 'oldplanks')
    s.box((0, 3.25, 1.62), (2.3, 0.07, 0.55), 'oldplanks')
    arch = [(-1.15, 1.35)]
    for k in range(1, 12):
        a = math.pi * k / 12
        arch.append((-math.cos(a) * 1.15, 1.35 + math.sin(a) * 1.15))
    arch.append((1.15, 1.35))
    s.prism('y', 1.15, arch, 4.15, 'canvas')
    s.box((0, 3.3, 1.4), (2.3, 0.08, 0.5), 'steel')
    for k in range(3):
        s.box((0, -0.8 + k * 1.9, 2.5), (2.4, 0.05, 0.05), 'steel')
    for yy in (-3.3, -1.9, 2.3, 3.45):
        for sx in (-1, 1):
            if yy == -1.9 and False:
                continue
            s.cyl((sx * 1.02, yy, 0.55), 0.55, 0.55, 0.42, 14, 'black', rot=(0, math.pi / 2, 0))
            s.cyl((sx * 1.2, yy, 0.55), 0.3, 0.3, 0.1, 10, 'steel', rot=(0, math.pi / 2, 0))
    s.cyl((1.0, 3.6, 0.9), 0.5, 0.5, 0.3, 14, 'black', rot=(0, math.pi / 2, 0))
    s.col((0, -0.2, 1.4), (2.4, 8.2, 2.2))
    s.col((0, -3.2, 1.2), (2.4, 2.4, 1.6))
    return s


def bunker():
    s = new_struct('Bunker', ['precast', 'roughconc', 'earth', 'steel', 'black', 'sandbag'])
    rnd = random.Random(12)
    W, D, t, H = 7.0, 5.0, 0.55, 2.3
    hx, hy = W / 2, D / 2
    s.box((0, 0, -0.1), (W + 0.4, D + 0.4, 0.3), 'roughconc')
    s.wall('x', -hy, -hx, hx, 0.0, H, t, 'precast', [(0.0, 2.8, 1.25, 0.42)])
    s.wall('x', hy, -hx, hx, 0.0, H, t, 'precast', [(1.6, 1.0, 0, 1.9)])
    s.wall('y', -hx, -hy, hy, 0.0, H, t, 'precast')
    s.wall('y', hx, -hy, hy, 0.0, H, t, 'precast')
    s.box((0, 0, H + 0.25), (W + 0.7, D + 0.7, 0.5), 'roughconc')
    s.col((0, 0, H + 0.25), (W + 0.7, D + 0.7, 0.5))
    s.box((0, -hy - 0.2, 1.1), (3.2, 0.25, 0.08), 'roughconc')
    s.box((-1.6, hy + 0.15, 0.95), (1.1, 0.3, 1.9), 'steel')
    s.box((-0.75, hy + 0.2, 1.5), (0.08, 0.4, 0.08), 'black')
    s.cyl((2.2, 0.8, H + 0.8), 0.12, 0.12, 0.6, 8, 'steel')
    berm = [(-hx - 3.6, 0.0), (-hx - 1.0, 1.5), (-hx - 0.2, H + 0.65), (hx + 0.2, H + 0.65), (hx + 1.0, 1.5), (hx + 3.6, 0.0)]
    s.prism('y', 0.45, berm, D + 0.5, 'earth')
    s.prism('y', hy + 0.9, [(-hx - 0.2, 0.0), (-hx + 0.2, 1.2), (hx - 0.2, 1.2), (hx + 0.2, 0.0)], 2.2, 'earth')
    for sgn in (-1, 1):
        s.col((sgn * (hx + 1.3), 0.4, 0.9), (2.4, D, 1.8))
    s.col((0, 0.4, H + 0.35), (W + 0.6, D, 0.7))
    for row in range(4):
        for k in range(7):
            s.bag((-hx + 0.4 + k * 1.0 + (0.5 if row % 2 else 0.0) - 0.0, -hy - 0.55, 0.1 + row * 0.16), (0.56, 0.3, 0.17), 'sandbag', rnd, yaw=rnd.uniform(-0.04, 0.04))
    s.col((0, -hy - 0.55, 0.35), (W, 0.4, 0.7))
    return s


for fn in (sandbagwall, sandbagnest, hesco, militarytent, camonet, flagpole, stonewall, woodpile, truck, bunker):
    finish(fn(), R)

ph = open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_ph.py').read()
exec(ph[:ph.index('\nreset()\nroots')])
m = pick_meshes('covered_car')
R['CoveredCar'] = finish_piece(m[0], 'CoveredCar', None, 3500, 'box')
for o in m[1:]:
    bpy.data.objects.remove(o)
m = pick_meshes('modular_chainlink_fence')
fence = [o for o in m if o.name.endswith('_fence_double')][0]
for o in m:
    if o is not fence:
        bpy.data.objects.remove(o)
R['ChainlinkFence'] = finish_piece(fence, 'ChainlinkFence', None, 4000, 'box')
bpy.context.view_layer.update()
