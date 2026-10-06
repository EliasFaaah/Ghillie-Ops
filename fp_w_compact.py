def build_compact():
    purge('WpnCompact')
    g = G('WpnCompact')
    L, top, mp = pistol_body(g, 'compact', 'polymer_fde', 'steel_dark')
    for grp in g.groups.values():
        for v in grp['bm'].verts:
            v.co.x *= 0.82
    g.finish()
    zmin = zmin_S(g)
    ax = (-0.0040, 0.0400, 0.1100)
    gr = grip_frame('R', (0.0, 0.0150, -0.0560), ax, (-1.0, 0.45, 0.0), 0.046, 0.026, 0.010)
    gl = grip_frame('L', (0.0, 0.0150, -0.0900), ax, (1.0, 0.35, 0.0), 0.042, 0.026, 0.0)
    g.socket('grip_r', gr.translation, gr.to_3x3())
    g.socket('grip_l', gl.translation, gl.to_3x3())
    g.socket('muzzle', (0, L + 0.001, 0))
    g.socket('eject', (0.0115, 0.062, 0.0100))
    g.socket('mag', (0.0, mp[0][0], mp[0][1]))
    g.socket('ads_anchor', (0, -0.088, top + 0.0072))
    g.socket('sight', (0, L - 0.011, top + 0.0072))
    g.socket('charge', (0.0, 0.020, top - 0.004))
    assemble(g, (0.0, 0.0150, zmin))
    g.zmin = zmin
    return g


PARAMS['WpnCompact'] = dict(
    id='compact', kind='pistol', parts=['slide', 'trigger', 'magazine'],
    hip=(0.065, 0.34, -0.2, 3, 0, 0), sprint=(0.085, 0.24, -0.32, 33, -14, 16), down=(0.035, 0.12, -0.6, 11, -30, 10),
    tilt=(-0.03, -0.03, 0.05, 8, 16, 22), tilt_charge=(-0.02, -0.03, 0.05, 10, 22, 14),
    mag_dir=(0, -0.35, -0.94), pouch=(-0.1, 0.34, -0.14), butt=(0.0, -0.05, 0.10),
    bolt=dict(dir=(0, -1, 0), travel=0.030, part='slide'), kick=(0.016, 2.2), trigger_deg=14,
    curl_r={'index': (-22, -32, -16), 'middle': (-62, -84, -58), 'ring': (-64, -86, -60), 'pinky': (-66, -88, -62), 'thumb': (-6, -18, -14, 0)},
    curl_l={'index': (-58, -80, -55), 'middle': (-60, -82, -58), 'ring': (-62, -84, -60), 'pinky': (-64, -86, -62), 'thumb': (-4, -8, -6, 0)},
)
