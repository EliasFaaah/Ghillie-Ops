exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_mats.py').read())
R = {}
rad = math.radians


def basehq():
    s = new_struct('BaseHQ', ['greenmetal', 'corrug', 'roughconc', 'frame', 'glass', 'steel', 'planks', 'olive', 'black', 'precast'])
    W, D, t = 16.0, 8.6, 0.25
    hx, hy = W / 2, D / 2
    H = 3.3
    s.box((0, 0, 0.1), (W + 0.6, D + 0.6, 0.4), 'roughconc')
    s.col((0, 0, 0.1), (W + 0.6, D + 0.6, 0.4))
    z0 = 0.3
    win = lambda c: (c, 1.5, 1.0, 1.2)
    s.wall('x', -hy, -hx, hx, z0, H, t, 'greenmetal', [(0.0, 1.3, 0, 2.2), win(-5.2), win(-2.6), win(2.6), win(5.2)])
    s.wall('x', hy, -hx, hx, z0, H, t, 'greenmetal', [win(-5.2), win(-1.7), win(1.7), (5.5, 1.1, 0, 2.1)])
    s.wall('y', -hx, -hy, hy, z0, H, t, 'greenmetal', [(0.0, 1.1, 0, 2.1)])
    s.wall('y', hx, -hy, hy, z0, H, t, 'greenmetal', [win(0.0)])
    for c in (-5.2, -2.6, 2.6, 5.2):
        s.window('x', -hy, c, 1.5, 1.0, 1.2, t, 'frame', 'glass', z0=z0)
    for c in (-5.2, -1.7, 1.7):
        s.window('x', hy, c, 1.5, 1.0, 1.2, t, 'frame', 'glass', z0=z0)
    s.window('y', hx, 0.0, 1.5, 1.0, 1.2, t, 'frame', 'glass', z0=z0)
    s.door('x', -hy, 0.0, 1.3, 2.2, t, 'olive', 'frame', z0=z0)
    s.door('y', -hx, 0.0, 1.1, 2.1, t, 'olive', 'frame', z0=z0)
    s.door('x', hy, 5.5, 1.1, 2.1, t, 'olive', 'frame', z0=z0)
    s.wall('y', -2.0, -hy + t / 2, hy - t / 2, z0, H, 0.15, 'greenmetal', [(-1.5, 1.0, 0, 2.05)])
    s.wall('y', 4.0, -hy + t / 2, hy - t / 2, z0, H, 0.15, 'greenmetal', [(1.5, 1.0, 0, 2.05)])
    s.gable('x', -hx, hx, -hy, hy, H, rad(9), 0.5, 0.12, 'corrug', gable_mat='greenmetal', gable_t=t)
    roof_cols(s, 'x', -hx, hx, -hy, hy, H, rad(9))
    s.box((0, -hy - 1.2, 0.15), (3.4, 1.8, 0.3), 'roughconc')
    s.col((0, -hy - 1.2, 0.15), (3.4, 1.8, 0.3))
    for px in (-1.5, 1.5):
        s.box((px, -hy - 1.9, 1.6), (0.14, 0.14, 3.2), 'steel')
    s.box((0, -hy - 1.3, 3.2), (3.8, 2.4, 0.1), 'corrug', rot=(rad(5), 0, 0))
    s.box((hx - 1.5, hy + 0.8, 0.55), (1.2, 0.7, 0.9), 'steel')
    s.col((hx - 1.5, hy + 0.8, 0.55), (1.2, 0.7, 0.9))
    s.box((-hx + 1.5, 0.0, H + 2.3), (0.1, 0.1, 4.6), 'steel')
    s.cyl((-hx + 1.5, -0.4, H + 3.6), 0.6, 0.05, 0.25, 12, 'steel', rot=(rad(90), 0, 0))
    for x in (-4.0, 0.0, 4.0):
        s.box((x, hy + 0.2, H + 0.5), (0.5, 0.3, 0.3), 'black')
    return s


def watchtower():
    s = new_struct('WatchTower', ['planks', 'oldplanks', 'corrug', 'sandbag', 'steel'])
    zp = 7.2
    for sx in (-1, 1):
        for sy in (-1, 1):
            base = (sx * 2.0, sy * 2.0, 0.0)
            top = (sx * 1.6, sy * 1.6, zp)
            s.beam(base, top, 0.3, 0.3, 'oldplanks')
    for z, k in ((1.8, 1.9), (3.9, 1.8), (6.0, 1.68)):
        for sx, sy, ex, ey in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            s.beam((sx * k, sy * k, z), (ex * k, ey * k, z), 0.14, 0.18, 'oldplanks')
    for (z0_, z1_, k0, k1) in ((0.0, 3.9, 2.0, 1.8), (3.9, 7.2, 1.8, 1.6)):
        for sx, sy, ex, ey in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            s.beam((sx * k0, sy * k0, z0_), (ex * k1, ey * k1, z1_), 0.1, 0.14, 'oldplanks')
    s.box((0, 0, zp + 0.1), (3.8, 3.8, 0.2), 'planks')
    s.col((0, 0, zp + 0.1), (3.8, 3.8, 0.2))
    s.wall('x', -1.8, -1.8, 1.8, zp + 0.2, zp + 1.2, 0.12, 'planks')
    s.wall('x', 1.8, -1.8, 1.8, zp + 0.2, zp + 1.2, 0.12, 'planks')
    s.wall('y', -1.8, -1.8, 1.8, zp + 0.2, zp + 1.2, 0.12, 'planks')
    s.wall('y', 1.8, -1.8, 1.8, zp + 0.2, zp + 1.2, 0.12, 'planks', [(0.0, 0.9, 0, 0.9)])
    for sx in (-1, 1):
        for sy in (-1, 1):
            s.box((sx * 1.75, sy * 1.75, zp + 1.9), (0.14, 0.14, 1.9), 'oldplanks')
    s.gable('x', -1.9, 1.9, -1.9, 1.9, zp + 2.8, rad(18), 0.4, 0.08, 'corrug')
    s.col((0, 0, zp + 3.05), (4.0, 4.0, 0.4))
    for k in range(14):
        s.box((2.1, 0.0, 0.2 + k * 0.5), (0.05, 0.6, 0.06), 'oldplanks')
    s.beam((2.1, -0.3, 0), (1.7, -0.3, zp), 0.06, 0.06, 'oldplanks')
    s.beam((2.1, 0.3, 0), (1.7, 0.3, zp), 0.06, 0.06, 'oldplanks')
    for sx in (-1, 1):
        for sy in (-1, 1):
            s.col((sx * 1.8, sy * 1.8, zp * 0.5), (0.4, 0.4, zp))
    return s


for fn in (basehq, watchtower):
    finish(fn(), R)
bpy.context.view_layer.update()
layout_row(R, 6.0)
