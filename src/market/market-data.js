// src/market/market-data.js
// Демо-дані пробного МАРКЕТА. Це ЗАГЛУШКА (stub — тимчасові дані замість БД):
// у бойовій версії бізнеси, публікації й товари прийдуть з Supabase
// (таблиці `businesses`, `business_posts`, `business_items`).
// Тримаємо окремим файлом, щоб підміна на реальні дані не зачіпала верстку.
//
// ⚠️ ФОТО: у репозиторії нема знімків їжі/товарів, тому кожна публікація має
// поле `art` — градієнт + емодзі, який малюється замість фотографії.
// Коли зʼявляться справжні фото — додати поле `photo: 'images/xxx.jpg'`,
// і воно перекриє градієнт (див. `artHtml` у market-page.js).

export const BUSINESSES = [
  {
    id: 'olyka-sushi',
    name: 'OLYKA SUSHI',
    logo: '🍣',
    logoBg: 'linear-gradient(145deg,#2A2A2E,#141416)',
    verified: true,
    category: 'Їжа та напої',
    rating: 4.9,
    reviews: 128,
    about: 'OLYKA SUSHI — найсмачніші суші та роли в Олиці. Готуємо з любовʼю для вас з 2021 року.',
    address: 'Олика, вул. Замкова, 15',
    phone: '+380671234567',
    hours: '10:00 – 22:00',
    openNow: true,
    delivery: 40,
    freeFrom: 300,       // безкоштовна доставка від суми, грн
    minOrder: 150,
    posts: [
      {
        id: 'p-sushi-1',
        badge: 'АКЦІЯ',
        title: 'Філадельфія −20%',
        text: 'До кінця тижня на всі роли Філадельфія!',
        art: { emoji: '🍣', bg: 'linear-gradient(140deg,#B4472F,#6E1F1A)' },
        bullets: [
          'Свіжі інгредієнти щодня',
          'Швидка доставка по Олиці',
          'Безкоштовна доставка від 300 грн',
        ],
        cta: 'Замовити',
        time: '2 год тому',
        likes: 32, comments: 5,
      },
      {
        id: 'p-sushi-2',
        badge: 'НОВИНКА',
        title: 'Сет Бургер + Фрі',
        text: 'Новий сет за 199 грн — бургер, фрі та напій.',
        art: { emoji: '🍔', bg: 'linear-gradient(140deg,#8A5A22,#3A2410)' },
        cta: 'Замовити',
        time: 'вчора о 15:30',
        likes: 28, comments: 7,
      },
    ],
    items: [
      { id: 'os1', title: 'Філадельфія лосось', price: 245, unit: '8 шт', desc: 'Акція −20%, було 305 ₴' },
      { id: 'os2', title: 'Каліфорнія з крабом', price: 210, unit: '8 шт', desc: '' },
      { id: 'os3', title: 'Сет «Замковий»',     price: 640, unit: '32 шт', desc: 'Чотири види ролів' },
      { id: 'os4', title: 'Сет Бургер + Фрі',   price: 199, unit: 'порц', desc: 'Бургер, фрі, напій' },
      { id: 'os5', title: 'Місо-суп',           price: 85,  unit: 'порц', desc: '' },
      { id: 'os6', title: 'Соєвий соус',        price: 15,  unit: 'шт', desc: '' },
    ],
  },
  {
    id: 'coffee-house',
    name: 'Coffee House',
    logo: '☕',
    logoBg: 'linear-gradient(145deg,#3A2A1E,#171210)',
    verified: true,
    category: 'Їжа та напої',
    rating: 4.8,
    reviews: 64,
    about: 'Кавʼярня в центрі Олики. Свіжообсмажена кава, десерти власного виробництва, обіди на виніс.',
    address: 'Олика, вул. Замкова, 1',
    phone: '+380673334455',
    hours: '08:00 – 20:00',
    openNow: true,
    delivery: 35,
    freeFrom: 250,
    minOrder: 120,
    posts: [
      {
        id: 'p-coffee-1',
        badge: 'НОВИНКА',
        title: 'Сезонне меню — гарбузове лате',
        text: 'Уже в продажу. Дегустація по вихідних.',
        art: { emoji: '🎃', bg: 'linear-gradient(140deg,#A8571F,#3B1E0C)' },
        cta: 'Замовити',
        time: '4 год тому',
        likes: 19, comments: 2,
      },
    ],
    items: [
      { id: 'cf1', title: 'Лате 300 мл',        price: 55,  unit: 'шт', desc: '' },
      { id: 'cf2', title: 'Гарбузове лате',     price: 70,  unit: 'шт', desc: 'Сезонне' },
      { id: 'cf3', title: 'Борщ з пампушкою',   price: 95,  unit: 'порц', desc: 'Готуємо щодня' },
      { id: 'cf4', title: 'Сирник',             price: 42,  unit: 'шт', desc: '' },
      { id: 'cf5', title: 'Вареники з картоплею', price: 85, unit: 'порц', desc: '10 шт зі шкварками' },
    ],
  },
  {
    id: 'sto-auto-pro',
    name: 'CTO Auto Pro',
    logo: '🔧',
    logoBg: 'linear-gradient(145deg,#26262A,#101012)',
    verified: false,
    category: 'Авто',
    rating: 4.7,
    reviews: 41,
    about: 'СТО повного циклу: заміна масла, діагностика, ремонт ходової. Запис за телефоном або через застосунок.',
    address: 'Олика, вул. Промислова, 7',
    phone: '+380671112233',
    hours: '09:00 – 18:00',
    openNow: false,
    delivery: 0,
    freeFrom: 0,
    minOrder: 0,
    posts: [
      {
        id: 'p-sto-1',
        badge: 'ПОСЛУГА',
        title: 'Заміна масла від 800 грн',
        text: 'Акція діє до кінця місяця.',
        art: { emoji: '🛢️', bg: 'linear-gradient(140deg,#5A4A1E,#1C1608)' },
        cta: 'Записатися',
        time: 'вчора о 11:20',
        likes: 21, comments: 2,
      },
    ],
    items: [
      { id: 'st1', title: 'Заміна масла + фільтр', price: 800,  unit: 'посл', desc: 'Масло клієнта' },
      { id: 'st2', title: 'Компʼютерна діагностика', price: 450, unit: 'посл', desc: '' },
      { id: 'st3', title: 'Шиномонтаж, 4 колеса',  price: 600,  unit: 'посл', desc: '' },
    ],
  },
  {
    id: 'budmarket',
    name: 'БудМаркет Олика',
    logo: '🧱',
    logoBg: 'linear-gradient(145deg,#33261E,#131010)',
    verified: true,
    category: 'Будівництво',
    rating: 4.6,
    reviews: 33,
    about: 'Будівельні матеріали зі складу в Олиці. Доставка по громаді власним транспортом.',
    address: 'Олика, вул. Складська, 3',
    phone: '+380674445566',
    hours: '08:00 – 17:00',
    openNow: true,
    delivery: 150,
    freeFrom: 5000,
    minOrder: 500,
    posts: [
      {
        id: 'p-bud-1',
        badge: 'НОВИНКА',
        title: 'Нове надходження тротуарної плитки',
        text: 'В наявності різні кольори та форми.',
        art: { emoji: '🧱', bg: 'linear-gradient(140deg,#6B5B4A,#241D16)' },
        cta: 'Переглянути',
        time: '5 год тому',
        likes: 18, comments: 3,
      },
    ],
    items: [
      { id: 'bm1', title: 'Плитка тротуарна «Цегла»', price: 320, unit: 'м²', desc: 'Сіра, товщина 40 мм' },
      { id: 'bm2', title: 'Цемент М500, 25 кг',      price: 210, unit: 'мішок', desc: '' },
      { id: 'bm3', title: 'Пісок будівельний',        price: 950, unit: 'т', desc: 'Мийний' },
    ],
  },
  {
    id: 'beauty-room',
    name: 'Beauty Room',
    logo: '💅',
    logoBg: 'linear-gradient(145deg,#3A1E2A,#150C11)',
    verified: false,
    category: 'Краса та здоровʼя',
    rating: 5.0,
    reviews: 57,
    about: 'Студія краси в Олиці: манікюр, брови, зачіски. Запис онлайн.',
    address: 'Олика, вул. Незалежності, 22',
    phone: '+380675556677',
    hours: '10:00 – 19:00',
    openNow: true,
    delivery: 0,
    freeFrom: 0,
    minOrder: 0,
    posts: [
      {
        id: 'p-beauty-1',
        badge: 'АКЦІЯ',
        title: 'Манікюр + покриття — 450 грн',
        text: 'Для нових клієнтів до кінця місяця.',
        art: { emoji: '💅', bg: 'linear-gradient(140deg,#8A3A5E,#2A0F1C)' },
        cta: 'Записатися',
        time: '1 день тому',
        likes: 44, comments: 9,
      },
    ],
    items: [
      { id: 'br1', title: 'Манікюр + покриття', price: 450, unit: 'посл', desc: 'Акційна ціна' },
      { id: 'br2', title: 'Корекція брів',      price: 250, unit: 'посл', desc: '' },
      { id: 'br3', title: 'Укладка',            price: 350, unit: 'посл', desc: '' },
    ],
  },
];

// Чіпи-фільтри стрічки. `test` — як перевірити, чи пост підходить під фільтр.
export const FILTERS = [
  { id: 'all',    label: 'Усі',              test: () => true },
  { id: 'open',   label: 'Відчинені зараз',  test: (p, b) => b.openNow },
  { id: 'sale',   label: 'Акції 🔥',          test: p => p.badge === 'АКЦІЯ' },
  { id: 'new',    label: 'Новинки',          test: p => p.badge === 'НОВИНКА' },
  { id: 'serv',   label: 'Послуги',          test: p => p.badge === 'ПОСЛУГА' },
];

export function businessById(id) {
  return BUSINESSES.find(b => b.id === id) || null;
}

// Стрічка = усі публікації всіх бізнесів, кожна з посиланням на свій бізнес.
export function allPosts() {
  return BUSINESSES.flatMap(b => b.posts.map(p => ({ ...p, biz: b })));
}

export function postById(id) {
  return allPosts().find(p => p.id === id) || null;
}
