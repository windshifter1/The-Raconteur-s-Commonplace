import { useEffect, useRef, useState, type RefObject } from 'react';
import { SCENE } from './shelfLayout';

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.55;
const MAX_SCALE = 2.4;
const BASE = { x: 0, y: 0, scale: 1 };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function clampCamera(cam: CameraState, viewportW: number, viewportH: number): CameraState {
  const scale = clamp(cam.scale, MIN_SCALE, MAX_SCALE);
  const contentW = SCENE.width * scale;
  const contentH = SCENE.height * scale;

  // Allow a little overscroll so edges can sit comfortably in frame
  const padX = viewportW * 0.18;
  const padY = viewportH * 0.14;
  const minX = Math.min(padX, viewportW - contentW - padX);
  const maxX = Math.max(padX, viewportW - contentW + padX);
  const minY = Math.min(padY, viewportH - contentH - padY);
  const maxY = Math.max(padY, viewportH - contentH + padY);

  return {
    scale,
    x: clamp(cam.x, minX, maxX),
    y: clamp(cam.y, minY, maxY),
  };
}

function fitCamera(viewportW: number, viewportH: number): CameraState {
  if (viewportW <= 0 || viewportH <= 0) return BASE;
  const scale = clamp(
    Math.min(viewportW / SCENE.width, viewportH / SCENE.height) * 0.96,
    MIN_SCALE,
    MAX_SCALE,
  );
  const x = (viewportW - SCENE.width * scale) / 2;
  const y = (viewportH - SCENE.height * scale) / 2;
  return clampCamera({ x, y, scale }, viewportW, viewportH);
}

export function useCamera(viewportRef: RefObject<HTMLElement | null>) {
  const [camera, setCamera] = useState<CameraState>(BASE);
  const cameraRef = useRef(camera);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number } | null>(null);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const size = useRef({ w: 0, h: 0 });

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const apply = (next: CameraState) => {
      const clamped = clampCamera(next, size.current.w, size.current.h);
      cameraRef.current = clamped;
      setCamera(clamped);
    };

    const measure = () => {
      const rect = el.getBoundingClientRect();
      size.current = { w: rect.width, h: rect.height };
      apply(fitCamera(rect.width, rect.height));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cam = cameraRef.current;
      const factor = Math.exp(-e.deltaY * 0.00135);
      const nextScale = clamp(cam.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = nextScale / cam.scale;
      apply({
        scale: nextScale,
        x: mx - (mx - cam.x) * ratio,
        y: my - (my - cam.y) * ratio,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // Let interactive bays receive clicks without starting a pan
      if (target?.closest?.('.bay-hit')) return;

      el.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) {
        dragging.current = true;
        last.current = { x: e.clientX, y: e.clientY };
        pinch.current = null;
      } else if (pointers.current.size === 2) {
        dragging.current = false;
        const pts = [...pointers.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinch.current = {
          dist,
          scale: cameraRef.current.scale,
          cx: (pts[0].x + pts[1].x) / 2,
          cy: (pts[0].y + pts[1].y) / 2,
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && pinch.current) {
        const pts = [...pointers.current.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const rect = el.getBoundingClientRect();
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
        const nextScale = clamp(
          pinch.current.scale * (dist / Math.max(pinch.current.dist, 1)),
          MIN_SCALE,
          MAX_SCALE,
        );
        const cam = cameraRef.current;
        const ratio = nextScale / cam.scale;
        apply({
          scale: nextScale,
          x: cx - (cx - cam.x) * ratio,
          y: cy - (cy - cam.y) * ratio,
        });
        return;
      }

      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      const cam = cameraRef.current;
      apply({ ...cam, x: cam.x + dx, y: cam.y + dy });
    };

    const endPointer = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) dragging.current = false;
      if (pointers.current.size === 1) {
        const remaining = [...pointers.current.values()][0];
        dragging.current = true;
        last.current = { x: remaining.x, y: remaining.y };
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('lostpointercapture', endPointer);

    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('lostpointercapture', endPointer);
    };
  }, [viewportRef]);

  const resetCamera = () => {
    const { w, h } = size.current;
    setCamera(fitCamera(w, h));
  };

  return { camera, resetCamera };
}
