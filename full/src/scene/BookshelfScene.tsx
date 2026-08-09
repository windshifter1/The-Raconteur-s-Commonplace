import type { Shelf, VisualKey } from '../types';
import { BAY_BY_KEY, SCENE, VISUAL_BAYS, shelfVisualKey } from './shelfLayout';

interface Props {
  shelves: Shelf[];
  activeBay: VisualKey | null;
  onBayClick: (key: VisualKey) => void;
}

/** Dark walnut from the photograph — used only for the bookshelf. */
const WOOD = {
  face: '#3A2416',
  mid: '#4A2F1C',
  deep: '#2A1810',
  edge: '#1E120C',
  highlight: '#5A3A24',
  recess: '#2E1C12',
  recessBack: '#24160E',
};

function SceneDefs() {
  return (
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FAFAF8" />
        <stop offset="100%" stopColor="#F3F1EC" />
      </linearGradient>
      <linearGradient id="floorPlank" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C4A06A" />
        <stop offset="100%" stopColor="#A67C45" />
      </linearGradient>
      <pattern id="walnutGrain" width="36" height="56" patternUnits="userSpaceOnUse">
        <rect width="36" height="56" fill={WOOD.face} />
        <path
          d="M2 4 C10 8, 14 18, 12 30 S6 48, 10 54"
          stroke={WOOD.deep}
          strokeWidth="1.1"
          fill="none"
          opacity="0.35"
        />
        <path
          d="M20 0 C26 12, 22 24, 28 36 S24 50, 26 56"
          stroke={WOOD.highlight}
          strokeWidth="0.9"
          fill="none"
          opacity="0.22"
        />
        <path
          d="M32 6 C30 20, 34 32, 30 46"
          stroke={WOOD.edge}
          strokeWidth="0.8"
          fill="none"
          opacity="0.28"
        />
      </pattern>
      <linearGradient id="sheer" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="drape" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#B89564" />
        <stop offset="45%" stopColor="#D2B888" />
        <stop offset="100%" stopColor="#A88455" />
      </linearGradient>
      <linearGradient id="windowLite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E8EEF2" />
        <stop offset="100%" stopColor="#F5EBD8" />
      </linearGradient>
      <filter id="shelfShadow" x="-8%" y="-4%" width="116%" height="112%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#1A120C" floodOpacity="0.18" />
      </filter>
    </defs>
  );
}

function CurtainRod({ x, width }: { x: number; width: number }) {
  return (
    <g className="curtain-rod">
      <line
        x1={x}
        y1={108}
        x2={x + width}
        y2={108}
        stroke="#4A3424"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx={x} cy={108} r="7" fill="#3A2818" />
      <circle cx={x + width} cy={108} r="7" fill="#3A2818" />
    </g>
  );
}

