import os, sys
import numpy as np
from PIL import Image, ImageFilter

W = os.environ.get('GHILLIE_FP', os.path.join(os.environ.get('TEMP', '.'), 'ghillie_fp'))
LANES = 8
SIZE = 1024

PALETTES = {
    'woodland': [(0.13, 0.17, 0.07), (0.20, 0.24, 0.10), (0.31, 0.27, 0.13), (0.10, 0.12, 0.06), (0.26, 0.19, 0.10), (0.17, 0.21, 0.09), (0.34, 0.31, 0.17), (0.08, 0.10, 0.05)],
    'desert': [(0.53, 0.45, 0.29), (0.62, 0.53, 0.36), (0.45, 0.37, 0.24), (0.67, 0.60, 0.45), (0.39, 0.33, 0.21), (0.57, 0.47, 0.33), (0.50, 0.43, 0.31), (0.60, 0.50, 0.34)],
    'snow': [(0.88, 0.90, 0.92), (0.78, 0.80, 0.84), (0.93, 0.94, 0.95), (0.68, 0.70, 0.74), (0.84, 0.86, 0.88), (0.74, 0.78, 0.80), (0.95, 0.95, 0.93), (0.60, 0.64, 0.68)],
    'autumn': [(0.47, 0.24, 0.07), (0.53, 0.33, 0.09), (0.36, 0.17, 0.06), (0.58, 0.43, 0.14), (0.30, 0.24, 0.09), (0.43, 0.15, 0.05), (0.26, 0.21, 0.08), (0.53, 0.28, 0.09)],
    'swamp': [(0.09, 0.13, 0.07), (0.14, 0.19, 0.09), (0.10, 0.10, 0.06), (0.19, 0.21, 0.10), (0.07, 0.09, 0.06), (0.15, 0.16, 0.09), (0.12, 0.17, 0.10), (0.17, 0.14, 0.08)],
    'urban': [(0.17, 0.18, 0.19), (0.28, 0.28, 0.29), (0.10, 0.10, 0.11), (0.36, 0.37, 0.37), (0.22, 0.23, 0.26), (0.15, 0.16, 0.17), (0.43, 0.43, 0.43), (0.07, 0.07, 0.08)],
}


def lane(rng, w, h, pal):
    xs = np.linspace(0, 1, w)[None, :]
    v = np.linspace(0, 1, h)
    alpha = np.zeros((h, w), np.float32)
    col = np.zeros((h, w, 3), np.float32)
    order = []
    for _ in range(170):
        x0 = 0.5 + rng.normal(0, 0.17)
        length = np.clip(rng.uniform(0.25, 1.0) * (1.10 - abs(x0 - 0.5) * 1.5), 0.10, 1.0)
        order.append((length, x0))
    order.sort(key=lambda t: -t[0])
    sub = [np.array(pal[i], np.float32) for i in rng.choice(len(pal), 4, replace=False)]
    for length, x0 in order:
        wob = rng.uniform(0.004, 0.03)
        ph = rng.uniform(0, 6.28)
        fr = rng.uniform(1.2, 5)
        xc = x0 + wob * np.sin(v * fr * 6.28 + ph) + v * rng.normal(0, 0.06)
        thick = rng.uniform(0.012, 0.034) * np.clip(1 - 0.85 * (v / length) ** 1.6, 0.05, 1)
        row = (np.abs(xs - xc[:, None]) < thick[:, None] * 0.5) & (v[:, None] < length)
        c0 = sub[rng.integers(0, 4)]
        c1 = sub[rng.integers(0, 4)]
        mixv = np.clip(v * rng.uniform(0.6, 1.4) + rng.normal(0, 0.15), 0, 1)[:, None, None]
        c = (c0 * (1 - mixv) + c1 * mixv) * rng.uniform(0.72, 1.28) * (0.62 + 0.5 * v[:, None, None])
        col = np.where(row[..., None], np.broadcast_to(c, (h, w, 3)), col)
        alpha = np.maximum(alpha, row.astype(np.float32))
    return col, alpha


def make(variant, out_dir):
    rng = np.random.default_rng(12345)
    pal = PALETTES[variant]
    lw = SIZE // LANES
    img = np.zeros((SIZE, SIZE, 4), np.float32)
    for i in range(LANES):
        col, alpha = lane(rng, lw, SIZE, pal)
        img[:, i * lw:(i + 1) * lw, :3] = np.clip(col, 0, 1)
        img[:, i * lw:(i + 1) * lw, 3] = alpha
    rgb = img[..., :3]
    a = img[..., 3]
    for _ in range(6):
        blur = np.array(Image.fromarray((rgb * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
        rgb = np.where(a[..., None] > 0.5, rgb, blur)
    img[..., :3] = rgb
    img = np.flipud(img)
    os.makedirs(out_dir, exist_ok=True)
    Image.fromarray((img * 255).astype(np.uint8), 'RGBA').save(os.path.join(out_dir, 'diff.png'))




def ktx(variant, out_dir):
    import base64, json, shutil, struct, subprocess, tempfile
    src = os.path.join(W, 'tex', 'strands_' + variant, 'diff.png')
    tmp = tempfile.mkdtemp()
    name = 'strands_' + variant
    shutil.copy(src, os.path.join(tmp, name + '.png'))
    pos = struct.pack('<9f', 0, 0, 0, 1, 0, 0, 0, 1, 0)
    uv = struct.pack('<6f', 0, 0, 1, 0, 0, 1)
    buf = base64.b64encode(pos + uv).decode()
    g = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
         'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'TEXCOORD_0': 1}, 'material': 0}]}],
         'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}, 'alphaMode': 'MASK'}],
         'textures': [{'source': 0}], 'images': [{'uri': name + '.png'}],
         'buffers': [{'byteLength': 60, 'uri': 'data:application/octet-stream;base64,' + buf}],
         'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 36}, {'buffer': 0, 'byteOffset': 36, 'byteLength': 24}],
         'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3', 'min': [0, 0, 0], 'max': [1, 1, 0]}, {'bufferView': 1, 'componentType': 5126, 'count': 3, 'type': 'VEC2'}]}
    json.dump(g, open(os.path.join(tmp, 'in.gltf'), 'w'))
    exe = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'gltfpack.exe')
    r = subprocess.run([exe, '-i', os.path.join(tmp, 'in.gltf'), '-o', os.path.join(tmp, 'out.gltf'), '-tc', '-tq', '8'], capture_output=True, text=True)
    os.makedirs(out_dir, exist_ok=True)
    got = [f for f in os.listdir(tmp) if f.endswith('.ktx2')]
    for f in got:
        shutil.copy(os.path.join(tmp, f), os.path.join(out_dir, name + '.ktx2'))
    shutil.rmtree(tmp, ignore_errors=True)
    return got, r.stderr[-200:]


if __name__ == '__main__':
    for v in (sys.argv[1:] or PALETTES):
        make(v, os.path.join(W, 'tex', 'strands_' + v))
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    for v in (sys.argv[1:] or PALETTES):
        print(v, ktx(v, os.path.join(root, 'assets', 'textures', 'ghillie')))
