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
  function formatTime(value) {
    if (!value)
      return "\u043D\u0435\u0434\u0430\u0432\u043D\u043E";
    const ts = typeof value === "string" ? new Date(value).getTime() : value;
    if (!ts || isNaN(ts))
      return "\u043D\u0435\u0434\u0430\u0432\u043D\u043E";
    const diff = Date.now() - ts;
    if (diff < 6e4)
      return "\u0449\u043E\u0439\u043D\u043E";
    if (diff < 36e5)
      return Math.floor(diff / 6e4) + " \u0445\u0432 \u0442\u043E\u043C\u0443";
    if (diff < 864e5)
      return Math.floor(diff / 36e5) + " \u0433\u043E\u0434 \u0442\u043E\u043C\u0443";
    return new Date(ts).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  }
  function postTime(p) {
    if (!p)
      return null;
    return p.ts || p.published_at || p.created_at || null;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  function attachSwipe(el, onLeft, onRight) {
    let startX = null, startY = null;
    el.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (startX == null)
        return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && onLeft)
          onLeft();
        if (dx > 0 && onRight)
          onRight();
      }
    }, { passive: true });
  }
  async function sharePost({ title, text, url }) {
    const shareData = {
      title: title || "CSTL LIFE",
      text: text || "",
      url: url || location.href
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (err) {
        if (err && err.name === "AbortError")
          return false;
      }
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      showToast("\u0421\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F", 2500);
      return true;
    } catch {
      showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0456\u043B\u0438\u0442\u0438\u0441\u044C", 2500);
      return false;
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

  // src/core/supabase.js
  var SUPABASE_URL = "https://uabyfecseqnemvcqhdem.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_sbV0XNktCiTK0iA4659P9g_Y3sT0mDv";
  var supa = null;
  if (typeof window !== "undefined" && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
      // на основному сайті auth не потрібна — тільки публічне читання + INSERT pending
    });
  }
  function isSupabaseReady() {
    return supa !== null;
  }
  async function fetchPublishedPosts() {
    if (!supa)
      return null;
    const { data, error } = await supa.from("posts").select("*").eq("status", "published").order("published_at", { ascending: false, nullsLast: true }).limit(200);
    if (error) {
      console.warn("[supabase] fetchPublishedPosts error:", error.message);
      return null;
    }
    return data;
  }
  async function submitPost(payload) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const row = { ...payload, status: "pending" };
    const { error } = await supa.from("posts").insert(row);
    if (error) {
      console.warn("[supabase] submitPost error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }
  async function fetchPublishedAnnouncements() {
    if (!supa)
      return null;
    const { data, error } = await supa.from("announcements").select("*").eq("status", "published").order("pinned", { ascending: false }).order("published_at", { ascending: false, nullsLast: true }).limit(50);
    if (error) {
      console.warn("[supabase] fetchPublishedAnnouncements error:", error.message);
      return null;
    }
    return data;
  }
  var ANON_ID_KEY = "cstl-anon-id";
  function getAnonId() {
    try {
      let id = localStorage.getItem(ANON_ID_KEY);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : "anon-" + Math.random().toString(36).slice(2) + "-" + Date.now();
        localStorage.setItem(ANON_ID_KEY, id);
      }
      return id;
    } catch {
      return "anon-fallback";
    }
  }
  async function fetchAllReactions(anonId) {
    if (!supa)
      return /* @__PURE__ */ new Map();
    const { data, error } = await supa.from("reactions").select("post_id, user_id, emoji");
    if (error) {
      console.warn("[supabase] fetchAllReactions error:", error.message);
      return /* @__PURE__ */ new Map();
    }
    const map = /* @__PURE__ */ new Map();
    for (const r of data || []) {
      if (!map.has(r.post_id))
        map.set(r.post_id, { counts: {}, my: null });
      const e = map.get(r.post_id);
      e.counts[r.emoji] = (e.counts[r.emoji] || 0) + 1;
      if (r.user_id === anonId)
        e.my = r.emoji;
    }
    return map;
  }
  async function setReaction(postId, anonId, emoji) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    if (emoji == null) {
      const { error: error2 } = await supa.from("reactions").delete().eq("post_id", postId).eq("user_id", anonId);
      if (error2)
        return { ok: false, error: error2.message };
      return { ok: true };
    }
    const { error } = await supa.from("reactions").upsert({ post_id: postId, user_id: anonId, emoji }, { onConflict: "post_id,user_id" });
    if (error)
      return { ok: false, error: error.message };
    return { ok: true };
  }
  async function fetchAllComments() {
    if (!supa)
      return /* @__PURE__ */ new Map();
    const { data, error } = await supa.from("comments").select("id, post_id, author, text, created_at").order("created_at", { ascending: true });
    if (error) {
      console.warn("[supabase] fetchAllComments error:", error.message);
      return /* @__PURE__ */ new Map();
    }
    const map = /* @__PURE__ */ new Map();
    for (const c of data || []) {
      if (!map.has(c.post_id))
        map.set(c.post_id, []);
      map.get(c.post_id).push(c);
    }
    return map;
  }
  async function addComment(postId, author, text) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const { data, error } = await supa.from("comments").insert({ post_id: postId, author: author || null, text }).select().single();
    if (error)
      return { ok: false, error: error.message };
    return { ok: true, comment: data };
  }
  async function uploadPhotoToStorage(blob) {
    if (!supa)
      return { url: null, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    if (!blob)
      return { url: null, error: "\u041F\u043E\u0440\u043E\u0436\u043D\u0456\u0439 blob" };
    const ext = blob.type && blob.type.split("/")[1] || "jpg";
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${getAnonId()}/${Date.now()}-${rand}.${ext}`;
    const { error: uploadError } = await supa.storage.from("community-photos").upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      cacheControl: "31536000",
      // 1 рік — фото незмінне
      upsert: false
    });
    if (uploadError) {
      console.warn("[supabase] uploadPhotoToStorage error:", uploadError.message);
      return { url: null, error: uploadError.message };
    }
    const { data } = supa.storage.from("community-photos").getPublicUrl(path);
    return { url: data?.publicUrl || null, error: null };
  }
  async function savePushSubscription(payload) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    const { error } = await supa.from("push_subscriptions").insert(payload);
    if (error) {
      if (error.code === "23505")
        return { ok: true };
      console.warn("[supabase] savePushSubscription:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }
  async function deletePushSubscription(endpoint, routeId, trackDate) {
    if (!supa)
      return;
    const { error } = await supa.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("route_id", routeId).eq("track_date", trackDate);
    if (error)
      console.warn("[supabase] deletePushSubscription:", error.message);
  }
  function subscribeReactions(onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel("reactions-watch").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reactions" },
      (payload) => onChange(payload)
    ).subscribe();
    return () => supa.removeChannel(ch);
  }
  function subscribeComments(onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel("comments-watch").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "comments" },
      (payload) => onChange(payload)
    ).subscribe();
    return () => supa.removeChannel(ch);
  }

  // src/tabs/community-modal.js
  var TYPE_TABS = [
    { id: "board", emoji: "\u{1F6D2}", label: "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F" },
    { id: "chat", emoji: "\u{1F4AC}", label: "\u0420\u043E\u0437\u043C\u043E\u0432\u0430" },
    { id: "greeting", emoji: "\u{1F389}", label: "\u0412\u0456\u0442\u0430\u043D\u043D\u044F" }
  ];
  var BOARD_CATEGORIES = [
    { id: "\u043F\u0440\u043E\u0434\u0430\u043C", emoji: "\u{1F4B0}", color: "yellow" },
    { id: "\u043A\u0443\u043F\u043B\u044E", emoji: "\u{1F6D2}", color: "green" },
    { id: "\u0448\u0443\u043A\u0430\u044E", emoji: "\u{1F50D}", color: "blue" },
    { id: "\u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E", emoji: "\u{1F381}", color: "yellow" },
    { id: "\u0437\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C", emoji: "\u{1F61F}", color: "pink" },
    { id: "\u043F\u043E\u0434\u044F\u043A\u0430", emoji: "\u2764\uFE0F", color: "white" },
    { id: "\u043F\u043E\u0441\u043B\u0443\u0433\u0430", emoji: "\u{1F527}", color: "blue" },
    { id: "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", emoji: "\u{1F4E2}", color: "pink" }
  ];
  var GREETING_PRESETS = [
    { emoji: "\u{1F382}", gradient: "linear-gradient(135deg, #FFD1DC 0%, #FFB6C1 100%)", label: "\u0414\u0435\u043D\u044C \u043D\u0430\u0440\u043E\u0434\u0436\u0435\u043D\u043D\u044F" },
    { emoji: "\u{1F476}", gradient: "linear-gradient(135deg, #B5E2FA 0%, #87CEEB 100%)", label: "\u041D\u043E\u0432\u043E\u043D\u0430\u0440\u043E\u0434\u0436\u0435\u043D\u0438\u0439" },
    { emoji: "\u{1F48D}", gradient: "linear-gradient(135deg, #FFF9E6 0%, #FFECB3 100%)", label: "\u0412\u0435\u0441\u0456\u043B\u043B\u044F" },
    { emoji: "\u{1F393}", gradient: "linear-gradient(135deg, #E1BEE7 0%, #BA68C8 100%)", label: "\u0412\u0438\u043F\u0443\u0441\u043A" },
    { emoji: "\u2764\uFE0F", gradient: "linear-gradient(135deg, #FFB6C1 0%, #FF9494 100%)", label: "\u041F\u043E\u0434\u044F\u043A\u0430" },
    { emoji: "\u{1F333}", gradient: "linear-gradient(135deg, #C5E1A5 0%, #8BC34A 100%)", label: "\u041F\u0440\u0438\u0440\u043E\u0434\u0430" },
    { emoji: "\u{1F389}", gradient: "linear-gradient(135deg, #FFE0B2 0%, #FFB74D 100%)", label: "\u0421\u0432\u044F\u0442\u043E" },
    { emoji: "\u{1F54A}\uFE0F", gradient: "linear-gradient(135deg, #E0E0E0 0%, #BDBDBD 100%)", label: "\u041F\u0430\u043C\u02BC\u044F\u0442\u044C" }
  ];
  function isPhone(s) {
    return /^[\+\d][\d\s\-\(\)]{5,}$/.test(String(s || "").trim());
  }
  function parseTags(str) {
    return String(str || "").split(/\s+/).map((s) => s.trim()).filter(Boolean).map((s) => s.startsWith("#") ? s : "#" + s);
  }
  function compressImage(file) {
    return new Promise(function executor(resolve, reject) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 800;
          let w = img.width, h = img.height;
          if (w > h && w > maxDim) {
            h = h * maxDim / w;
            w = maxDim;
          } else if (h > maxDim) {
            w = w * maxDim / h;
            h = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w);
          canvas.height = Math.round(h);
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
            "image/jpeg",
            0.78
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function openBoardModal() {
    if (document.getElementById("cm-board-modal"))
      return;
    const state = {
      type: "board",
      // SPILNI
      text: "",
      photos: [],
      // URL-и фото: blob: під час upload, https: після
      uploadingCount: 0,
      // скільки фото зараз заливаються у Storage — блокує submit
      author: "",
      // BOARD
      category: "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F",
      contact: "",
      // CHAT
      tagsRaw: "",
      // GREETING
      title: "",
      greetingIdx: 0
    };
    const wrap = document.createElement("div");
    wrap.id = "cm-board-modal";
    wrap.className = "cm-board-modal";
    wrap.innerHTML = `
    <div class="cm-board-modal-backdrop"></div>
    <div class="cm-board-modal-panel" role="dialog" aria-modal="true">
      <div class="cm-board-modal-handle"></div>
      <button class="cm-board-modal-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u0438\u0442\u0438">\u2715</button>
      <h3 class="cm-board-modal-title">\u270F\uFE0F \u041D\u043E\u0432\u0438\u0439 \u043F\u043E\u0441\u0442</h3>
      <p class="cm-board-modal-sub">\u041E\u0431\u0435\u0440\u0456\u0442\u044C \u0442\u0438\u043F \u0456 \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u043F\u043E\u043B\u044F.</p>

      <form id="cm-board-modal-form" novalidate>
        <!-- \u041F\u0435\u0440\u0435\u043C\u0438\u043A\u0430\u0447 \u0442\u0438\u043F\u0443 (3 \u0442\u0430\u0431\u0438) -->
        <div class="bm-type-tabs" id="bm-type-tabs">
          ${TYPE_TABS.map((t) => `
            <button type="button" class="bm-type-tab${t.id === state.type ? " active" : ""}" data-type="${t.id}">
              <span class="bm-type-emoji">${t.emoji}</span>
              <span class="bm-type-label">${t.label}</span>
            </button>
          `).join("")}
        </div>

        <!-- \u0414\u0438\u043D\u0430\u043C\u0456\u0447\u043D\u0430 \u0447\u0430\u0441\u0442\u0438\u043D\u0430 \u2014 \u0437\u043C\u0456\u043D\u044E\u0454\u0442\u044C\u0441\u044F \u043F\u0456\u0434 \u0442\u0438\u043F -->
        <div id="bm-dynamic"></div>

        <!-- LIVE-preview -->
        <div class="bm-preview-section" id="bm-preview-section">
          <div class="bm-preview-label">\u042F\u043A \u0432\u0438\u0433\u043B\u044F\u0434\u0430\u0442\u0438\u043C\u0435 \u043D\u0430 \u0434\u043E\u0448\u0446\u0456</div>
          <div class="bm-preview-canvas" id="bm-preview-canvas"></div>
        </div>

        <button class="cm-board-submit" type="submit">\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438</button>
        <p class="cm-board-hint">\u0417\u0430\u043F\u0438\u0442 \u0439\u0434\u0435 \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443. \u041F\u0456\u0441\u043B\u044F \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0438 \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043D\u0430 \u0434\u043E\u0448\u0446\u0456.</p>
      </form>
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
    wrap.querySelector(".cm-board-modal-backdrop")?.addEventListener("click", close);
    wrap.querySelector(".cm-board-modal-close")?.addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onEsc);
      }
    });
    wrap.querySelectorAll(".bm-type-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.type === btn.dataset.type)
          return;
        wrap.querySelectorAll(".bm-type-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.type = btn.dataset.type;
        renderDynamic();
        renderPreview();
      });
    });
    const dynamicEl = wrap.querySelector("#bm-dynamic");
    function renderDynamic() {
      if (state.type === "board")
        return renderBoardFields();
      if (state.type === "chat")
        return renderChatFields();
      if (state.type === "greeting")
        return renderGreetingFields();
    }
    function renderBoardFields() {
      dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label">\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F</label>
        <div class="bm-chips" id="bm-chips">
          ${BOARD_CATEGORIES.map((c) => `
            <button type="button" class="bm-chip${c.id === state.category ? " active" : ""}" data-cat="${c.id}">
              <span class="bm-chip-emoji">${c.emoji}</span>
              <span class="bm-chip-label">${c.id}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-text">\u041E\u043F\u0438\u0441</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="\u0429\u043E \u0445\u043E\u0447\u0435\u0442\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u0438\u0442\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0456?" required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label">\u0424\u043E\u0442\u043E <span class="bm-label-hint">(\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E, \u0434\u043E 3)</span></label>
        ${photoSlotsHtml()}
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-contact">\u041A\u043E\u043D\u0442\u0430\u043A\u0442 <span class="bm-label-hint">(\u0442\u0435\u043B\u0435\u0444\u043E\u043D / Telegram)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-contact" type="text" placeholder="+38 050 ___ __ __" inputmode="tel" value="${escapeHtml(state.contact)}">
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-author">\u0406\u043C'\u044F <span class="bm-label-hint">(\u043F\u043E\u0440\u043E\u0436\u043D\u0454 \u2014 \u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="\u0412\u0430\u0448\u0435 \u0456\u043C'\u044F" value="${escapeHtml(state.author)}">
      </div>
    `;
      bindCommonFields();
      dynamicEl.querySelectorAll(".bm-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          dynamicEl.querySelectorAll(".bm-chip").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          state.category = btn.dataset.cat;
          renderPreview();
        });
      });
      dynamicEl.querySelector("#bm-contact")?.addEventListener("input", (e) => {
        state.contact = e.target.value;
        renderPreview();
      });
      bindPhotoSlots();
    }
    function renderChatFields() {
      dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label" for="bm-text">\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="\u0425\u043E\u0447\u0443 \u0441\u043F\u0438\u0442\u0430\u0442\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0443..." required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-tags">\u0422\u0435\u043C\u0438 <span class="bm-label-hint">(\u0447\u0435\u0440\u0435\u0437 \u043F\u0440\u043E\u0431\u0456\u043B, \u043D\u0430\u043F\u0440. #\u0433\u0440\u043E\u043C\u0430\u0434\u0430 #\u0434\u043E\u0440\u043E\u0433\u0438)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-tags" type="text" placeholder="#\u0433\u0440\u043E\u043C\u0430\u0434\u0430 #\u0434\u043E\u0440\u043E\u0433\u0438" value="${escapeHtml(state.tagsRaw)}">
      </div>

      <div class="bm-section">
        <label class="bm-label">\u0424\u043E\u0442\u043E <span class="bm-label-hint">(\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E, 1)</span></label>
        ${photoSlotsHtml(1)}
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-author">\u0406\u043C'\u044F <span class="bm-label-hint">(\u043F\u043E\u0440\u043E\u0436\u043D\u0454 \u2014 \u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="\u0412\u0430\u0448\u0435 \u0456\u043C'\u044F" value="${escapeHtml(state.author)}">
      </div>
    `;
      bindCommonFields();
      dynamicEl.querySelector("#bm-tags")?.addEventListener("input", (e) => {
        state.tagsRaw = e.target.value;
        renderPreview();
      });
      bindPhotoSlots();
    }
    function renderGreetingFields() {
      dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label">\u041E\u0431\u043A\u043B\u0430\u0434\u0438\u043D\u043A\u0430</label>
        <div class="bm-greet-presets" id="bm-greet-presets">
          ${GREETING_PRESETS.map((g, i) => `
            <button type="button" class="bm-greet-preset${i === state.greetingIdx ? " active" : ""}" data-idx="${i}" style="background:${g.gradient}" aria-label="${escapeHtml(g.label)}">
              <span class="bm-greet-preset-emoji">${g.emoji}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-title">\u041A\u043E\u043C\u0443 <span class="bm-label-hint">(\u0456\u043C\u02BC\u044F, \u0440\u043E\u0434\u0438\u043D\u0430, \u0443\u0441\u0456\u0439 \u0433\u0440\u043E\u043C\u0430\u0434\u0456...)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-title" type="text" placeholder="\u0421\u0435\u0440\u0433\u0456\u044E / \u0443\u0441\u0456\u043C \u043C\u0430\u0442\u0435\u0440\u044F\u043C / \u0440\u043E\u0434\u0438\u043D\u0456 \u0406\u0432\u0430\u043D\u0447\u0443\u043A\u0456\u0432" value="${escapeHtml(state.title)}">
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-text">\u0422\u0435\u043A\u0441\u0442 \u0432\u0456\u0442\u0430\u043D\u043D\u044F</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="\u0417 \u0414\u043D\u0435\u043C \u041D\u0430\u0440\u043E\u0434\u0436\u0435\u043D\u043D\u044F! \u0417\u0434\u043E\u0440\u043E\u0432\u02BC\u044F, \u0449\u0430\u0441\u0442\u044F..." required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-author">\u0412\u0456\u0434 \u043A\u043E\u0433\u043E <span class="bm-label-hint">(\u043F\u043E\u0440\u043E\u0436\u043D\u0454 \u2014 \u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="\u0421\u0443\u0441\u0456\u0434\u0438 / \u041A\u043E\u043B\u0435\u043A\u0442\u0438\u0432 \u0448\u043A\u043E\u043B\u0438" value="${escapeHtml(state.author)}">
      </div>
    `;
      bindCommonFields();
      dynamicEl.querySelector("#bm-title")?.addEventListener("input", (e) => {
        state.title = e.target.value;
        renderPreview();
      });
      dynamicEl.querySelectorAll(".bm-greet-preset").forEach((btn) => {
        btn.addEventListener("click", () => {
          dynamicEl.querySelectorAll(".bm-greet-preset").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          state.greetingIdx = parseInt(btn.dataset.idx, 10) || 0;
          renderPreview();
        });
      });
    }
    function bindCommonFields() {
      dynamicEl.querySelector("#bm-text")?.addEventListener("input", (e) => {
        state.text = e.target.value;
        renderPreview();
      });
      dynamicEl.querySelector("#bm-author")?.addEventListener("input", (e) => {
        state.author = e.target.value;
        renderPreview();
      });
    }
    function photoSlotsHtml(count = 3) {
      return `
      <div class="bm-photos" id="bm-photos">
        ${Array.from({ length: count }, (_, i) => `
          <label class="bm-photo-slot${state.photos[i] ? " filled" : ""}" data-idx="${i}" ${state.photos[i] ? `style="background-image:url('${state.photos[i]}')"` : ""}>
            <input type="file" accept="image/*" hidden>
            <span class="bm-photo-plus${state.photos[i] ? " bm-photo-remove" : ""}">${state.photos[i] ? "\u2715" : "\uFF0B"}</span>
          </label>
        `).join("")}
      </div>
    `;
    }
    function bindPhotoSlots() {
      dynamicEl.querySelectorAll(".bm-photo-slot").forEach((slot) => {
        const input = slot.querySelector('input[type="file"]');
        const idx = parseInt(slot.dataset.idx, 10);
        input.addEventListener("change", async () => {
          const file = input.files[0];
          if (!file)
            return;
          let blob;
          try {
            blob = await compressImage(file);
          } catch {
            showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u0440\u043E\u0431\u0438\u0442\u0438 \u0444\u043E\u0442\u043E", 3e3);
            return;
          }
          const localUrl = URL.createObjectURL(blob);
          state.photos[idx] = localUrl;
          slot.classList.add("filled", "uploading");
          slot.style.backgroundImage = `url("${localUrl}")`;
          slot.querySelector(".bm-photo-plus").textContent = "\u2715";
          slot.querySelector(".bm-photo-plus").classList.add("bm-photo-remove");
          renderPreview();
          state.uploadingCount++;
          updateSubmitState();
          const { url, error } = await uploadPhotoToStorage(blob);
          state.uploadingCount--;
          updateSubmitState();
          if (error || !url) {
            showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0444\u043E\u0442\u043E \u2014 \u0441\u043F\u0440\u043E\u0431\u0443\u0439 \u0449\u0435 \u0440\u0430\u0437", 3500);
            URL.revokeObjectURL(localUrl);
            state.photos[idx] = null;
            slot.classList.remove("filled", "uploading");
            slot.style.backgroundImage = "";
            const span = slot.querySelector(".bm-photo-plus");
            span.textContent = "\uFF0B";
            span.classList.remove("bm-photo-remove");
            input.value = "";
            renderPreview();
            return;
          }
          if (state.photos[idx] === localUrl) {
            state.photos[idx] = url;
            slot.classList.remove("uploading");
          }
          URL.revokeObjectURL(localUrl);
        });
        slot.querySelector(".bm-photo-plus").addEventListener("click", (e) => {
          if (slot.classList.contains("filled")) {
            e.preventDefault();
            const old = state.photos[idx];
            if (old && old.startsWith("blob:"))
              URL.revokeObjectURL(old);
            state.photos[idx] = null;
            slot.classList.remove("filled", "uploading");
            slot.style.backgroundImage = "";
            const span = slot.querySelector(".bm-photo-plus");
            span.textContent = "\uFF0B";
            span.classList.remove("bm-photo-remove");
            input.value = "";
            renderPreview();
          }
        });
      });
    }
    function updateSubmitState() {
      const btn = wrap.querySelector(".cm-board-submit");
      if (!btn)
        return;
      if (state.uploadingCount > 0) {
        btn.disabled = true;
        btn.textContent = `\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0444\u043E\u0442\u043E\u2026`;
      } else {
        btn.disabled = false;
        btn.textContent = "\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438";
      }
    }
    const previewCanvas = wrap.querySelector("#bm-preview-canvas");
    function renderPreview() {
      if (state.type === "board")
        renderBoardPreview();
      else if (state.type === "chat")
        renderChatPreview();
      else if (state.type === "greeting")
        renderGreetingPreview();
    }
    function renderBoardPreview() {
      const cat = BOARD_CATEGORIES.find((c) => c.id === state.category) || BOARD_CATEGORIES[7];
      const firstPhoto = state.photos.find((p) => p);
      const contactTrim = state.contact.trim();
      const contactHtml = contactTrim ? `
      <div class="cm-board-contact${isPhone(contactTrim) ? " cm-board-contact--phone" : ""}">
        ${escapeHtml(contactTrim)}
      </div>` : "";
      previewCanvas.innerHTML = `
      <article class="cm-board-note cm-board-note--${cat.color}${firstPhoto ? " cm-board-note--has-photo" : ""}" style="--tilt:0deg">
        <span class="cm-board-pin"></span>
        ${firstPhoto ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${firstPhoto}" alt=""></div>` : ""}
        <span class="cm-board-cat">${cat.emoji} ${escapeHtml(state.category)}</span>
        <p class="cm-board-text">${escapeHtml(state.text.trim() || "\u0422\u0435\u043A\u0441\u0442 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u0442\u0443\u0442\u2026")}</p>
        <div class="cm-board-footer">
          <span class="cm-board-author">\u2014 ${escapeHtml(state.author.trim() || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
          <span class="cm-board-time">\u0449\u043E\u0439\u043D\u043E</span>
        </div>
        ${contactHtml}
      </article>
    `;
    }
    function renderChatPreview() {
      const tags = parseTags(state.tagsRaw);
      const tagsHtml = tags.length ? `<div class="bd-chat-tags">${tags.map((t) => `<span class="bd-chat-tag">${escapeHtml(t)}</span>`).join(" ")}</div>` : "";
      const firstPhoto = state.photos.find((p) => p);
      const author = state.author.trim();
      const initial = author ? author.charAt(0).toUpperCase() : "\u{1F464}";
      const hue = author ? author.charCodeAt(0) * 47 % 360 : 0;
      const avatarStyle = author ? `background:hsl(${hue}deg 65% 78%);color:#fff;font-weight:600` : "background:#f5f5f5;color:#666;font-size:18px";
      previewCanvas.innerHTML = `
      <article class="bd-card bd-card--chat">
        <div class="bd-chat-head">
          <span class="bd-avatar" style="${avatarStyle}">${escapeHtml(initial)}</span>
          <div class="bd-chat-meta">
            <span class="bd-chat-author">${escapeHtml(author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
            <span class="bd-chat-time">\u0449\u043E\u0439\u043D\u043E</span>
          </div>
        </div>
        <p class="bd-chat-text">${escapeHtml(state.text.trim() || "\u0412\u0430\u0448\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F\u2026")}</p>
        ${firstPhoto ? `<img class="bd-chat-photo" src="${firstPhoto}" alt="">` : ""}
        ${tagsHtml}
      </article>
    `;
    }
    function renderGreetingPreview() {
      const preset = GREETING_PRESETS[state.greetingIdx] || GREETING_PRESETS[0];
      const author = state.author.trim();
      const title = state.title.trim();
      previewCanvas.innerHTML = `
      <article class="bd-card bd-card--greeting">
        <div class="bd-greet-cover" style="background:${preset.gradient}">
          <span class="bd-greet-emoji">${preset.emoji}</span>
        </div>
        <div class="bd-greet-body">
          ${title ? `<div class="bd-greet-to">\u0414\u043B\u044F ${escapeHtml(title)}</div>` : ""}
          <p class="bd-greet-text">${escapeHtml(state.text.trim() || "\u0422\u0435\u043A\u0441\u0442 \u0432\u0456\u0442\u0430\u043D\u043D\u044F \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u0442\u0443\u0442\u2026")}</p>
          <div class="bd-greet-footer">
            <span class="bd-greet-author">\u2014 ${escapeHtml(author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
            <span class="bd-greet-time">\u0449\u043E\u0439\u043D\u043E</span>
          </div>
        </div>
      </article>
    `;
    }
    renderDynamic();
    renderPreview();
    setTimeout(() => wrap.querySelector("#bm-text")?.focus(), 200);
    wrap.querySelector("#cm-board-modal-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.text.trim()) {
        showToast("\u0411\u0443\u0434\u044C \u043B\u0430\u0441\u043A\u0430, \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u0442\u0435\u043A\u0441\u0442", 2500);
        wrap.querySelector("#bm-text")?.focus();
        return;
      }
      if (state.type === "greeting" && !state.title.trim()) {
        showToast("\u0412\u043A\u0430\u0436\u0456\u0442\u044C \u043A\u043E\u043C\u0443 \u0432\u0456\u0442\u0430\u043D\u043D\u044F", 2500);
        wrap.querySelector("#bm-title")?.focus();
        return;
      }
      if (state.uploadingCount > 0 || state.photos.some((p) => p && p.startsWith("blob:"))) {
        showToast("\u0417\u0430\u0447\u0435\u043A\u0430\u0439, \u0444\u043E\u0442\u043E \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0443\u0454\u0442\u044C\u0441\u044F\u2026", 2500);
        return;
      }
      const submitBtn = wrap.querySelector(".cm-board-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "\u041D\u0430\u0434\u0441\u0438\u043B\u0430\u0454\u043C\u043E\u2026";
      }
      const payload = buildPayload(state);
      if (isSupabaseReady()) {
        const result = await submitPost(payload);
        if (!result.ok) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438";
          }
          showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (result.error || "\u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438"), 4500);
          return;
        }
      } else {
        console.info("[submit] Supabase \u043D\u0435 \u0433\u043E\u0442\u043E\u0432\u0438\u0439 \u2014 payload \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u043B\u0438\u0448\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E:", payload);
      }
      close();
      showToast("\u0414\u044F\u043A\u0443\u0454\u043C\u043E! \u0417\u0430\u043F\u0438\u0442 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443.", 4e3);
    });
  }
  function buildPayload(state) {
    const base = {
      type: state.type,
      text: state.text.trim(),
      author: state.author.trim() || null,
      photos: state.photos.filter(Boolean),
      status: "pending"
    };
    if (state.type === "board") {
      const cat = BOARD_CATEGORIES.find((c) => c.id === state.category) || BOARD_CATEGORIES[7];
      return {
        ...base,
        category: state.category,
        color: cat.color,
        contact: state.contact.trim() || null,
        tags: []
      };
    }
    if (state.type === "chat") {
      return {
        ...base,
        category: null,
        tags: parseTags(state.tagsRaw)
      };
    }
    if (state.type === "greeting") {
      const preset = GREETING_PRESETS[state.greetingIdx] || GREETING_PRESETS[0];
      return {
        ...base,
        category: null,
        title: state.title.trim(),
        cover_emoji: preset.emoji,
        cover_gradient: preset.gradient,
        tags: []
      };
    }
    return base;
  }

  // src/tabs/board.js
  var TYPE_TABS2 = [
    { id: "all", label: "\u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0456", emoji: "\u26A1" },
    { id: "board", label: "\u0414\u043E\u0448\u043A\u0430", emoji: "\u{1F6D2}" },
    { id: "chat", label: "\u0420\u043E\u0437\u043C\u043E\u0432\u0438", emoji: "\u{1F4AC}" },
    { id: "greeting", label: "\u0412\u0456\u0442\u0430\u043D\u043D\u044F", emoji: "\u{1F389}" },
    { id: "saved", label: "\u041C\u043E\u0457", emoji: "\u{1F4BE}" }
  ];
  var FRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1e3;
  var BOARD_CATEGORIES2 = [
    { id: "all", label: "\u0412\u0441\u0456", emoji: "\u2726" },
    { id: "\u043F\u0440\u043E\u0434\u0430\u043C", label: "\u041F\u0440\u043E\u0434\u0430\u043C", emoji: "\u{1F4B0}" },
    { id: "\u043A\u0443\u043F\u043B\u044E", label: "\u041A\u0443\u043F\u043B\u044E", emoji: "\u{1F6D2}" },
    { id: "\u0448\u0443\u043A\u0430\u044E", label: "\u0428\u0443\u043A\u0430\u044E", emoji: "\u{1F50D}" },
    { id: "\u043F\u043E\u0441\u043B\u0443\u0433\u0430", label: "\u041F\u043E\u0441\u043B\u0443\u0433\u0438", emoji: "\u{1F527}" },
    { id: "\u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E", label: "\u0417\u043D\u0430\u0439\u0434\u0435\u043D\u043E", emoji: "\u{1F381}" },
    { id: "\u0437\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C", label: "\u0417\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C", emoji: "\u{1F61F}" },
    { id: "\u043F\u043E\u0434\u044F\u043A\u0430", label: "\u041F\u043E\u0434\u044F\u043A\u0438", emoji: "\u2764\uFE0F" },
    { id: "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", label: "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", emoji: "\u{1F4E2}" }
  ];
  var CATEGORY_EMOJI = Object.fromEntries(BOARD_CATEGORIES2.map((c) => [c.id, c.emoji]));
  var REACTIONS = ["\u2764\uFE0F", "\u{1F44D}", "\u{1F44F}", "\u{1F525}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}"];
  var PHONE_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var BOOKMARK_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var BOOKMARK_FILLED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var SHARE_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  var allPosts = [];
  var allAnnouncements = [];
  var activeType = "all";
  var activeCategory = "all";
  var searchQuery = "";
  var reactionsByPost = /* @__PURE__ */ new Map();
  var commentsByPost = /* @__PURE__ */ new Map();
  var LS_SAVED = "cstl-saved-v1";
  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
    }
  }
  function getMyReaction(postId) {
    const r = reactionsByPost.get(postId);
    return r ? r.my : null;
  }
  function getReactionCounts(postId) {
    const r = reactionsByPost.get(postId);
    return r ? r.counts : {};
  }
  function getTotalReactionCount(postId) {
    const counts = getReactionCounts(postId);
    return Object.values(counts).reduce((s, n) => s + n, 0);
  }
  function getComments(postId) {
    return commentsByPost.get(postId) || [];
  }
  function getSavedIds() {
    return new Set(lsGet(LS_SAVED, []));
  }
  function isSaved(postId) {
    return getSavedIds().has(postId);
  }
  function toggleSaved(postId) {
    const arr = lsGet(LS_SAVED, []);
    const idx = arr.indexOf(postId);
    if (idx >= 0)
      arr.splice(idx, 1);
    else
      arr.push(postId);
    lsSet(LS_SAVED, arr);
  }
  function authorAvatar(author) {
    const a = String(author || "").trim();
    if (!a)
      return '<span class="bd-avatar bd-avatar--anon">\u{1F464}</span>';
    const letter = a.charAt(0).toUpperCase();
    const hue = a.charCodeAt(0) * 47 % 360;
    return `<span class="bd-avatar" style="background:hsl(${hue}deg 65% 78%);color:#fff;font-weight:600">${escapeHtml(letter)}</span>`;
  }
  function renderContact(contact) {
    if (!contact)
      return "";
    const trimmed = String(contact).trim();
    const isPhone2 = /^[\+\d][\d\s\-\(\)]{5,}$/.test(trimmed);
    if (!isPhone2) {
      return `<div class="cm-board-contact">${escapeHtml(trimmed)}</div>`;
    }
    const tel = trimmed.replace(/[^\d+]/g, "");
    return `
    <div class="cm-board-contact cm-board-contact--phone">
      <span class="cm-board-contact-num">${escapeHtml(trimmed)}</span>
      <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="\u0417\u0430\u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443\u0432\u0430\u0442\u0438 ${escapeHtml(trimmed)}">
        ${PHONE_ICON_SVG}
      </a>
    </div>
  `;
  }
  function reactTriggerHtml(post) {
    const myReaction = getMyReaction(post.id);
    const counts = getReactionCounts(post.id);
    const total = getTotalReactionCount(post.id);
    const top3 = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    let content;
    if (total === 0) {
      content = `<span class="bd-react-trigger-default">\u{1F642}</span><span class="bd-react-trigger-plus">+</span>`;
    } else {
      content = top3.map(([em, n]) => `
      <span class="bd-react-trigger-group${em === myReaction ? " bd-react-trigger-group--mine" : ""}">
        <span class="bd-react-trigger-emoji">${em}</span>
        <span class="bd-react-trigger-count">${n}</span>
      </span>
    `).join("");
    }
    return `<button class="bd-react-trigger${myReaction ? " bd-react-trigger--active" : ""}" type="button"
          data-react-trigger="${post.id}" aria-label="\u0420\u0435\u0430\u043A\u0446\u0456\u0457 (${total})">${content}</button>`;
  }
  function saveBtnHtml(post) {
    const saved = isSaved(post.id);
    return `<button class="bd-icon-btn bd-bookmark${saved ? " bd-bookmark--active" : ""}" type="button"
          data-save-id="${post.id}"
          aria-label="${saved ? "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445" : "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0443 \u041C\u043E\u0457"}">
    ${saved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG}
  </button>`;
  }
  function shareBtnHtml(post) {
    const shareText = buildShareText(post);
    const shareTitle = post.type === "greeting" ? `\u{1F389} ${post.title || "\u0412\u0456\u0442\u0430\u043D\u043D\u044F"} (CSTL LIFE)` : post.type === "chat" ? "\u0420\u043E\u0437\u043C\u043E\u0432\u0430 \u0437 \u0414\u043E\u0448\u043A\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0438 \u041E\u043B\u0438\u043A\u0438" : "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437 \u0414\u043E\u0448\u043A\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0438 \u041E\u043B\u0438\u043A\u0438";
    return `<button class="bd-icon-btn bd-share-btn" type="button"
          data-share-board
          data-share-title="${escapeHtml(shareTitle)}"
          data-share-text="${escapeHtml(shareText)}"
          aria-label="\u041F\u043E\u0434\u0456\u043B\u0438\u0442\u0438\u0441\u044F">${SHARE_ICON_SVG}</button>`;
  }
  function boardActionsHtml(post) {
    return `
    <div class="bd-actions bd-actions--board-compact">
      ${reactTriggerHtml(post)}
      <div class="bd-actions-extra">
        ${saveBtnHtml(post)}
        ${shareBtnHtml(post)}
      </div>
    </div>
  `;
  }
  function greetingActionsHtml(post) {
    return `
    <div class="bd-actions">
      <div class="bd-actions-left">${reactTriggerHtml(post)}</div>
      <div class="bd-actions-right">${saveBtnHtml(post)}${shareBtnHtml(post)}</div>
    </div>
    ${chatCommentsHtml(post)}
  `;
  }
  function chatActionsHtml(post) {
    return `
    <div class="bd-actions">
      <div class="bd-actions-left">${reactTriggerHtml(post)}</div>
      <div class="bd-actions-right">${saveBtnHtml(post)}${shareBtnHtml(post)}</div>
    </div>
    ${chatCommentsHtml(post)}
  `;
  }
  function chatCommentsHtml(post) {
    const items = getComments(post.id);
    const listHtml = items.length ? items.map((c) => `
        <div class="bd-inline-comment">
          <span class="bd-inline-comment-author">${escapeHtml(c.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
          <span class="bd-inline-comment-text">${escapeHtml(c.text)}</span>
          <span class="bd-inline-comment-time">${formatTime(postTime(c))}</span>
        </div>
      `).join("") : "";
    return `
    <div class="bd-inline-comments" data-comments-for="${post.id}">
      ${listHtml ? `<div class="bd-inline-comments-list">${listHtml}</div>` : ""}
      <form class="bd-inline-comment-form" data-comment-form="${post.id}">
        <input class="bd-inline-comment-input" type="text"
               placeholder="\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440..." aria-label="\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440"
               data-comment-input="${post.id}">
        <button class="bd-inline-comment-submit" type="submit" aria-label="\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438">\u2191</button>
      </form>
    </div>
  `;
  }
  function openReactionPopup(triggerBtn, postId) {
    closeReactionPopup();
    const myReaction = getMyReaction(postId);
    const counts = getReactionCounts(postId);
    const popup = document.createElement("div");
    popup.className = "bd-react-popup";
    popup.id = "bd-react-popup";
    popup.innerHTML = REACTIONS.map((em) => {
      const n = counts[em] || 0;
      return `
      <button class="bd-react-opt${myReaction === em ? " bd-react-opt--active" : ""}" type="button"
              data-react-opt="${escapeHtml(em)}" data-react-post="${postId}">
        <span class="bd-react-opt-emoji">${em}</span>
        ${n > 0 ? `<span class="bd-react-opt-count">${n}</span>` : ""}
      </button>
    `;
    }).join("");
    document.body.appendChild(popup);
    const rect = triggerBtn.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    let top = rect.top - popupRect.height - 8;
    if (top < 8)
      top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - popupRect.width / 2;
    if (left < 8)
      left = 8;
    if (left + popupRect.width > window.innerWidth - 8) {
      left = window.innerWidth - popupRect.width - 8;
    }
    popup.style.top = `${top + window.scrollY}px`;
    popup.style.left = `${left}px`;
    requestAnimationFrame(() => popup.classList.add("visible"));
  }
  function closeReactionPopup() {
    const existing = document.getElementById("bd-react-popup");
    if (existing) {
      existing.classList.remove("visible");
      setTimeout(() => existing.remove(), 150);
    }
  }
  function buildShareText(post) {
    if (post.type === "board") {
      const cat = CATEGORY_EMOJI[post.category] || "\u{1F4CC}";
      return `${cat} ${post.category}

${post.text}
\u2014 ${post.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E"}`;
    }
    if (post.type === "chat") {
      const tags = (post.tags || []).join(" ");
      return `${post.text}${tags ? "\n\n" + tags : ""}
\u2014 ${post.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E"}`;
    }
    if (post.type === "greeting") {
      return `${post.cover_emoji || "\u{1F389}"} ${post.title ? "\u0414\u043B\u044F " + post.title + ":\n" : ""}${post.text}${post.author ? "\n\u2014 " + post.author : ""}`;
    }
    return post.text || "";
  }
  function renderBoardCard(p) {
    const tilt = p.id * 7 % 9 - 4;
    const emoji = CATEGORY_EMOJI[p.category] || "\u{1F4CC}";
    const contactHtml = renderContact(p.contact);
    const photo = Array.isArray(p.photos) && p.photos[0] || p.photo;
    const photoHtml = photo ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>` : "";
    return `
    <article class="cm-board-note bd-card bd-card--board cm-board-note--${escapeHtml(p.color || "yellow")}${photo ? " cm-board-note--has-photo" : ""}" style="--tilt:${tilt}deg" data-post-id="${p.id}">
      <span class="cm-board-pin"></span>
      ${photoHtml}
      <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
      <p class="cm-board-text">${escapeHtml(p.text)}</p>
      <div class="cm-board-footer">
        <span class="cm-board-author">\u2014 ${escapeHtml(p.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
        <span class="cm-board-time">${formatTime(postTime(p))}</span>
      </div>
      ${contactHtml}
      ${boardActionsHtml(p)}
    </article>
  `;
  }
  function renderOfficialCard(a) {
    const tilt = a.id * 5 % 5 - 2;
    return `
    <article class="cm-board-note bd-card bd-card--official cm-board-note--official" style="--tilt:${tilt}deg">
      <span class="cm-board-pin cm-board-pin--gold"></span>
      <span class="cm-board-cat cm-board-cat--official">\u{1F3DB}\uFE0F \u041E\u0424\u0406\u0426\u0406\u0419\u041D\u041E</span>
      <h4 class="cm-board-official-title">${escapeHtml(a.title)}</h4>
      <p class="cm-board-text">${escapeHtml(a.body)}</p>
      <div class="cm-board-footer">
        <span class="cm-board-author">\u2014 ${escapeHtml(a.author || "\u2014")}</span>
        <span class="cm-board-time">${formatTime(postTime(a))}</span>
      </div>
    </article>
  `;
  }
  function renderChatCard(p) {
    const tagsHtml = (p.tags || []).length ? `<div class="bd-chat-tags">${p.tags.map((t) => `<span class="bd-chat-tag">${escapeHtml(t)}</span>`).join(" ")}</div>` : "";
    const photo = Array.isArray(p.photos) && p.photos[0] || p.photo;
    const photoHtml = photo ? `<img class="bd-chat-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.style.display='none'">` : "";
    return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}">
      <div class="bd-chat-head">
        ${authorAvatar(p.author)}
        <div class="bd-chat-meta">
          <span class="bd-chat-author">${escapeHtml(p.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
          <span class="bd-chat-time">${formatTime(postTime(p))}</span>
        </div>
      </div>
      <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      ${photoHtml}
      ${tagsHtml}
      ${chatActionsHtml(p)}
    </article>
  `;
  }
  function renderGreetingCard(p) {
    const grad = p.cover_gradient || "linear-gradient(135deg, #FFD1DC 0%, #FFB6C1 100%)";
    const emoji = p.cover_emoji || "\u{1F389}";
    const titleLine = p.title ? `<div class="bd-greet-to">\u0414\u043B\u044F ${escapeHtml(p.title)}</div>` : "";
    return `
    <article class="bd-card bd-card--greeting" data-post-id="${p.id}">
      <div class="bd-greet-cover" style="background:${escapeHtml(grad)}">
        <span class="bd-greet-emoji">${emoji}</span>
      </div>
      <div class="bd-greet-body">
        ${titleLine}
        <p class="bd-greet-text">${escapeHtml(p.text)}</p>
        <div class="bd-greet-footer">
          <span class="bd-greet-author">\u2014 ${escapeHtml(p.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span>
          <span class="bd-greet-time">${formatTime(postTime(p))}</span>
        </div>
      </div>
      ${greetingActionsHtml(p)}
    </article>
  `;
  }
  function renderCard(post) {
    if (post.type === "chat")
      return renderChatCard(post);
    if (post.type === "greeting")
      return renderGreetingCard(post);
    return renderBoardCard(post);
  }
  function getFilteredPosts() {
    const q = searchQuery.trim().toLowerCase();
    const savedIds = activeType === "saved" ? getSavedIds() : null;
    const freshCutoff = Date.now() - FRESH_WINDOW_MS;
    return allPosts.filter((p) => {
      if (activeType === "saved") {
        if (!savedIds.has(p.id))
          return false;
      } else if (activeType === "all") {
        const t = p.ts || p.published_at && new Date(p.published_at).getTime() || p.created_at && new Date(p.created_at).getTime() || 0;
        if (t < freshCutoff)
          return false;
      } else if (p.type !== activeType) {
        return false;
      }
      if (activeType === "board" && activeCategory !== "all") {
        if (p.category !== activeCategory)
          return false;
      }
      if (q) {
        const hay = [
          p.text,
          p.title,
          p.author,
          ...p.tags || []
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q))
          return false;
      }
      return true;
    });
  }
  function getFreshAnnouncements() {
    const cutoff = Date.now() - FRESH_WINDOW_MS;
    return allAnnouncements.filter((a) => {
      const t = a.ts || a.published_at && new Date(a.published_at).getTime() || a.created_at && new Date(a.created_at).getTime() || 0;
      return t >= cutoff;
    });
  }
  function renderHeader() {
    const tabs = TYPE_TABS2.map((t) => `
    <button class="bd-tab${t.id === activeType ? " bd-tab--active" : ""}" type="button" data-bd-tab="${t.id}">
      <span class="bd-tab-emoji">${t.emoji}</span>
      <span class="bd-tab-label">${escapeHtml(t.label)}</span>
    </button>
  `).join("");
    const showCategories = activeType === "board";
    const categoriesHtml = showCategories ? `
    <div class="bd-categories">
      ${BOARD_CATEGORIES2.map((c) => `
        <button class="bd-cat-chip${c.id === activeCategory ? " bd-cat-chip--active" : ""}" type="button" data-bd-cat="${c.id}">
          <span class="bd-cat-emoji">${c.emoji}</span>
          ${escapeHtml(c.label)}
        </button>
      `).join("")}
    </div>
  ` : "";
    return `
    <div class="bd-controls">
      <div class="bd-search">
        <span class="bd-search-icon">\u{1F50D}</span>
        <input class="bd-search-input" id="bd-search-input" type="search"
               placeholder="\u041F\u043E\u0448\u0443\u043A \u043F\u043E \u0434\u043E\u0448\u0446\u0456..." value="${escapeHtml(searchQuery)}">
        ${searchQuery ? '<button class="bd-search-clear" type="button" id="bd-search-clear">\u2715</button>' : ""}
      </div>
      <div class="bd-tabs">${tabs}</div>
      ${categoriesHtml}
    </div>
  `;
  }
  function renderBody() {
    const filtered = getFilteredPosts();
    const annsForView = activeType === "all" ? getFreshAnnouncements() : allAnnouncements;
    if (!filtered.length && !(activeType === "all" && annsForView.length)) {
      const msg = activeType === "saved" ? "\u0423 \xAB\u041C\u043E\u0457\u0445\xBB \u043F\u043E\u043A\u0438 \u043D\u0456\u0447\u043E\u0433\u043E. \u0422\u0430\u043F\u043D\u0456\u0442\u044C \u{1F90D} \u043D\u0430 \u043F\u043E\u0441\u0442\u0456 \u0449\u043E\u0431 \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438." : activeType === "all" ? "\u0417\u0430 \u043E\u0441\u0442\u0430\u043D\u043D\u0456 3 \u0434\u043D\u0456 \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u043E\u0432\u043E\u0433\u043E. \u0417\u0430\u0433\u043B\u044F\u0434\u0430\u0439\u0442\u0435 \u0443 \u0414\u043E\u0448\u043A\u0443 / \u0420\u043E\u0437\u043C\u043E\u0432\u0438 / \u0412\u0456\u0442\u0430\u043D\u043D\u044F." : searchQuery ? `\u0417\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C \xAB${escapeHtml(searchQuery)}\xBB \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E` : "\u0423 \u0446\u0456\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E";
      return `<div class="bd-empty">${msg}</div>`;
    }
    const sorted = [...filtered].sort((a, b) => {
      const ta = a.ts || a.published_at && new Date(a.published_at).getTime() || 0;
      const tb = b.ts || b.published_at && new Date(b.published_at).getTime() || 0;
      return tb - ta;
    });
    if (activeType === "board") {
      const cards = sorted.map(renderBoardCard).join("");
      return `
      <div class="board-backdrop" id="board-backdrop"></div>
      <div class="cm-board-corkboard board-corkboard--full">${cards}</div>
    `;
    }
    if (activeType === "all") {
      const officialCards = annsForView.map(renderOfficialCard).join("");
      const boardOnly = sorted.filter((p) => p.type === "board").map(renderBoardCard).join("");
      const others = sorted.filter((p) => p.type !== "board").map(renderCard).join("");
      return `
      <div class="board-backdrop" id="board-backdrop"></div>
      ${officialCards || boardOnly ? `<div class="cm-board-corkboard board-corkboard--full">${officialCards}${boardOnly}</div>` : ""}
      ${others ? `<div class="bd-stream">${others}</div>` : ""}
    `;
    }
    return `<div class="bd-stream">${sorted.map(renderCard).join("")}</div>`;
  }
  async function renderBoard() {
    const el = document.getElementById("board-content");
    if (!el)
      return;
    if (isSupabaseReady()) {
      const anonId = getAnonId();
      const [posts, anns, reactions, comments] = await Promise.all([
        fetchPublishedPosts(),
        fetchPublishedAnnouncements(),
        fetchAllReactions(anonId),
        fetchAllComments()
      ]);
      if (posts !== null) {
        allPosts = posts;
        allAnnouncements = anns || [];
        reactionsByPost = reactions;
        commentsByPost = comments;
        renderAll(el);
        return;
      }
    }
    try {
      const [boardRes, communityRes] = await Promise.all([
        fetch("./data/community-board.json"),
        fetch("./data/community.json")
      ]);
      const boardData = await boardRes.json();
      const communityData = await communityRes.json();
      allPosts = boardData.posts || [];
      allAnnouncements = communityData.announcements || [];
      reactionsByPost = /* @__PURE__ */ new Map();
      commentsByPost = /* @__PURE__ */ new Map();
    } catch {
      el.innerHTML = '<div class="empty-state">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
      return;
    }
    renderAll(el);
  }
  function renderAll(el) {
    el.innerHTML = `
    ${renderHeader()}
    <div class="bd-body" id="bd-body">${renderBody()}</div>
    <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button">
      <span class="cm-board-trigger-icon">\u270F\uFE0F</span>
      <span class="cm-board-trigger-text">\u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>
    </button>
  `;
    document.getElementById("board-trigger")?.addEventListener("click", openBoardModal);
    const searchInput = document.getElementById("bd-search-input");
    if (searchInput) {
      let debounce = null;
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        clearTimeout(debounce);
        debounce = setTimeout(() => renderBodyOnly(el), 180);
      });
    }
    document.getElementById("bd-search-clear")?.addEventListener("click", () => {
      searchQuery = "";
      renderAll(el);
    });
    el.querySelectorAll("[data-bd-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeType = btn.dataset.bdTab;
        activeCategory = "all";
        renderAll(el);
      });
    });
    el.querySelectorAll("[data-bd-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.bdCat;
        renderAll(el);
      });
    });
    el.querySelectorAll(".cm-board-call").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
      }, { capture: true });
    });
    initBoardNoteExpand(el);
  }
  function renderBodyOnly(el) {
    const body = document.getElementById("bd-body");
    if (!body)
      return renderAll(el);
    body.innerHTML = renderBody();
    body.querySelectorAll(".cm-board-call").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
      }, { capture: true });
    });
    initBoardNoteExpand(el);
  }
  function initBoardNoteExpand(root) {
    const backdrop = root.querySelector("#board-backdrop");
    if (!backdrop)
      return;
    let activeNote = null;
    let activeModal = null;
    let isAnimating = false;
    const DURATION = 240;
    const expand = (note) => {
      if (isAnimating || activeNote)
        return;
      isAnimating = true;
      const modal = document.createElement("article");
      modal.className = note.className + " cm-board-modal-note";
      modal.innerHTML = note.innerHTML;
      document.body.appendChild(modal);
      modal.querySelectorAll(".cm-board-call").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
        }, { capture: true });
      });
      activeNote = note;
      activeModal = modal;
      note.classList.add("cm-board-note--hidden");
      requestAnimationFrame(() => {
        backdrop.classList.add("visible");
        modal.classList.add("visible");
      });
      setTimeout(() => {
        isAnimating = false;
      }, DURATION);
    };
    const collapse = () => {
      if (!activeNote || !activeModal || isAnimating)
        return;
      isAnimating = true;
      const note = activeNote;
      const modal = activeModal;
      modal.classList.remove("visible");
      backdrop.classList.remove("visible");
      note.classList.remove("cm-board-note--hidden");
      setTimeout(() => {
        modal.remove();
        activeNote = null;
        activeModal = null;
        isAnimating = false;
      }, DURATION);
    };
    root.querySelectorAll(".cm-board-note:not(.cm-board-note--official):not(.cm-board-modal-note)").forEach((note) => {
      note.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isAnimating)
          return;
        if (!activeNote)
          expand(note);
      });
    });
    backdrop.addEventListener("click", collapse);
  }
  var _delegationAttached = false;
  function attachBoardDelegation() {
    if (_delegationAttached)
      return;
    _delegationAttached = true;
    document.addEventListener("submit", async (e) => {
      const form = e.target.closest("[data-comment-form]");
      if (!form)
        return;
      e.preventDefault();
      e.stopPropagation();
      const postId = Number(form.dataset.commentForm);
      const input = form.querySelector("[data-comment-input]");
      const text = (input?.value || "").trim();
      if (!text) {
        input?.focus();
        return;
      }
      const tempComment = {
        id: "temp-" + Date.now(),
        post_id: postId,
        author: null,
        text,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const list = commentsByPost.get(postId) || [];
      list.push(tempComment);
      commentsByPost.set(postId, list);
      if (input)
        input.value = "";
      rerenderCommentsBlock(postId);
      if (isSupabaseReady()) {
        const result = await addComment(postId, null, text);
        if (!result.ok) {
          const filtered = (commentsByPost.get(postId) || []).filter((c) => c.id !== tempComment.id);
          commentsByPost.set(postId, filtered);
          rerenderCommentsBlock(postId);
          alert("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440: " + result.error);
        } else if (result.comment) {
          const updated = (commentsByPost.get(postId) || []).map(
            (c) => c.id === tempComment.id ? result.comment : c
          );
          commentsByPost.set(postId, updated);
          rerenderCommentsBlock(postId);
        }
      }
    });
    function rerenderCommentsBlock(postId) {
      const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
      if (!wrap)
        return;
      const post = allPosts.find((p) => p.id === postId);
      if (!post)
        return;
      wrap.outerHTML = chatCommentsHtml(post);
      setTimeout(() => {
        document.querySelector(`[data-comment-input="${postId}"]`)?.focus();
      }, 50);
    }
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-react-trigger]");
      if (trigger) {
        e.stopPropagation();
        const id = Number(trigger.dataset.reactTrigger);
        const existing = document.getElementById("bd-react-popup");
        if (existing && existing.dataset.forPost == id) {
          closeReactionPopup();
        } else {
          openReactionPopup(trigger, id);
          const p = document.getElementById("bd-react-popup");
          if (p)
            p.dataset.forPost = id;
        }
        return;
      }
      const opt = e.target.closest("[data-react-opt]");
      if (opt) {
        e.stopPropagation();
        const id = Number(opt.dataset.reactPost);
        const emoji = opt.dataset.reactOpt;
        const current = getMyReaction(id);
        const newReaction = current === emoji ? null : emoji;
        const r = reactionsByPost.get(id) || { counts: {}, my: null };
        if (r.my)
          r.counts[r.my] = Math.max(0, (r.counts[r.my] || 0) - 1);
        if (newReaction)
          r.counts[newReaction] = (r.counts[newReaction] || 0) + 1;
        r.my = newReaction;
        reactionsByPost.set(id, r);
        closeReactionPopup();
        document.querySelectorAll(`[data-react-trigger="${id}"]`).forEach((btn) => {
          btn.outerHTML = reactTriggerHtml(allPosts.find((p) => p.id === id) || { id });
        });
        if (isSupabaseReady()) {
          setReaction(id, getAnonId(), newReaction).then((result) => {
            if (!result.ok) {
              console.warn("[reactions] \u043F\u043E\u043C\u0438\u043B\u043A\u0430 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043D\u044F:", result.error);
            }
          });
        }
        return;
      }
      if (e.target.closest("[data-comment-form]") || e.target.closest("[data-comment-input]")) {
        e.stopPropagation();
        return;
      }
      const saveBtn = e.target.closest("[data-save-id]");
      if (saveBtn) {
        e.stopPropagation();
        const id = Number(saveBtn.dataset.saveId);
        toggleSaved(id);
        const nowSaved = isSaved(id);
        saveBtn.innerHTML = nowSaved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG;
        saveBtn.classList.toggle("bd-bookmark--active", nowSaved);
        saveBtn.setAttribute("aria-label", nowSaved ? "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445" : "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0443 \u041C\u043E\u0457");
        if (activeType === "saved" && !nowSaved) {
          const el = document.getElementById("board-content");
          if (el)
            renderBodyOnly(el);
        }
        return;
      }
      const shareBtn = e.target.closest("[data-share-board]");
      if (shareBtn) {
        e.stopPropagation();
        sharePost({
          title: shareBtn.dataset.shareTitle,
          text: shareBtn.dataset.shareText
        });
        return;
      }
      if (document.getElementById("bd-react-popup") && !e.target.closest(".bd-react-popup")) {
        closeReactionPopup();
      }
    }, { capture: true });
  }
  function onReactionRealtimeEvent(payload) {
    const row = payload.new || payload.old;
    if (!row || !row.post_id)
      return;
    const postId = row.post_id;
    const anonId = getAnonId();
    fetchAllReactions(anonId).then((fresh) => {
      const r = fresh.get(postId) || { counts: {}, my: null };
      reactionsByPost.set(postId, r);
      document.querySelectorAll(`[data-react-trigger="${postId}"]`).forEach((btn) => {
        btn.outerHTML = reactTriggerHtml(allPosts.find((p) => p.id === postId) || { id: postId });
      });
    });
  }
  function onCommentRealtimeEvent(payload) {
    const postId = (payload.new || payload.old || {}).post_id;
    if (!postId)
      return;
    fetchAllComments().then((fresh) => {
      commentsByPost = fresh;
      const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
      if (wrap) {
        const post = allPosts.find((p) => p.id === postId);
        if (post)
          wrap.outerHTML = chatCommentsHtml(post);
      }
    });
  }
  var _realtimeAttached = false;
  function attachRealtime() {
    if (_realtimeAttached || !isSupabaseReady())
      return;
    _realtimeAttached = true;
    subscribeReactions(onReactionRealtimeEvent);
    subscribeComments(onCommentRealtimeEvent);
  }
  function setBoardActiveType(type) {
    if (!type)
      return;
    activeType = type;
    activeCategory = "all";
    searchQuery = "";
    const el = document.getElementById("board-content");
    if (el)
      renderAll(el);
  }
  function initBoard() {
    attachBoardDelegation();
    attachRealtime();
    renderBoard();
  }

  // src/core/bus-schedule.js
  function toMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== "string")
      return 0;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function minsToHHMM(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function nowMinutes(date = /* @__PURE__ */ new Date()) {
    return date.getHours() * 60 + date.getMinutes();
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
  function getRouteState(route, nowMin = nowMinutes()) {
    const fromMin = getStopMins(route, route.stops[0].name);
    const toMin = getStopMins(route, route.stops[route.stops.length - 1].name);
    if (fromMin === null || toMin === null)
      return "waiting";
    if (nowMin < fromMin)
      return "waiting";
    if (nowMin > toMin)
      return "past";
    return "enroute";
  }
  function getCurrentPosition(route, nowMin = nowMinutes()) {
    const stops = route.stops;
    const first = stops[0].name;
    const last = stops[stops.length - 1].name;
    const state = getRouteState(route, nowMin);
    if (state === "waiting")
      return { current: first, next: stops[1]?.name || last };
    if (state === "past")
      return { current: last, next: null };
    let current = first, next = last, currentIdx = 0;
    for (let i = 0; i < stops.length; i++) {
      const m = getStopMins(route, stops[i].name);
      if (m !== null && m <= nowMin) {
        current = stops[i].name;
        currentIdx = i;
      }
    }
    if (currentIdx < stops.length - 1)
      next = stops[currentIdx + 1].name;
    return { current, next };
  }
  function getRouteTimings(route, nowMin = nowMinutes()) {
    const stops = route.stops;
    const fromMin = getStopMins(route, stops[0].name);
    const toMin = getStopMins(route, stops[stops.length - 1].name);
    const state = getRouteState(route, nowMin);
    const { current, next } = getCurrentPosition(route, nowMin);
    const minsToDeparture = fromMin !== null ? Math.max(0, fromMin - nowMin) : null;
    const minsToArrival = toMin !== null ? Math.max(0, toMin - nowMin) : null;
    let progress = 0;
    if (state === "enroute" && toMin !== null && fromMin !== null && toMin > fromMin) {
      progress = (nowMin - fromMin) / (toMin - fromMin);
    } else if (state === "past") {
      progress = 1;
    }
    return {
      state,
      fromMin,
      toMin,
      minsToDeparture,
      minsToArrival,
      currentStop: current,
      nextStop: next,
      progress: Math.max(0, Math.min(1, progress))
    };
  }
  function formatCountdownUpper(mins) {
    if (mins == null)
      return "";
    if (mins < 60)
      return `\u0427\u0415\u0420\u0415\u0417 ${mins} \u0425\u0412`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `\u0427\u0415\u0420\u0415\u0417 ${h} \u0413\u041E\u0414 ${m} \u0425\u0412` : `\u0427\u0415\u0420\u0415\u0417 ${h} \u0413\u041E\u0414`;
  }

  // src/tabs/buses.js
  var PREFS_KEY = "bus_prefs_v2";
  var TRACK_KEY = "bus_track_v2";
  var VAPID_PUBLIC_KEY = "BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o";
  var busData = null;
  var busDay = getTodayISO();
  var weekPage = 0;
  var fromStop = "";
  var toStop = "";
  var showAll = false;
  var timerInterval = null;
  var expandedIds = /* @__PURE__ */ new Set();
  var activeField = null;
  var smartRowIndex = 0;
  var selectedRouteId = null;
  var trackedRoutes = [];
  var _bannerHideTimer = null;
  function getTodayISO() {
    const d = /* @__PURE__ */ new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function getDayData() {
    if (busData?.days)
      return busData.days[busDay] || { routes: [], fetchedAt: "", fetchedTime: "" };
    if (busDay === getTodayISO())
      return {
        routes: busData?.routes || [],
        fetchedAt: busData?.verifiedAt || "",
        fetchedTime: busData?.verifiedTime || ""
      };
    return { routes: [], fetchedAt: "", fetchedTime: "" };
  }
  function isViewingToday() {
    return busDay === getTodayISO();
  }
  function formatBusDayTitle() {
    const [year, month, day] = busDay.split("-").map(Number);
    const months = [
      "\u0421\u0406\u0427\u041D\u042F",
      "\u041B\u042E\u0422\u041E\u0413\u041E",
      "\u0411\u0415\u0420\u0415\u0417\u041D\u042F",
      "\u041A\u0412\u0406\u0422\u041D\u042F",
      "\u0422\u0420\u0410\u0412\u041D\u042F",
      "\u0427\u0415\u0420\u0412\u041D\u042F",
      "\u041B\u0418\u041F\u041D\u042F",
      "\u0421\u0415\u0420\u041F\u041D\u042F",
      "\u0412\u0415\u0420\u0415\u0421\u041D\u042F",
      "\u0416\u041E\u0412\u0422\u041D\u042F",
      "\u041B\u0418\u0421\u0422\u041E\u041F\u0410\u0414\u0410",
      "\u0413\u0420\u0423\u0414\u041D\u042F"
    ];
    return `\u041D\u0410 ${day} ${months[month - 1]} ${year}`;
  }
  function buildListTitleHtml(updatedStr) {
    return `<div class="bus-list-title">\u0420\u041E\u0417\u041A\u041B\u0410\u0414 \u0410\u0412\u0422\u041E\u0411\u0423\u0421\u041D\u0418\u0425 \u041C\u0410\u0420\u0428\u0420\u0423\u0422\u0406\u0412<span class="bus-list-date-sub">${formatBusDayTitle()}</span><span class="bus-list-updated-sub">${updatedStr}</span></div>`;
  }
  function getTimingsForDisplay(route) {
    if (isViewingToday())
      return getRouteTimings(route);
    const base = getRouteTimings(route);
    return { ...base, state: "waiting", progress: 0, minsToDeparture: null, minsToArrival: null };
  }
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
  function urlBase64ToUint8Array(b64) {
    const pad2 = "=".repeat((4 - b64.length % 4) % 4);
    const base = (b64 + pad2).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }
  function pushKeysEqual(a, b) {
    if (!a || !b)
      return false;
    const ua = new Uint8Array(a);
    const ub = new Uint8Array(b);
    if (ua.length !== ub.length)
      return false;
    for (let i = 0; i < ua.length; i++)
      if (ua[i] !== ub[i])
        return false;
    return true;
  }
  async function subscribeToPush(routeId, routeName, boardingStop, alightingStop, trackDate, depTime) {
    if (trackDate !== getTodayISO())
      return;
    if (!("Notification" in window) || !("serviceWorker" in navigator))
      return;
    try {
      let perm = Notification.permission;
      if (perm === "denied")
        return;
      if (perm === "default")
        perm = await Notification.requestPermission();
      if (perm !== "granted")
        return;
      const reg = await navigator.serviceWorker.ready;
      const appKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        const existingKey = sub.options && sub.options.applicationServerKey;
        if (existingKey && !pushKeysEqual(existingKey, appKey)) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appKey
        });
      }
      const subJson = sub.toJSON();
      const payload = {
        user_uuid: getAnonId(),
        endpoint: subJson.endpoint,
        p256dh: subJson.keys.p256dh,
        auth_key: subJson.keys.auth,
        route_id: routeId,
        route_name: routeName || "",
        boarding_stop: boardingStop || null,
        alighting_stop: alightingStop || null,
        track_date: trackDate,
        dep_time: depTime || null
      };
      let res = await savePushSubscription(payload);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await savePushSubscription(payload);
      }
      if (!res.ok) {
        console.warn("[push] \u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u043F\u0456\u0434\u043F\u0438\u0441\u043A\u0443:", res.error);
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u2014 \u0441\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437");
      }
    } catch (err) {
      console.warn("[push] \u043F\u043E\u043C\u0438\u043B\u043A\u0430 \u043F\u0456\u0434\u043F\u0438\u0441\u043A\u0438:", err);
      showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F");
    }
  }
  async function unsubscribeFromPush(routeId, trackDate) {
    if (trackDate !== getTodayISO())
      return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub)
        return;
      await deletePushSubscription(sub.endpoint, routeId, trackDate);
    } catch (err) {
      console.warn("[push] unsubscribe error:", err);
    }
  }
  function loadTrackedRoute() {
    try {
      const today = getTodayISO();
      const d = JSON.parse(localStorage.getItem(TRACK_KEY));
      if (Array.isArray(d?.routes)) {
        trackedRoutes = d.routes.filter((t) => t.trackDate >= today);
      } else {
        trackedRoutes = [];
      }
      if (!trackedRoutes.length)
        localStorage.removeItem(TRACK_KEY);
    } catch {
      trackedRoutes = [];
    }
  }
  function saveTrackedRoute() {
    if (!trackedRoutes.length) {
      localStorage.removeItem(TRACK_KEY);
    } else {
      localStorage.setItem(TRACK_KEY, JSON.stringify({ routes: trackedRoutes }));
    }
    window.dispatchEvent(new CustomEvent("cstl-bus-track-changed"));
  }
  function removeTrackedEntry(entry) {
    const idx = trackedRoutes.indexOf(entry);
    if (idx !== -1)
      trackedRoutes.splice(idx, 1);
    saveTrackedRoute();
  }
  function findTrackedEntry(routeId, boardingStop, alightingStop, date) {
    const day = date || busDay;
    return trackedRoutes.find(
      (t) => t.routeId === routeId && t.trackDate === day && (t.boardingStop || null) === (boardingStop || null) && (t.alightingStop || null) === (alightingStop || null)
    );
  }
  function isRouteSegmentTracked(routeId) {
    return !!findTrackedEntry(routeId, fromStop || null, toStop || null);
  }
  function getTrackedSegmentForHero(routeId, route = null) {
    const day = isViewingToday() ? getTodayISO() : busDay;
    const entry = trackedRoutes.find((t) => t.routeId === routeId && t.trackDate === day) || null;
    if (entry && route && isViewingToday() && entry.alightingStop) {
      const alightMins = getStopMins(route, entry.alightingStop);
      if (alightMins !== null && nowMinutes() >= alightMins) {
        removeTrackedEntry(entry);
        return null;
      }
    }
    return entry;
  }
  function showBanner(label, route, isSubroute = false) {
    const banner = document.getElementById("bus-track-banner");
    if (!banner)
      return;
    const lEl = banner.querySelector(".btb-label");
    const rEl = banner.querySelector(".btb-route");
    if (lEl) {
      lEl.textContent = label;
      lEl.classList.toggle("btb-label--subroute", isSubroute);
      lEl.style.letterSpacing = "";
      if (isSubroute && label) {
        lEl.style.letterSpacing = "0px";
        void lEl.offsetWidth;
        const avail = lEl.clientWidth;
        const textW = lEl.scrollWidth;
        const chars = label.length - 1;
        if (chars > 0 && avail > textW) {
          lEl.style.letterSpacing = ((avail - textW) / chars).toFixed(2) + "px";
        }
      }
    }
    if (rEl) {
      rEl.textContent = route;
      rEl.style.fontSize = "14px";
      let fs = 14;
      while (rEl.scrollWidth > rEl.clientWidth && fs > 9.5) {
        fs -= 0.25;
        rEl.style.fontSize = fs + "px";
      }
    }
    if (_bannerHideTimer) {
      clearTimeout(_bannerHideTimer);
      _bannerHideTimer = null;
    }
    banner.style.transform = "";
    banner.classList.add("visible");
    _bannerHideTimer = setTimeout(() => {
      hideBanner();
      _bannerHideTimer = null;
    }, 4e3);
  }
  function hideBanner() {
    const banner = document.getElementById("bus-track-banner");
    if (banner) {
      banner.style.transform = "";
      banner.classList.remove("visible");
    }
    if (_bannerHideTimer) {
      clearTimeout(_bannerHideTimer);
      _bannerHideTimer = null;
    }
  }
  function fmtMins(m) {
    if (m < 60)
      return `${m} \u0445\u0432`;
    const h = Math.floor(m / 60), min = m % 60;
    return min ? `${h} \u0433\u043E\u0434 ${min} \u0445\u0432` : `${h} \u0433\u043E\u0434`;
  }
  function fmtBannerDate(iso) {
    const months = ["\u0421\u0406\u0427", "\u041B\u042E\u0422", "\u0411\u0415\u0420", "\u041A\u0412\u0406", "\u0422\u0420\u0410", "\u0427\u0415\u0420", "\u041B\u0418\u041F", "\u0421\u0415\u0420", "\u0412\u0415\u0420", "\u0416\u041E\u0412", "\u041B\u0418\u0421", "\u0413\u0420\u0423"];
    const [, m, d] = iso.split("-");
    return `${+d} ${months[+m - 1]}`;
  }
  function buildBannerTexts(route, tracked) {
    const [a, b] = parseRouteEndpoints(route.name);
    const segFrom = tracked.boardingStop || a;
    const segTo = tracked.alightingStop || b;
    const hasSeg = segFrom.toUpperCase() !== a.toUpperCase() || segTo.toUpperCase() !== b.toUpperCase();
    const startTime = getStopHHMM(route, route.stops[0].name);
    const endTime = getStopHHMM(route, route.stops[route.stops.length - 1].name);
    const timeStr = startTime && endTime ? `${startTime} \u2192 ${endTime}` : "";
    const segFromTime = getStopHHMM(route, segFrom);
    const segToTime = getStopHHMM(route, segTo);
    const segTimeStr = segFromTime && segToTime ? `${segFromTime} \u2192 ${segToTime}` : timeStr;
    const heading = hasSeg ? `${segFrom.toUpperCase()} - ${segTo.toUpperCase()}` : `${a.toUpperCase()} \u2192 ${b.toUpperCase()}`;
    const dateStr = tracked.trackDate ? fmtBannerDate(tracked.trackDate) : "";
    const timeLabel = hasSeg ? segTimeStr : timeStr;
    const subDefault = dateStr && timeLabel ? `${dateStr} | ${timeLabel}` : timeLabel || dateStr;
    return { heading, subDefault };
  }
  function checkTrackNotifications(forceInitial = false) {
    const today = getTodayISO();
    const before = trackedRoutes.length;
    trackedRoutes = trackedRoutes.filter((t) => t.trackDate >= today);
    if (before !== trackedRoutes.length)
      saveTrackedRoute();
    if (!trackedRoutes.length) {
      hideBanner();
      return;
    }
    const forceEntry = forceInitial ? trackedRoutes[trackedRoutes.length - 1] : null;
    for (const tracked of [...trackedRoutes]) {
      checkSingleTracked(tracked, tracked === forceEntry);
    }
  }
  function checkSingleTracked(tracked, forceInitial) {
    const today = getTodayISO();
    if (tracked.trackDate > today) {
      if (!tracked.notifiedFuture) {
        tracked.notifiedFuture = true;
        saveTrackedRoute();
        const dayRoutes2 = (busData?.days?.[tracked.trackDate] || {}).routes || [];
        const route2 = dayRoutes2.find((r) => r.id === tracked.routeId);
        if (!route2)
          return;
        const { heading: heading2, subDefault: subDefault2 } = buildBannerTexts(route2, tracked);
        showBanner(subDefault2, heading2, true);
      }
      return;
    }
    if (tracked.trackDate !== today) {
      removeTrackedEntry(tracked);
      return;
    }
    const dayRoutes = (busData?.days ? busData.days[tracked.trackDate] || {} : busData || {}).routes || [];
    const route = dayRoutes.find((r) => r.id === tracked.routeId);
    if (!route)
      return;
    const { heading, subDefault } = buildBannerTexts(route, tracked);
    if (route.status === "cancelled") {
      if (!tracked.notifiedCanc) {
        tracked.notifiedCanc = true;
        saveTrackedRoute();
        showBanner("\u0420\u0435\u0439\u0441 \u0441\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E", heading);
      }
      return;
    }
    const state = getRouteState(route);
    const timings = getRouteTimings(route);
    if (state === "past") {
      removeTrackedEntry(tracked);
      return;
    }
    if (tracked.alightingStop) {
      const alightMins = getStopMins(route, tracked.alightingStop);
      if (alightMins !== null && nowMinutes() >= alightMins) {
        removeTrackedEntry(tracked);
        return;
      }
    }
    let forceShow = forceInitial;
    if (state === "enroute") {
      if (!tracked.notifiedDep) {
        tracked.notifiedDep = true;
        forceShow = true;
        saveTrackedRoute();
      }
      if (tracked.boardingStop) {
        const boardMins = getStopMins(route, tracked.boardingStop);
        if (boardMins !== null) {
          const minsToBoard = boardMins - nowMinutes();
          if (minsToBoard > 0) {
            if (!tracked.notifiedBoard && minsToBoard <= 15) {
              tracked.notifiedBoard = true;
              forceShow = true;
              saveTrackedRoute();
            }
            if (forceShow)
              showBanner(
                minsToBoard <= 15 ? `\u0414\u043E ${tracked.boardingStop.toUpperCase()} \u0437\u0430 ${fmtMins(minsToBoard)}` : "\u0412 \u0434\u043E\u0440\u043E\u0437\u0456",
                heading
              );
            return;
          }
        }
      }
      if (forceShow)
        showBanner("\u0412\u0436\u0435 \u0432 \u0434\u043E\u0440\u043E\u0437\u0456", heading);
      return;
    }
    if (state === "waiting" && timings.minsToDeparture !== null) {
      const m = timings.minsToDeparture;
      if (!tracked.notifiedWarning && m <= 15) {
        tracked.notifiedWarning = true;
        forceShow = true;
        saveTrackedRoute();
      }
      if (forceShow)
        showBanner(
          m <= 15 ? `\u0412\u0456\u0434\u043F\u0440\u0430\u0432\u043B\u044F\u0454\u0442\u044C\u0441\u044F \u0447\u0435\u0440\u0435\u0437 ${fmtMins(m)}` : `\u0427\u0435\u0440\u0435\u0437 ${fmtMins(m)}`,
          heading
        );
      return;
    }
    if (forceShow)
      showBanner(subDefault, heading, true);
  }
  function getSegmentPrice(route, fromName, toName) {
    const f = route.stops.find((s) => s.name === fromName);
    const t = route.stops.find((s) => s.name === toName);
    if (!f || !t)
      return null;
    const diff = Math.abs((t.price_from_start || 0) - (f.price_from_start || 0));
    return diff > 0 ? diff.toFixed(2) : null;
  }
  function getEffectiveFrom(route) {
    if (fromStop) {
      const match = route.stops.find((s) => normalizeStopName(s.name) === normalizeStopName(fromStop));
      if (match)
        return match.name;
    }
    return route.stops[0].name;
  }
  function getEffectiveTo(route) {
    if (toStop) {
      const match = route.stops.find((s) => normalizeStopName(s.name) === normalizeStopName(toStop));
      if (match)
        return match.name;
    }
    return route.stops[route.stops.length - 1].name;
  }
  function matchesSearch(route) {
    if (!fromStop && !toStop)
      return true;
    const stops = route.stops;
    const fStop = fromStop ? stops.find((s) => normalizeStopName(s.name) === normalizeStopName(fromStop)) : null;
    const tStop = toStop ? stops.find((s) => normalizeStopName(s.name) === normalizeStopName(toStop)) : null;
    if (fromStop && !fStop)
      return false;
    if (toStop && !tStop)
      return false;
    if (fromStop && toStop && fStop.km > tStop.km)
      return false;
    return true;
  }
  function isPastRoute(route) {
    if (busDay < getTodayISO())
      return true;
    if (!isViewingToday())
      return false;
    const state = getRouteState(route);
    if (state === "past")
      return true;
    if (route.status === "cancelled" && state !== "waiting")
      return true;
    if (state === "enroute" && fromStop) {
      const boardMins = getStopMins(route, getEffectiveFrom(route));
      if (boardMins !== null && nowMinutes() > boardMins)
        return true;
    }
    return false;
  }
  function getFilteredRoutes() {
    if (!busData)
      return [];
    return (getDayData().routes || []).filter(matchesSearch).sort((a, b) => {
      const aM = getStopMins(a, getEffectiveFrom(a)) || 0;
      const bM = getStopMins(b, getEffectiveFrom(b)) || 0;
      return aM - bM;
    });
  }
  function findNextRoute() {
    const all = getFilteredRoutes();
    if (!isViewingToday())
      return all.find((r) => r.status !== "cancelled") || null;
    const enroute = all.filter((r) => {
      if (getRouteState(r) !== "enroute")
        return false;
      if (fromStop) {
        const boardMins = getStopMins(r, getEffectiveFrom(r));
        if (boardMins !== null && nowMinutes() > boardMins)
          return false;
      }
      return true;
    });
    if (enroute.length) {
      return enroute.sort((a, b) => {
        const aT = getRouteTimings(a).minsToArrival ?? Infinity;
        const bT = getRouteTimings(b).minsToArrival ?? Infinity;
        return aT - bT;
      })[0];
    }
    return all.find((r) => getRouteState(r) === "waiting") || null;
  }
  function findActiveRoutes() {
    const all = getFilteredRoutes();
    if (!isViewingToday()) {
      const trackedForDay = trackedRoutes.filter((t) => t.trackDate === busDay);
      if (trackedForDay.length) {
        const trackedIds = new Set(trackedForDay.map((t) => t.routeId));
        const tracked = all.filter((r) => trackedIds.has(r.id) && r.status !== "cancelled");
        if (tracked.length)
          return tracked;
      }
      if (selectedRouteId) {
        const sel = all.find((r) => r.id === selectedRouteId && r.status !== "cancelled");
        if (sel)
          return [sel];
      }
      const first = all.find((r) => r.status !== "cancelled") || all[0] || null;
      return first ? [first] : [];
    }
    const result = all.filter((r) => {
      if (r.status === "cancelled")
        return false;
      const state = getRouteState(r);
      if (state === "enroute") {
        if (fromStop) {
          const boardMins = getStopMins(r, getEffectiveFrom(r));
          if (boardMins !== null && nowMinutes() > boardMins)
            return false;
        }
        return true;
      }
      if (state === "waiting") {
        const t = getRouteTimings(r);
        return t.minsToDeparture !== null && t.minsToDeparture <= 90;
      }
      return false;
    });
    const activeList = result.length ? result : findNextRoute() ? [findNextRoute()] : [];
    const trackedTodayIds = [...new Set(
      trackedRoutes.filter((t) => t.trackDate === getTodayISO()).map((t) => t.routeId)
    )];
    [...trackedTodayIds].reverse().forEach((rid) => {
      const ti = activeList.findIndex((r) => r.id === rid);
      if (ti > 0) {
        activeList.unshift(activeList.splice(ti, 1)[0]);
      } else if (ti === -1) {
        const tr = all.find((r) => r.id === rid && r.status !== "cancelled");
        if (tr)
          activeList.unshift(tr);
      }
    });
    return activeList;
  }
  function normalizeStopName(name) {
    return name.replace(/\s+пов\.$/, "").trim();
  }
  function getAllStops() {
    if (!busData)
      return [];
    const seen = /* @__PURE__ */ new Set();
    (getDayData().routes || []).forEach((r) => r.stops.forEach((s) => seen.add(normalizeStopName(s.name))));
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
  function buildDropdownListHtml(query) {
    const all = getAllStops();
    const q = query.trim().toLowerCase();
    const filtered = q ? all.filter((s) => s.toLowerCase().includes(q)) : all;
    const current = activeField === "from" ? fromStop : toStop;
    const clearHtml = current ? `<button class="bs-dd-clear" id="bs-dd-clear">\u2715 \u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0432\u0438\u0431\u0456\u0440 (${escapeHtml(current)})</button>` : "";
    const itemsHtml = filtered.length ? filtered.map(
      (s) => `<button class="bs-dd-item${s === current ? " sel" : ""}" data-stop="${escapeHtml(s)}">
           ${escapeHtml(s)}
         </button>`
    ).join("") : `<div class="bs-dd-empty">\u0417\u0443\u043F\u0438\u043D\u043A\u0443 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E</div>`;
    return clearHtml + itemsHtml;
  }
  function attachDropdownListListeners() {
    const dd = document.getElementById("bs-dropdown");
    if (!dd)
      return;
    document.getElementById("bs-dd-clear")?.addEventListener("click", () => {
      selectStop("", activeField);
    });
    dd.querySelectorAll(".bs-dd-item").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => selectStop(btn.dataset.stop, activeField));
    });
  }
  function updateDropdownList(query) {
    const list = document.querySelector("#bs-dropdown .bs-dd-list");
    if (!list)
      return;
    list.innerHTML = buildDropdownListHtml(query);
    attachDropdownListListeners();
  }
  function renderDropdownItems(query) {
    const dd = document.getElementById("bs-dropdown");
    if (!dd)
      return;
    const title = activeField === "from" ? "\u0417\u0432\u0456\u0434\u043A\u0438 \u0457\u0434\u0435\u0442\u0435?" : "\u041A\u0443\u0434\u0438 \u0457\u0434\u0435\u0442\u0435?";
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
      ${buildDropdownListHtml(query)}
    </div>
  `;
    document.getElementById("bs-dd-filter")?.addEventListener("input", (e) => {
      updateDropdownList(e.target.value);
    });
    document.getElementById("bs-dd-x")?.addEventListener("click", closeDropdown);
    attachDropdownListListeners();
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
    renderSearchPanel();
    renderSmartRow();
    renderRouteList();
  }
  function parseRouteEndpoints(name) {
    const clean = name.replace(/-\s*/g, " ").replace(/\s+/g, " ").trim();
    const noVia = clean.split(" \u0447/\u0437 ")[0].trim();
    const parts = noVia.split(" ");
    return [parts[0], parts[parts.length - 1]];
  }
  function renderRouteMapV4(route, timings) {
    const stops = route.stops;
    const totalKm = stops[stops.length - 1].km || 1;
    const pct = (timings.progress * 100).toFixed(1);
    const [labelA, labelB] = parseRouteEndpoints(route.name || "");
    const movingDot = timings.state === "enroute" ? `<span class="bhv4-dot bhv4-dot--current" style="left:${pct}%"></span>` : "";
    const dotsHtml = stops.map((s) => {
      const dotPct = totalKm ? s.km / totalKm * 100 : 0;
      const isPassed = totalKm ? s.km / totalKm <= timings.progress + 0.01 : false;
      return `<span class="bhv4-dot${isPassed ? " bhv4-dot--passed" : ""}"
                  style="left:${dotPct.toFixed(1)}%"></span>`;
    }).join("");
    const labelsHtml = `<span class="bhv4-label bhv4-label--a">${escapeHtml(labelA.toUpperCase())}</span><span class="bhv4-label bhv4-label--b">${escapeHtml(labelB.toUpperCase())}</span>`;
    return `
    <div class="bhv4-map" aria-hidden="true">
      <div class="bhv4-labels bhv4-dyn">${labelsHtml}</div>
      <div class="bhv4-track">
        <div class="bhv4-fill" style="width:${pct}%"></div>
        ${dotsHtml}
        ${movingDot}
      </div>
    </div>`;
  }
  function buildHeroCard(route, timings, index, total, seg = null) {
    const [routeA, routeB] = parseRouteEndpoints(route.name || "");
    const segFrom = seg?.boardingStop || null;
    const segTo = seg?.alightingStop || null;
    const hasSeg = !!(segFrom && segTo && (segFrom.toUpperCase() !== routeA.toUpperCase() || segTo.toUpperCase() !== routeB.toUpperCase()));
    const effFrom = hasSeg ? segFrom : getEffectiveFrom(route);
    const effTo = hasSeg ? segTo : getEffectiveTo(route);
    const fromTime = getStopHHMM(route, effFrom);
    const toTime = getStopHHMM(route, effTo);
    const isEnroute = timings.state === "enroute";
    const isUrgent = timings.state === "waiting" && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;
    const fromMin = hasSeg ? getStopMins(route, segFrom) : timings.fromMin;
    const toMin = hasSeg ? getStopMins(route, segTo) : timings.toMin;
    const durMins = fromMin !== null && toMin !== null ? toMin - fromMin : null;
    const durStr = durMins !== null ? durMins >= 60 ? `${Math.floor(durMins / 60)} \u0433\u043E\u0434${durMins % 60 ? " " + durMins % 60 + " \u0445\u0432" : ""}` : `${durMins} \u0445\u0432` : "";
    const statusDotClass = isEnroute ? "enroute" : isUrgent ? "urgent" : "waiting";
    const statusDot = `<span class="bhv4-state-dot bhv4-state-dot--${statusDotClass}"></span>`;
    const statusText = isEnroute ? "\u0432 \u0434\u043E\u0440\u043E\u0437\u0456" : isUrgent ? "\u0432\u0456\u0434\u043F\u0440\u0430\u0432\u043B\u044F\u0454\u0442\u044C\u0441\u044F" : "\u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F";
    const lastKnownStop = route.stops[route.stops.length - 1].name;
    const displayNext = timings.nextStop === lastKnownStop ? routeB : timings.nextStop || routeB;
    let nextStopContent = "";
    if (isEnroute) {
      if (hasSeg) {
        const boardMins = getStopMins(route, segFrom);
        if (boardMins !== null && boardMins - nowMinutes() > 0) {
          nextStopContent = `\u0414\u041E ${segFrom.toUpperCase()} \u0417\u0410 ${fmtMins(boardMins - nowMinutes()).toUpperCase()}`;
        } else {
          nextStopContent = `\u041D\u0410\u0421\u0422\u0423\u041F\u041D\u0410 \u0417\u0423\u041F\u0418\u041D\u041A\u0410 \u2014 ${displayNext.toUpperCase()}`;
        }
      } else {
        nextStopContent = `\u041D\u0410\u0421\u0422\u0423\u041F\u041D\u0410 \u0417\u0423\u041F\u0418\u041D\u041A\u0410 \u2014 ${displayNext.toUpperCase()}`;
      }
    } else if (timings.state === "waiting" && timings.minsToDeparture !== null) {
      nextStopContent = formatCountdownUpper(timings.minsToDeparture);
    }
    const dotsHtml = total > 1 ? Array.from(
      { length: total },
      (_, i) => `<span class="bhv4-dot-nav${i === index ? " bhv4-dot-nav--active" : ""}" data-idx="${i}"></span>`
    ).join("") : "";
    const heroTrackBtnHtml = seg ? `<button class="bhv4-hero-track-btn" data-untrack-id="${escapeHtml(route.id)}" aria-label="\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438 \u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0435\u043D\u043D\u044F"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>` : "";
    const routeTitle = hasSeg ? `${escapeHtml(segFrom.toUpperCase())} \u2192 ${escapeHtml(segTo.toUpperCase())}` : `${escapeHtml(routeA.toUpperCase())} \u2192 ${escapeHtml(routeB.toUpperCase())}`;
    const routeFullHtml = hasSeg ? `<div class="bhv4-route-full bhv4-dyn">${escapeHtml(routeA.toUpperCase())} \u2192 ${escapeHtml(routeB.toUpperCase())}</div>` : "";
    return `
    <div class="bhv4${isUrgent ? " bhv4--urgent" : ""}${isEnroute ? " bhv4--enroute" : ""}">
      <img class="bhv4-bg-img" src="./images/bus-hero2.png" alt="" aria-hidden="true">
      <div class="bhv4-overlay"></div>

      <span class="bhv4-dots-nav">${dotsHtml}${heroTrackBtnHtml}</span>

      <div class="bhv4-content">
        <div class="bhv4-topbar">
          <span class="bhv4-status">
            <svg class="bhv4-bus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="13" rx="2"/>
              <path d="M2 9h20"/>
              <path d="M8 4v5M16 4v5"/>
              <circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>
              <path d="M5.5 17H2v2.5M18.5 17H22v2.5"/>
            </svg>
            <span class="bhv4-dyn"><span class="bhv4-status-text">${statusText}</span> <span class="bhv4-status-dot">${statusDot}</span></span>
          </span>
        </div>

        <div class="bhv4-body">
          <div class="bhv4-left">
            <div class="bhv4-route-name bhv4-dyn">${escapeHtml(hasSeg ? `${segFrom.toUpperCase()} \u2192 ${segTo.toUpperCase()}` : `${routeA.toUpperCase()} \u2192 ${routeB.toUpperCase()}`)}</div>
            <div class="bhv4-times-row">
              <span class="bhv4-time-capsule"><span class="bhv4-dyn bhv4-capsule-inner">${escapeHtml(fromTime || "\u2014")} \u2192 ${escapeHtml(toTime || "\u2014")}</span></span>
              <span class="bhv4-duration bhv4-dyn">${escapeHtml(durStr)}</span>
            </div>
            <div class="bhv4-next-stop bhv4-dyn">${escapeHtml(nextStopContent)}</div>
          </div>
        </div>

        ${hasSeg ? `<div class="bhv4-full-route bhv4-dyn">${escapeHtml(routeA.toUpperCase())} \u2192 ${escapeHtml(routeB.toUpperCase())}</div>` : ""}
        <div class="bhv4-map-outer">${renderRouteMapV4(route, timings)}</div>
      </div>
    </div>`;
  }
  function renderSmartRow() {
    const el = document.getElementById("bus-smart-row");
    if (!el)
      return;
    const routes = findActiveRoutes();
    if (!routes.length) {
      el.innerHTML = "";
      return;
    }
    if (smartRowIndex >= routes.length)
      smartRowIndex = 0;
    const route = routes[smartRowIndex];
    const timings = getTimingsForDisplay(route);
    const seg = getTrackedSegmentForHero(route.id, route);
    el.innerHTML = buildHeroCard(route, timings, smartRowIndex, routes.length, seg);
    let touchStartX = 0;
    const card = el.firstElementChild;
    card.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    card.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40)
        return;
      smartRowIndex = dx < 0 ? (smartRowIndex + 1) % routes.length : (smartRowIndex - 1 + routes.length) % routes.length;
      switchHeroCard();
    }, { passive: true });
    el.querySelectorAll(".bhv4-dot-nav").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        smartRowIndex = parseInt(e.target.dataset.idx, 10);
        switchHeroCard();
      });
    });
    const heroTrackBtn = el.querySelector(".bhv4-hero-track-btn");
    if (heroTrackBtn) {
      heroTrackBtn.addEventListener("click", () => {
        const rid = heroTrackBtn.dataset.untrackId;
        const entry = getTrackedSegmentForHero(rid, route);
        if (entry) {
          unsubscribeFromPush(entry.routeId, entry.trackDate);
          removeTrackedEntry(entry);
          checkTrackNotifications(false);
          renderSmartRow();
          renderRouteList();
        }
      });
    }
  }
  function switchHeroCard() {
    const el = document.getElementById("bus-smart-row");
    if (!el)
      return;
    const card = el.querySelector(".bhv4");
    if (!card) {
      renderSmartRow();
      renderRouteList();
      return;
    }
    const dyns = card.querySelectorAll(".bhv4-dyn");
    dyns.forEach((d) => {
      d.style.transition = "opacity 0.08s ease";
      d.style.opacity = "0";
    });
    setTimeout(() => {
      const routes = findActiveRoutes();
      if (!routes.length) {
        renderSmartRow();
        renderRouteList();
        return;
      }
      if (smartRowIndex >= routes.length)
        smartRowIndex = 0;
      const route = routes[smartRowIndex];
      const timings = getTimingsForDisplay(route);
      const seg = getTrackedSegmentForHero(route.id, route);
      const [routeA, routeB] = parseRouteEndpoints(route.name || "");
      const segFrom = seg?.boardingStop || null;
      const segTo = seg?.alightingStop || null;
      const hasSeg = !!(segFrom && segTo && (segFrom.toUpperCase() !== routeA.toUpperCase() || segTo.toUpperCase() !== routeB.toUpperCase()));
      const isEnroute = timings.state === "enroute";
      const isUrgent = timings.state === "waiting" && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;
      card.className = `bhv4${isUrgent ? " bhv4--urgent" : ""}${isEnroute ? " bhv4--enroute" : ""}`;
      const dotsNav = card.querySelector(".bhv4-dots-nav");
      if (dotsNav) {
        const trackBtnHtml = seg ? `<button class="bhv4-hero-track-btn" data-untrack-id="${escapeHtml(route.id)}" aria-label="\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438 \u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0435\u043D\u043D\u044F"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>` : "";
        const newDotsHtml = routes.length > 1 ? Array.from(
          { length: routes.length },
          (_, i) => `<span class="bhv4-dot-nav${i === smartRowIndex ? " bhv4-dot-nav--active" : ""}" data-idx="${i}"></span>`
        ).join("") : "";
        dotsNav.innerHTML = newDotsHtml + trackBtnHtml;
        dotsNav.querySelectorAll(".bhv4-dot-nav").forEach(
          (dot) => dot.addEventListener("click", (e) => {
            smartRowIndex = +e.target.dataset.idx;
            switchHeroCard();
          })
        );
        const heroBtn = dotsNav.querySelector(".bhv4-hero-track-btn");
        if (heroBtn) {
          heroBtn.addEventListener("click", () => {
            const entry = getTrackedSegmentForHero(route.id, route);
            if (entry) {
              unsubscribeFromPush(entry.routeId, entry.trackDate);
              removeTrackedEntry(entry);
              checkTrackNotifications(false);
              renderSmartRow();
              renderRouteList();
            }
          });
        }
      }
      const statusWrap = card.querySelector(".bhv4-status .bhv4-dyn");
      if (statusWrap) {
        const txt = isEnroute ? "\u0432 \u0434\u043E\u0440\u043E\u0437\u0456" : isUrgent ? "\u0432\u0456\u0434\u043F\u0440\u0430\u0432\u043B\u044F\u0454\u0442\u044C\u0441\u044F" : "\u043E\u0447\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F";
        const dotCls = isEnroute ? "enroute" : isUrgent ? "urgent" : "waiting";
        const dot = `<span class="bhv4-state-dot bhv4-state-dot--${dotCls}"></span>`;
        statusWrap.innerHTML = `<span class="bhv4-status-text">${txt}</span> <span class="bhv4-status-dot">${dot}</span>`;
      }
      const nameEl = card.querySelector(".bhv4-route-name");
      const existingFull = card.querySelector(".bhv4-route-full");
      if (nameEl) {
        if (hasSeg) {
          nameEl.textContent = `${segFrom.toUpperCase()} \u2192 ${segTo.toUpperCase()}`;
          if (existingFull) {
            existingFull.textContent = `${routeA.toUpperCase()} \u2192 ${routeB.toUpperCase()}`;
          } else {
            const fullEl = document.createElement("div");
            fullEl.className = "bhv4-route-full bhv4-dyn";
            fullEl.textContent = `${routeA.toUpperCase()} \u2192 ${routeB.toUpperCase()}`;
            nameEl.insertAdjacentElement("afterend", fullEl);
          }
        } else {
          nameEl.textContent = `${routeA.toUpperCase()} \u2192 ${routeB.toUpperCase()}`;
          if (existingFull)
            existingFull.remove();
        }
      }
      const capsuleEl = card.querySelector(".bhv4-capsule-inner");
      if (capsuleEl) {
        const dispFrom = hasSeg ? segFrom : getEffectiveFrom(route);
        const dispTo = hasSeg ? segTo : getEffectiveTo(route);
        capsuleEl.textContent = `${getStopHHMM(route, dispFrom) || "\u2014"} \u2192 ${getStopHHMM(route, dispTo) || "\u2014"}`;
      }
      const durEl = card.querySelector(".bhv4-duration");
      if (durEl) {
        const dFrom = hasSeg ? getStopMins(route, segFrom) : timings.fromMin;
        const dTo = hasSeg ? getStopMins(route, segTo) : timings.toMin;
        const d = dFrom !== null && dTo !== null ? dTo - dFrom : null;
        durEl.textContent = d !== null ? d >= 60 ? `${Math.floor(d / 60)} \u0433\u043E\u0434${d % 60 ? " " + d % 60 + " \u0445\u0432" : ""}` : `${d} \u0445\u0432` : "";
      }
      const nextEl = card.querySelector(".bhv4-next-stop");
      if (nextEl) {
        const lastStop = route.stops[route.stops.length - 1].name;
        const dispNext = timings.nextStop === lastStop ? routeB : timings.nextStop || routeB;
        let nextContent = "";
        if (isEnroute) {
          if (hasSeg) {
            const boardMins = getStopMins(route, segFrom);
            if (boardMins !== null && boardMins - nowMinutes() > 0) {
              nextContent = `\u0414\u041E ${segFrom.toUpperCase()} \u0417\u0410 ${fmtMins(boardMins - nowMinutes()).toUpperCase()}`;
            } else {
              nextContent = `\u041D\u0410\u0421\u0422\u0423\u041F\u041D\u0410 \u0417\u0423\u041F\u0418\u041D\u041A\u0410 \u2014 ${dispNext.toUpperCase()}`;
            }
          } else {
            nextContent = `\u041D\u0410\u0421\u0422\u0423\u041F\u041D\u0410 \u0417\u0423\u041F\u0418\u041D\u041A\u0410 \u2014 ${dispNext.toUpperCase()}`;
          }
        } else if (isUrgent || timings.state === "waiting" && timings.minsToDeparture !== null) {
          nextContent = formatCountdownUpper(timings.minsToDeparture);
        }
        nextEl.textContent = nextContent;
      }
      const labelsEl = card.querySelector(".bhv4-labels");
      if (labelsEl) {
        labelsEl.innerHTML = `<span class="bhv4-label bhv4-label--a">${escapeHtml(routeA.toUpperCase())}</span><span class="bhv4-label bhv4-label--b">${escapeHtml(routeB.toUpperCase())}</span>`;
      }
      const mapOuter = card.querySelector(".bhv4-map-outer");
      if (mapOuter) {
        const pct = (timings.progress * 100).toFixed(1);
        const totalKm = route.stops[route.stops.length - 1].km || 1;
        const movingDot = timings.state === "enroute" ? `<span class="bhv4-dot bhv4-dot--current" style="left:${pct}%"></span>` : "";
        const dotsHtml = route.stops.map((s) => {
          const dp = totalKm ? s.km / totalKm * 100 : 0;
          const passed = totalKm ? s.km / totalKm <= timings.progress + 0.01 : false;
          return `<span class="bhv4-dot${passed ? " bhv4-dot--passed" : ""}" style="left:${dp.toFixed(1)}%"></span>`;
        }).join("");
        const track = mapOuter.querySelector(".bhv4-track");
        if (track)
          track.innerHTML = `<div class="bhv4-fill" style="width:${pct}%"></div>${dotsHtml}${movingDot}`;
      }
      renderRouteList();
      card.querySelectorAll(".bhv4-dyn").forEach((d) => {
        d.style.opacity = "0";
        d.style.transition = "opacity 0.12s ease";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          d.style.opacity = "1";
        }));
      });
    }, 80);
  }
  function renderRouteList() {
    const el = document.getElementById("bus-list");
    if (!el)
      return;
    const all = getFilteredRoutes();
    const future = all.filter((r) => !isPastRoute(r));
    const past = all.filter((r) => isPastRoute(r));
    const toRender = isViewingToday() ? showAll ? [...future, ...past] : future : all;
    if (!all.length) {
      const dd0 = getDayData();
      const updStr0 = dd0.fetchedTime ? `\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${escapeHtml(dd0.fetchedTime)} | ${escapeHtml(dd0.fetchedAt)}` : "\u0414\u0430\u043D\u0456 \u043E\u043D\u043E\u0432\u043B\u044E\u044E\u0442\u044C\u0441\u044F...";
      const titleHtml0 = buildListTitleHtml(updStr0);
      const hasFilter = fromStop || toStop;
      if (hasFilter) {
        const msg = `\u041D\u0430 ${isViewingToday() ? "\u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456" : dd0.fetchedAt || "\u0446\u0435\u0439 \u0434\u0435\u043D\u044C"} \u0440\u0435\u0439\u0441\u0456\u0432 ${fromStop ? `\u0437 ${fromStop}` : ""}${fromStop && toStop ? " \u0434\u043E " : ""}${toStop || ""} \u043D\u0435 \u0437\u0430\u043F\u043B\u0430\u043D\u043E\u0432\u0430\u043D\u043E`;
        el.innerHTML = titleHtml0 + `<div class="empty-state">${msg}</div>`;
      } else {
        const noMoreMsg = isViewingToday() ? `<div class="bhv4-empty">\u0421\u042C\u041E\u0413\u041E\u0414\u041D\u0406 \u0420\u0415\u0419\u0421\u0406\u0412 \u0411\u0406\u041B\u042C\u0428\u0415 \u041D\u0415 \u0417\u0410\u041F\u041B\u0410\u041D\u041E\u0412\u0410\u041D\u041E</div>` : `<div class="bhv4-empty">\u041D\u0410 \u0426\u0415\u0419 \u0414\u0415\u041D\u042C \u0420\u0415\u0419\u0421\u0406\u0412 \u041D\u0415 \u0417\u041D\u0410\u0419\u0414\u0415\u041D\u041E</div>`;
        el.innerHTML = titleHtml0 + noMoreMsg;
        const updRow2 = document.getElementById("buses-updated-row");
        if (updRow2 && busData) {
          updRow2.innerHTML = buildSourceHtml();
        }
      }
      return;
    }
    if (!toRender.length) {
      const dd1 = getDayData();
      const updStr1 = dd1.fetchedTime ? `\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${escapeHtml(dd1.fetchedTime)} | ${escapeHtml(dd1.fetchedAt)}` : "\u0414\u0430\u043D\u0456 \u043E\u043D\u043E\u0432\u043B\u044E\u044E\u0442\u044C\u0441\u044F...";
      const noMoreMsg = isViewingToday() ? `<div class="bhv4-empty">\u0421\u042C\u041E\u0413\u041E\u0414\u041D\u0406 \u0420\u0415\u0419\u0421\u0406\u0412 \u0411\u0406\u041B\u042C\u0428\u0415 \u041D\u0415 \u0417\u0410\u041F\u041B\u0410\u041D\u041E\u0412\u0410\u041D\u041E</div>` : "";
      el.innerHTML = buildListTitleHtml(updStr1) + `
      <button class="bus-show-all" id="bus-show-all-btn">
        \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 ${all.length} \u0440\u0435\u0439\u0441\u0438 \u2193
      </button>${noMoreMsg}`;
      document.getElementById("bus-show-all-btn").addEventListener("click", () => {
        showAll = true;
        renderRouteList();
      });
      return;
    }
    const activeRoutes = findActiveRoutes();
    const highlighted = activeRoutes[smartRowIndex] || findNextRoute();
    const carrierInfo = (id) => busData.carriers?.[id] || { name: id, phone: "0332 224 500" };
    const buildCard = (route) => {
      const isPast = isPastRoute(route);
      const isNext = highlighted && route.id === highlighted.id;
      const isSelectable = !isViewingToday();
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
      const trackedSeg = getTrackedSegmentForHero(route.id, route);
      const [rA, rB] = parseRouteEndpoints(route.name || "");
      const hasTrackedSeg = !!(trackedSeg?.boardingStop && trackedSeg?.alightingStop && (trackedSeg.boardingStop.toUpperCase() !== rA.toUpperCase() || trackedSeg.alightingStop.toUpperCase() !== rB.toUpperCase()));
      const hlFrom = !fromStop && !toStop && hasTrackedSeg ? trackedSeg.boardingStop : effFrom;
      const hlTo = !fromStop && !toStop && hasTrackedSeg ? trackedSeg.alightingStop : effTo;
      const isEnroute = isViewingToday() && getRouteState(route) === "enroute" && route.status !== "cancelled";
      const liveTimings = isEnroute ? getRouteTimings(route) : null;
      const liveCurrentStop = liveTimings?.currentStop || null;
      const liveNextStop = liveTimings?.nextStop || null;
      const fromIdx = route.stops.findIndex((s) => s.name === effFrom);
      const stopsHtml = route.stops.map((s, idx) => {
        const isFrom = s.name === hlFrom;
        const isTo = s.name === hlTo;
        const hl = isFrom || isTo;
        const isCurrent = isEnroute && s.name === liveCurrentStop;
        const isNextS = isEnroute && s.name === liveNextStop;
        const t = getStopHHMM(route, s.name);
        let cls = "bs-stop-row";
        if (isFrom)
          cls += " hl hl--from";
        else if (isTo)
          cls += " hl hl--to";
        if (isCurrent)
          cls += " bs-stop--current";
        if (isNextS)
          cls += " bs-stop--next";
        const prefixHtml = isCurrent ? '<span class="bs-stop-icon bs-stop-icon--current"></span>' : isNextS && !isTo ? '<span class="bs-stop-icon bs-stop-icon--next">\u25B7</span>' : isFrom ? '<span class="bs-stop-icon bs-stop-icon--from">\u25CF</span>' : isTo ? '<span class="bs-stop-icon bs-stop-icon--to"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg></span>' : "";
        const priceHtml = "";
        return `
        <div class="${cls}">
          <span class="bs-stop-time">${escapeHtml(t || "\u2014")}</span>
          <span class="bs-stop-name">${prefixHtml}${escapeHtml(s.name.toUpperCase())}</span>
          ${priceHtml}
        </div>`;
      }).join("");
      const liveDot = isEnroute ? `<span class="bs-live-dot"></span>` : "";
      const statusBadge = route.status === "cancelled" ? `<span class="bs-status cancelled">\u0421\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E</span>` : route.status === "delayed" ? `<span class="bs-status delayed">\u0417\u0430\u0442\u0440\u0438\u043C\u043A\u0430</span>` : "";
      const autoNote = route.auto_generated ? `<div class="bs-autogen">\u0440\u043E\u0437\u0440\u0430\u0445\u043E\u0432\u0430\u043D\u0438\u0439 \u0437\u0432\u043E\u0440\u043E\u0442\u043D\u0438\u0439 \u0440\u0435\u0439\u0441</div>` : "";
      const [ep1, ep2] = parseRouteEndpoints(route.name);
      const fromDiffers = fromStop && route.stops.some((s) => s.name === fromStop) && ep1.toUpperCase() !== fromStop.toUpperCase();
      const toDiffers = toStop && route.stops.some((s) => s.name === toStop) && ep2.toUpperCase() !== toStop.toUpperCase();
      const anySegment = fromDiffers || toDiffers;
      const routeStartTime = getStopHHMM(route, route.stops[0].name);
      const routeEndTime = getStopHHMM(route, route.stops[route.stops.length - 1].name);
      const routeTimeStr = routeStartTime && routeEndTime ? ` | ${routeStartTime} \u2192 ${routeEndTime}` : "";
      const routeLabel = anySegment ? `${effFrom.toUpperCase()} - ${effTo.toUpperCase()}` : `${ep1.toUpperCase()} \u2192 ${ep2.toUpperCase()}`;
      const fullLabel = anySegment ? `<span class="bs-route-full">${escapeHtml(ep1.toUpperCase())} \u2192 ${escapeHtml(ep2.toUpperCase())}${escapeHtml(routeTimeStr)}</span>` : "";
      const trackedSegDepTime = hasTrackedSeg ? getStopHHMM(route, trackedSeg.boardingStop) : null;
      const trackedSegArrival = hasTrackedSeg ? getStopHHMM(route, trackedSeg.alightingStop) : null;
      const trackedSegTimeStr = trackedSegDepTime && trackedSegArrival ? ` | ${trackedSegDepTime} - ${trackedSegArrival}` : trackedSegDepTime ? ` | ${trackedSegDepTime}` : "";
      const trackedSegSubtitle = !anySegment && hasTrackedSeg ? `<span class="bs-route-full"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>${escapeHtml(trackedSeg.boardingStop.toUpperCase())} - ${escapeHtml(trackedSeg.alightingStop.toUpperCase())}${escapeHtml(trackedSegTimeStr)}</span>` : "";
      return `
      <div class="bus-card${isPast ? " past" : ""}${isNext ? " next" : ""}${isSelectable ? " selectable" : ""}${isEnroute ? " enroute" : ""}" data-route-id="${escapeHtml(route.id)}">
        ${(() => {
        if (isEnroute)
          return '<span class="bs-live-corner"><span class="bs-live-label">\u0412 \u0414\u041E\u0420\u041E\u0417\u0406</span><span class="bs-live-dot"></span></span>';
        if (route.status === "cancelled")
          return '<span class="bs-live-corner"><span class="bs-status cancelled">\u0421\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E</span></span>';
        if (isViewingToday() && !isPast && route.status !== "cancelled") {
          const minsLeft = getRouteTimings(route).minsToDeparture;
          if (minsLeft !== null && minsLeft <= 15 && minsLeft > 0) {
            return `<span class="bs-live-corner bs-live-corner--soon"><span class="bs-soon-badge"><span class="bs-soon-label">\u0427\u0415\u0420\u0415\u0417 ${minsLeft} \u0425\u0412</span><span class="bs-soon-dot"></span></span></span>`;
          }
        }
        return "";
      })()}
        <div class="bus-card-main">
          <div class="bs-time-block">
            <span class="bus-card-time">${escapeHtml(fromTime || "\u2014")}</span>
            <span class="bs-arr">${escapeHtml(toTime || "\u2014")}</span>
          </div>
          <div class="bus-card-info">
            <div class="bus-card-route">${trackedSegSubtitle}${escapeHtml(routeLabel)}${fullLabel}</div>
            <div class="bus-card-meta">
              <span>\u041E\u0440\u0456\u0454\u043D\u0442\u043E\u0432\u043D\u043E: <span style="white-space:nowrap">${escapeHtml(durStr)}</span></span>
              <span class="bus-meta-sep">\xB7</span>
              <span>${c.name.split("\n").map(escapeHtml).join("<br>")}</span>
            </div>
            ${autoNote}
          </div>
          ${busDay >= getTodayISO() && !isPast && route.status !== "cancelled" ? `<button class="bs-track-btn${isRouteSegmentTracked(route.id) ? hasTrackedSeg && !anySegment ? " tracked-seg" : " tracked" : ""}" data-track-id="${escapeHtml(route.id)}" aria-label="${isRouteSegmentTracked(route.id) ? "\u041D\u0435 \u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0443\u0432\u0430\u0442\u0438" : "\u0412\u0456\u0434\u0441\u0442\u0435\u0436\u0438\u0442\u0438 \u043C\u0430\u0440\u0448\u0440\u0443\u0442"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>` : ""}
        </div>
        ${route.stops && route.stops.length > 2 ? `<button class="bs-toggle" data-id="${escapeHtml(route.id)}">
               ${expanded ? "\u0421\u0425\u041E\u0412\u0410\u0422\u0418 \u0417\u0423\u041F\u0418\u041D\u041A\u0418" : "\u0412\u0421\u0406 \u0417\u0423\u041F\u0418\u041D\u041A\u0418"} <span class="bs-toggle-arr">${expanded ? "\u25B4" : "\u25BE"}</span>
             </button>
             <div class="bs-stops-body"${expanded ? "" : " hidden"}>${stopsHtml}</div>` : route.vopas_url ? `<a class="bs-vopas-link" href="${escapeHtml(route.vopas_url)}" target="_blank" rel="noopener">\u0423\u0441\u0456 \u0437\u0443\u043F\u0438\u043D\u043A\u0438 \u0440\u0435\u0439\u0441\u0443 \u043D\u0430 VOPAS \u2192</a>` : ""}
      </div>`;
    };
    let toggleHtml = "";
    let noMoreHtml = "";
    if (isViewingToday()) {
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
      if (future.length === 0 && all.length > 0) {
        noMoreHtml = `<div class="bhv4-empty">\u0421\u042C\u041E\u0413\u041E\u0414\u041D\u0406 \u0420\u0415\u0419\u0421\u0406\u0412 \u0411\u0406\u041B\u042C\u0428\u0415 \u041D\u0415 \u0417\u0410\u041F\u041B\u0410\u041D\u041E\u0412\u0410\u041D\u041E</div>`;
      }
    }
    let cards;
    if (isViewingToday() && showAll && past.length > 0) {
      const futureCards = future.map(buildCard).join("");
      const pastCards = past.map(buildCard).join("");
      cards = futureCards + toggleHtml + pastCards + noMoreHtml;
      toggleHtml = "";
      noMoreHtml = "";
    } else {
      cards = toRender.map(buildCard).join("");
    }
    const updRow = document.getElementById("buses-updated-row");
    if (updRow && busData)
      updRow.innerHTML = buildSourceHtml();
    const dd = getDayData();
    const updatedStr2 = dd.fetchedTime ? `\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${escapeHtml(dd.fetchedTime)} | ${escapeHtml(dd.fetchedAt)}` : "\u0414\u0430\u043D\u0456 \u043E\u043D\u043E\u0432\u043B\u044E\u044E\u0442\u044C\u0441\u044F...";
    el.innerHTML = buildListTitleHtml(updatedStr2) + cards + toggleHtml + noMoreHtml;
    el.querySelectorAll(".bs-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (expandedIds.has(id))
          expandedIds.delete(id);
        else
          expandedIds.add(id);
        renderRouteList();
      });
    });
    el.querySelectorAll(".bs-track-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const rid = btn.dataset.trackId;
        const tracked = isRouteSegmentTracked(rid);
        if (tracked) {
          const entry = findTrackedEntry(rid, fromStop || null, toStop || null);
          if (entry) {
            removeTrackedEntry(entry);
            unsubscribeFromPush(rid, busDay);
          }
        } else {
          const existing = trackedRoutes.find((t) => t.routeId === rid && t.trackDate === busDay);
          trackedRoutes.push({
            routeId: rid,
            trackDate: busDay,
            boardingStop: fromStop || null,
            alightingStop: toStop || null,
            notifiedDep: existing ? existing.notifiedDep : false,
            notifiedWarning: existing ? existing.notifiedWarning : false,
            notifiedCanc: false,
            notifiedBoard: false,
            notifiedFuture: false
          });
          saveTrackedRoute();
          const route = (getDayData().routes || []).find((r) => r.id === rid);
          const depTime = route ? getStopHHMM(route, fromStop || route.stops[0].name) : null;
          subscribeToPush(rid, route?.name || "", fromStop || null, toStop || null, busDay, depTime);
        }
        checkTrackNotifications(true);
        renderSmartRow();
        renderRouteList();
      });
    });
    if (!isViewingToday()) {
      el.querySelectorAll(".bus-card.selectable").forEach((card) => {
        card.addEventListener("click", () => {
          const rid = card.dataset.routeId;
          if (!rid)
            return;
          selectedRouteId = rid;
          renderSmartRow();
          renderRouteList();
          document.getElementById("bus-smart-row")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      });
    }
    const showAllBtn = document.getElementById("bus-show-all-btn");
    if (showAllBtn) {
      showAllBtn.addEventListener("click", () => {
        showAll = !showAll;
        renderRouteList();
      });
    }
  }
  function getWeekDays(page = 0) {
    const now = /* @__PURE__ */ new Date();
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - dow + page * 7);
    mon.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  }
  function renderWeekStrip() {
    const el = document.getElementById("bus-week-strip");
    if (!el)
      return;
    const todayISO = getTodayISO();
    const dayNames = ["\u041F\u043D", "\u0412\u0442", "\u0421\u0440", "\u0427\u0442", "\u041F\u0442", "\u0421\u0431", "\u041D\u0434"];
    function pageHtml(page) {
      return '<div class="bus-week-days">' + getWeekDays(page).map((d, i) => {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const num = String(d.getDate()).padStart(2, "0");
        return `<button class="bus-week-day${iso === todayISO ? " bus-week-day--today" : ""}${iso === busDay ? " bus-week-day--active" : ""}${iso < todayISO ? " bus-week-day--past" : ""}" data-iso="${iso}">
          <span class="bus-week-day-name">${dayNames[i]}</span>
          <span class="bus-week-day-num">${num}</span>
        </button>`;
      }).join("") + "</div>";
    }
    el.innerHTML = `
    <div class="bus-week-track">
      ${pageHtml(0)}
      ${pageHtml(1)}
    </div>
    <div class="bus-week-pages">
      <span class="bus-week-page-dot${weekPage === 0 ? " active" : ""}" data-page="0"></span>
      <span class="bus-week-page-dot${weekPage === 1 ? " active" : ""}" data-page="1"></span>
    </div>`;
    const track = el.querySelector(".bus-week-track");
    track.style.transform = `translateX(-${weekPage * 50}%)`;
    el.querySelectorAll(".bus-week-day").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (track.dataset.swiped === "1")
          return;
        busDay = btn.dataset.iso;
        showAll = false;
        smartRowIndex = 0;
        selectedRouteId = null;
        renderWeekStrip();
        renderSmartRow();
        renderRouteList();
      });
    });
    el.querySelectorAll(".bus-week-page-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        weekPage = parseInt(dot.dataset.page, 10);
        track.style.transition = "transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        track.style.transform = `translateX(-${weekPage * 50}%)`;
        el.querySelectorAll(".bus-week-page-dot").forEach(
          (d) => d.classList.toggle("active", parseInt(d.dataset.page) === weekPage)
        );
      });
    });
    let startX = 0, startY = 0, isHorizSwipe = null;
    track.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isHorizSwipe = null;
      track.dataset.swiped = "0";
      track.style.transition = "none";
    }, { passive: true });
    track.addEventListener("touchmove", (e) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (isHorizSwipe === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        isHorizSwipe = Math.abs(dx) > Math.abs(dy);
      }
      if (!isHorizSwipe)
        return;
      e.preventDefault();
      const clamped = weekPage === 0 ? Math.min(dx, 0) : Math.max(dx, 0);
      track.style.transform = `translateX(calc(-${weekPage * 50}% + ${clamped}px))`;
    }, { passive: false });
    track.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const newPage = dx < -40 && weekPage === 0 ? 1 : dx > 40 && weekPage === 1 ? 0 : weekPage;
      track.style.transition = "transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      track.style.transform = `translateX(-${newPage * 50}%)`;
      if (newPage !== weekPage) {
        track.dataset.swiped = "1";
        weekPage = newPage;
        el.querySelectorAll(".bus-week-page-dot").forEach(
          (d) => d.classList.toggle("active", parseInt(d.dataset.page) === weekPage)
        );
      }
      setTimeout(() => {
        if (track.isConnected)
          track.dataset.swiped = "0";
      }, 350);
    }, { passive: true });
  }
  function renderSearchPanel() {
    const el = document.getElementById("bus-search-panel");
    if (!el)
      return;
    const hasFilter = fromStop || toStop;
    el.innerHTML = `
    <div class="bs-search-row">
      <div class="bs-search-field" id="bs-from-field">
        <span class="bs-field-icon bs-field-icon--from">\u25CF</span>
        <input class="bs-search-input bs-search-input--tap" id="bs-from-input"
               type="text" placeholder="\u0417\u0432\u0456\u0434\u043A\u0438"
               value="${escapeHtml(fromStop)}" readonly>
      </div>
      <button class="bs-swap-btn" id="bs-swap-btn" title="\u041F\u043E\u043C\u0456\u043D\u044F\u0442\u0438 \u043D\u0430\u043F\u0440\u044F\u043C\u043E\u043A">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 8l-4 4 4 4"/><path d="M19 8l4 4-4 4"/><line x1="1" y1="12" x2="23" y2="12"/>
        </svg>
      </button>
      <div class="bs-search-field" id="bs-to-field">
        <svg class="bs-field-icon bs-field-icon--to" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
        </svg>
        <input class="bs-search-input bs-search-input--tap" id="bs-to-input"
               type="text" placeholder="\u041A\u0443\u0434\u0438"
               value="${escapeHtml(toStop)}" readonly>
      </div>
    </div>
    ${hasFilter ? `<div class="bs-filter-clear-row"><button class="bs-filter-clear-btn" id="bs-reset-btn">\u2715 \u0421\u041A\u0418\u041D\u0423\u0422\u0418 \u0424\u0406\u041B\u042C\u0422\u0420</button></div>` : ""}
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
    const page = document.getElementById("page-buses");
    if (page)
      page.classList.toggle("filter-active", !!(fromStop || toStop));
  }
  function buildSourceHtml() {
    if (!busData?.source)
      return "";
    return `<a href="https://vopas.com.ua" target="_blank" rel="noopener" class="buses-updated-link">${escapeHtml(busData.source)}</a>`;
  }
  async function initBuses() {
    const el = document.getElementById("buses-content");
    if (!el)
      return;
    loadPrefs();
    loadTrackedRoute();
    if (!document.getElementById("bs-dropdown")) {
      const dd = document.createElement("div");
      dd.id = "bs-dropdown";
      dd.className = "bs-dropdown";
      dd.hidden = true;
      document.body.appendChild(dd);
    }
    if (!document.getElementById("bus-track-banner")) {
      const banner = document.createElement("div");
      banner.id = "bus-track-banner";
      banner.className = "bus-track-banner";
      banner.innerHTML = `
      <div class="btb-main">
        <div class="btb-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.75)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <span class="btb-check">\u2713</span>
        </div>
        <div class="btb-content">
          <div class="btb-route"></div>
          <div class="btb-label"></div>
        </div>
      </div>
      <div class="btb-hint">\u0421\u041F\u041E\u0412\u0406\u0429\u0415\u041D\u041D\u042F \u041F\u0420\u041E \u0420\u0415\u0419\u0421 \u0410\u041A\u0422\u0418\u0412\u041E\u0412\u0410\u041D\u041E</div>`;
      document.body.appendChild(banner);
      let _swipeStartY = 0;
      banner.addEventListener("touchstart", (e) => {
        _swipeStartY = e.touches[0].clientY;
        if (_bannerHideTimer) {
          clearTimeout(_bannerHideTimer);
          _bannerHideTimer = null;
        }
        banner.style.transition = "none";
      }, { passive: true });
      banner.addEventListener("touchmove", (e) => {
        const dy = e.touches[0].clientY - _swipeStartY;
        if (dy > 0)
          banner.style.transform = `translateX(-50%) translateY(${dy}px) scale(1)`;
      }, { passive: true });
      const _onBannerRelease = (dy) => {
        if (dy > 40) {
          banner.style.transition = "transform 0.25s cubic-bezier(0.4,0,1,1)";
          banner.style.transform = `translateX(-50%) translateY(${dy + 80}px) scale(0.85)`;
          setTimeout(() => {
            banner.style.transition = "";
            hideBanner();
          }, 260);
        } else {
          banner.style.transition = "transform 0.3s cubic-bezier(0.22,1,0.36,1)";
          banner.style.transform = "";
          setTimeout(() => {
            banner.style.transition = "";
          }, 320);
          _bannerHideTimer = setTimeout(() => {
            hideBanner();
            _bannerHideTimer = null;
          }, 3500);
        }
      };
      banner.addEventListener("touchend", (e) => {
        _onBannerRelease(e.changedTouches[0].clientY - _swipeStartY);
      });
      banner.addEventListener("touchcancel", () => {
        _onBannerRelease(0);
      });
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
      const res = await fetch(`./data/schedule.json?v=${Math.floor(Date.now() / 6e4)}`);
      if (!res.ok)
        throw new Error(res.status);
      busData = await res.json();
      const STOP_ALIASES = { "\u0413\u0430\u0440\u0430\u0434\u0436\u0430": "\u0413\u0430\u0440\u0430\u0437\u0434\u0436\u0430", "\u0425\u043E\u0440\u043B\u0443\u043F\u0438 \u043F\u043E\u0432.": "\u0425\u0440\u043E\u043C\u044F\u043A\u0456\u0432" };
      const normalizeStop = (name) => STOP_ALIASES[name] || name;
      const allDays = busData?.days ? Object.values(busData.days) : busData ? [busData] : [];
      allDays.forEach((day) => (day.routes || []).forEach(
        (r) => (r.stops || []).forEach((s) => {
          s.name = normalizeStop(s.name);
        })
      ));
    } catch {
      busData = null;
    }
    if (!busData) {
      el.innerHTML = '<div class="empty-state">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439</div>';
      return;
    }
    el.innerHTML = `
    <div id="bus-week-strip" class="bus-week-strip"></div>
    <div id="bus-search-panel" class="bus-search"></div>
    <div id="bus-smart-row" class="bus-smart-row"></div>
    <div id="bus-list" class="bus-list"></div>
    <div id="buses-updated-row" class="buses-updated"></div>
  `;
    busDay = getTodayISO();
    renderSearchPanel();
    renderWeekStrip();
    renderSmartRow();
    renderRouteList();
    setTimeout(() => checkTrackNotifications(), 4200);
    if (timerInterval)
      clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      renderSmartRow();
      renderRouteList();
      checkTrackNotifications();
    }, 6e4);
  }

  // src/tabs/community-blocks.js
  var cmBusIndex = 0;
  var cmBusEntries = [];
  var CM_TRACK_KEY = "bus_track_v2";
  function loadCmTracked(todayISO) {
    try {
      const d = JSON.parse(localStorage.getItem(CM_TRACK_KEY));
      if (d?.routes?.length)
        return d.routes.filter((t) => t.trackDate >= todayISO);
    } catch {
    }
    return [];
  }
  window.addEventListener("cstl-bus-track-changed", () => {
    renderBusBlock();
  });
  var BOARD_MINI_TYPES = [
    { id: "official", label: "\u041E\u0444\u0456\u0446\u0456\u0439\u043D\u0456", emoji: "\u{1F3DB}\uFE0F" },
    { id: "board", label: "\u0414\u043E\u0448\u043A\u0430", emoji: "\u{1F6D2}" },
    { id: "chat", label: "\u0420\u043E\u0437\u043C\u043E\u0432\u0438", emoji: "\u{1F4AC}" },
    { id: "greeting", label: "\u0412\u0456\u0442\u0430\u043D\u043D\u044F", emoji: "\u{1F389}" }
  ];
  var _boardMiniTypeIdx = 0;
  var _boardMiniData = { userPosts: [], official: [] };
  var _boardMiniDir = 1;
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
  async function renderBusBlock() {
    const el = document.getElementById("cm-bus-content");
    if (!el)
      return;
    try {
      const res = await fetch("./data/schedule.json");
      const data = await res.json();
      const todayISO = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const tomorrow = /* @__PURE__ */ new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowISO = tomorrow.toISOString().slice(0, 10);
      const dayRoutes = (iso) => data.days?.[iso]?.routes || (iso === todayISO ? data.routes : null) || [];
      const depMins = (r) => getStopMins(r, r.stops[0].name) || 0;
      const entries = [];
      const seen = /* @__PURE__ */ new Set();
      const add = (route, dateISO) => {
        const key = dateISO + "|" + route.id;
        if (seen.has(key))
          return;
        seen.add(key);
        entries.push({ route, dateISO });
      };
      for (const t of loadCmTracked(todayISO)) {
        const r = dayRoutes(t.trackDate).find((x) => x.id === t.routeId && x.status !== "cancelled");
        if (!r)
          continue;
        if (t.trackDate === todayISO && getRouteState(r) === "past")
          continue;
        add(r, t.trackDate);
      }
      dayRoutes(todayISO).filter((r) => {
        if (r.status === "cancelled")
          return false;
        const state = getRouteState(r);
        if (state === "enroute")
          return true;
        if (state === "waiting") {
          const t = getRouteTimings(r);
          return t.minsToDeparture !== null && t.minsToDeparture <= 90;
        }
        return false;
      }).sort((a, b) => depMins(a) - depMins(b)).forEach((r) => add(r, todayISO));
      if (!entries.some((e) => e.dateISO === todayISO)) {
        const next = dayRoutes(todayISO).filter((r) => r.status !== "cancelled" && getRouteState(r) === "waiting").sort((a, b) => (getRouteTimings(a).minsToDeparture ?? Infinity) - (getRouteTimings(b).minsToDeparture ?? Infinity))[0];
        if (next)
          add(next, todayISO);
      }
      if (!entries.length) {
        const tom = dayRoutes(tomorrowISO).filter((r) => r.status !== "cancelled").sort((a, b) => depMins(a) - depMins(b))[0];
        if (tom)
          add(tom, tomorrowISO);
      }
      cmBusEntries = entries;
      if (!cmBusEntries.length) {
        el.innerHTML = '<div class="cm-block-empty">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439</div>';
        return;
      }
      if (cmBusIndex >= cmBusEntries.length)
        cmBusIndex = 0;
      renderCmBusCard(el);
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u0420\u043E\u0437\u043A\u043B\u0430\u0434 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0438\u0439</div>';
    }
  }
  var CM_MONTHS = [
    "\u0441\u0456\u0447\u043D\u044F",
    "\u043B\u044E\u0442\u043E\u0433\u043E",
    "\u0431\u0435\u0440\u0435\u0437\u043D\u044F",
    "\u043A\u0432\u0456\u0442\u043D\u044F",
    "\u0442\u0440\u0430\u0432\u043D\u044F",
    "\u0447\u0435\u0440\u0432\u043D\u044F",
    "\u043B\u0438\u043F\u043D\u044F",
    "\u0441\u0435\u0440\u043F\u043D\u044F",
    "\u0432\u0435\u0440\u0435\u0441\u043D\u044F",
    "\u0436\u043E\u0432\u0442\u043D\u044F",
    "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430",
    "\u0433\u0440\u0443\u0434\u043D\u044F"
  ];
  function cmDayLabel(dateISO, todayISO, tomorrowISO) {
    if (dateISO === todayISO)
      return "";
    const [y, m, d] = dateISO.split("-").map(Number);
    const prefix = dateISO === tomorrowISO ? "\u0417\u0430\u0432\u0442\u0440\u0430" : "";
    const datePart = `${d} ${CM_MONTHS[m - 1]}`;
    return prefix ? `${prefix} \xB7 ${datePart}` : datePart;
  }
  function renderCmBusCard(el) {
    if (!el || !cmBusEntries.length)
      return;
    const { route, dateISO } = cmBusEntries[cmBusIndex];
    const todayISO = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().slice(0, 10);
    const base = getRouteTimings(route);
    const timings = dateISO === todayISO ? base : { ...base, state: "waiting", progress: 0, minsToDeparture: null, minsToArrival: null };
    const label = cmDayLabel(dateISO, todayISO, tomorrowISO);
    const labelHtml = label ? `<div class="cm-bus-daylabel">${escapeHtml(label)}</div>` : "";
    el.innerHTML = labelHtml + buildHeroCard(route, timings, cmBusIndex, cmBusEntries.length);
    let touchStartX = 0;
    const card = el.querySelector(".bhv4") || el.lastElementChild;
    if (!card)
      return;
    card.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    card.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40)
        return;
      cmBusIndex = dx < 0 ? (cmBusIndex + 1) % cmBusEntries.length : (cmBusIndex - 1 + cmBusEntries.length) % cmBusEntries.length;
      switchCmBusCard(el);
    }, { passive: true });
    el.querySelectorAll(".bhv4-dot-nav").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        cmBusIndex = parseInt(e.target.dataset.idx, 10);
        switchCmBusCard(el);
      });
    });
  }
  function switchCmBusCard(el) {
    const content = el.querySelector(".bhv4-content");
    if (!content) {
      renderCmBusCard(el);
      return;
    }
    content.style.transition = "opacity 0.08s ease";
    content.style.opacity = "0";
    setTimeout(() => {
      renderCmBusCard(el);
      const newContent = el.querySelector(".bhv4-content");
      if (newContent) {
        newContent.style.opacity = "0";
        newContent.style.transition = "opacity 0.1s ease";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          newContent.style.opacity = "1";
        }));
      }
    }, 80);
  }
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
  async function renderBoardBlock() {
    const el = document.getElementById("cm-board-content");
    if (!el)
      return;
    try {
      let userPosts = [], official = [], usedSupabase = false;
      if (isSupabaseReady()) {
        const [posts, anns] = await Promise.all([
          fetchPublishedPosts(),
          fetchPublishedAnnouncements()
        ]);
        if (posts !== null) {
          userPosts = posts.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
          official = (anns || []).slice().sort((a, b) => {
            if (a.pinned !== b.pinned)
              return a.pinned ? -1 : 1;
            return (b.ts || 0) - (a.ts || 0);
          });
          usedSupabase = true;
        }
      }
      if (!usedSupabase) {
        const [boardRes, communityRes] = await Promise.all([
          fetch("./data/community-board.json"),
          fetch("./data/community.json")
        ]);
        const boardData = await boardRes.json();
        const communityData = await communityRes.json();
        userPosts = (boardData.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
        official = (communityData.announcements || []).slice().sort((a, b) => {
          if (a.pinned !== b.pinned)
            return a.pinned ? -1 : 1;
          return (b.ts || 0) - (a.ts || 0);
        });
      }
      _boardMiniData = { userPosts, official };
      renderBoardMiniSlide(el);
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  function renderBoardMiniSlide(el) {
    const cfg = BOARD_MINI_TYPES[_boardMiniTypeIdx];
    const { userPosts, official } = _boardMiniData;
    let items = [];
    if (cfg.id === "official") {
      items = official.slice(0, 2).map((a) => ({ kind: "official", title: a.title, text: a.body, ts: a.ts, id: a.id }));
    } else {
      items = userPosts.filter((p) => (p.type || "board") === cfg.id).slice(0, 2).map((p) => ({
        kind: cfg.id,
        id: p.id,
        ts: p.ts || p.created_at && new Date(p.created_at).getTime(),
        category: p.category,
        text: p.text,
        title: p.title,
        color: p.color,
        photo: Array.isArray(p.photos) && p.photos[0] || p.photo,
        cover_emoji: p.cover_emoji,
        cover_gradient: p.cover_gradient,
        author: p.author
      }));
    }
    const dotsHtml = BOARD_MINI_TYPES.map(
      (t, i) => `<span class="cm-board-mini-dot${i === _boardMiniTypeIdx ? " active" : ""}" data-mini-idx="${i}"></span>`
    ).join("");
    const labelHtml = `
    <div class="cm-board-mini-label">
      <span class="cm-board-mini-emoji">${cfg.emoji}</span>
      <span class="cm-board-mini-name">${escapeHtml(cfg.label)}</span>
      <span class="cm-board-mini-dots">${dotsHtml}</span>
    </div>
  `;
    const emptyHtml = `<div class="cm-board-mini-empty">\u0423 \xAB${escapeHtml(cfg.label)}\xBB \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E</div>`;
    const cardsHtml = items.length ? items.map((item) => renderMiniCard(item, cfg.id)).join("") : emptyHtml;
    const isCorkType = cfg.id === "board" || cfg.id === "official";
    const innerHtml = isCorkType ? `<div class="cm-board-corkboard cm-board-corkboard--mini">${cardsHtml}</div>` : `<div class="cm-board-mini-stream">${cardsHtml}</div>`;
    const slideClass = _boardMiniDir < 0 ? " bd-mini-slide-back" : "";
    el.innerHTML = `
    <div class="cm-board-preview cm-board-preview--swipe" id="cm-board-preview">
      ${labelHtml}
      <div class="cm-board-mini-content${slideClass}">${innerHtml}</div>
      <button class="cm-board-preview-cta" type="button" data-mini-cta>
        \u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043D\u0430 ${escapeHtml(cfg.label.toLowerCase())} \u2192
      </button>
    </div>
  `;
    const wrap = document.getElementById("cm-board-preview");
    if (wrap) {
      attachSwipe(
        wrap,
        () => {
          _boardMiniDir = 1;
          _boardMiniTypeIdx = (_boardMiniTypeIdx + 1) % BOARD_MINI_TYPES.length;
          renderBoardMiniSlide(el);
        },
        () => {
          _boardMiniDir = -1;
          _boardMiniTypeIdx = (_boardMiniTypeIdx - 1 + BOARD_MINI_TYPES.length) % BOARD_MINI_TYPES.length;
          renderBoardMiniSlide(el);
        }
      );
      wrap.querySelectorAll(".cm-board-mini-dot").forEach((dot) => {
        dot.addEventListener("click", (e) => {
          e.stopPropagation();
          const newIdx = parseInt(dot.dataset.miniIdx, 10) || 0;
          _boardMiniDir = newIdx > _boardMiniTypeIdx ? 1 : -1;
          _boardMiniTypeIdx = newIdx;
          renderBoardMiniSlide(el);
        });
      });
      const cta = wrap.querySelector("[data-mini-cta]");
      if (cta) {
        cta.addEventListener("click", (e) => {
          e.stopPropagation();
          const targetType = cfg.id === "official" ? "all" : cfg.id;
          setBoardActiveType(targetType);
          if (typeof window.switchTab === "function")
            window.switchTab("board");
        });
      }
    }
  }
  function renderMiniCard(item, type) {
    const tilt = item.id * 7 % 9 - 4;
    if (type === "official") {
      return `
      <article class="cm-board-note cm-board-note--official cm-board-mini" style="--tilt:${tilt}deg">
        <span class="cm-board-pin cm-board-pin--gold"></span>
        <span class="cm-board-cat cm-board-cat--official">\u{1F3DB}\uFE0F \u041E\u0424\u0406\u0426\u0406\u0419\u041D\u041E</span>
        <p class="cm-board-text">${escapeHtml(item.title)}</p>
      </article>
    `;
    }
    if (type === "board") {
      const emoji = CATEGORY_EMOJI2[item.category] || "\u{1F4CC}";
      const photoHtml = item.photo ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(item.photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>` : "";
      return `
      <article class="cm-board-note cm-board-note--${escapeHtml(item.color || "yellow")} cm-board-mini${item.photo ? " cm-board-note--has-photo" : ""}" style="--tilt:${tilt}deg">
        <span class="cm-board-pin"></span>
        ${photoHtml}
        <span class="cm-board-cat">${emoji} ${escapeHtml(item.category || "")}</span>
        <p class="cm-board-text">${escapeHtml(item.text)}</p>
      </article>
    `;
    }
    if (type === "chat") {
      const initial = item.author ? item.author.charAt(0).toUpperCase() : "\u{1F464}";
      const hue = item.author ? item.author.charCodeAt(0) * 47 % 360 : 0;
      const avatarStyle = item.author ? `background:hsl(${hue}deg 65% 78%);color:#fff;font-weight:600` : "background:#f5f5f5;color:#666;font-size:18px";
      return `
      <article class="cm-mini-chat">
        <span class="cm-mini-chat-avatar" style="${avatarStyle}">${escapeHtml(initial)}</span>
        <div class="cm-mini-chat-body">
          <div class="cm-mini-chat-author">${escapeHtml(item.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</div>
          <p class="cm-mini-chat-text">${escapeHtml(item.text)}</p>
        </div>
      </article>
    `;
    }
    if (type === "greeting") {
      const grad = item.cover_gradient || "linear-gradient(135deg, #FFD1DC 0%, #FFB6C1 100%)";
      const emoji = item.cover_emoji || "\u{1F389}";
      return `
      <article class="cm-mini-greet">
        <div class="cm-mini-greet-cover" style="background:${escapeHtml(grad)}">
          <span class="cm-mini-greet-emoji">${emoji}</span>
        </div>
        <div class="cm-mini-greet-body">
          ${item.title ? `<div class="cm-mini-greet-to">\u0414\u043B\u044F ${escapeHtml(item.title)}</div>` : ""}
          <p class="cm-mini-greet-text">${escapeHtml(item.text)}</p>
        </div>
      </article>
    `;
    }
    return "";
  }
  function pluralUA(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11)
      return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20))
      return few;
    return many;
  }
  function eventCountdown(ev, now) {
    const eventDay = /* @__PURE__ */ new Date(ev.date + "T00:00:00");
    const todayDay = new Date(now);
    todayDay.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((eventDay - todayDay) / 864e5);
    if (dayDiff === 0) {
      if (!ev.time)
        return "\u0421\u042C\u041E\u0413\u041E\u0414\u041D\u0406";
      const dt = /* @__PURE__ */ new Date(ev.date + "T" + ev.time + ":00");
      const diffMs = dt - now;
      if (diffMs <= 0)
        return "\u0417\u0410\u0420\u0410\u0417";
      if (diffMs < 60 * 6e4)
        return `\u0427\u0415\u0420\u0415\u0417 ${Math.max(1, Math.floor(diffMs / 6e4))} \u0425\u0412`;
      const h = Math.floor(diffMs / 36e5);
      const m = Math.floor(diffMs % 36e5 / 6e4);
      return m > 0 ? `\u0427\u0415\u0420\u0415\u0417 ${h} \u0413\u041E\u0414 ${m} \u0425\u0412` : `\u0427\u0415\u0420\u0415\u0417 ${h} \u0413\u041E\u0414`;
    }
    if (dayDiff === 1)
      return "\u0417\u0410\u0412\u0422\u0420\u0410";
    if (dayDiff < 7)
      return `\u0427\u0415\u0420\u0415\u0417 ${dayDiff} ${pluralUA(dayDiff, "\u0414\u0415\u041D\u042C", "\u0414\u041D\u0406", "\u0414\u041D\u0406\u0412")}`;
    if (dayDiff < 14)
      return "\u0427\u0415\u0420\u0415\u0417 \u0422\u0418\u0416\u0414\u0415\u041D\u042C";
    if (dayDiff < 30) {
      const w = Math.floor(dayDiff / 7);
      return `\u0427\u0415\u0420\u0415\u0417 ${w} ${pluralUA(w, "\u0422\u0418\u0416\u0414\u0415\u041D\u042C", "\u0422\u0418\u0416\u041D\u0406", "\u0422\u0418\u0416\u041D\u0406\u0412")}`;
    }
    const months = Math.floor(dayDiff / 30);
    return `\u0427\u0415\u0420\u0415\u0417 ${months} ${pluralUA(months, "\u041C\u0406\u0421\u042F\u0426\u042C", "\u041C\u0406\u0421\u042F\u0426\u0406", "\u041C\u0406\u0421\u042F\u0426\u0406\u0412")}`;
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
      const next = events.filter((e) => !e.auto).filter((e) => /* @__PURE__ */ new Date(e.date + "T00:00:00") >= today).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      if (!next) {
        el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454 \u0437\u0430\u043F\u043B\u0430\u043D\u043E\u0432\u0430\u043D\u0438\u0445 \u043F\u043E\u0434\u0456\u0439 \u0443 \u0433\u0440\u043E\u043C\u0430\u0434\u0456</div>';
        return;
      }
      const now = /* @__PURE__ */ new Date();
      const eventDay = /* @__PURE__ */ new Date(next.date + "T00:00:00");
      const todayDay = new Date(now);
      todayDay.setHours(0, 0, 0, 0);
      const dayDiff = Math.round((eventDay - todayDay) / 864e5);
      const isUrgent = dayDiff <= 1;
      const dateStr = `${pad(eventDay.getDate())}.${pad(eventDay.getMonth() + 1)}`;
      const timeStr = next.time ? escapeHtml(next.time) : "";
      const locStr = next.location ? escapeHtml(next.location) : "";
      const catStr = escapeHtml(next.category || "");
      el.innerHTML = `
      <article class="evh-card tablo-hero${isUrgent ? " tablo-hero--urgent" : ""}" data-switch-tab="events">
        <div class="evh-top">
          <span class="tablo-countdown">${escapeHtml(eventCountdown(next, now))}</span>
          ${catStr ? `<span class="evh-cat tablo-soft">${catStr}</span>` : ""}
        </div>
        <div class="evh-time tablo-time-mono">
          <span class="evh-date tablo-time-accent">${dateStr}</span>
          ${timeStr ? `<span class="evh-clock tablo-mid">${timeStr}</span>` : ""}
        </div>
        <div class="evh-title">${escapeHtml(next.title)}</div>
        ${locStr ? `<div class="evh-meta tablo-soft">\u{1F4CD} ${locStr}</div>` : ""}
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
  function showHeroSlide(idx) {
    const wrap = document.querySelector(".cm-hero");
    if (!wrap)
      return;
    _heroIndex = (idx + HERO_IMAGES.length) % HERO_IMAGES.length;
    wrap.querySelectorAll(".cm-hero-img").forEach((img, i) => {
      img.classList.toggle("active", i === _heroIndex);
    });
    wrap.querySelectorAll(".cm-hero-dot").forEach((d, i) => {
      d.classList.toggle("active", i === _heroIndex);
    });
  }
  function restartHeroAutoRotate() {
    if (_heroInterval)
      clearInterval(_heroInterval);
    if (HERO_IMAGES.length < 2)
      return;
    _heroInterval = setInterval(() => {
      const wrap = document.querySelector(".cm-hero");
      if (!wrap) {
        clearInterval(_heroInterval);
        _heroInterval = null;
        return;
      }
      showHeroSlide(_heroIndex + 1);
    }, 6e3);
  }
  function startHeroRotator() {
    _heroIndex = 0;
    restartHeroAutoRotate();
    const wrap = document.querySelector(".cm-hero");
    if (wrap) {
      attachSwipe(
        wrap,
        () => {
          showHeroSlide(_heroIndex + 1);
          restartHeroAutoRotate();
        },
        () => {
          showHeroSlide(_heroIndex - 1);
          restartHeroAutoRotate();
        }
      );
      wrap.querySelectorAll(".cm-hero-dot").forEach((d, i) => {
        d.style.cursor = "pointer";
        d.addEventListener("click", () => {
          showHeroSlide(i);
          restartHeroAutoRotate();
        });
      });
    }
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
        <button class="cm-block-link" data-switch-tab="power">\u0413\u0440\u0430\u0444\u0456\u043A \u2192</button>
      </header>
      <div id="cm-power-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>
    -->

    <section class="cm-block cm-block--bus">
      <div id="cm-bus-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
      <footer class="cm-block-footer">
        <button class="cm-block-title cm-block-title--bus-link" data-switch-tab="buses">\u0420\u041E\u0417\u041A\u041B\u0410\u0414 \u0410\u0412\u0422\u041E\u0411\u0423\u0421\u041D\u0418\u0425 \u041C\u0410\u0420\u0428\u0420\u0423\u0422\u0406\u0412 \u2192</button>
      </footer>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0430 \u043F\u043E\u0434\u0456\u044F \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h3>
        <button class="cm-block-link" data-switch-tab="events">\u0410\u0444\u0456\u0448\u0430 \u2192</button>
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
    attachSwitchTabDelegation();
    startHeroRotator();
    renderWeatherBlock();
    renderBusBlock();
    renderBoardBlock();
    renderEventBlock();
    renderContactsBlock();
  }
  function attachSwitchTabDelegation() {
    const root = document.getElementById("cm-content");
    if (!root)
      return;
    root.addEventListener("click", (e) => {
      const target = e.target.closest("[data-switch-tab]");
      if (!target)
        return;
      const tab = target.dataset.switchTab;
      if (tab && typeof window.switchTab === "function")
        window.switchTab(tab);
    });
  }

  // src/tabs/news.js
  var allArticles = [];
  var activeGeo = "\u0412\u0441\u0456";
  var GEO_FILTERS = ["\u0412\u0441\u0456", "\u041E\u043B\u0438\u043A\u0430", "\u0412\u043E\u043B\u0438\u043D\u044C", "\u0423\u043A\u0440\u0430\u0457\u043D\u0430", "\u0421\u0432\u0456\u0442"];
  var CATEGORY_COLORS = {
    "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E": "#37474f",
    // темно-сірий (новинний)
    "\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0430": "#1a237e",
    // navy
    "\u0412\u0456\u0439\u043D\u0430": "#722F37",
    // бордо
    "\u0415\u043A\u043E\u043D\u043E\u043C\u0456\u043A\u0430": "#2E5E1F",
    // зелений (гроші)
    "\u0411\u0456\u0437\u043D\u0435\u0441": "#2E5E1F",
    // зелений
    "\u0421\u043F\u043E\u0440\u0442": "#1565C0",
    // синій
    "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430": "#B45309",
    // теракот
    "\u0422\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0456\u0457": "#455a64",
    // сіро-синій
    "\u0417\u0434\u043E\u0440\u043E\u0432\u02BC\u044F": "#C2185B",
    // медичний
    "\u041E\u0441\u0432\u0456\u0442\u0430": "#6a1b9a",
    // фіолетовий
    "\u041F\u0440\u0438\u0440\u043E\u0434\u0430": "#2e7d32"
    // природний зелений
  };
  var GEO_COLORS = {
    "\u041E\u043B\u0438\u043A\u0430": "#722F37",
    // бордо — наш бренд
    "\u0412\u043E\u043B\u0438\u043D\u044C": "#9e7508",
    // золотий
    "\u0423\u043A\u0440\u0430\u0457\u043D\u0430": "#0057B7",
    // синій
    "\u0421\u0432\u0456\u0442": "#546e7a"
    // нейтрально-сірий
  };
  function catColor(c) {
    return CATEGORY_COLORS[c] || "#546e7a";
  }
  function geoColor(g) {
    return GEO_COLORS[g] || "#546e7a";
  }
  async function initNews() {
    try {
      const res = await fetch("./data/articles.json");
      allArticles = await res.json();
    } catch (e) {
      allArticles = [];
    }
    renderGeoFilters();
    renderNews();
    attachNewsListeners();
  }
  function attachNewsListeners() {
    const filters = document.getElementById("geo-filters");
    if (filters) {
      filters.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip[data-geo]");
        if (!chip)
          return;
        setGeoFilter(chip.dataset.geo);
      });
    }
    const list = document.getElementById("news-list");
    if (list) {
      list.addEventListener("click", (e) => {
        const card = e.target.closest("[data-article-id]");
        if (!card)
          return;
        const id = Number(card.dataset.articleId);
        if (Number.isFinite(id))
          openArticle(id);
      });
    }
    const modal = document.getElementById("article-modal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-share-article]");
        if (!btn)
          return;
        sharePost({
          title: btn.dataset.shareTitle,
          text: btn.dataset.shareText,
          url: btn.dataset.shareUrl
        });
      });
    }
  }
  function renderGeoFilters() {
    const el = document.getElementById("geo-filters");
    if (!el)
      return;
    el.innerHTML = GEO_FILTERS.map((g) => `
    <button class="chip ${g === activeGeo ? "active" : ""}" data-geo="${escapeHtml(g)}">${escapeHtml(g)}</button>
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
  function badgesHtml(a) {
    return `
    <span class="news-badge news-badge--geo" style="background:${geoColor(a.geo)}">${escapeHtml(a.geo)}</span>
    <span class="news-badge news-badge--cat" style="background:${catColor(a.category)}">${escapeHtml(a.category)}</span>
    ${a.exclusive ? '<span class="news-badge news-badge--excl">\u2B50 \u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
  `;
  }
  function renderFeatured(a) {
    const hasImage = !!a.image;
    return `
    <article class="news-card-featured ${hasImage ? "" : "no-image"}${a.exclusive ? " exclusive" : ""}" data-article-id="${a.id}">
      ${hasImage ? `<img class="news-card-featured-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : ""}
      <div class="news-card-featured-overlay">
        <div class="news-card-meta">${badgesHtml(a)}</div>
        <h2 class="news-card-featured-title">${escapeHtml(a.title)}</h2>
        ${!hasImage && a.excerpt ? `<p class="news-card-featured-excerpt">${escapeHtml(a.excerpt)}</p>` : ""}
        <div class="news-card-featured-footer">${escapeHtml(a.source)} \xB7 ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
  }
  function renderRow(a) {
    return `
    <article class="news-card-row ${a.exclusive ? "exclusive" : ""}" data-article-id="${a.id}">
      ${a.image ? `<img class="news-card-row-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : ""}
      <div class="news-card-row-body">
        <div class="news-card-meta">${badgesHtml(a)}</div>
        <h2 class="news-card-row-title">${escapeHtml(a.title)}</h2>
        ${a.excerpt ? `<p class="news-card-row-excerpt">${escapeHtml(a.excerpt)}</p>` : ""}
        <div class="news-card-row-footer">${escapeHtml(a.source)} \xB7 ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
  }
  function setGeoFilter(geo) {
    activeGeo = geo;
    renderGeoFilters();
    renderNews();
  }
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
  function openArticle(id) {
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
      <div class="article-source-actions">
        <button class="share-btn share-btn--inline" type="button"
                data-share-article
                data-share-title="${escapeHtml(article.title)}"
                data-share-text="${escapeHtml(article.excerpt || "")}"
                data-share-url="${escapeHtml(article.sourceUrl || location.href)}">
          \u{1F4E4} \u041F\u043E\u0434\u0456\u043B\u0438\u0442\u0438\u0441\u044C
        </button>
        ${article.sourceUrl ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">\u0427\u0438\u0442\u0430\u0442\u0438 \u043E\u0440\u0438\u0433\u0456\u043D\u0430\u043B \u2192</a>` : ""}
      </div>
    </div>
  `;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
  }

  // src/tabs/events.js
  var CATEGORY_FILTERS = ["\u0412\u0441\u0456", "\u0421\u0432\u044F\u0442\u0430", "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430", "\u0421\u043F\u043E\u0440\u0442", "\u0411\u043B\u0430\u0433\u043E\u0434\u0456\u0439\u043D\u0456\u0441\u0442\u044C"];
  var CATEGORY_COLORS2 = {
    "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430": "#722F37",
    "Kino_Castle": "#722F37",
    "\u0421\u043F\u043E\u0440\u0442": "#1565C0",
    "\u0411\u043B\u0430\u0433\u043E\u0434\u0456\u0439\u043D\u0456\u0441\u0442\u044C": "#B45309",
    "\u0421\u0432\u044F\u0442\u043E": "#8B6F47"
    // коричневий — нейтральний для свят (державних і релігійних)
  };
  var MONTHS_FULL = ["\u0441\u0456\u0447\u043D\u044F", "\u043B\u044E\u0442\u043E\u0433\u043E", "\u0431\u0435\u0440\u0435\u0437\u043D\u044F", "\u043A\u0432\u0456\u0442\u043D\u044F", "\u0442\u0440\u0430\u0432\u043D\u044F", "\u0447\u0435\u0440\u0432\u043D\u044F", "\u043B\u0438\u043F\u043D\u044F", "\u0441\u0435\u0440\u043F\u043D\u044F", "\u0432\u0435\u0440\u0435\u0441\u043D\u044F", "\u0436\u043E\u0432\u0442\u043D\u044F", "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430", "\u0433\u0440\u0443\u0434\u043D\u044F"];
  var WEEKDAYS_SHORT = ["\u041D\u0434", "\u041F\u043D", "\u0412\u0442", "\u0421\u0440", "\u0427\u0442", "\u041F\u0442", "\u0421\u0431"];
  var CALENDAR_DAYS = 21;
  var allEvents = [];
  var activeFilter = "\u0412\u0441\u0456";
  var selectedDate = null;
  var cardObserver = null;
  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  function formatFullDate(dateStr) {
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  }
  function catColor2(category) {
    return CATEGORY_COLORS2[category] || "#722F37";
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
    const bg = catColor2(ev.category);
    let coverBlock = "";
    if (ev.image) {
      coverBlock = `
      <div class="ev-card-cover">
        <img class="ev-card-img" src="${escapeHtml(ev.image)}" alt="" loading="lazy">
      </div>`;
    } else if (ev.cover_emoji) {
      const grad = ev.cover_gradient || "linear-gradient(135deg, #999 0%, #555 100%)";
      coverBlock = `
      <div class="ev-card-cover ev-card-cover--art" style="background:${escapeHtml(grad)}">
        <span class="ev-card-cover-emoji">${ev.cover_emoji}</span>
      </div>`;
    }
    const locationBlock = ev.location ? `
    <span class="ev-meta-item">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
      ${escapeHtml(ev.location)}
    </span>` : "";
    const timeText = ev.time ? `${escapeHtml(formatFullDate(ev.date))}, ${escapeHtml(ev.time)}` : escapeHtml(formatFullDate(ev.date));
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
          ${locationBlock}
          <span class="ev-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${timeText}
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
          <button class="ev-share-btn share-btn share-btn--inline" type="button" data-share-event data-id="${ev.id}">
            \u{1F4E4} \u041F\u043E\u0434\u0456\u043B\u0438\u0442\u0438\u0441\u044C
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
  function renderCalendar() {
    const bar = document.getElementById("events-calendar");
    if (!bar)
      return;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const datesWithEvents = /* @__PURE__ */ new Set();
    allEvents.forEach((e) => {
      if (e.auto)
        return;
      datesWithEvents.add(e.date);
    });
    const days = [];
    for (let i = 0; i < CALENDAR_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
    const allBtn = `
    <button class="cal-pill cal-pill--all${selectedDate === null ? " active" : ""}" data-date="">
      <span class="cal-pill-label">\u0412\u0441\u0456</span>
    </button>
  `;
    const daysHtml = days.map((d) => {
      const ymdStr = ymd(d);
      const isToday = ymdStr === ymd(today);
      const hasEv = datesWithEvents.has(ymdStr);
      const isActive = ymdStr === selectedDate;
      return `
      <button class="cal-pill${isActive ? " active" : ""}${isToday ? " cal-pill--today" : ""}${hasEv ? " cal-pill--has-events" : ""}" data-date="${ymdStr}">
        <span class="cal-pill-wd">${WEEKDAYS_SHORT[d.getDay()]}</span>
        <span class="cal-pill-num">${d.getDate()}</span>
        <span class="cal-pill-dot"></span>
      </button>
    `;
    }).join("");
    bar.innerHTML = allBtn + daysHtml;
    bar.querySelectorAll(".cal-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDate = btn.dataset.date || null;
        renderCalendar();
        renderList();
      });
    });
  }
  function getFiltered2() {
    const now = /* @__PURE__ */ new Date();
    now.setHours(0, 0, 0, 0);
    return allEvents.filter((e) => {
      if (e.auto)
        return false;
      const d = /* @__PURE__ */ new Date(e.date + "T00:00:00");
      if (d < now)
        return false;
      if (selectedDate && e.date !== selectedDate)
        return false;
      if (activeFilter === "\u0412\u0441\u0456")
        return true;
      if (activeFilter === "\u0421\u0432\u044F\u0442\u0430")
        return e.category === "\u0421\u0432\u044F\u0442\u043E";
      return e.category === activeFilter;
    }).sort((a, b) => {
      const byDate = new Date(a.date) - new Date(b.date);
      if (byDate !== 0)
        return byDate;
      return (a.time || "").localeCompare(b.time || "");
    });
  }
  function renderList() {
    const el = document.getElementById("events-list");
    if (!el)
      return;
    const list = getFiltered2();
    if (!list.length) {
      const emptyMsg = selectedDate ? `\u041D\u0430 ${selectedDate.split("-").reverse().slice(0, 2).join(".")} \u043F\u043E\u0434\u0456\u0439 \u043D\u0435\u043C\u0430\u0454` : "\u041F\u043E\u0434\u0456\u0439 \u0443 \u0446\u0456\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454";
      el.innerHTML = `<div class="empty-state">${escapeHtml(emptyMsg)}</div>`;
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
        if (e.target.closest(".ev-share-btn"))
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
    el.querySelectorAll(".ev-share-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const ev = allEvents.find((ev2) => ev2.id === Number(btn.dataset.id));
        if (!ev)
          return;
        const when = ev.time ? `${formatFullDate(ev.date)}, ${ev.time}` : formatFullDate(ev.date);
        const loc = ev.location ? ` \xB7 ${ev.location}` : "";
        sharePost({
          title: ev.title,
          text: `\u{1F4C5} ${ev.title}
${when}${loc}

${ev.description}`
        });
      });
    });
  }
  async function initEvents() {
    const el = document.getElementById("events-list");
    if (el)
      renderSkeleton2(el);
    try {
      const [evRes, holRes] = await Promise.all([
        fetch("./data/events.json"),
        fetch("./data/holidays.json")
      ]);
      const events = await evRes.json();
      const holData = await holRes.json();
      const holidays = (holData.holidays || []).map((h) => ({ ...h, time: null, location: null }));
      allEvents = [...events, ...holidays];
    } catch {
      allEvents = [];
    }
    renderFilters();
    renderCalendar();
    renderList();
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
    const ymd2 = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const events = [];
    let i = 0;
    while (i < 24) {
      if (schedule[i] === 0) {
        const start = i;
        while (i < 24 && schedule[i] === 0)
          i++;
        events.push(
          `BEGIN:VEVENT\r
DTSTART:${ymd2}T${pad(start)}0000\r
DTEND:${ymd2}T${pad(i)}0000\r
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
      ringColor = "#722F37";
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

  // src/app.js
  var currentTab = "community";
  window.switchTab = function(tab) {
    if (tab === currentTab)
      return;
    const oldPage = document.getElementById(`page-${currentTab}`);
    const newPage = document.getElementById(`page-${tab}`);
    if (!oldPage || !newPage)
      return;
    const main = document.querySelector(".app-main");
    newPage.style.opacity = "0";
    newPage.style.display = "block";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        oldPage.style.opacity = "0";
        oldPage.style.transition = "opacity 0.22s ease";
        newPage.style.transition = "opacity 0.28s ease";
        newPage.style.opacity = "1";
        setTimeout(() => {
          oldPage.style.display = "none";
          oldPage.style.opacity = "";
          oldPage.style.transition = "";
          newPage.style.transition = "";
          if (main)
            main.scrollTop = 0;
        }, 220);
      });
    });
    document.querySelectorAll(".tab-item").forEach((t) => t.classList.remove("active"));
    const activeTab = document.querySelector(`.tab-item[data-tab="${tab}"]`);
    if (activeTab)
      activeTab.classList.add("active");
    if (main)
      main.dataset.tab = tab;
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
  function initAdminShortcut() {
    const logo = document.querySelector(".header-logo");
    if (!logo)
      return;
    let taps = [];
    logo.style.cursor = "pointer";
    logo.addEventListener("click", () => {
      const now = Date.now();
      taps = taps.filter((t) => now - t < 2e3);
      taps.push(now);
      if (taps.length >= 5) {
        taps = [];
        window.location.href = "./admin.html";
      }
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
    initAdminShortcut();
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
