import bpy, bmesh, math, os, json, random
from mathutils import Vector, Matrix

W = os.environ.get('GHILLIE_WORK', r'C:\Users\Leschke\Downloads\GhillieWork')
EXP = os.path.join(W, 'exp')
MODELS = r'C:\Users\Leschke\Downloads\Models\GhillieOps'


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.node_groups, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def dims(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    return lo, hi


def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def join_meshes(objs, name):
    meshes = [o for o in objs if o.type == 'MESH']
    others = [o for o in objs if o.type != 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = name
    obj.data.name = name
    for o in others:
        bpy.data.objects.remove(o)
    return obj


def floor_origin(obj):
    lo, hi = dims(obj)
    for v in obj.data.vertices:
        v.co.x -= (lo.x + hi.x) / 2
        v.co.y -= (lo.y + hi.y) / 2
        v.co.z -= lo.z
    obj.location = (0, 0, 0)


def decimate(obj, target):
    t = tris(obj)
    if t <= target:
        return
    m = obj.modifiers.new('dec', 'DECIMATE')
    m.ratio = target / t
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)


def snap(path, objs=None, cam_loc=(0, -8, 4), target=(0, 0, 1), res=(1400, 800), lens=35, ortho=None):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_shadows = True
    sc.display.shading.studio_light = 'studio.sl' if 'studio.sl' in bpy.context.preferences.studio_lights else sc.display.shading.studio_light
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.color = (0.5, 0.6, 0.75)
    cam = bpy.data.objects.get('snapcam')
    if not cam:
        cam = bpy.data.objects.new('snapcam', bpy.data.cameras.new('snapcam'))
        bpy.context.scene.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = cam_loc
    d = Vector(target) - Vector(cam_loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    else:
        cam.data.type = 'PERSP'
    bpy.ops.render.render(write_still=True)
