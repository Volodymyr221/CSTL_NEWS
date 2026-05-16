(() => {
  // src/core/boot.js
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
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function todayKey() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  var OLYKA_COORDS = { lat: 50.7333, lon: 25.8167 };
  var _coordsPromise = null;
  function getCoords() {
    if (_coordsPromise)
      return _coordsPromise;
    _coordsPromise = new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ ...OLYKA_COORDS, city: "\u041E\u043B\u0438\u043A\u0430" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: null }),
        () => resolve({ ...OLYKA_COORDS, city: "\u041E\u043B\u0438\u043A\u0430" }),
        { timeout: 5e3, maximumAge: 6e5 }
      );
    });
    return _coordsPromise;
  }
  async function getCityName(lat, lon) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { "Accept-Language": "uk" } }
      );
      const data = await res.json();
      return data.address?.city || data.address?.town || data.address?.village || "\u041E\u043B\u0438\u043A\u0430";
    } catch {
      return "\u041E\u043B\u0438\u043A\u0430";
    }
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

  // src/core/weather.js
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
  async function initWeather() {
    const iconEl = document.getElementById("weather-icon");
    const tempEl = document.getElementById("weather-temp");
    if (!iconEl || !tempEl)
      return;
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 5e3);
    try {
      const { lat, lon, city: knownCity } = await getCoords();
      const [weatherRes, cityName] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
          { signal: ac.signal }
        ),
        knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon)
      ]);
      clearTimeout(timeoutId);
      const data = await weatherRes.json();
      const temp = Math.round(data.current.temperature_2m);
      iconEl.textContent = codeToIcon(data.current.weather_code);
      document.getElementById("weather-city").textContent = cityName;
      tempEl.textContent = `${temp}\xB0`;
    } catch {
      clearTimeout(timeoutId);
      const widget = document.getElementById("weather-widget");
      if (widget)
        widget.style.visibility = "hidden";
    }
  }

  // src/tabs/community-blocks.js
  var BUS_PREFS_KEY = "bus_prefs_v2";
  function weatherCodeInfo(code) {
    if (code === 0)
      return { icon: "\u2600\uFE0F", text: "\u042F\u0441\u043D\u043E" };
    if (code <= 2)
      return { icon: "\u{1F324}\uFE0F", text: "\u041C\u0456\u043D\u043B\u0438\u0432\u0430 \u0445\u043C\u0430\u0440\u043D\u0456\u0441\u0442\u044C" };
    if (code === 3)
      return { icon: "\u2601\uFE0F", text: "\u0425\u043C\u0430\u0440\u043D\u043E" };
    if (code <= 48)
      return { icon: "\u{1F32B}\uFE0F", text: "\u0422\u0443\u043C\u0430\u043D" };
    if (code <= 55)
      return { icon: "\u{1F326}\uFE0F", text: "\u041C\u0440\u044F\u043A\u0430" };
    if (code <= 65)
      return { icon: "\u{1F327}\uFE0F", text: "\u0414\u043E\u0449" };
    if (code <= 77)
      return { icon: "\u2744\uFE0F", text: "\u0421\u043D\u0456\u0433" };
    if (code <= 82)
      return { icon: "\u{1F327}\uFE0F", text: "\u0417\u043B\u0438\u0432\u0438" };
    if (code >= 95)
      return { icon: "\u26C8\uFE0F", text: "\u0413\u0440\u043E\u0437\u0430" };
    return { icon: "\u{1F321}\uFE0F", text: "\u2014" };
  }
  function loadBusPrefs() {
    try {
      return JSON.parse(localStorage.getItem(BUS_PREFS_KEY) || "{}");
    } catch {
      return {};
    }
  }
  var WEEKDAYS_UA = ["\u041D\u0434", "\u041F\u043D", "\u0412\u0442", "\u0421\u0440", "\u0427\u0442", "\u041F\u0442", "\u0421\u0431"];
  function setWeatherTitle(cityName) {
    const headerEl = document.querySelector(".cm-block--weather .cm-block-title");
    if (headerEl && cityName)
      headerEl.textContent = `\u041F\u043E\u0433\u043E\u0434\u0430 \u0432 ${cityName}`;
  }
  async function renderWeatherBlock() {
    const el = document.getElementById("cm-weather-content");
    if (!el)
      return;
    try {
      const { lat, lon, city: knownCity } = await getCoords();
      const [weatherRes, cityName] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`
        ),
        knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon)
      ]);
      const data = await weatherRes.json();
      const cur = data.current;
      const day = data.daily;
      const info = weatherCodeInfo(cur.weather_code);
      const temp = Math.round(cur.temperature_2m);
      const feels = Math.round(cur.apparent_temperature);
      setWeatherTitle(cityName);
      const forecastHtml = day.time.map((dateStr, i) => {
        const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
        const wd = i === 0 ? "\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456" : WEEKDAYS_UA[d.getDay()];
        const dayInfo = weatherCodeInfo(day.weather_code[i]);
        return `
        <div class="cm-fc-day${i === 0 ? " cm-fc-day--today" : ""}">
          <span class="cm-fc-wd">${escapeHtml(wd)}</span>
          <span class="cm-fc-date">${d.getDate()}</span>
          <span class="cm-fc-icon">${dayInfo.icon}</span>
        </div>
      `;
      }).join("");
      el.innerHTML = `
      <div class="cm-weather-main">
        <div class="cm-weather-icon">${info.icon}</div>
        <div class="cm-weather-temp">${temp}\xB0</div>
        <div class="cm-weather-text">
          <div class="cm-weather-desc">${escapeHtml(info.text)}</div>
          <div class="cm-weather-feels">\u0412\u0456\u0434\u0447\u0443\u0432\u0430\u0454\u0442\u044C\u0441\u044F \u044F\u043A ${feels}\xB0</div>
        </div>
      </div>
      <div class="cm-weather-forecast">${forecastHtml}</div>
    `;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u0433\u043E\u0434\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  function busToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function busMinsToHHMM(total) {
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${pad(h)}:${pad(m)}`;
  }
  function busIsDayActive(days) {
    const d = (/* @__PURE__ */ new Date()).getDay();
    if (days === "\u0449\u043E\u0434\u043D\u044F")
      return true;
    if (days === "\u043F\u043D-\u0441\u0431")
      return d >= 1 && d <= 6;
    if (days === "\u043F\u043D-\u043F\u0442")
      return d >= 1 && d <= 5;
    return true;
  }
  function busGetStopMins(route, stopName) {
    const stop = route.stops.find((s) => s.name === stopName);
    if (!stop)
      return null;
    const totalKm = route.stops[route.stops.length - 1].km;
    if (totalKm === 0)
      return busToMinutes(route.departure_time);
    return busToMinutes(route.departure_time) + Math.round(stop.km / totalKm * route.duration_min);
  }
  async function renderBusBlock() {
    const el = document.getElementById("cm-bus-content");
    if (!el)
      return;
    try {
      const res = await fetch("./data/schedule.json");
      const data = await res.json();
      const prefs = loadBusPrefs();
      const now = /* @__PURE__ */ new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const candidates = data.routes.filter((r) => {
        if (!busIsDayActive(r.days))
          return false;
        if (prefs.from && !r.stops.some((s) => s.name === prefs.from))
          return false;
        if (prefs.to && !r.stops.some((s) => s.name === prefs.to))
          return false;
        if (prefs.from && prefs.to) {
          const fi = r.stops.findIndex((s) => s.name === prefs.from);
          const ti = r.stops.findIndex((s) => s.name === prefs.to);
          if (fi >= ti)
            return false;
        }
        const startName = prefs.from || r.stops[0].name;
        const m = busGetStopMins(r, startName);
        return m !== null && m > nowMin;
      });
      candidates.sort((a, b) => {
        const aFrom = prefs.from || a.stops[0].name;
        const bFrom = prefs.from || b.stops[0].name;
        return (busGetStopMins(a, aFrom) || 0) - (busGetStopMins(b, bFrom) || 0);
      });
      const next = candidates[0];
      if (!next) {
        el.innerHTML = `
        <div class="cm-block-empty">
          \u0420\u0435\u0439\u0441\u0456\u0432 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0431\u0456\u043B\u044C\u0448\u0435 \u043D\u0435\u043C\u0430\u0454
          <button class="cm-block-cta" onclick="switchTab('buses')">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u2192</button>
        </div>`;
        return;
      }
      const fromName = prefs.from || next.stops[0].name;
      const toName = prefs.to || next.stops[next.stops.length - 1].name;
      const fromMin = busGetStopMins(next, fromName);
      const toMin = busGetStopMins(next, toName);
      const fromHHMM = busMinsToHHMM(fromMin);
      const toHHMM = busMinsToHHMM(toMin);
      const minsLeft = fromMin - nowMin;
      const urgent = minsLeft <= 10;
      const countdown = minsLeft < 60 ? `\u0447\u0435\u0440\u0435\u0437 ${minsLeft} \u0445\u0432` : (() => {
        const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
        return m ? `\u0447\u0435\u0440\u0435\u0437 ${h} \u0433\u043E\u0434 ${m} \u0445\u0432` : `\u0447\u0435\u0440\u0435\u0437 ${h} \u0433\u043E\u0434`;
      })();
      el.innerHTML = `
      <div class="cm-bus-main ${urgent ? "urgent" : ""}">
        <div class="cm-bus-time">${escapeHtml(fromHHMM)}</div>
        <div class="cm-bus-info">
          <div class="cm-bus-route">${escapeHtml(fromName)} \u2192 ${escapeHtml(toName)}</div>
          <div class="cm-bus-meta">${escapeHtml(next.name)} \xB7 \u043F\u0440\u0438\u0431\u0443\u0442\u0442\u044F ${escapeHtml(toHHMM)}</div>
        </div>
        <div class="cm-bus-countdown ${urgent ? "urgent" : ""}">${escapeHtml(countdown)}</div>
      </div>
    `;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439</div>';
    }
  }
  var CATEGORY_EMOJI = {
    "\u043F\u0440\u043E\u0434\u0430\u043C": "\u{1F4B0}",
    "\u043A\u0443\u043F\u043B\u044E": "\u{1F6D2}",
    "\u0448\u0443\u043A\u0430\u044E": "\u{1F50D}",
    "\u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E": "\u{1F381}",
    "\u0437\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C": "\u{1F61F}",
    "\u043F\u043E\u0434\u044F\u043A\u0430": "\u2764\uFE0F",
    "\u043F\u043E\u0441\u043B\u0443\u0433\u0430": "\u{1F527}",
    "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F": "\u{1F4E2}"
  };
  async function renderBoardBlock() {
    const el = document.getElementById("cm-board-content");
    if (!el)
      return;
    try {
      const [boardRes, communityRes] = await Promise.all([
        fetch("./data/community-board.json"),
        fetch("./data/community.json")
      ]);
      const boardData = await boardRes.json();
      const communityData = await communityRes.json();
      const userPosts = (boardData.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const official = (communityData.announcements || []).slice().sort((a, b) => {
        if (a.pinned !== b.pinned)
          return a.pinned ? -1 : 1;
        return (b.ts || 0) - (a.ts || 0);
      });
      const totalCount = official.length + userPosts.length;
      if (!totalCount) {
        el.innerHTML = `<div class="cm-board-preview-empty">\u041D\u0430 \u0434\u043E\u0448\u0446\u0456 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E.</div>`;
        return;
      }
      const merged = [
        ...official.map((a) => ({ type: "official", title: a.title, text: a.body, ts: a.ts, id: a.id })),
        ...userPosts.map((p) => ({ type: "user", category: p.category, text: p.text, ts: p.ts, id: p.id, color: p.color }))
      ].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 2);
      const stickersHtml = merged.map((item) => {
        const tilt = item.id * 7 % 9 - 4;
        if (item.type === "official") {
          return `
          <article class="cm-board-note cm-board-note--official cm-board-mini" style="--tilt:${tilt}deg">
            <span class="cm-board-pin cm-board-pin--gold"></span>
            <span class="cm-board-cat cm-board-cat--official">\u{1F3DB}\uFE0F \u041E\u0424\u0406\u0426\u0406\u0419\u041D\u041E</span>
            <p class="cm-board-text">${escapeHtml(item.title)}</p>
          </article>
        `;
        }
        const emoji = CATEGORY_EMOJI[item.category] || "\u{1F4CC}";
        return `
        <article class="cm-board-note cm-board-note--${escapeHtml(item.color || "yellow")} cm-board-mini" style="--tilt:${tilt}deg">
          <span class="cm-board-pin"></span>
          <span class="cm-board-cat">${emoji} ${escapeHtml(item.category)}</span>
          <p class="cm-board-text">${escapeHtml(item.text)}</p>
        </article>
      `;
      }).join("");
      const more = Math.max(0, totalCount - merged.length);
      const moreHtml = more > 0 ? `<div class="cm-board-preview-more">+${more} \u0449\u0435 \u043D\u0430 \u0434\u043E\u0448\u0446\u0456</div>` : "";
      el.innerHTML = `
      <div class="cm-board-preview" onclick="switchTab('board')">
        <div class="cm-board-corkboard cm-board-corkboard--mini">
          ${stickersHtml}
        </div>
        ${moreHtml}
      </div>
    `;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  var OTG_VILLAGES = [
    "\u041E\u043B\u0438\u043A\u0430",
    "\u0413\u043E\u0440\u044F\u043D\u0456\u0432\u043A\u0430",
    "\u0414\u0435\u0440\u043D\u043E",
    "\u0414\u0456\u0434\u0438\u0447\u0456",
    "\u0416\u043E\u0440\u043D\u0438\u0449\u0435",
    "\u0417\u0430\u043B\u0456\u0441\u043E\u0447\u0435",
    "\u041A\u043E\u0442\u0456\u0432",
    "\u041B\u0438\u0447\u0430\u043D\u0438",
    "\u041C\u0435\u0442\u0435\u043B\u044C\u043D\u0435",
    "\u041C\u043E\u0449\u0430\u043D\u0438\u0446\u044F",
    "\u041D\u043E\u0441\u043E\u0432\u0438\u0447\u0456",
    "\u041E\u0434\u0435\u0440\u0430\u0434\u0438",
    "\u041F\u043E\u043A\u0430\u0449\u0456\u0432",
    "\u041F\u0443\u0442\u0438\u043B\u0456\u0432\u043A\u0430",
    "\u0421\u0442\u0430\u0432\u043E\u043A",
    "\u0425\u0440\u043E\u043C\u044F\u043A\u0456\u0432",
    "\u0427\u0435\u043C\u0435\u0440\u0438\u043D"
  ];
  function isLocalEvent(ev) {
    const loc = (ev.location || "").toLowerCase();
    return OTG_VILLAGES.some((v) => loc.includes(v.toLowerCase()));
  }
  async function renderEventBlock() {
    const el = document.getElementById("cm-event-content");
    if (!el)
      return;
    try {
      const res = await fetch("./data/events.json");
      const events = await res.json();
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const next = events.filter((e) => /* @__PURE__ */ new Date(e.date + "T00:00:00") >= today).filter(isLocalEvent).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      if (!next) {
        el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454 \u0437\u0430\u043F\u043B\u0430\u043D\u043E\u0432\u0430\u043D\u0438\u0445 \u043F\u043E\u0434\u0456\u0439 \u0443 \u0433\u0440\u043E\u043C\u0430\u0434\u0456</div>';
        return;
      }
      const d = /* @__PURE__ */ new Date(next.date + "T00:00:00");
      const months = ["\u0441\u0456\u0447\u043D\u044F", "\u043B\u044E\u0442\u043E\u0433\u043E", "\u0431\u0435\u0440\u0435\u0437\u043D\u044F", "\u043A\u0432\u0456\u0442\u043D\u044F", "\u0442\u0440\u0430\u0432\u043D\u044F", "\u0447\u0435\u0440\u0432\u043D\u044F", "\u043B\u0438\u043F\u043D\u044F", "\u0441\u0435\u0440\u043F\u043D\u044F", "\u0432\u0435\u0440\u0435\u0441\u043D\u044F", "\u0436\u043E\u0432\u0442\u043D\u044F", "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430", "\u0433\u0440\u0443\u0434\u043D\u044F"];
      el.innerHTML = `
      <article class="cm-event-card" onclick="switchTab('events')">
        <div class="cm-event-date">
          <span class="cm-event-day">${d.getDate()}</span>
          <span class="cm-event-month">${months[d.getMonth()].slice(0, 3)}</span>
        </div>
        <div class="cm-event-body">
          <div class="cm-event-cat">${escapeHtml(next.category)}</div>
          <h4 class="cm-event-title">${escapeHtml(next.title)}</h4>
          <div class="cm-event-meta">\u{1F4CD} ${escapeHtml(next.location)} \xB7 \u23F0 ${escapeHtml(next.time)}</div>
        </div>
      </article>
    `;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u0434\u0456\u0457 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
    }
  }
  var CONTACT_ICONS = {
    ambulance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10h4M12 8v4"/><path d="M2 17h20v-3a2 2 0 0 0-2-2h-3l-3-4H7a4 4 0 0 0-4 4v5h-1"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2-2-3.5C10 9.5 8.5 8 8.5 6c0 0-2 2-2 5a5 5 0 0 0 5 5 5 5 0 0 0 5-5c0-3-3-7-5-9 0 2-2 4.5-3.5 6.5z"/></svg>',
    police: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    gas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M8 6h8M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M10 12h4"/></svg>',
    hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M2 22h20"/><path d="M12 11v4M10 13h4"/></svg>',
    gromada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg>',
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    default: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
  };
  async function renderContactsBlock() {
    const el = document.getElementById("cm-contacts-content");
    if (!el)
      return;
    try {
      const res = await fetch("./data/community.json");
      const data = await res.json();
      const list = data.contacts || [];
      if (!list.length) {
        el.innerHTML = '<div class="cm-block-empty">\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0456\u0432 \u043D\u0435\u043C\u0430\u0454</div>';
        return;
      }
      const hero = list.find((c) => c.group === "hero" || c.priority === "critical");
      const emergency = list.filter((c) => c.group === "emergency");
      const local = list.filter((c) => c.group === "local");
      const telOf = (p) => p.replace(/[^\d+]/g, "");
      const heroHtml = hero ? `
      <a class="cm-contact-hero" href="tel:${escapeHtml(telOf(hero.phone))}">
        <span class="cm-contact-hero-icon">${CONTACT_ICONS[hero.icon] || CONTACT_ICONS.default}</span>
        <span class="cm-contact-hero-text">
          <span class="cm-contact-hero-name">${escapeHtml(hero.name)}</span>
          <span class="cm-contact-hero-hint">\u0422\u0430\u043F \u0434\u043B\u044F \u0432\u0438\u043A\u043B\u0438\u043A\u0443</span>
        </span>
        <span class="cm-contact-hero-phone">${escapeHtml(hero.phone)}</span>
      </a>
    ` : "";
      const emergencyHtml = emergency.length ? `
      <div class="cm-contact-group cm-contact-group--emergency">
        <div class="cm-contact-group-title">\u0410\u0432\u0430\u0440\u0456\u0439\u043D\u0456</div>
        <div class="cm-contact-grid-2x2">
          ${emergency.map((c) => `
            <a class="cm-contact-tile" href="tel:${escapeHtml(telOf(c.phone))}">
              <span class="cm-contact-tile-icon">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
              <span class="cm-contact-tile-name">${escapeHtml(c.name)}</span>
              <span class="cm-contact-tile-phone">${escapeHtml(c.phone)}</span>
            </a>
          `).join("")}
        </div>
      </div>
    ` : "";
      const localHtml = local.length ? `
      <div class="cm-contact-group cm-contact-group--local">
        <div class="cm-contact-group-title">\u041C\u0456\u0441\u0446\u0435\u0432\u0456</div>
        <div class="cm-contact-rows">
          ${local.map((c) => `
            <a class="cm-contact-row" href="tel:${escapeHtml(telOf(c.phone))}">
              <span class="cm-contact-row-icon">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
              <span class="cm-contact-row-text">
                <span class="cm-contact-row-name">${escapeHtml(c.name)}</span>
                <span class="cm-contact-row-phone">${escapeHtml(c.phone)}</span>
              </span>
            </a>
          `).join("")}
        </div>
      </div>
    ` : "";
      el.innerHTML = heroHtml + emergencyHtml + localHtml;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
    }
  }

  // src/tabs/community.js
  var HERO_IMAGES = [
    "./photos/olyka-1.jpg",
    "./photos/olyka-2.jpg",
    "./photos/olyka-3.jpg"
  ];
  var _heroInterval = null;
  var _heroIndex = 0;
  function startHeroRotator() {
    if (_heroInterval)
      clearInterval(_heroInterval);
    if (HERO_IMAGES.length < 2)
      return;
    _heroIndex = 0;
    _heroInterval = setInterval(() => {
      const wrap = document.querySelector(".cm-hero");
      if (!wrap) {
        clearInterval(_heroInterval);
        _heroInterval = null;
        return;
      }
      _heroIndex = (_heroIndex + 1) % HERO_IMAGES.length;
      wrap.querySelectorAll(".cm-hero-img").forEach((img, i) => {
        img.classList.toggle("active", i === _heroIndex);
      });
      wrap.querySelectorAll(".cm-hero-dot").forEach((d, i) => {
        d.classList.toggle("active", i === _heroIndex);
      });
    }, 6e3);
  }
  function getGreeting() {
    const h = (/* @__PURE__ */ new Date()).getHours();
    if (h >= 5 && h < 11)
      return { text: "\u0414\u043E\u0431\u0440\u0438\u0439 \u0440\u0430\u043D\u043E\u043A, \u0433\u0440\u043E\u043C\u0430\u0434\u043E!", sub: "\u041E\u0441\u044C \u0449\u043E \u0433\u043E\u043B\u043E\u0432\u043D\u0435 \u0443 \u043D\u0430\u0441 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456" };
    if (h >= 11 && h < 17)
      return { text: "\u0414\u043E\u0431\u0440\u0438\u0434\u0435\u043D\u044C, \u0433\u0440\u043E\u043C\u0430\u0434\u043E!", sub: "\u041E\u0441\u044C \u0449\u043E \u0433\u043E\u043B\u043E\u0432\u043D\u0435 \u0443 \u043D\u0430\u0441 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456" };
    if (h >= 17 && h < 22)
      return { text: "\u0414\u043E\u0431\u0440\u0438\u0439 \u0432\u0435\u0447\u0456\u0440, \u0433\u0440\u043E\u043C\u0430\u0434\u043E!", sub: "\u0429\u043E \u0446\u0456\u043A\u0430\u0432\u043E\u0433\u043E \u0431\u0443\u043B\u043E \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456" };
    return { text: "\u0414\u043E\u0431\u0440\u043E\u0457 \u043D\u043E\u0447\u0456, \u0433\u0440\u043E\u043C\u0430\u0434\u043E!", sub: "\u0413\u0440\u043E\u043C\u0430\u0434\u0430 \u0441\u043F\u0438\u0442\u044C \u2014 \u043E\u0441\u044C \u0434\u043E\u0431\u0456\u0440\u043A\u0430" };
  }
  function formatTodayHeader() {
    const d = /* @__PURE__ */ new Date();
    const wd = ["\u043D\u0435\u0434\u0456\u043B\u044F", "\u043F\u043E\u043D\u0435\u0434\u0456\u043B\u043E\u043A", "\u0432\u0456\u0432\u0442\u043E\u0440\u043E\u043A", "\u0441\u0435\u0440\u0435\u0434\u0430", "\u0447\u0435\u0442\u0432\u0435\u0440", "\u043F\u02BC\u044F\u0442\u043D\u0438\u0446\u044F", "\u0441\u0443\u0431\u043E\u0442\u0430"][d.getDay()];
    const m = ["\u0441\u0456\u0447\u043D\u044F", "\u043B\u044E\u0442\u043E\u0433\u043E", "\u0431\u0435\u0440\u0435\u0437\u043D\u044F", "\u043A\u0432\u0456\u0442\u043D\u044F", "\u0442\u0440\u0430\u0432\u043D\u044F", "\u0447\u0435\u0440\u0432\u043D\u044F", "\u043B\u0438\u043F\u043D\u044F", "\u0441\u0435\u0440\u043F\u043D\u044F", "\u0432\u0435\u0440\u0435\u0441\u043D\u044F", "\u0436\u043E\u0432\u0442\u043D\u044F", "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430", "\u0433\u0440\u0443\u0434\u043D\u044F"][d.getMonth()];
    return `${wd} \xB7 ${d.getDate()} ${m}`;
  }
  function renderSkeleton() {
    const el = document.getElementById("cm-content");
    if (!el)
      return;
    const greeting = getGreeting();
    const todayStr = formatTodayHeader();
    el.innerHTML = `
    <section class="cm-greeting">
      <div class="cm-greeting-date">${escapeHtml(todayStr)}</div>
      <div class="cm-greeting-text">${escapeHtml(greeting.text)}</div>
      <div class="cm-greeting-sub">${escapeHtml(greeting.sub)}</div>
    </section>

    <section class="cm-hero">
      ${HERO_IMAGES.map((url, i) => `
        <img class="cm-hero-img${i === 0 ? " active" : ""}" src="${escapeHtml(url)}" alt="${i === 0 ? "\u041E\u043B\u0438\u043A\u0430" : ""}" loading="${i === 0 ? "eager" : "lazy"}">
      `).join("")}
      <div class="cm-hero-overlay">
        <h2 class="cm-hero-title">\u041E\u043B\u0438\u043A\u0430</h2>
        <p class="cm-hero-sub">\u041D\u0430\u0448\u0435 \u043C\u0456\u0441\u0442\u0435\u0447\u043A\u043E \u043D\u0430 \u0412\u043E\u043B\u0438\u043D\u0456</p>
      </div>
      <div class="cm-hero-dots">
        ${HERO_IMAGES.map((_, i) => `<span class="cm-hero-dot${i === 0 ? " active" : ""}"></span>`).join("")}
      </div>
    </section>

    <section class="cm-block cm-block--board">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u0414\u043E\u0448\u043A\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h3>
        <button class="cm-block-link" onclick="switchTab('board')">\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u2192</button>
      </header>
      <div id="cm-board-content" class="cm-board-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--weather">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041F\u043E\u0433\u043E\u0434\u0430 \u0432 \u041E\u043B\u0438\u0446\u0456</h3>
      </header>
      <div id="cm-weather-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <!-- \u0411\u043B\u043E\u043A \u0421\u0432\u0456\u0442\u043B\u043E \u2014 \u043F\u0440\u0438\u0445\u043E\u0432\u0430\u043D\u043E 16.05.2026 (\u0441\u0432\u0456\u0442\u043B\u043E \u043D\u0430\u0440\u0430\u0437\u0456 \u043D\u0435 \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0430\u044E\u0442\u044C).
         \u0429\u043E\u0431 \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438: \u0440\u043E\u0437\u043A\u043E\u043C\u0435\u043D\u0442\u0443\u0432\u0430\u0442\u0438 \u0441\u0435\u043A\u0446\u0456\u044E + \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438 renderPowerBlock() \u0443 initCommunity. -->
    <!--
    <section class="cm-block cm-block--power">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u0421\u0432\u0456\u0442\u043B\u043E \u0437\u0430\u0440\u0430\u0437</h3>
        <button class="cm-block-link" onclick="switchTab('power')">\u0413\u0440\u0430\u0444\u0456\u043A \u2192</button>
      </header>
      <div id="cm-power-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>
    -->

    <section class="cm-block cm-block--bus">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0430\u0432\u0442\u043E\u0431\u0443\u0441</h3>
        <button class="cm-block-link" onclick="switchTab('buses')">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u2192</button>
      </header>
      <div id="cm-bus-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0430 \u043F\u043E\u0434\u0456\u044F \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h3>
        <button class="cm-block-link" onclick="switchTab('events')">\u0410\u0444\u0456\u0448\u0430 \u2192</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041A\u043E\u0440\u0438\u0441\u043D\u0456 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0438</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>
  `;
  }
  function initCommunity() {
    renderSkeleton();
    startHeroRotator();
    renderWeatherBlock();
    renderBusBlock();
    renderBoardBlock();
    renderEventBlock();
    renderContactsBlock();
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
    return allArticles.filter((a) => activeGeo === "\u0412\u0441\u0456" || a.geo === activeGeo).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
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
  function decodeEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = str || "";
    return ta.value;
  }
  function renderArticleBody(content) {
    const text = decodeEntities(content || "");
    const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (!paragraphs.length)
      return "";
    return paragraphs.map((p) => `<p class="article-p">${escapeHtml(p)}</p>`).join("");
  }
  window.openArticle = function(id) {
    const article = allArticles.find((a) => a.id === id);
    if (!article)
      return;
    const modal = document.getElementById("article-modal");
    const modalContent = document.getElementById("article-modal-content");
    const modalMetaTags = document.getElementById("modalMetaTags");
    if (!modal || !modalContent)
      return;
    const sourceHtml = article.sourceUrl ? `<a class="article-byline-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(article.source)}</a>` : `<span>${escapeHtml(article.source)}</span>`;
    const rawText = article.content && article.content.length > (article.excerpt || "").length ? article.content : article.excerpt || article.content || "";
    const bodyHtml = renderArticleBody(rawText);
    if (modalMetaTags) {
      modalMetaTags.innerHTML = `
      <span class="news-card-geo">${escapeHtml(article.geo)}</span>
      <span class="modal-meta-sep">\u2022</span>
      <span class="news-card-category">${escapeHtml(article.category)}</span>
      ${article.exclusive ? '<span class="exclusive-badge">\u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
    `;
    }
    modalContent.innerHTML = `
    <div class="article-modal-header">
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      <div class="article-byline">
        ${sourceHtml}
        <span>${formatTime(article.ts)}</span>
      </div>
    </div>
    ${article.image ? `<img class="article-img" src="${escapeHtml(article.image)}" alt="">` : ""}
    <div class="article-body">${bodyHtml}</div>
    ${!article.exclusive && article.sourceUrl && rawText.trim().length < 600 ? `
      <div class="article-short-note">
        \u0414\u0436\u0435\u0440\u0435\u043B\u043E \u043D\u0430\u0434\u0430\u0454 \u043B\u0438\u0448\u0435 \u0430\u043D\u043E\u043D\u0441 \u0447\u0435\u0440\u0435\u0437 RSS \u2014 \u043F\u043E\u0432\u043D\u0438\u0439 \u0442\u0435\u043A\u0441\u0442 \u043D\u0430 \u0441\u0430\u0439\u0442\u0456 \u0432\u0438\u0434\u0430\u043D\u043D\u044F.
        <a class="article-short-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">\u0427\u0438\u0442\u0430\u0442\u0438 \u043F\u043E\u0432\u043D\u0456\u0441\u0442\u044E \u2192</a>
      </div>
    ` : ""}
    <div class="article-source-row">
      <span class="article-source-author"><strong>\u0410\u0432\u0442\u043E\u0440 \u043F\u0443\u0431\u043B\u0456\u043A\u0430\u0446\u0456\u0457:</strong><br>${escapeHtml(article.source)}</span>
      ${article.sourceUrl ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">\u0427\u0438\u0442\u0430\u0442\u0438 \u043E\u0440\u0438\u0433\u0456\u043D\u0430\u043B \u2192</a>` : ""}
    </div>
  `;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
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
    const pad2 = (n) => String(n).padStart(2, "0");
    const start = /* @__PURE__ */ new Date(ev.date + "T" + (ev.time || "09:00") + ":00");
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1e3);
    const fmt = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    const esc = (s) => (s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CSTL LIFE//UA",
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
  function renderSkeleton2(el) {
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
    }).sort((a, b) => {
      const byDate = new Date(a.date) - new Date(b.date);
      if (byDate !== 0)
        return byDate;
      return (a.time || "").localeCompare(b.time || "");
    });
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
      renderSkeleton2(el);
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
  var HERO_MAX_WAIT_MIN = 60;
  function renderSmartRow() {
    const el = document.getElementById("bus-smart-row");
    if (!el)
      return;
    const next = findNextRoute();
    if (!next) {
      el.innerHTML = `<div class="bus-hero bus-hero--empty">\u0420\u0435\u0439\u0441\u0456\u0432 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0431\u0456\u043B\u044C\u0448\u0435 \u043D\u0435\u043C\u0430\u0454</div>`;
      return;
    }
    const effFrom = getEffectiveFrom(next);
    const effTo = getEffectiveTo(next);
    const fromTime = getStopHHMM(next, effFrom);
    const toTime = getStopHHMM(next, effTo);
    const mins = minutesUntil(fromTime);
    const urgent = mins !== null && mins <= 10;
    const fromMins = getStopMins(next, effFrom) || 0;
    const toMins = getStopMins(next, effTo) || 0;
    const segDur = toMins - fromMins;
    const durStr = segDur >= 60 ? `${Math.floor(segDur / 60)} \u0433\u043E\u0434${segDur % 60 ? " " + segDur % 60 + " \u0445\u0432" : ""}` : `${segDur} \u0445\u0432`;
    const price = getSegmentPrice(next, effFrom, effTo);
    const carrier = busData.carriers?.[next.carrier] || { name: next.carrier, phone: "0332 224 500" };
    const progress = mins !== null ? Math.max(0, Math.min(1, 1 - mins / HERO_MAX_WAIT_MIN)) : 0;
    const countdownText = mins !== null ? mins < 60 ? `\u0427\u0415\u0420\u0415\u0417 ${mins} \u0425\u0412` : `\u0427\u0415\u0420\u0415\u0417 ${Math.floor(mins / 60)} \u0413\u041E\u0414 ${mins % 60 ? mins % 60 + " \u0425\u0412" : ""}` : "\u0412\u0416\u0415 \u0417\u0410\u0420\u0410\u0417";
    el.innerHTML = `
    <div class="bus-hero${urgent ? " bus-hero--urgent" : ""}">
      <div class="bus-hero-top">
        <span class="bus-hero-countdown">${escapeHtml(countdownText)}</span>
        ${urgent ? '<span class="bus-hero-urgent">\u26A1 \u041F\u043E\u0441\u043F\u0456\u0448\u0430\u0439!</span>' : ""}
      </div>
      <div class="bus-hero-row">
        <div class="bus-hero-times">
          <span class="bus-hero-time">${escapeHtml(fromTime || "\u2014")}</span>
          <span class="bus-hero-arrow">\u2192</span>
          <span class="bus-hero-time bus-hero-time--to">${escapeHtml(toTime || "\u2014")}</span>
        </div>
      </div>
      <div class="bus-hero-route">${escapeHtml(effFrom)} \u2192 ${escapeHtml(effTo)}</div>
      <div class="bus-hero-meta">
        <span>${escapeHtml(price || "\u2014")} \u0433\u0440\u043D</span>
        <span class="bus-hero-meta-sep">\xB7</span>
        <span>${escapeHtml(durStr)}</span>
        <span class="bus-hero-meta-sep">\xB7</span>
        <span>${escapeHtml(carrier.name)}</span>
      </div>
      <div class="bus-hero-progress" aria-hidden="true">
        <div class="bus-hero-progress-fill" style="width: ${(progress * 100).toFixed(1)}%"></div>
      </div>
    </div>
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
      ${escapeHtml(busData.source)}<br>
      \u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${escapeHtml(busData.verifiedTime)} | ${escapeHtml(busData.verifiedAt)}
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

  // src/tabs/power.js
  var powerData = null;
  var selCity = null;
  var selStreet = null;
  var PREFS_KEY2 = "power_prefs_v2";
  function savePrefs2() {
    localStorage.setItem(PREFS_KEY2, JSON.stringify({
      cityId: selCity?.id || null,
      streetId: selStreet?.id || null
    }));
  }
  function loadPrefs2() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY2) || "{}");
    } catch {
      return {};
    }
  }
  function findCity(id) {
    return powerData?.cities.find((c) => c.id === id) || null;
  }
  function findStreetInCity(city, streetId) {
    return city?.streets.find((s) => s.id === streetId) || null;
  }
  function findQueue(id) {
    return powerData?.queues.find((q) => q.id === id) || null;
  }
  function getTodaySchedule(queueId) {
    const queue = findQueue(queueId);
    if (!queue)
      return null;
    const key = todayKey();
    return queue.schedule[key] || queue.schedule[Object.keys(queue.schedule)[0]] || null;
  }
  function generateICS(street, queue) {
    const schedule = getTodaySchedule(queue.id);
    if (!schedule)
      return;
    const d = /* @__PURE__ */ new Date();
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const events = [];
    let i = 0;
    while (i < 24) {
      if (schedule[i] === 0) {
        const start = i;
        while (i < 24 && schedule[i] === 0)
          i++;
        events.push(
          `BEGIN:VEVENT\r
DTSTART:${ymd}T${pad(start)}0000\r
DTEND:${ymd}T${pad(i)}0000\r
SUMMARY:\u26A1 \u0412\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u2014 ${escapeHtml(street.name)}\r
DESCRIPTION:${escapeHtml(queue.name)} \xB7 CSTL LIFE \u041E\u043B\u0438\u0446\u044C\u043A\u0430 \u041E\u0422\u0413\r
END:VEVENT`
        );
      } else {
        i++;
      }
    }
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CSTL LIFE//Power Schedule//UK",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...events,
      "END:VCALENDAR"
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vidklyuchennya-${d.getDate()}-${d.getMonth() + 1}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function renderCityOnboarding(container) {
    container.innerHTML = `
    <div class="pw-onboarding">
      <div class="pw-onboarding-icon">\u26A1</div>
      <h3 class="pw-onboarding-title">\u0413\u0440\u0430\u0444\u0456\u043A \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u044C</h3>
      <p class="pw-onboarding-sub">\u041E\u0431\u0435\u0440\u0456\u0442\u044C \u0432\u0430\u0448\u0435 \u0441\u0435\u043B\u043E \u0430\u0431\u043E \u043C\u0456\u0441\u0442\u043E</p>
      <div class="pw-street-list">
        ${powerData.cities.map(
      (c) => `<button class="pw-street-btn" data-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`
    ).join("")}
      </div>
    </div>
  `;
    container.querySelectorAll(".pw-street-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selCity = findCity(btn.dataset.id);
        if (!selCity)
          return;
        if (selCity.streets.length === 1) {
          selStreet = selCity.streets[0];
          savePrefs2();
          renderPowerPage();
        } else {
          savePrefs2();
          renderPowerPage();
        }
      });
    });
  }
  function renderStreetOnboarding(container) {
    container.innerHTML = `
    <div class="pw-onboarding">
      <button class="pw-back-btn" id="pw-back-city">\u2190 ${escapeHtml(selCity.name)}</button>
      <div class="pw-onboarding-icon">\u26A1</div>
      <h3 class="pw-onboarding-title">\u0412\u0430\u0448\u0430 \u0432\u0443\u043B\u0438\u0446\u044F</h3>
      <p class="pw-onboarding-sub">\u041E\u0431\u0435\u0440\u0456\u0442\u044C \u0432\u0443\u043B\u0438\u0446\u044E \u2014 \u0456 \u043F\u043E\u0431\u0430\u0447\u0438\u0442\u0435<br>\u043A\u043E\u043B\u0438 \u0431\u0443\u0434\u0435 \u0456 \u043D\u0435 \u0431\u0443\u0434\u0435 \u0441\u0432\u0456\u0442\u043B\u0430</p>
      <div class="pw-street-list">
        ${selCity.streets.map(
      (s) => `<button class="pw-street-btn" data-id="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>`
    ).join("")}
      </div>
    </div>
  `;
    container.querySelector("#pw-back-city")?.addEventListener("click", () => {
      selCity = null;
      selStreet = null;
      savePrefs2();
      renderPowerPage();
    });
    container.querySelectorAll(".pw-street-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selStreet = findStreetInCity(selCity, btn.dataset.id);
        savePrefs2();
        renderPowerPage();
      });
    });
  }
  function findPeriodStart(schedule, fromH) {
    let h = fromH;
    while (h > 0 && schedule[h - 1] === schedule[fromH])
      h--;
    return h;
  }
  function findNextChange(schedule, fromH) {
    for (let h = fromH + 1; h < 24; h++) {
      if (schedule[h] !== schedule[fromH])
        return h;
    }
    return null;
  }
  function renderProgressRing(progress, color) {
    const r = 88;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - progress);
    return `
    <svg class="pw-ring" viewBox="0 0 200 200">
      <circle class="pw-ring-bg" cx="100" cy="100" r="${r}"></circle>
      <circle class="pw-ring-fg"
              cx="100" cy="100" r="${r}"
              stroke="${color}"
              stroke-dasharray="${c.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"></circle>
    </svg>
  `;
  }
  function renderHeroTimer(schedule) {
    if (!schedule)
      return '<p class="pw-empty">\u0414\u0430\u043D\u0456 \u043D\u0430 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456</p>';
    const now = /* @__PURE__ */ new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const cur = schedule[curH];
    const nextH = findNextChange(schedule, curH);
    const periodStart = findPeriodStart(schedule, curH);
    const minToChange = nextH !== null ? (nextH - curH) * 60 - curM : (24 - curH) * 60 - curM;
    const minSinceStart = (curH - periodStart) * 60 + curM;
    const totalMin = minSinceStart + minToChange;
    const progress = totalMin > 0 ? minSinceStart / totalMin : 0;
    const h = Math.floor(minToChange / 60);
    const m = minToChange % 60;
    const timeLeft = h > 0 ? `${h} \u0433\u043E\u0434 ${m} \u0445\u0432` : `${m} \u0445\u0432`;
    let actionLabel, statusEmoji, ringColor;
    if (cur === 1) {
      actionLabel = nextH !== null ? "\u0414\u043E \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F" : "\u0411\u0435\u0437 \u0437\u043C\u0456\u043D \u0434\u043E \u043A\u0456\u043D\u0446\u044F \u0434\u043E\u0431\u0438";
      statusEmoji = "\u{1F7E2}";
      ringColor = "#4F8B3D";
    } else if (cur === 0) {
      actionLabel = nextH !== null ? "\u0414\u043E \u0441\u0432\u0456\u0442\u043B\u0430" : "\u0411\u0435\u0437 \u0437\u043C\u0456\u043D \u0434\u043E \u043A\u0456\u043D\u0446\u044F \u0434\u043E\u0431\u0438";
      statusEmoji = "\u{1F534}";
      ringColor = "#C41E3A";
    } else {
      actionLabel = nextH !== null ? "\u0414\u043E \u0437\u043C\u0456\u043D\u0438" : "\u041C\u043E\u0436\u043B\u0438\u0432\u0456 \u043F\u0435\u0440\u0435\u0431\u043E\u0457";
      statusEmoji = "\u{1F7E1}";
      ringColor = "#D97706";
    }
    const statusText = cur === 1 ? "\u0404 \u0441\u0432\u0456\u0442\u043B\u043E" : cur === 0 ? "\u041D\u0435\u043C\u0430\u0454 \u0441\u0432\u0456\u0442\u043B\u0430" : "\u041C\u043E\u0436\u043B\u0438\u0432\u0456 \u043F\u0435\u0440\u0435\u0431\u043E\u0457";
    const nextLabel = nextH !== null ? `\u0434\u043E ${pad(nextH)}:00` : "";
    let nextPeriodHtml = "";
    if (nextH !== null) {
      const nextStatus = schedule[nextH];
      let afterNextH = nextH;
      while (afterNextH < 24 && schedule[afterNextH] === nextStatus)
        afterNextH++;
      const nextDuration = afterNextH - nextH;
      const nextWord = nextStatus === 1 ? "\u0441\u0432\u0456\u0442\u043B\u0430" : nextStatus === 0 ? "\u0431\u0435\u0437 \u0441\u0432\u0456\u0442\u043B\u0430" : "\u043C\u043E\u0436\u043B\u0438\u0432\u0438\u0445 \u043F\u0435\u0440\u0435\u0431\u043E\u0457\u0432";
      nextPeriodHtml = `<div class="pw-hero-next">\u043F\u043E\u0442\u0456\u043C ${nextDuration} \u0433\u043E\u0434 ${nextWord}</div>`;
    }
    return `
    <div class="pw-hero pw-hero--${cur === 1 ? "on" : cur === 0 ? "off" : "maybe"}">
      <div class="pw-hero-ring-wrap">
        ${renderProgressRing(progress, ringColor)}
        <div class="pw-hero-center">
          <div class="pw-hero-status">${statusEmoji} ${statusText}</div>
          <div class="pw-hero-time">${nextH !== null ? timeLeft : "\u2014"}</div>
          <div class="pw-hero-label">${actionLabel}${nextH !== null ? ` ${nextLabel}` : ""}</div>
          ${nextPeriodHtml}
        </div>
      </div>
    </div>
  `;
  }
  function renderHorizontalTimeline(schedule) {
    if (!schedule)
      return "";
    const now = /* @__PURE__ */ new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const markerPos = (curH + curM / 60) / 24 * 100;
    const segments = schedule.map((status, h) => {
      const cls = status === 1 ? "on" : status === 0 ? "off" : "maybe";
      const isCurrent = h === curH;
      const label = status === 1 ? "\u0454" : status === 0 ? "\u043D\u0435\u043C\u0430\u0454" : "?";
      return `<div class="pw-seg pw-seg--${cls}${isCurrent ? " pw-seg--current" : ""}"
                title="${pad(h)}:00 \u2014 ${label}"></div>`;
    }).join("");
    const axisHtml = Array.from(
      { length: 24 },
      (_, i) => i % 2 === 0 ? `<span>${pad(i)}</span>` : `<span></span>`
    ).join("");
    return `
    <div class="pw-timeline-card">
      <div class="pw-timeline-title">\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \xB7 24 \u0433\u043E\u0434\u0438\u043D\u0438</div>
      <div class="pw-timeline-strip">
        ${segments}
        <div class="pw-timeline-marker" style="left: ${markerPos.toFixed(2)}%">
          <div class="pw-timeline-marker-dot"></div>
          <div class="pw-timeline-marker-label">${pad(curH)}:${pad(curM)}</div>
        </div>
      </div>
      <div class="pw-timeline-axis">${axisHtml}</div>
      <div class="pw-timeline-legend">
        <span><i class="pw-leg pw-leg--on"></i> \u0454 \u0441\u0432\u0456\u0442\u043B\u043E</span>
        <span><i class="pw-leg pw-leg--off"></i> \u043D\u0435\u043C\u0430\u0454</span>
        <span><i class="pw-leg pw-leg--maybe"></i> \u043C\u043E\u0436\u043B\u0438\u0432\u043E</span>
      </div>
    </div>
  `;
  }
  function renderTomorrowCard(queue) {
    const d = /* @__PURE__ */ new Date();
    d.setDate(d.getDate() + 1);
    const tomorrowKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const tomorrowSched = queue.schedule[tomorrowKey];
    if (!tomorrowSched)
      return "";
    const hoursOff = tomorrowSched.filter((s) => s === 0).length;
    if (hoursOff === 0) {
      return `<div class="pw-tomorrow pw-tomorrow--good">\u2728 \u0417\u0430\u0432\u0442\u0440\u0430 \u2014 \u0441\u0432\u0456\u0442\u043B\u043E \u0446\u0456\u043B\u0438\u0439 \u0434\u0435\u043D\u044C</div>`;
    }
    let maxLen = 0, maxStart = -1, curLen = 0, curStart = -1;
    for (let h = 0; h < 24; h++) {
      if (tomorrowSched[h] === 0) {
        if (curStart === -1)
          curStart = h;
        curLen++;
        if (curLen > maxLen) {
          maxLen = curLen;
          maxStart = curStart;
        }
      } else {
        curLen = 0;
        curStart = -1;
      }
    }
    const periodTxt = maxLen > 0 ? `\u041D\u0430\u0439\u0434\u043E\u0432\u0448\u0438\u0439 \u043F\u0435\u0440\u0456\u043E\u0434: ${pad(maxStart)}:00\u2013${pad(maxStart + maxLen)}:00` : "";
    return `
    <div class="pw-tomorrow">
      <div class="pw-tomorrow-title">\u26A0\uFE0F \u0417\u0430\u0432\u0442\u0440\u0430: ${hoursOff} \u0433\u043E\u0434\u0438\u043D \u0431\u0435\u0437 \u0441\u0432\u0456\u0442\u043B\u0430</div>
      <div class="pw-tomorrow-sub">${periodTxt}</div>
    </div>
  `;
  }
  function renderPowerPage() {
    const container = document.getElementById("power-content");
    if (!container || !powerData)
      return;
    const upd = new Date(powerData._meta.last_updated);
    const updStr = `${pad(upd.getHours())}:${pad(upd.getMinutes())}`;
    const offlineBanner = !navigator.onLine ? `<div class="pw-offline-banner">\u26A1 \u041E\u0444\u043B\u0430\u0439\u043D \u2014 \u0434\u0430\u043D\u0456 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043E \u043E ${updStr}</div>` : "";
    if (!selCity) {
      container.innerHTML = offlineBanner;
      renderCityOnboarding(container);
      return;
    }
    if (!selStreet) {
      container.innerHTML = offlineBanner;
      renderStreetOnboarding(container);
      return;
    }
    const queue = findQueue(selStreet.queue_id);
    if (!queue) {
      selStreet = null;
      savePrefs2();
      renderPowerPage();
      return;
    }
    const schedule = getTodaySchedule(queue.id);
    const hasStreets = selCity.streets.length > 1;
    const streetPillHtml = hasStreets ? `
    <button class="pw-street-btn-top pw-street-btn--secondary" id="pw-change-street" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-loc"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      <span>${escapeHtml(selStreet.name)}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-chev"><path d="M6 9l6 6 6-6"/></svg>
    </button>
  ` : "";
    container.innerHTML = `
    ${offlineBanner}

    <div class="pw-top-bar">
      <button class="pw-street-btn-top" id="pw-change-location" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-loc"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span>${escapeHtml(selCity.name)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-chev"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      ${streetPillHtml}
      <span class="pw-queue-badge">${escapeHtml(queue.name)}</span>
    </div>

    <button class="pw-help-link" id="pw-help-link" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-help-icon">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      \u041D\u0435 \u0437\u043D\u0430\u0454\u0442\u0435 \u0441\u0432\u043E\u044E \u0447\u0435\u0440\u0433\u0443?
    </button>

    ${renderHeroTimer(schedule)}

    ${renderHorizontalTimeline(schedule)}

    ${renderTomorrowCard(queue)}

    <div class="pw-actions">
      <button class="pw-ics-btn" id="pw-ics-btn">\u{1F4C5} \u0414\u043E\u0434\u0430\u0442\u0438 \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440</button>
    </div>

    <div class="pw-footer-note">
      \u0414\u0436\u0435\u0440\u0435\u043B\u043E: ${escapeHtml(powerData._meta.source)} \xB7 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043E \u043E ${updStr}<br>
      <span class="pw-demo-note">\u26A0\uFE0F DEMO-\u0434\u0430\u043D\u0456 \u2014 \u0431\u0443\u0434\u0435 Supabase \u0443 \u0424\u0430\u0437\u0456 3</span>
    </div>
  `;
    document.getElementById("pw-change-location")?.addEventListener("click", () => {
      selCity = null;
      selStreet = null;
      savePrefs2();
      renderPowerPage();
    });
    document.getElementById("pw-change-street")?.addEventListener("click", () => {
      selStreet = null;
      savePrefs2();
      renderPowerPage();
    });
    document.getElementById("pw-help-link")?.addEventListener("click", openQueueHelpModal);
    document.getElementById("pw-ics-btn")?.addEventListener("click", () => {
      generateICS(selStreet, queue);
    });
  }
  function openQueueHelpModal() {
    if (document.getElementById("pw-help-modal"))
      return;
    const wrap = document.createElement("div");
    wrap.id = "pw-help-modal";
    wrap.className = "pw-help-modal";
    wrap.innerHTML = `
    <div class="pw-help-backdrop"></div>
    <div class="pw-help-panel" role="dialog" aria-modal="true">
      <div class="pw-help-handle"></div>
      <button class="pw-help-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u0438\u0442\u0438">\u2715</button>
      <h3 class="pw-help-title">\u042F\u043A \u0434\u0456\u0437\u043D\u0430\u0442\u0438\u0441\u044C \u0441\u0432\u043E\u044E \u0447\u0435\u0440\u0433\u0443?</h3>
      <p class="pw-help-sub">
        \u0427\u0435\u0440\u0433\u0443 \u043F\u0440\u0438\u0437\u043D\u0430\u0447\u0430\u0454 <b>\u0412\u043E\u043B\u0438\u043D\u044C\u043E\u0431\u043B\u0435\u043D\u0435\u0440\u0433\u043E</b> \u0437\u0430 \u0444\u0456\u0437\u0438\u0447\u043D\u0438\u043C \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F\u043C \u0432\u0430\u0448\u043E\u0433\u043E
        \u0431\u0443\u0434\u0438\u043D\u043A\u0443 \u0434\u043E \u043F\u0456\u0434\u0441\u0442\u0430\u043D\u0446\u0456\u0457. \u041D\u0430 \u0436\u0430\u043B\u044C, \u0412\u041E\u0415 \u043D\u0435 \u0434\u0430\u0454 \u043F\u0443\u0431\u043B\u0456\u0447\u043D\u043E\u0433\u043E API \u2014 \u043C\u0438 \u043D\u0435
        \u043C\u043E\u0436\u0435\u043C\u043E \u0432\u0438\u0437\u043D\u0430\u0447\u0438\u0442\u0438 \u0457\u0457 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E.
      </p>
      <div class="pw-help-options">
        <div class="pw-help-opt">
          <span class="pw-help-emoji">\u{1F4C4}</span>
          <div>
            <div class="pw-help-opt-title">\u041F\u043E\u0434\u0438\u0432\u0456\u0442\u044C\u0441\u044F \u043D\u0430 \u043F\u043B\u0430\u0442\u0456\u0436\u043A\u0443</div>
            <div class="pw-help-opt-sub">\u0423 \u043A\u0432\u0438\u0442\u0430\u043D\u0446\u0456\u0457 \u0437\u0430 \u0441\u0432\u0456\u0442\u043B\u043E \u0432\u043A\u0430\u0437\u0430\u043D\u043E \xAB\u0427\u0435\u0440\u0433\u0430 \u2116\xBB.</div>
          </div>
        </div>
        <div class="pw-help-opt">
          <span class="pw-help-emoji">\u{1F310}</span>
          <div>
            <div class="pw-help-opt-title">\u041E\u0441\u043E\u0431\u0438\u0441\u0442\u0438\u0439 \u043A\u0430\u0431\u0456\u043D\u0435\u0442 \u0412\u041E\u0415</div>
            <div class="pw-help-opt-sub">\u0417\u0430\u0439\u0434\u0456\u0442\u044C \u043D\u0430 \u0441\u0430\u0439\u0442 \u0456 \u043F\u043E\u0434\u0438\u0432\u0456\u0442\u044C\u0441\u044F \u0443 \u043F\u0440\u043E\u0444\u0456\u043B\u0456.</div>
            <a class="pw-help-btn" href="https://ok.prosvitlo.com/home/login" target="_blank" rel="noopener">
              \u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u043A\u0430\u0431\u0456\u043D\u0435\u0442 \u2192
            </a>
          </div>
        </div>
        <div class="pw-help-opt">
          <span class="pw-help-emoji">\u{1F4DE}</span>
          <div>
            <div class="pw-help-opt-title">\u0417\u0430\u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443\u0439\u0442\u0435 \u0443 \u0412\u041E\u0415</div>
            <div class="pw-help-opt-sub">\u0426\u0456\u043B\u043E\u0434\u043E\u0431\u043E\u0432\u0430 \u0430\u0432\u0430\u0440\u0456\u0439\u043D\u0430.</div>
            <a class="pw-help-btn" href="tel:0800501482">
              0 800 501 482
            </a>
          </div>
        </div>
      </div>
      <p class="pw-help-footnote">
        \u{1F4A1} \u0421\u043A\u043E\u0440\u043E \u0443 \u0424\u0430\u0437\u0456 3 \u0434\u043E\u0434\u0430\u043C\u043E \u043A\u0440\u0430\u0443\u0434\u0441\u043E\u0440\u0441\u0438\u043D\u0433 \u2014 \u0436\u0438\u0442\u0435\u043B\u0456 \u043F\u043E\u0437\u043D\u0430\u0447\u0430\u0442\u0438\u043C\u0443\u0442\u044C \u0441\u0432\u043E\u044E \u0447\u0435\u0440\u0433\u0443,
        \u0456 \u0434\u043E\u0434\u0430\u0442\u043E\u043A \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E \u0437\u0430\u043F\u0430\u043C'\u044F\u0442\u0430\u0454 \u0432\u0443\u043B\u0438\u0446\u044E \u2192 \u0447\u0435\u0440\u0433\u0443.
      </p>
    </div>
  `;
    document.body.appendChild(wrap);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => wrap.classList.add("open"));
    function close() {
      wrap.classList.remove("open");
      document.body.classList.remove("modal-open");
      setTimeout(() => wrap.remove(), 220);
    }
    wrap.querySelector(".pw-help-backdrop")?.addEventListener("click", close);
    wrap.querySelector(".pw-help-close")?.addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onEsc);
      }
    });
  }
  function initPower() {
    fetch("./data/power.json").then((r) => r.json()).then((data) => {
      powerData = data;
      const prefs = loadPrefs2();
      if (prefs.cityId) {
        selCity = findCity(prefs.cityId);
        if (selCity && prefs.streetId) {
          selStreet = findStreetInCity(selCity, prefs.streetId);
        }
      }
      renderPowerPage();
    }).catch(() => {
      const el = document.getElementById("power-content");
      if (el)
        el.innerHTML = '<p class="pw-empty">\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 \u0434\u0430\u043D\u0456 \u26A1</p>';
    });
    window.addEventListener("online", () => {
      if (powerData)
        renderPowerPage();
    });
    window.addEventListener("offline", () => {
      if (powerData)
        renderPowerPage();
    });
  }

  // src/tabs/community-modal.js
  function openBoardModal() {
    if (document.getElementById("cm-board-modal"))
      return;
    const wrap = document.createElement("div");
    wrap.id = "cm-board-modal";
    wrap.className = "cm-board-modal";
    wrap.innerHTML = `
    <div class="cm-board-modal-backdrop"></div>
    <div class="cm-board-modal-panel" role="dialog" aria-modal="true">
      <div class="cm-board-modal-handle"></div>
      <button class="cm-board-modal-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u0438\u0442\u0438">\u2715</button>
      <h3 class="cm-board-modal-title">\u270F\uFE0F \u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</h3>
      <p class="cm-board-modal-sub">\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F, \u043F\u043E\u0434\u0456\u044F \u0430\u0431\u043E \u043D\u043E\u0432\u0438\u043D\u0430 \u2014 \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440 \u043E\u0431\u0435\u0440\u0435 \u043A\u0443\u0434\u0438 \u043E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438.</p>
      <form id="cm-board-modal-form">
        <textarea class="cm-board-input" id="cm-board-text" placeholder="\u0429\u043E \u0445\u043E\u0447\u0435\u0442\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u0438\u0442\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0456? (\u043F\u0440\u043E\u0434\u0430\u043C, \u0448\u0443\u043A\u0430\u044E, \u043F\u043E\u0434\u044F\u043A\u0430, \u043F\u043E\u0434\u0456\u044F\u2026)" rows="4" required></textarea>
        <input class="cm-board-input cm-board-input--small" id="cm-board-author" type="text" placeholder="\u0406\u043C\u02BC\u044F (\u0430\u0431\u043E \u0437\u0430\u043B\u0438\u0448\u0442\u0435 \u043F\u043E\u0440\u043E\u0436\u043D\u0456\u043C \u2014 \u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E)">
        <input class="cm-board-input cm-board-input--small" id="cm-board-contact" type="text" placeholder="\u041A\u043E\u043D\u0442\u0430\u043A\u0442: \u0442\u0435\u043B\u0435\u0444\u043E\u043D / Telegram (\u043D\u0435\u043E\u0431\u043E\u0432\u02BC\u044F\u0437\u043A\u043E\u0432\u043E)">
        <button class="cm-board-submit" type="submit">\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438 \u2192</button>
        <p class="cm-board-hint">\u0417\u0430\u043F\u0438\u0442 \u0439\u0434\u0435 \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443. \u041F\u0456\u0441\u043B\u044F \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043D\u0430 \u0434\u043E\u0448\u0446\u0456, \u0443 \u043D\u043E\u0432\u0438\u043D\u0430\u0445 \u0430\u0431\u043E \u0432 \u043F\u043E\u0434\u0456\u044F\u0445.</p>
      </form>
    </div>
  `;
    document.body.appendChild(wrap);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => wrap.classList.add("open"));
    setTimeout(() => wrap.querySelector("#cm-board-text")?.focus(), 200);
    function close() {
      wrap.classList.remove("open");
      document.body.classList.remove("modal-open");
      setTimeout(() => wrap.remove(), 220);
    }
    wrap.querySelector(".cm-board-modal-backdrop")?.addEventListener("click", close);
    wrap.querySelector(".cm-board-modal-close")?.addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onEsc);
      }
    });
    wrap.querySelector("#cm-board-modal-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = wrap.querySelector("#cm-board-text")?.value.trim();
      if (!text)
        return;
      close();
      showToast("\u0414\u044F\u043A\u0443\u0454\u043C\u043E! \u0417\u0430\u043F\u0438\u0442 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443.", 4e3);
    });
  }

  // src/tabs/board.js
  var CATEGORY_EMOJI2 = {
    "\u043F\u0440\u043E\u0434\u0430\u043C": "\u{1F4B0}",
    "\u043A\u0443\u043F\u043B\u044E": "\u{1F6D2}",
    "\u0448\u0443\u043A\u0430\u044E": "\u{1F50D}",
    "\u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E": "\u{1F381}",
    "\u0437\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C": "\u{1F61F}",
    "\u043F\u043E\u0434\u044F\u043A\u0430": "\u2764\uFE0F",
    "\u043F\u043E\u0441\u043B\u0443\u0433\u0430": "\u{1F527}",
    "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F": "\u{1F4E2}"
  };
  var PHONE_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  function renderContact(contact) {
    if (!contact)
      return "";
    const trimmed = String(contact).trim();
    const isPhone = /^[\+\d][\d\s\-\(\)]{5,}$/.test(trimmed);
    if (!isPhone) {
      return `<div class="cm-board-contact">${escapeHtml(trimmed)}</div>`;
    }
    const tel = trimmed.replace(/[^\d+]/g, "");
    return `
    <div class="cm-board-contact cm-board-contact--phone">
      <span class="cm-board-contact-num">${escapeHtml(trimmed)}</span>
      <a class="cm-board-call" href="tel:${escapeHtml(tel)}"
         onclick="event.stopPropagation()" aria-label="\u0417\u0430\u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443\u0432\u0430\u0442\u0438 ${escapeHtml(trimmed)}">
        ${PHONE_ICON_SVG}
      </a>
    </div>
  `;
  }
  async function renderBoard() {
    const el = document.getElementById("board-content");
    if (!el)
      return;
    try {
      const [boardRes, communityRes] = await Promise.all([
        fetch("./data/community-board.json"),
        fetch("./data/community.json")
      ]);
      const boardData = await boardRes.json();
      const communityData = await communityRes.json();
      const userPosts = (boardData.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const official = (communityData.announcements || []).slice().sort((a, b) => {
        if (a.pinned !== b.pinned)
          return a.pinned ? -1 : 1;
        return (b.ts || 0) - (a.ts || 0);
      });
      if (!official.length && !userPosts.length) {
        el.innerHTML = `
        <div class="board-empty">
          <p>\u041D\u0430 \u0434\u043E\u0448\u0446\u0456 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E.</p>
          <p>\u0411\u0443\u0434\u044C \u043F\u0435\u0440\u0448\u0438\u043C \u2014 \u043D\u0430\u0442\u0438\u0441\u043D\u0438 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0447\u0435.</p>
        </div>
        <button class="cm-board-trigger" id="board-trigger" type="button">
          <span class="cm-board-trigger-icon">\u270F\uFE0F</span>
          <span class="cm-board-trigger-text">\u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>
        </button>
      `;
        document.getElementById("board-trigger")?.addEventListener("click", openBoardModal);
        return;
      }
      const officialHtml = official.map((a) => {
        const tilt = a.id * 5 % 5 - 2;
        return `
        <article class="cm-board-note cm-board-note--official" style="--tilt:${tilt}deg">
          <span class="cm-board-pin cm-board-pin--gold"></span>
          <span class="cm-board-cat cm-board-cat--official">\u{1F3DB}\uFE0F \u041E\u0424\u0406\u0426\u0406\u0419\u041D\u041E</span>
          <h4 class="cm-board-official-title">${escapeHtml(a.title)}</h4>
          <p class="cm-board-text">${escapeHtml(a.body)}</p>
          <div class="cm-board-footer">
            <span class="cm-board-author">\u2014 ${escapeHtml(a.author || "\u2014")}</span>
            <span class="cm-board-time">${formatTime(a.ts)}</span>
          </div>
        </article>
      `;
      }).join("");
      const userHtml = userPosts.map((p) => {
        const tilt = p.id * 7 % 9 - 4;
        const emoji = CATEGORY_EMOJI2[p.category] || "\u{1F4CC}";
        const contactHtml = renderContact(p.contact);
        return `
        <article class="cm-board-note cm-board-note--${escapeHtml(p.color || "yellow")}" style="--tilt:${tilt}deg">
          <span class="cm-board-pin"></span>
          <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
          <p class="cm-board-text">${escapeHtml(p.text)}</p>
          <div class="cm-board-footer">
            <span class="cm-board-author">\u2014 ${escapeHtml(p.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
            <span class="cm-board-time">${formatTime(p.ts)}</span>
          </div>
          ${contactHtml}
        </article>
      `;
      }).join("");
      el.innerHTML = `
      <div class="board-backdrop" id="board-backdrop"></div>
      <div class="cm-board-corkboard board-corkboard--full">
        ${officialHtml}
        ${userHtml}
      </div>

      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button">
        <span class="cm-board-trigger-icon">\u270F\uFE0F</span>
        <span class="cm-board-trigger-text">\u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>
      </button>
    `;
      document.getElementById("board-trigger")?.addEventListener("click", openBoardModal);
      initBoardNoteExpand(el);
    } catch {
      el.innerHTML = '<div class="empty-state">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  function initBoardNoteExpand(root) {
    const backdrop = root.querySelector("#board-backdrop");
    if (!backdrop)
      return;
    let activeNote = null;
    let isAnimating = false;
    const DURATION = 320;
    const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
    const showBackdrop = () => {
      requestAnimationFrame(() => backdrop.classList.add("visible"));
    };
    const hideBackdrop = () => {
      backdrop.classList.remove("visible");
    };
    const expand = (note) => {
      if (isAnimating || activeNote)
        return;
      isAnimating = true;
      const rect = note.getBoundingClientRect();
      const origW = rect.width;
      const origH = rect.height;
      const tilt = note.style.getPropertyValue("--tilt") || "0deg";
      const placeholder = document.createElement("div");
      placeholder.className = "cm-board-placeholder";
      placeholder.style.width = `${origW}px`;
      placeholder.style.height = `${origH}px`;
      note.parentNode.insertBefore(placeholder, note);
      note._placeholder = placeholder;
      note._tilt = tilt;
      note.style.position = "fixed";
      note.style.left = `${rect.left}px`;
      note.style.top = `${rect.top}px`;
      note.style.width = `${origW}px`;
      note.style.margin = "0";
      note.style.zIndex = "210";
      note.style.transformOrigin = "center center";
      note.style.transition = "none";
      note.style.transform = `rotate(${tilt}) scale(1)`;
      note.classList.add("expanded");
      showBackdrop();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const safeT = 80;
      const safeB = 140;
      const usableH = vh - safeT - safeB;
      const targetMaxW = Math.min(vw - 32, 380);
      const scaleW = targetMaxW / origW;
      const scaleH = usableH / origH;
      const scale = Math.max(1.05, Math.min(2.4, scaleW, scaleH));
      const targetLeft = (vw - origW) / 2;
      const targetTop = (vh - origH) / 2;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          note.style.transition = `left ${DURATION}ms ${EASE}, top ${DURATION}ms ${EASE}, transform ${DURATION}ms ${EASE}, box-shadow ${DURATION}ms ease`;
          note.style.left = `${targetLeft}px`;
          note.style.top = `${targetTop}px`;
          note.style.transform = `rotate(0deg) scale(${scale})`;
        });
      });
      activeNote = note;
      setTimeout(() => {
        isAnimating = false;
      }, DURATION);
    };
    const collapse = () => {
      if (!activeNote || isAnimating)
        return;
      isAnimating = true;
      const note = activeNote;
      const placeholder = note._placeholder;
      const tilt = note._tilt || "0deg";
      if (placeholder) {
        const phRect = placeholder.getBoundingClientRect();
        note.style.left = `${phRect.left}px`;
        note.style.top = `${phRect.top}px`;
        note.style.transform = `rotate(${tilt}) scale(1)`;
      }
      hideBackdrop();
      setTimeout(() => {
        note.classList.remove("expanded");
        ["position", "left", "top", "width", "margin", "zIndex", "transform", "transition", "transformOrigin"].forEach((p) => {
          note.style[p] = "";
        });
        placeholder?.remove();
        delete note._placeholder;
        delete note._tilt;
        isAnimating = false;
        activeNote = null;
      }, DURATION);
    };
    root.querySelectorAll(".cm-board-note").forEach((note) => {
      note.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isAnimating)
          return;
        if (note === activeNote)
          collapse();
        else if (!activeNote)
          expand(note);
      });
    });
    backdrop.addEventListener("click", collapse);
  }
  function initBoard() {
    renderBoard();
  }

  // src/app.js
  var currentTab = "community";
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
    const main = document.querySelector(".app-main");
    if (main)
      main.scrollTop = 0;
    currentTab = tab;
  };
  window.closeArticleModal = function() {
    const modal = document.getElementById("article-modal");
    if (modal)
      modal.classList.remove("open");
    document.body.style.overflow = "";
    document.body.classList.remove("modal-open");
    const inner = document.querySelector(".article-modal-inner");
    if (inner) {
      inner.style.transform = "";
      inner.style.transition = "";
      inner.style.animation = "";
    }
    const metaTags = document.getElementById("modalMetaTags");
    if (metaTags)
      metaTags.innerHTML = "";
  };
  function initModalSwipe() {
    const inner = document.querySelector(".article-modal-inner");
    if (!inner)
      return;
    const handle = inner.querySelector(".modal-handle");
    let startY = 0;
    let isSwiping = false;
    let startedOnHandle = false;
    let rafId = null;
    const reset = () => {
      inner.style.transition = "";
      inner.style.transform = "";
      inner.style.animation = "";
    };
    inner.addEventListener("touchstart", (e) => {
      startedOnHandle = handle && (e.target === handle || handle.contains(e.target));
      startedAtTop = inner.scrollTop <= 2;
      const canSwipe = startedOnHandle || startedAtTop;
      if (!canSwipe) {
        startY = e.touches[0].clientY;
        isSwiping = false;
        return;
      }
      inner.style.animation = "none";
      inner.style.transition = "none";
      inner.style.transform = "translateY(0)";
      startY = e.touches[0].clientY;
      isSwiping = false;
    }, { passive: true });
    inner.addEventListener("touchmove", (e) => {
      if (!startedOnHandle)
        return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) {
        e.preventDefault();
        isSwiping = true;
        if (rafId)
          cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          inner.style.transform = `translateY(${dy}px)`;
          rafId = null;
        });
      }
    }, { passive: false });
    inner.addEventListener("touchend", (e) => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (!startedOnHandle || !isSwiping) {
        if (startedOnHandle)
          reset();
        return;
      }
      isSwiping = false;
      const dy = e.changedTouches[0].clientY - startY;
      if (dy > 80) {
        inner.style.transition = "transform 0.25s ease-in";
        inner.style.transform = "translateY(100%)";
        setTimeout(window.closeArticleModal, 240);
      } else {
        inner.style.transition = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";
        inner.style.transform = "translateY(0)";
        setTimeout(reset, 300);
      }
      startedOnHandle = false;
    });
    inner.addEventListener("touchcancel", () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      startedOnHandle = false;
      isSwiping = false;
      inner.style.transition = "transform 0.3s cubic-bezier(0.32,0.72,0,1)";
      inner.style.transform = "translateY(0)";
      setTimeout(reset, 300);
    });
  }
  function init() {
    bootApp();
    initModalSwipe();
    initWeather();
    initCommunity();
    initNews();
    initEvents();
    initBuses();
    initPower();
    initBoard();
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
