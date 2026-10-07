exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_mats.py').read())
R = {}
rad = math.radians


def plinth(s, hx, hy, t, z0, mat='stone'):
    s.wall('x', -hy, -hx - 0.05, hx + 0.05, -0.4, z0, t + 0.08, mat)
    s.wall('x', hy, -hx - 0.05, hx + 0.05, -0.4, z0, t + 0.08, mat)
    s.wall('y', -hx, -hy, hy, -0.4, z0, t + 0.08, mat)
    s.wall('y', hx, -hy, hy, -0.4, z0, t + 0.08, mat)


def house_a():
    s = new_struct('HouseA', ['plaster', 'plaster2', 'stone', 'roof_red', 'planks', 'frame', 'glass', 'brick', 'roughconc'])
    W, D, t = 9.0, 7.0, 0.32
    hx, hy = W / 2, D / 2
    z0, zf1, zf2, ztop = 0.35, 3.25, 3.55, 6.15
    plinth(s, hx, hy, t, z0)
    win = lambda c, sill=0.95: (c, 1.1, sill, 1.3)
    front = [(0, 1.1, 0, 2.15), win(-2.7), win(2.7)]
    back = [(0, 1.1, 0, 2.15), win(-2.7), win(2.7)]
    s.wall('x', -hy, -hx, hx, z0, zf1, t, 'plaster', front)
    s.wall('x', hy, -hx, hx, z0, zf1, t, 'plaster', back)
    s.wall('y', -hx, -hy, hy, z0, zf1, t, 'plaster', [win(0)])
    s.wall('y', hx, -hy, hy, z0, zf1, t, 'plaster', [win(0)])
    for c in (-2.7, 2.7):
        s.window('x', -hy, c, 1.1, 0.95, 1.3, t, 'frame', 'glass', z0=z0, shutter='planks')
        s.window('x', hy, c, 1.1, 0.95, 1.3, t, 'frame', 'glass', z0=z0)
    s.window('y', -hx, 0, 1.1, 0.95, 1.3, t, 'frame', 'glass', z0=z0)
    s.window('y', hx, 0, 1.1, 0.95, 1.3, t, 'frame', 'glass', z0=z0)
    s.door('x', -hy, 0, 1.1, 2.15, t, 'planks', 'frame', z0=z0)
    s.door('x', hy, 0, 1.1, 2.15, t, 'planks', 'frame', z0=z0)
    s.box((0, 0, zf1 + 0.15), (W - 0.1, D - 0.1, 0.3), 'planks')
    s.col((0, 0, zf1 + 0.15), (W - 0.1, D - 0.1, 0.3))
    up = lambda c: (c, 1.0, 0.85, 1.3)
    s.wall('x', -hy, -hx, hx, zf2, ztop, t, 'plaster', [up(-3), up(0), up(3)])
    s.wall('x', hy, -hx, hx, zf2, ztop, t, 'plaster', [up(-3), up(0), up(3)])
    s.wall('y', -hx, -hy, hy, zf2, ztop, t, 'plaster', [up(0)])
    s.wall('y', hx, -hy, hy, zf2, ztop, t, 'plaster', [up(0)])
    for c in (-3, 0, 3):
        s.window('x', -hy, c, 1.0, 0.85, 1.3, t, 'frame', 'glass', z0=zf2)
        s.window('x', hy, c, 1.0, 0.85, 1.3, t, 'frame', 'glass', z0=zf2)
    for x in (-hx, hx):
        s.window('y', x, 0, 1.0, 0.85, 1.3, t, 'frame', 'glass', z0=zf2)
    s.wall('x', 0.8, -hx + t / 2, hx - t / 2, z0, zf1, 0.16, 'plaster2', [(-1.8, 1.0, 0, 2.05)])
    s.wall('x', 0.8, -hx + t / 2, hx - t / 2, zf2, ztop, 0.16, 'plaster2', [(1.8, 1.0, 0, 2.05)])
    s.gable('x', -hx, hx, -hy, hy, ztop, rad(38), 0.55, 0.22, 'roof_red', gable_mat='plaster', gable_t=t)
    roof_cols(s, 'x', -hx, hx, -hy, hy, ztop, rad(38))
    s.box((3.0, 0.5, ztop + 1.6), (0.8, 0.8, 3.7), 'brick')
    s.col((3.0, 0.5, ztop + 1.6), (0.8, 0.8, 3.7))
    s.box((3.0, 0.5, ztop + 3.5), (1.0, 1.0, 0.12), 'roughconc')
    s.box((0, -hy - 0.6, 0.12), (2.4, 1.2, 0.28), 'stone')
    s.col((0, -hy - 0.6, 0.12), (2.4, 1.2, 0.28))
    return s


