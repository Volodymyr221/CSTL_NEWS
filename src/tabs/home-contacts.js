// src/tabs/home-contacts.js — ТЕЛЕФОНИ НА ГОЛОВНІЙ: екстрені + контакти громади.
//
// Замовлення Вови (04.08): «заголовок "Телефони громади", а зверху показані
// екстрені служби, які не мають відношення саме до громади. Через це користувач
// не зовсім розуміє структуру». І далі — зробити систему, що масштабується від
// 10 до 100+ контактів, з категоріями, розкриттям і швидкими діями.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ЩО В ЗАМОВЛЕННІ РОЗІЙШЛОСЬ ІЗ ДАНИМИ — І ЯК ЦЕ ВИРІШЕНО
//
// ТЗ описувало інтерфейс під 50-100 контактів: список категорій, кожна
// згорнута, розкриваєш потрібну. Перевірка даних (`data/community.json`):
// **контактів рівно 9**, з них 5 екстрених. Тобто після розділення в «Громаді»
// лишається **чотири** записи — сільрада, ЦНАП, амбулаторія, Волиньобленерго.
//
// Згорнутий акордеон на чотирьох контактах шкодить: людина бачить
// «🏛 Органи влади (2)» і мусить тапнути, щоб побачити ДВА рядки. Це зайвий
// крок там, де все й так вміщується на екран.
//
// Тому система масштабована, а поведінка адаптивна:
//   • категорії існують ЗАВЖДИ (і в даних, і в розмітці) — додати 50 контактів
//     можна не чіпаючи ні код, ні дизайн;
//   • групи РОЗКРИТІ, поки контактів мало (≤ AUTO_OPEN_MAX);
//   • щойно їх стає більше — групи згортаються самі, і інтерфейс лишається
//     чистим рівно так, як просив Вова.
// Тобто «100+ контактів» обслуговується, але сьогоднішні чотири не платять за
// це зайвим тапом.
//
// 📋 ФОРМАТ ЗАПИСУ (для того, хто наповнюватиме):
//   { "id", "name", "phone",
//     "category": "gov|admin|medical|utility|edu|post|safety|emergency",
//     "address": "…"  (необовʼязково — дає кнопку «На карті»),
//     "hours":   "…"  (необовʼязково — рядок «08:00–17:00»),
//     "group":   "emergency" | "local" }
// ⚠️ Нових ОБОВʼЯЗКОВИХ полів не заведено: старі записи лишаються чинними,
// міграція даних не потрібна. Невідома категорія не ламає блок — запис
// потрапляє в «Інші контакти».

import { escapeHtml, showToast } from '../core/utils.js';

// Скільки контактів громади показувати розкритими. 6 — стільки вміщується на
// екран без прокрутки разом із заголовками груп; більше вже вимагає згортання.
const AUTO_OPEN_MAX = 6;

// Екстрені номери, які мусять бути на видноті завжди і в цьому порядку.
// ⚠️ Порядок не алфавітний і не «як у даних» — це послідовність, яку люди
// знають напам'ять з дитинства (101 → 102 → 103), і ламати її не можна.
const EMERGENCY_ORDER = ['101', '102', '103', '104', '112'];

// Категорії громади. Ключ = поле `category` у даних, значення = як це назвати
// людині. Порядок тут визначає порядок груп на екрані.
// ⚠️ `gov` і `admin` навмисно зведені в одну групу: сільрада і ЦНАП — це для
// людини «куди йти по документи», а не дві різні гілки влади.
const CATEGORIES = [
  { keys: ['gov', 'admin'], icon: '🏛', title: 'Органи влади' },
  { keys: ['medical'],      icon: '🏥', title: 'Медицина' },
  { keys: ['utility'],      icon: '⚡', title: 'Комунальні служби' },
  { keys: ['post'],         icon: '📦', title: 'Пошта' },
  { keys: ['edu'],          icon: '🎓', title: 'Освіта' },
  { keys: ['safety'],       icon: '👮', title: 'Безпека' },
];
const OTHER = { icon: '📇', title: 'Інші контакти' };

// Для набору `tel:` лишаємо лише цифри і плюс.
const telOf = p => String(p || '').replace(/[^\d+]/g, '');

function plural(n, one, few, many) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

// ── Екстрені ─────────────────────────────────────────────────────────────────
// Однакові компактні плитки. Тап = дзвінок одразу, без проміжного екрана:
// у цьому блоці кожна зайва дія коштує секунд.
function emergencyHtml(list) {
  const rank = c => {
    const i = EMERGENCY_ORDER.indexOf(String(c.phone || '').trim());
    return i === -1 ? 99 : i;
  };
  const sorted = [...list].sort((a, b) => rank(a) - rank(b));
  return `
    <div class="hm-sos">
      ${sorted.map(c => `
        <a class="hm-sos-b" href="tel:${escapeHtml(telOf(c.phone))}">
          <span class="hm-sos-n">${escapeHtml(c.phone)}</span>
          <span class="hm-sos-t">${escapeHtml(c.name)}</span>
        </a>`).join('')}
    </div>`;
}

