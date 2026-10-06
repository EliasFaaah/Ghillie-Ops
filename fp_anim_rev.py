def revolver_clips(wr):
    P = wr.P
    out = firearm_clips(wr)
    hip6 = P['hip']
    hip = pose_m(hip6)
    GR, GL = wr.sock['grip_r'], wr.sock['grip_l']
    cR = curl_list(P['curl_r'])
    cL = curl_list(P['curl_l'])
    cRelax = curl_list(RELAX)
    cMag = curl_list(MAGCURL)
    butt = Vector(P['butt'])
    piv = wr.pivot['cylinder']
    hinge = piv + Vector((-0.021, 0.0, -0.014))
    pouch = P['pouch']
    GC = Matrix.Translation(piv).inverted() @ grip_frame('L', piv + Vector((-0.012, 0.0, 0.0)), (0, 1, 0), (1, 0, 0.2), 0.040, 0.034, 0.0)
    GP = frame_from(pouch, (-1, 0, 0), (0, 1, 0), (0, 0, -1))
    OFF = Matrix.Translation((0.0, 0.05, 0.0))

    def cyl_m(open_a, spin):
        R = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(-open_a), 4, 'Y') @ Matrix.Translation(-hinge)
        return R @ Matrix.Translation(piv) @ Matrix.Rotation(math.radians(spin), 4, 'Y')

    def fire(t):
        k = Track([(0, 0.0), (0.090, 0.0), (0.105, P['kick'][0]), (0.190, P['kick'][0] * 0.3), (0.32, 0.0)])(t)
        pitch = Track([(0, 0.0), (0.090, 0.0), (0.105, P['kick'][1]), (0.190, P['kick'][1] * 0.35), (0.32, 0.0)])(t)
        pv = hip @ butt
        D = Matrix.Translation(pv) @ Matrix.Rotation(math.radians(pitch), 4, 'X') @ Matrix.Translation(-pv)
        Wm = Matrix.Translation((0, -k, 0)) @ D @ hip
        tr = Track([(0, 0.0), (0.085, 1.0), (0.105, 1.0), (0.22, 0.0), (0.32, 0.0)])(t)
        h = Track([(0, 0.0), (0.080, 1.0), (0.092, 0.0), (0.32, 0.0)])(t)
        sp = Track([(0, 0.0), (0.085, 1.0), (0.32, 1.0)])(t)
        cr = list(cR)
        cr[0] = cR[0] - 16 * tr
        cr[1] = cR[1] - 12 * tr
        parts = {
            'hammer': (wr.rest['hammer'] @ Matrix.Rotation(math.radians(P['hammer_deg'] * h), 4, 'X'), 1.0),
            'trigger': (wr.rest['trigger'] @ Matrix.Rotation(math.radians(P['trigger_deg'] * tr), 4, 'X'), 1.0),
            'cylinder': (cyl_m(0, P['spin_deg'] * sp), 1.0),
            'rounds': (cyl_m(0, P['spin_deg'] * sp), 1.0)
        }
        return St(wr, Wm, Wm @ GR, Wm @ GL, cr, cL, parts)

    def reload(T):
        tilt = padd(hip6, P['tilt'])
        wk = [(0, hip6), (0.30, tilt), (0.80, padd(tilt, (0, 0, 0.01, 0, 6, 8))), (2.15, padd(tilt, (0, 0, 0.01, 0, 6, 8))), (2.55, hip6), (T, hip6)]
        W_tr = Track(wk)
        w_grip = Track([(0, 1), (0.25, 1), (0.45, 0), (2.30, 0), (2.60, 1), (T, 1)])
        w_cyl = Track([(0, 0), (0.25, 0), (0.45, 1), (1.10, 1), (1.30, 0), (1.70, 0), (1.90, 1), (2.30, 1), (2.50, 0), (T, 0)])
        w_pouch = Track([(0, 0), (1.15, 0), (1.35, 1), (1.55, 1), (1.78, 0), (T, 0)])
        open_t = Track([(0, 0.0), (0.50, 0.0), (0.85, 1.0), (2.05, 1.0), (2.35, 0.0), (T, 0.0)])
        eject_t = Track([(0, 0.0), (0.95, 0.0), (1.22, 1.0), (T, 1.0)])
        ck = Track([(0, cL), (0.25, cRelax), (0.45, cMag), (1.20, cMag), (1.40, cMag), (1.80, cMag), (2.30, cMag), (2.55, cL), (T, cL)])

        def sampler(t):
            Wm = pose_m(W_tr(t))
            ca = 78.0 * open_t(t)
            cm = Wm @ cyl_m(ca, 0)
            Lg = Wm @ GL
            Lc = cm @ GC
            Lp = GP
            wg, wc, wp = w_grip(t), w_cyl(t), w_pouch(t)
            L = mix_m([Lg, Lc, Lp], [max(wg, 0), max(wc, 0), max(wp, 0)])
            hand_round = L @ OFF
            e = eject_t(t)
            drop = Matrix.Translation((0, 0, -0.20 * e))
            w_h = smooth(1.40, 1.46, t) * (1 - smooth(1.76, 1.86, t))
            r_cyl = cyl_m(ca, 0) @ drop
            r_hand = Wm.inverted() @ hand_round
            r_m = mix_m([r_cyl, r_hand], [1 - w_h, w_h])
            vis = 1.0
            if 1.00 < t < 1.40:
                vis = 0.0
            elif t <= 1.00:
                vis = 1.0 - smooth(0.95, 1.05, t) * 0.0
            parts = {
                'hammer': (wr.rest['hammer'], 1.0),
                'trigger': (wr.rest['trigger'], 1.0),
                'cylinder': (cyl_m(ca, 0), 1.0),
                'rounds': (r_m, vis)
            }
            return St(wr, Wm, Wm @ GR, L, cR, list(ck(t)), parts)
        return T, sampler

    out['fire'] = (0.32, fire)
    out['reload'] = reload(2.9)
    out['reload_empty'] = reload(3.3)
    wr.events = {'reload': {'cyl_open': 0.70, 'eject': 1.0, 'load': 1.8, 'cyl_close': 2.25}, 'reload_empty': {'cyl_open': 0.70, 'eject': 1.0, 'load': 1.8, 'cyl_close': 2.25}, 'draw': {'ready': 0.42}}
    return out
