/**
 * Full Experience — 3D library with multi-unit editable bookshelves
 */

const STORAGE_KEY = 'trc-full-library-v2';
const LEGACY_KEY = 'trc-mockup6-library-v1';
const bookColors = ['#bd6256', '#597e9d', '#ce9551', '#67886d', '#a3647a', '#a68a62', '#4c7779'];
const boxColors = ['#8a5339', '#6b4030', '#a26443', '#5a3429'];

const MIN_W = 16;
const MIN_H = 20;
const MAX_W = 88;
const MAX_H = 82;
const SNAP = 1.35;
const GAP = 0.35;
const MAX_UNITS = 9;
const MAX_SHELVES = 8;
const MIN_SHELVES = 1;

const world = document.getElementById('world');
const stage = document.getElementById('stage');
const unitLayer = document.getElementById('unit-layer');
const editOverlay = document.getElementById('edit-overlay');
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
    { id: uid('shelf'), weight: 1, books: 46, boxes: [] },
    { id: uid('shelf'), weight: 1, books: 48, boxes: [] },
    { id: uid('shelf'), weight: 1, books: 46, boxes: [] },
    { id: uid('shelf'), weight: 1, books: 44, boxes: [] },
  ];
}

function makeUnit(x, y, w, h, shelves = null) {
  return {
    id: uid('unit'),
    x,
    y,
    w,
    h,
    shelves: shelves
      ? shelves.map(normalizeShelf)
      : defaultShelves(),
  };
}

function defaultState() {
  const w = 34;
  const h = 52;
  return {
    version: 2,
    zoom: 1,
    depth: 80,
    units: [makeUnit((100 - w) / 2, 20, w, h, [
      { id: 'shelf-1', weight: 1, books: 46, boxes: [] },
      { id: 'shelf-2', weight: 1, books: 48, boxes: [] },
      { id: 'shelf-3', weight: 1, books: 46, boxes: [] },
      { id: 'shelf-4', weight: 1, books: 44, boxes: [] },
    ])],
  };
}

function normalizeShelf(s, i = 0) {
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
  const unit = {
    id: u.id || `unit-${i + 1}`,
    x: Number(u.x) ?? 26,
    y: Number(u.y) ?? 16,
    w: Number(u.w) ?? 42,
    h: Number(u.h) ?? 56,
    shelves: (u.shelves?.length ? u.shelves : defaultShelves()).map(normalizeShelf),
  };
  clampUnitBounds(unit);
  return unit;
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
      units: [normalizeUnit({ id: 'unit-1', x: 29, y: 18, w: 42, h: 56, shelves: parsed.shelves }, 0)],
    };
  }
  return defaultState();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaultState();
    const state = migrate(JSON.parse(raw));
    resolveAllOverlaps(state.units);
    return state;
  } catch {
    return defaultState();
  }
}

let state = loadState();
let editing = false;
let selected = { type: null, unitId: null, shelfId: null, boxId: null };
let drag = null;
let overlayRaf = 0;

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

/* ── Geometry / snap / collision ── */

function clampUnitBounds(u) {
  u.w = Math.min(MAX_W, Math.max(MIN_W, u.w));
  u.h = Math.min(MAX_H, Math.max(MIN_H, u.h));
  u.x = Math.min(100 - u.w, Math.max(0, u.x));
  u.y = Math.min(100 - u.h, Math.max(0, u.y));
}

