/**
 * Full Experience — view-only 3D bookshelf (baked library).
 * Editable studio lives in edit/.
 */

import bakedLibrary from './library.js';
import { sprinkleButtonMotes } from '../lib/ember-motes.js';

const VIEW_ONLY = true;
const STORAGE_KEY = 'trc-full-library-v2';
const bookColors = ['#bd6256', '#597e9d', '#ce9551', '#67886d', '#a3647a', '#a68a62', '#4c7779'];
const boxColors = ['#8a5339', '#6b4030', '#a26443', '#5a3429'];

const MIN_W = 8;
const MIN_H = 18;
const MAX_W = 96;
const MAX_H = 100;
const SNAP = 1.35;
const GAP = 0.35;
const MAX_UNITS = 9;
/** Hard cap on shelves per case. */
const MAX_SHELVES = 8;
const MIN_SHELVES = 1;
/** Fixed minimum bay height in CSS pixels (not a % of the case). */
const MIN_SHELF_PX = 65;
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
const ZOOM_MIN = 0.38;
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
  const w = 34;
  const h = 52;
  return {
    version: 2,
    depth: 80,
    edges: 16,
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
    weight: Math.max(0.01, Number(s.weight) || 1),
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
  let shelves = (u.shelves?.length ? u.shelves : defaultShelves()).map(normalizeShelf);
  if (shelves.length > MAX_SHELVES) shelves = shelves.slice(0, MAX_SHELVES);
  while (shelves.length < MIN_SHELVES) {
    shelves.push(normalizeShelf({ weight: 1, books: 40, boxes: [] }, shelves.length));
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
  return Math.min(120, Math.max(48, Number.isFinite(n) ? n : 80));
}

function clampEdges(e) {
  const n = Number(e);
  return Math.min(24, Math.max(4, Number.isFinite(n) ? n : 16));
}

function migrate(parsed) {
  if (parsed?.version === 2 && parsed.units?.length) {
    return {
      version: 2,
      depth: clampDepth(parsed.depth),
      edges: clampEdges(parsed.edges ?? 16),
      units: parsed.units.map(normalizeUnit),
    };
  }
  if (parsed?.shelves?.length) {
    return {
      version: 2,
      depth: clampDepth(parsed.depth),
      edges: clampEdges(parsed.edges ?? 16),
      units: [normalizeUnit({ id: 'unit-1', x: 29, y: 18, w: 42, h: 56, shelves: parsed.shelves }, 0)],
    };
  }
  return defaultState();
}

let state = defaultState();
/** View-only: always false — never call setEditing(true). */
let editing = false;
let selected = { type: null, unitId: null, shelfId: null, boxId: null };
let drag = null;
/** Screen pan offset (px) for small viewports that keep desktop scene scale. */
let pan = { x: 0, y: 0 };
let panDrag = null;
/** Mobile pinch zoom (session only — not baked into library state). */
let viewZoom = 1;
/** Pinch multiplier on top of the portrait auto-fit. */
let pinchScale = 1;
let lastPortrait = null;
let pinch = null;
let overlayRaf = 0;

async function boot() {
  try {
    if (bakedLibrary) state = migrate(structuredClone(bakedLibrary));
    else {
      const res = await fetch('./library.json', { cache: 'no-store' });
      if (res.ok) state = migrate(await res.json());
    }
  } catch {}

  sanitizeState(state);
  relayout();
  requestAnimationFrame(() => {
    relayout();
    ensureSceneVisible(0);
  });
  // Search is optional — never block the bookshelf if config.js is missing.
  import('./search.js')
    .then((m) => m.bindSearchUi?.())
    .catch(() => {});
  sprinkleButtonMotes();
  if (reduceMotion) apply();
}

/** Clear any leftover inline camera box from older builds / bfcache. */
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

function isMobilePortrait() {
  const sw = stage?.clientWidth || window.innerWidth || 0;
  const sh = stage?.clientHeight || window.innerHeight || 0;
  return sw > 8 && sh > 8 && sw < sh && sw <= 900;
}

function placementPlaneSize(refW, refH) {
  let planeW = refW;
  let planeH = refH;
  if (refW / refH > PLANE_ASPECT) planeW = refH * PLANE_ASPECT;
  else planeH = refW / PLANE_ASPECT;
  return { w: planeW * PLANE_FIT, h: planeH * PLANE_FIT };
}

/** Scale the desktop-sized room so the 3-bay case fits a portrait phone. */
function autoFitZoom() {
  if (!isMobilePortrait()) return 1;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const { w: camW, h: camH } = cameraBoxSize(sw, sh);
  const plane = placementPlaneSize(camW, camH);
  const units = state.units || [];
  let left = 100;
  let right = 0;
  let top = 100;
  let bottom = 0;
  units.forEach((u) => {
    left = Math.min(left, u.x);
    right = Math.max(right, u.x + u.w);
    top = Math.min(top, u.y);
    bottom = Math.max(bottom, u.y + u.h);
  });
  if (right <= left || bottom <= top) return 1;
  /* Wall scale (1.22) plus a little for 3D extrusion / perspective. */
  const caseW = plane.w * ((right - left) / 100) * 1.16;
  const caseH = plane.h * ((bottom - top) / 100) * 1.16;
  const availW = Math.max(200, sw - 28);
  const availH = Math.max(240, sh - 72);
  const zoomW = availW / Math.max(1, caseW);
  const zoomH = availH / Math.max(1, caseH);
  return clampZoom(Math.min(zoomW, zoomH, 1));
}

function relayout() {
  resetCameraBox();
  centerView();
  syncPlacementPlane();
  buildScene();
}

/**
 * Camera size comes from CSS (min 1280×720). --zoom fits portrait and pinch.
 * Do not CSS-scale a phone-sized room — that breaks perspective.
 */
function clampZoom(z) {
  const n = Number(z);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(n) ? n : 1));
}

