/**
 * Full Experience — 3D library with multi-unit editable bookshelves
 */

const STORAGE_KEY = 'trc-full-library-v2';
const LEGACY_KEY = 'trc-mockup6-library-v1';
const bookColors = ['#bd6256', '#597e9d', '#ce9551', '#67886d', '#a3647a', '#a68a62', '#4c7779'];
const boxColors = ['#8a5339', '#6b4030', '#a26443', '#5a3429'];

const MIN_W = 7;
const MIN_H = 18;
const MAX_W = 96;
const MAX_H = 92;
const SNAP = 1.35;
const GAP = 0.35;
const MAX_UNITS = 9;
const MIN_SHELVES = 1;
const MAX_SHELVES = 8;
/** Fixed minimum bay height in CSS pixels (not a % of the case). */
const MIN_SHELF_PX = 65;
const MIN_BOOKS = 8;
const MAX_BOOKS = 56;
const DEFAULT_BOOKS = 40;
const MIN_BOX_W = 0.08;
const MAX_BOX_W = 0.35;
const DEFAULT_BOX_W = 0.14;
const MAX_BOXES_PER_SHELF = 4;
const MAX_BOX_WIDTH_SHARE = 0.7;
const MIN_DEPTH = 48;
const MAX_DEPTH = 120;
const DEFAULT_DEPTH = 80;
const MIN_EDGES = 4;
const MAX_EDGES = 24;
const DEFAULT_EDGES = 16;
const DEFAULT_SHELF_COUNT = 4;
const NEW_CASE_W = 34;
const NEW_CASE_H = 52;
const MIN_BOOK_ROW_SHARE = 0.35;
/** Fallback sizes when placing a case beside another. */
const ADJACENT_CASE_SIZES = [
  { w: NEW_CASE_W, h: NEW_CASE_H },
  { w: 28, h: NEW_CASE_H },
  { w: MIN_W + 17, h: NEW_CASE_H },
  { w: NEW_CASE_W, h: 40 },
  { w: MIN_W + 17, h: 40 },
];
/**
 * Placement plane aspect (width / height). Cases are % of this plane, so their
 * proportions stay stable when the browser window is resized.
 */
const PLANE_ASPECT = 16 / 9;
/** Shrink the plane slightly so 3D-extruded cases at the edges stay on-screen. */
const PLANE_FIT = 0.88;
/** Desktop reference size — small viewports keep this scale and pan instead. */
const SCENE_MIN_W = 1280;
const SCENE_MIN_H = 720;
/** Extra bleed so the room still fills the frame on large screens (old ~inset). */
const CAMERA_BLEED_X = 1.2;
const CAMERA_BLEED_Y = 1.12;
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.45;

const world = document.getElementById('world');
const stage = document.getElementById('stage');
const sceneCamera = document.getElementById('scene-camera');
const wall = document.getElementById('wall');
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
const edgesInput = document.getElementById('case-edges');
const edgesOut = document.getElementById('case-edges-out');
const countInput = document.getElementById('shelf-count');
const countOut = document.getElementById('shelf-count-out');
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
  return {
    version: 2,
    depth: DEFAULT_DEPTH,
    edges: DEFAULT_EDGES,
    zoom: 1,
    units: [makeUnit((100 - NEW_CASE_W) / 2, 20, NEW_CASE_W, NEW_CASE_H, [
      { id: 'shelf-1', weight: 1, books: 46, boxes: [] },
      { id: 'shelf-2', weight: 1, books: 48, boxes: [] },
      { id: 'shelf-3', weight: 1, books: 46, boxes: [] },
      { id: 'shelf-4', weight: 1, books: 44, boxes: [] },
    ])],
  };
}

function clampZoom(z) {
  const n = Number(z);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(n) ? n : 1));
}

function normalizeShelf(s, i = 0) {
  return {
    id: s.id || `shelf-${i + 1}`,
    weight: Math.max(0.01, Number(s.weight) || 1),
    books: Math.min(MAX_BOOKS, Math.max(MIN_BOOKS, Number(s.books) || DEFAULT_BOOKS)),
    boxes: Array.isArray(s.boxes)
      ? s.boxes.map((b, j) => ({
          id: b.id || `box-${i}-${j}`,
          width: Math.min(MAX_BOX_W, Math.max(MIN_BOX_W, Number(b.width) || DEFAULT_BOX_W)),
          color: b.color || boxColors[j % boxColors.length],
        }))
      : [],
  };
}

function normalizeUnit(u, i) {
  let shelves = (u.shelves?.length ? u.shelves : defaultShelves()).map(normalizeShelf);
  if (shelves.length > MAX_SHELVES) shelves = shelves.slice(0, MAX_SHELVES);
  while (shelves.length < MIN_SHELVES) {
    shelves.push(normalizeShelf({ weight: 1, books: DEFAULT_BOOKS, boxes: [] }, shelves.length));
  }
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const unit = {
    id: u.id || `unit-${i + 1}`,
    x: num(u.x, 26),
    y: num(u.y, 16),
    w: num(u.w, 42),
    h: num(u.h, 56),
    shelves,
  };
  clampUnitInPlane(unit);
  enforceShelfShares(unit);
  return unit;
}

function clampDepth(d) {
  const n = Number(d);
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Number.isFinite(n) ? n : DEFAULT_DEPTH));
}

function clampEdges(e) {
  const n = Number(e);
  return Math.min(MAX_EDGES, Math.max(MIN_EDGES, Number.isFinite(n) ? n : DEFAULT_EDGES));
}

