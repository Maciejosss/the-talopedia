import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { seriesOf, seriesHtml, stepsHtml } from '../lib/series.mjs';

/**
 * For each page in a history series, the series box under its infobox and the steps at the
 * infobox's foot, as the page draws them. The editor shows them while a page is written.
 */
export const GET: APIRoute = async () => {
  const out: Record<string, { boxes: string[]; steps: string[] }> = {};
  for (const e of await getCollection('articles')) {
    const list = seriesOf(e.id);
    if (!list.length) continue;
    out[e.id] = {
      boxes: list.map((s) => seriesHtml(s, e.id)),
      steps: list.map((s) => stepsHtml(s, list.length > 1)).filter(Boolean),
    };
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
};
