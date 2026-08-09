import type { VisualKey } from '../types';

export interface BayRect {
  key: VisualKey;
  row: number;
  col: number;
  /** Relative position inside the bookshelf face (0–1) */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

/**
 * Scene coordinates matching the vector room composition:
 * centered 3×5 bookshelf, flanking windows, floor band.
 */
export const SCENE = {
  width: 1600,
  height: 1000,
  shelf: {
    x: 455,
    y: 95,
    width: 690,
    height: 725,
  },
  floorY: 820,
} as const;

const ROWS = 5;
const COLS = 3;
/** Outer frame thickness relative to shelf face */
const FRAME = 0.055;
const GAP_X = 0.028;
const GAP_Y = 0.024;

function bayKey(row: number, col: number): VisualKey {
  return `r${row}c${col}` as VisualKey;
}

function buildBays(): BayRect[] {
  const bays: BayRect[] = [];
  const innerW = 1 - FRAME * 2;
  const innerH = 1 - FRAME * 2;
  const cellW = (innerW - GAP_X * (COLS - 1)) / COLS;
  const cellH = (innerH - GAP_Y * (ROWS - 1)) / ROWS;

  for (let row = 1; row <= ROWS; row++) {
    for (let col = 1; col <= COLS; col++) {
      const x = FRAME + (col - 1) * (cellW + GAP_X);
      const y = FRAME + (row - 1) * (cellH + GAP_Y);
      bays.push({
        key: bayKey(row, col),
        row,
        col,
        x,
        y,
        w: cellW,
        h: cellH,
        label: `Row ${row}, column ${col}`,
      });
    }
  }
  return bays;
}

export const VISUAL_BAYS: BayRect[] = buildBays();

export const BAY_BY_KEY: Record<VisualKey, BayRect> = VISUAL_BAYS.reduce(
  (acc, bay) => {
    acc[bay.key] = bay;
    return acc;
  },
  {} as Record<VisualKey, BayRect>,
);

export function shelfVisualKey(shelf: {
  visual_key?: string | null;
  slug?: string | null;
}): VisualKey | null {
  const raw = (shelf.visual_key || shelf.slug || '').toLowerCase().trim();
  if (!raw) return null;
  return (BAY_BY_KEY as Record<string, BayRect>)[raw] ? (raw as VisualKey) : null;
}
