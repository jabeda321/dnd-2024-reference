#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build src/data/equipment.json and src/data/equipment-intro.json from
source/extracted/equipment.txt (SRD 5.2.1 "Equipment", PDF pages 89-101,
extracted via PyMuPDF).

Covers the item-shaped parts of the chapter: Armor, Tools, Adventuring Gear,
and Mounts and Vehicles. Weapons live in weapons.json and are parsed separately.
The chapter's prose sections (lifestyle expenses, hirelings, services, crafting)
are out of scope.

Approach mirrors build_glossary.py:
1. Read the extracted text and strip the page markers / running footers.
2. Split it into the four item sections by their headings.
3. Parse each section's tables positionally (the flattened PDF text emits one
   cell per line, in row-major order) and its per-item descriptions by the
   "Name (Cost)" heading that introduces each one.
4. Emit one record per item with common columns (cost, weight) plus a `stats`
   list holding the type-specific columns, which the detail page renders as-is.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_TXT = ROOT / "source" / "extracted" / "equipment.txt"
OUT_JSON = ROOT / "src" / "data" / "equipment.json"
OUT_INTRO = ROOT / "src" / "data" / "equipment-intro.json"

FOOTER = "System Reference Document 5.2.1"
DASH = "—"  # em dash, the SRD's "not applicable" marker

# ---------------------------------------------------------------------------
# Load + clean raw text
# ---------------------------------------------------------------------------


def load_lines() -> list[str]:
    raw = SRC_TXT.read_text(encoding="utf-8").replace(" ", " ")
    lines = raw.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        m = re.fullmatch(r"<<<PAGE (\d+)>>>", lines[i].strip())
        if m:
            # Each page opens with the marker, the running footer and the page
            # number. Drop all three rather than every bare-number line, which
            # would eat table cells like the Ammunition "20".
            page = m.group(1)
            if lines[i + 1 : i + 3] == [FOOTER, page]:
                i += 3
                continue
            i += 1
            continue
        out.append(lines[i])
        i += 1
    return out


LINES = load_lines()


def find(pred, start: int = 0) -> int:
    for i in range(start, len(LINES)):
        if pred(LINES[i]):
            return i
    raise LookupError("no line matched")


def heading_at(title: str, follows: str, start: int = 0) -> int:
    """Index of the line `title` that is followed by a line starting `follows`.

    The chapter repeats most headings as table captions and cross-references, so
    a heading is only the real one when the prose that opens the section is next.
    """
    i = start
    while True:
        i = find(lambda l: l.strip() == title, i)
        if LINES[i + 1].strip().startswith(follows):
            return i
        i += 1


ARMOR_AT = heading_at("Armor", "The Armor table lists")
TOOLS_AT = heading_at("Tools", "A tool helps you make")
GEAR_AT = heading_at("Adventuring Gear", "The Adventuring Gear table in this section")
MOUNTS_AT = heading_at("Mounts and Vehicles", "A mount can help you move")

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

COIN_IN_CP = {"CP": 1, "SP": 10, "EP": 50, "GP": 100, "PP": 1000}
COST_RE = re.compile(r"^([\d,]+(?:½|¼|¾)?)\s*(CP|SP|EP|GP|PP)$")
VARIES = re.compile(r"^(Varies|Free)$", re.I)
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_number(text: str) -> float | None:
    """'1,320' -> 1320, '1/2' -> 0.5, '58½' -> 58.5, '—' -> None."""
    t = text.strip().replace(",", "")
    if not t or t == DASH or VARIES.match(t):
        return None
    for glyph, value in FRACTIONS.items():
        if t.endswith(glyph):
            head = t[: -len(glyph)]
            return (float(head) if head else 0) + value
    if m := re.fullmatch(r"(\d+)/(\d+)", t):
        return int(m.group(1)) / int(m.group(2))
    try:
        return float(t)
    except ValueError:
        return None


def cost_in_cp(cost: str) -> int | None:
    m = COST_RE.match(cost.strip())
    if not m:
        return None
    amount = parse_number(m.group(1))
    return None if amount is None else round(amount * COIN_IN_CP[m.group(2)])


