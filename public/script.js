// ─── Frame: transparent over hero, frosted-glass after ───────
(function () {
  const frame = document.getElementById('frame');
  const hero  = document.querySelector('.hero');

  function update() {
    const heroBottom = hero ? hero.offsetHeight : window.innerHeight;
    frame.classList.toggle('scrolled', window.scrollY > heroBottom * 0.85);
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ─── Live time stamp (header + hero clock) ───────────────────
(function () {
  const frameEl = document.getElementById('time');
  const heroEl  = document.getElementById('hero-clock');
  if (!frameEl && !heroEl) return;

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
    const label = tzLabel();
    if (frameEl) frameEl.textContent = `${hh}:${mm}:${ss} ${label}`;
    if (heroEl)  heroEl.textContent  = `${hh}:${mm}:${ss}`;
  }

  update();
  setInterval(update, 1000);
})();

// ─── Sunset countdown (IP-located, NOAA solar calc) ──────────
(function () {
  const el = document.getElementById('sunset-countdown');
  if (!el) return;

  // NOAA solar calculation — returns Date of sunset for given lat/lon on date
  function sunsetFor(date, lat, lon) {
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;

    // Day of year
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const diff = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
    const N = Math.floor(diff / 86400000);

    const lngHour = lon / 15;
    const t = N + ((18 - lngHour) / 24); // sunset approximation
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
    L = ((L % 360) + 360) % 360;

    let RA = deg * Math.atan(0.91764 * Math.tan(L * rad));
    RA = ((RA % 360) + 360) % 360;
    const Lquad  = Math.floor(L / 90) * 90;
    const RAquad = Math.floor(RA / 90) * 90;
    RA = (RA + (Lquad - RAquad)) / 15;

    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));

    const zenith = 90.833;
    const cosH = (Math.cos(zenith * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // no sunset

    const H = (360 - deg * Math.acos(cosH)) / 15; // sunset
    const T = H + RA - (0.06571 * t) - 6.622;
    let UT = T - lngHour;
    UT = ((UT % 24) + 24) % 24;

    const h = Math.floor(UT);
    const m = Math.floor((UT - h) * 60);
    const s = Math.floor((((UT - h) * 60) - m) * 60);

    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, s));
  }

  let lat = null, lon = null, sunsetTime = null;

  function pad(n) { return String(n).padStart(2, '0'); }

  function recompute() {
    if (lat === null) return;
    const now = new Date();
    sunsetTime = sunsetFor(now, lat, lon);
    if (sunsetTime && sunsetTime.getTime() < now.getTime()) {
      // past today's sunset — use tomorrow
      const t = new Date(now.getTime() + 86400000);
      sunsetTime = sunsetFor(t, lat, lon);
    }
  }

  function tick() {
    if (!sunsetTime) return;
    const now = new Date();
    let delta = Math.floor((sunsetTime.getTime() - now.getTime()) / 1000);
    if (delta <= 0) { recompute(); return; }
    const h = Math.floor(delta / 3600);
    const m = Math.floor((delta % 3600) / 60);
    const s = delta % 60;
    el.textContent = `−${pad(h)}:${pad(m)}:${pad(s)} TO SUNSET`;
  }

  fetch('https://ipapi.co/json/')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') throw 0;
      lat = data.latitude;
      lon = data.longitude;
      recompute();
      tick();
      setInterval(tick, 1000);
      setInterval(recompute, 60 * 60 * 1000); // rebase hourly
    })
    .catch(() => { el.style.display = 'none'; });
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
