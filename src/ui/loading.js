import { register, assert } from '../core/selftest.js';

export function createLoading(el) {
  const fill = el.querySelector('.fill');
  const pct = el.querySelector('.pct');
  const status = el.querySelector('.status');
  let shown = 0;
  return {
    set(fraction, label) {
      shown = Math.max(shown, Math.min(1, fraction));
      fill.style.transform = `scaleX(${shown})`;
      pct.textContent = `${Math.floor(shown * 100)}%`;
      if (label) status.textContent = label;
    },
    fail(message) {
      el.classList.add('failed');
      status.textContent = message;
    },
    hide() { el.classList.add('hidden'); }
  };
}

register('ui/loading', 'bar shows real progress monotonically', () => {
  const el = document.createElement('div');
  el.innerHTML = '<span class="status"></span><span class="pct"></span><div class="fill"></div>';
  const loading = createLoading(el);
  const pct = () => el.querySelector('.pct').textContent;
  loading.set(0.02, 'Starting engine');
  assert(pct() === '2%' && el.querySelector('.fill').style.transform === 'scaleX(0.02)', `start must show 2%, got ${pct()}`);
  loading.set(0.47, 'Loading textures 1/3');
  assert(pct() === '47%' && el.querySelector('.status').textContent === 'Loading textures 1/3', `progress must show 47% and the status, got ${pct()}`);
  loading.set(0.3);
  assert(pct() === '47%' && el.querySelector('.status').textContent === 'Loading textures 1/3', 'the bar must never move backwards and keep the status without a label');
  loading.set(1.4, 'Ready');
  assert(pct() === '100%', 'values above 1 must clamp to 100%');
  loading.fail('Failed to start: x');
  assert(el.classList.contains('failed') && el.querySelector('.status').textContent === 'Failed to start: x', 'fail must show the message');
});
