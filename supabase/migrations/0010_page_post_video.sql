-- 0010_page_post_video.sql — ВІДЕО В ДОПИСАХ СПІЛЬНОТ.
-- Накочено 12.10.2026 (потік /byyou «відео», крок 1; «ок» Вови того ж дня).
-- ⚠️ Накат ЧАСТИНАМИ, кожна окремим запитом з `set lock_timeout = '3s'`: файл одним
-- запитом завис (таймаут MCP 60 с) і відкотився цілком — той самий урок, що з
-- `threads` 07.10 (DROP POLICY висів на блокуванні storage.objects). Звірено одразу:
-- колонка jsonb є, сховище 50 МБ/відео, три політики (INSERT/SELECT/DELETE).
--
-- 🗣️ Замовлення Вови: «добавити можливість публікації відео в вкладку «стрічка» в
-- спільноти… щоб без лагів».
--
-- 📐 ЩО БУЛО НА ПРОДІ ДО НАКАТУ (заміряно 12.10):
--   • `page_posts` — колонки під відео немає;
--   • сховище `community-photos` — ліміт 5 МБ і ЛИШЕ jpeg/png/webp: ролик туди фізично
--     не ляже, а розширювати його небезпечно — вставка там відкрита БУДЬ-ЯКОМУ
--     залогіненому (так задумано для фото коментарів/оголошень).
--
-- 🔑 ТРИ РІШЕННЯ:
--   1. `video jsonb`, а не п'ять окремих колонок: { url, poster, w, h, dur, size, mime }.
--      Ролик у дописі ОДИН (фото АБО відео), і його поля завжди читаються разом —
--      окремі колонки дали б п'ять місць для розсинхрону без жодної вигоди.
--   2. Окреме сховище `community-videos`: 50 МБ (стеля безкоштовного тарифу на файл),
--      лише відео-формати. Публічне — як і фото спільнот: читається прямим посиланням,
--      без підпису, тож браузер і CDN віддають його шматками (Range) без нашої участі.
--   3. ВСТАВКА — лише редакторам тієї сторінки, в чию теку пишемо (`<page_id>/…`).
--      Відео — це сотні МБ потенційного сміття; «будь-хто залогінений» тут неприйнятно.
--      Перевіряє та сама `can_edit_page()`, що й RLS самих дописів — одне правило.
--
-- ⚠️ Обкладинка (кадр JPEG) лягає в наявне `community-photos` — це звичайне фото.

alter table public.page_posts add column if not exists video jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-videos', 'community-videos', true, 52428800,
        array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Page editors upload videos" on storage.objects;
create policy "Page editors upload videos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-videos'
    and (storage.foldername(name))[1] ~ '^[0-9]+$'
    and public.can_edit_page(((storage.foldername(name))[1])::bigint)
  );

-- Власник бачить свій щойно завантажений об'єкт (потрібно відповіді upload; той самий
-- прийом, що «Owner reads own community photos»). Публічне читання йде повз RLS.
drop policy if exists "Owner reads own community videos" on storage.objects;
create policy "Owner reads own community videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'community-videos' and owner = auth.uid());

-- Прибрати ролик: автор файлу або адмін (як фото — «Admins can delete photos»).
drop policy if exists "Owner or admin deletes community videos" on storage.objects;
create policy "Owner or admin deletes community videos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community-videos' and (owner = auth.uid() or public.is_admin()));
