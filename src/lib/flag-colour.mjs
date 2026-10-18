import sharp from 'sharp';
import { nations } from './registry.mjs';

/**
 * A nation's portal bar and navbox take the colour of its flag: the colour along its top
 * edge, which is the first stripe on a striped flag and the field on most others. White
 * and black are passed over there, and then the commonest colour in the whole flag is
 * taken instead, so a white-topped flag still finds its colour; black only when the flag
 * has nothing else. Greys count as white and black. Shades of one colour are counted together.
 */
const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const W = 64, H = 40;
// White, black and the greys between, which are a flag's edges and lettering more than its colour.
const plain = (c) => Math.max(...c) < 50 || Math.max(...c) - Math.min(...c) < 30;
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 72;

/** The colours among these pixels, shades merged, commonest first. */
function colours(pixels) {
  const out = [];
  for (const px of pixels) {
    const c = out.find((e) => near(e.mean, px));
    if (c) { c.n++; px.forEach((v, j) => { c.sum[j] += v; c.mean[j] = c.sum[j] / c.n; }); }
    else out.push({ n: 1, sum: [...px], mean: [...px] });
  }
  return out.sort((a, b) => b.n - a.n).map((e) => ({ n: e.n, c: e.mean.map(Math.round) }));
}

async function flagColour(file) {
  const data = await sharp(file).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const at = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const rows = (y0, y1) => { const out = []; for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) out.push(at(x, y)); return out; };
  // The top edge, a row in from it, where a waving flag's first stripe still runs.
  const top = colours(rows(1, 4)).filter((e) => !plain(e.c) && e.n >= W * 3 / 6);
  const whole = colours(rows(0, H)).filter((e) => e.n >= W * H / 20);
  const pick = top[0]?.c ?? whole.find((e) => !plain(e.c))?.c ?? whole[0]?.c;
  return pick && '#' + pick.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Lettering for a bar of this colour: white, or near black on a pale one such as yellow. */
export const inkOn = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 1.05 / (lum(c) + 0.05) >= 3 ? '#fff' : '#14171a';
};

// Read once per build, so the navbox can ask for a colour without waiting on it.
const COLOURS = new Map(await Promise.all(nations().filter((n) => n.flag)
  .map(async (n) => [n.id, await flagColour(`public${n.flag}`).catch(() => null)])));

/** The colour of a nation's flag, or null for a nation with none. */
export const colourOf = (id) => COLOURS.get(id) ?? null;
