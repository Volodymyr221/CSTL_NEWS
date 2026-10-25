# Підміняє в згенерованому _vs-shoot.mjs спільноти, дописи, реакції й коментарі Стрічки.
import sys
p = sys.argv[1]; s = open(p).read()
a = s.index("const СТОРІНКИ = ["); b = s.index("].map((o, i) => ({ image_url: null", a)
new = '''const СТОРІНКИ = [
  { id: 11, name: 'Олицька громада', avatar_url: '', official: true, description: 'Офіційні новини та оголошення громади' },
  { id: 13, name: 'Olyka Castle', avatar_url: '', official: false, description: 'Події, кіно й життя біля замку' },
  { id: 12, name: 'Олицький ліцей', avatar_url: '', official: true, description: 'Новини ліцею для учнів і батьків' },
  { id: 14, name: 'Історія Громади', avatar_url: '', official: false, description: 'Що тут було колись' },
  { id: 15, name: 'Спортивна Олика', avatar_url: '', official: false, description: 'Секції, матчі, тренування' },
];
const ЗАВТРА = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const ПОСТИ_СТРІЧКИ = [
  { id: 951, page_id: 11, text: 'У середу з 9:00 до 15:00 не буде води на вулицях Замковій і Першотравневій — планова заміна засувки.', pages: СТОРІНКИ[0] },
  { id: 952, page_id: 13, text: 'Кіно просто неба біля замку. Беріть пледи — попкорн буде на місці.', pages: СТОРІНКИ[1],
    event_date: ЗАВТРА, event_time: '19:00', event_location: 'Подвір’я замку' },
  { id: 953, page_id: 12, text: 'Запрошуємо батьків на день відкритих дверей — у четвер о 17:00. Покажемо нові класи й лабораторію.', pages: СТОРІНКИ[2] },
  { id: 954, page_id: 15, text: 'Набір у футбольну секцію для дітей 8–12 років. Тренування вівторок і четвер, 17:00.', pages: СТОРІНКИ[4] },
  { id: 955, page_id: 13, text: 'Дякуємо всім, хто був на вечорі живої музики! Наступний — уже за два тижні.', pages: СТОРІНКИ[1] },
'''
s = s[:a] + new + s[b:]
c = s.index("page_reactions: [], page_comments: []")
reacts = "[" + ",".join(f"{{ post_id: {pid}, user_id: 'r{pid}{i}' }}" for pid, n in [(951, 23), (952, 41), (953, 12), (954, 17), (955, 9)] for i in range(n)) + "]"
comments = """[
  { id: 7001, post_id: 952, author_uid: 'u6', text: 'Чудово! Що будуть показувати?', created_at: днів(0), parent_id: null, deleted_at: null },
  { id: 7002, post_id: 952, author_uid: 'u7', text: 'Будемо всією родиною 🙌', created_at: днів(0), parent_id: null, deleted_at: null },
  { id: 7003, post_id: 952, author_uid: 'u8', text: 'А якщо дощ — перенесете?', created_at: днів(0), parent_id: null, deleted_at: null },
]"""
s = s[:c] + f"page_reactions: {reacts}, page_comments: {comments}" + s[c + len("page_reactions: [], page_comments: []"):]
open(p, 'w').write(s)

# Міські оголошення Дошки (25.10, «не картоплю, щось серйозніше»)
s = open(p).read()
a = s.index("const ОГОЛОШЕННЯ = ["); b = s.index("].map((o, i) => ({ photos: [], status: 'published'", a)
s = s[:a] + '''const ОГОЛОШЕННЯ = [
  { id: 801, type: 'board', category: 'послуга', title: 'Ремонт телефонів і ноутбуків',
    text: 'Заміна екрана й батареї, чистка, налаштування. Діагностика безкоштовно.',
    price: null, price_negotiable: true, location: 'Олика', author: 'Дмитро', owner_uid: 'u2' },
  { id: 802, type: 'board', category: 'продам', title: 'iPhone 13, 128 ГБ, стан ідеальний',
    text: 'Батарея 89%, повний комплект і чек. Можна перевірити на місці.',
    price: 14500, currency: 'UAH', location: 'Олика', author: 'Ірина', owner_uid: 'u3' },
  { id: 803, type: 'board', category: 'послуга', title: 'Ремонт покрівлі, бригада з Олики',
    text: 'Металочерепиця, профнастил, ремонт старого даху. Виїзд по громаді.',
    price: null, price_negotiable: true, location: 'Олицька громада', author: 'Сергій', owner_uid: 'u4' },
  { id: 804, type: 'board', category: 'шукаю', title: 'Шукаю бухгалтера на неповний день',
    text: 'Невелике підприємство в Олиці. Досвід із ФОП, гнучкий графік.',
    price: null, location: 'Олика', author: 'Олена', owner_uid: 'u5' },
''' + s[b:]
open(p, 'w').write(s)
