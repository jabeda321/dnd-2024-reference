#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build src/data/combat-rules.json from source/extracted/combat.txt (SRD 5.2.1
"Playing the Game" > Combat, PDF pages 15-16).

These rules sit in the main text rather than the Rules Glossary, so they are not
part of build_glossary.py's 155 entries (which asserts against that exact set).
They use the same entry schema and data.ts merges them into the glossary, so they
get search, term linking, hover previews and favourites like any other rule.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_TXT = ROOT / "source" / "extracted" / "combat.txt"
OUT_JSON = ROOT / "src" / "data" / "combat-rules.json"

FOOTER = "System Reference Document 5.2.1"

# Sections to lift, as (title, heading in the PDF, heading that ends it).
SECTIONS = [
    ("Mounted Combat", "Mounted Combat", "Underwater Combat"),
    ("Underwater Combat", "Underwater Combat", "Damage and Healing"),
]

# Sub-headings inside a section, rendered as <h3>. Anything else is a paragraph.
SUB_HEADINGS = {
    "Mounting and Dismounting",
    "Controlling a Mount",
    "Falling Off",
    "Impeded Weapons",
    "Fire Resistance",
}

# A page-16 sidebar breaks the Mounted Combat text in two. It belongs to Resting,
# not to mounts, so drop it from the first heading to its last line.
SIDEBAR = ("Resting", "rules for Short and Long Rests.")

CATEGORY = "Combat"
SRD_REF = "Playing the Game (Combat)"

# Cross-references, as slugs that build_glossary.py emits. Asserted below.
SEE_ALSO = {
    "Mounted Combat": [
        "dash-action",
        "disengage-action",
        "dodge-action",
        "initiative",
        "prone-condition",
        "speed",
    ],
    "Underwater Combat": [
        "attack-roll",
        "damage-types",
        "disadvantage",
        "resistance",
        "swim-speed",
    ],
}


def load_lines() -> list[str]:
    raw = SRC_TXT.read_text(encoding="utf-8").replace(" ", " ")
    out: list[str] = []
    lines = raw.split("\n")
    i = 0
    while i < len(lines):
        m = re.fullmatch(r"<<<PAGE (\d+)>>>", lines[i].strip())
        if m and lines[i + 1 : i + 3] == [FOOTER, m.group(1)]:
            i += 3
            continue
        out.append(lines[i])
        i += 1
    return out


def drop_sidebar(lines: list[str]) -> list[str]:
    start, end = SIDEBAR
    try:
        a = next(i for i, l in enumerate(lines) if l.strip() == start)
    except StopIteration:
        return lines
    b = next(i for i in range(a, len(lines)) if lines[i].strip().endswith(end))
    return lines[:a] + lines[b + 1 :]


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def paragraphs(lines: list[str]) -> list[str]:
    """Join the PDF's hard-wrapped lines; a tab starts a new paragraph."""
    paras: list[str] = []
    current: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        if line.startswith("\t") and current:
            paras.append(" ".join(current))
            current = []
        current.append(line.strip())
    if current:
        paras.append(" ".join(current))
    return [re.sub(r"\s+", " ", p).strip() for p in paras if p.strip()]


def to_html(lines: list[str]) -> str:
    out: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        for para in paragraphs(buf):
            out.append(f"<p>{esc(para)}</p>")
        buf.clear()

    for line in lines:
        if line.strip() in SUB_HEADINGS:
            flush()
            out.append(f"<h3>{esc(line.strip())}</h3>")
            continue
        buf.append(line)
    flush()
    return "".join(out)


def first_sentence(html: str) -> str:
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()
    m = re.match(r"^(.{20,200}?[.!?])(?:\s|$)", text)
    return m.group(1) if m else text[:200]


LINES = drop_sidebar(load_lines())

entries = []
for title, start_head, end_head in SECTIONS:
    a = next(i for i, l in enumerate(LINES) if l.strip() == start_head)
    b = next(i for i in range(a + 1, len(LINES)) if LINES[i].strip() == end_head)
    body = to_html(LINES[a + 1 : b])
    entries.append(
        {
            "slug": re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-"),
            "title": title,
            "category": CATEGORY,
            "summary": first_sentence(body),
            "body": body,
            "seeAlso": SEE_ALSO.get(title, []),
            "srdRefs": [SRD_REF],
        }
    )

# The cross-references point into glossary.json; a typo there would render as a
# dead link, so fail the build instead.
glossary = json.loads((ROOT / "src" / "data" / "glossary.json").read_text(encoding="utf-8"))
known = {e["slug"] for e in glossary}
for entry in entries:
    missing = [s for s in entry["seeAlso"] if s not in known]
    assert not missing, f"{entry['title']}: seeAlso slugs not in glossary.json: {missing}"

OUT_JSON.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"combat-rules.json: {len(entries)} entries ({', '.join(e['title'] for e in entries)})")
