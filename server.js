require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { getEssays, getEssayBySlug, clearCache } = require('./lib/wordpress');
const { renderEssayList, renderEssay, renderMessage } = require('./lib/essay-views');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = (process.env.SITE_URL || 'https://www.eudaimonias.me').replace(/\/+$/, '');
const ESSAYS_PER_PAGE = 12;

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

app.get('/essay', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const { essays, total, totalPages } = await getEssays({ page, perPage: ESSAYS_PER_PAGE });
    res.set('Cache-Control', 'no-cache');
    res.send(renderEssayList({ essays, total, totalPages, page, perPage: ESSAYS_PER_PAGE, siteUrl: SITE_URL }));
  } catch (err) {
    // WordPress answers 400 when ?page= is past the last page.
    if (page > 1) return res.redirect('/essay');
    console.error('[essay] list failed:', err.message);
    unavailable(res);
  }
});

app.get('/essay/:slug', async (req, res) => {
  const slug = req.params.slug.toLowerCase();
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
