import { register, assert } from '../core/selftest.js';

export function createPause(el) {
  const list = el.querySelector('dl');
  const title = el.querySelector('h1');
  const prompt = el.querySelector('.resume');
  const hint = el.querySelector('.hint');
  return {
    setBindings(rows) {
      const items = [];
      for (const [label, keys] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        for (const key of keys) {
          const k = document.createElement('kbd');
          k.textContent = key;
          dd.append(k);
        }
        items.push(dt, dd);
      }
      list.replaceChildren(...items);
    },
    show(heading, action, note = '') {
      title.textContent = heading;
      prompt.textContent = action;
      hint.textContent = note;
      el.classList.remove('hidden');
    },
    hide() { el.classList.add('hidden'); },
    onClick(fn) { el.addEventListener('click', fn); }
  };
}

register('ui/pause', 'binding list renders every action with its key caps', () => {
  const el = document.createElement('div');
  el.className = 'overlay hidden';
  el.innerHTML = '<h1></h1><div class="resume"></div><div class="hint"></div><dl></dl>';
  const pause = createPause(el);
  pause.setBindings([['Move forward', ['W']], ['Prone (toggle)', ['Z']], ['Fire', ['Left mouse', 'X']]]);
  pause.setBindings([['Move forward', ['W']], ['Prone (toggle)', ['Z']], ['Fire', ['Left mouse', 'X']]]);
  const dts = [...el.querySelectorAll('dt')].map(d => d.textContent);
  const kbds = [...el.querySelectorAll('dd')].map(d => [...d.querySelectorAll('kbd')].map(k => k.textContent).join('+'));
  assert(dts.join('|') === 'Move forward|Prone (toggle)|Fire', `rows rendered as ${dts.join('|')}`);
  assert(kbds.join('|') === 'W|Z|Left mouse+X', `key caps rendered as ${kbds.join('|')}`);
  pause.show('Paused', 'Click to resume', 'note');
  assert(!el.classList.contains('hidden') && el.querySelector('h1').textContent === 'Paused' && el.querySelector('.hint').textContent === 'note', 'show must fill and reveal the overlay');
  pause.hide();
  assert(el.classList.contains('hidden'), 'hide must hide the overlay');
});