// ── Контакти громади ─────────────────────────────────────────────────────────

function contactHtml(c) {
  const tel = telOf(c.phone);
  const meta = [c.hours, c.address].filter(Boolean).map(escapeHtml).join(' · ');
  return `
    <div class="hm-ct">
      <a class="hm-ct-main" href="tel:${escapeHtml(tel)}">
        <span class="hm-ct-name">${escapeHtml(c.name)}</span>
        <span class="hm-ct-phone">${escapeHtml(c.phone)}</span>
        ${meta ? `<span class="hm-ct-meta">${meta}</span>` : ''}
      </a>
      <span class="hm-ct-acts">
        <button class="hm-ct-act" type="button" data-copy="${escapeHtml(c.phone)}" aria-label="Копіювати номер">⧉</button>
        ${c.address ? `<a class="hm-ct-act" href="https://maps.google.com/?q=${encodeURIComponent(c.address)}" target="_blank" rel="noopener noreferrer" aria-label="Відкрити на карті">📍</a>` : ''}
      </span>
    </div>`;
}

function groupHtml(g, open) {
  return `
    <details class="hm-cgrp"${open ? ' open' : ''}>
      <summary class="hm-cgrp-sum">
        <span class="hm-cgrp-ic" aria-hidden="true">${g.icon}</span>
        <span class="hm-cgrp-t">${escapeHtml(g.title)}</span>
        <span class="hm-cgrp-n">${g.items.length}</span>
      </summary>
      <div class="hm-cgrp-body">${g.items.map(contactHtml).join('')}</div>
    </details>`;
}

// Розкласти контакти по категоріях у порядку CATEGORIES. Порожні категорії не
// створюються — мертвий рядок «Пошта (0)» гірший за його відсутність.
function groupContacts(list) {
  const groups = [];
  const used = new Set();
  for (const cat of CATEGORIES) {
    const items = list.filter(c => cat.keys.includes(c.category));
    items.forEach(c => used.add(c));
    if (items.length) groups.push({ ...cat, items });
  }
  const rest = list.filter(c => !used.has(c));
  if (rest.length) groups.push({ ...OTHER, items: rest });
  return groups;
}

export async function renderContactsBlock() {
  const el = document.getElementById('cm-contacts-content');
  if (!el) return;

  try {
    const res = await fetch('./data/community.json');
    const data = await res.json();
    const list = data.contacts || [];
    if (!list.length) {
      el.innerHTML = '<div class="hm-empty">Контактів немає</div>';
      return;
    }

    // 🔴 РОЗДІЛЕННЯ — головна суть цієї переробки.
    // «Пожежна 101» не є телефоном ГРОМАДИ: це загальнодержавна служба. Поки
    // вони лежали під заголовком «Телефони громади», заголовок казав неправду.
    const isEmergency = c => c.group === 'emergency' || c.group === 'hero' || c.priority === 'critical';
    // ⚠️ Волиньобленерго стоїть у даних із `group: emergency`, але його
    // `category` — `utility`. Це не екстрена служба, а комунальна: у блок
    // швидкого набору вона не потрапляє, бо туди йдуть лише короткі номери
    // зі списку EMERGENCY_ORDER.
    const sos = list.filter(c => isEmergency(c) && EMERGENCY_ORDER.includes(String(c.phone || '').trim()));
    const local = list.filter(c => !sos.includes(c));

    const groups = groupContacts(local);
    const openAll = local.length <= AUTO_OPEN_MAX;

    el.innerHTML =
      (sos.length ? `
        <div class="hm-csec">
          <div class="hm-csec-h"><span aria-hidden="true">🚨</span> Екстрені служби</div>
          ${emergencyHtml(sos)}
        </div>` : '') +
      (groups.length ? `
        <div class="hm-csec">
          <div class="hm-csec-h"><span aria-hidden="true">🏘</span> Служби громади
            <span class="hm-csec-n">${local.length} ${plural(local.length, 'контакт', 'контакти', 'контактів')}</span>
          </div>
          ${groups.map(g => groupHtml(g, openAll)).join('')}
        </div>` : '');

    // Копіювання номера. Один слухач на блок; вішається раз.
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('click', async e => {
        const btn = e.target.closest('[data-copy]');
        if (!btn) return;
        e.preventDefault();
        const num = btn.dataset.copy;
        try {
          // `navigator.clipboard` існує лише в захищеному контексті (https або
          // localhost). На проді це https, але запас потрібен: без нього тап у
          // незахищеному контексті мовчки нічого не робив би.
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(num);
          } else {
            const ta = document.createElement('textarea');
            ta.value = num; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
          }
          showToast(`Скопійовано: ${num}`);
        } catch {
          showToast('Не вдалося скопіювати', 0, 'error');
        }
      });
    }
  } catch {
    el.innerHTML = '<div class="hm-empty">Контакти недоступні</div>';
  }
}
