import type { APIRoute } from 'astro';
import {
  equipment,
  equipmentKindMeta,
  equipmentUrl,
  glossary,
  glossaryUrl,
  masteries,
  masteryUrl,
  properties,
  propertyUrl,
  stripHtml,
  weaponGroup,
  weapons,
  weaponUrl,
} from '../lib/data';

export interface SearchDoc {
  /** Stable id, also used as the favourites key. */
  id: string;
  kind: 'rule' | 'weapon' | 'mastery' | 'property' | 'equipment';
  title: string;
  label: string;
  summary: string;
  url: string;
  text: string;
}

export const GET: APIRoute = () => {
  const docs: SearchDoc[] = [
    ...glossary.map((e) => ({
      id: `glossary/${e.slug}`,
      kind: 'rule' as const,
      title: e.title,
      label: e.tag ?? e.category,
      summary: e.summary,
      url: glossaryUrl(e.slug),
      text: stripHtml(e.body),
    })),
    ...weapons.map((w) => ({
      id: `weapons/${w.slug}`,
      kind: 'weapon' as const,
      title: w.name,
      label: weaponGroup(w),
      summary: `${w.damage.dice} ${w.damage.type} · ${w.propertiesText === '—' ? 'No properties' : w.propertiesText} · Mastery: ${masteries.find((m) => m.slug === w.mastery)?.name ?? w.mastery}`,
      url: weaponUrl(w.slug),
      text: `${w.damage.type} ${w.propertiesText} ${w.mastery}`,
    })),
    ...masteries.map((m) => ({
      id: `masteries/${m.slug}`,
      kind: 'mastery' as const,
      title: m.name,
      label: 'Mastery',
      summary: m.summary,
      url: masteryUrl(m.slug),
      text: stripHtml(m.body),
    })),
    ...properties.map((p) => ({
      id: `properties/${p.slug}`,
      kind: 'property' as const,
      title: p.name,
      label: 'Property',
      summary: p.summary,
      url: propertyUrl(p.slug),
      text: stripHtml(p.body),
    })),
    ...equipment.map((i) => ({
      id: `equipment/${i.slug}`,
      kind: 'equipment' as const,
      title: i.name,
      label: equipmentKindMeta(i.kind).label,
      summary: `${i.cost}${i.weight === '—' ? '' : ` · ${i.weight}`} · ${i.summary}`,
      url: equipmentUrl(i.slug),
      text: `${i.group} ${i.stats.map((s) => `${s.label} ${s.value}`).join(' ')} ${stripHtml(i.body)}`,
    })),
  ];
  return new Response(JSON.stringify(docs), { headers: { 'Content-Type': 'application/json' } });
};
