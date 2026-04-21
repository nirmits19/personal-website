// ─── WebGL Fluid Hero Shader ──────────────────────────────────
(function () {
  const canvas = document.getElementById('hero-gl');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) { canvas.style.display = 'none'; return; }

  const vert = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const frag = `
    precision mediump float;
    uniform float u_time;
    uniform float u_scroll;
    uniform vec2  u_res;
    uniform vec2  u_mouse;

    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(dot(hash2(i),             f),
            dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
        mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
            dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 6; i++) {
        v += a * noise(p);
        p  = p * 2.1 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / u_res;
      uv.y = 1.0 - uv.y;
      float t = u_time * 0.07;

      // Scroll distortion — warp increases as hero leaves viewport
      uv.x += u_scroll * 0.12 * sin(uv.y * 3.14159);
      uv.y += u_scroll * 0.08;

      // Mouse influence (normalised 0-1)
      vec2 m = u_mouse / u_res;
      m.y = 1.0 - m.y;

      // Domain warp — two layers
      vec2 q = vec2(fbm(uv * 2.0 + t),
                    fbm(uv * 2.0 + vec2(1.0, t)));
      vec2 r = vec2(fbm(uv * 2.0 + q + vec2(1.7, 9.2) + 0.15 * t),
                    fbm(uv * 2.0 + q + vec2(8.3, 2.8) + 0.13 * t));

      float f = fbm(uv * 2.5 + r);

      // Mouse warmth — cursor leaves a warm bloom
      float md = length(uv - m);
      f += 0.18 * exp(-md * 4.5);

      // Edge vignette darkening
      float vig = 1.0 - smoothstep(0.3, 1.2, length(uv - 0.5) * 1.6);
      f *= vig;

      // Warm dark palette: deep brown → amber
      vec3 c0 = vec3(0.06, 0.04, 0.02);
      vec3 c1 = vec3(0.18, 0.10, 0.04);
      vec3 c2 = vec3(0.38, 0.22, 0.08);
      vec3 col = mix(c0, c1, smoothstep(0.0, 0.5, f));
      col      = mix(col, c2, smoothstep(0.4, 0.9, f));

      float alpha = smoothstep(0.0, 0.3, f) * 0.72;
      gl_FragColor = vec4(col, alpha);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);

  // Full-screen quad
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uTime  = gl.getUniformLocation(prog, 'u_time');
  const uRes   = gl.getUniformLocation(prog, 'u_res');
  const uMouse = gl.getUniformLocation(prog, 'u_mouse');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');

  let mx = 0, my = 0, glScroll = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  let start = null;
  function frame(ts) {
    if (!start) start = ts;
    const t = (ts - start) / 1000;
    glScroll += ((window.__glScrollTarget || 0) - glScroll) * 0.05;
    gl.uniform1f(uTime, t);
    gl.uniform1f(uScroll, glScroll);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uMouse, mx, my);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ─── Custom Cursor ────────────────────────────────────────────
(function () {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  (function animCursor() {
    rx += (mx - rx) * 0.13;
    ry += (my - ry) * 0.13;
    dot.style.left  = mx + 'px'; dot.style.top  = my + 'px';
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
    requestAnimationFrame(animCursor);
  })();

  // Hover state
  document.querySelectorAll('a, button, .entry, .frame-nav-item').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  // Dark/light zone detection (hero is dark)
  const hero = document.querySelector('.hero');
  window.addEventListener('scroll', () => {
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    document.body.classList.toggle('cursor-on-dark', rect.bottom > 0 && rect.top < window.innerHeight);
  }, { passive: true });
  // Set initial state
  document.body.classList.add('cursor-on-dark');
})();

// ─── Marquee ──────────────────────────────────────────────────
(function () {
  const track = document.getElementById('marquee-track');
  if (!track) return;
  const items = [
    'Episteme', '·', 'Theoria', '·', 'Pragma', '·',
    'Essays & Writings', '·', 'Literature', '·', 'Present Affairs', '·',
    'Episteme', '·', 'Theoria', '·', 'Pragma', '·',
    'Essays & Writings', '·', 'Literature', '·', 'Present Affairs', '·',
  ];
  const frag = document.createDocumentFragment();
  [...items, ...items].forEach(t => {
    const span = document.createElement('span');
    if (t === '·') span.className = 'sep';
    span.textContent = t;
    frag.appendChild(span);
  });
  track.appendChild(frag);
})();

// ─── Staggered entry reveals ──────────────────────────────────
(function () {
  const entries = document.querySelectorAll('.entry');
  const obs = new IntersectionObserver((list) => {
    list.forEach(e => {
      if (!e.isIntersecting) return;
      const siblings = [...e.target.closest('.entry-list').querySelectorAll('.entry')];
      const idx = siblings.indexOf(e.target);
      e.target.style.transitionDelay = (idx * 0.08) + 's';
      e.target.classList.add('entry-visible');
      obs.unobserve(e.target);
    });
  }, { threshold: 0.1 });
  entries.forEach(el => obs.observe(el));
})();

// ─── Frame: transparent over hero, frosted-glass after ───────
(function () {
  const frame = document.getElementById('frame');
  const hero  = document.querySelector('.hero');

  let lastY = window.scrollY;
  function update() {
    const rect = hero ? hero.getBoundingClientRect() : null;
    const h    = rect ? rect.height : window.innerHeight;
    const b    = rect ? rect.bottom : window.innerHeight - window.scrollY;
    const y    = window.scrollY;
    const scrollingUp = y < lastY - 1; // small deadzone to ignore jitter
    lastY = y;

    const atTop = b > h * 0.85;
    const past  = b < h * 0.05;

    // Three-state visibility, direction-aware:
    //  • at the very top of the hero  → transparent white-text nav
    //  • past the hero                → frosted-bg nav
    //  • scrolling up anywhere        → frosted-bg nav (always reveal on up)
    //  • scrolling down through hero  → hidden (so it can't overlap the clock)
    if (atTop) {
      frame.classList.add('at-top');
      frame.classList.remove('scrolled');
    } else if (past || scrollingUp) {
      frame.classList.remove('at-top');
      frame.classList.add('scrolled');
    } else {
      frame.classList.remove('at-top', 'scrolled');
    }
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
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
    if (frameEl) frameEl.innerHTML = `${hh}:${mm}:${ss}<span class="tz-label"> ${label}</span>`;
    if (heroEl) {
      heroEl.innerHTML =
        `<span class="d">${hh}</span><span class="colon">:</span>` +
        `<span class="d">${mm}</span><span class="colon">:</span>` +
        `<span class="d">${ss}</span>`;
    }
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

    const H = (deg * Math.acos(cosH)) / 15; // sunset hour angle
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
    el.textContent = `−${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  // Rough lat/lon for common IANA timezones — fallback so we always
  // have *some* location and the timer never disappears.
  const TZ_FALLBACK = {
    'Europe/London':     [51.5, -0.13],
    'Europe/Dublin':     [53.35, -6.26],
    'Europe/Paris':      [48.86, 2.35],
    'Europe/Berlin':     [52.52, 13.4],
    'Europe/Amsterdam':  [52.37, 4.89],
    'Europe/Madrid':     [40.42, -3.7],
    'Europe/Rome':       [41.9, 12.5],
    'Europe/Athens':     [37.98, 23.73],
    'Europe/Moscow':     [55.75, 37.62],
    'America/New_York':  [40.71, -74.01],
    'America/Chicago':   [41.88, -87.63],
    'America/Denver':    [39.74, -104.99],
    'America/Los_Angeles':[34.05, -118.24],
    'America/Toronto':   [43.65, -79.38],
    'America/Vancouver': [49.28, -123.12],
    'America/Sao_Paulo': [-23.55, -46.63],
    'America/Mexico_City':[19.43, -99.13],
    'Asia/Tokyo':        [35.68, 139.69],
    'Asia/Shanghai':     [31.23, 121.47],
    'Asia/Hong_Kong':    [22.32, 114.17],
    'Asia/Singapore':    [1.35, 103.82],
    'Asia/Seoul':        [37.57, 126.98],
    'Asia/Kolkata':      [28.61, 77.21],
    'Asia/Dubai':        [25.2, 55.27],
    'Asia/Bangkok':      [13.75, 100.5],
    'Australia/Sydney':  [-33.87, 151.21],
    'Australia/Melbourne':[-37.81, 144.96],
    'Australia/Perth':   [-31.95, 115.86],
    'Pacific/Auckland':  [-36.85, 174.76],
    'Africa/Johannesburg':[-26.2, 28.04],
    'Africa/Cairo':      [30.04, 31.24],
    'Africa/Lagos':      [6.52, 3.38],
  };

  function tzFallback() {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = TZ_FALLBACK[z];
    if (hit) return { lat: hit[0], lon: hit[1] };
    // Last-ditch: derive longitude from UTC offset, assume mid-latitude
    const offsetH = -new Date().getTimezoneOffset() / 60;
    return { lat: 30, lon: offsetH * 15 };
  }

  const PROVIDERS = [
    { url: 'https://ipwho.is/',   pick: d => (d && d.success !== false) ? { lat: d.latitude,  lon: d.longitude }  : null },
    { url: 'https://ipapi.co/json/', pick: d => (d && typeof d.latitude === 'number') ? { lat: d.latitude, lon: d.longitude } : null },
  ];

  async function locate() {
    for (const p of PROVIDERS) {
      try {
        const r = await fetch(p.url);
        if (!r.ok) continue;
        const d = await r.json();
        const loc = p.pick(d);
        if (loc && typeof loc.lat === 'number' && typeof loc.lon === 'number') return loc;
      } catch { /* try next */ }
    }
    return tzFallback();
  }

  function start(loc) {
    lat = loc.lat;
    lon = loc.lon;
    recompute();
    tick();
    setInterval(tick, 1000);
    setInterval(recompute, 60 * 60 * 1000); // rebase hourly
  }

  // Kick off with immediate TZ-based estimate so the timer appears fast,
  // then refine with IP geolocation if/when it resolves.
  start(tzFallback());
  locate().then(loc => { if (loc) start(loc); });
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

// ─── Hero parallax ────────────────────────────────────────────
// Image drifts at ~0.35× scroll speed — cinematic layered feel.
(function () {
  const img = document.querySelector('.hero-image');
  if (!img) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  let latestY = 0, ticking = false;
  function onScroll() {
    latestY = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(apply);
      ticking = true;
    }
  }
  function apply() {
    img.style.transform = `translate3d(0, ${latestY * 0.35}px, 0)`;
    ticking = false;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  apply();
})();

// ─── Scroll → WebGL distortion ────────────────────────────────
// Exposes window.__setGLScroll so the scroll handler can push a value
window.__glScrollTarget = 0;
window.addEventListener('scroll', () => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const heroH = hero.offsetHeight;
  window.__glScrollTarget = Math.min(window.scrollY / heroH, 1);
}, { passive: true });

// ─── Section Reading Progress Bars ───────────────────────────
(function () {
  const sections = [
    { id: 'episteme', fill: 'prog-episteme' },
    { id: 'theoria',  fill: 'prog-theoria'  },
    { id: 'pragma',   fill: 'prog-pragma'   },
  ];
  function update() {
    sections.forEach(({ id, fill }) => {
      const sec  = document.getElementById(id);
      const bar  = document.getElementById(fill);
      if (!sec || !bar) return;
      const rect = sec.getBoundingClientRect();
      const prog = Math.max(0, Math.min(1, -rect.top / (rect.height - window.innerHeight)));
      bar.style.width = (prog * 100) + '%';
    });
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ─── Ink Bleed Section Entrance ───────────────────────────────
(function () {
  const secs = document.querySelectorAll('.ink-bleed');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('bleed-visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.04 });
  secs.forEach(s => {
    // Immediately reveal if already in viewport on load
    const rect = s.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      s.classList.add('bleed-visible');
    } else {
      obs.observe(s);
    }
  });
})();

// ─── Reading Progress Rings ───────────────────────────────────
(function () {
  const circumference = 2 * Math.PI * 14; // r=14 → ~87.96
  const rings = document.querySelectorAll('.ring-fill[data-progress]');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const pct = parseFloat(e.target.dataset.progress) / 100;
      const offset = circumference * (1 - pct);
      e.target.style.strokeDasharray = circumference;
      e.target.style.strokeDashoffset = circumference;
      requestAnimationFrame(() => {
        e.target.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)';
        e.target.style.strokeDashoffset = offset;
      });
      obs.unobserve(e.target);
    });
  }, { threshold: 0.3 });
  rings.forEach(r => obs.observe(r));
})();

