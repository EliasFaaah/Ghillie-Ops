import io, contextlib, logging, subprocess
PACK = r'C:\Users\Leschke\Downloads\GhillieOps\tools\gltfpack.exe'
CLIPS_JSON = r'C:\Users\Leschke\Downloads\GhillieOps\assets\weapons\clips.json'
PACK_ARGS = ['-tl', 'normal,attrib', '512', '-tl', 'color', '1024', '-tq', '8', '-vt', '16']


def record_clips(wid, durations, events=None):
    data = json.load(open(CLIPS_JSON)) if os.path.exists(CLIPS_JSON) else {}
    data[wid] = {c: {'duration': d, 'events': (events or {}).get(c, {})} for c, d in durations.items()}
    os.makedirs(os.path.dirname(CLIPS_JSON), exist_ok=True)
    json.dump(data, open(CLIPS_JSON, 'w'), indent=1)


def bake_weapon(wid, name, only=None, builder_clips=None):
    wr = WRig(name)
    purge_actions(wid)
    clips = builder_clips(wr)
    arms = bpy.data.objects.get('FPArms')
    if arms:
        arms.hide_viewport = True
    sc().render.fps = FPS
    sc().frame_start = 0
    done = {}
    for cname, (dur, fn) in clips.items():
        if only and cname not in only:
            continue
        bake_clip(wr, cname, dur, fn)
        done[cname] = round(dur, 3)
    record_clips(wr.P['id'], done, getattr(wr, 'events', {}))
    if arms:
        arms.hide_viewport = False
    reset_pose()
    for g, o in wr.parts.items():
        o.rotation_mode = 'QUATERNION'
        o.location = B(wr.pivot[g])
        o.rotation_quaternion = (1, 0, 0, 0)
        o.scale = (1, 1, 1)
    return done


def clear_nla(ob):
    if ob.animation_data:
        ob.animation_data.action = None
        for t in list(ob.animation_data.nla_tracks):
            ob.animation_data.nla_tracks.remove(t)


def nla_from(ob, pairs):
    ob.animation_data_create()
    clear_nla(ob)
    for name, act in pairs:
        tr = ob.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        st.name = name


GLTF_OPTS = dict(export_format='GLTF_SEPARATE', use_selection=True, export_apply=False, export_yup=True, export_image_format='AUTO', export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=False, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=False, export_def_bones=True, export_vertex_color='ACTIVE', export_anim_slide_to_zero=False, export_leaf_bone=False)


def run_export(name, objs, active):
    d = os.path.join(EXP, name)
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        try:
            os.remove(os.path.join(d, f))
        except OSError:
            pass
    for o in bpy.data.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active
    logging.disable(logging.CRITICAL)
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        bpy.ops.export_scene.gltf(filepath=os.path.join(d, name + '.gltf'), **GLTF_OPTS)
    logging.disable(logging.NOTSET)
    return d


def pack(name, extra=()):
    d = os.path.join(EXP, name)
    out = os.path.join(MODELS, name + '.glb')
    cmd = [PACK, '-i', os.path.join(d, name + '.gltf'), '-o', out, '-cc', '-tc', '-tu', 'normal,attrib', '-kn', '-km', '-ac', '-af', '60'] + PACK_ARGS + list(extra)
    r = subprocess.run(cmd, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip().splitlines()[-3:], os.path.getsize(out) if os.path.exists(out) else 0


def export_weapon(wid, name):
    root = bpy.data.objects[name]
    wr = WRig(name)
    root.parent = None
    root.matrix_world = Matrix.Identity(4)
    kids = [o for o in bpy.data.objects if o.name.startswith(name + '__')]
    ren = {}
    for o in kids:
        new = o.name[len(name) + 2:]
        ren[o] = o.name
        o.name = new
    by_clip = {}
    for a in bpy.data.actions:
        if a.name.startswith(wid + '.') and a.name.count('.') == 2:
            _, g, clip = a.name.split('.')
            by_clip.setdefault(g, []).append((clip, a))
    for g, o in wr.parts.items():
        gname = [k for k, v in ren.items() if v == f'{name}__{g}'][0]
        nla_from(gname, by_clip.get(g, []))
    d = run_export(name, [root] + kids, root)
    for o in wr.parts.values():
        clear_nla(o)
    for o, n in ren.items():
        o.name = n
    res = pack(name)
    attach_weapon(name)
    return res


def export_arms(ids):
    r = bpy.data.objects['FPRig']
    m = bpy.data.objects['FPArms']
    pairs = []
    for a in bpy.data.actions:
        if a.name.count('.') == 1 and a.name.split('.')[0] in ids:
            pairs.append((a.name, a))
    nla_from(r, pairs)
    d = run_export('FPArms', [r, m], r)
    clear_nla(r)
    return pack('FPArms'), len(pairs)
