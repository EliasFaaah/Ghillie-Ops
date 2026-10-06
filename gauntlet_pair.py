import sys, json, random, argparse, traceback
from pathlib import Path
from PIL import Image

W, H = 1600, 900


def step(name, fn, *args):
    try:
        return fn(*args)
    except Exception as e:
        tb = traceback.extract_tb(e.__traceback__)[-1]
        print(f'gauntlet_pair.py:{tb.lineno} [{name}] {type(e).__name__}: {e}', file=sys.stderr)
        sys.exit(1)


def fit(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    if w * H > h * W:
        nw = h * W // H
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = w * H // W
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return Image.frombytes('RGB', (W, H), im.resize((W, H), Image.LANCZOS).tobytes())


def args():
    p = argparse.ArgumentParser(description='blind A/B pair for the gauntlet critic')
    p.add_argument('game')
    p.add_argument('ref')
    p.add_argument('blind')
    p.add_argument('key')
    p.add_argument('--seed', type=int)
    a = p.parse_args()
    for f in (a.game, a.ref):
        assert Path(f).is_file(), f'missing image {f}'
    assert Path(a.key).resolve().parent != Path(a.blind).resolve(), 'the key must not lie in the blind folder'
    return a


def write(a, game, ref):
    out = Path(a.blind)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.iterdir():
        old.unlink()
    game_side = random.Random(a.seed).choice('AB')
    ref_side = 'B' if game_side == 'A' else 'A'
    game.save(out / f'{game_side}.png')
    ref.save(out / f'{ref_side}.png')
    Path(a.key).parent.mkdir(parents=True, exist_ok=True)
    Path(a.key).write_text(json.dumps({'game': game_side, 'game_src': str(Path(a.game).resolve()), 'ref_src': str(Path(a.ref).resolve())}, indent=2))
    return out


def verify(out):
    names = sorted(p.name for p in out.iterdir())
    assert names == ['A.png', 'B.png'], f'blind folder holds {names}'
    for n in names:
        im = Image.open(out / n)
        assert im.size == (W, H), f'{n} is {im.size}, expected {(W, H)}'
        assert not im.info, f'{n} still carries metadata {list(im.info)}'


a = step('args', args)
game = step('load game', fit, a.game)
ref = step('load reference', fit, a.ref)
out = step('write pair', write, a, game, ref)
step('verify', verify, out)
