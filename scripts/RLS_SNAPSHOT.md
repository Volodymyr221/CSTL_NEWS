# RLS — ЗЛІПОК ЖИВИХ ПОЛІТИК (13.08.2026)

> Вивантажено з продової бази `uabyfecseqnemvcqhdem` під час безпекового аудиту.
> **Це знімок стану, а не міграція** — накатувати його не треба й не можна.

## Навіщо цей файл

Політики RLS (Row Level Security — правила «хто які рядки бачить», діють на боці
сервера) — це **єдиний рубіж захисту даних** у цьому проєкті. Свого бекенду немає:
застосунок — статика на GitHub Pages, ключ у `bundle.js` публічний за призначенням,
тож усе, що стоїть між чужою людиною і приватним листуванням, — оці правила.

🔴 **До 13.08 вони жили ТІЛЬКИ в базі.** Наслідки, кожен реальний:
- аудит по коду був неможливий — довелось лізти в прод, щоб побачити правила;
- зміну політики не побачив би жоден код-рев'ю;
- після збою відновлювати нема з чого — правил немає в жодному файлі.

## ⚠️ Як це читати, щоб не злякатись даремно

**`qual = true` САМЕ ПО СОБІ нічого не означає — дивись колонку ролей.**
Під час аудиту я побачив `push_subscriptions | push_select | SELECT | true` і
вирішив, що будь-хто читає чужі push-підписки (там `endpoint`, ключі шифрування,
маршрут і час поїздки). Перевірка ролей показала `{service_role}` — тобто правило
лише для сервера, а не для людей. **Хибна тривога, спіймана до того, як стала
«знахідкою».** Дивись `roles` завжди.

## Стан на момент зліпка

- **Жодної таблиці без RLS** у схемі `public`.
- `chat_group_invites` — RLS увімкнено, політик **нуль**: заборонено всім, доступ
  тільки через `SECURITY DEFINER`-функції. Це навмисне звуження, не недогляд.
- Приватне листування закрите **двома шарами**: політика вирішує, ХТО торкається
  рядка (`threads`/`messages` — лише учасники), тригер `messages_guard_own_edit` —
  ЯКІ поля (чуже повідомлення не відредагуєш).
- `threads INSERT` бере `author_uid` **з поста**, а не з того, що надіслав клієнт.

## Як оновити зліпок

