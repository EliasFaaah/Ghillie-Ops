import { register, assert } from './selftest.js';

const BINDINGS = Object.freeze({
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  sprint: ['ShiftLeft'], jump: ['Space'], crouch: ['KeyC'], prone: ['KeyZ'],
  fire: ['Mouse0'], ads: ['Mouse2'], reload: ['KeyR'],
  rifle: ['Digit1'], handgun: ['Digit2'], bandage: ['Digit3'], grenade: ['Digit4'],
  next: ['WheelDown'], prev: ['WheelUp'], scoreboard: ['Tab'], pause: ['Escape']
});

const ACTION_LABELS = Object.freeze({
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  sprint: 'Sprint', jump: 'Jump', crouch: 'Crouch (toggle)', prone: 'Prone (toggle)',
  fire: 'Fire', ads: 'Aim down sights', reload: 'Reload',
  rifle: 'Assault rifle', handgun: 'Handgun', bandage: 'Bandage', grenade: 'Grenade (hold to cook)',
  next: 'Next weapon', prev: 'Previous weapon', scoreboard: 'Scoreboard', pause: 'Pause menu'
});

const MNEMONIC = Object.freeze({ crouch: 'c', prone: 'z', reload: 'r' });

const NAMED = { ShiftLeft: 'Shift', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Mouse0: 'Left mouse', Mouse1: 'Middle mouse', Mouse2: 'Right mouse', WheelUp: 'Wheel up', WheelDown: 'Wheel down' };

function keyLabel(code, layout = null) {
  if (NAMED[code]) return NAMED[code];
  const key = layout && layout.get(code);
  return key ? key.toUpperCase() : code.replace(/^Key|^Digit/, '');
}

function resolveBindings(layout) {
  const positional = new Set(Object.entries(BINDINGS).filter(([action]) => !MNEMONIC[action]).flatMap(([, codes]) => codes));
  const out = {};
  for (const [action, codes] of Object.entries(BINDINGS)) {
    const letter = MNEMONIC[action];
    let code = null;
    if (letter && layout) for (const [c, key] of layout) if (key === letter && /^Key[A-Z]$/.test(c) && !positional.has(c)) code = c;
    out[action] = code ? [code] : codes;
  }
  return Object.freeze(out);
}

export async function readLayout(nav = navigator) {
  if (!nav.keyboard || typeof nav.keyboard.getLayoutMap !== 'function') return null;
  try { return await nav.keyboard.getLayoutMap(); } catch { return null; }
}

export function createInput(target, source = window, doc = document) {
  const held = new Set();
  const pressedCodes = new Set();
  const releasedCodes = new Set();
  const lockListeners = [];
  const state = { locked: false, raw: false, lockError: null, lookX: 0, lookY: 0 };
  let bindings = BINDINGS;
  let layout = null;
  let bound = new Set(Object.values(bindings).flat());
  let dx = 0, dy = 0;

  const press = code => { if (!held.has(code)) { held.add(code); pressedCodes.add(code); } };
  const release = code => { if (held.delete(code)) releasedCodes.add(code); };
  const releaseAll = () => { for (const code of [...held]) release(code); };
  const typing = e => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

  source.addEventListener('keydown', e => {
    if (typing(e)) return;
    if (bound.has(e.code) && e.code !== 'Escape') e.preventDefault();
    if (!e.repeat) press(e.code);
  });
  source.addEventListener('keyup', e => release(e.code));
  source.addEventListener('blur', releaseAll);
  target.addEventListener('mousedown', e => press(`Mouse${e.button}`));
  source.addEventListener('mouseup', e => release(`Mouse${e.button}`));
  target.addEventListener('contextmenu', e => e.preventDefault());
  target.addEventListener('wheel', e => { if (e.deltaY) pressedCodes.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp'); }, { passive: true });
  const moveEvent = 'onpointerrawupdate' in target ? 'pointerrawupdate' : 'pointermove';
  target.addEventListener(moveEvent, e => {
    if (!state.locked) return;
    dx += e.movementX;
    dy += e.movementY;
  });
  doc.addEventListener('pointerlockchange', () => {
    state.locked = doc.pointerLockElement === target;
    dx = dy = 0;
    if (!state.locked) releaseAll();
    for (const fn of lockListeners) fn(state.locked);
  });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) releaseAll(); });

  return {
    state,
    moveEvent,
    setLayout(map) {
      layout = map;
      bindings = resolveBindings(map);
      bound = new Set(Object.values(bindings).flat());
      releaseAll();
    },
    rows: () => Object.entries(bindings).map(([action, codes]) => [ACTION_LABELS[action], codes.map(c => keyLabel(c, layout))]),
    down: action => bindings[action].some(c => held.has(c)),
    pressed: action => bindings[action].some(c => pressedCodes.has(c)),
    released: action => bindings[action].some(c => releasedCodes.has(c)),
    heldCodes: () => [...held],
    look() {
      const r = { dx, dy };
      state.lookX += dx; state.lookY += dy;
      dx = dy = 0;
      return r;
    },
    endTick() {
      pressedCodes.clear();
      releasedCodes.clear();
    },
    onLockChange(fn) { lockListeners.push(fn); },
    async lock() {
      if (doc.pointerLockElement === target) return true;
      try {
        await target.requestPointerLock({ unadjustedMovement: true });
        state.raw = true;
      } catch (e) {
        if (e.name !== 'NotSupportedError') { state.lockError = `${e.name}: ${e.message}`; return false; }
        try { await target.requestPointerLock(); state.raw = false; } catch (e2) { state.lockError = `${e2.name}: ${e2.message}`; return false; }
      }
      state.lockError = null;
      return true;
    }
  };
}

