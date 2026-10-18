/**
 * A page's picture as a tile: the front page's boxes and the character gallery both
 * show one, at a fixed shape, so they share how it is chosen and how it sits.
 */
import { asset } from './inline.mjs';
import { nation, url } from './registry.mjs';
import { bodyImage } from './featured.mjs';

// A picture on Google's hosting is asked for at a size a tile can use, not 2000 wide.
const thumb = (src) => asset(src).replace(/^(https:\/\/lh3\.googleusercontent\.com\/.+)=w\d+$/, '$1=w200');

// A flag, emblem or logo is shown whole inside the tile; a photograph fills it.
const WHOLE = /flag|emblem|logo|coat of arms|seal|crest|badge|insignia/i;

/** The first sidebar picture, else the first in the text, else the nation's flag. */
export function pictureOf(e) {
  const row = (e.data.infobox || []).find((r) => r.image || r.images?.[0]?.src);
  const src = row?.image || row?.images?.[0]?.src;
  if (src) {
    const caption = row.caption || row.images?.[0]?.caption || '';
    return { src: thumb(src), whole: WHOLE.test(caption) || ['overview', 'subdivision'].includes(e.data.type) };
  }
  const inText = bodyImage(e.body);
  if (inText) return { src: thumb(inText), whole: false };
  const flag = nation(e.data.nation)?.flag;
  return flag ? { src: url(flag), whole: true } : null;
}
