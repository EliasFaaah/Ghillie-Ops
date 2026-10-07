def hand_free(pos, pitch=-22, yaw=0):
    return Matrix.Translation(pos) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X') @ frame_from((0, 0, 0), (0, 0, 1), (0, 1, 0), (-1, 0, 0))


def hand_up(pos):
    return frame_from(pos, (-1, 0, 0), (0, 1, 0), (0, 0, -1))


def carried_clips(wr, extra):
    P = wr.P
    hip6 = P['hip']
    GR = wr.sock['grip_r']
    cR = curl_list(P['curl_r'])
    cL = curl_list(P['curl_l'])
    cRelax = curl_list(RELAX)
    FL = hand_free(P['free_l'])
    ctx = dict(wr=wr, P=P, hip6=hip6, GR=GR, cR=cR, cL=cL, cRelax=cRelax, FL=FL)

    def idle(t):
        w = 2 * math.pi * t / 3.2
        d = Matrix.Translation((0.0012 * math.sin(w + 0.4), 0, 0.0018 * math.sin(w))) @ Matrix.Rotation(math.radians(0.4 * math.sin(w + 1.0)), 4, 'X')
        L = Matrix.Translation((0.002 * math.sin(w + 1.7), 0.0, 0.0022 * math.sin(w + 0.8))) @ FL
        return St(wr, d @ pose_m(hip6), d @ pose_m(hip6) @ GR, L, cR, cL)

    def sprint(t):
        w = 2 * math.pi * t / 0.72
        d = Matrix.Translation((0.008 * math.sin(w), 0, 0.012 * abs(math.sin(w * 0.5)))) @ Matrix.Rotation(math.radians(1.6 * math.sin(w)), 4, 'Y')
        Wm = d @ pose_m(P['sprint'])
        L = Matrix.Translation((-0.012 * math.sin(w), 0.018 * math.cos(w), 0.01 * abs(math.sin(w * 0.5)))) @ FL
        return St(wr, Wm, Wm @ GR, L, cR, cL)

    def draw(t):
        tr = Track([(0, P['down']), (0.30, padd(hip6, (0.0, 0.010, 0.012, -2.0, 3.0, 0.0))), (0.46, hip6)])
        s = smooth(0.04, 0.40, t)
        Wm = pose_m(tr(t))
        L = Matrix.Translation((0, 0, -0.20 * (1 - s))) @ FL
        w = smooth(0.06, 0.32, t)
        return St(wr, Wm, Wm @ GR, L, lerp_list(cRelax, cR, w), lerp_list(cRelax, cL, w))

    def holster(t):
        tr = Track([(0, hip6), (0.12, padd(hip6, (0.0, 0.004, 0.016, -2.0, 4.0, 0.0))), (0.32, P['down'])])
        s = smooth(0.02, 0.28, t)
        Wm = pose_m(tr(t))
        L = Matrix.Translation((0, 0, -0.20 * s)) @ FL
        w = 1 - smooth(0.02, 0.22, t)
        return St(wr, Wm, Wm @ GR, L, lerp_list(cRelax, cR, w), lerp_list(cRelax, cL, w))

    ctx.update(idle=idle, sprint=sprint, draw=draw, holster=holster)
    out = {'idle': (3.2, idle), 'sprint': (0.72, sprint), 'draw': (0.46, draw), 'holster': (0.32, holster)}
    out.update(extra(ctx))
    return out


