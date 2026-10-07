def rail(y0, y1, ztop, w=0.0212, pitch=0.010, tooth=0.0047, h=0.0036, ang=0, x=0.0, support=None):
    n = int((y1 - y0) / pitch)
    ys = y0 + ((y1 - y0) - n * pitch) / 2 + (pitch - tooth) / 2
    prof = [(-w / 2, ztop - h * 0.55), (-w / 2 + 0.0005, ztop - 0.0003), (-w / 2 + 0.0012, ztop), (w / 2 - 0.0012, ztop), (w / 2 - 0.0005, ztop - 0.0003), (w / 2, ztop - h * 0.55), (w / 2 - 0.0016, ztop - h), (-w / 2 + 0.0016, ztop - h)]
    bms = [extrude(prof, 'XZ', ys + i * pitch, ys + i * pitch + tooth) for i in range(n)]
    zb = (ztop - h - 0.0028) if support is None else support - 0.0005
    bms.append(box((0, (y0 + y1) / 2, (zb + ztop - h) / 2), (w - 0.0034, y1 - y0, ztop - h - zb)))
    out = merge(*bms)
    if ang:
        xf(out, rot=(0, ang, 0))
    if x:
        xf(out, loc=(x, 0, 0))
    return out


def tube(y0, y1, ro, ri, segs=28, x=0.0, z=0.0):
    return lathe([(y0, ro), (y1, ro), (y1, ri), (y0, ri)], 'Y', (x, 0, z), segs, closed=True)


def radial_slot(yc, theta, tang, ylen, r_in, r_out, x0=0.0, z0=0.0):
    bm = box((0, yc, (r_in + r_out) / 2), (tang, ylen, r_out - r_in))
    xf(bm, rot=(0, theta, 0))
    xf(bm, loc=(x0, 0, z0))
    return bm


def ribbon(path, thick, lo, hi):
    pts = [Vector(p) for p in path]
    left, right = [], []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        n = Vector((-t.y, t.x))
        left.append(tuple(p + n * thick / 2))
        right.append(tuple(p - n * thick / 2))
    return extrude(left + right[::-1], 'YZ', lo, hi)


def loft_path(path, secfn, caps=True):
    verts = []
    faces = []
    k = None
    for i, (y, z) in enumerate(path):
        a = path[max(i - 1, 0)]
        b = path[min(i + 1, len(path) - 1)]
        t = Vector((b[0] - a[0], b[1] - a[1])).normalized()
        n = Vector((-t.y, t.x))
        sec = secfn(i)
        k = len(sec)
        for (u, v) in sec:
            verts.append((u, y + n.x * v, z + n.y * v))
    for i in range(len(path) - 1):
        for j in range(k):
            jn = (j + 1) % k
            faces.append([i * k + j, i * k + jn, (i + 1) * k + jn, (i + 1) * k + j])
    if caps:
        faces.append(list(range(k)))
        faces.append(list(range((len(path) - 1) * k, len(path) * k)))
    return _bm_from(verts, faces)


def arc_path(p0, p1, bend, n=12):
    pts = []
    for i in range(n + 1):
        s = i / n
        pts.append((p0[0] + (p1[0] - p0[0]) * s + bend * s * s, p0[1] + (p1[1] - p0[1]) * s))
    return pts


def pin_x(y, z, r, x0, x1, segs=14):
    return cyl('X', ((x0 + x1) / 2, y, z), r, abs(x1 - x0), segs)


def serrations(y0, y1, x, z0, z1, n, side=1, depth=0.0008, w=0.0008):
    bms = []
    for i in range(n):
        y = y0 + (y1 - y0) * i / max(1, n - 1)
        bms.append(box((x + side * depth / 2, y, (z0 + z1) / 2), (depth, w, z1 - z0)))
    return merge(*bms)


def red_dot(g, y0, y1, zc, rail_top, grp='body'):
    L = y1 - y0
    ym = (y0 + y1) / 2
    g.add(lathe([(y0, 0.0150), (y0 + 0.003, 0.0166), (y0 + 0.012, 0.0172), (y1 - 0.004, 0.0172), (y1, 0.0166), (y1, 0.0150), (y1 - 0.0045, 0.0147), (y0 + 0.006, 0.0141), (y0, 0.0139)], 'Y', (0, 0, zc), 44, closed=True), 'alu_dark', grp, 0.0007)
    g.add(lathe([(y1 - 0.0048, 0.0148), (y1 - 0.0010, 0.0146), (y1 - 0.0010, 0.0131), (y1 - 0.0048, 0.0129)], 'Y', (0, 0, zc), 44, closed=True), 'lens_coat', grp, 0.0, flat=True)
    g.add(extrude([(y0 + 0.004, rail_top), (y1 - 0.005, rail_top), (y1 - 0.009, zc - 0.0125), (y0 + 0.008, zc - 0.0125)], 'YZ', -0.0112, 0.0112), 'alu_dark', grp, 0.0012)
    for sx in (1, -1):
        g.add(box((sx * 0.0128, ym - 0.002, rail_top + 0.0045), (0.0030, 0.020, 0.0100)), 'steel_dark', grp, 0.0006)
    g.add(pin_x(ym - 0.002, rail_top + 0.0045, 0.0030, -0.0146, 0.0146), 'steel', grp, 0.0004)
    g.add(cyl('Y', (0, ym - 0.002, zc + 0.0172), 0.0036, 0.0085, 20), 'steel_dark', grp, 0.0005)
    g.add(cyl('Z', (0, ym - 0.002, zc + 0.0222), 0.0030, 0.0018, 18), 'steel', grp, 0.0004)
    g.add(cyl('Z', (0.0172, ym + 0.004, zc), 0.0034, 0.0050, 18), 'steel_dark', grp, 0.0005)
    g.add(cyl('Y', (0, y0 + L * 0.62, zc), 0.00075, 0.0004, 14), 'reticle', grp, 0.0, flat=True)