function migrate(parsed) {
  if (parsed?.version === 2 && parsed.units?.length) {
    return {
      version: 2,
      depth: clampDepth(parsed.depth),
      edges: clampEdges(parsed.edges ?? 16),
      zoom: clampZoom(parsed.zoom ?? 1),
      units: parsed.units.map(normalizeUnit),
    };
  }
  if (parsed?.shelves?.length) {
    return {
      version: 2,
      depth: clampDepth(parsed.depth),
      edges: clampEdges(parsed.edges ?? 16),
      zoom: clampZoom(parsed.zoom ?? 1),
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
/** Screen pan offset (px) for small viewports that keep desktop scene scale. */
let pan = { x: 0, y: 0 };
let panDrag = null;
let pinch = null;
let overlayRaf = 0;

/** Clear leftover inline camera box from older builds / bfcache. */
function resetCameraBox() {
  if (!sceneCamera) return;
  sceneCamera.classList.remove('is-sized');
  sceneCamera.style.width = '';
  sceneCamera.style.height = '';
  sceneCamera.style.left = '';
  sceneCamera.style.top = '';
  sceneCamera.style.right = '';
  sceneCamera.style.bottom = '';
  sceneCamera.style.inset = '';
}

function cameraBoxSize(sw = stage?.clientWidth || 0, sh = stage?.clientHeight || 0) {
  return {
    w: Math.max(sw * CAMERA_BLEED_X, SCENE_MIN_W),
    h: Math.max(sh * CAMERA_BLEED_Y, SCENE_MIN_H),
  };
}

/**
 * Camera size comes from CSS (min 1280×720). --zoom is user zoom only (edit).
 * Do not multiply by a fit scale — that breaks perspective on mobile.
 */
function syncCameraFrame() {
  if (!stage || !sceneCamera || !world) return false;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw < 8 || sh < 8) return false;
  resetCameraBox();
  const userZoom = clampZoom(state.zoom);
  world.style.setProperty('--zoom', String(userZoom));
  const { w: camW, h: camH } = cameraBoxSize(sw, sh);
  clampPan(sw, sh, camW * userZoom, camH * userZoom);
  applyPan();
  return true;
}

function clampPan(sw, sh, camW, camH) {
  const maxX = Math.max(0, (camW - sw) / 2);
  const maxY = Math.max(0, (camH - sh) / 2);
  pan.x = Math.min(maxX, Math.max(-maxX, pan.x));
  pan.y = Math.min(maxY, Math.max(-maxY, pan.y));
}

function applyPan() {
  if (!world) return;
  world.style.setProperty('--pan-x', `${pan.x}px`);
  world.style.setProperty('--pan-y', `${pan.y}px`);
  scheduleOverlaySync();
}

function applyZoom() {
  if (!world) return;
  state.zoom = clampZoom(state.zoom);
  if (zoomInput) zoomInput.value = String(state.zoom);
  if (zoomOut) zoomOut.textContent = state.zoom.toFixed(2);
  syncCameraFrame();
}

/** Reset view to the geometric centre of the room/bookshelf. */
function centerView() {
  pan.x = 0;
  pan.y = 0;
  applyPan();
}

/**
 * Size the placement plane from the desktop camera box — never from
 * wall.clientWidth (3D ancestors often report 0 after mobile reload).
 */
function syncPlacementPlane() {
  const sized = syncCameraFrame();
  if (!sized || !unitLayer || !stage) return false;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw < 8 || sh < 8) return false;

  const { w: refW, h: refH } = cameraBoxSize(sw, sh);
  let planeW = refW;
  let planeH = refH;
  if (refW / refH > PLANE_ASPECT) planeW = refH * PLANE_ASPECT;
  else planeH = refW / PLANE_ASPECT;
  planeW *= PLANE_FIT;
  planeH *= PLANE_FIT;

  unitLayer.style.width = `${Math.round(planeW)}px`;
  unitLayer.style.height = `${Math.round(planeH)}px`;
  unitLayer.style.left = '50%';
  unitLayer.style.top = '50%';
  unitLayer.style.right = 'auto';
  unitLayer.style.bottom = 'auto';
  unitLayer.style.transform = 'translate(-50%, -50%)';
  return true;
}

/** Retry layout until the stage has real size (common on mobile first paint / reload). */
function ensureSceneVisible(attempt = 0) {
  const ok = syncPlacementPlane();
  if (ok) {
    if (attempt === 0) {
      setTimeout(() => {
        centerView();
        syncPlacementPlane();
        buildScene();
      }, 160);
    }
    return;
  }
  if (attempt >= 20) return;
  setTimeout(() => {
    resetCameraBox();
    centerView();
    buildScene();
    ensureSceneVisible(attempt + 1);
  }, 50 + attempt * 40);
}

/** Layout box of the placement plane (not the 3D-projected AABB). */
function planeLayoutSize() {
  const w = unitLayer?.clientWidth || 0;
  const h = unitLayer?.clientHeight || 0;
  if (w > 0 && h > 0) return { w, h };
  const sw = stage?.clientWidth || window.innerWidth || SCENE_MIN_W;
  const sh = stage?.clientHeight || window.innerHeight || SCENE_MIN_H;
  const { w: refW, h: refH } = cameraBoxSize(sw, sh);
  if (refW / refH > PLANE_ASPECT) return { w: refH * PLANE_ASPECT * PLANE_FIT, h: refH * PLANE_FIT };
  return { w: refW * PLANE_FIT, h: (refW / PLANE_ASPECT) * PLANE_FIT };
}

function sanitizeState(next = state) {
  if (!next?.units) return next;
  next.zoom = clampZoom(next.zoom ?? 1);
  next.depth = clampDepth(next.depth);
  next.edges = clampEdges(next.edges);
  next.units.forEach((unit) => {
    if (!Array.isArray(unit.shelves)) unit.shelves = defaultShelves();
    if (unit.shelves.length > MAX_SHELVES) unit.shelves.length = MAX_SHELVES;
    while (unit.shelves.length < MIN_SHELVES) {
      unit.shelves.push({ id: uid('shelf'), weight: 1, books: DEFAULT_BOOKS, boxes: [] });
    }
    unit.shelves.forEach((s) => {
      const w = Number(s.weight);
      s.weight = Number.isFinite(w) && w > 0 ? w : 1;
      const books = Number(s.books);
      s.books = Math.min(MAX_BOOKS, Math.max(MIN_BOOKS, Number.isFinite(books) ? books : DEFAULT_BOOKS));
      if (!Array.isArray(s.boxes)) s.boxes = [];
      s.boxes = s.boxes.map((b, j) => ({
        id: b?.id || uid('box'),
        width: Math.min(MAX_BOX_W, Math.max(MIN_BOX_W, Number(b?.width) || DEFAULT_BOX_W)),
        color: b?.color || boxColors[j % boxColors.length],
      }));
    });
    // Size + plane bounds only — never rewrite from screen projection.
    clampUnitInPlane(unit);
    enforceShelfShares(unit);
  });
  return next;
}

function saveState() {
  sanitizeState(state);
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

function caseHeightPx(unit) {
  const layerH = planeLayoutSize().h;
  return (Math.max(MIN_H, unit.h) / 100) * layerH;
}

/** Minimum case height (%) so every current shelf keeps at least MIN_SHELF_PX. */
function minHeightPctForShelves(count) {
  const n = Math.max(MIN_SHELVES, count || MIN_SHELVES);
  const layerH = planeLayoutSize().h;
  if (layerH > 0) {
    return Math.max(MIN_H, Math.min(MAX_H, ((n * MIN_SHELF_PX) / layerH) * 100));
  }
  return Math.max(MIN_H, Math.min(MAX_H, n * 8));
}

/** Grow the case (keeping bottom edge) until it fits its shelves. */
function ensureCaseFitsShelves(unit) {
  if (!unit) return;
  const need = minHeightPctForShelves(unit.shelves.length);
  if (unit.h < need - 1e-6) {
    const bottom = unit.y + unit.h;
    unit.h = need;
    unit.y = bottom - unit.h;
  }
  clampUnitSizeOnly(unit);
  clampUnitInPlane(unit);
}

function shelfCountLimits(_unit) {
  return { min: MIN_SHELVES, max: MAX_SHELVES };
}

/**
 * Minimum bay height as a fraction of this case's pixel height.
 * Uses a fixed pixel floor so tall cases are not locked to a large % each.
 */
function minShareForUnit(unit) {
  const n = Math.max(1, unit?.shelves?.length || MIN_SHELVES);
  const hPx = caseHeightPx(unit);
  if (hPx <= 1) return 1 / n;
  return Math.min(MIN_SHELF_PX / hPx, 1 / n);
}

/** Clamp every shelf to the fixed pixel floor without changing ordering. */
function enforceShelfShares(unit) {
  const n = unit.shelves.length;
  if (n <= 0) return;
  const minShare = minShareForUnit(unit);
  let shares = unit.shelves.map((s) => Math.max(0, Number(s.weight) || 0));
  let total = shares.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    unit.shelves.forEach((s) => {
      s.weight = 1;
    });
    return;
  }
  shares = shares.map((w) => w / total);

  if (!shares.every((s) => s >= minShare - 1e-6)) {
    for (let pass = 0; pass < 10; pass++) {
      let deficit = 0;
      let flex = 0;
      for (let i = 0; i < n; i++) {
        if (shares[i] < minShare) {
          deficit += minShare - shares[i];
          shares[i] = minShare;
        } else {
          flex += shares[i] - minShare;
        }
      }
      if (deficit <= 1e-9) break;
      if (flex <= 1e-9) {
        shares = shares.map(() => 1 / n);
        break;
      }
      for (let i = 0; i < n; i++) {
        if (shares[i] > minShare) {
          shares[i] -= ((shares[i] - minShare) / flex) * deficit;
        }
      }
    }
  }

  unit.shelves.forEach((s, i) => {
    s.weight = shares[i] * n;
  });
}

function pairWeightBounds(unit, index, pair, weights = null) {
  const src = weights || unit.shelves.map((s) => s.weight);
  const pairSum = src[index] + src[pair];
  const total = src.reduce((a, b) => a + b, 0) || 1;
  const minW = minShareForUnit(unit) * total;
  const maxW = Math.max(minW, pairSum - minW);
  return { pairSum, total, minW, maxW };
}

/**
 * Resize one shelf by trading height only with its neighbor.
 * All other shelf edges stay fixed (their weights unchanged).
 */
function resizeShelfPair(unit, index, newWeight) {
  const shelves = unit.shelves;
  if (!shelves[index]) return;
  const pair = index < shelves.length - 1 ? index + 1 : index - 1;
  const total = totalWeight(shelves);
  const minW = minShareForUnit(unit) * total;
  if (pair < 0 || pair >= shelves.length) {
    shelves[index].weight = Math.max(minW, newWeight);
    return;
  }

  const { pairSum, maxW } = pairWeightBounds(unit, index, pair);
  const w = Math.min(maxW, Math.max(minW, newWeight));
  shelves[index].weight = w;
  shelves[pair].weight = pairSum - w;
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
  const available = Math.max(MIN_BOOK_ROW_SHARE, 1 - boxShare);
  return Math.max(MIN_BOOKS, Math.round(shelf.books * available));
}

function clampUnitSizeOnly(u) {
  const w = Number(u.w);
  const h = Number(u.h);
  const x = Number(u.x);
  const y = Number(u.y);
  u.w = Math.min(MAX_W, Math.max(MIN_W, Number.isFinite(w) ? w : MIN_W));
  u.h = Math.min(MAX_H, Math.max(MIN_H, Number.isFinite(h) ? h : MIN_H));
  u.x = Number.isFinite(x) ? x : 0;
  u.y = Number.isFinite(y) ? y : 0;
}

/** Keep the case inside the placement plane (percentage space). */
function clampUnitInPlane(u) {
  clampUnitSizeOnly(u);
  u.x = Math.min(100 - u.w, Math.max(0, Number(u.x) || 0));
  u.y = Math.min(100 - u.h, Math.max(0, Number(u.y) || 0));
}

/**
 * Move/resize limits in placement-plane % space.
 * Stable across window resize — stored positions are never rewritten from
 * viewport projection.
 */
function dragLimitPct(_unit = null) {
  return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
}

/** Persistable clamp: plane % only. */
function clampUnitBounds(u) {
  clampUnitInPlane(u);
}

/**
 * Resize clamp: size limits and plane edges stop the *dragged* edge only.
 * Opposite edges stay fixed so the case never translates when you pull past a limit.
 */
function clampResizeDrag(unit, edge, orig) {
  const minW = MIN_W;
  const maxW = MAX_W;
  const minH = Math.max(MIN_H, minHeightPctForShelves(unit.shelves?.length || MIN_SHELVES));
  const maxH = MAX_H;
  const plane = dragLimitPct(unit);

  let left = orig.x;
  let top = orig.y;
  let right = orig.x + orig.w;
  let bottom = orig.y + orig.h;

  if (edge.includes('e')) right = unit.x + unit.w;
  if (edge.includes('w')) left = unit.x;
  if (edge.includes('s')) bottom = unit.y + unit.h;
  if (edge.includes('n')) top = unit.y;

  if (edge.includes('w')) left = Math.max(plane.minX, left);
  if (edge.includes('e')) right = Math.min(plane.maxX, right);
  if (edge.includes('n')) top = Math.max(plane.minY, top);
  if (edge.includes('s')) bottom = Math.min(plane.maxY, bottom);

  let w = right - left;
  let h = bottom - top;
  if (w < minW) {
    if (edge.includes('w') && !edge.includes('e')) left = right - minW;
    else right = left + minW;
    w = minW;
  } else if (w > maxW) {
    if (edge.includes('w') && !edge.includes('e')) left = right - maxW;
    else right = left + maxW;
    w = maxW;
  }
  if (h < minH) {
    if (edge.includes('n') && !edge.includes('s')) top = bottom - minH;
    else bottom = top + minH;
    h = minH;
  } else if (h > maxH) {
    if (edge.includes('n') && !edge.includes('s')) top = bottom - maxH;
    else bottom = top + maxH;
    h = maxH;
  }

  if (edge.includes('w') && !edge.includes('e')) {
    left = Math.max(plane.minX, right - w);
    w = right - left;
  } else if (edge.includes('e') && !edge.includes('w')) {
    right = Math.min(plane.maxX, left + w);
    w = right - left;
  } else {
    left = Math.max(plane.minX, Math.min(left, plane.maxX - w));
    right = left + w;
  }

  if (edge.includes('n') && !edge.includes('s')) {
    top = Math.max(plane.minY, bottom - h);
    h = bottom - top;
  } else if (edge.includes('s') && !edge.includes('n')) {
    bottom = Math.min(plane.maxY, top + h);
    h = bottom - top;
  } else {
    top = Math.max(plane.minY, Math.min(top, plane.maxY - h));
    bottom = top + h;
  }

  unit.x = left;
  unit.y = top;
  unit.w = Math.max(minW, Math.min(maxW, w));
  unit.h = Math.max(minH, Math.min(maxH, h));

  const el = unitEl(unit.id);
  if (!el) return;
  el.style.left = `${unit.x}%`;
  el.style.top = `${unit.y}%`;
  el.style.width = `${unit.w}%`;
  el.style.height = `${unit.h}%`;
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
  const lim = dragLimitPct(unit);
  const targets = [];
  if (axis === 'x') {
    targets.push(lim.minX, (lim.minX + lim.maxX) / 2 - unit.w / 2, lim.maxX - unit.w);
    for (const o of otherUnits(unit.id)) {
      targets.push(o.x, o.x + o.w + GAP, o.x - unit.w - GAP);
      targets.push(o.x + o.w / 2 - unit.w / 2);
    }
  } else {
    targets.push(lim.minY, (lim.minY + lim.maxY) / 2 - unit.h / 2, lim.maxY - unit.h);
    for (const o of otherUnits(unit.id)) {
      targets.push(o.y, o.y + o.h + GAP, o.y - unit.h - GAP);
      targets.push(o.y + o.h / 2 - unit.h / 2);
    }
  }
  return targets;
}

function snapUnitPosition(unit) {
  const lim = dragLimitPct(unit);
  unit.x = snapValue(unit.x, snapTargetsForAxis(unit, 'x'));
  unit.y = snapValue(unit.y, snapTargetsForAxis(unit, 'y'));
  const rightTargets = otherUnits(unit.id).flatMap((o) => [o.x - GAP, o.x + o.w, lim.maxX]);
  const bottomTargets = otherUnits(unit.id).flatMap((o) => [o.y - GAP, o.y + o.h, lim.maxY]);
  const snappedRight = snapValue(unit.x + unit.w, rightTargets);
  const snappedBottom = snapValue(unit.y + unit.h, bottomTargets);
  if (Math.abs(snappedRight - (unit.x + unit.w)) < SNAP) unit.x = snappedRight - unit.w;
  if (Math.abs(snappedBottom - (unit.y + unit.h)) < SNAP) unit.y = snappedBottom - unit.h;
  clampUnitBounds(unit);
}

function snapUnitResize(unit, edge) {
  const others = otherUnits(unit.id);
  const lim = dragLimitPct(unit);
  const minH = Math.max(MIN_H, minHeightPctForShelves(unit.shelves?.length || MIN_SHELVES));
  if (edge.includes('e')) {
    const targets = [lim.maxX, ...others.flatMap((o) => [o.x - GAP, o.x + o.w])];
    const right = snapValue(unit.x + unit.w, targets);
    unit.w = Math.max(MIN_W, right - unit.x);
  }
  if (edge.includes('w')) {
    const targets = [lim.minX, ...others.flatMap((o) => [o.x, o.x + o.w + GAP])];
    const left = snapValue(unit.x, targets);
    const right = unit.x + unit.w;
    unit.x = left;
    unit.w = Math.max(MIN_W, right - left);
  }
  if (edge.includes('s')) {
    const targets = [lim.maxY, ...others.flatMap((o) => [o.y - GAP, o.y + o.h])];
    const bottom = snapValue(unit.y + unit.h, targets);
    unit.h = Math.max(minH, bottom - unit.y);
  }
  if (edge.includes('n')) {
    const targets = [lim.minY, ...others.flatMap((o) => [o.y, o.y + o.h + GAP])];
    const top = snapValue(unit.y, targets);
    const bottom = unit.y + unit.h;
    unit.y = top;
    unit.h = Math.max(minH, bottom - top);
  }
  // Do not call clampUnitBounds here — it translates the case. Resize finalize
  // uses clampResizeDrag to keep opposite edges anchored.
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

/** Push neighbors away so a resized case can keep its anchored edges. */
function separateOthersFrom(unit) {
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
        if (otherCx >= unitCx) other.x += ox + 0.01;
        else other.x -= ox + 0.01;
      } else {
        const unitCy = unit.y + unit.h / 2;
        const otherCy = other.y + other.h / 2;
        if (otherCy >= unitCy) other.y += oy + 0.01;
        else other.y -= oy + 0.01;
      }
      if (other.id && unitEl(other.id)) clampUnitBounds(other);
      else {
        other.x = Math.min(100 - other.w, Math.max(0, other.x));
        other.y = Math.min(100 - other.h, Math.max(0, other.y));
      }
      if (other.id) applyUnitGeometry(other);
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
  const minHForNew = minHeightPctForShelves(DEFAULT_SHELF_COUNT);
  const sizes = ADJACENT_CASE_SIZES.map(({ w, h }) => ({
    w: Math.min(MAX_W, Math.max(MIN_W, w)),
    h: Math.min(MAX_H, Math.max(minHForNew, h)),
  }));

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
        slot.h = Math.min(slot.h, dragLimitPct(anchor).maxY - slot.y);
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
    if (slot.w < MIN_W - 0.01 || slot.h < minHForNew - 0.01) return null;
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
      else slot = { x: anchor.x + off, y: dragLimitPct(anchor).maxY - size.h, w: size.w, h: size.h };
      clampUnitBounds(slot);
      if (!overlapsAny(slot)) return slot;
    }
  }
  return null;
}

