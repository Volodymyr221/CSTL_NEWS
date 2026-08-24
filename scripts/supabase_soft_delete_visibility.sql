-- supabase_soft_delete_visibility.sql
-- 🔴 24.08.2026 — МʼЯКЕ ВИДАЛЕННЯ КОМЕНТАРЯ НЕ ПРАЦЮВАЛО ВЗАГАЛІ.
--
-- ЗНАЙШОВ ВОВА НА ПРОДІ: «написав відповідь на питання і не можу видалити»,
-- тост «❌ Не вдалося видалити: Текст порожній».
--
-- ═══ ДВА ШАРИ, І ДРУГИЙ ВАЖЛИВІШИЙ ══════════════════════════════════════════
--
-- ── ШАР 1 (той, що видно в тості) ───────────────────────────────────────────
-- Клієнт видаляв так: `update comments set deleted_at = now(), text = ''`.
-- Тригер `trg_comments_guard_update_antispam` (BEFORE UPDATE) каже «текст
-- змінився → прогнати антиспам», а порожній текст антиспам законно відхиляє.
-- 🔑 Тригер не відрізняв ВИДАЛЕННЯ від ПРАВКИ ТЕКСТУ.
--
-- ── ШАР 2 (справжня причина, видно лише виміром) ────────────────────────────
-- 🛑 Полагодити самий лише шар 1 було б МАРНО: видалення однаково не працює.
-- Доведено на живій базі (транзакція з rollback, підставлені роль
-- `authenticated` і JWT справжнього автора):
--     update … set author = author        → ПРОЙШЛО
--     update … set deleted_at = now()     → ВПАЛО, 42501 RLS
-- Тобто падає САМЕ `deleted_at`, а не текст.
--
-- Причина — політика **ЧИТАННЯ**: `comments read` вимагає `deleted_at is null`.
-- Ставлячи `deleted_at`, автор робить рядок невидимим ДЛЯ СЕБЕ, і RLS
-- відхиляє оновлення. Класична пастка «політика читання ламає запис» — та сама
-- сімʼя, що правило №11-БІС (там `INSERT … RETURNING`, тут звичайний `UPDATE`).
--
-- ── МАСШТАБ: ВРАЖЕНА НЕ ОДНА ПОВЕРХНЯ ───────────────────────────────────────
-- Перевірено кожну таблицю, чия SELECT-політика згадує `deleted_at`:
--   • `comments`      (Питання)  — ЗЛАМАНО; на це й скаржився Вова;
--   • `page_comments` (Стрічка)  — **ЗЛАМАНО ТАК САМО**, і про це ніхто не знав:
--                                  видалення коментаря в Стрічці падало мовчки;
--   • `page_posts`    (дописи)   — ПРАЦЮЄ.
--
-- 🔑 І саме `page_posts` дав готову відповідь: там правило написане так, що
-- **власник бачить свій рядок навіть видаленим**:
--     (p_deleted_at is null and p_status = 'published')
--       or public.can_edit_page(p_page_id) or public.is_admin()
-- Тобто зразок уже жив у проєкті — залишалось звести коментарі до нього.
--
-- ── ЩО ЗМІНЮЄМО ─────────────────────────────────────────────────────────────
-- Автор бачить СВІЙ коментар навіть після видалення. Це не витік: людина
-- бачить власні дані, а чужі видалені лишаються невидимими, як і були.
--
-- ⚠️ ПЕРЕВІРЕНО, ЩО НЕ ЛАМАЄ ЛІЧИЛЬНИК (це вже колись ламалось — баг B-27,
-- «картка писала 2 коментарі, а в листі був один»). Подання
-- `page_comment_counts` має `security_invoker = on`, тобто читає під правами
-- людини — але воно фільтрує `deleted_at is null` ЯВНО, в обох гілках рекурсії.
-- Тож ширша видимість на нього не впливає.
--
-- ⚠️ UI обох поверхонь ховає видалене САМ, за `deleted_at`:
-- `board-discussions.js` → `filter(c => !c.deleted_at)`;
-- `feed.js` → `if (c.deleted_at) { applyCommentRemove(c); return; }`.
-- Тобто людина нічого нового не побачить — запрацює лише саме видалення.
--
-- 🛑 ЧОМУ ПРАВКА В ПОЛІТИЦІ, А НЕ ВСЕРЕДИНІ `page_comment_visible_row`.
-- Ця функція відповідає на питання «чи цей коментар існує для ІНШИХ» — її
-- кличе `page_comment_visible(id)` при перевірці батьківського коментаря.
-- Питання «чи МЕНІ видно мій власний рядок» — інше, і змішати їх означало б
-- дозволити відповідати під чужим видаленим коментарем (саме звідти колись
-- бралися «сироти», B-27). Тому функція лишається незмінною.

-- ── 1. ПИТАННЯ / ДОШКА (`comments`) ─────────────────────────────────────────
drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments
  for select
  using (
    ((deleted_at is null) or public.is_admin() or sender_uid = auth.uid())
    and public.post_visible(post_id)
  );

-- ── 2. СТРІЧКА (`page_comments`) ────────────────────────────────────────────
drop policy if exists "pcom read" on public.page_comments;
create policy "pcom read" on public.page_comments
  for select
  using (
    public.page_comment_visible_row(deleted_at, post_id)
    or author_uid = auth.uid()
  );

-- ── 3. ТРИГЕР: момент видалення — не правка тексту ──────────────────────────
-- Шар 1. Потрібен навіть після виправлення політик: клієнта можна обійти, а
-- тригер, який падає на законній дії, лишається вадою бази.
--
-- 🔴 ОКРЕМА ЗНАХІДКА 24.08: цього тригера НЕ БУЛО В ЖОДНОМУ SQL-ФАЙЛІ
-- репозиторію. Він живе в базі з 25.07 (міграція
-- `comment_edit_support_and_antispam_on_update`), і `CLAUDE.md` її навіть
-- називає — але у файл `supabase_comment_guard.sql` поклали лише частину про
-- `page_comments`. Половина накоченого існувала ВИКЛЮЧНО в базі, тож прочитати
-- правило, не спитавши прод, було неможливо. Тому діагноз і починався з
-- `pg_trigger`, а не з `grep`. Правило №11 стосується схеми теж.
create or replace function public.comments_guard_update_antispam()
returns trigger language plpgsql as $$
declare
  reason text;
begin
  if auth.uid() is null then return new; end if;

  -- Момент видалення: рядок цим самим оператором стає невидимим для інших,
  -- перевіряти в ньому нема чого. Умова навмисно ВУЗЬКА (`old.deleted_at is
  -- null`) — щоб не відкрити шлях «поклав брудний текст у видалений рядок,
  -- потім зняв deleted_at»: заборони відновлення на `comments` немає.
  if new.deleted_at is not null and old.deleted_at is null then
    return new;
  end if;

  if new.text is distinct from old.text then
    reason := public.text_abuse_reason(new.text);
    if reason is not null then
      raise exception 'antispam: %', reason using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- ── ЯК ПЕРЕВІРИТИ (транзакція з відкатом) ───────────────────────────────────
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<uid автора>","role":"authenticated"}';
--     update public.comments      set deleted_at = now() where id = <свій>;  -- має пройти
--     update public.page_comments set deleted_at = now() where id = <свій>;  -- має пройти
--   rollback;
