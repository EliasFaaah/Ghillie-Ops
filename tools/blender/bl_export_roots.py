exported = {}
for rt in [o for o in bpy.data.objects if o.type == 'EMPTY' and o.parent is None and o.name != 'snapcam']:
    rt.location = (0, 0, 0)
    bpy.context.view_layer.update()
    export_root(rt)
    exported[rt.name] = report(rt)
result = exported
