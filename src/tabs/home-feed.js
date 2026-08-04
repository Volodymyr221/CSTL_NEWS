// src/tabs/home-feed.js — ВІДЖЕТ «У СТРІЧЦІ ГРОМАДИ» на головній.
//
// Замовлення Вови (04.08): «Є стрічка — там зовсім інша логіка, там логіка
// стрічки як в інстаграмі та фейсбуці. Під неї теж треба продумати якийсь
// віджет, такий дайджест.»
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ЧОГО ЦЬОГО НЕ БУЛО І ЧОМУ ЦЕ ВАЖЛИВО
// Аудит 04.08: Стрічка — головний СОЦІАЛЬНИЙ майданчик застосунку (пости
// сторінок-каналів громади), але з головної сторінки не було видно НІЧОГО з
// того, що там відбувається. Людина не знала, що сусід щось опублікував,
// поки сама не відкриє вкладку.
//
// 🔑 ЧОМУ ЦЕ ДАЙДЖЕСТ, А НЕ ДРУГА СТРІЧКА
// Спокуса — показати тут стрічку постів. Це була б помилка того самого роду,
// що вкладений скролер новин, який прибирали 31.07: дві стрічки одного вмісту
// на двох екранах змагаються між собою, і жодна не виграє.
// Тому тут рівно **два останні пости**, кожен одним рядком: хто · про що ·
// коли. Це «зазирнути», а не «читати». Читати — у Стрічці.
//
// 📐 ДВА, а не три: у новин своя секція з трьох карток, і якщо тут теж буде три,
// на екрані зʼявиться шість однакових рядків підряд — сторінка перетвориться
// на список. Два — достатньо, щоб побачити рух у громаді.

import { escapeHtml, formatTime } from '../core/utils.js';
import { fetchPagePosts, isSupabaseReady } from '../core/supabase.js';

const MAX = 2;

// Перша значуща фраза допису: сам пост може бути на кілька абзаців, а в рядку
// віджета видно два рядки тексту. Обрізаємо по межі слова, а не посеред нього.
function preview(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 110) return t;
  const cut = t.slice(0, 110);
  const sp = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut) + '…';
}

// Ініціал каналу для кружечка-заглушки, коли в сторінки немає аватара.
function initial(name) {
  const n = (name || '').trim();
  return n ? n[0].toUpperCase() : '•';
}

function postRowHtml(p) {
  const page = p.pages || {};
  const name = page.name || 'Громада';
  const txt = preview(p.text);
  // Фото допису показуємо мініатюрою праворуч — воно каже «тут є що подивитись»
  // швидше за будь-який текст. Беремо ПЕРШЕ з набору (у пості їх може бути кілька).
  const img = p.image_url || (Array.isArray(p.image_urls) ? p.image_urls[0] : null);
  const ava = page.avatar_url
    ? `<img class="hm-fd-ava-img" src="${escapeHtml(page.avatar_url)}" alt="">`
    : `<span class="hm-fd-ava-tx">${escapeHtml(initial(name))}</span>`;

  return `
    <article class="hm-card hm-card--tap hm-fd" data-feed-post="${escapeHtml(String(p.id))}">
      <span class="hm-fd-ava">${ava}</span>
      <span class="hm-fd-body">
        <span class="hm-fd-who">${escapeHtml(name)}</span>
        ${txt ? `<span class="hm-fd-txt">${escapeHtml(txt)}</span>` : ''}
        <span class="hm-fd-when">${escapeHtml(formatTime(p.created_at))}</span>
      </span>
      ${img ? `<span class="hm-fd-thumb"><img src="${escapeHtml(img)}" alt="" loading="lazy"></span>` : ''}
    </article>`;
}

export async function renderHomeFeed() {
  const sec = document.getElementById('hm-feed');
  const body = document.getElementById('hm-feed-body');
  if (!sec || !body) return;

  // Без бази показувати нічого: порожня секція «у стрічці громади» без жодного
  // допису каже людині менше, ніж її відсутність.
  if (!isSupabaseReady()) { sec.hidden = true; return; }

  try {
    const posts = await fetchPagePosts(null, MAX);
    if (!posts.length) { sec.hidden = true; body.innerHTML = ''; return; }
    sec.hidden = false;
    body.innerHTML = posts.map(postRowHtml).join('');
    body.classList.add('hm-appear');
  } catch {
    // Мережа впала — секції просто немає. Це не та інформація, заради якої
    // варто показувати людині повідомлення про помилку на головній.
    sec.hidden = true;
    body.innerHTML = '';
  }

  if (!sec.dataset.wired) {
    sec.dataset.wired = '1';
    // Тап у будь-яке місце віджета веде у Стрічку. Окремого «відкрити саме цей
    // пост» тут свідомо немає: у Стрічці пост однаково перший у списку, а
    // глибокий перехід вимагав би власного маршруту — тобто другої логіки
    // відкриття поста поруч із наявною.
    sec.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') window.switchTab('shotam');
    });
  }
}