def grenade_extra(c):
    wr, P, hip6, GR, cR, cL, cRelax, FL = c['wr'], c['P'], c['hip6'], c['GR'], c['cR'], c['cL'], c['cRelax'], c['FL']
    GLs = wr.sock['grip_l']
    pin_rest = wr.rest['pin']
    ready = P['ready']
    OFFP = GLs.inverted() @ pin_rest
    cPinch = curl_list({'index': (-44, -58, -34), 'middle': (-60, -76, -52), 'ring': (-62, -78, -54), 'pinky': (-64, -80, -56), 'thumb': (-10, -22, -16, 0)})

    def pull_pin(t):
        mid = tuple((a + b) * 0.5 for a, b in zip(hip6, ready))
        Wm = pose_m(Track([(0, hip6), (0.34, mid), (0.62, ready), (1.1, ready)])(t))
        ring = Wm @ GLs
        pulled = Matrix.Translation(Wm.to_3x3() @ Vector((-0.11, 0.0, -0.06))) @ ring
        L = mix_m([FL, ring], [1 - smooth(0.12, 0.42, t), smooth(0.12, 0.42, t)])
        L = mix_m([L, pulled], [1 - smooth(0.50, 0.80, t), smooth(0.50, 0.80, t)])
        L = mix_m([L, FL], [1 - smooth(0.82, 1.10, t), smooth(0.82, 1.10, t)])
        cl = Track([(0, cL), (0.40, cPinch), (0.80, cPinch), (1.10, cL)])(t)
        att = smooth(0.40, 0.46, t)
        pin_w = mix_m([Wm @ pin_rest, L @ OFFP], [1 - att, att])
        vis = 1.0 if t < 0.88 else 0.0
        parts = {'pin': (Wm.inverted() @ pin_w, vis)}
        return St(wr, Wm, Wm @ GR, L, cR, list(cl), parts)

    def cook(t):
        w = 2 * math.pi * t / 1.6
        d = Matrix.Translation((0.0010 * math.sin(w + 0.4), 0, 0.0016 * math.sin(w))) @ Matrix.Rotation(math.radians(0.4 * math.sin(w + 1.0)), 4, 'X')
        Wm = d @ pose_m(ready)
        L = Matrix.Translation((0.002 * math.sin(w + 1.7), 0.0, 0.002 * math.sin(w + 0.8))) @ FL
        return St(wr, Wm, Wm @ GR, L, cR, cL, {'pin': (wr.rest['pin'], 0.0)})

    def throw(t):
        back, fwd = P['back'], P['fwd']
        follow = padd(fwd, (0.0, 0.10, -0.06, -6.0, -20.0, 0.0))
        Wm = pose_m(Track([(0, ready), (0.26, back), (0.40, fwd), (0.60, follow), (1.0, hip6)])(t))
        L = Matrix.Translation((0.02 * math.sin(math.pi * t), 0.0, 0.02 * math.sin(math.pi * t))) @ FL
        rel = smooth(0.40, 0.52, t)
        cr = lerp_list(cR, cRelax, rel)
        vis = 1.0 if t < 0.40 else 0.0
        sp = smooth(0.38, 0.42, t)
        spoon = wr.rest['spoon'] @ Matrix.Rotation(math.radians(-70 * sp), 4, 'Y')
        parts = {'grenade': (wr.rest['grenade'], vis), 'spoon': (spoon, vis if t < 0.40 else 0.0), 'pin': (wr.rest['pin'], 0.0)}
        return St(wr, Wm, Wm @ GR, L, cr, cL, parts)

    wr.events = {'pull_pin': {'pin': 0.46}, 'throw': {'release': 0.40}, 'draw': {'ready': 0.40}}
    return {'pull_pin': (1.1, pull_pin), 'cook': (1.6, cook), 'throw': (1.0, throw)}


