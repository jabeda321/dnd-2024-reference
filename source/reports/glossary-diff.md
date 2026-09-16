# Glossary build report

Source of truth: `source/extracted/glossary.txt` (SRD 5.2.1 "Rules Glossary",
PDF pages 176-191, extracted with PyMuPDF). Cross-checked against
`source/SRD_CC_v5.2.1.pdf` directly (via pymupdf `page.get_text("text")`)
wherever the extracted text looked incomplete or garbled. Legacy reference:
`source/legacy/dnd_2024.html` (`glossaryData`, 155 entries).

## Totals

- **155 SRD glossary entries** built into `src/data/glossary.json` (the
  "Glossary Conventions" intro section is intentionally excluded, per spec).
- **155 legacy entries** in `dnd_2024.html`.
- **Legacy titles with no SRD match: none.**
- **SRD entries not in legacy: none.**

The two title sets are identical, one-to-one. (An earlier draft of the
extraction file *did* silently drop several entries — see "Extraction
problems" below — but the regenerated `glossary.txt` and a direct PDF
re-extraction both confirm all 155 SRD entries are present and accounted
for.)

## Category breakdown (glossary.json)

| Category | Count |
|---|---|
| Combat | 32 |
| Core Rules | 25 |
| Movement & Position | 17 |
| Conditions | 16 |
| Actions | 15 |
| Creatures & Social | 14 |
| Hazards & Environment | 11 |
| Abilities & Checks | 10 |
| Spellcasting | 8 |
| Areas of Effect | 7 |
| **Total** | **155** |

(Legacy's own categories don't map 1:1 onto the required 10-category set,
so all 155 entries were re-categorized by hand against the target list.)

## Entries where legacy text meaningfully differed from the SRD

Most differences are terminology updates from the 2024 rules revision
(SRD 5.1 → 5.2.1), or the legacy scrape simply omitting tables/lists that
the SRD entry actually contains. None change game-rules meaning; all are
noted here for completeness.

- **Weapon Attack** — legacy `content` field accidentally captured
  D&D Beyond page-footer HTML (social links, nav) appended after the real
  one-sentence definition; not a real text difference.
- **Hit Point Dice**, **Player Character**, **Experience Points** — legacy
  cites the old chapter name "Creating a Character"; SRD 5.2.1 renamed it
  "Character Creation."
- **Damage Types**, **Challenge Rating**, **Experience Points** — legacy
  says "Dungeon Master" / "DM"; SRD 5.2.1 uses the generic "Game Master" /
  "GM" throughout (trademark-neutral terminology).
