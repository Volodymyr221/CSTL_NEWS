-- ── Запрошення редакторів ПО ПОШТІ (системно, на майбутнє) ──────────────────
-- Проблема: editor_users прив'язаний до uid, який зʼявляється лише ПІСЛЯ входу.
-- Рішення: таблиця editor_invites (по пошті, до входу) + тригер, що при появі
-- auth-користувача з такою поштою САМ робить його редактором. Плюс бекфіл для
-- тих, хто вже увійшов (напр. Алла, якщо вже створила акаунт).
--
-- Запустити ОДИН раз у Supabase → SQL Editor (робить Вова). Безпечно повторно.
-- Далі новий редактор = просто рядок у editor_invites (сама пошта).

-- 1) Таблиця запрошень (email — ключ; дозволи наперед).
CREATE TABLE IF NOT EXISTS public.editor_invites (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  can_create  BOOLEAN DEFAULT TRUE,
  can_publish BOOLEAN DEFAULT FALSE,
  can_events  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.editor_invites ENABLE ROW LEVEL SECURITY;

-- Керують лише адміни (як editor_users).
DROP POLICY IF EXISTS editor_invites_admin ON public.editor_invites;
CREATE POLICY editor_invites_admin ON public.editor_invites
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2) Функція лінкування: коли зʼявляється користувач із запрошеною поштою —
--    робимо його редактором і прибираємо використане запрошення.
CREATE OR REPLACE FUNCTION public.link_editor_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.editor_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.editor_invites
    WHERE lower(email) = lower(NEW.email);
  IF FOUND THEN
    INSERT INTO public.editor_users (uid, email, name, can_create, can_publish, can_events)
    VALUES (NEW.id, NEW.email, inv.name, inv.can_create, inv.can_publish, inv.can_events)
    ON CONFLICT (uid) DO UPDATE SET
      can_create  = EXCLUDED.can_create,
      can_publish = EXCLUDED.can_publish,
      can_events  = EXCLUDED.can_events;
    DELETE FROM public.editor_invites WHERE email = inv.email;
  END IF;
  RETURN NEW;
END $$;

-- 3) Тригер на створення auth-користувача (перший вхід через Google).
DROP TRIGGER IF EXISTS trg_link_editor_invite ON auth.users;
CREATE TRIGGER trg_link_editor_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_editor_invite();

-- 4) ЗАПРОСИТИ АЛЛУ (підстав її пошту). Права: створювати+публікувати+події.
--    ⚠️ Має йти ПЕРЕД бекфілом (крок 5), щоб залінкувало її в цей же запуск,
--    якщо вона вже створила акаунт.
INSERT INTO public.editor_invites (email, name, can_create, can_publish, can_events)
VALUES ('allamatishchuk@gmail.com', 'Алла', TRUE, TRUE, TRUE)
ON CONFLICT (email) DO NOTHING;

-- 5) БЕКФІЛ: запрошені, хто вже увійшов (напр. Алла) — залінкувати зараз.
--    Хто ще не входив — залінкується автоматично тригером при першому вході.
INSERT INTO public.editor_users (uid, email, name, can_create, can_publish, can_events)
SELECT u.id, u.email, i.name, i.can_create, i.can_publish, i.can_events
FROM public.editor_invites i
JOIN auth.users u ON lower(u.email) = lower(i.email)
ON CONFLICT (uid) DO NOTHING;

DELETE FROM public.editor_invites i
USING auth.users u
WHERE lower(u.email) = lower(i.email);
