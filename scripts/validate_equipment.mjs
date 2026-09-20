#!/usr/bin/env node
// Validates src/data/equipment.json. Exits non-zero with messages on any
// problem. No dependencies (Node >= 18).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "src", "data", "equipment.json");
const INTRO_PATH = join(__dirname, "..", "src", "data", "equipment-intro.json");

const ALLOWED_KINDS = new Set(["armor", "tool", "gear", "mount", "vehicle"]);

// Same subset the glossary allows, plus <caption> for the SRD's inline tables.
const ALLOWED_TAGS = new Set([
  "p", "ul", "li", "strong", "em", "h3",
  "table", "caption", "thead", "tbody", "tr", "th", "td",
]);

const INTRO_KEYS = ["armor", "tools", "gear", "mounts", "vehicles"];

const REQUIRED_KEYS = ["slug", "name", "kind", "group", "cost", "weight", "summary"];
// groupIndex may legitimately be 0, so it is checked separately from REQUIRED_KEYS.

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// "5 GP", "1,500 GP", "Varies", or the SRD's em dash for "not applicable".
const COST_RE = /^(?:[\d,]+(?:½|¼|¾)? (?:CP|SP|EP|GP|PP)|Varies|—)$/;

function checkHtml(html, label, errors) {
  if (typeof html !== "string") return;
  if (html.includes("System Reference Document")) {
    errors.push(`${label}: body contains "System Reference Document"`);
  }
  if (html.includes("**")) {
    errors.push(`${label}: body contains an unstripped lead-in marker ("**")`);
  }
  for (const m of html.matchAll(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g)) {
    if (!ALLOWED_TAGS.has(m[1].toLowerCase())) {
      errors.push(`${label}: body contains disallowed tag <${m[1]}>`);
    }
  }
  for (const m of html.matchAll(/<([a-zA-Z0-9]+)(\s[^>]*)>/g)) {
    errors.push(`${label}: body tag <${m[1]}> has disallowed attributes: "${m[2].trim()}"`);
  }
}

function main() {
  let data;
  let intro;
  try {
    data = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
    intro = JSON.parse(readFileSync(INTRO_PATH, "utf-8"));
  } catch (err) {
    console.error(`FAIL: could not parse JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(data)) {
    console.error("FAIL: equipment.json must be a JSON array");
    process.exit(1);
  }

  const errors = [];
  const seenSlugs = new Map();
  const kindCounts = new Map();

  for (const item of data) {
    const label = item && item.name ? item.name : JSON.stringify(item).slice(0, 60);

    for (const key of REQUIRED_KEYS) {
      if (!(key in item) || item[key] === null || item[key] === undefined || item[key] === "") {
        errors.push(`${label}: missing required key "${key}"`);
      }
    }

    if (typeof item.slug === "string") {
      if (!KEBAB_RE.test(item.slug)) errors.push(`${label}: slug "${item.slug}" is not kebab-case`);
      if (seenSlugs.has(item.slug)) {
        errors.push(`${label}: duplicate slug "${item.slug}" (also used by "${seenSlugs.get(item.slug)}")`);
      } else {
        seenSlugs.set(item.slug, label);
      }
    }

    if (!Number.isInteger(item.groupIndex) || item.groupIndex < 0) {
      errors.push(`${label}: groupIndex "${item.groupIndex}" is not a non-negative integer`);
    }

    if (!ALLOWED_KINDS.has(item.kind)) {
      errors.push(`${label}: kind "${item.kind}" is not one of ${[...ALLOWED_KINDS].join(", ")}`);
    } else {
      kindCounts.set(item.kind, (kindCounts.get(item.kind) ?? 0) + 1);
    }

    if (typeof item.cost === "string" && !COST_RE.test(item.cost)) {
      errors.push(`${label}: cost "${item.cost}" is not a recognised price`);
    }
    // costCp/weightLb drive the table's numeric sort, so they must agree with the
    // printed value rather than silently defaulting to null.
    if (item.costCp !== null && !Number.isFinite(item.costCp)) {
      errors.push(`${label}: costCp "${item.costCp}" is neither null nor a number`);
    }
    if (COST_RE.test(item.cost ?? "") && item.cost !== "Varies" && item.cost !== "—" && item.costCp === null) {
      errors.push(`${label}: cost "${item.cost}" did not convert to costCp`);
    }
    if (item.weightLb !== null && !Number.isFinite(item.weightLb)) {
      errors.push(`${label}: weightLb "${item.weightLb}" is neither null nor a number`);
    }

    if (!Array.isArray(item.stats)) {
      errors.push(`${label}: stats must be an array`);
    } else {
      for (const s of item.stats) {
        if (!s || typeof s.label !== "string" || typeof s.value !== "string") {
          errors.push(`${label}: each stat needs string "label" and "value"`);
        } else if (s.value === "—" || s.value.trim() === "") {
          errors.push(`${label}: stat "${s.label}" has an empty value`);
        }
      }
    }

    checkHtml(item.body, label, errors);
  }

  for (const key of INTRO_KEYS) {
    if (typeof intro[key] !== "string" || intro[key].trim() === "") {
      errors.push(`equipment-intro.json: missing or empty "${key}"`);
    } else {
      checkHtml(intro[key], `equipment-intro.${key}`, errors);
    }
  }

  // One group must map to exactly one index, or the filter order is ambiguous.
  const indexByGroup = new Map();
  for (const item of data) {
    if (indexByGroup.has(item.group) && indexByGroup.get(item.group) !== item.groupIndex) {
      errors.push(`group "${item.group}" has more than one groupIndex`);
    }
    indexByGroup.set(item.group, item.groupIndex);
  }

  // Every kind must be represented; a parser regression usually shows up as a
  // whole section going missing rather than as a malformed record.
  for (const kind of ALLOWED_KINDS) {
    if (!kindCounts.get(kind)) errors.push(`no items of kind "${kind}" were found`);
  }

  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} problem(s) found in equipment.json:\n`);
    for (const e of errors) console.error(" - " + e);
    process.exit(1);
  }

  const summary = [...kindCounts].sort().map(([k, n]) => `${k} ${n}`).join(", ");
  console.log(`OK: ${data.length} equipment items validated successfully (${summary}).`);
  process.exit(0);
}

main();
