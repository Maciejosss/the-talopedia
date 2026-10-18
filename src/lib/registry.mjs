import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { slugTitle } from './slug-title.mjs';
import { categoryOf, retired } from './categories.mjs';

const ROOT = path.resolve('src/content');
const BASE = (process.env.BASE_PATH || '/').replace(/\/+$/, '');

export const url = (p) => BASE + (p.startsWith('/') ? p : '/' + p);

let cache = { at: 0, articles: null, nations: null };
const TTL = process.env.NODE_ENV === 'production' ? Infinity : 1500;

// Reads only the frontmatter keys the link renderer needs. A full YAML parse of
// every article on every markdown render would be the slow way to do this.
function scanArticles() {
  const out = new Map();
  for (const dir of ['articles', 'portals']) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.md')) continue;
      const slug = f.replace(/\.md$/, '');
      const head = fs.readFileSync(path.join(d, f), 'utf8').split(/^---\s*$/m)[1] || '';
      const pick = (k) => (head.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '');
      out.set(dir === 'portals' ? 'portal:' + slug : slug, {
        title: pick('title') || slug,
        icon: pick('icon') || null,
        type: pick('type') || null,
        kind: dir,
      });
    }
  }
  return out;
}

function scanNations() {
  const f = path.join(ROOT, 'data/nations.yaml');
  if (!fs.existsSync(f)) return [];
  return parseYaml(fs.readFileSync(f, 'utf8')) || [];
}

function load() {
  if (Date.now() - cache.at < TTL && cache.articles) return cache;
  cache = { at: Date.now(), articles: scanArticles(), nations: scanNations() };
  return cache;
}

export const articles = () => load().articles;
export const nations = () => load().nations;
export const nation = (id) => load().nations.find((n) => n.id === id) || null;

export function navbox(id) {
  const f = path.join(ROOT, 'data/navboxes', id + '.yaml');
  if (!fs.existsSync(f)) return null;
  return parseYaml(fs.readFileSync(f, 'utf8'));
}

/** Icon for a slug: a nation's flag first, then an article's own icon. */
export function iconFor(slug) {
  const n = nation(slug);
  if (n?.flag) return n.flag;
  return articles().get(slug)?.icon || null;
}

/** Title a slug should display right now. Renaming one frontmatter line moves every link. */
export function titleFor(slug) {
  if (slug.startsWith('category:')) {
    return `Category:${categoryNames().get(slug.slice(9)) || slugTitle(slug.slice(9))}`;
  }
  const a = articles().get(slug);
  if (a) return a.title;
  const n = nation(slug);
  if (n) return n.name;
  // Best guess for a subject with no article yet. It stops being a guess the
  // moment someone writes the article, because the title then comes from the file.
  return slugTitle(slug);
}

/** Each category with pages in it, slug to name. A link can name one as category:<slug>. */
function categoryNames() {
  const out = new Map();
  for (const [slug, a] of articles()) {
    if (a.kind !== 'articles' || !a.type || slug === 'home') continue;
    const c = categoryOf(a.type);
    out.set(c.slug, c.name);
  }
  // An old per-type name still resolves, and its address forwards to the broad page.
  for (const r of retired()) if (out.has(r.to) && !out.has(r.from)) out.set(r.from, out.get(r.to));
  return out;
}

export const exists = (slug) =>
  slug.startsWith('category:') ? categoryNames().has(slug.slice(9)) : articles().has(slug);

/** Where a link goes: an article, portal:<id> or category:<slug>. */
export const hrefOf = (slug) =>
  slug.startsWith('portal:') ? url(`/portal/${slug.slice(7)}`)
  : slug.startsWith('category:') ? url(`/category/${slug.slice(9)}`)
  : url(`/${slug}`);

/**
 * Coordinates come from the map's own coordinates.tsv, the only source for where
 * anything is. `npm run sync-coords` refreshes the vendored copy.
 */
let coordCache = null;
function coordTable() {
  if (coordCache) return coordCache;
  coordCache = new Map();
  const f = path.join(ROOT, 'data/coordinates.tsv');
  if (!fs.existsSync(f)) return coordCache;
  const [head, ...rows] = fs.readFileSync(f, 'utf8').trim().split('\n');
  const col = Object.fromEntries(head.split('\t').map((h, i) => [h, i]));
  for (const line of rows) {
    const c = line.split('\t');
    const name = (c[col.NAME] || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = {
      name,
      kind: c[col.KIND],
      type: c[col.TYPE],
      position: c[col.POSITION],
    };
    // A nation label outranks a city of the same name, which is how "Nichirin"
    // resolves to the country rather than to some town called Nichirin.
    const held = coordCache.get(key);
    if (!held || (entry.kind === 'label' && held.kind !== 'label')) coordCache.set(key, entry);
  }
  return coordCache;
}

/** The Avium Map's own deep link. Nations and cities use different keys. */
export const mapUrl = (name, kind = 'nation') =>
  `https://auroruse.github.io/avium-map/#${kind}=${encodeURIComponent(name)}`;

export function coordsFor(...names) {
  const t = coordTable();
  for (const n of names) {
    if (!n) continue;
    const hit = t.get(String(n).toLowerCase());
    if (hit) return hit;
  }
  return null;
}
