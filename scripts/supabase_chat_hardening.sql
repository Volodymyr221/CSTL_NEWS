-- supabase_chat_hardening.sql
-- Пакет 1 аудиту чату (23.06.2026): надійна відправка + сортування розмов.
-- Запусти у Supabase → SQL Editor (проект Olyka Castle: uabyfecseqnemvcqhdem).
-- Зміни АДИТИВНІ й безпечні: нова колонка + тригер. Нічого не видаляє.

-- 1) client_tag — клієнтський ключ (uuid) для реконсиляції оптимістичних
--    повідомлень. Усуває дублі, коли realtime INSERT свого ж повідомлення
--    приходить раніше/пізніше за await-відповідь (баг «одне фото = два повідомлення»).
alter table public.messages add column if not exists client_tag uuid;

-- 2) Тригер: атомарно оновлювати час+прев'ю останнього повідомлення треда при
--    кожному новому повідомленні. Раніше це робив лише клієнт у sendMessage()
--    (ненадійно — могло не дослатись). Тепер гарантовано на рівні БД, тож список
--    «Повідомлення» завжди має правильний last_message_at для сортування.
create or replace function public.touch_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.threads
     set last_message_at  = new.created_at,
         last_message_text = coalesce(
           nullif(new.text, ''),
           case when new.photo_url is not null then '📷 Фото' else '' end
         )
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_thread on public.messages;
create trigger trg_touch_thread
  after insert on public.messages
  for each row execute function public.touch_thread_on_message();

-- Перевірка (необов'язково): select column_name from information_schema.columns
--   where table_name='messages' and column_name='client_tag';
