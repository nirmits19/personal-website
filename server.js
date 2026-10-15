require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { getEssays, getEssayBySlug, clearCache, SECTIONS, SECTION_SLUGS } = require('./lib/wordpress');
const { renderEssayList, renderEssayGroups, renderEssay, renderMessage } = require('./lib/essay-views');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || 'https://www.eudaimonias.me').replace(/\/+$/, '');
const ESSAYS_PER_PAGE = 12;
const ESSAYS_PER_GROUP = 6;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Cache refresh hook ────────────────────────────────────────
// WordPress calls this when an essay is published, unpublished or
// updated, so changes show immediately instead of after the cache TTL.
// Disabled unless REVALIDATE_SECRET is set.
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || '';

function secretMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(REVALIDATE_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/wp-revalidate', (req, res) => {
  if (!REVALIDATE_SECRET || !secretMatches(req.get('x-revalidate-secret'))) {
    return res.status(401).json({ ok: false });
  }
  clearCache();
  res.json({ ok: true });
});

// ─── Essays from WordPress ─────────────────────────────────────
function notFound(res) {
  res.status(404).send(renderMessage({
    status: '404',
    heading: 'Essay not found',
    message: 'This essay does not exist or has not been published yet.',
    siteUrl: SITE_URL,
  }));
}

function unavailable(res) {
  res.status(503).send(renderMessage({
    status: '503',
    heading: 'Essays are unavailable',
    message: 'We could not load the essays right now. Please try again shortly.',
    siteUrl: SITE_URL,
  }));
}

// Essay count per section, for the tabs (per_page=1, read X-WP-Total).
async function getCounts() {
  const results = await Promise.all(SECTION_SLUGS.map(section => getEssays({ page: 1, perPage: 1, section })));
  return Object.fromEntries(SECTION_SLUGS.map((s, i) => [s, results[i].total]));
}

// /essay                    → All tab: newest essays of each section
// /essay/theoria            → one section, paginated (?page=2)
// /essay/<essay-slug>       → one essay
// Section names win over essay slugs, so no essay can be called
// "episteme", "theoria" or "pragma".
app.get('/essay', async (req, res) => {
  // Old /essay?section=theoria links → /essay/theoria
  if (SECTION_SLUGS.includes(req.query.section)) {
    const page = parseInt(req.query.page, 10);
    return res.redirect(301, `/essay/${req.query.section}${page > 1 ? `?page=${page}` : ''}`);
  }
  try {
    const groups = await Promise.all(SECTION_SLUGS.map(async slug => {
      const { essays, total } = await getEssays({ page: 1, perPage: ESSAYS_PER_GROUP, section: slug });
      return { slug, ...SECTIONS[slug], essays, total };
    }));
    const counts = Object.fromEntries(groups.map(g => [g.slug, g.total]));
    res.set('Cache-Control', 'no-cache');
    res.send(renderEssayGroups({ groups: groups.filter(g => g.total > 0), counts, siteUrl: SITE_URL }));
  } catch (err) {
    console.error('[essay] list failed:', err.message);
    unavailable(res);
  }
});

async function sendSection(req, res, section) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const [{ essays, total, totalPages }, counts] = await Promise.all([
      getEssays({ page, perPage: ESSAYS_PER_PAGE, section }),
      getCounts(),
    ]);
    res.set('Cache-Control', 'no-cache');
    res.send(renderEssayList({
      essays, total, totalPages, page, perPage: ESSAYS_PER_PAGE, section, counts, siteUrl: SITE_URL,
    }));
  } catch (err) {
    // WordPress answers 400 when ?page= is past the last page.
    if (page > 1) return res.redirect(`/essay/${section}`);
    console.error(`[essay] ${section} list failed:`, err.message);
    unavailable(res);
  }
}

app.get('/essay/:slug', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  if (SECTION_SLUGS.includes(slug)) return sendSection(req, res, slug);
  if (!/^[a-z0-9-]+$/.test(slug)) return notFound(res);
  try {
    const essay = await getEssayBySlug(slug);
    if (!essay) return notFound(res);
    res.set('Cache-Control', 'no-cache');
    res.send(renderEssay({ essay, siteUrl: SITE_URL }));
  } catch (err) {
    console.error(`[essay] ${slug} failed:`, err.message);
    unavailable(res);
  }
});

// Express 5 passes listen errors (e.g. port already in use) to this callback.
app.listen(PORT, (err) => {
  if (err) {
    console.error(`Could not start server on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Server running at http://localhost:${PORT}`);
});