def house_b():
    s = new_struct('HouseB', ['brick', 'stone', 'roof_dark', 'planks', 'frame', 'glass', 'plaster2', 'roughconc', 'planks_grey'])
    W, D, t = 7.4, 9.2, 0.34
    hx, hy = W / 2, D / 2
    z0, ztop = 0.35, 3.3
    plinth(s, hx, hy, t, z0)
    win = lambda c: (c, 1.0, 0.95, 1.25)
    s.wall('x', -hy, -hx, hx, z0, ztop, t, 'brick', [(-1.5, 1.05, 0, 2.15), win(1.8)])
    s.wall('x', hy, -hx, hx, z0, ztop, t, 'brick', [win(-1.8), win(1.8)])
    s.wall('y', -hx, -hy, hy, z0, ztop, t, 'brick', [win(-2.5), win(2.4)])
    s.wall('y', hx, -hy, hy, z0, ztop, t, 'brick', [win(-2.5), win(2.4)])
    s.window('x', -hy, 1.8, 1.0, 0.95, 1.25, t, 'frame', 'glass', z0=z0, shutter='planks')
    for c in (-1.8, 1.8):
        s.window('x', hy, c, 1.0, 0.95, 1.25, t, 'frame', 'glass', z0=z0)
    for x in (-hx, hx):
        for c in (-2.5, 2.4):
            s.window('y', x, c, 1.0, 0.95, 1.25, t, 'frame', 'glass', z0=z0)
    s.door('x', -hy, -1.5, 1.05, 2.15, t, 'planks', 'frame', z0=z0)
    s.box((0, 0, z0 - 0.02), (W - 0.1, D - 0.1, 0.1), 'planks')
    s.col((0, 0, 0.1), (W - 0.1, D - 0.1, 0.4))
    s.wall('y', 0.4, -hy + t / 2, hy - t / 2, z0, ztop, 0.16, 'plaster2', [(-1.0, 1.0, 0, 2.05)])
    s.gable('y', -hy, hy, -hx, hx, ztop, rad(46), 0.5, 0.22, 'roof_dark', gable_mat='brick', gable_t=t)
    roof_cols(s, 'y', -hy, hy, -hx, hx, ztop, rad(46))
    s.box((hx - 0.2, 1.5, ztop + 2.4), (0.75, 0.75, 3.4), 'brick')
    s.col((hx - 0.2, 1.5, ztop + 2.4), (0.75, 0.75, 3.4))
    s.box((hx - 0.2, 1.5, ztop + 4.15), (0.95, 0.95, 0.12), 'roughconc')
    for px in (-2.9, 0.1):
        s.box((px, -hy - 1.6, 1.3), (0.16, 0.16, 2.6), 'planks')
    s.box((-1.4, -hy - 0.85, 2.7), (3.5, 2.1, 0.14), 'roof_dark', rot=(rad(8), 0, 0))
    s.box((-1.4, -hy - 0.85, 0.1), (3.6, 2.2, 0.2), 'stone')
    s.col((-1.4, -hy - 0.85, 0.1), (3.6, 2.2, 0.25))
    return s


def house_c():
    s = new_struct('HouseC', ['concrete', 'roughconc', 'corrug', 'planks_grey', 'frame', 'glass', 'rusty', 'greenmetal'])
    W, D, t = 11.0, 6.2, 0.3
    hx, hy = W / 2, D / 2
    z0, ztop = 0.3, 2.95
    plinth(s, hx, hy, t, z0, 'roughconc')
    big = lambda c: (c, 1.6, 0.9, 1.3)
    s.wall('x', -hy, -hx, hx, z0, ztop, t, 'concrete', [(-3.5, 1.0, 0, 2.1), big(-0.8), big(3.0)])
    s.wall('x', hy, -hx, hx, z0, ztop, t, 'concrete', [big(-3.0), big(0.0), (3.6, 1.0, 0, 2.1)])
    s.wall('y', -hx, -hy, hy, z0, ztop, t, 'concrete', [(0.0, 1.2, 0.9, 1.3)])
    s.wall('y', hx, -hy, hy, z0, ztop, t, 'concrete', [(0.0, 1.2, 0.9, 1.3)])
    for c in (-0.8, 3.0):
        s.window('x', -hy, c, 1.6, 0.9, 1.3, t, 'frame', 'glass', z0=z0)
    for c in (-3.0, 0.0):
        s.window('x', hy, c, 1.6, 0.9, 1.3, t, 'frame', 'glass', z0=z0)
    for x in (-hx, hx):
        s.window('y', x, 0.0, 1.2, 0.9, 1.3, t, 'frame', 'glass', z0=z0)
    s.door('x', -hy, -3.5, 1.0, 2.1, t, 'planks_grey', 'frame', z0=z0)
    s.door('x', hy, 3.6, 1.0, 2.1, t, 'planks_grey', 'frame', z0=z0)
    s.box((0, 0, z0 - 0.03), (W - 0.1, D - 0.1, 0.12), 'roughconc')
    s.col((0, 0, 0.1), (W - 0.1, D - 0.1, 0.4))
    s.wall('y', -1.5, -hy + t / 2, hy - t / 2, z0, ztop, 0.15, 'concrete', [(0.0, 1.0, 0, 2.05)])
    s.wall('y', 2.2, -hy + t / 2, hy - t / 2, z0, ztop, 0.15, 'concrete', [(-0.5, 1.0, 0, 2.05)])
    s.gable('x', -hx, hx, -hy, hy, ztop, rad(17), 0.45, 0.14, 'corrug', gable_mat='concrete', gable_t=t)
    roof_cols(s, 'x', -hx, hx, -hy, hy, ztop, rad(17))
    s.box((-3.6, hy - 0.8, ztop + 1.2), (0.55, 0.55, 2.6), 'roughconc')
    s.col((-3.6, hy - 0.8, ztop + 1.2), (0.55, 0.55, 2.6))
    for px in (hx + 0.2, hx + 5.6):
        for py in (-hy + 0.3, hy - 0.3):
            s.box((px, py, 1.4), (0.18, 0.18, 2.8), 'rusty')
    s.box((hx + 2.9, 0, 2.9), (6.0, D + 0.6, 0.12), 'corrug', rot=(0, rad(-3), 0))
    s.box((hx + 2.9, 0, 0.04), (5.6, D - 0.4, 0.1), 'roughconc')
    return s


