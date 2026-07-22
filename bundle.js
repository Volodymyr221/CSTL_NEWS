(() => {
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
  function avatarCircle({ name, url, cls = "pm-avatar", uid = "" } = {}) {
    const idAttr = uid ? ` data-av-uid="${escapeHtml(String(uid))}" data-av-circle=""` : "";
    const safeUrl = url ? String(url).trim() : "";
    if (safeUrl) {
      return `<span class="${cls} ${cls}--img"${idAttr}><img src="${escapeHtml(safeUrl)}" alt="" loading="lazy"></span>`;
    }
    const a = String(name || "").trim();
    if (!a)
      return `<span class="${cls} ${cls}--anon"${idAttr}>\u{1F464}</span>`;
    const letter = a.charAt(0).toUpperCase();
    const hue = a.charCodeAt(0) * 47 % 360;
    return `<span class="${cls}" style="background:hsl(${hue}deg 62% 74%)"${idAttr}>${escapeHtml(letter)}</span>`;
  }
  function squareImageBlob(file, size = 256) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size;
          canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.82);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
  function showToast(msg, duration = 3e3, type = "") {
    let toast = document.getElementById("cstl-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cstl-toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.toggle("toast--error", type === "error");
    toast.classList.add("visible");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), duration);
  }
  function openPhotoLightbox(url) {
    if (!url)
      return;
    const ov = document.createElement("div");
    ov.className = "pm-lightbox";
    ov.innerHTML = `<img src="${escapeHtml(url)}" alt="\u0444\u043E\u0442\u043E">`;
    ov.addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  }
  var FILTER_HOMOGLYPHS = { a: "\u0430", e: "\u0435", o: "\u043E", c: "\u0441", x: "\u0445", p: "\u0440", y: "\u0443", k: "\u043A", i: "\u0456", b: "\u0431", m: "\u043C", h: "\u043D", t: "\u0442" };
  var FILTER_LEET = { "0": "o", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "l", "+": "t" };
  function deleet(s) {
    return String(s).replace(/[03456789@$!|+]/g, (ch) => FILTER_LEET[ch] || ch);
  }
  function normalizeForFilter(text) {
    return deleet(String(text || "").toLowerCase()).replace(/1/g, "i").replace(/[a-z]/g, (ch) => FILTER_HOMOGLYPHS[ch] || ch).replace(/(.)\1{2,}/g, "$1");
  }
  var PROFANITY_STEMS = [
    // нецензурні (укр + рос)
    "\u0445\u0443\u0439",
    "\u0445\u0443\u0454",
    "\u0445\u0443\u044F",
    "\u0445\u0443\u0457",
    "\u0445\u0443\u0439\u043B",
    "\u0445\u0443\u0454\u0441",
    "\u043F\u0438\u0437\u0434",
    "\u043F\u0456\u0437\u0434",
    "\u0431\u043B\u044F\u0434",
    "\u0431\u043B\u044F\u0442",
    // 'еб' голим стемом НЕ можна: гомогліфи (e→е, b→б) роблять з ebook/ebay/ebola
    // «ебоок/ебау/ебола» → хибне блокування. Лише довші реальні форми.
    // 'єб'/'їб' безпечні — є/ї з латинських літер не виникають.
    "\u0454\u0431",
    "\u0457\u0431",
    "\u0439\u043E\u0431",
    "\u0435\u0431\u0430\u043B",
    "\u0435\u0431\u0430\u043D",
    "\u0435\u0431\u0430\u0442",
    "\u0435\u0431\u0443\u0442",
    "\u0435\u0431\u0443\u0447",
    "\u0435\u0431\u043D\u0443",
    "\u043D\u0430\u0454\u0431",
    "\u043D\u0430\u0435\u0431",
    "\u043D\u0430\u0457\u0431",
    "\u0437\u0430\u0454\u0431",
    "\u0437\u0430\u0457\u0431",
    "\u0432\u0438\u0454\u0431",
    "\u0432\u0438\u0457\u0431",
    "\u0434\u043E\u0457\u0431",
    "\u0443\u0457\u0431",
    "\u0443\u0454\u0431",
    "\u0443\u0435\u0431",
    "\u0437\u0430\u043B\u0443\u043F",
    "\u0433\u0430\u043D\u0434\u043E\u043D",
    "\u0433\u043E\u043D\u0434\u043E\u043D",
    "\u043C\u0443\u0434\u0430\u043A",
    "\u043C\u0443\u0434\u0438\u043B",
    "\u043F\u0456\u0434\u0430\u0440",
    "\u043F\u0456\u0434\u043E\u0440",
    "\u043F\u0438\u0434\u043E\u0440",
    "\u043F\u0438\u0434\u0430\u0440",
    "\u043D\u0430\u0445\u0443",
    "\u043F\u043E\u0445\u0443\u0439",
    "\u0434\u0440\u043E\u0447",
    "\u0441\u0446\u0443\u043A",
    "\u0441\u0446\u0438\u043A\u043B",
    "\u043A\u0443\u0440\u0432",
    "\u0441\u0432\u043E\u043B\u043E\u0447",
    "\u0433\u0456\u0432\u043D",
    "\u0433\u043E\u0432\u043D",
    "\u0441\u0440\u0430\u043A",
    "\u0441\u0440\u0430\u043D",
    "\u0436\u043E\u043F",
    "\u043C\u0440\u0430\u0437",
    "\u0448\u043B\u044E\u0445",
    "\u0448\u043B\u044C\u043E\u043D\u0434\u0440",
    "\u043F\u0430\u0434\u043B",
    "\u0434\u043E\u0432\u0431\u043E",
    "\u0434\u043E\u043B\u0431\u043E",
    "\u0441\u043A\u043E\u0442\u0438\u043D",
    "\u0442\u0432\u0430\u0440\u044E\u043A",
    "\u043A\u043E\u0437\u043B\u0438\u043D",
    "\u043B\u043E\u0448\u0430\u0440",
    // образи
    "\u0456\u0434\u0456\u043E\u0442",
    "\u043A\u0440\u0435\u0442\u0438\u043D",
    "\u043F\u0440\u0438\u0434\u0443\u0440",
    "\u0456\u043C\u0431\u0435\u0446\u0438\u043B",
    "\u0434\u0435\u0431\u0456\u043B",
    "\u0434\u0435\u0431\u0438\u043B",
    "\u0434\u0438\u0431\u0456\u043B",
    "\u0434\u0438\u0431\u0438\u043B"
  ];
  var PROFANITY_EXACT = /* @__PURE__ */ new Set([
    "\u0431\u043B\u044F",
    "\u0441\u0443\u043A\u0430",
    "\u0441\u0443\u043A\u0438",
    "\u0441\u0443\u043A\u0443",
    "\u0441\u0443\u0447\u043A\u0430",
    "\u0441\u0443\u0447\u043A\u0438",
    "\u0445\u0435\u0440",
    "\u043B\u043E\u0445",
    "\u043B\u043E\u0445\u0430",
    "\u043B\u043E\u0445\u0438",
    "\u043C\u0430\u043D\u0434\u0430",
    "\u043C\u0430\u043D\u0434\u0438",
    "\u043F\u0435\u0434\u0438\u043A",
    "\u043F\u0435\u0434\u0438\u043A\u0438",
    "\u043F\u0435\u0434\u0456\u043A",
    "\u043F\u0435\u0434\u0456\u043A\u0438",
    "\u043F\u0454\u0434\u0456\u043A",
    "\u043F\u0454\u0434\u0438\u043A",
    "\u043F\u0454\u0434\u0438\u043A\u0438",
    "\u0433\u043D\u0438\u0434\u0430",
    "\u0433\u043D\u0438\u0434\u0438",
    "\u0434\u0443\u0440\u0430\u043A",
    "\u0434\u0443\u0440\u0435\u043D\u044C",
    "\u0434\u0443\u0440\u043D\u0438\u0439",
    "\u0434\u0443\u0440\u043D\u0430",
    "\u0434\u0443\u0440\u043D\u0435",
    "\u0434\u0443\u0440\u043D\u0456",
    "\u0442\u0443\u043F\u0438\u0439",
    "\u0442\u0443\u043F\u0430",
    "\u0442\u0443\u043F\u0435",
    "\u0442\u0443\u043F\u0438\u0446\u044F",
    "\u0442\u0443\u043F\u0438\u0446\u0456",
    "\u043A\u043E\u0437\u0435\u043B",
    "\u043A\u043E\u0437\u043B\u0438",
    "\u0434\u0430\u0443\u043D",
    "\u0431\u043E\u0432\u0434\u0443\u0440",
    "\u0441\u043A\u043E\u0442"
  ]);
  var PROFANITY_SQUASH = ["\u0445\u0443\u0439", "\u0445\u0443\u0439\u043B", "\u043F\u0438\u0437\u0434", "\u043F\u0456\u0437\u0434", "\u0454\u0431\u0430\u043B", "\u0457\u0431\u0430\u043B", "\u0439\u043E\u0431", "\u0431\u043B\u044F\u0434", "\u0431\u043B\u044F\u0442", "\u043C\u0443\u0434\u0430\u043A", "\u043F\u0456\u0434\u043E\u0440", "\u043F\u0438\u0434\u043E\u0440"];
  var PROFANITY_LATIN = [
    // рос/укр трансліт
    "huy",
    "hui",
    "huil",
    "huyl",
    "huylo",
    "huilo",
    "huesos",
    "xyu",
    "pizd",
    "pizda",
    "yeban",
    "ebal",
    "ebat",
    "zaeb",
    "doeb",
    "vyeb",
    "blya",
    "blyad",
    "blyat",
    "suka",
    "suchka",
    "suchara",
    "pidor",
    "pidar",
    "pidoras",
    "mudak",
    "mudil",
    "zalupa",
    "gandon",
    "gondon",
    "dolboeb",
    "dolbaeb",
    "mraz",
    "nahui",
    "nahuy",
    "nahyi",
    "nahren",
    "pohui",
    "pohuy",
    "yoban",
    "yobn",
    "govno",
    "gavno",
    "durak",
    // англ.
    "fuck",
    "fuk",
    "fuq",
    "shit",
    "bullshit",
    "bitch",
    "biatch",
    "asshole",
    "motherfuck",
    "faggot",
    "nigger",
    "nigga",
    "whore",
    "wanker",
    "bollock",
    "dickhead",
    "jackass",
    "dumbass",
    "retard",
    "bastard",
    "douche"
  ];
  var PROFANITY_LATIN_SQUASH = ["blyat", "pizda", "nahui", "pidoras", "zalupa", "dolboeb"];
  function containsProfanity(text) {
    const norm = normalizeForFilter(text);
    const words = norm.split(/[^а-яіїєґ'a-z]+/).filter(Boolean);
    for (const w of words) {
      if (PROFANITY_EXACT.has(w))
        return true;
      if (PROFANITY_STEMS.some((s) => w.startsWith(s)))
        return true;
    }
    const squashed = norm.replace(/[^а-яіїєґa-z]/g, "");
    if (PROFANITY_SQUASH.some((s) => squashed.includes(s)))
      return true;
    const latinBase = deleet(String(text || "").toLowerCase().replace(/(.)\1{2,}/g, "$1"));
    for (const one of ["i", "l"]) {
      const v = latinBase.replace(/1/g, one);
      for (const w of v.split(/[^a-z]+/).filter(Boolean)) {
        if (PROFANITY_LATIN.some((s) => w.startsWith(s)))
          return true;
      }
      if (PROFANITY_LATIN_SQUASH.some((s) => v.replace(/[^a-z]/g, "").includes(s)))
        return true;
    }
    return false;
  }
  function sunTimes(date = /* @__PURE__ */ new Date(), lat = 50.717, lon = 25.81) {
    const rad = Math.PI / 180;
    const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
    const decl = -23.44 * rad * Math.cos(2 * Math.PI / 365 * (doy + 10));
    const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    if (cosH < -1 || cosH > 1)
      return null;
    const H = Math.acos(cosH) / rad;
    const B = 2 * Math.PI * (doy - 81) / 364;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const noonMin = 720 - 4 * lon - eot;
    const mk = (m) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCMinutes(Math.round(m));
      return d;
    };
    return { sunrise: mk(noonMin - 4 * H), sunset: mk(noonMin + 4 * H) };
  }
  function looksLikeSpam(text) {
    const t = String(text || "").trim();
    if (t.length === 1)
      return true;
    if (/(.)\1{5,}/.test(t))
      return true;
    const letters = t.replace(/[^а-яіїєґa-zА-ЯІЇЄҐA-Z]/g, "");
    if (letters.length >= 12 && !/[аеиіоуяюєїёauoiey]/i.test(letters))
      return true;
    return false;
  }

  // src/core/supabase.js
  var SUPABASE_URL = "https://uabyfecseqnemvcqhdem.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_sbV0XNktCiTK0iA4659P9g_Y3sT0mDv";
  var supa = null;
  if (typeof window !== "undefined" && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // Фаза Б: тримаємо сесію входу між запусками + ловимо її після повернення
      // з Google OAuth (редірект назад містить токен у URL). Без цього Google-вхід
      // не зберігається. persistSession — пам'ятати вхід; detectSessionInUrl —
      // підхопити токен з URL після редіректу; autoRefreshToken — продовжувати сесію.
      auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
    });
  }
  function getSupabase() {
    return supa;
  }
  function isSupabaseReady() {
    return supa !== null;
  }
  async function isTeamMember() {
    if (!supa)
      return false;
    try {
      const { data, error } = await supa.rpc("is_team_member");
      if (error)
        return false;
      return data === true;
    } catch {
      return false;
    }
  }
  async function fetchPublishedPosts() {
    if (!supa)
      return null;
    const { data, error } = await supa.from("posts").select("*").eq("status", "published").order("bumped_at", { ascending: false, nullsLast: true }).limit(200);
    if (error) {
      console.warn("[supabase] fetchPublishedPosts error:", error.message);
      return null;
    }
    return data;
  }
  async function submitPost(payload) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const { data, error } = await supa.rpc("submit_board_post", { payload });
    if (error) {
      console.warn("[supabase] submitPost error:", error);
      return { ok: false, error: error.message };
    }
    if (data && data.ok === false) {
      return { ok: false, error: data.error || "\u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438" };
    }
    return { ok: true, status: data && data.status || "pending" };
  }
  async function submitDiscussion(payload) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const row = {
      ...payload,
      type: "chat",
      status: "published",
      published_at: nowIso,
      bumped_at: nowIso
    };
    const { error } = await supa.from("posts").insert(row);
    if (error) {
      console.warn("[supabase] submitDiscussion error:", error);
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
  async function setReaction(postId, userId, emoji) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    if (emoji == null) {
      const { error: error2 } = await supa.from("reactions").delete().eq("post_id", postId).eq("user_id", userId);
      if (error2)
        return { ok: false, error: error2.message };
      return { ok: true };
    }
    const { error } = await supa.from("reactions").upsert({ post_id: postId, user_id: userId, emoji }, { onConflict: "post_id,user_id" });
    if (error)
      return { ok: false, error: error.message };
    return { ok: true };
  }
  async function fetchAllComments() {
    if (!supa)
      return /* @__PURE__ */ new Map();
    const { data, error } = await supa.from("comments").select("id, post_id, author, text, created_at, sender_uid, reply_to_id, edited_at, deleted_at, client_tag").order("created_at", { ascending: true });
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
  async function addComment(postId, author, text, senderUid, { replyToId = null, clientTag = null } = {}) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const row = { post_id: postId, author: author || null, text };
    if (senderUid)
      row.sender_uid = senderUid;
    if (replyToId)
      row.reply_to_id = replyToId;
    if (clientTag)
      row.client_tag = clientTag;
    try {
      const { data, error } = await withTimeout(supa.from("comments").insert(row).select().single());
      if (error)
        return { ok: false, error: error.message };
      return { ok: true, comment: data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function editComment(commentId, text) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    try {
      const { data, error } = await withTimeout(supa.from("comments").update({ text, edited_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", commentId).select().single());
      if (error)
        return { ok: false, error: error.message };
      return { ok: true, comment: data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function deleteComment(commentId) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    try {
      const { data, error } = await withTimeout(supa.from("comments").update({ deleted_at: (/* @__PURE__ */ new Date()).toISOString(), text: "" }).eq("id", commentId).select().single());
      if (error)
        return { ok: false, error: error.message };
      return { ok: true, comment: data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function uploadPhotoToStorage(blob, folder = "") {
    if (!supa)
      return { url: null, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    if (!blob)
      return { url: null, error: "\u041F\u043E\u0440\u043E\u0436\u043D\u0456\u0439 blob" };
    const ext = blob.type && blob.type.split("/")[1] || "jpg";
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `${folder}${getAnonId()}/${Date.now()}-${rand}.${ext}`;
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
  var _avatarCache = /* @__PURE__ */ new Map();
  var _nameCache = /* @__PURE__ */ new Map();
  function cachedAvatar(uid) {
    return uid ? _avatarCache.get(uid) || "" : "";
  }
  function cachedName(uid) {
    return uid ? _nameCache.get(uid) || "" : "";
  }
  function nameUid(uid) {
    return uid ? ` data-name-uid="${escapeHtml(uid)}"` : "";
  }
  function liveName(name, uid, fallback = "\u0416\u0438\u0442\u0435\u043B\u044C") {
    return escapeHtml(cachedName(uid) || name || fallback);
  }
  async function fetchAvatars(uids) {
    const need = [...new Set(uids)].filter((u) => u && !_avatarCache.has(u));
    if (!supa || !need.length)
      return;
    try {
      const { data, error } = await supa.rpc("get_avatars", { uids: need });
      if (error) {
        need.forEach((u) => _avatarCache.set(u, ""));
        return;
      }
      (data || []).forEach((r) => {
        if (r && r.uid) {
          _avatarCache.set(r.uid, r.avatar_url || "");
          if (r.name)
            _nameCache.set(r.uid, r.name);
        }
      });
      need.forEach((u) => {
        if (!_avatarCache.has(u))
          _avatarCache.set(u, "");
      });
    } catch (_) {
      need.forEach((u) => _avatarCache.set(u, ""));
    }
  }
  async function hydrateAvatars(root) {
    if (!root || !root.querySelectorAll)
      return;
    const els2 = [...root.querySelectorAll("[data-av-circle][data-av-uid]")].filter((e) => !e.dataset.avDone);
    if (!els2.length)
      return;
    await fetchAvatars(els2.map((e) => e.dataset.avUid));
    els2.forEach((el) => {
      el.dataset.avDone = "1";
      const url = cachedAvatar(el.dataset.avUid);
      if (!url)
        return;
      const base = el.classList[0];
      el.classList.add(base + "--img");
      el.style.background = "none";
      el.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
    });
  }
  async function hydrateNames(root) {
    if (!root || !root.querySelectorAll)
      return;
    const els2 = [...root.querySelectorAll("[data-name-uid]")].filter((e) => !e.dataset.nameDone);
    if (!els2.length)
      return;
    await fetchAvatars(els2.map((e) => e.dataset.nameUid));
    els2.forEach((el) => {
      el.dataset.nameDone = "1";
      const nm = cachedName(el.dataset.nameUid);
      if (nm)
        el.textContent = nm;
    });
  }
  async function fetchPublicProfile(uid) {
    if (!supa || !uid)
      return null;
    try {
      const { data, error } = await supa.rpc("get_public_profile", { p_uid: uid });
      if (error)
        return null;
      return (Array.isArray(data) ? data[0] : data) || null;
    } catch (_) {
      return null;
    }
  }
  async function fetchMyPosts(uid) {
    if (!supa || !uid)
      return [];
    const { data, error } = await supa.from("posts").select("*").eq("owner_uid", uid).neq("type", "chat").order("created_at", { ascending: false });
    if (error) {
      console.warn("[supabase] fetchMyPosts:", error.message);
      return [];
    }
    return data || [];
  }
  async function bumpPost(postId) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("bump_post", { p_id: postId });
    if (error) {
      console.warn("[supabase] bumpPost:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function closePost(postId) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("close_post", { p_id: postId });
    if (error) {
      console.warn("[supabase] closePost:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function deleteMyPost(postId) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("delete_my_post", { p_id: postId });
    if (error) {
      console.warn("[supabase] deleteMyPost:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function restorePost(postId) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("restore_post", { p_id: postId });
    if (error) {
      console.warn("[supabase] restorePost:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function updateBoardPost(postId, payload) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const { data, error } = await supa.rpc("update_board_post", { p_id: postId, payload });
    if (error) {
      console.warn("[supabase] updateBoardPost error:", error);
      return { ok: false, error: error.message };
    }
    if (data && data.ok === false) {
      return { ok: false, error: data.error || "\u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438" };
    }
    return { ok: true, status: data && data.status || "pending" };
  }
  async function fetchMyGroups() {
    if (!supa)
      return [];
    const { data, error } = await supa.from("chat_groups").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    if (error) {
      console.warn("[supabase] fetchMyGroups:", error.message);
      return [];
    }
    return data || [];
  }
  async function createGroup({ name, description = null, type = "locality", emoji = null, gradient = null }) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("create_group", {
      p_name: name,
      p_description: description,
      p_type: type,
      p_emoji: emoji,
      p_gradient: gradient
    });
    if (error) {
      console.warn("[supabase] createGroup:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data };
  }
  async function createGroupInvite(groupId, requiresApproval = false) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("create_group_invite", { p_gid: groupId, p_requires_approval: requiresApproval });
    if (error) {
      console.warn("[supabase] createGroupInvite:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, token: data };
  }
  async function getGroupByInvite(token) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("get_group_by_invite", { p_token: token });
    if (error) {
      console.warn("[supabase] getGroupByInvite:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function joinGroupByToken(token) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("join_group_by_token", { p_token: token });
    if (error) {
      console.warn("[supabase] joinGroupByToken:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function leaveGroup(groupId) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("leave_group", { p_gid: groupId });
    if (error) {
      console.warn("[supabase] leaveGroup:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function approveMember(groupId, uid) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("approve_member", { p_gid: groupId, p_uid: uid });
    if (error) {
      console.warn("[supabase] approveMember:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function rejectMember(groupId, uid) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("reject_member", { p_gid: groupId, p_uid: uid });
    if (error) {
      console.warn("[supabase] rejectMember:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function transferGroupOwner(groupId, uid) {
    if (!supa)
      return { ok: false, error: "no_supa" };
    const { data, error } = await supa.rpc("transfer_group_owner", { p_gid: groupId, p_uid: uid });
    if (error) {
      console.warn("[supabase] transferGroupOwner:", error.message);
      return { ok: false, error: error.message };
    }
    return data || { ok: false, error: "no_data" };
  }
  async function fetchGroupMembers(groupId) {
    if (!supa)
      return [];
    const { data, error } = await supa.from("chat_group_members").select("*").eq("group_id", groupId);
    if (error) {
      console.warn("[supabase] fetchGroupMembers:", error.message);
      return [];
    }
    return data || [];
  }
  async function fetchGroupMessages(groupId, sinceTs = null) {
    if (!supa)
      return [];
    let q = supa.from("chat_group_messages").select("*").eq("group_id", groupId);
    if (sinceTs)
      q = q.gt("created_at", sinceTs);
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) {
      console.warn("[supabase] fetchGroupMessages:", error.message);
      return [];
    }
    return data || [];
  }
  async function sendGroupMessage({ groupId, senderUid, text, photoUrl = null, replyToId = null, clientTag = null }) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    const row = { group_id: groupId, sender_uid: senderUid, text: text || null };
    if (photoUrl)
      row.photo_url = photoUrl;
    if (replyToId)
      row.reply_to_id = replyToId;
    if (clientTag)
      row.client_tag = clientTag;
    try {
      const { data, error } = await withTimeout(supa.from("chat_group_messages").insert(row).select().single());
      if (error)
        return { ok: false, error: error.message };
      supa.functions.invoke("send-group-push", { body: { message_id: data.id } }).catch((e) => console.warn("[supabase] send-group-push:", e?.message));
      return { ok: true, message: data };
    } catch (e) {
      return { ok: false, error: e && e.message || "timeout" };
    }
  }
  function subscribeGroupMessages(groupId, onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel(`group-${groupId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_group_messages", filter: `group_id=eq.${groupId}` },
      (payload) => onChange({ type: payload.eventType, row: payload.new || payload.old })
    ).subscribe();
    return () => supa.removeChannel(ch);
  }
  async function fetchMyThreads(uid) {
    if (!supa || !uid)
      return [];
    const { data, error } = await supa.from("threads").select("*, post:posts(id, title, text, category, photos, author, contact, location, published_at, created_at)").or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`).order("last_message_at", { ascending: false });
    if (error) {
      console.warn("[supabase] fetchMyThreads:", error.message);
      return [];
    }
    return data || [];
  }
  async function fetchThreadStates(uid) {
    const map = /* @__PURE__ */ new Map();
    if (!supa || !uid)
      return map;
    const { data, error } = await supa.from("thread_user_state").select("thread_id, archived, hidden, cleared_at").eq("uid", uid);
    if (error) {
      console.warn("[supabase] fetchThreadStates:", error.message);
      return map;
    }
    for (const r of data || [])
      map.set(r.thread_id, { archived: !!r.archived, hidden: !!r.hidden, cleared_at: r.cleared_at || null });
    return map;
  }
  async function setThreadState(uid, threadId, patch) {
    if (!supa || !uid)
      return { ok: false, error: "no-supa" };
    const row = { uid, thread_id: threadId, updated_at: (/* @__PURE__ */ new Date()).toISOString(), ...patch };
    try {
      const { error } = await withTimeout(
        supa.from("thread_user_state").upsert(row, { onConflict: "uid,thread_id" })
      );
      if (error)
        return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function getOrCreateThread({ postId, authorUid, buyerUid, authorName, buyerName }) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    const { data: existing } = await supa.from("threads").select("*").eq("post_id", postId).eq("buyer_uid", buyerUid).maybeSingle();
    if (existing)
      return { ok: true, thread: existing };
    const { data, error } = await supa.from("threads").insert({
      post_id: postId,
      author_uid: authorUid,
      buyer_uid: buyerUid,
      author_name: authorName || null,
      buyer_name: buyerName || null
    }).select().single();
    if (error)
      return { ok: false, error: error.message };
    return { ok: true, thread: data };
  }
  async function fetchMessages(threadId, sinceTs = null) {
    if (!supa)
      return [];
    let q = supa.from("messages").select("*").eq("thread_id", threadId);
    if (sinceTs)
      q = q.gt("created_at", sinceTs);
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) {
      console.warn("[supabase] fetchMessages:", error.message);
      return [];
    }
    return data || [];
  }
  async function fetchThreadClearedAt(uid, threadId) {
    if (!supa || !uid)
      return null;
    const { data } = await supa.from("thread_user_state").select("cleared_at").eq("uid", uid).eq("thread_id", threadId).maybeSingle();
    return data?.cleared_at || null;
  }
  var NET_TIMEOUT = 6e3;
  function withTimeout(thenable, ms = NET_TIMEOUT) {
    return Promise.race([
      Promise.resolve(thenable),
      new Promise((_, reject) => setTimeout(() => reject(new Error("\u041D\u0435\u043C\u0430\u0454 \u0437\u0432'\u044F\u0437\u043A\u0443")), ms))
    ]);
  }
  async function sendMessage({ threadId, senderUid, text, photoUrl = null, replyToId = null, clientTag = null }) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    const row = { thread_id: threadId, sender_uid: senderUid, text: text || null };
    if (photoUrl)
      row.photo_url = photoUrl;
    if (replyToId)
      row.reply_to_id = replyToId;
    if (clientTag)
      row.client_tag = clientTag;
    let data, error;
    try {
      ({ data, error } = await withTimeout(supa.from("messages").insert(row).select().single()));
    } catch (e) {
      return { ok: false, error: e.message };
    }
    if (error)
      return { ok: false, error: error.message };
    const preview = text || (photoUrl ? "\u{1F4F7} \u0424\u043E\u0442\u043E" : "");
    await supa.from("threads").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString(), last_message_text: preview }).eq("id", threadId);
    supa.functions.invoke("send-chat-push", { body: { message_id: data.id } }).catch((e) => console.warn("[supabase] send-chat-push:", e?.message));
    return { ok: true, message: data };
  }
  async function editMessage(messageId, text) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    try {
      const { data, error } = await withTimeout(supa.from("messages").update({ text, edited_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", messageId).select().single());
      if (error)
        return { ok: false, error: error.message };
      return { ok: true, message: data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function deleteMessage(messageId) {
    if (!supa)
      return { ok: false, error: "no-supa" };
    try {
      const { data, error } = await withTimeout(supa.from("messages").update({ deleted_at: (/* @__PURE__ */ new Date()).toISOString(), text: null, photo_url: null }).eq("id", messageId).select().single());
      if (error)
        return { ok: false, error: error.message };
      return { ok: true, message: data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async function markThreadRead(threadId, uid) {
    if (!supa || !uid)
      return;
    await supa.from("messages").update({ read_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("thread_id", threadId).neq("sender_uid", uid).is("read_at", null);
  }
  async function fetchUnreadByThread(uid) {
    const map = /* @__PURE__ */ new Map();
    if (!supa || !uid)
      return map;
    const { data: th } = await supa.from("threads").select("id").or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`);
    const ids = (th || []).map((t) => t.id);
    if (!ids.length)
      return map;
    const { data: states } = await supa.from("thread_user_state").select("thread_id, cleared_at").eq("uid", uid).not("cleared_at", "is", null);
    const clearedMap = new Map((states || []).map((s) => [s.thread_id, s.cleared_at]));
    const { data } = await supa.from("messages").select("thread_id, created_at").in("thread_id", ids).neq("sender_uid", uid).is("read_at", null);
    for (const m of data || []) {
      const cl = clearedMap.get(m.thread_id);
      if (cl && new Date(m.created_at) <= new Date(cl))
        continue;
      map.set(m.thread_id, (map.get(m.thread_id) || 0) + 1);
    }
    return map;
  }
  async function saveUserPushDevice({ uid, endpoint, p256dh, auth_key }) {
    if (!supa || !uid)
      return { ok: false };
    const { error } = await supa.from("user_push_devices").upsert({ uid, endpoint, p256dh, auth_key }, { onConflict: "uid,endpoint" });
    if (error) {
      console.warn("[supabase] saveUserPushDevice:", error.message);
      return { ok: false };
    }
    return { ok: true };
  }
  function subscribeThreadMessages(threadId, onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel(`thread-${threadId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
      (payload) => onChange({ type: payload.eventType, row: payload.new || payload.old })
    ).subscribe();
    return () => supa.removeChannel(ch);
  }
  function subscribeMyThreads(onChange, channelName = "my-threads") {
    if (!supa)
      return () => {
      };
    const ch = supa.channel(channelName).on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => onChange(p)).on("postgres_changes", { event: "*", schema: "public", table: "threads" }, (p) => onChange(p)).subscribe();
    return () => supa.removeChannel(ch);
  }
  async function fetchSavedPostIds(uid) {
    const set = /* @__PURE__ */ new Set();
    if (!supa || !uid)
      return set;
    const { data, error } = await supa.from("saved_posts").select("post_id").eq("uid", uid);
    if (error) {
      console.warn("[supabase] fetchSavedPostIds:", error.message);
      return set;
    }
    for (const r of data || [])
      set.add(r.post_id);
    return set;
  }
  async function addSavedPost(uid, postId) {
    if (!supa || !uid)
      return { ok: false };
    const { error } = await supa.from("saved_posts").upsert({ uid, post_id: postId }, { onConflict: "uid,post_id" });
    if (error) {
      console.warn("[supabase] addSavedPost:", error.message);
      return { ok: false };
    }
    return { ok: true };
  }
  async function removeSavedPost(uid, postId) {
    if (!supa || !uid)
      return { ok: false };
    const { error } = await supa.from("saved_posts").delete().eq("uid", uid).eq("post_id", postId);
    if (error) {
      console.warn("[supabase] removeSavedPost:", error.message);
      return { ok: false };
    }
    return { ok: true };
  }
  async function fetchTrackedRoutesFromDB(uid, todayISO) {
    if (!supa || !uid)
      return [];
    const { data, error } = await supa.from("push_subscriptions").select("route_id, route_name, boarding_stop, alighting_stop, track_date, dep_time, notified_dep, notified_warning, notified_canc").eq("user_uuid", uid).gte("track_date", todayISO);
    if (error) {
      console.warn("[supabase] fetchTrackedRoutesFromDB:", error.message);
      return [];
    }
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const r of data || []) {
      const key = `${r.route_id}|${r.track_date}|${r.boarding_stop || ""}|${r.alighting_stop || ""}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      out.push({
        routeId: r.route_id,
        trackDate: r.track_date,
        boardingStop: r.boarding_stop || null,
        alightingStop: r.alighting_stop || null,
        depTime: r.dep_time || "",
        title: r.route_name || "",
        notify: true,
        notifiedDep: !!r.notified_dep,
        notifiedWarning: !!r.notified_warning,
        notifiedCanc: !!r.notified_canc,
        notifiedBoard: false,
        notifiedFuture: true
        // не показувати повторний банер «майбутній» на новому пристрої
      });
    }
    return out;
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
      return { ok: false, error: "no-supa" };
    const { error } = await supa.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("route_id", routeId).eq("track_date", trackDate);
    if (error) {
      console.warn("[supabase] deletePushSubscription:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
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
  function subscribePageComments(onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel("page-comments-watch").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "page_comments" },
      (payload) => onChange(payload)
    ).subscribe();
    return () => supa.removeChannel(ch);
  }
  function subscribePageReactions(onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel("page-reactions-watch").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "page_reactions" },
      (payload) => onChange(payload)
    ).subscribe();
    return () => supa.removeChannel(ch);
  }
  function logEvent(visitorId, type, { tab = null, meta = null } = {}) {
    if (!supa || !visitorId)
      return;
    supa.from("analytics_events").insert({ visitor_id: visitorId, event_type: type, tab, meta }).then(({ error }) => {
      if (error)
        console.warn("[supabase] logEvent:", error.message);
    });
  }
  async function fetchPages() {
    if (!supa)
      return [];
    const { data, error } = await supa.from("pages").select("id, name, theme, avatar_url, banner_url, is_system").order("created_at", { ascending: true });
    if (error) {
      console.warn("[supabase] fetchPages:", error.message);
      return [];
    }
    return data || [];
  }
  async function fetchPagePosts(pageId = null, limit = 60) {
    if (!supa)
      return [];
    let q = supa.from("page_posts").select("id, page_id, author_uid, text, image_url, image_urls, created_at, pages(name, avatar_url)").is("deleted_at", null).order("created_at", { ascending: false }).limit(limit);
    if (pageId != null)
      q = q.eq("page_id", pageId);
    const { data, error } = await q;
    if (error) {
      console.warn("[supabase] fetchPagePosts:", error.message);
      return [];
    }
    return data || [];
  }
  async function fetchPageReactions(userKey) {
    if (!supa)
      return /* @__PURE__ */ new Map();
    const { data, error } = await supa.from("page_reactions").select("post_id, user_id");
    if (error) {
      console.warn("[supabase] fetchPageReactions:", error.message);
      return /* @__PURE__ */ new Map();
    }
    const map = /* @__PURE__ */ new Map();
    for (const r of data || []) {
      if (!map.has(r.post_id))
        map.set(r.post_id, { count: 0, my: false });
      const e = map.get(r.post_id);
      e.count++;
      if (r.user_id === userKey)
        e.my = true;
    }
    return map;
  }
  async function setPageReaction(postId, userKey, on) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    if (!on) {
      const { error: error2 } = await supa.from("page_reactions").delete().eq("post_id", postId).eq("user_id", userKey);
      return error2 ? { ok: false, error: error2.message } : { ok: true };
    }
    const { error } = await supa.from("page_reactions").upsert({ post_id: postId, user_id: userKey, emoji: "\u2764\uFE0F" }, { onConflict: "post_id,user_id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  async function fetchPageComments() {
    if (!supa)
      return /* @__PURE__ */ new Map();
    const { data, error } = await supa.from("page_comments").select("id, post_id, author_uid, text, created_at, deleted_at, parent_id").is("deleted_at", null).order("created_at", { ascending: true });
    if (error) {
      console.warn("[supabase] fetchPageComments:", error.message);
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
  async function addPageComment(postId, uid, text, parentId = null) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const { data, error } = await supa.from("page_comments").insert({ post_id: postId, author_uid: uid, text, parent_id: parentId }).select().single();
    return error ? { ok: false, error: error.message } : { ok: true, comment: data };
  }
  async function deletePageComment(commentId) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const { error } = await supa.from("page_comments").update({ deleted_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", commentId);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  async function fetchPageCommentReactions(userKey) {
    if (!supa)
      return /* @__PURE__ */ new Map();
    const { data, error } = await supa.from("page_comment_reactions").select("comment_id, user_id");
    if (error) {
      console.warn("[supabase] fetchPageCommentReactions:", error.message);
      return /* @__PURE__ */ new Map();
    }
    const map = /* @__PURE__ */ new Map();
    for (const r of data || []) {
      if (!map.has(r.comment_id))
        map.set(r.comment_id, { count: 0, my: false });
      const e = map.get(r.comment_id);
      e.count++;
      if (r.user_id === userKey)
        e.my = true;
    }
    return map;
  }
  async function setPageCommentReaction(commentId, uid, on) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    if (!on) {
      const { error: error2 } = await supa.from("page_comment_reactions").delete().eq("comment_id", commentId).eq("user_id", uid);
      return error2 ? { ok: false, error: error2.message } : { ok: true };
    }
    const { error } = await supa.from("page_comment_reactions").upsert({ comment_id: commentId, user_id: uid }, { onConflict: "comment_id,user_id" });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  function subscribePageCommentReactions(onChange) {
    if (!supa)
      return () => {
      };
    const ch = supa.channel("page-comment-reactions-watch").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "page_comment_reactions" },
      (payload) => onChange(payload)
    ).subscribe();
    return () => supa.removeChannel(ch);
  }
  async function fetchMyEditablePageIds() {
    if (!supa)
      return /* @__PURE__ */ new Set();
    const { data, error } = await supa.from("page_admins").select("page_id");
    if (error) {
      console.warn("[supabase] page_admins:", error.message);
      return /* @__PURE__ */ new Set();
    }
    return new Set((data || []).map((r) => r.page_id));
  }
  async function createPagePost(pageId, uid, text, imageUrls = []) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const arr = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : imageUrls ? [imageUrls] : [];
    const { data, error } = await supa.from("page_posts").insert({ page_id: pageId, author_uid: uid, text, image_urls: arr, image_url: arr[0] || null }).select("id, page_id, author_uid, text, image_url, image_urls, created_at, pages(name, avatar_url)").single();
    return error ? { ok: false, error: error.message } : { ok: true, post: data };
  }
  async function updatePage(pageId, patch) {
    if (!supa)
      return { ok: false, error: "Supabase \u043D\u0435 \u043F\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439" };
    const { data, error } = await supa.from("pages").update(patch).eq("id", pageId).select("id, name, theme, avatar_url, banner_url, is_system").single();
    return error ? { ok: false, error: error.message } : { ok: true, page: data };
  }
  async function fetchMySubscriptions() {
    if (!supa)
      return /* @__PURE__ */ new Set();
    const { data, error } = await supa.from("page_subscriptions").select("page_id");
    if (error)
      return /* @__PURE__ */ new Set();
    return new Set((data || []).map((r) => r.page_id));
  }
  async function setPageSubscription(pageId, uid, on) {
    if (!supa)
      return { ok: false };
    if (!on) {
      const { error: error2 } = await supa.from("page_subscriptions").delete().eq("page_id", pageId).eq("uid", uid);
      return error2 ? { ok: false, error: error2.message } : { ok: true };
    }
    const { error } = await supa.from("page_subscriptions").upsert({ page_id: pageId, uid }, { onConflict: "page_id,uid" });
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  // src/core/auth.js
  var _user = null;
  var _profileName = null;
  var _profileAvatar = null;
  var _listeners = [];
  function currentUser() {
    return _user;
  }
  function currentUserId() {
    return _user ? _user.id : null;
  }
  function isLoggedIn() {
    return !!_user;
  }
  function currentAvatarUrl() {
    return _profileAvatar || "";
  }
  function currentUserName() {
    if (_profileName)
      return _profileName;
    const m = _user && _user.user_metadata;
    return m && (m.name || m.full_name) || "\u0416\u0438\u0442\u0435\u043B\u044C";
  }
  function onAuthChange(cb) {
    _listeners.push(cb);
    return () => {
      const i = _listeners.indexOf(cb);
      if (i >= 0)
        _listeners.splice(i, 1);
    };
  }
  function emitAuthChange() {
    _listeners.forEach((cb) => {
      try {
        cb(_user);
      } catch (_) {
      }
    });
  }
  async function warmProfile() {
    if (!_user || _profileName)
      return;
    try {
      await getProfile();
      if (_profileName)
        emitAuthChange();
    } catch (_) {
    }
  }
  async function initAuth() {
    const supa2 = getSupabase();
    if (!supa2)
      return;
    try {
      const { data } = await supa2.auth.getSession();
      _user = data && data.session ? data.session.user : null;
      emitAuthChange();
      warmProfile();
    } catch (e) {
      console.warn("[auth] getSession:", e && e.message);
    }
    supa2.auth.onAuthStateChange((_event, session) => {
      _user = session ? session.user : null;
      emitAuthChange();
      warmProfile();
    });
  }
  async function signInWithGoogle() {
    const supa2 = getSupabase();
    if (!supa2) {
      showToast("\u041D\u0435\u043C\u0430\u0454 \u0437\u0432\u02BC\u044F\u0437\u043A\u0443 \u0437 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C", 3e3, "error");
      return;
    }
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supa2.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error)
      showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0443\u0432\u0456\u0439\u0442\u0438: " + error.message, 4e3, "error");
  }
  async function signOut() {
    const supa2 = getSupabase();
    if (!supa2)
      return;
    await supa2.auth.signOut();
    _user = null;
    _profileName = null;
    _profileAvatar = null;
    emitAuthChange();
  }
  function requireAuth(actionLabel, fn) {
    if (isLoggedIn()) {
      fn();
      return true;
    }
    showToast("\u0429\u043E\u0431 " + actionLabel + ", \u0443\u0432\u0456\u0439\u0434\u0456\u0442\u044C", 3500);
    document.dispatchEvent(new CustomEvent("cstl-need-login", { detail: { actionLabel } }));
    return false;
  }
  async function getProfile() {
    const supa2 = getSupabase();
    if (!supa2 || !_user)
      return null;
    const { data, error } = await supa2.from("profiles").select("*").eq("uid", _user.id).maybeSingle();
    if (error) {
      console.warn("[auth] getProfile:", error.message);
      return null;
    }
    if (data && data.name)
      _profileName = data.name;
    if (data && "avatar_url" in data)
      _profileAvatar = data.avatar_url || null;
    return data;
  }
  var PROFILE_FIELDS = ["name", "birth_date", "surname", "phone", "settlement", "street", "bio", "avatar_url"];
  async function saveProfile(fields = {}) {
    const supa2 = getSupabase();
    if (!supa2 || !_user)
      return { ok: false, error: "\u043D\u0435 \u0437\u0430\u043B\u043E\u0433\u0456\u043D\u0435\u043D\u043E" };
    const row = { uid: _user.id, email: _user.email || null };
    for (const k of PROFILE_FIELDS)
      if (k in fields)
        row[k] = fields[k] === "" ? null : fields[k];
    let partial = false;
    let { error } = await supa2.from("profiles").upsert(row, { onConflict: "uid" });
    if (error && /column|schema/i.test(error.message)) {
      partial = true;
      const core = {
        uid: _user.id,
        email: _user.email || null,
        name: row.name ?? null,
        birth_date: row.birth_date ?? null
      };
      ({ error } = await supa2.from("profiles").upsert(core, { onConflict: "uid" }));
    }
    if (error)
      return { ok: false, error: error.message };
    if (row.name)
      _profileName = row.name;
    if (!partial && "avatar_url" in row)
      _profileAvatar = row.avatar_url || null;
    return { ok: true, partial };
  }

  // src/core/boot.js
  function setupInstallTracking() {
    window.addEventListener("appinstalled", () => {
      logEvent(currentUserId() || getAnonId(), "pwa_install");
    });
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
      setupSW();
    } catch (e) {
    }
    try {
      setupInstallTracking();
    } catch (e) {
    }
  }

  // src/core/weather-icons.js
  var WX_CLEAR_DAY = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9ImNsZWFyLWRheSI+CjxnIGlkPSJTdW4iPgo8Y2lyY2xlIGlkPSJDb3JlIiBjeD0iNjQiIGN5PSI2My45OTk5IiByPSIxOCIgc3Ryb2tlPSIjRjhBRjE4IiBzdHJva2Utd2lkdGg9IjQiLz4KPHBhdGggaWQ9IlJheXMiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNjQgMTZDNjUuMTA0NiAxNiA2NiAxNi44OTU0IDY2IDE4VjMwQzY2IDMxLjEwNDYgNjUuMTA0NiAzMiA2NCAzMkM2Mi44OTU0IDMyIDYyIDMxLjEwNDYgNjIgMzBWMThDNjIgMTYuODk1NCA2Mi44OTU0IDE2IDY0IDE2Wk0zMC4wNTg5IDMwLjA1ODlDMzAuODM5OSAyOS4yNzc4IDMyLjEwNjIgMjkuMjc3OCAzMi44ODczIDMwLjA1ODlMNDEuMzcyNiAzOC41NDQyQzQyLjE1MzYgMzkuMzI1MiA0Mi4xNTM2IDQwLjU5MTUgNDEuMzcyNiA0MS4zNzI2QzQwLjU5MTUgNDIuMTUzNiAzOS4zMjUyIDQyLjE1MzYgMzguNTQ0MSA0MS4zNzI2TDMwLjA1ODkgMzIuODg3M0MyOS4yNzc4IDMyLjEwNjIgMjkuMjc3OCAzMC44Mzk5IDMwLjA1ODkgMzAuMDU4OVpNOTcuOTQxMSAzMC4wNTg5Qzk4LjcyMjIgMzAuODM5OSA5OC43MjIyIDMyLjEwNjIgOTcuOTQxMSAzMi44ODczTDg5LjQ1NTggNDEuMzcyNkM4OC42NzQ4IDQyLjE1MzYgODcuNDA4NSA0Mi4xNTM2IDg2LjYyNzQgNDEuMzcyNkM4NS44NDY0IDQwLjU5MTUgODUuODQ2NCAzOS4zMjUyIDg2LjYyNzQgMzguNTQ0Mkw5NS4xMTI3IDMwLjA1ODlDOTUuODkzNyAyOS4yNzc4IDk3LjE2MDEgMjkuMjc3OCA5Ny45NDExIDMwLjA1ODlaTTE2IDY0QzE2IDYyLjg5NTQgMTYuODk1NCA2MiAxOCA2MkgzMEMzMS4xMDQ2IDYyIDMyIDYyLjg5NTQgMzIgNjRDMzIgNjUuMTA0NiAzMS4xMDQ2IDY2IDMwIDY2SDE4QzE2Ljg5NTQgNjYgMTYgNjUuMTA0NiAxNiA2NFpNOTYgNjRDOTYgNjIuODk1NCA5Ni44OTU0IDYyIDk4IDYySDExMEMxMTEuMTA1IDYyIDExMiA2Mi44OTU0IDExMiA2NEMxMTIgNjUuMTA0NiAxMTEuMTA1IDY2IDExMCA2Nkg5OEM5Ni44OTU0IDY2IDk2IDY1LjEwNDYgOTYgNjRaTTQxLjM3MjYgODYuNjI3NEM0Mi4xNTM2IDg3LjQwODUgNDIuMTUzNiA4OC42NzQ4IDQxLjM3MjYgODkuNDU1OEwzMi44ODczIDk3Ljk0MTFDMzIuMTA2MiA5OC43MjIyIDMwLjgzOTkgOTguNzIyMiAzMC4wNTg5IDk3Ljk0MTFDMjkuMjc3OCA5Ny4xNjAxIDI5LjI3NzggOTUuODkzNyAzMC4wNTg5IDk1LjExMjdMMzguNTQ0MSA4Ni42Mjc0QzM5LjMyNTIgODUuODQ2NCA0MC41OTE1IDg1Ljg0NjQgNDEuMzcyNiA4Ni42Mjc0Wk04Ni42Mjc0IDg2LjYyNzRDODcuNDA4NSA4NS44NDY0IDg4LjY3NDggODUuODQ2NCA4OS40NTU4IDg2LjYyNzRMOTcuOTQxMSA5NS4xMTI3Qzk4LjcyMjIgOTUuODkzNyA5OC43MjIyIDk3LjE2MDEgOTcuOTQxMSA5Ny45NDExQzk3LjE2MDEgOTguNzIyMiA5NS44OTM3IDk4LjcyMjIgOTUuMTEyNyA5Ny45NDExTDg2LjYyNzQgODkuNDU1OEM4NS44NDY0IDg4LjY3NDggODUuODQ2NCA4Ny40MDg1IDg2LjYyNzQgODYuNjI3NFpNNjQgOTZDNjUuMTA0NiA5NiA2NiA5Ni44OTU0IDY2IDk4VjExMEM2NiAxMTEuMTA1IDY1LjEwNDYgMTEyIDY0IDExMkM2Mi44OTU0IDExMiA2MiAxMTEuMTA1IDYyIDExMFY5OEM2MiA5Ni44OTU0IDYyLjg5NTQgOTYgNjQgOTZaIiBmaWxsPSIjRjhBRjE4Ii8+CjwvZz4KPC9nPgo8L3N2Zz4=";
  var WX_PARTLY_CLOUDY = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9InBhcnRseS1jbG91ZHktZGF5IiBjbGlwLXBhdGg9InVybCgjY2xpcDBfMjA0NV8yODgyMCkiPgo8ZyBpZD0iU2t5Ij4KPGcgaWQ9Ik1hc2sgZ3JvdXAiPgo8bWFzayBpZD0ibWFzazBfMjA0NV8yODgyMCIgc3R5bGU9Im1hc2stdHlwZTphbHBoYSIgbWFza1VuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiPgo8ZyBpZD0iQ2xvdWQgTWFzayI+CjxwYXRoIGlkPSJTdWJ0cmFjdCIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMjggMEgwVjEyOEgxMjhWMFpNMzcuOTUxOSA5M0g5MC45NzUyQzEwMC4yMjcgOTMgMTA3Ljk5OCA4NS4zNTMgMTA3Ljk5OCA3Ni4wMjgxQzEwNy45OTggNjguMDIxNyAxMDIuMzA1IDYxLjM1MDEgOTQuOTI0OCA1OS41NTEyQzk1LjM2MTkgNDkuOTAwNSA4OS42NzQ0IDQwLjYwOTMgODAuNTUwOSAzNi43OTIyQzcxLjEwNzEgMzIuODQxMSA2MC4wNjY0IDM1LjYxMTkgNTMuNTMwNSA0My4yMzg0QzQ4LjU3MDIgNDEuNTk1NiA0Mi45ODE1IDQyLjI5NTcgMzguNTc0MSA0NS4yOTA3QzM0LjE0NTkgNDguMjk5OCAzMS40MzA1IDUzLjI4MDkgMzEuMTg0NiA1OC41Mzc5QzI0LjA2MzMgNjEuNDYzIDE5LjMyNzggNjguODUwNiAyMC4wNzc2IDc2Ljc4MzlDMjAuOTQyIDg1LjkyOTUgMjguODI4NSA5My4wMDE4IDM3Ljk1MTkgOTNaIiBmaWxsPSJibGFjayIvPgo8L2c+CjwvbWFzaz4KPGcgbWFzaz0idXJsKCNtYXNrMF8yMDQ1XzI4ODIwKSI+CjxnIGlkPSJTdW4iPgo8Y2lyY2xlIGlkPSJDb3JlIiBjeD0iMzkiIGN5PSI1MSIgcj0iOSIgZmlsbD0iI0Y4QUYxOCIvPgo8ZyBpZD0iUmF5cyI+CjxwYXRoIGQ9Ik0zNy42ODc1IDMxLjMxMjVDMzcuNjg3NSAzMC41ODc2IDM4LjI3NTEgMzAgMzkgMzBDMzkuNzI0OSAzMCA0MC4zMTI1IDMwLjU4NzYgNDAuMzEyNSAzMS4zMTI1VjM3LjQzNzVDNDAuMzEyNSAzOC4xNjI0IDM5LjcyNDkgMzguNzUgMzkgMzguNzVDMzguMjc1MSAzOC43NSAzNy42ODc1IDM4LjE2MjQgMzcuNjg3NSAzNy40Mzc1VjMxLjMxMjVaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik01MS45OTMxIDM2LjE1MDhDNTIuNTA1NiAzNS42MzgyIDUzLjMzNjcgMzUuNjM4MiA1My44NDkyIDM2LjE1MDhDNTQuMzYxOCAzNi42NjMzIDU0LjM2MTggMzcuNDk0MyA1My44NDkyIDM4LjAwNjlMNDkuNTE4MiA0Mi4zMzc5QzQ5LjAwNTYgNDIuODUwNSA0OC4xNzQ2IDQyLjg1MDUgNDcuNjYyMSA0Mi4zMzc5QzQ3LjE0OTUgNDEuODI1NCA0Ny4xNDk1IDQwLjk5NDQgNDcuNjYyMSA0MC40ODE4TDUxLjk5MzEgMzYuMTUwOFoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTU4LjY4NzUgNDkuNjg3NUM1OS40MTI0IDQ5LjY4NzUgNjAgNTAuMjc1MSA2MCA1MUM2MCA1MS43MjQ5IDU5LjQxMjQgNTIuMzEyNSA1OC42ODc1IDUyLjMxMjVINTIuNTYyNUM1MS44Mzc2IDUyLjMxMjUgNTEuMjUgNTEuNzI0OSA1MS4yNSA1MUM1MS4yNSA1MC4yNzUxIDUxLjgzNzYgNDkuNjg3NSA1Mi41NjI1IDQ5LjY4NzVINTguNjg3NVoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTUzLjg0OTIgNjMuOTkzMUM1NC4zNjE4IDY0LjUwNTcgNTQuMzYxOCA2NS4zMzY3IDUzLjg0OTIgNjUuODQ5MkM1My4zMzY3IDY2LjM2MTggNTIuNTA1NiA2Ni4zNjE4IDUxLjk5MzEgNjUuODQ5Mkw0Ny42NjIxIDYxLjUxODJDNDcuMTQ5NSA2MS4wMDU3IDQ3LjE0OTUgNjAuMTc0NiA0Ny42NjIxIDU5LjY2MjFDNDguMTc0NiA1OS4xNDk1IDQ5LjAwNTcgNTkuMTQ5NSA0OS41MTgyIDU5LjY2MjFMNTMuODQ5MiA2My45OTMxWiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNMzcuNjg3NSA2NC41NjI1QzM3LjY4NzUgNjMuODM3NiAzOC4yNzUxIDYzLjI1IDM5IDYzLjI1QzM5LjcyNDkgNjMuMjUgNDAuMzEyNSA2My44Mzc2IDQwLjMxMjUgNjQuNTYyNVY3MC42ODc1QzQwLjMxMjUgNzEuNDEyNCAzOS43MjQ5IDcyIDM5IDcyQzM4LjI3NTEgNzIgMzcuNjg3NSA3MS40MTI0IDM3LjY4NzUgNzAuNjg3NVY2NC41NjI1WiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNMjguNDgxOCA1OS42NjIxQzI4Ljk5NDMgNTkuMTQ5NSAyOS44MjU0IDU5LjE0OTUgMzAuMzM3OSA1OS42NjIxQzMwLjg1MDUgNjAuMTc0NiAzMC44NTA1IDYxLjAwNTYgMzAuMzM3OSA2MS41MTgyTDI2LjAwNjkgNjUuODQ5MkMyNS40OTQzIDY2LjM2MTggMjQuNjYzMyA2Ni4zNjE4IDI0LjE1MDggNjUuODQ5MkMyMy42MzgyIDY1LjMzNjcgMjMuNjM4MiA2NC41MDU2IDI0LjE1MDggNjMuOTkzMUwyOC40ODE4IDU5LjY2MjFaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik0yNS40Mzc1IDQ5LjY4NzVDMjYuMTYyNCA0OS42ODc1IDI2Ljc1IDUwLjI3NTEgMjYuNzUgNTFDMjYuNzUgNTEuNzI0OSAyNi4xNjI0IDUyLjMxMjUgMjUuNDM3NSA1Mi4zMTI1SDE5LjMxMjVDMTguNTg3NiA1Mi4zMTI1IDE4IDUxLjcyNDkgMTggNTFDMTggNTAuMjc1MSAxOC41ODc2IDQ5LjY4NzUgMTkuMzEyNSA0OS42ODc1SDI1LjQzNzVaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik0zMC4zMzc5IDQwLjQ4MThDMzAuODUwNSA0MC45OTQ0IDMwLjg1MDUgNDEuODI1NCAzMC4zMzc5IDQyLjMzNzlDMjkuODI1NCA0Mi44NTA1IDI4Ljk5NDQgNDIuODUwNSAyOC40ODE4IDQyLjMzNzlMMjQuMTUwOCAzOC4wMDY5QzIzLjYzODIgMzcuNDk0NCAyMy42MzgyIDM2LjY2MzMgMjQuMTUwOCAzNi4xNTA4QzI0LjY2MzMgMzUuNjM4MiAyNS40OTQ0IDM1LjYzODIgMjYuMDA2OSAzNi4xNTA4TDMwLjMzNzkgNDAuNDgxOFoiIGZpbGw9IiNGOEFGMTgiLz4KPC9nPgo8L2c+CjwvZz4KPC9nPgo8ZyBpZD0iQ2xvdWRzIj4KPGcgaWQ9IkNsb3VkIj4KPHBhdGggaWQ9IkNsb3VkXzIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNTQuODM3MSA0OC4yMTE1QzUxLjA3MzkgNDUuOTQ4MyA0Ni4zNDU3IDQ1Ljc4MjYgNDIuNDQxNSA0Ny42NjY0QzQxLjg4MzcgNDcuOTM1NSA0MS4zNDI4IDQ4LjI0NjUgNDAuODIzOSA0OC41OTkxQzM2LjY4MjYgNTEuNDEzMyAzNC40OTk4IDU2LjUxNTEgMzUuMzQ5OSA2MS40NTRDMjguMzkwNyA2Mi43Njg5IDIzLjM5MzYgNjkuMzQxMiAyNC4wNjE0IDc2LjQwNzZDMjQuNzI5MyA4My40NzQgMzAuODY3OCA4OS4wMDExIDM3Ljk1MTkgODlDMzcuOTUxNiA4OSAzNy45NTIyIDg5IDM3Ljk1MTkgODlIOTAuOTc2N0M5MS44NjA4IDg5IDkyLjcyNzMgODguOTA4IDkzLjU2NjkgODguNzMzM0M5NS4wNTMxIDg4LjQyMzkgOTYuNDU0NyA4Ny44NTUgOTcuNzE5NiA4Ny4wNzc0Qzk5LjMxMzEgODYuMDk3OSAxMDAuNjg5IDg0Ljc4NyAxMDEuNzQ0IDgzLjI0NjVDMTAyLjMyIDgyLjQwNDkgMTAyLjgwMSA4MS40OTQ3IDEwMy4xNjggODAuNTMyNEMxMDMuNzA1IDc5LjEyNSAxMDQgNzcuNjA2MyAxMDQgNzYuMDI4MUMxMDQgNzUuOTEzOCAxMDMuOTk4IDc1Ljc5OTcgMTAzLjk5NSA3NS42ODYxQzEwMy44NCA2OS45MDA2IDk5Ljc0MzQgNjUuMDM2NiA5NC4zOTA2IDYzLjU0NDdDOTMuMTE1OCA2My4xODk0IDkxLjc2OTcgNjMuMDI1MyA5MC4zODg2IDYzLjA4NTZDOTAuNzIxMSA2MS43NTIgOTAuOTAxNyA2MC40MDY5IDkwLjk0MDkgNTkuMDcwNkM5MS4xNzE2IDUxLjE4NjEgODYuNDc2NCA0My42MDY3IDc5LjAwODUgNDAuNDgyM0M3MC4yNjQ4IDM2LjgyNCA1OS44Mjc0IDQwLjEzOCA1NC44MzcxIDQ4LjIxMTVaTTkwLjk3NjcgODQuOTk3M0M5NS44NjQ5IDg0Ljk5NzMgMTAwIDgwLjg3ODggMTAwIDc2LjAyODFDMTAwIDcxLjY1MzEgOTYuNjQ5OCA2Ny45MTc4IDkyLjQyMTYgNjcuMjAwM0M5Mi4xMTk2IDY3LjE0OTEgOTEuODEzMSA2Ny4xMTMyIDkxLjUwMyA2Ny4wOTM3QzkxLjE5MjkgNjcuMDc0MSA5MC44NzkzIDY3LjA3MDggOTAuNTYyOSA2Ny4wODQ2TDg3Ljg4NjYgNjcuMjAxNEM4Ny4yNTYyIDY3LjIyOSA4Ni42NDk3IDY2Ljk1NzEgODYuMjUwNSA2Ni40NjgxQzg1Ljg1MTMgNjUuOTc5IDg1LjcwNjIgNjUuMzMwMSA4NS44NTkgNjQuNzE3NEw4Ni41MDc2IDYyLjExNjVDODYuNjIwOSA2MS42NjIyIDg2LjcxMTcgNjEuMjA2IDg2Ljc4MDggNjAuNzQ5MUM4Ny44MTcyIDUzLjg5NTkgODMuOTU4NSA0Ni44OTE3IDc3LjQ2NTYgNDQuMTc1MkM3MC41MjQ2IDQxLjI3MTIgNjIuMTg4NCA0My45Mjc0IDU4LjIzOSA1MC4zMTcxTDU3LjIwMDMgNTEuOTk3NUM1Ny4yMDAxIDUxLjk5OCA1Ny4xOTk4IDUxLjk5ODQgNTcuMTk5NSA1MS45OTg5QzU2LjYyMzQgNTIuOTI5NCA1NS40MDY5IDUzLjIyNDEgNTQuNDY5MiA1Mi42NjAyTDUyLjc3NjcgNTEuNjQyNEM0OS44MTE2IDQ5Ljg1OTIgNDUuOTMxOSA0OS45NjY0IDQzLjA3MSA1MS45MTA1QzQyLjcxNDcgNTIuMTUyNiA0Mi4zNzkzIDUyLjQxOTkgNDIuMDY2NCA1Mi43MDg4QzM5Ljg3NTYgNTQuNzMxMiAzOC43ODI0IDU3LjgxNTIgMzkuMjkxOCA2MC43NzQ1TDM5LjYyNTkgNjIuNzE1NEMzOS42MjYgNjIuNzE1OCAzOS42MjYgNjIuNzE2MiAzOS42MjYxIDYyLjcxNjZDMzkuODEwNyA2My43OTI4IDM5LjA5OTEgNjQuODE4NSAzOC4wMjY5IDY1LjAyMTZDMzguMDI2NiA2NS4wMjE3IDM4LjAyNzEgNjUuMDIxNiAzOC4wMjY5IDY1LjAyMTZMMzYuMDkyIDY1LjM4NzJDMzEuMTQxMyA2Ni4zMjI2IDI3LjU3MjQgNzEuMDQ0OSAyOC4wNDM3IDc2LjAzMDdDMjguNTE1MiA4MS4wMTk5IDMyLjkwOTIgODQuOTk4MyAzNy45NTE5IDg0Ljk5NzNIOTAuOTc2N1oiIGZpbGw9IiNFNkVGRkMiLz4KPC9nPgo8L2c+CjwvZz4KPC9nPgo8ZGVmcz4KPGNsaXBQYXRoIGlkPSJjbGlwMF8yMDQ1XzI4ODIwIj4KPHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+";
  var WX_OVERCAST = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9Im92ZXJjYXN0LWRheSIgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIwNDVfMjg4MjYpIj4KPGcgaWQ9IlNreSI+CjxnIGlkPSJNYXNrIGdyb3VwIj4KPG1hc2sgaWQ9Im1hc2swXzIwNDVfMjg4MjYiIHN0eWxlPSJtYXNrLXR5cGU6YWxwaGEiIG1hc2tVbml0cz0idXNlclNwYWNlT25Vc2UiIHg9IjAiIHk9IjAiIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij4KPGcgaWQ9IkNsb3VkIE1hc2siPgo8cGF0aCBpZD0iU3VidHJhY3QiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMTI4IDBIMFYxMjhIMTI4VjBaTTM3Ljk1MTkgOTNIOTAuOTc1MkMxMDAuMjI3IDkzIDEwNy45OTggODUuMzUzIDEwNy45OTggNzYuMDI4MUMxMDcuOTk4IDY4LjAyMTcgMTAyLjMwNSA2MS4zNTAxIDk0LjkyNDggNTkuNTUxMkM5NS4zNjE5IDQ5LjkwMDUgODkuNjc0NCA0MC42MDkzIDgwLjU1MDkgMzYuNzkyMkM3MS4xMDcxIDMyLjg0MTEgNjAuMDY2NCAzNS42MTE5IDUzLjUzMDUgNDMuMjM4NEM0OC41NzAyIDQxLjU5NTYgNDIuOTgxNSA0Mi4yOTU3IDM4LjU3NDEgNDUuMjkwN0MzNC4xNDU5IDQ4LjI5OTggMzEuNDMwNSA1My4yODA5IDMxLjE4NDYgNTguNTM3OUMyNC4wNjMzIDYxLjQ2MyAxOS4zMjc4IDY4Ljg1MDYgMjAuMDc3NiA3Ni43ODM5QzIwLjk0MiA4NS45Mjk1IDI4LjgyODUgOTMuMDAxOCAzNy45NTE5IDkzWiIgZmlsbD0iYmxhY2siLz4KPC9nPgo8L21hc2s+CjxnIG1hc2s9InVybCgjbWFzazBfMjA0NV8yODgyNikiPgo8ZyBpZD0iU3VuIj4KPGNpcmNsZSBpZD0iQ29yZSIgY3g9IjM5IiBjeT0iNTEiIHI9IjkiIGZpbGw9IiNGOEFGMTgiLz4KPGcgaWQ9IlJheXMiPgo8cGF0aCBkPSJNMzcuNjg3NSAzMS4zMTI1QzM3LjY4NzUgMzAuNTg3NiAzOC4yNzUxIDMwIDM5IDMwQzM5LjcyNDkgMzAgNDAuMzEyNSAzMC41ODc2IDQwLjMxMjUgMzEuMzEyNVYzNy40Mzc1QzQwLjMxMjUgMzguMTYyNCAzOS43MjQ5IDM4Ljc1IDM5IDM4Ljc1QzM4LjI3NTEgMzguNzUgMzcuNjg3NSAzOC4xNjI0IDM3LjY4NzUgMzcuNDM3NVYzMS4zMTI1WiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNNTEuOTkzMSAzNi4xNTA4QzUyLjUwNTYgMzUuNjM4MiA1My4zMzY3IDM1LjYzODIgNTMuODQ5MiAzNi4xNTA4QzU0LjM2MTggMzYuNjYzMyA1NC4zNjE4IDM3LjQ5NDMgNTMuODQ5MiAzOC4wMDY5TDQ5LjUxODIgNDIuMzM3OUM0OS4wMDU2IDQyLjg1MDUgNDguMTc0NiA0Mi44NTA1IDQ3LjY2MjEgNDIuMzM3OUM0Ny4xNDk1IDQxLjgyNTQgNDcuMTQ5NSA0MC45OTQ0IDQ3LjY2MjEgNDAuNDgxOEw1MS45OTMxIDM2LjE1MDhaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik01OC42ODc1IDQ5LjY4NzVDNTkuNDEyNCA0OS42ODc1IDYwIDUwLjI3NTEgNjAgNTFDNjAgNTEuNzI0OSA1OS40MTI0IDUyLjMxMjUgNTguNjg3NSA1Mi4zMTI1SDUyLjU2MjVDNTEuODM3NiA1Mi4zMTI1IDUxLjI1IDUxLjcyNDkgNTEuMjUgNTFDNTEuMjUgNTAuMjc1MSA1MS44Mzc2IDQ5LjY4NzUgNTIuNTYyNSA0OS42ODc1SDU4LjY4NzVaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik01My44NDkyIDYzLjk5MzFDNTQuMzYxOCA2NC41MDU3IDU0LjM2MTggNjUuMzM2NyA1My44NDkyIDY1Ljg0OTJDNTMuMzM2NyA2Ni4zNjE4IDUyLjUwNTYgNjYuMzYxOCA1MS45OTMxIDY1Ljg0OTJMNDcuNjYyMSA2MS41MTgyQzQ3LjE0OTUgNjEuMDA1NyA0Ny4xNDk1IDYwLjE3NDYgNDcuNjYyMSA1OS42NjIxQzQ4LjE3NDYgNTkuMTQ5NSA0OS4wMDU3IDU5LjE0OTUgNDkuNTE4MiA1OS42NjIxTDUzLjg0OTIgNjMuOTkzMVoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTM3LjY4NzUgNjQuNTYyNUMzNy42ODc1IDYzLjgzNzYgMzguMjc1MSA2My4yNSAzOSA2My4yNUMzOS43MjQ5IDYzLjI1IDQwLjMxMjUgNjMuODM3NiA0MC4zMTI1IDY0LjU2MjVWNzAuNjg3NUM0MC4zMTI1IDcxLjQxMjQgMzkuNzI0OSA3MiAzOSA3MkMzOC4yNzUxIDcyIDM3LjY4NzUgNzEuNDEyNCAzNy42ODc1IDcwLjY4NzVWNjQuNTYyNVoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTI4LjQ4MTggNTkuNjYyMUMyOC45OTQzIDU5LjE0OTUgMjkuODI1NCA1OS4xNDk1IDMwLjMzNzkgNTkuNjYyMUMzMC44NTA1IDYwLjE3NDYgMzAuODUwNSA2MS4wMDU2IDMwLjMzNzkgNjEuNTE4MkwyNi4wMDY5IDY1Ljg0OTJDMjUuNDk0MyA2Ni4zNjE4IDI0LjY2MzMgNjYuMzYxOCAyNC4xNTA4IDY1Ljg0OTJDMjMuNjM4MiA2NS4zMzY3IDIzLjYzODIgNjQuNTA1NiAyNC4xNTA4IDYzLjk5MzFMMjguNDgxOCA1OS42NjIxWiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNMjUuNDM3NSA0OS42ODc1QzI2LjE2MjQgNDkuNjg3NSAyNi43NSA1MC4yNzUxIDI2Ljc1IDUxQzI2Ljc1IDUxLjcyNDkgMjYuMTYyNCA1Mi4zMTI1IDI1LjQzNzUgNTIuMzEyNUgxOS4zMTI1QzE4LjU4NzYgNTIuMzEyNSAxOCA1MS43MjQ5IDE4IDUxQzE4IDUwLjI3NTEgMTguNTg3NiA0OS42ODc1IDE5LjMxMjUgNDkuNjg3NUgyNS40Mzc1WiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNMzAuMzM3OSA0MC40ODE4QzMwLjg1MDUgNDAuOTk0NCAzMC44NTA1IDQxLjgyNTQgMzAuMzM3OSA0Mi4zMzc5QzI5LjgyNTQgNDIuODUwNSAyOC45OTQ0IDQyLjg1MDUgMjguNDgxOCA0Mi4zMzc5TDI0LjE1MDggMzguMDA2OUMyMy42MzgyIDM3LjQ5NDQgMjMuNjM4MiAzNi42NjMzIDI0LjE1MDggMzYuMTUwOEMyNC42NjMzIDM1LjYzODIgMjUuNDk0NCAzNS42MzgyIDI2LjAwNjkgMzYuMTUwOEwzMC4zMzc5IDQwLjQ4MThaIiBmaWxsPSIjRjhBRjE4Ii8+CjwvZz4KPC9nPgo8L2c+CjwvZz4KPGcgaWQ9IkNsb3VkcyIgY2xpcC1wYXRoPSJ1cmwoI2NsaXAxXzIwNDVfMjg4MjYpIj4KPGcgaWQ9Ik1hc2sgZ3JvdXBfMiI+CjxtYXNrIGlkPSJtYXNrMV8yMDQ1XzI4ODI2IiBzdHlsZT0ibWFzay10eXBlOmFscGhhIiBtYXNrVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4PSIwIiB5PSIwIiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+CjxnIGlkPSJDbG91ZCBNYXNrXzIiPgo8cGF0aCBpZD0iU3VidHJhY3RfMiIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMjggMEgwVjEyOEgxMjhWMFpNMzcuOTUxOSA5M0g5MC45NzUyQzEwMC4yMjcgOTMgMTA3Ljk5OCA4NS4zNTMgMTA3Ljk5OCA3Ni4wMjgxQzEwNy45OTggNjguMDIxNyAxMDIuMzA1IDYxLjM1MDEgOTQuOTI0OCA1OS41NTEyQzk1LjM2MTkgNDkuOTAwNSA4OS42NzQ0IDQwLjYwOTMgODAuNTUwOSAzNi43OTIyQzcxLjEwNzEgMzIuODQxMSA2MC4wNjY0IDM1LjYxMTkgNTMuNTMwNSA0My4yMzg0QzQ4LjU3MDIgNDEuNTk1NiA0Mi45ODE1IDQyLjI5NTcgMzguNTc0MSA0NS4yOTA3QzM0LjE0NTkgNDguMjk5OCAzMS40MzA1IDUzLjI4MDkgMzEuMTg0NiA1OC41Mzc5QzI0LjA2MzMgNjEuNDYzIDE5LjMyNzggNjguODUwNiAyMC4wNzc2IDc2Ljc4MzlDMjAuOTQyIDg1LjkyOTUgMjguODI4NSA5My4wMDE4IDM3Ljk1MTkgOTNaIiBmaWxsPSJibGFjayIvPgo8L2c+CjwvbWFzaz4KPGcgbWFzaz0idXJsKCNtYXNrMV8yMDQ1XzI4ODI2KSI+CjxnIGlkPSJTZWNvbmRhcnkgQ2xvdWQiPgo8cGF0aCBpZD0iQ2xvdWQiIGQ9Ik0xMDEuMTk0IDU1LjU2MjFDMTAyLjM2NyA1MS4wNSA5OS43NjAyIDQ2LjQyMjUgOTUuNTA0MyA0NC43MTMzQzkxLjE5MTkgNDIuOTgxMyA4NS45NjEyIDQ0LjQ3NDMgODMuNDE4NiA0OC40MjNDODEuMjY0OCA0Ny4xNzk3IDc4LjQ5NiA0Ny4yNDk2IDc2LjQxMTkgNDguNjA5Qzc0LjM4MDggNDkuOTM0IDczLjI0MzQgNTIuMzcyIDczLjY3NSA1NC43Nzg5QzcwLjI5OTggNTUuMzkxMSA2Ny42ODc0IDU4LjQ2ODggNjguMDMwNyA2MS45NTYxQzY4LjM3NDggNjUuNDUxMSA3MS41Mzk0IDY4LjAwMDggNzQuOTc2NyA2OEM4My44MTI2IDY4IDkyLjY1MTQgNjcuOTkyNSAxMDEuNDg4IDY4QzEwNC45MTEgNjggMTA4IDY1LjI4NDkgMTA4IDYxLjc3NEMxMDggNTguMTQyOCAxMDQuNzIxIDU1LjQxNDIgMTAxLjE5NCA1NS41NjIxWiIgZmlsbD0iIzk0QTNCOCIvPgo8L2c+CjwvZz4KPC9nPgo8ZyBpZD0iQ2xvdWRfMiI+CjxwYXRoIGlkPSJDbG91ZF8zIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTU0LjgzNzEgNDguMjExNUM1MS4wNzM5IDQ1Ljk0ODMgNDYuMzQ1NyA0NS43ODI2IDQyLjQ0MTUgNDcuNjY2NEM0MS44ODM3IDQ3LjkzNTUgNDEuMzQyOCA0OC4yNDY1IDQwLjgyMzkgNDguNTk5MUMzNi42ODI2IDUxLjQxMzMgMzQuNDk5OCA1Ni41MTUxIDM1LjM0OTkgNjEuNDU0QzI4LjM5MDcgNjIuNzY4OSAyMy4zOTM2IDY5LjM0MTIgMjQuMDYxNCA3Ni40MDc2QzI0LjcyOTMgODMuNDc0IDMwLjg2NzggODkuMDAxMSAzNy45NTE5IDg5QzM3Ljk1MTYgODkgMzcuOTUyMiA4OSAzNy45NTE5IDg5SDkwLjk3NjdDOTEuODYwOCA4OSA5Mi43MjczIDg4LjkwOCA5My41NjY5IDg4LjczMzNDOTUuMDUzMSA4OC40MjM5IDk2LjQ1NDcgODcuODU1IDk3LjcxOTYgODcuMDc3NEM5OS4zMTMxIDg2LjA5NzkgMTAwLjY4OSA4NC43ODcgMTAxLjc0NCA4My4yNDY1QzEwMi4zMiA4Mi40MDQ5IDEwMi44MDEgODEuNDk0NyAxMDMuMTY4IDgwLjUzMjRDMTAzLjcwNSA3OS4xMjUgMTA0IDc3LjYwNjMgMTA0IDc2LjAyODFDMTA0IDc1LjkxMzggMTAzLjk5OCA3NS43OTk3IDEwMy45OTUgNzUuNjg2MUMxMDMuODQgNjkuOTAwNiA5OS43NDM0IDY1LjAzNjYgOTQuMzkwNiA2My41NDQ3QzkzLjExNTggNjMuMTg5NCA5MS43Njk3IDYzLjAyNTMgOTAuMzg4NiA2My4wODU2QzkwLjcyMTEgNjEuNzUyIDkwLjkwMTcgNjAuNDA2OSA5MC45NDA5IDU5LjA3MDZDOTEuMTcxNiA1MS4xODYxIDg2LjQ3NjQgNDMuNjA2NyA3OS4wMDg1IDQwLjQ4MjNDNzAuMjY0OCAzNi44MjQgNTkuODI3NCA0MC4xMzggNTQuODM3MSA0OC4yMTE1Wk05MC45NzY3IDg0Ljk5NzNDOTUuODY0OSA4NC45OTczIDEwMCA4MC44Nzg4IDEwMCA3Ni4wMjgxQzEwMCA3MS42NTMxIDk2LjY0OTggNjcuOTE3OCA5Mi40MjE2IDY3LjIwMDNDOTIuMTE5NiA2Ny4xNDkxIDkxLjgxMzEgNjcuMTEzMiA5MS41MDMgNjcuMDkzN0M5MS4xOTI5IDY3LjA3NDEgOTAuODc5MyA2Ny4wNzA4IDkwLjU2MjkgNjcuMDg0Nkw4Ny44ODY2IDY3LjIwMTRDODcuMjU2MiA2Ny4yMjkgODYuNjQ5NyA2Ni45NTcxIDg2LjI1MDUgNjYuNDY4MUM4NS44NTEzIDY1Ljk3OSA4NS43MDYyIDY1LjMzMDEgODUuODU5IDY0LjcxNzRMODYuNTA3NiA2Mi4xMTY1Qzg2LjYyMDkgNjEuNjYyMiA4Ni43MTE3IDYxLjIwNiA4Ni43ODA4IDYwLjc0OTFDODcuODE3MiA1My44OTU5IDgzLjk1ODUgNDYuODkxNyA3Ny40NjU2IDQ0LjE3NTJDNzAuNTI0NiA0MS4yNzEyIDYyLjE4ODQgNDMuOTI3NCA1OC4yMzkgNTAuMzE3MUw1Ny4yMDAzIDUxLjk5NzVDNTcuMjAwMSA1MS45OTggNTcuMTk5OCA1MS45OTg0IDU3LjE5OTUgNTEuOTk4OUM1Ni42MjM0IDUyLjkyOTQgNTUuNDA2OSA1My4yMjQxIDU0LjQ2OTIgNTIuNjYwMkw1Mi43NzY3IDUxLjY0MjRDNDkuODExNiA0OS44NTkyIDQ1LjkzMTkgNDkuOTY2NCA0My4wNzEgNTEuOTEwNUM0Mi43MTQ3IDUyLjE1MjYgNDIuMzc5MyA1Mi40MTk5IDQyLjA2NjQgNTIuNzA4OEMzOS44NzU2IDU0LjczMTIgMzguNzgyNCA1Ny44MTUyIDM5LjI5MTggNjAuNzc0NUwzOS42MjU5IDYyLjcxNTRDMzkuNjI2IDYyLjcxNTggMzkuNjI2IDYyLjcxNjIgMzkuNjI2MSA2Mi43MTY2QzM5LjgxMDcgNjMuNzkyOCAzOS4wOTkxIDY0LjgxODUgMzguMDI2OSA2NS4wMjE2QzM4LjAyNjYgNjUuMDIxNyAzOC4wMjcxIDY1LjAyMTYgMzguMDI2OSA2NS4wMjE2TDM2LjA5MiA2NS4zODcyQzMxLjE0MTMgNjYuMzIyNiAyNy41NzI0IDcxLjA0NDkgMjguMDQzNyA3Ni4wMzA3QzI4LjUxNTIgODEuMDE5OSAzMi45MDkyIDg0Ljk5ODMgMzcuOTUxOSA4NC45OTczSDkwLjk3NjdaIiBmaWxsPSIjRTZFRkZDIi8+CjwvZz4KPC9nPgo8L2c+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMjA0NV8yODgyNiI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8Y2xpcFBhdGggaWQ9ImNsaXAxXzIwNDVfMjg4MjYiPgo8cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsbD0id2hpdGUiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4=";
  var WX_FOG = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9ImZvZyIgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIwNDVfMjkwMzgpIj4KPGcgaWQ9IlNreSI+CjxnIGlkPSJDbG91ZHMiPgo8ZyBpZD0iQ2xvdWQiPgo8cGF0aCBpZD0iQ2xvdWRfMiIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik01NC44MzcxIDQ4LjIxMTVDNTkuODI3NCA0MC4xMzggNzAuMjY0OCAzNi44MjQgNzkuMDA4NSA0MC40ODIzQzg3Ljc0MTYgNDQuMTM2IDkyLjY4MzYgNTMuODgyNyA5MC4zODg2IDYzLjA4NTZDOTcuNjgyOCA2Mi43NjcxIDEwNCA2OC43MDY3IDEwNCA3Ni4wMjgxQzEwNCA4My4xMTU4IDk4LjA0NzYgODkgOTAuOTc2NyA4OUM4OS44NzIxIDg5IDg4Ljk3NjcgODguMTA0IDg4Ljk3NjcgODYuOTk4NkM4OC45NzY3IDg1Ljg5MzMgODkuODcyMSA4NC45OTczIDkwLjk3NjcgODQuOTk3M0M5NS44NjM3IDg0Ljk5NzMgMTAwIDgwLjg3OTkgMTAwIDc2LjAyODFDMTAwIDcxLjAyNjIgOTUuNjIyMiA2Ni44NjM3IDkwLjU2MjkgNjcuMDg0Nkw4Ny44ODY2IDY3LjIwMTRDODcuMjU2MiA2Ny4yMjkgODYuNjQ5NyA2Ni45NTcxIDg2LjI1MDUgNjYuNDY4MUM4NS44NTEzIDY1Ljk3OSA4NS43MDYyIDY1LjMzMDEgODUuODU5IDY0LjcxNzRMODYuNTA3NiA2Mi4xMTY1Qzg4LjMyMDEgNTQuODQ4NCA4NC4zOTEgNDcuMDcyNyA3Ny40NjU2IDQ0LjE3NTJDNzAuNTI0OCA0MS4yNzEzIDYyLjE4ODYgNDMuOTI3MiA1OC4yMzkgNTAuMzE3MUw1Ny4yMDAzIDUxLjk5NzVDNTYuNjI0NSA1Mi45MjkxIDU1LjQwNzQgNTMuMjI0NCA1NC40NjkyIDUyLjY2MDJMNTIuNzc2NyA1MS42NDI0QzQ5LjgxMTYgNDkuODU5MiA0NS45MzE5IDQ5Ljk2NjQgNDMuMDcxIDUxLjkxMDVDNDAuMjIwOCA1My44NDc0IDM4LjcwOTYgNTcuMzkyMiAzOS4yOTE4IDYwLjc3NDVMMzkuNjI1OSA2Mi43MTU0QzM5LjgxMTMgNjMuNzkyNCAzOS4wOTkxIDY0LjgxOSAzOC4wMjYgNjUuMDIxOEwzNi4wOTIgNjUuMzg3MkMzMS4xNDIxIDY2LjMyMjUgMjcuNTcyMyA3MS4wNDQxIDI4LjA0MzcgNzYuMDMwN0MyOC41MTUzIDgxLjAyMDcgMzIuOTEgODQuOTk4MyAzNy45NTE5IDg0Ljk5NzNDMzkuMDU2NSA4NC45OTcgMzkuOTUyMSA4NS44OTI5IDM5Ljk1MjQgODYuOTk4MkMzOS45NTI2IDg4LjEwMzUgMzkuMDU3MyA4OC45OTk4IDM3Ljk1MjggODlDMzAuODY5NSA4OS4wMDE1IDI0LjcyOTQgODMuNDc1NSAyNC4wNjE0IDc2LjQwNzZDMjMuMzkzNiA2OS4zNDEyIDI4LjM5MDcgNjIuNzY4OSAzNS4zNDk5IDYxLjQ1NEMzNC40OTk3IDU2LjUxNDggMzYuNjgyOCA1MS40MTMxIDQwLjgyMzkgNDguNTk5MUM0NC45NzUyIDQ1Ljc3ODEgNTAuNTM2MyA0NS42MjUgNTQuODM3MSA0OC4yMTE1WiIgZmlsbD0iI0U2RUZGQyIvPgo8L2c+CjwvZz4KPC9nPgo8ZyBpZD0iUHJlY2lwaXRhdGlvbiI+CjxwYXRoIGlkPSJMaW5lIDIiIGQ9Ik00MCA5NUg4OCIgc3Ryb2tlPSIjRTJFOEYwIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1taXRlcmxpbWl0PSIxMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGlkPSJMaW5lIDEiIGQ9Ik00MCAxMDNIODgiIHN0cm9rZT0iI0UyRThGMCIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L2c+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMjA0NV8yOTAzOCI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPg==";
  var WX_DRIZZLE = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9ImRyaXp6bGUiIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yMDQ1XzI4ODczKSI+CjxnIGlkPSJTa3kiPgo8ZyBpZD0iQ2xvdWRzIj4KPGcgaWQ9IkNsb3VkIj4KPHBhdGggaWQ9IkNsb3VkXzIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNTQuODM3MSA0OC4yMTE1QzU5LjgyNzQgNDAuMTM4IDcwLjI2NDggMzYuODI0IDc5LjAwODUgNDAuNDgyM0M4Ny43NDE2IDQ0LjEzNiA5Mi42ODM2IDUzLjg4MjcgOTAuMzg4NiA2My4wODU2Qzk3LjY4MjggNjIuNzY3MSAxMDQgNjguNzA2NyAxMDQgNzYuMDI4MUMxMDQgODMuMTE1OCA5OC4wNDc2IDg5IDkwLjk3NjcgODlDODkuODcyMSA4OSA4OC45NzY3IDg4LjEwNCA4OC45NzY3IDg2Ljk5ODZDODguOTc2NyA4NS44OTMzIDg5Ljg3MjEgODQuOTk3MyA5MC45NzY3IDg0Ljk5NzNDOTUuODYzNyA4NC45OTczIDEwMCA4MC44Nzk5IDEwMCA3Ni4wMjgxQzEwMCA3MS4wMjYyIDk1LjYyMjIgNjYuODYzNyA5MC41NjI5IDY3LjA4NDZMODcuODg2NiA2Ny4yMDE0Qzg3LjI1NjIgNjcuMjI5IDg2LjY0OTcgNjYuOTU3MSA4Ni4yNTA1IDY2LjQ2ODFDODUuODUxMyA2NS45NzkgODUuNzA2MiA2NS4zMzAxIDg1Ljg1OSA2NC43MTc0TDg2LjUwNzYgNjIuMTE2NUM4OC4zMjAxIDU0Ljg0ODQgODQuMzkxIDQ3LjA3MjcgNzcuNDY1NiA0NC4xNzUyQzcwLjUyNDggNDEuMjcxMyA2Mi4xODg2IDQzLjkyNzIgNTguMjM5IDUwLjMxNzFMNTcuMjAwMyA1MS45OTc1QzU2LjYyNDUgNTIuOTI5MSA1NS40MDc0IDUzLjIyNDQgNTQuNDY5MiA1Mi42NjAyTDUyLjc3NjcgNTEuNjQyNEM0OS44MTE2IDQ5Ljg1OTIgNDUuOTMxOSA0OS45NjY0IDQzLjA3MSA1MS45MTA1QzQwLjIyMDggNTMuODQ3NCAzOC43MDk2IDU3LjM5MjIgMzkuMjkxOCA2MC43NzQ1TDM5LjYyNTkgNjIuNzE1NEMzOS44MTEzIDYzLjc5MjQgMzkuMDk5MSA2NC44MTkgMzguMDI2IDY1LjAyMThMMzYuMDkyIDY1LjM4NzJDMzEuMTQyMSA2Ni4zMjI1IDI3LjU3MjMgNzEuMDQ0MSAyOC4wNDM3IDc2LjAzMDdDMjguNTE1MyA4MS4wMjA3IDMyLjkxIDg0Ljk5ODMgMzcuOTUxOSA4NC45OTczQzM5LjA1NjUgODQuOTk3IDM5Ljk1MjEgODUuODkyOSAzOS45NTI0IDg2Ljk5ODJDMzkuOTUyNiA4OC4xMDM1IDM5LjA1NzMgODguOTk5OCAzNy45NTI4IDg5QzMwLjg2OTUgODkuMDAxNSAyNC43Mjk0IDgzLjQ3NTUgMjQuMDYxNCA3Ni40MDc2QzIzLjM5MzYgNjkuMzQxMiAyOC4zOTA3IDYyLjc2ODkgMzUuMzQ5OSA2MS40NTRDMzQuNDk5NyA1Ni41MTQ4IDM2LjY4MjggNTEuNDEzMSA0MC44MjM5IDQ4LjU5OTFDNDQuOTc1MiA0NS43NzgxIDUwLjUzNjMgNDUuNjI1IDU0LjgzNzEgNDguMjExNVoiIGZpbGw9IiNFNkVGRkMiLz4KPC9nPgo8L2c+CjwvZz4KPGcgaWQ9IlByZWNpcGl0YXRpb24iPgo8ZyBpZD0iUmFpbmRyb3BzIj4KPHBhdGggaWQ9IlJhaW5kcm9wIDEiIGQ9Ik01MiA4N1Y5MCIgc3Ryb2tlPSIjMEE1QUQ0IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgOCkiLz4KPHBhdGggaWQ9IlJhaW5kcm9wIDIiIGQ9Ik02NCA4N1Y5MCIgc3Ryb2tlPSIjMEE1QUQ0IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgMCkiLz4KPHBhdGggaWQ9IlJhaW5kcm9wIDMiIGQ9Ik03NiA4N1Y5MCIgc3Ryb2tlPSIjMEE1QUQ0IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgOCkiLz4KPC9nPgo8L2c+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMjA0NV8yODg3MyI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPg==";
  var WX_RAIN = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9InJhaW4iIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yMDQ1XzI4ODQwKSI+CjxnIGlkPSJTa3kiPgo8ZyBpZD0iQ2xvdWRzIj4KPGcgaWQ9IkNsb3VkIj4KPHBhdGggaWQ9IkNsb3VkXzIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNTQuODM3MSA0OC4yMTE1QzU5LjgyNzQgNDAuMTM4IDcwLjI2NDggMzYuODI0IDc5LjAwODUgNDAuNDgyM0M4Ny43NDE2IDQ0LjEzNiA5Mi42ODM2IDUzLjg4MjcgOTAuMzg4NiA2My4wODU2Qzk3LjY4MjggNjIuNzY3MSAxMDQgNjguNzA2NyAxMDQgNzYuMDI4MUMxMDQgODMuMTE1OCA5OC4wNDc2IDg5IDkwLjk3NjcgODlDODkuODcyMSA4OSA4OC45NzY3IDg4LjEwNCA4OC45NzY3IDg2Ljk5ODZDODguOTc2NyA4NS44OTMzIDg5Ljg3MjEgODQuOTk3MyA5MC45NzY3IDg0Ljk5NzNDOTUuODYzNyA4NC45OTczIDEwMCA4MC44Nzk5IDEwMCA3Ni4wMjgxQzEwMCA3MS4wMjYyIDk1LjYyMjIgNjYuODYzNyA5MC41NjI5IDY3LjA4NDZMODcuODg2NiA2Ny4yMDE0Qzg3LjI1NjIgNjcuMjI5IDg2LjY0OTcgNjYuOTU3MSA4Ni4yNTA1IDY2LjQ2ODFDODUuODUxMyA2NS45NzkgODUuNzA2MiA2NS4zMzAxIDg1Ljg1OSA2NC43MTc0TDg2LjUwNzYgNjIuMTE2NUM4OC4zMjAxIDU0Ljg0ODQgODQuMzkxIDQ3LjA3MjcgNzcuNDY1NiA0NC4xNzUyQzcwLjUyNDggNDEuMjcxMyA2Mi4xODg2IDQzLjkyNzIgNTguMjM5IDUwLjMxNzFMNTcuMjAwMyA1MS45OTc1QzU2LjYyNDUgNTIuOTI5MSA1NS40MDc0IDUzLjIyNDQgNTQuNDY5MiA1Mi42NjAyTDUyLjc3NjcgNTEuNjQyNEM0OS44MTE2IDQ5Ljg1OTIgNDUuOTMxOSA0OS45NjY0IDQzLjA3MSA1MS45MTA1QzQwLjIyMDggNTMuODQ3NCAzOC43MDk2IDU3LjM5MjIgMzkuMjkxOCA2MC43NzQ1TDM5LjYyNTkgNjIuNzE1NEMzOS44MTEzIDYzLjc5MjQgMzkuMDk5MSA2NC44MTkgMzguMDI2IDY1LjAyMThMMzYuMDkyIDY1LjM4NzJDMzEuMTQyMSA2Ni4zMjI1IDI3LjU3MjMgNzEuMDQ0MSAyOC4wNDM3IDc2LjAzMDdDMjguNTE1MyA4MS4wMjA3IDMyLjkxIDg0Ljk5ODMgMzcuOTUxOSA4NC45OTczQzM5LjA1NjUgODQuOTk3IDM5Ljk1MjEgODUuODkyOSAzOS45NTI0IDg2Ljk5ODJDMzkuOTUyNiA4OC4xMDM1IDM5LjA1NzMgODguOTk5OCAzNy45NTI4IDg5QzMwLjg2OTUgODkuMDAxNSAyNC43Mjk0IDgzLjQ3NTUgMjQuMDYxNCA3Ni40MDc2QzIzLjM5MzYgNjkuMzQxMiAyOC4zOTA3IDYyLjc2ODkgMzUuMzQ5OSA2MS40NTRDMzQuNDk5NyA1Ni41MTQ4IDM2LjY4MjggNTEuNDEzMSA0MC44MjM5IDQ4LjU5OTFDNDQuOTc1MiA0NS43NzgxIDUwLjUzNjMgNDUuNjI1IDU0LjgzNzEgNDguMjExNVoiIGZpbGw9IiNFNkVGRkMiLz4KPC9nPgo8L2c+CjwvZz4KPGcgaWQ9IlByZWNpcGl0YXRpb24iPgo8ZyBpZD0iUmFpbmRyb3BzIj4KPHBhdGggaWQ9IlJhaW5kcm9wIDEiIGQ9Ik01MiA4M1Y5NSIgc3Ryb2tlPSIjMEE1QUQ0IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgOCkiLz4KPHBhdGggaWQ9IlJhaW5kcm9wIDIiIGQ9Ik02NCA4M1Y5NSIgc3Ryb2tlPSIjMEE1QUQ0IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgMCkiLz4KPHBhdGggaWQ9IlJhaW5kcm9wIDMiIGQ9Ik03NiA4M1Y5NSIgc3Ryb2tlPSIjMEE1QUQ0IiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgOCkiLz4KPC9nPgo8L2c+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMjA0NV8yODg0MCI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPg==";
  var WX_SNOW = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9InNub3ciIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yMDQ1XzI4OTM5KSI+CjxnIGlkPSJTa3kiPgo8ZyBpZD0iQ2xvdWRzIj4KPGcgaWQ9IkNsb3VkIj4KPHBhdGggaWQ9IkNsb3VkXzIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNTQuODM3MSA0OC4yMTE1QzU5LjgyNzQgNDAuMTM4IDcwLjI2NDggMzYuODI0IDc5LjAwODUgNDAuNDgyM0M4Ny43NDE2IDQ0LjEzNiA5Mi42ODM2IDUzLjg4MjcgOTAuMzg4NiA2My4wODU2Qzk3LjY4MjggNjIuNzY3MSAxMDQgNjguNzA2NyAxMDQgNzYuMDI4MUMxMDQgODMuMTE1OCA5OC4wNDc2IDg5IDkwLjk3NjcgODlDODkuODcyMSA4OSA4OC45NzY3IDg4LjEwNCA4OC45NzY3IDg2Ljk5ODZDODguOTc2NyA4NS44OTMzIDg5Ljg3MjEgODQuOTk3MyA5MC45NzY3IDg0Ljk5NzNDOTUuODYzNyA4NC45OTczIDEwMCA4MC44Nzk5IDEwMCA3Ni4wMjgxQzEwMCA3MS4wMjYyIDk1LjYyMjIgNjYuODYzNyA5MC41NjI5IDY3LjA4NDZMODcuODg2NiA2Ny4yMDE0Qzg3LjI1NjIgNjcuMjI5IDg2LjY0OTcgNjYuOTU3MSA4Ni4yNTA1IDY2LjQ2ODFDODUuODUxMyA2NS45NzkgODUuNzA2MiA2NS4zMzAxIDg1Ljg1OSA2NC43MTc0TDg2LjUwNzYgNjIuMTE2NUM4OC4zMjAxIDU0Ljg0ODQgODQuMzkxIDQ3LjA3MjcgNzcuNDY1NiA0NC4xNzUyQzcwLjUyNDggNDEuMjcxMyA2Mi4xODg2IDQzLjkyNzIgNTguMjM5IDUwLjMxNzFMNTcuMjAwMyA1MS45OTc1QzU2LjYyNDUgNTIuOTI5MSA1NS40MDc0IDUzLjIyNDQgNTQuNDY5MiA1Mi42NjAyTDUyLjc3NjcgNTEuNjQyNEM0OS44MTE2IDQ5Ljg1OTIgNDUuOTMxOSA0OS45NjY0IDQzLjA3MSA1MS45MTA1QzQwLjIyMDggNTMuODQ3NCAzOC43MDk2IDU3LjM5MjIgMzkuMjkxOCA2MC43NzQ1TDM5LjYyNTkgNjIuNzE1NEMzOS44MTEzIDYzLjc5MjQgMzkuMDk5MSA2NC44MTkgMzguMDI2IDY1LjAyMThMMzYuMDkyIDY1LjM4NzJDMzEuMTQyMSA2Ni4zMjI1IDI3LjU3MjMgNzEuMDQ0MSAyOC4wNDM3IDc2LjAzMDdDMjguNTE1MyA4MS4wMjA3IDMyLjkxIDg0Ljk5ODMgMzcuOTUxOSA4NC45OTczQzM5LjA1NjUgODQuOTk3IDM5Ljk1MjEgODUuODkyOSAzOS45NTI0IDg2Ljk5ODJDMzkuOTUyNiA4OC4xMDM1IDM5LjA1NzMgODguOTk5OCAzNy45NTI4IDg5QzMwLjg2OTUgODkuMDAxNSAyNC43Mjk0IDgzLjQ3NTUgMjQuMDYxNCA3Ni40MDc2QzIzLjM5MzYgNjkuMzQxMiAyOC4zOTA3IDYyLjc2ODkgMzUuMzQ5OSA2MS40NTRDMzQuNDk5NyA1Ni41MTQ4IDM2LjY4MjggNTEuNDEzMSA0MC44MjM5IDQ4LjU5OTFDNDQuOTc1MiA0NS43NzgxIDUwLjUzNjMgNDUuNjI1IDU0LjgzNzEgNDguMjExNVoiIGZpbGw9IiNFNkVGRkMiLz4KPC9nPgo8L2c+CjwvZz4KPGcgaWQ9IlByZWNpcGl0YXRpb24iPgo8ZyBpZD0iU25vd2ZsYWtlcyI+CjxwYXRoIGlkPSJTbm93Zmxha2UgMSIgZD0iTTUyLjU3ODEgOTAuMzY2TDUxLjM3MzUgODkuNjc3NUM1MS40Nzk0IDg5LjIzMjYgNTEuNDc4NiA4OC43Njg3IDUxLjM3MDggODguMzI0MUw1Mi41NzgxIDg3LjYzNDVDNTIuNjczOCA4Ny41ODA1IDUyLjc1NzcgODcuNTA3OSA1Mi44MjUyIDg3LjQyMUM1Mi44OTI2IDg3LjMzNDIgNTIuOTQyMyA4Ny4yMzQ3IDUyLjk3MTEgODcuMTI4NEM1Mi45OTk4IDg3LjAyMjEgNTMuMDA3MSA4Ni45MTEyIDUyLjk5MjYgODYuODAyQzUyLjk3ODIgODYuNjkyOCA1Mi45NDIyIDg2LjU4NzYgNTIuODg2OCA4Ni40OTI2QzUyLjc3MzIgODYuMjk5OCA1Mi41ODg2IDg2LjE1OTcgNTIuMzcyOCA4Ni4xMDI1QzUyLjE1NyA4Ni4wNDUyIDUxLjkyNzYgODYuMDc1NCA1MS43MzM5IDg2LjE4NjZMNTAuNTI3OCA4Ni44NzYzQzUwLjE5MzEgODYuNTU4NiA0OS43ODY4IDg2LjMyNjQgNDkuMzQzNyA4Ni4xOTk1Vjg0LjgyMDJDNDkuMzM2OCA4NC42MDAzIDQ5LjI0NSA4NC4zOTE4IDQ5LjA4NzUgODQuMjM4N0M0OC45MyA4NC4wODU2IDQ4LjcxOTIgODQgNDguNDk5OCA4NEM0OC4yODA1IDg0IDQ4LjA2OTkgODQuMDg1NiA0Ny45MTI0IDg0LjIzODdDNDcuNzU0OCA4NC4zOTE4IDQ3LjY2MjggODQuNjAwMyA0Ny42NTYgODQuODIwMlY4Ni4xOTk1QzQ3LjIxNCA4Ni4zMjg5IDQ2LjgwODEgODYuNTU5OCA0Ni40NzA2IDg2Ljg3NEw0NS4yNjYyIDg2LjE4NTNDNDUuMDcyNCA4Ni4wNzQyIDQ0Ljg0MjggODYuMDQ0IDQ0LjYyNyA4Ni4xMDEzQzQ0LjQxMTMgODYuMTU4NSA0NC4yMjY3IDg2LjI5ODYgNDQuMTEzIDg2LjQ5MTNDNDQuMDU3NiA4Ni41ODY0IDQ0LjAyMTcgODYuNjkxNiA0NC4wMDcyIDg2LjgwMDdDNDMuOTkyOCA4Ni45MDk5IDQ0IDg3LjAyMDkgNDQuMDI4OCA4Ny4xMjcxQzQ0LjA1NzUgODcuMjMzNCA0NC4xMDcyIDg3LjMzMjkgNDQuMTc0NyA4Ny40MTk4QzQ0LjI0MjEgODcuNTA2NyA0NC4zMjYgODcuNTc5MiA0NC40MjE3IDg3LjYzMzJMNDUuNjI2NCA4OC4zMjE2QzQ1LjUyMDQgODguNzY2NiA0NS41MjEzIDg5LjIzMDUgNDUuNjI5IDg5LjY3NUw0NC40MjE3IDkwLjM2NDdDNDQuMzI2IDkwLjQxODcgNDQuMjQyMSA5MC40OTEyIDQ0LjE3NDcgOTAuNTc4MUM0NC4xMDcyIDkwLjY2NSA0NC4wNTc1IDkwLjc2NDUgNDQuMDI4OCA5MC44NzA4QzQ0IDkwLjk3NzEgNDMuOTkyOCA5MS4wODggNDQuMDA3MiA5MS4xOTcyQzQ0LjAyMTcgOTEuMzA2MyA0NC4wNTc2IDkxLjQxMTUgNDQuMTEzIDkxLjUwNjZDNDQuMjI2NyA5MS42OTkyIDQ0LjQxMTMgOTEuODM5MiA0NC42MjcgOTEuODk2NUM0NC44NDI4IDkxLjk1MzcgNDUuMDcyNCA5MS45MjM2IDQ1LjI2NjIgOTEuODEyNkw0Ni40NzIxIDkxLjEyMjlDNDYuODA2MyA5MS40NDA5IDQ3LjIxMjggOTEuNjcyNiA0Ny42NTYyIDkxLjc5NzlWOTMuMTc5OEM0Ny42NjMxIDkzLjM5OTcgNDcuNzU1IDkzLjYwODIgNDcuOTEyNiA5My43NjEzQzQ4LjA3MDEgOTMuOTE0NCA0OC4yODA3IDk0IDQ4LjUgOTRDNDguNzE5NCA5NCA0OC45MzAyIDkzLjkxNDQgNDkuMDg3NyA5My43NjEzQzQ5LjI0NTIgOTMuNjA4MiA0OS4zMzcgOTMuMzk5NyA0OS4zNDM5IDkzLjE3OThWOTEuNzk3NUM0OS43ODUzIDkxLjY2ODMgNTAuMTkwNyA5MS40Mzc4IDUwLjUyNzggOTEuMTI0Mkw1MS43MzQxIDkxLjgxMzhDNTEuOTI3OCA5MS45MjQ4IDUyLjE1NzMgOTEuOTU1IDUyLjM3MyA5MS44OTc3QzUyLjU4ODggOTEuODQwNSA1Mi43NzMzIDkxLjcwMDUgNTIuODg3IDkxLjUwNzlDNTIuOTQyNCA5MS40MTI4IDUyLjk3ODQgOTEuMzA3NiA1Mi45OTI4IDkxLjE5ODRDNTMuMDA3MyA5MS4wODkyIDUyLjk5OTggOTAuOTc4MyA1Mi45NzExIDkwLjg3MkM1Mi45NDIzIDkwLjc2NTcgNTIuODkyOSA5MC42NjYyIDUyLjgyNTQgOTAuNTc5M0M1Mi43NTc5IDkwLjQ5MjUgNTIuNjczOCA5MC40MTk5IDUyLjU3ODEgOTAuMzY2Wk00Ny44NjY0IDkwLjA4NjFDNDcuNzIyOSA5MC4wMDUgNDcuNTk2OCA4OS44OTYxIDQ3LjQ5NTYgODkuNzY1N0M0Ny4zOTQ0IDg5LjYzNTMgNDcuMzIwMiA4OS40ODYgNDcuMjc3MSA4OS4zMjY2QzQ3LjIzMzkgODkuMTY3MSA0Ny4yMjI4IDg5LjAwMDcgNDcuMjQ0MyA4OC44MzY5QzQ3LjI2NTggODguNjczMSA0Ny4zMTk3IDg4LjUxNTIgNDcuNDAyNiA4OC4zNzI0QzQ3LjU3MzUgODguMDg0IDQ3Ljg1MDMgODcuODc0MyA0OC4xNzM2IDg3Ljc4ODNDNDguNDk3IDg3LjcwMjMgNDguODQxMSA4Ny43NDcgNDkuMTMyMSA4Ny45MTI2QzQ5LjI3NTYgODcuOTkzOCA0OS40MDE2IDg4LjEwMjcgNDkuNTAyOCA4OC4yMzMxQzQ5LjYwNCA4OC4zNjM1IDQ5LjY3ODIgODguNTEyNyA0OS43MjE0IDg4LjY3MjJDNDkuNzY0NSA4OC44MzE2IDQ5Ljc3NTcgODguOTk4MSA0OS43NTQxIDg5LjE2MTlDNDkuNzMyNiA4OS4zMjU3IDQ5LjY3ODcgODkuNDgzNiA0OS41OTU4IDg5LjYyNjNDNDkuNDI1IDg5LjkxNDkgNDkuMTQ4MiA5MC4xMjQ3IDQ4LjgyNDggOTAuMjEwOEM0OC41MDE0IDkwLjI5NjkgNDguMTU3NCA5MC4yNTIzIDQ3Ljg2NjQgOTAuMDg2N1Y5MC4wODYxWiIgZmlsbD0iIzg2QzNEQiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgOCkiLz4KPHBhdGggaWQ9IlNub3dmbGFrZSAyIiBkPSJNNjcuNTc4MSA5MC4zNjZMNjYuMzczNSA4OS42Nzc1QzY2LjQ3OTQgODkuMjMyNiA2Ni40Nzg2IDg4Ljc2ODcgNjYuMzcwOCA4OC4zMjQxTDY3LjU3ODEgODcuNjM0NUM2Ny42NzM4IDg3LjU4MDUgNjcuNzU3NyA4Ny41MDc5IDY3LjgyNTIgODcuNDIxQzY3Ljg5MjYgODcuMzM0MiA2Ny45NDIzIDg3LjIzNDcgNjcuOTcxMSA4Ny4xMjg0QzY3Ljk5OTggODcuMDIyMSA2OC4wMDcxIDg2LjkxMTIgNjcuOTkyNiA4Ni44MDJDNjcuOTc4MiA4Ni42OTI4IDY3Ljk0MjIgODYuNTg3NiA2Ny44ODY4IDg2LjQ5MjZDNjcuNzczMiA4Ni4yOTk4IDY3LjU4ODYgODYuMTU5NyA2Ny4zNzI4IDg2LjEwMjVDNjcuMTU3IDg2LjA0NTIgNjYuOTI3NiA4Ni4wNzU0IDY2LjczMzkgODYuMTg2Nkw2NS41Mjc4IDg2Ljg3NjNDNjUuMTkzMSA4Ni41NTg2IDY0Ljc4NjggODYuMzI2NCA2NC4zNDM3IDg2LjE5OTVWODQuODIwMkM2NC4zMzY4IDg0LjYwMDMgNjQuMjQ1IDg0LjM5MTggNjQuMDg3NSA4NC4yMzg3QzYzLjkzIDg0LjA4NTYgNjMuNzE5MiA4NCA2My40OTk4IDg0QzYzLjI4MDUgODQgNjMuMDY5OSA4NC4wODU2IDYyLjkxMjQgODQuMjM4N0M2Mi43NTQ4IDg0LjM5MTggNjIuNjYyOCA4NC42MDAzIDYyLjY1NiA4NC44MjAyVjg2LjE5OTVDNjIuMjE0IDg2LjMyODkgNjEuODA4MSA4Ni41NTk4IDYxLjQ3MDYgODYuODc0TDYwLjI2NjIgODYuMTg1M0M2MC4wNzI0IDg2LjA3NDIgNTkuODQyOCA4Ni4wNDQgNTkuNjI3IDg2LjEwMTNDNTkuNDExMyA4Ni4xNTg1IDU5LjIyNjcgODYuMjk4NiA1OS4xMTMgODYuNDkxM0M1OS4wNTc2IDg2LjU4NjQgNTkuMDIxNyA4Ni42OTE2IDU5LjAwNzIgODYuODAwN0M1OC45OTI4IDg2LjkwOTkgNTkgODcuMDIwOSA1OS4wMjg4IDg3LjEyNzFDNTkuMDU3NSA4Ny4yMzM0IDU5LjEwNzIgODcuMzMyOSA1OS4xNzQ3IDg3LjQxOThDNTkuMjQyMSA4Ny41MDY3IDU5LjMyNiA4Ny41NzkyIDU5LjQyMTcgODcuNjMzMkw2MC42MjY0IDg4LjMyMTZDNjAuNTIwNCA4OC43NjY2IDYwLjUyMTMgODkuMjMwNSA2MC42MjkgODkuNjc1TDU5LjQyMTcgOTAuMzY0N0M1OS4zMjYgOTAuNDE4NyA1OS4yNDIxIDkwLjQ5MTIgNTkuMTc0NyA5MC41NzgxQzU5LjEwNzIgOTAuNjY1IDU5LjA1NzUgOTAuNzY0NSA1OS4wMjg4IDkwLjg3MDhDNTkgOTAuOTc3MSA1OC45OTI4IDkxLjA4OCA1OS4wMDcyIDkxLjE5NzJDNTkuMDIxNyA5MS4zMDYzIDU5LjA1NzYgOTEuNDExNSA1OS4xMTMgOTEuNTA2NkM1OS4yMjY3IDkxLjY5OTIgNTkuNDExMyA5MS44MzkyIDU5LjYyNyA5MS44OTY1QzU5Ljg0MjggOTEuOTUzNyA2MC4wNzI0IDkxLjkyMzYgNjAuMjY2MiA5MS44MTI2TDYxLjQ3MjEgOTEuMTIyOUM2MS44MDYzIDkxLjQ0MDkgNjIuMjEyOCA5MS42NzI2IDYyLjY1NjIgOTEuNzk3OVY5My4xNzk4QzYyLjY2MzEgOTMuMzk5NyA2Mi43NTUgOTMuNjA4MiA2Mi45MTI2IDkzLjc2MTNDNjMuMDcwMSA5My45MTQ0IDYzLjI4MDcgOTQgNjMuNSA5NEM2My43MTk0IDk0IDYzLjkzMDIgOTMuOTE0NCA2NC4wODc3IDkzLjc2MTNDNjQuMjQ1MiA5My42MDgyIDY0LjMzNyA5My4zOTk3IDY0LjM0MzkgOTMuMTc5OFY5MS43OTc1QzY0Ljc4NTMgOTEuNjY4MyA2NS4xOTA3IDkxLjQzNzggNjUuNTI3OCA5MS4xMjQyTDY2LjczNDEgOTEuODEzOEM2Ni45Mjc4IDkxLjkyNDggNjcuMTU3MyA5MS45NTUgNjcuMzczIDkxLjg5NzdDNjcuNTg4OCA5MS44NDA1IDY3Ljc3MzMgOTEuNzAwNSA2Ny44ODcgOTEuNTA3OUM2Ny45NDI0IDkxLjQxMjggNjcuOTc4NCA5MS4zMDc2IDY3Ljk5MjggOTEuMTk4NEM2OC4wMDczIDkxLjA4OTIgNjcuOTk5OCA5MC45NzgzIDY3Ljk3MTEgOTAuODcyQzY3Ljk0MjMgOTAuNzY1NyA2Ny44OTI5IDkwLjY2NjIgNjcuODI1NCA5MC41NzkzQzY3Ljc1NzkgOTAuNDkyNSA2Ny42NzM4IDkwLjQxOTkgNjcuNTc4MSA5MC4zNjZaTTYyLjg2NjQgOTAuMDg2MUM2Mi43MjI5IDkwLjAwNSA2Mi41OTY4IDg5Ljg5NjEgNjIuNDk1NiA4OS43NjU3QzYyLjM5NDQgODkuNjM1MyA2Mi4zMjAyIDg5LjQ4NiA2Mi4yNzcxIDg5LjMyNjZDNjIuMjMzOSA4OS4xNjcxIDYyLjIyMjggODkuMDAwNyA2Mi4yNDQzIDg4LjgzNjlDNjIuMjY1OCA4OC42NzMxIDYyLjMxOTcgODguNTE1MiA2Mi40MDI2IDg4LjM3MjRDNjIuNTczNSA4OC4wODQgNjIuODUwMyA4Ny44NzQzIDYzLjE3MzYgODcuNzg4M0M2My40OTcgODcuNzAyMyA2My44NDExIDg3Ljc0NyA2NC4xMzIxIDg3LjkxMjZDNjQuMjc1NiA4Ny45OTM4IDY0LjQwMTYgODguMTAyNyA2NC41MDI4IDg4LjIzMzFDNjQuNjA0IDg4LjM2MzUgNjQuNjc4MiA4OC41MTI3IDY0LjcyMTQgODguNjcyMkM2NC43NjQ1IDg4LjgzMTYgNjQuNzc1NyA4OC45OTgxIDY0Ljc1NDEgODkuMTYxOUM2NC43MzI2IDg5LjMyNTcgNjQuNjc4NyA4OS40ODM2IDY0LjU5NTggODkuNjI2M0M2NC40MjUgODkuOTE0OSA2NC4xNDgyIDkwLjEyNDcgNjMuODI0OCA5MC4yMTA4QzYzLjUwMTQgOTAuMjk2OSA2My4xNTc0IDkwLjI1MjMgNjIuODY2NCA5MC4wODY3VjkwLjA4NjFaIiBmaWxsPSIjODZDM0RCIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLCAwKSIvPgo8cGF0aCBpZD0iU25vd2ZsYWtlIDMiIGQ9Ik04Mi41NzgxIDkwLjM2Nkw4MS4zNzM1IDg5LjY3NzVDODEuNDc5NCA4OS4yMzI2IDgxLjQ3ODYgODguNzY4NyA4MS4zNzA4IDg4LjMyNDFMODIuNTc4MSA4Ny42MzQ1QzgyLjY3MzggODcuNTgwNSA4Mi43NTc3IDg3LjUwNzkgODIuODI1MiA4Ny40MjFDODIuODkyNiA4Ny4zMzQyIDgyLjk0MjMgODcuMjM0NyA4Mi45NzExIDg3LjEyODRDODIuOTk5OCA4Ny4wMjIxIDgzLjAwNzEgODYuOTExMiA4Mi45OTI2IDg2LjgwMkM4Mi45NzgyIDg2LjY5MjggODIuOTQyMiA4Ni41ODc2IDgyLjg4NjggODYuNDkyNkM4Mi43NzMyIDg2LjI5OTggODIuNTg4NiA4Ni4xNTk3IDgyLjM3MjggODYuMTAyNUM4Mi4xNTcgODYuMDQ1MiA4MS45Mjc2IDg2LjA3NTQgODEuNzMzOSA4Ni4xODY2TDgwLjUyNzggODYuODc2M0M4MC4xOTMxIDg2LjU1ODYgNzkuNzg2OCA4Ni4zMjY0IDc5LjM0MzcgODYuMTk5NVY4NC44MjAyQzc5LjMzNjggODQuNjAwMyA3OS4yNDUgODQuMzkxOCA3OS4wODc1IDg0LjIzODdDNzguOTMgODQuMDg1NiA3OC43MTkyIDg0IDc4LjQ5OTggODRDNzguMjgwNSA4NCA3OC4wNjk5IDg0LjA4NTYgNzcuOTEyNCA4NC4yMzg3Qzc3Ljc1NDggODQuMzkxOCA3Ny42NjI4IDg0LjYwMDMgNzcuNjU2IDg0LjgyMDJWODYuMTk5NUM3Ny4yMTQgODYuMzI4OSA3Ni44MDgxIDg2LjU1OTggNzYuNDcwNiA4Ni44NzRMNzUuMjY2MiA4Ni4xODUzQzc1LjA3MjQgODYuMDc0MiA3NC44NDI4IDg2LjA0NCA3NC42MjcgODYuMTAxM0M3NC40MTEzIDg2LjE1ODUgNzQuMjI2NyA4Ni4yOTg2IDc0LjExMyA4Ni40OTEzQzc0LjA1NzYgODYuNTg2NCA3NC4wMjE3IDg2LjY5MTYgNzQuMDA3MiA4Ni44MDA3QzczLjk5MjggODYuOTA5OSA3NCA4Ny4wMjA5IDc0LjAyODggODcuMTI3MUM3NC4wNTc1IDg3LjIzMzQgNzQuMTA3MiA4Ny4zMzI5IDc0LjE3NDcgODcuNDE5OEM3NC4yNDIxIDg3LjUwNjcgNzQuMzI2IDg3LjU3OTIgNzQuNDIxNyA4Ny42MzMyTDc1LjYyNjQgODguMzIxNkM3NS41MjA0IDg4Ljc2NjYgNzUuNTIxMyA4OS4yMzA1IDc1LjYyOSA4OS42NzVMNzQuNDIxNyA5MC4zNjQ3Qzc0LjMyNiA5MC40MTg3IDc0LjI0MjEgOTAuNDkxMiA3NC4xNzQ3IDkwLjU3ODFDNzQuMTA3MiA5MC42NjUgNzQuMDU3NSA5MC43NjQ1IDc0LjAyODggOTAuODcwOEM3NCA5MC45NzcxIDczLjk5MjggOTEuMDg4IDc0LjAwNzIgOTEuMTk3MkM3NC4wMjE3IDkxLjMwNjMgNzQuMDU3NiA5MS40MTE1IDc0LjExMyA5MS41MDY2Qzc0LjIyNjcgOTEuNjk5MiA3NC40MTEzIDkxLjgzOTIgNzQuNjI3IDkxLjg5NjVDNzQuODQyOCA5MS45NTM3IDc1LjA3MjQgOTEuOTIzNiA3NS4yNjYyIDkxLjgxMjZMNzYuNDcyMSA5MS4xMjI5Qzc2LjgwNjMgOTEuNDQwOSA3Ny4yMTI4IDkxLjY3MjYgNzcuNjU2MiA5MS43OTc5VjkzLjE3OThDNzcuNjYzMSA5My4zOTk3IDc3Ljc1NSA5My42MDgyIDc3LjkxMjYgOTMuNzYxM0M3OC4wNzAxIDkzLjkxNDQgNzguMjgwNyA5NCA3OC41IDk0Qzc4LjcxOTQgOTQgNzguOTMwMiA5My45MTQ0IDc5LjA4NzcgOTMuNzYxM0M3OS4yNDUyIDkzLjYwODIgNzkuMzM3IDkzLjM5OTcgNzkuMzQzOSA5My4xNzk4VjkxLjc5NzVDNzkuNzg1MyA5MS42NjgzIDgwLjE5MDcgOTEuNDM3OCA4MC41Mjc4IDkxLjEyNDJMODEuNzM0MSA5MS44MTM4QzgxLjkyNzggOTEuOTI0OCA4Mi4xNTczIDkxLjk1NSA4Mi4zNzMgOTEuODk3N0M4Mi41ODg4IDkxLjg0MDUgODIuNzczMyA5MS43MDA1IDgyLjg4NyA5MS41MDc5QzgyLjk0MjQgOTEuNDEyOCA4Mi45Nzg0IDkxLjMwNzYgODIuOTkyOCA5MS4xOTg0QzgzLjAwNzMgOTEuMDg5MiA4Mi45OTk4IDkwLjk3ODMgODIuOTcxMSA5MC44NzJDODIuOTQyMyA5MC43NjU3IDgyLjg5MjkgOTAuNjY2MiA4Mi44MjU0IDkwLjU3OTNDODIuNzU3OSA5MC40OTI1IDgyLjY3MzggOTAuNDE5OSA4Mi41NzgxIDkwLjM2NlpNNzcuODY2NCA5MC4wODYxQzc3LjcyMjkgOTAuMDA1IDc3LjU5NjggODkuODk2MSA3Ny40OTU2IDg5Ljc2NTdDNzcuMzk0NCA4OS42MzUzIDc3LjMyMDIgODkuNDg2IDc3LjI3NzEgODkuMzI2NkM3Ny4yMzM5IDg5LjE2NzEgNzcuMjIyOCA4OS4wMDA3IDc3LjI0NDMgODguODM2OUM3Ny4yNjU4IDg4LjY3MzEgNzcuMzE5NyA4OC41MTUyIDc3LjQwMjYgODguMzcyNEM3Ny41NzM1IDg4LjA4NCA3Ny44NTAzIDg3Ljg3NDMgNzguMTczNiA4Ny43ODgzQzc4LjQ5NyA4Ny43MDIzIDc4Ljg0MTEgODcuNzQ3IDc5LjEzMjEgODcuOTEyNkM3OS4yNzU2IDg3Ljk5MzggNzkuNDAxNiA4OC4xMDI3IDc5LjUwMjggODguMjMzMUM3OS42MDQgODguMzYzNSA3OS42NzgyIDg4LjUxMjcgNzkuNzIxNCA4OC42NzIyQzc5Ljc2NDUgODguODMxNiA3OS43NzU3IDg4Ljk5ODEgNzkuNzU0MSA4OS4xNjE5Qzc5LjczMjYgODkuMzI1NyA3OS42Nzg3IDg5LjQ4MzYgNzkuNTk1OCA4OS42MjYzQzc5LjQyNSA4OS45MTQ5IDc5LjE0ODIgOTAuMTI0NyA3OC44MjQ4IDkwLjIxMDhDNzguNTAxNCA5MC4yOTY5IDc4LjE1NzQgOTAuMjUyMyA3Ny44NjY0IDkwLjA4NjdWOTAuMDg2MVoiIGZpbGw9IiM4NkMzREIiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsIDgpIi8+CjwvZz4KPC9nPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzIwNDVfMjg5MzkiPgo8cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsbD0id2hpdGUiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4=";
  var WX_SNOW_SHOWERS = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9InBhcnRseS1jbG91ZHktZGF5LXNub3ciIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yMDQ1XzI4OTQyKSI+CjxnIGlkPSJTa3kiPgo8ZyBpZD0iTWFzayBncm91cCI+CjxtYXNrIGlkPSJtYXNrMF8yMDQ1XzI4OTQyIiBzdHlsZT0ibWFzay10eXBlOmFscGhhIiBtYXNrVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4PSIwIiB5PSIwIiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+CjxnIGlkPSJDbG91ZCBNYXNrIj4KPHBhdGggaWQ9IlN1YnRyYWN0IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTEyOCAwSDBWMTI4SDEyOFYwWk0zNy45NTE5IDkzSDkwLjk3NTJDMTAwLjIyNyA5MyAxMDcuOTk4IDg1LjM1MyAxMDcuOTk4IDc2LjAyODFDMTA3Ljk5OCA2OC4wMjE3IDEwMi4zMDUgNjEuMzUwMSA5NC45MjQ4IDU5LjU1MTJDOTUuMzYxOSA0OS45MDA1IDg5LjY3NDQgNDAuNjA5MyA4MC41NTA5IDM2Ljc5MjJDNzEuMTA3MSAzMi44NDExIDYwLjA2NjQgMzUuNjExOSA1My41MzA1IDQzLjIzODRDNDguNTcwMiA0MS41OTU2IDQyLjk4MTUgNDIuMjk1NyAzOC41NzQxIDQ1LjI5MDdDMzQuMTQ1OSA0OC4yOTk4IDMxLjQzMDUgNTMuMjgwOSAzMS4xODQ2IDU4LjUzNzlDMjQuMDYzMyA2MS40NjMgMTkuMzI3OCA2OC44NTA2IDIwLjA3NzYgNzYuNzgzOUMyMC45NDIgODUuOTI5NSAyOC44Mjg1IDkzLjAwMTggMzcuOTUxOSA5M1oiIGZpbGw9ImJsYWNrIi8+CjwvZz4KPC9tYXNrPgo8ZyBtYXNrPSJ1cmwoI21hc2swXzIwNDVfMjg5NDIpIj4KPGcgaWQ9IlN1biI+CjxjaXJjbGUgaWQ9IkNvcmUiIGN4PSIzOSIgY3k9IjUxIiByPSI5IiBmaWxsPSIjRjhBRjE4Ii8+CjxnIGlkPSJSYXlzIj4KPHBhdGggZD0iTTM3LjY4NzUgMzEuMzEyNUMzNy42ODc1IDMwLjU4NzYgMzguMjc1MSAzMCAzOSAzMEMzOS43MjQ5IDMwIDQwLjMxMjUgMzAuNTg3NiA0MC4zMTI1IDMxLjMxMjVWMzcuNDM3NUM0MC4zMTI1IDM4LjE2MjQgMzkuNzI0OSAzOC43NSAzOSAzOC43NUMzOC4yNzUxIDM4Ljc1IDM3LjY4NzUgMzguMTYyNCAzNy42ODc1IDM3LjQzNzVWMzEuMzEyNVoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTUxLjk5MzEgMzYuMTUwOEM1Mi41MDU2IDM1LjYzODIgNTMuMzM2NyAzNS42MzgyIDUzLjg0OTIgMzYuMTUwOEM1NC4zNjE4IDM2LjY2MzMgNTQuMzYxOCAzNy40OTQzIDUzLjg0OTIgMzguMDA2OUw0OS41MTgyIDQyLjMzNzlDNDkuMDA1NiA0Mi44NTA1IDQ4LjE3NDYgNDIuODUwNSA0Ny42NjIxIDQyLjMzNzlDNDcuMTQ5NSA0MS44MjU0IDQ3LjE0OTUgNDAuOTk0NCA0Ny42NjIxIDQwLjQ4MThMNTEuOTkzMSAzNi4xNTA4WiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNNTguNjg3NSA0OS42ODc1QzU5LjQxMjQgNDkuNjg3NSA2MCA1MC4yNzUxIDYwIDUxQzYwIDUxLjcyNDkgNTkuNDEyNCA1Mi4zMTI1IDU4LjY4NzUgNTIuMzEyNUg1Mi41NjI1QzUxLjgzNzYgNTIuMzEyNSA1MS4yNSA1MS43MjQ5IDUxLjI1IDUxQzUxLjI1IDUwLjI3NTEgNTEuODM3NiA0OS42ODc1IDUyLjU2MjUgNDkuNjg3NUg1OC42ODc1WiIgZmlsbD0iI0Y4QUYxOCIvPgo8cGF0aCBkPSJNNTMuODQ5MiA2My45OTMxQzU0LjM2MTggNjQuNTA1NyA1NC4zNjE4IDY1LjMzNjcgNTMuODQ5MiA2NS44NDkyQzUzLjMzNjcgNjYuMzYxOCA1Mi41MDU2IDY2LjM2MTggNTEuOTkzMSA2NS44NDkyTDQ3LjY2MjEgNjEuNTE4MkM0Ny4xNDk1IDYxLjAwNTcgNDcuMTQ5NSA2MC4xNzQ2IDQ3LjY2MjEgNTkuNjYyMUM0OC4xNzQ2IDU5LjE0OTUgNDkuMDA1NyA1OS4xNDk1IDQ5LjUxODIgNTkuNjYyMUw1My44NDkyIDYzLjk5MzFaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik0zNy42ODc1IDY0LjU2MjVDMzcuNjg3NSA2My44Mzc2IDM4LjI3NTEgNjMuMjUgMzkgNjMuMjVDMzkuNzI0OSA2My4yNSA0MC4zMTI1IDYzLjgzNzYgNDAuMzEyNSA2NC41NjI1VjcwLjY4NzVDNDAuMzEyNSA3MS40MTI0IDM5LjcyNDkgNzIgMzkgNzJDMzguMjc1MSA3MiAzNy42ODc1IDcxLjQxMjQgMzcuNjg3NSA3MC42ODc1VjY0LjU2MjVaIiBmaWxsPSIjRjhBRjE4Ii8+CjxwYXRoIGQ9Ik0yOC40ODE4IDU5LjY2MjFDMjguOTk0MyA1OS4xNDk1IDI5LjgyNTQgNTkuMTQ5NSAzMC4zMzc5IDU5LjY2MjFDMzAuODUwNSA2MC4xNzQ2IDMwLjg1MDUgNjEuMDA1NiAzMC4zMzc5IDYxLjUxODJMMjYuMDA2OSA2NS44NDkyQzI1LjQ5NDMgNjYuMzYxOCAyNC42NjMzIDY2LjM2MTggMjQuMTUwOCA2NS44NDkyQzIzLjYzODIgNjUuMzM2NyAyMy42MzgyIDY0LjUwNTYgMjQuMTUwOCA2My45OTMxTDI4LjQ4MTggNTkuNjYyMVoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTI1LjQzNzUgNDkuNjg3NUMyNi4xNjI0IDQ5LjY4NzUgMjYuNzUgNTAuMjc1MSAyNi43NSA1MUMyNi43NSA1MS43MjQ5IDI2LjE2MjQgNTIuMzEyNSAyNS40Mzc1IDUyLjMxMjVIMTkuMzEyNUMxOC41ODc2IDUyLjMxMjUgMTggNTEuNzI0OSAxOCA1MUMxOCA1MC4yNzUxIDE4LjU4NzYgNDkuNjg3NSAxOS4zMTI1IDQ5LjY4NzVIMjUuNDM3NVoiIGZpbGw9IiNGOEFGMTgiLz4KPHBhdGggZD0iTTMwLjMzNzkgNDAuNDgxOEMzMC44NTA1IDQwLjk5NDQgMzAuODUwNSA0MS44MjU0IDMwLjMzNzkgNDIuMzM3OUMyOS44MjU0IDQyLjg1MDUgMjguOTk0NCA0Mi44NTA1IDI4LjQ4MTggNDIuMzM3OUwyNC4xNTA4IDM4LjAwNjlDMjMuNjM4MiAzNy40OTQ0IDIzLjYzODIgMzYuNjYzMyAyNC4xNTA4IDM2LjE1MDhDMjQuNjYzMyAzNS42MzgyIDI1LjQ5NDQgMzUuNjM4MiAyNi4wMDY5IDM2LjE1MDhMMzAuMzM3OSA0MC40ODE4WiIgZmlsbD0iI0Y4QUYxOCIvPgo8L2c+CjwvZz4KPC9nPgo8L2c+CjxnIGlkPSJDbG91ZHMiPgo8ZyBpZD0iQ2xvdWQiPgo8cGF0aCBpZD0iQ2xvdWRfMiIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik01NC44MzcxIDQ4LjIxMTVDNTkuODI3NCA0MC4xMzggNzAuMjY0OCAzNi44MjQgNzkuMDA4NSA0MC40ODIzQzg3Ljc0MTYgNDQuMTM2IDkyLjY4MzYgNTMuODgyNyA5MC4zODg2IDYzLjA4NTZDOTcuNjgyOCA2Mi43NjcxIDEwNCA2OC43MDY3IDEwNCA3Ni4wMjgxQzEwNCA4My4xMTU4IDk4LjA0NzYgODkgOTAuOTc2NyA4OUM4OS44NzIxIDg5IDg4Ljk3NjcgODguMTA0IDg4Ljk3NjcgODYuOTk4NkM4OC45NzY3IDg1Ljg5MzMgODkuODcyMSA4NC45OTczIDkwLjk3NjcgODQuOTk3M0M5NS44NjM3IDg0Ljk5NzMgMTAwIDgwLjg3OTkgMTAwIDc2LjAyODFDMTAwIDcxLjAyNjIgOTUuNjIyMiA2Ni44NjM3IDkwLjU2MjkgNjcuMDg0Nkw4Ny44ODY2IDY3LjIwMTRDODcuMjU2MiA2Ny4yMjkgODYuNjQ5NyA2Ni45NTcxIDg2LjI1MDUgNjYuNDY4MUM4NS44NTEzIDY1Ljk3OSA4NS43MDYyIDY1LjMzMDEgODUuODU5IDY0LjcxNzRMODYuNTA3NiA2Mi4xMTY1Qzg4LjMyMDEgNTQuODQ4NCA4NC4zOTEgNDcuMDcyNyA3Ny40NjU2IDQ0LjE3NTJDNzAuNTI0OCA0MS4yNzEzIDYyLjE4ODYgNDMuOTI3MiA1OC4yMzkgNTAuMzE3MUw1Ny4yMDAzIDUxLjk5NzVDNTYuNjI0NSA1Mi45MjkxIDU1LjQwNzQgNTMuMjI0NCA1NC40NjkyIDUyLjY2MDJMNTIuNzc2NyA1MS42NDI0QzQ5LjgxMTYgNDkuODU5MiA0NS45MzE5IDQ5Ljk2NjQgNDMuMDcxIDUxLjkxMDVDNDAuMjIwOCA1My44NDc0IDM4LjcwOTYgNTcuMzkyMiAzOS4yOTE4IDYwLjc3NDVMMzkuNjI1OSA2Mi43MTU0QzM5LjgxMTMgNjMuNzkyNCAzOS4wOTkxIDY0LjgxOSAzOC4wMjYgNjUuMDIxOEwzNi4wOTIgNjUuMzg3MkMzMS4xNDIxIDY2LjMyMjUgMjcuNTcyMyA3MS4wNDQxIDI4LjA0MzcgNzYuMDMwN0MyOC41MTUzIDgxLjAyMDcgMzIuOTEgODQuOTk4MyAzNy45NTE5IDg0Ljk5NzNDMzkuMDU2NSA4NC45OTcgMzkuOTUyMSA4NS44OTI5IDM5Ljk1MjQgODYuOTk4MkMzOS45NTI2IDg4LjEwMzUgMzkuMDU3MyA4OC45OTk4IDM3Ljk1MjggODlDMzAuODY5NSA4OS4wMDE1IDI0LjcyOTQgODMuNDc1NSAyNC4wNjE0IDc2LjQwNzZDMjMuMzkzNiA2OS4zNDEyIDI4LjM5MDcgNjIuNzY4OSAzNS4zNDk5IDYxLjQ1NEMzNC40OTk3IDU2LjUxNDggMzYuNjgyOCA1MS40MTMxIDQwLjgyMzkgNDguNTk5MUM0NC45NzUyIDQ1Ljc3ODEgNTAuNTM2MyA0NS42MjUgNTQuODM3MSA0OC4yMTE1WiIgZmlsbD0iI0U2RUZGQyIvPgo8L2c+CjwvZz4KPC9nPgo8ZyBpZD0iUHJlY2lwaXRhdGlvbiI+CjxnIGlkPSJTbm93Zmxha2VzIj4KPHBhdGggaWQ9IlNub3dmbGFrZSAxIiBkPSJNNTIuNTc4MSA5MC4zNjZMNTEuMzczNSA4OS42Nzc1QzUxLjQ3OTQgODkuMjMyNiA1MS40Nzg2IDg4Ljc2ODcgNTEuMzcwOCA4OC4zMjQxTDUyLjU3ODEgODcuNjM0NUM1Mi42NzM4IDg3LjU4MDUgNTIuNzU3NyA4Ny41MDc5IDUyLjgyNTIgODcuNDIxQzUyLjg5MjYgODcuMzM0MiA1Mi45NDIzIDg3LjIzNDcgNTIuOTcxMSA4Ny4xMjg0QzUyLjk5OTggODcuMDIyMSA1My4wMDcxIDg2LjkxMTIgNTIuOTkyNiA4Ni44MDJDNTIuOTc4MiA4Ni42OTI4IDUyLjk0MjIgODYuNTg3NiA1Mi44ODY4IDg2LjQ5MjZDNTIuNzczMiA4Ni4yOTk4IDUyLjU4ODYgODYuMTU5NyA1Mi4zNzI4IDg2LjEwMjVDNTIuMTU3IDg2LjA0NTIgNTEuOTI3NiA4Ni4wNzU0IDUxLjczMzkgODYuMTg2Nkw1MC41Mjc4IDg2Ljg3NjNDNTAuMTkzMSA4Ni41NTg2IDQ5Ljc4NjggODYuMzI2NCA0OS4zNDM3IDg2LjE5OTVWODQuODIwMkM0OS4zMzY4IDg0LjYwMDMgNDkuMjQ1IDg0LjM5MTggNDkuMDg3NSA4NC4yMzg3QzQ4LjkzIDg0LjA4NTYgNDguNzE5MiA4NCA0OC40OTk4IDg0QzQ4LjI4MDUgODQgNDguMDY5OSA4NC4wODU2IDQ3LjkxMjQgODQuMjM4N0M0Ny43NTQ4IDg0LjM5MTggNDcuNjYyOCA4NC42MDAzIDQ3LjY1NiA4NC44MjAyVjg2LjE5OTVDNDcuMjE0IDg2LjMyODkgNDYuODA4MSA4Ni41NTk4IDQ2LjQ3MDYgODYuODc0TDQ1LjI2NjIgODYuMTg1M0M0NS4wNzI0IDg2LjA3NDIgNDQuODQyOCA4Ni4wNDQgNDQuNjI3IDg2LjEwMTNDNDQuNDExMyA4Ni4xNTg1IDQ0LjIyNjcgODYuMjk4NiA0NC4xMTMgODYuNDkxM0M0NC4wNTc2IDg2LjU4NjQgNDQuMDIxNyA4Ni42OTE2IDQ0LjAwNzIgODYuODAwN0M0My45OTI4IDg2LjkwOTkgNDQgODcuMDIwOSA0NC4wMjg4IDg3LjEyNzFDNDQuMDU3NSA4Ny4yMzM0IDQ0LjEwNzIgODcuMzMyOSA0NC4xNzQ3IDg3LjQxOThDNDQuMjQyMSA4Ny41MDY3IDQ0LjMyNiA4Ny41NzkyIDQ0LjQyMTcgODcuNjMzMkw0NS42MjY0IDg4LjMyMTZDNDUuNTIwNCA4OC43NjY2IDQ1LjUyMTMgODkuMjMwNSA0NS42MjkgODkuNjc1TDQ0LjQyMTcgOTAuMzY0N0M0NC4zMjYgOTAuNDE4NyA0NC4yNDIxIDkwLjQ5MTIgNDQuMTc0NyA5MC41NzgxQzQ0LjEwNzIgOTAuNjY1IDQ0LjA1NzUgOTAuNzY0NSA0NC4wMjg4IDkwLjg3MDhDNDQgOTAuOTc3MSA0My45OTI4IDkxLjA4OCA0NC4wMDcyIDkxLjE5NzJDNDQuMDIxNyA5MS4zMDYzIDQ0LjA1NzYgOTEuNDExNSA0NC4xMTMgOTEuNTA2NkM0NC4yMjY3IDkxLjY5OTIgNDQuNDExMyA5MS44MzkyIDQ0LjYyNyA5MS44OTY1QzQ0Ljg0MjggOTEuOTUzNyA0NS4wNzI0IDkxLjkyMzYgNDUuMjY2MiA5MS44MTI2TDQ2LjQ3MjEgOTEuMTIyOUM0Ni44MDYzIDkxLjQ0MDkgNDcuMjEyOCA5MS42NzI2IDQ3LjY1NjIgOTEuNzk3OVY5My4xNzk4QzQ3LjY2MzEgOTMuMzk5NyA0Ny43NTUgOTMuNjA4MiA0Ny45MTI2IDkzLjc2MTNDNDguMDcwMSA5My45MTQ0IDQ4LjI4MDcgOTQgNDguNSA5NEM0OC43MTk0IDk0IDQ4LjkzMDIgOTMuOTE0NCA0OS4wODc3IDkzLjc2MTNDNDkuMjQ1MiA5My42MDgyIDQ5LjMzNyA5My4zOTk3IDQ5LjM0MzkgOTMuMTc5OFY5MS43OTc1QzQ5Ljc4NTMgOTEuNjY4MyA1MC4xOTA3IDkxLjQzNzggNTAuNTI3OCA5MS4xMjQyTDUxLjczNDEgOTEuODEzOEM1MS45Mjc4IDkxLjkyNDggNTIuMTU3MyA5MS45NTUgNTIuMzczIDkxLjg5NzdDNTIuNTg4OCA5MS44NDA1IDUyLjc3MzMgOTEuNzAwNSA1Mi44ODcgOTEuNTA3OUM1Mi45NDI0IDkxLjQxMjggNTIuOTc4NCA5MS4zMDc2IDUyLjk5MjggOTEuMTk4NEM1My4wMDczIDkxLjA4OTIgNTIuOTk5OCA5MC45NzgzIDUyLjk3MTEgOTAuODcyQzUyLjk0MjMgOTAuNzY1NyA1Mi44OTI5IDkwLjY2NjIgNTIuODI1NCA5MC41NzkzQzUyLjc1NzkgOTAuNDkyNSA1Mi42NzM4IDkwLjQxOTkgNTIuNTc4MSA5MC4zNjZaTTQ3Ljg2NjQgOTAuMDg2MUM0Ny43MjI5IDkwLjAwNSA0Ny41OTY4IDg5Ljg5NjEgNDcuNDk1NiA4OS43NjU3QzQ3LjM5NDQgODkuNjM1MyA0Ny4zMjAyIDg5LjQ4NiA0Ny4yNzcxIDg5LjMyNjZDNDcuMjMzOSA4OS4xNjcxIDQ3LjIyMjggODkuMDAwNyA0Ny4yNDQzIDg4LjgzNjlDNDcuMjY1OCA4OC42NzMxIDQ3LjMxOTcgODguNTE1MiA0Ny40MDI2IDg4LjM3MjRDNDcuNTczNSA4OC4wODQgNDcuODUwMyA4Ny44NzQzIDQ4LjE3MzYgODcuNzg4M0M0OC40OTcgODcuNzAyMyA0OC44NDExIDg3Ljc0NyA0OS4xMzIxIDg3LjkxMjZDNDkuMjc1NiA4Ny45OTM4IDQ5LjQwMTYgODguMTAyNyA0OS41MDI4IDg4LjIzMzFDNDkuNjA0IDg4LjM2MzUgNDkuNjc4MiA4OC41MTI3IDQ5LjcyMTQgODguNjcyMkM0OS43NjQ1IDg4LjgzMTYgNDkuNzc1NyA4OC45OTgxIDQ5Ljc1NDEgODkuMTYxOUM0OS43MzI2IDg5LjMyNTcgNDkuNjc4NyA4OS40ODM2IDQ5LjU5NTggODkuNjI2M0M0OS40MjUgODkuOTE0OSA0OS4xNDgyIDkwLjEyNDcgNDguODI0OCA5MC4yMTA4QzQ4LjUwMTQgOTAuMjk2OSA0OC4xNTc0IDkwLjI1MjMgNDcuODY2NCA5MC4wODY3VjkwLjA4NjFaIiBmaWxsPSIjODZDM0RCIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLCA4KSIvPgo8cGF0aCBpZD0iU25vd2ZsYWtlIDIiIGQ9Ik02Ny41NzgxIDkwLjM2Nkw2Ni4zNzM1IDg5LjY3NzVDNjYuNDc5NCA4OS4yMzI2IDY2LjQ3ODYgODguNzY4NyA2Ni4zNzA4IDg4LjMyNDFMNjcuNTc4MSA4Ny42MzQ1QzY3LjY3MzggODcuNTgwNSA2Ny43NTc3IDg3LjUwNzkgNjcuODI1MiA4Ny40MjFDNjcuODkyNiA4Ny4zMzQyIDY3Ljk0MjMgODcuMjM0NyA2Ny45NzExIDg3LjEyODRDNjcuOTk5OCA4Ny4wMjIxIDY4LjAwNzEgODYuOTExMiA2Ny45OTI2IDg2LjgwMkM2Ny45NzgyIDg2LjY5MjggNjcuOTQyMiA4Ni41ODc2IDY3Ljg4NjggODYuNDkyNkM2Ny43NzMyIDg2LjI5OTggNjcuNTg4NiA4Ni4xNTk3IDY3LjM3MjggODYuMTAyNUM2Ny4xNTcgODYuMDQ1MiA2Ni45Mjc2IDg2LjA3NTQgNjYuNzMzOSA4Ni4xODY2TDY1LjUyNzggODYuODc2M0M2NS4xOTMxIDg2LjU1ODYgNjQuNzg2OCA4Ni4zMjY0IDY0LjM0MzcgODYuMTk5NVY4NC44MjAyQzY0LjMzNjggODQuNjAwMyA2NC4yNDUgODQuMzkxOCA2NC4wODc1IDg0LjIzODdDNjMuOTMgODQuMDg1NiA2My43MTkyIDg0IDYzLjQ5OTggODRDNjMuMjgwNSA4NCA2My4wNjk5IDg0LjA4NTYgNjIuOTEyNCA4NC4yMzg3QzYyLjc1NDggODQuMzkxOCA2Mi42NjI4IDg0LjYwMDMgNjIuNjU2IDg0LjgyMDJWODYuMTk5NUM2Mi4yMTQgODYuMzI4OSA2MS44MDgxIDg2LjU1OTggNjEuNDcwNiA4Ni44NzRMNjAuMjY2MiA4Ni4xODUzQzYwLjA3MjQgODYuMDc0MiA1OS44NDI4IDg2LjA0NCA1OS42MjcgODYuMTAxM0M1OS40MTEzIDg2LjE1ODUgNTkuMjI2NyA4Ni4yOTg2IDU5LjExMyA4Ni40OTEzQzU5LjA1NzYgODYuNTg2NCA1OS4wMjE3IDg2LjY5MTYgNTkuMDA3MiA4Ni44MDA3QzU4Ljk5MjggODYuOTA5OSA1OSA4Ny4wMjA5IDU5LjAyODggODcuMTI3MUM1OS4wNTc1IDg3LjIzMzQgNTkuMTA3MiA4Ny4zMzI5IDU5LjE3NDcgODcuNDE5OEM1OS4yNDIxIDg3LjUwNjcgNTkuMzI2IDg3LjU3OTIgNTkuNDIxNyA4Ny42MzMyTDYwLjYyNjQgODguMzIxNkM2MC41MjA0IDg4Ljc2NjYgNjAuNTIxMyA4OS4yMzA1IDYwLjYyOSA4OS42NzVMNTkuNDIxNyA5MC4zNjQ3QzU5LjMyNiA5MC40MTg3IDU5LjI0MjEgOTAuNDkxMiA1OS4xNzQ3IDkwLjU3ODFDNTkuMTA3MiA5MC42NjUgNTkuMDU3NSA5MC43NjQ1IDU5LjAyODggOTAuODcwOEM1OSA5MC45NzcxIDU4Ljk5MjggOTEuMDg4IDU5LjAwNzIgOTEuMTk3MkM1OS4wMjE3IDkxLjMwNjMgNTkuMDU3NiA5MS40MTE1IDU5LjExMyA5MS41MDY2QzU5LjIyNjcgOTEuNjk5MiA1OS40MTEzIDkxLjgzOTIgNTkuNjI3IDkxLjg5NjVDNTkuODQyOCA5MS45NTM3IDYwLjA3MjQgOTEuOTIzNiA2MC4yNjYyIDkxLjgxMjZMNjEuNDcyMSA5MS4xMjI5QzYxLjgwNjMgOTEuNDQwOSA2Mi4yMTI4IDkxLjY3MjYgNjIuNjU2MiA5MS43OTc5VjkzLjE3OThDNjIuNjYzMSA5My4zOTk3IDYyLjc1NSA5My42MDgyIDYyLjkxMjYgOTMuNzYxM0M2My4wNzAxIDkzLjkxNDQgNjMuMjgwNyA5NCA2My41IDk0QzYzLjcxOTQgOTQgNjMuOTMwMiA5My45MTQ0IDY0LjA4NzcgOTMuNzYxM0M2NC4yNDUyIDkzLjYwODIgNjQuMzM3IDkzLjM5OTcgNjQuMzQzOSA5My4xNzk4VjkxLjc5NzVDNjQuNzg1MyA5MS42NjgzIDY1LjE5MDcgOTEuNDM3OCA2NS41Mjc4IDkxLjEyNDJMNjYuNzM0MSA5MS44MTM4QzY2LjkyNzggOTEuOTI0OCA2Ny4xNTczIDkxLjk1NSA2Ny4zNzMgOTEuODk3N0M2Ny41ODg4IDkxLjg0MDUgNjcuNzczMyA5MS43MDA1IDY3Ljg4NyA5MS41MDc5QzY3Ljk0MjQgOTEuNDEyOCA2Ny45Nzg0IDkxLjMwNzYgNjcuOTkyOCA5MS4xOTg0QzY4LjAwNzMgOTEuMDg5MiA2Ny45OTk4IDkwLjk3ODMgNjcuOTcxMSA5MC44NzJDNjcuOTQyMyA5MC43NjU3IDY3Ljg5MjkgOTAuNjY2MiA2Ny44MjU0IDkwLjU3OTNDNjcuNzU3OSA5MC40OTI1IDY3LjY3MzggOTAuNDE5OSA2Ny41NzgxIDkwLjM2NlpNNjIuODY2NCA5MC4wODYxQzYyLjcyMjkgOTAuMDA1IDYyLjU5NjggODkuODk2MSA2Mi40OTU2IDg5Ljc2NTdDNjIuMzk0NCA4OS42MzUzIDYyLjMyMDIgODkuNDg2IDYyLjI3NzEgODkuMzI2NkM2Mi4yMzM5IDg5LjE2NzEgNjIuMjIyOCA4OS4wMDA3IDYyLjI0NDMgODguODM2OUM2Mi4yNjU4IDg4LjY3MzEgNjIuMzE5NyA4OC41MTUyIDYyLjQwMjYgODguMzcyNEM2Mi41NzM1IDg4LjA4NCA2Mi44NTAzIDg3Ljg3NDMgNjMuMTczNiA4Ny43ODgzQzYzLjQ5NyA4Ny43MDIzIDYzLjg0MTEgODcuNzQ3IDY0LjEzMjEgODcuOTEyNkM2NC4yNzU2IDg3Ljk5MzggNjQuNDAxNiA4OC4xMDI3IDY0LjUwMjggODguMjMzMUM2NC42MDQgODguMzYzNSA2NC42NzgyIDg4LjUxMjcgNjQuNzIxNCA4OC42NzIyQzY0Ljc2NDUgODguODMxNiA2NC43NzU3IDg4Ljk5ODEgNjQuNzU0MSA4OS4xNjE5QzY0LjczMjYgODkuMzI1NyA2NC42Nzg3IDg5LjQ4MzYgNjQuNTk1OCA4OS42MjYzQzY0LjQyNSA4OS45MTQ5IDY0LjE0ODIgOTAuMTI0NyA2My44MjQ4IDkwLjIxMDhDNjMuNTAxNCA5MC4yOTY5IDYzLjE1NzQgOTAuMjUyMyA2Mi44NjY0IDkwLjA4NjdWOTAuMDg2MVoiIGZpbGw9IiM4NkMzREIiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsIDApIi8+CjxwYXRoIGlkPSJTbm93Zmxha2UgMyIgZD0iTTgyLjU3ODEgOTAuMzY2TDgxLjM3MzUgODkuNjc3NUM4MS40Nzk0IDg5LjIzMjYgODEuNDc4NiA4OC43Njg3IDgxLjM3MDggODguMzI0MUw4Mi41NzgxIDg3LjYzNDVDODIuNjczOCA4Ny41ODA1IDgyLjc1NzcgODcuNTA3OSA4Mi44MjUyIDg3LjQyMUM4Mi44OTI2IDg3LjMzNDIgODIuOTQyMyA4Ny4yMzQ3IDgyLjk3MTEgODcuMTI4NEM4Mi45OTk4IDg3LjAyMjEgODMuMDA3MSA4Ni45MTEyIDgyLjk5MjYgODYuODAyQzgyLjk3ODIgODYuNjkyOCA4Mi45NDIyIDg2LjU4NzYgODIuODg2OCA4Ni40OTI2QzgyLjc3MzIgODYuMjk5OCA4Mi41ODg2IDg2LjE1OTcgODIuMzcyOCA4Ni4xMDI1QzgyLjE1NyA4Ni4wNDUyIDgxLjkyNzYgODYuMDc1NCA4MS43MzM5IDg2LjE4NjZMODAuNTI3OCA4Ni44NzYzQzgwLjE5MzEgODYuNTU4NiA3OS43ODY4IDg2LjMyNjQgNzkuMzQzNyA4Ni4xOTk1Vjg0LjgyMDJDNzkuMzM2OCA4NC42MDAzIDc5LjI0NSA4NC4zOTE4IDc5LjA4NzUgODQuMjM4N0M3OC45MyA4NC4wODU2IDc4LjcxOTIgODQgNzguNDk5OCA4NEM3OC4yODA1IDg0IDc4LjA2OTkgODQuMDg1NiA3Ny45MTI0IDg0LjIzODdDNzcuNzU0OCA4NC4zOTE4IDc3LjY2MjggODQuNjAwMyA3Ny42NTYgODQuODIwMlY4Ni4xOTk1Qzc3LjIxNCA4Ni4zMjg5IDc2LjgwODEgODYuNTU5OCA3Ni40NzA2IDg2Ljg3NEw3NS4yNjYyIDg2LjE4NTNDNzUuMDcyNCA4Ni4wNzQyIDc0Ljg0MjggODYuMDQ0IDc0LjYyNyA4Ni4xMDEzQzc0LjQxMTMgODYuMTU4NSA3NC4yMjY3IDg2LjI5ODYgNzQuMTEzIDg2LjQ5MTNDNzQuMDU3NiA4Ni41ODY0IDc0LjAyMTcgODYuNjkxNiA3NC4wMDcyIDg2LjgwMDdDNzMuOTkyOCA4Ni45MDk5IDc0IDg3LjAyMDkgNzQuMDI4OCA4Ny4xMjcxQzc0LjA1NzUgODcuMjMzNCA3NC4xMDcyIDg3LjMzMjkgNzQuMTc0NyA4Ny40MTk4Qzc0LjI0MjEgODcuNTA2NyA3NC4zMjYgODcuNTc5MiA3NC40MjE3IDg3LjYzMzJMNzUuNjI2NCA4OC4zMjE2Qzc1LjUyMDQgODguNzY2NiA3NS41MjEzIDg5LjIzMDUgNzUuNjI5IDg5LjY3NUw3NC40MjE3IDkwLjM2NDdDNzQuMzI2IDkwLjQxODcgNzQuMjQyMSA5MC40OTEyIDc0LjE3NDcgOTAuNTc4MUM3NC4xMDcyIDkwLjY2NSA3NC4wNTc1IDkwLjc2NDUgNzQuMDI4OCA5MC44NzA4Qzc0IDkwLjk3NzEgNzMuOTkyOCA5MS4wODggNzQuMDA3MiA5MS4xOTcyQzc0LjAyMTcgOTEuMzA2MyA3NC4wNTc2IDkxLjQxMTUgNzQuMTEzIDkxLjUwNjZDNzQuMjI2NyA5MS42OTkyIDc0LjQxMTMgOTEuODM5MiA3NC42MjcgOTEuODk2NUM3NC44NDI4IDkxLjk1MzcgNzUuMDcyNCA5MS45MjM2IDc1LjI2NjIgOTEuODEyNkw3Ni40NzIxIDkxLjEyMjlDNzYuODA2MyA5MS40NDA5IDc3LjIxMjggOTEuNjcyNiA3Ny42NTYyIDkxLjc5NzlWOTMuMTc5OEM3Ny42NjMxIDkzLjM5OTcgNzcuNzU1IDkzLjYwODIgNzcuOTEyNiA5My43NjEzQzc4LjA3MDEgOTMuOTE0NCA3OC4yODA3IDk0IDc4LjUgOTRDNzguNzE5NCA5NCA3OC45MzAyIDkzLjkxNDQgNzkuMDg3NyA5My43NjEzQzc5LjI0NTIgOTMuNjA4MiA3OS4zMzcgOTMuMzk5NyA3OS4zNDM5IDkzLjE3OThWOTEuNzk3NUM3OS43ODUzIDkxLjY2ODMgODAuMTkwNyA5MS40Mzc4IDgwLjUyNzggOTEuMTI0Mkw4MS43MzQxIDkxLjgxMzhDODEuOTI3OCA5MS45MjQ4IDgyLjE1NzMgOTEuOTU1IDgyLjM3MyA5MS44OTc3QzgyLjU4ODggOTEuODQwNSA4Mi43NzMzIDkxLjcwMDUgODIuODg3IDkxLjUwNzlDODIuOTQyNCA5MS40MTI4IDgyLjk3ODQgOTEuMzA3NiA4Mi45OTI4IDkxLjE5ODRDODMuMDA3MyA5MS4wODkyIDgyLjk5OTggOTAuOTc4MyA4Mi45NzExIDkwLjg3MkM4Mi45NDIzIDkwLjc2NTcgODIuODkyOSA5MC42NjYyIDgyLjgyNTQgOTAuNTc5M0M4Mi43NTc5IDkwLjQ5MjUgODIuNjczOCA5MC40MTk5IDgyLjU3ODEgOTAuMzY2Wk03Ny44NjY0IDkwLjA4NjFDNzcuNzIyOSA5MC4wMDUgNzcuNTk2OCA4OS44OTYxIDc3LjQ5NTYgODkuNzY1N0M3Ny4zOTQ0IDg5LjYzNTMgNzcuMzIwMiA4OS40ODYgNzcuMjc3MSA4OS4zMjY2Qzc3LjIzMzkgODkuMTY3MSA3Ny4yMjI4IDg5LjAwMDcgNzcuMjQ0MyA4OC44MzY5Qzc3LjI2NTggODguNjczMSA3Ny4zMTk3IDg4LjUxNTIgNzcuNDAyNiA4OC4zNzI0Qzc3LjU3MzUgODguMDg0IDc3Ljg1MDMgODcuODc0MyA3OC4xNzM2IDg3Ljc4ODNDNzguNDk3IDg3LjcwMjMgNzguODQxMSA4Ny43NDcgNzkuMTMyMSA4Ny45MTI2Qzc5LjI3NTYgODcuOTkzOCA3OS40MDE2IDg4LjEwMjcgNzkuNTAyOCA4OC4yMzMxQzc5LjYwNCA4OC4zNjM1IDc5LjY3ODIgODguNTEyNyA3OS43MjE0IDg4LjY3MjJDNzkuNzY0NSA4OC44MzE2IDc5Ljc3NTcgODguOTk4MSA3OS43NTQxIDg5LjE2MTlDNzkuNzMyNiA4OS4zMjU3IDc5LjY3ODcgODkuNDgzNiA3OS41OTU4IDg5LjYyNjNDNzkuNDI1IDg5LjkxNDkgNzkuMTQ4MiA5MC4xMjQ3IDc4LjgyNDggOTAuMjEwOEM3OC41MDE0IDkwLjI5NjkgNzguMTU3NCA5MC4yNTIzIDc3Ljg2NjQgOTAuMDg2N1Y5MC4wODYxWiIgZmlsbD0iIzg2QzNEQiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgOCkiLz4KPC9nPgo8L2c+CjwvZz4KPGRlZnM+CjxjbGlwUGF0aCBpZD0iY2xpcDBfMjA0NV8yODk0MiI+CjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPg==";
  var WX_THUNDERSTORMS = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9InRodW5kZXJzdG9ybXMiIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yMDQ1XzI5MTA0KSI+CjxnIGlkPSJTa3kiPgo8ZyBpZD0iQ2xvdWRzIj4KPGcgaWQ9IkNsb3VkIj4KPHBhdGggaWQ9IkNsb3VkXzIiIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNNTQuODM3MyA0OC4yMTE1QzU5LjgyNzUgNDAuMTM4IDcwLjI2NDkgMzYuODI0IDc5LjAwODYgNDAuNDgyM0M4Ny43NDE3IDQ0LjEzNiA5Mi42ODM4IDUzLjg4MjcgOTAuMzg4NyA2My4wODU2Qzk3LjY4MjkgNjIuNzY3MSAxMDQgNjguNzA2NyAxMDQgNzYuMDI4MUMxMDQgODMuMTE1OCA5OC4wNDc3IDg5IDkwLjk3NjggODlDODkuODcyMyA4OSA4OC45NzY4IDg4LjEwNCA4OC45NzY4IDg2Ljk5ODZDODguOTc2OCA4NS44OTMzIDg5Ljg3MjMgODQuOTk3MyA5MC45NzY4IDg0Ljk5NzNDOTUuODYzOSA4NC45OTczIDEwMCA4MC44Nzk5IDEwMCA3Ni4wMjgxQzEwMCA3MS4wMjYyIDk1LjYyMjMgNjYuODYzNyA5MC41NjMxIDY3LjA4NDZMODcuODg2NyA2Ny4yMDE0Qzg3LjI1NjMgNjcuMjI5IDg2LjY0OTggNjYuOTU3MSA4Ni4yNTA2IDY2LjQ2ODFDODUuODUxNCA2NS45NzkgODUuNzA2MyA2NS4zMzAxIDg1Ljg1OTEgNjQuNzE3NEw4Ni41MDc3IDYyLjExNjVDODguMzIwMyA1NC44NDg0IDg0LjM5MTEgNDcuMDcyNyA3Ny40NjU3IDQ0LjE3NTJDNzAuNTI1IDQxLjI3MTMgNjIuMTg4NyA0My45MjcyIDU4LjIzOTEgNTAuMzE3MUw1Ny4yMDA1IDUxLjk5NzVDNTYuNjI0NyA1Mi45MjkxIDU1LjQwNzUgNTMuMjI0NCA1NC40NjkzIDUyLjY2MDJMNTIuNzc2OCA1MS42NDI0QzQ5LjgxMTggNDkuODU5MiA0NS45MzIgNDkuOTY2NCA0My4wNzExIDUxLjkxMDVDNDAuMjIwOSA1My44NDc0IDM4LjcwOTggNTcuMzkyMiAzOS4yOTE5IDYwLjc3NDVMMzkuNjI2IDYyLjcxNTRDMzkuODExNCA2My43OTI0IDM5LjA5OTIgNjQuODE5IDM4LjAyNjEgNjUuMDIxOEwzNi4wOTIyIDY1LjM4NzJDMzEuMTQyMyA2Ni4zMjI1IDI3LjU3MjUgNzEuMDQ0MSAyOC4wNDM4IDc2LjAzMDdDMjguNTE1NCA4MS4wMjA3IDMyLjkxMDEgODQuOTk4MyAzNy45NTIxIDg0Ljk5NzNDMzkuMDU2NiA4NC45OTcgMzkuOTUyMiA4NS44OTI5IDM5Ljk1MjUgODYuOTk4MkMzOS45NTI3IDg4LjEwMzUgMzkuMDU3NSA4OC45OTk4IDM3Ljk1MjkgODlDMzAuODY5NiA4OS4wMDE1IDI0LjcyOTYgODMuNDc1NSAyNC4wNjE1IDc2LjQwNzZDMjMuMzkzNyA2OS4zNDEyIDI4LjM5MDggNjIuNzY4OSAzNS4zNSA2MS40NTRDMzQuNDk5OCA1Ni41MTQ4IDM2LjY4MjkgNTEuNDEzMSA0MC44MjQgNDguNTk5MUM0NC45NzUzIDQ1Ljc3ODEgNTAuNTM2NCA0NS42MjUgNTQuODM3MyA0OC4yMTE1WiIgZmlsbD0iI0U2RUZGQyIvPgo8L2c+CjwvZz4KPC9nPgo8ZyBpZD0iTGlnaHRuaW5nIj4KPHBhdGggaWQ9IkxpZ2h0bmluZyBCb2x0IiBkPSJNNjAuMDAwMyA2OEw1MiA5MC45MDkySDYwLjAwMDNMNTUuOTk5NSAxMTBMNzYgODMuMjcyOEg2My45OTk2TDcxLjk5OTkgNjhINjAuMDAwM1oiIGZpbGw9IiNGNkE4MjMiLz4KPC9nPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzIwNDVfMjkxMDQiPgo8cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsbD0id2hpdGUiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4=";
  var WX_CLOUDY = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgaWQ9ImNsb3VkeSIgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIwNDVfMjg4MTgpIj4KPGcgaWQ9IlNreSI+CjxnIGlkPSJDbG91ZHMiPgo8ZyBpZD0iQ2xvdWQiPgo8cGF0aCBpZD0iQ2xvdWRfMiIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik01NC44MzcxIDQ4LjIxMTVDNTEuMDczOSA0NS45NDgzIDQ2LjM0NTcgNDUuNzgyNiA0Mi40NDE1IDQ3LjY2NjRDNDEuODgzNyA0Ny45MzU1IDQxLjM0MjggNDguMjQ2NSA0MC44MjM5IDQ4LjU5OTFDMzYuNjgyNiA1MS40MTMzIDM0LjQ5OTggNTYuNTE1MSAzNS4zNDk5IDYxLjQ1NEMyOC4zOTA3IDYyLjc2ODkgMjMuMzkzNiA2OS4zNDEyIDI0LjA2MTQgNzYuNDA3NkMyNC43MjkzIDgzLjQ3NCAzMC44Njc4IDg5LjAwMTEgMzcuOTUxOSA4OUMzNy45NTE2IDg5IDM3Ljk1MjIgODkgMzcuOTUxOSA4OUg5MC45NzY3QzkxLjg2MDggODkgOTIuNzI3MyA4OC45MDggOTMuNTY2OSA4OC43MzMzQzk1LjA1MzEgODguNDIzOSA5Ni40NTQ3IDg3Ljg1NSA5Ny43MTk2IDg3LjA3NzRDOTkuMzEzMSA4Ni4wOTc5IDEwMC42ODkgODQuNzg3IDEwMS43NDQgODMuMjQ2NUMxMDIuMzIgODIuNDA0OSAxMDIuODAxIDgxLjQ5NDcgMTAzLjE2OCA4MC41MzI0QzEwMy43MDUgNzkuMTI1IDEwNCA3Ny42MDYzIDEwNCA3Ni4wMjgxQzEwNCA3NS45MTM4IDEwMy45OTggNzUuNzk5NyAxMDMuOTk1IDc1LjY4NjFDMTAzLjg0IDY5LjkwMDYgOTkuNzQzNCA2NS4wMzY2IDk0LjM5MDYgNjMuNTQ0N0M5My4xMTU4IDYzLjE4OTQgOTEuNzY5NyA2My4wMjUzIDkwLjM4ODYgNjMuMDg1NkM5MC43MjExIDYxLjc1MiA5MC45MDE3IDYwLjQwNjkgOTAuOTQwOSA1OS4wNzA2QzkxLjE3MTYgNTEuMTg2MSA4Ni40NzY0IDQzLjYwNjcgNzkuMDA4NSA0MC40ODIzQzcwLjI2NDggMzYuODI0IDU5LjgyNzQgNDAuMTM4IDU0LjgzNzEgNDguMjExNVpNOTAuOTc2NyA4NC45OTczQzk1Ljg2NDkgODQuOTk3MyAxMDAgODAuODc4OCAxMDAgNzYuMDI4MUMxMDAgNzEuNjUzMSA5Ni42NDk4IDY3LjkxNzggOTIuNDIxNiA2Ny4yMDAzQzkyLjExOTYgNjcuMTQ5MSA5MS44MTMxIDY3LjExMzIgOTEuNTAzIDY3LjA5MzdDOTEuMTkyOSA2Ny4wNzQxIDkwLjg3OTMgNjcuMDcwOCA5MC41NjI5IDY3LjA4NDZMODcuODg2NiA2Ny4yMDE0Qzg3LjI1NjIgNjcuMjI5IDg2LjY0OTcgNjYuOTU3MSA4Ni4yNTA1IDY2LjQ2ODFDODUuODUxMyA2NS45NzkgODUuNzA2MiA2NS4zMzAxIDg1Ljg1OSA2NC43MTc0TDg2LjUwNzYgNjIuMTE2NUM4Ni42MjA5IDYxLjY2MjIgODYuNzExNyA2MS4yMDYgODYuNzgwOCA2MC43NDkxQzg3LjgxNzIgNTMuODk1OSA4My45NTg1IDQ2Ljg5MTcgNzcuNDY1NiA0NC4xNzUyQzcwLjUyNDYgNDEuMjcxMiA2Mi4xODg0IDQzLjkyNzQgNTguMjM5IDUwLjMxNzFMNTcuMjAwMyA1MS45OTc1QzU3LjIwMDEgNTEuOTk4IDU3LjE5OTggNTEuOTk4NCA1Ny4xOTk1IDUxLjk5ODlDNTYuNjIzNCA1Mi45Mjk0IDU1LjQwNjkgNTMuMjI0MSA1NC40NjkyIDUyLjY2MDJMNTIuNzc2NyA1MS42NDI0QzQ5LjgxMTYgNDkuODU5MiA0NS45MzE5IDQ5Ljk2NjQgNDMuMDcxIDUxLjkxMDVDNDIuNzE0NyA1Mi4xNTI2IDQyLjM3OTMgNTIuNDE5OSA0Mi4wNjY0IDUyLjcwODhDMzkuODc1NiA1NC43MzEyIDM4Ljc4MjQgNTcuODE1MiAzOS4yOTE4IDYwLjc3NDVMMzkuNjI1OSA2Mi43MTU0QzM5LjYyNiA2Mi43MTU4IDM5LjYyNiA2Mi43MTYyIDM5LjYyNjEgNjIuNzE2NkMzOS44MTA3IDYzLjc5MjggMzkuMDk5MSA2NC44MTg1IDM4LjAyNjkgNjUuMDIxNkMzOC4wMjY2IDY1LjAyMTcgMzguMDI3MSA2NS4wMjE2IDM4LjAyNjkgNjUuMDIxNkwzNi4wOTIgNjUuMzg3MkMzMS4xNDEzIDY2LjMyMjYgMjcuNTcyNCA3MS4wNDQ5IDI4LjA0MzcgNzYuMDMwN0MyOC41MTUyIDgxLjAxOTkgMzIuOTA5MiA4NC45OTgzIDM3Ljk1MTkgODQuOTk3M0g5MC45NzY3WiIgZmlsbD0iI0U2RUZGQyIvPgo8L2c+CjwvZz4KPC9nPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzIwNDVfMjg4MTgiPgo8cmVjdCB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgZmlsbD0id2hpdGUiLz4KPC9jbGlwUGF0aD4KPC9kZWZzPgo8L3N2Zz4=";
  function weatherCodeInfo(code) {
    const img = (src, alt) => `<img class="wx-ic" src="${src}" alt="${alt}">`;
    if (code === 0)
      return { icon: img(WX_CLEAR_DAY, "\u042F\u0441\u043D\u043E"), text: "\u042F\u0441\u043D\u043E" };
    if (code <= 2)
      return { icon: img(WX_PARTLY_CLOUDY, "\u041C\u0456\u043D\u043B\u0438\u0432\u0430 \u0445\u043C\u0430\u0440\u043D\u0456\u0441\u0442\u044C"), text: "\u041C\u0456\u043D\u043B\u0438\u0432\u0430 \u0445\u043C\u0430\u0440\u043D\u0456\u0441\u0442\u044C" };
    if (code === 3)
      return { icon: img(WX_OVERCAST, "\u0425\u043C\u0430\u0440\u043D\u043E"), text: "\u0425\u043C\u0430\u0440\u043D\u043E" };
    if (code <= 48)
      return { icon: img(WX_FOG, "\u0422\u0443\u043C\u0430\u043D"), text: "\u0422\u0443\u043C\u0430\u043D" };
    if (code <= 55)
      return { icon: img(WX_DRIZZLE, "\u041C\u0440\u044F\u043A\u0430"), text: "\u041C\u0440\u044F\u043A\u0430" };
    if (code <= 65)
      return { icon: img(WX_RAIN, "\u0414\u043E\u0449"), text: "\u0414\u043E\u0449" };
    if (code <= 77)
      return { icon: img(WX_SNOW, "\u0421\u043D\u0456\u0433"), text: "\u0421\u043D\u0456\u0433" };
    if (code <= 82)
      return { icon: img(WX_RAIN, "\u0417\u043B\u0438\u0432\u0438"), text: "\u0417\u043B\u0438\u0432\u0438" };
    if (code <= 86)
      return { icon: img(WX_SNOW_SHOWERS, "\u0421\u043D\u0456\u0433\u043E\u0432\u0456 \u0437\u043B\u0438\u0432\u0438"), text: "\u0421\u043D\u0456\u0433\u043E\u0432\u0456 \u0437\u043B\u0438\u0432\u0438" };
    if (code >= 95)
      return { icon: img(WX_THUNDERSTORMS, "\u0413\u0440\u043E\u0437\u0430"), text: "\u0413\u0440\u043E\u0437\u0430" };
    return { icon: img(WX_CLOUDY, "\u2014"), text: "\u2014" };
  }

  // src/core/weather.js
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
      iconEl.innerHTML = weatherCodeInfo(data.current.weather_code).icon;
      document.getElementById("weather-city").textContent = cityName;
      tempEl.textContent = `${temp}\xB0`;
    } catch {
      clearTimeout(timeoutId);
      const widget = document.getElementById("weather-widget");
      if (widget)
        widget.style.visibility = "hidden";
    }
  }

  // src/core/settlements.js
  var SETTLEMENTS = [
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
    "\u0425\u0440\u043E\u043C'\u044F\u043A\u0456\u0432",
    "\u0427\u0435\u043C\u0435\u0440\u0438\u043D"
  ];
  var OTHER_SETTLEMENT = "\u0406\u043D\u0448\u0435";
  var COMMUNITY_ALL = "\u0412\u0441\u044F \u041E\u043B\u0438\u0446\u044C\u043A\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0430";
  var COMMUNITY_ALL_LABEL = "\u041E\u043B\u0438\u0446\u044C\u043A\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0430";

  // src/core/modal.js
  var _active = null;
  function buildSheet({ title, bodyHtml }) {
    return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-sheet" role="dialog" aria-modal="true"${title ? ` aria-label="${escapeHtml(title)}"` : ""}>
      <div class="app-modal-handle"></div>
      <button class="app-modal-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u0438\u0442\u0438">\u2715</button>
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ""}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
  }
  function buildCenter({ title, bodyHtml }) {
    return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-card" role="dialog" aria-modal="true">
      <button class="app-modal-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u0438\u0442\u0438">\u2715</button>
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ""}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
  }
  function openModal({ title = "", bodyHtml = "", variant = "sheet", onMount, onClose, swipeClose = true, className = "" } = {}) {
    closeModal();
    const wrap = document.createElement("div");
    wrap.className = `app-modal app-modal--${variant}${className ? " " + className : ""}`;
    wrap.innerHTML = variant === "center" ? buildCenter({ title, bodyHtml }) : buildSheet({ title, bodyHtml });
    document.body.appendChild(wrap);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => wrap.classList.add("open"));
    const backdrop = wrap.querySelector(".app-modal-backdrop");
    const panel = wrap.querySelector(".app-modal-sheet, .app-modal-card");
    const closeBtn = wrap.querySelector(".app-modal-close");
    const onKey = (e) => {
      if (e.key === "Escape")
        close();
    };
    document.addEventListener("keydown", onKey);
    function close() {
      if (_active?.el !== wrap)
        return;
      _active = null;
      onClose?.();
      wrap.classList.remove("open");
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKey);
      setTimeout(() => wrap.remove(), 240);
    }
    backdrop?.addEventListener("click", close);
    closeBtn?.addEventListener("click", close);
    if (variant === "sheet" && swipeClose && panel) {
      let startY = 0, dragging = false, dy = 0;
      panel.addEventListener("touchstart", (e) => {
        const y = e.touches[0].clientY;
        const inHeader = y - panel.getBoundingClientRect().top < 64;
        if (!inHeader && panel.scrollTop > 0)
          return;
        startY = y;
        dragging = true;
        dy = 0;
      }, { passive: true });
      panel.addEventListener("touchmove", (e) => {
        if (!dragging)
          return;
        dy = e.touches[0].clientY - startY;
        if (dy <= 0) {
          panel.style.transform = "";
          return;
        }
        if (panel.scrollTop > 0) {
          panel.style.transform = "";
          startY = e.touches[0].clientY;
          dy = 0;
          return;
        }
        e.preventDefault();
        panel.style.transition = "none";
        panel.style.transform = `translateY(${dy}px)`;
      }, { passive: false });
      panel.addEventListener("touchend", () => {
        if (!dragging)
          return;
        dragging = false;
        panel.style.transition = "";
        if (dy > 90) {
          panel.style.transform = "translateY(100%)";
          close();
        } else {
          panel.style.transform = "";
        }
        dy = 0;
      });
    }
    onMount?.(wrap);
    _active = { el: wrap, close };
    return { close, el: wrap };
  }
  function closeModal() {
    _active?.close();
  }

  // src/core/board-categories.js
  var A = 'width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cat-ico"';
  var SVG = {
    // Купити — корзина
    cart: `<svg ${A}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>`,
    // Продам — цінник
    tag: `<svg ${A}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    // Віддам безкоштовно — подарунок
    gift: `<svg ${A}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
    // Шукаю — лупа
    search: `<svg ${A}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    // Послуги — ключ
    wrench: `<svg ${A}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.3 6.3a2.1 2.1 0 0 1-3-3l6.3-6.3a6 6 0 0 1 7.9-7.9l-3.1 3.1z"/></svg>`,
    // Знайдено — галочка в колі
    check: `<svg ${A}><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>`,
    // Загубилось — знак «?» у колі
    help: `<svg ${A}><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    // Всі — повзунки (налаштування фільтра; дефолт кнопки фільтра)
    sliders: `<svg ${A}><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/></svg>`
  };
  var BOARD_CATEGORIES = [
    { id: "\u043A\u0443\u043F\u043B\u044E", label: "\u041A\u0443\u043F\u043B\u044E", color: "green", icon: SVG.cart },
    { id: "\u043F\u0440\u043E\u0434\u0430\u043C", label: "\u041F\u0440\u043E\u0434\u0430\u043C", color: "red", icon: SVG.tag },
    { id: "\u043F\u043E\u0441\u043B\u0443\u0433\u0430", label: "\u041F\u043E\u0441\u043B\u0443\u0433\u0438", color: "white", icon: SVG.wrench },
    { id: "\u0448\u0443\u043A\u0430\u044E", label: "\u0428\u0443\u043A\u0430\u044E", color: "blue", icon: SVG.search },
    { id: "\u0432\u0456\u0434\u0434\u0430\u043C", label: "\u0412\u0456\u0434\u0434\u0430\u043C \u0431\u0435\u0437\u043A\u043E\u0448\u0442\u043E\u0432\u043D\u043E", short: "\u0412\u0456\u0434\u0434\u0430\u043C", color: "green", icon: SVG.gift },
    { id: "\u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E", label: "\u0417\u043D\u0430\u0439\u0434\u0435\u043D\u043E", color: "amber", icon: SVG.check },
    { id: "\u0437\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C", label: "\u0417\u0430\u0433\u0443\u0431\u0438\u043B\u043E\u0441\u044C", color: "amber", icon: SVG.help }
  ];
  var ALL_ICON = SVG.sliders;
  var byId = (id) => BOARD_CATEGORIES.find((c) => c.id === id);
  function catColor(id) {
    const c = byId(id);
    return c ? c.color : "white";
  }
  function catIcon(id) {
    const c = byId(id);
    return c ? c.icon : ALL_ICON;
  }
  function catLabel(id) {
    const c = byId(id);
    return c ? c.label : id;
  }
  function catShort(id) {
    const c = byId(id);
    return c ? c.short || c.label : id;
  }

  // src/core/icons.js
  var A2 = 'width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="cat-ico"';
  var ICONS = {
    // Люди / учасники (дедуп: 2 копії зведено сюди — board.js, messages-ui.js.
    // admin.html тримає ВЛАСНУ ICO_USERS — то standalone-файл без бандлера, за
    // задумом Потоку 7 його не чіпаємо; при зміні цього svg свідомо синхронити й там)
    users: `<svg ${A2}><path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/></svg>`,
    // Телефон / дзвінок (дедуп: раніше 2 байт-в-байт копії — board.js, community-blocks.js)
    phone: `<svg ${A2}><path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"/></svg>`,
    // Локація / мітка на карті
    pin: `<svg ${A2}><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"/></svg>`,
    // Пошук / лупа
    search: `<svg ${A2}><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/><path d="M21 21l-6 -6"/></svg>`,
    // Галочка / підтвердження
    check: `<svg ${A2}><path d="M5 12l5 5l10 -10"/></svg>`,
    // Попередження (трикутник — конвенційна форма для warning, не коло)
    warning: `<svg ${A2}><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/></svg>`,
    // Календар / дата
    calendar: `<svg ${A2}><path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M11 15h1"/><path d="M12 15v3"/></svg>`,
    // Годинник / час
    clock: `<svg ${A2}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 7v5l3 3"/></svg>`,
    // Замок / приватність
    lock: `<svg ${A2}><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/></svg>`,
    // Налаштування / шестерня
    settings: `<svg ${A2}><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg>`,
    // Смітник / видалити
    trash: `<svg ${A2}><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>`,
    // Олівець / редагувати (дедуп: раніше 2 копії — board.js EDIT_ICON_SVG, community-modal.js PENCIL_ICON_SVG)
    pencil: `<svg ${A2}><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>`,
    // Хрестик / закрити
    close: `<svg ${A2}><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>`,
    // Шеврон вправо / розгорнути
    chevronRight: `<svg ${A2}><path d="M9 6l6 6l-6 6"/></svg>`,
    // Стрілка вправо / далі
    arrowRight: `<svg ${A2}><path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/></svg>`,
    // Око / перегляд
    eye: `<svg ${A2}><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/></svg>`,
    // Ракета / опублікувати
    rocket: `<svg ${A2}><path d="M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3"/><path d="M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3"/><path d="M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/></svg>`,
    // Фото / зображення
    photo: `<svg ${A2}><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>`,
    // Документ / файл (стаття)
    fileText: `<svg ${A2}><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2"/><path d="M9 9l1 0"/><path d="M9 13l6 0"/><path d="M9 17l6 0"/></svg>`,
    // Робот / AI-позначка
    robot: `<svg ${A2}><path d="M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4"/><path d="M12 2v2"/><path d="M9 12v9"/><path d="M15 12v9"/><path d="M5 16l4 -2"/><path d="M15 14l4 2"/><path d="M9 18h6"/><path d="M10 8v.01"/><path d="M14 8v.01"/></svg>`,
    // Планшет зі списком / «Мої оголошення» (clipboard-list)
    clipboard: `<svg ${A2}><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2"/><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z"/><path d="M9 12l.01 0"/><path d="M13 12l2 0"/><path d="M9 16l.01 0"/><path d="M13 16l2 0"/></svg>`,
    // Архів / коробка (archive)
    archive: `<svg ${A2}><path d="M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10"/><path d="M10 12l4 0"/></svg>`,
    // Повідомлення / чат-бульбашка (message)
    message: `<svg ${A2}><path d="M8 9h8"/><path d="M8 13h6"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"/></svg>`,
    // Стрілка вгору / підняти (arrow-up)
    arrowUp: `<svg ${A2}><path d="M12 5l0 14"/><path d="M18 11l-6 -6"/><path d="M6 11l6 -6"/></svg>`,
    // ── Потік 7 (12.07, варіант 5) — реальні Tabler-шляхи, зібрані агентом з github.com/tabler/tabler-icons ──
    // Одна людина / профіль (Tabler user)
    user: `<svg ${A2}><path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/></svg>`,
    // Зірка (Tabler star)
    star: `<svg ${A2}><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245"/></svg>`,
    // Автобус (Tabler bus)
    bus: `<svg ${A2}><path d="M4 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8"/><path d="M16 5l1.5 7l4.5 0"/><path d="M2 10l15 0"/><path d="M7 5l0 5"/><path d="M12 5l0 5"/></svg>`,
    // Мегафон / оголошення (Tabler speakerphone)
    megaphone: `<svg ${A2}><path d="M18 8a3 3 0 0 1 0 6"/><path d="M10 8v11a1 1 0 0 1 -1 1h-1a1 1 0 0 1 -1 -1v-5"/><path d="M12 8l4.524 -3.77a.9 .9 0 0 1 1.476 .692v12.156a.9 .9 0 0 1 -1.476 .692l-4.524 -3.77h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h8"/></svg>`,
    // Лампочка / світло (Tabler bulb)
    bulb: `<svg ${A2}><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"/><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"/><path d="M9.7 17l4.6 0"/></svg>`,
    // Глобус / світ (Tabler world)
    globe: `<svg ${A2}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M11.5 3a17 17 0 0 0 0 18"/><path d="M12.5 3a17 17 0 0 1 0 18"/></svg>`,
    // Поділитись (Tabler share)
    share: `<svg ${A2}><path d="M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M8.7 10.7l6.6 -3.4"/><path d="M8.7 13.3l6.6 3.4"/></svg>`,
    // Дзвіночок / сповіщення (Tabler bell)
    bell: `<svg ${A2}><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></svg>`,
    // Закладка (Tabler bookmark)
    bookmark: `<svg ${A2}><path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4"/></svg>`,
    // Конверт / пошта (Tabler mail)
    mail: `<svg ${A2}><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10"/><path d="M3 7l9 6l9 -6"/></svg>`,
    // Газета / новини (Tabler news)
    newspaper: `<svg ${A2}><path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"/><path d="M8 8l4 0"/><path d="M8 12l4 0"/><path d="M8 16l4 0"/></svg>`,
    // Візок / купівля (Tabler shopping-cart)
    cart: `<svg ${A2}><path d="M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17h-11v-14h-2"/><path d="M6 5l14 1l-1 7h-13"/></svg>`,
    // Дім (Tabler home)
    home: `<svg ${A2}><path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/></svg>`,
    // Громада / поселення (Tabler building-community)
    community: `<svg ${A2}><path d="M8 9l5 5v7h-5v-4m0 4h-5v-7l5 -5m1 1v-6a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v17h-8"/><path d="M13 7l0 .01"/><path d="M17 7l0 .01"/><path d="M17 11l0 .01"/><path d="M17 15l0 .01"/></svg>`,
    // Цінник / тег (Tabler tag)
    tag: `<svg ${A2}><path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3"/></svg>`,
    // Посилання (Tabler link)
    link: `<svg ${A2}><path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/></svg>`,
    // Скріпка / вкладення (Tabler paperclip)
    paperclip: `<svg ${A2}><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5"/></svg>`,
    // Знак питання / допомога (Tabler help)
    help: `<svg ${A2}><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 17l0 .01"/><path d="M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4"/></svg>`,
    // Instagram (Tabler brand-instagram) — соцмережі Olyka Castle у футері сайдбару
    brandInstagram: `<svg ${A2}><path d="M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M16.5 7.5v.01"/></svg>`,
    // Facebook (Tabler brand-facebook)
    brandFacebook: `<svg ${A2}><path d="M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3"/></svg>`
  };

  // src/tabs/community-modal.js
  var PENCIL_ICON_SVG = ICONS.pencil;
  var PIN_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  function renderPreviewLoc(loc) {
    if (!loc)
      return "";
    const label = loc === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : loc;
    return `<span class="cm-board-loc">${PIN_ICON_SVG}${escapeHtml(label)}</span>`;
  }
  function maskUaPhone(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("380"))
      d = d.slice(3);
    else if ("380".startsWith(d))
      d = "";
    else if (d.startsWith("0"))
      d = d.slice(1);
    d = d.slice(0, 9);
    let out = "+380";
    if (d.length)
      out += " " + d.slice(0, 2);
    if (d.length > 2)
      out += " " + d.slice(2, 5);
    if (d.length > 5)
      out += " " + d.slice(5, 7);
    if (d.length > 7)
      out += " " + d.slice(7, 9);
    return out;
  }
  function phoneDigits(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("380"))
      d = d.slice(3);
    else if ("380".startsWith(d))
      d = "";
    else if (d.startsWith("0"))
      d = d.slice(1);
    return Math.min(d.length, 9);
  }
  function firstNameOnly(full) {
    const w = String(full || "").trim().split(/\s+/)[0] || "";
    return w === "\u0416\u0438\u0442\u0435\u043B\u044C" ? "" : w;
  }
  function accountAuthorName() {
    return firstNameOnly(currentUserName()) || "\u0416\u0438\u0442\u0435\u043B\u044C";
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
  function openBoardModal(opts = {}) {
    if (document.querySelector(".app-modal--board-compose"))
      return;
    const editPost = opts.editPost || null;
    const isEdit = !!editPost;
    const submitLabel = isEdit ? "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0437\u043C\u0456\u043D\u0438" : "\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438";
    const state = {
      text: isEdit ? editPost.text || "" : "",
      photos: isEdit && Array.isArray(editPost.photos) ? editPost.photos.filter(Boolean) : [],
      uploadingCount: 0,
      // скільки фото зараз заливаються у Storage — блокує submit
      author: isEdit ? editPost.author || accountAuthorName() : accountAuthorName(),
      category: isEdit ? editPost.category || "" : "",
      // Д-23: без автовибору для нового
      contact: isEdit && editPost.contact ? maskUaPhone(editPost.contact) : "+380",
      // Д-24
      title: isEdit ? editPost.title || "" : "",
      location: isEdit ? editPost.location || COMMUNITY_ALL : COMMUNITY_ALL
      // Д-10
    };
    const bodyHtml = `
    <div class="cm-board-modal-head">
      <h3 class="cm-board-modal-title"><span class="cm-board-title-ic">${PENCIL_ICON_SVG}</span>${isEdit ? "\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F" : "\u041D\u043E\u0432\u0435 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F"}</h3>
      <p class="cm-board-modal-sub">${isEdit ? "\u0417\u043C\u0456\u043D\u0456\u0442\u044C \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u0456 \u043F\u043E\u043B\u044F." : "\u0417\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u043F\u043E\u043B\u044F \u043D\u0438\u0436\u0447\u0435."}</p>
    </div>

    <form id="cm-board-modal-form" novalidate>
      <!-- \u0414\u0438\u043D\u0430\u043C\u0456\u0447\u043D\u0430 \u0447\u0430\u0441\u0442\u0438\u043D\u0430 -->
      <div id="bm-dynamic"></div>

      <!-- LIVE-preview -->
      <div class="bm-preview-section" id="bm-preview-section">
        <div class="bm-preview-label">\u042F\u043A \u0432\u0438\u0433\u043B\u044F\u0434\u0430\u0442\u0438\u043C\u0435 \u043D\u0430 \u0434\u043E\u0448\u0446\u0456</div>
        <div class="bm-preview-canvas" id="bm-preview-canvas"></div>
      </div>

      <button class="cm-board-submit" type="submit">${submitLabel}</button>
      <p class="cm-board-hint">${isEdit ? "\u0417\u043C\u0456\u043D\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0443\u0442\u044C\u0441\u044F. \u042F\u043A\u0449\u043E \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0449\u0435 \u043D\u0435 \u0430\u0432\u0442\u043E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0454\u0442\u044C\u0441\u044F \u2014 \u043F\u0456\u0434\u0435 \u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0443 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0443." : "\u0417\u0430\u043F\u0438\u0442 \u0439\u0434\u0435 \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443. \u041F\u0456\u0441\u043B\u044F \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0438 \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043D\u0430 \u0434\u043E\u0448\u0446\u0456."}</p>
    </form>
  `;
    const { close, el: wrap } = openModal({
      bodyHtml,
      variant: "sheet",
      className: "app-modal--board-compose",
      onClose: () => state.photos.forEach((p) => {
        if (p && p.startsWith("blob:"))
          URL.revokeObjectURL(p);
      })
    });
    const sheetEl = wrap.querySelector(".app-modal-sheet");
    if (sheetEl) {
      const syncScrolled = () => sheetEl.classList.toggle("is-scrolled", sheetEl.scrollTop > 2);
      sheetEl.addEventListener("scroll", syncScrolled, { passive: true });
      syncScrolled();
    }
    const dynamicEl = wrap.querySelector("#bm-dynamic");
    function renderBoardFields() {
      dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label">\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F <span class="bm-label-req">*</span></label>
        <div class="bm-chips" id="bm-chips">
          ${BOARD_CATEGORIES.map((c) => `
            <button type="button" class="bm-chip${c.id === state.category ? " active" : ""}" data-cat="${c.id}">
              <span class="bm-chip-emoji cat-c-${c.color}">${c.icon}</span>
              <span class="bm-chip-label">${escapeHtml(c.label)}</span>
            </button>
          `).join("")}
        </div>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-title">\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A <span class="bm-label-req">*</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-title" type="text" maxlength="80" required placeholder="\u041D\u0430\u043F\u0440. \u041F\u0440\u043E\u0434\u0430\u043C \u043C\u043E\u0442\u043E\u0446\u0438\u043A\u043B" value="${escapeHtml(state.title)}">
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-location">\u041B\u043E\u043A\u0430\u0446\u0456\u044F</label>
        <select class="cm-board-input cm-board-input--small" id="bm-location">
          <option value="${escapeHtml(COMMUNITY_ALL)}"${state.location === COMMUNITY_ALL ? " selected" : ""}>${escapeHtml(COMMUNITY_ALL_LABEL)}</option>
          ${SETTLEMENTS.map((s) => `<option value="${escapeHtml(s)}"${state.location === s ? " selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-text">\u041E\u043F\u0438\u0441</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="\u0429\u043E \u0445\u043E\u0447\u0435\u0442\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u0438\u0442\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0456?" required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label">\u0424\u043E\u0442\u043E <span class="bm-label-hint">(\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E, \u0434\u043E 5)</span></label>
        ${photoSlotsHtml()}
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-contact">\u0422\u0435\u043B\u0435\u0444\u043E\u043D <span class="bm-label-hint">(\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-contact" type="tel" size="18" placeholder="+380 XX XXX XX XX" inputmode="tel" value="${escapeHtml(state.contact)}">
      </div>

      <div class="bm-section">
        <label class="bm-label">\u0406\u043C'\u044F</label>
        <div class="bm-author-fixed" id="bm-author-fixed">\u{1F464} ${escapeHtml(state.author)}</div>
      </div>
    `;
      dynamicEl.querySelectorAll(".bm-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          dynamicEl.querySelectorAll(".bm-chip").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          state.category = btn.dataset.cat;
          renderPreview();
        });
      });
      dynamicEl.querySelector("#bm-title")?.addEventListener("input", (e) => {
        state.title = e.target.value;
        renderPreview();
      });
      dynamicEl.querySelector("#bm-location")?.addEventListener("change", (e) => {
        state.location = e.target.value;
        renderPreview();
      });
      dynamicEl.querySelector("#bm-text")?.addEventListener("input", (e) => {
        state.text = e.target.value;
        renderPreview();
      });
      dynamicEl.querySelector("#bm-contact")?.addEventListener("input", (e) => {
        e.target.value = maskUaPhone(e.target.value);
        state.contact = e.target.value;
        renderPreview();
      });
      bindPhotoSlots();
    }
    function photoSlotsHtml(count = 5) {
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
        btn.textContent = submitLabel;
      }
    }
    const previewCanvas = wrap.querySelector("#bm-preview-canvas");
    function renderPreview() {
      const cat = state.category ? BOARD_CATEGORIES.find((c) => c.id === state.category) : null;
      const catHtml = cat ? `<span class="cm-board-cat cm-board-cat--${cat.color}">${cat.icon} ${escapeHtml(catShort(state.category))}</span>` : `<span class="cm-board-cat cm-board-cat--placeholder">\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F</span>`;
      const firstPhoto = state.photos.find((p) => p);
      const contactShow = phoneDigits(state.contact) === 9 ? maskUaPhone(state.contact) : "";
      const contactHtml = contactShow ? `
      <div class="cm-board-contact cm-board-contact--phone">
        ${escapeHtml(contactShow)}
      </div>` : "";
      previewCanvas.innerHTML = `
      <article class="cm-board-note bd-card bd-card--board${firstPhoto ? " cm-board-note--has-photo" : ""}" style="--tilt:0deg">
        <span class="cm-board-pin"></span>
        ${firstPhoto ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${firstPhoto}" alt=""></div>` : ""}
        ${catHtml}
        ${renderPreviewLoc(state.location)}
        <h3 class="cm-board-title">${state.title.trim() ? escapeHtml(state.title.trim()) : "\u0417\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F"}</h3>
        <p class="cm-board-text">${escapeHtml(state.text.trim() || "\u0422\u0435\u043A\u0441\u0442 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u0442\u0443\u0442\u2026")}</p>
        <div class="cm-board-footer">
          <span class="cm-board-author">\u2014 ${escapeHtml(state.author.trim() || "\u0416\u0438\u0442\u0435\u043B\u044C")}</span>
          <span class="cm-board-time">\u0449\u043E\u0439\u043D\u043E</span>
        </div>
        ${contactHtml}
      </article>
    `;
    }
    renderBoardFields();
    renderPreview();
    setTimeout(() => wrap.querySelector("#bm-text")?.focus(), 200);
    if (isLoggedIn() && !isEdit) {
      getProfile().then((p) => {
        if (p && p.phone && phoneDigits(state.contact) === 0) {
          state.contact = maskUaPhone(p.phone);
          const cEl = dynamicEl.querySelector("#bm-contact");
          if (cEl)
            cEl.value = state.contact;
        }
        const nm = firstNameOnly(p && p.name || currentUserName()) || "\u0416\u0438\u0442\u0435\u043B\u044C";
        if (nm !== state.author) {
          state.author = nm;
          const el = dynamicEl.querySelector("#bm-author-fixed");
          if (el)
            el.textContent = `\u{1F464} ${nm}`;
        }
        renderPreview();
      }).catch(() => {
      });
    }
    wrap.querySelector("#cm-board-modal-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.category) {
        showToast("\u041E\u0431\u0435\u0440\u0456\u0442\u044C \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044E \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", 2500);
        wrap.querySelector("#bm-chips")?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (!state.title.trim()) {
        showToast("\u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", 2500);
        wrap.querySelector("#bm-title")?.focus();
        return;
      }
      if (!state.text.trim()) {
        showToast("\u0411\u0443\u0434\u044C \u043B\u0430\u0441\u043A\u0430, \u0437\u0430\u043F\u043E\u0432\u043D\u0456\u0442\u044C \u0442\u0435\u043A\u0441\u0442", 2500);
        wrap.querySelector("#bm-text")?.focus();
        return;
      }
      const pd = phoneDigits(state.contact);
      if (pd > 0 && pd < 9) {
        showToast("\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043F\u043E\u0432\u043D\u0438\u0439 \u043D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443 \u0430\u0431\u043E \u0437\u0430\u043B\u0438\u0448\u0442\u0435 \u043F\u043E\u0440\u043E\u0436\u043D\u0456\u043C", 3e3);
        wrap.querySelector("#bm-contact")?.focus();
        return;
      }
      if (containsProfanity(state.text) || containsProfanity(state.contact)) {
        showToast("\u{1F6AB} \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u0431\u043E\u0440\u043E\u043D\u0435\u043D\u0456 \u0441\u043B\u043E\u0432\u0430 \u0456 \u043D\u0435 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u0435", 4500, "error");
        wrap.querySelector("#bm-text")?.focus();
        return;
      }
      if (state.uploadingCount > 0 || state.photos.some((p) => p && p.startsWith("blob:"))) {
        showToast("\u0417\u0430\u0447\u0435\u043A\u0430\u0439, \u0444\u043E\u0442\u043E \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0443\u0454\u0442\u044C\u0441\u044F\u2026", 2500);
        return;
      }
      const submitBtn = wrap.querySelector(".cm-board-submit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = isEdit ? "\u0417\u0431\u0435\u0440\u0456\u0433\u0430\u0454\u043C\u043E\u2026" : "\u041D\u0430\u0434\u0441\u0438\u043B\u0430\u0454\u043C\u043E\u2026";
      }
      const payload = buildPayload(state);
      if (isEdit) {
        if (!isSupabaseReady()) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
          }
          showToast("\u041D\u0435\u043C\u0430\u0454 \u0437\u02BC\u0454\u0434\u043D\u0430\u043D\u043D\u044F \u2014 \u0441\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u0456\u0437\u043D\u0456\u0448\u0435", 4e3);
          return;
        }
        const result = await updateBoardPost(editPost.id, payload);
        if (!result.ok) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
          }
          showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (result.error || "\u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438"), 4500);
          return;
        }
        close();
        Object.assign(editPost, {
          text: payload.text,
          title: payload.title,
          category: payload.category,
          color: payload.color,
          contact: payload.contact,
          location: payload.location,
          photos: payload.photos,
          status: result.status
        });
        window.dispatchEvent(new CustomEvent("cstl-post-updated", { detail: { post: editPost } }));
        window.dispatchEvent(new Event("cstl-posts-changed"));
        showToast(result.status === "pending" ? "\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u2713 \u0417\u043C\u0456\u043D\u0438 \u043D\u0430 \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u0456\u0439 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0446\u0456." : "\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u2713", 3500);
        return;
      }
      let published = false;
      if (isSupabaseReady()) {
        const result = await submitPost(payload);
        if (!result.ok) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitLabel;
          }
          showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (result.error || "\u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438"), 4500);
          return;
        }
        published = result.status === "published";
      } else {
        console.info("[submit] Supabase \u043D\u0435 \u0433\u043E\u0442\u043E\u0432\u0438\u0439 \u2014 payload \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u043B\u0438\u0448\u0435 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E:", payload);
      }
      close();
      if (published) {
        window.dispatchEvent(new Event("cstl-posts-changed"));
        showToast("\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u043E\u0432\u0430\u043D\u043E \u2713 \u0412\u0438 \u0434\u043E\u0432\u0456\u0440\u0435\u043D\u0438\u0439 \u0430\u0432\u0442\u043E\u0440.", 4e3);
      } else {
        showToast("\u0414\u044F\u043A\u0443\u0454\u043C\u043E! \u0417\u0430\u043F\u0438\u0442 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E \u043C\u043E\u0434\u0435\u0440\u0430\u0442\u043E\u0440\u0443.", 4e3);
      }
    });
  }
  function buildPayload(state) {
    const cat = BOARD_CATEGORIES.find((c) => c.id === state.category) || BOARD_CATEGORIES[0];
    return {
      type: "board",
      text: state.text.trim(),
      author: state.author.trim() || "\u0416\u0438\u0442\u0435\u043B\u044C",
      photos: state.photos.filter(Boolean),
      category: state.category,
      color: cat.color,
      contact: phoneDigits(state.contact) === 9 ? maskUaPhone(state.contact) : null,
      // Д-24: лише повний номер
      title: state.title.trim(),
      // обов'язковий (Д-16); сервер теж перевіряє
      location: state.location || COMMUNITY_ALL,
      // Д-10
      tags: []
    };
  }

  // src/core/chat-core.js
  var ACT_ICONS = {
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>'
  };
  var _openScreens = [];
  function buildScreen(innerHtml, extraClass = "") {
    const backdrop = document.createElement("div");
    backdrop.className = "pm-backdrop";
    const screen = document.createElement("div");
    screen.className = "pm-screen " + extraClass;
    screen.innerHTML = innerHtml;
    const prevTop = _openScreens[_openScreens.length - 1];
    if (prevTop) {
      prevTop.screen.style.display = "none";
      prevTop.backdrop.style.display = "none";
    }
    document.body.appendChild(backdrop);
    document.body.appendChild(screen);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      backdrop.classList.add("visible");
      screen.classList.add("visible");
    });
    const api = { screen, backdrop, _cleanup: [] };
    const close = () => closeScreen(api);
    backdrop.addEventListener("click", close);
    screen.querySelector("[data-pm-back]")?.addEventListener("click", close);
    api.close = close;
    setupEdgeBack(api);
    _openScreens.push(api);
    return api;
  }
  function setupEdgeBack(api) {
    const screen = api.screen;
    let sx = 0, sy = 0, dragging = false, lock = null, below = null;
    const winW = () => window.innerWidth || screen.clientWidth || 360;
    const findBelow = () => {
      const i = _openScreens.indexOf(api);
      return i > 0 ? _openScreens[i - 1] : null;
    };
    const showBelow = () => {
      if (below)
        below.screen.style.display = "";
    };
    const hideBelow = () => {
      if (below)
        below.screen.style.display = "none";
    };
    screen.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      if (t.clientX > 24) {
        dragging = false;
        return;
      }
      sx = t.clientX;
      sy = t.clientY;
      dragging = true;
      lock = null;
      below = findBelow();
    }, { passive: true });
    screen.addEventListener("touchmove", (e) => {
      if (!dragging)
        return;
      const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (!lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        lock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (lock === "h")
          showBelow();
      }
      if (lock === "v") {
        dragging = false;
        screen.style.transition = "";
        screen.style.transform = "";
        hideBelow();
        return;
      }
      if (lock === "h" && dx > 0) {
        e.preventDefault();
        screen.style.transition = "none";
        screen.style.transform = `translateX(-50%) translateX(${dx}px)`;
      }
    }, { passive: false });
    screen.addEventListener("touchend", (e) => {
      if (!dragging)
        return;
      dragging = false;
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sx) - sx;
      screen.style.transition = "";
      if (lock === "h" && dx > winW() * 0.33) {
        screen.style.transform = `translateX(-50%) translateX(${winW()}px)`;
        setTimeout(() => api.close(), 180);
      } else {
        screen.style.transform = "";
        hideBelow();
      }
    }, { passive: false });
  }
  function closeScreen(api) {
    if (!api || api._closed)
      return;
    api._closed = true;
    api._cleanup.forEach((fn) => {
      try {
        fn();
      } catch (_) {
      }
    });
    api.screen.classList.remove("visible");
    api.backdrop.classList.remove("visible");
    _openScreens = _openScreens.filter((s) => s !== api);
    const newTop = _openScreens[_openScreens.length - 1];
    if (newTop) {
      newTop.screen.style.display = "";
      newTop.backdrop.style.display = "";
    }
    if (!_openScreens.length)
      document.body.classList.remove("modal-open");
    setTimeout(() => {
      api.screen.remove();
      api.backdrop.remove();
    }, 240);
  }
  function avatar(name, uid) {
    return avatarCircle({ name, url: cachedAvatar(uid), uid: uid || "", cls: "pm-avatar" });
  }
  function clockTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime()))
      return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  var MONTHS_GEN = [
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
  function dayLabel(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime()))
      return "";
    const now = /* @__PURE__ */ new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 864e5;
    if (d.getTime() >= startOfToday)
      return "\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456";
    if (d.getTime() >= startOfToday - dayMs)
      return "\u0412\u0447\u043E\u0440\u0430";
    const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
  }
  function threadListTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime()))
      return "";
    const now = /* @__PURE__ */ new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 864e5;
    if (d.getTime() >= startOfToday) {
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    if (d.getTime() >= startOfToday - dayMs)
      return "\u0412\u0447\u043E\u0440\u0430";
    if (d.getFullYear() === now.getFullYear())
      return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(-2)}`;
  }
  function setupKeyboardResize(screen) {
    const vv = window.visualViewport;
    const stream = screen.querySelector("#pm-stream");
    const scrollY = window.scrollY || 0;
    const prevBody = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow
    };
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    const unlock = () => {
      document.body.style.position = prevBody.position;
      document.body.style.top = prevBody.top;
      document.body.style.left = prevBody.left;
      document.body.style.right = prevBody.right;
      document.body.style.width = prevBody.width;
      document.body.style.overflow = prevBody.overflow;
      window.scrollTo(0, scrollY);
    };
    if (!vv)
      return unlock;
    const input = screen.querySelector(".pm-input");
    let wasOpen = false, focused = false;
    const apply = () => {
      const atBottom = stream ? stream.scrollHeight - stream.scrollTop - stream.clientHeight < 60 : false;
      const open = focused && document.documentElement.clientHeight - vv.height > 80;
      if (open) {
        screen.style.height = vv.height + "px";
        screen.style.top = vv.offsetTop + "px";
      } else {
        screen.style.height = "";
        screen.style.top = "";
      }
      screen.classList.toggle("pm-kb-open", open);
      if (open && stream && (!wasOpen || atBottom)) {
        requestAnimationFrame(() => {
          stream.scrollTop = stream.scrollHeight;
        });
      }
      wasOpen = open;
    };
    const onFocus = () => {
      focused = true;
      requestAnimationFrame(apply);
    };
    const onBlur = () => {
      focused = false;
      requestAnimationFrame(apply);
    };
    input?.addEventListener("focus", onFocus);
    input?.addEventListener("blur", onBlur);
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      input?.removeEventListener("focus", onFocus);
      input?.removeEventListener("blur", onBlur);
      screen.style.height = "";
      screen.style.top = "";
      screen.classList.remove("pm-kb-open");
      unlock();
    };
  }
  var SWIPE_TRIGGER = 45;
  function setupBubbleGestures(container, onAction) {
    let startX = 0, startY = 0, target = null, lpTimer = null, longFired = false, lockDir = null;
    const clearLP = () => {
      if (lpTimer) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
    };
    const resetTransform = (b) => {
      b.style.transition = "transform 0.18s ease";
      b.style.transform = "";
      setTimeout(() => {
        b.style.transition = "";
      }, 200);
    };
    const host = container.parentElement || container;
    const reveal = document.createElement("div");
    reveal.className = "pm-reply-reveal";
    reveal.innerHTML = ACT_ICONS.reply;
    host.appendChild(reveal);
    const placeReveal = (b) => {
      const hr = host.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      reveal.style.top = br.top - hr.top + br.height / 2 + "px";
    };
    const setReveal = (prog) => {
      reveal.style.opacity = String(prog);
      reveal.style.transform = `translateY(-50%) translateX(${(1 - prog) * 22}px) scale(${0.55 + 0.45 * prog})`;
    };
    const hideReveal = () => {
      reveal.style.opacity = "0";
    };
    container.addEventListener("touchstart", (e) => {
      const b = e.target.closest(".pm-bubble");
      if (!b || b.classList.contains("pm-bubble--deleted")) {
        target = null;
        return;
      }
      target = b;
      longFired = false;
      lockDir = null;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      placeReveal(b);
      setReveal(0);
      clearLP();
      lpTimer = setTimeout(() => {
        longFired = true;
        if (navigator.vibrate) {
          try {
            navigator.vibrate(10);
          } catch (_) {
          }
        }
        onAction(target.dataset.msg, "menu");
      }, 500);
    }, { passive: true });
    container.addEventListener("touchmove", (e) => {
      if (!target)
        return;
      const t = e.touches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (!lockDir && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        lockDir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        clearLP();
      }
      if (lockDir === "h") {
        e.preventDefault();
        const d = Math.max(Math.min(dx, 0), -64);
        target.style.transform = `translateX(${d}px)`;
        setReveal(Math.min(1, Math.abs(d) / SWIPE_TRIGGER));
      }
    }, { passive: false });
    container.addEventListener("touchend", (e) => {
      clearLP();
      if (!target)
        return;
      const b = target;
      target = null;
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : startX) - startX;
      resetTransform(b);
      hideReveal();
      if (!longFired && lockDir === "h" && dx < -SWIPE_TRIGGER)
        onAction(b.dataset.msg, "reply");
    }, { passive: false });
    container.addEventListener("contextmenu", (e) => {
      const b = e.target.closest(".pm-bubble");
      if (b && !b.classList.contains("pm-bubble--deleted")) {
        e.preventDefault();
        onAction(b.dataset.msg, "menu");
      }
    });
  }

  // src/core/push.js
  var VAPID_PUBLIC_KEY = "BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o";
  function urlBase64ToUint8Array(b64) {
    const pad2 = "=".repeat((4 - b64.length % 4) % 4);
    const base = (b64 + pad2).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }
  function isPushCapable() {
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
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
  async function ensurePushSubscription() {
    if (!isPushCapable())
      return null;
    try {
      let perm = Notification.permission;
      if (perm === "denied")
        return null;
      if (perm === "default")
        perm = await Notification.requestPermission();
      if (perm !== "granted")
        return null;
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
      return sub;
    } catch (e) {
      console.warn("[push] ensurePushSubscription:", e && e.message);
      return null;
    }
  }

  // src/tabs/board-chat.js
  var BUMP_COOLDOWN_MS = 3 * 60 * 60 * 1e3;
  var EDIT_ICON_SVG = ICONS.pencil;
  var BOOKMARK_FILLED_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var BOOKMARK_OUTLINE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  function otherName(thread) {
    const me = currentUserId();
    if (me && me === thread.author_uid)
      return thread.buyer_name || "\u041F\u043E\u043A\u0443\u043F\u0435\u0446\u044C";
    return thread.author_name || "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446\u044C";
  }
  function otherUid(thread) {
    const me = currentUserId();
    return me && me === thread.author_uid ? thread.buyer_uid || "" : thread.author_uid || "";
  }
  function threadPostTitle(thread) {
    const p = thread.post || {};
    return p.title || (p.text ? p.text.slice(0, 60) : "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F");
  }
  var _chatUnsub = null;
  async function openChat(thread, post) {
    if (!isLoggedIn()) {
      requireAuth("\u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0447\u0430\u0442", () => {
      });
      return;
    }
    ensureChatPush();
    const me = currentUserId();
    const p = post || thread.post || {};
    const title = p.title || (p.text ? p.text.slice(0, 60) : "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F");
    const partner = otherName(thread);
    const thumb = p.photos && p.photos[0] || "";
    const adAuthor = p.author ? String(p.author).trim() : "";
    const adContact = p.contact ? String(p.contact).trim() : "";
    const adIsPhone = adContact && /^[\+\d][\d\s\-()]{5,}$/.test(adContact);
    const adTel = adIsPhone ? adContact.replace(/[^\d+]/g, "") : "";
    const api = buildScreen(`
    <header class="pm-head pm-head--chat">
      <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
      ${avatar(partner, otherUid(thread))}
      <div class="pm-head-titles" data-av-uid="${escapeHtml(otherUid(thread))}" role="button">
        <div class="pm-head-name"${nameUid(otherUid(thread))}>${escapeHtml(partner)}</div>
      </div>
    </header>
    <div class="pm-ctx" data-pm-ctx role="button" aria-label="\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F">
      ${thumb ? `<span class="pm-ctx-thumb" style="background-image:url('${escapeHtml(thumb)}')"></span>` : `<span class="pm-ctx-thumb pm-ctx-thumb--none">\u{1F3F7}\uFE0F</span>`}
      <span class="pm-ctx-body">
        <span class="pm-ctx-title">${escapeHtml(title)}</span>
        ${p.location && p.location !== COMMUNITY_ALL ? `<span class="pm-ctx-loc">\u{1F4CD} ${escapeHtml(p.location)}</span>` : ""}
        ${adAuthor || adContact ? `<span class="pm-ctx-contact">${adContact ? `<span class="pm-ctx-phone">${escapeHtml(adContact)}</span>` : ""}${adAuthor ? `${adContact ? " \u2014 " : ""}${escapeHtml(adAuthor)}` : ""}</span>` : ""}
        <span class="pm-ctx-link">\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u2192</span>
      </span>
      ${adTel ? `<a class="pm-ctx-call" href="tel:${escapeHtml(adTel)}" aria-label="\u041F\u043E\u0434\u0437\u0432\u043E\u043D\u0438\u0442\u0438"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/></svg></a>` : ""}
    </div>
    <div class="pm-stream" id="pm-stream">
      <div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </div>
    <button class="pm-scrolldown" id="pm-scrolldown" type="button" aria-label="\u0414\u043E \u043E\u0441\u0442\u0430\u043D\u043D\u044C\u043E\u0433\u043E \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="pm-composebar" id="pm-composebar" hidden>
      <span class="pm-composebar-ic" id="pm-composebar-ic">${ACT_ICONS.reply}</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="pm-composebar-title"></span>
        <span class="pm-composebar-text" id="pm-composebar-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="pm-composebar-x" aria-label="\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438">\u2715</button>
    </div>
    <form class="pm-form" id="pm-form">
      <button class="pm-attach" type="button" id="pm-attach" aria-label="\u0414\u043E\u0434\u0430\u0442\u0438 \u0444\u043E\u0442\u043E"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg></button>
      <input class="pm-file" id="pm-file" type="file" accept="image/*" hidden>
      <input class="pm-input" id="pm-input" type="text" placeholder="\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F\u2026"
             aria-label="\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F" autocomplete="off">
      <button class="pm-send" type="submit" aria-label="\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438">\u2191</button>
    </form>
  `, "pm-screen--chat");
    const streamEl = api.screen.querySelector("#pm-stream");
    const form = api.screen.querySelector("#pm-form");
    const input = api.screen.querySelector("#pm-input");
    const fileEl = api.screen.querySelector("#pm-file");
    const barEl = api.screen.querySelector("#pm-composebar");
    hydrateAvatars(api.screen);
    hydrateNames(api.screen);
    let messages = [];
    let msgById = /* @__PURE__ */ new Map();
    let replyTo = null;
    let editing = null;
    const clearCompose = () => {
      replyTo = null;
      editing = null;
      barEl.hidden = true;
      input.placeholder = "\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F\u2026";
    };
    const showCompose = (mode, m) => {
      const snippet = (m.deleted_at ? "\u0412\u0438\u0434\u0430\u043B\u0435\u043D\u0435" : m.text || "\u{1F4F7} \u0424\u043E\u0442\u043E").slice(0, 90);
      api.screen.querySelector("#pm-composebar-ic").innerHTML = mode === "edit" ? ACT_ICONS.edit : ACT_ICONS.reply;
      api.screen.querySelector("#pm-composebar-title").textContent = mode === "edit" ? "\u0420\u0415\u0414\u0410\u0413\u0423\u0412\u0410\u041D\u041D\u042F:" : "\u0412\u0406\u0414\u041F\u041E\u0412\u0406\u0414\u042C:";
      api.screen.querySelector("#pm-composebar-text").textContent = snippet;
      barEl.hidden = false;
    };
    const startReply = (m) => {
      editing = null;
      replyTo = m;
      showCompose("reply", m);
      input.focus();
    };
    const startEdit = (m) => {
      replyTo = null;
      editing = m;
      showCompose("edit", m);
      input.value = m.text || "";
      input.focus();
    };
    const openPhoto = openPhotoLightbox;
    const renderBubble = (m) => {
      const enter = seen.has(msgKey(m)) ? "" : " pm-bubble--enter";
      const tagAttr = ` data-tag="${m.client_tag || ""}"`;
      if (m.deleted_at) {
        return `<div class="pm-bubble pm-bubble--deleted${enter}" data-msg="${m.id}"${tagAttr}><span class="pm-bubble-text">${ICONS.trash} \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E</span></div>`;
      }
      const reply = m.reply_to_id ? msgById.get(m.reply_to_id) : null;
      const replyHtml = reply ? `<span class="pm-quote" data-jump="${reply.id}">${escapeHtml((reply.deleted_at ? "\u0412\u0438\u0434\u0430\u043B\u0435\u043D\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F" : reply.text || "\u{1F4F7} \u0424\u043E\u0442\u043E").slice(0, 90))}</span>` : "";
      const photoHtml = m.photo_url ? `<img class="pm-bubble-photo" src="${escapeHtml(m.photo_url)}" alt="\u0444\u043E\u0442\u043E" data-photo="${escapeHtml(m.photo_url)}">` : "";
      const textHtml = m.text ? `<span class="pm-bubble-text">${escapeHtml(m.text)}</span>` : "";
      const edited = m.edited_at ? '<span class="pm-bubble-edited">\u0437\u043C\u0456\u043D\u0435\u043D\u043E</span> ' : "";
      const photoCls = m.photo_url ? " pm-bubble--photo" : "";
      return `<div class="pm-bubble${photoCls}${enter}" data-msg="${m.id}"${tagAttr}>${replyHtml}${photoHtml}${textHtml}<span class="pm-bubble-time">${edited}${clockTime(postTime(m))}</span></div>`;
    };
    const renderGroup = (g) => `<div class="pm-group ${g.mine ? "pm-group--mine" : "pm-group--other"}">${g.msgs.map(renderBubble).join("")}</div>`;
    let streamLastDay = null;
    const renderStream = () => {
      const stick = atBottom();
      const prevH = streamEl.scrollHeight;
      if (!messages.length) {
        streamEl.innerHTML = `
        <div class="pm-empty pm-empty--chat">
          <span class="pm-empty-ic">\u{1F4AC}</span>
          <div class="pm-empty-sub">\u041F\u043E\u0441\u0442\u0430\u0432\u0442\u0435 \u043F\u0438\u0442\u0430\u043D\u043D\u044F \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u044E \u0430\u0431\u043E \u0443\u0442\u043E\u0447\u043D\u0456\u0442\u044C \u0434\u0435\u0442\u0430\u043B\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F.</div>
          <div class="pm-quick">
            <button class="pm-quick-chip" type="button" data-quick="\u042F\u043A\u0430 \u0446\u0456\u043D\u0430?">\u042F\u043A\u0430 \u0446\u0456\u043D\u0430?</button>
            <button class="pm-quick-chip" type="button" data-quick="\u0427\u0438 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E?">\u0427\u0438 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E?</button>
            <button class="pm-quick-chip" type="button" data-quick="\u0414\u0435 \u0437\u043D\u0430\u0445\u043E\u0434\u0438\u0442\u044C\u0441\u044F?">\u0414\u0435 \u0437\u043D\u0430\u0445\u043E\u0434\u0438\u0442\u044C\u0441\u044F?</button>
            <button class="pm-quick-chip" type="button" data-quick="\u041C\u043E\u0436\u043D\u0430 \u0444\u043E\u0442\u043E?">\u041C\u043E\u0436\u043D\u0430 \u0444\u043E\u0442\u043E?</button>
          </div>
        </div>`;
        return;
      }
      msgById = new Map(messages.map((m) => [m.id, m]));
      let html = "";
      let lastDay = null;
      let curGroup = null;
      const flush = () => {
        if (curGroup) {
          html += renderGroup(curGroup);
          curGroup = null;
        }
      };
      messages.forEach((m) => {
        const ts = postTime(m);
        const day = new Date(ts).toDateString();
        if (day !== lastDay) {
          flush();
          html += `<div class="pm-daysep"><span>${dayLabel(ts)}</span></div>`;
          lastDay = day;
        }
        const mine = m.sender_uid === me;
        if (curGroup && curGroup.mine === mine)
          curGroup.msgs.push(m);
        else {
          flush();
          curGroup = { mine, msgs: [m] };
        }
      });
      flush();
      streamLastDay = new Date(postTime(messages[messages.length - 1])).toDateString();
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
        html += `<div class="pm-receipt">${lastMsg.read_at ? "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E" : "\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E"}</div>`;
      }
      streamEl.innerHTML = html;
      if (stick) {
        if (firstRender) {
          streamEl.scrollTop = streamEl.scrollHeight;
        } else {
          streamEl.scrollTop = Math.max(0, prevH - streamEl.clientHeight);
          requestAnimationFrame(() => scrollBottom(true));
        }
        streamEl.querySelectorAll(".pm-bubble-photo").forEach((img) => {
          if (!img.complete)
            img.addEventListener("load", () => scrollBottom(!firstRender), { once: true });
        });
      }
      messages.forEach((m) => seen.add(msgKey(m)));
      firstRender = false;
    };
    const scrollBottom = (smooth) => streamEl.scrollTo({ top: streamEl.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    const atBottom = () => streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 120;
    const scrollDownBtn = api.screen.querySelector("#pm-scrolldown");
    const updateScrollBtn = () => scrollDownBtn?.classList.toggle("visible", !atBottom());
    streamEl.addEventListener("scroll", updateScrollBtn, { passive: true });
    scrollDownBtn?.addEventListener("click", () => scrollBottom(true));
    const addReceiptIfNeeded = () => {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
        streamEl.insertAdjacentHTML(
          "beforeend",
          `<div class="pm-receipt">${lastMsg.read_at ? "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E" : "\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E"}</div>`
        );
      }
    };
    const appendOne = (m) => {
      if (streamEl.querySelector(".pm-empty")) {
        renderStream();
        return;
      }
      const stick = atBottom();
      msgById.set(m.id, m);
      streamEl.querySelector(".pm-receipt")?.remove();
      const day = new Date(postTime(m)).toDateString();
      const newDay = day !== streamLastDay;
      if (newDay) {
        streamEl.insertAdjacentHTML("beforeend", `<div class="pm-daysep"><span>${dayLabel(postTime(m))}</span></div>`);
        streamLastDay = day;
      }
      const mine = m.sender_uid === me;
      const lastEl = streamEl.lastElementChild;
      const lastGroup = !newDay && lastEl && lastEl.classList.contains("pm-group") ? lastEl : null;
      if (lastGroup && lastGroup.classList.contains(mine ? "pm-group--mine" : "pm-group--other")) {
        lastGroup.insertAdjacentHTML("beforeend", renderBubble(m));
      } else {
        streamEl.insertAdjacentHTML("beforeend", renderGroup({ mine, msgs: [m] }));
      }
      seen.add(msgKey(m));
      addReceiptIfNeeded();
      if (stick) {
        scrollBottom(true);
        const imgs = streamEl.querySelectorAll(".pm-bubble-photo");
        const last = imgs[imgs.length - 1];
        if (last && !last.complete)
          last.addEventListener("load", () => scrollBottom(true), { once: true });
      }
    };
    const replaceOne = (m) => {
      msgById.set(m.id, m);
      let el = streamEl.querySelector(`.pm-bubble[data-msg="${CSS.escape(String(m.id))}"]`);
      if (!el && m.client_tag)
        el = streamEl.querySelector(`.pm-bubble[data-tag="${CSS.escape(String(m.client_tag))}"]`);
      if (!el) {
        renderStream();
        return;
      }
      el.outerHTML = renderBubble(m);
      streamEl.querySelector(".pm-receipt")?.remove();
      addReceiptIfNeeded();
    };
    const jumpToMessage = (id) => {
      const el = streamEl.querySelector(`.pm-bubble[data-msg="${CSS.escape(String(id))}"]`);
      if (!el)
        return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("pm-bubble--flash");
      void el.offsetWidth;
      el.classList.add("pm-bubble--flash");
      setTimeout(() => el.classList.remove("pm-bubble--flash"), 1100);
    };
    const seen = /* @__PURE__ */ new Set();
    const msgKey = (m) => m.client_tag || m.id;
    let firstRender = true;
    const upsertMessage = (row) => {
      if (!row)
        return "none";
      let idx = messages.findIndex((m) => m.id === row.id);
      if (idx < 0 && row.client_tag)
        idx = messages.findIndex((m) => m.client_tag && m.client_tag === row.client_tag);
      if (idx >= 0) {
        const o = messages[idx];
        const same = o.id === row.id && o.text === row.text && o.photo_url === row.photo_url && o.deleted_at === row.deleted_at && o.edited_at === row.edited_at && o.read_at === row.read_at;
        messages[idx] = row;
        return same ? "same" : "update";
      }
      messages.push(row);
      return "add";
    };
    const newTag = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "t-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const submitText = async () => {
      const text = input.value.trim();
      if (editing) {
        if (!text)
          return;
        if (containsProfanity(text)) {
          showToast("\u{1F6AB} \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u0431\u043E\u0440\u043E\u043D\u0435\u043D\u0456 \u0441\u043B\u043E\u0432\u0430", 3500, "error");
          return;
        }
        const target = editing;
        input.value = "";
        clearCompose();
        const idx = messages.findIndex((m) => m.id === target.id);
        const prevMsg = idx >= 0 ? messages[idx] : null;
        if (idx >= 0) {
          messages[idx] = { ...messages[idx], text, edited_at: (/* @__PURE__ */ new Date()).toISOString() };
          replaceOne(messages[idx]);
        }
        const res = await editMessage(target.id, text);
        if (!res.ok) {
          const i = messages.findIndex((m) => m.id === target.id);
          if (i >= 0 && prevMsg) {
            messages[i] = prevMsg;
            replaceOne(prevMsg);
          }
          showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u043C\u0456\u043D\u0438\u0442\u0438: " + (res.error || ""), 4e3, "error");
          return;
        }
        if (idx >= 0 && res.message) {
          messages[idx] = res.message;
          replaceOne(res.message);
        }
        return;
      }
      sendText(text);
    };
    const sendText = async (raw) => {
      const text = (raw || "").trim();
      if (!text)
        return;
      if (containsProfanity(text)) {
        showToast("\u{1F6AB} \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u0431\u043E\u0440\u043E\u043D\u0435\u043D\u0456 \u0441\u043B\u043E\u0432\u0430", 3500, "error");
        return;
      }
      const replyId = replyTo ? replyTo.id : null;
      input.value = "";
      clearCompose();
      const tag = newTag();
      const temp = { id: "tmp-" + Date.now(), client_tag: tag, thread_id: thread.id, sender_uid: me, text, reply_to_id: replyId, created_at: (/* @__PURE__ */ new Date()).toISOString() };
      messages.push(temp);
      appendOne(temp);
      const res = await sendMessage({ threadId: thread.id, senderUid: me, text, replyToId: replyId, clientTag: tag });
      if (!res.ok) {
        messages = messages.filter((m) => m.client_tag !== tag);
        renderStream();
        showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438: " + (res.error || ""), 4e3, "error");
        input.value = text;
        return;
      }
      upsertMessage(res.message);
      replaceOne(res.message);
    };
    const sendPhoto = async (file) => {
      if (!file)
        return;
      const replyId = replyTo ? replyTo.id : null;
      clearCompose();
      const localUrl = URL.createObjectURL(file);
      const tag = newTag();
      const temp = { id: "tmp-" + Date.now(), client_tag: tag, thread_id: thread.id, sender_uid: me, text: null, photo_url: localUrl, reply_to_id: replyId, created_at: (/* @__PURE__ */ new Date()).toISOString() };
      messages.push(temp);
      appendOne(temp);
      const up = await uploadPhotoToStorage(file);
      if (!up.url) {
        messages = messages.filter((m) => m.client_tag !== tag);
        renderStream();
        showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 \u0444\u043E\u0442\u043E: " + (up.error || ""), 4e3, "error");
        return;
      }
      const res = await sendMessage({ threadId: thread.id, senderUid: me, photoUrl: up.url, replyToId: replyId, clientTag: tag });
      if (!res.ok) {
        URL.revokeObjectURL(localUrl);
        messages = messages.filter((m) => m.client_tag !== tag);
        renderStream();
        showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438 \u0444\u043E\u0442\u043E: " + (res.error || ""), 4e3, "error");
        return;
      }
      await new Promise((resolve) => {
        const pre = new Image();
        pre.onload = pre.onerror = resolve;
        pre.src = up.url;
      });
      if (api._closed)
        return;
      upsertMessage(res.message);
      replaceOne(res.message);
      URL.revokeObjectURL(localUrl);
    };
    const openMsgActions = (m) => {
      if (m.deleted_at)
        return;
      const mine = m.sender_uid === me;
      const sheet = document.createElement("div");
      sheet.className = "pm-actions-back";
      sheet.innerHTML = `
      <div class="pm-actions">
        <button type="button" data-act="reply"><span class="pm-act-ic">${ACT_ICONS.reply}</span>\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0441\u0442\u0438</button>
        ${m.text ? `<button type="button" data-act="copy"><span class="pm-act-ic">${ACT_ICONS.copy}</span>\u041A\u043E\u043F\u0456\u044E\u0432\u0430\u0442\u0438</button>` : ""}
        ${mine && m.text ? `<button type="button" data-act="edit"><span class="pm-act-ic">${ACT_ICONS.edit}</span>\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438</button>` : ""}
        ${mine ? `<button type="button" data-act="delete" class="pm-actions-danger"><span class="pm-act-ic">${ACT_ICONS.delete}</span>\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438</button>` : ""}
        <button type="button" data-act="cancel" class="pm-actions-cancel">\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438</button>
      </div>`;
      const close = () => sheet.remove();
      sheet.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-act]");
        if (!b) {
          if (e.target === sheet)
            close();
          return;
        }
        close();
        const act = b.dataset.act;
        if (act === "reply")
          startReply(m);
        else if (act === "copy") {
          try {
            await navigator.clipboard.writeText(m.text || "");
            showToast("\u0421\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E");
          } catch (_) {
          }
        } else if (act === "edit")
          startEdit(m);
        else if (act === "delete") {
          const idx = messages.findIndex((x) => x.id === m.id);
          const prevMsg = idx >= 0 ? messages[idx] : null;
          if (idx >= 0) {
            messages[idx] = { ...messages[idx], deleted_at: (/* @__PURE__ */ new Date()).toISOString(), text: null, photo_url: null };
            replaceOne(messages[idx]);
          }
          const res = await deleteMessage(m.id);
          if (!res.ok) {
            const i = messages.findIndex((x) => x.id === m.id);
            if (i >= 0 && prevMsg) {
              messages[i] = prevMsg;
              replaceOne(prevMsg);
            }
            showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438: " + (res.error || ""), 4e3, "error");
          }
        }
      });
      api.screen.appendChild(sheet);
    };
    const clearedAt = await fetchThreadClearedAt(me, thread.id);
    if (api._closed)
      return api;
    messages = await fetchMessages(thread.id, clearedAt);
    if (api._closed)
      return api;
    messages.forEach((m) => seen.add(msgKey(m)));
    renderStream();
    setTimeout(() => scrollBottom(false), 50);
    _readThreads.add(thread.id);
    markThreadRead(thread.id, me).finally(refreshUnreadBadge);
    if (_chatUnsub) {
      try {
        _chatUnsub();
      } catch (_) {
      }
    }
    const chatUnsub = subscribeThreadMessages(thread.id, ({ type, row }) => {
      if (!row)
        return;
      if (type === "INSERT") {
        const st = upsertMessage(row);
        if (st === "add")
          appendOne(row);
        else if (st === "update")
          replaceOne(row);
        if (row.sender_uid !== me) {
          _readThreads.add(thread.id);
          markThreadRead(thread.id, me).finally(refreshUnreadBadge);
        }
      } else if (type === "UPDATE") {
        const idx = messages.findIndex((m) => m.id === row.id);
        if (idx >= 0) {
          messages[idx] = row;
          replaceOne(row);
        }
      }
    });
    _chatUnsub = chatUnsub;
    api._cleanup.push(() => {
      try {
        chatUnsub();
      } catch (_) {
      }
      if (_chatUnsub === chatUnsub)
        _chatUnsub = null;
    });
    api._cleanup.push(refreshUnreadBadge);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitText();
    });
    api.screen.querySelector("#pm-composebar-x")?.addEventListener("click", () => {
      if (editing)
        input.value = "";
      clearCompose();
    });
    const attachBtn = api.screen.querySelector("#pm-attach");
    attachBtn?.addEventListener("pointerdown", (e) => e.preventDefault());
    attachBtn?.addEventListener("mousedown", (e) => e.preventDefault());
    attachBtn?.addEventListener("click", () => {
      input.focus();
      fileEl.click();
    });
    fileEl.addEventListener("change", () => {
      if (fileEl.files && fileEl.files[0])
        sendPhoto(fileEl.files[0]);
      fileEl.value = "";
    });
    streamEl.addEventListener("click", (e) => {
      const q = e.target.closest("[data-quick]");
      if (q) {
        sendText(q.dataset.quick);
        return;
      }
      const jump = e.target.closest("[data-jump]");
      if (jump) {
        jumpToMessage(jump.dataset.jump);
        return;
      }
      const ph = e.target.closest("[data-photo]");
      if (ph)
        openPhoto(ph.dataset.photo);
    });
    setupBubbleGestures(streamEl, (id, kind) => {
      const m = msgById.get(Number(id)) || msgById.get(id);
      if (!m)
        return;
      if (kind === "reply")
        startReply(m);
      else if (kind === "menu")
        openMsgActions(m);
    });
    api.screen.querySelector("[data-pm-ctx]")?.addEventListener("click", (e) => {
      if (e.target.closest(".pm-ctx-call"))
        return;
      window.dispatchEvent(new CustomEvent("cstl-open-ad", { detail: { post: p } }));
    });
    api.screen.querySelector(".pm-send")?.addEventListener("pointerdown", (e) => e.preventDefault());
    api._cleanup.push(setupKeyboardResize(api.screen));
    setTimeout(() => input.focus(), 250);
    return api;
  }
  function openThreadsList() {
    requireAuth("\u043F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F", async () => {
      const me = currentUserId();
      const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
        <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico"><span class="pm-head-ic">${ICONS.message}</span>\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F</div></div>
      </header>
      <div class="pm-list pm-list--threads" id="pm-list">
        <div class="pm-search">
          <span class="pm-search-ic" aria-hidden="true">${ICONS.search}</span>
          <input class="pm-search-input" id="pm-search" type="search"
                 placeholder="\u041F\u043E\u0448\u0443\u043A \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u044C" aria-label="\u041F\u043E\u0448\u0443\u043A \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u044C" autocomplete="off">
        </div>
        <div class="pm-chips" id="pm-chips" role="tablist">
          <button class="pm-chip pm-chip--active" type="button" data-filter="all">\u0423\u0441\u0456</button>
          <button class="pm-chip" type="button" data-filter="unread">\u041D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u0456</button>
          <button class="pm-chip" type="button" data-filter="archive">\u0410\u0440\u0445\u0456\u0432</button>
        </div>
        <div class="pm-threads" id="pm-threads"><div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>
      </div>
    `, "pm-screen--list");
      const threadsEl = api.screen.querySelector("#pm-threads");
      const searchEl = api.screen.querySelector("#pm-search");
      const chipsEl = api.screen.querySelector("#pm-chips");
      let [threads, unread, states] = await Promise.all([
        fetchMyThreads(me),
        fetchUnreadByThread(me),
        fetchThreadStates(me)
      ]);
      if (api._closed)
        return;
      const ICON_ARCHIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 13l3 3 3-3"/></svg>';
      const ICON_UNARCHIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 15l3-3 3 3"/></svg>';
      const ICON_TRASH = ACT_ICONS.delete;
      const applyEmptyState = () => {
        const show = threads.length ? "" : "none";
        api.screen.querySelector(".pm-search").style.display = show;
        chipsEl.style.display = show;
      };
      applyEmptyState();
      let filter = "all";
      let query = "";
      const stOf = (id) => states.get(id) || {};
      const renderThreads = () => {
        const q = query.trim().toLowerCase();
        const list = threads.filter((t) => {
          const s = stOf(t.id);
          if (s.cleared_at && !(new Date(t.last_message_at) > new Date(s.cleared_at)))
            return false;
          if (filter === "archive") {
            if (!s.archived)
              return false;
          } else if (s.archived)
            return false;
          if (filter === "unread" && !(unread.get(t.id) > 0))
            return false;
          if (!q)
            return true;
          const hay = `${otherName(t)} ${threadPostTitle(t)} ${t.last_message_text || ""}`.toLowerCase();
          return hay.includes(q);
        });
        if (!list.length) {
          threadsEl.innerHTML = filter === "archive" ? `<div class="pm-empty pm-empty--mini">\u0410\u0440\u0445\u0456\u0432 \u043F\u043E\u0440\u043E\u0436\u043D\u0456\u0439</div>` : !threads.length ? `<div class="pm-empty pm-empty--threads">
                 <span class="pm-empty-ic">\u{1F4AC}</span>
                 <div class="pm-empty-title">\u0412\u0430\u0448\u0456 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F</div>
                 <div class="pm-empty-sub">\u0422\u0443\u0442 \u0437\u02BC\u044F\u0432\u043B\u044F\u0442\u044C\u0441\u044F \u0432\u0430\u0448\u0456 \u0440\u043E\u0437\u043C\u043E\u0432\u0438 \u0437 \u043F\u043E\u043A\u0443\u043F\u0446\u044F\u043C\u0438 \u0442\u0430 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u044F\u043C\u0438 \u0437 \u0434\u043E\u0448\u043A\u0438.</div>
               </div>` : `<div class="pm-empty pm-empty--mini">\u041D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E</div>`;
          return;
        }
        threadsEl.innerHTML = list.map((t) => {
          const n = unread.get(t.id) || 0;
          const name = otherName(t);
          const preview = t.last_message_text || "\u0420\u043E\u0437\u043C\u043E\u0432\u0443 \u0440\u043E\u0437\u043F\u043E\u0447\u0430\u0442\u043E";
          const archived = !!stOf(t.id).archived;
          return `
          <div class="pm-thread-row" data-row="${t.id}">
            <div class="pm-thread-actions">
              <button class="pm-thread-act pm-thread-act--archive" type="button" data-archive="${t.id}" aria-label="${archived ? "\u0420\u043E\u0437\u0430\u0440\u0445\u0456\u0432\u0443\u0432\u0430\u0442\u0438" : "\u0410\u0440\u0445\u0456\u0432\u0443\u0432\u0430\u0442\u0438"}">${archived ? ICON_UNARCHIVE : ICON_ARCHIVE}</button>
              <button class="pm-thread-act pm-thread-act--delete" type="button" data-delete="${t.id}" aria-label="\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438">${ICON_TRASH}</button>
            </div>
            <button class="pm-thread ${n > 0 ? "pm-thread--unread" : ""}" type="button" data-thread="${t.id}">
              ${avatar(name, otherUid(t))}
              <div class="pm-thread-body">
                <div class="pm-thread-top">
                  <span class="pm-thread-name"${nameUid(otherUid(t))}>${escapeHtml(name)}</span>
                  <span class="pm-thread-time">${threadListTime(t.last_message_at)}</span>
                </div>
                <div class="pm-thread-post">${escapeHtml(threadPostTitle(t))}</div>
                <div class="pm-thread-last">${escapeHtml(preview)}</div>
              </div>
              ${n > 0 ? `<span class="pm-thread-meta"><span class="pm-thread-dot"></span><span class="pm-row-badge">${n}</span></span>` : ""}
            </button>
          </div>`;
        }).join("");
        hydrateAvatars(threadsEl);
        hydrateNames(threadsEl);
      };
      const autoUnarchiveUnread = async () => {
        const toFix = threads.filter((t) => unread.get(t.id) > 0 && stOf(t.id).archived);
        for (const t of toFix) {
          const prev = states.get(t.id) || {};
          states.set(t.id, { ...prev, archived: false });
          setThreadState(me, t.id, { archived: false, hidden: !!prev.hidden, cleared_at: prev.cleared_at || null });
        }
      };
      await autoUnarchiveUnread();
      renderThreads();
      searchEl.addEventListener("input", () => {
        query = searchEl.value;
        renderThreads();
      });
      chipsEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-filter]");
        if (!btn)
          return;
        filter = btn.dataset.filter;
        chipsEl.querySelectorAll(".pm-chip").forEach((c) => c.classList.toggle("pm-chip--active", c === btn));
        renderThreads();
      });
      let openRow = null, suppressClick = false;
      const closeOpenRow = () => {
        if (!openRow)
          return;
        const c = openRow.querySelector(".pm-thread");
        if (c) {
          c.style.transition = "";
          c.style.removeProperty("transform");
        }
        openRow.classList.remove("pm-thread-row--open");
        openRow = null;
      };
      let sX = 0, sY = 0, swCard = null, swRow = null, swLock = null;
      threadsEl.addEventListener("touchstart", (e) => {
        const c = e.target.closest(".pm-thread");
        if (!c) {
          swCard = null;
          return;
        }
        swCard = c;
        swRow = c.closest(".pm-thread-row");
        swLock = null;
        sX = e.touches[0].clientX;
        sY = e.touches[0].clientY;
      }, { passive: true });
      threadsEl.addEventListener("touchmove", (e) => {
        if (!swCard)
          return;
        const dx = e.touches[0].clientX - sX, dy = e.touches[0].clientY - sY;
        if (!swLock && (Math.abs(dx) > 10 || Math.abs(dy) > 10))
          swLock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (swLock === "h") {
          e.preventDefault();
          swCard.style.transition = "none";
          const base = swRow === openRow ? -140 : 0;
          const d = Math.max(Math.min(base + dx, 0), -140);
          swCard.style.transform = `translateX(${d}px)`;
        }
      }, { passive: false });
      threadsEl.addEventListener("touchend", (e) => {
        if (!swCard)
          return;
        const c = swCard, r = swRow, lock = swLock;
        swCard = null;
        swRow = null;
        if (lock !== "h")
          return;
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 60);
        c.style.transition = "";
        const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sX) - sX;
        const wasOpen = r === openRow;
        const open = wasOpen ? dx < 60 : dx < -70;
        if (open) {
          if (openRow && openRow !== r)
            closeOpenRow();
          c.style.transform = "translateX(-140px)";
          r.classList.add("pm-thread-row--open");
          openRow = r;
        } else {
          c.style.transform = "";
          r.classList.remove("pm-thread-row--open");
          if (openRow === r)
            openRow = null;
        }
      }, { passive: false });
      const applyThreadState = async (id, patch) => {
        const prev = { ...states.get(id) || {} };
        const merged = { ...prev, ...patch };
        states.set(id, merged);
        closeOpenRow();
        renderThreads();
        const res = await setThreadState(me, id, {
          archived: !!merged.archived,
          hidden: !!merged.hidden,
          cleared_at: merged.cleared_at || null
        });
        if (!res.ok) {
          states.set(id, prev);
          renderThreads();
          showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F: " + (res.error || ""), 4e3, "error");
        }
      };
      threadsEl.addEventListener("click", (e) => {
        const arch = e.target.closest("[data-archive]");
        if (arch) {
          const id = Number(arch.dataset.archive);
          applyThreadState(id, { archived: !stOf(id).archived });
          return;
        }
        const del = e.target.closest("[data-delete]");
        if (del) {
          applyThreadState(Number(del.dataset.delete), { hidden: true, cleared_at: (/* @__PURE__ */ new Date()).toISOString() });
          return;
        }
        const btn = e.target.closest("[data-thread]");
        if (!btn)
          return;
        if (suppressClick)
          return;
        if (openRow) {
          closeOpenRow();
          return;
        }
        const t = threads.find((x) => String(x.id) === btn.dataset.thread);
        if (t)
          openChat(t, t.post);
      });
      let refreshTimer = null;
      const refresh = async () => {
        const [t, u, s] = await Promise.all([fetchMyThreads(me), fetchUnreadByThread(me), fetchThreadStates(me)]);
        if (api._closed)
          return;
        threads = t;
        unread = u;
        states = s;
        await autoUnarchiveUnread();
        applyEmptyState();
        renderThreads();
      };
      const unsub = subscribeMyThreads(() => {
        if (refreshTimer)
          clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 250);
      }, "pm-threads-list");
      const onPushRefresh = () => {
        if (refreshTimer)
          clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 120);
      };
      window.addEventListener("cstl-chat-refresh", onPushRefresh);
      api._cleanup.push(() => {
        if (refreshTimer)
          clearTimeout(refreshTimer);
        unsub();
        window.removeEventListener("cstl-chat-refresh", onPushRefresh);
      });
    });
  }
  var AD_STATUS = {
    published: { label: "\u0430\u043A\u0442\u0438\u0432\u043D\u0435", icon: ICONS.check, group: "active" },
    pending: { label: "\u043D\u0430 \u043F\u0435\u0440\u0435\u0432\u0456\u0440\u0446\u0456", icon: ICONS.clock, group: "moderation" },
    closed: { label: "\u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", icon: ICONS.check, group: "archive" },
    rejected: { label: "\u0432\u0456\u0434\u0445\u0438\u043B\u0435\u043D\u043E", icon: ICONS.close, group: "archive" }
  };
  function adDate(p) {
    const ms = p.bumped_at && new Date(p.bumped_at).getTime() || p.ts || p.published_at && new Date(p.published_at).getTime() || p.created_at && new Date(p.created_at).getTime() || 0;
    if (!ms)
      return "";
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function bumpRow(p) {
    const last = p.bumped_at ? new Date(p.bumped_at).getTime() : 0;
    const leftMs = last + BUMP_COOLDOWN_MS - Date.now();
    if (leftMs > 0) {
      const h = Math.floor(leftMs / 36e5);
      const m = Math.max(1, Math.ceil(leftMs % 36e5 / 6e4));
      const t = h > 0 ? `${h} \u0433\u043E\u0434` : `${m} \u0445\u0432`;
      return `<button class="pm-ad-bump pm-ad-bump--wait" type="button" disabled><span class="pm-ad-bump-ic">${ICONS.clock}</span>\u041C\u043E\u0436\u043D\u0430 \u0447\u0435\u0440\u0435\u0437 ${t}</button>`;
    }
    return `<button class="pm-ad-bump" type="button" data-bump="${p.id}"><span class="pm-ad-bump-ic">${ICONS.arrowUp}</span>\u041F\u0456\u0434\u043D\u044F\u0442\u0438 \u0432\u0433\u043E\u0440\u0443</button>`;
  }
  function openMyAds() {
    requireAuth("\u043F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0432\u0430\u0448\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", async () => {
      const me = currentUserId();
      const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
        <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico"><span class="pm-head-ic">${ICONS.clipboard}</span>\u041C\u043E\u0457 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</div></div>
      </header>
      <div class="pm-ad-tabs">
        <button class="pm-ad-tab active" type="button" data-filter="active">\u0410\u043A\u0442\u0438\u0432\u043D\u0456</button>
        <button class="pm-ad-tab" type="button" data-filter="moderation">\u041D\u0430 \u043C\u043E\u0434\u0435\u0440\u0430\u0446\u0456\u0457</button>
        <button class="pm-ad-tab" type="button" data-filter="archive">\u0410\u0440\u0445\u0456\u0432</button>
      </div>
      <div class="pm-list" id="pm-ads"><div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>
      <button class="pm-fab-ad" type="button" data-new-ad aria-label="\u041D\u043E\u0432\u0435 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F">${EDIT_ICON_SVG}</button>
    `, "pm-screen--ads");
      const listEl = api.screen.querySelector("#pm-ads");
      let [posts2, threads, unread] = await Promise.all([
        fetchMyPosts(me),
        fetchMyThreads(me),
        fetchUnreadByThread(me)
      ]);
      if (api._closed)
        return;
      const byPost = /* @__PURE__ */ new Map();
      threads.filter((t) => t.author_uid === me).forEach((t) => {
        if (!byPost.has(t.post_id))
          byPost.set(t.post_id, []);
        byPost.get(t.post_id).push(t);
      });
      const unreadFor = (postId) => (byPost.get(postId) || []).reduce((s, t) => s + (unread.get(t.id) || 0), 0);
      const threadsFor = (postId) => (byPost.get(postId) || []).length;
      let filter = "active";
      const ICON_DONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>';
      const ICON_TRASH = ACT_ICONS.delete;
      function swipeActions(p) {
        const btns = [];
        if (p.status === "published") {
          btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--done" type="button" data-act="close" data-id="${p.id}" aria-label="\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438">${ICON_DONE}</button>`);
        } else if (p.status === "closed") {
          btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--restore" type="button" data-act="restore" data-id="${p.id}" aria-label="\u041F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438">${ICON_BACK}</button>`);
        }
        btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--delete" type="button" data-act="delete" data-id="${p.id}" aria-label="\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438">${ICON_TRASH}</button>`);
        return { html: `<div class="pm-ad-swipe">${btns.join("")}</div>`, openW: btns.length > 1 ? 134 : 70 };
      }
      function adCard(p) {
        const meta = AD_STATUS[p.status] || { label: p.status || "", icon: "", group: "active" };
        const photo = Array.isArray(p.photos) ? p.photos.find((x) => x) : null;
        const thumb = photo ? `<div class="pm-ad-thumb pm-ad-thumb--photo" style="background-image:url('${escapeHtml(photo)}')"></div>` : `<div class="pm-ad-thumb" style="background:${escapeHtml(p.cover_gradient || "linear-gradient(135deg,#ece4d8,#dccfba)")}"><span class="pm-ad-thumb-ic">${p.cover_emoji ? escapeHtml(p.cover_emoji) : ICONS.clipboard}</span></div>`;
        const title = escapeHtml(p.title && p.title.trim() || (p.text || "").trim().slice(0, 54) || "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F");
        const cat = p.category ? `${escapeHtml(p.category)} \xB7 ` : "";
        const isPublished = p.status === "published";
        let actionsRow = "";
        if (isPublished) {
          const tn = threadsFor(p.id), un = unreadFor(p.id);
          const badge = tn > 0 ? `<button class="pm-ad-msgs" type="button" data-badge="1"><span class="pm-ad-msgs-ic">${ICONS.message}</span>${tn} ${tn === 1 ? "\u0437\u0432\u0435\u0440\u043D\u0435\u043D\u043D\u044F" : "\u0437\u0432\u0435\u0440\u043D\u0435\u043D\u044C"}${un > 0 ? `<span class="pm-ad-unread">${un}</span>` : ""}</button>` : `<span class="pm-ad-msgs pm-ad-msgs--none"><span class="pm-ad-msgs-ic">${ICONS.message}</span>\u041F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454 \u0437\u0432\u0435\u0440\u043D\u0435\u043D\u044C</span>`;
          actionsRow = `<div class="pm-ad-actions">${badge}${bumpRow(p)}</div>`;
        }
        const canEdit = p.status === "published" || p.status === "pending";
        const mi = (act, icon, label, extra = "") => `<button class="pm-ad-mi${extra}" type="button" data-act="${act}" data-id="${p.id}"><span class="pm-ad-mi-ic">${icon}</span>${label}</button>`;
        const menuItems = [
          canEdit ? mi("edit", ICONS.pencil, "\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438") : "",
          isPublished ? mi("close", ICONS.check, "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438") : "",
          p.status === "closed" ? mi("restore", ICON_BACK, "\u041F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438 \u0432 \u0430\u043A\u0442\u0438\u0432\u043D\u0456") : "",
          mi("delete", ICONS.trash, "\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438", " pm-ad-mi--danger")
        ].join("");
        const sw = swipeActions(p);
        return `
        <div class="pm-ad-row" data-row="${p.id}" data-open-w="${sw.openW}">
          ${sw.html}
          <div class="pm-ad" data-ad="${p.id}">
            <div class="pm-ad-main" data-open-ad="${p.id}">
              ${thumb}
              <div class="pm-ad-info">
                <span class="pm-ad-title">${title}</span>
                <span class="pm-ad-meta">${cat}${adDate(p)} \xB7 <span class="pm-ad-status pm-ad-status--${escapeHtml(p.status || "")}"><span class="pm-ad-status-ic">${meta.icon}</span>${escapeHtml(meta.label)}</span></span>
              </div>
              <button class="pm-ad-more" type="button" data-menu="${p.id}" aria-label="\u0414\u0456\u0457">\u22EF</button>
            </div>
            ${actionsRow}
            <div class="pm-ad-menu" id="pm-ad-menu-${p.id}" hidden>${menuItems}</div>
          </div>
        </div>`;
      }
      let openRow = null, suppressClick = false;
      const closeOpenRow = () => {
        if (!openRow)
          return;
        const c = openRow.querySelector(".pm-ad");
        if (c) {
          c.style.transition = "";
          c.style.removeProperty("transform");
        }
        openRow.classList.remove("pm-ad-row--open");
        openRow = null;
      };
      function render2() {
        openRow = null;
        const list = posts2.filter((p) => (AD_STATUS[p.status]?.group || "active") === filter);
        if (!list.length) {
          const empty = {
            active: `<span class="pm-empty-ic">${ICONS.clipboard}</span>\u0423 \u0432\u0430\u0441 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454 \u0430\u043A\u0442\u0438\u0432\u043D\u0438\u0445 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C.<br>\u041F\u043E\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0448\u0435 \u2014 \u043A\u043D\u043E\u043F\u043A\u0430 \u0432\u043D\u0438\u0437\u0443.`,
            moderation: `<span class="pm-empty-ic">${ICONS.clock}</span>\u041D\u0435\u043C\u0430\u0454 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C \u043D\u0430 \u043C\u043E\u0434\u0435\u0440\u0430\u0446\u0456\u0457.`,
            archive: `<span class="pm-empty-ic">${ICONS.archive}</span>\u0410\u0440\u0445\u0456\u0432 \u043F\u043E\u0440\u043E\u0436\u043D\u0456\u0439.`
          };
          listEl.innerHTML = `<div class="pm-empty">${empty[filter] || empty.active}</div>`;
          return;
        }
        listEl.innerHTML = list.map(adCard).join("");
      }
      render2();
      api.screen.querySelectorAll(".pm-ad-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          if (tab.dataset.filter === filter)
            return;
          filter = tab.dataset.filter;
          api.screen.querySelectorAll(".pm-ad-tab").forEach((t) => t.classList.toggle("active", t === tab));
          render2();
        });
      });
      const onPostUpdated = () => {
        if (!api._closed)
          render2();
      };
      window.addEventListener("cstl-post-updated", onPostUpdated);
      api._cleanup.push(() => window.removeEventListener("cstl-post-updated", onPostUpdated));
      api.screen.querySelector("[data-new-ad]")?.addEventListener("click", () => openBoardModal());
      let sX = 0, sY = 0, swCard = null, swRow = null, swLock = null;
      const rowOpenW = (row) => Number(row?.dataset.openW) || 134;
      listEl.addEventListener("touchstart", (e) => {
        const c = e.target.closest(".pm-ad");
        if (!c) {
          swCard = null;
          return;
        }
        swCard = c;
        swRow = c.closest(".pm-ad-row");
        swLock = null;
        sX = e.touches[0].clientX;
        sY = e.touches[0].clientY;
      }, { passive: true });
      listEl.addEventListener("touchmove", (e) => {
        if (!swCard)
          return;
        const dx = e.touches[0].clientX - sX, dy = e.touches[0].clientY - sY;
        if (!swLock && (Math.abs(dx) > 10 || Math.abs(dy) > 10))
          swLock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (swLock === "h") {
          e.preventDefault();
          swCard.style.transition = "none";
          const w = rowOpenW(swRow);
          const base = swRow === openRow ? -w : 0;
          const d = Math.max(Math.min(base + dx, 0), -w);
          swCard.style.transform = `translateX(${d}px)`;
        }
      }, { passive: false });
      listEl.addEventListener("touchend", (e) => {
        if (!swCard)
          return;
        const c = swCard, r = swRow, lock = swLock;
        swCard = null;
        swRow = null;
        if (lock !== "h")
          return;
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 60);
        c.style.transition = "";
        const w = rowOpenW(r);
        const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sX) - sX;
        const wasOpen = r === openRow;
        const open = wasOpen ? dx < 60 : dx < -70;
        if (open) {
          if (openRow && openRow !== r)
            closeOpenRow();
          c.style.transform = `translateX(${-w}px)`;
          r.classList.add("pm-ad-row--open");
          openRow = r;
        } else {
          c.style.transform = "";
          r.classList.remove("pm-ad-row--open");
          if (openRow === r)
            openRow = null;
        }
      }, { passive: false });
      const syncMenuRow = (menu) => {
        const row = menu.closest(".pm-ad-row");
        if (row)
          row.classList.toggle("pm-ad-row--menu-open", !menu.hidden);
      };
      const closeMenus = (except) => api.screen.querySelectorAll(".pm-ad-menu").forEach((m) => {
        if (m !== except) {
          m.hidden = true;
          syncMenuRow(m);
        }
      });
      listEl.addEventListener("click", async (e) => {
        if (suppressClick)
          return;
        if (openRow) {
          const actInOpen = e.target.closest("[data-act]");
          if (!actInOpen || !openRow.contains(actInOpen)) {
            closeOpenRow();
            return;
          }
        }
        const menuBtn = e.target.closest("[data-menu]");
        if (menuBtn) {
          const menu = api.screen.querySelector(`#pm-ad-menu-${menuBtn.dataset.menu}`);
          closeMenus(menu);
          if (menu) {
            menu.hidden = !menu.hidden;
            syncMenuRow(menu);
          }
          return;
        }
        const bumpBtn = e.target.closest("[data-bump]");
        if (bumpBtn) {
          bumpBtn.disabled = true;
          const r = await bumpPost(Number(bumpBtn.dataset.bump));
          if (r.ok) {
            const p = posts2.find((x) => String(x.id) === bumpBtn.dataset.bump);
            if (p)
              p.bumped_at = r.bumped_at || (/* @__PURE__ */ new Date()).toISOString();
            showToast("\u{1F53C} \u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u043F\u0456\u0434\u043D\u044F\u0442\u043E \u0432\u0433\u043E\u0440\u0443", 2500);
            render2();
          } else if (r.error === "cooldown") {
            const h = Math.floor((r.seconds_left || 0) / 3600);
            const m = Math.max(1, Math.ceil((r.seconds_left || 0) % 3600 / 60));
            showToast(`\u041F\u0456\u0434\u043D\u044F\u0442\u0438 \u043C\u043E\u0436\u043D\u0430 \u0440\u0430\u0437 \u043D\u0430 3 \u0433\u043E\u0434. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 ${h > 0 ? h + " \u0433\u043E\u0434" : m + " \u0445\u0432"}.`, 3500);
            const p = posts2.find((x) => String(x.id) === bumpBtn.dataset.bump);
            if (p)
              p.bumped_at = new Date(Date.now() - (BUMP_COOLDOWN_MS - (r.seconds_left || 0) * 1e3)).toISOString();
            render2();
          } else {
            showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043F\u0456\u0434\u043D\u044F\u0442\u0438. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.", 3e3);
            bumpBtn.disabled = false;
          }
          return;
        }
        const badgeBtn = e.target.closest("[data-badge]");
        if (badgeBtn) {
          openThreadsList();
          return;
        }
        const act = e.target.closest("[data-act]");
        if (act) {
          closeMenus(null);
          const id = Number(act.dataset.id);
          if (act.dataset.act === "edit") {
            const p = posts2.find((x) => x.id === id);
            if (p)
              openBoardModal({ editPost: p });
            return;
          }
          if (act.dataset.act === "close") {
            const r = await closePost(id);
            if (r.ok) {
              const p = posts2.find((x) => x.id === id);
              if (p)
                p.status = "closed";
              showToast("\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u2014 \u0443 \u0410\u0440\u0445\u0456\u0432\u0456", 2800);
              render2();
              window.dispatchEvent(new Event("cstl-posts-changed"));
            } else
              showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u0438. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.", 3e3);
          } else if (act.dataset.act === "restore") {
            const r = await restorePost(id);
            if (r.ok) {
              const p = posts2.find((x) => x.id === id);
              if (p)
                p.status = "published";
              showToast("\u21A9\uFE0F \u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u043E \u0432 \u0430\u043A\u0442\u0438\u0432\u043D\u0456", 2800);
              render2();
              window.dispatchEvent(new Event("cstl-posts-changed"));
            } else if (r.error === "not_restorable") {
              showToast("\u041F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438 \u043C\u043E\u0436\u043D\u0430 \u043B\u0438\u0448\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", 3e3);
            } else
              showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.", 3e3);
          } else if (act.dataset.act === "delete") {
            if (!confirm("\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u043D\u0430\u0437\u0430\u0432\u0436\u0434\u0438? \u0420\u043E\u0437\u043C\u043E\u0432\u0438 \u043F\u043E \u043D\u044C\u043E\u043C\u0443 \u0442\u0435\u0436 \u0437\u043D\u0438\u043A\u043D\u0443\u0442\u044C."))
              return;
            const r = await deleteMyPost(id);
            if (r.ok) {
              posts2 = posts2.filter((x) => x.id !== id);
              showToast("\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E", 2500);
              render2();
            } else
              showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.", 3e3);
          }
          return;
        }
        const open = e.target.closest("[data-open-ad]");
        if (open) {
          const p = posts2.find((x) => String(x.id) === open.dataset.openAd);
          if (p)
            window.dispatchEvent(new CustomEvent("cstl-open-ad", { detail: { post: p } }));
        }
      });
      api.screen.addEventListener("click", (e) => {
        if (!e.target.closest(".pm-ad-menu") && !e.target.closest("[data-menu]"))
          closeMenus(null);
      });
    });
  }
  function openSavedAds(posts2, opts = {}) {
    let list = Array.isArray(posts2) ? posts2.slice() : [];
    const api = buildScreen(`
    <header class="pm-head pm-head--list">
      <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
      <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico"><span class="pm-head-ic">${BOOKMARK_FILLED_SVG}</span>\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456</div></div>
    </header>
    <div class="pm-list" id="pm-saved"><div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>
  `, "pm-screen--saved");
    const listEl = api.screen.querySelector("#pm-saved");
    const locOf = (p) => p.location && p.location !== COMMUNITY_ALL ? p.location : "";
    function card(p) {
      const photo = Array.isArray(p.photos) ? p.photos.find((x) => x) : null;
      const thumb = photo ? `<div class="pm-ad-thumb pm-ad-thumb--photo" style="background-image:url('${escapeHtml(photo)}')"></div>` : `<div class="pm-ad-thumb" style="background:linear-gradient(135deg,#ece4d8,#dccfba)"><span class="pm-ad-thumb-ic">${ICONS.clipboard}</span></div>`;
      const title = escapeHtml(p.title && p.title.trim() || (p.text || "").trim().slice(0, 54) || "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F");
      const meta = [p.category, locOf(p), p.author].filter(Boolean).map(escapeHtml).join(" \xB7 ");
      return `
      <div class="pm-ad-row">
        <div class="pm-ad">
          <div class="pm-ad-main" data-open-ad="${p.id}">
            ${thumb}
            <div class="pm-ad-info">
              <span class="pm-ad-title">${title}</span>
              <span class="pm-ad-meta">${meta}</span>
            </div>
            <button class="pm-saved-remove" type="button" data-unsave="${p.id}" aria-label="\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445">${BOOKMARK_FILLED_SVG}</button>
          </div>
        </div>
      </div>`;
    }
    function render2() {
      if (!list.length) {
        listEl.innerHTML = `<div class="pm-empty"><span class="pm-empty-ic">${BOOKMARK_OUTLINE_SVG}</span>\u0423 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E.<br>\u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u0437\u0430\u043A\u043B\u0430\u0434\u043A\u0443 \u043D\u0430 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u0456, \u0449\u043E\u0431 \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438.</div>`;
        return;
      }
      listEl.innerHTML = list.map(card).join("");
    }
    render2();
    listEl.addEventListener("click", async (e) => {
      const un = e.target.closest("[data-unsave]");
      if (un) {
        e.stopPropagation();
        const id = Number(un.dataset.unsave);
        const me = currentUserId();
        if (me)
          await removeSavedPost(me, id);
        list = list.filter((p) => p.id !== id);
        opts.onRemove?.(id);
        render2();
        showToast("\u041F\u0440\u0438\u0431\u0440\u0430\u043D\u043E \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445", 2e3);
        return;
      }
      const open = e.target.closest("[data-open-ad]");
      if (open) {
        const p = list.find((x) => String(x.id) === open.dataset.openAd);
        if (p)
          window.dispatchEvent(new CustomEvent("cstl-open-ad", { detail: { post: p } }));
      }
    });
  }
  function startChatFromPost(post) {
    requireAuth("\u043D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u044E", async () => {
      const me = currentUserId();
      if (!post.owner_uid) {
        showToast("\u0410\u0432\u0442\u043E\u0440 \u043D\u0435 \u0437\u0430\u043B\u0438\u0448\u0438\u0432 \u0430\u043A\u0430\u0443\u043D\u0442\u0443 \u2014 \u0437\u0430\u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443\u0439\u0442\u0435 \u0437\u0430 \u043D\u043E\u043C\u0435\u0440\u043E\u043C", 3500);
        return;
      }
      if (post.owner_uid === me) {
        showToast("\u0426\u0435 \u0432\u0430\u0448\u0435 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u2014 \u0437\u0432\u0435\u0440\u043D\u0435\u043D\u043D\u044F \u0434\u0438\u0432\u0456\u0442\u044C\u0441\u044F \u0443 \xAB\u041C\u043E\u0457 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F\xBB", 3500);
        return;
      }
      const myProfile = await getProfile();
      const myName = myProfile && myProfile.name || "\u0416\u0438\u0442\u0435\u043B\u044C";
      const res = await getOrCreateThread({
        postId: post.id,
        authorUid: post.owner_uid,
        buyerUid: me,
        authorName: post.author || "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446\u044C",
        buyerName: myName
      });
      if (!res.ok) {
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0447\u0430\u0442: " + (res.error || ""), 4e3, "error");
        return;
      }
      openChat(res.thread, post);
    });
  }
  var _readThreads = /* @__PURE__ */ new Set();
  async function refreshUnreadBadge() {
    const accBtn = document.getElementById("account-btn");
    const fabBadge = document.getElementById("board-trigger-badge");
    const msgBadge = document.getElementById("board-fab-msgs-badge");
    const hideAll = () => {
      accBtn?.querySelector(".account-unread")?.remove();
      if (fabBadge) {
        fabBadge.textContent = "";
        fabBadge.style.display = "none";
      }
      if (msgBadge) {
        msgBadge.textContent = "";
        msgBadge.style.display = "none";
      }
    };
    if (!isLoggedIn()) {
      hideAll();
      return;
    }
    const map = await fetchUnreadByThread(currentUserId());
    for (const id of _readThreads)
      map.delete(id);
    const chats = map.size;
    if (chats <= 0) {
      hideAll();
      return;
    }
    const label = chats > 99 ? "99+" : String(chats);
    if (accBtn) {
      let badge = accBtn.querySelector(".account-unread");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "account-unread";
        accBtn.appendChild(badge);
      }
      badge.textContent = label;
    }
    if (fabBadge) {
      fabBadge.textContent = label;
      fabBadge.style.display = "block";
    }
    if (msgBadge) {
      msgBadge.textContent = label;
      msgBadge.style.display = "inline-block";
    }
  }
  async function registerChatPushDevice() {
    try {
      if (!isLoggedIn())
        return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        return;
      if (Notification.permission !== "granted")
        return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub)
        return;
      const j = sub.toJSON();
      await saveUserPushDevice({
        uid: currentUserId(),
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth_key: j.keys.auth
      });
    } catch (e) {
      console.warn("[chat-push] register:", e && e.message);
    }
  }
  async function ensureChatPush() {
    if (!isLoggedIn())
      return;
    try {
      const sub = await ensurePushSubscription();
      if (!sub)
        return;
      const j = sub.toJSON();
      await saveUserPushDevice({
        uid: currentUserId(),
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth_key: j.keys.auth
      });
    } catch (e) {
      console.warn("[chat-push] ensure:", e && e.message);
    }
  }
  async function openThreadById(threadId) {
    if (!isLoggedIn() || threadId == null)
      return;
    const threads = await fetchMyThreads(currentUserId());
    const thread = threads.find((t) => String(t.id) === String(threadId));
    if (thread)
      openChat(thread, thread.post);
  }
  var _chatBannerTimer = null;
  function showChatPushBanner({ title, body, threadId }) {
    let el = document.getElementById("chat-push-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "chat-push-banner";
      el.className = "chat-push-banner";
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="cpb-title">${escapeHtml(title || "\u041D\u043E\u0432\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F")}</div><div class="cpb-body">${escapeHtml(body || "")}</div>`;
    el.onclick = () => {
      el.classList.remove("visible");
      if (threadId != null)
        openThreadById(threadId);
    };
    requestAnimationFrame(() => el.classList.add("visible"));
    clearTimeout(_chatBannerTimer);
    _chatBannerTimer = setTimeout(() => el.classList.remove("visible"), 4500);
  }
  var _threadsUnsub = null;
  function initBoardChat() {
    refreshUnreadBadge();
    if ("serviceWorker" in navigator && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        if (!e.data)
          return;
        if (e.data.__cstl === "push") {
          refreshUnreadBadge();
          window.dispatchEvent(new CustomEvent("cstl-chat-refresh"));
          if (e.data.pushType === "chat" && document.visibilityState === "visible") {
            showChatPushBanner({ title: e.data.title, body: e.data.body, threadId: e.data.threadId });
          }
        } else if (e.data.__cstl === "notif-click" && e.data.threadId != null) {
          openThreadById(e.data.threadId);
        }
      });
    }
    onAuthChange(() => {
      refreshUnreadBadge();
      registerChatPushDevice();
      if (_threadsUnsub) {
        try {
          _threadsUnsub();
        } catch (_) {
        }
        _threadsUnsub = null;
      }
      if (isLoggedIn())
        _threadsUnsub = subscribeMyThreads((p) => {
          const row = p && p.new;
          if (row && row.thread_id != null && row.sender_uid && row.sender_uid !== currentUserId()) {
            _readThreads.delete(row.thread_id);
          }
          refreshUnreadBadge();
        });
    });
  }

  // src/core/board-shared.js
  var BOOKMARK_OUTLINE_SVG2 = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var BOOKMARK_FILLED_SVG2 = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  var SHARE_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  var savedIds = /* @__PURE__ */ new Set();
  function getSavedIds() {
    return savedIds;
  }
  function setSavedIds(next) {
    savedIds = next || /* @__PURE__ */ new Set();
  }
  function isSaved(postId) {
    return savedIds.has(postId);
  }
  function toggleSaved(postId) {
    const uid = currentUserId();
    if (!uid)
      return;
    if (savedIds.has(postId)) {
      savedIds.delete(postId);
      removeSavedPost(uid, postId);
    } else {
      savedIds.add(postId);
      addSavedPost(uid, postId);
    }
  }
  function buildShareText(post) {
    if (post.type === "board") {
      return `${catLabel(post.category)}

${post.text}
\u2014 ${post.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E"}`;
    }
    if (post.type === "chat") {
      const tags = (post.tags || []).join(" ");
      return `${post.text}${tags ? "\n\n" + tags : ""}
\u2014 ${post.author || "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E"}`;
    }
    return post.text || "";
  }
  function saveBtnHtml(post) {
    const saved = isSaved(post.id);
    return `<button class="bd-icon-btn bd-bookmark${saved ? " bd-bookmark--active" : ""}" type="button"
          data-save-id="${post.id}"
          aria-label="${saved ? "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445" : "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0443 \u041C\u043E\u0457"}">
    ${saved ? BOOKMARK_FILLED_SVG2 : BOOKMARK_OUTLINE_SVG2}
  </button>`;
  }
  function shareBtnHtml(post) {
    const shareText = buildShareText(post);
    const shareTitle = post.type === "chat" ? "\u041E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F \u0437 \u0414\u043E\u0448\u043A\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0438 \u041E\u043B\u0438\u043A\u0438" : "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0437 \u0414\u043E\u0448\u043A\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0438 \u041E\u043B\u0438\u043A\u0438";
    return `<button class="bd-icon-btn bd-share-btn" type="button"
          data-share-board
          data-share-title="${escapeHtml(shareTitle)}"
          data-share-text="${escapeHtml(shareText)}"
          aria-label="\u041F\u043E\u0434\u0456\u043B\u0438\u0442\u0438\u0441\u044F">${SHARE_ICON_SVG}</button>`;
  }

  // src/tabs/board-discussions.js
  var _getPosts = () => [];
  function initDiscussionsEngine({ getPosts }) {
    if (getPosts)
      _getPosts = getPosts;
  }
  var COMMENT_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var USERS_ICON_SVG = ICONS.users;
  var HEART_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var HEART_FILLED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var commentsByPost = /* @__PURE__ */ new Map();
  var LIKE_EMOJI = "\u2764\uFE0F";
  var reactionsByPost = /* @__PURE__ */ new Map();
  function setDiscussionsData(comments, reactions) {
    if (comments)
      commentsByPost = comments;
    if (reactions)
      reactionsByPost = reactions;
  }
  function getLikeCount(postId) {
    return reactionsByPost.get(postId)?.counts?.[LIKE_EMOJI] || 0;
  }
  function isLikedByMe(postId) {
    return reactionsByPost.get(postId)?.my === LIKE_EMOJI;
  }
  function likeBtnInner(postId) {
    const liked = isLikedByMe(postId);
    return `${liked ? HEART_FILLED_SVG : HEART_OUTLINE_SVG} <span class="bd-chat-like-count">${getLikeCount(postId)}</span>`;
  }
  var LS_CHAT_SEEN = "cstl-chat-seen-v1";
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
  function getComments(postId) {
    return commentsByPost.get(postId) || [];
  }
  function activeComments(postId) {
    return getComments(postId).filter((c) => !c.deleted_at);
  }
  function isMyComment(c) {
    const uid = currentUserId();
    return !!uid && c.sender_uid === uid;
  }
  function clockTime2(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime()))
      return "";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  var CHAT_MONTHS_GEN = [
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
  function chatDayLabel(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime()))
      return "";
    const now = /* @__PURE__ */ new Date();
    const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 864e5;
    if (d.getTime() >= sToday)
      return "\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456";
    if (d.getTime() >= sToday - day)
      return "\u0412\u0447\u043E\u0440\u0430";
    if (d.getFullYear() === now.getFullYear())
      return `${d.getDate()} ${CHAT_MONTHS_GEN[d.getMonth()]}`;
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(-2)}`;
  }
  function getChatSeen(postId) {
    const m = lsGet(LS_CHAT_SEEN, {});
    return m[String(postId)] || 0;
  }
  function setChatSeen(postId, ts) {
    const m = lsGet(LS_CHAT_SEEN, {});
    m[String(postId)] = ts;
    lsSet(LS_CHAT_SEEN, m);
  }
  function newMsgLabel(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11)
      return "\u043D\u043E\u0432\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14))
      return "\u043D\u043E\u0432\u0456 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F";
    return "\u043D\u043E\u0432\u0438\u0445 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u044C";
  }
  var LS_MSG_RATE = "cstl-msg-rate-v1";
  var FLOOD_MAX = 5;
  var FLOOD_WINDOW = 15e3;
  function isDuplicateMsg(text) {
    return lsGet(LS_MSG_RATE, {}).last === text;
  }
  function isFlooding() {
    const now = Date.now();
    const times = (lsGet(LS_MSG_RATE, {}).times || []).filter((t) => now - t < FLOOD_WINDOW);
    return times.length >= FLOOD_MAX;
  }
  function recordSentMsg(text) {
    const now = Date.now();
    const st = lsGet(LS_MSG_RATE, {});
    const times = (st.times || []).filter((t) => now - t < FLOOD_WINDOW);
    times.push(now);
    lsSet(LS_MSG_RATE, { last: text, times });
  }
  function msgWord(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11)
      return "\u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
      return "\u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F";
    return "\u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u044C";
  }
  function authorAvatar(author, uid) {
    return avatarCircle({ name: author, url: cachedAvatar(uid), uid: uid || "", cls: "bd-avatar" });
  }
  function chatMessagesHtml(post) {
    const all = getComments(post.id);
    const items = all.filter((c) => !c.deleted_at);
    if (!items.length) {
      return `<div class="bd-chat-stream" data-comments-for="${post.id}">
      <div class="bd-chat-empty"><span class="bd-chat-empty-icon">${COMMENT_ICON_SVG}</span>\u041F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E.<br>\u041D\u0430\u043F\u0438\u0448\u0456\u0442\u044C \u043F\u0435\u0440\u0448\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F</div>
    </div>`;
    }
    const byId2 = new Map(all.map((c) => [c.id, c]));
    const dividerTs = _chatDividerTs;
    let hadOld = false, dividerPlaced = false, lastDay = null;
    const renderDiscBubble = (c) => {
      const reply = c.reply_to_id ? byId2.get(c.reply_to_id) : null;
      const replyHtml = reply ? `<span class="pm-quote" data-jump="${reply.id}">${escapeHtml((reply.deleted_at ? "\u0412\u0438\u0434\u0430\u043B\u0435\u043D\u0435 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F" : reply.text || "").slice(0, 90))}</span>` : "";
      const edited = c.edited_at ? '<span class="pm-bubble-edited">\u0437\u043C\u0456\u043D\u0435\u043D\u043E</span> ' : "";
      return `<div class="pm-bubble" data-msg="${c.id}" data-tag="${c.client_tag || ""}">${replyHtml}<span class="pm-bubble-text">${escapeHtml(c.text)}</span><span class="pm-bubble-time">${edited}${clockTime2(postTime(c))}</span></div>`;
    };
    let html = "";
    let group = null;
    const flush = () => {
      if (!group)
        return;
      if (group.mine) {
        html += `<div class="pm-group pm-group--mine pm-group--disc">${group.bubbles.join("")}</div>`;
      } else {
        html += `<div class="pm-group pm-group--other pm-group--disc">${authorAvatar(group.author, group.uid)}<div class="pm-disc-col"><span class="pm-disc-name"${nameUid(group.uid)}>${liveName(group.author, group.uid)}</span>${group.bubbles.join("")}</div></div>`;
      }
      group = null;
    };
    items.forEach((c) => {
      const t = postTime(c);
      const day = chatDayLabel(t);
      if (day && day !== lastDay) {
        flush();
        html += `<div class="pm-daysep"><span>${day}</span></div>`;
        lastDay = day;
      }
      const isNew = dividerTs > 0 && t > dividerTs;
      if (!isNew)
        hadOld = true;
      if (isNew && hadOld && !dividerPlaced) {
        flush();
        html += '<div class="bd-chat-divider" data-chat-divider><span>\u041D\u043E\u0432\u0456 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F</span></div>';
        dividerPlaced = true;
      }
      const mine = isMyComment(c);
      const author = c.author || "\u0416\u0438\u0442\u0435\u043B\u044C";
      const key = mine ? "__me" : c.sender_uid || author;
      if (group && group.key === key)
        group.bubbles.push(renderDiscBubble(c));
      else {
        flush();
        group = { key, mine, author, uid: c.sender_uid || "", bubbles: [renderDiscBubble(c)] };
      }
    });
    flush();
    return `<div class="bd-chat-stream" data-comments-for="${post.id}">${html}</div>`;
  }
  function scrollChatToBottom() {
    const body = document.getElementById("bd-chat-modal-body");
    if (body)
      body.scrollTop = body.scrollHeight;
  }
  function chatBodyNearBottom() {
    const body = document.getElementById("bd-chat-modal-body");
    if (!body)
      return true;
    return body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  }
  function scrollChatToNewOrBottom() {
    const body = document.getElementById("bd-chat-modal-body");
    if (!body)
      return;
    const div = body.querySelector("[data-chat-divider]");
    if (div) {
      body.scrollTop += div.getBoundingClientRect().top - body.getBoundingClientRect().top - 60;
    } else {
      body.scrollTop = body.scrollHeight;
    }
  }
  function showChatPill(n) {
    const pill = _chatModalEl?.querySelector(".bd-chat-newpill");
    if (!pill)
      return;
    pill.querySelector(".bd-chat-newpill-n").textContent = `${n} ${newMsgLabel(n)}`;
    pill.hidden = false;
  }
  function hideChatPill() {
    const pill = _chatModalEl?.querySelector(".bd-chat-newpill");
    if (pill)
      pill.hidden = true;
  }
  function updateChatHeaderCount(postId) {
    if (postId !== _chatOpenPostId)
      return;
    const el = document.getElementById("bd-chat-reply-count");
    if (el) {
      const n = activeComments(postId).length;
      el.innerHTML = `${COMMENT_ICON_SVG} ${n} ${msgWord(n)}`;
    }
  }
  var _chatModalEl = null;
  var _chatViewportHandler = null;
  var _chatScrollHandler = null;
  var _chatOpenPostId = null;
  var _chatDividerTs = 0;
  var _chatUnseen = 0;
  function onChatEsc(e) {
    if (e.key === "Escape")
      closeChatModal();
  }
  function openDiscSheet(opts) {
    const bodyHtml = `<div class="disc-sheet-title">${escapeHtml(opts.title)}</div>${opts.bodyHtml}`;
    let close;
    ({ close } = openModal({
      bodyHtml,
      variant: "sheet",
      className: "app-modal--disc",
      onMount: (wrap) => opts.onMount?.(wrap, () => close()),
      onClose: opts.onClose
    }));
    return close;
  }
  function attachSheetKeyboardFix(wrap, input) {
    const vv = window.visualViewport;
    const fullH = window.innerHeight;
    const applyKb = () => {
      const visH = vv ? vv.height : window.innerHeight;
      const open = visH < fullH - 80;
      if (open) {
        wrap.style.top = (vv ? vv.offsetTop : 0) + "px";
        wrap.style.height = (vv ? vv.height : window.innerHeight) + "px";
        wrap.style.bottom = "auto";
      } else {
        wrap.style.top = "";
        wrap.style.height = "";
        wrap.style.bottom = "";
      }
    };
    let kbTimer = null;
    const handler = () => {
      clearTimeout(kbTimer);
      kbTimer = setTimeout(applyKb, 80);
    };
    window.addEventListener("resize", handler);
    vv?.addEventListener("resize", handler);
    vv?.addEventListener("scroll", handler);
    input?.addEventListener("focus", handler);
    input?.addEventListener("blur", handler);
    return () => {
      clearTimeout(kbTimer);
      window.removeEventListener("resize", handler);
      vv?.removeEventListener("resize", handler);
      vv?.removeEventListener("scroll", handler);
      input?.removeEventListener("focus", handler);
      input?.removeEventListener("blur", handler);
    };
  }
  function openDiscussionList(title, posts2) {
    const body = posts2.length ? posts2.map(renderChatCard).join("") : '<div class="disc-sheet-empty">\u041F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E</div>';
    openDiscSheet({ title, bodyHtml: `<div class="disc-sheet-list">${body}</div>` });
  }
  function openMyDiscussions() {
    const uid = currentUserId();
    const mine = _getPosts().filter((p) => p.type === "chat" && p.owner_uid && p.owner_uid === uid);
    openDiscussionList("\u041C\u043E\u0457 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", mine);
  }
  function openSavedDiscussions() {
    const saved = getSavedIds();
    const list = _getPosts().filter((p) => p.type === "chat" && saved.has(p.id));
    openDiscussionList("\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", list);
  }
  function openDiscussionCompose() {
    const form = `
    <form class="disc-compose" id="disc-compose-form">
      <label class="disc-compose-label" for="disc-compose-topic">\u0422\u0435\u043C\u0430 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F</label>
      <textarea id="disc-compose-topic" class="disc-compose-input" rows="3"
                placeholder="\u041F\u0440\u043E \u0449\u043E \u043F\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043C\u043E? \u041D\u0430\u043F\u0440.: \u0427\u0438 \u043F\u043E\u0442\u0440\u0456\u0431\u0435\u043D \u043D\u043E\u0432\u0438\u0439 \u043C\u0430\u0439\u0434\u0430\u043D\u0447\u0438\u043A \u0443 \u0446\u0435\u043D\u0442\u0440\u0456?" maxlength="300"></textarea>
      <button type="submit" class="disc-compose-submit">\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438</button>
      <p class="disc-compose-note">\u0417\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u043E\u0434\u0440\u0430\u0437\u0443. \u041C\u0430\u0442\u044E\u043A\u0438/\u043E\u0431\u0440\u0430\u0437\u0438 \u0431\u043B\u043E\u043A\u0443\u044E\u0442\u044C\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u043D\u043E.</p>
    </form>`;
    let detachKb = null;
    openDiscSheet({
      title: "\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F",
      bodyHtml: form,
      // Автофокус прибрано (клавіатура раніше вилітала одразу, поки аркуш ще не
      // доїхав знизу, і перекривала форму) — клавіатура тепер лише по тапу в поле.
      // detachKb — зсуває аркуш над клавіатурою, коли вона таки відкриється.
      onMount: (sheet, close) => {
        const ta = sheet.querySelector("#disc-compose-topic");
        detachKb = attachSheetKeyboardFix(sheet, ta);
        sheet.querySelector("#disc-compose-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const text = (ta?.value || "").trim();
          if (!text) {
            showToast("\u041D\u0430\u043F\u0438\u0448\u0456\u0442\u044C \u0442\u0435\u043C\u0443 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", 2500);
            ta?.focus();
            return;
          }
          if (containsProfanity(text)) {
            showToast("\u{1F6AB} \u0422\u0435\u043C\u0430 \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u0431\u043E\u0440\u043E\u043D\u0435\u043D\u0456 \u0441\u043B\u043E\u0432\u0430", 4e3, "error");
            return;
          }
          const btn = sheet.querySelector(".disc-compose-submit");
          if (btn) {
            btn.disabled = true;
            btn.textContent = "\u041D\u0430\u0434\u0441\u0438\u043B\u0430\u0454\u043C\u043E\u2026";
          }
          const payload = {
            text,
            author: currentUserName() || "\u0416\u0438\u0442\u0435\u043B\u044C",
            owner_uid: currentUserId() || null,
            tags: []
          };
          if (isSupabaseReady()) {
            const res = await submitDiscussion(payload);
            if (!res.ok) {
              if (btn) {
                btn.disabled = false;
                btn.textContent = "\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438";
              }
              showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (res.error || "\u043D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044C"), 4e3, "error");
              return;
            }
          }
          close();
          showToast("\u041E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043E!", 3e3);
          window.dispatchEvent(new CustomEvent("cstl-posts-changed"));
        });
      },
      onClose: () => {
        detachKb?.();
        detachKb = null;
      }
    });
  }
  function openChatModal(post) {
    if (_chatModalEl)
      return;
    _chatOpenPostId = post.id;
    _chatDividerTs = getChatSeen(post.id);
    _chatUnseen = 0;
    const replyCount = activeComments(post.id).length;
    const backdrop = document.createElement("div");
    backdrop.className = "board-backdrop bd-chat-backdrop";
    const modal = document.createElement("div");
    modal.className = "bd-chat-modal";
    modal.innerHTML = `
    <div class="bd-chat-modal-handle"></div>
    <header class="bd-chat-modal-head">
      <button class="bd-chat-modal-back" type="button" aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
      <div class="bd-chat-modal-titles">
        <div class="bd-chat-modal-title">${escapeHtml(post.text)}</div>
        <div class="bd-chat-modal-meta" id="bd-chat-reply-count">${COMMENT_ICON_SVG} ${replyCount} ${msgWord(replyCount)}</div>
      </div>
    </header>
    <div class="bd-chat-modal-body" id="bd-chat-modal-body">
      ${chatMessagesHtml(post)}
    </div>
    <button class="bd-chat-newpill" type="button" hidden>\u2193 <span class="bd-chat-newpill-n"></span></button>
    <button class="pm-scrolldown" id="bd-scrolldown" type="button" aria-label="\u0414\u043E \u043E\u0441\u0442\u0430\u043D\u043D\u044C\u043E\u0433\u043E \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="pm-composebar" id="bd-compose" hidden>
      <span class="pm-composebar-ic" id="bd-compose-ic">${ACT_ICONS.reply}</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="bd-compose-title"></span>
        <span class="pm-composebar-text" id="bd-compose-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="bd-compose-x" aria-label="\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438">\u2715</button>
    </div>
    ${isLoggedIn() ? `
    <form class="bd-chat-modal-form" data-comment-form="${post.id}">
      <input class="bd-chat-modal-input" type="text" placeholder="\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F\u2026"
             aria-label="\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F" data-comment-input="${post.id}">
      <button class="bd-chat-modal-send" type="submit" aria-label="\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438">\u2191</button>
    </form>` : `
    <button class="bd-chat-login-cta" type="button" id="bd-chat-login">\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C, \u0449\u043E\u0431 \u043F\u0438\u0441\u0430\u0442\u0438</button>`}
  `;
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    _chatModalEl = modal;
    hydrateAvatars(modal.querySelector("[data-comments-for]"));
    hydrateNames(modal.querySelector("[data-comments-for]"));
    requestAnimationFrame(() => {
      backdrop.classList.add("visible");
      modal.classList.add("visible");
    });
    setTimeout(scrollChatToNewOrBottom, 80);
    backdrop.addEventListener("click", closeChatModal);
    modal.querySelector(".bd-chat-modal-back")?.addEventListener("click", closeChatModal);
    modal.querySelector("#bd-chat-login")?.addEventListener(
      "click",
      () => requireAuth("\u043F\u0438\u0441\u0430\u0442\u0438 \u0432 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u0456", () => {
      })
    );
    document.addEventListener("keydown", onChatEsc);
    const bodyEl = modal.querySelector("#bd-chat-modal-body");
    const scrollBtn = modal.querySelector("#bd-scrolldown");
    _chatScrollHandler = () => {
      const near = chatBodyNearBottom();
      if (near) {
        _chatUnseen = 0;
        hideChatPill();
      }
      scrollBtn?.classList.toggle("visible", !near);
    };
    bodyEl?.addEventListener("scroll", _chatScrollHandler, { passive: true });
    modal.querySelector(".bd-chat-newpill")?.addEventListener("click", () => {
      scrollChatToBottom();
      _chatUnseen = 0;
      hideChatPill();
    });
    scrollBtn?.addEventListener("click", () => {
      scrollChatToBottom();
      _chatUnseen = 0;
      hideChatPill();
      scrollBtn.classList.remove("visible");
    });
    modal.querySelector(".bd-chat-modal-send")?.addEventListener("pointerdown", (e) => e.preventDefault());
    _discReplyTo = null;
    _discEditing = null;
    setupBubbleGestures(bodyEl, onDiscBubbleAction);
    modal.querySelector("#bd-compose-x")?.addEventListener("click", () => {
      const input2 = modal.querySelector("[data-comment-input]");
      if (_discEditing && input2)
        input2.value = "";
      clearDiscCompose();
    });
    bodyEl?.addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (!jump)
        return;
      const b = bodyEl.querySelector(`.pm-bubble[data-msg="${jump.dataset.jump}"]`);
      if (b) {
        b.scrollIntoView({ behavior: "smooth", block: "center" });
        b.classList.add("pm-bubble--flash");
        setTimeout(() => b.classList.remove("pm-bubble--flash"), 1e3);
      }
    });
    const vv = window.visualViewport;
    const input = modal.querySelector(".bd-chat-modal-input");
    const fullH = window.innerHeight;
    const applyKb = () => {
      const visH = vv ? vv.height : window.innerHeight;
      const open = visH < fullH - 80;
      if (open) {
        modal.classList.add("bd-chat-modal--kb");
        modal.style.top = (vv ? vv.offsetTop : 0) + "px";
        modal.style.height = (vv ? vv.height : window.innerHeight) - 4 + "px";
        modal.style.bottom = "auto";
      } else {
        modal.classList.remove("bd-chat-modal--kb");
        modal.style.top = "";
        modal.style.height = "";
        modal.style.bottom = "";
      }
      scrollChatToBottom();
    };
    let kbTimer = null;
    _chatViewportHandler = () => {
      clearTimeout(kbTimer);
      kbTimer = setTimeout(applyKb, 80);
    };
    window.addEventListener("resize", _chatViewportHandler);
    vv?.addEventListener("resize", _chatViewportHandler);
    vv?.addEventListener("scroll", _chatViewportHandler);
    input?.addEventListener("focus", _chatViewportHandler);
    input?.addEventListener("blur", _chatViewportHandler);
    let startY = 0, curY = 0, dragging = false, rafId = 0;
    const dragZone = modal.querySelector(".bd-chat-modal-head");
    const applyDrag = () => {
      rafId = 0;
      modal.style.transform = `translate3d(-50%, ${curY}px, 0)`;
    };
    dragZone.addEventListener("touchstart", (e) => {
      startY = e.touches[0].clientY;
      curY = 0;
      dragging = true;
      modal.style.transition = "none";
      modal.style.willChange = "transform";
    }, { passive: true });
    dragZone.addEventListener("touchmove", (e) => {
      if (!dragging)
        return;
      curY = Math.max(0, e.touches[0].clientY - startY);
      if (!rafId)
        rafId = requestAnimationFrame(applyDrag);
    }, { passive: true });
    const endDrag = () => {
      if (!dragging)
        return;
      dragging = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      modal.style.transition = "";
      modal.style.willChange = "";
      if (curY > 90)
        closeChatModal();
      else
        modal.style.transform = "";
      curY = 0;
    };
    dragZone.addEventListener("touchend", endDrag);
    dragZone.addEventListener("touchcancel", endDrag);
  }
  function closeChatModal() {
    if (!_chatModalEl)
      return;
    const modal = _chatModalEl;
    const backdrop = document.querySelector(".bd-chat-backdrop");
    if (_chatOpenPostId != null)
      setChatSeen(_chatOpenPostId, Date.now());
    const bodyEl = modal.querySelector("#bd-chat-modal-body");
    if (bodyEl && _chatScrollHandler)
      bodyEl.removeEventListener("scroll", _chatScrollHandler);
    _chatScrollHandler = null;
    _chatOpenPostId = null;
    _chatDividerTs = 0;
    _chatUnseen = 0;
    _chatModalEl = null;
    modal.classList.remove("visible");
    modal.style.transform = "";
    backdrop?.classList.remove("visible");
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onChatEsc);
    if (_chatViewportHandler) {
      window.removeEventListener("resize", _chatViewportHandler);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", _chatViewportHandler);
        window.visualViewport.removeEventListener("scroll", _chatViewportHandler);
      }
      _chatViewportHandler = null;
    }
    setTimeout(() => {
      modal.remove();
      backdrop?.remove();
    }, 240);
  }
  function refreshChatCardPreview(postId) {
    const card = document.querySelector(`.bd-card--chat[data-chat-open="${postId}"]`);
    if (!card)
      return;
    const post = _getPosts().find((p) => p.id === postId);
    if (post)
      card.outerHTML = renderChatCard(post);
  }
  function rerenderCommentsBlock(postId) {
    const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
    if (!wrap)
      return;
    const post = _getPosts().find((p) => p.id === postId);
    if (!post)
      return;
    wrap.outerHTML = chatMessagesHtml(post);
    hydrateAvatars(document.querySelector(`[data-comments-for="${postId}"]`));
    hydrateNames(document.querySelector(`[data-comments-for="${postId}"]`));
    scrollChatToBottom();
    _chatUnseen = 0;
    hideChatPill();
    updateChatHeaderCount(postId);
    refreshChatCardPreview(postId);
  }
  var _discReplyTo = null;
  var _discEditing = null;
  function findDiscComment(id) {
    return (getComments(_chatOpenPostId) || []).find((c) => String(c.id) === String(id)) || null;
  }
  function showDiscCompose(title, text, mode) {
    const bar = document.getElementById("bd-compose");
    if (!bar)
      return;
    const ic = document.getElementById("bd-compose-ic");
    if (ic)
      ic.innerHTML = mode === "edit" ? ACT_ICONS.edit : ACT_ICONS.reply;
    const t = document.getElementById("bd-compose-title");
    if (t)
      t.textContent = title;
    const x = document.getElementById("bd-compose-text");
    if (x)
      x.textContent = (text || "").slice(0, 90);
    bar.hidden = false;
    _chatModalEl?.querySelector("[data-comment-input]")?.focus();
  }
  function clearDiscCompose() {
    _discReplyTo = null;
    _discEditing = null;
    const bar = document.getElementById("bd-compose");
    if (bar)
      bar.hidden = true;
  }
  function startDiscReply(c) {
    _discEditing = null;
    _discReplyTo = c;
    showDiscCompose("\u0412\u0406\u0414\u041F\u041E\u0412\u0406\u0414\u042C:", c.text || "", "reply");
  }
  function startDiscEdit(c) {
    _discReplyTo = null;
    _discEditing = c;
    showDiscCompose("\u0420\u0415\u0414\u0410\u0413\u0423\u0412\u0410\u041D\u041D\u042F:", c.text || "", "edit");
    const input = _chatModalEl?.querySelector("[data-comment-input]");
    if (input) {
      input.value = c.text || "";
      input.focus();
    }
  }
  function onDiscBubbleAction(id, kind) {
    const c = findDiscComment(id);
    if (!c)
      return;
    if (kind === "reply")
      startDiscReply(c);
    else if (kind === "menu")
      openDiscActions(c);
  }
  function openDiscActions(c) {
    if (c.deleted_at)
      return;
    const mine = isMyComment(c);
    const sheet = document.createElement("div");
    sheet.className = "pm-actions-back";
    sheet.innerHTML = `
    <div class="pm-actions">
      <button type="button" data-act="reply"><span class="pm-act-ic">${ACT_ICONS.reply}</span>\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0441\u0442\u0438</button>
      ${c.text ? `<button type="button" data-act="copy"><span class="pm-act-ic">${ACT_ICONS.copy}</span>\u041A\u043E\u043F\u0456\u044E\u0432\u0430\u0442\u0438</button>` : ""}
      ${mine && c.text ? `<button type="button" data-act="edit"><span class="pm-act-ic">${ACT_ICONS.edit}</span>\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438</button>` : ""}
      ${mine ? `<button type="button" data-act="delete" class="pm-actions-danger"><span class="pm-act-ic">${ACT_ICONS.delete}</span>\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438</button>` : ""}
      <button type="button" data-act="cancel" class="pm-actions-cancel">\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438</button>
    </div>`;
    const close = () => sheet.remove();
    sheet.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) {
        if (e.target === sheet)
          close();
        return;
      }
      close();
      const act = b.dataset.act;
      if (act === "reply")
        startDiscReply(c);
      else if (act === "copy") {
        try {
          await navigator.clipboard.writeText(c.text || "");
          showToast("\u0421\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E");
        } catch (_) {
        }
      } else if (act === "edit")
        startDiscEdit(c);
      else if (act === "delete")
        doDiscDelete(c);
    });
    (_chatModalEl || document.body).appendChild(sheet);
  }
  async function doDiscDelete(c) {
    const postId = c.post_id;
    const list = commentsByPost.get(postId) || [];
    const idx = list.findIndex((x) => x.id === c.id);
    const prev = idx >= 0 ? list[idx] : null;
    if (idx >= 0) {
      list[idx] = { ...list[idx], deleted_at: (/* @__PURE__ */ new Date()).toISOString(), text: "" };
      commentsByPost.set(postId, list);
      rerenderCommentsBlock(postId);
    }
    const res = await deleteComment(c.id);
    if (!res.ok) {
      const l = commentsByPost.get(postId) || [];
      const i = l.findIndex((x) => x.id === c.id);
      if (i >= 0 && prev) {
        l[i] = prev;
        commentsByPost.set(postId, l);
        rerenderCommentsBlock(postId);
      }
      showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438: " + (res.error || ""), 4e3, "error");
    }
  }
  function renderChatCard(p) {
    const comments = activeComments(p.id);
    const count = comments.length;
    const recent = comments.slice(-2);
    const participants = new Set(comments.map((c) => c.sender_uid || "nm:" + (c.author || "\u0416\u0438\u0442\u0435\u043B\u044C"))).size;
    const lastHtml = recent.length ? `<div class="bd-chat-last">${recent.map((m) => `
         <div class="bd-chat-last-row">
           <span class="bd-chat-last-msg"><span class="bd-chat-last-author"><span${nameUid(m.sender_uid)}>${liveName(m.author, m.sender_uid)}</span>:</span> ${escapeHtml(m.text)}</span>
           <span class="bd-chat-last-time">${formatTime(postTime(m))}</span>
         </div>`).join("")}</div>` : '<div class="bd-chat-last bd-chat-last--empty">\u0429\u0435 \u043D\u0435\u043C\u0430\u0454 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u044C \u2014 \u043F\u043E\u0447\u043D\u0456\u0442\u044C \u0440\u043E\u0437\u043C\u043E\u0432\u0443</div>';
    const liked = isLikedByMe(p.id);
    return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}" data-chat-open="${p.id}">
      <div class="bd-chat-topic">
        <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      </div>
      <div class="bd-chat-topline">
        <span class="bd-chat-msgcount">${COMMENT_ICON_SVG} ${count} ${msgWord(count)}</span>
        <span class="bd-chat-participants">${USERS_ICON_SVG} ${participants}</span>
      </div>
      ${lastHtml}
      <div class="bd-chat-foot">
        <button class="bd-chat-like${liked ? " bd-chat-like--active" : ""}" type="button"
                data-like-id="${p.id}" aria-label="${liked ? "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u043B\u0430\u0439\u043A" : "\u041B\u0430\u0439\u043A"}">
          ${likeBtnInner(p.id)}
        </button>
        <div class="bd-chat-by">
          <div class="bd-chat-by-author"><span class="bd-chat-by-label">\u0410\u0432\u0442\u043E\u0440:</span> <span class="bd-chat-by-name"${nameUid(p.owner_uid)}>${liveName(p.author, p.owner_uid)}</span></div>
          <div class="bd-chat-by-date">${formatTime(postTime(p))}</div>
        </div>
        ${saveBtnHtml(p)}
      </div>
    </article>
  `;
  }
  function handleLikeClick(likeBtn) {
    const id = Number(likeBtn.dataset.likeId);
    requireAuth("\u043B\u0430\u0439\u043A\u0430\u0442\u0438 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", async () => {
      const uid = currentUserId();
      const wasLiked = isLikedByMe(id);
      const entry = reactionsByPost.get(id) || { counts: {}, my: null };
      entry.counts[LIKE_EMOJI] = Math.max(0, (entry.counts[LIKE_EMOJI] || 0) + (wasLiked ? -1 : 1));
      entry.my = wasLiked ? null : LIKE_EMOJI;
      reactionsByPost.set(id, entry);
      likeBtn.innerHTML = likeBtnInner(id);
      likeBtn.classList.toggle("bd-chat-like--active", !wasLiked);
      likeBtn.setAttribute("aria-label", wasLiked ? "\u041B\u0430\u0439\u043A" : "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u043B\u0430\u0439\u043A");
      const res = await setReaction(id, uid, wasLiked ? null : LIKE_EMOJI);
      if (!res.ok) {
        entry.counts[LIKE_EMOJI] = Math.max(0, (entry.counts[LIKE_EMOJI] || 0) + (wasLiked ? 1 : -1));
        entry.my = wasLiked ? LIKE_EMOJI : null;
        reactionsByPost.set(id, entry);
        likeBtn.innerHTML = likeBtnInner(id);
        likeBtn.classList.toggle("bd-chat-like--active", wasLiked);
        likeBtn.setAttribute("aria-label", wasLiked ? "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u043B\u0430\u0439\u043A" : "\u041B\u0430\u0439\u043A");
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u043B\u0430\u0439\u043A", 2500, "error");
      }
    });
  }
  var _delegationAttached = false;
  function attachDiscussionsDelegation() {
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
      if (!isLoggedIn()) {
        requireAuth("\u0437\u0430\u043B\u0438\u0448\u0438\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440", () => {
        });
        return;
      }
      if (containsProfanity(text)) {
        showToast("\u{1F6AB} \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u0431\u043E\u0440\u043E\u043D\u0435\u043D\u0456 \u0441\u043B\u043E\u0432\u0430 \u0456 \u043D\u0435 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u0435", 4500, "error");
        return;
      }
      if (looksLikeSpam(text)) {
        showToast("\u{1F6AB} \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u0441\u0445\u043E\u0436\u0435 \u043D\u0430 \u0441\u043F\u0430\u043C \u0456 \u043D\u0435 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u0435", 4e3, "error");
        return;
      }
      if (isDuplicateMsg(text)) {
        showToast("\u0412\u0438 \u0449\u043E\u0439\u043D\u043E \u0446\u0435 \u043D\u0430\u043F\u0438\u0441\u0430\u043B\u0438", 3e3);
        return;
      }
      if (isFlooding()) {
        showToast("\u0417\u0430\u043D\u0430\u0434\u0442\u043E \u0448\u0432\u0438\u0434\u043A\u043E \u2014 \u0437\u0430\u0447\u0435\u043A\u0430\u0439\u0442\u0435 \u043A\u0456\u043B\u044C\u043A\u0430 \u0441\u0435\u043A\u0443\u043D\u0434", 3500);
        return;
      }
      recordSentMsg(text);
      if (_discEditing && _discEditing.post_id === postId) {
        const target = _discEditing;
        const l0 = commentsByPost.get(postId) || [];
        const i0 = l0.findIndex((c) => c.id === target.id);
        const prev0 = i0 >= 0 ? l0[i0] : null;
        if (i0 >= 0) {
          l0[i0] = { ...l0[i0], text, edited_at: (/* @__PURE__ */ new Date()).toISOString() };
          commentsByPost.set(postId, l0);
        }
        if (input)
          input.value = "";
        clearDiscCompose();
        rerenderCommentsBlock(postId);
        const res = await editComment(target.id, text);
        if (!res.ok) {
          const l = commentsByPost.get(postId) || [];
          const i = l.findIndex((c) => c.id === target.id);
          if (i >= 0 && prev0) {
            l[i] = prev0;
            commentsByPost.set(postId, l);
            rerenderCommentsBlock(postId);
          }
          showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u043C\u0456\u043D\u0438\u0442\u0438: " + (res.error || ""), 4e3, "error");
        } else if (res.comment) {
          const l = commentsByPost.get(postId) || [];
          const i = l.findIndex((c) => c.id === target.id);
          if (i >= 0) {
            l[i] = res.comment;
            commentsByPost.set(postId, l);
            rerenderCommentsBlock(postId);
          }
        }
        return;
      }
      const replyId = _discReplyTo && _discReplyTo.post_id === postId ? _discReplyTo.id : null;
      const myName = currentUserName();
      const tempComment = {
        id: "temp-" + Date.now(),
        post_id: postId,
        author: myName,
        text,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        sender_uid: currentUserId(),
        // → isMyComment() підсвітить як мій одразу
        reply_to_id: replyId
      };
      const list = commentsByPost.get(postId) || [];
      list.push(tempComment);
      commentsByPost.set(postId, list);
      if (input)
        input.value = "";
      clearDiscCompose();
      rerenderCommentsBlock(postId);
      input?.focus();
      if (isSupabaseReady()) {
        const result = await addComment(postId, myName, text, currentUserId(), { replyToId: replyId });
        if (!result.ok) {
          const filtered = (commentsByPost.get(postId) || []).filter((c) => c.id !== tempComment.id);
          commentsByPost.set(postId, filtered);
          rerenderCommentsBlock(postId);
          showToast("\u274C \u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F. \u0421\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.", 4e3, "error");
        } else if (result.comment) {
          const updated = (commentsByPost.get(postId) || []).map(
            (c) => c.id === tempComment.id ? result.comment : c
          );
          commentsByPost.set(postId, updated);
          rerenderCommentsBlock(postId);
        }
      }
    });
  }
  function onCommentRealtimeEvent(payload) {
    const postId = (payload.new || payload.old || {}).post_id;
    if (!postId)
      return;
    const prevCount = getComments(postId).length;
    fetchAllComments().then((fresh) => {
      commentsByPost = fresh;
      const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
      if (wrap) {
        const post = _getPosts().find((p) => p.id === postId);
        if (post) {
          const body = document.getElementById("bd-chat-modal-body");
          const near = chatBodyNearBottom();
          const prevTop = body ? body.scrollTop : 0;
          wrap.outerHTML = chatMessagesHtml(post);
          hydrateAvatars(document.querySelector(`[data-comments-for="${postId}"]`));
          hydrateNames(document.querySelector(`[data-comments-for="${postId}"]`));
          if (near) {
            scrollChatToBottom();
          } else {
            if (body)
              body.scrollTop = prevTop;
            const delta = Math.max(0, getComments(postId).length - prevCount);
            if (delta > 0 && postId === _chatOpenPostId) {
              _chatUnseen += delta;
              showChatPill(_chatUnseen);
            }
          }
          updateChatHeaderCount(postId);
        }
      }
      refreshChatCardPreview(postId);
    });
  }
  function onReactionRealtimeEvent(payload) {
    const postId = (payload.new || payload.old || {}).post_id;
    if (!postId)
      return;
    const uid = currentUserId();
    fetchAllReactions(uid || getAnonId()).then((fresh) => {
      reactionsByPost = fresh;
      refreshChatCardPreview(postId);
    });
  }
  var _realtimeAttached = false;
  function attachDiscussionsRealtime() {
    if (_realtimeAttached || !isSupabaseReady())
      return;
    _realtimeAttached = true;
    subscribeComments(onCommentRealtimeEvent);
    subscribeReactions(onReactionRealtimeEvent);
  }
  function handleDiscussionsAuthChange() {
    if (_chatOpenPostId != null) {
      const post = _getPosts().find((p) => p.id === _chatOpenPostId);
      closeChatModal();
      if (post)
        openChatModal(post);
    }
  }

  // src/tabs/board.js
  function isCommunityWide(loc) {
    return !loc || loc === COMMUNITY_ALL;
  }
  function pluralAds(n) {
    const d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11)
      return "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F";
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14))
      return "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F";
    return "\u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C";
  }
  var PHONE_ICON_SVG = ICONS.phone;
  var MSG_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var PIN_ICON_SVG2 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  function renderLoc(loc) {
    if (!loc)
      return "";
    const label = loc === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : loc;
    return `<span class="cm-board-loc">${PIN_ICON_SVG2}${escapeHtml(label)}</span>`;
  }
  function renderCardFoot(p) {
    const contact = p.contact ? String(p.contact).trim() : "";
    const isPhone = contact && /^[\+\d][\d\s\-\(\)]{5,}$/.test(contact);
    const tel = isPhone ? contact.replace(/[^\d+]/g, "") : "";
    return `
      <div class="cm-board-foot">
        <div class="cm-board-foot-actions">
          ${isPhone ? `<a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="\u041F\u043E\u0434\u0437\u0432\u043E\u043D\u0438\u0442\u0438">${PHONE_ICON_SVG}</a>` : ""}
          <button class="cm-board-msg-btn" data-open-chat aria-label="\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F">${MSG_ICON_SVG}</button>
        </div>
        <div class="cm-board-foot-who">
          <span class="cm-board-author cm-board-author--card">\u2014 <span${nameUid(p.owner_uid)}>${liveName(p.author, p.owner_uid, "\u0430\u043D\u043E\u043D\u0456\u043C\u043D\u043E")}</span></span>
          <span class="cm-board-time">${renderPostTime(p)}</span>
        </div>
      </div>`;
  }
  var BUMP_ICON_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"/><path d="M6 12l6-6 6 6"/></svg>';
  function wasBumped(p) {
    if (!p || !p.bumped_at)
      return false;
    const bumpMs = new Date(p.bumped_at).getTime();
    const t = postTime(p);
    const origMs = typeof t === "number" ? t : t ? new Date(t).getTime() : 0;
    if (!bumpMs || !origMs)
      return false;
    return bumpMs - origMs > 6e4;
  }
  function renderPostTime(p) {
    if (wasBumped(p)) {
      return `<span class="cm-board-bumped">${BUMP_ICON_SVG}${formatTime(p.bumped_at)}</span>`;
    }
    return formatTime(postTime(p));
  }
  var EDIT_ICON_SVG2 = ICONS.pencil;
  var MYADS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg>';
  var allPosts = [];
  var allAnnouncements = [];
  var activeType = "board";
  var activeCategory = "all";
  var activeLocation = COMMUNITY_ALL;
  var searchQuery = "";
  function boardActionsHtml(post) {
    return `
    <div class="bd-actions bd-actions--board-compact">
      <div class="bd-actions-extra">
        ${saveBtnHtml(post)}
        ${shareBtnHtml(post)}
      </div>
    </div>
  `;
  }
  function renderBoardCard(p) {
    const tilt = 0;
    const photo = Array.isArray(p.photos) && p.photos[0] || p.photo;
    const photoHtml = photo ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>` : "";
    return `
    <article class="cm-board-note bd-card bd-card--board${photo ? " cm-board-note--has-photo" : ""}" style="--tilt:${tilt}deg" data-post-id="${p.id}">
      <span class="cm-board-pin"></span>
      ${photoHtml}
      <span class="cm-board-cat cm-board-cat--${escapeHtml(catColor(p.category))}">${catIcon(p.category)} ${escapeHtml(catShort(p.category))}</span>
      ${renderLoc(p.location)}
      ${p.title ? `<h3 class="cm-board-title">${escapeHtml(p.title)}</h3>` : ""}
      <p class="cm-board-text">${escapeHtml(p.text)}</p>
      ${renderCardFoot(p)}
      ${boardActionsHtml(p)}
    </article>
  `;
  }
  function renderAdModal(p) {
    const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : p.photo ? [p.photo] : [];
    const hasPhoto = photos.length > 0;
    const multi = photos.length > 1;
    const photoHtml = hasPhoto ? `
    <div class="cm-board-modal-photo">
      <div class="cm-board-modal-gallery"${multi ? " data-multi" : ""}>
        ${photos.map((ph, i) => `<div class="cm-board-modal-slide"><img src="${escapeHtml(ph)}" alt="" data-photo-full="${escapeHtml(ph)}" data-photo-idx="${i}" loading="lazy" onerror="this.closest('.cm-board-modal-slide').style.display='none'"></div>`).join("")}
      </div>
      ${multi ? `<div class="cm-board-modal-dots">${photos.map((_, i) => `<span class="cm-board-modal-dot${i === 0 ? " active" : ""}"></span>`).join("")}</div>` : ""}
    </div>` : "";
    return `
    <div class="cm-board-modal-bar">
      <span class="cm-board-modal-grip"></span>
    </div>
    <div class="cm-board-modal-scrollarea">
      ${photoHtml}
      <div class="cm-board-modal-subhead">
        <span class="cm-board-cat cm-board-cat--${escapeHtml(catColor(p.category))}">${catIcon(p.category)} ${escapeHtml(catShort(p.category))}</span>
        ${renderLoc(p.location)}
        ${p.title ? `<h3 class="cm-board-title">${escapeHtml(p.title)}</h3>` : ""}
      </div>
      <div class="cm-board-modal-content">
        <p class="cm-board-text">${escapeHtml(p.text)}</p>
      </div>
    </div>
    <div class="cm-board-modal-foot">
      ${renderCardFoot(p)}
      ${boardActionsHtml(p)}
    </div>
  `;
  }
  function openPhotoLightbox2(photos, startIdx) {
    if (!photos || !photos.length)
      return;
    const wrap = document.createElement("div");
    wrap.className = "cm-photo-lightbox";
    wrap.innerHTML = `
    <button class="cm-photo-lightbox-close" type="button" aria-label="\u0417\u0430\u043A\u0440\u0438\u0442\u0438">\u2715</button>
    <div class="cm-photo-lightbox-track">
      ${photos.map((ph) => `<div class="cm-photo-lightbox-slide"><img src="${escapeHtml(ph)}" alt=""></div>`).join("")}
    </div>
    ${photos.length > 1 ? '<div class="cm-photo-lightbox-count"></div>' : ""}`;
    document.body.appendChild(wrap);
    document.body.classList.add("modal-open");
    const track = wrap.querySelector(".cm-photo-lightbox-track");
    const countEl = wrap.querySelector(".cm-photo-lightbox-count");
    const updateCount = () => {
      if (!countEl || !track.clientWidth)
        return;
      const i = Math.round(track.scrollLeft / track.clientWidth);
      countEl.textContent = `${i + 1} / ${photos.length}`;
    };
    requestAnimationFrame(() => {
      track.scrollLeft = (startIdx || 0) * track.clientWidth;
      updateCount();
      wrap.classList.add("open");
    });
    track.addEventListener("scroll", () => requestAnimationFrame(updateCount), { passive: true });
    const close = () => {
      wrap.classList.remove("open");
      document.body.classList.remove("modal-open");
      setTimeout(() => wrap.remove(), 200);
    };
    wrap.querySelector(".cm-photo-lightbox-close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap)
        close();
    });
  }
  function renderCard(post) {
    if (post.type === "chat")
      return renderChatCard(post);
    return renderBoardCard(post);
  }
  function renderFab() {
    if (discOpen) {
      return `
    <div class="board-fab" id="board-fab">
      <div class="board-fab-backdrop" id="board-fab-backdrop" aria-hidden="true"></div>
      <div class="board-fab-menu" id="board-fab-menu">
        <button class="board-fab-item" data-fab="disc-create" type="button">
          <span class="board-fab-label">\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F</span>
          <span class="board-fab-ic">${EDIT_ICON_SVG2}</span>
        </button>
        <button class="board-fab-item" data-fab="disc-mine" type="button">
          <span class="board-fab-label">\u041C\u043E\u0457 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F</span>
          <span class="board-fab-ic">${MYADS_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="disc-saved" type="button">
          <span class="board-fab-label">\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456</span>
          <span class="board-fab-ic">${BOOKMARK_OUTLINE_SVG2}</span>
        </button>
      </div>
      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button" aria-label="\u041E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F" aria-expanded="false">
        <span class="cm-board-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
        <span class="cm-board-trigger-close" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
      </button>
    </div>`;
    }
    return `
    <div class="board-fab" id="board-fab">
      <div class="board-fab-backdrop" id="board-fab-backdrop" aria-hidden="true"></div>
      <div class="board-fab-menu" id="board-fab-menu">
        <button class="board-fab-item" data-fab="post" type="button">
          <span class="board-fab-label">\u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>
          <span class="board-fab-ic">${EDIT_ICON_SVG2}</span>
        </button>
        <button class="board-fab-item" data-fab="mine" type="button">
          <span class="board-fab-label">\u041C\u043E\u0457 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>
          <span class="board-fab-ic">${MYADS_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="messages" type="button">
          <span class="board-fab-label">\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F<span class="board-fab-msgs-badge" id="board-fab-msgs-badge"></span></span>
          <span class="board-fab-ic">${MSG_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="saved" type="button">
          <span class="board-fab-label">\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456</span>
          <span class="board-fab-ic">${BOOKMARK_OUTLINE_SVG2}</span>
        </button>
      </div>
      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button" aria-label="\u0414\u0456\u0457" aria-expanded="false">
        <span class="cm-board-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
        <span class="cm-board-trigger-close" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
        <span class="cm-board-trigger-text">\u041F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>
        <span class="board-trigger-badge" id="board-trigger-badge"></span>
      </button>
    </div>`;
  }
  function getFilteredPosts(opts = {}) {
    const q = searchQuery.trim().toLowerCase();
    const savedIds2 = activeType === "saved" ? getSavedIds() : null;
    return allPosts.filter((p) => {
      if (activeType === "saved") {
        if (!savedIds2.has(p.id) || p.type === "chat")
          return false;
      } else if (p.type !== activeType) {
        return false;
      }
      if (activeType === "board" && activeCategory !== "all") {
        if (p.category !== activeCategory)
          return false;
      }
      if (activeType === "board" && activeLocation !== COMMUNITY_ALL && !opts.ignoreLocation) {
        if (p.location !== activeLocation && !isCommunityWide(p.location))
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
  function getBoardDisplayCount() {
    if (activeType !== "board" || activeLocation === COMMUNITY_ALL)
      return getFilteredPosts().length;
    const narrow = getFilteredPosts();
    const hasOwn = narrow.some((p) => p.location === activeLocation);
    return hasOwn ? narrow.length : getFilteredPosts({ ignoreLocation: true }).length;
  }
  function renderHeader() {
    const discHead = "";
    const showCategories = activeType === "board";
    const activeIcon = activeCategory === "all" ? ALL_ICON : catIcon(activeCategory);
    const activeColorCls = activeCategory === "all" ? "" : "cat-c-" + catColor(activeCategory);
    const CARET_SVG = '<svg class="bd-cat-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const menuItem = (id, icon, color, label) => `
    <button class="bd-cat-mi${id === activeCategory ? " active" : ""}" type="button" role="menuitem" data-bd-cat="${id}">
      <span class="bd-cat-mi-ico ${color ? "cat-c-" + color : ""}">${icon}</span>
      <span class="bd-cat-mi-label">${escapeHtml(label)}</span>
    </button>`;
    const catFilterHtml = showCategories ? `
    <div class="bd-cat-filter-wrap">
      <button class="bd-cat-filter" id="bd-cat-filter" type="button" aria-haspopup="true" aria-expanded="false" aria-label="\u0424\u0456\u043B\u044C\u0442\u0440 \u0437\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0454\u044E">
        <span class="bd-cat-filter-ico ${activeColorCls}">${activeIcon}</span>
        ${CARET_SVG}
      </button>
      <div class="bd-cat-menu" id="bd-cat-menu" role="menu" hidden>
        ${menuItem("all", ALL_ICON, "", "\u0412\u0441\u0456")}
        ${BOARD_CATEGORIES.map((c) => menuItem(c.id, c.icon, c.color, c.label)).join("")}
      </div>
    </div>
  ` : "";
    const count = showCategories ? getBoardDisplayCount() : 0;
    const titlebarHtml = showCategories ? `
    <div class="bd-titlebar">
      <h2 class="bd-title">\u0414\u043E\u0448\u043A\u0430 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C</h2>
      <div class="bd-subrow">
        <span class="bd-count" id="bd-count">${count} ${pluralAds(count)}</span>
        <div class="bd-loc-filter">
          <button class="bd-loc-btn" id="bd-loc-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="\u0424\u0456\u043B\u044C\u0442\u0440 \u0437\u0430 \u043D\u0430\u0441\u0435\u043B\u0435\u043D\u0438\u043C \u043F\u0443\u043D\u043A\u0442\u043E\u043C">
            <span class="bd-loc-icon" aria-hidden="true">${PIN_ICON_SVG2}</span>
            <span class="bd-loc-label">${escapeHtml(activeLocation === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : activeLocation)}</span>
            <svg class="bd-loc-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="bd-loc-menu" id="bd-loc-menu" role="menu" hidden>
            <button class="bd-loc-mi${activeLocation === COMMUNITY_ALL ? " active" : ""}" type="button" role="menuitem" data-bd-loc="${escapeHtml(COMMUNITY_ALL)}">${escapeHtml(COMMUNITY_ALL_LABEL)}</button>
            ${SETTLEMENTS.map((s) => `<button class="bd-loc-mi${activeLocation === s ? " active" : ""}" type="button" role="menuitem" data-bd-loc="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}
          </div>
        </div>
      </div>
    </div>
  ` : "";
    return `
    <div class="bd-controls">
      ${discHead}
      ${titlebarHtml}
      <div class="bd-search-row">
        ${catFilterHtml}
        <div class="bd-search">
          <span class="bd-search-icon">${ICONS.search}</span>
          <input class="bd-search-input" id="bd-search-input" type="search"
                 placeholder="${activeType === "chat" ? "\u041F\u043E\u0448\u0443\u043A \u0432 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F\u0445..." : activeType === "saved" ? "\u041F\u043E\u0448\u0443\u043A \u0443 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445..." : "\u041F\u043E\u0448\u0443\u043A \u043F\u043E \u0434\u043E\u0448\u0446\u0456..."}" value="${escapeHtml(searchQuery)}">
          ${searchQuery ? '<button class="bd-search-clear" type="button" id="bd-search-clear">\u2715</button>' : ""}
        </div>
      </div>
    </div>
  `;
  }
  function updateAdCount() {
    const el = document.getElementById("bd-count");
    if (!el || activeType !== "board")
      return;
    const n = getBoardDisplayCount();
    el.textContent = `${n} ${pluralAds(n)}`;
  }
  function renderBody() {
    const filtered = getFilteredPosts();
    if (!filtered.length) {
      const msg = activeType === "saved" ? "\u0423 \xAB\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445\xBB \u043F\u043E\u043A\u0438 \u043D\u0456\u0447\u043E\u0433\u043E. \u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u0437\u0430\u043A\u043B\u0430\u0434\u043A\u0443 \u043D\u0430 \u043F\u043E\u0441\u0442\u0456 \u0449\u043E\u0431 \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438." : searchQuery ? `\u0417\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C \xAB${escapeHtml(searchQuery)}\xBB \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E` : "\u0423 \u0446\u0456\u0439 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E";
      return `<div class="bd-empty">${msg}</div>`;
    }
    const rankTs = (x) => x.bumped_at && new Date(x.bumped_at).getTime() || x.ts || x.published_at && new Date(x.published_at).getTime() || 0;
    const sorted = [...filtered].sort((a, b) => rankTs(b) - rankTs(a));
    if (activeType === "board") {
      const corkboard = (list) => {
        const left = list.filter((_, i) => i % 2 === 0).map(renderBoardCard).join("");
        const right = list.filter((_, i) => i % 2 === 1).map(renderBoardCard).join("");
        return `<div class="cm-board-corkboard board-corkboard--full"><div class="cm-board-col">${left}</div><div class="cm-board-col">${right}</div></div>`;
      };
      if (activeLocation !== COMMUNITY_ALL) {
        const npGroup = sorted.filter((p) => p.location === activeLocation);
        const wideGroup = npGroup.length ? sorted.filter((p) => isCommunityWide(p.location)) : [...getFilteredPosts({ ignoreLocation: true })].sort((a, b) => rankTs(b) - rankTs(a));
        const section = (title, list) => list.length ? `<h3 class="bd-group-title">${escapeHtml(title)}</h3>${corkboard(list)}` : "";
        const npEmptyMsg = !npGroup.length ? `<div class="bd-group-empty">\u0412 \u0440\u043E\u0437\u0434\u0456\u043B\u0456 \xAB${escapeHtml(activeLocation)}\xBB \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E<span class="bd-group-empty-hint">\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u044C\u0442\u0435 \u0432\u0441\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0433\u0440\u043E\u043C\u0430\u0434\u0438</span></div>` : "";
        return `
        <div class="board-backdrop" id="board-backdrop"></div>
        ${section(activeLocation, npGroup)}
        ${npEmptyMsg}
        ${section(COMMUNITY_ALL_LABEL, wideGroup)}
      `;
      }
      return `
      <div class="board-backdrop" id="board-backdrop"></div>
      ${corkboard(sorted)}
    `;
    }
    return `
    <div class="board-backdrop" id="board-backdrop"></div>
    <div class="bd-stream">${sorted.map(renderCard).join("")}</div>`;
  }
  async function renderBoard() {
    const el = getBoardRoot();
    if (!el)
      return;
    if (isSupabaseReady()) {
      const uid = currentUserId();
      const [posts2, anns, comments, saved, reactions] = await Promise.all([
        fetchPublishedPosts(),
        fetchPublishedAnnouncements(),
        fetchAllComments(),
        uid ? fetchSavedPostIds(uid) : Promise.resolve(/* @__PURE__ */ new Set()),
        fetchAllReactions(uid || getAnonId())
      ]);
      if (posts2 !== null) {
        allPosts = posts2;
        allAnnouncements = anns || [];
        setDiscussionsData(comments, reactions);
        setSavedIds(saved);
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
      setDiscussionsData(/* @__PURE__ */ new Map());
    } catch {
      el.innerHTML = '<div class="empty-state">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
      return;
    }
    renderAll(el);
  }
  function renderAll() {
    const el = getBoardRoot();
    if (!el)
      return;
    const hasCork = activeType === "board";
    el.innerHTML = `
    ${hasCork ? `
      <div class="board-bg" aria-hidden="true"></div>
      <div class="board-vignette board-vignette--top" aria-hidden="true"></div>
      <div class="board-vignette board-vignette--bottom" aria-hidden="true"></div>
    ` : `
      <div class="board-vignette board-vignette--top" aria-hidden="true"></div>
    `}
    ${renderHeader()}
    <div class="bd-body" id="bd-body">${renderBody()}</div>
    ${renderFab()}
  `;
    hydrateNames(el);
    el.style.backgroundImage = "";
    el.style.backgroundSize = "";
    el.style.backgroundPosition = "";
    const fab = document.getElementById("board-fab");
    const fabBtn = document.getElementById("board-trigger");
    const fabBack = document.getElementById("board-fab-backdrop");
    const closeFab = () => {
      if (!fab)
        return;
      fab.classList.remove("open");
      fabBtn?.setAttribute("aria-expanded", "false");
    };
    const toggleFab = () => {
      if (!fab)
        return;
      const open = fab.classList.toggle("open");
      fabBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    };
    fabBtn?.addEventListener("click", toggleFab);
    fabBack?.addEventListener("click", closeFab);
    refreshUnreadBadge();
    fab?.querySelectorAll(".board-fab-item").forEach((item) => {
      item.addEventListener("click", () => {
        const act = item.dataset.fab;
        closeFab();
        if (act === "disc-create") {
          requireAuth("\u0441\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", openDiscussionCompose);
          return;
        }
        if (act === "disc-mine") {
          requireAuth("\u043C\u043E\u0457 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", openMyDiscussions);
          return;
        }
        if (act === "disc-saved") {
          requireAuth("\u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", openSavedDiscussions);
          return;
        }
        if (act === "post") {
          requireAuth("\u043F\u043E\u0434\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", openBoardModal);
          return;
        }
        if (act === "saved") {
          requireAuth("\u043F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456", () => {
            const saved = getSavedIds();
            const list = allPosts.filter((p) => saved.has(p.id) && p.type !== "chat");
            openSavedAds(list, {
              // Прибрали зі збережених на екрані → синхронізуємо стан дошки:
              // оновлюємо savedIds і, якщо картка видима на дошці, іконку закладки.
              onRemove: (id) => {
                getSavedIds().delete(id);
                const btn = document.querySelector(`[data-save-id="${id}"]`);
                if (btn) {
                  btn.innerHTML = BOOKMARK_OUTLINE_SVG2;
                  btn.classList.remove("bd-bookmark--active");
                  btn.setAttribute("aria-label", "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0443 \u041C\u043E\u0457");
                }
              }
            });
          });
          return;
        }
        if (act === "messages") {
          openThreadsList();
          return;
        }
        if (act === "mine")
          openMyAds();
      });
    });
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
    const wireMenuButton = (btnId, menuId, onPick) => {
      const btn = document.getElementById(btnId);
      const menu = document.getElementById(menuId);
      if (!btn || !menu)
        return;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasHidden = menu.hasAttribute("hidden");
        closeBoardMenus();
        if (wasHidden) {
          menu.removeAttribute("hidden");
          btn.classList.add("open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
      menu.querySelectorAll("[data-bd-cat], [data-bd-loc]").forEach((mi) => {
        mi.addEventListener("click", () => {
          onPick(mi);
          renderAll();
        });
      });
    };
    wireMenuButton("bd-cat-filter", "bd-cat-menu", (mi) => {
      activeCategory = mi.dataset.bdCat;
    });
    wireMenuButton("bd-loc-btn", "bd-loc-menu", (mi) => {
      activeLocation = mi.dataset.bdLoc;
    });
    if (!_boardMenusWired) {
      _boardMenusWired = true;
      document.addEventListener("click", (e) => {
        if (e.target.closest(".bd-cat-filter-wrap") || e.target.closest(".bd-loc-filter"))
          return;
        closeBoardMenus();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape")
          closeBoardMenus();
      });
      document.querySelector(".app-main")?.addEventListener("scroll", closeBoardMenus, { passive: true });
    }
    el.querySelectorAll(".cm-board-call").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
      }, { capture: true });
    });
    initBoardNoteExpand(el);
    requestAnimationFrame(() => {
      syncBoardBodyOffset();
      fitBoardAuthors();
    });
  }
  function renderBodyOnly() {
    const el = getBoardRoot();
    if (!el)
      return;
    const body = document.getElementById("bd-body");
    if (!body)
      return renderAll();
    body.innerHTML = renderBody();
    updateAdCount();
    body.querySelectorAll(".cm-board-call").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
      }, { capture: true });
    });
    initBoardNoteExpand(el);
    requestAnimationFrame(fitBoardAuthors);
  }
  var _boardCollapseRef = null;
  var _boardTabHookSet = false;
  function openAdModalStandalone(post) {
    if (!post)
      return;
    const backdrop = document.createElement("div");
    backdrop.className = "board-backdrop";
    backdrop.style.zIndex = "2599";
    const modal = document.createElement("article");
    modal.className = "cm-board-note cm-board-modal-note cm-board-modal--sheet";
    modal.style.zIndex = "2600";
    if (post.id != null)
      modal.dataset.postId = post.id;
    modal.innerHTML = renderAdModal(post);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    document.body.classList.add("cm-zoom-open");
    hydrateNames(modal);
    let closed = false;
    const close = () => {
      if (closed)
        return;
      closed = true;
      modal.classList.remove("visible");
      backdrop.classList.remove("visible");
      document.body.classList.remove("cm-zoom-open");
      setTimeout(() => {
        modal.remove();
        backdrop.remove();
      }, 240);
    };
    backdrop.addEventListener("click", close);
    const gallery = modal.querySelector(".cm-board-modal-gallery");
    if (gallery) {
      const photoUrls = [...gallery.querySelectorAll("[data-photo-full]")].map((im) => im.dataset.photoFull);
      gallery.querySelectorAll("img[data-photo-idx]").forEach((im) => {
        im.addEventListener("click", (e) => {
          e.stopPropagation();
          openPhotoLightbox2(photoUrls, Number(im.dataset.photoIdx) || 0);
        });
      });
      const dots = modal.querySelectorAll(".cm-board-modal-dot");
      if (dots.length) {
        gallery.addEventListener("scroll", () => {
          const i = gallery.clientWidth ? Math.round(gallery.scrollLeft / gallery.clientWidth) : 0;
          dots.forEach((d, di) => d.classList.toggle("active", di === i));
        }, { passive: true });
      }
    }
    const area = modal.querySelector(".cm-board-modal-scrollarea");
    const scroller = area || modal;
    const grip = modal.querySelector(".cm-board-modal-bar");
    let sY = 0, sX = 0, canSwipe = false, swiping = false;
    modal.addEventListener("touchstart", (e) => {
      const onGrip = grip && (e.target === grip || grip.contains(e.target));
      canSwipe = onGrip || scroller.scrollTop <= 2;
      sY = e.touches[0].clientY;
      sX = e.touches[0].clientX;
      swiping = false;
      if (canSwipe)
        modal.style.transition = "none";
    }, { passive: true });
    modal.addEventListener("touchmove", (e) => {
      if (!canSwipe)
        return;
      const dy = e.touches[0].clientY - sY;
      const dx = e.touches[0].clientX - sX;
      if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        canSwipe = false;
        return;
      }
      if (dy > 0) {
        e.preventDefault();
        swiping = true;
        modal.style.transform = `translate(-50%, calc(-50% + ${dy}px)) scale(1)`;
      } else if (swiping) {
        modal.style.transform = "translate(-50%, -50%) scale(1)";
      }
    }, { passive: false });
    modal.addEventListener("touchend", (e) => {
      if (!canSwipe)
        return;
      modal.style.transition = "";
      const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sY) - sY;
      if (swiping && dy > 90)
        close();
      else
        modal.style.transform = "";
      swiping = false;
      canSwipe = false;
    }, { passive: true });
    requestAnimationFrame(() => {
      backdrop.classList.add("visible");
      modal.classList.add("visible");
    });
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
      const post = allPosts.find((x) => String(x.id) === note.dataset.postId);
      if (note.dataset.postId)
        modal.dataset.postId = note.dataset.postId;
      modal.innerHTML = post ? renderAdModal(post) : `<div class="cm-board-modal-scrollarea"><div class="cm-board-modal-content">${note.innerHTML}</div></div>`;
      document.body.appendChild(modal);
      document.body.classList.add("cm-zoom-open");
      hydrateNames(modal);
      modal.querySelectorAll(".cm-board-call").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
        }, { capture: true });
      });
      const gallery = modal.querySelector(".cm-board-modal-gallery");
      if (gallery) {
        const photoUrls = [...gallery.querySelectorAll("[data-photo-full]")].map((im) => im.dataset.photoFull);
        gallery.querySelectorAll("img[data-photo-idx]").forEach((im) => {
          im.addEventListener("click", (e) => {
            e.stopPropagation();
            openPhotoLightbox2(photoUrls, Number(im.dataset.photoIdx) || 0);
          });
        });
        const dots = modal.querySelectorAll(".cm-board-modal-dot");
        if (dots.length) {
          gallery.addEventListener("scroll", () => {
            const i = gallery.clientWidth ? Math.round(gallery.scrollLeft / gallery.clientWidth) : 0;
            dots.forEach((d, di) => d.classList.toggle("active", di === i));
          }, { passive: true });
        }
      }
      const area = modal.querySelector(".cm-board-modal-scrollarea");
      const scroller = area || modal;
      const grip = modal.querySelector(".cm-board-modal-bar");
      let sY = 0, sX = 0, canSwipe = false, swiping = false;
      modal.addEventListener("touchstart", (e) => {
        const onGrip = grip && (e.target === grip || grip.contains(e.target));
        canSwipe = onGrip || scroller.scrollTop <= 2;
        sY = e.touches[0].clientY;
        sX = e.touches[0].clientX;
        swiping = false;
        if (canSwipe)
          modal.style.transition = "none";
      }, { passive: true });
      modal.addEventListener("touchmove", (e) => {
        if (!canSwipe)
          return;
        const dy = e.touches[0].clientY - sY;
        const dx = e.touches[0].clientX - sX;
        if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
          canSwipe = false;
          return;
        }
        if (dy > 0) {
          e.preventDefault();
          swiping = true;
          modal.style.transform = `translate(-50%, calc(-50% + ${dy}px)) scale(1)`;
        } else if (swiping) {
          modal.style.transform = "translate(-50%, -50%) scale(1)";
        }
      }, { passive: false });
      modal.addEventListener("touchend", (e) => {
        if (!canSwipe)
          return;
        modal.style.transition = "";
        const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sY) - sY;
        if (swiping && dy > 90)
          collapse();
        else
          modal.style.transform = "";
        swiping = false;
        canSwipe = false;
      }, { passive: true });
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
      document.body.classList.remove("cm-zoom-open");
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
    _boardCollapseRef = collapse;
    if (!_boardTabHookSet) {
      _boardTabHookSet = true;
      window.addEventListener("cstl-tab-changed", () => {
        if (_boardCollapseRef)
          _boardCollapseRef();
      });
    }
  }
  var _delegationAttached2 = false;
  function attachBoardDelegation() {
    if (_delegationAttached2)
      return;
    _delegationAttached2 = true;
    document.addEventListener("click", (e) => {
      const chatCard = e.target.closest("[data-chat-open]");
      if (chatCard && !e.target.closest(".bd-chat-modal") && !e.target.closest("[data-save-id]") && !e.target.closest("[data-share-board]") && !e.target.closest("[data-like-id]")) {
        const id = Number(chatCard.dataset.chatOpen);
        const post = allPosts.find((p) => p.id === id);
        if (post)
          openChatModal(post);
        return;
      }
      const msgBtn = e.target.closest("[data-open-chat]");
      if (msgBtn) {
        e.stopPropagation();
        const holder = msgBtn.closest("[data-post-id]");
        const id = holder ? Number(holder.dataset.postId) : null;
        const post = id != null ? allPosts.find((p) => p.id === id) : null;
        if (post)
          startChatFromPost(post);
        else
          showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0447\u0430\u0442", 2500);
        return;
      }
      if (e.target.closest("[data-comment-form]") || e.target.closest("[data-comment-input]")) {
        e.stopPropagation();
        return;
      }
      const saveBtn = e.target.closest("[data-save-id]");
      if (saveBtn) {
        e.stopPropagation();
        if (!isLoggedIn()) {
          requireAuth("\u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", () => {
          });
          return;
        }
        const id = Number(saveBtn.dataset.saveId);
        toggleSaved(id);
        const nowSaved = isSaved(id);
        saveBtn.innerHTML = nowSaved ? BOOKMARK_FILLED_SVG2 : BOOKMARK_OUTLINE_SVG2;
        saveBtn.classList.toggle("bd-bookmark--active", nowSaved);
        saveBtn.setAttribute("aria-label", nowSaved ? "\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445" : "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0443 \u041C\u043E\u0457");
        if (activeType === "saved" && !nowSaved) {
          document.querySelector("#board-backdrop.visible")?.click();
          renderBodyOnly();
        }
        return;
      }
      const likeBtn = e.target.closest("[data-like-id]");
      if (likeBtn) {
        e.stopPropagation();
        handleLikeClick(likeBtn);
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
    }, { capture: true });
  }
  var discOpen = false;
  function getBoardRoot() {
    return discOpen ? document.getElementById("disc-content") : document.getElementById("board-content");
  }
  function openDiscussions() {
    const boardEl = document.getElementById("board-content");
    if (boardEl)
      boardEl.innerHTML = "";
    discOpen = true;
    activeType = "chat";
    activeCategory = "all";
    searchQuery = "";
    if (allPosts && allPosts.length)
      renderAll();
    else
      renderBoard();
  }
  function closeDiscussions() {
    discOpen = false;
    activeType = "board";
    activeCategory = "all";
    searchQuery = "";
    const c = document.getElementById("disc-content");
    if (c)
      c.innerHTML = "";
    renderAll();
  }
  function setBoardActiveType(type) {
    if (!type)
      return;
    if (type === "chat") {
      window.switchTab("discussions");
      return;
    }
    activeType = type;
    activeCategory = "all";
    searchQuery = "";
    renderAll();
  }
  async function openChatById(postId) {
    if (!allPosts.length) {
      try {
        await renderBoard();
      } catch (_) {
      }
    }
    const post = allPosts.find((p) => p.id === postId);
    if (post)
      openChatModal(post);
  }
  var BOARD_BODY_GAP = 12;
  function syncBoardBodyOffset() {
    const root = getBoardRoot();
    if (!root)
      return;
    const controls = root.querySelector(".bd-controls");
    const body = root.querySelector(".bd-body");
    if (!controls || !body)
      return;
    if (controls.classList.contains("bd-controls--collapsed"))
      return;
    const h = controls.offsetHeight;
    if (h > 0)
      body.style.paddingTop = h + BOARD_BODY_GAP + "px";
  }
  function fitBoardAuthors() {
    const MAX = 12.5, MIN = 6.5, STEP = 0.5, PAD = 4;
    const range = document.createRange();
    document.querySelectorAll(".cm-board-foot").forEach((foot) => {
      if (!foot.clientWidth)
        return;
      const nameEl = foot.querySelector(".cm-board-foot-who .cm-board-author--card");
      const actions = foot.querySelector(".cm-board-foot-actions");
      if (!nameEl)
        return;
      const fcs = getComputedStyle(foot);
      const gap = parseFloat(fcs.columnGap) || parseFloat(fcs.gap) || 0;
      const avail = foot.clientWidth - (actions ? actions.offsetWidth : 0) - gap - PAD;
      let size = MAX;
      nameEl.style.fontSize = size + "px";
      range.selectNodeContents(nameEl);
      while (size > MIN && range.getBoundingClientRect().width > avail) {
        size -= STEP;
        nameEl.style.fontSize = size + "px";
        range.selectNodeContents(nameEl);
      }
    });
  }
  var _boardMenusWired = false;
  function closeBoardMenus() {
    [["bd-cat-menu", "bd-cat-filter"], ["bd-loc-menu", "bd-loc-btn"]].forEach(([menuId, btnId]) => {
      document.getElementById(menuId)?.setAttribute("hidden", "");
      const b = document.getElementById(btnId);
      if (b) {
        b.classList.remove("open");
        b.setAttribute("aria-expanded", "false");
      }
    });
  }
  var _headerCollapseWired = false;
  function setupHeaderCollapse() {
    if (_headerCollapseWired)
      return;
    const main = document.querySelector(".app-main");
    if (!main)
      return;
    _headerCollapseWired = true;
    const TOP_ZONE = 90;
    const HIDE_AFTER = 80;
    const SHOW_AFTER = 320;
    let lastY = main.scrollTop;
    let accDown = 0, accUp = 0;
    let collapsed = false;
    let ticking = false;
    const setCollapsed = (v) => {
      if (v === collapsed)
        return;
      collapsed = v;
      getBoardRoot()?.querySelector(".bd-controls")?.classList.toggle("bd-controls--collapsed", v);
    };
    const apply = () => {
      ticking = false;
      if (main.dataset.tab !== "board")
        return;
      const y = main.scrollTop;
      const dy = y - lastY;
      lastY = y;
      if (y <= TOP_ZONE) {
        setCollapsed(false);
        accDown = accUp = 0;
        return;
      }
      if (dy > 0) {
        accDown += dy;
        accUp = 0;
        if (accDown >= HIDE_AFTER)
          setCollapsed(true);
      } else if (dy < 0) {
        accUp -= dy;
        accDown = 0;
        if (accUp >= SHOW_AFTER)
          setCollapsed(false);
      }
    };
    main.addEventListener("scroll", () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    }, { passive: true });
    window.addEventListener("resize", () => requestAnimationFrame(() => {
      syncBoardBodyOffset();
      fitBoardAuthors();
    }), { passive: true });
  }
  function initBoard() {
    initDiscussionsEngine({ getPosts: () => allPosts });
    attachDiscussionsDelegation();
    attachDiscussionsRealtime();
    attachBoardDelegation();
    renderBoard();
    window.addEventListener("cstl-open-ad", (e) => {
      const p = e.detail && e.detail.post;
      if (p)
        openAdModalStandalone(p);
    });
    window.addEventListener("cstl-posts-changed", () => renderBoard());
    window.addEventListener("cstl-tab-changed", () => {
      const tab = document.querySelector(".app-main")?.dataset.tab;
      if (tab === "discussions" && !discOpen)
        openDiscussions();
      else if (tab !== "discussions" && discOpen)
        closeDiscussions();
      if (tab === "board" && activeLocation !== COMMUNITY_ALL) {
        activeLocation = COMMUNITY_ALL;
        renderAll();
      }
      if (tab === "board")
        requestAnimationFrame(() => {
          syncBoardBodyOffset();
          fitBoardAuthors();
        });
    });
    setupHeaderCollapse();
    onAuthChange(() => {
      if (!isLoggedIn()) {
        setSavedIds(/* @__PURE__ */ new Set());
        if (activeType === "saved")
          activeType = "board";
      }
      renderBoard();
      handleDiscussionsAuthChange();
    });
  }

  // src/tabs/news.js
  var allArticles = [];
  var SAVED_KEY = "cstl_saved_articles";
  function getSavedArticleIds() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function toggleSavedArticle(id) {
    const ids = getSavedArticleIds();
    const idx = ids.indexOf(id);
    if (idx === -1)
      ids.push(id);
    else
      ids.splice(idx, 1);
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
    return idx === -1;
  }
  var CATEGORY_COLORS = {
    "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E": "#37474f",
    // темно-сірий (новинний) — дефолт
    "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430": "#B45309",
    // теракот
    "\u0421\u043F\u043E\u0440\u0442": "#1565C0",
    // синій
    "\u0415\u043A\u043E\u043D\u043E\u043C\u0456\u043A\u0430": "#2E5E1F"
    // зелений (гроші)
  };
  var CATEGORY_ALIAS = {
    "\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0430": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u0412\u043B\u0430\u0434\u0430": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u0412\u0456\u0439\u043D\u0430": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u0422\u0435\u0445\u043D\u043E\u043B\u043E\u0433\u0456\u0457": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u041F\u0440\u0438\u0440\u043E\u0434\u0430": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u041E\u0441\u0432\u0456\u0442\u0430": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u0417\u0434\u043E\u0440\u043E\u0432\u02BC\u044F": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u0417\u0434\u043E\u0440\u043E\u0432'\u044F": "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E",
    "\u0406\u0441\u0442\u043E\u0440\u0456\u044F": "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430",
    "\u0411\u0456\u0437\u043D\u0435\u0441": "\u0415\u043A\u043E\u043D\u043E\u043C\u0456\u043A\u0430"
  };
  function normCategory(c) {
    return CATEGORY_ALIAS[c] || (CATEGORY_COLORS[c] ? c : "\u0421\u0443\u0441\u043F\u0456\u043B\u044C\u0441\u0442\u0432\u043E");
  }
  var GEO_COLORS = {
    "\u0413\u0440\u043E\u043C\u0430\u0434\u0430": "#722F37",
    // бордо — наш бренд (Олика + села громади)
    "\u041E\u043B\u0438\u043A\u0430": "#722F37",
    // стара назва — лишаємо для сумісності
    "\u0412\u043E\u043B\u0438\u043D\u044C": "#9e7508",
    // золотий
    "\u0423\u043A\u0440\u0430\u0457\u043D\u0430": "#0057B7",
    // синій
    "\u0421\u0432\u0456\u0442": "#546e7a",
    // нейтрально-сірий
    "\u0423\u043A\u0440\u0430\u0457\u043D\u0430 \u0442\u0430 \u0421\u0432\u0456\u0442": "#0057B7"
    // синій — злитий розділ (на випадок майбутнього geo)
  };
  function catColor2(c) {
    return CATEGORY_COLORS[normCategory(c)] || "#546e7a";
  }
  function geoColor(g) {
    return GEO_COLORS[g] || "#546e7a";
  }
  async function initNews() {
    await ensureNewsLoaded();
    attachNewsListeners();
  }
  function attachNewsListeners() {
    const modal = document.getElementById("article-modal");
    if (modal) {
      modal.addEventListener("error", handleImgError, true);
    }
  }
  function handleImgError(e) {
    const img = e.target;
    if (!img || img.tagName !== "IMG")
      return;
    const ph = document.createElement("div");
    ph.className = img.className + " img-fallback";
    ph.textContent = "\u{1F3F0}";
    img.replaceWith(ph);
  }
  function newsCardsHtml(articles, opts = {}) {
    if (!articles || articles.length === 0) {
      return '<div class="empty-state">\u041D\u043E\u0432\u0438\u043D \u0437\u0430 \u0446\u0438\u043C \u0444\u0456\u043B\u044C\u0442\u0440\u043E\u043C \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454</div>';
    }
    if (opts.compact)
      return articles.map(renderRow).join("");
    return articles.map((a, i) => i === 0 ? renderFeatured(a) : renderRow(a)).join("");
  }
  async function ensureNewsLoaded() {
    if (!allArticles.length) {
      try {
        const res = await fetch("./data/articles.json");
        allArticles = await res.json();
      } catch (e) {
        allArticles = [];
      }
    }
    return allArticles;
  }
  async function getArticlesByIds(ids) {
    await ensureNewsLoaded();
    return ids.map((id) => allArticles.find((a) => a.id === id)).filter(Boolean);
  }
  function badgesHtml(a) {
    return `
    <span class="news-badge news-badge--geo" style="background:${geoColor(a.geo)}">${escapeHtml(a.geo)}</span>
    <span class="news-badge news-badge--cat" style="background:${catColor2(a.category)}">${escapeHtml(normCategory(a.category))}</span>
    ${a.exclusive ? '<span class="news-badge news-badge--excl">\u2B50 \u0415\u043A\u0441\u043A\u043B\u044E\u0437\u0438\u0432</span>' : ""}
    ${a.imageType === "illustration" ? '<span class="news-badge news-badge--illus">\u{1F5BC} \u0406\u043B\u044E\u0441\u0442\u0440\u0430\u0446\u0456\u044F</span>' : ""}
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
  function decodeEntities(str) {
    const ta = document.createElement("textarea");
    ta.innerHTML = str || "";
    return ta.value;
  }
  function renderArticleBody(content) {
    const raw = content || "";
    if (/<(p|h2|h3|ul|ol|li|strong|em|blockquote|br)\b/i.test(raw))
      return raw;
    const text = decodeEntities(raw);
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
      <span class="news-card-category">${escapeHtml(normCategory(article.category))}</span>
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
    ${article.image && (article.imageType === "illustration" || article.imageCredit) ? `
      <div class="article-img-caption">
        ${article.imageType === "illustration" ? "<strong>\u0406\u043B\u044E\u0441\u0442\u0440\u0430\u0446\u0456\u044F.</strong> " : ""}${article.imageCredit ? "\u0424\u043E\u0442\u043E: " + escapeHtml(article.imageCredit) : ""}
      </div>` : ""}
    ${article.author ? `
      <div class="article-author"><span class="article-author-ic">${ICONS.user}</span><strong>\u0410\u0432\u0442\u043E\u0440:</strong> ${escapeHtml(article.author)}</div>
    ` : ""}
    <div class="article-body">${bodyHtml}</div>
    ${!article.exclusive && article.sourceUrl && !article.fullText && rawText.trim().length < 600 ? `
      <div class="article-short-note">
        \u0414\u0436\u0435\u0440\u0435\u043B\u043E \u043D\u0430\u0434\u0430\u0454 \u043B\u0438\u0448\u0435 \u0430\u043D\u043E\u043D\u0441 \u0447\u0435\u0440\u0435\u0437 RSS \u2014 \u043F\u043E\u0432\u043D\u0438\u0439 \u0442\u0435\u043A\u0441\u0442 \u043D\u0430 \u0441\u0430\u0439\u0442\u0456 \u0432\u0438\u0434\u0430\u043D\u043D\u044F.
        <a class="article-short-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">\u0427\u0438\u0442\u0430\u0442\u0438 \u043F\u043E\u0432\u043D\u0456\u0441\u0442\u044E \u2192</a>
      </div>
    ` : ""}
    <div class="article-source-row">
      <span class="article-source-author"><strong>\u0414\u0436\u0435\u0440\u0435\u043B\u043E:</strong><br>${escapeHtml(article.source)}</span>
      ${article.sourceUrl ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">\u0427\u0438\u0442\u0430\u0442\u0438 \u043E\u0440\u0438\u0433\u0456\u043D\u0430\u043B \u2192</a>` : ""}
    </div>
  `;
    const shareBtn = document.getElementById("modal-share-btn");
    const remindBtn = document.getElementById("modal-remind-btn");
    const saveBtn = document.getElementById("modal-save-btn");
    if (shareBtn)
      shareBtn.innerHTML = ICONS.share;
    if (remindBtn)
      remindBtn.innerHTML = ICONS.bell;
    if (saveBtn)
      saveBtn.innerHTML = ICONS.bookmark;
    if (shareBtn)
      shareBtn.onclick = () => sharePost({
        title: article.title,
        text: article.excerpt || "",
        url: article.sourceUrl || location.href
      });
    if (remindBtn)
      remindBtn.hidden = true;
    if (saveBtn) {
      saveBtn.hidden = false;
      saveBtn.classList.toggle("modal-icon-btn--active", getSavedArticleIds().includes(article.id));
      saveBtn.onclick = () => {
        const nowSaved = toggleSavedArticle(article.id);
        saveBtn.classList.toggle("modal-icon-btn--active", nowSaved);
        showToast(nowSaved ? "\u0421\u0442\u0430\u0442\u0442\u044E \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E" : "\u041F\u0440\u0438\u0431\u0440\u0430\u043D\u043E \u0437\u0456 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0438\u0445");
      };
    }
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
    const scrollBox = modal.querySelector(".article-modal-inner");
    if (scrollBox) {
      scrollBox.scrollTop = 0;
      requestAnimationFrame(() => {
        scrollBox.scrollTop = 0;
      });
    }
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
  var PENDING_UNSUB_KEY = "bus_pending_unsub_v1";
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
  var _bannerEntry = null;
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
  function pushBlockedMsg() {
    if (!isPushCapable())
      return "\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456 \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457";
    if (Notification.permission === "denied")
      return "\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u0432\u0438\u043C\u043A\u043D\u0435\u043D\u0456 \u0432 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445 \u2014 \u043D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F \u043D\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0438\u043C\u0443\u0442\u044C";
    return null;
  }
  async function subscribeToPush(routeId, routeName, boardingStop, alightingStop, trackDate, depTime) {
    if (trackDate < getTodayISO())
      return;
    try {
      const sub = await ensurePushSubscription();
      if (!sub)
        return;
      const subJson = sub.toJSON();
      const payload = {
        // uid залогіненого жителя (Етап 2). RLS-перепис вимагає user_uuid = auth.uid()::text.
        user_uuid: currentUserId() || getAnonId(),
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
      } else {
        removePendingUnsub(subJson.endpoint, routeId, trackDate);
      }
    } catch (err) {
      console.warn("[push] \u043F\u043E\u043C\u0438\u043B\u043A\u0430 \u043F\u0456\u0434\u043F\u0438\u0441\u043A\u0438:", err);
      showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F");
    }
  }
  async function unsubscribeFromPush(routeId, trackDate) {
    if (trackDate < getTodayISO())
      return;
    let endpoint = null;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub)
        return;
      endpoint = sub.endpoint;
      let res = await deletePushSubscription(endpoint, routeId, trackDate);
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await deletePushSubscription(endpoint, routeId, trackDate);
      }
      if (res.ok) {
        removePendingUnsub(endpoint, routeId, trackDate);
      } else {
        addPendingUnsub(endpoint, routeId, trackDate);
      }
    } catch (err) {
      console.warn("[push] unsubscribe error:", err);
      if (endpoint)
        addPendingUnsub(endpoint, routeId, trackDate);
    }
  }
  function loadPendingUnsub() {
    try {
      const d = JSON.parse(localStorage.getItem(PENDING_UNSUB_KEY));
      return Array.isArray(d) ? d : [];
    } catch {
      return [];
    }
  }
  function savePendingUnsub(list) {
    if (list.length)
      localStorage.setItem(PENDING_UNSUB_KEY, JSON.stringify(list));
    else
      localStorage.removeItem(PENDING_UNSUB_KEY);
  }
  function addPendingUnsub(endpoint, routeId, trackDate) {
    const list = loadPendingUnsub();
    if (!list.some((p) => p.endpoint === endpoint && p.routeId === routeId && p.trackDate === trackDate)) {
      list.push({ endpoint, routeId, trackDate });
      savePendingUnsub(list);
    }
  }
  function removePendingUnsub(endpoint, routeId, trackDate) {
    savePendingUnsub(loadPendingUnsub().filter((p) => !(p.endpoint === endpoint && p.routeId === routeId && p.trackDate === trackDate)));
  }
  async function flushPendingUnsub() {
    const today = getTodayISO();
    const list = loadPendingUnsub();
    if (!list.length)
      return;
    const remaining = [];
    for (const p of list) {
      if (p.trackDate < today)
        continue;
      const reTracked = trackedRoutes.some((t) => t.routeId === p.routeId && t.trackDate === p.trackDate);
      if (reTracked)
        continue;
      const res = await deletePushSubscription(p.endpoint, p.routeId, p.trackDate);
      if (!res.ok)
        remaining.push(p);
    }
    savePendingUnsub(remaining);
  }
  function trackKey() {
    return TRACK_KEY + ":" + (currentUserId() || "");
  }
  function loadTrackedRoute() {
    if (!isLoggedIn()) {
      trackedRoutes = [];
      return;
    }
    try {
      const today = getTodayISO();
      const d = JSON.parse(localStorage.getItem(trackKey()));
      if (Array.isArray(d?.routes)) {
        trackedRoutes = d.routes.filter((t) => t.trackDate >= today);
      } else {
        trackedRoutes = [];
      }
      if (!trackedRoutes.length)
        localStorage.removeItem(trackKey());
    } catch {
      trackedRoutes = [];
    }
  }
  function saveTrackedRoute() {
    if (isLoggedIn()) {
      if (!trackedRoutes.length)
        localStorage.removeItem(trackKey());
      else
        localStorage.setItem(trackKey(), JSON.stringify({ routes: trackedRoutes }));
    }
    window.dispatchEvent(new CustomEvent("cstl-bus-track-changed"));
  }
  async function hydrateTrackedFromDB() {
    if (!isLoggedIn())
      return;
    try {
      const rows = await fetchTrackedRoutesFromDB(currentUserId(), getTodayISO());
      let added = false;
      for (const r of rows) {
        const dup = trackedRoutes.some((t) => t.routeId === r.routeId && t.trackDate === r.trackDate && (t.boardingStop || null) === (r.boardingStop || null) && (t.alightingStop || null) === (r.alightingStop || null));
        if (!dup) {
          trackedRoutes.push(r);
          added = true;
        }
      }
      if (added)
        saveTrackedRoute();
    } catch (e) {
      console.warn("[bus] hydrateTrackedFromDB:", e && e.message);
    }
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
  function showBanner(label, route, isSubroute = false, entry = null) {
    const banner = document.getElementById("bus-track-banner");
    if (!banner)
      return;
    _bannerEntry = entry;
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
    updateBannerBell();
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
  function updateBannerBell() {
    const banner = document.getElementById("bus-track-banner");
    if (!banner)
      return;
    const bell = banner.querySelector(".btb-bell");
    const hint = banner.querySelector(".btb-hint");
    if (!bell || !hint || !_bannerEntry)
      return;
    const notify = _bannerEntry.notify !== false;
    const blocked = notify && !!pushBlockedMsg();
    bell.classList.remove("sr-bell--on", "sr-bell--off", "sr-bell--warn");
    if (!notify) {
      bell.classList.add("sr-bell--off");
      bell.innerHTML = SR_BELL_OFF_SVG;
      bell.setAttribute("aria-label", "\u041D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F \u0432\u0438\u043C\u043A\u043D\u0435\u043D\u0456 \u2014 \u043D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u0449\u043E\u0431 \u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438");
    } else if (blocked) {
      bell.classList.add("sr-bell--warn");
      bell.innerHTML = SR_BELL_ON_SVG;
      bell.setAttribute("aria-label", "\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456 \u2014 \u043D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C");
    } else {
      bell.classList.add("sr-bell--on");
      bell.innerHTML = SR_BELL_ON_SVG;
      bell.setAttribute("aria-label", "\u041D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F \u0443\u0432\u0456\u043C\u043A\u043D\u0435\u043D\u0456 \u2014 \u043D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u0449\u043E\u0431 \u0432\u0438\u043C\u043A\u043D\u0443\u0442\u0438");
    }
    hint.textContent = notify ? "\u0421\u041F\u041E\u0412\u0406\u0429\u0415\u041D\u041D\u042F \u041F\u0420\u041E \u0420\u0415\u0419\u0421 \u0410\u041A\u0422\u0418\u0412\u041E\u0412\u0410\u041D\u041E" : "\u0421\u041F\u041E\u0412\u0406\u0429\u0415\u041D\u041D\u042F \u041F\u0420\u041E \u0420\u0415\u0419\u0421 \u0412\u0418\u041C\u041A\u041D\u0415\u041D\u041E";
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
    _bannerEntry = null;
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
    if (tracked.notify === false)
      return;
    if (tracked.trackDate > today) {
      if (!tracked.notifiedFuture) {
        tracked.notifiedFuture = true;
        saveTrackedRoute();
        const dayRoutes2 = (busData?.days?.[tracked.trackDate] || {}).routes || [];
        const route2 = dayRoutes2.find((r) => r.id === tracked.routeId);
        if (!route2)
          return;
        const { heading: heading2, subDefault: subDefault2 } = buildBannerTexts(route2, tracked);
        showBanner(subDefault2, heading2, true, tracked);
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
        showBanner("\u0420\u0435\u0439\u0441 \u0441\u043A\u0430\u0441\u043E\u0432\u0430\u043D\u043E", heading, false, tracked);
      }
      return;
    }
    const state = getRouteState(route);
    const timings = getRouteTimings(route);
    if (state === "past") {
      unsubscribeFromPush(tracked.routeId, tracked.trackDate);
      removeTrackedEntry(tracked);
      return;
    }
    if (tracked.alightingStop) {
      const alightMins = getStopMins(route, tracked.alightingStop);
      if (alightMins !== null && nowMinutes() >= alightMins) {
        unsubscribeFromPush(tracked.routeId, tracked.trackDate);
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
                heading,
                false,
                tracked
              );
            return;
          }
        }
      }
      if (forceShow)
        showBanner("\u0412\u0436\u0435 \u0432 \u0434\u043E\u0440\u043E\u0437\u0456", heading, false, tracked);
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
          heading,
          false,
          tracked
        );
      return;
    }
    if (forceShow)
      showBanner(subDefault, heading, true, tracked);
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
    const clearHtml = current ? `<button class="bs-dd-clear" id="bs-dd-clear">${ICONS.close} \u041E\u0447\u0438\u0441\u0442\u0438\u0442\u0438 \u0432\u0438\u0431\u0456\u0440 (${escapeHtml(current)})</button>` : "";
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
      <button class="bs-dd-x" id="bs-dd-x">${ICONS.close}</button>
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
              <path d="M4 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>
              <path d="M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/>
              <path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8"/>
              <path d="M16 5l1.5 7l4.5 0"/>
              <path d="M2 10l15 0"/>
              <path d="M7 5l0 5"/>
              <path d="M12 5l0 5"/>
            </svg>
            <span class="bhv4-dyn"><span class="bhv4-status-text">${statusText}</span> <span class="bhv4-status-dot">${statusDot}</span></span>
          </span>
        </div>

        <div class="bhv4-body">
          <div class="bhv4-left">
            ${routeFullHtml}
            <div class="bhv4-route-name bhv4-dyn">${escapeHtml(hasSeg ? `${segFrom.toUpperCase()} \u2192 ${segTo.toUpperCase()}` : `${routeA.toUpperCase()} \u2192 ${routeB.toUpperCase()}`)}</div>
            <div class="bhv4-times-row">
              <span class="bhv4-time-capsule"><span class="bhv4-dyn bhv4-capsule-inner">${escapeHtml(fromTime || "\u2014")} \u2192 ${escapeHtml(toTime || "\u2014")}</span></span>
              <span class="bhv4-duration bhv4-dyn">${escapeHtml(durStr)}</span>
            </div>
            <div class="bhv4-next-stop bhv4-dyn">${escapeHtml(nextStopContent)}</div>
          </div>
        </div>

        <div class="bhv4-map-outer">${renderRouteMapV4(route, timings)}</div>
      </div>
    </div>`;
  }
  function emptyHeroMessage() {
    if (fromStop || toStop) {
      const seg = `${fromStop ? "\u0417 " + fromStop.toUpperCase() : ""}${fromStop && toStop ? " \u0414\u041E " : ""}${toStop ? toStop.toUpperCase() : ""}`;
      return `\u0420\u0415\u0419\u0421\u0406\u0412 ${seg} ${isViewingToday() ? "\u0421\u042C\u041E\u0413\u041E\u0414\u041D\u0406" : "\u041D\u0410 \u0426\u0415\u0419 \u0414\u0415\u041D\u042C"} \u041D\u0415\u041C\u0410\u0404`;
    }
    return isViewingToday() ? "\u0421\u042C\u041E\u0413\u041E\u0414\u041D\u0406 \u0420\u0415\u0419\u0421\u0406\u0412 \u0411\u0406\u041B\u042C\u0428\u0415 \u041D\u0415 \u0417\u0410\u041F\u041B\u0410\u041D\u041E\u0412\u0410\u041D\u041E" : "\u041D\u0410 \u0426\u0415\u0419 \u0414\u0415\u041D\u042C \u0420\u0415\u0419\u0421\u0406\u0412 \u041D\u0415 \u0417\u041D\u0410\u0419\u0414\u0415\u041D\u041E";
  }
  function buildEmptyHeroCard(msg) {
    return `
    <div class="bhv4 bhv4--empty">
      <img class="bhv4-bg-img" src="./images/bus-hero2.png" alt="" aria-hidden="true">
      <div class="bhv4-overlay"></div>
      <div class="bhv4-content bhv4-empty-content">
        <svg class="bhv4-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8"/><path d="M16 5l1.5 7l4.5 0"/><path d="M2 10l15 0"/><path d="M7 5l0 5"/><path d="M12 5l0 5"/>
        </svg>
        <div class="bhv4-empty-msg">${escapeHtml(msg)}</div>
      </div>
    </div>`;
  }
  function renderSmartRow() {
    const el = document.getElementById("bus-smart-row");
    if (!el)
      return;
    const routes = findActiveRoutes();
    if (!routes.length) {
      el.innerHTML = buildEmptyHeroCard(emptyHeroMessage());
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
            nameEl.insertAdjacentElement("beforebegin", fullEl);
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
        el.innerHTML = titleHtml0;
      } else {
        el.innerHTML = titleHtml0;
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
      el.innerHTML = buildListTitleHtml(updStr1) + `
      <button class="bus-show-all" id="bus-show-all-btn">
        \u041F\u043E\u043A\u0430\u0437\u0430\u0442\u0438 \u0432\u0441\u0456 ${all.length} \u0440\u0435\u0439\u0441\u0438 \u2193
      </button>`;
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
      const isTrackedNow = isRouteSegmentTracked(route.id) || !!trackedSeg && !anySegment;
      const trackBtnCls = isTrackedNow ? hasTrackedSeg ? " tracked-seg" : " tracked" : "";
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
          ${busDay >= getTodayISO() && !isPast && route.status !== "cancelled" ? `<button class="bs-track-btn${trackBtnCls}" data-track-id="${escapeHtml(route.id)}" aria-label="${isTrackedNow ? "\u041D\u0435 \u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0443\u0432\u0430\u0442\u0438" : "\u0412\u0456\u0434\u0441\u0442\u0435\u0436\u0438\u0442\u0438 \u043C\u0430\u0440\u0448\u0440\u0443\u0442"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>` : ""}
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
        const trackedSeg = btn.classList.contains("tracked-seg");
        if (tracked || trackedSeg) {
          const entry = findTrackedEntry(rid, fromStop || null, toStop || null) || trackedRoutes.find((t) => t.routeId === rid && t.trackDate === busDay);
          if (entry) {
            unsubscribeFromPush(entry.routeId, entry.trackDate);
            removeTrackedEntry(entry);
          }
          checkTrackNotifications(false);
        } else {
          if (!isLoggedIn()) {
            requireAuth("\u0432\u0456\u0434\u0441\u0442\u0435\u0436\u0443\u0432\u0430\u0442\u0438 \u0430\u0432\u0442\u043E\u0431\u0443\u0441", () => {
            });
            return;
          }
          const route = (getDayData().routes || []).find((r) => r.id === rid);
          const segFrom = fromStop || null;
          const segTo = toStop || null;
          const depTime = route ? getStopHHMM(route, getEffectiveFrom(route)) : null;
          const arrTime = route ? getStopHHMM(route, getEffectiveTo(route)) : null;
          const [rA, rB] = parseRouteEndpoints(route?.name || "");
          const isSeg = !!(segFrom && segTo && (segFrom.toUpperCase() !== rA.toUpperCase() || segTo.toUpperCase() !== rB.toUpperCase()));
          const title = isSeg ? `${segFrom} \u2192 ${segTo}` : `${rA} \u2192 ${rB}`;
          const fullTitle = `${rA} \u2192 ${rB}`;
          const stops = route?.stops || [];
          const fullDep = stops.length ? getStopHHMM(route, stops[0].name) : null;
          const fullArr = stops.length ? getStopHHMM(route, stops[stops.length - 1].name) : null;
          const fullTimeStr = fullDep && fullArr ? `${fullDep} \u2192 ${fullArr}` : fullDep || "";
          const existing = trackedRoutes.find((t) => t.routeId === rid && t.trackDate === busDay);
          trackedRoutes.push({
            routeId: rid,
            trackDate: busDay,
            boardingStop: segFrom,
            alightingStop: segTo,
            notify: true,
            // нагадування авто-увімкнені при збереженні
            title,
            // денормалізовано для модалки «Збережені»
            isSeg,
            // проміжний рейс → показати повний маршрут окремо
            fullTitle,
            // ВІД → ДО повного маршруту-батька
            fullTimeStr,
            // час повного маршруту HH:MM → HH:MM
            depTime: depTime || "",
            arrTime: arrTime || "",
            notifiedDep: existing ? existing.notifiedDep : false,
            notifiedWarning: existing ? existing.notifiedWarning : false,
            notifiedCanc: false,
            notifiedBoard: false,
            notifiedFuture: false
          });
          saveTrackedRoute();
          subscribeToPush(rid, route?.name || "", segFrom, segTo, busDay, depTime);
          const blocked = pushBlockedMsg();
          if (blocked)
            showToast(`\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E. ${blocked}`);
          checkTrackNotifications(true);
        }
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
    ${hasFilter ? `<div class="bs-filter-clear-row"><button class="bs-filter-clear-btn" id="bs-reset-btn">${ICONS.close} \u0421\u041A\u0418\u041D\u0423\u0422\u0418 \u0424\u0406\u041B\u042C\u0422\u0420</button></div>` : ""}
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
  var SR_BELL_ON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var SR_BELL_OFF_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  function savedRouteDayLabel(trackDate) {
    const today = getTodayISO();
    if (trackDate === today)
      return "\u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456";
    const [y, m, d] = today.split("-").map(Number);
    const tm = new Date(y, m - 1, d + 1);
    const tomorrow = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, "0")}-${String(tm.getDate()).padStart(2, "0")}`;
    if (trackDate === tomorrow)
      return "\u0437\u0430\u0432\u0442\u0440\u0430";
    const [, mm, dd] = trackDate.split("-");
    return `${dd}.${mm}`;
  }
  function pageForDate(iso) {
    const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (getWeekDays(0).some((d) => toIso(d) === iso))
      return 0;
    if (getWeekDays(1).some((d) => toIso(d) === iso))
      return 1;
    return 0;
  }
  function openSavedRouteOnBuses(rid, date, from, to) {
    busDay = date;
    weekPage = pageForDate(date);
    showAll = true;
    smartRowIndex = 0;
    fromStop = from || "";
    toStop = to || "";
    renderWeekStrip();
    renderSmartRow();
    renderRouteList();
    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-route-id="${CSS.escape(rid)}"]`);
      if (!card)
        return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("bus-card--flash");
      setTimeout(() => card.classList.remove("bus-card--flash"), 1500);
    });
  }
  function getSavedRoutesForUI() {
    return [...trackedRoutes].sort((a, b) => (a.trackDate + (a.depTime || "")).localeCompare(b.trackDate + (b.depTime || ""))).map((t) => ({
      routeId: t.routeId,
      trackDate: t.trackDate,
      from: t.boardingStop || null,
      to: t.alightingStop || null,
      title: t.title || `${t.boardingStop || "?"} \u2192 ${t.alightingStop || "?"}`,
      timeStr: t.depTime && t.arrTime ? `${t.depTime} \u2192 ${t.arrTime}` : t.depTime || "",
      dayLabel: savedRouteDayLabel(t.trackDate),
      notify: t.notify !== false,
      // Проміжний рейс: показуємо тільки коли є денормалізований повний маршрут
      // (старі записи без fullTitle малюються як звичайні — без падіння).
      isSegment: t.isSeg === true && !!t.fullTitle,
      fullTitle: t.fullTitle || "",
      fullTimeStr: t.fullTimeStr || ""
    }));
  }
  function toggleRouteReminders(rid, date, from, to) {
    const entry = findTrackedEntry(rid, from || null, to || null, date);
    if (!entry)
      return;
    if (entry.notify === false && !isLoggedIn()) {
      requireAuth("\u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F", () => {
      });
      return;
    }
    entry.notify = entry.notify === false;
    if (entry.notify) {
      subscribeToPush(rid, entry.title || "", from || null, to || null, date, entry.depTime || null);
    } else {
      unsubscribeFromPush(rid, date);
    }
    saveTrackedRoute();
  }
  async function requestPushForSavedRoute(rid, date, from, to) {
    if (!isLoggedIn()) {
      requireAuth("\u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F", () => {
      });
      return;
    }
    if (!isPushCapable()) {
      showToast("\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456 \u043D\u0430 \u0446\u044C\u043E\u043C\u0443 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457");
      return;
    }
    if (Notification.permission === "denied") {
      showToast("\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F \u0432\u0438\u043C\u043A\u043D\u0435\u043D\u0456 \u0432 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F\u0445 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443/\u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430. \u0423\u0432\u0456\u043C\u043A\u043D\u0456\u0442\u044C \u0457\u0445, \u0449\u043E\u0431 \u043E\u0442\u0440\u0438\u043C\u0443\u0432\u0430\u0442\u0438 \u043D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F.");
      return;
    }
    const entry = findTrackedEntry(rid, from || null, to || null, date);
    if (!entry)
      return;
    await subscribeToPush(rid, entry.title || "", from || null, to || null, date, entry.depTime || null);
    updateBannerBell();
  }
  function selfHealPushSubscriptions() {
    if (!isPushCapable() || Notification.permission !== "granted")
      return;
    const today = getTodayISO();
    for (const t of trackedRoutes) {
      if (t.notify !== false && t.trackDate >= today) {
        subscribeToPush(t.routeId, t.title || "", t.boardingStop || null, t.alightingStop || null, t.trackDate, t.depTime || null);
      }
    }
  }
  function initSavedRoutesHeader() {
    loadTrackedRoute();
    window.addEventListener("cstl-bus-track-changed", updateBannerBell);
    onAuthChange(async () => {
      loadTrackedRoute();
      await hydrateTrackedFromDB();
      if (document.getElementById("bus-list")) {
        renderSmartRow();
        renderRouteList();
      }
      window.dispatchEvent(new CustomEvent("cstl-bus-track-changed"));
    });
  }
  async function initBuses() {
    const el = document.getElementById("buses-content");
    if (!el)
      return;
    loadPrefs();
    loadTrackedRoute();
    selfHealPushSubscriptions();
    flushPendingUnsub();
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
        <button class="btb-bell sr-bell sr-bell--on" type="button" aria-label="\u041D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F">${SR_BELL_ON_SVG}</button>
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
      const _btbBell = banner.querySelector(".btb-bell");
      if (_btbBell)
        _btbBell.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!_bannerEntry)
            return;
          const from = _bannerEntry.boardingStop || null;
          const to = _bannerEntry.alightingStop || null;
          if (_btbBell.classList.contains("sr-bell--warn")) {
            await requestPushForSavedRoute(_bannerEntry.routeId, _bannerEntry.trackDate, from, to);
          } else {
            toggleRouteReminders(_bannerEntry.routeId, _bannerEntry.trackDate, from, to);
          }
          updateBannerBell();
          if (_bannerHideTimer) {
            clearTimeout(_bannerHideTimer);
          }
          _bannerHideTimer = setTimeout(() => {
            hideBanner();
            _bannerHideTimer = null;
          }, 4e3);
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

  // src/core/saved-hub.js
  var _sheet = null;
  var _backdrop = null;
  var _view = "categories";
  var _data = { articles: [], buses: [], chats: [], boards: [], loggedIn: false };
  var CATS = [
    { key: "articles", icon: ICONS.newspaper, label: "\u0421\u0442\u0430\u0442\u0442\u0456", needsAuth: false },
    { key: "buses", icon: ICONS.bus, label: "\u0410\u0432\u0442\u043E\u0431\u0443\u0441\u0438", needsAuth: false },
    { key: "chats", icon: ICONS.message, label: "\u041E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", needsAuth: true },
    { key: "boards", icon: ICONS.pin, label: "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", needsAuth: true }
  ];
  function closeHub() {
    if (!_sheet)
      return;
    const s = _sheet, b = _backdrop;
    _sheet = null;
    _backdrop = null;
    s.classList.remove("visible");
    b?.classList.remove("visible");
    document.body.classList.remove("modal-open");
    setTimeout(() => {
      s.remove();
      b?.remove();
    }, 240);
  }
  function cardHtml(p, type) {
    const when = new Date(p.created_at || p.ts || Date.now()).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
    return `
    <button class="shub-card" type="button" data-shub-open="${p.id}" data-shub-type="${type}">
      <span class="shub-card-text">${escapeHtml(p.title || p.text || "(\u0431\u0435\u0437 \u0442\u0435\u043A\u0441\u0442\u0443)")}</span>
      <span class="shub-card-meta">${escapeHtml(when)}</span>
    </button>`;
  }
  function busCardHtml(r) {
    return `
    <button class="shub-card" type="button" data-shub-type="bus"
            data-shub-rid="${escapeHtml(r.routeId)}" data-shub-date="${escapeHtml(r.trackDate)}"
            data-shub-from="${escapeHtml(r.from || "")}" data-shub-to="${escapeHtml(r.to || "")}">
      <span class="shub-card-text">${escapeHtml(r.title)}</span>
      <span class="shub-card-meta">${escapeHtml(r.dayLabel || r.trackDate)}${r.timeStr ? " \xB7 " + escapeHtml(r.timeStr) : ""}</span>
    </button>`;
  }
  async function loadData() {
    const data = { articles: [], buses: [], chats: [], boards: [], loggedIn: isLoggedIn(), postsError: false };
    try {
      const artIds = [...getSavedArticleIds()].reverse();
      if (artIds.length)
        data.articles = await getArticlesByIds(artIds);
    } catch (e) {
      console.warn("[saved-hub] articles", e);
    }
    try {
      data.buses = getSavedRoutesForUI();
    } catch (e) {
      console.warn("[saved-hub] buses", e);
    }
    if (data.loggedIn) {
      try {
        const ids = [...await fetchSavedPostIds(currentUserId())];
        if (ids.length) {
          const supa2 = getSupabase();
          const { data: posts2, error } = await supa2.from("posts").select("*").in("id", ids).order("created_at", { ascending: false });
          if (error)
            throw error;
          data.chats = (posts2 || []).filter((p) => p.type === "chat");
          data.boards = (posts2 || []).filter((p) => p.type !== "chat");
        }
      } catch (e) {
        console.warn("[saved-hub] posts", e);
        data.postsError = true;
      }
    }
    return data;
  }
  function categoriesScreenHtml() {
    const rows = CATS.map((c) => {
      const count = _data[c.key].length;
      const locked = c.needsAuth && !_data.loggedIn;
      if (!count && !locked)
        return "";
      return `
      <button class="shub-cat-row" type="button" data-shub-cat="${c.key}">
        <span class="shub-cat-ic">${c.icon}</span>
        <span class="shub-cat-label">${c.label}</span>
        ${locked ? `<span class="shub-cat-lock">${ICONS.lock}</span>` : `<span class="shub-count">${count}</span>`}
        <span class="shub-cat-chev">\u203A</span>
      </button>`;
    }).filter(Boolean).join("");
    if (!rows) {
      return `<div class="shub-empty">\u041F\u043E\u043A\u0438 \u043D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E.<br>
      <span class="shub-hint">\u0422\u0440\u0438\u043C\u0430\u0439\u0442\u0435 \u043F\u0440\u0430\u043F\u043E\u0440\u0435\u0446\u044C ${ICONS.bookmark} \u043D\u0430 \u043A\u0430\u0440\u0442\u0446\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F, \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F \u0447\u0438 \u0441\u0442\u0430\u0442\u0442\u0456 \u2014 \u0456 \u0432\u043E\u043D\u043E \u0437\u02BC\u044F\u0432\u0438\u0442\u044C\u0441\u044F \u0442\u0443\u0442.</span></div>`;
    }
    return `<div class="shub-cats">${rows}</div>`;
  }
  function detailHead(cat) {
    return `
    <div class="shub-detail-head">
      <button class="shub-back" type="button" data-shub-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
      <span class="shub-detail-title">${cat.icon} ${cat.label}</span>
    </div>`;
  }
  var EMPTY_DETAIL = `<div class="shub-empty">\u0422\u0443\u0442 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E.</div>`;
  function categoryScreenHtml(key) {
    const cat = CATS.find((c) => c.key === key);
    if (!cat) {
      _view = "categories";
      return categoriesScreenHtml();
    }
    if (cat.needsAuth && !_data.loggedIn) {
      return detailHead(cat) + `<div class="shub-hint-block">\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C, \u0449\u043E\u0431 \u0431\u0430\u0447\u0438\u0442\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0439 \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F.<br>
      <button class="shub-login" type="button" id="shub-login">\u0423\u0432\u0456\u0439\u0442\u0438</button></div>`;
    }
    if (key === "buses") {
      return detailHead(cat) + (_data.buses.map(busCardHtml).join("") || EMPTY_DETAIL);
    }
    if (key === "articles") {
      return detailHead(cat) + (_data.articles.map((p) => cardHtml(p, "article")).join("") || EMPTY_DETAIL);
    }
    const type = key === "chats" ? "chat" : "board";
    return detailHead(cat) + (_data[key].map((p) => cardHtml(p, type)).join("") || EMPTY_DETAIL);
  }
  function render() {
    const bodyEl = _sheet?.querySelector("#shub-body");
    if (!bodyEl)
      return;
    bodyEl.innerHTML = _view === "categories" ? categoriesScreenHtml() : categoryScreenHtml(_view);
  }
  function openSavedHub() {
    if (_sheet)
      return;
    _view = "categories";
    _backdrop = document.createElement("div");
    _backdrop.className = "board-backdrop shub-backdrop";
    _sheet = document.createElement("div");
    _sheet.className = "shub-sheet";
    _sheet.innerHTML = `
    <div class="shub-handle"></div>
    <div class="shub-title">${ICONS.bookmark} \u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456</div>
    <div class="shub-body" id="shub-body"><div class="shub-empty">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>`;
    document.body.appendChild(_backdrop);
    document.body.appendChild(_sheet);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      _backdrop.classList.add("visible");
      _sheet.classList.add("visible");
    });
    _backdrop.addEventListener("click", closeHub);
    _sheet.addEventListener("click", (e) => {
      if (e.target.closest("#shub-login")) {
        closeHub();
        requireAuth("\u0431\u0430\u0447\u0438\u0442\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456", () => {
        });
        return;
      }
      if (e.target.closest("[data-shub-back]")) {
        _view = "categories";
        render();
        return;
      }
      const catRow = e.target.closest("[data-shub-cat]");
      if (catRow) {
        _view = catRow.dataset.shubCat;
        render();
        return;
      }
      const busCard = e.target.closest('[data-shub-type="bus"]');
      if (busCard) {
        const { shubRid, shubDate, shubFrom, shubTo } = busCard.dataset;
        closeHub();
        window.switchTab && window.switchTab("buses");
        openSavedRouteOnBuses(shubRid, shubDate, shubFrom || null, shubTo || null);
        return;
      }
      const card = e.target.closest("[data-shub-open]");
      if (!card)
        return;
      const id = Number(card.dataset.shubOpen);
      const type = card.dataset.shubType;
      closeHub();
      if (type === "article") {
        openArticle(id);
      } else if (type === "chat") {
        window.switchTab && window.switchTab("discussions");
        openChatById(id);
      } else {
        window.switchTab && window.switchTab("board");
        setBoardActiveType("saved");
      }
    });
    loadData().then((data) => {
      _data = data;
      render();
    });
  }
  function initSavedHub() {
    document.getElementById("saved-hub-btn")?.addEventListener("click", openSavedHub);
  }

  // src/core/account-ui.js
  var _newUserChecked = false;
  function refreshAccountButtons() {
    const av = isLoggedIn() ? currentAvatarUrl() : "";
    document.querySelectorAll("[data-account-btn]").forEach((btn) => {
      if (!btn.dataset.defaultHtml)
        btn.dataset.defaultHtml = btn.innerHTML;
      btn.innerHTML = av ? `<span class="account-btn-av"><img src="${escapeHtml(av)}" alt="" loading="lazy"></span>` : btn.dataset.defaultHtml;
      btn.classList.toggle("account-btn--in", isLoggedIn());
      btn.classList.toggle("account-btn--av", !!av);
      btn.setAttribute("aria-label", isLoggedIn() ? "\u041A\u0430\u0431\u0456\u043D\u0435\u0442 \u0436\u0438\u0442\u0435\u043B\u044F" : "\u0423\u0432\u0456\u0439\u0442\u0438");
    });
  }
  var updateHeaderBtn = refreshAccountButtons;
  function closeModal2() {
    closeModal();
  }
  function openModal2(innerHtml) {
    const { el } = openModal({ bodyHtml: innerHtml, variant: "center" });
    return el;
  }
  function openJoin(reason) {
    const sub = reason ? `\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C, \u0449\u043E\u0431 ${escapeHtml(reason)}.` : "\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044C, \u0449\u043E\u0431 \u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F, \u043F\u0438\u0441\u0430\u0442\u0438 \u0439 \u0440\u0435\u0430\u0433\u0443\u0432\u0430\u0442\u0438.";
    const wrap = openModal2(`
    <div class="acc-emoji">\u{1F464}</div>
    <h2 class="acc-title">\u041F\u0440\u0438\u0454\u0434\u043D\u0430\u0439\u0442\u0435\u0441\u044C \u0434\u043E \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h2>
    <p class="acc-sub">${sub}</p>
    <button class="acc-google" type="button">
      <span class="acc-g">G</span> \u0423\u0432\u0456\u0439\u0442\u0438 \u0437 Gmail
    </button>
    <button class="acc-skip" type="button">\u041F\u043E\u043A\u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u0438</button>`);
    wrap.querySelector(".acc-google").addEventListener("click", () => signInWithGoogle());
    wrap.querySelector(".acc-skip").addEventListener("click", closeModal2);
  }
  function openProfile() {
    const u = currentUser();
    if (!u)
      return;
    const defaultName = u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name) || "";
    const wrap = openModal2(`
    <h2 class="acc-title">\u0420\u0430\u0434\u0456 \u0432\u0430\u0441 \u0431\u0430\u0447\u0438\u0442\u0438!</h2>
    <label class="acc-label">\u0406\u043C'\u044F</label>
    <input class="acc-input" id="acc-name" type="text" placeholder="\u0412\u0430\u0448\u0435 \u0456\u043C'\u044F" value="${escapeHtml(defaultName)}">
    <label class="acc-label">\u0414\u0430\u0442\u0430 \u043D\u0430\u0440\u043E\u0434\u0436\u0435\u043D\u043D\u044F</label>
    <input class="acc-input" id="acc-bdate" type="date" max="${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}">
    <button class="acc-primary" type="button" id="acc-save">\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438</button>
    <button class="acc-skip" type="button" id="acc-later">\u041F\u0456\u0437\u043D\u0456\u0448\u0435</button>`);
    const finish = async (withDate) => {
      const name = wrap.querySelector("#acc-name").value.trim();
      const bd = wrap.querySelector("#acc-bdate").value;
      const res = await saveProfile({ name, birth_date: withDate ? bd : null });
      if (!res.ok) {
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438: " + res.error, 4e3, "error");
        return;
      }
      closeModal2();
      if (withDate)
        showToast("\u041F\u0440\u043E\u0444\u0456\u043B\u044C \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E", 2500);
    };
    wrap.querySelector("#acc-save").addEventListener("click", () => finish(true));
    wrap.querySelector("#acc-later").addEventListener("click", () => finish(false));
  }
  var NOTIF_KEYS = [
    { k: "buses", ic: ICONS.bus, label: "\u0410\u0432\u0442\u043E\u0431\u0443\u0441\u0438", def: true },
    { k: "power", ic: ICONS.bulb, label: "\u0421\u0432\u0456\u0442\u043B\u043E", def: true },
    { k: "news", ic: ICONS.newspaper, label: "\u041D\u043E\u0432\u0438\u043D\u0438", def: false },
    { k: "board", ic: ICONS.pin, label: "\u0414\u043E\u0448\u043A\u0430", def: true }
  ];
  function loadNotifPrefs(uid) {
    try {
      const raw = JSON.parse(localStorage.getItem("notif_prefs:" + uid) || "{}");
      const out = {};
      NOTIF_KEYS.forEach((n) => {
        out[n.k] = n.k in raw ? !!raw[n.k] : n.def;
      });
      return out;
    } catch {
      const o = {};
      NOTIF_KEYS.forEach((n) => o[n.k] = n.def);
      return o;
    }
  }
  function saveNotifPrefs(uid, prefs) {
    try {
      localStorage.setItem("notif_prefs:" + uid, JSON.stringify(prefs));
    } catch {
    }
  }
  function closeCabinet() {
    const c = document.getElementById("acc-cab");
    if (!c)
      return;
    c.classList.remove("open");
    document.body.classList.remove("modal-open");
    setTimeout(() => c.remove(), 240);
  }
  async function openAccount() {
    const u = currentUser();
    if (!u)
      return;
    const p = await getProfile() || {};
    const email = u.email || "";
    const gName = u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name) || "";
    const val = {
      name: p.name || gName || "",
      surname: p.surname || "",
      birth_date: p.birth_date || "",
      phone: p.phone || "",
      settlement: p.settlement || "",
      street: p.street || "",
      bio: p.bio || "",
      avatar_url: p.avatar_url || ""
    };
    const fullName = [val.name, val.surname].filter(Boolean).join(" ") || "\u0416\u0438\u0442\u0435\u043B\u044C";
    const place = val.settlement || "\u0423\u0447\u0430\u0441\u043D\u0438\u043A \u0441\u043F\u0456\u043B\u044C\u043D\u043E\u0442\u0438";
    const prefs = loadNotifPrefs(u.id);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const trustHtml = p.trusted ? `<div class="acc-cab-trust acc-cab-trust--on">${ICONS.check} \u0414\u043E\u0432\u0456\u0440\u0435\u043D\u0438\u0439 \u0430\u0432\u0442\u043E\u0440 \u2014 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u043F\u0443\u0431\u043B\u0456\u043A\u0443\u044E\u0442\u044C\u0441\u044F \u043E\u0434\u0440\u0430\u0437\u0443</div>` : `<div class="acc-cab-trust">${ICONS.star} ${p.approved_count || 0}/5 \u0441\u0445\u0432\u0430\u043B\u0435\u043D\u044C \u0434\u043E \u0430\u0432\u0442\u043E\u043F\u0443\u0431\u043B\u0456\u043A\u0430\u0446\u0456\u0457</div>`;
    const field = (ic, label, control) => `
    <label class="acc-f">
      <span class="acc-f-ic">${ic}</span>
      <span class="acc-f-body"><span class="acc-f-lbl">${label}</span>${control}</span>
      <i class="acc-f-chev">${ICONS.chevronRight}</i>
    </label>`;
    const navRow = (go, ic, name, desc) => `
    <button class="acc-cab-row" data-go="${go}" type="button">
      <span class="acc-cab-row-ic">${ic}</span>
      <span class="acc-cab-row-body"><span class="acc-cab-row-name">${name}</span><span class="acc-cab-row-desc">${desc}</span></span>
      <i>${ICONS.chevronRight}</i>
    </button>`;
    const cab = document.createElement("div");
    cab.id = "acc-cab";
    cab.className = "acc-cab";
    cab.innerHTML = `
    <div class="acc-cab-top">
      <button class="acc-cab-back" type="button" aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
      <b>\u041C\u0456\u0439 \u043A\u0430\u0431\u0456\u043D\u0435\u0442</b>
    </div>
    <div class="acc-cab-scroll">
      <div class="acc-cab-hero">
        <div class="acc-cab-avwrap">
          <div class="acc-cab-av" id="acc-hero-av">${avatarCircle({ name: fullName, url: val.avatar_url, cls: "acc-av" })}</div>
          <button class="acc-cab-avcam" type="button" id="acc-av-btn" aria-label="\u0417\u043C\u0456\u043D\u0438\u0442\u0438 \u0444\u043E\u0442\u043E">${ICONS.photo}</button>
          <input type="file" id="acc-av-file" accept="image/*" hidden>
        </div>
        <div class="acc-cab-hi">
          <div class="acc-cab-name" id="acc-hero-name">${escapeHtml(fullName)}</div>
          <div class="acc-cab-email">${escapeHtml(email)}</div>
          <div class="acc-cab-place" id="acc-hero-place">${escapeHtml(place)}</div>
          ${trustHtml}
        </div>
      </div>

      <div class="acc-cab-sec">
        <h3>\u041C\u043E\u0457 \u0434\u0430\u043D\u0456</h3>
        ${field(ICONS.user, "\u0406\u043C'\u044F", `<input id="cf-name" type="text" value="${escapeHtml(val.name)}" placeholder="\u0412\u0430\u0448\u0435 \u0456\u043C'\u044F">`)}
        ${field(ICONS.clipboard, "\u041F\u0440\u0456\u0437\u0432\u0438\u0449\u0435", `<input id="cf-surname" type="text" value="${escapeHtml(val.surname)}" placeholder="\u041F\u0440\u0456\u0437\u0432\u0438\u0449\u0435">`)}
        ${field(ICONS.calendar, "\u0414\u0430\u0442\u0430 \u043D\u0430\u0440\u043E\u0434\u0436\u0435\u043D\u043D\u044F", `<input id="cf-bdate" type="date" max="${today}" value="${escapeHtml(val.birth_date)}">`)}
        ${field(ICONS.phone, "\u0422\u0435\u043B\u0435\u0444\u043E\u043D (\u0434\u043B\u044F \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C)", `<input id="cf-phone" type="tel" value="${escapeHtml(val.phone)}" placeholder="+380\u2026">`)}
        ${field(ICONS.pin, "\u041D\u0430\u0441\u0435\u043B\u0435\u043D\u0438\u0439 \u043F\u0443\u043D\u043A\u0442", `<select id="cf-settlement">
            <option value="">\u2014 \u043E\u0431\u0435\u0440\u0456\u0442\u044C \u2014</option>
            ${[...SETTLEMENTS, OTHER_SETTLEMENT].map((s) => `<option ${val.settlement === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>`)}
        ${field(ICONS.home, "\u0412\u0443\u043B\u0438\u0446\u044F (\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)", `<input id="cf-street" type="text" value="${escapeHtml(val.street)}" placeholder="\u043D\u0430\u043F\u0440. \u0432\u0443\u043B. \u0417\u0430\u043C\u043A\u043E\u0432\u0430">`)}
        ${field(ICONS.fileText, "\u041F\u0440\u043E \u0441\u0435\u0431\u0435", `<textarea id="cf-bio" rows="2" placeholder="\u041A\u0456\u043B\u044C\u043A\u0430 \u0441\u043B\u0456\u0432\u2026">${escapeHtml(val.bio)}</textarea>`)}
      </div>
      <button class="acc-cab-save" type="button" id="cf-save">\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0430\u043D\u043A\u0435\u0442\u0443</button>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>\u041C\u043E\u0454</h3>
        ${navRow("myads", ICONS.megaphone, "\u041C\u043E\u0457 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F", "\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u0434 \u0456 \u043A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F \u0432\u0430\u0448\u0438\u043C\u0438 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F\u043C\u0438")}
        ${navRow("saved", ICONS.bookmark, "\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0456", "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0439 \u0441\u0442\u0430\u0442\u0442\u0456, \u044F\u043A\u0456 \u0432\u0438 \u0437\u0431\u0435\u0440\u0435\u0433\u043B\u0438")}
        ${navRow("msgs", ICONS.message, "\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F", "\u041E\u0441\u043E\u0431\u0438\u0441\u0442\u0456 \u0447\u0430\u0442\u0438 \u0437 \u0456\u043D\u0448\u0438\u043C\u0438 \u0436\u0438\u0442\u0435\u043B\u044F\u043C\u0438")}
      </div>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F</h3>
        ${NOTIF_KEYS.map((n) => `
          <div class="acc-cab-row acc-cab-row--tog">
            <span class="acc-cab-row-ic">${n.ic}</span>
            <span class="acc-cab-row-body"><span class="acc-cab-row-name">${n.label}</span></span>
            <button class="acc-tog${prefs[n.k] ? "" : " off"}" data-notif="${n.k}" type="button" aria-label="${n.label}"></button>
          </div>`).join("")}
      </div>

      <button class="acc-cab-logout" type="button" id="cf-logout">\u0412\u0438\u0439\u0442\u0438</button>
    </div>`;
    document.body.appendChild(cab);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => cab.classList.add("open"));
    cab.querySelector(".acc-cab-back").addEventListener("click", closeCabinet);
    const avBtn = cab.querySelector("#acc-av-btn");
    const avFile = cab.querySelector("#acc-av-file");
    const avBox = cab.querySelector("#acc-hero-av");
    const removeAvatar = async () => {
      avBtn.disabled = true;
      avBox.classList.add("acc-av--loading");
      try {
        const res = await saveProfile({ avatar_url: null });
        if (!res.ok)
          throw new Error(res.error || "save");
        val.avatar_url = "";
        avBox.innerHTML = avatarCircle({ name: cab.querySelector("#acc-hero-name").textContent, url: "", cls: "acc-av" });
        updateHeaderBtn();
        showToast("\u0424\u043E\u0442\u043E \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E", 2200);
      } catch (err) {
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u0444\u043E\u0442\u043E: " + err.message, 4e3, "error");
      } finally {
        avBtn.disabled = false;
        avBox.classList.remove("acc-av--loading");
      }
    };
    avBtn.addEventListener("click", () => {
      if (!val.avatar_url) {
        avFile.click();
        return;
      }
      const menu = openModal({
        variant: "sheet",
        className: "app-modal--top",
        // поверх екрана кабінету (3100), інакше ховається під ним
        bodyHtml: `
        <div class="acc-avmenu">
          <button type="button" class="acc-avmenu-item" data-av-act="change">${ICONS.photo} \u0417\u043C\u0456\u043D\u0438\u0442\u0438 \u0444\u043E\u0442\u043E</button>
          <button type="button" class="acc-avmenu-item acc-avmenu-item--danger" data-av-act="remove">${ICONS.trash} \u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u0444\u043E\u0442\u043E</button>
        </div>`
      });
      menu.el.querySelector('[data-av-act="change"]').addEventListener("click", () => {
        closeModal();
        avFile.click();
      });
      menu.el.querySelector('[data-av-act="remove"]').addEventListener("click", () => {
        closeModal();
        removeAvatar();
      });
    });
    avFile.addEventListener("change", async () => {
      const file = avFile.files && avFile.files[0];
      avFile.value = "";
      if (!file)
        return;
      avBtn.disabled = true;
      avBox.classList.add("acc-av--loading");
      try {
        const blob = await squareImageBlob(file, 256);
        const { url, error } = await uploadPhotoToStorage(blob, "avatars/");
        if (!url)
          throw new Error(error || "upload");
        const res = await saveProfile({ avatar_url: url });
        if (!res.ok)
          throw new Error(res.error || "save");
        val.avatar_url = url;
        avBox.innerHTML = avatarCircle({ name: cab.querySelector("#acc-hero-name").textContent, url, cls: "acc-av" });
        updateHeaderBtn();
        showToast("\u2705 \u0424\u043E\u0442\u043E \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043E", 2200);
      } catch (err) {
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 \u0444\u043E\u0442\u043E: " + err.message, 4e3, "error");
      } finally {
        avBtn.disabled = false;
        avBox.classList.remove("acc-av--loading");
      }
    });
    cab.querySelector("#cf-save").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "\u0417\u0431\u0435\u0440\u0456\u0433\u0430\u0454\u043C\u043E\u2026";
      const fields = {
        name: cab.querySelector("#cf-name").value.trim(),
        surname: cab.querySelector("#cf-surname").value.trim(),
        birth_date: cab.querySelector("#cf-bdate").value || null,
        phone: cab.querySelector("#cf-phone").value.trim(),
        settlement: cab.querySelector("#cf-settlement").value,
        street: cab.querySelector("#cf-street").value.trim(),
        bio: cab.querySelector("#cf-bio").value.trim()
      };
      const res = await saveProfile(fields);
      btn.disabled = false;
      btn.textContent = "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 \u0430\u043D\u043A\u0435\u0442\u0443";
      if (!res.ok) {
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438: " + res.error, 4e3, "error");
        return;
      }
      cab.querySelector("#acc-hero-name").textContent = [fields.name, fields.surname].filter(Boolean).join(" ") || "\u0416\u0438\u0442\u0435\u043B\u044C";
      cab.querySelector("#acc-hero-place").textContent = fields.settlement || "\u0423\u0447\u0430\u0441\u043D\u0438\u043A \u0441\u043F\u0456\u043B\u044C\u043D\u043E\u0442\u0438";
      if (res.partial) {
        showToast("\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u0456\u043C\u02BC\u044F \u0456 \u0434\u0430\u0442\u0443. \u0421\u0435\u043B\u043E/\u0442\u0435\u043B\u0435\u0444\u043E\u043D \u043F\u043E\u043A\u0438 \u043D\u0435 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u044E\u0442\u044C\u0441\u044F \u2014 \u0431\u0430\u0437\u0443 \u043E\u043D\u043E\u0432\u043B\u044F\u0442\u044C \u043D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0438\u043C \u0447\u0430\u0441\u043E\u043C", 5e3, "error");
      } else {
        showToast("\u2705 \u0410\u043D\u043A\u0435\u0442\u0443 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E", 2500);
      }
    });
    cab.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      const go = b.dataset.go;
      closeCabinet();
      if (go === "myads")
        openMyAds();
      else if (go === "msgs")
        openThreadsList();
      else if (go === "saved")
        openSavedHub();
    }));
    cab.querySelectorAll("[data-notif]").forEach((t) => t.addEventListener("click", () => {
      const k = t.dataset.notif;
      prefs[k] = !prefs[k];
      t.classList.toggle("off", !prefs[k]);
      saveNotifPrefs(u.id, prefs);
    }));
    cab.querySelector("#cf-logout").addEventListener("click", async () => {
      await signOut();
      closeCabinet();
      showToast("\u0412\u0438 \u0432\u0438\u0439\u0448\u043B\u0438", 2200);
    });
  }
  function onHeaderClick() {
    if (isLoggedIn())
      openAccount();
    else
      openJoin();
  }
  function initAccountUI() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-account-btn]"))
        onHeaderClick();
    });
    updateHeaderBtn();
    document.addEventListener("cstl-need-login", (e) => {
      if (isLoggedIn())
        return;
      openJoin(e.detail && e.detail.actionLabel);
    });
    onAuthChange(async (user) => {
      updateHeaderBtn();
      if (!user || _newUserChecked)
        return;
      _newUserChecked = true;
      const profile = await getProfile();
      if (!profile)
        openProfile();
    });
  }

  // src/tabs/events.js
  var CATEGORY_COLORS2 = {
    "\u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430": "#722F37",
    "Kino_Castle": "#722F37",
    "\u0421\u043F\u043E\u0440\u0442": "#1565C0",
    "\u0411\u043B\u0430\u0433\u043E\u0434\u0456\u0439\u043D\u0456\u0441\u0442\u044C": "#B45309",
    "\u0421\u0432\u044F\u0442\u043E": "#8B6F47"
    // коричневий — нейтральний для свят (державних і релігійних)
  };
  var MONTHS_FULL = ["\u0441\u0456\u0447\u043D\u044F", "\u043B\u044E\u0442\u043E\u0433\u043E", "\u0431\u0435\u0440\u0435\u0437\u043D\u044F", "\u043A\u0432\u0456\u0442\u043D\u044F", "\u0442\u0440\u0430\u0432\u043D\u044F", "\u0447\u0435\u0440\u0432\u043D\u044F", "\u043B\u0438\u043F\u043D\u044F", "\u0441\u0435\u0440\u043F\u043D\u044F", "\u0432\u0435\u0440\u0435\u0441\u043D\u044F", "\u0436\u043E\u0432\u0442\u043D\u044F", "\u043B\u0438\u0441\u0442\u043E\u043F\u0430\u0434\u0430", "\u0433\u0440\u0443\u0434\u043D\u044F"];
  var allEvents = [];
  function formatFullDate(dateStr) {
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  }
  function catColor3(category) {
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
  function openShotamModal(id) {
    const ev = allEvents.find((e) => e.id === id);
    if (!ev)
      return;
    const modal = document.getElementById("article-modal");
    const modalContent = document.getElementById("article-modal-content");
    const modalMetaTags = document.getElementById("modalMetaTags");
    if (!modal || !modalContent)
      return;
    const catC = catColor3(ev.category);
    if (modalMetaTags) {
      modalMetaTags.innerHTML = `<span class="news-card-category">${escapeHtml(ev.category)}</span>`;
    }
    let cover;
    if (ev.image) {
      cover = `<img class="article-img" src="${escapeHtml(ev.image)}" alt="">`;
    } else {
      const grad = ev.cover_gradient || "linear-gradient(135deg, #999 0%, #555 100%)";
      cover = `<div class="shotam-modal-cover" style="background:${escapeHtml(grad)}"><span>${ev.cover_emoji || "\u{1F4C5}"}</span></div>`;
    }
    const when = ev.time ? `${formatFullDate(ev.date)}, ${ev.time}` : formatFullDate(ev.date);
    const loc = ev.location ? ` \xB7 ${escapeHtml(ev.location)}` : "";
    const bodyHtml = (ev.description || "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p class="article-p">${escapeHtml(p)}</p>`).join("");
    modalContent.innerHTML = `
    <div class="article-modal-header">
      <h1 class="article-title">${escapeHtml(ev.title)}</h1>
      <div class="article-byline"><span>${escapeHtml(when)}${loc}</span></div>
    </div>
    ${cover}
    <div class="article-body">${bodyHtml}</div>`;
    const shareBtn = document.getElementById("modal-share-btn");
    const remindBtn = document.getElementById("modal-remind-btn");
    const saveBtn = document.getElementById("modal-save-btn");
    if (shareBtn)
      shareBtn.onclick = () => sharePost({
        title: ev.title,
        text: `\u{1F4C5} ${ev.title}
${when}${ev.location ? " \xB7 " + ev.location : ""}

${ev.description || ""}`
      });
    if (remindBtn) {
      remindBtn.hidden = false;
      remindBtn.onclick = () => {
        if (!isLoggedIn()) {
          requireAuth("\u0441\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043D\u0430\u0433\u0430\u0434\u0443\u0432\u0430\u043D\u043D\u044F", () => {
          });
          return;
        }
        downloadIcs(ev);
      };
    }
    if (saveBtn)
      saveBtn.hidden = true;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
  }

  // src/tabs/community-blocks.js
  var cmBusIndex = 0;
  var cmBusEntries = [];
  var CM_TRACK_KEY = "bus_track_v2";
  function loadCmTracked(todayISO) {
    if (!isLoggedIn())
      return [];
    try {
      const d = JSON.parse(localStorage.getItem(CM_TRACK_KEY + ":" + currentUserId()));
      if (d?.routes?.length)
        return d.routes.filter((t) => t.trackDate >= todayISO);
    } catch {
    }
    return [];
  }
  window.addEventListener("cstl-bus-track-changed", () => {
    renderBusBlock();
  });
  onAuthChange(() => {
    renderBusBlock();
  });
  var _bwTimer = null;
  var _bwResume = null;
  var BW_STEP_MS = 5e3;
  var BW_RESUME_MS = 8e3;
  var BW_MAX_CARDS = 16;
  var _evItems = [];
  var _evIdx = 0;
  var _evTimer = null;
  var WEEKDAYS_UA = ["\u041D\u0434", "\u041F\u043D", "\u0412\u0442", "\u0421\u0440", "\u0427\u0442", "\u041F\u0442", "\u0421\u0431"];
  var WEEKDAYS_UA_FULL = ["\u041D\u0435\u0434\u0456\u043B\u044F", "\u041F\u043E\u043D\u0435\u0434\u0456\u043B\u043E\u043A", "\u0412\u0456\u0432\u0442\u043E\u0440\u043E\u043A", "\u0421\u0435\u0440\u0435\u0434\u0430", "\u0427\u0435\u0442\u0432\u0435\u0440", "\u041F'\u044F\u0442\u043D\u0438\u0446\u044F", "\u0421\u0443\u0431\u043E\u0442\u0430"];
  var _wxData = null;
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
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,apparent_temperature&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`
        ),
        knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon)
      ]);
      const data = await weatherRes.json();
      _wxData = { ...data, city: cityName };
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
        <button type="button" class="cm-fc-day${i === 0 ? " cm-fc-day--today" : ""}" data-wx-day="${i}">
          <span class="cm-fc-wd">${escapeHtml(wd)}</span>
          <span class="cm-fc-date">${d.getDate()}</span>
          <span class="cm-fc-icon">${dayInfo.icon}</span>
        </button>
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
      el.querySelectorAll("[data-wx-day]").forEach((btn) => {
        btn.addEventListener("click", () => openWeatherDayModal(+btn.dataset.wxDay));
      });
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u0433\u043E\u0434\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
  }
  var WX = { W: 320, H: 96, padL: 8, padR: 26, padTop: 16, padB: 18 };
  function wxGeom(points) {
    const vals = points.map((p) => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const innerW = WX.W - WX.padL - WX.padR;
    const innerH = WX.H - WX.padTop - WX.padB;
    return {
      min,
      max,
      innerW,
      innerH,
      x: (i) => WX.padL + innerW * i / (points.length - 1),
      y: (v) => WX.padTop + innerH - (v - min) / (max - min) * innerH
    };
  }
  function wxLineChart(points, { unit = "\xB0", color = "#FFFFFF" } = {}) {
    const g = wxGeom(points);
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${g.x(i).toFixed(1)},${g.y(p.v).toFixed(1)}`).join(" ");
    const area = `${line} L${g.x(points.length - 1).toFixed(1)},${(WX.padTop + g.innerH).toFixed(1)} L${g.x(0).toFixed(1)},${(WX.padTop + g.innerH).toFixed(1)} Z`;
    const xLabels = points.map((p, i) => i % 2 === 0 ? `<text x="${g.x(i).toFixed(1)}" y="${WX.H - 4}" class="wx-axis" text-anchor="middle">${p.h}</text>` : "").join("");
    const yAxis = [g.min, (g.min + g.max) / 2, g.max].map((v) => {
      const yy = g.y(v);
      return `<line x1="${WX.padL}" y1="${yy.toFixed(1)}" x2="${(WX.W - WX.padR).toFixed(1)}" y2="${yy.toFixed(1)}" class="wx-grid"/><text x="${(WX.W - WX.padR + 3).toFixed(1)}" y="${(yy + 3).toFixed(1)}" class="wx-axis" text-anchor="start">${Math.round(v)}${unit}</text>`;
    }).join("");
    return `
    <svg class="wx-chart" viewBox="0 0 ${WX.W} ${WX.H}" role="img" preserveAspectRatio="none">
      <defs><linearGradient id="wxfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${yAxis}
      <path d="${area}" fill="url(#wxfill)"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      ${xLabels}
    </svg>`;
  }
  function wxBarChart(points) {
    const innerW = WX.W - WX.padL - WX.padR;
    const innerH = WX.H - WX.padTop - WX.padB;
    const bw = innerW / points.length * 0.6;
    const bars = points.map((p, i) => {
      const cx = WX.padL + innerW * (i + 0.5) / points.length;
      const h = Math.max(1, Math.min(100, p.v) / 100 * innerH);
      const yTop = WX.padTop + innerH - h;
      const label = i % 2 === 0 ? `<text x="${cx.toFixed(1)}" y="${WX.H - 4}" class="wx-axis" text-anchor="middle">${p.h}</text>` : "";
      const pct = p.v >= 20 && i % 2 === 0 ? `<text x="${cx.toFixed(1)}" y="${(yTop - 4).toFixed(1)}" class="wx-val" text-anchor="middle">${Math.round(p.v)}%</text>` : "";
      return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="url(#wxbar)" fill-opacity="${(0.5 + 0.5 * Math.min(100, p.v) / 100).toFixed(2)}"/>${pct}${label}`;
    }).join("");
    const yAxis = [0, 50, 100].map((v) => {
      const yy = WX.padTop + innerH - v / 100 * innerH;
      return `<line x1="${WX.padL}" y1="${yy.toFixed(1)}" x2="${(WX.W - WX.padR).toFixed(1)}" y2="${yy.toFixed(1)}" class="wx-grid"/><text x="${(WX.W - WX.padR + 3).toFixed(1)}" y="${(yy + 3).toFixed(1)}" class="wx-axis" text-anchor="start">${v}</text>`;
    }).join("");
    return `<svg class="wx-chart" viewBox="0 0 ${WX.W} ${WX.H}" role="img" preserveAspectRatio="none">
      <defs><linearGradient id="wxbar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4DA3FF"/><stop offset="1" stop-color="#2F80FF"/>
      </linearGradient></defs>
      ${yAxis}${bars}
    </svg>`;
  }
  function openWeatherDayModal(dayIndex) {
    if (!_wxData || !_wxData.hourly)
      return;
    const daily = _wxData.daily;
    const hourly = _wxData.hourly;
    const dateStr = daily.time[dayIndex];
    if (!dateStr)
      return;
    const idxs = [];
    hourly.time.forEach((t, i) => {
      if (t.startsWith(dateStr))
        idxs.push(i);
    });
    if (!idxs.length)
      return;
    const tempPts = idxs.map((i) => ({ h: +hourly.time[i].slice(11, 13), v: hourly.temperature_2m[i] }));
    const precipPts = idxs.map((i) => ({ h: +hourly.time[i].slice(11, 13), v: hourly.precipitation_probability?.[i] ?? 0 }));
    const iconPts = idxs.map((i) => weatherCodeInfo(hourly.weather_code?.[i] ?? 0).icon);
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    const dayName = dayIndex === 0 ? "\u0421\u044C\u043E\u0433\u043E\u0434\u043D\u0456" : WEEKDAYS_UA_FULL[d.getDay()];
    const dateLabel = `${d.getDate()}.${pad(d.getMonth() + 1)}`;
    const info = weatherCodeInfo(daily.weather_code[dayIndex]);
    const tMax = Math.round(daily.temperature_2m_max[dayIndex]);
    const tMin = Math.round(daily.temperature_2m_min[dayIndex]);
    const bodyHtml = `
    <div class="wx-head">
      <div class="wx-head-icon">${info.icon}</div>
      <div class="wx-head-info">
        <div class="wx-head-day">${escapeHtml(dayName)} \xB7 ${dateLabel}</div>
        <div class="wx-head-desc">${escapeHtml(info.text)}</div>
      </div>
      <div class="wx-head-range">${tMax}\xB0 / ${tMin}\xB0</div>
    </div>
    <div class="wx-chart-block">
      <div class="wx-chart-title">\u{1F321}\uFE0F \u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u0430, \xB0C</div>
      <div class="wx-chart-svg-wrap" data-wx="temp">
        ${wxLineChart(tempPts, { unit: "\xB0" })}
        <div class="wx-cursor"><div class="wx-cursor-dot"></div></div>
        <div class="wx-readout"></div>
      </div>
    </div>
    <div class="wx-chart-block">
      <div class="wx-chart-title">\u{1F4A7} \u0419\u043C\u043E\u0432\u0456\u0440\u043D\u0456\u0441\u0442\u044C \u043E\u043F\u0430\u0434\u0456\u0432, %</div>
      <div class="wx-chart-svg-wrap" data-wx="precip">
        ${wxBarChart(precipPts)}
        <div class="wx-cursor"><div class="wx-cursor-dot"></div></div>
        <div class="wx-readout"></div>
      </div>
    </div>`;
    const offsetSec = _wxData.utc_offset_seconds ?? 7200;
    const nowLocal = new Date(Date.now() + offsetSec * 1e3);
    const nowDateStr = nowLocal.toISOString().slice(0, 10);
    const nowHour = nowLocal.getUTCHours();
    const initialIdx = dateStr === nowDateStr ? tempPts.findIndex((p) => p.h === nowHour) : -1;
    const { close, el } = openModal({
      bodyHtml,
      variant: "sheet",
      className: "app-modal--weather",
      swipeClose: false,
      onMount: (wrap) => wireWeatherScrubber(wrap, {
        tempPts,
        precipPts,
        iconPts,
        initialIdx: initialIdx >= 0 ? initialIdx : null
      })
    });
    wireWeatherSwipe(el, close);
  }
  function wireWeatherScrubber(overlay, { tempPts, precipPts, iconPts, initialIdx }) {
    const n = tempPts.length;
    if (!n)
      return;
    const gTemp = wxGeom(tempPts);
    const wraps = [...overlay.querySelectorAll(".wx-chart-svg-wrap")];
    function place(idx) {
      idx = Math.max(0, Math.min(n - 1, idx));
      const xPct = gTemp.x(idx) / WX.W * 100;
      wraps.forEach((wrap) => {
        const kind = wrap.dataset.wx;
        const cursor = wrap.querySelector(".wx-cursor");
        const readout = wrap.querySelector(".wx-readout");
        cursor.style.left = xPct + "%";
        cursor.classList.add("is-on");
        const p = kind === "temp" ? tempPts[idx] : precipPts[idx];
        const val = kind === "temp" ? `${Math.round(p.v)}\xB0` : `${Math.round(p.v)}%`;
        const icHtml = kind === "temp" ? `<span class="wx-ro-ic">${iconPts[idx]}</span>` : "";
        readout.innerHTML = `${icHtml}<span class="wx-ro-h">${pad(p.h)}:00</span><span class="wx-ro-v">${val}</span>`;
        readout.style.left = xPct + "%";
        readout.classList.add("is-on");
      });
    }
    function idxFromX(wrap, clientX) {
      const r = wrap.getBoundingClientRect();
      const frac = (clientX - r.left) / r.width;
      const usable = (frac * WX.W - WX.padL) / (WX.W - WX.padL - WX.padR);
      return Math.round(usable * (n - 1));
    }
    wraps.forEach((wrap) => {
      wrap.addEventListener("pointerdown", (e) => {
        wrap.setPointerCapture(e.pointerId);
        place(idxFromX(wrap, e.clientX));
        e.preventDefault();
      });
      wrap.addEventListener("pointermove", (e) => {
        if (e.pressure === 0 && e.buttons === 0)
          return;
        if (!wrap.hasPointerCapture(e.pointerId))
          return;
        place(idxFromX(wrap, e.clientX));
      });
      const end = (e) => {
        try {
          wrap.releasePointerCapture(e.pointerId);
        } catch (_) {
        }
      };
      wrap.addEventListener("pointerup", end);
      wrap.addEventListener("pointercancel", end);
    });
    if (initialIdx != null)
      place(initialIdx);
  }
  function wireWeatherSwipe(overlay, close) {
    const sheet = overlay.querySelector(".app-modal-sheet");
    if (!sheet)
      return;
    let startY = 0, dragging = false;
    sheet.addEventListener("touchstart", (e) => {
      if (e.target.closest(".wx-chart-svg-wrap"))
        return;
      if (sheet.scrollTop > 2)
        return;
      startY = e.touches[0].clientY;
      dragging = true;
    }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (!dragging)
        return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0)
        sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener("touchend", (e) => {
      if (!dragging)
        return;
      dragging = false;
      const dy = e.changedTouches[0].clientY - startY;
      sheet.style.transform = "";
      if (dy > 90)
        close();
    });
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
    let touchStartX = 0, touchMoved = false;
    const card = el.querySelector(".bhv4") || el.lastElementChild;
    if (!card)
      return;
    card.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
      touchMoved = false;
    }, { passive: true });
    card.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 40)
        return;
      touchMoved = true;
      cmBusIndex = dx < 0 ? (cmBusIndex + 1) % cmBusEntries.length : (cmBusIndex - 1 + cmBusEntries.length) % cmBusEntries.length;
      switchCmBusCard(el);
    }, { passive: true });
    card.addEventListener("click", () => {
      if (touchMoved)
        return;
      if (typeof window.switchTab === "function")
        window.switchTab("buses");
      openSavedRouteOnBuses(route.id, dateISO, null, null);
    });
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
  var BW_PIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var BW_ARROW_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  function bwStopAuto() {
    clearInterval(_bwTimer);
    _bwTimer = null;
    clearTimeout(_bwResume);
    _bwResume = null;
  }
  function bwCardHtml(p) {
    const photo = Array.isArray(p.photos) && p.photos.find((x) => x) || p.photo;
    const title = p.title && p.title.trim() || (p.text || "").trim().slice(0, 60) || "\u041E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F";
    const locLabel = p.location ? p.location === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : p.location : "";
    const ts = p.ts || p.published_at && new Date(p.published_at).getTime() || p.created_at && new Date(p.created_at).getTime();
    const color = catColor(p.category);
    const cover = photo ? `<div class="cmbw-photo" style="background-image:url('${escapeHtml(photo)}')"></div>` : "";
    return `
    <article class="cmbw-card" data-bw-id="${p.id}">
      <div class="cmbw-in">
        <span class="cmbw-pin" aria-hidden="true"></span>
        ${cover}
        <div class="cmbw-body">
          <span class="cm-board-cat cm-board-cat--${escapeHtml(color)}">${catIcon(p.category)} ${escapeHtml(catShort(p.category || ""))}</span>
          <div class="cmbw-name">${escapeHtml(title)}</div>
          <div class="cmbw-meta">
            ${locLabel ? `<span class="cmbw-loc">${BW_PIN_SVG}${escapeHtml(locLabel)}</span>` : "<span></span>"}
            ${ts ? `<span class="cmbw-time">${formatTime(ts)}</span>` : ""}
          </div>
        </div>
      </div>
    </article>`;
  }
  function bwShuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  async function renderBoardBlock() {
    const el = document.getElementById("cm-board-content");
    if (!el)
      return;
    bwStopAuto();
    try {
      let posts2 = [], usedSupabase = false;
      if (isSupabaseReady()) {
        const p = await fetchPublishedPosts();
        if (p !== null) {
          posts2 = p;
          usedSupabase = true;
        }
      }
      if (!usedSupabase) {
        const boardRes = await fetch("./data/community-board.json");
        posts2 = (await boardRes.json()).posts || [];
      }
      const ads = posts2.filter((p) => (p.type || "board") === "board");
      const shown = bwShuffle(ads).slice(0, BW_MAX_CARDS);
      const cards = shown.map(bwCardHtml).join("");
      el.classList.remove("cm-loading");
      el.innerHTML = `
      <div class="cmbw-head" data-bw-head role="button" aria-label="\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0432\u0441\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F \u0433\u0440\u043E\u043C\u0430\u0434\u0438">
        <span class="cmbw-head-ic">${ICONS.clipboard}</span>
        <span class="cmbw-title">\u0410\u041A\u0422\u0423\u0410\u041B\u042C\u041D\u0406 \u041E\u0413\u041E\u041B\u041E\u0428\u0415\u041D\u041D\u042F \u0413\u0420\u041E\u041C\u0410\u0414\u0418</span>
      </div>
      ${ads.length ? `<div class="cmbw-strip" id="cmbw-strip">${cards}</div>
           <div class="cmbw-edge cmbw-edge--l" aria-hidden="true"></div>
           <div class="cmbw-edge cmbw-edge--r" aria-hidden="true"></div>
           <span class="cmbw-dots" aria-hidden="true"></span>
           <div class="cmbw-foot" data-bw-more role="button" aria-label="\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0432\u0441\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F">
             <span>\u041F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0432\u0441\u0456 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F</span>${BW_ARROW_SVG}
           </div>` : '<div class="cmbw-empty">\u041D\u0430 \u0434\u043E\u0448\u0446\u0456 \u043F\u043E\u043A\u0438 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E \u2014 \u043F\u043E\u0434\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0448\u0435 \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F!</div>'}
    `;
      el.addEventListener("click", (e) => {
        const card = e.target.closest("[data-bw-id]");
        if (card) {
          const post = ads.find((p) => p.id === Number(card.dataset.bwId));
          if (post) {
            openAdModalStandalone(post);
            return;
          }
        }
        if (e.target.closest("[data-bw-more]") || e.target.closest("[data-bw-head]")) {
          if (typeof window.switchTab === "function")
            window.switchTab("board");
        }
      });
      const strip = el.querySelector("#cmbw-strip");
      if (strip) {
        const snapTargets = () => {
          const kids = [...strip.children];
          if (!kids.length)
            return [];
          const base = kids[0].offsetLeft;
          return kids.filter((_, i) => i % 2 === 0).map((c) => Math.max(0, c.offsetLeft - base - 12));
        };
        const targets0 = snapTargets();
        const dotsWrap = el.querySelector(".cmbw-dots");
        if (dotsWrap && targets0.length > 1) {
          dotsWrap.innerHTML = targets0.map((_, i) => `<span class="cmbw-dot" data-bw-dot="${i}"></span>`).join("");
        }
        const dotEls = dotsWrap ? [...dotsWrap.children] : [];
        const padL = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
        const updateFx = () => {
          const kids = [...strip.children];
          if (!kids.length)
            return;
          const base = kids[0].offsetLeft;
          const viewL = strip.scrollLeft, viewR = viewL + strip.clientWidth;
          kids.forEach((c) => {
            const l = c.offsetLeft - base + padL;
            const vis = Math.max(0, Math.min(l + c.offsetWidth, viewR) - Math.max(l, viewL));
            const frac = Math.min(1, vis / c.offsetWidth);
            if (c.firstElementChild)
              c.firstElementChild.style.transform = `scale(${(0.87 + 0.13 * frac).toFixed(3)})`;
          });
          if (dotEls.length) {
            const targets = snapTargets();
            let ai = 0, best = Infinity;
            targets.forEach((t, i) => {
              const d = Math.abs(t - strip.scrollLeft);
              if (d < best) {
                best = d;
                ai = i;
              }
            });
            dotEls.forEach((d, i) => d.classList.toggle("cmbw-dot--active", i === ai));
          }
        };
        let fxRaf = 0;
        strip.addEventListener("scroll", () => {
          if (fxRaf)
            return;
          fxRaf = requestAnimationFrame(() => {
            fxRaf = 0;
            updateFx();
          });
        }, { passive: true });
        updateFx();
        if (targets0.length > 1) {
          const tick = () => {
            if (!document.contains(strip)) {
              bwStopAuto();
              return;
            }
            if (document.hidden)
              return;
            const targets = snapTargets();
            if (!targets.length)
              return;
            const max = strip.scrollWidth - strip.clientWidth;
            const next = targets.find((t) => t > strip.scrollLeft + 8);
            strip.scrollTo({ left: next === void 0 || next > max + 8 ? 0 : Math.min(next, max), behavior: "smooth" });
          };
          const startAuto = () => {
            clearInterval(_bwTimer);
            _bwTimer = setInterval(tick, BW_STEP_MS);
          };
          const pauseAuto = () => {
            clearInterval(_bwTimer);
            _bwTimer = null;
            clearTimeout(_bwResume);
            _bwResume = setTimeout(startAuto, BW_RESUME_MS);
          };
          strip.addEventListener("touchstart", pauseAuto, { passive: true });
          strip.addEventListener("pointerdown", pauseAuto);
          if (dotsWrap)
            dotsWrap.addEventListener("click", (e) => {
              const d = e.target.closest("[data-bw-dot]");
              if (!d)
                return;
              e.stopPropagation();
              pauseAuto();
              const t = snapTargets()[Number(d.dataset.bwDot)] || 0;
              strip.scrollTo({ left: Math.min(t, strip.scrollWidth - strip.clientWidth), behavior: "smooth" });
            });
          startAuto();
        }
      }
    } catch {
      el.innerHTML = '<div class="cmbw-empty">\u0414\u043E\u0448\u043A\u0430 \u0442\u0438\u043C\u0447\u0430\u0441\u043E\u0432\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430</div>';
    }
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
    if (_evTimer) {
      clearInterval(_evTimer);
      _evTimer = null;
    }
    try {
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      let items = [];
      try {
        const res = await fetch("./data/events.json");
        const events = await res.json();
        items = events.filter((e) => !e.auto).filter((e) => /* @__PURE__ */ new Date(e.date + "T00:00:00") >= today).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5).map((e) => ({ kind: "event", id: e.id, date: e.date, time: e.time, title: e.title, category: e.category, location: e.location, image: e.image }));
      } catch {
      }
      if (!items.length) {
        try {
          const hres = await fetch("./data/holidays.json");
          const hall = await hres.json();
          const harr = Array.isArray(hall) ? hall : hall.holidays || [];
          items = harr.filter((h) => /* @__PURE__ */ new Date(h.date + "T00:00:00") >= today).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5).map((h) => ({ kind: "holiday", id: h.id, date: h.date, title: h.title, category: h.category || "\u0421\u0432\u044F\u0442\u043E", emoji: h.cover_emoji, gradient: h.cover_gradient }));
        } catch {
        }
      }
      if (!items.length) {
        el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454 \u0437\u0430\u043F\u043B\u0430\u043D\u043E\u0432\u0430\u043D\u0438\u0445 \u043F\u043E\u0434\u0456\u0439 \u0443 \u0433\u0440\u043E\u043C\u0430\u0434\u0456</div>';
        return;
      }
      _evItems = items;
      _evIdx = 0;
      renderEvCarousel(el);
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041F\u043E\u0434\u0456\u0457 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
    }
  }
  function evSlideHtml(it, now) {
    const eventDay = /* @__PURE__ */ new Date(it.date + "T00:00:00");
    const todayDay = new Date(now);
    todayDay.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((eventDay - todayDay) / 864e5);
    const isUrgent = dayDiff <= 1;
    const dateStr = `${pad(eventDay.getDate())}.${pad(eventDay.getMonth() + 1)}`;
    const catStr = escapeHtml(it.category || "");
    const countdown = escapeHtml(eventCountdown(it, now));
    if (it.kind === "holiday") {
      const grad = it.gradient ? ` style="background:${escapeHtml(it.gradient)}"` : "";
      return `
      <div class="cm-ev-slide">
        <article class="evh-card tablo-hero cm-ev-holiday${isUrgent ? " tablo-hero--urgent" : ""}"${grad} data-ev-id="${it.id}">
          <div class="evh-top">
            <span class="tablo-countdown">${countdown}</span>
            ${catStr ? `<span class="evh-cat tablo-soft">${catStr}</span>` : ""}
          </div>
          <div class="cm-ev-holiday-emoji">${escapeHtml(it.emoji || "\u{1F389}")}</div>
          <div class="evh-title">${escapeHtml(it.title)}</div>
          <div class="evh-meta tablo-soft">${dateStr}</div>
        </article>
      </div>
    `;
    }
    const timeStr = it.time ? escapeHtml(it.time) : "";
    const locStr = it.location ? escapeHtml(it.location) : "";
    const thumb = it.image ? `<img class="evh-thumb" src="${escapeHtml(it.image)}" alt="" loading="lazy" onerror="this.remove(); this.closest('.evh-card')?.classList.remove('evh-card--photo')">` : "";
    return `
    <div class="cm-ev-slide">
      <article class="evh-card tablo-hero${isUrgent ? " tablo-hero--urgent" : ""}${it.image ? " evh-card--photo" : ""}" data-ev-id="${it.id}">
        ${thumb}
        <div class="evh-top">
          <span class="tablo-countdown">${countdown}</span>
          ${catStr ? `<span class="evh-cat tablo-soft">${catStr}</span>` : ""}
        </div>
        <div class="evh-time tablo-time-mono">
          <span class="evh-date tablo-time-accent">${dateStr}</span>
          ${timeStr ? `<span class="evh-clock tablo-mid">${timeStr}</span>` : ""}
        </div>
        <div class="evh-title">${escapeHtml(it.title)}</div>
        ${locStr ? `<div class="evh-meta tablo-soft">\u{1F4CD} ${locStr}</div>` : ""}
      </article>
    </div>
  `;
  }
  function renderEvCarousel(el) {
    const now = /* @__PURE__ */ new Date();
    const slides = _evItems.map((it) => evSlideHtml(it, now)).join("");
    const dots = _evItems.length > 1 ? `<div class="cm-ev-dots">${_evItems.map((_, i) => `<span class="cm-ev-dot${i === _evIdx ? " active" : ""}" data-ev-idx="${i}"></span>`).join("")}</div>` : "";
    el.innerHTML = `
    <div class="cm-ev-carousel" id="cm-ev-carousel">
      <div class="cm-ev-track" style="transform:translateX(-${_evIdx * 100}%)">${slides}</div>
      ${dots}
    </div>
  `;
    el.querySelectorAll(".cm-ev-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        _evIdx = parseInt(dot.dataset.evIdx, 10) || 0;
        updateEvPosition(el);
        startEvRotator(el);
      });
    });
    el.querySelectorAll(".evh-card[data-ev-id]").forEach((card) => {
      card.addEventListener("click", () => {
        const id = Number(card.dataset.evId);
        if (Number.isFinite(id))
          openShotamModal(id);
      });
    });
    startEvRotator(el);
  }
  function updateEvPosition(el) {
    const track = el.querySelector(".cm-ev-track");
    if (track)
      track.style.transform = `translateX(-${_evIdx * 100}%)`;
    el.querySelectorAll(".cm-ev-dot").forEach((d, i) => d.classList.toggle("active", i === _evIdx));
  }
  function startEvRotator(el) {
    if (_evTimer) {
      clearInterval(_evTimer);
      _evTimer = null;
    }
    if (_evItems.length < 2)
      return;
    _evTimer = setInterval(() => {
      if (!document.getElementById("cm-ev-carousel")) {
        clearInterval(_evTimer);
        _evTimer = null;
        return;
      }
      _evIdx = (_evIdx + 1) % _evItems.length;
      updateEvPosition(el);
    }, 6e3);
  }
  var CONTACT_ICONS = {
    ambulance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10h4M12 8v4"/><path d="M2 17h20v-3a2 2 0 0 0-2-2h-3l-3-4H7a4 4 0 0 0-4 4v5h-1"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2-2-3.5C10 9.5 8.5 8 8.5 6c0 0-2 2-2 5a5 5 0 0 0 5 5 5 5 0 0 0 5-5c0-3-3-7-5-9 0 2-2 4.5-3.5 6.5z"/></svg>',
    police: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    gas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M8 6h8M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M10 12h4"/></svg>',
    hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M2 22h20"/><path d="M12 11v4M10 13h4"/></svg>',
    gromada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg>',
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    default: ICONS.phone
    // дедуп — раніше байт-в-байт копія з board.js PHONE_ICON_SVG
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
      const telOf = (p) => p.replace(/[^\d+]/g, "");
      const local = list.filter((c) => c.group === "local");
      const emergency = list.filter((c) => c.group === "emergency" || c.group === "hero" || c.priority === "critical");
      const EMERG_ORDER = ["101", "102", "103", "104", "112"];
      const emergRank = (c) => {
        const i = EMERG_ORDER.indexOf(String(c.phone || "").trim());
        return i === -1 ? 99 : i;
      };
      emergency.sort((a, b) => emergRank(a) - emergRank(b));
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
      const emergencyHtml = emergency.length ? `
      <div class="cm-contact-group cm-contact-group--emergency">
        <div class="cm-contact-group-title">\u0415\u043A\u0441\u0442\u0440\u0435\u043D\u0456</div>
        <div class="cm-contact-grid-3">
          ${emergency.map((c) => `
            <a class="cm-contact-chip" href="tel:${escapeHtml(telOf(c.phone))}">
              <span class="cm-contact-chip-icon">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
              <span class="cm-contact-chip-name">${escapeHtml(c.name)}</span>
              <span class="cm-contact-chip-phone">${escapeHtml(c.phone)}</span>
            </a>
          `).join("")}
        </div>
      </div>
    ` : "";
      el.innerHTML = localHtml + emergencyHtml;
    } catch {
      el.innerHTML = '<div class="cm-block-empty">\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0456</div>';
    }
  }
  var CM_NEWS_FILTERS = ["\u0413\u0440\u043E\u043C\u0430\u0434\u0430", "\u0412\u043E\u043B\u0438\u043D\u044C", "\u0423\u043A\u0440\u0430\u0457\u043D\u0430 \u0442\u0430 \u0421\u0432\u0456\u0442"];
  var cmNewsGeo = "\u0413\u0440\u043E\u043C\u0430\u0434\u0430";
  function cmNewsMatch(a) {
    if (cmNewsGeo === "\u0413\u0440\u043E\u043C\u0430\u0434\u0430")
      return a.geo === "\u0413\u0440\u043E\u043C\u0430\u0434\u0430" || a.geo === "\u041E\u043B\u0438\u043A\u0430";
    if (cmNewsGeo === "\u0423\u043A\u0440\u0430\u0457\u043D\u0430 \u0442\u0430 \u0421\u0432\u0456\u0442")
      return a.geo === "\u0423\u043A\u0440\u0430\u0457\u043D\u0430" || a.geo === "\u0421\u0432\u0456\u0442";
    return a.geo === cmNewsGeo;
  }
  function paintCmNews(el, arts) {
    const filtered = arts.filter(cmNewsMatch).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    el.innerHTML = `
    <div class="cm-news-feed">${newsCardsHtml(filtered, { compact: true })}</div>
  `;
    const controls = document.getElementById("cm-news-controls");
    if (controls) {
      controls.innerHTML = `
      <div class="cm-news-filters">
        ${CM_NEWS_FILTERS.map((g) => `
          <button class="cm-news-chip ${g === cmNewsGeo ? "active" : ""}" data-cm-geo="${escapeHtml(g)}">${escapeHtml(g)}</button>
        `).join("")}
      </div>`;
    }
  }
  async function renderCommunityNews() {
    const el = document.getElementById("cm-news-content");
    if (!el)
      return;
    const arts = await ensureNewsLoaded();
    paintCmNews(el, arts);
    const section = document.querySelector(".cm-block--news");
    if (!section || section.dataset.wired)
      return;
    section.dataset.wired = "1";
    section.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-cm-geo]");
      if (chip) {
        cmNewsGeo = chip.dataset.cmGeo;
        paintCmNews(el, arts);
        return;
      }
      const card = e.target.closest("[data-article-id]");
      if (card) {
        const id = Number(card.dataset.articleId);
        if (Number.isFinite(id))
          openArticle(id);
      }
    });
    const EDGE = 30;
    let feedArmed = false;
    const feedNow = () => section.querySelector(".cm-news-feed");
    section.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1)
        return;
      const feed = feedNow();
      if (!feed)
        return;
      const r = feed.getBoundingClientRect();
      const t = e.touches[0];
      const inFeedY = t.clientY >= r.top && t.clientY <= r.bottom;
      const inEdge = t.clientX < r.left + EDGE || t.clientX > r.right - EDGE;
      if (inFeedY && inEdge) {
        feed.style.overflowY = "hidden";
        feedArmed = true;
      }
    }, { passive: true });
    const releaseFeed = () => {
      if (!feedArmed)
        return;
      const feed = feedNow();
      if (feed)
        feed.style.overflowY = "";
      feedArmed = false;
    };
    section.addEventListener("touchend", releaseFeed, { passive: true });
    section.addEventListener("touchcancel", releaseFeed, { passive: true });
  }

  // src/tabs/community.js
  var KOSTEL = "\u041A\u043E\u043B\u0435\u0433\u0456\u0430\u043B\u044C\u043D\u0438\u0439 \u043A\u043E\u0441\u0442\u0435\u043B \u0421\u0432\u044F\u0442\u043E\u0457 \u0422\u0440\u0456\u0439\u0446\u0456";
  var HERO_DAY = [1, 2, 3, 4].map((i) => ({ src: `./photos/olyka.day-${i}.jpg`, caption: KOSTEL }));
  var HERO_EVENING = [1, 2, 3, 4].map((i) => ({ src: `./photos/olyka.evening-${i}.jpg`, caption: KOSTEL }));
  var _heroInterval = null;
  var _heroIndex = 0;
  var _heroIsDay = null;
  var EVENING_LEAD_MS = 2 * 60 * 60 * 1e3;
  function isDaytime(now = /* @__PURE__ */ new Date()) {
    const t = sunTimes(now);
    if (!t)
      return true;
    return now >= t.sunrise && now.getTime() < t.sunset.getTime() - EVENING_LEAD_MS;
  }
  function heroSet() {
    return isDaytime() ? HERO_DAY : HERO_EVENING;
  }
  function heroImgsHtml() {
    return heroSet().map((it, i) => `
    <img class="cm-hero-img${i === 0 ? " active" : ""}" src="${escapeHtml(it.src)}" alt="${escapeHtml(it.caption)}" loading="${i === 0 ? "eager" : "lazy"}">
  `).join("");
  }
  function syncHeroCaption() {
    const sub = document.querySelector(".cm-hero-sub");
    const it = heroSet()[_heroIndex];
    if (sub && it)
      sub.textContent = it.caption;
  }
  function showHeroSlide(idx) {
    const wrap = document.querySelector(".cm-hero");
    if (!wrap)
      return;
    const n = heroSet().length;
    _heroIndex = (idx + n) % n;
    wrap.querySelectorAll(".cm-hero-img").forEach((img, i) => {
      img.classList.toggle("active", i === _heroIndex);
    });
    syncHeroCaption();
  }
  function startHeroRotator() {
    if (_heroInterval)
      clearInterval(_heroInterval);
    _heroIndex = 0;
    _heroIsDay = isDaytime();
    _heroInterval = setInterval(() => {
      const wrap = document.querySelector(".cm-hero");
      if (!wrap) {
        clearInterval(_heroInterval);
        _heroInterval = null;
        return;
      }
      const day = isDaytime();
      if (day !== _heroIsDay) {
        _heroIsDay = day;
        _heroIndex = 0;
        wrap.querySelectorAll(".cm-hero-img").forEach((img) => img.remove());
        wrap.insertAdjacentHTML("afterbegin", heroImgsHtml());
        syncHeroCaption();
        return;
      }
      showHeroSlide(_heroIndex + 1);
    }, 6e3);
  }
  function getGreeting() {
    const h = (/* @__PURE__ */ new Date()).getHours();
    let hello;
    if (h >= 5 && h < 11)
      hello = "\u0414\u043E\u0431\u0440\u0438\u0439 \u0440\u0430\u043D\u043E\u043A";
    else if (h >= 11 && h < 17)
      hello = "\u0414\u043E\u0431\u0440\u0438\u0434\u0435\u043D\u044C";
    else if (h >= 17 && h < 22)
      hello = "\u0414\u043E\u0431\u0440\u0438\u0439 \u0432\u0435\u0447\u0456\u0440";
    else
      hello = "\u0414\u043E\u0431\u0440\u043E\u0457 \u043D\u043E\u0447\u0456";
    let who = "\u0433\u0440\u043E\u043C\u0430\u0434\u043E";
    if (isLoggedIn()) {
      const name = (currentUserName() || "").trim().split(/\s+/)[0];
      if (name && name !== "\u0416\u0438\u0442\u0435\u043B\u044C")
        who = name;
    }
    return { text: `${hello}, ${who}!` };
  }
  function updateGreetingName() {
    const el = document.querySelector(".cm-greeting-text");
    if (el)
      el.textContent = getGreeting().text;
    fitGreeting();
  }
  var GREET_FONT_MAX = 27;
  var GREET_FONT_MIN = 19;
  function fitGreeting() {
    const el = document.querySelector(".cm-greeting-text");
    if (!el)
      return;
    let size = GREET_FONT_MAX;
    el.style.fontSize = size + "px";
    while (size > GREET_FONT_MIN && el.scrollWidth > el.clientWidth) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
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
    <!-- \u041A\u043D\u043E\u043F\u043A\u0430 \u043A\u0430\u0431\u0456\u043D\u0435\u0442\u0443 \u2014 \u041F\u0420\u0418\u0411\u0418\u0422\u0410 (\u0445\u043E\u0440\u0435\u043E\u0433\u0440\u0430\u0444\u0456\u044F \u0412\u043E\u0432\u0438 16.07: \xAB\u0456\u043A\u043E\u043D\u043A\u0430 \u043D\u0456\u043A\u0443\u0434\u0438 \u043D\u0435
         \u0434\u0456\u0432\u0430\u0454\u0442\u044C\u0441\u044F\xBB). \u041E\u043A\u0440\u0435\u043C\u0438\u0439 sticky-\u0435\u043B\u0435\u043C\u0435\u043D\u0442 \u043D\u0443\u043B\u044C\u043E\u0432\u043E\u0457 \u0432\u0438\u0441\u043E\u0442\u0438: \u043A\u043D\u043E\u043F\u043A\u0430 \u0441\u0442\u043E\u0457\u0442\u044C \u0443
         \u043F\u0440\u0430\u0432\u043E\u043C\u0443 \u0432\u0435\u0440\u0445\u043D\u044C\u043E\u043C\u0443 \u043A\u0443\u0442\u0456 \u043A\u043E\u043D\u0442\u0435\u043D\u0442\u0443 \u0432\u0456\u0434 \u0441\u0442\u0430\u0440\u0442\u0443 \u0434\u043E \u043A\u0456\u043D\u0446\u044F \u0441\u043A\u0440\u043E\u043B\u0443 \u2014 \u043F\u0440\u0438\u0432\u0456\u0442\u0430\u043D\u043D\u044F
         \u0457\u0434\u0435 \u0433\u0435\u0442\u044C, \xAB\u0428\u041E \u0412 \u0421\u0415\u041B\u0406?\xBB \u043F\u0440\u0438\u0457\u0436\u0434\u0436\u0430\u0454, \u0430 \u0432\u043E\u043D\u0430 \u043D\u0430 \u043C\u0456\u0441\u0446\u0456. -->
    <div class="cm-acc-pin">
      <button class="cm-greet-account" type="button" data-account-btn aria-label="\u041A\u0430\u0431\u0456\u043D\u0435\u0442">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.6" r="4.2"/><path d="M12 13.6c-4.5 0-8.2 2.9-8.2 6.6 0 .9.7 1.6 1.6 1.6h13.2c.9 0 1.6-.7 1.6-1.6 0-3.7-3.7-6.6-8.2-6.6z"/></svg>
      </button>
    </div>

    <!-- \u0421\u0442\u0438\u043A-\u0437\u043E\u043D\u0430 \u0432\u0456\u0442\u0430\u043D\u043D\u044F: \u0432\u0438\u0441\u043E\u0442\u0430 = \u0432\u0456\u0442\u0430\u043D\u043D\u044F + \u0437\u0430\u043F\u0430\u0441 \xAB\u0437\u0430\u043B\u0438\u043F\u0430\u043D\u043D\u044F\xBB (padding-bottom).
         .cm-greeting \u0432\u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0456 \u2014 position:sticky, \u0442\u043E\u043C\u0443 \u0431\u0440\u0430\u0443\u0437\u0435\u0440 \u0442\u0440\u0438\u043C\u0430\u0454 \u0439\u043E\u0433\u043E
         \u043D\u0430 \u041A\u041E\u041C\u041F\u041E\u0417\u0418\u0422\u041E\u0420\u0406 (\u0431\u0435\u0437 JS-\u0441\u043A\u0440\u043E\u043B\u0443) \u2192 \u043D\u0443\u043B\u044C \u0434\u044C\u043E\u0440\u0433\u0430\u043D\u043D\u044F \u043D\u0430 iOS. \u041A\u043E\u043B\u0438 \u0437\u043E\u043D\u0430
         \u0434\u043E\u0437\u043D\u0438\u043A\u0430\u0454 (\u043F\u0440\u043E\u0441\u043A\u0440\u043E\u043B\u0438\u043B\u0438 padding-bottom) \u2014 \u0432\u0456\u0442\u0430\u043D\u043D\u044F \u0432\u0456\u0434\u043F\u0443\u0441\u043A\u0430\u0454\u0442\u044C\u0441\u044F \u0439 \u0457\u0434\u0435 \u0432\u0433\u043E\u0440\u0443. -->
    <div class="cm-greeting-stick">
      <section class="cm-greeting">
        <div class="cm-greeting-col">
          <div class="cm-greeting-date">${escapeHtml(todayStr)}</div>
          <div class="cm-greeting-text">${escapeHtml(greeting.text)}</div>
        </div>
      </section>
      <!-- \u0420\u043E\u0437\u043F\u0456\u0440\u043A\u0430 \u0437\u0430\u043F\u0430\u0441\u0443 \xAB\u0437\u0430\u043B\u0438\u043F\u0430\u043D\u043D\u044F\xBB: \u0420\u0415\u0410\u041B\u042C\u041D\u0418\u0419 \u0431\u043B\u043E\u043A (\u043D\u0435 padding!) \u2014 \u0456\u043D\u0430\u043A\u0448\u0435
           sticky \u0443 Chromium \u043D\u0435 \u0442\u0440\u0438\u043C\u0430\u0454 (padding \u043A\u043E\u043D\u0442\u0435\u0439\u043D\u0435\u0440\u0430 \u043D\u0435 \u0440\u0430\u0445\u0443\u0454\u0442\u044C\u0441\u044F \u0443 \u0434\u0456\u0430\u043F\u0430\u0437\u043E\u043D
           \u0437\u0430\u043B\u0438\u043F\u0430\u043D\u043D\u044F). \u0407\u0457 \u0432\u0438\u0441\u043E\u0442\u0430 = \u0441\u043A\u0456\u043B\u044C\u043A\u0438 px \u0432\u0456\u0442\u0430\u043D\u043D\u044F \u0456\u0433\u043D\u043E\u0440\u0443\u0454 \u0441\u043A\u0440\u043E\u043B. -->
      <div class="cm-greeting-stickpad" aria-hidden="true"></div>
    </div>

    <section class="cm-hero">
      ${heroImgsHtml()}
      <!-- \u0424\u0440\u043E\u0441\u0442-\u0441\u043C\u0443\u0433\u0443 (.cm-hero-blurband) \u043F\u0440\u0438\u0431\u0440\u0430\u043D\u043E 16.07 (\u0412\u043E\u0432\u0430, \u0440\u0435\u0434\u0438\u0437\u0430\u0439\u043D \xAB\u043B\u0438\u0441\u0442\xBB):
           \u043D\u0435\u043F\u0440\u043E\u0437\u043E\u0440\u0438\u0439 \u0442\u0456\u043B\u0435\u0441\u043D\u0438\u0439 \u043B\u0438\u0441\u0442 \u043D\u0430\u043B\u044F\u0433\u0430\u0454 \u043D\u0430 \u0444\u043E\u0442\u043E \u0456 \u043F\u043E\u0432\u043D\u0456\u0441\u0442\u044E \u0457\u0457 \u0437\u0430\u043A\u0440\u0438\u0432\u0430\u0454. -->
      <div class="cm-hero-overlay">
        <!-- \u041F\u0456\u0434\u043F\u0438\u0441 \u0444\u043E\u0442\u043E (\u0412\u043E\u0432\u0430 20.07, \u0432\u0430\u0440\u0456\u0430\u043D\u0442 \u0411): \u0434\u0432\u0430 \u0434\u0440\u0456\u0431\u043D\u0456 \u0440\u044F\u0434\u043A\u0438 \u0432 \u0441\u0442\u0438\u043B\u0456 \u043F\u0456\u0434\u043F\u0438\u0441\u0443
             \u0436\u0443\u0440\u043D\u0430\u043B\u0443 \u2014 \xAB\u041E\u041B\u0418\u041A\u0410\xBB (\u0440\u043E\u0437\u0440\u0456\u0434\u0436\u0435\u043D\u0456 \u043A\u0430\u043F\u0456\u0442\u0435\u043B\u0456) + \u043D\u0430\u0437\u0432\u0430 \u043F\u0430\u043C'\u044F\u0442\u043A\u0438 \u043A\u0443\u0440\u0441\u0438\u0432\u043E\u043C \u043F\u0456\u0434 \u043D\u0435\u044E.
             \u0414\u0435\u043B\u0456\u043A\u0430\u0442\u043D\u0438\u0439, \u043D\u0435 \u043D\u0430\u0437\u0432\u0430 \u0431\u043B\u043E\u043A\u0443; \u0447\u0438\u0442\u0430\u0431\u0435\u043B\u044C\u043D\u0456\u0441\u0442\u044C \u043D\u0430 \u0434\u0435\u043D\u044C/\u043D\u0456\u0447 \u0447\u0435\u0440\u0435\u0437 \u0442\u0456\u043D\u044C + \u043B\u0435\u0433\u043A\u0435
             \u0437\u0430\u0442\u0435\u043C\u043D\u0435\u043D\u043D\u044F \u0432\u043D\u0438\u0437\u0443 \u0444\u043E\u0442\u043E. \xAB\u0428\u041E \u0412 \u0421\u0415\u041B\u0406?\xBB \u0436\u0438\u0432\u0435 \u043E\u043A\u0440\u0435\u043C\u043E \u043D\u0438\u0436\u0447\u0435 (cm-sec-head). -->
        <div class="cm-hero-caption">
          <span class="cm-hero-title">\u041E\u043B\u0438\u043A\u0430</span>
          <span class="cm-hero-sub">${escapeHtml(heroSet()[0].caption)}</span>
        </div>
      </div>
    </section>
    <div class="cm-hero-spacer"></div>

    <!-- \u041B\u0418\u0421\u0422 (\u0412\u043E\u0432\u0430 16.07, \u0440\u0435\u0434\u0438\u0437\u0430\u0439\u043D \xAB\u044F\u043A \u0441\u0443\u0447\u0430\u0441\u043D\u0438\u0439 iOS-\u0434\u043E\u0434\u0430\u0442\u043E\u043A\xBB): \u0442\u0456\u043B\u0435\u0441\u043D\u0430 \u043A\u0430\u0440\u0442\u043A\u0430
         \u043D\u0430 \u0432\u0441\u044E \u0448\u0438\u0440\u0438\u043D\u0443, \u0449\u043E \u041D\u0410\u041B\u042F\u0413\u0410\u0404 \u043D\u0430 \u0444\u043E\u0442\u043E (\u0437\u0430\u043E\u043A\u0440\u0443\u0433\u043B\u0435\u043D\u0456 \u0432\u0435\u0440\u0445\u043D\u0456 \u043A\u0443\u0442\u0438 + \u0433\u043B\u0438\u0431\u043E\u043A\u0430 \u0442\u0456\u043D\u044C
         \u0443\u0433\u043E\u0440\u0443). \u0423\u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0456 \u2014 \u044F\u0437\u0438\u0447\u043E\u043A \xAB\u0428\u041E \u0412 \u0421\u0415\u041B\u0406?\xBB (\u0432\u0438\u043F\u0443\u043A\u043B\u0438\u0439 \u0432\u0438\u0441\u0442\u0443\u043F \u043B\u0438\u0441\u0442\u0430 \u043D\u0430 \u0444\u043E\u0442\u043E)
         \u0456 \u0432\u0441\u0456 \u0431\u043B\u043E\u043A\u0438. \u0425\u043E\u0440\u0435\u043E\u0433\u0440\u0430\u0444\u0456\u044F \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u0430: sec-head sticky \u2192 \u0434\u043E\u0457\u0436\u0434\u0436\u0430\u0454 \u0434\u043E \u0448\u0430\u043F\u043A\u0438,
         \u0437\u0430\u043B\u0438\u043F\u0430\u0454 \u0456 \u0441\u0442\u0430\u0454 \u0431\u043B\u044E\u0440-\u043F\u0430\u043D\u0435\u043B\u043B\u044E (--stuck), \u0431\u043B\u043E\u043A\u0438 \u043F\u0456\u0440\u043D\u0430\u044E\u0442\u044C \u043F\u0456\u0434 \u043D\u0435\u0457.
         \u041A\u043D\u043E\u043F\u043A\u0438 \u043A\u0430\u0431\u0456\u043D\u0435\u0442\u0443 \u0442\u0443\u0442 \u041D\u0415\u041C\u0410 \u2014 \u0432\u043E\u043D\u0430 \u043E\u043A\u0440\u0435\u043C\u043E \u043F\u0440\u0438\u0431\u0438\u0442\u0430 (.cm-acc-pin). -->
    <div class="cm-sheet">
    <!-- \u041F\u0440\u0438\u043A\u0440\u0456\u043F\u043B\u0435\u043D\u0438\u0439 \u0434\u043E \u0448\u0430\u043F\u043A\u0438 \u0431\u043B\u044E\u0440-\u0440\u044F\u0434\u043E\u043A (\u041F\u0440\u0430\u0432\u043A\u0430 1): fixed, \u043D\u0435 \u0457\u0434\u0435 \u0437\u0456 \u0441\u043A\u0440\u043E\u043B\u043E\u043C; opacity \u0441\u043A\u0440\u0430\u0431\u0438\u0442\u044C\u0441\u044F. -->
    <div class="cm-topbar-blur" aria-hidden="true"></div>
    <div id="cm-sec-sentinel" aria-hidden="true"></div>
    <header class="cm-sec-head" id="cm-sec-head">
      <div class="cm-sec-head-in">
        <h2>\u0428\u041E \u0412 \u0421\u0415\u041B\u0406?</h2>
        <!-- \u041F\u0456\u0434\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0417\u041D\u041E\u0412\u0423 \u0432 \u043B\u0438\u043F\u043A\u0456\u0439 \u0448\u0430\u043F\u0446\u0456 (\u0412\u043E\u0432\u0430 16.07, \u0432\u0435\u0447\u0456\u0440): \u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u0456
             \u043F\u0456\u0434\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u2014 \u043E\u0434\u043D\u0435 \u0446\u0456\u043B\u0435, \u043E\u0431\u0438\u0434\u0432\u0430 \u043B\u0438\u0448\u0430\u044E\u0442\u044C\u0441\u044F \u043D\u0430 \u0431\u043B\u044E\u0440\u0456 \u043A\u043E\u043B\u0438 \u0448\u0430\u043F\u043A\u0430 \u0437\u0430\u043B\u0438\u043F\u0430\u0454.
             \u0420\u0430\u043D\u0456\u0448\u0435 \u0431\u0443\u0432 \u0443 \u0442\u0456\u043B\u0456 \u0431\u043B\u043E\u043A\u0443 \u2192 \u0432\u0456\u0434\u0441\u043A\u0440\u043E\u043B\u044E\u0432\u0430\u0432\u0441\u044F \u0433\u0435\u0442\u044C, \u043D\u0430 \u0431\u043B\u044E\u0440\u0456 \u043B\u0438\u0448\u0430\u0432\u0441\u044F \u043B\u0438\u0448\u0435 h2. -->
        <p class="cm-sheet-sub">\u041E\u0441\u044C \u0449\u043E \u0433\u043E\u043B\u043E\u0432\u043D\u0435 \u0443 \u043D\u0430\u0441 \u0441\u044C\u043E\u0433\u043E\u0434\u043D\u0456</p>
      </div>
    </header>

    <!-- \u041F\u043E\u0440\u044F\u0434\u043E\u043A \u0431\u043B\u043E\u043A\u0456\u0432 (\u0440\u0456\u0448\u0435\u043D\u043D\u044F \u0420\u043E\u043C\u0438 08.07):
         \u0422\u0430\u0431\u043B\u043E \u043D\u043E\u0432\u0438\u043D \u2192 \u0414\u043E\u0448\u043A\u0430 \u2192 \u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0430 \u043F\u043E\u0434\u0456\u044F \u2192 \u0410\u0432\u0442\u043E\u0431\u0443\u0441\u0438 \u2192 \u041F\u043E\u0433\u043E\u0434\u0430 \u2192 \u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438. -->

    <section id="cm-news-board" class="cm-block cm-block--news">
      <div class="cm-news-board-bar">
        <span class="cm-news-board-dot"></span>
        <span class="cm-news-board-label">\u0422\u0430\u0431\u043B\u043E \u043D\u043E\u0432\u0438\u043D</span>
        <span class="cm-news-board-live">LIVE</span>
      </div>
      <div id="cm-news-content" class="cm-block-body cm-news-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
      <div id="cm-news-controls" class="cm-news-controls"></div>
    </section>

    <!-- \u0412\u0456\u0434\u0436\u0435\u0442 \u0414\u043E\u0448\u043A\u0438 (\u043F\u043E\u0432\u043D\u0430 \u043F\u0435\u0440\u0435\u0440\u043E\u0431\u043A\u0430 13.07, \u0440\u0456\u0448\u0435\u043D\u043D\u044F \u0412\u043E\u0432\u0438): \u0448\u0430\u043F\u043A\u0430 \u0442\u0435\u043F\u0435\u0440
         \u0443\u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0456 \u0432\u0456\u0434\u0436\u0435\u0442\u0430 (\u0440\u0435\u043D\u0434\u0435\u0440\u0438\u0442\u044C renderBoardBlock), \u0441\u0442\u0430\u0440\u0430 \xAB\u0414\u043E\u0448\u043A\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0438\xBB \u043F\u0440\u0438\u0431\u0440\u0430\u043D\u0430. -->
    <section class="cm-block cm-block--board">
      <div id="cm-board-content" class="cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0456 \u043F\u043E\u0434\u0456\u0457 \u0433\u0440\u043E\u043C\u0430\u0434\u0438</h3>
        <button class="cm-block-link" data-switch-tab="shotam">\u0410\u0444\u0456\u0448\u0430 \u2192</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>

    <section class="cm-block cm-block--bus">
      <div id="cm-bus-content" class="cm-block-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
      <footer class="cm-block-footer">
        <button class="cm-block-title cm-block-title--bus-link" data-switch-tab="buses">\u0420\u041E\u0417\u041A\u041B\u0410\u0414 \u0410\u0412\u0422\u041E\u0411\u0423\u0421\u041D\u0418\u0425 \u041C\u0410\u0420\u0428\u0420\u0423\u0422\u0406\u0412 \u2192</button>
      </footer>
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

    <section id="cm-contacts" class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">\u041A\u043E\u0440\u0438\u0441\u043D\u0456 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0438</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-body cm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div>
    </section>
    </div><!-- /.cm-sheet -->
  `;
  }
  var _greetingWired = false;
  var _focusWired = false;
  function initCenterFocus() {
    if (_focusWired)
      return;
    const main = document.querySelector(".app-main");
    if (!main)
      return;
    const allowMotion = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    _focusWired = true;
    let raf = null;
    let _stickyTop = null;
    let _secRestTop = null;
    let _maskW = 0;
    const buildSheetMask = (w) => {
      const H = 6e3, rB = 24, pw = 175, ph = 17, r = 17, sd = 1.5;
      const x1 = (w - pw) / 2, x2 = (w + pw) / 2;
      const path = `M 0 ${H} L 0 ${ph + rB} Q 0 ${ph} ${rB} ${ph} L ${x1} ${ph} A ${r} ${r} 0 0 1 ${x1 + r} 0 L ${x2 - r} 0 A ${r} ${r} 0 0 1 ${x2} ${ph} L ${w - rB} ${ph} Q ${w} ${ph} ${w} ${ph + rB} L ${w} ${H} Z`;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${H}'><filter id='b' x='-5%' y='-4%' width='110%' height='108%'><feGaussianBlur stdDeviation='0 ${sd}'/></filter><path d='${path}' fill='#fff' filter='url(#b)'/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    };
    const apply = () => {
      raf = null;
      if (main.dataset.tab !== "community")
        return;
      const vh = main.clientHeight;
      const viewCenter = vh / 2;
      const sec = document.getElementById("cm-sec-head");
      const hdr = document.querySelector(".app-header");
      if (sec) {
        const pinY = hdr ? hdr.getBoundingClientRect().bottom : 56;
        if (_stickyTop === null)
          _stickyTop = parseFloat(getComputedStyle(sec).top) || 0;
        const pinLine = pinY + _stickyTop;
        const secTop = sec.getBoundingClientRect().top;
        if (main.scrollTop < 4)
          _secRestTop = secTop;
        const startY = _secRestTop != null ? _secRestTop : secTop;
        const progColor = Math.max(0, Math.min(1, (startY - secTop) / Math.max(1, startY - pinLine)));
        const START = 0.4;
        const prog = progColor <= START ? 0 : (progColor - START) / (1 - START);
        const sheet = document.querySelector(".cm-sheet");
        if (sheet) {
          sheet.style.setProperty("--topbar-o", prog.toFixed(3));
          sheet.style.setProperty("--sheet-fade", progColor.toFixed(3));
          sheet.style.setProperty("--sheet-blur", (6 + 5 * progColor).toFixed(1) + "px");
          const w = sheet.clientWidth;
          if (w && w !== _maskW) {
            _maskW = w;
            sheet.style.setProperty("--sheet-mask", buildSheetMask(w));
          }
        }
        sec.classList.toggle("cm-sec-head--stuck", prog >= 0.4);
      }
      if (!allowMotion)
        return;
      let best = null, bestDist = Infinity;
      document.querySelectorAll("#cm-content .cm-block").forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) {
          if (b.dataset.cf) {
            b.style.transform = "";
            b.classList.remove("cm-block--focus");
            delete b.dataset.cf;
          }
          return;
        }
        const blockCenter = (r.top + r.bottom) / 2;
        const dist = Math.abs(blockCenter - viewCenter);
        const scaleDist = b.id === "cm-news-board" && blockCenter > viewCenter ? 0 : dist;
        const t = Math.min(1, scaleDist / (vh * 0.55));
        b.style.transform = `scale(${(1 - 0.05 * t).toFixed(4)})`;
        b.dataset.cf = "1";
        if (dist < bestDist) {
          bestDist = dist;
          best = b;
        }
      });
      document.querySelectorAll("#cm-content .cm-block--focus").forEach((b) => {
        if (b !== best)
          b.classList.remove("cm-block--focus");
      });
      if (best)
        best.classList.add("cm-block--focus");
    };
    const onScroll = () => {
      if (!raf)
        raf = requestAnimationFrame(apply);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("cstl-tab-changed", onScroll);
    onScroll();
  }
  function initCommunity() {
    renderSkeleton();
    attachSwitchTabDelegation();
    startHeroRotator();
    initCenterFocus();
    refreshAccountButtons();
    if (!_greetingWired) {
      onAuthChange(updateGreetingName);
      _greetingWired = true;
    }
    updateGreetingName();
    renderWeatherBlock();
    renderBusBlock();
    renderBoardBlock();
    renderEventBlock();
    renderContactsBlock();
    renderCommunityNews();
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

  // src/tabs/feed.js
  var IC_HEART_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1z"/></svg>';
  var IC_HEART_F = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1z"/></svg>';
  var IC_COMMENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z"/></svg>';
  var IC_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></svg>';
  var IC_BELL_F = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M14.235 19c.865 0 1.322 1.024.745 1.668A3.992 3.992 0 0 1 12 22a3.992 3.992 0 0 1-2.98-1.332c-.552-.616-.158-1.579.634-1.661L10 19h4.235z"/><path d="M12 2c1.358 0 2.506.903 2.875 2.141l.046.171.008.043a8.013 8.013 0 0 1 4.024 6.069l.028.287L19 11v2.931l.021.136a3 3 0 0 0 1.143 1.847l.167.117.162.099c.86.487.56 1.766-.377 1.864L20 18H4c-1.028 0-1.387-1.364-.493-1.87a3 3 0 0 0 1.472-2.063L5 13.924V11c0-2.71 1.346-5.152 3.454-6.62A3.002 3.002 0 0 1 12 2z"/></svg>';
  var IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>';
  var IC_IMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>';
  var IC_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/></svg>';
  var IC_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
  var IC_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
  var IC_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.83 2.83 0 0 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>';
  var IC_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2l1 -2h8l1 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><circle cx="12" cy="13" r="3"/></svg>';
  var IC_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
  var pages = [];
  var posts = [];
  var reactionMap = /* @__PURE__ */ new Map();
  var commentMap = /* @__PURE__ */ new Map();
  var comReactMap = /* @__PURE__ */ new Map();
  var myPageIds = /* @__PURE__ */ new Set();
  var mySubs = /* @__PURE__ */ new Set();
  var feedSearch = "";
  var loaded = false;
  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t))
      return "";
    const diff = Math.floor((Date.now() - t) / 1e3);
    if (diff < 60)
      return "\u0449\u043E\u0439\u043D\u043E";
    if (diff < 3600)
      return `${Math.floor(diff / 60)} \u0445\u0432`;
    if (diff < 86400)
      return `${Math.floor(diff / 3600)} \u0433\u043E\u0434`;
    if (diff < 172800)
      return "\u0432\u0447\u043E\u0440\u0430";
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function avatarHtml(url, name, cls) {
    const letter = escapeHtml((name || "?").trim().charAt(0).toUpperCase() || "?");
    if (url)
      return `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy">`;
    return `<span class="${cls} ${cls}--ph">${letter}</span>`;
  }
  async function loadData2() {
    const [pg, ps, rx, cm, cr, mine, subs] = await Promise.all([
      fetchPages(),
      fetchPagePosts(null, 60),
      fetchPageReactions(currentUserId()),
      fetchPageComments(),
      fetchPageCommentReactions(currentUserId()),
      isLoggedIn() ? fetchMyEditablePageIds() : Promise.resolve(/* @__PURE__ */ new Set()),
      isLoggedIn() ? fetchMySubscriptions() : Promise.resolve(/* @__PURE__ */ new Set())
    ]);
    pages = pg;
    posts = ps;
    reactionMap = rx;
    commentMap = cm;
    comReactMap = cr;
    myPageIds = mine;
    mySubs = subs;
    const uids = [...new Set(posts.map((p) => p.author_uid).filter(Boolean))];
    if (uids.length)
      await fetchAvatars(uids);
    loaded = true;
  }
  function circlesHtml() {
    if (!pages.length)
      return "";
    return `<div class="fd-circles">${pages.map((p) => `
    <button class="fd-circle" data-open-page="${p.id}" type="button">
      <span class="fd-circle-ring">${avatarHtml(p.avatar_url, p.name, "fd-circle-ava")}</span>
      <span class="fd-circle-label">${escapeHtml(p.name)}</span>
    </button>`).join("")}</div>`;
  }
  function postImages(post) {
    if (Array.isArray(post.image_urls) && post.image_urls.length)
      return post.image_urls;
    if (post.image_url)
      return [post.image_url];
    return [];
  }
  function galleryHtml(images, postId) {
    if (!images.length)
      return "";
    if (images.length === 1) {
      return `<div class="fd-photo" data-view="${postId}" data-idx="0"><img src="${escapeHtml(images[0])}" alt="" loading="lazy"></div>`;
    }
    const slides = images.map((u, i) => `<div class="fd-gal-slide" data-view="${postId}" data-idx="${i}"><img src="${escapeHtml(u)}" alt="" loading="lazy"></div>`).join("");
    const dots = images.map((_, i) => `<span class="fd-gal-dot${i === 0 ? " on" : ""}"></span>`).join("");
    return `<div class="fd-gallery" data-count="${images.length}">
    <div class="fd-gal-track">${slides}</div>
    <div class="fd-gal-count"><span class="fd-gal-cur">1</span>/${images.length}</div>
    <div class="fd-gal-dots">${dots}</div>
  </div>`;
  }
  function wireGalleries(root) {
    root.querySelectorAll(".fd-gallery").forEach((g) => {
      if (g.dataset.wired)
        return;
      g.dataset.wired = "1";
      const track = g.querySelector(".fd-gal-track");
      const dots = g.querySelectorAll(".fd-gal-dot");
      const cur = g.querySelector(".fd-gal-cur");
      track.addEventListener("scroll", () => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        dots.forEach((d, k) => d.classList.toggle("on", k === i));
        if (cur)
          cur.textContent = String(i + 1);
      }, { passive: true });
    });
  }
  function openViewer(images, startIdx) {
    if (!images.length)
      return;
    const ov = document.createElement("div");
    ov.className = "fd-viewer";
    ov.innerHTML = `
    <button class="fd-viewer-close" type="button">${IC_CLOSE}</button>
    <div class="fd-viewer-track">${images.map((u) => `<div class="fd-viewer-slide"><img src="${escapeHtml(u)}" alt=""></div>`).join("")}</div>`;
    const close = () => {
      ov.remove();
      document.body.style.overflow = "";
    };
    ov.querySelector(".fd-viewer-close").addEventListener("click", close);
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.classList.contains("fd-viewer-slide"))
        close();
    });
    document.body.appendChild(ov);
    document.body.style.overflow = "hidden";
    const track = ov.querySelector(".fd-viewer-track");
    track.scrollLeft = (startIdx || 0) * track.clientWidth;
  }
  function postCardHtml(post) {
    const page = post.pages || {};
    const rx = reactionMap.get(post.id) || { count: 0, my: false };
    const cCount = (commentMap.get(post.id) || []).length;
    const authorName = post.author_uid ? liveName("", post.author_uid, "") : "";
    const photo = galleryHtml(postImages(post), post.id);
    const author = authorName ? `<div class="fd-author"${nameUid(post.author_uid)}>\u2014 ${authorName}</div>` : "";
    return `
    <article class="fd-card" data-post="${post.id}">
      <header class="fd-card-head" data-open-page="${post.page_id}">
        <span class="fd-ava-wrap">${avatarHtml(page.avatar_url, page.name, "fd-ava")}</span>
        <span class="fd-head-txt">
          <span class="fd-page-name">${escapeHtml(page.name || "\u0421\u0442\u043E\u0440\u0456\u043D\u043A\u0430")}</span>
          <span class="fd-time">${relTime(post.created_at)}</span>
        </span>
      </header>
      ${photo}
      <div class="fd-text">${escapeHtml(post.text)}</div>
      ${author}
      <footer class="fd-actions">
        <button class="fd-like${rx.my ? " fd-like--on" : ""}" data-like="${post.id}" type="button">
          <span class="fd-ic">${rx.my ? IC_HEART_F : IC_HEART_O}</span><span class="fd-cnt">${rx.count || ""}</span>
        </button>
        <button class="fd-cbtn" data-comments="${post.id}" type="button">
          <span class="fd-ic">${IC_COMMENT}</span><span class="fd-cnt">${cCount || ""}</span>
        </button>
      </footer>
    </article>`;
  }
  function renderFeed() {
    const circlesEl = document.getElementById("feed-circles");
    const listEl = document.getElementById("feed-list");
    if (circlesEl)
      circlesEl.innerHTML = circlesHtml();
    if (!listEl)
      return;
    const q = feedSearch.trim().toLowerCase();
    const shown = q ? posts.filter((p) => ((p.pages?.name || "") + " " + (p.text || "")).toLowerCase().includes(q)) : posts;
    if (!shown.length) {
      listEl.innerHTML = q ? `<div class="fd-empty">\u041D\u0456\u0447\u043E\u0433\u043E \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0437\u0430 \u0437\u0430\u043F\u0438\u0442\u043E\u043C \xAB${escapeHtml(feedSearch.trim())}\xBB.</div>` : `<div class="fd-empty">\u041F\u043E\u043A\u0438 \u0449\u043E \u0442\u0443\u0442 \u043F\u043E\u0440\u043E\u0436\u043D\u044C\u043E.<br>\u041D\u0435\u0437\u0430\u0431\u0430\u0440\u043E\u043C \u0441\u0442\u043E\u0440\u0456\u043D\u043A\u0438 \u0433\u0440\u043E\u043C\u0430\u0434\u0438 \u043F\u043E\u0447\u043D\u0443\u0442\u044C \u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438 \u043D\u043E\u0432\u0438\u043D\u0438.</div>`;
      return;
    }
    listEl.innerHTML = shown.map(postCardHtml).join("");
    wireGalleries(listEl);
  }
  async function toggleLike(postId) {
    if (!isLoggedIn()) {
      requireAuth("\u0432\u043F\u043E\u0434\u043E\u0431\u0430\u0442\u0438 \u043F\u043E\u0441\u0442", () => {
      });
      return;
    }
    const uid = currentUserId();
    const rx = reactionMap.get(postId) || { count: 0, my: false };
    const on = !rx.my;
    reactionMap.set(postId, { count: Math.max(0, rx.count + (on ? 1 : -1)), my: on });
    patchLike(postId);
    const res = await setPageReaction(postId, uid, on);
    if (!res.ok) {
      reactionMap.set(postId, rx);
      patchLike(postId);
    }
  }
  function applyReactionEvent(payload) {
    const row = payload.new || payload.old;
    if (!row || row.post_id == null)
      return;
    if (row.user_id === currentUserId())
      return;
    const rx = reactionMap.get(row.post_id) || { count: 0, my: false };
    if (payload.eventType === "INSERT")
      rx.count += 1;
    else if (payload.eventType === "DELETE")
      rx.count = Math.max(0, rx.count - 1);
    else
      return;
    reactionMap.set(row.post_id, rx);
    patchLike(row.post_id);
  }
  function patchLike(postId) {
    const rx = reactionMap.get(postId) || { count: 0, my: false };
    document.querySelectorAll(`[data-like="${postId}"]`).forEach((btn) => {
      btn.classList.toggle("fd-like--on", rx.my);
      btn.querySelector(".fd-ic").innerHTML = rx.my ? IC_HEART_F : IC_HEART_O;
      btn.querySelector(".fd-cnt").textContent = rx.count || "";
    });
  }
  var openCommentSheet = null;
  var replyTarget = null;
  function pluralComments(n) {
    const d = n % 10, h = n % 100;
    if (d === 1 && h !== 11)
      return "\u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440";
    if (d >= 2 && d <= 4 && (h < 12 || h > 14))
      return "\u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456";
    return "\u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456\u0432";
  }
  function commentRowHtml(c, reply = false) {
    const nm = c.author_uid ? liveName("", c.author_uid, "\u0416\u0438\u0442\u0435\u043B\u044C") : "\u0416\u0438\u0442\u0435\u043B\u044C";
    const mine = c.author_uid && c.author_uid === currentUserId();
    const lr = comReactMap.get(c.id) || { count: 0, my: false };
    return `<div class="fd-com-row${reply ? " fd-com-row--reply" : ""}"${c.author_uid ? ` data-com-uid="${c.author_uid}"` : ""}>
      <span class="fd-com-ava">${avatarHtml(cachedAvatar(c.author_uid), nm, "fd-com-ava-img")}</span>
      <div class="fd-com-body">
        <div class="fd-com-line"><span class="fd-com-name"${nameUid(c.author_uid)}>${nm}</span> <span class="fd-com-txt">${escapeHtml(c.text)}</span></div>
        <div class="fd-com-meta"><span class="fd-com-time">${relTime(c.created_at)}</span><button class="fd-com-reply" data-reply-parent="${c.parent_id || c.id}" data-reply-uid="${c.author_uid || ""}" type="button">\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0441\u0442\u0438</button>${mine ? `<button class="fd-com-del" data-del-com="${c.id}" type="button">\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438</button>` : ""}</div>
      </div>
      <div class="fd-com-likewrap">
        <button class="fd-com-like${lr.my ? " fd-com-like--on" : ""}" data-com-like="${c.id}" type="button" aria-label="\u0412\u043F\u043E\u0434\u043E\u0431\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440">${lr.my ? IC_HEART_F : IC_HEART_O}</button>
        <span class="fd-com-likecnt" data-com-likes="${c.id}">${lr.count || ""}</span>
      </div>
    </div>`;
  }
  function orderedComments(list) {
    const repliesByParent = /* @__PURE__ */ new Map();
    for (const c of list)
      if (c.parent_id) {
        if (!repliesByParent.has(c.parent_id))
          repliesByParent.set(c.parent_id, []);
        repliesByParent.get(c.parent_id).push(c);
      }
    const out = [];
    for (const c of list)
      if (!c.parent_id) {
        out.push({ c, reply: false });
        for (const r of repliesByParent.get(c.id) || [])
          out.push({ c: r, reply: true });
      }
    const shown = new Set(out.map((o) => o.c.id));
    for (const c of list)
      if (!shown.has(c.id))
        out.push({ c, reply: false });
    return out;
  }
  function patchCommentLike(id) {
    const lr = comReactMap.get(id) || { count: 0, my: false };
    document.querySelectorAll(`[data-com-like="${id}"]`).forEach((b) => {
      b.classList.toggle("fd-com-like--on", lr.my);
      b.innerHTML = lr.my ? IC_HEART_F : IC_HEART_O;
    });
    document.querySelectorAll(`[data-com-likes="${id}"]`).forEach((el) => {
      el.textContent = lr.count || "";
    });
  }
  async function toggleCommentLike(id) {
    if (!isLoggedIn()) {
      requireAuth("\u0432\u043F\u043E\u0434\u043E\u0431\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440", () => {
      });
      return;
    }
    const uid = currentUserId();
    const lr = comReactMap.get(id) || { count: 0, my: false };
    const on = !lr.my;
    comReactMap.set(id, { count: Math.max(0, lr.count + (on ? 1 : -1)), my: on });
    patchCommentLike(id);
    const res = await setPageCommentReaction(id, uid, on);
    if (!res.ok) {
      comReactMap.set(id, lr);
      patchCommentLike(id);
    }
  }
  function applyCommentReactionEvent(payload) {
    const row = payload.new || payload.old;
    if (!row || row.comment_id == null)
      return;
    if (row.user_id === currentUserId())
      return;
    const lr = comReactMap.get(row.comment_id) || { count: 0, my: false };
    if (payload.eventType === "INSERT")
      lr.count += 1;
    else if (payload.eventType === "DELETE")
      lr.count = Math.max(0, lr.count - 1);
    else
      return;
    comReactMap.set(row.comment_id, lr);
    patchCommentLike(row.comment_id);
  }
  function renderCommentSheet() {
    if (!openCommentSheet)
      return;
    const { postId, listEl, titleEl } = openCommentSheet;
    const list = commentMap.get(postId) || [];
    if (titleEl)
      titleEl.textContent = list.length ? `${list.length} ${pluralComments(list.length)}` : "\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456";
    listEl.innerHTML = list.length ? orderedComments(list).map((o) => commentRowHtml(o.c, o.reply)).join("") : `<div class="fd-com-empty">\u0429\u0435 \u043D\u0435\u043C\u0430\u0454 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456\u0432. \u0411\u0443\u0434\u044C\u0442\u0435 \u043F\u0435\u0440\u0448\u0438\u043C!</div>`;
  }
  function patchCommentCount(postId) {
    const n = (commentMap.get(postId) || []).length;
    document.querySelectorAll(`[data-comments="${postId}"] .fd-cnt`).forEach((el) => el.textContent = n || "");
  }
  function applyCommentUpsert(c) {
    if (!c)
      return;
    if (c.deleted_at) {
      applyCommentRemove(c);
      return;
    }
    const arr = commentMap.get(c.post_id) || [];
    const idx = arr.findIndex((x) => x.id === c.id);
    if (idx >= 0)
      arr[idx] = c;
    else
      arr.push(c);
    arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    commentMap.set(c.post_id, arr);
    if (c.author_uid && !cachedName(c.author_uid)) {
      fetchAvatars([c.author_uid]).then(() => {
        if (openCommentSheet && openCommentSheet.postId === c.post_id)
          renderCommentSheet();
      });
    }
    if (openCommentSheet && openCommentSheet.postId === c.post_id)
      renderCommentSheet();
    patchCommentCount(c.post_id);
  }
  function applyCommentRemove(c) {
    if (!c)
      return;
    const arr = commentMap.get(c.post_id);
    if (!arr)
      return;
    commentMap.set(c.post_id, arr.filter((x) => x.id !== c.id));
    if (openCommentSheet && openCommentSheet.postId === c.post_id)
      renderCommentSheet();
    patchCommentCount(c.post_id);
  }
  function openComments(postId) {
    const myUid = currentUserId();
    const myAva = avatarHtml(cachedAvatar(myUid), cachedName(myUid) || "\u042F", "fd-com-ava-img");
    const sheet = document.createElement("div");
    sheet.className = "fd-sheet-back";
    sheet.innerHTML = `
    <div class="fd-sheet fd-com-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title fd-com-title">\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456</div>
      <div class="fd-com-list"></div>
      <div class="fd-com-replybar" hidden><span class="fd-com-replyto"></span><button class="fd-com-replyx" type="button" aria-label="\u0421\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u044C">${IC_X}</button></div>
      <div class="fd-com-compose">
        <span class="fd-com-ava fd-com-myava">${myAva}</span>
        <input class="fd-com-input" type="text" placeholder="\u0414\u043E\u0434\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u2026" maxlength="1000">
        <button class="fd-com-send" type="button">${IC_SEND}</button>
      </div>
    </div>`;
    const listEl = sheet.querySelector(".fd-com-list");
    const titleEl = sheet.querySelector(".fd-com-title");
    const replyBar = sheet.querySelector(".fd-com-replybar");
    const replyTo = sheet.querySelector(".fd-com-replyto");
    replyTarget = null;
    openCommentSheet = { postId, back: sheet, listEl, titleEl };
    renderCommentSheet();
    const clearReply = () => {
      replyTarget = null;
      replyBar.hidden = true;
    };
    const setReply = (parentId, name) => {
      replyTarget = { parentId, name };
      replyTo.textContent = `\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u044C \u0434\u043B\u044F ${name}`;
      replyBar.hidden = false;
      sheet.querySelector(".fd-com-input")?.focus();
    };
    sheet.querySelector(".fd-com-replyx").addEventListener("click", clearReply);
    if (myUid && !cachedName(myUid))
      fetchAvatars([myUid]).then(() => {
        const el = sheet.querySelector(".fd-com-myava");
        if (el)
          el.innerHTML = avatarHtml(cachedAvatar(myUid), cachedName(myUid) || "\u042F", "fd-com-ava-img");
      });
    const close = () => {
      sheet.remove();
      if (openCommentSheet && openCommentSheet.back === sheet)
        openCommentSheet = null;
    };
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet)
        close();
    });
    listEl.addEventListener("click", async (e) => {
      const like = e.target.closest("[data-com-like]");
      if (like) {
        toggleCommentLike(Number(like.dataset.comLike));
        return;
      }
      const rep = e.target.closest("[data-reply-parent]");
      if (rep) {
        const uid = rep.dataset.replyUid;
        setReply(Number(rep.dataset.replyParent), uid && cachedName(uid) || "\u0416\u0438\u0442\u0435\u043B\u044C");
        return;
      }
      const del = e.target.closest("[data-del-com]");
      if (!del)
        return;
      const id = Number(del.dataset.delCom);
      if (!confirm("\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440?"))
        return;
      const res = await deletePageComment(id);
      if (res.ok)
        applyCommentRemove({ id, post_id: postId });
      else
        alert("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438: " + (res.error || ""));
    });
    const input = sheet.querySelector(".fd-com-input");
    const sendBtn = sheet.querySelector(".fd-com-send");
    const send = async () => {
      const text = input.value.trim();
      if (!text)
        return;
      if (!isLoggedIn()) {
        close();
        requireAuth("\u0437\u0430\u043B\u0438\u0448\u0438\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440", () => {
        });
        return;
      }
      sendBtn.disabled = true;
      const parentId = replyTarget ? replyTarget.parentId : null;
      const res = await addPageComment(postId, currentUserId(), text, parentId);
      sendBtn.disabled = false;
      if (res.ok) {
        applyCommentUpsert(res.comment);
        input.value = "";
        clearReply();
        input.focus();
      } else {
        alert("\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440 \u043D\u0435 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E: " + (res.error || "\u043D\u0435\u0432\u0456\u0434\u043E\u043C\u0430 \u043F\u043E\u043C\u0438\u043B\u043A\u0430"));
      }
    };
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")
        send();
    });
    document.body.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add("open"));
  }
  async function openPageScreen(pageId) {
    const page = pages.find((p) => p.id === pageId);
    if (!page)
      return;
    const canEdit = myPageIds.has(pageId);
    const subscribed = mySubs.has(pageId);
    const pagePosts = posts.filter((p) => p.page_id === pageId);
    const screen = document.createElement("div");
    screen.className = "fd-screen";
    screen.innerHTML = `
    <div class="fd-screen-top">
      <button class="fd-screen-back" type="button">${IC_BACK}</button>
      ${canEdit ? `<button class="fd-screen-menu" type="button" aria-label="\u041C\u0435\u043D\u044E \u0441\u0442\u043E\u0440\u0456\u043D\u043A\u0438">${IC_DOTS}</button>` : ""}
      <button class="fd-bell${subscribed ? " fd-bell--on" : ""}" data-bell="${pageId}" type="button" aria-label="\u0421\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F">
        ${subscribed ? IC_BELL_F : IC_BELL}
      </button>
      <div class="fd-banner${page.banner_url ? " fd-banner--view" : ""}">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ""}</div>
      ${canEdit ? `<div class="fd-screen-menu-pop" hidden><button class="fd-screen-menu-item" data-edit-page="${pageId}" type="button">${IC_EDIT}\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438 \u0441\u0442\u043E\u0440\u0456\u043D\u043A\u0443</button></div>` : ""}
    </div>
    <div class="fd-screen-body">
      <div class="fd-screen-id">
        <span class="fd-screen-ava-wrap">
          <span class="fd-screen-ava${page.avatar_url ? " fd-screen-ava--view" : ""}">${avatarHtml(page.avatar_url, page.name, "fd-screen-ava-img")}</span>
        </span>
        <div class="fd-screen-name">${escapeHtml(page.name)}</div>
        ${page.theme ? `<div class="fd-screen-theme">${escapeHtml(page.theme)}</div>` : ""}
      </div>
      ${canEdit ? `<button class="fd-compose-open" type="button">${IC_IMG}<span>\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u043F\u043E\u0441\u0442\u2026</span></button>` : ""}
      <div class="fd-screen-list">${pagePosts.length ? pagePosts.map(postCardHtml).join("") : '<div class="fd-empty">\u0422\u0443\u0442 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454 \u043F\u043E\u0441\u0442\u0456\u0432.</div>'}</div>
    </div>`;
    screen.querySelector(".fd-screen-back").addEventListener("click", () => {
      screen.classList.remove("open");
      setTimeout(() => screen.remove(), 240);
    });
    const composeBtn = screen.querySelector(".fd-compose-open");
    if (composeBtn)
      composeBtn.addEventListener("click", () => openComposer(pageId));
    screen.querySelectorAll("[data-edit-page]").forEach((b) => b.addEventListener("click", () => openPageEditor(pageId)));
    wireCards(screen);
    wireGalleries(screen);
    screen.querySelector(".fd-bell")?.addEventListener("click", () => toggleBell(pageId, screen));
    if (page.banner_url)
      screen.querySelector(".fd-banner--view")?.addEventListener("click", () => openViewer([page.banner_url], 0));
    if (page.avatar_url)
      screen.querySelector(".fd-screen-ava--view")?.addEventListener("click", () => openViewer([page.avatar_url], 0));
    const menuBtn = screen.querySelector(".fd-screen-menu");
    const menuPop = screen.querySelector(".fd-screen-menu-pop");
    if (menuBtn && menuPop) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        menuPop.hidden = !menuPop.hidden;
      });
      screen.addEventListener("click", () => {
        if (!menuPop.hidden)
          menuPop.hidden = true;
      });
    }
    document.body.appendChild(screen);
    requestAnimationFrame(() => screen.classList.add("open"));
  }
  async function toggleBell(pageId, screen) {
    if (!isLoggedIn()) {
      requireAuth("\u0443\u0432\u0456\u043C\u043A\u043D\u0443\u0442\u0438 \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F", () => {
      });
      return;
    }
    const on = !mySubs.has(pageId);
    if (on)
      mySubs.add(pageId);
    else
      mySubs.delete(pageId);
    const btn = screen.querySelector(".fd-bell");
    if (btn) {
      btn.classList.toggle("fd-bell--on", on);
      btn.innerHTML = on ? IC_BELL_F : IC_BELL;
    }
    const res = await setPageSubscription(pageId, currentUserId(), on);
    if (!res.ok) {
      if (on)
        mySubs.delete(pageId);
      else
        mySubs.add(pageId);
      if (btn) {
        btn.classList.toggle("fd-bell--on", !on);
        btn.innerHTML = !on ? IC_BELL_F : IC_BELL;
      }
    }
  }
  var MAX_PHOTOS = 10;
  function openComposer(pageId) {
    const page = pages.find((p) => p.id === pageId);
    if (!page)
      return;
    let files = [];
    let previewUrls = [];
    const back = document.createElement("div");
    back.className = "fd-sheet-back";
    back.innerHTML = `
    <div class="fd-sheet fd-composer">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">\u041D\u043E\u0432\u0438\u0439 \u043F\u043E\u0441\u0442 \xB7 ${escapeHtml(page.name)}</div>
      <textarea class="fd-comp-text" placeholder="\u0429\u043E \u043D\u043E\u0432\u043E\u0433\u043E?" maxlength="4000" rows="5"></textarea>
      <div class="fd-comp-thumbs" hidden></div>
      <div class="fd-comp-bar">
        <label class="fd-comp-photo">${IC_IMG}<input type="file" accept="image/*" multiple hidden></label>
        <button class="fd-comp-send" type="button">\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438</button>
      </div>
    </div>`;
    const close = () => {
      previewUrls.forEach((u) => URL.revokeObjectURL(u));
      back.remove();
    };
    back.addEventListener("click", (e) => {
      if (e.target === back)
        close();
    });
    const fileInput = back.querySelector("input[type=file]");
    const thumbs = back.querySelector(".fd-comp-thumbs");
    const renderThumbs = () => {
      if (!files.length) {
        thumbs.hidden = true;
        thumbs.innerHTML = "";
        return;
      }
      thumbs.hidden = false;
      thumbs.innerHTML = files.map((f, i) => `<div class="fd-comp-thumb"><img src="${previewUrls[i]}" alt="">
        <button class="fd-comp-thumb-x" data-rm="${i}" type="button">${IC_X}</button></div>`).join("");
    };
    fileInput.addEventListener("change", () => {
      for (const f of fileInput.files) {
        if (files.length >= MAX_PHOTOS)
          break;
        files.push(f);
        previewUrls.push(URL.createObjectURL(f));
      }
      fileInput.value = "";
      renderThumbs();
    });
    thumbs.addEventListener("click", (e) => {
      const x = e.target.closest("[data-rm]");
      if (!x)
        return;
      const i = Number(x.dataset.rm);
      URL.revokeObjectURL(previewUrls[i]);
      files.splice(i, 1);
      previewUrls.splice(i, 1);
      renderThumbs();
    });
    const sendBtn = back.querySelector(".fd-comp-send");
    sendBtn.addEventListener("click", async () => {
      const text = back.querySelector(".fd-comp-text").value.trim();
      if (!text && !files.length)
        return;
      sendBtn.disabled = true;
      sendBtn.textContent = "\u041F\u0443\u0431\u043B\u0456\u043A\u0443\u044E\u2026";
      let urls = [];
      if (files.length) {
        const ups = await Promise.all(files.map((f) => uploadPhotoToStorage(f, "pages/")));
        urls = ups.map((u) => u.url).filter(Boolean);
        const failed = ups.length - urls.length;
        if (failed > 0) {
          sendBtn.disabled = false;
          sendBtn.textContent = "\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438";
          const firstErr = ups.find((u) => !u.url)?.error || "";
          alert(`\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 ${failed} \u0444\u043E\u0442\u043E: ${firstErr}
\u0421\u043F\u0440\u043E\u0431\u0443\u0439 \u0449\u0435 \u0440\u0430\u0437.`);
          return;
        }
      }
      const res = await createPagePost(pageId, currentUserId(), text || "", urls);
      if (res.ok) {
        posts.unshift(res.post);
        close();
        document.querySelectorAll(".fd-screen").forEach((s) => s.remove());
        renderFeed();
        openPageScreen(pageId);
      } else {
        sendBtn.disabled = false;
        sendBtn.textContent = "\u041E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438";
        alert("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043E\u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438: " + (res.error || ""));
      }
    });
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add("open"));
  }
  function openPageEditor(pageId) {
    const page = pages.find((p) => p.id === pageId);
    if (!page)
      return;
    let bannerBlob = null, avatarBlob = null;
    const back = document.createElement("div");
    back.className = "fd-sheet-back";
    back.innerHTML = `
    <div class="fd-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">\u0420\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438 \u0441\u0442\u043E\u0440\u0456\u043D\u043A\u0443</div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">\u0411\u0430\u043D\u0435\u0440 (\u0448\u0438\u0440\u043E\u043A\u0430 \u0448\u0430\u043F\u043A\u0430)</div>
        <label class="fd-edit-banner">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ""}${IC_CAMERA}<input type="file" accept="image/*" hidden data-b></label>
      </div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">\u0410\u0432\u0430\u0442\u0430\u0440</div>
        <label class="fd-edit-avatar">${page.avatar_url ? `<img src="${escapeHtml(page.avatar_url)}" alt="">` : ""}${IC_CAMERA}<input type="file" accept="image/*" hidden data-a></label>
      </div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">\u0422\u0435\u043C\u0430 / \u043E\u043F\u0438\u0441</div>
        <input class="fd-edit-input" data-theme value="${escapeHtml(page.theme || "")}" maxlength="80" placeholder="\u043D\u0430\u043F\u0440. \u041A\u0443\u043B\u044C\u0442\u0443\u0440\u0430, \u0422\u0443\u0440\u0438\u0437\u043C">
      </div>
      <button class="fd-edit-save" type="button">\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438</button>
    </div>`;
    const close = () => back.remove();
    back.addEventListener("click", (e) => {
      if (e.target === back)
        close();
    });
    const setPreview = (label, file) => {
      label.querySelector("img")?.remove();
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      label.prepend(img);
    };
    const bInput = back.querySelector("[data-b]");
    const aInput = back.querySelector("[data-a]");
    bInput.addEventListener("change", () => {
      const f = bInput.files?.[0];
      if (f) {
        bannerBlob = f;
        setPreview(back.querySelector(".fd-edit-banner"), f);
      }
    });
    aInput.addEventListener("change", () => {
      const f = aInput.files?.[0];
      if (f) {
        avatarBlob = f;
        setPreview(back.querySelector(".fd-edit-avatar"), f);
      }
    });
    const saveBtn = back.querySelector(".fd-edit-save");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "\u0417\u0431\u0435\u0440\u0456\u0433\u0430\u044E\u2026";
      const patch = {};
      if (bannerBlob) {
        const up = await uploadPhotoToStorage(bannerBlob, "pages/");
        if (!up.url) {
          saveBtn.disabled = false;
          saveBtn.textContent = "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438";
          alert("\u0411\u0430\u043D\u0435\u0440 \u043D\u0435 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0432\u0441\u044F: " + (up.error || ""));
          return;
        }
        patch.banner_url = up.url;
      }
      if (avatarBlob) {
        const up = await uploadPhotoToStorage(avatarBlob, "pages/");
        if (!up.url) {
          saveBtn.disabled = false;
          saveBtn.textContent = "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438";
          alert("\u0410\u0432\u0430\u0442\u0430\u0440 \u043D\u0435 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0432\u0441\u044F: " + (up.error || ""));
          return;
        }
        patch.avatar_url = up.url;
      }
      const theme = back.querySelector("[data-theme]").value.trim();
      if (theme !== (page.theme || ""))
        patch.theme = theme;
      if (!Object.keys(patch).length) {
        close();
        return;
      }
      const res = await updatePage(pageId, patch);
      if (res.ok) {
        Object.assign(page, res.page);
        posts.forEach((p) => {
          if (p.page_id === pageId && p.pages) {
            p.pages.avatar_url = page.avatar_url;
            p.pages.name = page.name;
          }
        });
        close();
        document.querySelectorAll(".fd-screen").forEach((s) => s.remove());
        renderFeed();
        openPageScreen(pageId);
      } else {
        saveBtn.disabled = false;
        saveBtn.textContent = "\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438";
        alert("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0431\u0435\u0440\u0435\u0433\u0442\u0438: " + (res.error || ""));
      }
    });
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add("open"));
  }
  function wireCards(root) {
    root.addEventListener("click", (e) => {
      const likeBtn = e.target.closest("[data-like]");
      if (likeBtn) {
        toggleLike(Number(likeBtn.dataset.like));
        return;
      }
      const comBtn = e.target.closest("[data-comments]");
      if (comBtn) {
        openComments(Number(comBtn.dataset.comments));
        return;
      }
      const view = e.target.closest("[data-view]");
      if (view) {
        const post = posts.find((p) => p.id === Number(view.dataset.view));
        if (post)
          openViewer(postImages(post), Number(view.dataset.idx) || 0);
        return;
      }
      const openPage = e.target.closest("[data-open-page]");
      if (openPage) {
        openPageScreen(Number(openPage.dataset.openPage));
        return;
      }
    });
  }
  async function initFeed() {
    const root = document.getElementById("page-shotam");
    if (root && !root.dataset.fdWired) {
      wireCards(root);
      const sBtn = document.getElementById("feed-search-btn");
      const sBar = document.getElementById("feed-search");
      const sInp = document.getElementById("feed-search-input");
      sBtn?.addEventListener("click", () => {
        const show = sBar.hidden;
        sBar.hidden = !show;
        if (show)
          sInp.focus();
        else {
          sInp.value = "";
          feedSearch = "";
          renderFeed();
        }
      });
      sInp?.addEventListener("input", () => {
        feedSearch = sInp.value;
        renderFeed();
      });
      subscribePageComments((payload) => {
        const t = payload.eventType;
        if (t === "DELETE")
          applyCommentRemove(payload.old);
        else
          applyCommentUpsert(payload.new);
      });
      subscribePageReactions(applyReactionEvent);
      subscribePageCommentReactions(applyCommentReactionEvent);
      root.dataset.fdWired = "1";
    }
    await loadData2();
    renderFeed();
    window.addEventListener("cstl-tab-changed", () => {
      if (document.querySelector('.tab-item[data-tab="shotam"].active')) {
        loadData2().then(renderFeed);
      }
    });
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
      <button class="pw-ics-btn" id="pw-ics-btn">${ICONS.calendar} \u0414\u043E\u0434\u0430\u0442\u0438 \u0432\u0456\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u043D\u044F \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440</button>
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
    openModal({
      title: "\u042F\u043A \u0434\u0456\u0437\u043D\u0430\u0442\u0438\u0441\u044C \u0441\u0432\u043E\u044E \u0447\u0435\u0440\u0433\u0443?",
      bodyHtml: `
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
          <span class="pw-help-emoji">${ICONS.phone}</span>
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
    `
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

  // src/core/legal.js
  var LEGAL_UPDATED = "07.07.2026";
  var CONTACT = "olykacastle@gmail.com";
  var PRIVACY_HTML = `
  <h3 class="legal-h">\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0430 \u043A\u043E\u043D\u0444\u0456\u0434\u0435\u043D\u0446\u0456\u0439\u043D\u043E\u0441\u0442\u0456</h3>
  <p class="legal-upd">\u0420\u0435\u0434\u0430\u043A\u0446\u0456\u044F \u0432\u0456\u0434 ${LEGAL_UPDATED}</p>

  <h4>1. \u0425\u0442\u043E \u043C\u0438 (\u0432\u043E\u043B\u043E\u0434\u0456\u043B\u0435\u0446\u044C \u0434\u0430\u043D\u0438\u0445)</h4>
  <p>\u0417\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043E\u043A <b>CSTL LIFE</b> (\u0434\u0430\u043B\u0456 \u2014 \xAB\u041F\u043E\u0440\u0442\u0430\u043B\xBB) \u2014 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0430 \u043C\u0435\u0434\u0456\u0430-\u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0438
  \u041E\u043B\u0438\u043A\u0430. \u0412\u043E\u043B\u043E\u0434\u0456\u043B\u0435\u0446\u044C \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0438\u0445 \u0434\u0430\u043D\u0438\u0445 \u2014 \u043A\u043E\u043C\u0430\u043D\u0434\u0430 <b>Olyka Castle</b>.
  \u041A\u043E\u043D\u0442\u0430\u043A\u0442: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

  <h4>2. \u042F\u043A\u0456 \u0434\u0430\u043D\u0456 \u043C\u0438 \u043E\u0431\u0440\u043E\u0431\u043B\u044F\u0454\u043C\u043E</h4>
  <p>\u2022 <b>\u041E\u0431\u043B\u0456\u043A\u043E\u0432\u0438\u0439 \u0437\u0430\u043F\u0438\u0441:</b> \u0456\u043C'\u044F \u0442\u0430 email \u2014 \u043A\u043E\u043B\u0438 \u0432\u0438 \u0432\u0445\u043E\u0434\u0438\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 Google.<br>
  \u2022 <b>\u0412\u0430\u0448 \u043A\u043E\u043D\u0442\u0435\u043D\u0442:</b> \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u043D\u044F, \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F, \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456, \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F, \u0444\u043E\u0442\u043E, \u044F\u043A\u0456 \u0432\u0438 \u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0454\u0442\u0435.<br>
  \u2022 <b>\u0413\u0435\u043E\u043B\u043E\u043A\u0430\u0446\u0456\u044F:</b> \u043B\u0438\u0448\u0435 \u0434\u043B\u044F \u043F\u043E\u0433\u043E\u0434\u0438 \u0442\u0430 \u043D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0438\u0445 \u0437\u0443\u043F\u0438\u043D\u043E\u043A \u2014 \u043E\u0431\u0440\u043E\u0431\u043B\u044F\u0454\u0442\u044C\u0441\u044F \u043D\u0430 \u0432\u0430\u0448\u043E\u043C\u0443 \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u0457, \u043C\u0438 \u0457\u0457 \u043D\u0435 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454\u043C\u043E.<br>
  \u2022 <b>\u0422\u0435\u0445\u043D\u0456\u0447\u043D\u0456 \u0434\u0430\u043D\u0456:</b> \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0456 \u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F \u0443 \u043F\u0430\u043C'\u044F\u0442\u0456 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 (localStorage), \u0442\u0438\u043F \u043F\u0440\u0438\u0441\u0442\u0440\u043E\u044E \u2014 \u0434\u043B\u044F \u0440\u043E\u0431\u043E\u0442\u0438 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043A\u0443.</p>

  <h4>3. \u041C\u0435\u0442\u0430 \u0456 \u043F\u0456\u0434\u0441\u0442\u0430\u0432\u0430 \u043E\u0431\u0440\u043E\u0431\u043A\u0438</h4>
  <p>\u0414\u0430\u043D\u0456 \u043E\u0431\u0440\u043E\u0431\u043B\u044F\u044E\u0442\u044C\u0441\u044F <b>\u0432\u0438\u043A\u043B\u044E\u0447\u043D\u043E \u0434\u043B\u044F \u0440\u043E\u0431\u043E\u0442\u0438 \u041F\u043E\u0440\u0442\u0430\u043B\u0443</b> (\u0430\u043A\u0430\u0443\u043D\u0442, \u043F\u0443\u0431\u043B\u0456\u043A\u0430\u0446\u0456\u0457,
  \u0441\u043F\u043E\u0432\u0456\u0449\u0435\u043D\u043D\u044F, \u0441\u043F\u0456\u043B\u044C\u043D\u043E\u0442\u0430). \u041F\u0440\u0430\u0432\u043E\u0432\u0430 \u043F\u0456\u0434\u0441\u0442\u0430\u0432\u0430 \u2014 <b>\u0432\u0430\u0448\u0430 \u0437\u0433\u043E\u0434\u0430</b> (\u0441\u0442. 11 \u0417\u0423 \xAB\u041F\u0440\u043E \u0437\u0430\u0445\u0438\u0441\u0442
  \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0438\u0445 \u0434\u0430\u043D\u0438\u0445\xBB), \u043D\u0430\u0434\u0430\u043D\u0430 \u043F\u0456\u0434 \u0447\u0430\u0441 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043D\u043D\u044F \u041F\u043E\u0440\u0442\u0430\u043B\u043E\u043C.</p>

  <h4>4. \u041A\u043E\u043C\u0443 \u043F\u0435\u0440\u0435\u0434\u0430\u0454\u043C\u043E (\u043E\u0431\u0440\u043E\u0431\u043D\u0438\u043A\u0438)</h4>
  <p>\u041C\u0438 <b>\u043D\u0435 \u043F\u0440\u043E\u0434\u0430\u0454\u043C\u043E</b> \u0432\u0430\u0448\u0456 \u0434\u0430\u043D\u0456. \u0414\u043B\u044F \u0440\u043E\u0431\u043E\u0442\u0438 \u041F\u043E\u0440\u0442\u0430\u043B\u0443 \u0437\u0430\u043B\u0443\u0447\u0435\u043D\u0456 \u043F\u043E\u0441\u0442\u0430\u0447\u0430\u043B\u044C\u043D\u0438\u043A\u0438 \u043F\u043E\u0441\u043B\u0443\u0433:<br>
  \u2022 <b>Supabase</b> \u2014 \u0445\u043E\u0441\u0442\u0438\u043D\u0433 \u0431\u0430\u0437\u0438 \u0434\u0430\u043D\u0438\u0445 \u0456 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u043D\u043D\u044F;<br>
  \u2022 <b>Google</b> \u2014 \u0432\u0445\u0456\u0434 (\u0430\u0432\u0442\u0435\u043D\u0442\u0438\u0444\u0456\u043A\u0430\u0446\u0456\u044F).<br>
  \u0426\u0456 \u0441\u0435\u0440\u0432\u0456\u0441\u0438 \u043C\u043E\u0436\u0443\u0442\u044C \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0442\u0438 \u0434\u0430\u043D\u0456 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430\u0445 \u0437\u0430 \u043C\u0435\u0436\u0430\u043C\u0438 \u0423\u043A\u0440\u0430\u0457\u043D\u0438 \u0437 \u043D\u0430\u043B\u0435\u0436\u043D\u0438\u043C \u0440\u0456\u0432\u043D\u0435\u043C \u0437\u0430\u0445\u0438\u0441\u0442\u0443.</p>

  <h4>5. \u0421\u043A\u0456\u043B\u044C\u043A\u0438 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u0454\u043C\u043E</h4>
  <p>\u0414\u0430\u043D\u0456 \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u044E\u0442\u044C\u0441\u044F, \u0434\u043E\u043A\u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u0438\u0439 \u0432\u0430\u0448 \u0430\u043A\u0430\u0443\u043D\u0442 \u0430\u0431\u043E \u0434\u043E\u043A\u0438 \u0432\u0438 \u043D\u0435 \u043F\u043E\u043F\u0440\u043E\u0441\u0438\u0442\u0435 \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043D\u044F.
  \u0412\u0438 \u043C\u043E\u0436\u0435\u0442\u0435 \u0431\u0443\u0434\u044C-\u043A\u043E\u043B\u0438 \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u0441\u0432\u0456\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u0447\u0438 \u0430\u043A\u0430\u0443\u043D\u0442.</p>

  <h4>6. \u0412\u0430\u0448\u0456 \u043F\u0440\u0430\u0432\u0430</h4>
  <p>\u0412\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u043D\u043E \u0434\u043E \u0441\u0442. 8 \u0417\u0430\u043A\u043E\u043D\u0443 \u0432\u0438 \u043C\u0430\u0454\u0442\u0435 \u043F\u0440\u0430\u0432\u043E: \u0437\u043D\u0430\u0442\u0438 \u043F\u0440\u043E \u043E\u0431\u0440\u043E\u0431\u043A\u0443; \u043E\u0442\u0440\u0438\u043C\u0430\u0442\u0438 \u0434\u043E\u0441\u0442\u0443\u043F \u0434\u043E
  \u0441\u0432\u043E\u0457\u0445 \u0434\u0430\u043D\u0438\u0445; \u0432\u0438\u043C\u0430\u0433\u0430\u0442\u0438 \u0432\u0438\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u044F \u0447\u0438 \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043D\u044F; <b>\u0432\u0456\u0434\u043A\u043B\u0438\u043A\u0430\u0442\u0438 \u0437\u0433\u043E\u0434\u0443</b>; \u0437\u0432\u0435\u0440\u043D\u0443\u0442\u0438\u0441\u044F \u0437\u0456
  \u0441\u043A\u0430\u0440\u0433\u043E\u044E \u0434\u043E <b>\u0423\u043F\u043E\u0432\u043D\u043E\u0432\u0430\u0436\u0435\u043D\u043E\u0433\u043E \u0412\u0435\u0440\u0445\u043E\u0432\u043D\u043E\u0457 \u0420\u0430\u0434\u0438 \u0423\u043A\u0440\u0430\u0457\u043D\u0438 \u0437 \u043F\u0440\u0430\u0432 \u043B\u044E\u0434\u0438\u043D\u0438</b>. \u0414\u043B\u044F \u0446\u044C\u043E\u0433\u043E \u2014
  \u043D\u0430\u043F\u0438\u0448\u0456\u0442\u044C \u043D\u0430 <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

  <h4>7. Cookie \u0442\u0430 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435</h4>
  <p>\u041F\u043E\u0440\u0442\u0430\u043B \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u0454 <b>localStorage</b> (\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u0435 \u0441\u0445\u043E\u0432\u0438\u0449\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430) \u043B\u0438\u0448\u0435 \u0434\u043B\u044F \u0440\u043E\u0431\u043E\u0442\u0438
  (\u043D\u0430\u043B\u0430\u0448\u0442\u0443\u0432\u0430\u043D\u043D\u044F, \u0432\u0445\u0456\u0434, \u0447\u0435\u0440\u043D\u0435\u0442\u043A\u0438) \u2014 <b>\u043D\u0435 \u0434\u043B\u044F \u0440\u0435\u043A\u043B\u0430\u043C\u0438</b> \u0439 \u043D\u0435 \u0434\u043B\u044F \u0441\u0442\u0435\u0436\u0435\u043D\u043D\u044F.</p>

  <h4>8. \u041D\u0435\u043F\u043E\u0432\u043D\u043E\u043B\u0456\u0442\u043D\u0456</h4>
  <p>\u041F\u043E\u0440\u0442\u0430\u043B \u043F\u0440\u0438\u0437\u043D\u0430\u0447\u0435\u043D\u043E \u0434\u043B\u044F \u043E\u0441\u0456\u0431 \u0432\u0456\u0434 <b>16 \u0440\u043E\u043A\u0456\u0432</b>. \u041E\u0441\u043E\u0431\u0438 \u0434\u043E 16 \u0440\u043E\u043A\u0456\u0432 \u043C\u043E\u0436\u0443\u0442\u044C \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0442\u0438\u0441\u044F
  \u043B\u0438\u0448\u0435 \u0437\u0430 \u0437\u0433\u043E\u0434\u043E\u044E \u0431\u0430\u0442\u044C\u043A\u0456\u0432 \u0430\u0431\u043E \u0437\u0430\u043A\u043E\u043D\u043D\u0438\u0445 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043D\u0438\u043A\u0456\u0432.</p>

  <h4>9. \u0417\u043C\u0456\u043D\u0438 \u043F\u043E\u043B\u0456\u0442\u0438\u043A\u0438</h4>
  <p>\u041C\u0438 \u043C\u043E\u0436\u0435\u043C\u043E \u043E\u043D\u043E\u0432\u043B\u044E\u0432\u0430\u0442\u0438 \u0446\u044E \u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0443. \u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0430 \u0440\u0435\u0434\u0430\u043A\u0446\u0456\u044F \u0437\u0430\u0432\u0436\u0434\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u0442\u0443\u0442 \u0456\u0437 \u0434\u0430\u0442\u043E\u044E.</p>
`;
  var TERMS_HTML = `
  <h3 class="legal-h">\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043D\u043D\u044F</h3>
  <p class="legal-upd">\u0420\u0435\u0434\u0430\u043A\u0446\u0456\u044F \u0432\u0456\u0434 ${LEGAL_UPDATED}</p>

  <h4>1. \u041F\u0440\u0438\u0439\u043D\u044F\u0442\u0442\u044F \u043F\u0440\u0430\u0432\u0438\u043B</h4>
  <p>\u041A\u043E\u0440\u0438\u0441\u0442\u0443\u044E\u0447\u0438\u0441\u044C \u041F\u043E\u0440\u0442\u0430\u043B\u043E\u043C, \u0432\u0438 <b>\u043F\u043E\u0433\u043E\u0434\u0436\u0443\u0454\u0442\u0435\u0441\u044C</b> \u0456\u0437 \u0446\u0438\u043C\u0438 \u041F\u0440\u0430\u0432\u0438\u043B\u0430\u043C\u0438 \u0442\u0430 \u041F\u043E\u043B\u0456\u0442\u0438\u043A\u043E\u044E
  \u043A\u043E\u043D\u0444\u0456\u0434\u0435\u043D\u0446\u0456\u0439\u043D\u043E\u0441\u0442\u0456. \u042F\u043A\u0449\u043E \u043D\u0435 \u0437\u0433\u043E\u0434\u043D\u0456 \u2014 \u043D\u0435 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0439\u0442\u0435\u0441\u044C \u041F\u043E\u0440\u0442\u0430\u043B\u043E\u043C.</p>

  <h4>2. \u041F\u0440\u0438\u0437\u043D\u0430\u0447\u0435\u043D\u043D\u044F</h4>
  <p>CSTL LIFE \u2014 \u0456\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0456\u0439\u043D\u0430 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u0433\u0440\u043E\u043C\u0430\u0434\u0438 \u041E\u043B\u0438\u043A\u0430: \u043C\u0456\u0441\u0446\u0435\u0432\u0456 \u043D\u043E\u0432\u0438\u043D\u0438, \u043F\u043E\u0434\u0456\u0457, \u0434\u043E\u0448\u043A\u0430
  \u043E\u0433\u043E\u043B\u043E\u0448\u0435\u043D\u044C, \u043E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F, \u0440\u043E\u0437\u043A\u043B\u0430\u0434 \u0430\u0432\u0442\u043E\u0431\u0443\u0441\u0456\u0432. \u0427\u0430\u0441\u0442\u0438\u043D\u0430 \u043D\u043E\u0432\u0438\u043D \u2014 \u0437 <b>\u0437\u043E\u0432\u043D\u0456\u0448\u043D\u0456\u0445 \u0434\u0436\u0435\u0440\u0435\u043B</b>.</p>

  <h4>3. \u041A\u043E\u043D\u0442\u0435\u043D\u0442 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447\u0456\u0432 \u0456 \u0432\u0430\u0448\u0430 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u043B\u044C\u043D\u0456\u0441\u0442\u044C</h4>
  <p>\u0412\u0438 <b>\u043D\u0435\u0441\u0435\u0442\u0435 \u043F\u043E\u0432\u043D\u0443 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u043B\u044C\u043D\u0456\u0441\u0442\u044C</b> \u0437\u0430 \u0432\u0441\u0435, \u0449\u043E \u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0454\u0442\u0435. \u041F\u0443\u0431\u043B\u0456\u043A\u0443\u044E\u0447\u0438, \u0432\u0438 \u0433\u0430\u0440\u0430\u043D\u0442\u0443\u0454\u0442\u0435,
  \u0449\u043E \u043C\u0430\u0454\u0442\u0435 \u043D\u0430 \u0446\u0435 \u043F\u0440\u0430\u0432\u043E \u0456 \u0449\u043E \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u043D\u0435 \u043F\u043E\u0440\u0443\u0448\u0443\u0454 \u0437\u0430\u043A\u043E\u043D. <b>\u0417\u0430\u0431\u043E\u0440\u043E\u043D\u0435\u043D\u043E</b> \u043F\u0443\u0431\u043B\u0456\u043A\u0443\u0432\u0430\u0442\u0438:<br>
  \u2022 \u043D\u0435\u0437\u0430\u043A\u043E\u043D\u043D\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442, \u0437\u0430\u043A\u043B\u0438\u043A\u0438 \u0434\u043E \u043D\u0430\u0441\u0438\u043B\u044C\u0441\u0442\u0432\u0430, \u0432\u043E\u0440\u043E\u0436\u043D\u0435\u0447\u0456, \u0434\u0438\u0441\u043A\u0440\u0438\u043C\u0456\u043D\u0430\u0446\u0456\u0457;<br>
  \u2022 \u043D\u0430\u043A\u043B\u0435\u043F, \u043E\u0431\u0440\u0430\u0437\u0438, \u043F\u043E\u0433\u0440\u043E\u0437\u0438, \u043D\u0435\u0434\u043E\u0441\u0442\u043E\u0432\u0456\u0440\u043D\u0443 \u0456\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0456\u044E \u043F\u0440\u043E \u043B\u044E\u0434\u0435\u0439;<br>
  \u2022 \u043F\u043E\u0440\u043D\u043E\u0433\u0440\u0430\u0444\u0456\u044E \u0442\u0430 \u043C\u0430\u0442\u0435\u0440\u0456\u0430\u043B\u0438 18+;<br>
  \u2022 \u0441\u043F\u0430\u043C, \u043D\u0430\u0432'\u044F\u0437\u043B\u0438\u0432\u0443 \u0440\u0435\u043A\u043B\u0430\u043C\u0443 \u0431\u0435\u0437 \u0434\u043E\u0437\u0432\u043E\u043B\u0443;<br>
  \u2022 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u0456 \u0434\u0430\u043D\u0456 \u0456\u043D\u0448\u0438\u0445 \u043B\u044E\u0434\u0435\u0439 \u0431\u0435\u0437 \u0457\u0445\u043D\u044C\u043E\u0457 \u0437\u0433\u043E\u0434\u0438;<br>
  \u2022 \u043C\u0430\u0442\u0435\u0440\u0456\u0430\u043B\u0438, \u0449\u043E \u043F\u043E\u0440\u0443\u0448\u0443\u044E\u0442\u044C \u0430\u0432\u0442\u043E\u0440\u0441\u044C\u043A\u0456 \u043F\u0440\u0430\u0432\u0430.</p>

  <h4>4. \u041C\u043E\u0434\u0435\u0440\u0430\u0446\u0456\u044F</h4>
  <p>\u041C\u0438 \u043C\u0430\u0454\u043C\u043E \u043F\u0440\u0430\u0432\u043E <b>\u0432\u0438\u0434\u0430\u043B\u044F\u0442\u0438, \u0440\u0435\u0434\u0430\u0433\u0443\u0432\u0430\u0442\u0438 \u0447\u0438 \u043F\u0440\u0438\u0445\u043E\u0432\u0443\u0432\u0430\u0442\u0438</b> \u0431\u0443\u0434\u044C-\u044F\u043A\u0438\u0439 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u0456
  \u0431\u043B\u043E\u043A\u0443\u0432\u0430\u0442\u0438 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447\u0456\u0432, \u0449\u043E \u043F\u043E\u0440\u0443\u0448\u0443\u044E\u0442\u044C \u041F\u0440\u0430\u0432\u0438\u043B\u0430, \u2014 \u0431\u0435\u0437 \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u0436\u0435\u043D\u043D\u044F. \u041F\u043E\u043C\u0456\u0442\u0438\u043B\u0438 \u043F\u043E\u0440\u0443\u0448\u0435\u043D\u043D\u044F?
  \u041F\u043E\u0432\u0456\u0434\u043E\u043C\u0442\u0435 \u043D\u0430 <a href="mailto:${CONTACT}">${CONTACT}</a> \u2014 \u043C\u0438 \u0440\u043E\u0437\u0433\u043B\u044F\u043D\u0435\u043C\u043E \u0456 \u0437\u0430 \u043F\u043E\u0442\u0440\u0435\u0431\u0438 \u043F\u0440\u0438\u0431\u0435\u0440\u0435\u043C\u043E.</p>

  <h4 id="disclaimer">5. \u0412\u0456\u0434\u043C\u043E\u0432\u0430 \u0432\u0456\u0434 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u0456 (\u0434\u0438\u0441\u043A\u043B\u0435\u0439\u043C\u0435\u0440)</h4>
  <p>\u041F\u043E\u0440\u0442\u0430\u043B \u043D\u0430\u0434\u0430\u0454\u0442\u044C\u0441\u044F \xAB<b>\u044F\u043A \u0454</b>\xBB. \u0423 \u043C\u0435\u0436\u0430\u0445, \u0434\u043E\u0437\u0432\u043E\u043B\u0435\u043D\u0438\u0445 \u0437\u0430\u043A\u043E\u043D\u043E\u043C:<br>
  \u2022 \u043C\u0438 <b>\u043D\u0435 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454\u043C\u043E \u0437\u0430 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447\u0456\u0432</b> \u2014 \u0439\u043E\u0433\u043E \u0441\u0442\u0432\u043E\u0440\u044E\u044E\u0442\u044C \u0441\u0430\u043C\u0456 \u0436\u0438\u0442\u0435\u043B\u0456;<br>
  \u2022 \u043C\u0438 <b>\u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0443\u0454\u043C\u043E \u0442\u043E\u0447\u043D\u0456\u0441\u0442\u044C, \u043F\u043E\u0432\u043D\u043E\u0442\u0443 \u0447\u0438 \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0456\u0441\u0442\u044C</b> \u043D\u043E\u0432\u0438\u043D \u0456\u0437 \u0437\u043E\u0432\u043D\u0456\u0448\u043D\u0456\u0445 \u0434\u0436\u0435\u0440\u0435\u043B;<br>
  \u2022 \u043C\u0438 \u043D\u0435 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454\u043C\u043E \u0437\u0430 \u0437\u043E\u0432\u043D\u0456\u0448\u043D\u0456 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0442\u0430 \u0441\u0442\u043E\u0440\u043E\u043D\u043D\u0456 \u0441\u0430\u0439\u0442\u0438;<br>
  \u2022 \u043C\u0438 \u043D\u0435 \u0433\u0430\u0440\u0430\u043D\u0442\u0443\u0454\u043C\u043E \u0431\u0435\u0437\u043F\u0435\u0440\u0435\u0431\u0456\u0439\u043D\u0443 \u0440\u043E\u0431\u043E\u0442\u0443 \u0441\u0435\u0440\u0432\u0456\u0441\u0443;<br>
  \u2022 \u043C\u0438 <b>\u043D\u0435 \u043D\u0435\u0441\u0435\u043C\u043E \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u0456 \u0437\u0430 \u0437\u0431\u0438\u0442\u043A\u0438</b>, \u0449\u043E \u0432\u0438\u043D\u0438\u043A\u043B\u0438 \u0432\u043D\u0430\u0441\u043B\u0456\u0434\u043E\u043A \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u0430\u043D\u043D\u044F \u041F\u043E\u0440\u0442\u0430\u043B\u0443.<br>
  \u0420\u0456\u0448\u0435\u043D\u043D\u044F \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0456 \u0456\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0456\u0457 \u0437 \u041F\u043E\u0440\u0442\u0430\u043B\u0443 \u0432\u0438 \u043F\u0440\u0438\u0439\u043C\u0430\u0454\u0442\u0435 \u043D\u0430 \u0432\u043B\u0430\u0441\u043D\u0438\u0439 \u0440\u043E\u0437\u0441\u0443\u0434.</p>

  <h4>6. \u0406\u043D\u0442\u0435\u043B\u0435\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0430 \u0432\u043B\u0430\u0441\u043D\u0456\u0441\u0442\u044C</h4>
  <p>\u041F\u0443\u0431\u043B\u0456\u043A\u0443\u044E\u0447\u0438 \u043A\u043E\u043D\u0442\u0435\u043D\u0442, \u0432\u0438 \u043D\u0430\u0434\u0430\u0454\u0442\u0435 \u041F\u043E\u0440\u0442\u0430\u043B\u0443 \u043F\u0440\u0430\u0432\u043E \u043F\u043E\u043A\u0430\u0437\u0443\u0432\u0430\u0442\u0438 \u0439\u043E\u0433\u043E \u0432 \u0437\u0430\u0441\u0442\u043E\u0441\u0443\u043D\u043A\u0443. \u041F\u0440\u0430\u0432\u0430 \u043D\u0430
  \u0432\u0430\u0448 \u043A\u043E\u043D\u0442\u0435\u043D\u0442 \u043B\u0438\u0448\u0430\u044E\u0442\u044C\u0441\u044F \u0437\u0430 \u0432\u0430\u043C\u0438. \u0414\u0438\u0437\u0430\u0439\u043D \u0456 \u043A\u043E\u0434 \u041F\u043E\u0440\u0442\u0430\u043B\u0443 \u043D\u0430\u043B\u0435\u0436\u0430\u0442\u044C \u043A\u043E\u043C\u0430\u043D\u0434\u0456 Olyka Castle.</p>

  <h4>7. \u0417\u0430\u0441\u0442\u043E\u0441\u043E\u0432\u043D\u0435 \u043F\u0440\u0430\u0432\u043E</h4>
  <p>\u0426\u0456 \u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u0440\u0435\u0433\u0443\u043B\u044E\u044E\u0442\u044C\u0441\u044F <b>\u0437\u0430\u043A\u043E\u043D\u043E\u0434\u0430\u0432\u0441\u0442\u0432\u043E\u043C \u0423\u043A\u0440\u0430\u0457\u043D\u0438</b>. \u0421\u043F\u043E\u0440\u0438 \u0432\u0438\u0440\u0456\u0448\u0443\u044E\u0442\u044C\u0441\u044F \u0448\u043B\u044F\u0445\u043E\u043C
  \u043F\u0435\u0440\u0435\u0433\u043E\u0432\u043E\u0440\u0456\u0432, \u0430 \u0432 \u0440\u0430\u0437\u0456 \u043D\u0435\u0434\u043E\u0441\u044F\u0433\u043D\u0435\u043D\u043D\u044F \u0437\u0433\u043E\u0434\u0438 \u2014 \u0443 \u0441\u0443\u0434\u0456 \u0437\u0430 \u0437\u0430\u043A\u043E\u043D\u043E\u0434\u0430\u0432\u0441\u0442\u0432\u043E\u043C \u0423\u043A\u0440\u0430\u0457\u043D\u0438.</p>

  <h4>8. \u0417\u043C\u0456\u043D\u0438 \u043F\u0440\u0430\u0432\u0438\u043B</h4>
  <p>\u041C\u0438 \u043C\u043E\u0436\u0435\u043C\u043E \u0437\u043C\u0456\u043D\u044E\u0432\u0430\u0442\u0438 \u041F\u0440\u0430\u0432\u0438\u043B\u0430. \u041F\u0440\u043E\u0434\u043E\u0432\u0436\u0435\u043D\u043D\u044F \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043D\u043D\u044F \u043F\u0456\u0441\u043B\u044F \u0437\u043C\u0456\u043D \u043E\u0437\u043D\u0430\u0447\u0430\u0454 \u0432\u0430\u0448\u0443 \u0437\u0433\u043E\u0434\u0443.</p>

  <p class="legal-note">\u26A0\uFE0F \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043C\u0430\u0454 \u0456\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0456\u0439\u043D\u0438\u0439 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440 \u0456 \u043D\u0435 \u0437\u0430\u043C\u0456\u043D\u044E\u0454 \u044E\u0440\u0438\u0434\u0438\u0447\u043D\u0443 \u043A\u043E\u043D\u0441\u0443\u043B\u044C\u0442\u0430\u0446\u0456\u044E.</p>
`;
  var LEGAL_DOC_HTML = `
  <nav class="legal-toc">
    <a href="#legal-privacy">\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0430 \u043A\u043E\u043D\u0444\u0456\u0434\u0435\u043D\u0446\u0456\u0439\u043D\u043E\u0441\u0442\u0456</a>
    <a href="#legal-terms">\u041F\u0440\u0430\u0432\u0438\u043B\u0430 \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u043D\u043D\u044F</a>
    <a href="#disclaimer">\u0414\u0438\u0441\u043A\u043B\u0435\u0439\u043C\u0435\u0440</a>
  </nav>
  <div id="legal-privacy">${PRIVACY_HTML}</div>
  <div id="legal-terms">${TERMS_HTML}</div>
`;

  // src/core/sidebar.js
  var NAV = [
    { id: "cabinet", label: "\u0410\u0434\u043C\u0456\u043D\u043A\u0430", icon: ICONS.settings, kind: "cabinet", team: true },
    { id: "account", label: "\u041E\u0441\u043E\u0431\u0438\u0441\u0442\u0438\u0439 \u043A\u0430\u0431\u0456\u043D\u0435\u0442", icon: ICONS.user, kind: "account" },
    { divider: true },
    { id: "community", label: "\u0413\u0440\u043E\u043C\u0430\u0434\u0430", icon: ICONS.community, kind: "tab", tab: "community" },
    { id: "news", label: "\u041D\u043E\u0432\u0438\u043D\u0438", icon: ICONS.newspaper, kind: "tab", tab: "community", scrollTo: "#cm-news-board" },
    { id: "shotam", label: "\u0428\u043E \u0432 \u0441\u0435\u043B\u0456", icon: ICONS.fileText, kind: "tab", tab: "shotam" },
    { id: "board", label: "\u0414\u043E\u0448\u043A\u0430", icon: ICONS.clipboard, kind: "tab", tab: "board" },
    { id: "discussions", label: "\u041E\u0431\u0433\u043E\u0432\u043E\u0440\u0435\u043D\u043D\u044F", icon: ICONS.message, kind: "tab", tab: "discussions" },
    { id: "buses", label: "\u0410\u0432\u0442\u043E\u0431\u0443\u0441\u0438", icon: ICONS.bus, kind: "tab", tab: "buses" },
    { id: "contacts", label: "\u041A\u043E\u0440\u0438\u0441\u043D\u0456 \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u0438", icon: ICONS.phone, kind: "tab", tab: "community", scrollTo: "#cm-contacts" },
    { divider: true },
    { id: "support", label: "\u041F\u0456\u0434\u0442\u0440\u0438\u043C\u043A\u0430", icon: ICONS.help, kind: "info" },
    { id: "policy", label: "\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0430 \u0456 \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u0456\u0441\u0442\u044C", icon: ICONS.lock, kind: "info" }
  ];
  var SOCIAL = [
    {
      id: "instagram",
      label: "Instagram Olyka Castle",
      icon: ICONS.brandInstagram,
      url: "https://www.instagram.com/olyka_castle?igsh=a2pmOGN3N2cyenBs"
    },
    {
      id: "facebook",
      label: "Facebook Olyka Castle",
      icon: ICONS.brandFacebook,
      url: "https://www.facebook.com/share/18mhw13NDu/?mibextid=wwXIfr"
    }
  ];
  var INFO = {
    support: {
      title: "\u041F\u0456\u0434\u0442\u0440\u0438\u043C\u043A\u0430",
      body: '\u041F\u0438\u0442\u0430\u043D\u043D\u044F, \u0456\u0434\u0435\u0457 \u0447\u0438 \u043F\u0440\u043E\u0431\u043B\u0435\u043C\u0430? \u041D\u0430\u043F\u0438\u0448\u0456\u0442\u044C \u043D\u0430\u043C \u043D\u0430 \u043F\u043E\u0448\u0442\u0443 \u2014 \u0432\u0456\u0434\u043F\u043E\u0432\u0456\u0434\u0430\u0454\u043C\u043E \u043E\u0441\u043E\u0431\u0438\u0441\u0442\u043E.<br><br><a class="info-mail-btn" href="mailto:olykacastle@gmail.com?subject=\u041F\u0456\u0434\u0442\u0440\u0438\u043C\u043A\u0430%20CSTL%20LIFE">' + ICONS.mail + ' \u041D\u0430\u043F\u0438\u0441\u0430\u0442\u0438 \u0432 \u043F\u0456\u0434\u0442\u0440\u0438\u043C\u043A\u0443</a><br><br><span class="info-mail-plain">olykacastle@gmail.com</span>'
    },
    policy: {
      title: "\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u0430 \u0456 \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u0456\u0441\u0442\u044C",
      doc: true,
      // повний правовий документ → вищий scrollable-лист
      body: LEGAL_DOC_HTML
    }
  };
  var _open = false;
  function els() {
    return {
      sidebar: document.getElementById("sidebar"),
      overlay: document.getElementById("sidebar-overlay"),
      toggle: document.getElementById("sidebar-toggle"),
      close: document.getElementById("sidebar-close"),
      nav: document.getElementById("sidebar-nav")
    };
  }
  function openSidebar() {
    const { sidebar, overlay, toggle } = els();
    if (!sidebar)
      return;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      sidebar.classList.add("sidebar--open");
      overlay.classList.add("sidebar-overlay--show");
    });
    sidebar.setAttribute("aria-hidden", "false");
    toggle?.setAttribute("aria-expanded", "true");
    _open = true;
    refreshCabinet();
  }
  function closeSidebar() {
    const { sidebar, overlay, toggle } = els();
    if (!sidebar)
      return;
    sidebar.classList.remove("sidebar--open");
    overlay.classList.remove("sidebar-overlay--show");
    sidebar.setAttribute("aria-hidden", "true");
    toggle?.setAttribute("aria-expanded", "false");
    _open = false;
    setTimeout(() => {
      if (!_open)
        overlay.hidden = true;
    }, 260);
  }
  function itemHtml(item) {
    if (item.divider)
      return '<div class="sidebar-divider"></div>';
    const hidden = item.team ? " hidden" : "";
    return `<button class="sidebar-item" type="button" data-nav="${item.id}"${hidden}>
    <span class="sidebar-item-icon">${item.icon}</span>
    <span class="sidebar-item-label">${item.label}</span>
  </button>`;
  }
  function renderNav() {
    const { nav } = els();
    if (!nav)
      return;
    const socialHtml = `
    <div class="sb-social-foot">
      ${SOCIAL.map((s) => `<a class="sb-social-btn" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">${s.icon}</a>`).join("")}
    </div>`;
    nav.innerHTML = NAV.map(itemHtml).join("") + socialHtml;
    nav.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => handleNav(btn.dataset.nav));
    });
    nav.querySelectorAll(".sb-social-btn").forEach((a) => {
      a.addEventListener("click", () => closeSidebar());
    });
  }
  function handleNav(id) {
    const item = NAV.find((n) => n.id === id);
    if (!item)
      return;
    closeSidebar();
    if (item.kind === "tab") {
      window.switchTab?.(item.tab);
      if (item.scrollTo) {
        setTimeout(() => {
          document.querySelector(item.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      }
    } else if (item.kind === "account") {
      document.getElementById("account-btn")?.click();
    } else if (item.kind === "cabinet") {
      window.location.href = "./admin.html";
    } else if (item.kind === "info") {
      openInfoModal(id);
    }
  }
  function openInfoModal(key) {
    const data = INFO[key];
    if (!data)
      return;
    openModal({
      title: data.title,
      bodyHtml: data.body,
      className: data.doc ? "app-modal--doc" : ""
    });
  }
  async function refreshCabinet() {
    const btn = document.querySelector('[data-nav="cabinet"]');
    if (!btn)
      return;
    let team = false;
    try {
      team = await isTeamMember();
    } catch {
      team = false;
    }
    btn.hidden = !team;
  }
  function initSidebar() {
    const { toggle, close, overlay } = els();
    if (!toggle)
      return;
    renderNav();
    toggle.addEventListener("click", () => _open ? closeSidebar() : openSidebar());
    close?.addEventListener("click", closeSidebar);
    overlay?.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && _open)
        closeSidebar();
    });
    onAuthChange(() => refreshCabinet());
    refreshCabinet();
    document.addEventListener("cstl-open-legal", () => openInfoModal("policy"));
  }

  // src/core/consent.js
  var KEY = "cstl-legal-consent-v1";
  function initConsent() {
    try {
      if (localStorage.getItem(KEY))
        return;
    } catch (_) {
      return;
    }
    const bar = document.createElement("div");
    bar.className = "consent-bar";
    bar.innerHTML = `
    <div class="consent-text">\u041A\u043E\u0440\u0438\u0441\u0442\u0443\u044E\u0447\u0438\u0441\u044C CSTL LIFE, \u0432\u0438 \u043F\u043E\u0433\u043E\u0434\u0436\u0443\u0454\u0442\u0435\u0441\u044C \u0437
      <a href="#" class="consent-link">\u041F\u043E\u043B\u0456\u0442\u0438\u043A\u043E\u044E \u043A\u043E\u043D\u0444\u0456\u0434\u0435\u043D\u0446\u0456\u0439\u043D\u043E\u0441\u0442\u0456 \u0442\u0430 \u041F\u0440\u0430\u0432\u0438\u043B\u0430\u043C\u0438</a>.</div>
    <button class="consent-accept" type="button">\u041F\u043E\u0433\u043E\u0434\u0436\u0443\u044E\u0441\u044C</button>`;
    bar.querySelector(".consent-link").addEventListener("click", (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("cstl-open-legal"));
    });
    bar.querySelector(".consent-accept").addEventListener("click", () => {
      try {
        localStorage.setItem(KEY, LEGAL_UPDATED);
      } catch (_) {
      }
      bar.classList.remove("consent-bar--show");
      setTimeout(() => bar.remove(), 240);
    });
    document.body.appendChild(bar);
    requestAnimationFrame(() => bar.classList.add("consent-bar--show"));
  }

  // src/core/messages-ui.js
  var GR_SVG = {
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    users: ICONS.users
  };
  function openGroupsList() {
    requireAuth("\u043F\u0435\u0440\u0435\u0433\u043B\u044F\u043D\u0443\u0442\u0438 \u0433\u0440\u0443\u043F\u0438", async () => {
      const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
        <div class="pm-head-titles"><div class="pm-head-name">\u0413\u0440\u0443\u043F\u0438</div></div>
      </header>
      <div class="gr-actions">
        <button class="gr-act" type="button" data-gr-new><span class="gr-act-ic">\uFF0B</span> \u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u0433\u0440\u0443\u043F\u0443</button>
        <button class="gr-act gr-act--ghost" type="button" data-gr-join><span class="gr-act-ic">${GR_SVG.link}</span> \u0412\u0441\u0442\u0443\u043F \u0437\u0430 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F\u043C</button>
      </div>
      <div class="pm-list" id="gr-list"><div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>
    `, "pm-screen--groups");
      const listEl = api.screen.querySelector("#gr-list");
      let groups = [];
      const groupRow = (g) => {
        const cover = g.avatar_emoji ? escapeHtml(g.avatar_emoji) : GR_SVG.users;
        const last = g.last_message_text ? escapeHtml(g.last_message_text) : "\u041D\u0435\u043C\u0430\u0454 \u043F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u044C";
        return `
        <button class="pm-thread gr-row" type="button" data-group="${g.id}">
          <span class="gr-avatar" style="${g.avatar_gradient ? `background:${escapeHtml(g.avatar_gradient)}` : ""}">${cover}</span>
          <div class="pm-thread-body">
            <div class="pm-thread-top">
              <span class="pm-thread-name">${escapeHtml(g.name)}</span>
              <span class="pm-thread-time">${g.last_message_at ? threadListTime(g.last_message_at) : ""}</span>
            </div>
            <div class="pm-thread-last">${last}</div>
          </div>
        </button>`;
      };
      const load = async () => {
        groups = await fetchMyGroups();
        if (api._closed)
          return;
        listEl.innerHTML = groups.length ? groups.map(groupRow).join("") : `<div class="pm-empty"><span class="pm-empty-ic">${ICONS.users}</span>\u0423 \u0432\u0430\u0441 \u0449\u0435 \u043D\u0435\u043C\u0430\u0454 \u0433\u0440\u0443\u043F.<br>\u0421\u0442\u0432\u043E\u0440\u0456\u0442\u044C \u0441\u0432\u043E\u044E \u0430\u0431\u043E \u043F\u0440\u0438\u0454\u0434\u043D\u0430\u0439\u0442\u0435\u0441\u044C \u0437\u0430 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F\u043C.</div>`;
      };
      await load();
      api.screen.querySelector("[data-gr-new]")?.addEventListener("click", () => openCreateGroup(load));
      api.screen.querySelector("[data-gr-join]")?.addEventListener("click", () => promptJoinByLink(load));
      listEl.addEventListener("click", (e) => {
        const row = e.target.closest("[data-group]");
        if (!row)
          return;
        const g = groups.find((x) => String(x.id) === row.dataset.group);
        if (g)
          openGroupChat(g);
      });
    });
  }
  function openCreateGroup(onDone) {
    const EMOJIS = ["\u{1F465}", "\u{1F3D8}", "\u26BD", "\u{1F393}", "\u{1F69C}", "\u26EA", "\u{1F6D2}", "\u{1F3A3}"];
    const api = buildScreen(`
    <header class="pm-head pm-head--list">
      <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
      <div class="pm-head-titles"><div class="pm-head-name">\uFF0B \u041D\u043E\u0432\u0430 \u0433\u0440\u0443\u043F\u0430</div></div>
    </header>
    <div class="gr-form">
      <label class="gr-label">\u0415\u043C\u043E\u0434\u0437\u0456</label>
      <div class="gr-emoji-row" id="gr-emoji">${EMOJIS.map((e, i) => `<button type="button" class="gr-emoji${i === 0 ? " active" : ""}" data-emoji="${e}">${e}</button>`).join("")}</div>
      <label class="gr-label" for="gr-name">\u041D\u0430\u0437\u0432\u0430</label>
      <input class="gr-input" id="gr-name" type="text" maxlength="60" placeholder="\u041D\u0430\u043F\u0440. \u041D\u0430\u0448\u0430 \u041C\u0438\u0442\u0435\u043B\u044C\u043D\u0435">
      <label class="gr-label" for="gr-desc">\u041E\u043F\u0438\u0441 <span class="gr-hint">(\u043D\u0435\u043E\u0431\u043E\u0432'\u044F\u0437\u043A\u043E\u0432\u043E)</span></label>
      <textarea class="gr-input" id="gr-desc" rows="3" maxlength="200" placeholder="\u041F\u0440\u043E \u0449\u043E \u0446\u044F \u0433\u0440\u0443\u043F\u0430?"></textarea>
      <button class="gr-submit" type="button" id="gr-create">\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438</button>
    </div>
  `, "pm-screen--groups");
    let emoji = EMOJIS[0];
    api.screen.querySelector("#gr-emoji").addEventListener("click", (e) => {
      const b = e.target.closest("[data-emoji]");
      if (!b)
        return;
      emoji = b.dataset.emoji;
      api.screen.querySelectorAll(".gr-emoji").forEach((x) => x.classList.toggle("active", x === b));
    });
    api.screen.querySelector("#gr-create").addEventListener("click", async () => {
      const name = api.screen.querySelector("#gr-name").value.trim();
      const description = api.screen.querySelector("#gr-desc").value.trim();
      if (!name) {
        showToast("\u0412\u0432\u0435\u0434\u0456\u0442\u044C \u043D\u0430\u0437\u0432\u0443 \u0433\u0440\u0443\u043F\u0438", 2500);
        return;
      }
      const btn = api.screen.querySelector("#gr-create");
      btn.disabled = true;
      btn.textContent = "\u0421\u0442\u0432\u043E\u0440\u044E\u0454\u043C\u043E\u2026";
      const r = await createGroup({ name, description, emoji });
      if (r.ok) {
        showToast("\u2705 \u0413\u0440\u0443\u043F\u0443 \u0441\u0442\u0432\u043E\u0440\u0435\u043D\u043E", 2500);
        api.close();
        if (onDone)
          onDone();
      } else {
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0441\u0442\u0432\u043E\u0440\u0438\u0442\u0438: " + (r.error || ""), 3500, "error");
        btn.disabled = false;
        btn.textContent = "\u0421\u0442\u0432\u043E\u0440\u0438\u0442\u0438";
      }
    });
  }
  function buildInviteUrl(token) {
    return `${location.origin}${location.pathname}#/join/${token}`;
  }
  function promptJoinByLink(onDone) {
    const raw = prompt("\u0412\u0441\u0442\u0430\u0432 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F-\u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044F \u0430\u0431\u043E \u043A\u043E\u0434 \u0433\u0440\u0443\u043F\u0438:");
    if (!raw)
      return;
    const m = String(raw).trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (!m) {
      showToast("\u041D\u0435 \u0441\u0445\u043E\u0436\u0435 \u043D\u0430 \u0434\u0456\u0439\u0441\u043D\u0435 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F", 3e3);
      return;
    }
    openInviteJoin(m[0], onDone);
  }
  var PENDING_INVITE_KEY = "cstl-pending-invite";
  function openInviteJoin(token, onDone) {
    if (!isLoggedIn()) {
      try {
        localStorage.setItem(PENDING_INVITE_KEY, token);
      } catch (_) {
      }
      requireAuth("\u043F\u0440\u0438\u0454\u0434\u043D\u0430\u0442\u0438\u0441\u044C \u0434\u043E \u0433\u0440\u0443\u043F\u0438", () => {
      });
      return;
    }
    (async () => {
      const g = await getGroupByInvite(token);
      if (!g.ok) {
        showToast("\u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043D\u044F \u043D\u0435\u0434\u0456\u0439\u0441\u043D\u0435 \u0430\u0431\u043E \u0437\u0430\u0441\u0442\u0430\u0440\u0456\u043B\u0435", 3500);
        return;
      }
      const openGrp = async (gid) => {
        const grp = (await fetchMyGroups()).find((x) => x.id === gid);
        if (grp)
          openGroupChat(grp);
        else
          openGroupsList();
      };
      if (g.my_status === "member") {
        showToast("\u0412\u0438 \u0432\u0436\u0435 \u0432 \u0446\u0456\u0439 \u0433\u0440\u0443\u043F\u0456", 2500);
        openGrp(g.id);
        return;
      }
      const note = g.requires_approval ? "\n\n\u041F\u0456\u0441\u043B\u044F \u0432\u0441\u0442\u0443\u043F\u0443 \u0430\u0434\u043C\u0456\u043D \u043C\u0430\u0454 \u0432\u0430\u0441 \u0441\u0445\u0432\u0430\u043B\u0438\u0442\u0438." : "";
      if (!confirm(`\u041F\u0440\u0438\u0454\u0434\u043D\u0430\u0442\u0438\u0441\u044C \u0434\u043E \xAB${g.name}\xBB? (${g.members} \u0443\u0447\u0430\u0441\u043D.)${note}`))
        return;
      const r = await joinGroupByToken(token);
      if (r.ok && r.status === "member") {
        showToast("\u2705 \u0412\u0438 \u043F\u0440\u0438\u0454\u0434\u043D\u0430\u043B\u0438\u0441\u044C", 2500);
        openGrp(r.group_id || g.id);
        if (onDone)
          onDone();
      } else if (r.ok && r.status === "pending") {
        showToast("\u23F3 \u0417\u0430\u044F\u0432\u043A\u0443 \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u043D\u043E \u2014 \u0447\u0435\u043A\u0430\u0439\u0442\u0435 \u0441\u0445\u0432\u0430\u043B\u0435\u043D\u043D\u044F \u0430\u0434\u043C\u0456\u043D\u0430", 4200);
      } else
        showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043F\u0440\u0438\u0454\u0434\u043D\u0430\u0442\u0438\u0441\u044C: " + (r.error || ""), 3500, "error");
    })();
  }
  function consumePendingInvite() {
    let t = null;
    try {
      t = localStorage.getItem(PENDING_INVITE_KEY);
    } catch (_) {
    }
    if (!t || !isLoggedIn())
      return;
    try {
      localStorage.removeItem(PENDING_INVITE_KEY);
    } catch (_) {
    }
    openInviteJoin(t);
  }
  function openGroupManage(group) {
    requireAuth("\u043A\u0435\u0440\u0443\u0432\u0430\u0442\u0438 \u0433\u0440\u0443\u043F\u043E\u044E", async () => {
      const me = currentUserId();
      const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
        <div class="pm-head-titles"><div class="pm-head-name">\u041A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F \xB7 ${escapeHtml(group.name)}</div></div>
      </header>
      <div class="gr-mng" id="gr-mng"><div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>
    `, "pm-screen--groups");
      const wrap = api.screen.querySelector("#gr-mng");
      const makeInvite = async (requiresApproval) => {
        const r = await createGroupInvite(group.id, requiresApproval);
        if (!r.ok) {
          showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0441\u0442\u0432\u043E\u0440\u0438\u0442\u0438 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F: " + (r.error || ""), 3500, "error");
          return;
        }
        const url = buildInviteUrl(r.token);
        const label = requiresApproval ? "\u0437\u0456 \u0441\u0445\u0432\u0430\u043B\u0435\u043D\u043D\u044F\u043C \u0430\u0434\u043C\u0456\u043D\u0430" : "\u043C\u0438\u0442\u0442\u0454\u0432\u0438\u0439 \u0432\u0441\u0442\u0443\u043F";
        if (navigator.share) {
          try {
            await navigator.share({ title: group.name, text: `\u041F\u0440\u0438\u0454\u0434\u043D\u0443\u0439\u0441\u044F \u0434\u043E \xAB${group.name}\xBB (${label})`, url });
            return;
          } catch (_) {
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          showToast(`\u{1F517} \u041F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F (${label}) \u0441\u043A\u043E\u043F\u0456\u0439\u043E\u0432\u0430\u043D\u043E`, 3e3);
        } catch {
          prompt("\u0421\u043A\u043E\u043F\u0456\u044E\u0439 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F:", url);
        }
      };
      const render2 = async () => {
        const members = await fetchGroupMembers(group.id);
        if (api._closed)
          return;
        const myRole = (members.find((m) => m.uid === me) || {}).role;
        const isAdmin = myRole === "admin";
        const isOwner = group.owner_uid === me;
        const pending = members.filter((m) => m.status === "pending");
        const active = members.filter((m) => m.status === "member");
        const nm = (uid) => {
          const mm = members.find((x) => x.uid === uid);
          return escapeHtml(mm && mm.name || "\u0416\u0438\u0442\u0435\u043B\u044C");
        };
        wrap.innerHTML = `
        ${group.description ? `<p class="gr-mng-desc">${escapeHtml(group.description)}</p>` : ""}
        ${isAdmin ? `
          <div class="gr-mng-sec">
            <div class="gr-mng-h">\u0417\u0430\u043F\u0440\u043E\u0441\u0438\u0442\u0438</div>
            <button class="gr-act" type="button" data-inv="0"><span class="gr-act-ic">${GR_SVG.link}</span> \u041F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u2014 \u043C\u0438\u0442\u0442\u0454\u0432\u0438\u0439 \u0432\u0441\u0442\u0443\u043F</button>
            <button class="gr-act gr-act--ghost" type="button" data-inv="1"><span class="gr-act-ic">${GR_SVG.link}</span> \u041F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u2014 \u0437\u0456 \u0441\u0445\u0432\u0430\u043B\u0435\u043D\u043D\u044F\u043C</button>
          </div>` : ""}
        ${isAdmin && pending.length ? `
          <div class="gr-mng-sec">
            <div class="gr-mng-h">\u0417\u0430\u044F\u0432\u043A\u0438 \u043D\u0430 \u0432\u0441\u0442\u0443\u043F (${pending.length})</div>
            ${pending.map((m) => `
              <div class="gr-mbr">
                <span class="gr-mbr-name">${nm(m.uid)}</span>
                <span class="gr-mbr-acts">
                  <button class="gr-mbr-ok" type="button" data-approve="${m.uid}">\u2713</button>
                  <button class="gr-mbr-no" type="button" data-reject="${m.uid}">${ICONS.close}</button>
                </span>
              </div>`).join("")}
          </div>` : ""}
        <div class="gr-mng-sec">
          <div class="gr-mng-h">\u0423\u0447\u0430\u0441\u043D\u0438\u043A\u0438 (${active.length})</div>
          ${active.map((m) => {
          const acts = [];
          if (isOwner && m.uid !== me)
            acts.push(`<button class="gr-mbr-ok" type="button" data-makeowner="${m.uid}">\u0437\u0440\u043E\u0431\u0438\u0442\u0438 \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u043E\u043C</button>`);
          if (isAdmin && m.uid !== group.owner_uid && m.uid !== me)
            acts.push(`<button class="gr-mbr-no" type="button" data-reject="${m.uid}">\u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438</button>`);
          const tag = m.uid === group.owner_uid ? ' <span class="gr-mbr-tag">\u0432\u043B\u0430\u0441\u043D\u0438\u043A</span>' : m.role === "admin" ? ' <span class="gr-mbr-tag">\u0430\u0434\u043C\u0456\u043D</span>' : "";
          return `<div class="gr-mbr"><span class="gr-mbr-name">${nm(m.uid)}${tag}</span>${acts.length ? `<span class="gr-mbr-acts">${acts.join("")}</span>` : ""}</div>`;
        }).join("")}
        </div>
        ${!isOwner ? `<button class="gr-leave" type="button" data-leave>\u0412\u0438\u0439\u0442\u0438 \u0437 \u0433\u0440\u0443\u043F\u0438</button>` : active.length > 1 ? `<p class="gr-hint" style="padding:0 4px">\u0412\u0438 \u0432\u043B\u0430\u0441\u043D\u0438\u043A. \u0429\u043E\u0431 \u0432\u0438\u0439\u0442\u0438 \u2014 \u0441\u043F\u0435\u0440\u0448\u0443 \u043F\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u0430 \u043A\u043E\u043C\u0443\u0441\u044C \u0456\u0437 \u0443\u0447\u0430\u0441\u043D\u0438\u043A\u0456\u0432 (\u043A\u043D\u043E\u043F\u043A\u0430 \xAB\u0437\u0440\u043E\u0431\u0438\u0442\u0438 \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u043E\u043C\xBB).</p>` : `<p class="gr-hint" style="padding:0 4px">\u0412\u0438 \u0432\u043B\u0430\u0441\u043D\u0438\u043A \u0454\u0434\u0438\u043D\u0438\u0439 \u0443 \u0433\u0440\u0443\u043F\u0456.</p>`}
      `;
      };
      await render2();
      wrap.addEventListener("click", async (e) => {
        const inv = e.target.closest("[data-inv]");
        if (inv) {
          makeInvite(inv.dataset.inv === "1");
          return;
        }
        const ap = e.target.closest("[data-approve]");
        if (ap) {
          const r = await approveMember(group.id, ap.dataset.approve);
          if (r.ok) {
            showToast("\u2705 \u0421\u0445\u0432\u0430\u043B\u0435\u043D\u043E", 2e3);
            render2();
          } else
            showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (r.error || ""), 3e3);
          return;
        }
        const rj = e.target.closest("[data-reject]");
        if (rj) {
          if (!confirm("\u041F\u0440\u0438\u0431\u0440\u0430\u0442\u0438 \u0446\u044C\u043E\u0433\u043E \u043A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447\u0430?"))
            return;
          const r = await rejectMember(group.id, rj.dataset.reject);
          if (r.ok) {
            showToast("\u0413\u043E\u0442\u043E\u0432\u043E", 2e3);
            render2();
          } else
            showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (r.error || ""), 3e3);
          return;
        }
        const mo = e.target.closest("[data-makeowner]");
        if (mo) {
          if (!confirm("\u041F\u0435\u0440\u0435\u0434\u0430\u0442\u0438 \u0432\u043B\u0430\u0441\u043D\u0438\u043A\u0430 \u0446\u044C\u043E\u043C\u0443 \u0443\u0447\u0430\u0441\u043D\u0438\u043A\u0443? \u0412\u0438 \u0441\u0442\u0430\u043D\u0435\u0442\u0435 \u0437\u0432\u0438\u0447\u0430\u0439\u043D\u0438\u043C \u0430\u0434\u043C\u0456\u043D\u043E\u043C."))
            return;
          const r = await transferGroupOwner(group.id, mo.dataset.makeowner);
          if (r.ok) {
            group.owner_uid = mo.dataset.makeowner;
            showToast("\u2705 \u0412\u043B\u0430\u0441\u043D\u0438\u043A\u0430 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E", 2500);
            render2();
          } else
            showToast("\u041F\u043E\u043C\u0438\u043B\u043A\u0430: " + (r.error || ""), 3e3);
          return;
        }
        if (e.target.closest("[data-leave]")) {
          if (!confirm("\u0412\u0438\u0439\u0442\u0438 \u0437 \u0433\u0440\u0443\u043F\u0438?"))
            return;
          const r = await leaveGroup(group.id);
          if (r.ok) {
            showToast("\u0412\u0438 \u0432\u0438\u0439\u0448\u043B\u0438 \u0437 \u0433\u0440\u0443\u043F\u0438", 2500);
            api.close();
          } else
            showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0432\u0438\u0439\u0442\u0438: " + (r.error || ""), 3500, "error");
        }
      });
    });
  }
  function openGroupChat(group) {
    requireAuth("\u0432\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0433\u0440\u0443\u043F\u043E\u0432\u0438\u0439 \u0447\u0430\u0442", async () => {
      const me = currentUserId();
      const api = buildScreen(`
      <header class="pm-head pm-head--chat">
        <button class="pm-back" type="button" data-pm-back aria-label="\u041D\u0430\u0437\u0430\u0434">\u2190</button>
        <span class="gr-avatar gr-avatar--head" style="${group.avatar_gradient ? `background:${escapeHtml(group.avatar_gradient)}` : ""}">${group.avatar_emoji ? escapeHtml(group.avatar_emoji) : GR_SVG.users}</span>
        <div class="pm-head-titles"><div class="pm-head-name">${escapeHtml(group.name)}</div></div>
        <button class="gr-manage-btn" type="button" data-gr-manage aria-label="\u041A\u0435\u0440\u0443\u0432\u0430\u043D\u043D\u044F \u0433\u0440\u0443\u043F\u043E\u044E">${GR_SVG.gear}</button>
      </header>
      <div class="pm-stream" id="gr-stream"><div class="pm-loading">\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F\u2026</div></div>
      <form class="pm-form" id="gr-form">
        <input class="pm-input" id="gr-msg" type="text" placeholder="\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u0443 \u0433\u0440\u0443\u043F\u0443\u2026" aria-label="\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F" autocomplete="off">
        <button class="pm-send" type="submit" aria-label="\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438">\u2191</button>
      </form>
    `, "pm-screen--chat");
      const streamEl = api.screen.querySelector("#gr-stream");
      const form = api.screen.querySelector("#gr-form");
      const input = api.screen.querySelector("#gr-msg");
      let messages = [];
      const ids = /* @__PURE__ */ new Set();
      let names = /* @__PURE__ */ new Map();
      const bubble = (m) => {
        const mine = m.sender_uid === me;
        const who = mine ? "" : `<span class="gr-sender">${escapeHtml(names.get(m.sender_uid) || "\u0416\u0438\u0442\u0435\u043B\u044C")}</span>`;
        const txtHtml = m.deleted_at ? `${ICONS.trash} \u0432\u0438\u0434\u0430\u043B\u0435\u043D\u043E` : escapeHtml(m.text || "\u{1F4F7} \u0424\u043E\u0442\u043E");
        return `<div class="pm-group ${mine ? "pm-group--mine" : "pm-group--other"}"><div class="pm-bubble">${who}<span class="pm-bubble-text">${txtHtml}</span><span class="pm-bubble-time">${clockTime(postTime(m))}</span></div></div>`;
      };
      const render2 = () => {
        streamEl.innerHTML = messages.length ? messages.map(bubble).join("") : `<div class="pm-empty pm-empty--chat"><span class="pm-empty-ic">\u{1F44B}</span>\u041F\u043E\u0447\u043D\u0456\u0442\u044C \u0440\u043E\u0437\u043C\u043E\u0432\u0443 \u0432 \u0433\u0440\u0443\u043F\u0456.</div>`;
        streamEl.scrollTop = streamEl.scrollHeight;
      };
      const addMsg = (m) => {
        if (m && !ids.has(m.id)) {
          ids.add(m.id);
          messages.push(m);
        }
      };
      const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "\u0416\u0438\u0442\u0435\u043B\u044C";
      const members = await fetchGroupMembers(group.id);
      names = new Map(members.map((m) => [m.uid, firstName(m.name)]));
      (await fetchGroupMessages(group.id)).forEach(addMsg);
      if (api._closed)
        return;
      render2();
      api.screen.querySelector("[data-gr-manage]")?.addEventListener("click", () => openGroupManage(group));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text)
          return;
        input.value = "";
        const r = await sendGroupMessage({ groupId: group.id, senderUid: me, text });
        if (r.ok) {
          addMsg(r.message);
          render2();
        } else {
          showToast("\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u043D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438: " + (r.error || ""), 3e3, "error");
          input.value = text;
        }
      });
      const unsub = subscribeGroupMessages(group.id, ({ type, row }) => {
        if (type === "INSERT" && row) {
          addMsg(row);
          render2();
        } else if (type === "UPDATE" && row) {
          const i = messages.findIndex((x) => x.id === row.id);
          if (i >= 0) {
            messages[i] = row;
            render2();
          }
        }
      });
      api._cleanup.push(unsub);
    });
  }
  function initMessages() {
    consumePendingInvite();
    onAuthChange(() => {
      consumePendingInvite();
    });
  }

  // src/core/profile-card.js
  function pluralYears(n) {
    const d = n % 10, h = n % 100;
    if (h >= 11 && h <= 14)
      return "\u0440\u043E\u043A\u0456\u0432";
    if (d === 1)
      return "\u0440\u0456\u043A";
    if (d >= 2 && d <= 4)
      return "\u0440\u043E\u043A\u0438";
    return "\u0440\u043E\u043A\u0456\u0432";
  }
  function joinDate(iso) {
    const dt = new Date(iso);
    const y = dt.getFullYear();
    if (isNaN(dt.getTime()) || y <= 2e3)
      return "";
    return `${MONTHS_GEN[dt.getMonth()]} ${y}`;
  }
  function cardHtml2(p) {
    const name = p && p.name && p.name.trim() ? p.name.trim() : "\u0416\u0438\u0442\u0435\u043B\u044C \u0433\u0440\u043E\u043C\u0430\u0434\u0438";
    const url = p && p.avatar_url || cachedAvatar(p && p.uid) || "";
    const av = avatarCircle({ name, url, cls: "pcard-av" });
    const bits = [];
    if (p && p.settlement)
      bits.push(`${ICONS.pin}<span>${escapeHtml(p.settlement)}</span>`);
    if (p && Number.isFinite(p.age) && p.age > 0)
      bits.push(`<span>${p.age} ${pluralYears(p.age)}</span>`);
    const meta = bits.length ? `<div class="pcard-meta">${bits.join('<span class="pcard-dot">\xB7</span>')}</div>` : "";
    const badge = p && p.trusted ? `<div class="pcard-badge">${ICONS.check} \u0414\u043E\u0432\u0456\u0440\u0435\u043D\u0438\u0439 \u0430\u0432\u0442\u043E\u0440</div>` : "";
    const bioText = p && p.bio && p.bio.trim() ? p.bio.trim() : "";
    const bio = bioText ? `<div class="pcard-bio"><span class="pcard-bio-h">\u041F\u0440\u043E \u0441\u0435\u0431\u0435</span><p>${escapeHtml(bioText)}</p></div>` : "";
    const jd = p && p.created_at ? joinDate(p.created_at) : "";
    const since = jd ? `<div class="pcard-since">\u0423\u0447\u0430\u0441\u043D\u0438\u043A CSTL LIFE \u0437 ${jd}</div>` : "";
    return `
    <div class="pcard">
      <div class="pcard-avwrap" data-pcard-photo="${url ? escapeHtml(url) : ""}">${av}</div>
      <div class="pcard-name">${escapeHtml(name)}</div>
      ${meta}${badge}${bio}${since}
    </div>`;
  }
  async function openProfileCard(uid) {
    if (!uid)
      return;
    const p = await fetchPublicProfile(uid);
    openModal({
      variant: "sheet",
      className: "app-modal--top",
      // поверх кабінету/чату (інакше ховається під ними)
      bodyHtml: cardHtml2(p || { uid }),
      onMount: (wrap) => {
        const avwrap = wrap.querySelector(".pcard-avwrap");
        const url = avwrap && avwrap.dataset.pcardPhoto;
        if (url) {
          avwrap.style.cursor = "zoom-in";
          avwrap.addEventListener("click", () => openPhotoLightbox(url));
        }
      }
    });
  }
  var _wired = false;
  function initProfileCardTaps() {
    if (_wired)
      return;
    _wired = true;
    document.addEventListener("click", (e) => {
      const av = e.target.closest("[data-av-uid]");
      if (!av)
        return;
      if (e.target.closest("[data-thread]"))
        return;
      const uid = av.dataset.avUid;
      if (uid)
        openProfileCard(uid);
    });
  }

  // src/app.js
  var currentTab = "community";
  var _analyticsDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop";
  window.switchTab = function(tab) {
    if (tab === "news" || tab === "events")
      tab = "shotam";
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
    window.dispatchEvent(new CustomEvent("cstl-tab-changed"));
    logEvent(currentUserId() || getAnonId(), "tab_view", { tab, meta: { device: _analyticsDevice } });
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
  function initChatsHub() {
    const page = document.getElementById("page-chats");
    if (!page)
      return;
    page.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-chats]");
      if (!btn)
        return;
      const k = btn.dataset.chats;
      if (k === "messages")
        openThreadsList();
      else if (k === "discussions")
        window.switchTab("discussions");
      else if (k === "groups")
        openGroupsList();
    });
  }
  function handleInviteHash() {
    const m = (location.hash || "").match(/^#\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (!m)
      return;
    history.replaceState(null, "", location.pathname + location.search);
    openInviteJoin(m[1]);
  }
  function handleThreadHash() {
    const m = (location.hash || "").match(/^#\/thread\/(\d+)/);
    if (!m)
      return;
    history.replaceState(null, "", location.pathname + location.search);
    openThreadById(Number(m[1]));
  }
  function init() {
    bootApp();
    initAuth();
    initAccountUI();
    initSidebar();
    initConsent();
    initMessages();
    initBoardChat();
    initModalSwipe();
    initWeather();
    initCommunity();
    initNews();
    initFeed();
    initBuses();
    initSavedRoutesHeader();
    initSavedHub();
    initPower();
    initBoard();
    initChatsHub();
    initProfileCardTaps();
    initAdminShortcut();
    handleInviteHash();
    window.addEventListener("hashchange", handleInviteHash);
    handleThreadHash();
    window.addEventListener("hashchange", handleThreadHash);
    logEvent(currentUserId() || getAnonId(), "tab_view", { tab: currentTab, meta: { device: _analyticsDevice } });
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
