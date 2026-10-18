/**
 * An article's type, named the way a Wikipedia category would be. Most types now file
 * under one of the broad categories below; these names are the old per-type pages,
 * whose addresses forward to the broad one.
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

/** The type's own category, as it had a page before the broad ones. */
export function typeCategory(type) {
  const name = NAMES[type] || type.charAt(0).toUpperCase() + type.slice(1);
  return { name, slug: name.toLowerCase().replace(/\s+/g, '-') };
}

/** The category a type files under: its broad category, or its own when it has none
    (Characters, Lists). A type added without a name here still gets one. */
export function categoryOf(type) {
  const b = BROAD.find((x) => x.types.includes(type));
  return b ? { name: b.name, slug: b.slug } : typeCategory(type);
}

/** Old per-type addresses and the broad category each now forwards to. */
export function retired() {
  const out = [];
  for (const b of BROAD) {
    for (const t of b.types) {
      const old = typeCategory(t).slug;
      if (old !== b.slug) out.push({ from: old, to: b.slug });
    }
  }
  return out;
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
