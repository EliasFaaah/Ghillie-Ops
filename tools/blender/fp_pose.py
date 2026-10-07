def rig():
    return bpy.data.objects['FPRig']


def attach_weapon(name):
    r = rig()
    root = bpy.data.objects[name]
    root.parent = r
    root.parent_type = 'BONE'
    root.parent_bone = 'weapon'
    root.matrix_parent_inverse = Matrix.Identity(4)
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    root.matrix_parent_inverse = root.matrix_world.inverted()
    bpy.context.view_layer.update()
    return root


def set_weapon(M):
    pb = rig().pose.bones['weapon']
    pb.location = M.translation
    pb.rotation_quaternion = M.to_quaternion()


def hand_rest(side):
    return P(side, WRI)


def set_hand(side, M):
    pb = rig().pose.bones[f'hand_ik.{side}']
    pb.location = M.translation - hand_rest(side)
    pb.rotation_quaternion = M.to_quaternion()


def set_curls(side, pose):
    pb = rig().pose.bones
    for fn in FNAMES:
        angs = pose.get(fn, (0, 0, 0))
        for k in range(3):
            q = Quaternion((1, 0, 0), math.radians(angs[k]))
            if fn == 'thumb' and len(angs) > 3 and k == 0:
                q = Quaternion((0, 0, 1), math.radians(angs[3])) @ q
            pb[f'{fn}_{k + 1:02d}.{side}'].rotation_quaternion = q


def reset_pose():
    for pb in rig().pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)


def fpcam(path, fov=55, res=(1920, 1080), loc=(0, 0, 0), target=(0, 1, 0), samples=16):
    s = sc()
    cam = bpy.data.objects.get('SHOTCAM')
    if not cam:
        cam = bpy.data.objects.new('SHOTCAM', bpy.data.cameras.new('SHOTCAM'))
        s.collection.objects.link(cam)
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(fov)
    cam.data.clip_start = 0.01
    cam.data.clip_end = 20
    cl, tg = B(loc), B(target)
    cam.location = cl
    cam.rotation_euler = (tg - cl).to_track_quat('-Z', 'Y').to_euler()
    s.camera = cam
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x, s.render.resolution_y = res
    s.render.image_settings.file_format = 'PNG'
    s.render.filepath = path
    s.view_settings.view_transform = 'AgX'
    s.eevee.taa_render_samples = samples
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    cam.data.sensor_fit = 'AUTO'


GRIP_FIST = {'index': (-62, -78, -52), 'middle': (-64, -80, -55), 'ring': (-66, -82, -56), 'pinky': (-68, -84, -58), 'thumb': (-10, -20, -15, 0)}
OPEN = {fn: (0, 0, 0) for fn in FNAMES}


def socket_local(root_name, sock):
    o = bpy.data.objects[f'{root_name}__{sock}']
    return S2Bi @ o.matrix_local


def rot3(xc, yc, zc):
    return Matrix([[xc[0], yc[0], zc[0]], [xc[1], yc[1], zc[1]], [xc[2], yc[2], zc[2]]])


def frame_from(origin, x, y, z):
    m = rot3(Vector(x), Vector(y), Vector(z)).to_4x4()
    m.translation = Vector(origin)
    return m


def grip_frame(side, C, a, N0, d_fwd=0.050, d_pal=0.027, s=0.0):
    a = Vector(a).normalized()
    n = Vector(N0)
    n = (n - a * n.dot(a)).normalized()
    if side == 'R':
        x = -a
        y = n.cross(a)
    else:
        x = a
        y = -(n.cross(a))
    z = -n
    wrist = Vector(C) - y * d_fwd - n * d_pal + a * s
    return frame_from(wrist, x, y, z)

