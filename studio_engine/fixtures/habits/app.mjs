import {habits,completion,toggle} from './model.mjs';
const key = 'studio-habits-' + location.pathname.split('/')[1] + '-' + new Date().toLocaleDateString('en-CA');
let values = [];
try {
  const stored = JSON.parse(localStorage.getItem(key) || '[]');
  if (Array.isArray(stored)) values = stored.filter(value => habits.includes(value));
} catch {}
const list = document.querySelector('#habits');
const status = document.querySelector('#status');
function render() {
  list.replaceChildren();
  for (const name of habits) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = values.includes(name);
    input.onchange = () => {
      values = toggle(values, name);
      render();
      try { localStorage.setItem(key, JSON.stringify(values)); }
      catch { status.textContent += ' Storage unavailable.'; }
    };
    label.append(input, document.createTextNode(name));
    list.append(label);
  }
  status.textContent = completion(values) + '% complete today';
}
render();
