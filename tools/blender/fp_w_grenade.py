def ribbon_xz(path, thick, lo, hi):
    pts = [Vector(p) for p in path]
    left, right = [], []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        n = Vector((-t.y, t.x))
        left.append(tuple(p + n * thick / 2))
        right.append(tuple(p - n * thick / 2))
    return extrude(left + right[::-1], 'XZ', lo, hi)


def build_grenade():
    purge('WpnGrenade')
    g = G('WpnGrenade')
    OD = 'od_steel'
    R = 0.0320
    cz = 0.0330
    zt = cz + R
    prof = [(cz - R, 0.0)] + [(cz - R * math.cos(math.radians(7.5 * i)), R * math.sin(math.radians(7.5 * i))) for i in range(1, 21)]
    prof += [(zt - 0.0040, 0.0150), (zt + 0.0040, 0.0140), (zt + 0.0120, 0.0125), (zt + 0.0200, 0.0115), (zt + 0.0220, 0.0095), (zt + 0.0220, 0.0)]
    g.add(lathe(prof, 'Z', (0, 0, 0), 44), OD, 'grenade', 0.0008)
    g.add(cyl('Z', (0.0, 0.0, cz + R * 0.30), R * 0.972, 0.0050, 44), 'yellow_paint', 'grenade', 0.0, flat=True)
    g.add(cyl('Z', (0.0, 0.0, zt + 0.0100), 0.0132, 0.0040, 24), 'steel', 'grenade', 0.0004)
    g.add(cyl('Z', (0.0150, 0.0, zt + 0.0040), 0.0040, 0.0120, 12), 'steel_dark', 'grenade', 0.0003)
    hx, hz = 0.0115, zt + 0.0180
    spoon = ribbon_xz([(hx, hz + 0.0040), (hx + 0.0070, hz - 0.0020), (R * 1.06, cz + R * 0.55), (R * 1.07, cz + R * 0.05), (R * 1.04, cz - R * 0.45), (R * 0.97, cz - R * 0.72)], 0.0024, -0.0100, 0.0100)
    g.add(spoon, OD, 'spoon', 0.0004)
    g.pivots['spoon'] = (hx, 0.0, hz)
    zp = zt + 0.0090
    g.add(cyl('X', (-0.0030, 0.0, zp), 0.0014, 0.0300, 10), 'steel', 'pin', 0.0002)
    ring = [Vector((-0.0285 + 0.0105 * math.cos(2 * math.pi * i / 24), 0.0, zp + 0.0105 * math.sin(2 * math.pi * i / 24))) for i in range(25)]
    g.add(sweep(ring, [0.0013] * 25, 8, caps=False), 'steel', 'pin', 0.0)
    g.pivots['pin'] = (0.0, 0.0, zp)
    g.pivots['grenade'] = (0.0, 0.0, cz)
    g.finish()
    gr = grip_frame('R', (0.0, 0.0, cz), (0, 0, 1), (-1.0, 0.25, 0.0), 0.046, 0.046, -0.002)
    gl = grip_frame('L', (-0.0285, 0.0, zp), (0, 0, 1), (1.0, 0.0, 0.0), 0.040, 0.030, 0.0)
    g.socket('grip_r', gr.translation, gr.to_3x3())
    g.socket('grip_l', gl.translation, gl.to_3x3())
    g.socket('muzzle', (0, 0, cz))
    g.socket('eject', (0, 0, cz))
    g.socket('mag', (0, 0, cz))
    g.socket('ads_anchor', (0, -0.1, cz + 0.1))
    g.socket('sight', (0, 0, zt + 0.02))
    assemble(g, (0.0, 0.0, 0.0))
    g.zmin = 0.0
    return g


PARAMS['WpnGrenade'] = dict(
    id='frag', kind='grenade', parts=['grenade', 'spoon', 'pin'],
    hip=(0.14, 0.38, -0.16, -4, 4, 0), sprint=(0.16, 0.2, -0.26, 12, -6, 8), down=(0.16, 0.18, -0.54, -4, -20, 0),
    free_l=(-0.12, 0.32, -0.19), ready=(0.15, 0.3, -0.09, 6, 38, 0), back=(0.21, -0.02, -0.1, 26, 74, 8), fwd=(0.1, 0.46, -0.11, -10, -12, 0),
    curl_r={'index': (-52, -68, -48), 'middle': (-54, -70, -50), 'ring': (-56, -72, -52), 'pinky': (-58, -74, -54), 'thumb': (-10, -22, -14, 0)},
    curl_l={'index': (-30, -40, -30), 'middle': (-34, -44, -34), 'ring': (-38, -48, -38), 'pinky': (-42, -52, -42), 'thumb': (-8, -14, -10, 0)},
)
