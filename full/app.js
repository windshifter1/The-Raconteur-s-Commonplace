/**
 * Full Experience — 3D library with multi-unit editable bookshelves
 */

const STORAGE_KEY = 'trc-full-library-v2';
const LEGACY_KEY = 'trc-mockup6-library-v1';
const bookColors = ['#bd6256', '#597e9d', '#ce9551', '#67886d', '#a3647a', '#a68a62', '#4c7779'];
const boxColors = ['#8a5339', '#6b4030', '#a26443', '#5a3429'];

const world = document.getElementById('world');
const stage = document.getElementById('stage');
const unitLayer = document.getElementById('unit-layer');
const editPanel = document.getElementById('edit-panel');
const btnEdit = document.getElementById('btn-edit');
const weightInput = document.getElementById('shelf-weight');
const weightOut = document.getElementById('shelf-weight-out');
const booksInput = document.getElementById('shelf-books');
const booksOut = document.getElementById('shelf-books-out');
const depthInput = document.getElementById('case-depth');
const depthOut = document.getElementById('case-depth-out');
const zoomInput = document.getElementById('cam-zoom');
const zoomOut = document.getElementById('cam-zoom-out');
const editHint = document.getElementById('edit-hint');
const fileIn = document.getElementById('file-in');

let uidSeq = 0;
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${(uidSeq += 1)}`;

function defaultShelves() {
  return [
    { id: 'shelf-1', weight: 1, books: 46, boxes: [] },
    { id: 'shelf-2', weight: 1, books: 48, boxes: [] },
    { id: 'shelf-3', weight: 1, books: 46, boxes: [] },
    { id: 'shelf-4', weight: 1, books: 44, boxes: [] },
  ];
}

function makeUnit(x, y, w, h, shelves = null) {
  return {
    id: uid('unit'),
    x,
    y,
    w,
    h,
    shelves: shelves || defaultShelves().map((s) => ({ ...s, id: uid('shelf'), boxes: [] })),
  };
}

function defaultState() {
  return {
    version: 2,
    zoom: 1,
    depth: 80,
    units: [makeUnit(26, 16, 48, 60, defaultShelves())],
  };
}

function normalizeShelf(s, i) {
  return {
    id: s.id || `shelf-${i + 1}`,
    weight: Math.max(0.35, Number(s.weight) || 1),
    books: Math.min(56, Math.max(8, Number(s.books) || 40)),
    boxes: Array.isArray(s.boxes)
      ? s.boxes.map((b, j) => ({
          id: b.id || `box-${i}-${j}`,
          width: Math.min(0.35, Math.max(0.08, Number(b.width) || 0.14)),
          color: b.color || boxColors[j % boxColors.length],
        }))
      : [],
  };
}

function normalizeUnit(u, i) {
  return {
    id: u.id || `unit-${i + 1}`,
    x: Math.min(92, Math.max(0, Number(u.x) ?? 26)),
    y: Math.min(88, Math.max(0, Number(u.y) ?? 16)),
    w: Math.min(90, Math.max(18, Number(u.w) ?? 48)),
    h: Math.min(85, Math.max(22, Number(u.h) ?? 60)),
    shelves: (u.shelves?.length ? u.shelves : defaultShelves()).map(normalizeShelf),
  };
}

function migrate(parsed) {
  if (parsed?.version === 2 && parsed.units?.length) {
    return {
      version: 2,
      zoom: Math.min(1.45, Math.max(0.75, Number(parsed.zoom) || 1)),
      depth: parsed.depth ?? 80,
      units: parsed.units.map(normalizeUnit),
    };
  }
  if (parsed?.shelves?.length) {
    return {
      version: 2,
      zoom: 1,
      depth: parsed.depth ?? 80,
      units: [normalizeUnit({ id: 'unit-1', x: 26, y: 16, w: 48, h: 60, shelves: parsed.shelves }, 0)],
    };
  }
  return defaultState();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

let state = loadState();
let editing = false;
let selected = { type: null, unitId: null, shelfId: null, boxId: null };
let drag = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findUnit(id) {
  return state.units.find((u) => u.id === id) || null;
}

function findShelf(unit, id) {
  return unit?.shelves.find((s) => s.id === id) || null;
}

function selectedUnit() {
  return selected.unitId ? findUnit(selected.unitId) : null;
}

function selectedShelf() {
  const unit = selectedUnit();
  return selected.shelfId ? findShelf(unit, selected.shelfId) : null;
}

function totalWeight(shelves) {
  return shelves.reduce((sum, s) => sum + s.weight, 0) || 1;
}

function layoutMetrics(shelves) {
  const total = totalWeight(shelves);
  let top = 0;
  return shelves.map((shelf) => {
    const height = (shelf.weight / total) * 100;
    const metric = { shelf, top, height };
    top += height;
    return metric;
  });
}

function bookCountFor(shelf) {
  const boxShare = shelf.boxes.reduce((n, b) => n + b.width, 0);
  const available = Math.max(0.35, 1 - boxShare);
  return Math.max(8, Math.round(shelf.books * available));
}

function applyZoom() {
  const z = state.zoom;
  const bleed = 1 + Math.max(0, z - 1) * 2.8 + Math.max(0, 1 - z) * 0.4;
  world.style.setProperty('--zoom', String(z));
  world.style.setProperty('--cam-bleed', String(bleed));
  zoomInput.value = String(z);
  zoomOut.textContent = z.toFixed(2);
}

function buildUnitDom(unit, unitIndex) {
  const root = document.createElement('div');
  root.className = 'px-shelf';
  root.dataset.unitId = unit.id;
  root.style.left = `${unit.x}%`;
  root.style.top = `${unit.y}%`;
  root.style.width = `${unit.w}%`;
  root.style.height = `${unit.h}%`;
  root.style.setProperty('--shelf-d', `${state.depth}px`);
  if (selected.unitId === unit.id && !selected.shelfId && !selected.boxId) {
    root.classList.add('is-unit-selected');
  }

  root.innerHTML = `
    <div class="shelf-frame">
      <div class="shelf-box">
        <div class="shelf-face shelf-back" data-cavity></div>
        <div class="shelf-face shelf-left"></div>
        <div class="shelf-face shelf-right"></div>
        <div class="shelf-face shelf-top"></div>
        <div class="shelf-face shelf-bottom"></div>
      </div>
    </div>
  `;

  const cavity = root.querySelector('[data-cavity]');
  const metrics = layoutMetrics(unit.shelves);
  metrics.forEach(({ shelf, top, height }, index) => {
    const row = document.createElement('div');
    row.className = 'shelf-row';
    row.dataset.shelfId = shelf.id;
    row.dataset.unitId = unit.id;
    row.style.top = `${top}%`;
    row.style.height = `${height}%`;
    if (selected.shelfId === shelf.id && selected.unitId === unit.id) row.classList.add('is-selected');

    const content = document.createElement('div');
    content.className = 'shelf-content';

    shelf.boxes.forEach((box) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'shelf-crate';
      el.dataset.boxId = box.id;
      el.dataset.shelfId = shelf.id;
      el.dataset.unitId = unit.id;
      el.style.flex = `0 0 ${box.width * 100}%`;
      el.style.background = box.color;
      el.setAttribute('aria-label', 'Storage box');
      if (selected.boxId === box.id) el.classList.add('is-selected');
      content.appendChild(el);
    });

    const booksWrap = document.createElement('div');
    booksWrap.className = 'shelf-books';
    const count = bookCountFor(shelf);
    for (let i = 0; i < count; i++) {
      const book = document.createElement('span');
      book.className = 'scene-book';
      book.style.background = bookColors[(i + unitIndex * 5 + index * 3) % bookColors.length];
      book.style.height = `${48 + ((i * 11 + index * 7 + unitIndex * 5) % 42)}%`;
      booksWrap.appendChild(book);
    }
    content.appendChild(booksWrap);
    row.appendChild(content);

    const plank = document.createElement('div');
    plank.className = 'shelf-plank';
    row.appendChild(plank);

    if (editing && index < unit.shelves.length - 1) {
      const handle = document.createElement('div');
      handle.className = 'shelf-handle';
      handle.dataset.shelfId = shelf.id;
      handle.dataset.unitId = unit.id;
      handle.title = 'Drag to resize shelf height';
      row.appendChild(handle);
    }

    cavity.appendChild(row);
  });

  if (editing) {
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((edge) => {
      const h = document.createElement('div');
      h.className = `unit-handle unit-handle-${edge}`;
      h.dataset.edge = edge;
      h.dataset.unitId = unit.id;
      root.appendChild(h);
    });
  }

  return root;
}

function buildScene() {
  unitLayer.innerHTML = '';
  applyZoom();
  depthInput.value = String(state.depth);
  depthOut.textContent = String(state.depth);

  state.units.forEach((unit, i) => {
    unitLayer.appendChild(buildUnitDom(unit, i));
  });

  syncInspector();
}

function syncInspector() {
  const shelf = selectedShelf();
  const unit = selectedUnit();
  const hasShelf = Boolean(shelf);
  weightInput.disabled = !hasShelf;
  booksInput.disabled = !hasShelf;

  if (!unit) {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = editing
      ? 'Select a bookshelf case or shelf. Drag case edges to resize. Use Unit arrows to add adjacent cases.'
      : '';
    return;
  }

  if (!shelf) {
    weightInput.value = '1';
    booksInput.value = '40';
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = `Case selected. Drag edges to resize. Delete removes this case (${state.units.length} total).`;
    return;
  }

  weightInput.value = String(shelf.weight);
  booksInput.value = String(shelf.books);
  weightOut.textContent = shelf.weight.toFixed(2);
  booksOut.textContent = String(shelf.books);

  if (selected.boxId) {
    editHint.textContent = 'Box selected. Delete removes the box.';
  } else {
    editHint.textContent = 'Shelf selected. Adjust height/books, or Delete to remove the shelf.';
  }
}

function setEditing(on) {
  editing = on;
  world.classList.toggle('is-editing', on);
  btnEdit.classList.toggle('is-active', on);
  btnEdit.setAttribute('aria-pressed', on ? 'true' : 'false');
  editPanel.hidden = !on;
  if (!on) {
    selected = { type: null, unitId: null, shelfId: null, boxId: null };
    drag = null;
  } else if (!selected.unitId && state.units[0]) {
    selected = { type: 'unit', unitId: state.units[0].id, shelfId: null, boxId: null };
  }
  buildScene();
  if (on) aim(0, 0);
}

function select(unitId, shelfId = null, boxId = null) {
  selected = {
    type: boxId ? 'box' : shelfId ? 'shelf' : 'unit',
    unitId,
    shelfId,
    boxId,
  };
  buildScene();
}

function clampUnit(u) {
  u.w = Math.min(90, Math.max(18, u.w));
  u.h = Math.min(85, Math.max(22, u.h));
  u.x = Math.min(100 - u.w, Math.max(0, u.x));
  u.y = Math.min(100 - u.h, Math.max(0, u.y));
}

function addAdjacent(dir) {
  const unit = selectedUnit() || state.units[0];
  if (!unit || state.units.length >= 9) return;

  const gap = 0.6;
  let next;
  if (dir === 'left') {
    next = makeUnit(unit.x - unit.w - gap, unit.y, unit.w, unit.h);
  } else if (dir === 'right') {
    next = makeUnit(unit.x + unit.w + gap, unit.y, unit.w, unit.h);
  } else if (dir === 'above') {
    next = makeUnit(unit.x, unit.y - unit.h - gap, unit.w, unit.h);
  } else {
    next = makeUnit(unit.x, unit.y + unit.h + gap, unit.w, unit.h);
  }
  clampUnit(next);
  state.units.push(next);
  selected = { type: 'unit', unitId: next.id, shelfId: null, boxId: null };
  saveState();
  buildScene();
}

function addShelf() {
  const unit = selectedUnit() || state.units[0];
  if (!unit || unit.shelves.length >= 8) return;
  const after = selected.shelfId
    ? unit.shelves.findIndex((s) => s.id === selected.shelfId)
    : unit.shelves.length - 1;
  const shelf = { id: uid('shelf'), weight: 1, books: 40, boxes: [] };
  unit.shelves.splice(Math.max(0, after) + 1, 0, shelf);
  selected = { type: 'shelf', unitId: unit.id, shelfId: shelf.id, boxId: null };
  saveState();
  buildScene();
}

function addBox() {
  const unit = selectedUnit() || state.units[0];
  const shelf = selectedShelf() || unit?.shelves[unit.shelves.length - 1];
  if (!unit || !shelf || shelf.boxes.length >= 4) return;
  const used = shelf.boxes.reduce((n, b) => n + b.width, 0);
  if (used > 0.7) return;
  const box = {
    id: uid('box'),
    width: 0.14,
    color: boxColors[shelf.boxes.length % boxColors.length],
  };
  shelf.boxes.push(box);
  selected = { type: 'box', unitId: unit.id, shelfId: shelf.id, boxId: box.id };
  saveState();
  buildScene();
}

function deleteSelected() {
  if (selected.boxId) {
    const unit = selectedUnit();
    const shelf = selectedShelf();
    if (!shelf) return;
    shelf.boxes = shelf.boxes.filter((b) => b.id !== selected.boxId);
    selected = { type: 'shelf', unitId: unit.id, shelfId: shelf.id, boxId: null };
    saveState();
    buildScene();
    return;
  }

  if (selected.shelfId) {
    const unit = selectedUnit();
    if (!unit || unit.shelves.length <= 2) {
      editHint.textContent = 'Each case needs at least two shelves.';
      return;
    }
    unit.shelves = unit.shelves.filter((s) => s.id !== selected.shelfId);
    selected = { type: 'shelf', unitId: unit.id, shelfId: unit.shelves[0].id, boxId: null };
    saveState();
    buildScene();
    return;
  }

  if (selected.unitId) {
    if (state.units.length <= 1) {
      editHint.textContent = 'Keep at least one bookshelf case.';
      return;
    }
    state.units = state.units.filter((u) => u.id !== selected.unitId);
    selected = { type: 'unit', unitId: state.units[0].id, shelfId: null, boxId: null };
    saveState();
    buildScene();
  }
}

function exportState() {
  const blob = new Blob([JSON.stringify({ ...state, savedAt: new Date().toISOString() }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'raconteur-bookshelf.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importState(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = migrate(JSON.parse(String(reader.result)));
      state = parsed;
      saveState();
      selected = { type: 'unit', unitId: state.units[0]?.id || null, shelfId: null, boxId: null };
      buildScene();
    } catch {
      editHint.textContent = 'Could not read that settings file.';
    }
  };
  reader.readAsText(file);
}

/* ── Parallax ── */
const target = { x: 0, y: 0 };
const current = { x: 0, y: 0 };
let frame = null;
let touchStart = { x: 0, y: 0 };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function aim(x, y) {
  if (editing || drag) {
    target.x = 0;
    target.y = 0;
  } else {
    target.x = Math.max(-1, Math.min(1, x));
    target.y = Math.max(-1, Math.min(1, y));
  }
  if (frame || reduceMotion) {
    if (reduceMotion) apply();
    return;
  }
  const tick = () => {
    current.x += (target.x - current.x) * 0.1;
    current.y += (target.y - current.y) * 0.1;
    apply();
    if (Math.abs(current.x - target.x) > 0.008 || Math.abs(current.y - target.y) > 0.008) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = null;
    }
  };
  frame = requestAnimationFrame(tick);
}

function apply() {
  world.style.setProperty('--ry', `${current.x * 4}deg`);
  world.style.setProperty('--rx', `${current.y * -2.5}deg`);
  world.style.setProperty('--shift-x', `${current.x * 8}px`);
  world.style.setProperty('--shift-y', `${current.y * 4}px`);
}

stage.addEventListener('pointermove', (e) => {
  if (drag || e.pointerType === 'touch') return;
  if (editing) return;
  const rect = stage.getBoundingClientRect();
  aim((e.clientX - rect.left) / rect.width * 2 - 1, (e.clientY - rect.top) / rect.height * 2 - 1);
});

stage.addEventListener('pointerleave', () => {
  if (!drag) aim(0, 0);
});

stage.addEventListener(
  'touchstart',
  (e) => {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },
  { passive: true },
);

stage.addEventListener(
  'touchmove',
  (e) => {
    if (editing || drag) return;
    const t = e.touches[0];
    aim(
      Math.max(-1, Math.min(1, (t.clientX - touchStart.x) / 140)),
      Math.max(-1, Math.min(1, (t.clientY - touchStart.y) / 140)),
    );
  },
  { passive: true },
);

/* ── Edit interactions ── */
unitLayer.addEventListener('pointerdown', (e) => {
  if (!editing) return;

  const unitHandle = e.target.closest('.unit-handle');
  if (unitHandle) {
    const unit = findUnit(unitHandle.dataset.unitId);
    if (!unit) return;
    e.preventDefault();
    e.stopPropagation();
    const wall = unitLayer.getBoundingClientRect();
    drag = {
      type: 'resize',
      edge: unitHandle.dataset.edge,
      unitId: unit.id,
      startX: e.clientX,
      startY: e.clientY,
      wallW: wall.width || 1,
      wallH: wall.height || 1,
      orig: { x: unit.x, y: unit.y, w: unit.w, h: unit.h },
    };
    select(unit.id);
    unitHandle.setPointerCapture?.(e.pointerId);
    return;
  }

  const handle = e.target.closest('.shelf-handle');
  if (handle) {
    const unit = findUnit(handle.dataset.unitId);
    if (!unit) return;
    const index = unit.shelves.findIndex((s) => s.id === handle.dataset.shelfId);
    if (index < 0 || index >= unit.shelves.length - 1) return;
    e.preventDefault();
    e.stopPropagation();
    drag = {
      type: 'divider',
      unitId: unit.id,
      index,
      startY: e.clientY,
      startA: unit.shelves[index].weight,
      startB: unit.shelves[index + 1].weight,
    };
    select(unit.id, handle.dataset.shelfId);
    handle.setPointerCapture?.(e.pointerId);
    return;
  }

  const box = e.target.closest('.shelf-crate');
  if (box) {
    e.preventDefault();
    select(box.dataset.unitId, box.dataset.shelfId, box.dataset.boxId);
    return;
  }

  const row = e.target.closest('.shelf-row');
  if (row) {
    e.preventDefault();
    select(row.dataset.unitId, row.dataset.shelfId);
    return;
  }

  const caseEl = e.target.closest('.px-shelf');
  if (caseEl) {
    e.preventDefault();
    select(caseEl.dataset.unitId);
  }
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;

  if (drag.type === 'divider') {
    const unit = findUnit(drag.unitId);
    if (!unit) return;
    const cavity = unitLayer.querySelector(`.px-shelf[data-unit-id="${unit.id}"] [data-cavity]`);
    const cavityH = cavity?.getBoundingClientRect().height || 1;
    const dy = e.clientY - drag.startY;
    const delta = (dy / cavityH) * totalWeight(unit.shelves) * 1.4;
    unit.shelves[drag.index].weight = Math.max(0.4, drag.startA + delta);
    unit.shelves[drag.index + 1].weight = Math.max(0.4, drag.startB - delta);
    buildScene();
    return;
  }

  if (drag.type === 'resize') {
    const unit = findUnit(drag.unitId);
    if (!unit) return;
    const dx = ((e.clientX - drag.startX) / drag.wallW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.wallH) * 100;
    const o = drag.orig;
    let { x, y, w, h } = o;
    const edge = drag.edge;

    if (edge.includes('e')) w = o.w + dx;
    if (edge.includes('w')) {
      w = o.w - dx;
      x = o.x + dx;
    }
    if (edge.includes('s')) h = o.h + dy;
    if (edge.includes('n')) {
      h = o.h - dy;
      y = o.y + dy;
    }

    unit.x = x;
    unit.y = y;
    unit.w = w;
    unit.h = h;
    clampUnit(unit);
    buildScene();
  }
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  saveState();
});

btnEdit.addEventListener('click', () => setEditing(!editing));
document.getElementById('btn-edit-done')?.addEventListener('click', () => setEditing(false));

editPanel.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'add-shelf') addShelf();
  if (act === 'add-box') addBox();
  if (act === 'delete') deleteSelected();
  if (act === 'add-left') addAdjacent('left');
  if (act === 'add-right') addAdjacent('right');
  if (act === 'add-above') addAdjacent('above');
  if (act === 'add-below') addAdjacent('below');
  if (act === 'export') exportState();
  if (act === 'import') fileIn.click();
  if (act === 'reset') {
    state = defaultState();
    selected = { type: 'unit', unitId: state.units[0].id, shelfId: null, boxId: null };
    saveState();
    buildScene();
  }
});

fileIn.addEventListener('change', () => {
  const file = fileIn.files?.[0];
  if (file) importState(file);
  fileIn.value = '';
});

weightInput.addEventListener('input', () => {
  const shelf = selectedShelf();
  if (!shelf) return;
  shelf.weight = Number(weightInput.value);
  weightOut.textContent = shelf.weight.toFixed(2);
  buildScene();
});
weightInput.addEventListener('change', saveState);

booksInput.addEventListener('input', () => {
  const shelf = selectedShelf();
  if (!shelf) return;
  shelf.books = Number(booksInput.value);
  booksOut.textContent = String(shelf.books);
  buildScene();
});
booksInput.addEventListener('change', saveState);

depthInput.addEventListener('input', () => {
  state.depth = Number(depthInput.value);
  depthOut.textContent = String(state.depth);
  unitLayer.querySelectorAll('.px-shelf').forEach((el) => {
    el.style.setProperty('--shelf-d', `${state.depth}px`);
  });
});
depthInput.addEventListener('change', saveState);

zoomInput.addEventListener('input', () => {
  state.zoom = Number(zoomInput.value);
  applyZoom();
});
zoomInput.addEventListener('change', saveState);

buildScene();
if (reduceMotion) apply();