function finalizeUnitLayout(unit, { snap = true, edge = null } = {}) {
  if (edge) {
    // Preserve undragged edges so snap/clamp cannot translate the case.
    const minH = Math.max(MIN_H, minHeightPctForShelves(unit.shelves?.length || MIN_SHELVES));
    const fixedLeft = edge.includes('w') ? null : unit.x;
    const fixedRight = edge.includes('e') ? null : unit.x + unit.w;
    const fixedTop = edge.includes('n') ? null : unit.y;
    const fixedBottom = edge.includes('s') ? null : unit.y + unit.h;

    if (snap) snapUnitResize(unit, edge);

    if (fixedLeft != null && fixedRight != null) {
      unit.x = fixedLeft;
      unit.w = fixedRight - fixedLeft;
    } else if (fixedLeft != null) {
      unit.w = Math.max(MIN_W, unit.x + unit.w - fixedLeft);
      unit.x = fixedLeft;
    } else if (fixedRight != null) {
      unit.w = Math.max(MIN_W, fixedRight - unit.x);
      unit.x = fixedRight - unit.w;
    }

    if (fixedTop != null && fixedBottom != null) {
      unit.y = fixedTop;
      unit.h = fixedBottom - fixedTop;
    } else if (fixedTop != null) {
      unit.h = Math.max(minH, unit.y + unit.h - fixedTop);
      unit.y = fixedTop;
    } else if (fixedBottom != null) {
      unit.h = Math.max(minH, fixedBottom - unit.y);
      unit.y = fixedBottom - unit.h;
    }

    const anchorLeft = fixedLeft != null ? fixedLeft : unit.x;
    const anchorTop = fixedTop != null ? fixedTop : unit.y;
    const anchorRight = fixedRight != null ? fixedRight : unit.x + unit.w;
    const anchorBottom = fixedBottom != null ? fixedBottom : unit.y + unit.h;
    clampResizeDrag(unit, edge, {
      x: anchorLeft,
      y: anchorTop,
      w: anchorRight - anchorLeft,
      h: anchorBottom - anchorTop,
    });
    // Keep this case's anchors; nudge neighbors out of the way instead.
    separateOthersFrom(unit);
    return;
  }

  clampUnitBounds(unit);
  if (snap) snapUnitPosition(unit);
  separateFromOthers(unit);
  clampUnitBounds(unit);
}

