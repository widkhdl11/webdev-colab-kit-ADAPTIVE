-- 2026-10-12 함께한 시간 리뷰 반영 — 20261011000006_together.sql 을 고친다(이미 적용한 파일은 그대로 둔다).
-- 스펙: together INV-F2(사진은 그 팬만 · 지울 수 없는 사진이 남지 않게)·INV-F5(크리에이터 페이지와 같은 판정).
--
-- 1) 끝난 주문의 사진 — 취소됐거나, 결제가 실패했거나, 결제하지 않은 채 24시간이 지난 주문(gift_photo_order_dead).
--    이런 주문의 사진은 팬 화면 어디에도 나오지 않아 팬이 보지도 지우지도 못한다. 그래서
--    · my_gift_photo·set_gift_photo 가 끝난 주문을 받지 않는다(새로 붙이지 않는다).
--    · sweep_gift_photos 가 끝난 주문의 사진 기록을 지우고, 저장소에서 지울 파일 경로를 돌려준다(서버가 예약 실행 때 부른다).
-- 2) 지울 파일 목록 gift_photo_trash — 사진 기록 줄이 지워지거나(주문 줄을 지워 같이 지워질 때 포함) 경로가 바뀌면
--    줄 지킴이가 옛 경로를 여기 넣는다. 저장소 파일은 DB 에서 지울 수 없어(저장소 API 로만) 서버가 이 목록을 읽어 지우고
--    gift_photo_trash_done 으로 목록에서 뺀다. 서버가 바로 지운 파일이 목록에 남아 있어도 다시 지우기만 한다(없는 파일 지우기는 오류가 아니다).
-- 3) my_together — 본인 확인 전 크리에이터는 링크 주소를 비운다. 링크 주소 찾기(resolve_creator_handle)가 본인 확인된 크리에이터만
--    찾으므로, 주소를 실어 보내면 「내 선물」의 줄이 없는 페이지로 간다. 비우면 ID 주소로 간다.
-- 4) my_follows_creator(p_creator_id) — 로그인한 사람이 그 크리에이터를 팔로우하는지 하나만(팔로우 목록 전체를 읽지 않는다).
--
-- 다시 적용해도 결과가 같다(표는 if not exists, 함수는 create or replace, 줄 지킴이는 지우고 다시).

-- ── 1) 끝난 주문 ──────────────────────────────────

-- 사진을 둘 수 없는 주문 — 취소 · 첫 결제 실패 · 결제하지 않은 채 24시간(결제사 확인 중인 결제는 기다린다).
create or replace function public.gift_photo_order_dead(p_order_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select o.status = 'canceled'
        or (o.status = 'pending_payment' and (
              exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'initial' and p.status = 'failed')
              or (o.created_at < now() - interval '24 hours'
                  and not exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'initial' and p.status in ('confirming', 'done')))))
    from public.orders o where o.id = p_order_id), true);
$$;

revoke all on function public.gift_photo_order_dead(uuid) from public, anon, authenticated;