function rectsOverlap(a, b, pad = 0) {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

function overlapAmount(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return { ox: 0, oy: 0 };
  return { ox, oy };
}

function otherUnits(id) {
  return state.units.filter((u) => u.id !== id);
}

function snapValue(value, targets, threshold = SNAP) {
  let best = value;
  let bestDist = threshold;
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function snapTargetsForAxis(unit, axis) {
  const targets = [0];
  if (axis === 'x') {
    targets.push(50 - unit.w / 2); // room center
    targets.push(100 - unit.w);
    for (const o of otherUnits(unit.id)) {
      targets.push(o.x, o.x + o.w + GAP, o.x - unit.w - GAP);
      targets.push(o.x + o.w / 2 - unit.w / 2); // center align
    }
  } else {
    targets.push(50 - unit.h / 2);
    targets.push(100 - unit.h);
    for (const o of otherUnits(unit.id)) {
      targets.push(o.y, o.y + o.h + GAP, o.y - unit.h - GAP);
      targets.push(o.y + o.h / 2 - unit.h / 2);
    }
  }
  return targets;
}

function snapUnitPosition(unit) {
  unit.x = snapValue(unit.x, snapTargetsForAxis(unit, 'x'));
  unit.y = snapValue(unit.y, snapTargetsForAxis(unit, 'y'));
  // Also snap right/bottom edges via position
  const rightTargets = otherUnits(unit.id).flatMap((o) => [o.x - GAP, o.x + o.w, 100]);
  const bottomTargets = otherUnits(unit.id).flatMap((o) => [o.y - GAP, o.y + o.h, 100]);
  const snappedRight = snapValue(unit.x + unit.w, rightTargets);
  const snappedBottom = snapValue(unit.y + unit.h, bottomTargets);
  if (Math.abs(snappedRight - (unit.x + unit.w)) < SNAP) unit.x = snappedRight - unit.w;
  if (Math.abs(snappedBottom - (unit.y + unit.h)) < SNAP) unit.y = snappedBottom - unit.h;
  clampUnitBounds(unit);
}

function snapUnitResize(unit, edge) {
  const others = otherUnits(unit.id);
  if (edge.includes('e')) {
    const targets = [100, ...others.flatMap((o) => [o.x - GAP, o.x + o.w])];
    const right = snapValue(unit.x + unit.w, targets);
    unit.w = Math.max(MIN_W, right - unit.x);
  }
  if (edge.includes('w')) {
    const targets = [0, ...others.flatMap((o) => [o.x, o.x + o.w + GAP])];
    const left = snapValue(unit.x, targets);
    const right = unit.x + unit.w;
    unit.x = left;
    unit.w = Math.max(MIN_W, right - left);
  }
  if (edge.includes('s')) {
    const targets = [100, ...others.flatMap((o) => [o.y - GAP, o.y + o.h])];
    const bottom = snapValue(unit.y + unit.h, targets);
    unit.h = Math.max(MIN_H, bottom - unit.y);
  }
  if (edge.includes('n')) {
    const targets = [0, ...others.flatMap((o) => [o.y, o.y + o.h + GAP])];
    const top = snapValue(unit.y, targets);
    const bottom = unit.y + unit.h;
    unit.y = top;
    unit.h = Math.max(MIN_H, bottom - top);
  }
  clampUnitBounds(unit);
}

function separateFromOthers(unit) {
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const other of otherUnits(unit.id)) {
      if (!rectsOverlap(unit, other, GAP * 0.5)) continue;
      const { ox, oy } = overlapAmount(
        { x: unit.x - GAP / 2, y: unit.y - GAP / 2, w: unit.w + GAP, h: unit.h + GAP },
        { x: other.x - GAP / 2, y: other.y - GAP / 2, w: other.w + GAP, h: other.h + GAP },
      );
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) {
        const unitCx = unit.x + unit.w / 2;
        const otherCx = other.x + other.w / 2;
        if (unitCx >= otherCx) unit.x += ox + 0.01;
        else unit.x -= ox + 0.01;
      } else {
        const unitCy = unit.y + unit.h / 2;
        const otherCy = other.y + other.h / 2;
        if (unitCy >= otherCy) unit.y += oy + 0.01;
        else unit.y -= oy + 0.01;
      }
      clampUnitBounds(unit);
      moved = true;
    }
    if (!moved) break;
  }
}

function resolveAllOverlaps(units) {
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];
        if (!rectsOverlap(a, b, GAP * 0.5)) continue;
        any = true;
        const { ox, oy } = overlapAmount(a, b);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            a.x -= ox / 2 + GAP / 2;
            b.x += ox / 2 + GAP / 2;
          } else {
            a.y -= oy / 2 + GAP / 2;
            b.y += oy / 2 + GAP / 2;
          }
          clampUnitBounds(a);
          clampUnitBounds(b);
        }
      }
    }
    if (!any) break;
  }
}

function overlapsAny(slot, pad = GAP * 0.25, ignoreId = null) {
  return state.units.some((u) => u.id !== ignoreId && rectsOverlap(slot, u, pad));
}

