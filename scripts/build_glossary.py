#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build src/data/glossary.json from source/extracted/glossary.txt (SRD 5.2.1
Rules Glossary, PDF pages 176-191, extracted via PyMuPDF).

Approach:
1. Read the extracted text, strip running footers / page markers.
2. Locate the 155 real glossary entry headings (disambiguating from
   duplicate lines that appear as list items or table headers).
3. Slice the text between consecutive headings into each entry's body.
4. A handful of entries contain tables; those are hand-authored as exact
   HTML because the flattened table text needs row/column reassembly that
   isn't safely automatable.
5. Everything else is parsed generically: tab-indented lines start a new
   paragraph (often with a bold lead-in term), bullet lines become <li>,
   bare single-word lines following a ":" become a plain <ul> list, and
   consecutive Title Case "Term. Sentence" lines following a sentence-final
   line are also treated as bold lead-in paragraphs (e.g. Long Rest).
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_TXT = ROOT / "source" / "extracted" / "glossary.txt"
OUT_JSON = ROOT / "src" / "data" / "glossary.json"

TAGS = {"Action", "Area of Effect", "Attitude", "Condition", "Hazard"}

# ---------------------------------------------------------------------------
# Load + clean raw text
# ---------------------------------------------------------------------------

raw = SRC_TXT.read_text(encoding="utf-8")
lines = raw.split("\n")

FOOTER = "System Reference Document 5.2.1"