- **Experience Points** — legacy has an extra sentence ("The Dungeon
  Master's Guide provides guidance on awarding XP.") not present in the
  SRD, and cites "Level Advancement" via "Creating a Character" instead of
  standalone.
- **Study**, **Search**, **Damage Types**, **Dehydration**, **Malnutrition**,
  **Carrying Capacity**, **Influence**, **Breaking Objects** — legacy's
  `content` field is plain text with the entry's associated table stripped
  out; the SRD versions here include the full table (Areas of Knowledge,
  Search, Damage Types, Water/Food Needs per Day, Carrying Capacity,
  Influence Checks, Object AC/HP).
- **Condition**, **Action**, **Area of Effect**, **Creature Type** — legacy
  flattens the bare name-lists (conditions/actions/shapes/creature types)
  into inline space-separated text; SRD version here renders them as
  `<ul><li>` lists. Action's legacy text also has a duplicated trailing
  "Actions: Attack, Dash, ..." summary line not in the SRD.
- **Challenge Rating** — legacy cites "The Dungeon Master's Guide"; SRD
  5.2.1 cites "Gameplay Toolbox" ("Combat Encounters") instead.

No entries were found where the legacy text stated different game
mechanics/numbers than the SRD — differences are consistently naming/
formatting, not rules content.

## Extraction problems found and fixed

An earlier version of `source/extracted/glossary.txt` (before the
coordinator regenerated it with PyMuPDF's native reading order) **silently
dropped entire entries and headings**, rather than just mis-wrapping lines:

- Entries **Size** and **Sphere [Area of Effect]** were missing entirely
  (no heading, no body).
- **Search [Action]** and **Study [Action]** were missing their heading and
  intro paragraph (only the trailing table survived, mislabeled).
- **Cover**, **Disadvantage**, **Cylinder [Area of Effect]**,
  **Deafened [Condition]**, **Experience Points**, **Hit Points**,
  **Initiative**, **Target**, **Tremorsense**, and **Campaign** were
  missing entirely.

All of the above were recovered by re-extracting the affected PDF pages
directly with PyMuPDF and cross-checking against the regenerated
`glossary.txt` (which matches the direct PDF extraction). The final
`glossary.json` was built from the regenerated `glossary.txt` and verified
to contain all 155 entries with complete bodies (spot-checked every
multi-paragraph and every table entry against the PDF; see below).

Other parsing issues handled while building `scripts/build_glossary.py`:

- **Flattened tables**: 9 tables across 8 entries (Breaking Objects has
  two: Object Armor Class and Object Hit Points) are stored one cell per
  line in the extracted text, and some split across a page/column break
  with a repeated header row (Damage Types) or two side-by-side sub-tables
  each with their own header (Water Needs per Day, Food Needs per Day).
  These 8 entries' HTML bodies (including tables) were hand-authored
  against the verified PDF text rather than auto-parsed, since safe
  row/column reassembly isn't mechanical.
- **Duplicate heading lines**: title lines like "Action", "Area of Effect",
  "Condition" list their own family members by name right in their body
  text (e.g. "Attack / Dash / Disengage / ..."), which look like entry
  headings themselves; these were disambiguated from the real tagged
  headings (e.g. "Attack [Action]") and rendered as `<ul>` lists in the
  parent entry instead of separate entries.
- **Table column headers that coincide with glossary titles**: "Size"
  (used as a table column header in 3 different tables), "Skill" (2
  tables), and "Ability Check" (1 table) each produce a false-positive
  heading match; resolved by picking the occurrence followed by a real
  defining sentence rather than a short table cell.
- **Non-tab bold lead-in lists**: Long Rest, Short Rest, and Truesight lay
  out their sub-lists ("Regain All HP.", "Darkness.", etc.) as plain lines
  without the usual indentation, unlike every other entry's tab-indented
  sub-paragraphs (e.g. Blinded's "Can't See."). Handled with a heuristic
  that treats a short Title Case phrase followed by ". " as a new bold
  lead-in paragraph when it follows a sentence- or list-intro-ending line.
- **Bullet lists split across a paragraph boundary**: Long Rest's
  "Interrupting the Rest" bullet list is immediately followed (on the next
  physical line, no bullet) by an unrelated closing sentence ("If you
  rested at least 1 hour before the interruption..."); resolved by ending
  the list as soon as a non-bulleted line starts with a capital letter
  (wrapped bullet continuations start lowercase in every case checked).

## Things I was unsure about

- A few "See also" clauses reference a glossary term only as a subsection
  name inside a chapter citation, e.g. Ability Check's
  `See also "Playing the Game" ("D20 Tests" and "Proficiency")`. Where the
  quoted subsection name exactly matches another glossary entry's title
  (here, "Proficiency"), it's counted as a `seeAlso` link even though the
  SRD's own intent is arguably "see that section of the Playing the Game
  chapter," not "see the Proficiency glossary entry." Left in per the
  instructions' literal wording ("explicitly referenced" by name).
- `seeAlso` also includes any other glossary term mentioned by name
  anywhere in an entry's body (not just in "See also" clauses), per the
  instructions. This produces some long lists (e.g. Stat Block links to 24
  other entries) that are accurate but may be more than a hand-curated
  list would include.
