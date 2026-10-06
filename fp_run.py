FP_DIR = 'C:/Users/Leschke/Downloads/GhillieOps/tools/blender/'
for _f in ('fp_kit.py', 'fp_parts.py', 'fp_arms.py', 'fp_pose.py', 'fp_anim.py', 'fp_anim_rifle.py', 'fp_anim_rev.py', 'fp_anim_throw.py', 'fp_export.py', 'fp_w_carbine.py', 'fp_w_pistol.py', 'fp_w_compact.py', 'fp_w_revolver.py', 'fp_w_ak.py', 'fp_w_bullpup.py', 'fp_w_battle.py', 'fp_w_grenade.py', 'fp_w_bandage.py'):
    exec(open(FP_DIR + _f).read())

CATALOG = [
    ('WpnCarbine', 'carbine', build_carbine, firearm_clips), ('WpnPistol', 'pistol', build_pistol, firearm_clips), ('WpnCompact', 'compact', build_compact, firearm_clips),
    ('WpnRevolver', 'revolver', build_revolver, revolver_clips), ('WpnAkPattern', 'akpattern', build_ak, firearm_clips), ('WpnBullpup', 'bullpup', build_bullpup, firearm_clips),
    ('WpnBattle', 'battle', build_battle, firearm_clips), ('WpnGrenade', 'frag', build_grenade, grenade_clips), ('WpnBandage', 'bandage', build_bandage, bandage_clips)
]


def prepare(wipe=True):
    sc()
    if wipe:
        for m in [m for m in bpy.data.materials if m.name.startswith('M_')]:
            bpy.data.materials.remove(m)
    std_materials()
    arms_materials()
    for n in ('Cube', 'Camera', 'Light'):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)


def build_all():
    purge('FPArms')
    purge('FPRig')
    for name, wid, builder, clips in CATALOG:
        builder()
    make_rig()
    build_arms(strands=True)


def bake_export(select=None, weapons=True, arms=True):
    out = {}
    for name, wid, builder, clips in CATALOG:
        if select and wid not in select:
            continue
        attach_weapon(name)
        show_only(name)
        out[wid] = bake_weapon(wid, name, builder_clips=clips)
        if weapons:
            export_weapon(wid, name)
    if arms:
        for im in bpy.data.images:
            im.reload()
        for o in bpy.data.objects:
            if o.name.startswith('FP'):
                o.hide_viewport = False
                o.hide_render = False
        export_arms([c[1] for c in CATALOG])
    return out
