# Weapons: Legacy vs. SRD Diff

## Counts

| File | Weapons | Properties | Masteries |
|---|---|---|---|
| `source/legacy/dnd_2024_weapons.html` | 38 | 10 | 8 |
| `src/data/weapons.json` (SRD, this build) | 38 | 10 | 8 |

All 38 weapon rows were cross-checked against `source/SRD_CC_v5.2.1.pdf` pages 91-92 via `pymupdf` text extraction (`get_text("text")` in reading order), not just against `source/extracted/weapons.txt`. Row counts by section: Simple Melee 10, Simple Ranged 4, Martial Melee 18, Martial Ranged 6 = 38 total. Matches legacy exactly.

## Field-level discrepancies (weapon rows)

**None found.** Every weapon's `damage`, `properties` text, `mastery`, `weight`, and `cost` in the legacy `weaponsData.weapons` array matches the SRD PDF exactly, including the unusual ones (Dart 1/4 lb., Sling weight "—", Blowgun flat "1" damage die, Lance's "Two-Handed (unless mounted)" note).

## Property/mastery text differences

- **Light** (property): legacy's description **omits the SRD's trailing example sentence** — "For example, you can attack with a Shortsword in one hand and a Dagger in the other using the Attack action and a Bonus Action, but you don't add your Strength or Dexterity modifier to the damage roll of the Bonus Action unless that modifier is negative." `src/data/properties.json` includes the full SRD text (this sentence restored).
- All other 9 property descriptions (Ammunition, Finesse, Heavy, Loading, Range, Reach, Thrown, Two-Handed, Versatile) and all 8 mastery descriptions (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex) match the legacy text verbatim — no differences.

## Extraction gaps found in `source/extracted/weapons.txt` (fixed via direct PDF re-extraction)

The pre-extracted `weapons.txt` silently **dropped two full property/mastery definitions** due to two-column page layout on PDF pages 89-90 (they were on the page but skipped by the extraction pass): the **Loading** property and the **Cleave** mastery property. Both were recovered by re-extracting PDF pages 89-90 directly with `pymupdf` (`doc[88]`, `doc[89]`) in true reading order, and both recovered texts matched the legacy HTML's text for those two entries verbatim, confirming correctness. `weapons.txt` also mis-ordered the tail of the Martial Ranged Weapons table across the page 91→92 boundary (trailing mastery/weight/cost fields for Heavy Crossbow, Longbow, and Musket got shuffled after a footer insertion); this was likewise resolved by re-extracting pages 91-92 directly, which returned all rows in correct top-to-bottom order and matched known weapon stats (e.g., Heavy Crossbow 18 lb./50 GP, Longbow 2 lb./50 GP, Musket 10 lb./500 GP).

## Uncertain / notes

- The SRD's "Weapon Proficiency" sidebar note (page 89, between the Mastery lead-in paragraph and the Properties intro) was **not** included in `weapons-intro.json`, since the task's spec enumerates only Category/Melee-or-Ranged/Damage/Properties/Mastery lead-ins plus the Improvised Weapons note. Flagging in case it's wanted later.
- No other doubtful readings remain; all weight/cost/damage/property values were confirmed against the PDF directly, not solely against the legacy file or the flawed extraction.
