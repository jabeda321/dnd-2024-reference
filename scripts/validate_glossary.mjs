#!/usr/bin/env node
// Validates src/data/glossary.json and src/data/combat-rules.json, which share
// one schema and are merged into a single list of rules at build time. Exits
// non-zero with messages on any problem. No dependencies (Node >= 18).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILES = ["glossary.json", "combat-rules.json"].map((f) => ({
  name: f,
  path: join(__dirname, "..", "src", "data", f),
}));

const ALLOWED_CATEGORIES = new Set([
  "Actions",
  "Conditions",
  "Combat",
  "Movement & Position",
  "Spellcasting",
  "Areas of Effect",
  "Hazards & Environment",
  "Abilities & Checks",
  "Creatures & Social",
  "Core Rules",
]);

const ALLOWED_TAGS = new Set([
  "p", "ul", "li", "strong", "em", "h3",
  "table", "thead", "tbody", "tr", "th", "td",
]);

const REQUIRED_KEYS = ["slug", "title", "category", "summary", "body"];

const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function main() {
  const data = [];
  const counts = [];
  for (const file of DATA_FILES) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file.path, "utf-8"));
    } catch (err) {
      console.error(`FAIL: could not parse ${file.name}: ${err.message}`);
      process.exit(1);
    }
    if (!Array.isArray(parsed)) {
      console.error(`FAIL: ${file.name} must be a JSON array`);
      process.exit(1);
    }
    counts.push(`${parsed.length} from ${file.name}`);
    data.push(...parsed);
  }

  const errors = [];
  const seenSlugs = new Map();

  for (const entry of data) {
    const label = entry && entry.title ? entry.title : JSON.stringify(entry).slice(0, 60);

    for (const key of REQUIRED_KEYS) {
      if (!(key in entry) || entry[key] === null || entry[key] === undefined || entry[key] === "") {
        errors.push(`${label}: missing required key "${key}"`);
      }
    }

    if (typeof entry.slug === "string") {
      if (!KEBAB_RE.test(entry.slug)) {
        errors.push(`${label}: slug "${entry.slug}" is not kebab-case`);
      }
      if (seenSlugs.has(entry.slug)) {
        errors.push(`${label}: duplicate slug "${entry.slug}" (also used by "${seenSlugs.get(entry.slug)}")`);
      } else {
        seenSlugs.set(entry.slug, label);
      }
    }

    if (typeof entry.category === "string" && !ALLOWED_CATEGORIES.has(entry.category)) {
      errors.push(`${label}: category "${entry.category}" is not in the allowed list`);
    }

    if (Array.isArray(entry.seeAlso)) {
      for (const s of entry.seeAlso) {
        if (s === entry.slug) {
          errors.push(`${label}: seeAlso refers to itself ("${s}")`);
        }
      }
    }

    if (typeof entry.body === "string") {
      if (entry.body.includes("System Reference Document")) {
        errors.push(`${label}: body contains "System Reference Document"`);
      }
      const tagMatches = entry.body.matchAll(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g);
      for (const m of tagMatches) {
        const tagName = m[1].toLowerCase();
        if (!ALLOWED_TAGS.has(tagName)) {
          errors.push(`${label}: body contains disallowed tag <${tagName}>`);
        }
      }
      // any attributes at all are disallowed per spec ("No other tags/attributes")
      const attrMatches = entry.body.matchAll(/<([a-zA-Z0-9]+)(\s[^>]*)>/g);
      for (const m of attrMatches) {
        errors.push(`${label}: body tag <${m[1]}> has disallowed attributes: "${m[2].trim()}"`);
      }
    }
  }

  // Cross-entry check: seeAlso slugs must exist
  const allSlugs = new Set(data.map((e) => e.slug));
  for (const entry of data) {
    const label = entry.title;
    if (Array.isArray(entry.seeAlso)) {
      for (const s of entry.seeAlso) {
        if (!allSlugs.has(s)) {
          errors.push(`${label}: seeAlso slug "${s}" does not exist`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} problem(s) found in the rules data:\n`);
    for (const e of errors) console.error(" - " + e);
    process.exit(1);
  }

  console.log(`OK: ${data.length} glossary entries validated successfully (${counts.join(", ")}).`);
  process.exit(0);
}

main();
