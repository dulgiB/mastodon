#!/usr/bin/env python3
"""
Build the self-hosted "Asta Sans Xetead" webfont from upstream Asta Sans.

Asta Sans (42dot/Asta-Sans, OFL 1.1) only ships a TTF. This script:

  1. Patches the upstream variable TTF:
       a. gasp -> {<=8ppem: 0x0A, rest: 0x0F}. Upstream is unhinted with
          gasp 0x0A (grayscale AA, no grid-fitting) at every size, which
          leaves light stems soft/blurry on a dark UI, worst in Windows
          browsers (DirectWrite). Requesting grid-fitting above 8px fixes it.
       b. digit '1' advance 488 -> 366. Upstream gives '1' a 188-unit right
          sidebearing -- ~3x every other digit (30-68) and about the width of
          a space -- so "1회" / "10" render as if spaced. 366 leaves it a
          ~52-unit sidebearing on each side at Regular (in line with 0/2/5/8),
          so it sits evenly in "(1)" too. '1' carries no HVAR width variation,
          so the single hmtx edit covers every weight; the outline is untouched.
       c. family rename "Asta Sans" -> "Asta Sans Xetead", because OFL 1.1
          forbids keeping the reserved name on a modified build.
     Glyph outlines (bar '1' metrics), the wght axis / avar and the OpenType
     features are otherwise untouched.

  2. Splits the patched font into per-unicode-range woff2 chunks so a browser
     only downloads the glyph ranges a page actually uses (Google Fonts /
     Pretendard-dynamic-subset style):
       - chunk 0 is a comprehensive Latin + punctuation + symbol + currency
         range (PRIMARY_LATIN below), always loaded;
       - the Hangul chunks come from ranges.txt, the Pretendard dynamic-subset
         split this fork used previously -- roughly frequency-ordered, so the
         low-numbered chunks hold the rarer syllable blocks and the last the
         most common ones -- with PRIMARY_LATIN subtracted so chunks never
         overlap;
       - a final "extra" chunk mops up anything else in the font's cmap.

  3. Regenerates ../../styles/fonts/asta-sans.scss (the @font-face list) and
     reformats it with the project's pinned oxfmt (`yarn format:check`'s
     formatter), so the output matches CI without a manual `yarn format` pass.

Usage:  pip install fonttools brotli
        python build.py   # Node/npx on PATH for the oxfmt formatting pass

Everything it writes (AstaSans.subset.*.woff2, asta-sans.scss) is committed,
so this only needs re-running to pull a newer upstream or change the split.
"""

from __future__ import annotations

import json
import re
import subprocess
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_a_s_p import (
    GASP_DOGRAY,
    GASP_GRIDFIT,
    GASP_SYMMETRIC_GRIDFIT,
    GASP_SYMMETRIC_SMOOTHING,
)
from fontTools.subset import Subsetter, Options

HERE = Path(__file__).parent
SCSS = HERE / ".." / ".." / "styles" / "fonts" / "asta-sans.scss"
SRC_TTF_URL = "https://raw.githubusercontent.com/42dot/Asta-Sans/main/fonts/variable/AstaSans%5Bwght%5D.ttf"

OLD_NAME, NEW_NAME = "Asta Sans", "Asta Sans Xetead"
OLD_PS, NEW_PS = "AstaSans", "AstaSansXetead"
ONE_ADVANCE = 366

# Keep the chunks lean: syllable-to-syllable text needs no kerning/ligatures,
# only glyph composition and mark positioning.
KEEP_FEATURES = ["ccmp", "locl", "kern", "mark", "mkmk", "liga", "calt"]