```sql
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Сторож `scripts/test_rls_snapshot.py` звіряє список нижче з диском і падає, коли
в базі з'явилась/зникла політика, а файл не оновили.

---

## Політики (таблиця · назва · дія · для ролей)

_Формат: `таблиця | політика | дія | ролі`. Умови (`qual` / `with_check`) —
у розділі нижче, для тих, де вони не тривіальні._

```
ad_events              | Admins can read ad events        | SELECT | is_admin()
ad_events              | Anyone can log ad events         | INSERT | true
ad_reports             | ad_reports admin delete          | DELETE | is_admin()
ad_reports             | ad_reports admin read            | SELECT | is_admin()
ad_reports             | ad_reports admin update          | UPDATE | is_admin()
ad_reports             | ad_reports insert own            | INSERT | reporter_uid = auth.uid()
admins                 | Admins manage admins             | ALL    | is_admin() + WITH CHECK is_admin()
admins                 | Admins read all admins           | SELECT | is_admin()
admins                 | Authenticated read own admin row | SELECT | email = auth.email()
ads                    | Admins manage ads                | ALL    | is_admin()
analytics_events       | Admins can read events           | SELECT | is_admin()
analytics_events       | Anyone can log an event          | INSERT | true
announcements          | Admins manage announcements      | ALL    | is_admin()
announcements          | Public can read published        | SELECT | status = 'published'
app_secrets            | service reads app secrets        | ALL    | auth.role() = 'service_role'
chat_group_members     | cgm_select                       | SELECT | uid = auth.uid() OR is_group_member(group_id)
chat_group_messages    | cgmsg_insert                     | INSERT | is_group_member(group_id) AND sender_uid = auth.uid()
chat_group_messages    | cgmsg_select                     | SELECT | is_group_member(group_id)
chat_group_messages    | cgmsg_update                     | UPDATE | sender_uid = auth.uid()
chat_groups            | cg_insert                        | INSERT | owner_uid = auth.uid()
chat_groups            | cg_select                        | SELECT | is_group_member(id) OR owner_uid = auth.uid()
chat_groups            | cg_update                        | UPDATE | owner_uid = auth.uid()
cms_articles           | cms_delete                       | DELETE | has_editor_perm('create') AND (author_uid = auth.uid() OR is_admin())
cms_articles           | cms_insert                       | INSERT | has_editor_perm('create') AND author_uid = auth.uid()
cms_articles           | cms_read_editors                 | SELECT | has_editor_perm('create')
cms_articles           | cms_update                       | UPDATE | has_editor_perm('create'); публікація вимагає has_editor_perm('publish')
comments               | Admins can delete comments       | DELETE | is_admin()
comments               | Auth post comment                | INSERT | sender_uid = auth.uid() AND довжина тексту 1..2000
comments               | Author deletes own comment       | DELETE | sender_uid = auth.uid()
comments               | Author updates own comment       | UPDATE | sender_uid = auth.uid()
comments               | Public can read comments         | SELECT | true
editor_invites         | editor_invites_admin             | ALL    | is_admin()
editor_users           | editor_users_admin_all           | ALL    | is_admin()
editor_users           | editor_users_read_self           | SELECT | uid = auth.uid()
messages               | msg participants read            | SELECT | учасник треду
messages               | msg participants write           | INSERT | sender_uid = auth.uid() AND учасник треду
messages               | msg recipient marks read         | UPDATE | учасник треду ⚠️ поля звужує тригер
page_admins            | padmins admin all                | ALL    | is_admin()
page_admins            | padmins read own                 | SELECT | uid = auth.uid() OR is_admin()
page_comment_push_log  | service manages comment push log | ALL    | service_role
page_comment_push_state| service manages comment push st. | ALL    | service_role
page_comment_reactions | pcomreact delete                 | DELETE | user_id = auth.uid() OR is_admin()
page_comment_reactions | pcomreact insert                 | INSERT | авторизований AND user_id = auth.uid()
page_comment_reactions | pcomreact read                   | SELECT | true
page_comments          | pcom insert                      | INSERT | author_uid = auth.uid(), 1..2000, згадка лише учасника поста
page_comments          | pcom read                        | SELECT | true
page_comments          | pcom update                      | UPDATE | автор OR is_admin() OR can_edit_page(...)
page_posts             | pposts insert                    | INSERT | can_edit_page(page_id) AND author_uid = auth.uid()
page_posts             | pposts read                      | SELECT | не видалений OR can_edit_page(page_id)
page_posts             | pposts update                    | UPDATE | can_edit_page(page_id)
page_push_log          | service manages page push log    | ALL    | service_role
page_reactions         | preact delete                    | DELETE | user_id = auth.uid() OR is_admin()
page_reactions         | preact insert                    | INSERT | авторизований AND user_id = auth.uid()
page_reactions         | preact read                      | SELECT | авторизований
page_reactions         | preact update                    | UPDATE | user_id = auth.uid()
page_subscriptions     | psub delete / insert / read      | -      | uid = auth.uid()
pages                  | pages admin delete / insert      | -      | is_admin()
pages                  | pages admin update               | UPDATE | is_admin() OR can_edit_page(id)
pages                  | pages read                       | SELECT | true
post_contact_views     | pcv admin read                   | SELECT | is_admin()
posts                  | Admins can delete / see / update | -      | is_admin()
posts                  | Logged-in can post a discussion  | INSERT | type='chat' AND status='published' AND owner_uid = auth.uid()
posts                  | Logged-in can submit pending     | INSERT | status='pending' AND owner_uid = auth.uid()
posts                  | Owner reads own posts            | SELECT | owner_uid = auth.uid()
posts                  | Public can read published posts  | SELECT | status = 'published'
profiles               | own profile insert/read/update   | -      | uid = auth.uid()
push_subscriptions     | push_select                      | SELECT | true ⚠️ але роль {service_role}
push_subscriptions     | push_insert/update/delete        | -      | user_uuid = auth.uid()
reactions              | Public can read reactions        | SELECT | true
reactions              | Auth insert/update/delete own    | -      | user_id = auth.uid()
saved_posts            | own saved manage                 | ALL    | uid = auth.uid()
thread_user_state      | own thread state / tus *         | -      | uid = auth.uid()
threads                | buyer creates thread             | INSERT | buyer_uid = auth.uid() AND author_uid береться З ПОСТА AND author_uid <> auth.uid()
threads                | thread participants read         | SELECT | auth.uid() = author_uid OR auth.uid() = buyer_uid
threads                | thread participants update       | UPDATE | учасник треду
user_push_devices      | own device manage                | ALL    | uid = auth.uid()
user_push_devices      | service reads devices            | SELECT | service_role
```

**Разом на 13.08.2026: 90 політик.**
