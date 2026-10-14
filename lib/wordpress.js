// ─── WordPress REST client ──────────────────────────────────────
// Server-side only: the browser never talks to WordPress directly.
// Only published posts are requested, so drafts and posts pending
// admin approval can never leak onto the site.

const WP_API_URL = (process.env.WP_API_URL || 'https://essay.eudaimonias.me/wp-json/wp/v2').replace(/\/+$/, '');
// 0 (default) = ask WordPress on every request, so approving or
// unpublishing an essay shows immediately. The last good response is
// still kept as a fallback for when WordPress is down or slow. Raise this
// only if WordPress struggles with traffic.
const CACHE_TTL_MS = Number(process.env.WP_CACHE_TTL_SECONDS || 0) * 1000;
const TIMEOUT_MS = 8000;

// Optional: an Application Password lets the site keep working if the
// WordPress REST API is locked down to authenticated requests only.
const AUTH_HEADER = process.env.WP_APP_USER && process.env.WP_APP_PASSWORD
  ? 'Basic ' + Buffer.from(`${process.env.WP_APP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64')
  : null;

const cache = new Map();

async function wpGet(endpoint, params) {
  const url = `${WP_API_URL}/${endpoint}?${new URLSearchParams(params)}`;

  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value;

  const headers = { Accept: 'application/json' };
  if (AUTH_HEADER) headers.Authorization = AUTH_HEADER;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`WordPress responded ${res.status} for ${endpoint}`);

    const value = {
      data: await res.json(),
      total: Number(res.headers.get('x-wp-total') || 0),
      totalPages: Number(res.headers.get('x-wp-totalpages') || 1),
    };
    cache.set(url, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    // WordPress down or slow: serve the last good copy rather than an error page.
    if (hit) return hit.value;
    throw err;
  }
}

// Keep the payload small: only the fields the essay pages use.
const POST_FIELDS = 'id,slug,status,date,modified,title,excerpt,content,author,featured_media,_links,_embedded';

// Belt and braces: the requests already ask for status=publish, but drop
// anything else (pending, draft, private, future) in case a plugin or an
// authenticated request ever returns it.
const isPublished = post => post.status === 'publish';

function normalisePost(post) {
  const embedded = post._embedded || {};
  const author = (embedded.author && embedded.author[0]) || {};
  const media = (embedded['wp:featuredmedia'] && embedded['wp:featuredmedia'][0]) || null;
  const sizes = (media && media.media_details && media.media_details.sizes) || {};
  const card = sizes.medium_large || sizes.large || null;

  return {
    id: post.id,
    slug: post.slug,
    date: post.date,
    modified: post.modified,
    title: post.title.rendered,
    excerptHtml: post.excerpt.rendered,
    contentHtml: post.content.rendered,
    author: author.name || '',
    image: media && media.source_url ? {
      src: media.source_url,
      cardSrc: card ? card.source_url : media.source_url,
      alt: media.alt_text || '',
    } : null,
  };
}

async function getEssays({ page = 1, perPage = 12 } = {}) {
  const { data, total, totalPages } = await wpGet('posts', {
    status: 'publish',
    per_page: perPage,
    page,
    orderby: 'date',
    order: 'desc',
    _embed: 'author,wp:featuredmedia',
    _fields: POST_FIELDS,
  });
  return { essays: data.filter(isPublished).map(normalisePost), total, totalPages };
}

async function getEssayBySlug(slug) {
  const { data } = await wpGet('posts', {
    slug,
    status: 'publish',
    _embed: 'author,wp:featuredmedia',
    _fields: POST_FIELDS,
  });
  const post = data.find(isPublished);
  return post ? normalisePost(post) : null;
}

function clearCache() {
  cache.clear();
}

module.exports = { getEssays, getEssayBySlug, clearCache };