def weight_in_lb(weight: str) -> float | None:
    m = re.match(r"^([\d,/½¼¾]+)\s*lb\.?", weight.strip())
    return parse_number(m.group(1)) if m else None


def is_cost(line: str) -> bool:
    s = line.strip()
    return bool(COST_RE.match(s) or VARIES.match(s) or s == DASH)


def is_weight(line: str) -> bool:
    s = line.strip()
    return bool(
        re.match(r"^[\d,/½¼¾]+\s*lb\.?", s) or VARIES.match(s) or s == DASH
    )


# ---------------------------------------------------------------------------
# Prose -> HTML
# ---------------------------------------------------------------------------


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def join_wrapped(lines: list[str]) -> list[str]:
    """Join the PDF's hard-wrapped lines into paragraphs.

    A tab-indented line starts a new paragraph (the SRD's lead-in style); so does
    a blank line. Everything else continues the paragraph it follows.
    """
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


# extract_srd.py marks the SRD's bold-italic lead-in runs, so they need no guessing.
LEAD_IN = re.compile(r"^\*\*(.+?)\*\*\s*")


def demark(text: str) -> str:
    return text.replace("**", "")


def to_html(lines: list[str]) -> str:
    """Render extracted prose as the same HTML shape the glossary uses."""
    out = []
    for para in join_wrapped(lines):
        if m := LEAD_IN.match(para):
            body = f"<strong>{esc(m.group(1))}</strong> " + esc(para[m.end():])
        else:
            body = esc(para)
        out.append(f"<p>{demark(body)}</p>")
    return "".join(out)


def table_html(caption: str, headers: list[str], rows: list[list[str]]) -> str:
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>" for row in rows
    )
    return (
        f'<table><caption>{esc(caption)}</caption>'
        f"<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"
    )


def summarise(html: str, fallback: str) -> str:
    """First sentence of the body, or a generated line for items with no prose."""
    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return fallback
    m = re.match(r"^(.{20,200}?[.!?])(?:\s|$)", text)
    return m.group(1) if m else (text[:197].rstrip() + "…" if len(text) > 200 else text)


items: list[dict] = []
# Items are emitted alphabetically, which loses the order the SRD prints the
# tables in. Record each group's first appearance so the UI can offer them as
# Light -> Medium -> Heavy rather than alphabetically.
group_order: dict[str, int] = {}


def add(
    name: str,
    kind: str,
    group: str,
    cost: str,
    weight: str,
    stats: list[tuple[str, str]],
    body: str = "",
    fallback: str = "",
) -> dict:
    name = demark(name)
    group_order.setdefault(group, len(group_order))
    item = {
        "slug": slugify(name),
        "name": name,
        "kind": kind,
        "group": group,
        "groupIndex": group_order[group],
        "cost": cost,
        "costCp": cost_in_cp(cost),
        "weight": weight,
        "weightLb": weight_in_lb(weight),
        "stats": [
            {"label": l, "value": demark(v)} for l, v in stats if v and v != DASH
        ],
        "summary": summarise(body, fallback),
        "body": body,
    }
    items.append(item)
    return item


# ---------------------------------------------------------------------------
# Armor (page 92)
# ---------------------------------------------------------------------------

ARMOR_COLUMNS = ["Armor", "Armor Class (AC)", "Strength", "Stealth", "Weight", "Cost"]
ARMOR_BANNER = re.compile(r"^(Light|Medium|Heavy) Armor \(|^Shield \(")


def parse_armor() -> str:
    # The table caption repeats the section title, so look for the column header
    # run rather than the caption.
    start = find(lambda l: l.strip() == "Armor Class (AC)", ARMOR_AT)
    assert [l.strip() for l in LINES[start : start + 5]] == ARMOR_COLUMNS[1:]
    intro = to_html(LINES[ARMOR_AT + 1 : start - 1])

    i = start + 5
    group = ""
    while i < TOOLS_AT:
        line = LINES[i].strip()
        if not line:
            i += 1
            continue
        if ARMOR_BANNER.match(line):
            group = line
            i += 1
            continue
        name, ac, strength, stealth, weight, cost = (l.strip() for l in LINES[i : i + 6])
        if not is_cost(cost):
            break
        # "Light Armor (1 Minute to Don or Doff)" -> group + the donning time.
        category, _, timing = group.partition(" (")
        add(
            name,
            "armor",
            category or "Armor",
            cost,
            weight,
            [
                ("Armor Class (AC)", ac),
                ("Strength", strength),
                ("Stealth", stealth),
                ("Don / Doff", timing.rstrip(")")),
            ],
            fallback=f"{category or 'Armor'}. AC {ac}.",
        )
        i += 6
    return intro


