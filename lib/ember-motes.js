/** Ember motes for gold buttons. Safe to call more than once. */
export function sprinkleButtonMotes(root = document) {
  const sel = '.dock-button, .explore-button, .walk-button, .solid-cta, .ghost-cta, .search-results-close, .intake-add';
  root.querySelectorAll(sel).forEach((el) => {
    if (el.disabled || el.querySelector('.btn-motes')) return;
    el.classList.add('ember-btn');
    const wrap = document.createElement('span');
    wrap.className = 'btn-motes';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    el.appendChild(wrap);
  });
}