function syncPortraitPinch() {
  const portrait = isMobilePortrait();
  if (lastPortrait !== null && lastPortrait !== portrait) {
    pinchScale = 1;
    pan.x = 0;
    pan.y = 0;
  }
  lastPortrait = portrait;
}

function resolvedZoom() {
  const fit = autoFitZoom();
  const maxScale = ZOOM_MAX / Math.max(ZOOM_MIN, fit);
  const minScale = ZOOM_MIN / Math.max(ZOOM_MIN, fit);
  pinchScale = Math.min(maxScale, Math.max(minScale, pinchScale));
  return clampZoom(fit * pinchScale);
}

function syncCameraFrame() {
  if (!stage || !sceneCamera || !world) return false;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw < 8 || sh < 8) return false;
  resetCameraBox();
  syncPortraitPinch();
  viewZoom = resolvedZoom();
  world.style.setProperty('--zoom', String(viewZoom));
  const { w: camW, h: camH } = cameraBoxSize(sw, sh);
  clampPan(sw, sh, camW * viewZoom, camH * viewZoom);
  applyPan();
  return true;
}

function applyViewZoom() {
  if (!world) return;
  syncPortraitPinch();
  viewZoom = resolvedZoom();
  world.style.setProperty('--zoom', String(viewZoom));
  const sw = stage?.clientWidth || window.innerWidth || SCENE_MIN_W;
  const sh = stage?.clientHeight || window.innerHeight || SCENE_MIN_H;
  const { w: camW, h: camH } = cameraBoxSize(sw, sh);
  clampPan(sw, sh, camW * viewZoom, camH * viewZoom);
  applyPan();
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
  if (!syncCameraFrame()) return false;
  if (!unitLayer || !stage) return false;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw < 8 || sh < 8) return false;

  const { w: refW, h: refH } = cameraBoxSize(sw, sh);
  const { w: planeW, h: planeH } = placementPlaneSize(refW, refH);

  unitLayer.style.width = `${Math.round(planeW)}px`;
  unitLayer.style.height = `${Math.round(planeH)}px`;
  unitLayer.style.left = '50%';
  unitLayer.style.top = '50%';
  unitLayer.style.right = 'auto';
  unitLayer.style.bottom = 'auto';
  unitLayer.style.transform = 'translate(-50%, -50%)';
  return true;
}