function WindowWithCurtains({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left';
  const winX = isLeft ? 118 : 1312;
  const winW = 170;
  const winY = 130;
  const winH = 520;
  const rodX = winX - 28;
  const rodW = winW + 56;

  // Tied-back outer drape (hourglass silhouette from the vector)
  const drapePath = isLeft
    ? `M${rodX + 8} 118
       C ${rodX + 4} 200, ${rodX - 6} 280, ${rodX + 22} 360
       C ${rodX + 48} 420, ${rodX + 38} 470, ${rodX + 18} 520
       C ${rodX - 2} 590, ${rodX + 12} 680, ${rodX + 6} 760
       L ${rodX + 78} 760
       C ${rodX + 88} 680, ${rodX + 70} 590, ${rodX + 92} 520
       C ${rodX + 112} 470, ${rodX + 102} 420, ${rodX + 78} 360
       C ${rodX + 48} 280, ${rodX + 58} 200, ${rodX + 72} 118 Z`
    : `M${rodX + rodW - 72} 118
       C ${rodX + rodW - 58} 200, ${rodX + rodW - 48} 280, ${rodX + rodW - 78} 360
       C ${rodX + rodW - 102} 420, ${rodX + rodW - 112} 470, ${rodX + rodW - 92} 520
       C ${rodX + rodW - 70} 590, ${rodX + rodW - 88} 680, ${rodX + rodW - 78} 760
       L ${rodX + rodW - 6} 760
       C ${rodX + rodW - 12} 680, ${rodX + rodW + 2} 590, ${rodX + rodW - 18} 520
       C ${rodX + rodW - 38} 470, ${rodX + rodW - 48} 420, ${rodX + rodW - 22} 360
       C ${rodX + rodW + 6} 280, ${rodX + rodW - 4} 200, ${rodX + rodW - 8} 118 Z`;

  const sheerPath = isLeft
    ? `M${winX + 8} 122 L${winX + winW - 10} 122
       C ${winX + winW + 4} 300, ${winX + winW - 20} 480, ${winX + winW - 6} 700
       L ${winX + 18} 700
       C ${winX - 4} 480, ${winX + 22} 300, ${winX + 8} 122 Z`
    : `M${winX + 10} 122 L${winX + winW - 8} 122
       C ${winX + winW - 22} 300, ${winX + winW + 4} 480, ${winX + winW - 18} 700
       L ${winX + 6} 700
       C ${winX + 20} 480, ${winX - 4} 300, ${winX + 10} 122 Z`;

  const tieX = isLeft ? winX + 42 : winX + winW - 42;
  const tieDir = isLeft ? 1 : -1;

  return (
    <g className={`window-unit window-${side}`}>
      {/* Frame */}
      <rect x={winX} y={winY} width={winW} height={winH} fill="#6B5340" rx="3" />
      <rect
        x={winX + 10}
        y={winY + 12}
        width={winW - 20}
        height={winH - 24}
        fill="url(#windowLite)"
      />
      <line
        x1={winX + winW / 2}
        y1={winY + 12}
        x2={winX + winW / 2}
        y2={winY + winH - 12}
        stroke="#8A7058"
        strokeWidth="5"
      />
      <line
        x1={winX + 10}
        y1={winY + winH / 2}
        x2={winX + winW - 10}
        y2={winY + winH / 2}
        stroke="#8A7058"
        strokeWidth="5"
      />

      <CurtainRod x={rodX} width={rodW} />

      {/* Sheer under-layer */}
      <path d={sheerPath} fill="url(#sheer)" />

      {/* Outer tied drape */}
      <path d={drapePath} fill="url(#drape)" />
      {/* Soft fold lines */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={
            isLeft
              ? `M${rodX + 24 + i * 16} 130 C ${rodX + 18 + i * 14} 320, ${rodX + 30 + i * 14} 520, ${rodX + 22 + i * 12} 740`
              : `M${rodX + rodW - 24 - i * 16} 130 C ${rodX + rodW - 18 - i * 14} 320, ${rodX + rodW - 30 - i * 14} 520, ${rodX + rodW - 22 - i * 12} 740`
          }
          stroke="#8E7348"
          strokeWidth="1.2"
          fill="none"
          opacity="0.28"
        />
      ))}

      {/* Tie-back + gold tassel */}
      <ellipse cx={tieX} cy={428} rx="16" ry="9" fill="#C9A227" />
      <path
        d={`M${tieX} 436
            Q ${tieX + 10 * tieDir} 468, ${tieX + 3 * tieDir} 505
            Q ${tieX - 5 * tieDir} 538, ${tieX + 4 * tieDir} 568`}
        stroke="#C9A227"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={tieX + 4 * tieDir} cy={572} r="5.5" fill="#B8860B" />
      <path
        d={`M${tieX + 4 * tieDir} 578
            l -5 16 l 3.5 -1.5 l 1.5 14 l 1.5 -14 l 3.5 1.5 z`}
        fill="#DAA520"
      />
    </g>
  );
}

function Floor() {
  const y = SCENE.floorY;
  const planks = 11;
  const h = (SCENE.height - y) / planks;

  return (
    <g className="floor">
      <rect x="0" y={y} width={SCENE.width} height={SCENE.height - y} fill="#A67C45" />
      {Array.from({ length: planks }).map((_, i) => (
        <rect
          key={i}
          x="0"
          y={y + i * h}
          width={SCENE.width}
          height={h - 1.5}
          fill="url(#floorPlank)"
          opacity={i % 2 === 0 ? 1 : 0.92}
        />
      ))}
      {Array.from({ length: planks }).map((_, i) => (
        <line
          key={`seam-${i}`}
          x1="0"
          y1={y + (i + 1) * h}
          x2={SCENE.width}
          y2={y + (i + 1) * h}
          stroke="#7A5630"
          strokeWidth="1.2"
          opacity="0.35"
        />
      ))}
      <rect x="0" y={y} width={SCENE.width} height="3" fill="#8A6238" opacity="0.4" />
    </g>
  );
}

