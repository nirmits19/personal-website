// ─── Loading Overlay ─────────────────────────────────────────
// Waits for (fonts ready) + (hero image decoded) + a small floor so
// the letter-by-letter reveal finishes, then fades the loader.
// The "lag at first load" the user reported was the browser doing
// font parse, image decode, and shader compile on the main thread
// before anything could respond — the loader makes this honest.
(function () {
  const loader = document.getElementById('loader');
  if (!loader) return;

  // Hard safety: never hold the overlay for more than 4 s.
  const HARD_TIMEOUT = 4000;
  // Minimum showtime so the letter reveal can complete (~600 ms).
  const MIN_SHOW = 650;
  const t0 = performance.now();

  const fontsReady = (document.fonts && document.fonts.ready)
    ? document.fonts.ready.catch(() => null)
    : Promise.resolve();

  function imageReady() {
    const img = document.querySelector('.hero-image img');
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(res => {
      img.addEventListener('load',  res, { once: true });
      img.addEventListener('error', res, { once: true });
    });
  }

  function domReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(res => {
      document.addEventListener('DOMContentLoaded', res, { once: true });
    });
  }

  function hide() {
    const wait = Math.max(0, MIN_SHOW - (performance.now() - t0));
    setTimeout(() => {
      loader.classList.add('loader-done');
      // Remove after fade so it doesn't eat pointer events / cost layers.
      setTimeout(() => loader.remove(), 600);
    }, wait);
  }

  Promise.race([
    Promise.all([fontsReady, imageReady(), domReady()]),
    new Promise(res => setTimeout(res, HARD_TIMEOUT)),
  ]).then(hide);
})();

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
      for (int i = 0; i < 3; i++) {
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

  // Render the shader at HALF resolution — CSS scales the canvas back up.
  // fbm shader is fragment-heavy; halving the pixel count is ~4× cheaper.
  const RENDER_SCALE = 0.5;
  function resize() {
    const w = canvas.offsetWidth  * RENDER_SCALE;
    const h = canvas.offsetHeight * RENDER_SCALE;
    canvas.width  = Math.max(1, Math.floor(w));
    canvas.height = Math.max(1, Math.floor(h));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  // Pause the shader raf loop when the hero is fully off-screen.
  let heroVisible = true;
  const heroEl = document.querySelector('.hero');
  if (heroEl && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }, { threshold: 0 })
      .observe(heroEl);
  }

  // Throttle to ~30 fps — the shader is a slow-drifting background,
  // 60 fps is wasted GPU time and competes with scroll compositing.
  let start = null, lastDraw = 0;
  const MIN_FRAME_MS = 33; // ~30 fps
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!heroVisible) return;
    if (ts - lastDraw < MIN_FRAME_MS) return;
    lastDraw = ts;
    if (!start) start = ts;
    const t = (ts - start) / 1000;
    glScroll += ((window.__glScrollTarget || 0) - glScroll) * 0.08;
    gl.uniform1f(uTime, t);
    gl.uniform1f(uScroll, glScroll);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform2f(uMouse, mx * RENDER_SCALE, my * RENDER_SCALE);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  requestAnimationFrame(frame);
})();

// ─── Custom Cursor ────────────────────────────────────────────
(function () {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0, moved = false;
  const hero = document.querySelector('.hero');

  // Decide whether the cursor's tip is currently over the dark hero area.
  // Previously this was tied to whether the hero *intersected* the viewport,
  // which meant the cursor stayed cream-on-cream after the hero began
  // scrolling off — invisible over Episteme. Now we check the pointer's
  // own Y against the hero's bottom edge.
  function updateDark() {
    if (!hero) return;
    const bottom = hero.getBoundingClientRect().bottom;
    document.body.classList.toggle('cursor-on-dark', my < bottom);
  }

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!moved) { rx = mx; ry = my; moved = true; }
    updateDark();
  });
  window.addEventListener('scroll', updateDark, { passive: true });

  (function animCursor() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    dot.style.transform  = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(animCursor);
  })();

  // Hover state — delegated so we don't attach hundreds of listeners.
  const hoverSel = 'a, button, .entry, .frame-nav-item, .dock-btn, .dir-cell';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(hoverSel)) document.body.classList.add('cursor-hover');
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(hoverSel)) document.body.classList.remove('cursor-hover');
  });

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

