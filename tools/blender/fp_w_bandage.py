def build_bandage():
    purge('WpnBandage')
    g = G('WpnBandage')
    R = 0.0285
    cz = R
    L = 0.0760
    cloth, od = 'bandage', 'olive'
    prof = [(-L / 2, 0.0), (-L / 2, R * 0.78), (-L / 2 + 0.0030, R * 0.96), (-L / 2 + 0.0100, R), (L / 2 - 0.0100, R), (L / 2 - 0.0030, R * 0.96), (L / 2, R * 0.78), (L / 2, 0.0)]
    body = lathe(prof, 'Y', (0.0, 0.0, cz), 40)
    g.add(body, cloth, 'roll', 0.0006)
    for sy in (-1, 1):
        g.add(lathe([(sy * L / 2 - sy * 0.0100, R * 1.003), (sy * L / 2 - sy * 0.0100, R * 1.006), (sy * L / 2 - sy * 0.0010, R * 1.006), (sy * L / 2 - sy * 0.0010, R * 1.003)], 'Y', (0.0, 0.0, cz), 40, closed=True), od, 'roll', 0.0, flat=True)
    g.add(box((0.0, 0.0, cz + R * 1.01), (0.0300, 0.0300, 0.0042)), od, 'roll', 0.0010)
    g.add(box((0.0, 0.0, cz + R * 1.01 + 0.0030), (0.0200, 0.0420, 0.0030)), 'polymer', 'roll', 0.0008)
    g.add(cyl('Z', (-0.0070, 0.0, cz + R * 1.01 + 0.0050), 0.0030, 0.0020, 12), 'steel', 'roll', 0.0)
    g.add(box((-R * 0.99, 0.0, cz), (0.0040, 0.0480, 0.0180)), 'white_paint', 'roll', 0.0008)
    g.pivots['roll'] = (0.0, 0.0, cz)
    for k in range(1, 7):
        seg = box((-0.0190, 0.0, 0.0), (0.0380, 0.0740, 0.0016))
        g.add(seg, cloth, f'strip_{k:02d}', 0.0003)
        g.pivots[f'strip_{k:02d}'] = (0.0, 0.0, 0.0)
    for k in range(1, 6):
        ring = lathe([(-0.0170, 0.0640), (0.0170, 0.0640), (0.0170, 0.0600), (-0.0170, 0.0600)], 'Y', (0.0, 0.0, 0.0), 40, closed=True)
        g.add(ring, cloth, f'wrap_{k:02d}', 0.0004)
        g.pivots[f'wrap_{k:02d}'] = (0.0, 0.0, 0.0)
    g.finish(bevel_segments=1)
    zmin = zmin_S(g)
    gr = grip_frame('R', (0.0, 0.0, cz), (0, 1, 0), (-1.0, 0.0, 0.2), 0.046, 0.044, 0.0)
    gl = grip_frame('L', (-R, 0.0, cz), (0, 1, 0), (1.0, 0.0, 0.0), 0.040, 0.034, 0.0)
    g.socket('grip_r', gr.translation, gr.to_3x3())
    g.socket('grip_l', gl.translation, gl.to_3x3())
    g.socket('muzzle', (0, 0, cz))
    g.socket('eject', (0, 0, cz))
    g.socket('mag', (0, 0, cz))
    g.socket('ads_anchor', (0, -0.1, cz + 0.1))
    g.socket('sight', (0, 0, cz))
    assemble(g, (0.0, 0.0, 0.0))
    g.zmin = 0.0
    return g


PARAMS['WpnBandage'] = dict(
    id='bandage', kind='bandage', parts=['roll'] + [f'strip_{k:02d}' for k in range(1, 7)] + [f'wrap_{k:02d}' for k in range(1, 6)],
    hidden=[f'strip_{k:02d}' for k in range(1, 7)] + [f'wrap_{k:02d}' for k in range(1, 6)],
    hip=(0.14, 0.38, -0.16, -6, 6, 0), sprint=(0.16, 0.2, -0.28, 10, -4, 8), down=(0.15, 0.2, -0.54, 0, -20, 0),
    free_l=(-0.12, 0.32, -0.19), work_l=(-0.03, 0.42, -0.11),
    curl_r={'index': (-42, -60, -44), 'middle': (-46, -64, -48), 'ring': (-50, -68, -52), 'pinky': (-54, -72, -56), 'thumb': (-10, -22, -14, 0)},
    curl_l={'index': (-30, -40, -30), 'middle': (-34, -44, -34), 'ring': (-38, -48, -38), 'pinky': (-42, -52, -42), 'thumb': (-8, -14, -10, 0)},
)
