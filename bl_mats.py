exec(open(r'C:\Users\Leschke\Downloads\GhillieOps\tools\blender\bl_struct.py').read())
import io, contextlib, logging
logging.disable(logging.CRITICAL)

MT = {}
METALS = ("corrug", "rusty", "greenmetal", "plate")


def defmats():
    d = {
        'plaster': ('beige_wall_001', 2.0, {}),
        'plaster2': ('white_plaster_02', 2.0, {}),
        'brick': ('brick_wall_005', 1.2, {}),
        'brokenbrick': ('broken_brick_wall', 1.5, {}),
        'stone': ('old_stone_wall', 1.6, {}),
        'stonedark': ('stone_wall_02', 1.6, {}),
        'roof_red': ('clay_roof_tiles_02', 1.2, {}),
        'roof_dark': ('roof_tiles_14', 1.2, {}),
        'planks': ('weathered_planks', 1.2, {}),
        'planks_grey': ('wood_planks_grey', 1.2, {}),
        'oldplanks': ('old_planks_02', 1.2, {}),
        'concrete': ('concrete_wall_004', 2.0, {}),
        'precast': ('precast_concrete_wall', 2.0, {}),
        'roughconc': ('rough_concrete', 2.0, {}),
        'gravel': ('river_small_rocks', 1.4, {}),
        'corrug': ('corrugated_iron_02', 1.5, {}),
        'rusty': ('rusty_metal_02', 1.5, {}),
        'greenmetal': ('green_metal_rust', 1.5, {}),
        'plate': ('metal_plate', 1.0, {}),
        'hessian': ('hessian_230', 0.8, {'tint': (0.42, 0.46, 0.28)}),
        'sandbag': ('hessian_380', 0.45, {'tint': (0.78, 0.7, 0.52)}),
        'reed': ('reed_roof_03', 1.5, {}),
        'dirt': ('dirt_floor', 2.0, {'tint': (0.55, 0.52, 0.48)}),
    }
    for key, (tex, tile, kw) in d.items():
        MT[key] = (material('M_' + key, tex=tex, rough=0.88, arm=key in METALS, **kw), tile)
    MT['glass'] = (material('M_glass', color=(0.03, 0.05, 0.065), rough=0.06, metal=0.0), 1.0)
    MT['frame'] = (material('M_frame', color=(0.72, 0.72, 0.68), rough=0.7), 1.0)
    MT['white'] = (material('M_white', color=(0.8, 0.8, 0.78), rough=0.6), 1.0)
    MT['red'] = (material('M_red', color=(0.55, 0.06, 0.05), rough=0.55), 1.0)
    MT['black'] = (material('M_black', color=(0.02, 0.02, 0.022), rough=0.5, metal=0.3), 1.0)
    MT['steel'] = (material('M_steel', color=(0.38, 0.4, 0.42), rough=0.5, metal=0.9), 1.0)
    MT['flag'] = (material('Flag', color=(0.85, 0.85, 0.85), rough=0.8), 1.0)
    MT['olive'] = (material('M_olive', color=(0.17, 0.2, 0.1), rough=0.7), 1.0)
    MT['sand'] = (material('M_sand', color=(0.5, 0.42, 0.28), rough=0.9), 1.0)


def new_struct(name, keys):
    s = S(name)
    for k in keys:
        s.mat(k, MT[k][0], MT[k][1])
    return s


def roof_cols(s, axis, c0, c1, e0, e1, zeave, pitch):
    half = (e1 - e0) / 2
    mid = (e0 + e1) / 2
    rise = half * math.tan(pitch)
    for k in range(3):
        w = 2 * half * (1 - k / 3)
        h = rise / 3
        z = zeave + rise * k / 3 + h / 2
        if axis == 'x':
            s.col(((c0 + c1) / 2, mid, z), (c1 - c0, w, h))
        else:
            s.col((mid, (c0 + c1) / 2, z), (w, c1 - c0, h))


def finish(s, results, export=True):
    rt = s.build()
    results[s.name] = rt
    return rt


def export_all(results, spacing=None):
    out = {}
    for name, rt in results.items():
        rt.location = (0, 0, 0)
        bpy.context.view_layer.update()
        export_root(rt)
        out[name] = report(rt)
    return out


def layout_row(results, gap=6.0):
    x = 0.0
    for rt in results.values():
        r = report(rt)
        w = max(r['size'][0], r['size'][1])
        rt.location = (x + w / 2, 0, 0)
        x += w + gap
    return x


reset()
defmats()