/* ── Render ── */

function buildUnitDom(unit, unitIndex) {
  const root = document.createElement('div');
  root.className = 'px-shelf';
  root.dataset.unitId = unit.id;
  root.style.left = `${unit.x}%`;
  root.style.top = `${unit.y}%`;
  root.style.width = `${unit.w}%`;
  root.style.height = `${unit.h}%`;
  root.style.setProperty('--shelf-d', `${state.depth}px`);
  root.style.setProperty('--frame-edge', `${state.edges}px`);
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

    if (editing) {
      const handle = document.createElement('div');
      handle.className = 'shelf-handle';
      handle.dataset.shelfId = shelf.id;
      handle.dataset.unitId = unit.id;
      handle.dataset.index = String(index);
      handle.title = 'Drag shelf to adjust height';
      row.appendChild(handle);
      plank.classList.add('is-draggable');
      plank.dataset.shelfId = shelf.id;
      plank.dataset.unitId = unit.id;
      plank.title = 'Drag to adjust shelf height';
    }

    cavity.appendChild(row);
  });

  if (editing) {
    // Flat front pick plane — CSS 3D faces don't receive clicks reliably.
    const pick = document.createElement('div');
    pick.className = 'unit-pick';
    pick.dataset.unitId = unit.id;
    pick.title = 'Click to select · drag the wood plank to resize height';
    root.appendChild(pick);
  }

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
  syncPlacementPlane();
  sanitizeState(state);
  applyZoom();
  unitLayer.innerHTML = '';
  depthInput.value = String(state.depth);
  depthOut.textContent = String(state.depth);
  edgesInput.value = String(state.edges);
  edgesOut.textContent = String(state.edges);

  state.units.forEach((unit, i) => {
    clampUnitInPlane(unit);
    unitLayer.appendChild(buildUnitDom(unit, i));
  });

  state.units.forEach((unit) => {
    applyUnitGeometry(unit);
  });

  buildOverlayChrome();
  syncInspector();
}

