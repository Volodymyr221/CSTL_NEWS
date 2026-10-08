-- ✅ НАКАТАНО 08.10.2026 (ALTER POLICY напряму, транзакційна перевірка нижче).
--
-- 🔴 «НАПИСАТИ ПРОДАВЦЮ» НЕ ПРАЦЮВАЛО З 25.09 НІ В КОГО.
-- Журнал збоїв 08.10: `42501 new row violates row-level security policy for table
-- "threads"`, 5 разів у Владислава. Останній тред у базі — 09.09, після 25.09 — нуль.
--
-- Причина: політика вставки треда звіряла автора так:
--   author_uid = (select owner_uid from posts where id = threads.post_id)
-- Підзапит усередині політики виконується З ПРАВАМИ ЛЮДИНИ. А 25.09 (міграція «Б»,
-- `supabase_post_contact.sql`) пряме читання `posts` звузили до ВЛАСНИХ рядків, щоб
-- телефон продавця не їхав у браузер; публічне читання пішло через `posts_public`.
-- Тож для покупця підзапит повертав NULL → `author_uid = NULL` → відмова завжди.
-- 📐 Доведено під роллю Владислава: via posts → null, via posts_public → автор.
--
-- Лікування: та сама звірка, але через вітрину `posts_public` (owner_uid там є, а
-- телефону немає). Побічно — тред можна відкрити лише на ОПУБЛІКОВАНОМУ й не
-- видаленому оголошенні, як і має бути.
-- ➡️ Правило класу: звужуєш читання таблиці — шукай політики ІНШИХ таблиць, що
--    читають її підзапитом (`pg_policies` where qual/with_check ilike '%from posts%').
--    08.10 таких було рівно одна — ця.

alter policy "buyer creates thread" on public.threads with check (
  buyer_uid = auth.uid()
  and author_uid = (select pp.owner_uid from public.posts_public pp where pp.id = threads.post_id)
  and author_uid is not null
  and author_uid <> auth.uid()
);

-- Перевірка (транзакція з відкатом, роль authenticated, sub = покупець):
--   законний покупець → OK · чужий author_uid → 42501 · підставний buyer_uid → 42501
