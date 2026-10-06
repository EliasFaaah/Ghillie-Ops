import sys, os, json
import numpy as np
from PIL import Image
from scipy import ndimage

WORK = r'C:\Users\Leschke\AppData\Local\Temp\claude\C--Users-Leschke-Downloads\447c3e6d-e9a0-43dd-9c9d-341e12b584a0\scratchpad\r_work'

GRADE = {
    'OakTree': dict(gain=(0.88, 0.98, 1.2), sat=1.0, ao=0.5, imp=(0.97, 1.0, 1.0)),
    'BeechTree': dict(gain=(0.98, 1.02, 0.98), sat=1.0, ao=0.45, imp=(0.93, 0.93, 0.97)),
    'BirchTree': dict(gain=(1.02, 1.0, 1.15), sat=1.0, ao=0.45, imp=(0.72, 0.78, 0.95)),
    'SpruceTree': dict(gain=(0.5, 0.56, 0.56), sat=1.0, ao=0.5, imp=(1.15, 1.1, 1.1)),
    'BushA': dict(gain=(0.6, 0.62, 0.66), sat=0.95, ao=0.5, imp=(1.0, 1.0, 1.0))
}


def grade(rgb, g):
    x = rgb * np.array(g['gain'], np.float32)
    lum = (x * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1, keepdims=True)
    x = lum + (x - lum) * g['sat']
    return np.clip(x, 0, 1)


def dilate(rgb, a, reach=10):
    solid = a > 0.12
    if solid.all() or not solid.any():
        return rgb
    dist, idx = ndimage.distance_transform_edt(~solid, return_indices=True)
    out = rgb.copy()
    fill = (~solid) & (dist <= reach)
    out[fill] = rgb[idx[0][fill], idx[1][fill]]
    return out


def tile(d, tag, ci, tn, g):
    a = np.asarray(Image.open(os.path.join(d, 'tiles_' + tag, '%03d_%s_a.png' % (ci, tn))).convert('RGBA'), np.float32) / 255
    dp = np.asarray(Image.open(os.path.join(d, 'tiles_' + tag, '%03d_%s_d.png' % (ci, tn))).convert('RGBA'), np.float32) / 255
    rgb = a[..., :3]
    al = a[..., 3]
    ao = 1.0 - g['ao'] * np.clip(dp[..., 0], 0, 1) ** 0.8
    rgb = grade(rgb, g) * ao[..., None]
    rgb = dilate(rgb, al)
    return np.dstack([rgb, al])


