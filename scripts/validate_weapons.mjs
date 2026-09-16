// Validates src/data/weapons.json, properties.json, and masteries.json.
// Node ESM, no dependencies. Exits non-zero on any failure.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");

function loadJson(name) {
  const path = join(dataDir, name);
  return JSON.parse(readFileSync(path, "utf-8"));
}

const weapons = loadJson("weapons.json");
const properties = loadJson("properties.json");
const masteries = loadJson("masteries.json");

const errors = [];

function fail(msg) {
  errors.push(msg);
}

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DICE_RE = /^(\d+d\d+|\d+)$/;
const ALLOWED_TAGS_RE = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
const ALLOWED_TAGS = new Set(["p", "strong", "em"]);
const VALID_CATEGORIES = new Set(["simple", "martial"]);
const VALID_KINDS = new Set(["melee", "ranged"]);

function checkBody(body, label) {
  if (typeof body !== "string") {
    fail(`${label}: body is not a string`);
    return;
  }
  if (body.includes("System Reference Document")) {
    return; // allowed exemption
  }
  let m;
  ALLOWED_TAGS_RE.lastIndex = 0;
  while ((m = ALLOWED_TAGS_RE.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      fail(`${label}: body contains disallowed tag <${tag}>`);
    }
  }
}

// --- Properties ---
const propertySlugs = new Set();
for (const p of properties) {
  if (!p.slug || typeof p.slug !== "string") {
    fail(`property entry missing slug: ${JSON.stringify(p)}`);
    continue;
  }
  if (!KEBAB_RE.test(p.slug)) {
    fail(`property slug not kebab-case: "${p.slug}"`);
  }
  if (propertySlugs.has(p.slug)) {
    fail(`duplicate property slug: "${p.slug}"`);
  }
  propertySlugs.add(p.slug);
  checkBody(p.body, `property "${p.slug}"`);
}

// --- Masteries ---
const masterySlugs = new Set();
for (const m of masteries) {
  if (!m.slug || typeof m.slug !== "string") {
    fail(`mastery entry missing slug: ${JSON.stringify(m)}`);
    continue;
  }
  if (!KEBAB_RE.test(m.slug)) {
    fail(`mastery slug not kebab-case: "${m.slug}"`);
  }
  if (masterySlugs.has(m.slug)) {
    fail(`duplicate mastery slug: "${m.slug}"`);
  }
  masterySlugs.add(m.slug);
  checkBody(m.body, `mastery "${m.slug}"`);
}

// --- Weapons ---
const weaponSlugs = new Set();
for (const w of weapons) {
  const label = w.slug ?? w.name ?? "<unknown>";

  if (!w.slug || typeof w.slug !== "string") {
    fail(`weapon entry missing slug: ${JSON.stringify(w)}`);
    continue;
  }
  if (!KEBAB_RE.test(w.slug)) {
    fail(`weapon slug not kebab-case: "${w.slug}"`);
  }
  if (weaponSlugs.has(w.slug)) {
    fail(`duplicate weapon slug: "${w.slug}"`);
  }
  weaponSlugs.add(w.slug);

  if (!VALID_CATEGORIES.has(w.category)) {
    fail(`weapon "${label}": invalid category "${w.category}"`);
  }
  if (!VALID_KINDS.has(w.kind)) {
    fail(`weapon "${label}": invalid kind "${w.kind}"`);
  }

  if (!w.mastery || !masterySlugs.has(w.mastery)) {
    fail(`weapon "${label}": mastery "${w.mastery}" not found in masteries.json`);
  }

  if (!w.damage || !DICE_RE.test(w.damage.dice)) {
    fail(`weapon "${label}": damage.dice "${w.damage && w.damage.dice}" does not match /^(\\d+d\\d+|\\d+)$/`);
  }

  if (!Array.isArray(w.properties)) {
    fail(`weapon "${label}": properties is not an array`);
  } else {
    for (const p of w.properties) {
      if (!p.slug || !propertySlugs.has(p.slug)) {
        fail(`weapon "${label}": property slug "${p && p.slug}" not found in properties.json`);
      }
      if (p.dice !== undefined && !DICE_RE.test(p.dice)) {
        fail(`weapon "${label}": property "${p.slug}" dice "${p.dice}" does not match /^(\\d+d\\d+|\\d+)$/`);
      }
    }
  }

  if (typeof w.weightLb !== "number" || Number.isNaN(w.weightLb)) {
    fail(`weapon "${label}": weightLb is not numeric ("${w.weightLb}")`);
  }
  if (typeof w.costCp !== "number" || Number.isNaN(w.costCp)) {
    fail(`weapon "${label}": costCp is not numeric ("${w.costCp}")`);
  }
}

if (errors.length > 0) {
  console.error(`FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
} else {
  console.log(
    `OK: ${weapons.length} weapons, ${properties.length} properties, ${masteries.length} masteries validated successfully.`
  );
  process.exit(0);
}