# ---------------------------------------------------------------------------
# Tools (pages 93-94)
# ---------------------------------------------------------------------------

TOOL_ENTRY = re.compile(r"^(.+?) \((\d[\d,]*(?:½)? (?:CP|SP|EP|GP|PP)|Varies)\)$")
TOOL_FIELDS = ("Ability", "Weight", "Utilize", "Craft", "Variants")


def parse_field_block(lines: list[str]) -> dict[str, str]:
    """Split an entry's 'Field: value' lines, rejoining values that wrap."""
    fields: dict[str, str] = {}
    key = None
    for line in lines:
        m = re.match(r"^(%s): (.*)$" % "|".join(TOOL_FIELDS), line.strip())
        if m:
            key = m.group(1)
            fields[key] = m.group(2).strip()
        elif key:
            fields[key] += " " + line.strip()
    return {k: re.sub(r"\s+", " ", v).strip() for k, v in fields.items()}


def parse_tools() -> str:
    artisan_at = find(lambda l: l.strip() == "Artisan’s Tools", TOOLS_AT)
    other_at = find(lambda l: l.strip() == "Other Tools", artisan_at)
    intro = to_html(LINES[TOOLS_AT + 1 : artisan_at])

    # Entry headings within each block, plus the block end as a sentinel.
    for group, start, end in (
        ("Artisan’s Tools", artisan_at + 1, other_at),
        ("Other Tools", other_at + 1, GEAR_AT),
    ):
        # A heading is only real when the entry's first field follows it; a
        # wrapped "Variants:" line can otherwise look like "name (5 SP)".
        starts = [
            i
            for i in range(start, end)
            if TOOL_ENTRY.match(LINES[i].strip()) and LINES[i + 1].startswith("Ability:")
        ]
        for n, i in enumerate(starts):
            stop = starts[n + 1] if n + 1 < len(starts) else end
            m = TOOL_ENTRY.match(LINES[i].strip())
            name, cost = m.group(1), m.group(2)
            fields = parse_field_block(LINES[i + 1 : stop])
            stats = [(f, fields.get(f, "")) for f in ("Ability", "Utilize", "Craft", "Variants")]
            add(
                name,
                "tool",
                group,
                cost,
                fields.get("Weight", DASH),
                stats,
                fallback=f"{fields.get('Ability', 'A')} tool. {fields.get('Utilize', '')}".strip(),
            )
    return intro


# ---------------------------------------------------------------------------
# Adventuring Gear (pages 94-100)
# ---------------------------------------------------------------------------

GEAR_ENTRY = re.compile(
    r"^(.+?) \((\d[\d,]*(?:½)? (?:CP|SP|EP|GP|PP)|Varies)\)$"
)
# "Spell Scroll (Cantrip, 30 GP; Level 1, 50 GP)" heads one description that serves
# the two Spell Scroll rows of the gear table, and is the one heading that wraps.
SPELL_SCROLL_KEY = "Spell Scroll"
SPELL_SCROLL_HEAD = "Spell Scroll (Cantrip,"

# Tables that sit inside a gear item's description, keyed by the item they belong to.
GEAR_TABLES = {
    "Ammunition": ("Ammunition", ["Type", "Amount", "Storage", "Weight", "Cost"]),
    "Arcane Focuses": ("Arcane Focus", ["Focus", "Weight", "Cost"]),
    "Druidic Focuses": ("Druidic Focus", ["Focus", "Weight", "Cost"]),
    "Holy Symbols": ("Holy Symbol", ["Symbol", "Weight", "Cost"]),
}


