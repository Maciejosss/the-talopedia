/**
 * An article's type is its category, named the way a Wikipedia category would be.
 * Every page of a type is listed at /category/<slug>, and each article links there
 * from its foot.
 */
export const NAMES = {
  overview: 'Nations and territories',
  city: 'Cities',
  subdivision: 'Subdivisions',
  continent: 'Continents',
  geography: 'Geography',
  celestial: 'Celestial bodies',
  character: 'Characters',
  military: 'Military',
  organization: 'Organizations',
  company: 'Companies',
  'national-team': 'National football teams',
  league: 'Football leagues',
  cup: 'Football cups',
  racecourse: 'Racecourses',
  'horse-race': 'Horse races',
  ideology: 'Ideologies',
  religion: 'Religions',
  ethnicity: 'Ethnic groups',
  event: 'Events',
  list: 'Lists',
};

/**
 * The broad categories a reader explores by. Each gathers the types under it and has a
 * page of its own, drawn from what those pages' sidebars say.
 */
export const BROAD = [
  { slug: 'nations-and-places', name: 'Nations & Places', types: ['overview', 'subdivision', 'city', 'continent', 'geography'] },
  { slug: 'history', name: 'History', types: ['event'] },
  { slug: 'military', name: 'Military', types: ['military'] },
  { slug: 'space', name: 'Space', types: ['celestial'] },
  { slug: 'sport', name: 'Sport', types: ['national-team', 'league', 'cup', 'racecourse', 'horse-race'] },
  { slug: 'society', name: 'Society', types: ['ideology', 'religion', 'ethnicity', 'organization', 'company'] },
];

/** The category a type files under. A type added without a name here still gets one. */
export function categoryOf(type) {
  const name = NAMES[type] || type.charAt(0).toUpperCase() + type.slice(1);
  return { name, slug: name.toLowerCase().replace(/\s+/g, '-') };
}

/**
 * Every category with at least one page in it, each with its pages in title order.
 * The home page is the site's front page, not an article anyone files.
 */
export function categories(entries) {
  const out = new Map();
  for (const e of entries) {
    if (e.id === 'home') continue;
    const c = categoryOf(e.data.type);
    if (!out.has(c.slug)) out.set(c.slug, { ...c, pages: [] });
    out.get(c.slug).pages.push({ slug: e.id, title: e.data.title });
  }
  const byTitle = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  for (const c of out.values()) c.pages.sort((a, b) => byTitle(a.title, b.title));
  return [...out.values()].sort((a, b) => byTitle(a.name, b.name));
}
