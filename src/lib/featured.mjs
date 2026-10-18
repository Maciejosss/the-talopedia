/**
 * The article on the front page today.
 *
 * The pick is a function of the date, so every reader sees the same one all day and
 * it changes at midnight UTC without anybody editing the front page. Each article
 * that qualifies draws its own number for the day, a hash of the date and its name,
 * and the highest wins. It used to be one number taken modulo the whole list, so any
 * page added shifted the pick; now a page joining or leaving moves it only by being
 * the winner, and a page written today first joins the draw tomorrow.
 *
 * An article qualifies when it has both halves of the panel: a sidebar picture and an
 * overview to quote. Roughly ten of the shorter ones do not, and they are skipped
 * rather than shown as a heading over nothing.
 */

import { createdAt } from './revisions.mjs';

/** Everything before the first section heading: the overview, as rendered HTML. */
export function overview(html = '') {
  const cut = html.search(/<h2\b/);
  return cut === -1 ? html : html.slice(0, cut);
}

/** The overview's first paragraph with any text in it, which is all the front page shows. */
export function firstParagraph(html = '') {
  for (const m of overview(html).matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/g)) {
    if (m[0].replace(/<[^>]+>/g, '').trim()) return m[0];
  }
  return '';
}

/** The first picture in an article's sidebar. */
export function firstImage(data, body = '') {
  const row = (data.infobox || []).find((r) => r.image || r.images?.[0]?.src);
  return row?.image || row?.images?.[0]?.src || bodyImage(body) || '';
}

/** The first picture in an article's text, for a page with no sidebar picture. */
export function bodyImage(body = '') {
  return String(body).match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1] || String(body).match(/!\[[^\]]*\]\(([^)\s]+)/)?.[1] || '';
}

/**
 * Link the article's own name where the overview first says it, the way a lede links
 * its subject anywhere else. Nearly every lede opens by naming the subject in bold,
 * so that run is the target; the plain title is the fallback for the ones that do
 * not. Returns null when neither is there, and the caller adds a plain link instead.
 */
export function linkFirstMention(html, title, href) {
  const wrap = (start, end) => {
    // Never nest one anchor inside another. An unclosed <a> before this point means
    // the match sits inside a link already.
    const before = html.slice(0, start);
    if ((before.match(/<a\b/g) || []).length > (before.match(/<\/a>/g) || []).length) return null;
    return html.slice(0, start) + `<a href="${href}">` + html.slice(start, end) + '</a>' + html.slice(end);
  };
  // The subject in bold, if it turns up while the overview is still introducing it.
  const bold = /<strong\b[^>]*>[^<]{1,90}<\/strong>/.exec(html.slice(0, 400));
  if (bold) return wrap(bold.index, bold.index + bold[0].length);
  // Otherwise the title as written, so long as it is text and not part of a tag.
  const plain = html.indexOf('>' + title);
  if (plain !== -1) return wrap(plain + 1, plain + 1 + title.length);
  const loose = html.search(new RegExp('(?<=>)[^<]*?' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (loose !== -1) {
    const at = html.indexOf(title, loose);
    return wrap(at, at + title.length);
  }
  return null;
}

/** Stable across builds and platforms, unlike anything seeded from Math.random. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Left as it is, the top of an FNV hash leans on the last few characters, so pages
  // whose names end alike won the draw far more than their share. This spreads it.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Bump this to throw today's pick away and draw again. Every later day changes with
 * it, which is the point: the sequence is a function of the date and this number.
 */
const REROLL = 2;

/** A day whose article was chosen by hand. The draw takes over again the next day. */
const PINNED = {
  '2026-09-26': 'kriemhilt-von-bismarck',
};

export function featured(entries, today = new Date()) {
  const date = today.toISOString().slice(0, 10);
  const day = `${date}#${REROLL}`;
  const opened = Date.parse(`${date}T00:00:00Z`);
  const pool = entries
    .filter((e) => e.id !== 'home')
    .filter((e) => firstImage(e.data, e.body) && overview(e.rendered?.html || '').length > 300)
    .filter((e) => !(Date.parse(createdAt(e.id)) >= opened));
  if (!pool.length) return null;
  const pinned = pool.find((e) => e.id === PINNED[date]);
  if (pinned) return pinned;
  let best = null, top = -1;
  for (const e of pool) {
    const n = hash(`${day}|${e.id}`);
    if (n > top || (n === top && e.id < best.id)) { top = n; best = e; }
  }
  return best;
}
