RELAX = {'index': (-22, -30, -18), 'middle': (-26, -34, -22), 'ring': (-30, -38, -26), 'pinky': (-34, -42, -30), 'thumb': (-4, -10, -8, 0)}
MAGCURL = {'index': (-40, -55, -40), 'middle': (-44, -58, -44), 'ring': (-46, -60, -46), 'pinky': (-48, -62, -48), 'thumb': (-8, -18, -14, 0)}
CHARGECURL = {'index': (-30, -50, -30), 'middle': (-34, -54, -34), 'ring': (-36, -56, -36), 'pinky': (-38, -58, -38), 'thumb': (-5, -12, -10, 0)}


def padd(a, b):
    return tuple(x + y for x, y in zip(a, b))


def firearm_clips(wr):
    P = wr.P
    hip6 = P['hip']
    hip = pose_m(hip6)
    ads = wr.pose_ads()
    GR, GL = wr.sock['grip_r'], wr.sock['grip_l']
    cR = curl_list(P['curl_r'])
    cL = curl_list(P['curl_l'])
    cRelax = curl_list(RELAX)
    cMag = curl_list(MAGCURL)
    cCharge = curl_list(CHARGECURL)
    has_mag = 'magazine' in wr.parts
    mag_dir = Vector(P['mag_dir']).normalized() if has_mag else Vector((0, 0, -1))
    piv = wr.pivot['magazine'] if has_mag else Vector((0, 0, 0))
    pouch = P['pouch']
    butt = Vector(P['butt'])
    bolt = P.get('bolt')
    only_base = P.get('only_base', False)
    kick = P.get('kick', (0.016, 1.2))

    def attached(Wm, a=None, b=None, parts=None):
        return St(wr, Wm, Wm @ GR, Wm @ GL, a or cR, b or cL, parts)

    def idle(t):
        w = 2 * math.pi * t / 3.2
        d = Matrix.Translation((0.0012 * math.sin(w + 0.4), 0, 0.0016 * math.sin(w))) @ Matrix.Rotation(math.radians(0.3 * math.sin(w + 1.0)), 4, 'X')
        return attached(d @ hip)

    def adsf(t):
        w = 2 * math.pi * t / 3.6
        d = Matrix.Translation((0.0004 * math.sin(w + 0.4), 0, 0.0007 * math.sin(w))) @ Matrix.Rotation(math.radians(0.08 * math.sin(w + 1.0)), 4, 'X')
        return attached(d @ ads)

    def sprint(t):
        w = 2 * math.pi * t / 0.72
        a = math.sin(w)
        d = Matrix.Translation((0.010 * a, 0.0, 0.014 * abs(math.sin(w * 0.5 * 2 / 2))))
        d = d @ Matrix.Rotation(math.radians(1.6 * math.sin(w)), 4, 'Y') @ Matrix.Rotation(math.radians(1.2 * math.cos(w * 2)), 4, 'X')
        return attached(d @ pose_m(P['sprint']), None, None)

    def draw(t):
        down = P['down']
        mid = padd(hip6, (0.0, 0.012, 0.014, -2.5, 3.0, 0.0))
        tr = Track([(0, down), (0.30, mid), (0.50, hip6)])
        w = smooth(0.06, 0.34, t)
        return attached(pose_m(tr(t)), lerp_list(cRelax, cR, w), lerp_list(cRelax, cL, w))

    def holster(t):
        down = P['down']
        mid = padd(hip6, (0.0, 0.006, 0.020, -2.0, 4.0, 0.0))
        tr = Track([(0, hip6), (0.14, mid), (0.36, down)])
        w = 1 - smooth(0.04, 0.26, t)
        return attached(pose_m(tr(t)), lerp_list(cRelax, cR, w), lerp_list(cRelax, cL, w))

    def fire(t):
        k = Track([(0, 0.0), (0.022, kick[0]), (0.075, kick[0] * 0.35), (0.14, 0.0)])(t)
        pitch = Track([(0, 0.0), (0.022, kick[1]), (0.075, kick[1] * 0.4), (0.14, 0.0)])(t)
        pv = hip @ butt
        D = Matrix.Translation(pv) @ Matrix.Rotation(math.radians(pitch), 4, 'X') @ Matrix.Translation(-pv)
        Wm = Matrix.Translation((0, -k, 0)) @ D @ hip
        trig = Track([(0, 0.0), (0.012, 1.0), (0.07, 0.0), (0.14, 0.0)])(t)
        cr = list(cR)
        cr[0] = cR[0] - 12 * trig
        cr[1] = cR[1] - 10 * trig
        parts = {}
        if bolt:
            b = Track([(0, 0.0), (0.030, 1.0), (0.050, 1.0), (0.105, 0.0), (0.14, 0.0)])(t)
            bp = bolt.get('part', 'bolt')
            parts[bp] = (wr.rest[bp] @ Matrix.Translation(Vector(bolt['dir']) * bolt['travel'] * b), 1.0)
        if 'trigger' in wr.parts:
            parts['trigger'] = (wr.rest['trigger'] @ Matrix.Rotation(math.radians(P.get('trigger_deg', 14) * trig), 4, 'X'), 1.0)
        return attached(Wm, cr, None, parts)

    def mag_frames(Wm):
        rest = Wm @ Matrix.Translation(piv)
        pulled = Wm @ Matrix.Translation(piv + mag_dir * 0.20)
        below = Wm @ Matrix.Translation(piv + mag_dir * 0.13)
        pouch_w = Matrix.Translation(pouch) @ Euler((math.radians(-25), math.radians(10), math.radians(20)), 'XYZ').to_matrix().to_4x4()
        return rest, pulled, below, pouch_w

    GM = Matrix.Translation(piv).inverted() @ grip_frame('L', piv + mag_dir * 0.075, -mag_dir, (1, 0.0, 0), 0.045, 0.030, 0.0)
    GC = None
    if 'charge' in wr.sock:
        GC = grip_frame('L', wr.sock['charge'].translation, (0, 1, 0), (0, 0, -1), 0.050, 0.032, 0.0)

    def reload(empty):
        T = 3.05 if empty else 2.30
        t_reach, t_grab, t_pull, t_pouch, t_hide, t_show = 0.30, 0.52, 0.66, 0.96, 0.98, 1.06
        t_below, t_seat, t_rel, t_back = 1.40, 1.56, 1.62, 1.98
        tilt = padd(hip6, P['tilt'])
        wk = [(0, hip6), (0.30, tilt), (1.62, tilt), (1.98, hip6), (T, hip6)]
        if empty:
            t_back = 1.84
            ctilt = padd(hip6, P['tilt_charge'])
            wk = [(0, hip6), (0.30, tilt), (1.62, tilt), (1.90, ctilt), (2.40, ctilt), (2.80, hip6), (T, hip6)]
        W_tr = Track(wk)

        def sampler(t):
            Wm = pose_m(W_tr(t))
            rest, pulled, below, pouch_w = mag_frames(Wm)
            if t < t_grab:
                mw = rest
            elif t < t_pull:
                s = smooth(t_grab, t_pull, t)
                mw = mix_m([rest, pulled], [1 - s, s])
            elif t < t_hide:
                s = smooth(t_pull, t_pouch, t)
                mw = mix_m([pulled, pouch_w], [1 - s, s])
            elif t < t_show:
                mw = pouch_w
            elif t < t_below:
                s = smooth(t_show, t_below, t)
                mw = mix_m([pouch_w, below], [1 - s, s])
            elif t < t_seat:
                s = smooth(t_below, t_seat, t)
                mw = mix_m([below, rest], [1 - s, s])
            else:
                mw = rest
            wmag = smooth(t_reach, t_grab, t) * (1 - smooth(t_rel, t_back, t))
            Lg = Wm @ GL
            Lm = mw @ GM
            wchg = 0.0
            if empty and GC is not None:
                wchg = smooth(t_rel + 0.04, t_rel + 0.30, t) * (1 - smooth(2.40, 2.78, t))
            L = mix_m([Lg, Lm, Wm @ GC if GC is not None else Lg], [(1 - wmag) * (1 - wchg), wmag * (1 - wchg), wchg])
            ck = Track([(0, cL), (t_reach, cRelax), (t_grab, cMag), (t_seat, cMag), (t_rel + 0.06, cRelax), (t_back, cL), (T, cL)])
            cl = ck(t)
            if empty:
                cc = lerp_list(cl, cCharge, wchg)
                cl = lerp_list(cc, cL, smooth(2.5, 2.78, t))
            parts = {}
            vis = 0.0 if t_hide <= t < t_show else 1.0
            parts['magazine'] = (Wm.inverted() @ mw, vis)
            if empty and bolt:
                pull = smooth(1.96, 2.18, t) * (1 - smooth(2.34, 2.42, t))
                bp = bolt.get('part', 'bolt')
                parts[bp] = (wr.rest[bp] @ Matrix.Translation(Vector(bolt['dir']) * bolt['travel'] * pull), 1.0)
                if 'charging_handle' in wr.parts:
                    parts['charging_handle'] = (wr.rest['charging_handle'] @ Matrix.Translation(Vector(bolt['dir']) * bolt['travel'] * 0.85 * pull), 1.0)
            if 'trigger' in wr.parts:
                parts['trigger'] = (wr.rest['trigger'], 1.0)
            st = St(wr, Wm, Wm @ GR, L, cR, list(cl), parts)
            return st
        return T, sampler

    out = {
        'idle': (3.2, idle), 'ads': (3.6, adsf), 'sprint': (0.72, sprint), 'draw': (0.50, draw), 'holster': (0.36, holster), 'fire': (0.14, fire),
    }
    if has_mag:
        out['reload'] = reload(False)
        out['reload_empty'] = reload(True)
    wr.events = {'reload': {'mag_out': 0.62, 'mag_in': 1.5}, 'reload_empty': {'mag_out': 0.62, 'mag_in': 1.5, 'charge': 2.05, 'release': 2.36}, 'draw': {'ready': 0.42}}
    return out
