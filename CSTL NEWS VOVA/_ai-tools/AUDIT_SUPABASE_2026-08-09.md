# АУДИТ БЕЗПЕКИ SUPABASE — 09.08.2026

**Проєкт:** `Olyka Castle` (`uabyfecseqnemvcqhdem`) · Postgres 17.6
**Метод:** живі запити до прода через MCP-конектор, **не** читання `scripts/*.sql`.
Ключова перевірка — від імені ролі `anon` (`set local role anon`), тобто рівно
те, що бачить сторонній із публічним ключем із `bundle.js`.

> ⚠️ **Чому не по файлах.** `scripts/*.sql` записують НАМІР, а не розгорнутий
> стан. Розходження знайдено одразу: файл `supabase_comments_reactions.sql`
> обіцяє `"Anyone can delete reaction" USING (true)` — у проді цієї політики
> вже немає, стоїть `"Auth delete own reaction"` з `user_id = auth.uid()`.
> Тобто аудит по файлах дав би **хибну тривогу**.

---

## 1. Що бачить анонім (заміряно)

```sql
set local role anon;
select (select count(*) from posts),  (select count(*) from profiles), ...
```

| таблиця | рядків для аноніма | вердикт |
|---|---|---|
| `profiles` | **0** | ✅ телефони, пошта, дати народження, прізвища закриті |
| `messages` | **0** | ✅ приватні чати недосяжні |
| `chat_group_messages` | **0** | ✅ групові чати недосяжні |
| `ads` | **0** | ✅ (рядків узагалі немає — політика все одно небезпечна, п. 4) |
| `posts` | 24, з них **12 із телефоном** | 🔴 п. 3 |
| `page_reactions` | 11 лайків, **5 унікальних uid** | 🟡 п. 5 |

RLS увімкнено на **всіх 34 таблицях** `public` без винятку.

## 2. Сховище

| бакет | публічний | політики |
|---|---|---|
| `community-photos` | так | завантаження лише залогіненим, стеля 5 МБ, mime jpeg/png/webp |
| `chat-photos` | **ні** | читання/запис лише учасникам треду (звірка папки з `threads`) ✅ |

## 3. 🔴 Телефони дошки скачуються одним запитом

`"Public can read published posts" USING (status = 'published')` — **RLS у
Postgres рядковий, не колонковий**, тож `contact` віддається разом з усім рядком.

```
GET /rest/v1/posts?select=author,contact,location&status=eq.published
→ 12 пар «ім'я + телефон + село»
```

Номер в оголошенні **має бути видний** — це сенс дошки (рішення Вови 09.08).
Проблема інша: різниця між «людина відкрила оголошення» і «бот забрав усі
номери списком». → **Потік 2, крок 10.**

## 4. 🔴 `ads` — публічні телефон, пошта, сума оплати

Колонки `client_name`, `client_email`, `client_phone`, `paid_amount` входять у
публічно читаний рядок. Рядків зараз 0, тож витоку немає — але перший платний
рекламодавець злив би контакти і суму.

Таблицю **не читає ніхто**: 0 входжень у `src/` і в `admin.html`.
→ **Потік 1, крок 4.**

## 5. 🟡 `page_reactions.user_id` — видно, хто лайкнув

`"preact read" USING (true)`, у рядку — справжній `auth.uid()`. У парі з
публічною `get_avatars()` це дає сторонньому граф «ім'я + фото → що вподобав».

⚠️ Закрити таблицю «в лоб» **не можна**: клієнт читає її напряму
(`src/core/supabase.js:1450`) і має живу підписку (`:1359`); realtime поважає
RLS → лічильник перестане оновлюватись, гість побачить 0 лайків.
→ **Потік 2, крок 9.**

## 6. 🔴 Підробка автора (identity spoofing)

Політики перевіряють `owner_uid` / `sender_uid`, але **денормалізовані колонки
з іменем не перевіряє ніхто**:

| таблиця | колонка | хто побачить підробку |
|---|---|---|
| `posts` | `author` | всі (публічне читання) |
| `comments` | `author` | всі (публічне читання) |
| `threads` | `author_name`, `buyer_name` | співрозмовник |
| `chat_group_members` | `name` | учасники групи |