function syncInspector() {
  const shelf = selectedShelf();
  const unit = selectedUnit();
  const shelfControls = selected.type === 'shelf' || selected.type === 'box';
  const canResizeShelf = !!shelf && !!unit && unit.shelves.length >= 2;
  weightInput.disabled = !shelfControls || !canResizeShelf;
  booksInput.disabled = !shelfControls || !shelf;
  countInput.disabled = !unit;

  if (!editing) return;

  if (!unit) {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    countOut.textContent = '—';
    editHint.textContent = 'Click a case frame to select it, or a shelf to adjust heights. Drag shelves to resize them.';
    return;
  }

  countInput.value = String(unit.shelves.length);
  countOut.textContent = String(unit.shelves.length);
  const limits = shelfCountLimits(unit);
  countInput.min = String(limits.min);
  countInput.max = String(limits.max);

  if (selected.type === 'unit') {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = `Case selected (${state.units.length} total). Drag the top bar to move. Click a shelf to select it; drag the wood plank to change height.`;
    return;
  }

  if (!shelf) {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = 'Selection lost — click an object again.';
    return;
  }

  const index = unit.shelves.findIndex((s) => s.id === shelf.id);
  if (index < 0) {
    weightOut.textContent = '—';
    booksOut.textContent = '—';
    editHint.textContent = 'Selection lost — click an object again.';
    return;
  }
  const total = totalWeight(unit.shelves);
  const minPct = minShareForUnit(unit) * 100;
  const sharePct = (shelf.weight / total) * 100;
  const pair = index < unit.shelves.length - 1 ? index + 1 : index > 0 ? index - 1 : -1;
  let maxPct = 100 - minPct * Math.max(0, unit.shelves.length - 1);
  if (pair >= 0) {
    const pairPct = ((unit.shelves[index].weight + unit.shelves[pair].weight) / total) * 100;
    maxPct = Math.max(minPct, pairPct - minPct);
  }
  weightInput.min = String(minPct);
  weightInput.max = String(maxPct);
  weightInput.step = '0.5';
  weightInput.value = String(Math.round(sharePct * 10) / 10);
  booksInput.value = String(shelf.books);
  weightOut.textContent = `${Math.round(sharePct)}%`;
  booksOut.textContent = String(shelf.books);

  if (selected.type === 'box') {
    editHint.textContent = 'Box selected. Press Delete to remove it.';
  } else if (unit.shelves.length < 2) {
    editHint.textContent = 'Shelf selected (1 in case). Add another shelf to adjust heights.';
  } else {
    editHint.textContent = `Shelf selected (${unit.shelves.length} in case). Drag a wood divider (not the floor) to change height.`;
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
  // Keep inspector live during drags, but always rebuild when the target changes
  // so case/shelf chrome cannot get stuck on a previous import selection.
  if (drag) {
    syncInspector();
    buildOverlayChrome();
    unitLayer.querySelectorAll('.px-shelf').forEach((el) => {
      el.classList.toggle('is-active-unit', el.dataset.unitId === unitId);
      el.classList.toggle('is-unit-selected', el.dataset.unitId === unitId && selected.type === 'unit');
    });
    unitLayer.querySelectorAll('.shelf-row').forEach((row) => {
      row.classList.toggle(
        'is-selected',
        selected.type === 'shelf' &&
          row.dataset.unitId === unitId &&
          row.dataset.shelfId === shelfId,
      );
    });
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
  ensureCaseFitsShelves(next);
  // Keep the free-slot placement; light edge snap only if it stays clear.
  const before = { x: next.x, y: next.y, w: next.w, h: next.h };
  snapUnitPosition(next);
  if (overlapsAny(next)) {
    next.x = before.x;
    next.y = before.y;
    next.w = before.w;
    next.h = before.h;
  }
  clampUnitBounds(next);
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
  setShelfCount(unit, unit.shelves.length + 1);
}

function setShelfCount(unit, count) {
  if (!unit) return;
  const target = Math.min(MAX_SHELVES, Math.max(MIN_SHELVES, Math.round(Number(count) || MIN_SHELVES)));
  if (target === unit.shelves.length) {
    syncInspector();
    return;
  }

  while (unit.shelves.length < target) {
    const after = selected.shelfId
      ? unit.shelves.findIndex((s) => s.id === selected.shelfId)
      : unit.shelves.length - 1;
    const shelf = { id: uid('shelf'), weight: 1, books: DEFAULT_BOOKS, boxes: [] };
    unit.shelves.splice(Math.max(0, after) + 1, 0, shelf);
    selected = { type: 'shelf', unitId: unit.id, shelfId: shelf.id, boxId: null };
  }

  while (unit.shelves.length > target) {
    unit.shelves.pop();
  }

  if (selected.shelfId && !unit.shelves.some((s) => s.id === selected.shelfId)) {
    const fallback = unit.shelves[unit.shelves.length - 1];
    selected = fallback
      ? { type: 'shelf', unitId: unit.id, shelfId: fallback.id, boxId: null }
      : { type: 'unit', unitId: unit.id, shelfId: null, boxId: null };
  }

  enforceShelfShares(unit);
  ensureCaseFitsShelves(unit);
  saveState();
  buildScene();
}

function addBox() {
  const unit = selectedUnit() || state.units[0];
  let shelf = selectedShelf();
  if (!shelf && unit) shelf = unit.shelves[unit.shelves.length - 1];
  if (!unit || !shelf) return;
  if (shelf.boxes.length >= MAX_BOXES_PER_SHELF) {
    editHint.textContent = `Maximum of ${MAX_BOXES_PER_SHELF} boxes on a shelf.`;
    return;
  }
  const used = shelf.boxes.reduce((n, b) => n + b.width, 0);
  if (used > MAX_BOX_WIDTH_SHARE) {
    editHint.textContent = 'Not enough free width on this shelf for another box.';
    return;
  }
  const box = {
    id: uid('box'),
    width: DEFAULT_BOX_W,
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
    enforceShelfShares(unit);
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
  sanitizeState(state);
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
      drag = null;
      const parsed = migrate(JSON.parse(String(reader.result)));
      resolveAllOverlaps(parsed.units);
      state = parsed;
      saveState();
      selected = {
        type: 'unit',
        unitId: state.units[0]?.id || null,
        shelfId: null,
        boxId: null,
      };
      // File picker / parallax can leave the camera rotated so 3D pick planes miss hits.
      target.x = 0;
      target.y = 0;
      current.x = 0;
      current.y = 0;
      apply();
      if (!editing) setEditing(true);
      else buildScene();
    } catch {
      editHint.textContent = 'Could not read that settings file.';
    }
  };
  reader.readAsText(file);
}

/* ── Parallax + pan ── */
const target = { x: 0, y: 0 };
const current = { x: 0, y: 0 };
let frame = null;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function aim(x, y) {
  if (editing || drag || panDrag) {
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

function canStartTouchPan(targetEl) {
  if (!editing) return true;
  return !targetEl?.closest?.(
    '.unit-pick, .unit-handle, .unit-move-bar, .edit-panel, .quiet-tools, .search-dock',
  );
}

function startPanDrag(e) {
  panDrag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    origX: pan.x,
    origY: pan.y,
  };
  world.classList.add('is-panning');
  aim(0, 0);
  try {
    stage.setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
}

function movePanDrag(e) {
  if (!panDrag || e.pointerId !== panDrag.pointerId) return;
  pan.x = panDrag.origX + (e.clientX - panDrag.startX);
  pan.y = panDrag.origY + (e.clientY - panDrag.startY);
  const sw = stage.clientWidth || window.innerWidth || SCENE_MIN_W;
  const sh = stage.clientHeight || window.innerHeight || SCENE_MIN_H;
  const z = clampZoom(state.zoom);
  const { w: camW, h: camH } = cameraBoxSize(sw, sh);
  clampPan(sw, sh, camW * z, camH * z);
  applyPan();
}

function endPanDrag(e) {
  if (!panDrag) return;
  if (e && panDrag.pointerId !== e.pointerId) return;
  panDrag = null;
  world.classList.remove('is-panning');
}

function isMobileTouchUi() {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

function touchDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function beginPinch(touches) {
  if (touches.length < 2) return;
  endPanDrag();
  pinch = {
    startDist: Math.max(1, touchDistance(touches[0], touches[1])),
    startZoom: clampZoom(state.zoom),
  };
  world.classList.add('is-panning');
  aim(0, 0);
}

function movePinch(touches) {
  if (!pinch || touches.length < 2) return;
  const dist = Math.max(1, touchDistance(touches[0], touches[1]));
  state.zoom = clampZoom(pinch.startZoom * (dist / pinch.startDist));
  applyZoom();
}

function endPinch() {
  if (!pinch) return;
  pinch = null;
  world.classList.remove('is-panning');
  saveState();
}

stage.addEventListener('pointermove', (e) => {
  if (pinch) return;
  if (panDrag) {
    movePanDrag(e);
    return;
  }
  if (drag || e.pointerType === 'touch') return;
  if (editing) return;
  const rect = stage.getBoundingClientRect();
  aim((e.clientX - rect.left) / rect.width * 2 - 1, (e.clientY - rect.top) / rect.height * 2 - 1);
});

stage.addEventListener('pointerleave', () => {
  if (!drag && !panDrag && !pinch) aim(0, 0);
});

stage.addEventListener('pointerdown', (e) => {
  if (pinch) return;
  const isMiddle = e.pointerType === 'mouse' && e.button === 1;
  const isTouchPan = e.pointerType === 'touch' && canStartTouchPan(e.target);
  if (!isMiddle && !isTouchPan) return;
  e.preventDefault();
  startPanDrag(e);
});

stage.addEventListener('pointerup', endPanDrag);
stage.addEventListener('pointercancel', endPanDrag);

stage.addEventListener(
  'touchstart',
  (e) => {
    if (!isMobileTouchUi()) return;
    if (e.touches.length >= 2) {
      e.preventDefault();
      beginPinch(e.touches);
    }
  },
  { passive: false },
);
stage.addEventListener(
  'touchmove',
  (e) => {
    if (!pinch) return;
    if (e.touches.length >= 2) {
      e.preventDefault();
      movePinch(e.touches);
    }
  },
  { passive: false },
);
stage.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) endPinch();
});
stage.addEventListener('touchcancel', () => endPinch());

stage.addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault();
});
stage.addEventListener('auxclick', (e) => {
  if (e.button === 1) e.preventDefault();
});

