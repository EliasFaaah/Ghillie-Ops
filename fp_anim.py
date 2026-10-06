FPS = 60
PARAMS = {}


def pchip(ts, vs):
    n = len(ts)
    h = [ts[i + 1] - ts[i] for i in range(n - 1)]
    d = [(vs[i + 1] - vs[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(t):
        if t <= ts[0]:
            return vs[0]
        if t >= ts[-1]:
            return vs[-1]
        lo, hi = 0, n - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if ts[mid] <= t:
                lo = mid
            else:
                hi = mid
        i = lo
        s = (t - ts[i]) / h[i]
        s2, s3 = s * s, s * s * s
        return (2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * h[i] * m[i + 1]
    return f


class Track:
    def __init__(self, keys):
        ts = [k[0] for k in keys]
        vals = [k[1] for k in keys]
        self.dim = len(vals[0]) if isinstance(vals[0], (tuple, list)) else 0
        cols = list(zip(*vals)) if self.dim else [vals]
        self.fns = [pchip(ts, [float(x) for x in c]) for c in cols]

    def __call__(self, t):
        v = [f(t) for f in self.fns]
        return tuple(v) if self.dim else v[0]


def pose_m(p):
    x, y, z, yaw, pitch, roll = p
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X') @ Matrix.Rotation(math.radians(roll), 4, 'Y')


def mix_m(ms, ws):
    tot = sum(ws)
    if tot <= 1e-9:
        return ms[0]
    q = None
    acc = 0.0
    t = Vector((0, 0, 0))
    for m, w in zip(ms, ws):
        if w <= 1e-9:
            continue
        t += m.translation * (w / tot)
        qi = m.to_quaternion()
        acc += w
        q = qi if q is None else q.slerp(qi, w / acc)
    out = q.to_matrix().to_4x4()
    out.translation = t
    return out


def smooth(a, b, t):
    if t <= a:
        return 0.0
    if t >= b:
        return 1.0
    s = (t - a) / (b - a)
    return s * s * (3 - 2 * s)


def ramp(keys):
    return Track(keys)


def curl_list(pose):
    out = []
    for fn in FNAMES:
        a = pose.get(fn, (0, 0, 0))
        out.extend([a[0], a[1], a[2], a[3] if len(a) > 3 else 0.0])
    return out


def curl_dict(vals):
    return {fn: tuple(vals[i * 4:i * 4 + 4]) for i, fn in enumerate(FNAMES)}


def lerp_list(a, b, w):
    return [x + (y - x) * w for x, y in zip(a, b)]


class WRig:
    def __init__(self, name):
        self.name = name
        self.root = bpy.data.objects[name]
        self.P = PARAMS[name]
        self.sock = {}
        for n in ('grip_r', 'grip_l', 'mag', 'ads_anchor', 'muzzle', 'eject', 'sight', 'charge'):
            o = bpy.data.objects.get(f'{name}__{n}')
            if o:
                self.sock[n] = socket_local(name, n)
        self.parts = {}
        self.pivot = {}
        for g in self.P.get('parts', []):
            o = bpy.data.objects[f'{name}__{g}']
            self.parts[g] = o
            self.pivot[g] = S2Bi @ Vector(o.location)
        self.rest = {g: Matrix.Translation(self.pivot[g]) for g in self.parts}

    def pose_hip(self):
        return pose_m(self.P['hip'])

    def pose_ads(self):
        return Matrix.Translation(-self.sock['ads_anchor'].translation)

    def parts_rest(self):
        hid = self.P.get('hidden', [])
        return {g: (Matrix(m), 0.0 if g in hid else 1.0) for g, m in self.rest.items()}


class St:
    def __init__(self, wr, W, R, L, cR, cL, parts=None):
        self.W = W
        self.R = R
        self.L = L
        self.cR = cR
        self.cL = cL
        self.parts = wr.parts_rest()
        if parts:
            self.parts.update(parts)


def apply_state(wr, st, prev_sh):
    reset_pose()
    set_weapon(st.W)
    set_hand('R', st.R)
    set_hand('L', st.L)
    set_curls('R', curl_dict(st.cR))
    set_curls('L', curl_dict(st.cL))
    sh = {}
    pb = rig().pose.bones
    for side, M in (('R', st.R), ('L', st.L)):
        v = M.translation - P(side, SHO)
        d = v.length
        if d > 0.52:
            tgt = v * (1 - 0.52 / d)
        elif d < 0.36:
            tgt = v * (1 - 0.36 / max(d, 0.05))
        else:
            tgt = Vector((0, 0, 0))
        sh[side] = tgt
        pb[f'shoulder.{side}'].location = tgt
    for g, (M, vis) in st.parts.items():
        ob = wr.parts[g]
        ob.rotation_mode = 'QUATERNION'
        ob.location = B(M.translation)
        ob.rotation_quaternion = BM(M.to_3x3().to_4x4()).to_quaternion()
        vs = max(vis, 1e-4)
        ob.scale = (vs, vs, vs)
    return sh


CTRL = ['weapon', 'hand_ik.R', 'hand_ik.L', 'shoulder.R', 'shoulder.L']


def key_all(wr, f):
    pb = rig().pose.bones
    for n in CTRL:
        pb[n].keyframe_insert('location', frame=f)
        pb[n].keyframe_insert('rotation_quaternion', frame=f)
    for s in 'RL':
        for fn in FNAMES:
            for k in range(3):
                pb[f'{fn}_{k + 1:02d}.{s}'].keyframe_insert('rotation_quaternion', frame=f)
    for g, o in wr.parts.items():
        o.keyframe_insert('location', frame=f)
        o.keyframe_insert('rotation_quaternion', frame=f)
        o.keyframe_insert('scale', frame=f)


def bake_clip(wr, clip, dur, sampler):
    wid = wr.P['id']
    rg = rig()
    act = bpy.data.actions.new(f'{wid}.{clip}')
    act.use_fake_user = True
    rg.animation_data_create()
    rg.animation_data.action = act
    for g, o in wr.parts.items():
        pa = bpy.data.actions.new(f'{wid}.{g}.{clip}')
        pa.use_fake_user = True
        o.animation_data_create()
        o.animation_data.action = pa
    nf = int(round(dur * FPS)) + 1
    prev = {}
    for f in range(nf):
        st = sampler(min(f / FPS, dur))
        prev = apply_state(wr, st, prev)
        bpy.context.view_layer.update()
        key_all(wr, f)
    for o in wr.parts.values():
        o.animation_data.action = None
    rg.animation_data.action = None
    return act


def purge_actions(wid):
    for a in [a for a in bpy.data.actions if a.name.startswith(wid + '.')]:
        bpy.data.actions.remove(a)