def bandage_extra(c):
    wr, P, hip6, GR, cR, cL, cRelax, FL = c['wr'], c['P'], c['hip6'], c['GR'], c['cR'], c['cL'], c['cRelax'], c['FL']
    cz = 0.0285
    tail = Vector((-0.0285, 0.0, cz))
    WORK = hand_up(P['work_l'])
    roll_c = Vector((0.0, 0.0, cz))

    def strips(Wm, p0, p1, lift=0.012):
        d = p1 - p0
        dist = d.length
        n = max(0, min(6, int(math.ceil(dist / 0.038))))
        parts = {}
        if dist < 1e-4:
            return parts
        dn = d / dist
        x = -dn
        y = Vector((0, 0, 1)).cross(x)
        if y.length < 1e-3:
            y = Vector((0, 1, 0))
        y.normalize()
        z = x.cross(y)
        R = Matrix([[x.x, y.x, z.x], [x.y, y.y, z.y], [x.z, y.z, z.z]]).to_4x4()
        inv = Wm.inverted()
        for k in range(6):
            f = k / 6
            pos = p0 + d * f + Vector((0, 0, lift * math.sin(math.pi * f)))
            M = Matrix.Translation(pos) @ R
            parts[f'strip_{k + 1:02d}'] = (inv @ M, 1.0 if k < n else 0.0)
        return parts

    def unwrap(t):
        Wm = pose_m(Track([(0, hip6), (0.35, padd(hip6, (-0.02, 0.0, 0.02, 4, 6, 0))), (1.0, padd(hip6, (-0.02, 0.0, 0.02, 4, 6, 0)))])(t))
        tail_w = Wm @ tail
        grasp = Matrix.Translation(tail_w) @ hand_free((0, 0, 0), -10).to_3x3().to_4x4()
        pulled = Matrix.Translation(tail_w + Vector((-0.17, 0.07, 0.03))) @ hand_free((0, 0, 0), -10).to_3x3().to_4x4()
        L = mix_m([FL, grasp], [1 - smooth(0.0, 0.30, t), smooth(0.0, 0.30, t)])
        L = mix_m([L, pulled], [1 - smooth(0.30, 0.82, t), smooth(0.30, 0.82, t)])
        parts = strips(Wm, tail_w, L.translation) if t > 0.30 else {}
        return St(wr, Wm, Wm @ GR, L, cR, cL, parts)

    def apply(t):
        prog = smooth(0.40, 1.72, t)
        s = smooth(0.0, 0.38, t)
        start = Matrix.Translation(Vector((0, 0, 0)))
        un_W = pose_m(padd(hip6, (-0.02, 0.0, 0.02, 4, 6, 0)))
        un_L = Matrix.Translation(un_W @ tail + Vector((-0.17, 0.07, 0.03))) @ hand_free((0, 0, 0), -10).to_3x3().to_4x4()
        L = mix_m([un_L, WORK], [1 - s, s])
        ang = 2 * math.pi * 3 * prog + 0.4
        Ln = L.to_3x3()
        xh, yh, zh = Ln.col[0], Ln.col[1], Ln.col[2]
        ctr = L.translation + yh * (-(0.035 + 0.15 * prog))
        pos = ctr + (xh * math.cos(ang) + zh * math.sin(ang)) * 0.090
        rot = Ln @ Matrix.Rotation(ang, 3, 'Y')
        Wo = Matrix.Translation(pos - rot @ roll_c) @ rot.to_4x4()
        Wm = mix_m([un_W, Wo], [1 - s, s])
        inv = Wm.inverted()
        parts = {}
        for k in range(1, 6):
            on = smooth((k - 0.6) / 5.8 + 0.02, (k - 0.1) / 5.8 + 0.02, prog)
            parts[f'wrap_{k:02d}'] = (inv @ L @ Matrix.Translation((0, -(0.040 + 0.032 * (k - 1)), 0)), on)
        wrap_pt = ctr + (xh * math.cos(ang - 0.7) + zh * math.sin(ang - 0.7)) * 0.058
        tail_w = Wm @ tail
        parts.update(strips(Wm, tail_w, wrap_pt) if t < 1.82 else {})
        parts['roll'] = (wr.rest['roll'], 1.0 if t < 1.84 else 0.0)
        cr = lerp_list(cR, cRelax, smooth(1.78, 1.98, t))
        return St(wr, Wm, Wm @ GR, L, cr, cL, parts)

    wr.events = {'unwrap': {}, 'apply': {'wrap': 0.7, 'tuck': 1.8}, 'draw': {'ready': 0.40}}
    return {'unwrap': (1.0, unwrap), 'apply': (2.0, apply)}


def grenade_clips(wr):
    return carried_clips(wr, grenade_extra)


def bandage_clips(wr):
    return carried_clips(wr, bandage_extra)