document.addEventListener('selectstart', (e) => {
  if (e.target?.closest?.('input, textarea, .search-results, .edit-panel')) return;
  e.preventDefault();
});

window.addEventListener('resize', () => {
  // Only refit the plane — never rewrite stored case x/y/w/h from projection.
  syncPlacementPlane();
  buildScene();
});

window.addEventListener('pageshow', () => {
  resetCameraBox();
  centerView();
  syncPlacementPlane();
  buildScene();
  ensureSceneVisible();
});

if (stage && typeof ResizeObserver !== 'undefined') {
  let lastSize = '';
  new ResizeObserver(() => {
    const key = `${stage.clientWidth}x${stage.clientHeight}`;
    if (key === lastSize || stage.clientWidth < 2) return;
    const first = !lastSize;
    lastSize = key;
    if (first) centerView();
    syncPlacementPlane();
    buildScene();
  }).observe(stage);
}

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

function isFrameEdgeClick(el, clientX, clientY) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const edge = 18;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return x <= edge || y <= edge || x >= rect.width - edge || y >= rect.height - edge;
}

/**
 * Hit-test which case owns a screen point.
 * Prefer the live paint/hit stack (accurate for 3D). Fall back to smallest
 * containing frame AABB when the stack misses the shelves entirely.
 */
function unitAtPoint(clientX, clientY) {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    const shelf = node.closest?.('.px-shelf');
    if (shelf?.dataset.unitId) {
      const unit = findUnit(shelf.dataset.unitId);
      if (unit) return unit;
    }
  }

  let best = null;
  let bestArea = Infinity;
  let bestDist = Infinity;
  for (const el of unitLayer.querySelectorAll('.px-shelf')) {
    const frame = el.querySelector('.shelf-frame') || el;
    const r = frame.getBoundingClientRect();
    if (
      clientX < r.left ||
      clientX > r.right ||
      clientY < r.top ||
      clientY > r.bottom
    ) {
      continue;
    }
    const area = Math.max(1, r.width * r.height);
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    if (area < bestArea - 1 || (Math.abs(area - bestArea) <= 1 && dist < bestDist)) {
      bestArea = area;
      bestDist = dist;
      best = findUnit(el.dataset.unitId);
    }
  }
  return best;
}

