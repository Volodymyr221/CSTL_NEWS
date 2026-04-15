(() => {
  // src/core/boot.js
  function setupPWA() {
    const manifest = {
      name: "CSTL NEWS",
      short_name: "CSTL",
      start_url: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#C41E3A",
      icons: [{
        src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOTIgMTkyIj48cmVjdCB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgcng9IjIwIiBmaWxsPSIjQzQxRTNBIi8+PHRleHQgeD0iOTYiIHk9IjExMCIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+QzwvdGV4dD48L3N2Zz4=",
        sizes: "192x192",
        type: "image/svg+xml"
      }]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);
  }
  function setupSW() {
    if (!("serviceWorker" in navigator))
      return;
    const hadController = !!navigator.serviceWorker.controller;
    let _reloading = false;
    let _swReg = null;
    const doReload = () => {
      if (_reloading)
        return;
      _reloading = true;
      window.location.replace(window.location.href);
    };
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController)
        return;
      doReload();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && _swReg)
        _swReg.update();
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted && _swReg)
        _swReg.update();
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
      _swReg = reg;
      reg.update();
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw)
          return;
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated" && hadController)
            doReload();
        });
      });
    }).catch(() => {
    });
  }
  function bootApp() {
    try {
      setupPWA();
    } catch (e) {
    }
    try {
      setupSW();
    } catch (e) {
    }
  }

  // src/core/weather.js
  var OLYKA = { lat: 50.7333, lon: 25.8167 };
  function codeToIcon(code) {
    if (code === 0)
      return "\u2600\uFE0F";
    if (code <= 2)
      return "\u{1F324}\uFE0F";
    if (code === 3)
      return "\u2601\uFE0F";
    if (code <= 48)
      return "\u{1F32B}\uFE0F";
    if (code <= 55)
      return "\u{1F326}\uFE0F";
    if (code <= 65)
      return "\u{1F327}\uFE0F";
    if (code <= 77)
      return "\u2744\uFE0F";
    if (code <= 82)
      return "\u{1F327}\uFE0F";
    if (code >= 95)
      return "\u26C8\uFE0F";
    return "\u{1F321}\uFE0F";
  }
  async function getCoords() {
    if (!navigator.geolocation)
      return OLYKA;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(OLYKA),
        { timeout: 5e3, maximumAge: 6e5 }
      );
    });
  }
  async function initWeather() {
    const iconEl = document.getElementById("weather-icon");
    const tempEl = document.getElementById("weather-temp");
    if (!iconEl || !tempEl)
      return;
    try {
      const { lat, lon } = await getCoords();
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const temp = Math.round(data.current.temperature_2m);
      iconEl.textContent = codeToIcon(data.current.weather_code);
      tempEl.textContent = `${temp}\xB0`;
    } catch {
      const widget = document.getElementById("weather-widget");
      if (widget)
        widget.style.visibility = "hidden";
    }
  }

  // src/core/utils.js
  function formatTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 6e4)
      return "\u0449\u043E\u0439\u043D\u043E";
    if (diff < 36e5)
      return Math.floor(diff / 6e4) + " \u0445\u0432 \u0442\u043E\u043C\u0443";
    if (diff < 864e5)
      return Math.floor(diff / 36e5) + " \u0433\u043E\u0434 \u0442\u043E\u043C\u0443";
    return new Date(ts).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function showToast(msg, duration = 3e3) {
    let toast = document.getElementById("cstl-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cstl-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), duration);
  }

  // src/tabs/news.js
  var allArticles = [];
  var activeGeo = "\u0412\u0441\u0456";
  var GEO_FILTERS = ["\u0412\u0441\u0456", "\u041E\u043B\u0438\u043A\u0430", "\u0412\u043E\u043B\u0438\u043D\u044C", "\u0423\u043A\u0440\u0430\u0457\u043D\u0430", "\u0421\u0432\u0456\u0442"];
  async function initNews() {
    try {
      const res = await fetch("./data/articles.json");
      allArticles = await res.json();
    } catch (e) {
      allArticles = [];
    }
    renderGeoFilters();
    renderNews();
  }
  function renderGeoFilters() {
    const el = document.getElementById("geo-filters");
    if (!el)
      return;
    el.innerHTML = GEO_FILTERS.map((g) => `
    <button class="chip ${g === activeGeo ? "active" : ""}" onclick="setGeoFilter('${g}')">${g}</button>
  `).join("");
  }
  function getFiltered() {
    return allArticles.filter((a) => activeGeo === "\u0412\u0441\u0456" || a.geo === activeGeo);
  }
  function renderNews() {
    const el = document.getElementById("news-list");
    if (!el)
      return;
    const articles = getFiltered();
    if (articles.length === 0) {
      el.innerHTML = '<div class="empty-state">\u041D\u043E\u0432\u0438\u043D \u0437\u0430 \u0446\u0438\u043C \u0444\u0456\u043B\u044C\u0442\u0440\u043E\u043C \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
      return;
    }
    el.innerHTML = articles.map((a, i) => i === 0 ? renderFeatured(a) : renderRow(a)).join("");
  }
  function renderFeatured(a) {
    const hasImage = !!a.image;
    return `
    <article class="news-card-featured ${hasImage ? "" : "no-image"}${a.exclusive ? " exclusive" : ""}" onclick="openArticle(${a.id})">
      ${hasImage ? `<img class="news-card-featured-img" src="${escapeHtml(a.image)}" alt="">` : ""}
      <div class="news-card-featured-overlay">
        <div class="news-card-meta">
          <span class="news-card-geo">${escapeHtml(a.geo)}</span>
          <span class="news-card-category">${escapeHtml(a.category)}</span>
          ${a.exclusive ? '<span class="exclusive-badge">\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
        </div>
        <h2 class="news-card-featured-title">${escapeHtml(a.title)}</h2>
        ${!hasImage && a.excerpt ? `<p class="news-card-featured-excerpt">${escapeHtml(a.excerpt)}</p>` : ""}
        <div class="news-card-featured-footer">${escapeHtml(a.source)} \xB7 ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
  }
  function renderRow(a) {
    return `
    <article class="news-card-row ${a.exclusive ? "exclusive" : ""}" onclick="openArticle(${a.id})">
      ${a.image ? `<img class="news-card-row-img" src="${escapeHtml(a.image)}" alt="">` : ""}
      <div class="news-card-row-body">
        <div class="news-card-meta">
          <span class="news-card-geo">${escapeHtml(a.geo)}</span>
          <span class="news-card-category">${escapeHtml(a.category)}</span>
          ${a.exclusive ? '<span class="exclusive-badge">\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
        </div>
        <h2 class="news-card-row-title">${escapeHtml(a.title)}</h2>
        ${a.excerpt ? `<p class="news-card-row-excerpt">${escapeHtml(a.excerpt)}</p>` : ""}
        <div class="news-card-row-footer">${escapeHtml(a.source)} \xB7 ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
  }
  window.setGeoFilter = function(geo) {
    activeGeo = geo;
    renderGeoFilters();
    renderNews();
  };
  window.openArticle = function(id) {
    const article = allArticles.find((a) => a.id === id);
    if (!article)
      return;
    const modal = document.getElementById("article-modal");
    const modalContent = document.getElementById("article-modal-content");
    if (!modal || !modalContent)
      return;
    modalContent.innerHTML = `
    <div class="article-modal-header">
      <div class="news-card-meta">
        <span class="news-card-geo">${escapeHtml(article.geo)}</span>
        <span class="news-card-category">${escapeHtml(article.category)}</span>
        ${article.exclusive ? '<span class="exclusive-badge">\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
      </div>
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      <div class="article-byline">
        <span>${escapeHtml(article.source)}</span>
        <span>${formatTime(article.ts)}</span>
      </div>
    </div>
    ${article.image ? `<img class="article-img" src="${escapeHtml(article.image)}" alt="">` : ""}
    <div class="article-body">${escapeHtml(article.content)}</div>
    ${article.sourceUrl ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">\u0427\u0438\u0442\u0430\u0442\u0438 \u043E\u0440\u0438\u0433\u0456\u043D\u0430\u043B \u2192</a>` : ""}
  `;
    modal.classList.add("open");
  };

  // src/tabs/events.js
  var CATEGORY_FILTERS = ["\u0412\u0441\u0456", "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430", "\u0421\u043F\u043E\u0440\u0442", "\u0411\u043B\u0430\u0433\u043E\u0434\u0456\u0439\u043D\u0456\u0441\u0442\u044C"];
  var CATEGORY_COLORS = {
    "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430": "#C41E3A",
    "Kino_Castle": "#C41E3A",
    "\u0421\u043F\u043E\u0440\u0442": "#1565C0",
    "\u0411\u043B\u0430\u0433\u043E\u0434\u0456\u0439\u043D\u0456\u0441\u0442\u044C": "#B45309"
  };
  var MONTHS_FULL = ["\u0441\u0456\u0447\u043D\u044F", "\u043B\u044E\u0442\u043E\u0433\u043E", "\u0431\u0435\u0440\u0435\u0437\u043D\u044F", "\u043A\u0432\u0456\u0442\u043D\u044F", "\u0442\u0440\u0430\u0432\u043D\u044F", "\u0447\u0435\u0440\u0432\u043D\u044F", "\u043B\u0438\u043F\u043D\u044F", "\u0441\u0435\u0440\u043F\u043D\u044F", "\u0432\u0435\u0440\u0435\u0441\u043D\u044F", "\u0436\u043E\u0432\u0442\u043D\u044F", "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430", "\u0433\u0440\u0443\u0434\u043D\u044F"];
  var allEvents = [];
  var activeFilter = "\u0412\u0441\u0456";
  var cardObserver = null;
  function formatFullDate(dateStr) {
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  }
  function catColor(category) {
    return CATEGORY_COLORS[category] || "#C41E3A";
  }
  function buildIcsContent(ev) {
    const pad = (n) => String(n).padStart(2, "0");
    const start = /* @__PURE__ */ new Date(ev.date + "T" + (ev.time || "09:00") + ":00");
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1e3);
    const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const esc = (s) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CSTL NEWS//UA",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:cstlnews-${ev.id}-${ev.date}@cstlnews`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${esc(ev.title)}`,
      `DESCRIPTION:${esc(ev.description)}`,
      `LOCATION:${esc(ev.location)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:\u041D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F: ${esc(ev.title)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }
  function downloadIcs(ev) {
    const ics = buildIcsContent(ev);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ev.title.replace(/[^\wА-ЯҐЄІЇа-яґєії\d ]/g, "_") + ".ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function renderSkeleton(el) {
    el.innerHTML = Array(3).fill(`
    <div class="ev-skeleton">
      <div class="ev-skel-img"></div>
      <div class="ev-skel-body">
        <div class="ev-skel-line w60"></div>
        <div class="ev-skel-line w100"></div>
        <div class="ev-skel-line w80"></div>
        <div class="ev-skel-line w40"></div>
      </div>
    </div>
  `).join("");
  }
  function cardHtml(ev) {
    const bg = catColor(ev.category);
    const coverBlock = ev.image ? `
    <div class="ev-card-cover">
      <img class="ev-card-img" src="${escapeHtml(ev.image)}" alt="" loading="lazy">
    </div>` : "";
    return `
    <div class="ev-card" data-id="${ev.id}" style="--cat-color:${bg}">
      ${coverBlock}
      <div class="ev-card-body">
        <div class="ev-card-badge ev-card-badge--inline" style="background:${bg}">
          ${escapeHtml(ev.category)}
        </div>
        <h3 class="ev-card-title">${escapeHtml(ev.title)}</h3>
        <p class="ev-card-desc">${escapeHtml(ev.description)}</p>
        <div class="ev-card-meta">
          <span class="ev-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            ${escapeHtml(ev.location)}
          </span>
          <span class="ev-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${escapeHtml(formatFullDate(ev.date))}, ${escapeHtml(ev.time)}
          </span>
        </div>
        <div class="ev-card-expand-hint">
          <span class="ev-expand-label">\u0414\u0435\u0442\u0430\u043B\u044C\u043D\u0456\u0448\u0435</span>
          <span class="ev-expand-chevron">\u203A</span>
        </div>
      </div>
      <div class="ev-card-detail">
        <div class="ev-detail-body">
          <p class="ev-detail-desc">${escapeHtml(ev.description)}</p>
          <button class="ev-ics-btn" type="button" data-id="${ev.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="12" y1="14" x2="12" y2="18"/>
              <line x1="10" y1="16" x2="14" y2="16"/>
            </svg>
            \u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F
          </button>
          <button class="ev-detail-close" type="button">\u0417\u0433\u043E\u0440\u043D\u0443\u0442\u0438 \u2191</button>
        </div>
      </div>
    </div>`;
  }
  function renderFilters() {
    const bar = document.getElementById("events-filters");
    if (!bar)
      return;
    bar.innerHTML = CATEGORY_FILTERS.map(
      (f) => `<button class="chip${f === activeFilter ? " active" : ""}" data-f="${escapeHtml(f)}">${escapeHtml(f)}</button>`
    ).join("");
    bar.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.f;
        renderFilters();
        renderList();
      });
    });
  }
  function renderList() {
    const el = document.getElementById("events-list");
    if (!el)
      return;
    const now = /* @__PURE__ */ new Date();
    now.setHours(0, 0, 0, 0);
    const list = allEvents.filter((e) => {
      const d = /* @__PURE__ */ new Date(e.date + "T00:00:00");
      if (d < now)
        return false;
      return activeFilter === "\u0412\u0441\u0456" || e.category === activeFilter;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!list.length) {
      el.innerHTML = '<div class="empty-state">\u041F\u043E\u0434\u0456\u0439 \u0443 \u0446\u0456\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
      return;
    }
    el.innerHTML = list.map(cardHtml).join("");
    if (cardObserver) {
      cardObserver.disconnect();
      cardObserver = null;
    }
    cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting && entry.target.classList.contains("expanded")) {
          const card = entry.target;
          const rect = card.getBoundingClientRect();
          const detail = card.querySelector(".ev-card-detail");
          if (rect.bottom <= 0) {
            const heightBefore = card.offsetHeight;
            if (detail)
              detail.style.transition = "none";
            card.classList.remove("expanded");
            const heightAfter = card.offsetHeight;
            window.scrollBy(0, -(heightBefore - heightAfter));
            requestAnimationFrame(() => requestAnimationFrame(() => {
              if (detail)
                detail.style.transition = "";
            }));
          } else {
            card.classList.remove("expanded");
          }
        }
      });
    }, { threshold: 0 });
    el.querySelectorAll(".ev-card").forEach((card) => {
      cardObserver.observe(card);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".ev-detail-close")) {
          card.classList.remove("expanded");
          card.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        if (e.target.closest(".ev-ics-btn"))
          return;
        card.classList.toggle("expanded");
      });
    });
    el.querySelectorAll(".ev-ics-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ev = allEvents.find((ev2) => ev2.id === Number(btn.dataset.id));
        if (ev)
          downloadIcs(ev);
      });
    });
  }
  async function initEvents() {
    const el = document.getElementById("events-list");
    if (el)
      renderSkeleton(el);
    try {
      const res = await fetch("./data/events.json");
      allEvents = await res.json();
    } catch {
      allEvents = [];
    }
    renderFilters();
    renderList();
  }

  // src/tabs/buses.js
  var PREFS_KEY = "bus_prefs_v2";
  var busData = null;
  var fromStop = "";
  var toStop = "";
  var showAll = false;
  var timerInterval = null;
  var expandedIds = /* @__PURE__ */ new Set();
  var activeField = null;
  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ from: fromStop, to: toStop }));
  }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY));
      if (p?.from)
        fromStop = p.from;
      if (p?.to)
        toStop = p.to;
    } catch {
    }
  }
  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function minsToHHMM(total) {
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function minutesUntil(hhmm) {
    const now = /* @__PURE__ */ new Date();
    const diff = toMinutes(hhmm) - (now.getHours() * 60 + now.getMinutes());
    return diff > 0 ? diff : null;
  }
  function formatCountdown(mins) {
    if (mins < 60)
      return `\u0447\u0435\u0440\u0435\u0437 ${mins} \u0445\u0432`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `\u0447\u0435\u0440\u0435\u0437 ${h} \u0433\u043E\u0434 ${m} \u0445\u0432` : `\u0447\u0435\u0440\u0435\u0437 ${h} \u0433\u043E\u0434`;
  }
  function isDayActive(days) {
    const d = (/* @__PURE__ */ new Date()).getDay();
    if (days === "\u0449\u043E\u0434\u043D\u044F")
      return true;
    if (days === "\u043F\u043D-\u0441\u0431")
      return d >= 1 && d <= 6;
    if (days === "\u043F\u043D-\u043F\u0442")
      return d >= 1 && d <= 5;
    return true;
  }
  function getStopMins(route, stopName) {
    const stop = route.stops.find((s) => s.name === stopName);
    if (!stop)
      return null;
    const totalKm = route.stops[route.stops.length - 1].km;
    if (totalKm === 0)
      return toMinutes(route.departure_time);
    return toMinutes(route.departure_time) + Math.round(stop.km / totalKm * route.duration_min);
  }
  function getStopHHMM(route, stopName) {
    const m = getStopMins(route, stopName);
    return m !== null ? minsToHHMM(m) : null;
  }
  function getSegmentPrice(route, fromName, toName) {
    const f = route.stops.find((s) => s.name === fromName);
    const t = route.stops.find((s) => s.name === toName);
    if (!f || !t)
      return null;
    return Math.abs(t.price_from_start - f.price_from_start).toFixed(2);
  }
  function getEffectiveFrom(route) {
    if (fromStop && route.stops.some((s) => s.name === fromStop))
      return fromStop;
    return route.stops[0].name;
  }
  function getEffectiveTo(route) {
    if (toStop && route.stops.some((s) => s.name === toStop))
      return toStop;
    return route.stops[route.stops.length - 1].name;
  }
  function matchesSearch(route) {
    if (!isDayActive(route.days))
      return false;
    const stops = route.stops;
    const fromIdx = fromStop ? stops.findIndex((s) => s.name === fromStop) : 0;
    const toIdx = toStop ? stops.findIndex((s) => s.name === toStop) : stops.length - 1;
    if (fromStop && fromIdx === -1)
      return false;
    if (toStop && toIdx === -1)
      return false;
    if (fromStop && toStop && fromIdx >= toIdx)
      return false;
    return true;
  }
  function isPastRoute(route) {
    const m = getStopMins(route, getEffectiveFrom(route));
    if (m === null)
      return true;
    const now = /* @__PURE__ */ new Date();
    return m < now.getHours() * 60 + now.getMinutes();
  }
  function getFilteredRoutes() {
    if (!busData)
      return [];
    return busData.routes.filter(matchesSearch).sort((a, b) => {
      const aM = getStopMins(a, getEffectiveFrom(a)) || 0;
      const bM = getStopMins(b, getEffectiveFrom(b)) || 0;
      return aM - bM;
    });
  }
  function findNextRoute() {
    return getFilteredRoutes().find((r) => !isPastRoute(r)) || null;
  }
  function getAllStops() {
    if (!busData)
      return [];
    const seen = /* @__PURE__ */ new Set();
    busData.routes.forEach((r) => r.stops.forEach((s) => seen.add(s.name)));
    return [...seen].sort((a, b) => a.localeCompare(b, "uk"));
  }
  function openDropdown(field) {
    activeField = field;
    const panel = document.getElementById("bus-search-panel");
    const dd = document.getElementById("bs-dropdown");
    if (!dd || !panel)
      return;
    const rect = panel.getBoundingClientRect();
    dd.style.top = rect.bottom + "px";
    renderDropdownItems("");
    dd.hidden = false;
    const filterEl = document.getElementById("bs-dd-filter");
    if (filterEl)
      setTimeout(() => filterEl.focus(), 80);
  }
  function renderDropdownItems(query) {
    const dd = document.getElementById("bs-dropdown");
    if (!dd)
      return;
    const all = getAllStops();
    const q = query.trim().toLowerCase();
    const filtered = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
    const current = activeField === "from" ? fromStop : toStop;
    const title = activeField === "from" ? "\u0417\u0432\u0456\u0434\u043A\u0438 \u0457\u0434\u0435\u0442\u0435?" : "\u041A\u0443\u0434\u0438 \u0457\u0434\u0435\u0442\u0435?";
    const clearHtml = current ? `<button class="bs-dd-clear" id="bs-dd-clear">\u2715 \u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0432\u0438\u0431\u0456\u0440 (${escapeHtml(current)})</button>` : "";
    const itemsHtml = filtered.length ? filtered.map(
      (s) => `<button class="bs-dd-item${s === current ? " sel" : ""}" data-stop="${escapeHtml(s)}">
           ${escapeHtml(s)}
         </button>`
    ).join("") : `<div class="bs-dd-empty">\u0417\u0443\u043F\u0438\u043D\u043A\u0443 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E</div>`;
    dd.innerHTML = `
    <div class="bs-dd-head">
      <span class="bs-dd-title">${escapeHtml(title)}</span>
      <button class="bs-dd-x" id="bs-dd-x">\u2715</button>
    </div>
    <div class="bs-dd-search">
      <input class="bs-dd-filter" id="bs-dd-filter"
             placeholder="\u041F\u043E\u0448\u0443\u043A \u0437\u0443\u043F\u0438\u043D\u043A\u0438\u2026" value="${escapeHtml(query)}"
             autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="bs-dd-list">
      ${clearHtml}
      ${itemsHtml}
    </div>
  `;
    document.getElementById("bs-dd-filter")?.addEventListener("input", (e) => {
      renderDropdownItems(e.target.value);
    });
    document.getElementById("bs-dd-x")?.addEventListener("click", closeDropdown);
    document.getElementById("bs-dd-clear")?.addEventListener("click", () => {
      selectStop("", activeField);
    });
    dd.querySelectorAll(".bs-dd-item").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => selectStop(btn.dataset.stop, activeField));
    });
  }
  function closeDropdown() {
    activeField = null;
    const dd = document.getElementById("bs-dropdown");
    if (dd)
      dd.hidden = true;
  }
  function selectStop(stop, field) {
    if (field === "from") {
      fromStop = stop;
      const inp = document.getElementById("bs-from-input");
      if (inp)
        inp.value = stop;
    } else {
      toStop = stop;
      const inp = document.getElementById("bs-to-input");
      if (inp)
        inp.value = stop;
    }
    closeDropdown();
    showAll = false;
    savePrefs();
    renderSmartRow();
    renderRouteList();
  }
  function renderSmartRow() {
    const el = document.getElementById("bus-smart-row");
    if (!el)
      return;
    const next = findNextRoute();
    if (!next) {
      el.innerHTML = `<span class="bsr-empty">\u0420\u0435\u0439\u0441\u0456\u0432 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0431\u0456\u043B\u044C\u0448\u0435 \u043D\u0435\u043C\u0430\u0454</span>`;
      el.className = "bus-smart-row";
      return;
    }
    const effFrom = getEffectiveFrom(next);
    const fromTime = getStopHHMM(next, effFrom);
    const mins = minutesUntil(fromTime);
    const urgent = mins !== null && mins <= 10;
    el.className = `bus-smart-row${urgent ? " urgent" : ""}`;
    el.innerHTML = `
    <span class="bsr-icon">\u25B6</span>
    <span class="bsr-text">
      \u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 <strong>${escapeHtml(mins !== null ? formatCountdown(mins) : "\u0437\u0430\u0440\u0430\u0437")}</strong>
      \u2014 ${escapeHtml(fromTime)}, ${escapeHtml(next.name)}
    </span>
    ${urgent ? `<span class="bsr-hurry">\u041F\u043E\u0441\u043F\u0456\u0448\u0430\u0439!</span>` : ""}
  `;
  }
  function renderRouteList() {
    const el = document.getElementById("bus-list");
    if (!el)
      return;
    const all = getFilteredRoutes();
    const future = all.filter((r) => !isPastRoute(r));
    const past = all.filter((r) => isPastRoute(r));
    const toRender = showAll ? all : future;
    if (!all.length) {
      el.innerHTML = `<div class="empty-state">\u0417\u0430 \u0446\u0438\u043C \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u043E\u043C \u0440\u0435\u0439\u0441\u0456\u0432 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E</div>`;
      return;
    }
    if (!toRender.length) {
      el.innerHTML = `
      <div class="empty-state">\u0420\u0435\u0439\u0441\u0456\u0432 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0431\u0456\u043B\u044C\u0448\u0435 \u043D\u0435\u043C\u0430\u0454</div>
      <button class="bus-show-all" id="bus-show-all-btn">
        \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 ${all.length} \u0440\u0435\u0439\u0441\u0438 \u2193
      </button>`;
      document.getElementById("bus-show-all-btn").addEventListener("click", () => {
        showAll = true;
        renderRouteList();
      });
      return;
    }
    const next = findNextRoute();
    const carrierInfo = (id) => busData.carriers?.[id] || { name: id, phone: "0332 224 500" };
    const cards = toRender.map((route) => {
      const isPast = isPastRoute(route);
      const isNext = next && route.id === next.id;
      const effFrom = getEffectiveFrom(route);
      const effTo = getEffectiveTo(route);
      const fromTime = getStopHHMM(route, effFrom);
      const toTime = getStopHHMM(route, effTo);
      const price = getSegmentPrice(route, effFrom, effTo);
      const fromMins = getStopMins(route, effFrom) || 0;
      const toMins = getStopMins(route, effTo) || 0;
      const segDur = toMins - fromMins;
      const durStr = segDur >= 60 ? `${Math.floor(segDur / 60)} \u0433\u043E\u0434${segDur % 60 ? " " + segDur % 60 + " \u0445\u0432" : ""}` : `${segDur} \u0445\u0432`;
      const c = carrierInfo(route.carrier);
      const expanded = expandedIds.has(route.id);
      const basePrice = route.stops.find((s) => s.name === effFrom)?.price_from_start ?? 0;
      const stopsHtml = route.stops.map((s) => {
        const isFrom = s.name === effFrom;
        const isTo = s.name === effTo;
        const hl = isFrom || isTo;
        const t = getStopHHMM(route, s.name);
        const seg = Math.max(0, s.price_from_start - basePrice).toFixed(2);
        return `
        <div class="bs-stop-row${hl ? " hl" : ""}">
          <span class="bs-stop-time">${escapeHtml(t || "\u2014")}</span>
          <span class="bs-stop-name">${isFrom ? "\u25B6\u202F" : isTo ? "\u25C0\u202F" : ""}${escapeHtml(s.name)}</span>
          <span class="bs-stop-price">${escapeHtml(seg)} \u0433\u0440\u043D</span>
        </div>`;
      }).join("");
      const statusBadge = route.status === "cancelled" ? `<span class="bs-status cancelled">\u0421\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E</span>` : route.status === "delayed" ? `<span class="bs-status delayed">\u0417\u0430\u0442\u0440\u0438\u043C\u043A\u0430</span>` : "";
      const autoNote = route.auto_generated ? `<div class="bs-autogen">\u0440\u043E\u0437\u0440\u0430\u0445\u043E\u0432\u0430\u043D\u0438\u0439 \u0437\u0432\u043E\u0440\u043E\u0442\u043D\u0438\u0439 \u0440\u0435\u0439\u0441</div>` : "";
      return `
      <div class="bus-card${isPast ? " past" : ""}${isNext ? " next" : ""}">
        <div class="bus-card-main">
          <div class="bs-time-block">
            <span class="bus-card-time">${escapeHtml(fromTime || "\u2014")}</span>
            <span class="bs-arr">\u2192\u202F${escapeHtml(toTime || "\u2014")}</span>
          </div>
          <div class="bus-card-info">
            <div class="bus-card-route">${escapeHtml(route.name)}${statusBadge}</div>
            <div class="bus-card-meta">
              <span>${escapeHtml(durStr)}</span>
              <span class="bus-meta-sep">\xB7</span>
              <span>${escapeHtml(price || "\u2014")} \u0433\u0440\u043D</span>
              <span class="bus-meta-sep">\xB7</span>
              <span>${escapeHtml(c.name)}</span>
            </div>
            ${autoNote}
          </div>
          ${!isPast && route.status !== "cancelled" ? `
          <a class="bus-call-btn" href="tel:${escapeHtml(c.phone.replace(/\s/g, ""))}"
             title="\u0414\u0438\u0441\u043F\u0435\u0442\u0447\u0435\u0440 ${escapeHtml(c.phone)}" aria-label="\u0417\u0430\u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443\u0432\u0430\u0442\u0438">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </a>` : ""}
        </div>
        <button class="bs-toggle" data-id="${escapeHtml(route.id)}">
          ${expanded ? "\u0421\u0445\u043E\u0432\u0430\u0442\u0438 \u0437\u0443\u043F\u0438\u043D\u043A\u0438 \u25B4" : "\u0412\u0441\u0456 \u0437\u0443\u043F\u0438\u043D\u043A\u0438 \u25BE"}
        </button>
        <div class="bs-stops-body"${expanded ? "" : " hidden"}>
          ${stopsHtml}
        </div>
      </div>`;
    }).join("");
    let toggleHtml = "";
    if (!showAll && past.length > 0) {
      toggleHtml = `
      <button class="bus-show-all" id="bus-show-all-btn">
        \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 ${all.length} \u0440\u0435\u0439\u0441\u0438 \u0437\u0430 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u2193
      </button>`;
    } else if (showAll && past.length > 0) {
      toggleHtml = `
      <button class="bus-show-all bus-show-all--less" id="bus-show-all-btn">
        \u0421\u0445\u043E\u0432\u0430\u0442\u0438 \u043C\u0438\u043D\u0443\u043B\u0456 \u2191
      </button>`;
    }
    el.innerHTML = cards + toggleHtml;
    el.querySelectorAll(".bs-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (expandedIds.has(id))
          expandedIds.delete(id);
        else
          expandedIds.add(id);
        renderRouteList();
      });
    });
    const showAllBtn = document.getElementById("bus-show-all-btn");
    if (showAllBtn) {
      showAllBtn.addEventListener("click", () => {
        showAll = !showAll;
        renderRouteList();
      });
    }
  }
  function renderSearchPanel() {
    const el = document.getElementById("bus-search-panel");
    if (!el)
      return;
    const hasFilter = fromStop || toStop;
    el.innerHTML = `
    <div class="bs-search-row">
      <div class="bs-search-field">
        <label class="bs-search-label" for="bs-from-input">\u0412\u0456\u0434</label>
        <input class="bs-search-input bs-search-input--tap" id="bs-from-input"
               type="text" placeholder="\u0417\u0432\u0456\u0434\u043A\u0438\u2026"
               value="${escapeHtml(fromStop)}" readonly>
      </div>
      <button class="bs-swap-btn" id="bs-swap-btn" title="\u041F\u043E\u043C\u0456\u043D\u044F\u0442\u0438 \u043D\u0430\u043F\u0440\u044F\u043C\u043E\u043A">\u21CC</button>
      <div class="bs-search-field">
        <label class="bs-search-label" for="bs-to-input">\u0414\u043E</label>
        <input class="bs-search-input bs-search-input--tap" id="bs-to-input"
               type="text" placeholder="\u041A\u0443\u0434\u0438\u2026"
               value="${escapeHtml(toStop)}" readonly>
      </div>
    </div>
    ${hasFilter ? `
    <div class="bs-reset-row">
      <button class="bs-reset-btn" id="bs-reset-btn">\u2715 \u0412\u0441\u0456 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0438</button>
    </div>` : ""}
  `;
    document.getElementById("bs-from-input").addEventListener("click", () => openDropdown("from"));
    document.getElementById("bs-to-input").addEventListener("click", () => openDropdown("to"));
    document.getElementById("bs-reset-btn")?.addEventListener("click", () => {
      fromStop = "";
      toStop = "";
      showAll = false;
      savePrefs();
      renderSearchPanel();
      renderSmartRow();
      renderRouteList();
    });
    document.getElementById("bs-swap-btn").addEventListener("click", () => {
      [fromStop, toStop] = [toStop, fromStop];
      document.getElementById("bs-from-input").value = fromStop;
      document.getElementById("bs-to-input").value = toStop;
      closeDropdown();
      showAll = false;
      savePrefs();
      renderSmartRow();
      renderRouteList();
    });
  }
  async function initBuses() {
    const el = document.getElementById("buses-content");
    if (!el)
      return;
    loadPrefs();
    if (!document.getElementById("bs-dropdown")) {
      const dd = document.createElement("div");
      dd.id = "bs-dropdown";
      dd.className = "bs-dropdown";
      dd.hidden = true;
      document.body.appendChild(dd);
    }
    document.addEventListener("click", (e) => {
      const dd = document.getElementById("bs-dropdown");
      if (!dd || dd.hidden)
        return;
      if (!dd.contains(e.target) && e.target.id !== "bs-from-input" && e.target.id !== "bs-to-input") {
        closeDropdown();
      }
    }, true);
    try {
      const res = await fetch("./data/schedule.json");
      if (!res.ok)
        throw new Error(res.status);
      busData = await res.json();
    } catch {
      busData = null;
    }
    if (!busData) {
      el.innerHTML = '<div class="empty-state">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439</div>';
      return;
    }
    el.innerHTML = `
    <div id="bus-search-panel" class="bus-search"></div>
    <div id="bus-smart-row" class="bus-smart-row"></div>
    <div id="bus-list" class="bus-list"></div>
    <div class="buses-updated">
      ${escapeHtml(busData.source)} \xB7 ${escapeHtml(busData.verifiedAt)}
    </div>
  `;
    renderSearchPanel();
    renderSmartRow();
    renderRouteList();
    if (timerInterval)
      clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      renderSmartRow();
      renderRouteList();
    }, 6e4);
  }

  // src/tabs/submit.js
  function initSubmit() {
    const form = document.getElementById("submit-form");
    if (!form)
      return;
    form.addEventListener("submit", handleSubmit);
  }
  function handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("submit-name").value.trim();
    const contact = document.getElementById("submit-contact").value.trim();
    const text = document.getElementById("submit-text").value.trim();
    if (!text) {
      showToast("\u041E\u043F\u0438\u0448\u0456\u0442\u044C \u043D\u043E\u0432\u0438\u043D\u0443 \u0430\u0431\u043E \u0432\u0441\u0442\u0430\u0432\u0442\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F");
      return;
    }
    const subject = encodeURIComponent("\u041F\u0440\u043E\u043F\u043E\u0437\u0438\u0446\u0456\u044F \u043D\u043E\u0432\u0438\u043D\u0438 \u2014 CSTL NEWS");
    const body = encodeURIComponent(
      `\u0412\u0456\u0434: ${name || "\u0410\u043D\u043E\u043D\u0456\u043C\u043D\u043E"}
\u041A\u043E\u043D\u0442\u0430\u043A\u0442: ${contact || "\u043D\u0435 \u0432\u043A\u0430\u0437\u0430\u043D\u043E"}

${text}`
    );
    const submissions = JSON.parse(localStorage.getItem("cstl_submissions") || "[]");
    submissions.push({ name, contact, text, ts: Date.now() });
    localStorage.setItem("cstl_submissions", JSON.stringify(submissions));
    window.location.href = `mailto:cstlnews@gmail.com?subject=${subject}&body=${body}`;
    showToast("\u0414\u044F\u043A\u0443\u0454\u043C\u043E! \u0412\u0430\u0448\u0430 \u043D\u043E\u0432\u0438\u043D\u0430 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u0430 \u0440\u0435\u0434\u0430\u043A\u0446\u0456\u0457.");
    document.getElementById("submit-form").reset();
  }

  // src/app.js
  var currentTab = "news";
  window.switchTab = function(tab) {
    if (tab === currentTab)
      return;
    const oldPage = document.getElementById(`page-${currentTab}`);
    const newPage = document.getElementById(`page-${tab}`);
    if (!oldPage || !newPage)
      return;
    newPage.style.opacity = "0";
    newPage.style.display = "block";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        oldPage.style.opacity = "0";
        oldPage.style.transition = "opacity 0.18s ease";
        newPage.style.transition = "opacity 0.22s ease";
        newPage.style.opacity = "1";
        setTimeout(() => {
          oldPage.style.display = "none";
          oldPage.style.opacity = "";
          oldPage.style.transition = "";
          newPage.style.transition = "";
        }, 220);
      });
    });
    document.querySelectorAll(".tab-item").forEach((t) => t.classList.remove("active"));
    const activeTab = document.querySelector(`.tab-item[data-tab="${tab}"]`);
    if (activeTab)
      activeTab.classList.add("active");
    currentTab = tab;
  };
  window.closeArticleModal = function() {
    const modal = document.getElementById("article-modal");
    if (modal)
      modal.classList.remove("open");
  };
  function init() {
    bootApp();
    initWeather();
    initNews();
    initEvents();
    initBuses();
    initSubmit();
    setTimeout(() => {
      const splash = document.getElementById("splash");
      if (splash) {
        splash.style.opacity = "0";
        splash.style.transition = "opacity 0.4s";
        setTimeout(() => splash.remove(), 600);
      }
    }, 3500);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
//# sourceMappingURL=bundle.js.map
