exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_mats.py').read())
R = {}
rad = math.radians


def ruin_wall(s, axis, fixed, a0, a1, t, hmax, m, rnd, gaps=(), base='stone', low=1.0):
    s.wall(axis, fixed, a0, a1, 0.0, low, t, base, [(c, w, 0, low) for c, w in gaps])
    x = a0
    while x < a1 - 0.05:
        w = min(rnd.uniform(0.8, 1.3), a1 - x)
        c = x + w / 2
        x += w
        if any(abs(c - g[0]) < g[1] / 2 + w / 2 for g in gaps):
            continue
        if rnd.random() < 0.22:
            continue
        h = rnd.uniform(0.25, 1.0) * (hmax - low)
        if h < 0.2:
            continue
        pos = (c, fixed, low + h / 2) if axis == 'x' else (fixed, c, low + h / 2)
        size = (w, t, h) if axis == 'x' else (t, w, h)
        s.box(pos, size, m)
        s.col(pos, size)


def farmhouse():
    rnd = random.Random(4)
    s = new_struct('Farmhouse', ['brokenbrick', 'stone', 'planks', 'roof_red', 'oldplanks', 'brick', 'roughconc', 'frame'])
    W, D, t = 11.0, 7.6, 0.45
    hx, hy = W / 2, D / 2
    ruin_wall(s, 'x', -hy, -hx, hx, t, 5.6, 'brokenbrick', rnd, gaps=[(-1.5, 1.4), (3.2, 1.8)])
    ruin_wall(s, 'x', hy, -hx, hx, t, 5.0, 'brokenbrick', rnd, gaps=[(0.0, 1.6)])
    ruin_wall(s, 'y', -hx, -hy, hy, t, 5.6, 'brokenbrick', rnd, gaps=[(0.5, 1.5)])
    ruin_wall(s, 'y', hx, -hy, hy, t, 4.2, 'brokenbrick', rnd, gaps=[(-1.5, 1.4)])
    s.wall('y', 1.2, -hy + t / 2, hy - t / 2, 0.0, 2.6, 0.3, 'brokenbrick', [(0.3, 1.2, 0, 2.1)])
    s.box((0, 0, -0.02), (W - 0.2, D - 0.2, 0.1), 'oldplanks')
    s.box((-hx + 1.2, 0, 3.0), (2.4, D - 0.4, 0.2), 'oldplanks')
    s.col((-hx + 1.2, 0, 3.0), (2.4, D - 0.4, 0.2))
    for x in (-4.2, -1.4, 1.4, 4.0):
        s.beam((x, -hy + 0.2, 4.5), (x, 0, 6.3), 0.16, 0.2, 'oldplanks')
        s.beam((x, hy - 0.2, 4.2), (x, 0, 6.3), 0.16, 0.2, 'oldplanks')
    s.beam((-hx + 0.2, 0, 6.3), (hx - 0.4, 0, 6.3), 0.18, 0.22, 'oldplanks')
    s.box((-2.8, -1.6, 5.15), (4.6, 3.6, 0.12), 'roof_red', rot=(rad(30), 0, 0))
    s.box((2.6, 1.8, 5.0), (3.4, 3.0, 0.12), 'roof_red', rot=(rad(-30), 0, 0))
    s.box((hx - 1.6, 1.0, 3.2), (1.0, 1.0, 6.8), 'brick')
    s.col((hx - 1.6, 1.0, 3.2), (1.0, 1.0, 6.8))
    for (cx, cy, sz, rr) in [(-4.6, 2.8, 1.6, 0.3), (3.8, -2.4, 1.3, 0.8), (0.4, -3.4, 1.0, 1.4), (-1.8, 2.6, 0.9, 2.0), (5.4, 3.2, 1.4, 0.2)]:
        s.lumpy((cx, cy, 0.3), (sz * 1.6, sz * 1.2, sz * 0.6), 'brokenbrick', rnd, rot=rr, cuts=1, round_=0.35, noise=0.1)
    s.col((-4.6, 2.8, 0.3), (2.0, 1.6, 0.7))
    s.col((3.8, -2.4, 0.3), (1.8, 1.4, 0.6))
    return s


