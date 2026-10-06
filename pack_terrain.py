import os, sys, json, base64, struct, subprocess
import numpy as np
from PIL import Image

W = os.path.dirname(os.path.abspath(__file__))
OUT = r'C:\Users\Leschke\Downloads\GhillieOps\assets\textures\terrain'
GLTFPACK = r'C:\Users\Leschke\Downloads\GhillieOps\tools\gltfpack.exe'

LAYERS = {
    'grass': ('leafy_grass', 2048, dict(hue=0.255, hue_w=0.85, sat=1.7, sat_add=0.10, vmean=0.40)),
    'forest': ('forrest_ground_01', 1024, dict(hue=0.22, hue_w=0.6, sat=1.1, sat_add=0.0, vmean=0.27)),
    'rock': ('rock_face_03', 2048, dict(hue=0.10, hue_w=0.0, sat=0.45, sat_add=0.0, vmean=0.40)),
    'dirt': ('brown_mud_dry', 1024, dict(hue=0.08, hue_w=0.0, sat=0.9, sat_add=0.0, vmean=0.34)),
    'bed': ('river_small_rocks', 1024, dict(hue=0.1, hue_w=0.0, sat=0.8, sat_add=0.0, vmean=0.36)),
}


def grade(img, hue, hue_w, sat, sat_add, vmean):
    hsv = np.asarray(img.convert('HSV')).astype(np.float32) / 255.0
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    h = h + (hue - h) * hue_w
    s = np.clip(s * sat + sat_add, 0, 1)
    v = np.clip(v * (vmean / max(v.mean(), 1e-4)), 0, 1)
    out = np.stack([h, s, v], -1)
    return Image.fromarray((out * 255).astype(np.uint8), 'HSV').convert('RGB')


def gltf_for(a, n):
    pos = np.array([[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], np.float32)
    nor = np.array([[0, 1, 0]] * 4, np.float32)
    uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.float32)
    idx = np.array([0, 2, 1, 0, 3, 2], np.uint16)
    blob = pos.tobytes() + nor.tobytes() + uv.tobytes() + idx.tobytes() + b'\0\0'
    return {
        'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1, 'TEXCOORD_0': 2}, 'indices': 3, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}, 'normalTexture': {'index': 1}}],
        'textures': [{'source': 0}, {'source': 1}],
        'images': [{'uri': a}, {'uri': n}],
        'buffers': [{'byteLength': len(blob), 'uri': 'data:application/octet-stream;base64,' + base64.b64encode(blob).decode()}],
        'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 48, 'target': 34962}, {'buffer': 0, 'byteOffset': 48, 'byteLength': 48, 'target': 34962}, {'buffer': 0, 'byteOffset': 96, 'byteLength': 32, 'target': 34962}, {'buffer': 0, 'byteOffset': 128, 'byteLength': 12, 'target': 34963}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': 4, 'type': 'VEC3', 'min': [-1, 0, -1], 'max': [1, 0, 1]},
            {'bufferView': 1, 'componentType': 5126, 'count': 4, 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5126, 'count': 4, 'type': 'VEC2'},
            {'bufferView': 3, 'componentType': 5123, 'count': 6, 'type': 'SCALAR'}],
    }


os.makedirs(OUT, exist_ok=True)
for name, (src, size, g) in LAYERS.items():
    d = os.path.join(W, 'tex', src)
    a = grade(Image.open(os.path.join(d, 'diff.jpg')).convert('RGB'), **g).resize((size, size), Image.LANCZOS)
    n = Image.open(os.path.join(d, 'nor.jpg')).convert('RGB').resize((size, size), Image.LANCZOS)
    tmp = os.path.join(W, 'pack', name)
    os.makedirs(tmp, exist_ok=True)
    a.save(os.path.join(tmp, f'terrain_{name}_a.png'))
    n.save(os.path.join(tmp, f'terrain_{name}_n.png'))
    with open(os.path.join(tmp, 'in.gltf'), 'w') as f:
        json.dump(gltf_for(f'terrain_{name}_a.png', f'terrain_{name}_n.png'), f)
    subprocess.run([GLTFPACK, '-i', os.path.join(tmp, 'in.gltf'), '-o', os.path.join(tmp, 'out.gltf'), '-tc', '-tu', 'normal,attrib'], check=True)
    for k in ('a', 'n'):
        src_k = os.path.join(tmp, f'terrain_{name}_{k}.ktx2')
        dst = os.path.join(OUT, f'terrain_{name}_{k}.ktx2')
        if os.path.exists(dst):
            os.remove(dst)
        os.replace(src_k, dst)
    print(name, os.path.getsize(os.path.join(OUT, f'terrain_{name}_a.ktx2')), os.path.getsize(os.path.join(OUT, f'terrain_{name}_n.ktx2')))
