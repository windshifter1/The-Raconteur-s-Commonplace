const COLS = 3;
const ROWS = 5;

/** Shelf face on the plate, in % of the image (tuned to room.png) */
const SHELF = {
  x: 31.6,
  y: 13.8,
  w: 36.8,
  h: 64.2,
};

const FRAME = 0.055;
const GAP_X = 0.03;
const GAP_Y = 0.026;

const stage = document.getElementById('stage');
const hits = document.getElementById('hits');
const title = document.getElementById('bay-title');
const note = document.getElementById('bay-note');

function bayKey(r, c) {
  return `r${r}c${c}`;
}

function buildBays() {
  const innerW = 1 - FRAME * 2;
  const innerH = 1 - FRAME * 2;
  const cellW = (innerW - GAP_X * (COLS - 1)) / COLS;
  const cellH = (innerH - GAP_Y * (ROWS - 1)) / ROWS;
  const bays = [];

  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      const lx = FRAME + (c - 1) * (cellW + GAP_X);
      const ly = FRAME + (r - 1) * (cellH + GAP_Y);
      bays.push({
        key: bayKey(r, c),
        label: `Row ${r} · Column ${c}`,
        x: SHELF.x + lx * SHELF.w,
        y: SHELF.y + ly * SHELF.h,
        w: cellW * SHELF.w,
        h: cellH * SHELF.h,
      });
    }
  }
  return bays;
}

function selectBay(bay, el) {
  hits.querySelectorAll('.bay').forEach((n) => n.classList.remove('is-on'));
  el.classList.add('is-on');
  title.textContent = bay.label;
  note.textContent = `Bay ${bay.key.toUpperCase()} on the cream built-in — clickable map over the exact room plate.`;
}

function renderHits() {
  const bays = buildBays();
  hits.innerHTML = '';
  for (const bay of bays) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'bay');
    rect.setAttribute('x', bay.x.toFixed(3));
    rect.setAttribute('y', bay.y.toFixed(3));
    rect.setAttribute('width', bay.w.toFixed(3));
    rect.setAttribute('height', bay.h.toFixed(3));
    rect.setAttribute('tabindex', '0');
    rect.setAttribute('role', 'button');
    rect.setAttribute('aria-label', bay.label);
    rect.addEventListener('click', () => selectBay(bay, rect));
    rect.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectBay(bay, rect);
      }
    });
    hits.appendChild(rect);
  }
}

function setMode(mode) {
  stage.classList.toggle('is-plate', mode === 'plate');
  stage.classList.toggle('is-vector', mode === 'vector');
  document.querySelectorAll('.tog').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.mode === mode);
  });
  if (mode === 'vector') {
    title.textContent = 'Vector twin';
    note.textContent =
      'Stepped warm-wood unit from the photo proportions: skinny tall center, wider side wings, thin planks.';
  } else {
    title.textContent = 'Tap a shelf';
    note.textContent =
      'Fifteen compartments on the cream unit — empty of catalogue data for now, ready to open.';
  }
}

document.querySelectorAll('.tog').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

renderHits();
setMode('plate');