def barn():
    rnd = random.Random(9)
    s = new_struct('Barn', ['planks', 'oldplanks', 'rusty', 'corrug', 'stone', 'frame'])
    W, D, t = 14.0, 9.0, 0.22
    hx, hy = W / 2, D / 2
    zt = 4.4
    s.wall('x', -hy, -hx, hx, 0.0, zt, t, 'planks', [(0.0, 3.8, 0, 3.6), (-5.0, 1.2, 1.2, 1.4)])
    s.wall('x', hy, -hx, hx, 0.0, zt, t, 'planks', [(-3.0, 1.2, 1.2, 1.4), (4.0, 1.4, 0, 2.2)])
    s.wall('y', -hx, -hy, hy, 0.0, zt, t, 'planks', [(0.0, 3.0, 0, 3.2)])
    s.wall('y', hx, -hy, hy, 0.0, zt, t, 'planks', [(2.0, 1.2, 1.2, 1.4)])
    for x in (-hx, hx):
        for y in (-hy, hy):
            s.box((x, y, zt / 2), (0.4, 0.4, zt), 'oldplanks')
    for x in range(-6, 7, 3):
        s.beam((x, -hy, zt), (x, 0, zt + 2.6), 0.2, 0.2, 'oldplanks')
        s.beam((x, hy, zt), (x, 0, zt + 2.6), 0.2, 0.2, 'oldplanks')
        s.beam((x, -hy, zt), (x, hy, zt), 0.22, 0.26, 'oldplanks')
    s.beam((-hx, 0, zt + 2.6), (hx, 0, zt + 2.6), 0.24, 0.24, 'oldplanks')
    pitch = rad(30)
    run = hy + 0.6
    L = run / math.cos(pitch)
    zc = zt + (hy - run / 2) * math.tan(pitch) - 0.1
    s.box((0, run / 2, zc), (W + 1.2, L, 0.16), 'rusty', rot=(-pitch, 0, 0))
    s.box((-hx + 3.0, -run / 2, zc), (6.0, L, 0.16), 'corrug', rot=(pitch, 0, 0))
    roof_cols(s, 'x', -hx, hx, -hy, hy, zt, pitch)
    s.prism('x', hx - 0.11, [(-hy, zt), (hy, zt), (0, zt + 2.6)], 0.22, 'planks')
    s.prism('x', -hx + 0.11, [(-hy, zt), (hy, zt), (0, zt + 2.6)], 0.22, 'planks')
    s.box((0, 0, -0.02), (W - 0.3, D - 0.3, 0.12), 'oldplanks')
    s.box((-hx + 2.8, 1.5, 1.0), (4.6, 4.0, 2.0), 'planks')
    s.col((-hx + 2.8, 1.5, 1.0), (4.6, 4.0, 2.0))
    s.box((-3.4, -hy - 0.1, 1.7), (1.9, 0.1, 3.4), 'oldplanks', rot=(0, 0, rad(-18)))
    return s


def farmshed():
    s = new_struct('FarmShed', ['planks_grey', 'corrug', 'oldplanks', 'rusty'])
    W, D, t = 5.2, 3.8, 0.12
    hx, hy = W / 2, D / 2
    s.wall('x', hy, -hx, hx, 0.0, 2.5, t, 'planks_grey')
    s.wall('y', -hx, -hy, hy, 0.0, 2.5, t, 'planks_grey')
    s.wall('y', hx, -hy, hy, 0.0, 2.1, t, 'planks_grey', [(0.0, 1.0, 0, 1.9)])
    for x in (-hx, 0, hx):
        s.box((x, -hy, 1.2), (0.16, 0.16, 2.4), 'oldplanks')
    pitch = math.atan2(0.5, D)
    s.box((0, 0, 2.5), (W + 0.5, D + 0.7, 0.07), 'corrug', rot=(pitch, 0, 0))
    s.col((0, 0, 2.5), (W + 0.5, D + 0.5, 0.15))
    s.box((-1.3, 0.8, 0.4), (1.0, 0.6, 0.8), 'oldplanks')
    s.col((-1.3, 0.8, 0.4), (1.0, 0.6, 0.8))
    return s


def well():
    s = new_struct('Well', ['stone', 'oldplanks', 'black', 'roof_red', 'steel', 'planks'])
    s.cyl((0, 0, 0.5), 0.95, 0.95, 1.0, 14, 'stone')
    s.cyl((0, 0, 1.0), 0.72, 0.72, 0.02, 14, 'black')
    for sx in (-0.95, 0.95):
        s.box((sx, 0, 1.6), (0.14, 0.14, 2.2), 'oldplanks')
    s.box((0, 0, 2.55), (2.3, 0.14, 0.14), 'oldplanks')
    s.cyl((0, 0, 2.15), 0.09, 0.09, 1.3, 8, 'planks', rot=(0, rad(90), 0))
    s.gable('y', -0.6, 0.6, -1.3, 1.3, 2.55, rad(35), 0.2, 0.06, 'roof_red')
    s.cyl((0.0, 0.0, 1.55), 0.15, 0.13, 0.28, 8, 'steel')
    s.col((0, 0, 0.5), (1.9, 1.9, 1.0))
    return s


def haybale():
    s = new_struct('HayBale', ['reed', 'planks'])
    s.cyl((0, 0, 0.7), 0.7, 0.7, 1.2, 18, 'reed', rot=(rad(90), 0, 0), tile=1.0)
    s.col((0, 0, 0.7), (1.4, 1.2, 1.4))
    return s


def woodfence():
    s = new_struct('WoodFence', ['planks_grey', 'oldplanks'])
    for x in (-2.0, 0.0, 2.0):
        s.box((x, 0, 0.65), (0.14, 0.14, 1.3), 'oldplanks')
    for z in (0.35, 0.7, 1.05):
        s.box((0, 0, z), (4.1, 0.05, 0.12), 'planks_grey')
    s.col((0, 0, 0.6), (4.1, 0.12, 1.2))
    return s


for fn in (farmhouse, barn, farmshed, well, haybale, woodfence):
    finish(fn(), R)
bpy.context.view_layer.update()
layout_row(R, 6.0)
