import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkTalopedia from './src/lib/remark-talopedia.mjs';
import { sync } from './scripts/sync.mjs';
import { retired } from './src/lib/categories.mjs';

const ARTICLES = path.resolve('src/content/articles');
const PORTALS = path.resolve('src/content/portals');
const NAVBOXES = path.resolve('src/content/data/navboxes');
// Where the editor is allowed to write, and what it writes there.
const KINDS = {
  article: { dir: ARTICLES, ext: '.md' },
  portal: { dir: PORTALS, ext: '.md' },
  navbox: { dir: NAVBOXES, ext: '.yaml' },
};
const CONTENT = path.resolve('src/content');
const MEDIA = path.resolve('public/assets/media');
const LIMIT = 2_000_000;
const UPLOAD_LIMIT = 16_000_000;   // base64 is ~4/3 of the file
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

/** Reads a JSON body with a hard size cap, then hands it to `done`. */
function readJson(req, res, limit, done) {
  const reply = (code, obj) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  let body = '';
  let aborted = false;
  req.on('data', (chunk) => {
    if (aborted) return;
    body += chunk;
    if (body.length > limit) {
      aborted = true;
      reply(413, { error: `Over ${Math.round(limit / 1e6)} MB.` });
      req.destroy();
    }
  });
  req.on('end', () => {
    if (aborted) return;
    try { done(JSON.parse(body), reply); }
    catch { reply(400, { error: 'Malformed request.' }); }
  });
}

/**
 * Pulls merged pull requests down while the dev server runs, so a contribution that
 * lands on GitHub shows up here without being asked for. It only ever fast-forwards
 * a clean checkout; anything else it reports and leaves alone.
 */
function autoPull() {
  const every = Number(process.env.SYNC_SECONDS || 60) * 1000;
  return {
    name: 'talopedia-auto-pull',
    apply: 'serve',
    configureServer(server) {
      if (every <= 0) return;
      const log = (m) => server.config.logger.info(`\x1b[36m[sync]\x1b[0m ${m}`);
      let last = '';
      const tick = () => {
        let r;
        try { r = sync(); } catch (e) { r = { state: 'offline', note: String(e.message) }; }
        if (r.state === 'pulled') {
          log(`pulled ${r.note}`);
          for (const f of r.files || []) log(`  ${f}`);
          if ((r.files || []).some((f) => f === 'package.json' || f === 'package-lock.json')) {
            log('package.json changed: run npm ci');
          }
          return;
        }
        // Said on the first look so it is clear this is running, and after that only
        // when the answer changes. Otherwise it would repeat itself every minute.
        const key = `${r.state}:${r.note}`;
        if (!last || (key !== last && r.state !== 'current')) log(`${r.state} - ${r.note}`);
        last = key;
      };
      tick();
      const timer = setInterval(tick, every);
      server.httpServer?.once('close', () => clearInterval(timer));
    },
  };
}

/**
 * Lets the editor write straight into src/content/articles while the dev server
 * is running. `apply: 'serve'` keeps it out of the build entirely, so the
 * deployed site has no write endpoint of any kind.
 */
function devSave() {
  return {
    name: 'talopedia-dev-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save', (req, res, next) => {
        if (req.method !== 'POST') return next();
        readJson(req, res, LIMIT, (payload, reply) => {
          const { slug, markdown, kind = 'article' } = payload ?? {};
          if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) {
            return reply(400, { error: 'Filename must be lowercase letters, digits and hyphens.' });
          }
          // A portal and a navbox share their slug with the nation's own article, so
          // which directory is written to cannot be read off the name.
          const target = KINDS[kind];
          if (!target) return reply(400, { error: `Unknown page kind "${kind}".` });
          if (typeof markdown !== 'string' || (target.ext === '.md' && !markdown.startsWith('---'))) {
            return reply(400, { error: 'That does not look like an article.' });
          }
          const { dir } = target;
          const file = path.join(dir, `${slug}${target.ext}`);
          // The slug pattern already bars traversal. This proves it rather than trusting it.
          if (path.dirname(path.resolve(file)) !== dir) {
            return reply(400, { error: `Refusing to write outside ${path.relative(process.cwd(), dir)}.` });
          }
          const existed = fs.existsSync(file);
          try { fs.writeFileSync(file, markdown); }
          catch (e) { return reply(500, { error: String(e.message || e) }); }
          reply(200, { ok: true, file: path.relative(process.cwd(), file), created: !existed });
        });
      });

      // Same deal for images: dev only, one directory, name and type checked.
      server.middlewares.use('/__upload', (req, res, next) => {
        if (req.method !== 'POST') return next();
        readJson(req, res, UPLOAD_LIMIT, (payload, reply) => {
          const { name, data } = payload ?? {};
          if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,120}$/.test(name) || name.includes('..')) {
            return reply(400, { error: 'Bad file name.' });
          }
          const ext = path.extname(name).toLowerCase();
          if (!IMAGE_EXT.has(ext)) {
            return reply(400, { error: `${ext || 'That'} is not an allowed image type.` });
          }
          if (typeof data !== 'string') return reply(400, { error: 'No file data.' });

          fs.mkdirSync(MEDIA, { recursive: true });
          // Never clobber an existing image; a second upload becomes name-2.jpg.
          const stem = name.slice(0, -ext.length);
          let file = path.join(MEDIA, name);
          for (let n = 2; fs.existsSync(file); n++) file = path.join(MEDIA, `${stem}-${n}${ext}`);
          if (path.dirname(path.resolve(file)) !== MEDIA) {
            return reply(400, { error: 'Refusing to write outside public/assets/media.' });
          }
          try { fs.writeFileSync(file, Buffer.from(data, 'base64')); }
          catch (e) { return reply(500, { error: String(e.message || e) }); }
          reply(200, { ok: true, path: '/assets/media/' + path.basename(file) });
        });
      });
    },
  };
}