Залогінений може звернутись до PostgREST **повз застосунок** і вставити
`author: 'Вова · Адміністрація'`. Для `posts` з `type='chat'` (Обговорення)
політика дозволяє одразу `status='published'` — тобто підробка з'явиться
опублікованою, без модерації.

`sync_profile_denorm` не рятує: він переписує ім'я **лише коли людина змінює
його у профілі**, на вставку не діє.

📐 На живих даних розходжень `author` ↔ `profiles.name` **нуль**
(`mismatch = 0` по всіх 27 постах) — тобто серверний тригер нічого не зламає.
→ **Потік 1, крок 3.**

---

## 7. Карта RPC-поверхні (51 функція)

### 7.1 Викличні функції без жодного сторожа, доступні аноніму

| функція | пише | вердикт |
|---|---|---|
| `heal_orphan_page_comments()` | **так** | 🔴 службова, застосунок не кличе → відібрати |
| `flush_page_comment_push()` | смикає Edge-функцію | 🔴 службова, застосунок не кличе → відібрати |
| `get_avatars(uuid[])` | ні | ✅ публічна за задумом; ⚠️ немає стелі на довжину масиву |
| `get_public_profile(uuid)` | ні | ✅ публічна за задумом, білий список полів |

### 7.2 Зі сторожем усередині (WARN радника — хибна тривога)

`is_admin` · `is_team_member` · `has_editor_perm` · `can_edit_page` ·
`can_manage_page` · `is_group_member` — предикати, які кличе сама RLS; право
виконання аноніму **потрібне**, інакше політики впадуть.

`admin_create_community` · `admin_find_uid_by_email` · `admin_page_owners` ·
`admin_profile_stats` — усі чотири піднімають `NOT_ADMIN` / повертають
`{"error":"not admin"}` без прав. Перевірено читанням тіл.

`submit_board_post` · `bump_post` · `close_post` · `delete_my_post` ·
`restore_post` · `create_group` · `join_group_by_token` · `leave_group` ·
`approve_member` · `reject_member` · `transfer_group_owner` ·
`create_group_invite` — звіряються з `auth.uid()`, для аноніма безпечно нічого
не роблять.

### 7.3 Аноніма вже відібрано раніше (прецедент)

`add_page_moderator` · `list_page_moderators` · `remove_page_moderator` ·
`update_board_post` — `anon_exec = false`. Крок 5 робить те саме для двох
службових функцій.

### 7.4 Тригерні функції — 17 шт., **не є RPC**

`sync_profile_denorm`, `notify_new_page_post`, `touch_thread_on_message`,
`cascade_soft_delete_replies` та ін. Postgres не дає викликати їх через
PostgREST («trigger functions can only be called as triggers»).
🛑 **Не «виправляти» їх заради нуля WARN у раднику.**

### 7.5 Без `set search_path` — 7 шт.

`text_norm_cyr` · `text_norm_lat` · `text_abuse_reason` · `comments_antispam` ·
`page_comments_antispam` · `ad_reports_guard_update` · `set_bumped_on_publish`

Жодна **не** `SECURITY DEFINER`, тож ризик підміни функції низький. Лікування
дешеве → крок 6.

---

## 8. Радник Supabase: 88 WARN + 1 INFO — розбір

| скільки | що | дія |
|---|---|---|
| 13 | тригерні `SECURITY DEFINER` | нічого (п. 7.4) |
| ~63 | функції зі сторожем усередині | нічого (п. 7.2) |
| 2 | службові без сторожа | крок 5 |
| 7 | мутабельний `search_path` | крок 6 |
| 1 | `chat_group_invites`: RLS увімкнено, політик 0 | **безпечно** — таблиця замкнена для всіх крім `service_role`; перевірити, що запрошення працюють (потік 2, крок 13) |
| 1 | «Leaked password protection disabled» | неактуально — вхід лише через Google, паролів немає |

🛑 **Мета проходу — коректна модель доступу, а не нуль WARN у раднику.**

---

## 9. Дрейф прода і файлів

`get_public_profile` у проді віддає **6** полів; файл
`scripts/supabase_public_profile.sql` описує **8** (`bio`, `age`). Оновлення
від 15.07 у базу не доїхало. Не безпека — але картка профілю не показує
«Про себе» і вік. → Потік 2, крок 12.