function findFreeSlot(anchor, dir) {
  const maxW = Math.min(anchor.w, MAX_W);
  const maxH = Math.min(anchor.h, MAX_H);
  const sizes = [
    { w: maxW, h: maxH },
    { w: Math.max(MIN_W, maxW * 0.75), h: maxH },
    { w: Math.max(MIN_W, maxW * 0.55), h: maxH },
    { w: maxW, h: Math.max(MIN_H, maxH * 0.75) },
    { w: Math.max(MIN_W, maxW * 0.55), h: Math.max(MIN_H, maxH * 0.65) },
  ];

  const build = (w, h, off = 0) => {
    if (dir === 'left') return { x: anchor.x - w - GAP, y: anchor.y + off, w, h };
    if (dir === 'right') return { x: anchor.x + anchor.w + GAP, y: anchor.y + off, w, h };
    if (dir === 'above') return { x: anchor.x + off, y: anchor.y - h - GAP, w, h };
    return { x: anchor.x + off, y: anchor.y + anchor.h + GAP, w, h };
  };

  const fitToBand = (slot) => {
    if (dir === 'right') {
      const left = anchor.x + anchor.w + GAP;
      if (slot.x < left) {
        slot.x = left;
        slot.w = Math.min(slot.w, 100 - slot.x);
      }
    } else if (dir === 'left') {
      const rightEdge = anchor.x - GAP;
      if (slot.x + slot.w > rightEdge) {
        slot.w = Math.min(slot.w, rightEdge);
        slot.x = Math.max(0, rightEdge - slot.w);
      }
    } else if (dir === 'below') {
      const top = anchor.y + anchor.h + GAP;
      if (slot.y < top) {
        slot.y = top;
        slot.h = Math.min(slot.h, 100 - slot.y);
      }
    } else if (dir === 'above') {
      const bottomEdge = anchor.y - GAP;
      if (slot.y + slot.h > bottomEdge) {
        slot.h = Math.min(slot.h, bottomEdge);
        slot.y = Math.max(0, bottomEdge - slot.h);
      }
    }
    clampUnitBounds(slot);
  };

  const offsets = [0, 6, -6, 12, -12, 18, -18, 28, -28];
  const trySlot = (slot) => {
    fitToBand(slot);
    if (slot.w < MIN_W - 0.01 || slot.h < MIN_H - 0.01) return null;
    if (!overlapsAny(slot)) return slot;
    return null;
  };

  for (const size of sizes) {
    for (const off of offsets) {
      const found = trySlot(build(size.w, size.h, off));
      if (found) return found;
    }
  }

  // Fallback: hug the room edge in that direction (useful when the near side is blocked).
  for (const size of sizes) {
    for (const off of offsets) {
      let slot;
      if (dir === 'left') slot = { x: 0, y: anchor.y + off, w: size.w, h: size.h };
      else if (dir === 'right') slot = { x: 100 - size.w, y: anchor.y + off, w: size.w, h: size.h };
      else if (dir === 'above') slot = { x: anchor.x + off, y: 0, w: size.w, h: size.h };
      else slot = { x: anchor.x + off, y: 100 - size.h, w: size.w, h: size.h };
      clampUnitBounds(slot);
      if (!overlapsAny(slot)) return slot;
    }
  }
  return null;
}

function finalizeUnitLayout(unit, { snap = true, edge = null } = {}) {
  clampUnitBounds(unit);
  if (snap) {
    if (edge) snapUnitResize(unit, edge);
    else snapUnitPosition(unit);
  }
  separateFromOthers(unit);
  clampUnitBounds(unit);
}

/* ── Render ── */

