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
  function formatEventDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long", weekday: "long" });
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
  var activeTopic = "\u0412\u0441\u0456";
  var GEO_FILTERS = ["\u0412\u0441\u0456", "\u041E\u043B\u0438\u043A\u0430", "\u0412\u043E\u043B\u0438\u043D\u044C", "\u0423\u043A\u0440\u0430\u0457\u043D\u0430", "\u0421\u0432\u0456\u0442"];
  var TOPIC_FILTERS = ["\u0412\u0441\u0456", "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430", "\u0411\u0456\u0437\u043D\u0435\u0441", "\u0421\u043F\u043E\u0440\u0442", "\u0422\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0456\u0457", "\u0417\u0434\u043E\u0440\u043E\u0432'\u044F", "\u0415\u043A\u043E\u043B\u043E\u0433\u0456\u044F"];
  async function initNews() {
    try {
      const res = await fetch("./data/articles.json");
      allArticles = await res.json();
    } catch (e) {
      allArticles = [];
    }
    renderGeoFilters();
    renderTopicFilters();
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
  function renderTopicFilters() {
    const el = document.getElementById("topic-filters");
    if (!el)
      return;
    el.innerHTML = TOPIC_FILTERS.map((t) => `
    <button class="chip ${t === activeTopic ? "active" : ""}" onclick="setTopicFilter('${escapeHtml(t)}')">${escapeHtml(t)}</button>
  `).join("");
  }
  function getFiltered() {
    return allArticles.filter((a) => {
      const geoOk = activeGeo === "\u0412\u0441\u0456" || a.geo === activeGeo;
      const topicOk = activeTopic === "\u0412\u0441\u0456" || a.category === activeTopic;
      return geoOk && topicOk;
    });
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
    el.innerHTML = articles.map((a) => `
    <article class="news-card ${a.exclusive ? "exclusive" : ""}" onclick="openArticle(${a.id})">
      ${a.image ? `<img class="news-card-img" src="${escapeHtml(a.image)}" alt="">` : ""}
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="news-card-geo">${escapeHtml(a.geo)}</span>
          <span class="news-card-category">${escapeHtml(a.category)}</span>
          ${a.exclusive ? '<span class="exclusive-badge">\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
        </div>
        <h2 class="news-card-title">${escapeHtml(a.title)}</h2>
        <p class="news-card-excerpt">${escapeHtml(a.excerpt)}</p>
        <div class="news-card-footer">
          <span class="news-card-source">${escapeHtml(a.source)}</span>
          <span class="news-card-time">${formatTime(a.ts)}</span>
        </div>
      </div>
    </article>
  `).join("");
  }
  window.setGeoFilter = function(geo) {
    activeGeo = geo;
    renderGeoFilters();
    renderNews();
  };
  window.setTopicFilter = function(topic) {
    activeTopic = topic;
    renderTopicFilters();
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
  var allEvents = [];
  async function initEvents() {
    try {
      const res = await fetch("./data/events.json");
      allEvents = await res.json();
    } catch (e) {
      allEvents = [];
    }
    renderEvents();
  }
  function renderEvents() {
    const el = document.getElementById("events-list");
    if (!el)
      return;
    const now = /* @__PURE__ */ new Date();
    const upcoming = allEvents.filter((e) => new Date(e.date) >= new Date(now.toDateString())).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (upcoming.length === 0) {
      el.innerHTML = '<div class="empty-state">\u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0438\u0445 \u043F\u043E\u0434\u0456\u0439 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
      return;
    }
    el.innerHTML = upcoming.map((ev) => `
    <div class="event-card">
      ${ev.image ? `<img class="event-card-img" src="${escapeHtml(ev.image)}" alt="">` : ""}
      <div class="event-card-body">
        <div class="event-card-date">${formatEventDate(ev.date)} \xB7 ${escapeHtml(ev.time)}</div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        <p class="event-card-desc">${escapeHtml(ev.description)}</p>
        <div class="event-card-location">
          <span class="location-icon">\u{1F4CD}</span> ${escapeHtml(ev.location)}
        </div>
      </div>
    </div>
  `).join("");
  }

  // src/tabs/buses.js
  var scheduleData = null;
  var activeRouteId = null;
  async function initBuses() {
    try {
      const res = await fetch("./data/schedule.json");
      scheduleData = await res.json();
    } catch (e) {
      scheduleData = null;
    }
    renderBuses();
  }
  function getNextDeparture(departures) {
    const now = /* @__PURE__ */ new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (const dep of departures) {
      const [h, m] = dep.time.split(":").map(Number);
      const depMinutes = h * 60 + m;
      if (depMinutes > currentMinutes) {
        const diff = depMinutes - currentMinutes;
        if (diff < 60)
          return `\u0447\u0435\u0440\u0435\u0437 ${diff} \u0445\u0432`;
        return `\u0447\u0435\u0440\u0435\u0437 ${Math.floor(diff / 60)} \u0433\u043E\u0434 ${diff % 60} \u0445\u0432`;
      }
    }
    return "\u0437\u0430\u0432\u0442\u0440\u0430";
  }
  function renderBuses() {
    const el = document.getElementById("buses-content");
    if (!el)
      return;
    if (!scheduleData) {
      el.innerHTML = '<div class="empty-state">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439</div>';
      return;
    }
    const { routes, updatedAt, source } = scheduleData;
    if (!activeRouteId)
      activeRouteId = routes[0]?.id;
    const activeRoute = routes.find((r) => r.id === activeRouteId) || routes[0];
    el.innerHTML = `
    <div class="buses-updated">
      \u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${escapeHtml(updatedAt)} \xB7 ${escapeHtml(source)}
    </div>

    <div class="route-tabs">
      ${routes.map((r) => `
        <button class="route-tab ${r.id === activeRouteId ? "active" : ""}"
                onclick="setActiveRoute('${r.id}')">
          ${escapeHtml(r.name)}
        </button>
      `).join("")}
    </div>

    ${activeRoute ? `
      <div class="route-info">
        ${activeRoute.via ? `<div class="route-via">\u0447\u0435\u0440\u0435\u0437 ${escapeHtml(activeRoute.via)}</div>` : ""}
        <div class="next-departure">
          \u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0440\u0435\u0439\u0441: <strong>${getNextDeparture(activeRoute.departures)}</strong>
        </div>
      </div>

      <div class="departures-list">
        ${activeRoute.departures.map((dep) => {
      const [h, m] = dep.time.split(":").map(Number);
      const now = /* @__PURE__ */ new Date();
      const isPast = h * 60 + m < now.getHours() * 60 + now.getMinutes();
      return `
            <div class="departure-row ${isPast ? "past" : ""}">
              <span class="departure-time">${escapeHtml(dep.time)}</span>
              <span class="departure-days">${escapeHtml(dep.days)}</span>
              <span class="departure-status">${isPast ? "\u0432\u0456\u0434\u043F\u0440\u0430\u0432\u0438\u0432\u0441\u044F" : "\u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F"}</span>
            </div>
          `;
    }).join("")}
      </div>
    ` : ""}
  `;
  }
  window.setActiveRoute = function(routeId) {
    activeRouteId = routeId;
    renderBuses();
  };

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
