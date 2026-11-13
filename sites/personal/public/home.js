(() => {
  const cards = [...document.querySelectorAll('.project-card')];
  const featured = cards.filter(card => card.dataset.featured === 'true');
  const region = document.querySelector('.feature');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rotation = document.getElementById('rotation');
  let index = 0;
  let playing = !reduced.matches;
  let hovering = false;
  let timer;
  const dots = featured.map((card, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Show ${card.querySelector('h3').textContent}`);
    button.setAttribute('aria-pressed', String(i === 0));
    button.addEventListener('click', () => { playing = false; show(i, true); });
    document.querySelector('.slide-dots').append(button);
    return button;
  });
  function schedule() {
    clearTimeout(timer);
    rotation.textContent = playing ? 'Pause' : 'Play';
    rotation.setAttribute('aria-label', playing ? 'Pause automatic rotation' : 'Start automatic rotation');
    if (playing && !hovering && !document.hidden) timer = setTimeout(() => show(index + 1), 6500);
  }
  function show(next, announce = false) {
    index = (next + featured.length) % featured.length;
    const card = featured[index];
    const source = card.querySelector('img');
    const photo = document.getElementById('feature-photo');
    photo.src = source.getAttribute('src');
    photo.alt = source.alt;
    document.getElementById('feature-title').textContent = card.querySelector('h3').textContent;
    document.getElementById('feature-category').textContent = card.dataset.category;
    document.getElementById('feature-description').textContent = card.dataset.description;
    document.getElementById('feature-link').href = card.querySelector('a').href;
    document.getElementById('feature-slide').setAttribute('aria-label', `${index + 1} of ${featured.length}`);
    document.getElementById('slide-count').textContent = `${String(index + 1).padStart(2, '0')} / ${String(featured.length).padStart(2, '0')}`;
    dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === index)));
    if (announce) document.getElementById('slide-announcement').textContent = `${card.querySelector('h3').textContent}, ${index + 1} of ${featured.length}`;
    schedule();
  }
  rotation.addEventListener('click', () => { playing = !playing; schedule(); });
  for (const [id, delta] of [['previous', -1], ['next', 1]]) {
    document.getElementById(id).addEventListener('click', () => { playing = false; show(index + delta, true); });
  }
  region.addEventListener('mouseenter', () => { hovering = true; schedule(); });
  region.addEventListener('mouseleave', () => { hovering = false; schedule(); });
  region.addEventListener('focusin', () => { playing = false; schedule(); });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => { if (reduced.matches) playing = false; schedule(); });
  document.querySelector('.carousel-controls').hidden = false;
  document.querySelector('.filters').hidden = false;
  for (const button of document.querySelectorAll('[data-filter]')) {
    button.addEventListener('click', () => {
      for (const other of document.querySelectorAll('[data-filter]')) other.setAttribute('aria-pressed', String(other === button));
      let count = 0;
      cards.forEach(card => {
        card.hidden = button.dataset.filter !== 'All' && card.dataset.category !== button.dataset.filter;
        if (!card.hidden) count++;
      });
      document.getElementById('result-count').textContent = `${count} ${count === 1 ? 'project' : 'projects'}`;
    });
  }
  schedule();
})();
