import type { Book, Shelf, VisualKey } from '../types';
import {
  BAY_BY_KEY,
  DECORATIVE_PROPS,
  SCENE,
  VISUAL_BAYS,
  shelfVisualKey,
  spineColor,
  type PropKind,
} from './shelfLayout';

interface Props {
  shelves: Shelf[];
  books: Book[];
  activeBay: VisualKey | null;
  onBayClick: (key: VisualKey) => void;
}

function WoodGrainDefs() {
  return (
    <defs>
      <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#F4EFE4" />
        <stop offset="55%" stopColor="#EDE4D4" />
        <stop offset="100%" stopColor="#E4D8C4" />
      </linearGradient>
      <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#A87848" />
        <stop offset="100%" stopColor="#7A4F2A" />
      </linearGradient>
      <linearGradient id="woodFace" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4A2F1C" />
        <stop offset="45%" stopColor="#3A2416" />
        <stop offset="100%" stopColor="#2A1810" />
      </linearGradient>
      <linearGradient id="woodHighlight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5C3A24" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#1E120C" stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id="curtainOuter" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#C4A77A" />
        <stop offset="50%" stopColor="#D8BE92" />
        <stop offset="100%" stopColor="#B89564" />
      </linearGradient>
      <linearGradient id="sheerGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#FFFCFA" stopOpacity="0.55" />
        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#FFFCFA" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="windowSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#D9E5EF" />
        <stop offset="100%" stopColor="#F0E4C8" />
      </linearGradient>
      <pattern id="grain" width="48" height="48" patternUnits="userSpaceOnUse">
        <rect width="48" height="48" fill="#3A2416" />
        <path
          d="M0 8 C12 6, 20 12, 36 7 S48 10, 48 10"
          stroke="#2A1810"
          strokeWidth="1.2"
          fill="none"
          opacity="0.45"
        />
        <path
          d="M0 22 C10 20, 24 26, 40 21 S48 24, 48 24"
          stroke="#5A3A24"
          strokeWidth="1"
          fill="none"
          opacity="0.28"
        />
        <path
          d="M0 36 C14 34, 22 40, 38 35 S48 38, 48 38"
          stroke="#24150E"
          strokeWidth="1.4"
          fill="none"
          opacity="0.35"
        />
      </pattern>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#1A1008" floodOpacity="0.28" />
      </filter>
      <filter id="bayGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#E8C98A" floodOpacity="0.55" />
      </filter>
    </defs>
  );
}

