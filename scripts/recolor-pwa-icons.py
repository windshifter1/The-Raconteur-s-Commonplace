"""Replace near-black PWA icon backgrounds with a warm walnut wash."""
from __future__ import annotations

from collections import deque
from math import hypot
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"

# Cozy library walnut — center ember, edges deeper wood.
CENTER = (78, 51, 40)  # #4e3328
EDGE = (43, 26, 22)  # #2b1a16
THRESHOLD = 46

FILES = [
    "icon-192.png",
    "icon-512.png",
    "icon-512-maskable.png",
    "apple-touch-icon.png",
]


def dist(a, b) -> float:
    return hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])


def lerp(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def recolor(path: Path) -> None:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    sample = px[2, 2][:3]
    seen = [[False] * h for _ in range(w)]
    q = deque()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for x, y in seeds:
        q.append((x, y))
        seen[x][y] = True

    cx, cy = (w - 1) / 2, (h - 1) / 2
    maxd = hypot(cx, cy) or 1
    replaced = 0

    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        if a < 8 or dist((r, g, b), sample) > THRESHOLD:
            continue
        t = (hypot(x - cx, y - cy) / maxd) ** 1.35
        nr, ng, nb = lerp(CENTER, EDGE, t)
        px[x, y] = (nr, ng, nb, 255)
        replaced += 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny]:
                seen[nx][ny] = True
                q.append((nx, ny))

    img.save(path, "PNG")
    print(f"{path.name}: replaced {replaced} px, size {w}x{h}")


def main() -> None:
    for name in FILES:
        recolor(ICONS / name)


if __name__ == "__main__":
    main()
