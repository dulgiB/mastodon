#!/usr/bin/env python3
"""
Build "Noto Shade Xetead": Noto Sans KR's MEDIUM SHADE (U+2592) and nothing
else, fitted to Asta Sans Xetead's metrics.

The base UI font (Asta Sans Xetead, see ../asta-sans/build.py) has its own
U+2592 (small dotted squares with gaps between them), but the instance wants
Noto Sans KR's version -- a diagonal hatch filling the whole em square, which
tiles seamlessly, so "▒▒" reads as one censor bar. The shade
family is put first in $font-sans-serif with `unicode-range: U+2592`, so the
browser draws only that character from it and every other one (including
Hangul right after it, as in "▒▒를") still comes from Asta Sans.

Dropped into an Asta Sans line as-is, the Noto glyph doesn't fit:

  - its line metrics are taller (hhea 1160/-288 vs Asta's 952/-241), which
    can push the line box open and shift the baseline around the glyph;
  - Noto's Hangul is drawn larger than Asta's (가: -67..816 vs -70..780), so
    a full-em Noto block looms over the Asta text next to it.

So this script:

  1. subsets Noto Sans KR (variable, wght 100-900) to U+2592;
  2. scales the outline (and its gvar deltas, via scaleUpem) by SCALE and
     shifts it by SHIFT_Y, mapping Noto's Hangul band onto Asta's -- the
     shade ends up as tall relative to the Asta Hangul beside it as it is
     relative to Noto's own Hangul;
  3. overwrites hhea / OS/2 vertical metrics with Asta Sans Xetead's, so the
     line box is identical whichever font a character comes from;
  4. renames the family (a modified build shouldn't carry the upstream name);
  5. writes NotoShade.woff2 and ../../styles/fonts/noto-shade.scss.

Usage:  pip install fonttools brotli
        python build.py   # Node/npx on PATH for the oxfmt formatting pass

The output is committed, so this only needs re-running to change the fit.

License: SIL Open Font License 1.1 (OFL.txt here).
"""

from __future__ import annotations

import json
import re
import subprocess
import urllib.request
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.ttLib.scaleUpem import scale_upem

HERE = Path(__file__).parent
SCSS = (HERE / ".." / ".." / "styles" / "fonts" / "noto-shade.scss").resolve()  # oxfmt rejects ".." paths
OUT = HERE / "NotoShade.woff2"
SRC_TTF_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"

FAMILY, PS_NAME = "Noto Shade Xetead", "NotoShadeXetead"
UNICODES = {0x2592}

# Hangul band (가/한/뷁 yMin..yMax, UPM 1000):
#   Noto Sans KR     -67..816  (883 tall, centre 374.5)
#   Asta Sans Xetead -70..780  (850 tall, centre 355)
SCALE = 850 / 883
SHIFT_Y = round(355 - 374.5 * SCALE)

# Asta Sans Xetead's vertical metrics (hhea == typo == win there).
ASCENT, DESCENT = 952, -241


def fetch_src() -> Path:
    dst = HERE / "_upstream-NotoSansKR[wght].ttf"
    if not dst.exists():
        print("downloading", SRC_TTF_URL)
        urllib.request.urlretrieve(SRC_TTF_URL, dst)
    return dst


def subset(font: TTFont) -> None:
    opts = Options()
    opts.layout_features = []
    opts.hinting = False
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.drop_tables += ["MVAR", "STAT"]
    sub = Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)


def fit(font: TTFont) -> None:
    upem = font["head"].unitsPerEm
    # scaleUpem scales outlines, advances and gvar deltas together; putting the
    # original UPM back afterwards leaves the glyph SCALE times its old size.
    scale_upem(font, round(upem * SCALE))
    font["head"].unitsPerEm = upem

    glyf = font["glyf"]
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.numberOfContours > 0:
            g.coordinates.translate((0, SHIFT_Y))
            g.recalcBounds(glyf)
    font["head"].recalcBBoxes = True

    hhea, os2 = font["hhea"], font["OS/2"]
    hhea.ascent, hhea.descent, hhea.lineGap = ASCENT, DESCENT, 0
    os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap = ASCENT, DESCENT, 0
    os2.usWinAscent, os2.usWinDescent = ASCENT, -DESCENT


def rename(font: TTFont) -> None:
    name = font["name"]
    name.names = [r for r in name.names if r.nameID not in (1, 2, 3, 4, 6, 16, 17, 25)]
    for nid, s in ((1, FAMILY), (2, "Regular"), (3, PS_NAME), (4, FAMILY), (6, PS_NAME)):
        name.setName(s, nid, 3, 1, 0x409)
    name.setName(
        "U+2592 only, scaled and re-metricked to sit in Asta Sans Xetead text. "
        "Based on Noto Sans KR.",
        10, 3, 1, 0x409,
    )
    # fvar instance names pointed at the dropped subfamily records
    for inst in font["fvar"].instances:
        inst.postscriptNameID = 0xFFFF


def run() -> None:
    font = TTFont(fetch_src())
    subset(font)
    fit(font)
    rename(font)
    font.flavor = "woff2"
    font.save(OUT)
    print(f"wrote {OUT.name}: {OUT.stat().st_size} B  (scale {SCALE:.4f}, shift {SHIFT_Y})")
    _write_scss()
    run_oxfmt()


def run_oxfmt() -> None:
    """Same as ../asta-sans/build.py: format with the project's pinned oxfmt."""
    pkg = json.loads((HERE / ".." / ".." / ".." / ".." / "package.json").read_text())
    version = re.sub(r"[^0-9.]", "", pkg["devDependencies"]["oxfmt"])
    try:
        subprocess.run(
            ["npx", "--yes", f"oxfmt@{version}", str(SCSS)],
            check=True, capture_output=True, text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"warning: couldn't run oxfmt ({e}); run `yarn format` by hand")


def _write_scss() -> None:
    SCSS.write_text(f'''\
/*
GENERATED by app/javascript/fonts/noto-shade/build.py -- do not hand-edit.

"Noto Shade Xetead": Noto Sans KR's U+2592 (▒) alone, scaled and given
Asta Sans Xetead's line metrics. Listed ahead of Asta Sans in
$font-sans-serif; the unicode-range keeps every other character, including
Hangul right next to it, on Asta Sans.

License: SIL Open Font License 1.1 (app/javascript/fonts/noto-shade/OFL.txt).
*/
@font-face {{
  font-family: '{FAMILY}';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('@/fonts/noto-shade/{OUT.name}') format('woff2');
  unicode-range: U+2592;
}}
''')


if __name__ == "__main__":
    run()