const MIME = {
  '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.br': 'application/octet-stream',
};

/**
 * `pagefind --site dist` only exists after a build, which is why dev used to have
 * no search. Pagefind's Node API can index HTML that never touches disk, so the
 * dev server fetches its own pages, indexes them in memory, and serves
 * /pagefind/* from there. Editing an article reindexes it a moment later.
 */
function devSearch() {
  let files = new Map();
  let server;
  let timer;
  let running = false;

  // Vite may bind IPv6, so take the address it actually resolved rather than assuming one.
  function origin() {
    const resolved = server?.resolvedUrls?.local?.[0];
    if (resolved) return resolved.replace(/\/$/, '');
    const a = server?.httpServer?.address();
    if (!a) return null;
    if (typeof a === 'string') return a;
    const host = a.family === 'IPv6' || a.address?.includes(':') ? `[${a.address}]` : a.address;
    return `http://${host}:${a.port}`;
  }

  async function reindex(attempt = 0) {
    const base = origin();
    if (running) return;
    if (!base) {
      if (attempt < 5) setTimeout(() => reindex(attempt + 1), 500);
      return;
    }
    running = true;
    try {
      const pagefind = await import('pagefind');
      const { index } = await pagefind.createIndex();
      const slugs = fs.existsSync(ARTICLES)
        ? fs.readdirSync(ARTICLES).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))
        : [];
      for (const slug of slugs) {
        const res = await fetch(`${base}/${slug}`);
        if (!res.ok) continue;
        await index.addHTMLFile({ url: `/${slug}`, content: await res.text() });
      }
      const out = await index.getFiles();
      files = new Map(out.files.map((f) => [f.path, f.content]));
      await index.deleteIndex();
      console.log(`[search] indexed ${slugs.length} article${slugs.length === 1 ? '' : 's'}`);
    } catch (e) {
      console.warn('[search] index failed:', e.message || e);
      if (attempt < 3) setTimeout(() => reindex(attempt + 1), 800);
    } finally {
      running = false;
    }
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(reindex, 700); };

  return {
    name: 'talopedia-dev-search',
    apply: 'serve',
    configureServer(s) {
      server = s;
      server.middlewares.use('/pagefind', (req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const body = files.get(name);
        if (!body) return next();
        res.setHeader('content-type', MIME[path.extname(name)] || 'application/octet-stream');
        res.end(Buffer.from(body));
      });

      server.httpServer?.once('listening', () => schedule());

      for (const event of ['add', 'change', 'unlink']) {
        server.watcher.on(event, (file) => {
          if (path.resolve(file).startsWith(CONTENT)) schedule();
        });
      }
    },
    async closeBundle() {
      try { (await import('pagefind')).close(); } catch {}
    },
  };
}

// BASE_PATH is '/' for a user site (<name>.github.io) and '/<repo>/' for a project site.
// Addresses a page has moved away from. They forward to it, and are not pages to list.
const MOVED = new Set(fs.readdirSync('src/content/articles').filter((f) => f.endsWith('.md'))
  .flatMap((f) => (fs.readFileSync(`src/content/articles/${f}`, 'utf8').match(/^movedFrom:\s*\[([^\]]*)\]/m)?.[1] || '')
    .split(',').map((x) => x.trim()).filter(Boolean)));

// Old per-type category addresses, which forward to the broad categories.
const RETIRED = new Set(retired().map((r) => `/category/${r.from}`).map((p) => (process.env.BASE_PATH || '/').replace(/\/$/, '') + p));

export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  markdown: {
    remarkPlugins: [remarkTalopedia],
    smartypants: false,
  },
  // Every page a reader would search for. The editor, the page histories, sources and
  // connections, raw JSON and the search and random pages are tools, not entries.
  integrations: [sitemap({
    filter: (page) => {
      const where = new URL(page).pathname;
      // Only a tool at the top of the address: /category/history is a page to list.
      const top = where.slice((process.env.BASE_PATH || '/').length).split('/')[0];
      return !['edit', 'history', 'source', 'connections', 'raw', 'search', 'random', 'wanted'].includes(top)
        && !MOVED.has(where.replace(/\/$/, '').split('/').pop())
        && !RETIRED.has(where.replace(/\/$/, ''));
    },
  })],
  vite: { plugins: [autoPull(), devSave(), devSearch()] },
});