def chapel():
    s = new_struct('Chapel', ['stone', 'stonedark', 'roof_dark', 'planks', 'frame', 'glass', 'roughconc', 'steel'])
    W, D, t = 6.4, 10.0, 0.5
    hx, hy = W / 2, D / 2
    z0, zw = 0.35, 4.8
    plinth(s, hx, hy, t, z0, 'stonedark')
    tall = lambda c: (c, 0.8, 1.7, 1.9)
    s.wall('y', -hx, -hy, hy, z0, zw, t, 'stone', [tall(-3), tall(0), tall(3)])
    s.wall('y', hx, -hy, hy, z0, zw, t, 'stone', [tall(-3), tall(0), tall(3)])
    s.wall('x', hy, -hx, hx, z0, zw, t, 'stone', [(0.0, 0.9, 2.2, 1.7)])
    s.wall('x', -hy, -hx, hx, z0, zw, t, 'stone', [(0.0, 1.6, 0, 2.5)])
    for x in (-hx, hx):
        for c in (-3, 0, 3):
            s.window('y', x, c, 0.8, 1.7, 1.9, t, 'frame', 'glass', z0=z0)
    s.window('x', hy, 0.0, 0.9, 2.2, 1.7, t, 'frame', 'glass', z0=z0)
    s.box((0, -hy, z0 + 1.25), (1.5, 0.08, 2.5), 'planks')
    s.col((0, -hy, z0 + 1.25), (1.6, t, 2.5))
    s.box((0, 0, z0 - 0.02), (W - 0.2, D - 0.2, 0.1), 'roughconc')
    s.col((0, 0, 0.1), (W - 0.2, D - 0.2, 0.4))
    s.gable('y', -hy, hy, -hx, hx, zw, rad(42), 0.55, 0.22, 'roof_dark', gable_mat='stone', gable_t=t)
    roof_cols(s, 'y', -hy, hy, -hx, hx, zw, rad(42))
    for y in (-4.5, -1.5, 1.5, 4.5):
        for x in (-hx - 0.1, hx + 0.1):
            s.box((x, y, 2.3), (0.5, 0.5, 4.6), 'stone')
    tz = 9.6
    tw = 4.0
    ty = -hy - tw / 2 + t / 2
    s.wall('x', ty - tw / 2 + t / 2, -tw / 2, tw / 2, z0, tz, t, 'stone', [(0.0, 1.8, 0, 2.7), (0.0, 0.7, 7.0, 1.8)])
    s.box((0, ty - tw / 2 + t / 2, z0 + 1.35), (1.7, 0.1, 2.7), 'planks')
    s.col((0, ty - tw / 2 + t / 2, z0 + 1.35), (1.8, t, 2.7))
    s.wall('x', -hy, -tw / 2, tw / 2, zw, tz, t, 'stone')
    s.wall('y', -tw / 2 + t / 2, ty - tw / 2 + t, ty + tw / 2 - t, z0, tz, t, 'stone', [(ty, 0.7, 7.0, 1.8)])
    s.wall('y', tw / 2 - t / 2, ty - tw / 2 + t, ty + tw / 2 - t, z0, tz, t, 'stone', [(ty, 0.7, 7.0, 1.8)])
    s.box((0, ty, 3.2), (tw - 0.2, tw - 0.2, 0.25), 'planks')
    s.box((0, ty, 6.5), (tw - 0.2, tw - 0.2, 0.25), 'planks')
    s.pyramid((0, ty, tz), tw + 0.7, tw + 0.7, 3.8, 'roof_dark')
    s.box((0, ty, tz + 4.2), (0.1, 0.1, 1.2), 'steel')
    s.box((0, ty, tz + 4.5), (0.6, 0.1, 0.1), 'steel')
    s.col((0, ty, tz + 1.9), (tw - 0.8, tw - 0.8, 3.8))
    s.box((0, -hy - tw - 0.3, 0.1), (2.6, 1.0, 0.25), 'stonedark')
    s.col((0, -hy - tw - 0.3, 0.1), (2.6, 1.0, 0.25))
    return s


for fn in (house_a, house_b, house_c, chapel):
    finish(fn(), R)
bpy.context.view_layer.update()
layout_row(R, 7.0)