function unitsOnScreen() {
  if (!stage || !unitLayer) return false;
  const shelves = unitLayer.querySelectorAll('.px-shelf');
  if (!shelves.length) return false;
  const vr = stage.getBoundingClientRect();
  for (const el of shelves) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.right > vr.left + 2 && r.left < vr.right - 2 && r.bottom > vr.top + 2 && r.top < vr.bottom - 2) {
      return true;
    }
  }
  return false;
}

/** Retry until cases have a real on-screen box (mobile reload / late layout). */
function ensureSceneVisible(attempt = 0) {
  syncPlacementPlane();
  buildScene();
  void unitLayer?.offsetWidth;
  void sceneCamera?.offsetWidth;

  if (unitsOnScreen()) {
    if (attempt === 0) {
      setTimeout(() => ensureSceneVisible(1), 180);
    }
    return;
  }

  if (attempt >= 25) return;
  setTimeout(() => {
    resetCameraBox();
    centerView();
    ensureSceneVisible(attempt + 1);
  }, 60 + attempt * 40);
}

/** Layout box of the placement plane (not the 3D-projected AABB). */
function planeLayoutSize() {
  const w = unitLayer?.clientWidth || 0;
  const h = unitLayer?.clientHeight || 0;
  if (w > 0 && h > 0) return { w, h };
  const sw = stage?.clientWidth || window.innerWidth || SCENE_MIN_W;
  const sh = stage?.clientHeight || window.innerHeight || SCENE_MIN_H;
  const { w: refW, h: refH } = cameraBoxSize(sw, sh);
  return placementPlaneSize(refW, refH);
}