function privateInput() {
  const source = new EventTarget();
  const doc = new EventTarget();
  doc.pointerLockElement = null;
  const el = document.createElement('div');
  return { source, el, input: createInput(el, source, doc) };
}

register('core/input', 'key and mouse edges, held state, release on blur', () => {
  const { source, el, input } = privateInput();
  source.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  assert(input.down('forward') && input.pressed('forward'), 'keydown must set held and pressed');
  source.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', repeat: true }));
  input.endTick();
  assert(input.down('forward') && !input.pressed('forward'), 'pressed must clear after endTick while held stays');
  source.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  assert(!input.down('forward') && input.released('forward'), 'keyup must set released');
  input.endTick();
  el.dispatchEvent(new MouseEvent('mousedown', { button: 2 }));
  assert(input.down('ads') && input.pressed('ads'), 'right mouse must map to ads');
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
  assert(input.pressed('next') && !input.down('next'), 'wheel must be an edge only');
  source.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  source.dispatchEvent(new Event('blur'));
  assert(!input.down('sprint') && !input.down('ads'), 'blur must release everything');
  el.dispatchEvent(new PointerEvent(input.moveEvent, { movementX: 40, movementY: -8 }));
  const look = input.look();
  assert(look.dx === 0 && look.dy === 0, 'mouse movement must be ignored while the pointer is not locked');
  for (const action of Object.keys(BINDINGS)) assert(ACTION_LABELS[action], `binding ${action} has no label`);
});

register('core/input', 'letter keys follow the keyboard layout (German QWERTZ)', () => {
  const qwertz = new Map([['KeyQ', 'q'], ['KeyW', 'w'], ['KeyE', 'e'], ['KeyR', 'r'], ['KeyT', 't'], ['KeyY', 'z'], ['KeyZ', 'y'], ['KeyA', 'a'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyC', 'c'], ['Digit1', '1'], ['Semicolon', 'ö']]);
  const b = resolveBindings(qwertz);
  assert(b.prone.length === 1 && b.prone[0] === 'KeyY' && keyLabel('KeyY', qwertz) === 'Z', `prone must use the key labeled Z (KeyY), got ${b.prone} labeled ${keyLabel(b.prone[0], qwertz)}`);
  assert(b.forward[0] === 'KeyW' && keyLabel('KeyW', qwertz) === 'W' && b.crouch[0] === 'KeyC' && b.reload[0] === 'KeyR', 'WASD stays positional, C and R stay where they are on QWERTZ');
  const azerty = new Map([['KeyQ', 'a'], ['KeyW', 'z'], ['KeyA', 'q'], ['KeyZ', 'w'], ['KeyC', 'c'], ['KeyR', 'r']]);
  assert(resolveBindings(azerty).prone[0] === 'KeyZ', 'a mnemonic key must not steal a positional movement key');
  assert(resolveBindings(null).prone[0] === 'KeyZ', 'without a layout map the default codes apply');
  const { source, input } = privateInput();
  input.setLayout(qwertz);
  source.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyY' }));
  assert(input.down('prone') && !input.down('jump'), 'pressing the key labeled Z must go prone on QWERTZ');
  const row = input.rows().find(([label]) => label === ACTION_LABELS.prone);
  assert(row && row[1].join() === 'Z', `binding list must show the real key cap, got ${row && row[1]}`);
});
