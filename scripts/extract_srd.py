"""Extract the Rules Glossary, weapon, equipment and combat sections from the
SRD 5.2.1 PDF to UTF-8 text.

Usage: .venv/Scripts/python scripts/extract_srd.py
"""
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "source" / "SRD_CC_v5.2.1.pdf"
OUT = ROOT / "source" / "extracted"


# The SRD sets a paragraph's lead-in term in bold italic. That styling is the only
# thing distinguishing "Fuel." from an ordinary opening sentence, so mark it rather
# than have the parsers guess from the wording.
LEAD_IN_FONT = "Cambria-BoldItalic"
MARK = "**"


def page_text(page):
    # PyMuPDF's native reading order handles the SRD's two-column layout; manual
    # column splitting dropped whole blocks (e.g. Loading, Cleave).
    return page.get_text("text")


def marked_page_text(page):
    """page_text(), with lead-in runs wrapped in ** ** ."""
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            out = ""
            for span in line["spans"]:
                text = span["text"]
                if span["font"] == LEAD_IN_FONT and text.strip():
                    lead, sep, trail = text.rstrip(), "", text[len(text.rstrip()):]
                    out += f"{MARK}{lead}{MARK}{sep}{trail}"
                else:
                    out += text
            lines.append(out)
    text = "\n".join(lines)
    # The blocks/lines above are the same ones get_text("text") walks, so the two
    # must agree once the markers come off. Guard against that assumption breaking.
    assert text.replace(MARK, "") == page.get_text("text").rstrip("\n"), (
        f"marked text diverged from plain text on page {page.number + 1}"
    )
    return text + "\n"


def extract(doc, first, last, name, mark_lead_ins=False):
    render = marked_page_text if mark_lead_ins else page_text
    parts = [f"\n<<<PAGE {n}>>>\n" + render(doc[n - 1]) for n in range(first, last + 1)]
    text = "".join(parts)
    text = re.sub(r"-\n(?=[a-z])", "", text)  # rejoin hyphenated words
    (OUT / name).write_text(text, encoding="utf-8")
    print(f"{name}: pages {first}-{last}, {len(text):,} chars")


def find_last_glossary_page(doc):
    for n in range(176, doc.page_count + 1):
        if "Gameplay Toolbox" in doc[n - 1].get_text()[:200]:
            return n - 1
    return 191


doc = pymupdf.open(PDF)
OUT.mkdir(parents=True, exist_ok=True)
extract(doc, 176, find_last_glossary_page(doc), "glossary.txt")
extract(doc, 89, 92, "weapons.txt")
# Coins through Large Vehicles: everything in "Equipment" that describes an item.
# Overlaps the weapon pages, which are parsed separately from weapons.txt.
extract(doc, 89, 101, "equipment.txt", mark_lead_ins=True)
# "Playing the Game" > Combat, for the Mounted and Underwater Combat rules.
extract(doc, 15, 16, "combat.txt")