function sanitizeState(next = state) {
  if (!next?.units) return next;
  delete next.zoom;
  next.depth = clampDepth(next.depth);
  next.edges = clampEdges(next.edges);
  next.units.forEach((unit) => {
    if (!Array.isArray(unit.shelves)) unit.shelves = defaultShelves();
    if (unit.shelves.length > MAX_SHELVES) unit.shelves.length = MAX_SHELVES;
    while (unit.shelves.length < MIN_SHELVES) {
      unit.shelves.push({ id: uid('shelf'), weight: 1, books: 40, boxes: [] });
    }
    unit.shelves.forEach((s) => {
      const w = Number(s.weight);
      s.weight = Number.isFinite(w) && w > 0 ? w : 1;
      const books = Number(s.books);
      s.books = Math.min(56, Math.max(8, Number.isFinite(books) ? books : 40));
      if (!Array.isArray(s.boxes)) s.boxes = [];
      s.boxes = s.boxes.map((b, j) => ({
        id: b?.id || uid('box'),
        width: Math.min(0.35, Math.max(0.08, Number(b?.width) || 0.14)),
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
  if (VIEW_ONLY) return;
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

/**
 * How many shelves fit the current case height without growing it.
 * (Existing shelves are never removed if this is lower than the current count.)
 */
function maxShelvesForUnit(unit) {
  const hPx = caseHeightPx(unit);
  const byPixels = Math.max(1, Math.floor(hPx / MIN_SHELF_PX + 1e-4));
  return Math.min(MAX_SHELVES, byPixels);
}

/** Minimum case height (%) so every current shelf keeps at least MIN_SHELF_PX. */
function minHeightPctForShelves(count) {
  const n = Math.max(MIN_SHELVES, count || MIN_SHELVES);
  const layerH = planeLayoutSize().h;
  if (layerH > 0) {
    return Math.max(MIN_H, Math.min(MAX_H, ((n * MIN_SHELF_PX) / layerH) * 100));
  }
  // Fallback before layout: ~equal bays at a modest case height.
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
  // Count slider is always 1…MAX; size only blocks shrinking the case, not adding back.
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
  // Never demand more than an equal split when the case is too short for n×MIN_SHELF_PX
  // (ensureCaseFitsShelves should grow it; this keeps enforce/drag stable meanwhile).
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

  // Rebalance only when below the floor; always write share*n so exports stay stable.
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
  const available = Math.max(0.35, 1 - boxShare);
  return Math.max(8, Math.round(shelf.books * available));
}

/* ── Geometry / snap / collision ── */

/**
 * Hard size floors/ceilings only.
 * Does NOT apply the pixel shelf floor — that is viewport-dependent and would
 * ratchet case heights on every save/resize. Use minHeightPctForShelves when
 * the user is actively resizing or adding shelves.
 */
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
  const newShelfCount = 4; // matches defaultShelves()
  const minHForNew = minHeightPctForShelves(newShelfCount);
  const maxW = Math.min(anchor.w, MAX_W);
  const maxH = Math.max(minHForNew, Math.min(anchor.h, MAX_H));
  const sizes = [
    { w: maxW, h: maxH },
    { w: Math.max(MIN_W, maxW * 0.75), h: maxH },
    { w: Math.max(MIN_W, maxW * 0.55), h: maxH },
    { w: maxW, h: Math.max(minHForNew, maxH * 0.75) },
    { w: Math.max(MIN_W, maxW * 0.55), h: Math.max(minHForNew, maxH * 0.65) },
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

function bayJoinClasses(unit) {
  const sorted = [...state.units].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const i = sorted.findIndex((u) => u.id === unit.id);
  if (i < 0) return [];
  const close = (left, right) => Math.abs(left.x + left.w - right.x) < 1;
  const cls = [];
  if (sorted[i - 1] && close(sorted[i - 1], unit)) cls.push('is-bay-join-w');
  if (sorted[i + 1] && close(unit, sorted[i + 1])) cls.push('is-bay-join-e');
  return cls;
}

function buildUnitDom(unit, unitIndex) {
  const root = document.createElement('div');
  root.className = ['px-shelf', ...bayJoinClasses(unit)].join(' ');
  root.dataset.unitId = unit.id;
  root.style.left = `${unit.x}%`;
  root.style.top = `${unit.y}%`;
  root.style.width = `${unit.w}%`;
  root.style.height = `${unit.h}%`;
  root.style.setProperty('--shelf-d', `${state.depth}px`);
  root.style.setProperty('--frame-edge', `${state.edges}px`);
  root.style.setProperty('--wood-x', `${8 + ((unitIndex * 37) % 72)}%`);
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
  const motes = document.createElement('div');
  motes.className = 'case-motes';
  motes.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 8; i++) {
    const spec = document.createElement('i');
    spec.className = 'mote mote--case';
    spec.style.left = `${8 + ((i * 13 + unitIndex * 7) % 84)}%`;
    spec.style.top = `${10 + ((i * 19 + unitIndex * 11) % 78)}%`;
    spec.style.animationDelay = `${-(i * 1.35 + unitIndex * 0.8)}s`;
    spec.style.animationDuration = `${11 + (i % 4) * 2}s`;
    motes.appendChild(spec);
  }
  cavity?.appendChild(motes);
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
  return unitLayer?.querySelector(`.px-shelf[data-unit-id="${CSS.escape(id)}"]`) || null;
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
  if (!editOverlay || VIEW_ONLY) return;
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
  if (!editOverlay || !stage) return;
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
  if (!unitLayer) return;
  unitLayer.innerHTML = '';
  if (depthInput) depthInput.value = String(state.depth);
  if (depthOut) depthOut.textContent = String(state.depth);
  if (edgesInput) edgesInput.value = String(state.edges);
  if (edgesOut) edgesOut.textContent = String(state.edges);

  state.units.forEach((unit, i) => {
    clampUnitInPlane(unit);
    unitLayer.appendChild(buildUnitDom(unit, i));
  });

  state.units.forEach((unit) => {
    applyUnitGeometry(unit);
  });

  if (!VIEW_ONLY) {
    buildOverlayChrome();
    syncInspector();
  }
}

function syncInspector() {
  if (VIEW_ONLY || !weightInput || !booksInput || !countInput) return;
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
  if (VIEW_ONLY) return;
  editing = on;
  world?.classList.toggle('is-editing', on);
  btnEdit?.classList.toggle('is-active', on);
  btnEdit?.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (editPanel) editPanel.hidden = !on;
  if (!on) {
    selected = { type: null, unitId: null, shelfId: null, boxId: null };
    drag = null;
    if (editOverlay) {
      editOverlay.hidden = true;
      editOverlay.innerHTML = '';
    }
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
    const shelf = { id: uid('shelf'), weight: 1, books: 40, boxes: [] };
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
  if (!world) return;
  world.style.setProperty('--ry', `${current.x * 2.2}deg`);
  world.style.setProperty('--rx', `${current.y * -1.4}deg`);
  world.style.setProperty('--shift-x', `${current.x * 8}px`);
  world.style.setProperty('--shift-y', `${current.y * 4}px`);
  scheduleOverlaySync();
}

function canStartTouchPan(targetEl) {
  // On the viewer, any finger drag pans. In the studio, don't steal case edits.
  if (VIEW_ONLY || !editing) return true;
  return !targetEl?.closest?.(
    '.unit-pick, .unit-handle, .unit-move-bar, .edit-panel, .quiet-tools, .search-shell, .search-dock',
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
  world?.classList.add('is-panning');
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
  const sw = stage?.clientWidth || window.innerWidth || SCENE_MIN_W;
  const sh = stage?.clientHeight || window.innerHeight || SCENE_MIN_H;
  const { w: camW, h: camH } = cameraBoxSize(sw, sh);
  clampPan(sw, sh, camW * viewZoom, camH * viewZoom);
  applyPan();
  scheduleOverlaySync();
}

function endPanDrag(e) {
  if (!panDrag) return;
  if (e && panDrag.pointerId !== e.pointerId) return;
  panDrag = null;
  world?.classList.remove('is-panning');
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
    startScale: pinchScale,
  };
  world?.classList.add('is-panning');
  aim(0, 0);
}

function movePinch(touches) {
  if (!pinch || touches.length < 2) return;
  const dist = Math.max(1, touchDistance(touches[0], touches[1]));
  pinchScale = pinch.startScale * (dist / pinch.startDist);
  applyViewZoom();
}

function endPinch() {
  if (!pinch) return;
  pinch = null;
  world?.classList.remove('is-panning');
}

if (stage) {
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

  // Mobile-only pinch zoom (two-finger). Desktop keeps page/ctrl-wheel alone.
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

  // Prevent browser auto-scroll / paste from middle click.
  stage.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  stage.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
}

// Block double-tap-drag text selection of the whole scene.
document.addEventListener('selectstart', (e) => {
  if (e.target?.closest?.('input, textarea, .search-results')) return;
  e.preventDefault();
});

window.addEventListener('resize', () => {
  relayout();
});

window.addEventListener('pageshow', () => {
  relayout();
  ensureSceneVisible(0);
});

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    relayout();
    ensureSceneVisible(0);
  }
});

if (stage && typeof ResizeObserver !== 'undefined') {
  let lastSize = '';
  new ResizeObserver(() => {
    const key = `${stage.clientWidth}x${stage.clientHeight}`;
    if (key === lastSize || stage.clientWidth < 8) return;
    const first = !lastSize;
    lastSize = key;
    if (first) centerView();
    syncPlacementPlane();
    buildScene();
    if (!unitsOnScreen()) ensureSceneVisible(0);
  }).observe(stage);
}

/* Edit interaction listeners omitted — VIEW_ONLY bookshelf viewer. */
boot();