/**
 * Hit-test a storage crate under the pick plane.
 */
function boxAtPoint(unitId, clientX, clientY) {
  const root = unitEl(unitId);
  if (!root) return null;
  for (const crate of root.querySelectorAll('.shelf-crate')) {
    const r = crate.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return { shelfId: crate.dataset.shelfId, boxId: crate.dataset.boxId };
    }
  }
  return null;
}

/**
 * Hit-test wood dividers in placement-plane % space.
 * Avoids 3D getBoundingClientRect AABBs, which inflate under perspective and
 * overlap neighboring shelves (causing the wrong bay to drag / "shove").
 */
function woodPlankAtPoint(unitId, clientX, clientY) {
  const unit = findUnit(unitId);
  const root = unitEl(unitId);
  if (!unit || !root || unit.h <= 0) return null;

  const layer = unitLayer.getBoundingClientRect();
  if (layer.width < 2 || layer.height < 2) return null;

  const xPct = ((clientX - layer.left) / layer.width) * 100;
  const yPct = ((clientY - layer.top) / layer.height) * 100;
  if (xPct < unit.x - 0.4 || xPct > unit.x + unit.w + 0.4) return null;
  if (yPct < unit.y - 0.6 || yPct > unit.y + unit.h + 0.6) return null;

  const localY = ((yPct - unit.y) / unit.h) * 100;
  const casePx = Math.max(1, (unit.h / 100) * layer.height);
  // ~14px hit band, clamped so short bays don't steal neighbors' dividers.
  const slopPct = Math.max(1.6, Math.min(5.5, (14 / casePx) * 100));

  let best = null;
  let bestDist = Infinity;
  const metrics = layoutMetrics(unit.shelves);
  metrics.forEach(({ shelf, top, height }, index) => {
    // Floor plank under the last bay is not a height divider.
    if (index >= metrics.length - 1) return;
    const plankY = top + height;
    const dist = Math.abs(localY - plankY);
    if (dist > slopPct || dist >= bestDist) return;
    bestDist = dist;
    const row = root.querySelector(`.shelf-row[data-shelf-id="${CSS.escape(shelf.id)}"]`);
    best = {
      shelfId: shelf.id,
      row,
      node: row?.querySelector('.shelf-plank') || row,
    };
  });
  return best;
}

function applyLiveCollision(unit) {
  clampUnitBounds(unit);
  separateFromOthers(unit);
  clampUnitBounds(unit);
}

function refreshShelfBooks(unit, shelf) {
  const root = unitEl(unit.id);
  if (!root) return;
  const row = root.querySelector(`.shelf-row[data-shelf-id="${CSS.escape(shelf.id)}"]`);
  const wrap = row?.querySelector('.shelf-books');
  if (!wrap) return;
  const unitIndex = state.units.findIndex((u) => u.id === unit.id);
  const shelfIndex = unit.shelves.findIndex((s) => s.id === shelf.id);
  wrap.innerHTML = '';
  const count = bookCountFor(shelf);
  for (let i = 0; i < count; i++) {
    const book = document.createElement('span');
    book.className = 'scene-book';
    book.style.background = bookColors[(i + unitIndex * 5 + shelfIndex * 3) % bookColors.length];
    book.style.height = `${48 + ((i * 11 + shelfIndex * 7 + unitIndex * 5) % 42)}%`;
    wrap.appendChild(book);
  }
}

function startShelfHeightDrag(unit, shelfId, e) {
  const index = unit.shelves.findIndex((s) => s.id === shelfId);
  if (index < 0) return false;
  // The plank under shelf i is the divider above shelf i+1.
  // The bottom bay's plank is the case floor — not a movable divider.
  if (index >= unit.shelves.length - 1) return false;
  const pair = index + 1;
  const weights = unit.shelves.map((s) => s.weight);
  const bounds = pairWeightBounds(unit, index, pair, weights);
  // Layout px height (not 3D AABB) so drag tracking stays 1:1 with the pointer.
  const cavityH = Math.max(1, caseHeightPx(unit));
  drag = {
    type: 'shelf-drag',
    unitId: unit.id,
    shelfId,
    index,
    pair,
    sign: 1,
    startY: e.clientY,
    weights,
    minW: bounds.minW,
    maxW: bounds.maxW,
    pairSum: bounds.pairSum,
    total: bounds.total,
    cavityH,
    lastA: weights[index],
    armed: false,
  };
  selected = { type: 'shelf', unitId: unit.id, shelfId, boxId: null };
  unitLayer.querySelectorAll('.shelf-row').forEach((row) => {
    row.classList.toggle(
      'is-selected',
      row.dataset.unitId === unit.id && row.dataset.shelfId === shelfId,
    );
  });
  unitLayer.querySelectorAll('.px-shelf').forEach((el) => {
    el.classList.toggle('is-active-unit', el.dataset.unitId === unit.id);
    el.classList.remove('is-unit-selected');
  });
  buildOverlayChrome();
  syncInspector();
  return true;
}

function applyShelfDrag(e) {
  const unit = findUnit(drag.unitId);
  if (!unit) return;
  const dy = e.clientY - drag.startY;
  if (!drag.armed) {
    if (Math.abs(dy) < 4) return;
    drag.armed = true;
  }

  const cavityH = Math.max(1, drag.cavityH || caseHeightPx(unit));
  const a0 = drag.weights[drag.index];
  const delta = (dy / cavityH) * drag.total * 1.35 * drag.sign;
  const a = Math.min(drag.maxW, Math.max(drag.minW, a0 + delta));

  // Past the limit: do not rewrite weights (avoids float churn / neighbor jitter).
  if (Math.abs(a - drag.lastA) < 1e-8) return;
  drag.lastA = a;

  // Pair-only trade — restore every other shelf so only the neighbor moves.
  unit.shelves.forEach((s, i) => {
    s.weight = drag.weights[i];
  });
  unit.shelves[drag.index].weight = a;
  unit.shelves[drag.pair].weight = drag.pairSum - a;
  applyShelfHeights(unit);
  syncInspector();
}

/** Live-update every case's DOM after a shove/collision pass. */
function applyAllUnitGeometry() {
  state.units.forEach((u) => applyUnitGeometry(u));
}

editOverlay.addEventListener('pointerdown', (e) => {
  if (!editing) return;
  const handle = e.target.closest('.unit-handle');
  const move = e.target.closest('.unit-move-bar');
  if (!handle && !move) return;
  const unit = findUnit((handle || move).dataset.unitId || selected.unitId);
  if (!unit) return;
  e.preventDefault();
  e.stopPropagation();
  if (handle) startResizeDrag(unit, handle.dataset.edge, e);
  else startMoveDrag(unit, e);
  (handle || move).setPointerCapture?.(e.pointerId);
});