// ─── Annotation Popovers ──────────────────────────────────────
(function () {
  document.querySelectorAll('[data-annotation]').forEach(el => {
    const tip = document.createElement('span');
    tip.className = 'annotation-tip';
    tip.textContent = el.dataset.annotation;
    el.style.position = 'relative';
    el.appendChild(tip);
  });
})();

// ─── Entry Expand on Click ────────────────────────────────────
(function () {
  document.querySelectorAll('.entry[data-expandable]').forEach(entry => {
    entry.addEventListener('click', e => {
      if (e.target.closest('a')) return; // don't intercept link clicks
      entry.classList.toggle('entry-open');
    });
  });
})();

// ─── Magnetic Nav ─────────────────────────────────────────────
(function () {
  const items = document.querySelectorAll('.frame-nav-item[data-magnetic]');
  const strength = 0.3;
  items.forEach(item => {
    item.addEventListener('mousemove', e => {
      const rect = item.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      item.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    item.addEventListener('mouseleave', () => {
      item.style.transform = '';
    });
  });
})();

// ─── Typewriter Footer Quote ──────────────────────────────────
(function () {
  const el = document.querySelector('.footer-quote');
  if (!el) return;
  const text = el.textContent.trim();
  el.innerHTML = [...text].map(c =>
    `<span class="char">${c === ' ' ? '&nbsp;' : c}</span>`
  ).join('');
  const chars = el.querySelectorAll('.char');
  let started = false;
  const obs = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting || started) return;
    started = true;
    chars.forEach((ch, i) => {
      setTimeout(() => ch.classList.add('char-visible'), i * 28);
    });
    obs.disconnect();
  }, { threshold: 0.5 });
  obs.observe(el);
})();

