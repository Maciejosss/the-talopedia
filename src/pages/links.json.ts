import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';

/**
 * For each page, the pages that point at it: by [[link]], by :icon[slug], or as an entry
 * in a navbox. The editor reads it to move a page and take every link along.
 */
const REF = /\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]|:icon\[([^\]]+)\]/g;

export const GET: APIRoute = async () => {
  const into: Record<string, string[]> = {};
  const add = (target: string, from: string) => {
    const t = target.trim();
    if (!t || t === from) return;
    (into[t] ||= []).includes(from) || into[t].push(from);
  };
  const scan = (text: string, from: string) => {
    for (const m of text.matchAll(REF)) add(m[1] ?? m[2], from);
  };
  for (const e of await getCollection('articles')) scan(JSON.stringify(e.data) + '\n' + (e.body ?? ''), e.id);
  for (const e of await getCollection('portals')) scan(JSON.stringify(e.data) + '\n' + (e.body ?? ''), `portal:${e.id}`);
  const dir = 'src/content/data/navboxes';
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
    const from = `navbox:${f.replace(/\.yaml$/, '')}`;
    const text = fs.readFileSync(`${dir}/${f}`, 'utf8');
    scan(text, from);
    const box = parseYaml(text) || {};
    for (const g of box.groups || []) {
      for (const r of g.rows || [g]) {
        for (const item of r.items || []) {
          const s = String(item).trim();
          if (!s.startsWith('[[') && !s.startsWith(':')) add(s.split('|')[0], from);
        }
      }
    }
  }
  return new Response(JSON.stringify(into), { headers: { 'content-type': 'application/json' } });
};