// ─── Unified scroll dispatcher ───────────────────────────────
// Every scroll-driven effect on the page reads through this one rAF-
// throttled tick — previously each was its own `scroll` listener and
// each called getBoundingClientRect independently. That was the root
// cause of the "very laggy / stuck" feel on devices where backdrop-
// filter + WebGL already eat GPU budget.
(function () {
  const frame = document.getElementById('frame');
  const hero  = document.querySelector('.hero');
  const dock  = document.getElementById('dock');
  const progEpi = document.getElementById('prog-episteme');
  const progThe = document.getElementById('prog-theoria');
  const progPra = document.getElementById('prog-pragma');
  const secEpi  = document.getElementById('episteme');
  const secThe  = document.getElementById('theoria');
  const secPra  = document.getElementById('pragma');

  let lastY = window.scrollY;
  let ticking = false;

  function tick() {
    ticking = false;
    const y  = window.scrollY;
    const vh = window.innerHeight;
    const hRect = hero ? hero.getBoundingClientRect() : null;
    const hH = hRect ? hRect.height : vh;
    const hB = hRect ? hRect.bottom : vh - y;
    const scrollingUp = y < lastY - 1;
    lastY = y;

    // Frame 3-state (at-top / scrolled / hidden)
    if (frame) {
      const atTop = hB > hH * 0.85;
      const past  = hB < hH * 0.05;
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

    // Dock visibility
    if (dock) dock.classList.toggle('dock-visible', hB < 0);

    // WebGL scroll distortion (0..1 through the hero)
    window.__glScrollTarget = Math.min(Math.max(y / hH, 0), 1);

    // Section progress bars (reads 3 rects, but only once per frame)
    function bar(sec, bar) {
      if (!sec || !bar) return;
      const r = sec.getBoundingClientRect();
      const denom = r.height - vh;
      const p = denom > 0 ? Math.max(0, Math.min(1, -r.top / denom)) : 0;
      bar.style.width = (p * 100) + '%';
    }
    bar(secEpi, progEpi); bar(secThe, progThe); bar(secPra, progPra);
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  tick();

  // Expose for other modules that still want to piggy-back.
  window.__scrollKick = onScroll;
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

// Hero parallax removed — continuously retranslating a 1.6 MB image
// layer on every scroll frame was a major jank source, especially on
// rapid direction changes. Native scroll of the hero is smoother.

// (Scroll → WebGL distortion, section progress bars, dock visibility,
//  and the frame state are all handled in the unified dispatcher above.)
window.__glScrollTarget = window.__glScrollTarget || 0;

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

// ─── Black-hole Cursor ───────────────────────────────────────
// Text elements near the pointer drift toward it — the cursor ring
// acts as a small gravity well. Scoped to a curated list of text
// nodes so the page layout itself doesn't move, and the pull is
// capped at a few pixels so it reads as a "drift" not a snap.
//
// Perf: element centers are cached and recomputed only on scroll /
// resize / entry reveal, NOT on every mousemove. The per-frame
// cost is O(n) simple math, no layout reads.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  const SELECTORS = [
    '.entry-title', '.entry-copy', '.entry-author',
    '.entry-counter', '.entry-date', '.entry-link',
    '.section-title', '.section-intro', '.section-kicker',
    '.footer-name', '.footer-made', '.footer-avail',
    '.frame-nav-label', '.dir-name', '.dock-btn-label',
  ].join(', ');

  const R = 180;          // radius of influence, px
  const PULL_MAX = 12;    // peak offset toward cursor, px
  const EPS = 0.1;

  const targets = [];

  function collect() {
    targets.length = 0;
    document.querySelectorAll(SELECTORS).forEach(el => {
      // Skip anything inside the loader or currently hidden.
      if (el.closest('#loader')) return;
      el.style.transition = 'transform 0.45s cubic-bezier(0.22, 0.9, 0.3, 1)';
      targets.push({ el, cx: 0, cy: 0, active: false });
    });
    measure();
  }

  function measure() {
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i].el.getBoundingClientRect();
      targets[i].cx = r.left + r.width  / 2;
      targets[i].cy = r.top  + r.height / 2;
    }
  }

  let mx = -9999, my = -9999, pending = false;
  function tick() {
    pending = false;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const dx = mx - t.cx;
      const dy = my - t.cy;
      const d  = Math.hypot(dx, dy);
      if (d < R) {
        const falloff = 1 - d / R;          // 0..1
        const mag = PULL_MAX * falloff;
        const ux = d > EPS ? dx / d : 0;
        const uy = d > EPS ? dy / d : 0;
        t.el.style.transform = `translate(${ux * mag}px, ${uy * mag}px)`;
        t.active = true;
      } else if (t.active) {
        t.el.style.transform = '';
        t.active = false;
      }
    }
  }

  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(tick); }
  }

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    schedule();
  });

  // Recompute cached centers when the layout shifts.
  window.addEventListener('scroll', () => { measure(); schedule(); }, { passive: true });
  window.addEventListener('resize', () => { measure(); schedule(); });

  // Collect targets once DOM is ready; re-collect once fonts resolve
  // (font load can shift text box sizes).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', collect, { once: true });
  } else {
    collect();
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measure).catch(() => {});
  }
  // Entries fade-in after a delay — re-measure once they settle.
  setTimeout(measure, 1200);
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

