def pistol_body(g, size='full', PL='polymer', A='steel_dark'):
    c = 1.0 if size == 'full' else 0.84
    L = 0.186 if size == 'full' else 0.156
    top = 0.0215
    sl = extrude([(0.0, -0.0105), (0.0, 0.0175), (0.006, top), (L - 0.006, top), (L, 0.0195), (L, -0.0105)], 'YZ', -0.0132, 0.0132)
    sl = cut(sl, box((0.0135, 0.073 * c, 0.0085), (0.0100, 0.052 * c, 0.0150)), cyl('Y', (0.0, L - 0.004, 0.0), 0.0088, 0.0120, 24))
    frontcuts = [0.150, 0.158, 0.166] if size == 'full' else [0.128, 0.135, 0.142]
    sl = cut(sl, *[box((0.0, y, 0.0), (0.0300, 0.0026, 0.0800)) for y in frontcuts])
    sl = cut(sl, *[box((s * 0.0138, 0.010 + i * 0.0050, 0.0050), (0.0030, 0.0022, 0.0220)) for s in (1, -1) for i in range(6)])
    g.add(sl, A, 'slide', 0.0010)
    g.add(box((0.0040, 0.073 * c, 0.0085), (0.0070, 0.0300 * c, 0.0090)), 'steel', 'slide', 0.0005)
    g.add(extrude([(0.0, -0.0090), (0.0, 0.0), (0.014, 0.0), (0.014, -0.0090)], 'YZ', -0.0050, 0.0050), A, 'slide', 0.0004)
    rs = cut(box((0.0, 0.0105, top + 0.0030), (0.0120, 0.0100, 0.0060)), box((0.0, 0.0105, top + 0.0045), (0.0036, 0.0120, 0.0040)))
    g.add(rs, A, 'slide', 0.0005)
    g.add(extrude([(L - 0.016, top), (L - 0.016, top + 0.0042), (L - 0.010, top + 0.0046), (L - 0.005, top)], 'YZ', -0.0019, 0.0019), A, 'slide', 0.0004)
    g.add(cyl('Z', (0.0, L - 0.0105, top + 0.0040), 0.0010, 0.0010, 10), 'tritium', 'slide', 0.0, flat=True)
    for sx in (-1, 1):
        g.add(cyl('Z', (sx * 0.0050, 0.0105, top + 0.0062), 0.0009, 0.0010, 10), 'tritium', 'slide', 0.0, flat=True)
    g.add(cyl('Y', (0.0, L - 0.0035, 0.0), 0.0066, 0.0030, 20), 'steel', 'slide', 0.0003)
    g.add(cyl('Y', (0.0, L - 0.020, -0.0090), 0.0042, 0.0300, 14), 'steel', 'slide', 0.0)
    fr = extrude([(0.002, -0.0105), (L - 0.012, -0.0105), (L - 0.012, -0.0330 * c), (0.062 * c, -0.0305 * c), (0.040, -0.0200), (0.002, -0.0180)], 'YZ', -0.0128, 0.0128)
    g.add(fr, PL, 'body', 0.0010)
    gp = lambda i: (0.034 - 0.040 * i / 8, -0.018 - 0.102 * c * i / 8)
    g.add(loft_path([gp(i) for i in range(9)], lambda i: rrect(0.0300 * (1 + 0.04 * math.sin(math.pi * i / 8)), 0.0380 * (1 - 0.05 * i / 8), 0.0085, 3)), PL, 'body', 0.0010)
    g.add(extrude([(0.0, -0.0105), (-0.007, -0.0105), (-0.013, -0.0185), (0.002, -0.0185)], 'YZ', -0.0128, 0.0128), PL, 'body', 0.0008)
    g.add(ribbon([(0.0560 * c, -0.0300), (0.0585 * c, -0.0400), (0.0490 * c, -0.0485), (0.0340, -0.0485), (0.0270, -0.0330)], 0.0035, -0.0060, 0.0060), PL, 'body', 0.0008)
    for i in range(2):
        g.add(box((0.0, 0.118 * c + i * 0.020, -0.0338 * c), (0.0230, 0.0070, 0.0016)), PL, 'body', 0.0004)
    g.add(extrude([(0.075 * c, -0.0105), (0.092 * c, -0.0105), (0.090 * c, -0.0160), (0.074 * c, -0.0160)], 'YZ', -0.0150, 0.0150), A, 'body', 0.0006)
    g.add(extrude([(0.082 * c, -0.0150), (0.098 * c, -0.0140), (0.098 * c, -0.0125), (0.082 * c, -0.0125)], 'YZ', 0.0128, 0.0160), A, 'body', 0.0004)
    g.add(cyl('X', (-0.0136, 0.0430 * c, -0.0230), 0.0042, 0.0036, 16), A, 'body', 0.0005)
    g.add(pin_x(0.0120, -0.0130, 0.0022, -0.0148, 0.0148), A, 'body', 0.0004)
    g.add(pin_x(0.0520 * c, -0.0105, 0.0020, -0.0148, 0.0148), A, 'body', 0.0004)
    g.add(extrude([(0.0, 0.0), (0.0060, 0.0), (0.0075, -0.0130), (0.0190, -0.0340), (0.0140, -0.0350), (0.0030, -0.0160)], 'YZ', -0.0030, 0.0030), A, 'trigger', 0.0005)
    g.pivots['trigger'] = (0.0500 * c, -0.0150, 0.0)
    mp = [(0.0335 - 0.0400 * i / 9, -0.0105 - 0.1180 * c * i / 9) for i in range(10)]
    g.add(loft_path(mp, lambda i: rrect(0.0235 if i < 9 else 0.0255, 0.0300 if i < 9 else 0.0330, 0.0045, 2)), 'polymer_smooth', 'magazine', 0.0008)
    g.pivots['magazine'] = (0.0, mp[0][0], mp[0][1])
    return L, top, mp