def is_noise(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    if s.startswith("<<<PAGE") and s.endswith(">>>"):
        return True
    if s == FOOTER:
        return True
    if re.fullmatch(r"\d{1,3}", s):
        return True
    return False


clean_lines = [l for l in lines if not is_noise(l)]

# Drop the front-matter: "Rules Glossary" / "Glossary Conventions" intro and
# the abbreviations table, up through "Rules Definitions". Real entries
# start right after that line.
start_idx = None
for i, l in enumerate(clean_lines):
    if l.strip() == "Rules Definitions":
        start_idx = i + 1
        break
assert start_idx is not None
clean_lines = clean_lines[start_idx:]

# ---------------------------------------------------------------------------
# Legacy title list (from source/legacy/dnd_2024.html) - used only to know
# the canonical set of 155 entry titles / to seed category+cross-ref ideas.
# ---------------------------------------------------------------------------
legacy_html = (ROOT / "source" / "legacy" / "dnd_2024.html").read_text(encoding="utf-8")
m = re.search(r"const glossaryData\s*=\s*(\[.*?\]);", legacy_html, re.S)
legacy_entries = {d["title"]: d for d in json.loads(m.group(1))}
LEGACY_TITLES = set(legacy_entries.keys())
assert len(LEGACY_TITLES) == 155

HEAD_RE = re.compile(r"^([A-Z][^\[\]]*?)(?: \[(Action|Area of Effect|Attitude|Condition|Hazard)\])?$")

candidates = []  # (index, title, tag)
for i, l in enumerate(clean_lines):
    s = l.strip()
    mm = HEAD_RE.match(s)
    if not mm:
        continue
    title = mm.group(1).strip()
    if title in LEGACY_TITLES:
        candidates.append((i, title, mm.group(2)))

# Tagged families: only the tagged occurrence is real; untagged occurrences
# of the same title are list-intro items (Action/Area of Effect/Condition
# entries list their family members by name).
TAGGED_TITLES = {
    t for t, d in legacy_entries.items()
    if False  # placeholder, replaced below
}
# Determine tagged titles directly from candidates: any title that appears
# at least once WITH a tag is a tagged-family title.
tagged_titles = {t for (_, t, tag) in candidates if tag}

filtered = []
for (i, t, tag) in candidates:
    if t in tagged_titles and tag is None:
        continue  # list-intro false positive
    filtered.append((i, t, tag))

# Remaining duplicate (untagged) titles: table-header / table-caption false
# positives. Keep the occurrence whose next non-blank line looks like the
# start of a real definition (a longish sentence), not a short table cell.
by_title = {}
for (i, t, tag) in filtered:
    by_title.setdefault(t, []).append((i, tag))

heads = []
for t, occs in by_title.items():
    if len(occs) == 1:
        heads.append((occs[0][0], t, occs[0][1]))
        continue
    best = None
    for (i, tag) in occs:
        nxt = clean_lines[i + 1].strip() if i + 1 < len(clean_lines) else ""
        if len(nxt) > 20:
            best = (i, tag)
            break
    if best is None:
        best = occs[0]
    heads.append((best[0], t, best[1]))

heads.sort(key=lambda h: h[0])
assert len(heads) == 155, f"expected 155 headings, got {len(heads)}"
assert {h[1] for h in heads} == LEGACY_TITLES

# ---------------------------------------------------------------------------
# Slice bodies
# ---------------------------------------------------------------------------
entries_raw = []
for idx, (line_i, title, tag) in enumerate(heads):
    body_start = line_i + 1
    body_end = heads[idx + 1][0] if idx + 1 < len(heads) else len(clean_lines)
    body_lines = clean_lines[body_start:body_end]
    entries_raw.append({"title": title, "tag": tag, "lines": body_lines})

# ---------------------------------------------------------------------------
# Generic body -> HTML parser
# ---------------------------------------------------------------------------
CONNECTORS = {"and", "or", "the", "a", "an", "to", "of", "in", "between", "on",
              "per", "with", "or,", "objects"}


def is_leadin_first_part(s: str) -> bool:
    """True if s (text before the first '. ') looks like a bold lead-in term
    (Title Case phrase), not a full sentence."""
    tokens = s.split(" ")
    if not tokens or len(tokens) > 8:
        return False
    for tok in tokens:
        core = tok.strip(",")
        if not core:
            continue
        if core[0].isupper() or core[0].isdigit() or core.lower() in CONNECTORS:
            continue
        return False
    return True


def split_leadin(text: str):
    """If text starts with a bold lead-in term ('Term. Rest...'), return
    (term, rest). Else return (None, text)."""
    m = re.match(r"^(.{1,60}?)\.\s(.*)$", text, re.S)
    if not m:
        return None, text
    term, rest = m.group(1), m.group(2)
    if is_leadin_first_part(term):
        return term, rest
    return None, text


def is_bare_name_line(line: str) -> bool:
    s = line.strip()
    if not s or s[-1] in ".,:;":
        return False
    words = s.split(" ")
    if len(words) > 4:
        return False
    for w in words:
        if not w or not (w[0].isupper() or w[0].isdigit()):
            return False
    return True


def join_hyphen(acc: str, nxt: str) -> str:
    nxt = nxt.strip()
    if acc.endswith("-") and nxt:
        if nxt[0].islower():
            return acc[:-1] + nxt
        return acc + nxt
    if not acc:
        return nxt
    return acc + " " + nxt


def esc(s: str) -> str:
    return s  # curly quotes/text pass through as-is; no HTML-special chars expected


def render_paragraph(text: str) -> str:
    term, rest = split_leadin(text)
    if term is not None:
        return f"<p><strong>{esc(term)}.</strong> {esc(rest)}</p>"
    return f"<p>{esc(text)}</p>"


def parse_body(lines_):
    """Return list of HTML block strings for a generic (non-table) entry."""
    segments = []  # list of dicts: {type: 'p'|'li'|'bare', text: str}
    i = 0
    n = len(lines_)
    cur_type = None
    cur_text = ""

    def flush():
        nonlocal cur_type, cur_text
        if cur_type is not None and cur_text.strip():
            segments.append({"type": cur_type, "text": cur_text.strip()})
        cur_type = None
        cur_text = ""

    prev_physical = ""
    while i < n:
        raw_line = lines_[i]
        stripped = raw_line.strip()
        if raw_line.startswith("\t") or raw_line.startswith(" \t"):
            flush()
            cur_type = "p"
            cur_text = stripped
        elif stripped.startswith("•"):
            if cur_type != "li":
                flush()
                cur_type = "li"
            item = stripped.lstrip("•").lstrip("\t").strip()
            if cur_text:
                segments.append({"type": "li", "text": cur_text})
                cur_text = item
            else:
                cur_text = item
        else:
            # bare-name list detection: previous physical line ended with ':'
            # and this line is a short bare capitalized phrase. Once in bare
            # mode, keep collecting only while lines keep qualifying; the
            # first line that doesn't qualify ends the list.
            in_bare_continue = cur_type == "bare" and is_bare_name_line(stripped)
            bare_start = cur_type != "bare" and prev_physical.rstrip().endswith(":") and is_bare_name_line(stripped)
            if in_bare_continue or bare_start:
                if cur_type != "bare":
                    flush()
                    cur_type = "bare"
                    cur_text = ""
                if cur_text:
                    segments.append({"type": "bare_item", "text": cur_text})
                cur_text = stripped
            elif cur_type == "bare":
                # line doesn't qualify as a bare item any more: close the
                # list and start a fresh paragraph with this line.
                if cur_text:
                    segments.append({"type": "bare_item", "text": cur_text})
                cur_type = None
                cur_text = ""
                cur_type = "p"
                cur_text = stripped
            elif cur_type == "p" and prev_physical.rstrip().endswith((".", ":")) and (m := re.match(r"^(.{1,60}?)\.\s", stripped)) and is_leadin_first_part(m.group(1)):
                flush()
                cur_type = "p"
                cur_text = stripped
            elif cur_type == "li" and stripped[:1].isupper():
                # A capitalized line after a bullet item (which itself has no
                # terminal period) is a new paragraph, not a wrapped
                # continuation of the last bullet's phrase.
                if cur_text:
                    segments.append({"type": "li", "text": cur_text})
                cur_type = "p"
                cur_text = stripped
            elif cur_type is None:
                cur_type = "p"
                cur_text = stripped
            else:
                cur_text = join_hyphen(cur_text, stripped)
        prev_physical = stripped
        i += 1
    # flush trailing
    if cur_type == "li" and cur_text:
        segments.append({"type": "li", "text": cur_text})
    elif cur_type == "bare" and cur_text:
        segments.append({"type": "bare_item", "text": cur_text})
    else:
        flush()

    # Render segments -> HTML, grouping consecutive li/bare_item into <ul>
    html_blocks = []
    j = 0
    while j < len(segments):
        seg = segments[j]
        if seg["type"] == "li":
            items = []
            while j < len(segments) and segments[j]["type"] == "li":
                items.append(segments[j]["text"])
                j += 1
            html_blocks.append("<ul>" + "".join(f"<li>{esc(t)}</li>" for t in items) + "</ul>")
        elif seg["type"] == "bare_item":
            items = []
            while j < len(segments) and segments[j]["type"] == "bare_item":
                items.append(segments[j]["text"])
                j += 1
            html_blocks.append("<ul>" + "".join(f"<li>{esc(t)}</li>" for t in items) + "</ul>")
        else:
            html_blocks.append(render_paragraph(seg["text"]))
            j += 1
    return html_blocks


def plain_text_of_blocks(html_blocks):
    text = " ".join(html_blocks)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Hand-authored bodies for the 8 entries containing tables (flattened table
# text needs manual row/column reassembly; verified against the PDF).
# ---------------------------------------------------------------------------
DASH = "–"
Q = "‘"  # not used
LQ = "“"
RQ = "”"
APOS = "’"
MUL = "×"
EM = "—"

TABLE_BODIES = {}

TABLE_BODIES["Breaking Objects"] = "".join([
    f"<p>Objects can be harmed by attacks and by some spells, using the rules below. If an object is exceedingly fragile, the GM may allow a creature to break it automatically with the Attack or Utilize action.</p>",
    f"<p><strong>Armor Class.</strong> The Object Armor Class table suggests ACs for various substances.</p>",
    "<table><thead><tr><th>AC</th><th>Substance</th></tr></thead><tbody>"
    "<tr><td>11</td><td>Cloth, paper, rope</td></tr>"
    "<tr><td>13</td><td>Crystal, glass, ice</td></tr>"
    "<tr><td>15</td><td>Wood</td></tr>"
    "<tr><td>17</td><td>Stone</td></tr>"
    "<tr><td>19</td><td>Iron, steel</td></tr>"
    "<tr><td>21</td><td>Mithral</td></tr>"
    "<tr><td>23</td><td>Adamantine</td></tr>"
    "</tbody></table>",
    f"<p><strong>Hit Points.</strong> An object is destroyed when it has 0 Hit Points. The Object Hit Points table suggests Hit Points for fragile and resilient objects that are Large or smaller. To track Hit Points for a Huge or Gargantuan object, divide it into Large or smaller sections, and track each section{APOS}s Hit Points separately. The GM determines whether destroying part of an object causes the whole thing to collapse.</p>",
    "<table><thead><tr><th>Size</th><th>Fragile</th><th>Resilient</th></tr></thead><tbody>"
    "<tr><td>Tiny (bottle, lock)</td><td>2 (1d4)</td><td>5 (2d4)</td></tr>"
    "<tr><td>Small (chest, lute)</td><td>3 (1d6)</td><td>10 (3d6)</td></tr>"
    "<tr><td>Medium (barrel, chandelier)</td><td>4 (1d8)</td><td>18 (4d8)</td></tr>"
    "<tr><td>Large (cart, dining table)</td><td>5 (1d10)</td><td>27 (5d10)</td></tr>"
    "</tbody></table>",
    f"<p><strong>Damage Types and Objects.</strong> Objects have Immunity to Poison and Psychic damage. The GM might decide that some damage types are more or less effective against an object. For example, Bludgeoning damage works well for smashing things but not for cutting. Paper or cloth objects might have Vulnerability to Fire damage.</p>",
    f"<p><strong>Damage Threshold.</strong> Big objects, such as castle walls, often have extra resilience represented by a damage threshold. See also {LQ}Damage Threshold.{RQ}</p>",
    f"<p><strong>No Ability Scores.</strong> An object lacks ability scores unless a rule assigns scores to the object. Without ability scores, an object can{APOS}t make ability checks, and it fails all saving throws.</p>",
])

TABLE_BODIES["Carrying Capacity"] = "".join([
    f"<p>Your size and Strength score determine the maximum weight in pounds that you can carry, as shown in the Carrying Capacity table. The table also shows the maximum weight you can drag, lift, or push.</p>",
    f"<p>While dragging, lifting, or pushing weight in excess of the maximum weight you can carry, your Speed can be no more than 5 feet.</p>",
    "<table><thead><tr><th>Creature Size</th><th>Carry</th><th>Drag/Lift/Push</th></tr></thead><tbody>"
    f"<tr><td>Tiny</td><td>Str. {MUL} 7.5 lb.</td><td>Str. {MUL} 15 lb.</td></tr>"
    f"<tr><td>Small/Medium</td><td>Str. {MUL} 15 lb.</td><td>Str. {MUL} 30 lb.</td></tr>"
    f"<tr><td>Large</td><td>Str. {MUL} 30 lb.</td><td>Str. {MUL} 60 lb.</td></tr>"
    f"<tr><td>Huge</td><td>Str. {MUL} 60 lb.</td><td>Str. {MUL} 120 lb.</td></tr>"
    f"<tr><td>Gargantuan</td><td>Str. {MUL} 120 lb.</td><td>Str. {MUL} 240 lb.</td></tr>"
    "</tbody></table>",
])

TABLE_BODIES["Damage Types"] = "".join([
    f"<p>Attacks and other harmful effects deal different types of damage. Damage types have no rules of their own, but other rules, such as Resistance, rely on the types. The Damage Types table offers examples to help a GM assign a type to a new effect.</p>",
    "<table><thead><tr><th>Type</th><th>Examples</th></tr></thead><tbody>"
    "<tr><td>Acid</td><td>Corrosive liquids, digestive enzymes</td></tr>"
    "<tr><td>Bludgeoning</td><td>Blunt objects, constriction, falling</td></tr>"
    "<tr><td>Cold</td><td>Freezing water, icy blasts</td></tr>"
    "<tr><td>Fire</td><td>Flames, unbearable heat</td></tr>"
    "<tr><td>Force</td><td>Pure magical energy</td></tr>"
    "<tr><td>Lightning</td><td>Electricity</td></tr>"
    "<tr><td>Necrotic</td><td>Life-draining energy</td></tr>"
    "<tr><td>Piercing</td><td>Fangs, puncturing objects</td></tr>"
    "<tr><td>Poison</td><td>Toxic gas, venom</td></tr>"
    "<tr><td>Psychic</td><td>Mind-rending energy</td></tr>"
    "<tr><td>Radiant</td><td>Holy energy, searing radiation</td></tr>"
    "<tr><td>Slashing</td><td>Claws, cutting objects</td></tr>"
    "<tr><td>Thunder</td><td>Concussive sound</td></tr>"
    "</tbody></table>",
])

TABLE_BODIES["Dehydration"] = "".join([
    f"<p>A creature requires an amount of water per day based on its size, as shown in the Water Needs per Day table. A creature that drinks less than half the required water for a day gains 1 Exhaustion level at the day{APOS}s end. Exhaustion caused by dehydration can{APOS}t be removed until the creature drinks the full amount of water required for a day. See also {LQ}Exhaustion.{RQ}</p>",
    "<table><thead><tr><th>Size</th><th>Water</th></tr></thead><tbody>"
    "<tr><td>Tiny</td><td>1/4 gallon</td></tr>"
    "<tr><td>Small</td><td>1 gallon</td></tr>"
    "<tr><td>Medium</td><td>1 gallon</td></tr>"
    "<tr><td>Large</td><td>4 gallons</td></tr>"
    "<tr><td>Huge</td><td>16 gallons</td></tr>"
    "<tr><td>Gargantuan</td><td>64 gallons</td></tr>"
    "</tbody></table>",
])

TABLE_BODIES["Malnutrition"] = "".join([
    f"<p>A creature needs an amount of food per day based on its size, as shown in the Food Needs per Day table. A creature that eats but consumes less than half the required food for a day must succeed on a DC 10 Constitution saving throw or gain 1 Exhaustion level at the day{APOS}s end. A creature that eats nothing for 5 days automatically gains 1 Exhaustion level at the end of the fifth day as well as an additional level at the end of each subsequent day without food.</p>",
    f"<p>Exhaustion caused by malnutrition can{APOS}t be removed until the creature eats the full amount of food required for a day. See also {LQ}Exhaustion.{RQ}</p>",
    "<table><thead><tr><th>Size</th><th>Food</th></tr></thead><tbody>"
    "<tr><td>Tiny</td><td>1/4 pound</td></tr>"
    "<tr><td>Small</td><td>1 pound</td></tr>"
    "<tr><td>Medium</td><td>1 pound</td></tr>"
    "<tr><td>Large</td><td>4 pounds</td></tr>"
    "<tr><td>Huge</td><td>16 pounds</td></tr>"
    "<tr><td>Gargantuan</td><td>64 pounds</td></tr>"
    "</tbody></table>",
])

TABLE_BODIES["Influence"] = "".join([
    f"<p>With the Influence action, you urge a monster to do something. Describe or roleplay how you{APOS}re communicating with the monster. Are you trying to deceive, intimidate, amuse, or gently persuade? The GM then determines whether the monster feels willing, unwilling, or hesitant due to your interaction; this determination establishes whether an ability check is necessary, as explained below.</p>",
    f"<p><strong>Willing.</strong> If your urging aligns with the monster{APOS}s desires, no ability check is necessary; the monster fulfills your request in a way it prefers.</p>",
    f"<p><strong>Unwilling.</strong> If your urging is repugnant to the monster or counter to its alignment, no ability check is necessary; it doesn{APOS}t comply.</p>",
    f"<p><strong>Hesitant.</strong> If you urge the monster to do something that it is hesitant to do, you must make an ability check, which is affected by the monster{APOS}s attitude: Indifferent, Friendly, or Hostile, each of which is defined in this glossary. The Influence Checks table suggests which ability check to make based on how you{APOS}re interacting with the monster. The GM chooses the check, which has a default DC equal to 15 or the monster{APOS}s Intelligence score, whichever is higher. On a successful check, the monster does as urged. On a failed check, you must wait 24 hours (or a duration set by the GM) before urging it in the same way again.</p>",
    "<table><thead><tr><th>Ability Check</th><th>Interaction</th></tr></thead><tbody>"
    "<tr><td>Charisma (Deception)</td><td>Deceiving a monster that understands you</td></tr>"
    "<tr><td>Charisma (Intimidation)</td><td>Intimidating a monster</td></tr>"
    "<tr><td>Charisma (Performance)</td><td>Amusing a monster</td></tr>"
    "<tr><td>Charisma (Persuasion)</td><td>Persuading a monster that understands you</td></tr>"
    "<tr><td>Wisdom (Animal Handling)</td><td>Gently coaxing a Beast or Monstrosity</td></tr>"
    "</tbody></table>",
])

TABLE_BODIES["Search"] = "".join([
    f"<p>When you take the Search action, you make a Wisdom check to discern something that isn{APOS}t obvious. The Search table suggests which skills are applicable when you take this action, depending on what you{APOS}re trying to detect.</p>",
    "<table><thead><tr><th>Skill</th><th>Thing to Detect</th></tr></thead><tbody>"
    f"<tr><td>Insight</td><td>Creature{APOS}s state of mind</td></tr>"
    "<tr><td>Medicine</td><td>Creature’s ailment or cause of death</td></tr>"
    "<tr><td>Perception</td><td>Concealed creature or object</td></tr>"
    "<tr><td>Survival</td><td>Tracks or food</td></tr>"
    "</tbody></table>",
])

TABLE_BODIES["Study"] = "".join([
    f"<p>When you take the Study action, you make an Intelligence check to study your memory, a book, a clue, or another source of knowledge and call to mind an important piece of information about it.</p>",
    f"<p>The Areas of Knowledge table suggests which skills are applicable to various areas of knowledge.</p>",
    "<table><thead><tr><th>Skill</th><th>Areas</th></tr></thead><tbody>"
    "<tr><td>Arcana</td><td>Spells, magic items, eldritch symbols, magical traditions, planes of existence, and certain creatures (Aberrations, Constructs, Elementals, Fey, and Monstrosities)</td></tr>"
    "<tr><td>History</td><td>Historic events and people, ancient civilizations, wars, and certain creatures (Giants and Humanoids)</td></tr>"
    "<tr><td>Investigation</td><td>Traps, ciphers, riddles, and gadgetry</td></tr>"
    "<tr><td>Nature</td><td>Terrain, flora, weather, and certain creatures (Beasts, Dragons, Oozes, and Plants)</td></tr>"
    "<tr><td>Religion</td><td>Deities, religious hierarchies and rites, holy symbols, cults, and certain creatures (Celestials, Fiends, and Undead)</td></tr>"
    "</tbody></table>",
])

# Fix curly quotes in the hand-authored strings above (they used LQ/RQ/APOS
# constants for the few needed; everything else is plain ASCII-safe text
# already matching the SRD's punctuation style).

# ---------------------------------------------------------------------------
# Category mapping (all 155 titles)
# ---------------------------------------------------------------------------
CATEGORY = {}


def cat(names, c):
    for n in names.split(","):
        n = n.strip()
        CATEGORY[n] = c


cat("Action,Attack,Bonus Action,Dash,Disengage,Dodge,Help,Hide,Influence,Magic,"
    "Reaction,Ready,Search,Study,Utilize", "Actions")

cat("Blinded,Charmed,Condition,Deafened,Exhaustion,Frightened,Grappled,"
    "Incapacitated,Invisible,Paralyzed,Petrified,Poisoned,Prone,Restrained,"
    "Stunned,Unconscious", "Conditions")

cat("Armor Class,Armor Training,Attack Roll,Bloodied,Breaking Objects,Cover,"
    "Critical Hit,Damage,Damage Roll,Damage Threshold,Damage Types,Dead,"
    "Death Saving Throw,Grappling,Healing,Hit Point Dice,Hit Points,Immunity,"
    "Improvised Weapons,Initiative,Knocking Out a Creature,Opportunity Attacks,"
    "Reach,Resistance,Stable,Surprise,Target,Temporary Hit Points,"
    "Unarmed Strike,Vulnerability,Weapon,Weapon Attack", "Combat")

cat("Burrow Speed,Climb Speed,Climbing,Crawling,Difficult Terrain,Fly Speed,"
    "Flying,High Jump,Hover,Jumping,Long Jump,Occupied Space,Speed,Swim Speed,"
    "Swimming,Teleportation,Unoccupied Space", "Movement & Position")

cat("Cantrip,Concentration,Illusions,Magical Effect,Ritual,Spell,Spell Attack,"
    "Spellcasting Focus", "Spellcasting")

cat("Area of Effect,Cone,Cube,Cylinder,Emanation,Line,Sphere", "Areas of Effect")

cat("Bright Light,Burning,Darkness,Dehydration,Dim Light,Falling,Hazard,"
    "Heavily Obscured,Lightly Obscured,Malnutrition,Suffocation",
    "Hazards & Environment")

cat("Ability Check,Ability Score and Modifier,D20 Test,Difficulty Class,"
    "Expertise,Passive Perception,Proficiency,Save,Saving Throw,Skill",
    "Abilities & Checks")

cat("Alignment,Ally,Attitude,Challenge Rating,Creature,Creature Type,Enemy,"
    "Friendly,Hostile,Indifferent,Monster,Nonplayer Character,"
    "Player Character,Stat Block", "Creatures & Social")

cat("Advantage,Adventure,Attunement,Blindsight,Campaign,Carrying Capacity,"
    "Character Sheet,Curses,Darkvision,Disadvantage,Encounter,"
    "Experience Points,Heroic Inspiration,Long Rest,Object,Per Day,"
    "Possession,Round Down,Shape-Shifting,Short Rest,Simultaneous Effects,"
    "Size,Telepathy,Tremorsense,Truesight", "Core Rules")

missing_cat = LEGACY_TITLES - set(CATEGORY.keys())
extra_cat = set(CATEGORY.keys()) - LEGACY_TITLES
assert not missing_cat, f"missing category assignment for: {missing_cat}"
assert not extra_cat, f"category assignment for unknown titles: {extra_cat}"

# ---------------------------------------------------------------------------
# Build entries
# ---------------------------------------------------------------------------
ALLOWED_TAGS_HTML = {"p", "ul", "li", "strong", "em", "h3", "table", "thead",
                      "tbody", "tr", "th", "td"}


def slugify(title: str, tag: str | None) -> str:
    base = title.lower()
    base = base.replace("’", "").replace("'", "")
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    if tag:
        tagslug = tag.lower().replace(" ", "-")
        return f"{base}-{tagslug}"
    return base


def first_sentence(plain: str) -> str:
    m = re.search(r"^(.*?[.!?])(\s|$)", plain)
    s = m.group(1) if m else plain
    if len(s) > 160:
        cut = s[:157]
        cut = cut.rsplit(" ", 1)[0]
        s = cut + "…"
    return s


SEEALSO_RE = re.compile(r"See also (.*?\.)(?:\)|\s|$)")
QUOTED_RE = re.compile(r"“([^”]+)”")
# A quoted term, optionally immediately followed by a parenthesised group of
# one or more quoted sub-references, e.g.:
#   “Playing the Game” (“D20 Tests” and “Proficiency”)   -> chapter + subs
#   “Blinded,”                                            -> bare glossary term
TERM_PAREN_RE = re.compile(r"“([^”]+)”(\s*\(([^)]*)\))?")


def _clean_quoted(s: str) -> str:
    return s.strip().strip(",.").strip()


def extract_seealso_and_refs(plain_text: str, all_titles_by_norm: dict, self_title: str):
    """Parse every 'See also ...' clause term by term. Each quoted item is
    either a bare glossary cross-reference, or a chapter name immediately
    followed by a parenthesised list of quoted subsection names."""
    seealso = set()
    srdrefs = set()
    for m in SEEALSO_RE.finditer(plain_text):
        clause = m.group(1)
        for tm in TERM_PAREN_RE.finditer(clause):
            term = _clean_quoted(tm.group(1))
            paren = tm.group(3)
            if not term:
                continue
            if paren:
                subs = [_clean_quoted(s) for s in QUOTED_RE.findall(paren)]
                subs = [s for s in subs if s]
                if subs:
                    srdrefs.add(f"{term} ({', '.join(subs)})")
                else:
                    srdrefs.add(term)
            else:
                key = term.lower()
                if key in all_titles_by_norm and all_titles_by_norm[key] != self_title:
                    seealso.add(all_titles_by_norm[key])
                elif term != self_title:
                    srdrefs.add(term)
    return seealso, srdrefs


def strip_seealso_clauses(plain_text: str) -> str:
    return SEEALSO_RE.sub("", plain_text)


def scan_body_mentions(plain_text: str, all_titles_by_norm: dict, self_title: str):
    found = set()
    for norm, title in all_titles_by_norm.items():
        if title == self_title:
            continue
        if len(norm) < 4:
            continue
        pattern = r"\b" + re.escape(title) + r"\b"
        if re.search(pattern, plain_text):
            found.add(title)
    return found


all_entries = []
for e in entries_raw:
    title = e["title"]
    tag = e["tag"]
    if title in TABLE_BODIES:
        body_html = TABLE_BODIES[title]
    else:
        blocks = parse_body(e["lines"])
        body_html = "".join(blocks)
    all_entries.append({"title": title, "tag": tag, "body": body_html})

titles_by_norm = {a["title"].lower(): a["title"] for a in all_entries}

result = []
for e in all_entries:
    title = e["title"]
    tag = e["tag"]
    body = e["body"]
    plain = plain_text_of_blocks([body])
    slug = slugify(title, tag)
    summary = first_sentence(plain)
    category = CATEGORY[title]

    seealso, srdrefs = extract_seealso_and_refs(plain, titles_by_norm, title)
    mentioned = scan_body_mentions(strip_seealso_clauses(plain), titles_by_norm, title)
    seealso |= mentioned

    entry = {"slug": slug, "title": title}
    if tag:
        entry["tag"] = tag
    entry["category"] = category
    entry["summary"] = summary
    entry["body"] = body
    if seealso:
        entry["seeAlso"] = sorted(seealso)
    if srdrefs:
        entry["srdRefs"] = sorted(srdrefs)
    result.append(entry)

result.sort(key=lambda e: e["title"])

# slug -> title map for resolving seeAlso to slugs
slug_by_title = {e["title"]: e["slug"] for e in result}
for e in result:
    if "seeAlso" not in e:
        continue
    resolved = [slug_by_title[t] for t in e["seeAlso"] if t in slug_by_title and slug_by_title[t] != e["slug"]]
    if resolved:
        e["seeAlso"] = sorted(resolved)
    else:
        del e["seeAlso"]

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
OUT_JSON.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Wrote {len(result)} entries to {OUT_JSON}")
