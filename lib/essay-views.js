// ─── Essay page templates ───────────────────────────────────────
// Server-rendered HTML for /essay and /essay/:slug, styled with the
// same tokens as the hand-written essays in public/essays/.

const sanitizeHtml = require('sanitize-html');

const SITE_NAME = 'Eudaimonia';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// WordPress returns titles with entities already encoded (&#8217; etc).
// Strip any tags, then decode the handful of entities WP produces so the
// text can be safely re-escaped for titles and meta tags.
function plainText(html = '') {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Authors are public sign-ups, so treat post HTML as untrusted even
// though an admin approves it: no scripts, iframes, inline handlers or styles.
function cleanContent(html = '') {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'h1', 'h2', 'del', 'ins', 'sup', 'sub']),
    allowedAttributes: {
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading'],
      '*': ['id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
    },
  });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function readingMinutes(html) {
  const words = plainText(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function layout({ title, description, canonical, body, image, styles, bodyClass = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : ''}
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
${styles.map(href => `  <link rel="stylesheet" href="${href}" />`).join('\n')}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>`;
}

function header(backHref, backLabel) {
  return `
  <header class="article-header">
    <a href="${backHref}" class="article-back">${backLabel}</a>
    <a href="/" class="article-logo" aria-label="${SITE_NAME} home">
      <img src="/logo.png" alt="${SITE_NAME}" />
    </a>
  </header>`;
}

function essayCard(essay, index, total) {
  const title = plainText(essay.title);
  const desc = truncate(plainText(essay.excerptHtml), 160);
  const num = String(index + 1).padStart(2, '0');
  const of = String(total).padStart(2, '0');
  const img = essay.image
    ? `<div class="essay-card-img"><img src="${escapeHtml(essay.image.cardSrc)}" alt="${escapeHtml(essay.image.alt)}" loading="lazy" /></div>`
    : `<div class="essay-card-img essay-card-img--placeholder"></div>`;

  return `
        <a href="/essay/${encodeURIComponent(essay.slug)}" class="essay-card">
          ${img}
          <div class="essay-card-body">
            <h3 class="essay-card-title">${escapeHtml(title)}</h3>
            ${essay.author ? `<p class="essay-card-author">By ${escapeHtml(essay.author)}</p>` : ''}
            <p class="essay-card-desc">${escapeHtml(desc)}</p>
            <span class="essay-card-link">Read essay</span>
            <div class="essay-card-meta">
              <span class="essay-card-num">${num} / ${of}</span>
              <span class="essay-card-date">${formatDate(essay.date)} · ${readingMinutes(essay.contentHtml)} min</span>
            </div>
          </div>
        </a>`;
}

function pagination(page, totalPages) {
  if (totalPages <= 1) return '';
  const prev = page > 1
    ? `<a class="essay-pager-link" href="/essay${page - 1 > 1 ? `?page=${page - 1}` : ''}">← Newer</a>`
    : '<span></span>';
  const next = page < totalPages
    ? `<a class="essay-pager-link" href="/essay?page=${page + 1}">Older →</a>`
    : '<span></span>';
  return `
      <nav class="essay-pager" aria-label="Pagination">
        ${prev}
        <span class="essay-pager-count">${String(page).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}</span>
        ${next}
      </nav>`;
}

// Same frame, section head, card grid and footer as the home page
// (public/index.html), so it loads style.css rather than a copy of it.
function homeFrame() {
  const items = [['episteme', '01', 'Episteme'], ['theoria', '02', 'Theoria'], ['pragma', '03', 'Pragma']];
  return `
  <a href="/" class="logo-mark logo-visible logo-settled logo-dark" aria-label="${SITE_NAME} home">
    <img src="/logo.png" alt="" />
  </a>

  <div class="frame scrolled">
    <div class="frame-left"></div>
    <nav class="frame-nav">
${items.map(([id, num, label]) => `      <a href="/#${id}" class="frame-nav-item">
        <span class="frame-nav-num">${num}</span>
        <span class="frame-nav-label">${label}</span>
      </a>`).join('\n')}
    </nav>
    <div class="frame-right"></div>
  </div>`;
}

function homeFooter() {
  return `<footer>
    <div class="footer-grid">
      <div class="footer-body">
        <p class="footer-name">${new Date().getFullYear()}</p>
        <p class="footer-made">Made with 60% white matter and 40% grey matter by volume</p>
        <p class="footer-avail">Open to correspondence</p>
      </div>
    </div>
  </footer>`;
}

function renderEssayList({ essays, total, totalPages, page, perPage, siteUrl }) {
  const offset = (page - 1) * perPage;
  const cards = essays.length
    ? `<div class="essay-grid">${essays.map((e, i) => essayCard(e, offset + i, total)).join('')}
        </div>`
    : `<p class="section-intro essay-empty">No essays have been published yet.</p>`;

  return layout({
    title: `Essays — ${SITE_NAME}`,
    description: 'Essays from the Eudaimonias community.',
    canonical: `${siteUrl}/essay${page > 1 ? `?page=${page}` : ''}`,
    styles: ['/style.css?v=12', '/essays/essay-index.css'],
    bodyClass: 'essay-page',
    body: `${homeFrame()}

  <main>
    <section class="section section--inline-head">
      <div class="section-head">
        <div class="section-counter">${String(total).padStart(2, '0')} ${total === 1 ? 'essay' : 'essays'}</div>
        <div class="section-head-row">
          <h1 class="section-title">Essays</h1>
          <p class="section-kicker">Episteme — writings from the community</p>
        </div>
        <div class="section-progress-bar"><div class="section-progress-fill"></div></div>
      </div>

      <div class="section-body">
        ${cards}
        ${pagination(page, totalPages)}
      </div>
    </section>
  </main>

  ${homeFooter()}`,
  });
}

function renderEssay({ essay, siteUrl }) {
  const title = plainText(essay.title);
  const description = truncate(plainText(essay.excerptHtml), 160);
  const cover = essay.image
    ? `<figure class="article-cover"><img src="${escapeHtml(essay.image.src)}" alt="${escapeHtml(essay.image.alt)}" /></figure>`
    : '';

  const { html: bodyHtml, toc } = withHeadingIds(cleanContent(essay.contentHtml));
  const tocHtml = toc.length ? `
  <!-- ─── Table of Contents ───────────────────────────────── -->
  <aside class="article-toc">
    <p class="article-toc-label">Contents</p>
    <ol class="article-toc-list">
${toc.map(h => `      <li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('\n')}
    </ol>
  </aside>
` : '';

  // Markup mirrors the hand-written essays in public/essays/*.html
  // (e.g. death-equals-complacency.html) so both look identical.
  return layout({
    title: `${title} — ${SITE_NAME}`,
    description,
    canonical: `${siteUrl}/essay/${encodeURIComponent(essay.slug)}`,
    image: essay.image && essay.image.src,
    styles: ['/essays/article.css', '/essays/essay-index.css'],
    body: `
  <!-- ─── Fixed Header ─────────────────────────────────────── -->
  <header class="article-header">
    <a href="/#episteme" class="article-back">Episteme</a>
    <div class="article-logo">
      <img src="/logo.png" alt="${SITE_NAME}" />
    </div>
  </header>
${tocHtml}
  <!-- ─── Article ──────────────────────────────────────────── -->
  <main class="article-main">
    <div class="article-wrap">

      ${cover}

      <p class="article-kicker">Essay &middot; ${formatDate(essay.date)}</p>
      <h1 class="article-title">${escapeHtml(title)}</h1>
      <hr class="article-rule" />

      <div class="article-body">
        ${bodyHtml}
      </div>

    </div>
  </main>

  <!-- ─── Footer ───────────────────────────────────────────── -->
  <footer class="article-footer">
    <div class="article-footer-inner">
      <span class="article-footer-label">${SITE_NAME} &mdash; Episteme</span>
      <a href="/#episteme" class="article-footer-back">Back to Episteme</a>
    </div>
  </footer>

  <script>
    const headings = document.querySelectorAll('.article-body h2[id]');
    const links    = document.querySelectorAll('.article-toc-list a');

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const link = document.querySelector(\`.article-toc-list a[href="#\${entry.target.id}"]\`);
        if (link) link.classList.toggle('active', entry.isIntersecting);
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    headings.forEach(h => observer.observe(h));
  </script>
`,
  });
}

// Give every <h2> in the post an id (WordPress headings usually have none)
// and collect them for the "Contents" sidebar, like the static essays.
function withHeadingIds(html) {
  const toc = [];
  const used = new Set();
  const out = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (match, attrs, inner) => {
    const text = plainText(inner);
    if (!text) return match;
    const existing = attrs.match(/\sid="([^"]+)"/);
    let id = existing ? existing[1] : text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
    if (!existing) {
      const base = id;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    }
    used.add(id);
    toc.push({ id, text });
    return existing ? match : `<h2${attrs} id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

function renderMessage({ status, heading, message, siteUrl }) {
  return layout({
    title: `${heading} — ${SITE_NAME}`,
    description: message,
    canonical: `${siteUrl}/essay`,
    styles: ['/essays/article.css', '/essays/essay-index.css'],
    body: `${header('/essay', 'Essays')}

  <main class="article-main">
    <div class="article-wrap">
      <p class="article-kicker">${status}</p>
      <h1 class="article-title">${escapeHtml(heading)}</h1>
      <hr class="article-rule" />
      <div class="article-body"><p>${escapeHtml(message)}</p></div>
    </div>
  </main>

  ${footer('/essay', 'All essays')}`,
  });
}

function footer(href, label) {
  return `<footer class="article-footer">
    <div class="article-footer-inner">
      <span class="article-footer-label">${SITE_NAME}</span>
      <a href="${href}" class="article-footer-back">${label}</a>
    </div>
  </footer>`;
}

module.exports = { renderEssayList, renderEssay, renderMessage };
