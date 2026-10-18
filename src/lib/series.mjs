import fs from 'node:fs';
import { navbox, nation, exists, titleFor } from './registry.mjs';

/**
 * A nation's history as a Wikipedia series: the History group of its navbox, each row a
 * period with its dates and its articles in order. Every article in it carries the
 * series sidebar, and steps to the article before and after it.
 */

/** A navbox entry, "slug", "slug|Name" or "[[slug|Name]]", as a slug and what to call it. */
const entry = (raw) => {
  const [slug, name] = String(raw).replace(/^\[\[|\]\]$/g, '').split('|');
  return { slug: slug.trim(), name: (name || '').trim() || titleFor(slug.trim()) };
};

const ids = fs.readdirSync('src/content/data/navboxes').filter((f) => f.endsWith('.yaml'))
  .map((f) => f.slice(0, -5)).filter((id) => id !== 'site');

/** One nation's history series, or null when its navbox has no History group. */
export function series(id) {
  const g = (navbox(id)?.groups || []).find((x) => /^history$/i.test(String(x.label || '').trim()));
  const periods = (g?.rows || []).filter((r) => r.items?.length)
    .map((r) => ({ label: r.label || '', dates: r.dates || '', items: r.items.map(entry) }));
  if (!periods.length) return null;
  const n = nation(id);
  return { id, name: n?.name || id, flag: n?.flag || null, portal: !!n?.portal, periods };
}

/**
 * Every series a page is in, each with the period it falls under and the written
 * articles on either side of it. A page can be in more than one, as the Great War is.
 */
export function seriesOf(slug) {
  const out = [];
  for (const id of ids) {
    const s = series(id);
    if (!s) continue;
    const at = s.periods.findIndex((p) => p.items.some((i) => i.slug === slug));
    if (at < 0) continue;
    // Only written articles are stepped to; a red link is nowhere to go.
    const line = s.periods.flatMap((p) => p.items).filter((i) => i.slug === slug || exists(i.slug));
    const k = line.findIndex((i) => i.slug === slug);
    out.push({ ...s, at, prev: line[k - 1] || null, next: line[k + 1] || null });
  }
  return out;
}
