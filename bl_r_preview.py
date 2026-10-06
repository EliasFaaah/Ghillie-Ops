exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_r_common.py').read())


def preview(paths, outdir, w=640, h=800):
    sc = scene_s2r()
    out = {}
    for p in paths:
        clear(sc)
        try:
            objs = import_glb(p)
        except Exception as e:
            out[os.path.basename(p)] = 'ERR ' + str(e)[-160:]
            continue
        ms = meshes(sc)
        if not ms:
            out[p] = 'no mesh'
            continue
        lo, hi = bounds(ms)
        lights_and_world(sc, sun_energy=3.5, sky=(0.7, 0.78, 0.9), sky_strength=1.1)
        camera_for(sc, lo, hi, az_deg=30, el_deg=8, fill=1.1)
        name = os.path.splitext(os.path.basename(p))[0]
        render_to(sc, os.path.join(outdir, name + '.png'), w, h, samples=8)
        out[name] = {'tris': tris(ms), 'size': [round(x, 2) for x in (hi - lo)], 'objs': len(ms)}
    return out