def parse_gear_table() -> tuple[dict[str, tuple[str, str]], int, int]:
    """The master Adventuring Gear table: name -> (weight, cost), plus its span.

    The span is returned so the description walker can skip it; the table sits in
    the middle of the alphabetical descriptions and would otherwise be read as
    the prose of whichever item precedes it.
    """
    out: dict[str, tuple[str, str]] = {}
    start = find(lambda l: l.strip() == "Item", GEAR_AT)
    i = start
    while i < len(LINES):
        if [l.strip() for l in LINES[i : i + 3]] == ["Item", "Weight", "Cost"]:
            i += 3  # a repeated column header where the table breaks across columns
            continue
        name, weight, cost = (l.strip() for l in LINES[i : i + 3])
        if not (is_weight(weight) and is_cost(cost)):
            break
        out[name] = (weight, cost)
        i += 3
    # Swallow the caption line that introduces the table, too.
    if LINES[start - 1].strip() == "Adventuring Gear":
        start -= 1
    return out, start, i


def take_table(start: int, caption: str, headers: list[str]) -> tuple[str, int]:
    """Read a sub-table laid out as caption, column headers, then row-major cells."""
    i = start + 1 + len(headers)
    rows = []
    width = len(headers)
    while i + width <= len(LINES):
        row = [l.strip() for l in LINES[i : i + width]]
        if not (is_weight(row[-2]) and is_cost(row[-1])):
            break
        rows.append(row)
        i += width
    return table_html(caption, headers, rows), i


def parse_gear() -> str:
    table, table_start, table_end = parse_gear_table()
    first_entry = find(lambda l: GEAR_ENTRY.match(l.strip()), GEAR_AT + 1)
    intro = to_html(LINES[GEAR_AT + 1 : first_entry])

    # Walk the description run, collecting each item's prose and any sub-table.
    described: dict[str, tuple[str, str]] = {}
    i, name, buf, extra = first_entry, None, [], ""
    while i < MOUNTS_AT:
        if table_start <= i < table_end:
            i = table_end
            continue
        line = LINES[i].strip()
        if line in GEAR_TABLES:
            owner, headers = GEAR_TABLES[line]
            html, i = take_table(i, line, headers)
            if owner == name:
                extra += html
            else:
                described.setdefault(owner, ("", ""))
                described[owner] = (described[owner][0], described[owner][1] + html)
            continue
        if [l.strip() for l in LINES[i : i + 3]] == ["Item", "Weight", "Cost"]:
            i += 3
            continue
        if line.startswith(SPELL_SCROLL_HEAD):
            # The only heading that wraps onto a second line, and the only one
            # covering two rows of the gear table.
            if name:
                described[name] = (to_html(buf), extra)
            name, buf, extra = SPELL_SCROLL_KEY, [], ""
            i += 2
            continue
        if m := GEAR_ENTRY.match(line):
            if name:
                described[name] = (to_html(buf), extra)
            name, buf, extra = m.group(1), [], ""
            i += 1
            continue
        if name:
            buf.append(LINES[i])
        i += 1
    if name:
        described[name] = (to_html(buf), extra)

    scroll = described.pop(SPELL_SCROLL_KEY, ("", ""))
    for item_name, (weight, cost) in table.items():
        if item_name.startswith(SPELL_SCROLL_KEY):
            prose, extra = scroll
        else:
            prose, extra = described.pop(item_name, ("", ""))
        add(
            item_name,
            "gear",
            "Adventuring Gear",
            cost,
            weight,
            [],
            body=prose + extra,
            fallback=" ".join(
                x for x in ("Adventuring gear.", "" if weight == DASH else weight, cost) if x
            ),
        )
    # Described items that never made the table (none expected) would be lost
    # silently otherwise, so surface them.
    assert not described, f"described but not in the gear table: {sorted(described)}"
    return intro


# ---------------------------------------------------------------------------
# Mounts and Vehicles (pages 100-101)
# ---------------------------------------------------------------------------


# The PDF indents a banner row's variants, but the flattened text loses that, so
# "Sled" would read as another Saddle. The one case in the chapter is declared
# here and asserted against the extracted rows.
BANNER_VARIANTS = {"Saddle": ["Exotic", "Military", "Riding"]}