/** UI chrome that should not start scene picking. */
function isEditChromeTarget(target) {
  return !!target?.closest?.(
    '.edit-panel, .quiet-tools, .search-dock, .wordmark, .unit-handle, .unit-move-bar, button, input, textarea, a, label, select',
  );
}

/**
 * Screen-space picking on the stage. After import, 3D `.unit-pick` planes often
 * miss hit-testing (clicks land on `.room-3d`), so resolve cases via geometry.
 */
function handleEditScenePointerDown(e) {
  if (!editing) return;
  if (panDrag) return;
  // A stuck drag (common after the OS file dialog) blocks all picking.
  if (drag && e.type === 'pointerdown' && !e.target.closest?.('.unit-handle, .unit-move-bar')) {
    drag = null;
  }
  if (drag) return;
  if (isEditChromeTarget(e.target)) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const unit = unitAtPoint(e.clientX, e.clientY);
  if (!unit) return;

  e.preventDefault();

  const root = unitEl(unit.id);
  const pickEl = root?.querySelector('.unit-pick');
  const frameEl = root?.querySelector('.shelf-frame') || root;
  // Prefer frame face — pick-plane AABBs inflate under perspective.
  if (frameEl && isFrameEdgeClick(frameEl, e.clientX, e.clientY)) {
    select(unit.id);
    return;
  }

  const boxHit = boxAtPoint(unit.id, e.clientX, e.clientY);
  if (boxHit?.shelfId && boxHit?.boxId) {
    select(unit.id, boxHit.shelfId, boxHit.boxId);
    return;
  }

  const hit = woodPlankAtPoint(unit.id, e.clientX, e.clientY);
  if (hit) {
    if (startShelfHeightDrag(unit, hit.shelfId, e)) {
      (pickEl || stage).setPointerCapture?.(e.pointerId);
    } else {
      select(unit.id, hit.shelfId);
    }
    return;
  }

  select(unit.id);
}

stage.addEventListener('pointerdown', handleEditScenePointerDown);

stage.addEventListener('pointermove', (e) => {
  if (!editing || drag || panDrag) return;
  if (isEditChromeTarget(e.target)) {
    stage.style.cursor = '';
    return;
  }
  const unit = unitAtPoint(e.clientX, e.clientY);
  if (!unit) {
    stage.style.cursor = '';
    return;
  }
  const hit = woodPlankAtPoint(unit.id, e.clientX, e.clientY);
  const idx = hit ? unit.shelves.findIndex((s) => s.id === hit.shelfId) : -1;
  const canDragHeight = idx >= 0 && idx < unit.shelves.length - 1;
  stage.style.cursor = canDragHeight ? 'ns-resize' : 'var(--cursor-active)';
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;

  if (drag.type === 'shelf-drag') {
    applyShelfDrag(e);
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
    applyLiveCollision(unit);
    applyAllUnitGeometry();
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
    // Edge-anchored clamp — never translate the case when past size/screen limits.
    clampResizeDrag(unit, edge, o);
    // Live shove: push overlapping neighbors aside while dragging.
    separateOthersFrom(unit);
    applyAllUnitGeometry();
  }
});

window.addEventListener('pointerup', endPointerDrag);
window.addEventListener('pointercancel', endPointerDrag);

function endPointerDrag() {
  if (!drag) return;
  const ended = drag;
  drag = null;
  const unit = findUnit(ended.unitId);

  if (ended.type === 'shelf-drag') {
    if (ended.armed && unit) {
      applyShelfHeights(unit);
      syncInspector();
    }
    saveState();
    return;
  }

  if (unit && (ended.type === 'move' || ended.type === 'resize')) {
    finalizeUnitLayout(unit, {
      snap: true,
      edge: ended.type === 'resize' ? ended.edge : null,
    });
    applyAllUnitGeometry();
  }
  saveState();
  buildScene();
}

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
  else if (act === 'import') {
    drag = null;
    fileIn.click();
  } else if (act === 'reset') {
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
  const unit = selectedUnit();
  if (!shelf || !unit || (selected.type !== 'shelf' && selected.type !== 'box')) return;
  if (unit.shelves.length < 2) return;
  const index = unit.shelves.findIndex((s) => s.id === shelf.id);
  if (index < 0) return;
  const total = totalWeight(unit.shelves);
  const pct = Number(weightInput.value);
  resizeShelfPair(unit, index, (pct / 100) * total);
  const sharePct = (shelf.weight / totalWeight(unit.shelves)) * 100;
  weightInput.value = String(Math.round(sharePct * 10) / 10);
  weightOut.textContent = `${Math.round(sharePct)}%`;
  applyShelfHeights(unit);
});
weightInput.addEventListener('change', () => {
  saveState();
  buildScene();
});

booksInput.addEventListener('input', () => {
  const shelf = selectedShelf();
  if (!shelf || (selected.type !== 'shelf' && selected.type !== 'box')) return;
  const n = Number(booksInput.value);
  shelf.books = Math.min(MAX_BOOKS, Math.max(MIN_BOOKS, Number.isFinite(n) ? n : DEFAULT_BOOKS));
  booksInput.value = String(shelf.books);
  booksOut.textContent = String(shelf.books);
  const unit = selectedUnit();
  if (unit) refreshShelfBooks(unit, shelf);
});
booksInput.addEventListener('change', () => {
  saveState();
  buildScene();
});

countInput.addEventListener('input', () => {
  const unit = selectedUnit();
  if (!unit) return;
  countOut.textContent = String(countInput.value);
  setShelfCount(unit, Number(countInput.value));
});
countInput.addEventListener('change', () => {
  const unit = selectedUnit();
  if (!unit) return;
  setShelfCount(unit, Number(countInput.value));
});

depthInput.addEventListener('input', () => {
  state.depth = clampDepth(depthInput.value);
  depthInput.value = String(state.depth);
  depthOut.textContent = String(state.depth);
  unitLayer.querySelectorAll('.px-shelf').forEach((el) => {
    el.style.setProperty('--shelf-d', `${state.depth}px`);
  });
  scheduleOverlaySync();
});
depthInput.addEventListener('change', saveState);

if (zoomInput) {
  zoomInput.addEventListener('input', () => {
    state.zoom = clampZoom(zoomInput.value);
    applyZoom();
    scheduleOverlaySync();
  });
  zoomInput.addEventListener('change', saveState);
}

edgesInput.addEventListener('input', () => {
  state.edges = clampEdges(edgesInput.value);
  edgesInput.value = String(state.edges);
  edgesOut.textContent = String(state.edges);
  unitLayer.querySelectorAll('.px-shelf').forEach((el) => {
    el.style.setProperty('--frame-edge', `${state.edges}px`);
  });
  scheduleOverlaySync();
});
edgesInput.addEventListener('change', saveState);

// Drop leftover positioning from older builds.
resetCameraBox();
applyZoom();
centerView();
buildScene();
requestAnimationFrame(() => {
  centerView();
  syncPlacementPlane();
  buildScene();
  ensureSceneVisible();
});
if (reduceMotion) apply();
