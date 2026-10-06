if globals().get('EXPORT'):
    result = export_all(R)
else:
    for rt in R.values():
        for c in rt.children:
            if c.name.startswith('col_'):
                c.hide_render = True
    bpy.context.view_layer.update()
    pv = globals().get('PV', {})
    snap(os.path.join(W, pv.get('name', 'prev.png')), cam_loc=pv.get('cam', (20, -48, 16)), target=pv.get('target', (22, 0, 3.5)), lens=pv.get('lens', 40), res=pv.get('res', (1800, 800)))
    result = {n: report(r) for n, r in R.items()}