// ─── Floating Dock (show after hero) ────────────────────────
(function () {
  const dock = document.getElementById('dock');
  if (!dock) return;
  const hero = document.querySelector('.hero');
  function update() {
    const past = hero ? hero.getBoundingClientRect().bottom < 0 : window.scrollY > window.innerHeight;
    dock.classList.toggle('dock-visible', past);
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
})();

// ─── Directory Overlay ────────────────────────────────────────
(function () {
  const overlay = document.getElementById('dir-overlay');
  const openBtn = document.getElementById('dock-dir');
  const closeBtn = document.getElementById('dir-close');
  if (!overlay || !openBtn) return;

  function open()  { overlay.classList.add('dir-open');  document.body.style.overflow = 'hidden'; }
  function close() { overlay.classList.remove('dir-open'); document.body.style.overflow = ''; }

  openBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.querySelectorAll('[data-dir-close]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();

// ─── EDM Beat + Sound Toggle ─────────────────────────────────
(function () {
  let ctx = null, gain = null, seq = null, playing = false;
  const BPM = 128, step = 60 / BPM / 4; // 16th note

  // Patterns (16 steps each)
  const kick  = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];
  const snare = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
  const hat   = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];
  const bass  = [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,0];
  const bassNote = [55, 55, 55, 45, 55, 55, 45, 50, 55, 55, 55, 50, 45, 50, 55, 55];

  function getCtx() {
    if (!ctx) {
      ctx  = new (window.AudioContext || window.webkitAudioContext)();
      gain = ctx.createGain(); gain.gain.value = 0;
      gain.connect(ctx.destination);
    }
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  }

  function playKick(t) {
    const c = ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.01, t + 0.4);
    g.gain.setValueAtTime(1.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(gain); o.start(t); o.stop(t + 0.4);
  }

  function playSnare(t) {
    const c = ctx;
    const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const hpf = c.createBiquadFilter(), g = c.createGain();
    hpf.type = 'highpass'; hpf.frequency.value = 1500;
    src.buffer = buf;
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(hpf); hpf.connect(g); g.connect(gain);
    src.start(t); src.stop(t + 0.15);
  }

  function playHat(t) {
    const c = ctx;
    const buf = c.createBuffer(1, c.sampleRate * 0.05, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const hpf = c.createBiquadFilter(), g = c.createGain();
    hpf.type = 'highpass'; hpf.frequency.value = 8000;
    src.buffer = buf;
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hpf); hpf.connect(g); g.connect(gain);
    src.start(t); src.stop(t + 0.05);
  }

  function playBass(t, note) {
    const c = ctx;
    const o = c.createOscillator(), filt = c.createBiquadFilter(), g = c.createGain();
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    o.type = 'sawtooth'; o.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2000, t);
    filt.frequency.exponentialRampToValueAtTime(200, t + step * 0.8);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.85);
    o.connect(filt); filt.connect(g); g.connect(gain);
    o.start(t); o.stop(t + step * 0.9);
  }

  let stepIdx = 0, nextTime = 0;
  function schedule() {
    if (!playing) return;
    const c = ctx;
    const ahead = 0.1;
    while (nextTime < c.currentTime + ahead) {
      const s = stepIdx % 16;
      if (kick[s])  playKick(nextTime);
      if (snare[s]) playSnare(nextTime);
      if (hat[s])   playHat(nextTime);
      if (bass[s])  playBass(nextTime, bassNote[s]);
      nextTime += step;
      stepIdx++;
    }
    seq = setTimeout(schedule, 25);
  }

  function startEDM() {
    const c = getCtx();
    nextTime = c.currentTime + 0.05;
    stepIdx = 0; playing = true;
    gain.gain.setTargetAtTime(0.7, c.currentTime, 0.5);
    schedule();
  }

  function stopEDM() {
    playing = false;
    clearTimeout(seq);
    if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  }

  let on = false;
  window.__cycleSound = function () {
    on = !on;
    const btn   = document.getElementById('dock-sound');
    const label = document.getElementById('sound-label');
    if (label) label.textContent = on ? 'Playing' : 'Sound';
    if (btn) btn.classList.toggle('sound-playing', on);
    if (on) startEDM(); else stopEDM();
  };
})();
