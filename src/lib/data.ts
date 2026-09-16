import glossaryJson from '../data/glossary.json';
import weaponsJson from '../data/weapons.json';
import propertiesJson from '../data/properties.json';
import masteriesJson from '../data/masteries.json';
import introJson from '../data/weapons-intro.json';

export interface GlossaryEntry {
  slug: string;
  title: string;
  tag?: string;
  category: string;
  summary: string;
  body: string;
  seeAlso: string[];
  srdRefs?: string[];
}

export interface WeaponProperty {
  slug: string;
  range?: { normal: number; long: number };
  dice?: string;
  ammo?: string;
  note?: string;
}

export interface Weapon {
  slug: string;
  name: string;
  category: 'simple' | 'martial';
  kind: 'melee' | 'ranged';
  damage: { dice: string; type: string };
  properties: WeaponProperty[];
  propertiesText: string;
  mastery: string;
  weight: string;
  weightLb: number;
  cost: string;
  costCp: number;
}

export interface Rule {
  slug: string;
  name: string;
  summary: string;
  body: string;
}

export const glossary: GlossaryEntry[] = (glossaryJson as (Omit<GlossaryEntry, 'seeAlso'> & { seeAlso?: string[] })[])
  .map((e) => ({ ...e, seeAlso: e.seeAlso ?? [] }))
  .sort((a, b) => a.title.localeCompare(b.title));
export const weapons = weaponsJson as Weapon[];
export const properties = (propertiesJson as Rule[]).slice().sort((a, b) => a.name.localeCompare(b.name));
export const masteries = (masteriesJson as Rule[]).slice().sort((a, b) => a.name.localeCompare(b.name));
export const weaponsIntro = introJson as { weapons: string; properties: string; masteries: string };

export const glossaryBySlug = new Map(glossary.map((e) => [e.slug, e]));
export const propertyBySlug = new Map(properties.map((p) => [p.slug, p]));
export const masteryBySlug = new Map(masteries.map((m) => [m.slug, m]));

/** Glossary categories in display order, with the icon used for each. */
export const CATEGORIES = [
  { name: 'Actions', slug: 'actions', icon: 'zap' },
  { name: 'Conditions', slug: 'conditions', icon: 'eye' },
  { name: 'Combat', slug: 'combat', icon: 'swords' },
  { name: 'Movement & Position', slug: 'movement', icon: 'move' },
  { name: 'Spellcasting', slug: 'spellcasting', icon: 'wand' },
  { name: 'Areas of Effect', slug: 'areas', icon: 'target' },
  { name: 'Hazards & Environment', slug: 'hazards', icon: 'flame' },
  { name: 'Abilities & Checks', slug: 'abilities', icon: 'dice' },
  { name: 'Creatures & Social', slug: 'creatures', icon: 'users' },
  { name: 'Core Rules', slug: 'core', icon: 'book' },
] as const;

export const categoryMeta = (name: string) =>
  CATEGORIES.find((c) => c.name === name) ?? { name, slug: 'core', icon: 'book' };

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Prefix a site-relative path with the deploy base path. */
export const url = (path = '') => BASE + path.replace(/^\//, '');

export const glossaryUrl = (slug: string) => url(`glossary/${slug}/`);
export const weaponUrl = (slug: string) => url(`weapons/${slug}/`);
export const propertyUrl = (slug: string) => url(`properties/${slug}/`);
export const masteryUrl = (slug: string) => url(`masteries/${slug}/`);

export const weaponGroup = (w: Weapon) =>
  `${w.category === 'simple' ? 'Simple' : 'Martial'} ${w.kind === 'melee' ? 'Melee' : 'Ranged'}`;

export const weaponsWithMastery = (slug: string) => weapons.filter((w) => w.mastery === slug);
export const weaponsWithProperty = (slug: string) =>
  weapons.filter((w) => w.properties.some((p) => p.slug === slug));

/** Human-readable label for a weapon's property, e.g. "Thrown (20/60)". */
export function propertyLabel(p: WeaponProperty) {
  const name = propertyBySlug.get(p.slug)?.name ?? p.slug;
  const extras: string[] = [];
  if (p.range) extras.push(`${p.range.normal}/${p.range.long}`);
  if (p.ammo) extras.push(p.ammo);
  if (p.dice) extras.push(p.dice);
  if (p.note) extras.push(p.note);
  return extras.length ? `${name} (${extras.join('; ')})` : name;
}

export const stripHtml = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Wrap tables so wide ones scroll on small screens while still filling the column. */
export const wrapTables = (html: string) =>
  html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');

// ---------------------------------------------------------------------------
// Term auto-linking
// ---------------------------------------------------------------------------

interface Term {
  text: string;
  href: string;
  id: string;
}

const glossaryTerms: Term[] = glossary.map((e) => ({ text: e.title, href: glossaryUrl(e.slug), id: `glossary/${e.slug}` }));

// Property and mastery names are ordinary English words ("Light", "Slow"), so they
// are only linked inside weapon-domain text, never in the general glossary.
const weaponTerms: Term[] = [
  ...properties.map((p) => ({ text: p.name, href: propertyUrl(p.slug), id: `properties/${p.slug}` })),
  ...masteries.map((m) => ({ text: m.name, href: masteryUrl(m.slug), id: `masteries/${m.slug}` })),
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMatcher(terms: Term[]) {
  const byText = new Map<string, Term>();
  for (const t of terms) if (!byText.has(t.text)) byText.set(t.text, t);
  const alternation = [...byText.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  return { byText, re: new RegExp(`(?<![\\w-])(${alternation})(e?s)?(?![\\w-])`, 'g') };
}

const glossaryMatcher = buildMatcher(glossaryTerms);
const weaponMatcher = buildMatcher([...weaponTerms, ...glossaryTerms]);

const SKIP_TAGS = new Set(['a', 'h3', 'th', 'strong']);

/**
 * Link the first mention of each known rules term in an HTML fragment.
 * `selfId` (e.g. "glossary/prone") is never linked.
 */
export function linkTerms(html: string, selfId: string, domain: 'glossary' | 'weapons' = 'glossary') {
  const { byText, re } = domain === 'weapons' ? weaponMatcher : glossaryMatcher;
  const seen = new Set<string>([selfId]);
  const skipStack: string[] = [];

  return html.replace(/(<\/?([a-z0-9]+)[^>]*>)|([^<]+)/gi, (_m, tag: string, tagName: string, text: string) => {
    if (tag) {
      const name = tagName.toLowerCase();
      if (SKIP_TAGS.has(name)) {
        if (tag.startsWith('</')) skipStack.pop();
        else skipStack.push(name);
      }
      return tag;
    }
    if (skipStack.length) return text;
    return text.replace(re, (match: string, word: string) => {
      const term = byText.get(word);
      if (!term || seen.has(term.id)) return match;
      seen.add(term.id);
      return `<a class="term" href="${term.href}" data-term="${term.id}">${match}</a>`;
    });
  });
}
