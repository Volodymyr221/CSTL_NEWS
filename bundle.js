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
      return { ...OLYKA, city: "\u041E\u043B\u0438\u043A\u0430" };
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: null }),
        () => resolve({ ...OLYKA, city: "\u041E\u043B\u0438\u043A\u0430" }),
        { timeout: 5e3, maximumAge: 6e5 }
      );
    });
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
  async function initWeather() {
    const iconEl = document.getElementById("weather-icon");
    const tempEl = document.getElementById("weather-temp");
    if (!iconEl || !tempEl)
      return;
    try {
      const { lat, lon, city: knownCity } = await getCoords();
      const [weatherRes, cityName] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`),
        knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon)
      ]);
      const data = await weatherRes.json();
      const temp = Math.round(data.current.temperature_2m);
      iconEl.textContent = codeToIcon(data.current.weather_code);
      document.getElementById("weather-city").textContent = cityName;
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

  // src/tabs/community.js
  var OLYKA2 = { lat: 50.7333, lon: 25.8167 };
  var POWER_PREFS_KEY = "power_prefs_v2";
  var BUS_PREFS_KEY = "bus_prefs_v2";
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function todayKey() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
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
  var CONTACT_COLORS = {
    emergency: "#C41E3A",
    medical: "#2E7D32",
    gov: "#1565C0",
    utility: "#B45309"
  };
  function loadPowerPrefs() {
    try {
      return JSON.parse(localStorage.getItem(POWER_PREFS_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function loadBusPrefs() {
    try {
      return JSON.parse(localStorage.getItem(BUS_PREFS_KEY) || "{}");
    } catch {
      return {};
    }
  }
  async function renderWeatherBlock() {
    const el = document.getElementById("cm-weather-content");
    if (!el)
      return;
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${OLYKA2.lat}&longitude=${OLYKA2.lon}&current=temperature_2m,weather_code,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
      );
      const data = await res.json();
      const cur = data.current;
      const day = data.daily;
      const info = weatherCodeInfo(cur.weather_code);
      const temp = Math.round(cur.temperature_2m);
      const feels = Math.round(cur.apparent_temperature);
      const wind = Math.round(cur.wind_speed_10m);
      const tMax = Math.round(day.temperature_2m_max[0]);
      const tMin = Math.round(day.temperature_2m_min[0]);
      el.innerHTML = `
      <div class="cm-weather-main">
        <div class="cm-weather-icon">${info.icon}</div>
        <div class="cm-weather-temp">${temp}\xB0</div>
        <div class="cm-weather-text">
          <div class="cm-weather-desc">${escapeHtml(info.text)}</div>
          <div class="cm-weather-feels">\u0412\u0456\u0434\u0447\u0443\u0432\u0430\u0454\u0442\u044C\u0441\u044F \u044F\u043A ${feels}\xB0</div>
        </div>
      </div>
      <div class="cm-weather-extra">
        <span>\u2191 ${tMax}\xB0</span>
        <span>\u2193 ${tMin}\xB0</span>
        <span>\u{1F4A8} ${wind} \u043A\u043C/\u0433\u043E\u0434</span>
      </div>
    `;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u0433\u043E\u0434\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  async function renderPowerBlock() {
    const el = document.getElementById("cm-power-content");
    if (!el)
      return;
    const prefs = loadPowerPrefs();
    if (!prefs.cityId || !prefs.streetId) {
      el.innerHTML = `
      <div class="cm-block-empty">
        \u041D\u0430\u043B\u0430\u0448\u0442\u0443\u0439\u0442\u0435 \u0432\u0430\u0448\u0443 \u0432\u0443\u043B\u0438\u0446\u044E \u0443 \u0432\u043A\u043B\u0430\u0434\u0446\u0456 \xAB\u0421\u0432\u0456\u0442\u043B\u043E\xBB
        <button class="cm-block-cta" onclick="switchTab('power')">\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u2192</button>
      </div>`;
      return;
    }
    try {
      const res = await fetch("./data/power.json");
      const data = await res.json();
      const city = data.cities.find((c) => c.id === prefs.cityId);
      const street = city?.streets.find((s) => s.id === prefs.streetId);
      const queue = street ? data.queues.find((q) => q.id === street.queue_id) : null;
      if (!queue) {
        el.innerHTML = '<div class="cm-block-empty">\u0414\u0430\u043D\u0456 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E \u2014 \u043E\u043D\u043E\u0432\u0456\u0442\u044C \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F</div>';
        return;
      }
      const schedule = queue.schedule[todayKey()] || queue.schedule[Object.keys(queue.schedule)[0]];
      if (!schedule) {
        el.innerHTML = '<div class="cm-block-empty">\u0413\u0440\u0430\u0444\u0456\u043A \u043D\u0430 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456\u0439</div>';
        return;
      }
      const curH = (/* @__PURE__ */ new Date()).getHours();
      const cur = schedule[curH];
      let nextH = null;
      for (let h = curH + 1; h < 24; h++) {
        if (schedule[h] !== cur) {
          nextH = h;
          break;
        }
      }
      const statusText = cur === 1 ? "\u0404 \u0441\u0432\u0456\u0442\u043B\u043E" : cur === 0 ? "\u041D\u0435\u043C\u0430\u0454 \u0441\u0432\u0456\u0442\u043B\u0430" : "\u041C\u043E\u0436\u043B\u0438\u0432\u0456 \u043F\u0435\u0440\u0435\u0431\u043E\u0457";
      const statusCls = cur === 1 ? "on" : cur === 0 ? "off" : "maybe";
      const statusDot = cur === 1 ? "\u{1F7E2}" : cur === 0 ? "\u{1F534}" : "\u{1F7E1}";
      const nextLabel = nextH !== null ? cur === 1 ? `\u0412\u0438\u043C\u043A\u043D\u0443\u0442\u044C \u043E ${pad(nextH)}:00` : cur === 0 ? `\u0423\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u044C \u043E ${pad(nextH)}:00` : `\u0417\u043C\u0456\u043D\u0430 \u043E ${pad(nextH)}:00` : "\u0414\u043E \u043A\u0456\u043D\u0446\u044F \u0434\u043E\u0431\u0438 \u0431\u0435\u0437 \u0437\u043C\u0456\u043D";
      const locLabel = city.streets.length === 1 ? city.name : `${city.name} \xB7 ${street.name}`;
      el.innerHTML = `
      <div class="cm-power-status cm-power-${statusCls}">
        <span class="cm-power-dot">${statusDot}</span>
        <div class="cm-power-text">
          <div class="cm-power-main">${escapeHtml(statusText)}</div>
          <div class="cm-power-next">${escapeHtml(nextLabel)}</div>
        </div>
      </div>
      <div class="cm-power-loc">${escapeHtml(locLabel)} \xB7 ${escapeHtml(queue.name)}</div>
    `;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u0414\u0430\u043D\u0456 \u043F\u0440\u043E \u0441\u0432\u0456\u0442\u043B\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
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
  async function renderAnnouncementsBlock() {
    const el = document.getElementById("cm-announcements-content");
    if (!el)
      return;
    try {
      const res = await fetch("./data/community.json");
      const data = await res.json();
      const list = (data.announcements || []).slice().sort((a, b) => {
        if (a.pinned !== b.pinned)
          return a.pinned ? -1 : 1;
        return (b.ts || 0) - (a.ts || 0);
      });
      if (!list.length) {
        el.innerHTML = '<div class="cm-block-empty">\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
        return;
      }
      el.innerHTML = list.map((a) => `
      <article class="cm-ann-card${a.pinned ? " pinned" : ""}">
        ${a.pinned ? '<span class="cm-ann-pin">\u{1F4CC} \u0417\u0430\u043A\u0440\u0456\u043F\u043B\u0435\u043D\u043E</span>' : ""}
        <h4 class="cm-ann-title">${escapeHtml(a.title)}</h4>
        <p class="cm-ann-body">${escapeHtml(a.body)}</p>
        <div class="cm-ann-footer">
          <span>${escapeHtml(a.author || "\u2014")}</span>
          <span>${formatTime(a.ts)}</span>
        </div>
      </article>
    `).join("");
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
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
      const res = await fetch("./data/community-board.json");
      const data = await res.json();
      const posts = (data.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (!posts.length) {
        el.innerHTML = '<div class="cm-block-empty">\u041D\u0430 \u0434\u043E\u0448\u0446\u0456 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E. \u0411\u0443\u0434\u044C \u043F\u0435\u0440\u0448\u0438\u043C \u2014 \u043D\u0430\u043F\u0438\u0448\u0438 \u043D\u0438\u0436\u0447\u0435.</div>';
        return;
      }
      el.innerHTML = `
      <div class="cm-board-corkboard">
        ${posts.map((p, i) => {
        const tilt = p.id * 7 % 9 - 4;
        const emoji = CATEGORY_EMOJI[p.category] || "\u{1F4CC}";
        const contactHtml = p.contact ? `<div class="cm-board-contact">${escapeHtml(p.contact)}</div>` : "";
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
      }).join("")}
      </div>

      <form class="cm-board-form" id="cm-board-form">
        <h4 class="cm-board-form-title">\u270F\uFE0F \u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F, \u043F\u043E\u0434\u0456\u044E \u0430\u0431\u043E \u043D\u043E\u0432\u0438\u043D\u0443</h4>
        <textarea class="cm-board-input" id="cm-board-text" placeholder="\u0429\u043E \u0445\u043E\u0447\u0435\u0442\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u0438\u0442\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0456? (\u043F\u0440\u043E\u0434\u0430\u043C, \u0448\u0443\u043A\u0430\u044E, \u043F\u043E\u0434\u044F\u043A\u0430, \u043F\u043E\u0434\u0456\u044F\u2026)" rows="3" required></textarea>
        <div class="cm-board-row">
          <input class="cm-board-input cm-board-input--small" id="cm-board-author" type="text" placeholder="\u0406\u043C'\u044F (\u0430\u0431\u043E \u0437\u0430\u043B\u0438\u0448\u0456\u0442\u044C \u043F\u043E\u0440\u043E\u0436\u043D\u0456\u043C \u2014 \u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E)">
        </div>
        <div class="cm-board-row">
          <input class="cm-board-input cm-board-input--small" id="cm-board-contact" type="text" placeholder="\u041A\u043E\u043D\u0442\u0430\u043A\u0442: \u0442\u0435\u043B\u0435\u0444\u043E\u043D / Telegram (\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)">
        </div>
        <button class="cm-board-submit" type="submit">\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438 \u2192</button>
        <p class="cm-board-hint">\u0417\u0430\u043F\u0438\u0442 \u0439\u0434\u0435 \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443. \u041F\u0456\u0441\u043B\u044F \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043D\u0430 \u0434\u043E\u0448\u0446\u0456, \u0443 \u043D\u043E\u0432\u0438\u043D\u0430\u0445 \u0430\u0431\u043E \u0432 \u043F\u043E\u0434\u0456\u044F\u0445.</p>
      </form>
    `;
      document.getElementById("cm-board-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = document.getElementById("cm-board-text")?.value.trim();
        if (!text)
          return;
        console.log("[community-board] pending submission:", {
          text,
          author: document.getElementById("cm-board-author")?.value.trim() || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E",
          contact: document.getElementById("cm-board-contact")?.value.trim() || null
        });
        showToast("\u0414\u044F\u043A\u0443\u0454\u043C\u043E! \u0417\u0430\u043F\u0438\u0442 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443. \u041F\u043E\u043A\u0438 \u0449\u043E \u043C\u043E\u0434\u0435\u0440\u0430\u0446\u0456\u044F \u0449\u0435 \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u2014 \u0444\u0443\u043D\u043A\u0446\u0456\u044F \u0437\u0430\u043F\u0440\u0430\u0446\u044E\u0454 \u043F\u0456\u0441\u043B\u044F Supabase.", 5e3);
      });
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  async function renderNewsBlock() {
    const el = document.getElementById("cm-news-content");
    if (!el)
      return;
    try {
      const res = await fetch("./data/articles.json");
      const articles = await res.json();
      const sorted = articles.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 3);
      if (!sorted.length) {
        el.innerHTML = '<div class="cm-block-empty">\u041D\u043E\u0432\u0438\u043D \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
        return;
      }
      el.innerHTML = sorted.map((a) => `
      <article class="cm-news-row" onclick="switchTab('news'); setTimeout(() => window.openArticle && window.openArticle(${a.id}), 250);">
        ${a.image ? `<img class="cm-news-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : '<div class="cm-news-img cm-news-img--placeholder"></div>'}
        <div class="cm-news-body">
          <div class="cm-news-meta">${escapeHtml(a.geo)} \xB7 ${escapeHtml(a.category)}</div>
          <h4 class="cm-news-title">${escapeHtml(a.title)}</h4>
          <div class="cm-news-footer">${escapeHtml(a.source)} \xB7 ${formatTime(a.ts)}</div>
        </div>
      </article>
    `).join("");
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041D\u043E\u0432\u0438\u043D\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
    }
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
      const next = events.filter((e) => /* @__PURE__ */ new Date(e.date + "T00:00:00") >= today).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      if (!next) {
        el.innerHTML = '<div class="cm-block-empty">\u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0438\u0445 \u043F\u043E\u0434\u0456\u0439 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
        return;
      }
      const d = /* @__PURE__ */ new Date(next.date + "T00:00:00");
      const months = ["\u0441\u0456\u0447\u043D\u044F", "\u043B\u044E\u0442\u043E\u0433\u043E", "\u0431\u0435\u0440\u0435\u0437\u043D\u044F", "\u043A\u0432\u0456\u0442\u043D\u044F", "\u0442\u0440\u0430\u0432\u043D\u044F", "\u0447\u0435\u0440\u0432\u043D\u044F", "\u043B\u0438\u043F\u043D\u044F", "\u0441\u0435\u0440\u043F\u043D\u044F", "\u0432\u0435\u0440\u0435\u0441\u043D\u044F", "\u0436\u043E\u0432\u0442\u043D\u044F", "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430", "\u0433\u0440\u0443\u0434\u043D\u044F"];
      const dateStr = `${d.getDate()} ${months[d.getMonth()]}`;
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
      el.innerHTML = list.map((c) => {
        const icon = CONTACT_ICONS[c.icon] || CONTACT_ICONS.default;
        const color = CONTACT_COLORS[c.category] || "#666";
        const tel = c.phone.replace(/[^\d+]/g, "");
        return `
        <a class="cm-contact-card" href="tel:${escapeHtml(tel)}" style="--accent:${color}">
          <span class="cm-contact-icon">${icon}</span>
          <span class="cm-contact-name">${escapeHtml(c.name)}</span>
          <span class="cm-contact-phone">${escapeHtml(c.phone)}</span>
        </a>
      `;
      }).join("");
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
    }
  }
  function renderSkeleton() {
    const el = document.getElementById("cm-content");
    if (!el)
      return;
    el.innerHTML = `
    <section class="cm-block cm-block--weather">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041F\u043E\u0433\u043E\u0434\u0430 \u0432 \u041E\u043B\u0438\u0446\u0456</h3>
      </header>
      <div id="cm-weather-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--power">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u0421\u0432\u0456\u0442\u043B\u043E \u0437\u0430\u0440\u0430\u0437</h3>
        <button class="cm-block-link" onclick="switchTab('power')">\u0413\u0440\u0430\u0444\u0456\u043A \u2192</button>
      </header>
      <div id="cm-power-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--bus">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 \u0430\u0432\u0442\u043E\u0431\u0443\u0441</h3>
        <button class="cm-block-link" onclick="switchTab('buses')">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u2192</button>
      </header>
      <div id="cm-bus-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--announcements">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h3>
      </header>
      <div id="cm-announcements-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--board">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u{1F4CC} \u0414\u043E\u0448\u043A\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h3>
      </header>
      <div id="cm-board-content" class="cm-board-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--news">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041E\u0441\u0442\u0430\u043D\u043D\u0456 \u043D\u043E\u0432\u0438\u043D\u0438</h3>
        <button class="cm-block-link" onclick="switchTab('news')">\u0423\u0441\u0456 \u2192</button>
      </header>
      <div id="cm-news-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0430 \u043F\u043E\u0434\u0456\u044F</h3>
        <button class="cm-block-link" onclick="switchTab('events')">\u0410\u0444\u0456\u0448\u0430 \u2192</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041A\u043E\u0440\u0438\u0441\u043D\u0456 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0438</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-grid cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>
  `;
  }
  function initCommunity() {
    renderSkeleton();
    renderWeatherBlock();
    renderPowerBlock();
    renderBusBlock();
    renderAnnouncementsBlock();
    renderBoardBlock();
    renderNewsBlock();
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
    const pad3 = (n) => String(n).padStart(2, "0");
    const start = /* @__PURE__ */ new Date(ev.date + "T" + (ev.time || "09:00") + ":00");
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1e3);
    const fmt = (d) => `${d.getFullYear()}${pad3(d.getMonth() + 1)}${pad3(d.getDate())}T${pad3(d.getHours())}${pad3(d.getMinutes())}00`;
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
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function todayKey2() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
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
    const key = todayKey2();
    return queue.schedule[key] || queue.schedule[Object.keys(queue.schedule)[0]] || null;
  }
  function generateICS(street, queue) {
    const schedule = getTodaySchedule(queue.id);
    if (!schedule)
      return;
    const d = /* @__PURE__ */ new Date();
    const ymd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    const events = [];
    let i = 0;
    while (i < 24) {
      if (schedule[i] === 0) {
        const start = i;
        while (i < 24 && schedule[i] === 0)
          i++;
        events.push(
          `BEGIN:VEVENT\r
DTSTART:${ymd}T${pad2(start)}0000\r
DTEND:${ymd}T${pad2(i)}0000\r
SUMMARY:\u26A1 \u0412\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u2014 ${escapeHtml(street.name)}\r
DESCRIPTION:${escapeHtml(queue.name)} \xB7 CSTL NEWS \u041E\u043B\u0438\u0446\u044C\u043A\u0430 \u041E\u0422\u0413\r
END:VEVENT`
        );
      } else {
        i++;
      }
    }
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CSTL NEWS//Power Schedule//UK",
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
  function renderTimeline(queue) {
    const schedule = getTodaySchedule(queue.id);
    if (!schedule)
      return '<p class="pw-empty">\u0414\u0430\u043D\u0456 \u043D\u0430 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456 \u0432\u0456\u0434\u0441\u0443\u0442\u043D\u0456</p>';
    const now = /* @__PURE__ */ new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const rows = schedule.map((status, hour) => {
      const isPast = hour < curH;
      const isCurrent = hour === curH;
      const blockCls = status === 1 ? "pw-block--on" : status === 0 ? "pw-block--off" : "pw-block--maybe";
      const label = status === 1 ? "\u0404" : status === 0 ? "\u041D\u0435\u043C\u0430\u0454" : "?";
      const nowMarker = isCurrent ? `
      <div class="pw-now-marker" id="pw-now-marker">
        <div class="pw-now-dot"></div>
        <span class="pw-now-label">\u0417\u0410\u0420\u0410\u0417 ${pad2(curH)}:${pad2(curM)}</span>
        <div class="pw-now-line-right"></div>
      </div>` : "";
      return `
      ${nowMarker}
      <div class="pw-row${isPast ? " pw-row--past" : ""}${isCurrent ? " pw-row--current" : ""}">
        <span class="pw-time">${pad2(hour)}:00</span>
        <div class="pw-block ${blockCls}">
          <span class="pw-block-label">${label}</span>
        </div>
      </div>`;
    }).join("");
    const dateStr = now.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
    return `
    <div class="pw-timeline">
      <div class="pw-timeline-date">\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456, ${dateStr}</div>
      ${rows}
    </div>`;
  }
  function renderPowerPage() {
    const container = document.getElementById("power-content");
    if (!container || !powerData)
      return;
    const upd = new Date(powerData._meta.last_updated);
    const updStr = `${pad2(upd.getHours())}:${pad2(upd.getMinutes())}`;
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
    const curH = (/* @__PURE__ */ new Date()).getHours();
    const curStatus = schedule ? schedule[curH] : null;
    let nextH = null;
    if (schedule) {
      for (let h = curH + 1; h < 24; h++) {
        if (schedule[h] !== curStatus) {
          nextH = h;
          break;
        }
      }
    }
    const statusText = curStatus === 1 ? "\u{1F7E2} \u0417\u0430\u0440\u0430\u0437 \u0454 \u0441\u0432\u0456\u0442\u043B\u043E" : curStatus === 0 ? "\u{1F534} \u0417\u0430\u0440\u0430\u0437 \u043D\u0435\u043C\u0430\u0454 \u0441\u0432\u0456\u0442\u043B\u0430" : "\u{1F7E1} \u041C\u043E\u0436\u043B\u0438\u0432\u0456 \u043F\u0435\u0440\u0435\u0431\u043E\u0457";
    const statusCls = curStatus === 1 ? "pw-status--on" : curStatus === 0 ? "pw-status--off" : "pw-status--maybe";
    const nextTxt = nextH !== null ? ` \xB7 \u0434\u043E ${pad2(nextH)}:00` : "";
    const locationLabel = selCity.streets.length === 1 ? escapeHtml(selCity.name) : `${escapeHtml(selCity.name)} \xB7 ${escapeHtml(selStreet.name)}`;
    container.innerHTML = `
    ${offlineBanner}

    <div class="pw-top-bar">
      <button class="pw-street-btn-top" id="pw-change-location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-loc"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span>${locationLabel}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-chev"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <span class="pw-queue-badge">${escapeHtml(queue.name)}</span>
    </div>

    <div class="pw-status-card ${statusCls}">
      <div class="pw-status-main">${statusText}${nextTxt}</div>
      <div class="pw-status-upd">\u0414\u0430\u043D\u0456 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0456 \u043D\u0430 ${updStr}</div>
    </div>

    ${renderTimeline(queue)}

    <div class="pw-actions">
      <button class="pw-ics-btn" id="pw-ics-btn">\u{1F4C5} \u0414\u043E\u0434\u0430\u0442\u0438 \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440</button>
    </div>

    <div class="pw-footer-note">
      \u0414\u0436\u0435\u0440\u0435\u043B\u043E: ${escapeHtml(powerData._meta.source)}<br>
      <span class="pw-demo-note">\u26A0\uFE0F DEMO-\u0434\u0430\u043D\u0456 \u2014 \u043E\u043D\u043E\u0432\u0456\u0442\u044C \u0443 data/power.json</span>
    </div>
  `;
    document.getElementById("pw-change-location")?.addEventListener("click", () => {
      selCity = null;
      selStreet = null;
      savePrefs2();
      renderPowerPage();
    });
    document.getElementById("pw-ics-btn")?.addEventListener("click", () => {
      generateICS(selStreet, queue);
    });
    setTimeout(() => {
      document.getElementById("pw-now-marker")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
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
