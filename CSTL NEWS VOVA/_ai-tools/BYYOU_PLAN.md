# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** active
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза · done=завершено -->

**Ціль:** Push-блок Дошки (зона Роми, Вова передав з аудиту Д-15). 4 баги: P-2 (фото-пуш падає), P-5 (чат не просить дозвіл), P-8 (нема in-app банера чату), P-9 (тап не відкриває конкретну розмову).
**Власник:** Рома · **Гілка:** `claude/new-session-3k5u9n` (не міняти) · **Rollback-tag:** `byyou-start-push`

> Попередній потік (Табло+карусель+контакти) — ВИКОНАНО й задеплоєно (PR #285, #293), архів `BYYOU_ARCHIVE_2026-07-09_tablo-carousel-contacts.md`.
> ⚠️ **ДЕПЛОЙ-ОБМЕЖЕННЯ:** P-2 живе в Edge Function `send-chat-push` — авто-деплою Edge Functions НЕМА (деплой ручний `supabase functions deploy`, Supabase MCP не авторизований). Тому **P-2 = код готую+комічу, жива публікація окремою авторизованою сесією** (як Б5). P-5/P-8/P-9 — фронт (site), деплою цю сесію нормально.

## Кроки
| # | Крок | Файл | Стан |
|---|------|------|------|
| 1 | P-2: Edge Function — `select` додати `photo_url`; `body = msg.text \|\| '📷 Фото'` (null-guard); payload `url` → `./#thread-<id>` (для P-9) | `supabase/functions/send-chat-push/index.ts` | 🟢 (деплой Supabase — окремо) |
| 2 | P-9: sw.js push-handler кладе `thread_id` у `notification.data`; notificationclick фокусує клієнт + postMessage `{__cstl:'open-thread', thread_id}` (працює з ЖИВИМ payload, який уже несе thread_id) | `sw.js` | 🟢 |
| 3 | P-9: застосунок слухає `open-thread` → відкриває конкретну розмову (реюз існуючого відкриття треда) | `src/core/messages-ui.js` (+app.js слухач) | 🟢 |
| 4 | P-8: in-app банер для чату коли додаток видимий (sw постить `__cstl:'push', pushType:'chat'`) — показати тост/банер + оновити бейдж | `src/core/messages-ui.js` / глобальний слухач | 🟢 |
| 5 | P-5: контекстний запит дозволу пуша в чаті (`registerChatPushDevice` — при відкритті розмови/після 1-го повідомлення викликати `Notification.requestPermission` по жесту, потім підписати) | `src/core/messages-ui.js` | 🟢 |
| 6 | node --check усіх .js + build (bundle) | — | 🟢 |
| 7 | Браузер-смоук (чат-екрани, банер, дозвіл) + /audit | — | 🟢 |
| 8 | CACHE bump + реліз-нотатки → показати Ромі | `sw.js` | 🟡 |
| 9 | БРАМА ДЕПЛОЮ: «деплой» → PR→squash→лічильник (фронт). P-2 Edge — інструкція Вові на `supabase functions deploy` | — | 🔴 |

## Де зупинились
Старт потоку. План складено, чекаю «ок» на брамі старту. Ще нічого не кодовано.

## Реліз-нотатки
(заповнити перед деплоєм)
