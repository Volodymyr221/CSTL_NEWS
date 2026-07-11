// src/core/board-categories.js
// Єдине джерело таксономії категорій Дошки: id (значення в БД), label (показ),
// семантичний колір тега, векторна SVG-іконка (у стилі застосунку).
// Реюз: board.js (фільтр+картка), community-modal.js (форма+прев'ю), community-blocks.js (міні-віджет).
//
// Іконки — stroke=currentColor (фарбуються кольором тексту контексту: у пігулці —
// семантичним кольором категорії, у меню/кнопці — заданим класом кольору) + розмір
// 1em (масштабується під шрифт місця, де вставлена). Клас .cat-ico — вертикальне вирівнювання.

const A = 'width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cat-ico"';

const SVG = {
  // Купити — корзина
  cart:  `<svg ${A}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>`,
  // Продам — цінник
  tag:   `<svg ${A}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  // Віддам безкоштовно — подарунок
  gift:  `<svg ${A}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  // Шукаю — лупа
  search:`<svg ${A}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  // Послуги — ключ
  wrench:`<svg ${A}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-6.3 6.3a2.1 2.1 0 0 1-3-3l6.3-6.3a6 6 0 0 1 7.9-7.9l-3.1 3.1z"/></svg>`,
  // Знайдено — галочка в колі
  check: `<svg ${A}><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>`,
  // Загубилось — знак «?» у колі
  help:  `<svg ${A}><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  // Всі — повзунки (налаштування фільтра; дефолт кнопки фільтра)
  sliders:`<svg ${A}><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/></svg>`,
};

// Порядок = порядок у меню фільтра й чіпах форми.
// short — коротка назва для вузької пігулки картки (де label задовгий).
export const BOARD_CATEGORIES = [
  { id: 'куплю',      label: 'Куплю',              color: 'green',  icon: SVG.cart   },
  { id: 'продам',     label: 'Продам',             color: 'red',    icon: SVG.tag    },
  { id: 'послуга',    label: 'Послуги',            color: 'white',  icon: SVG.wrench },
  { id: 'шукаю',      label: 'Шукаю',              color: 'blue',   icon: SVG.search },
  { id: 'віддам',     label: 'Віддам безкоштовно', short: 'Віддам', color: 'green', icon: SVG.gift },
  { id: 'знайдено',   label: 'Знайдено',           color: 'amber',  icon: SVG.check  },
  { id: 'загубилось', label: 'Загубилось',         color: 'amber',  icon: SVG.help   },
];

// Іконка «Всі» / дефолт кнопки-фільтра (повзунки).
export const ALL_ICON = SVG.sliders;

const byId = (id) => BOARD_CATEGORIES.find(c => c.id === id);

// Семантичний колір тега. Невідома категорія (старі 'оголошення'/null) → 'white' (нейтральний).
export function catColor(id) { const c = byId(id); return c ? c.color : 'white'; }

// Векторна іконка категорії. Невідома → лійка (як «Всі»).
export function catIcon(id)  { const c = byId(id); return c ? c.icon  : ALL_ICON; }

// Повна назва (меню/форма). Невідома → сам id.
export function catLabel(id) { const c = byId(id); return c ? c.label : id; }

// Коротка назва для картки (де є short; інакше label).
export function catShort(id) { const c = byId(id); return c ? (c.short || c.label) : id; }
