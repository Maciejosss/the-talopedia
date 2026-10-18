import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { NAMES } from './lib/categories.mjs';

// Every type is a category, so the category names are the one list of types, in the
// order the editor offers them. "geography" used to carry planets, provinces and
// continents at once; they all wanted different infoboxes, so each is its own type now.
export const ARTICLE_TYPES = Object.keys(NAMES) as [string, ...string[]];

const row = z.object({
  section: z.string().optional(),                       // a heading band inside the infobox
  // An office held: the post, and the term served in it, as one band. Two rows read
  // as two separate things; the old documents had them as one and so does this.
  office: z.string().optional(),
  term: z.union([z.string(), z.array(z.string())]).optional(),
  label: z.string().optional(),
  value: z.union([z.string(), z.array(z.string())]).optional(),
  image: z.string().optional(),
  caption: z.string().optional(),
  // A picture row set flush under the row above, no divider between: the rows of a gallery.
  join: z.boolean().optional(),
  // Two pictures side by side in one row, as a flag beside a coat of arms.
  images: z.array(z.object({
    src: z.string().default(''),
    caption: z.string().default(''),
  })).optional(),
  sub: z.boolean().default(false),                      // renders the bullet, so nobody types one
  // Any cell's lines can nest, as a battle under its campaign under its war: two spaces
  // of indent a level. On a row that nests, `depth` is how far and `guides` whether the
  // lines between levels are drawn, as Wikipedia's tree list draws them. `tree` is the
  // Nested List row that came first, read as a field whose value nests.
  tree: z.array(z.string()).optional(),
  depth: z.number().int().min(1).max(4).optional(),
  guides: z.boolean().optional(),
  // Two lists shown side by side, as belligerents or commanders in a war infobox. A side
  // is named in bold on its first line; `heading` is how sides were named before, and the
  // page reads it as that line.
  pair: z.array(z.object({
    heading: z.string().optional(),
    items: z.array(z.string()).default([]),
  })).optional(),
});

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    // The heading the sidebar carries, when the page wants a different one from the
    // article's. Left out, the sidebar takes the article title.
    sidebarTitle: z.string().optional(),
    nativeTitle: z.union([z.string(), z.array(z.string())]).optional(),   // one line per official language
    romaji: z.union([z.string(), z.array(z.string())]).optional(),   // a line to match each native title
    type: z.enum(ARTICLE_TYPES),
    nation: z.string().optional(),                      // drives the navbox attached at the foot
    authors: z.array(z.string()).optional(),            // byline, when it differs from `nation`
    navbox: z.string().optional(),                      // navbox to attach, when it differs
    icon: z.string().optional(),                        // shown by :icon[slug] wherever linked
    ooc: z.boolean().default(false),
    coords: z.string().optional(),   // overrides the map lookup
    infobox: z.array(row).default([]),
    movedFrom: z.array(z.string()).optional(),          // addresses it had before, which forward here
  }),
});

const portals = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/portals' }),
  schema: z.object({
    title: z.string(),
    nation: z.string(),
    banner: z.string().optional(),
    welcome: z.string().optional(),
  }),
});

export const collections = { articles, portals };
