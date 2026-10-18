import fs from 'node:fs';
import { navbox, nation, exists, titleFor, url } from './registry.mjs';
import { asset, esc } from './inline.mjs';

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

/**
 * "Part of a series on the History of …" as HTML: the nation's periods, the one this page
 * is in open and the rest folded, each with its dates and its articles, this page in bold
 * rather than linked. `steps` puts the articles either side at its foot, for a page with
 * no infobox to carry them. The page and the editor's preview both draw it from here.
 */
export function seriesHtml(s, here, steps = false) {
  const home = s.portal ? url(`/portal/${s.id}`) : url(`/${s.id}`);
  const periods = s.periods.map((p, i) => `<details class="hs-period"${i === s.at ? ' open' : ''}>`
    + `<summary><span class="hs-label">${esc(p.label)}</span>${p.dates ? `<span class="hs-dates">${esc(p.dates)}</span>` : ''}</summary>`
    + '<ul>' + p.items.map((it) => '<li>' + (it.slug === here ? `<b>${esc(it.name)}</b>`
      : `<a class="wl${exists(it.slug) ? '' : ' new'}" href="${url('/' + it.slug)}">${esc(it.name)}</a>`) + '</li>').join('')
    + '</ul></details>').join('');
  return '<aside class="series"><div class="hs-head"><span>Part of a series on the</span>'
    + `<a class="hs-title" href="${home}">History of ${esc(s.name)}</a>`
    + (s.flag ? `<a href="${home}" tabindex="-1"><img class="hs-flag" src="${asset(s.flag)}" alt=""></a>` : '')
    + '</div>' + periods + (steps ? stepsHtml(s) : '') + '</aside>';
}

/** The articles before and after this one in its series, as a row of two links. */
export function stepsHtml(s, flag = false) {
  if (!s.prev && !s.next) return '';
  return '<div class="hs-steps">'
    + (s.prev ? `<a class="hs-prev" href="${url('/' + s.prev.slug)}">${esc(s.prev.name)}</a>` : '<span></span>')
    + (flag && s.flag ? `<img class="ico" src="${asset(s.flag)}" alt="${esc(s.name)}" title="History of ${esc(s.name)}">` : '')
    + (s.next ? `<a class="hs-next" href="${url('/' + s.next.slug)}">${esc(s.next.name)}</a>` : '<span></span>')
    + '</div>';
}
