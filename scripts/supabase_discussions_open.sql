-- ── Обговорення БЕЗ людської модерації (одразу published) ──────────────────
-- Проблема: політика «Anyone can submit a pending post» пускає лише status='pending'
--   → обговорення (type='chat') не показувались, поки адмін не схвалить.
-- Рішення: окрема INSERT-політика — ЗАЛОГІНЕНИЙ житель створює обговорення ОДРАЗУ
--   published (лише під своїм owner_uid). Оголошення (type='board') лишаються на
--   модерації через стару політику. Матюки/образи блокуються на клієнті.
--
-- Безпека: писати може лише authenticated (гість — тільки читати, як домовлено).
--   owner_uid = auth.uid() → не можна створити від чужого імені.
--
-- Запустити ОДИН раз у Supabase → SQL Editor (робить Вова). Безпечно повторно.

DROP POLICY IF EXISTS "Logged-in can post a discussion" ON public.posts;
CREATE POLICY "Logged-in can post a discussion"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (
    type = 'chat'
    AND status = 'published'
    AND owner_uid = auth.uid()
  );

-- Примітка: кілька permissive INSERT-політик обʼєднуються через OR — стара
-- «pending post» (оголошення) і ця нова (обговорення) працюють паралельно.