function applyZoom() {
  const z = state.zoom;
  const bleed = 1 + Math.max(0, z - 1) * 2.8 + Math.max(0, 1 - z) * 0.4;
  world.style.setProperty('--zoom', String(z));
  world.style.setProperty('--cam-bleed', String(bleed));
  zoomInput.value = String(z);
  zoomOut.textContent = z.toFixed(2);
  scheduleOverlaySync();
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
  if (selected.unitId === unit.id) root.classList.add('is-active-unit');
  if (selected.unitId === unit.id && selected.type === 'unit') root.classList.add('is-unit-selected');

  root.innerHTML = `
    <div class="shelf-frame" data-select-unit="${unit.id}">
      <div class="shelf-box">
        <div class="shelf-face shelf-back" data-cavity></div>
        <div class="shelf-face shelf-left" aria-hidden="true"></div>
        <div class="shelf-face shelf-right" aria-hidden="true"></div>
        <div class="shelf-face shelf-top" aria-hidden="true"></div>
        <div class="shelf-face shelf-bottom" aria-hidden="true"></div>
      </div>
    </div>
  `;

  const cavity = root.querySelector('[data-cavity]');
  layoutMetrics(unit.shelves).forEach(({ shelf, top, height }, index) => {
    const row = document.createElement('div');
    row.className = 'shelf-row';
    row.dataset.shelfId = shelf.id;
    row.dataset.unitId = unit.id;
    row.style.top = `${top}%`;
    row.style.height = `${height}%`;
    if (selected.type === 'shelf' && selected.shelfId === shelf.id) row.classList.add('is-selected');

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
      if (selected.type === 'box' && selected.boxId === box.id) el.classList.add('is-selected');
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

  return root;
}

function unitEl(id) {
  return unitLayer.querySelector(`.px-shelf[data-unit-id="${CSS.escape(id)}"]`);
}

function applyUnitGeometry(unit) {
  const el = unitEl(unit.id);
  if (!el) return;
  el.style.left = `${unit.x}%`;
  el.style.top = `${unit.y}%`;
  el.style.width = `${unit.w}%`;
  el.style.height = `${unit.h}%`;
  scheduleOverlaySync();
}

function applyShelfHeights(unit) {
  const el = unitEl(unit.id);
  if (!el) return;
  layoutMetrics(unit.shelves).forEach(({ shelf, top, height }) => {
    const row = el.querySelector(`.shelf-row[data-shelf-id="${CSS.escape(shelf.id)}"]`);
    if (!row) return;
    row.style.top = `${top}%`;
    row.style.height = `${height}%`;
  });
  scheduleOverlaySync();
}

function buildOverlayChrome() {
  editOverlay.innerHTML = '';
  if (!editing || !selected.unitId || !findUnit(selected.unitId)) {
    editOverlay.hidden = true;
    return;
  }
  editOverlay.hidden = false;

  const chrome = document.createElement('div');
  chrome.className = 'unit-chrome';
  chrome.dataset.unitId = selected.unitId;
  chrome.dataset.mode = selected.type || 'unit';

  const box = document.createElement('div');
  box.className = 'unit-select-box';
  chrome.appendChild(box);

  const move = document.createElement('div');
  move.className = 'unit-move-bar';
  move.dataset.unitId = selected.unitId;
  move.title = 'Drag to move case';
  chrome.appendChild(move);

  ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach((edge) => {
    const h = document.createElement('div');
    h.className = `unit-handle unit-handle-${edge}`;
    h.dataset.edge = edge;
    h.dataset.unitId = selected.unitId;
    h.title = 'Drag to resize';
    chrome.appendChild(h);
  });

  const label = document.createElement('div');
  label.className = 'unit-chrome-label';
  label.textContent =
    selected.type === 'box' ? 'Box' : selected.type === 'shelf' ? 'Shelf' : 'Case';
  chrome.appendChild(label);

  editOverlay.appendChild(chrome);
  syncOverlayToSelection();
}

function syncOverlayToSelection() {
  const chrome = editOverlay.querySelector('.unit-chrome');
  if (!chrome || !selected.unitId) return;
  const el = unitEl(selected.unitId);
  if (!el) {
    editOverlay.hidden = true;
    return;
  }
  // Prefer the front frame face so 3D side walls don't inflate the AABB.
  const target = el.querySelector('.shelf-frame') || el;
  const stageRect = stage.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  chrome.style.left = `${rect.left - stageRect.left}px`;
  chrome.style.top = `${rect.top - stageRect.top}px`;
  chrome.style.width = `${rect.width}px`;
  chrome.style.height = `${rect.height}px`;
  editOverlay.hidden = false;
}

function scheduleOverlaySync() {
  if (!editing) return;
  if (overlayRaf) return;
  overlayRaf = requestAnimationFrame(() => {
    overlayRaf = 0;
    syncOverlayToSelection();
  });
}

function buildScene() {
  unitLayer.innerHTML = '';
  applyZoom();
  depthInput.value = String(state.depth);
  depthOut.textContent = String(state.depth);

  state.units.forEach((unit, i) => {
    unitLayer.appendChild(buildUnitDom(unit, i));
  });

  buildOverlayChrome();
  syncInspector();
}

function syncInspector() {
  const shelf = selectedShelf();
  const unit = selectedUnit();
  const shelfControls = selected.type === 'shelf' || selected.type === 'box';
  weightInput.disabled = !shelfControls || !shelf;
  booksInput.disabled = !shelfControls || !shelf;

  if (!editing) return;

  if (!unit) {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = 'Click a case, shelf, or box. Drag the gold box to move; corners resize. Cases snap and cannot overlap.';
    return;
  }

  if (selected.type === 'unit') {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = `Case selected (${state.units.length} total). Drag the top bar to move, corners to resize. Delete removes this case.`;
    return;
  }

  if (!shelf) {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = 'Selection lost — click an object again.';
    return;
  }

  weightInput.value = String(shelf.weight);
  booksInput.value = String(shelf.books);
  weightOut.textContent = shelf.weight.toFixed(2);
  booksOut.textContent = String(shelf.books);

  if (selected.type === 'box') {
    editHint.textContent = 'Box selected. Press Delete to remove it.';
  } else {
    editHint.textContent = `Shelf selected (${unit.shelves.length} in case). Adjust sliders or Delete to remove.`;
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
    editOverlay.hidden = true;
    editOverlay.innerHTML = '';
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
  if (drag) {
    syncInspector();
    return;
  }
  buildScene();
}

/* ── Mutations ── */

function addAdjacent(dir) {
  const unit = selectedUnit() || state.units[0];
  if (!unit) return;
  if (state.units.length >= MAX_UNITS) {
    editHint.textContent = `Maximum of ${MAX_UNITS} cases.`;
    return;
  }
  const slot = findFreeSlot(unit, dir);
  if (!slot) {
    editHint.textContent = 'No free space in that direction — resize or move cases first.';
    return;
  }
  const next = makeUnit(slot.x, slot.y, slot.w, slot.h);
  // Keep the free-slot placement; light edge snap only if it stays clear.
  const before = { x: next.x, y: next.y, w: next.w, h: next.h };
  snapUnitPosition(next);
  if (overlapsAny(next)) {
    next.x = before.x;
    next.y = before.y;
    next.w = before.w;
    next.h = before.h;
  }
  if (overlapsAny(next)) {
    editHint.textContent = 'Could not place a non-overlapping case there.';
    return;
  }
  state.units.push(next);
  selected = { type: 'unit', unitId: next.id, shelfId: null, boxId: null };
  saveState();
  buildScene();
}

function addShelf() {
  const unit = selectedUnit() || state.units[0];
  if (!unit) return;
  if (unit.shelves.length >= MAX_SHELVES) {
    editHint.textContent = `Maximum of ${MAX_SHELVES} shelves per case.`;
    return;
  }
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
  let shelf = selectedShelf();
  if (!shelf && unit) shelf = unit.shelves[unit.shelves.length - 1];
  if (!unit || !shelf) return;
  if (shelf.boxes.length >= 4) {
    editHint.textContent = 'Maximum of 4 boxes on a shelf.';
    return;
  }
  const used = shelf.boxes.reduce((n, b) => n + b.width, 0);
  if (used > 0.7) {
    editHint.textContent = 'Not enough free width on this shelf for another box.';
    return;
  }
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
  if (!selected.type || !selected.unitId) {
    editHint.textContent = 'Nothing selected to delete.';
    return;
  }

  if (selected.type === 'box') {
    const unit = selectedUnit();
    const shelf = selectedShelf();
    if (!unit || !shelf || !selected.boxId) {
      editHint.textContent = 'Could not find that box.';
      return;
    }
    const before = shelf.boxes.length;
    shelf.boxes = shelf.boxes.filter((b) => b.id !== selected.boxId);
    if (shelf.boxes.length === before) {
      editHint.textContent = 'Box was already removed.';
      return;
    }
    selected = { type: 'shelf', unitId: unit.id, shelfId: shelf.id, boxId: null };
    saveState();
    buildScene();
    return;
  }

  if (selected.type === 'shelf') {
    const unit = selectedUnit();
    if (!unit || !selected.shelfId) {
      editHint.textContent = 'Could not find that shelf.';
      return;
    }
    if (unit.shelves.length <= MIN_SHELVES) {
      editHint.textContent = 'Each case needs at least one shelf.';
      return;
    }
    const idx = unit.shelves.findIndex((s) => s.id === selected.shelfId);
    if (idx < 0) {
      editHint.textContent = 'Shelf was already removed.';
      return;
    }
    unit.shelves.splice(idx, 1);
    const next = unit.shelves[Math.min(idx, unit.shelves.length - 1)];
    selected = { type: 'shelf', unitId: unit.id, shelfId: next.id, boxId: null };
    saveState();
    buildScene();
    return;
  }

  if (selected.type === 'unit') {
    if (state.units.length <= 1) {
      editHint.textContent = 'Keep at least one bookshelf case.';
      return;
    }
    const id = selected.unitId;
    state.units = state.units.filter((u) => u.id !== id);
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
      resolveAllOverlaps(parsed.units);
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
  scheduleOverlaySync();
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

window.addEventListener('resize', scheduleOverlaySync);

/* ── Edit interactions ── */

function layerPctFromEvent(e) {
  const wall = unitLayer.getBoundingClientRect();
  return {
    wallW: wall.width || 1,
    wallH: wall.height || 1,
    xPct: ((e.clientX - wall.left) / (wall.width || 1)) * 100,
    yPct: ((e.clientY - wall.top) / (wall.height || 1)) * 100,
  };
}

function startResizeDrag(unit, edge, e) {
  const metrics = layerPctFromEvent(e);
  drag = {
    type: 'resize',
    edge,
    unitId: unit.id,
    startX: e.clientX,
    startY: e.clientY,
    wallW: metrics.wallW,
    wallH: metrics.wallH,
    orig: { x: unit.x, y: unit.y, w: unit.w, h: unit.h },
  };
  selected = { type: 'unit', unitId: unit.id, shelfId: null, boxId: null };
  syncInspector();
  const label = editOverlay.querySelector('.unit-chrome-label');
  if (label) label.textContent = 'Case';
}

function startMoveDrag(unit, e) {
  const metrics = layerPctFromEvent(e);
  drag = {
    type: 'move',
    unitId: unit.id,
    startX: e.clientX,
    startY: e.clientY,
    wallW: metrics.wallW,
    wallH: metrics.wallH,
    orig: { x: unit.x, y: unit.y, w: unit.w, h: unit.h },
  };
  selected = { type: 'unit', unitId: unit.id, shelfId: null, boxId: null };
  syncInspector();
}

editOverlay.addEventListener('pointerdown', (e) => {
  if (!editing) return;
  const handle = e.target.closest('.unit-handle');
  const move = e.target.closest('.unit-move-bar');
  const unit = findUnit((handle || move)?.dataset.unitId || selected.unitId);
  if (!unit) return;
  e.preventDefault();
  e.stopPropagation();
  if (handle) startResizeDrag(unit, handle.dataset.edge, e);
  else if (move) startMoveDrag(unit, e);
  else return;
  e.currentTarget.setPointerCapture?.(e.pointerId);
});

unitLayer.addEventListener('pointerdown', (e) => {
  if (!editing) return;
  if (e.target.closest('.unit-handle')) return;

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
    selected = {
      type: 'shelf',
      unitId: unit.id,
      shelfId: handle.dataset.shelfId,
      boxId: null,
    };
    buildOverlayChrome();
    syncInspector();
    handle.setPointerCapture?.(e.pointerId);
    return;
  }

  const box = e.target.closest('.shelf-crate');
  if (box) {
    e.preventDefault();
    e.stopPropagation();
    select(box.dataset.unitId, box.dataset.shelfId, box.dataset.boxId);
    return;
  }

  const row = e.target.closest('.shelf-row');
  if (row) {
    e.preventDefault();
    e.stopPropagation();
    select(row.dataset.unitId, row.dataset.shelfId);
    return;
  }

  const frame = e.target.closest('[data-select-unit]');
  if (frame) {
    e.preventDefault();
    select(frame.dataset.selectUnit);
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
    const cavity = unitEl(unit.id)?.querySelector('[data-cavity]');
    const cavityH = cavity?.getBoundingClientRect().height || 1;
    const dy = e.clientY - drag.startY;
    const delta = (dy / cavityH) * totalWeight(unit.shelves) * 1.4;
    unit.shelves[drag.index].weight = Math.max(0.4, drag.startA + delta);
    unit.shelves[drag.index + 1].weight = Math.max(0.4, drag.startB - delta);
    applyShelfHeights(unit);
    return;
  }

  if (drag.type === 'move') {
    const unit = findUnit(drag.unitId);
    if (!unit) return;
    const dx = ((e.clientX - drag.startX) / drag.wallW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.wallH) * 100;
    unit.x = drag.orig.x + dx;
    unit.y = drag.orig.y + dy;
    unit.w = drag.orig.w;
    unit.h = drag.orig.h;
    clampUnitBounds(unit);
    applyUnitGeometry(unit);
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
    clampUnitBounds(unit);
    applyUnitGeometry(unit);
  }
});

window.addEventListener('pointerup', () => {
  if (!drag) return;
  const ended = drag;
  drag = null;
  const unit = findUnit(ended.unitId);
  if (unit && (ended.type === 'move' || ended.type === 'resize')) {
    finalizeUnitLayout(unit, {
      snap: true,
      edge: ended.type === 'resize' ? ended.edge : null,
    });
    // If still overlapping after separation, revert to drag start.
    if (overlapsAny(unit, GAP * 0.25, unit.id)) {
      unit.x = ended.orig.x;
      unit.y = ended.orig.y;
      unit.w = ended.orig.w;
      unit.h = ended.orig.h;
      clampUnitBounds(unit);
    }
    applyUnitGeometry(unit);
  }
  saveState();
  buildScene();
});

window.addEventListener('keydown', (e) => {
  if (!editing) return;
  if (e.target.matches('input, textarea')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  }
  if (e.key === 'Escape') {
    if (selected.type !== 'unit' && selected.unitId) {
      select(selected.unitId);
    }
  }
});

btnEdit.addEventListener('click', () => setEditing(!editing));
document.getElementById('btn-edit-done')?.addEventListener('click', () => setEditing(false));

editPanel.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const act = btn.dataset.act;
  if (act === 'add-shelf') addShelf();
  else if (act === 'add-box') addBox();
  else if (act === 'delete') deleteSelected();
  else if (act === 'add-left') addAdjacent('left');
  else if (act === 'add-right') addAdjacent('right');
  else if (act === 'add-above') addAdjacent('above');
  else if (act === 'add-below') addAdjacent('below');
  else if (act === 'export') exportState();
  else if (act === 'import') fileIn.click();
  else if (act === 'reset') {
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
  if (!shelf || (selected.type !== 'shelf' && selected.type !== 'box')) return;
  shelf.weight = Number(weightInput.value);
  weightOut.textContent = shelf.weight.toFixed(2);
  const unit = selectedUnit();
  if (unit) applyShelfHeights(unit);
});
weightInput.addEventListener('change', () => {
  saveState();
  buildScene();
});

booksInput.addEventListener('input', () => {
  const shelf = selectedShelf();
  if (!shelf || (selected.type !== 'shelf' && selected.type !== 'box')) return;
  shelf.books = Number(booksInput.value);
  booksOut.textContent = String(shelf.books);
});
booksInput.addEventListener('change', () => {
  saveState();
  buildScene();
});

depthInput.addEventListener('input', () => {
  state.depth = Number(depthInput.value);
  depthOut.textContent = String(state.depth);
  unitLayer.querySelectorAll('.px-shelf').forEach((el) => {
    el.style.setProperty('--shelf-d', `${state.depth}px`);
  });
  scheduleOverlaySync();
});
depthInput.addEventListener('change', saveState);

zoomInput.addEventListener('input', () => {
  state.zoom = Number(zoomInput.value);
  applyZoom();
});
zoomInput.addEventListener('change', saveState);

buildScene();
if (reduceMotion) apply();
