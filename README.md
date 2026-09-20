# D&D 2024 Reference

A fast, searchable, offline-capable reference for the **D&D 2024 Rules Glossary**, **weapons**, **weapon properties**, **weapon masteries** and **equipment** (armor, tools, adventuring gear, mounts and vehicles), built from the [SRD 5.2.1](https://www.dndbeyond.com/srd).

Live site: https://jabeda321.github.io/dnd-2024-reference/

Replaces the earlier [`dnd_2024`](https://github.com/jabeda321/dnd_2024) and [`dnd_2024_weapons`](https://github.com/jabeda321/dnd_2024_weapons) sites.

## Features

- Global search palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> or <kbd>/</kbd>) across every rule, weapon, mastery and property
- A page and URL for every entry, so you can share links to rules
- Rules terms in the text are linked, with a preview on hover (desktop) or tap (touch)
- Sortable, filterable weapons and equipment tables that turn into cards on narrow screens
- Favourites and recently viewed, stored on your device
- Light and dark themes (follows your system setting, with a manual toggle)
- Installable PWA that works offline after the first visit

## Development

Requires Node 24+.

```sh
npm install
npm run dev        # http://localhost:4321/dnd-2024-reference/
npm run build      # validate data, type-check, build to dist/, generate service worker
npm run preview
npm test           # Playwright + axe accessibility checks (run after build)
```

## Data

The data in `src/data/*.json` is generated from the SRD PDF, which is the source of truth:

| File | Contents |
| --- | --- |
| `glossary.json` | Rules Glossary entries (`slug`, `title`, `tag`, `category`, `summary`, `body` HTML, `seeAlso`) |
| `combat-rules.json` | Rules from "Playing the Game" that aren't in the Rules Glossary (Mounted Combat); same schema as `glossary.json`, merged into it by `src/lib/data.ts` |
| `weapons.json` | Weapons table with structured properties |
| `properties.json`, `masteries.json` | Weapon property and mastery rules |
| `weapons-intro.json` | Intro text from the SRD Weapons section |
| `equipment.json` | Armor, tools, adventuring gear, mounts and vehicles (`kind`, `group`, `cost`/`costCp`, `weight`/`weightLb`, `stats`, `body` HTML) |
| `equipment-intro.json` | Intro text for each equipment section |

`npm run validate` checks the schema, cross-references and allowed HTML. Raw extraction lives in `source/`:
`source/SRD_CC_v5.2.1.pdf`, `scripts/extract_srd.py` (PyMuPDF) and `source/reports/*` (comparisons against the old sites).

Regenerating the data from the PDF:

```sh
.venv/Scripts/python scripts/extract_srd.py        # PDF -> source/extracted/*.txt
.venv/Scripts/python scripts/build_glossary.py     # -> glossary.json
.venv/Scripts/python scripts/build_combat_rules.py # -> combat-rules.json
.venv/Scripts/python scripts/build_equipment.py    # -> equipment.json, equipment-intro.json
```

`extract_srd.py` marks the SRD's bold-italic paragraph lead-ins as `**…**` in `equipment.txt`, because that styling is the only thing separating a lead-in term from an ordinary opening sentence.

## Licence

Code: MIT. Rules content: SRD 5.2.1 by Wizards of the Coast LLC, [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode). Unofficial fan project, not affiliated with or endorsed by Wizards of the Coast.