def cards(name, tag, cols=32, size=128, rows=None):
    d = os.path.join(WORK, name)
    g = GRADE[name]
    cl = json.load(open(os.path.join(d, 'cl_%s.json' % tag)))
    n = len(cl['cards']) * 2
    rows = rows or int(np.ceil(n / cols))
    atlas = np.zeros((rows * size, cols * size, 4), np.float32)
    for ci in range(len(cl['cards'])):
        for k, tn in enumerate(('f', 's')):
            slot = ci * 2 + k
            x, y = (slot % cols) * size, (slot // cols) * size
            atlas[y:y + size, x:x + size] = tile(d, tag, ci, tn, g)
            cl['cards'][ci]['slot_' + tn] = slot
    img = Image.fromarray((np.clip(atlas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    img.save(os.path.join(d, 'leaf_atlas_%s.png' % tag))
    cl['atlas'] = {'cols': cols, 'rows': rows, 'size': size}
    json.dump(cl, open(os.path.join(d, 'cl_%s.json' % tag), 'w'))
    return img.size


def imp(name, frames, size):
    d = os.path.join(WORK, name, 'imp')
    g = GRADE[name]
    A = np.zeros((frames * size, frames * size, 4), np.float32)
    N = np.zeros((frames * size, frames * size, 4), np.float32)
    N[..., :3] = (0.5, 0.5, 1.0)
    N[..., 3] = 1.0
    for fy in range(frames):
        for fx in range(frames):
            k = fy * frames + fx
            a = np.asarray(Image.open(os.path.join(d, '%03d_a.png' % k)).convert('RGBA'), np.float32) / 255
            n = np.asarray(Image.open(os.path.join(d, '%03d_n.png' % k)).convert('RGBA'), np.float32) / 255
            dp = np.asarray(Image.open(os.path.join(d, '%03d_d.png' % k)).convert('RGBA'), np.float32) / 255
            al = a[..., 3]
            ao = 1.0 - g['ao'] * np.clip(dp[..., 0], 0, 1) ** 0.8
            rgb = dilate(np.clip(grade(a[..., :3], g) * np.array(g['imp'], np.float32), 0, 1) * ao[..., None], al, 12)
            nrm = dilate(n[..., :3], al, 12)
            y0, x0 = fy * size, fx * size
            A[y0:y0 + size, x0:x0 + size] = np.dstack([rgb, al])
            N[y0:y0 + size, x0:x0 + size, :3] = nrm
    Image.fromarray((np.clip(A, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(WORK, name, 'imp_a.png'))
    Image.fromarray((np.clip(N[..., :3], 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(WORK, name, 'imp_n.png'))
    return A.shape


def ktx(name):
    import base64, shutil, struct, subprocess, tempfile
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    out = os.path.join(root, 'assets', 'textures', 'trees')
    os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp()
    shutil.copy(os.path.join(WORK, name, 'imp_a.png'), os.path.join(tmp, name + '_imp_a.png'))
    shutil.copy(os.path.join(WORK, name, 'imp_n.png'), os.path.join(tmp, name + '_imp_n.png'))
    pos = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
    uv = struct.pack('<6f', 0, 0, 1, 0, 0, 1)
    buf = base64.b64encode(pos + uv).decode()
    prim = lambda m: {'attributes': {'POSITION': 0, 'TEXCOORD_0': 1}, 'material': m}
    g = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0, 1]}], 'nodes': [{'mesh': 0}, {'mesh': 1}],
         'meshes': [{'primitives': [prim(0)]}, {'primitives': [prim(1)]}],
         'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}, 'alphaMode': 'MASK'}, {'occlusionTexture': {'index': 1}}],
         'textures': [{'source': 0}, {'source': 1}], 'images': [{'uri': name + '_imp_a.png'}, {'uri': name + '_imp_n.png'}],
         'buffers': [{'byteLength': 60, 'uri': 'data:application/octet-stream;base64,' + buf}],
         'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36}, {'buffer': 0, 'byteOffset': 36, 'byteLength': 24}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [0, 0, 0], 'max': [1, 1, 0]}, {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC2'}]}
    json.dump(g, open(os.path.join(tmp, 'in.gltf'), 'w'))
    exe = os.path.join(root, 'tools', 'gltfpack.exe')
    r = subprocess.run([exe, '-i', os.path.join(tmp, 'in.gltf'), '-o', os.path.join(tmp, 'out.gltf'), '-tc', '-tu', 'attrib', '-tq', '9', '-kn'], capture_output=True, text=True)
    got = [f for f in os.listdir(tmp) if f.endswith('.ktx2')]
    for f in got:
        shutil.copy(os.path.join(tmp, f), os.path.join(out, f))
    shutil.rmtree(tmp, ignore_errors=True)
    imp = json.load(open(os.path.join(WORK, name, 'imp.json')))
    reg = os.path.join(out, 'impostors.json')
    data = json.load(open(reg)) if os.path.exists(reg) else {}
    c = imp['center']
    data[name] = {'frames': imp['frames'], 'center': [round(c[0], 3), round(c[2], 3), round(-c[1], 3)], 'radius': round(imp['radius'], 3)}
    json.dump(data, open(reg, 'w'), indent=1)
    return got, r.stderr[-200:]


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'ktx':
        print(ktx(sys.argv[2]))
    elif mode == 'cards':
        print(cards(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 32))
    else:
        print(imp(sys.argv[2], int(sys.argv[3]), int(sys.argv[4])))