def parse_simple_table(caption: str, headers: list[str], kind: str, group: str) -> None:
    """Tables whose last two columns are a measure and a cost."""
    start = find(lambda l: l.strip() == caption, MOUNTS_AT)
    i = start + 1 + len(headers)
    width = len(headers)
    while i + width <= len(LINES):
        row = [l.strip() for l in LINES[i : i + width]]
        if row[0] in BANNER_VARIANTS and not is_cost(row[-1]):
            banner = row[0]
            i += 1
            for variant in BANNER_VARIANTS[banner]:
                name, measure, cost = (l.strip() for l in LINES[i : i + width])
                assert name == variant, f"{banner}: expected {variant!r}, got {name!r}"
                add(
                    f"{banner}, {variant}",
                    kind,
                    group,
                    cost,
                    measure,
                    [],
                    fallback=f"{group}. {cost}.",
                )
                i += width
            continue
        if not is_cost(row[-1]):
            break
        measure, cost = row[-2], row[-1]
        add(
            row[0],
            kind,
            group,
            cost,
            measure if headers[-2] == "Weight" else DASH,
            [(headers[-2], measure)] if headers[-2] != "Weight" else [],
            fallback=f"{group}. {cost}.",
        )
        i += width


VEHICLE_COLUMNS = [
    "Ship", "Speed", "Crew", "Passengers", "Cargo (Tons)", "AC", "HP",
    "Damage Threshold", "Cost",
]


def parse_mounts() -> tuple[str, str]:
    animals_at = find(lambda l: l.strip() == "Mounts and Other Animals", MOUNTS_AT + 2)
    large_at = find(lambda l: l.strip() == "Large Vehicles", MOUNTS_AT)
    mounts_intro = to_html(LINES[MOUNTS_AT + 1 : animals_at])

    parse_simple_table(
        "Mounts and Other Animals",
        ["Item", "Carrying Capacity", "Cost"],
        "mount",
        "Mounts and Other Animals",
    )
    parse_simple_table(
        "Tack, Harness, and Drawn Vehicles",
        ["Item", "Weight", "Cost"],
        "vehicle",
        "Tack, Harness, and Drawn Vehicles",
    )

    ships_at = find(lambda l: l.strip() == "Airborne and Waterborne Vehicles", large_at)
    vehicles_intro = to_html(LINES[large_at + 1 : ships_at])
    i = ships_at + 1 + len(VEHICLE_COLUMNS)
    while i + len(VEHICLE_COLUMNS) <= len(LINES):
        row = [l.strip() for l in LINES[i : i + len(VEHICLE_COLUMNS)]]
        if not is_cost(row[-1]):
            break
        add(
            row[0],
            "vehicle",
            "Airborne and Waterborne Vehicles",
            row[-1],
            DASH,
            list(zip(VEHICLE_COLUMNS[1:-1], row[1:-1])),
            fallback=f"Large vehicle. Speed {row[1]}, AC {row[5]}, {row[6]} HP.",
        )
        i += len(VEHICLE_COLUMNS)
    return mounts_intro, vehicles_intro


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

armor_intro = parse_armor()
tools_intro = parse_tools()
gear_intro = parse_gear()
mounts_intro, vehicles_intro = parse_mounts()

seen: dict[str, str] = {}
for item in items:
    if item["slug"] in seen:
        raise SystemExit(f"duplicate slug {item['slug']!r} ({seen[item['slug']]} / {item['name']})")
    seen[item["slug"]] = item["name"]

items.sort(key=lambda e: e["name"])
OUT_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
OUT_INTRO.write_text(
    json.dumps(
        {
            "armor": armor_intro,
            "tools": tools_intro,
            "gear": gear_intro,
            "mounts": mounts_intro,
            "vehicles": vehicles_intro,
        },
        ensure_ascii=False,
        indent=1,
    )
    + "\n",
    encoding="utf-8",
)

counts: dict[str, int] = {}
for item in items:
    counts[item["kind"]] = counts.get(item["kind"], 0) + 1
print(f"equipment.json: {len(items)} items " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