# Always-loaded first chunk: Latin (incl. Extended-A/B and IPA), combining
# diacritics, Latin Extended Additional, General Punctuation, super/subscripts,
# currency, letterlike symbols, number forms, basic arrows + math operators,
# CJK symbols & punctuation, the Latin f-ligatures (FB00-FB06, so `liga` on
# "fi"/"fl" still resolves against this chunk), and fullwidth forms.
# Pictographic / geometric / dingbat blocks are left out on purpose -- Mastodon
# draws emoji as SVG and those glyphs fall to the "extra" chunk if a post ever
# needs one.
PRIMARY_LATIN = (
    "U+0000-024F, U+0250-02AF, U+02B0-02FF, U+0300-036F, U+1AB0-1AFF, "
    "U+1DC0-1DFF, U+1E00-1EFF, U+2000-206F, U+2070-209F, U+20A0-20CF, "
    "U+2100-214F, U+2150-218F, U+2190-21FF, U+2200-22FF, U+2E00-2E7F, "
    "U+3000-303F, U+FB00-FB4F, U+FE10-FE1F, U+FE30-FE4F, U+FF00-FFEF, "
    "U+FFF0-FFFF"
)


def fetch_src() -> Path:
    dst = HERE / "_upstream-AstaSans[wght].ttf"
    if not dst.exists():
        print("downloading", SRC_TTF_URL)
        urllib.request.urlretrieve(SRC_TTF_URL, dst)
    return dst


def patch(font: TTFont) -> None:
    gray = GASP_DOGRAY | GASP_SYMMETRIC_SMOOTHING
    grid = GASP_GRIDFIT | GASP_DOGRAY | GASP_SYMMETRIC_GRIDFIT | GASP_SYMMETRIC_SMOOTHING
    font["gasp"].gaspRange = {8: gray, 0xFFFF: grid}

    one = font.getBestCmap()[ord("1")]
    _, lsb = font["hmtx"][one]
    font["hmtx"][one] = (ONE_ADVANCE, lsb)

    name = font["name"]
    for rec in list(name.names):
        s = rec.toUnicode()
        if rec.nameID in (1, 4, 16):
            ns = s.replace(OLD_NAME, NEW_NAME)
        elif rec.nameID in (3, 6):
            ns = s.replace(OLD_PS, NEW_PS).replace(OLD_NAME, NEW_NAME)
        elif rec.nameID == 25:
            ns = s.replace(OLD_PS, NEW_PS)
        else:
            continue
        if ns != s:
            rec.string = ns
    name.setName(
        "gasp grid-fitting enabled, digit '1' advance narrowed, family renamed "
        "for self-hosting; outlines unchanged. Based on Asta Sans by 42dot.",
        10, 3, 1, 0x409,
    )


def read_ranges() -> list[str]:
    out = []
    for line in (HERE / "ranges.txt").read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            out.append(line)
    return out


def codepoints(range_str: str) -> set[int]:
    cps: set[int] = set()
    for tok in range_str.replace("U+", "").split(","):
        tok = tok.strip()
        if not tok:
            continue
        if "-" in tok:
            a, b = tok.split("-")
            cps.update(range(int(a, 16), int(b, 16) + 1))
        else:
            cps.add(int(tok, 16))
    return cps


def run() -> None:
    patched = TTFont(fetch_src())
    patch(patched)
    patched_ttf = HERE / "_patched.ttf"
    patched.save(patched_ttf)

    have = set(TTFont(patched_ttf).getBestCmap())

    primary = codepoints(PRIMARY_LATIN) & have
    assigned: set[int] = set(primary)
    faces = []
    out = HERE / "AstaSans.subset.0.woff2"
    _write_subset(patched_ttf, primary, out)
    faces.append(("AstaSans.subset.0.woff2", _fmt_range(primary)))
    print(f"  chunk  0: {len(primary):5d} cp  {out.stat().st_size:7d} B  (latin)")

    for n, rng in enumerate(read_ranges(), start=1):
        want = (codepoints(rng) & have) - assigned
        if not want:
            continue
        assigned |= want
        out = HERE / f"AstaSans.subset.{n}.woff2"
        _write_subset(patched_ttf, want, out)
        faces.append((f"AstaSans.subset.{n}.woff2", _fmt_range(want)))
        print(f"  chunk {n:2d}: {len(want):5d} cp  {out.stat().st_size:7d} B")

    leftover = have - assigned
    # don't ship a chunk for control chars / PUA the layout never asks for
    leftover = {c for c in leftover if c >= 0x20 and not (0xE000 <= c <= 0xF8FF)}
    if leftover:
        out = HERE / "AstaSans.subset.extra.woff2"
        _write_subset(patched_ttf, leftover, out)
        faces.append(("AstaSans.subset.extra.woff2", _fmt_range(leftover)))
        print(f"  chunk ex: {len(leftover):5d} cp  {out.stat().st_size:7d} B")

    _write_scss(faces)
    patched_ttf.unlink()
    run_oxfmt()
    print(f"wrote {len(faces)} @font-face blocks to {SCSS.resolve()}")