// (Floating dock visibility handled by the unified scroll dispatcher above.)

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

// ─── Ambient Drone + Sound Toggle ────────────────────────────
// Slow evolving drone: stacked detuned sine oscillators on a low root
// (A1), gentle LFO-modulated low-pass filter, long feedback delay for
// space. No beat, no melody — a room tone you can leave running.
(function () {
  let ctx = null, master = null, nodes = null, playing = false, breathId = null;

  // Root A1 ≈ 55 Hz. Perfect fifth (E) + octave + twelfth for a drone stack.
  const PARTIALS = [
    { freq: 55.00, detune:  -4, gain: 0.30 },  // A1
    { freq: 55.00, detune:  +5, gain: 0.30 },  // A1 (detuned pair)
    { freq: 82.41, detune:  -3, gain: 0.18 },  // E2 (fifth)
    { freq: 110.0, detune:  +2, gain: 0.14 },  // A2 (octave)
    { freq: 164.8, detune:  -6, gain: 0.08 },  // E3
    { freq: 220.0, detune:  +7, gain: 0.05 },  // A3
  ];

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume();
    return ctx;
  }

  function buildVoices() {
    const c = ctx;

    // Master gain — starts silent, fades in.
    master = c.createGain();
    master.gain.value = 0;

    // Slow breathing low-pass filter over the whole drone.
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.7;

    // Feedback delay acts as a cheap reverb/space.
    const delay = c.createDelay(2.5);
    delay.delayTime.value = 1.1;
    const feedback = c.createGain();
    feedback.gain.value = 0.55;
    const wet = c.createGain();
    wet.gain.value = 0.35;

    // Routing: voices -> filter -> (dry -> master) and (-> delay loop -> master)
    filter.connect(master);
    filter.connect(delay);
    delay.connect(feedback); feedback.connect(delay);
    delay.connect(wet); wet.connect(master);

    // Final soft-clip to tame peaks.
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1024) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6);
    }
    shaper.curve = curve;
    master.connect(shaper); shaper.connect(c.destination);

    // Build oscillators.
    const oscs = PARTIALS.map(p => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = p.freq;
      o.detune.value = p.detune;
      g.gain.value = p.gain;
      o.connect(g); g.connect(filter);
      o.start();
      return { o, g, partial: p };
    });

    return { master, filter, delay, oscs };
  }

  // Slow LFO-ish "breathing" on filter cutoff + tiny detune drift.
  function breathe() {
    if (!playing || !nodes) return;
    const c = ctx, now = c.currentTime;
    // Filter sweeps between ~380 Hz and ~900 Hz over 12–22 s.
    const target = 380 + Math.random() * 520;
    const dur    = 12 + Math.random() * 10;
    nodes.filter.frequency.cancelScheduledValues(now);
    nodes.filter.frequency.setValueAtTime(nodes.filter.frequency.value, now);
    nodes.filter.frequency.linearRampToValueAtTime(target, now + dur);

    // Drift each oscillator's detune a few cents for chorus-y movement.
    nodes.oscs.forEach(v => {
      const d = v.partial.detune + (Math.random() * 10 - 5);
      v.o.detune.cancelScheduledValues(now);
      v.o.detune.linearRampToValueAtTime(d, now + dur);
    });

    breathId = setTimeout(breathe, dur * 1000);
  }

  function start() {
    const c = getCtx();
    if (!nodes) nodes = buildVoices();
    playing = true;
    // Long fade in — 4 seconds.
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setValueAtTime(master.gain.value, c.currentTime);
    master.gain.linearRampToValueAtTime(0.22, c.currentTime + 4);
    breathe();
  }

  function stop() {
    playing = false;
    clearTimeout(breathId);
    if (master && ctx) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 2.5);
    }
  }

  let on = false;
  window.__cycleSound = function () {
    on = !on;
    const btn   = document.getElementById('dock-sound');
    const label = document.getElementById('sound-label');
    if (label) label.textContent = on ? 'Playing' : 'Sound';
    if (btn) btn.classList.toggle('sound-playing', on);
    if (on) start(); else stop();
  };
})();
