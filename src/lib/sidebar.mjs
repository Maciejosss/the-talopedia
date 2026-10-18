import { titleFor } from './registry.mjs';

/**
 * Facts read off a page's sidebar for the category views. Labels are matched loosely
 * ("Capital" finds "Capital and Largest City"), so a page is listed with what it
 * already says, and a category page changes the moment a sidebar does.
 */

/** A row's value as one string, a list joined. */
const joined = (v) => [].concat(v ?? []).map(String).join(' / ');

/** The first row whose label starts with any of these, case aside. */
export function field(e, ...labels) {
  const want = labels.map((l) => l.toLowerCase());
  const row = (e.data.infobox || []).find((r) => r.label
    && want.some((l) => r.label.trim().toLowerCase().startsWith(l)));
  return row ? joined(row.value) : '';
}

/** Markup down to the words a reader sees: link titles, no tokens or marks. */
export function plain(v) {
  return String(v || '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]|#]+)[^\]]*\]\]/g, (_, s) => titleFor(s.trim()))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/:date\[(\d{4})[^\]]*\]/g, '$1')
    .replace(/:(?:img|icon|flag)\[[^\]]*\]/g, '')
    .replace(/:(?:up|down)\d*/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first figure in a value: "371,758,000" out of ":up 371,758,000 (2024)". A year
    standing alone, as in "1930 Census", is not a figure. */
export function figure(v) {
  const t = plain(v);
  if (/census/i.test(t)) return '';
  return (t.match(/~?\d{1,3}(?:,\d{3})+(?:\.\d+)?|~?\d+(?:\.\d+)?/) || [''])[0];
}

/** The year a value names, or the first of two. */
export function yearOf(v) {
  return (String(v || '').match(/\d{4}/) || [''])[0];
}

/** Every year a value names, in order: a war's start and end. */
export const yearsOf = (v) => String(v || '').match(/\d{4}/g) || [];

/** The page a "Part of [[x]]" row names, for a theatre of a larger war. */
export function partOf(e) {
  for (const r of e.data.infobox || []) {
    const m = joined(r.value).match(/^\s*Part of \[\[([^\]|#]+)/i);
    if (!r.label && m) return m[1].trim();
  }
  return null;
}

/** The first picture in the sidebar. */
export function imageOf(e) {
  for (const r of e.data.infobox || []) {
    if (r.image) return r.image;
    const first = r.images?.find((i) => i.src || i.image);
    if (first) return first.src || first.image;
  }
  return null;
}

/** The nation a page belongs to: its own, or its first author's. */
export const ownerOf = (e) => e.data.nation || e.data.authors?.[0] || null;

/** The lede's first sentence. A full stop after "lit." or "c." does not end it. */
export function firstSentence(text) {
  const m = [...String(text || '').matchAll(/(\S+)\.\s/g)]
    .find((x) => !/^\(?(lit|c|ca|e\.g|i\.e|abbr|approx|st|mt|dr|mr|mrs|no)$/i.test(x[1]));
  return m ? text.slice(0, m.index + m[0].length - 1) : text;
}