function CurtainPanel({
  side,
}: {
  side: 'left' | 'right';
}) {
  const isLeft = side === 'left';
  const x = isLeft ? 40 : 1320;
  const sheerX = isLeft ? 165 : 1285;
  const tieX = isLeft ? 175 : 1425;
  const foldDir = isLeft ? 1 : -1;

  return (
    <g className={`curtain curtain-${side}`}>
      {/* Outer champagne curtain */}
      <path
        d={
          isLeft
            ? `M${x} 70
               C ${x + 20} 180, ${x - 10} 320, ${x + 30} 480
               C ${x + 10} 620, ${x + 40} 760, ${x + 15} 900
               L ${x + 145} 900
               C ${x + 160} 760, ${x + 120} 620, ${x + 150} 480
               C ${x + 170} 320, ${x + 130} 180, ${x + 155} 70 Z`
            : `M${x + 155} 70
               C ${x + 130} 180, ${x + 170} 320, ${x + 150} 480
               C ${x + 120} 620, ${x + 160} 760, ${x + 145} 900
               L ${x + 15} 900
               C ${x + 40} 760, ${x + 10} 620, ${x + 30} 480
               C ${x - 10} 320, ${x + 20} 180, ${x} 70 Z`
        }
        fill="url(#curtainOuter)"
        opacity="0.95"
      />
      {/* Fold lines */}
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={`M${x + 35 + i * 28 * foldDir} 90
              C ${x + 40 + i * 28 * foldDir} 300,
                ${x + 25 + i * 28 * foldDir} 560,
                ${x + 38 + i * 28 * foldDir} 880`}
          stroke="#9A7A4E"
          strokeWidth="1.5"
          fill="none"
          opacity="0.35"
        />
      ))}
      {/* Sheer */}
      <path
        d={
          isLeft
            ? `M${sheerX} 95 L${sheerX + 95} 95
               C ${sheerX + 110} 280, ${sheerX + 70} 520, ${sheerX + 100} 780
               L ${sheerX + 20} 780
               C ${sheerX + 5} 520, ${sheerX + 35} 280, ${sheerX} 95 Z`
            : `M${sheerX - 95} 95 L${sheerX} 95
               C ${sheerX - 35} 280, ${sheerX - 5} 520, ${sheerX - 20} 780
               L ${sheerX - 100} 780
               C ${sheerX - 70} 520, ${sheerX - 110} 280, ${sheerX - 95} 95 Z`
        }
        fill="url(#sheerGrad)"
      />
      {/* Tie-back + gold tassel */}
      <ellipse cx={tieX} cy={430} rx="18" ry="10" fill="#C9A227" opacity="0.9" />
      <path
        d={`M${tieX} 438 Q ${tieX + 8 * foldDir} 470, ${tieX + 2 * foldDir} 510
            Q ${tieX - 6 * foldDir} 545, ${tieX + 4 * foldDir} 575`}
        stroke="#C9A227"
        strokeWidth="3"
        fill="none"
      />
      <circle cx={tieX + 4 * foldDir} cy={580} r="7" fill="#B8860B" />
      <path
        d={`M${tieX + 4 * foldDir} 587
            l -6 22 l 4 -2 l 2 18 l 2 -18 l 4 2 z`}
        fill="#DAA520"
      />
    </g>
  );
}

function WindowPane({ x }: { x: number }) {
  return (
    <g className="window-pane">
      <rect x={x} y={120} width={170} height={420} rx="6" fill="#6B5238" />
      <rect x={x + 12} y={134} width={146} height={392} rx="3" fill="url(#windowSky)" />
      <line x1={x + 85} y1={134} x2={x + 85} y2={526} stroke="#8A6A48" strokeWidth="6" />
      <line x1={x + 12} y1={330} x2={x + 158} y2={330} stroke="#8A6A48" strokeWidth="6" />
      <rect
        x={x + 18}
        y={140}
        width={55}
        height="70"
        fill="#FFFFFF"
        opacity="0.18"
        transform={`rotate(-8 ${x + 45} 175)`}
      />
    </g>
  );
}

