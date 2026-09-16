"""Extract the Rules Glossary and weapon sections from the SRD 5.2.1 PDF to UTF-8 text.

Usage: .venv/Scripts/python scripts/extract_srd.py
"""
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "source" / "SRD_CC_v5.2.1.pdf"
OUT = ROOT / "source" / "extracted"


def page_text(page):
    # PyMuPDF's native reading order handles the SRD's two-column layout; manual
    # column splitting dropped whole blocks (e.g. Loading, Cleave).
    return page.get_text("text")


def extract(doc, first, last, name):
    parts = [f"\n<<<PAGE {n}>>>\n" + page_text(doc[n - 1]) for n in range(first, last + 1)]
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