-- INV-F2: 본인 주문(끝나지 않은 것)의 사진 자리. 남의 주문·없는 주문·끝난 주문은 빈 결과.
create or replace function public.my_gift_photo(p_order_no text)
returns table (order_id uuid, photo_path text, photo_version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, g.path, coalesce(g.version, 0)
  from public.orders o
  left join public.gift_photos g on g.order_id = o.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and not public.gift_photo_order_dead(o.id);
$$;

revoke all on function public.my_gift_photo(text) from public, anon;
grant execute on function public.my_gift_photo(text) to authenticated;

-- INV-F2: 서버만 — 사진을 붙이거나 바꾼다. 끝난 주문이면 P0002. 경로는 그 주문의 팬·주문 폴더여야 한다.
create or replace function public.set_gift_photo(p_order_id uuid, p_path text)
returns table (old_path text, version integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_order public.orders;
  v_old public.gift_photos;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found or public.gift_photo_order_dead(p_order_id) then
    raise exception '사진을 붙일 주문이 없다' using errcode = 'P0002';
  end if;
  if p_path is null or p_path !~ ('^' || v_order.fan_id::text || '/' || v_order.id::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception '그 주문의 사진 경로가 아니다' using errcode = '22023';
  end if;
  select g.* into v_old from public.gift_photos g where g.order_id = p_order_id;
  insert into public.gift_photos as g (order_id, path, version, updated_at)
  values (p_order_id, p_path, 1, now())
  on conflict on constraint gift_photos_pkey do update set path = excluded.path, version = g.version + 1, updated_at = now();
  return query select v_old.path, g.version from public.gift_photos g where g.order_id = p_order_id;
end $fn$;

revoke all on function public.set_gift_photo(uuid, text) from public, anon, authenticated;
grant execute on function public.set_gift_photo(uuid, text) to service_role;

-- ── 2) 지울 파일 목록 ──────────────────────────────────

create table if not exists public.gift_photo_trash (
  path text primary key,
  queued_at timestamptz not null default now()
);

alter table public.gift_photo_trash enable row level security;
revoke all on public.gift_photo_trash from public, anon, authenticated;

create or replace function public.gift_photos_to_trash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or old.path is distinct from new.path then
    insert into public.gift_photo_trash (path) values (old.path) on conflict (path) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists gift_photos_to_trash on public.gift_photos;
create trigger gift_photos_to_trash after delete or update of path on public.gift_photos
  for each row execute function public.gift_photos_to_trash();

-- 서버만(예약 실행) — 끝난 주문의 사진 기록을 지우고(줄 지킴이가 지울 목록에 넣는다), 지울 목록에서 오래된 것부터 p_limit 개.
create or replace function public.sweep_gift_photos(p_limit integer)
returns table (path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit 는 1~1000' using errcode = '22023';
  end if;
  delete from public.gift_photos g where public.gift_photo_order_dead(g.order_id);
  return query select t.path from public.gift_photo_trash t order by t.queued_at, t.path limit p_limit;
end $$;

-- 서버만 — 저장소에서 지운 경로를 목록에서 뺀다. 뺀 수를 돌려준다.
create or replace function public.gift_photo_trash_done(p_paths text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.gift_photo_trash t where t.path = any (coalesce(p_paths, '{}')) returning 1)
  select count(*)::integer from gone;
$$;

revoke all on function public.sweep_gift_photos(integer) from public, anon, authenticated;
revoke all on function public.gift_photo_trash_done(text[]) from public, anon, authenticated;
grant execute on function public.sweep_gift_photos(integer) to service_role;
grant execute on function public.gift_photo_trash_done(text[]) to service_role;

-- ── 3) 기록 한 줄 — 본인 확인 전 크리에이터는 링크 주소를 비운다 ──────────────────────────────────

create or replace function public.my_together(p_creator_id uuid default null)
returns table (creator_id uuid, creator_name text, creator_handle text, creator_photo_path text,
               gift_count integer, reply_count integer, first_gift_on date, day_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select o.id, o.creator_id, o.registered_at
    from public.orders o
    where o.fan_id = auth.uid()
      and public.together_counted(o.registered_at, o.status)
      and (p_creator_id is null or o.creator_id = p_creator_id)
  ), per as (
    select m.creator_id,
           count(*)::integer as gift_count,
           min(m.registered_at) as first_at,
           max(m.registered_at) as last_at,
           (select count(*)::integer from public.gift_replies r
             where r.order_id in (select x.id from mine x where x.creator_id = m.creator_id)
               and r.phrase is not null and r.deleted_at is null) as reply_count
    from mine m
    group by m.creator_id
  )
  select p.creator_id, c.name,
         case when c.identity_verified then
           (select h.handle from public.creator_handles h where h.creator_id = c.id and h.retired_until is null) end,
         c.photo_path,
         p.gift_count, p.reply_count,
         public.receiving_today_at(p.first_at),
         (public.receiving_today() - public.receiving_today_at(p.first_at) + 1)::integer
  from per p
  join public.creators c on c.id = p.creator_id
  order by p.last_at desc, p.creator_id;
$$;

revoke all on function public.my_together(uuid) from public, anon;
grant execute on function public.my_together(uuid) to authenticated;

-- ── 4) 팔로우 하나 확인 ──────────────────────────────────

create or replace function public.my_follows_creator(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.follows f where f.fan_id = auth.uid() and f.creator_id = p_creator_id);
$$;

revoke all on function public.my_follows_creator(uuid) from public, anon;
grant execute on function public.my_follows_creator(uuid) to authenticated;

notify pgrst, 'reload schema';