def _write_subset(src_ttf: Path, unicodes: set[int], out: Path) -> None:
    opts = Options()
    opts.flavor = "woff2"
    opts.layout_features = KEEP_FEATURES
    opts.hinting = False
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.drop_tables += ["MVAR"]
    font = TTFont(src_ttf)
    sub = Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(out)


def _fmt_range(cps: set[int]) -> str:
    # One unbroken line -- run_oxfmt() below does the actual line-wrapping,
    # so this always matches whatever `yarn format` produces instead of a
    # hand-rolled wrap width silently drifting from oxfmt's.
    runs = []
    for c in sorted(cps):
        if runs and c == runs[-1][1] + 1:
            runs[-1][1] = c
        else:
            runs.append([c, c])
    toks = [f"U+{a:04x}" if a == b else f"U+{a:04x}-{b:04x}" for a, b in runs]
    return ", ".join(toks)


def run_oxfmt() -> None:
    """Reformat the generated scss with the project's pinned oxfmt, the same
    formatter `yarn format:check` runs in CI, so a regen never drifts out of
    sync with it. Requires Node/npx; falls back to a warning if unavailable
    (the file is still valid scss, just not necessarily lint-clean)."""
    pkg = json.loads((HERE / ".." / ".." / ".." / ".." / "package.json").read_text())
    version = re.sub(r"[^0-9.]", "", pkg["devDependencies"]["oxfmt"])
    try:
        subprocess.run(
            ["npx", "--yes", f"oxfmt@{version}", str(SCSS)],
            check=True, capture_output=True, text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"warning: couldn't run oxfmt ({e}); run `yarn format` by hand")


def _write_scss(faces) -> None:
    header = f'''\
/*
GENERATED by app/javascript/fonts/asta-sans/build.py -- do not hand-edit.

"Asta Sans Xetead": a self-hosted, lightly patched build of Asta Sans
(42dot/Asta-Sans, OFL 1.1) -- see build.py for exactly what changed and why
(gasp grid-fitting, digit-'1' width, family rename). Split into
per-unicode-range woff2 chunks so a browser only fetches the ranges a page
uses: chunk 0 is Latin + punctuation + symbols, the rest are Hangul syllable
blocks (Pretendard dynamic-subset split), and "extra" is the catch-all.

Self-hosted rather than loaded from a CDN so visitors' IP/UA/referer aren't
sent to a third party on every page load -- and because Mastodon's production
CSP only allows `font-src 'self'` anyway.

The wght axis runs 300-800 (Light-ExtraBold); there is no Thin/Black master,
so the range is declared as such and the browser clamps 100/900 requests.

License: SIL Open Font License 1.1 (app/javascript/fonts/asta-sans/OFL.txt,
authors in AUTHORS.txt).
*/
'''
    blocks = []
    for filename, urange in faces:
        blocks.append(
            "@font-face {\n"
            "  font-family: 'Asta Sans Xetead';\n"
            "  font-style: normal;\n"
            "  font-weight: 300 800;\n"
            "  font-display: swap;\n"
            f"  src: url('@/fonts/asta-sans/{filename}') format('woff2');\n"
            f"  unicode-range:\n    {urange};\n"
            "}"
        )
    SCSS.write_text(header + "\n".join(blocks) + "\n")


if __name__ == "__main__":
    run()