function DecorativeProp({ kind, x, y, w, h }: { kind: PropKind; x: number; y: number; w: number; h: number }) {
  const cx = x + w / 2;
  const by = y + h;

  if (kind === 'plant') {
    return (
      <g className="prop prop-plant" opacity="0.92">
        <ellipse cx={cx} cy={by - 10} rx={w * 0.22} ry={8} fill="#2A1810" opacity="0.25" />
        <path
          d={`M${cx - 18} ${by - 12} Q ${cx} ${by - 28}, ${cx + 18} ${by - 12} L ${cx + 14} ${by - 4} L ${cx - 14} ${by - 4} Z`}
          fill="#8B5A3C"
        />
        <path d={`M${cx} ${by - 26} Q ${cx - 28} ${y + h * 0.35}, ${cx - 10} ${y + 16}`} stroke="#3F6B4A" strokeWidth="3" fill="none" />
        <path d={`M${cx} ${by - 26} Q ${cx + 30} ${y + h * 0.3}, ${cx + 12} ${y + 14}`} stroke="#4F7A55" strokeWidth="3" fill="none" />
        <ellipse cx={cx - 14} cy={y + 22} rx="16" ry="10" fill="#5C8A62" />
        <ellipse cx={cx + 16} cy={y + 20} rx="14" ry="9" fill="#6B9A6E" />
        <ellipse cx={cx + 2} cy={y + 34} rx="12" ry="8" fill="#4A7550" />
      </g>
    );
  }

  if (kind === 'picture') {
    const pw = w * 0.55;
    const ph = h * 0.62;
    const px = cx - pw / 2;
    const py = y + h * 0.18;
    return (
      <g className="prop prop-picture">
        <rect x={px - 4} y={py - 4} width={pw + 8} height={ph + 8} fill="#C9A227" rx="2" />
        <rect x={px} y={py} width={pw} height={ph} fill="#E8D9B8" />
        <path
          d={`M${px + 8} ${py + ph - 10}
              Q ${px + pw * 0.35} ${py + ph * 0.45}, ${px + pw * 0.55} ${py + ph * 0.55}
              T ${px + pw - 8} ${py + ph * 0.35}`}
          stroke="#6B8A72"
          strokeWidth="3"
          fill="none"
        />
        <circle cx={px + pw * 0.72} cy={py + ph * 0.28} r="7" fill="#E8C98A" />
      </g>
    );
  }

  if (kind === 'vase') {
    return (
      <g className="prop prop-vase">
        <ellipse cx={cx} cy={by - 8} rx={w * 0.18} ry={6} fill="#2A1810" opacity="0.2" />
        <path
          d={`M${cx - 16} ${by - 14}
              C ${cx - 22} ${by - 40}, ${cx - 10} ${y + h * 0.45}, ${cx - 8} ${y + h * 0.35}
              L ${cx + 8} ${y + h * 0.35}
              C ${cx + 10} ${y + h * 0.45}, ${cx + 22} ${by - 40}, ${cx + 16} ${by - 14} Z`}
          fill="#8E6A4E"
        />
        <ellipse cx={cx} cy={y + h * 0.35} rx="10" ry="4" fill="#A98462" />
        <path d={`M${cx} ${y + h * 0.34} Q ${cx - 18} ${y + 20}, ${cx - 6} ${y + 12}`} stroke="#7A4A5A" strokeWidth="2" fill="none" />
        <path d={`M${cx} ${y + h * 0.34} Q ${cx + 16} ${y + 18}, ${cx + 8} ${y + 10}`} stroke="#C46B6B" strokeWidth="2" fill="none" />
        <circle cx={cx - 6} cy={y + 12} r="4" fill="#C46B6B" />
        <circle cx={cx + 8} cy={y + 10} r="3.5" fill="#D88A8A" />
      </g>
    );
  }

  // stack
  const colors = ['#5C4033', '#3E4A5C', '#8B6F4E', '#A56B4C'];
  return (
    <g className="prop prop-stack">
      {colors.map((c, i) => {
        const bh = 11;
        const bw = w * (0.62 - i * 0.04);
        return (
          <rect
            key={c}
            x={cx - bw / 2}
            y={by - 16 - i * (bh + 2)}
            width={bw}
            height={bh}
            rx="1.5"
            fill={c}
          />
        );
      })}
    </g>
  );
}

