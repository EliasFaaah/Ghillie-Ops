exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_kit.py').read())
import io, contextlib, logging
logging.disable(logging.CRITICAL)


def pick_meshes(mid):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        objs = import_gltf(os.path.join(W, 'mod', mid, mid + '.gltf'))
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in objs:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    meshes.sort(key=lambda o: -tris(o))
    return meshes


def finish_piece(o, name, longest, target_tris, col):
    o.data = o.data.copy()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    floor_origin(o)
    lo, hi = dims(o)
    ext = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
    if longest:
        s = longest / ext
        for v in o.data.vertices:
            v.co *= s
    decimate(o, target_tris)
    for p in o.data.polygons:
        p.use_smooth = True
    lo, hi = dims(o)
    rt = root(name)
    o.name = name + '_lod0'
    o.data.name = name + '_lod0'
    o.parent = rt
    sx, sy, sz = hi.x - lo.x, hi.y - lo.y, hi.z - lo.z
    if col == 'hull':
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.convex_hull(bm, input=bm.verts[:])
        me = bpy.data.meshes.new('col_hull')
        bm.to_mesh(me)
        bm.free()
        c = bpy.data.objects.new('col_hull', me)
        bpy.context.scene.collection.objects.link(c)
        c.parent = rt
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.select_all(action='DESELECT')
        c.select_set(True)
        decimate(c, 70)
    elif col == 'box':
        box_col('col_box', ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2), (sx, sy, sz), rt)
    elif col == 'cyl':
        cyl_col('col_cyl', ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2), min(sx, sy) / 2, sz, rt, 10)
    return rt


reset()
roots = {}
m = pick_meshes('rock_07')
roots['RockA'] = finish_piece(m[0], 'RockA', 2.3, 1800, 'hull')
m = pick_meshes('boulder_01')
roots['RockC'] = finish_piece(m[0], 'RockC', 2.8, 2000, 'hull')
m = pick_meshes('rock_moss_set_01')
for i, o in enumerate(m[:3]):
    roots['RockMoss%d' % (i + 1)] = finish_piece(o, 'RockMoss%d' % (i + 1), [3.0, 2.4, 2.0][i], 1500, 'hull')
for o in m[3:]:
    bpy.data.objects.remove(o)
m = pick_meshes('rock_moss_set_02')
for i, o in enumerate(m[:2]):
    roots['RockMoss%d' % (i + 4)] = finish_piece(o, 'RockMoss%d' % (i + 4), [2.8, 2.2][i], 1500, 'hull')
for o in m[2:]:
    bpy.data.objects.remove(o)
m = pick_meshes('rock_face_01')
roots['RockFaceA'] = finish_piece(m[0], 'RockFaceA', None, 2800, 'hull')
m = pick_meshes('rock_face_02')
roots['RockFaceB'] = finish_piece(m[0], 'RockFaceB', None, 2600, 'hull')
m = pick_meshes('fern_02')
roots['Fern'] = finish_piece(m[0], 'Fern', 1.1, 2500, None)
for o in m[1:]:
    bpy.data.objects.remove(o)
m = pick_meshes('dead_tree_trunk')
roots['FallenLog'] = finish_piece(m[0], 'FallenLog', 3.4, 1600, 'box')
m = pick_meshes('tree_stump_01')
roots['Stump'] = finish_piece(m[0], 'Stump', None, 1100, 'cyl')
m = pick_meshes('barrel_03')
roots['Barrel'] = finish_piece(m[0], 'Barrel', None, 2000, 'cyl')
m = pick_meshes('Barrel_01')
roots['OilBarrel'] = finish_piece(m[0], 'OilBarrel', None, 2000, 'cyl')
m = pick_meshes('old_military_crate')
bpy.ops.object.select_all(action='DESELECT')
for o in m:
    o.data = o.data.copy()
    o.select_set(True)
bpy.context.view_layer.objects.active = m[0]
bpy.ops.object.join()
m = [bpy.context.view_layer.objects.active]
roots['MilitaryCrate'] = finish_piece(m[0], 'MilitaryCrate', None, 3500, 'box')
m = pick_meshes('concrete_road_barrier_02')
roots['ConcreteBarrier'] = finish_piece(m[0], 'ConcreteBarrier', None, 3000, 'box')
m = pick_meshes('old_tyre')
roots['Tyre'] = finish_piece(m[0], 'Tyre', None, 1200, 'cyl')
exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_export_roots.py').read())
