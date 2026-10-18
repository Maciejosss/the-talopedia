import sharp from 'sharp';

/**
 * A portal's welcome bar takes the colour of the nation's flag: the commonest colour
 * in it that white lettering can sit on. White and pale fields are passed over, and so
 * is black, unless the flag has nothing else. A colour covering less than a twentieth
 * of the flag is only the blurred edge between two others, and does not count.
 */
const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export async function flagColour(file) {
  const data = await sharp(file).resize(64, 40, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const bins = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const px = [data[i], data[i + 1], data[i + 2]];
    const k = px.map((v) => v >> 5).join();
    const e = bins.get(k) || { n: 0, sum: [0, 0, 0] };
    e.n++;
    px.forEach((v, j) => (e.sum[j] += v));
    bins.set(k, e);
  }
  const colours = [...bins.values()].filter((e) => e.n * 3 >= data.length / 20).sort((a, b) => b.n - a.n)
    .map((e) => e.sum.map((v) => Math.round(v / e.n)));
  // 3:1 against white is the floor for large bold lettering.
  const readable = colours.filter((c) => 1.05 / (lum(c) + 0.05) >= 3);
  const pick = readable.find((c) => Math.max(...c) > 40) ?? readable[0];
  return pick && '#' + pick.map((v) => v.toString(16).padStart(2, '0')).join('');
}
