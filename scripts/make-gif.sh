#!/usr/bin/env bash
# Turn demo-frames/*.png into a README GIF and an MP4.
#
#   ./scripts/make-gif.sh
#
# Two outputs because they serve different jobs:
#   docs/demo.gif  — plays inline on GitHub with no click. Must stay small:
#                    GitHub will not render an image over ~10 MB in a README,
#                    and a heavy GIF is the thing people scroll past.
#   docs/demo.mp4  — full quality, for a release page or a link.
#
# The GIF uses a two-pass palette (palettegen/paletteuse). A single-pass GIF
# of a dark UI produces visible banding on the gradients, which makes a
# careful design look cheap.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRAMES="$ROOT/demo-frames"
OUT="$ROOT/docs"
FPS_IN=10          # must match FPS in record-demo.cjs
FPS_GIF=10
# Play back faster than recorded. Driving a UI takes real time, but a viewer
# only needs to follow it — 1.4x keeps captions readable while cutting a
# minute-long capture to something people actually finish.
SPEED=1.4
WIDTH_GIF=900      # 1280 is wasteful in a README column

[ -d "$FRAMES" ] || { echo "no frames — run record-demo.cjs first"; exit 1; }
mkdir -p "$OUT"

echo "frames: $(ls "$FRAMES"/f*.png | wc -l)"

# ── drop dead time ──
# The recorder captures at a fixed cadence, so page reloads and engine waits
# show up as long runs of identical frames. Those are pure dead air in a GIF.
# Runs of unchanged frames are capped (not removed entirely — captions still
# need to sit still long enough to read).
SELECTED="$(mktemp -d)/frames"
mkdir -p "$SELECTED"
python3 - "$FRAMES" "$SELECTED" <<'PYEOF'
import sys, hashlib, shutil
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
MAX_STATIC = 10          # ~1s of stillness is plenty once sped up

frames = sorted(src.glob("f*.png"))
kept, run, prev = 0, 0, None
for f in frames:
    h = hashlib.md5(f.read_bytes()).hexdigest()
    run = run + 1 if h == prev else 0
    prev = h
    if run >= MAX_STATIC:
        continue
    shutil.copy2(f, dst / f"f{kept:05d}.png")
    kept += 1
print(f"  kept {kept}/{len(frames)} frames ({len(frames)-kept} static frames dropped)")
PYEOF
FRAMES="$SELECTED"

# ── MP4 (full size, good quality) ──
ffmpeg -y -loglevel error \
  -framerate "$FPS_IN" -pattern_type glob -i "$FRAMES/f*.png" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow \
  -vf "setpts=PTS/$SPEED,scale=1280:-2" \
  "$OUT/demo.mp4"
echo "  demo.mp4  $(du -h "$OUT/demo.mp4" | cut -f1)"

# ── GIF (two-pass palette) ──
PAL="$(mktemp -d)/palette.png"
ffmpeg -y -loglevel error \
  -framerate "$FPS_IN" -pattern_type glob -i "$FRAMES/f*.png" \
  -vf "setpts=PTS/$SPEED,fps=$FPS_GIF,scale=$WIDTH_GIF:-1:flags=lanczos,palettegen=max_colors=192:stats_mode=diff" \
  "$PAL"

ffmpeg -y -loglevel error \
  -framerate "$FPS_IN" -pattern_type glob -i "$FRAMES/f*.png" -i "$PAL" \
  -lavfi "setpts=PTS/$SPEED,fps=$FPS_GIF,scale=$WIDTH_GIF:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  -loop 0 \
  "$OUT/demo.gif"

SIZE_MB=$(du -m "$OUT/demo.gif" | cut -f1)
echo "  demo.gif  $(du -h "$OUT/demo.gif" | cut -f1)"

if [ "$SIZE_MB" -gt 10 ]; then
  echo
  echo "  ⚠ over 10 MB — GitHub may refuse to render it inline."
  echo "    Re-run with a lower WIDTH_GIF or FPS_GIF."
fi
