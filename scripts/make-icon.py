#!/usr/bin/env python3
"""
make-icon.py — generates build/icon.png and build/icon.icns.

Run once; the results are versioned. The generator exists so the icon is
reproducible instead of sitting in the repo as an opaque binary artefact.

Requires Pillow and iconutil (macOS built-in):
    python3 scripts/make-icon.py
"""

import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
BG = (14, 17, 22, 255)       # #0E1116
FG = (233, 228, 218, 255)    # #E9E4DA
STROKE = 46

BUILD = Path(__file__).resolve().parent.parent / "build"
ICONSET = BUILD / "icon.iconset"


def draw_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=224, fill=BG)

    cx = SIZE / 2
    deck_y = 380
    half_beam = 300

    # Keel line: a parabola, deep at the centre, rising to the deck at the sides.
    hull = []
    for i in range(61):
        t = -1 + 2 * i / 60
        hull.append((cx + half_beam * t, 760 - 380 * t * t))
    d.line(hull, fill=FG, width=STROKE, joint="curve")

    # Deck beam
    d.line(
        [(cx - half_beam, deck_y), (cx + half_beam, deck_y)],
        fill=FG,
        width=STROKE,
    )

    # Mast
    d.line([(cx, 190), (cx, deck_y + 40)], fill=FG, width=STROKE)

    return img


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    master = draw_icon()
    master.save(BUILD / "icon.png")

    if ICONSET.exists():
        shutil.rmtree(ICONSET)
    ICONSET.mkdir()

    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            suffix = "" if scale == 1 else "@2x"
            master.resize((px, px), Image.LANCZOS).save(
                ICONSET / f"icon_{base}x{base}{suffix}.png"
            )

    subprocess.run(
        ["iconutil", "-c", "icns", str(ICONSET), "-o", str(BUILD / "icon.icns")],
        check=True,
    )
    shutil.rmtree(ICONSET)
    print(f"wrote {BUILD / 'icon.png'} and {BUILD / 'icon.icns'}")


if __name__ == "__main__":
    main()
