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

export type PropKind = 'plant' | 'picture' | 'vase' | 'stack';

export interface DecorativeProp {
  key: VisualKey;
  kind: PropKind;
}

/** Scene coordinate system — viewBox units for the room illustration */
export const SCENE = {
  width: 1600,
  height: 1000,
  shelf: {
    x: 430,
    y: 160,
    width: 740,
    height: 680,
  },
} as const;

const ROWS = 5;
const COLS = 3;
const FRAME = 0.045;
const GAP_X = 0.018;
const GAP_Y = 0.02;

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
        label: `Bay R${row}C${col}`,
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

/** Fixed decorative props — visual only; do not replace catalogue spines */
export const DECORATIVE_PROPS: DecorativeProp[] = [
  { key: 'r1c1', kind: 'plant' },
  { key: 'r1c2', kind: 'picture' },
  { key: 'r1c3', kind: 'plant' },
  { key: 'r2c2', kind: 'vase' },
  { key: 'r3c2', kind: 'vase' },
  { key: 'r3c3', kind: 'stack' },
  { key: 'r4c2', kind: 'stack' },
  { key: 'r4c3', kind: 'picture' },
];

export function shelfVisualKey(shelf: {
  visual_key?: string | null;
  slug?: string | null;
}): VisualKey | null {
  const raw = (shelf.visual_key || shelf.slug || '').toLowerCase().trim();
  if (!raw) return null;
  return (BAY_BY_KEY as Record<string, BayRect>)[raw] ? (raw as VisualKey) : null;
}

/** Deterministic muted earth-tone spine palette from title/author */
const SPINE_PALETTE = [
  { face: '#4A5D4E', edge: '#2F3C32', text: '#F3EDE2' },
  { face: '#5C4033', edge: '#3A281F', text: '#F5EDE3' },
  { face: '#3E4A5C', edge: '#252E3A', text: '#EDE6DA' },
  { face: '#8B6F4E', edge: '#5C4832', text: '#FFF8EE' },
  { face: '#A56B4C', edge: '#6E4530', text: '#FFF6EC' },
  { face: '#6B5A45', edge: '#433628', text: '#F4EBDD' },
  { face: '#C9B89A', edge: '#8A7A62', text: '#2A2118' },
  { face: '#5A3A32', edge: '#3A241E', text: '#F2E6D8' },
  { face: '#3F5A4A', edge: '#26382E', text: '#E8F0E8' },
  { face: '#7A5C3A', edge: '#4E3A24', text: '#FFF4E4' },
];

export function spineColor(title: string, author: string) {
  const str = `${title}|${author}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return SPINE_PALETTE[Math.abs(hash) % SPINE_PALETTE.length];
}