def build_pistol():
    purge('WpnPistol')
    g = G('WpnPistol')
    L, top, mp = pistol_body(g)
    g.finish()
    zmin = zmin_S(g)
    ax = (-0.0040, 0.0400, 0.1100)
    gr = grip_frame('R', (0.0, 0.0150, -0.0600), ax, (-1.0, 0.45, 0.0), 0.046, 0.030, 0.012)
    gl = grip_frame('L', (0.0, 0.0150, -0.1000), ax, (1.0, 0.35, 0.0), 0.042, 0.030, 0.0)
    g.socket('grip_r', gr.translation, gr.to_3x3())
    g.socket('grip_l', gl.translation, gl.to_3x3())
    g.socket('muzzle', (0, L + 0.001, 0))
    g.socket('eject', (0.0140, 0.073, 0.0100))
    g.socket('mag', (0.0, mp[0][0], mp[0][1]))
    g.socket('ads_anchor', (0, -0.092, top + 0.0072))
    g.socket('sight', (0, L - 0.011, top + 0.0072))
    g.socket('charge', (0.0, 0.020, top - 0.004))
    assemble(g, (0.0, 0.0150, zmin))
    g.zmin = zmin
    return g


PARAMS['WpnPistol'] = dict(
    id='pistol', kind='pistol', parts=['slide', 'trigger', 'magazine'],
    hip=(0.065, 0.34, -0.2, 3, 0, 0), sprint=(0.085, 0.24, -0.32, 33, -14, 16), down=(0.035, 0.12, -0.6, 11, -30, 10),
    tilt=(-0.03, -0.03, 0.05, 8, 16, 22), tilt_charge=(-0.02, -0.03, 0.05, 10, 22, 14),
    mag_dir=(0, -0.35, -0.94), pouch=(-0.1, 0.34, -0.14), butt=(0.0, -0.05, 0.10),
    bolt=dict(dir=(0, -1, 0), travel=0.034, part='slide'), kick=(0.014, 1.8), trigger_deg=14,
    curl_r={'index': (-22, -32, -16), 'middle': (-62, -84, -58), 'ring': (-64, -86, -60), 'pinky': (-66, -88, -62), 'thumb': (-6, -18, -14, 0)},
    curl_l={'index': (-58, -80, -55), 'middle': (-60, -82, -58), 'ring': (-62, -84, -60), 'pinky': (-64, -86, -62), 'thumb': (-4, -8, -6, 0)},
)
