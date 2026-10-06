import bpy, os, math, json, random
from mathutils import Vector, Matrix

SCRATCH = r'C:\Users\Leschke\AppData\Local\Temp\claude\C--Users-Leschke-Downloads\447c3e6d-e9a0-43dd-9c9d-341e12b584a0\scratchpad'
GAME = r'C:\Users\Leschke\Downloads\GhillieOps'
EXPORT = r'C:\Users\Leschke\Downloads\Models\GhillieOps'


def scene_s2r(name='S2R'):
    sc = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    bpy.context.window.scene = sc
    return sc


def clear(sc):
    for o in list(sc.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)


def meshes(sc=None):
    sc = sc or bpy.context.scene
    return [o for o in sc.objects if o.type == 'MESH']


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def tris(objs):
    n = 0
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
    return n


def lights_and_world(sc, sun_energy=4.0, sky=(0.55, 0.65, 0.8), sky_strength=1.0, sun_dir=(0.5, -0.4, 0.75)):
    for o in list(sc.objects):
        if o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o, do_unlink=True)
    ld = bpy.data.lights.new('S2R_sun', 'SUN')
    ld.energy = sun_energy
    ld.angle = math.radians(2.0)
    lo = bpy.data.objects.new('S2R_sun', ld)
    sc.collection.objects.link(lo)
    d = Vector(sun_dir).normalized()
    lo.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.get('S2R_world') or bpy.data.worlds.new('S2R_world')
    w.use_nodes = True
    nt = w.node_tree
    bg = next((n for n in nt.nodes if n.type == 'BACKGROUND'), None)
    if bg is None:
        bg = nt.nodes.new('ShaderNodeBackground')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_WORLD'), None) or nt.nodes.new('ShaderNodeOutputWorld')
        nt.links.new(bg.outputs[0], out.inputs[0])
    bg.inputs[0].default_value = (sky[0], sky[1], sky[2], 1)
    bg.inputs[1].default_value = sky_strength
    sc.world = w
    return lo


def camera_for(sc, lo, hi, az_deg=35, el_deg=12, fill=1.15, aspect=1.0, ortho=False, name='S2R_cam'):
    ctr = (lo + hi) / 2
    size = (hi - lo)
    r = max(size.x, size.y, size.z) * 0.5 * fill
    cd = bpy.data.cameras.new(name)
    co = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(co)
    az, el = math.radians(az_deg), math.radians(el_deg)
    cd.lens_unit = 'FOV'
    cd.angle = math.radians(26)
    dist = r / math.tan(cd.angle / 2) * 1.0
    pos = ctr + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
    co.location = pos
    co.rotation_euler = (ctr - pos).to_track_quat('-Z', 'Y').to_euler()
    cd.clip_start = 0.05
    cd.clip_end = dist * 6
    sc.camera = co
    return co


def render_to(sc, path, w=640, h=640, engine='BLENDER_EEVEE', samples=16, transparent=False):
    sc.render.engine = engine
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path
    if engine == 'BLENDER_EEVEE':
        sc.eevee.taa_render_samples = samples
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(write_still=True)


def fix_gltf_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g is not None and len(g.interface.items_tree) < 3:
        for m in bpy.data.materials:
            if m.node_tree:
                for n in list(m.node_tree.nodes):
                    if n.type == 'GROUP' and n.node_tree == g:
                        m.node_tree.nodes.remove(n)
        bpy.data.node_groups.remove(g)


def import_glb(path):
    fix_gltf_group()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]
