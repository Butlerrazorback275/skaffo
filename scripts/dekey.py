"""Turn the chroma-key green in build/icons/*.png into real transparency.

The renderer has to paint on an opaque window (a transparent one segfaults
Chromium under headless X), so the page is painted #00FF00 and that colour is
removed here. Doing it in Pillow rather than in Electron because
nativeImage.toBitmap() returns a *copy* — mutating it silently does nothing,
which is how the first attempt shipped a green icon that looked fine in the
logs.
"""
from __future__ import annotations
import sys, math
from pathlib import Path
from PIL import Image

BUILD = Path(__file__).resolve().parents[1] / "build"
KEY = (0, 255, 0)


def dekey(path: Path) -> tuple[int, int]:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    cut = feathered = 0

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = math.dist((r, g, b), KEY)
            if d < 90:
                px[x, y] = (0, 0, 0, 0)
                cut += 1
            elif d < 210:
                # anti-aliased rim: fade alpha and pull the green tint out
                t = (d - 90) / 120
                # unmix toward the neighbouring plate colour rather than
                # toward green, otherwise the rim keeps a lime halo
                px[x, y] = (r, min(g, int((r + b) / 2)), b, int(255 * t))
                feathered += 1

    im.save(path)
    return cut, feathered


def main() -> int:
    targets = sorted((BUILD / "icons").glob("*.png")) + [BUILD / "icon.png"]
    for p in targets:
        if not p.exists():
            continue
        cut, feathered = dekey(p)
        im = Image.open(p).convert("RGBA")
        corner = im.getpixel((1, 1))[3]
        centre = im.getpixel((im.width // 2, im.height // 2))[3]
        ok = corner == 0 and centre == 255
        print(f"  {p.name:<16} cut={cut:<7} edge={feathered:<5} "
              f"corner_a={corner} centre_a={centre} {'✅' if ok else '❌'}")
        if not ok:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