function BaySpines({
  books,
  x,
  y,
  w,
  h,
}: {
  books: Book[];
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  if (!books.length) return null;
  const max = Math.min(books.length, 14);
  const shown = books.slice(0, max);
  const marginX = w * 0.08;
  const marginBottom = h * 0.1;
  const available = w - marginX * 2;
  const spineW = Math.min(14, Math.max(6, available / shown.length - 1.5));
  const totalW = shown.length * spineW + (shown.length - 1) * 1.5;
  let cursor = x + marginX + Math.max(0, (available - totalW) / 2);

  return (
    <g className="bay-spines">
      {shown.map((book) => {
        const color = spineColor(book.title, book.author);
        const height = h * (0.55 + ((book.title.length + book.author.length) % 5) * 0.06);
        const sx = cursor;
        const sy = y + h - marginBottom - height;
        cursor += spineW + 1.5;
        const label = book.title.length > 18 ? `${book.title.slice(0, 16)}…` : book.title;
        return (
          <g key={book.id} className="spine">
            <rect x={sx} y={sy} width={spineW} height={height} rx="1.2" fill={color.face} />
            <rect x={sx} y={sy} width={2} height={height} fill={color.edge} opacity="0.7" />
            <rect
              x={sx + 1}
              y={sy + 4}
              width={Math.max(1, spineW - 2)}
              height={2}
              fill={color.text}
              opacity="0.35"
            />
            {spineW >= 9 && (
              <text
                x={sx + spineW / 2}
                y={sy + height / 2}
                fill={color.text}
                fontSize="7.5"
                fontFamily="Fraunces, Georgia, serif"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(-90 ${sx + spineW / 2} ${sy + height / 2})`}
                opacity="0.9"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function BookshelfScene({ shelves, books, activeBay, onBayClick }: Props) {
  const shelfByKey = new Map<string, Shelf>();
  for (const shelf of shelves) {
    const key = shelfVisualKey(shelf);
    if (key) shelfByKey.set(key, shelf);
  }

  const booksByBay = new Map<VisualKey, Book[]>();
  for (const bay of VISUAL_BAYS) booksByBay.set(bay.key, []);
  for (const book of books) {
    if (!book.shelf_id) continue;
    const shelf = shelves.find((s) => s.id === book.shelf_id);
    if (!shelf) continue;
    const key = shelfVisualKey(shelf);
    if (!key) continue;
    booksByBay.get(key)?.push(book);
  }

  const propByKey = new Map(DECORATIVE_PROPS.map((p) => [p.key, p.kind]));
  const { x: sx, y: sy, width: sw, height: sh } = SCENE.shelf;

  return (
    <svg
      className="room-scene"
      viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
      width={SCENE.width}
      height={SCENE.height}
      role="img"
      aria-label="Bookshelf room"
    >
      <WoodGrainDefs />

      {/* Wall */}
      <rect width={SCENE.width} height={SCENE.height} fill="url(#wallGrad)" />
      <rect width={SCENE.width} height={SCENE.height} fill="#F2EADF" opacity="0.15" />

      {/* Soft wall paneling suggestion */}
      <g opacity="0.12" stroke="#8A7355" strokeWidth="1">
        <line x1="280" y1="80" x2="280" y2="820" />
        <line x1="1320" y1="80" x2="1320" y2="820" />
      </g>

      {/* Floor */}
      <path
        d={`M0 820 L ${SCENE.width} 820 L ${SCENE.width} ${SCENE.height} L 0 ${SCENE.height} Z`}
        fill="url(#floorGrad)"
      />
      {Array.from({ length: 14 }).map((_, i) => (
        <line
          key={i}
          x1={i * 120}
          y1="820"
          x2={i * 120 - 80}
          y2={SCENE.height}
          stroke="#5C3A22"
          strokeWidth="2"
          opacity="0.18"
        />
      ))}
      <rect x="0" y="818" width={SCENE.width} height="6" fill="#6B4528" opacity="0.35" />

      {/* Windows */}
      <WindowPane x={95} />
      <WindowPane x={1335} />

      {/* Curtains */}
      <CurtainPanel side="left" />
      <CurtainPanel side="right" />

      {/* Bookshelf body */}
      <g className="bookshelf" filter="url(#softShadow)">
        {/* Side depth */}
        <path
          d={`M${sx - 28} ${sy + 18}
              L ${sx} ${sy}
              L ${sx} ${sy + sh}
              L ${sx - 28} ${sy + sh + 22} Z`}
          fill="#2A1810"
        />
        <path
          d={`M${sx + sw} ${sy}
              L ${sx + sw + 28} ${sy + 18}
              L ${sx + sw + 28} ${sy + sh + 22}
              L ${sx + sw} ${sy + sh} Z`}
          fill="#24150E"
        />
        {/* Top depth */}
        <path
          d={`M${sx - 28} ${sy + 18}
              L ${sx + sw + 28} ${sy + 18}
              L ${sx + sw} ${sy}
              L ${sx} ${sy} Z`}
          fill="#4A2F1C"
        />

        {/* Main face */}
        <rect x={sx} y={sy} width={sw} height={sh} fill="url(#grain)" rx="4" />
        <rect x={sx} y={sy} width={sw} height={sh} fill="url(#woodHighlight)" rx="4" />
        <rect
          x={sx + 8}
          y={sy + 8}
          width={sw - 16}
          height={sh - 16}
          fill="none"
          stroke="#5C3A24"
          strokeWidth="3"
          opacity="0.45"
          rx="2"
        />

        {/* Crown molding */}
        <rect x={sx - 12} y={sy - 22} width={sw + 24} height="22" fill="#3A2416" rx="2" />
        <rect x={sx - 18} y={sy - 30} width={sw + 36} height="10" fill="#4A2F1C" rx="2" />

        {/* Base */}
        <rect x={sx - 16} y={sy + sh} width={sw + 32} height="28" fill="#2A1810" rx="2" />
        <rect x={sx - 22} y={sy + sh + 24} width={sw + 44} height="14" fill="#1E120C" rx="2" />

        {/* Bays */}
        {VISUAL_BAYS.map((bay) => {
          const bx = sx + bay.x * sw;
          const by = sy + bay.y * sh;
          const bw = bay.w * sw;
          const bh = bay.h * sh;
          const active = activeBay === bay.key;
          const shelf = shelfByKey.get(bay.key);
          const bayBooks = booksByBay.get(bay.key) || [];
          const prop = propByKey.get(bay.key);

          return (
            <g
              key={bay.key}
              className={`bay${active ? ' is-active' : ''}`}
              transform={`translate(0,0)`}
              filter={active ? 'url(#bayGlow)' : undefined}
            >
              {/* Inner recess */}
              <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                fill="#1A100A"
                opacity="0.55"
                rx="2"
              />
              <rect
                x={bx + 3}
                y={by + 3}
                width={bw - 6}
                height={bh - 6}
                fill="#2E1C12"
                opacity="0.65"
                rx="1.5"
              />
              {/* Shelf ledge */}
              <rect
                x={bx + 2}
                y={by + bh - 8}
                width={bw - 4}
                height="7"
                fill="#4A2F1C"
                opacity="0.85"
              />

              {prop && <DecorativeProp kind={prop} x={bx} y={by} w={bw} h={bh} />}
              <BaySpines books={bayBooks} x={bx} y={by} w={bw} h={bh} />

              <rect
                className="bay-hit"
                x={bx}
                y={by}
                width={bw}
                height={bh}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={`${shelf?.name || bay.label}${bayBooks.length ? `, ${bayBooks.length} books` : ''}`}
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

        {/* Vertical dividers / shelf boards for wood structure */}
        {[1, 2].map((col) => {
          const bay = BAY_BY_KEY[`r1c${col}` as VisualKey];
          const next = BAY_BY_KEY[`r1c${col + 1}` as VisualKey];
          const mid = sx + ((bay.x + bay.w + next.x) / 2) * sw;
          return (
            <rect
              key={`v-${col}`}
              x={mid - 7}
              y={sy + SCENE.shelf.height * 0.04}
              width="14"
              height={sh * 0.92}
              fill="url(#woodFace)"
              opacity="0.95"
              pointerEvents="none"
            />
          );
        })}
        {[1, 2, 3, 4].map((row) => {
          const bay = BAY_BY_KEY[`r${row}c1` as VisualKey];
          const next = BAY_BY_KEY[`r${row + 1}c1` as VisualKey];
          const mid = sy + ((bay.y + bay.h + next.y) / 2) * sh;
          return (
            <rect
              key={`h-${row}`}
              x={sx + sw * 0.035}
              y={mid - 6}
              width={sw * 0.93}
              height="12"
              fill="#3A2416"
              opacity="0.95"
              pointerEvents="none"
            />
          );
        })}
      </g>

      {/* Soft ambient light from windows */}
      <ellipse cx="180" cy="340" rx="140" ry="220" fill="#FFF6E0" opacity="0.08" />
      <ellipse cx="1420" cy="340" rx="140" ry="220" fill="#FFF6E0" opacity="0.08" />
    </svg>
  );
}
