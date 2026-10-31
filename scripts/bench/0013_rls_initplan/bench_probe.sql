-- Що бачить кожен користувач. Вивід до і після міграції має збігтися байт у байт.
\pset format unaligned
\pset tuples_only on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claims', '{"email":"a@x.ua","role":"authenticated"}', true);
select 'A posts', string_agg(id::text, ',' order by id) from public.posts;
select 'A members', string_agg(page_id::text, ',' order by page_id) from public.members;
select 'A notes', string_agg(id::text, ',' order by id) from public.notes;
select 'A objects', string_agg(id::text, ',' order by id) from storage.objects;
with u as (update public.notes set email = email returning id) select 'A upd notes', string_agg(id::text, ',') from u;
with u as (update public.posts set published = published returning id) select 'A upd posts', string_agg(id::text, ',') from u;
with d as (delete from public.posts returning id) select 'A del posts', string_agg(id::text, ',') from d;
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claims', '{"email":"b@x.ua","role":"authenticated"}', true);
select 'B posts', string_agg(id::text, ',' order by id) from public.posts;
select 'B members', string_agg(page_id::text, ',' order by page_id) from public.members;
select 'B notes', string_agg(id::text, ',' order by id) from public.notes;
select 'B objects', string_agg(id::text, ',' order by id) from storage.objects;
with d as (delete from public.posts returning id) select 'B del posts', string_agg(id::text, ',') from d;
rollback;
-- вставка: своє проходить, чуже ні
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into public.posts values (10, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', true);
select 'A insert own ok';
rollback;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
\set ON_ERROR_STOP off
insert into public.posts values (11, '22222222-2222-2222-2222-222222222222', 'x', true);
rollback;
