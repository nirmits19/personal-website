// ─── Live time stamp ──────────────────────────────────────────
(function () {
  const el = document.getElementById('time');
  if (!el) return;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // Short TZ label (e.g. "GMT", "PDT") via formatToParts
  function tzLabel() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short',
      }).formatToParts(new Date());
      const n = parts.find(p => p.type === 'timeZoneName');
      return n ? n.value : tz;
    } catch {
      return tz;
    }
  }

  function update() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    el.textContent = `${hh}:${mm}:${ss} ${tzLabel()}`;
  }

  update();
  setInterval(update, 1000);
})();

// ─── Fade-in on scroll (softened) ─────────────────────────────
const fadeTargets = document.querySelectorAll('.hero, .section, footer');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

fadeTargets.forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
  observer.observe(el);
});

// Fade any already-visible targets on load
window.addEventListener('DOMContentLoaded', () => {
  fadeTargets.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      el.classList.add('visible');
    }
  });
});

// Apply visible class rule (unified selector)
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent =
    '.hero.visible, .section.visible, footer.visible { opacity: 1 !important; transform: none !important; }';
  document.head.appendChild(style);
});