export function BookshelfScene({ shelves, activeBay, onBayClick }: Props) {
  const shelfByKey = new Map<string, Shelf>();
  for (const shelf of shelves) {
    const key = shelfVisualKey(shelf);
    if (key) shelfByKey.set(key, shelf);
  }

  const { x: sx, y: sy, width: sw, height: sh } = SCENE.shelf;
  const frame = sw * 0.055;
  const gapX = sw * 0.028;
  const gapY = sh * 0.024;

  return (
    <svg
      className="room-scene"
      viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
      width={SCENE.width}
      height={SCENE.height}
      role="img"
      aria-label="Home library room with empty bookshelf"
    >
      <SceneDefs />

      {/* Wall */}
      <rect width={SCENE.width} height={SCENE.height} fill="url(#wall)" />

      {/* Ceiling / wall vent above shelf (vector detail) */}
      <rect
        x={sx + sw * 0.22}
        y={48}
        width={sw * 0.56}
        height="10"
        rx="2"
        fill="#E4E0D8"
        stroke="#D0CBC0"
        strokeWidth="1"
      />
      <line
        x1={sx + sw * 0.25}
        y1={53}
        x2={sx + sw * 0.75}
        y2={53}
        stroke="#C8C2B6"
        strokeWidth="1.5"
        strokeDasharray="6 5"
        opacity="0.85"
      />

      <Floor />

      <WindowWithCurtains side="left" />
      <WindowWithCurtains side="right" />

      {/* Bookshelf — dark walnut, empty 3×5 grid */}
      <g className="bookshelf" filter="url(#shelfShadow)">
        {/* Subtle side depth for 2.5D */}
        <path
          d={`M${sx - 14} ${sy + 10} L${sx} ${sy} L${sx} ${sy + sh} L${sx - 14} ${sy + sh + 12} Z`}
          fill={WOOD.edge}
        />
        <path
          d={`M${sx + sw} ${sy} L${sx + sw + 14} ${sy + 10} L${sx + sw + 14} ${sy + sh + 12} L${sx + sw} ${sy + sh} Z`}
          fill={WOOD.deep}
        />
        <path
          d={`M${sx - 14} ${sy + 10} L${sx + sw + 14} ${sy + 10} L${sx + sw} ${sy} L${sx} ${sy} Z`}
          fill={WOOD.mid}
        />

        {/* Main face */}
        <rect x={sx} y={sy} width={sw} height={sh} fill="url(#walnutGrain)" />

        {/* Crown */}
        <rect x={sx - 10} y={sy - 16} width={sw + 20} height="16" fill={WOOD.mid} />
        <rect x={sx - 16} y={sy - 22} width={sw + 32} height="8" fill={WOOD.highlight} />

        {/* Baseboard resting on floor */}
        <rect x={sx - 12} y={sy + sh} width={sw + 24} height="18" fill={WOOD.deep} />
        <rect x={sx - 18} y={sy + sh + 16} width={sw + 36} height="10" fill={WOOD.edge} />

        {/* Empty bays + click targets */}
        {VISUAL_BAYS.map((bay) => {
          const bx = sx + bay.x * sw;
          const by = sy + bay.y * sh;
          const bw = bay.w * sw;
          const bh = bay.h * sh;
          const active = activeBay === bay.key;
          const shelf = shelfByKey.get(bay.key);

          return (
            <g key={bay.key} className={`bay${active ? ' is-active' : ''}`}>
              {/* Recessed empty compartment */}
              <rect x={bx} y={by} width={bw} height={bh} fill={WOOD.recessBack} />
              {/* Soft inner rim */}
              <rect
                x={bx + 2}
                y={by + 2}
                width={bw - 4}
                height={bh - 4}
                fill={WOOD.recess}
                opacity="0.55"
              />
              {/* Floor of bay */}
              <rect
                x={bx + 1}
                y={by + bh - 7}
                width={bw - 2}
                height="6"
                fill={WOOD.mid}
                opacity="0.9"
              />

              <rect
                className="bay-hit"
                x={bx}
                y={by}
                width={bw}
                height={bh}
                fill={active ? 'rgba(232, 210, 160, 0.12)' : 'transparent'}
                role="button"
                tabIndex={0}
                aria-label={shelf?.name || bay.label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onBayClick(bay.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onBayClick(bay.key);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
            </g>
          );
        })}

        {/* Structural dividers drawn above recesses for clean grid */}
        {[1, 2].map((col) => {
          const left = BAY_BY_KEY[`r1c${col}` as VisualKey];
          const right = BAY_BY_KEY[`r1c${col + 1}` as VisualKey];
          const mid = sx + ((left.x + left.w + right.x) / 2) * sw;
          return (
            <rect
              key={`v-${col}`}
              x={mid - gapX / 2}
              y={sy + frame * 0.35}
              width={gapX}
              height={sh - frame * 0.7}
              fill="url(#walnutGrain)"
              pointerEvents="none"
            />
          );
        })}
        {[1, 2, 3, 4].map((row) => {
          const top = BAY_BY_KEY[`r${row}c1` as VisualKey];
          const bottom = BAY_BY_KEY[`r${row + 1}c1` as VisualKey];
          const mid = sy + ((top.y + top.h + bottom.y) / 2) * sh;
          return (
            <rect
              key={`h-${row}`}
              x={sx + frame * 0.35}
              y={mid - gapY / 2}
              width={sw - frame * 0.7}
              height={gapY}
              fill="url(#walnutGrain)"
              pointerEvents="none"
            />
          );
        })}

        {/* Outer frame overlay for crisp edges */}
        <rect
          x={sx}
          y={sy}
          width={sw}
          height={sh}
          fill="none"
          stroke={WOOD.deep}
          strokeWidth="3"
          pointerEvents="none"
        />
      </g>

      {/* Soft window light */}
      <ellipse cx="200" cy="360" rx="120" ry="200" fill="#FFF8EC" opacity="0.06" />
      <ellipse cx="1400" cy="360" rx="120" ry="200" fill="#FFF8EC" opacity="0.06" />
    </svg>
  );
}
