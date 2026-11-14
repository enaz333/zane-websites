import {items, select, toggle} from './model.mjs';
const search = document.querySelector('#search');
const category = document.querySelector('#category');
const only = document.querySelector('#only');
const list = document.querySelector('#items');
const status = document.querySelector('#status');
let favorites = [];
try {
  const saved = JSON.parse(localStorage.getItem('collection-favorites') || '[]');
  if (Array.isArray(saved)) favorites = saved.filter(id => items.some(item => item.id === id));
} catch {}
function render() {
  list.replaceChildren();
  const visible = select(items, search.value, category.value, favorites, only.checked);
  status.textContent = visible.length + ' objects';
  for (const item of visible) {
    const card = document.createElement('article');
    const label = document.createElement('p');
    label.textContent = item.category;
    const heading = document.createElement('h2');
    heading.textContent = item.name;
    const description = document.createElement('p');
    description.textContent = item.description;
    const button = document.createElement('button');
    button.textContent = favorites.includes(item.id) ? 'Saved to favorites' : 'Save favorite';
    button.setAttribute('aria-pressed', String(favorites.includes(item.id)));
    button.onclick = () => {
      favorites = toggle(favorites, item.id);
      render();
      try { localStorage.setItem('collection-favorites', JSON.stringify(favorites)); }
      catch { status.textContent = 'Storage unavailable. Favorites last for this visit.'; }
    };
    card.append(label, heading, description, button);
    list.append(card);
  }
}
for (const input of [search, category, only]) input.addEventListener('input', render);
render();
