import io, os, sys, zipfile, urllib.request
import numpy as np
from PIL import Image

W = os.environ.get('GHILLIE_FP', os.path.join(os.environ.get('TEMP', '.'), 'ghillie_fp'))
op = urllib.request.build_opener()
op.addheaders = [('User-Agent', 'Mozilla/5.0')]
urllib.request.install_opener(op)

SETS = ['Metal038', 'Metal061B', 'Metal042A', 'Metal055A', 'Metal029', 'Plastic011', 'Plastic012A', 'Rubber004', 'Leather027', 'Fabric030', 'Fabric066', 'Fabric081C', 'Wood066']


def grab(name):
    out = os.path.join(W, 'tex', name)
    if os.path.exists(os.path.join(out, 'arm.jpg')):
        return
    os.makedirs(out, exist_ok=True)
    data = urllib.request.urlopen(f'https://ambientcg.com/get?file={name}_1K-JPG.zip').read()
    z = zipfile.ZipFile(io.BytesIO(data))
    files = {n.split('_')[-1].split('.')[0]: z.read(n) for n in z.namelist() if n.lower().endswith('.jpg')}
    col = Image.open(io.BytesIO(files['Color'])).convert('RGB')
    col.save(os.path.join(out, 'diff.jpg'), quality=94)
    Image.open(io.BytesIO(files['NormalGL'])).convert('RGB').save(os.path.join(out, 'nor.jpg'), quality=94)
    size = col.size
    rough = np.asarray(Image.open(io.BytesIO(files['Roughness'])).convert('L').resize(size), dtype=np.uint8)
    metal = np.asarray(Image.open(io.BytesIO(files['Metalness'])).convert('L').resize(size), dtype=np.uint8) if 'Metalness' in files else np.zeros_like(rough)
    ao = np.asarray(Image.open(io.BytesIO(files['AmbientOcclusion'])).convert('L').resize(size), dtype=np.uint8) if 'AmbientOcclusion' in files else np.full_like(rough, 255)
    Image.fromarray(np.stack([ao, rough, metal], -1), 'RGB').save(os.path.join(out, 'arm.jpg'), quality=94)
    print('tex', name, sorted(files))


for s in (sys.argv[1:] or SETS):
    grab(s)

print('done')
