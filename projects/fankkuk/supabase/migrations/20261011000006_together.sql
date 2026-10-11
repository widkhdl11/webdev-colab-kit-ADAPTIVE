-- 2026-10-12 ○○님과 함께한 시간 · 팬이 올리는 선물 사진.
-- 스펙: together INV-F1~F6 (추가분 「팬·크리에이터 화면 기능」 F-7, 불변식 18·19·23, DECISIONS 2026-10-11 ⑫⑬⑭).
--
-- 1) together_counted(주문) — 함께한 선물로 세는 주문: 결제가 끝났고(등록 시각이 있다) 취소되지 않은 것. 거절·반려는 센다(팬이 보낸 마음의 기록).
--    결제 실패·결제 대기는 등록 시각이 없다. 기록 숫자·선물 카드·순번이 모두 이 판단 하나를 쓴다(INV-F3).
-- 2) 읽기 함수 둘 — 팬 ID 를 인자로 받지 않고 로그인 토큰의 계정 주문만 읽는다(INV-F1). 금액·시각 칸은 없고 날짜는 date 로만(INV-F6):
--    my_together(p_creator_id) — 크리에이터마다 함께한 선물 수·받은 답장 수(지우지 않은 답장)·처음 선물한 날(한국 시간)·며칠째(그날이 1일째).
--    my_together_gifts(p_creator_id) — 선물 카드 재료: 순번(결제한 순서)·등록 날짜·물품·기념일 표시·상자 수·결과·지나온 단계·승인 여부·출고 날짜·사진 판.
-- 3) gift_photos — 주문당 한 줄(주문 ID 가 기본 키). 경로 {팬 ID}/{주문 ID}/{무작위}.webp 와 판 번호. 화면 쪽 API 로 읽기·쓰기 불가(INV-F2).
--    my_gift_photo(p_order_no) — 본인 주문(취소 제외)이면 주문 ID·지금 경로·판. 서버가 올리기·지우기·서명 전에 주인 확인으로 부른다.
--    set_gift_photo·clear_gift_photo — 서버의 비밀 키로만 부른다. 경로가 그 주문의 팬·주문 폴더가 아니면 거부한다.
-- 4) 저장소 gift-photos — 비공개, webp 2MB 까지. 쓰기·읽기 정책을 두지 않는다 — 서버의 비밀 키만 쓰고, 읽기는 서버가 만든 짧은 서명 주소로만.
--
-- 다시 적용해도 결과가 같다(표는 if not exists, 함수는 create or replace, 버킷은 on conflict).

-- ── 1) 세는 주문 ──────────────────────────────────

create or replace function public.together_counted(p_registered_at timestamptz, p_status public.order_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_registered_at is not null and p_status <> 'canceled';
$$;

revoke all on function public.together_counted(timestamptz, public.order_status) from public, anon, authenticated;

-- ── 3) 사진 기록 표 — 선물 카드 읽기(2)가 사진 판을 읽으므로 읽기 함수보다 먼저 만든다 ──────────────────

create table if not exists public.gift_photos (
  order_id uuid primary key references public.orders (id) on delete cascade,
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table public.gift_photos enable row level security;
revoke all on public.gift_photos from anon, authenticated;

-- ── 2) 읽기 ──────────────────────────────────

-- INV-F1·F3·F6: 로그인한 사람이 선물한 크리에이터마다 기록 한 줄. p_creator_id 를 주면 그 크리에이터만. 최근에 선물한 크리에이터가 먼저.
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
         (select h.handle from public.creator_handles h where h.creator_id = c.id and h.retired_until is null),
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

-- INV-F1·F4·F6: 로그인한 사람이 그 크리에이터에게 보낸 선물 카드 재료, 최신이 먼저. 순번은 결제한 순서(같으면 주문번호 순).
-- 단계는 지나온 마지막 단계 — 받는 쪽 배송(수령·배송 중) → 출고 → 검수 통과 → 입고 → 등록 순으로 본다. 결과는 거절·반려·검수 반송·진행 중.
create or replace function public.my_together_gifts(p_creator_id uuid)
returns table (order_no text, gift_no integer, registered_on date, item_kind text, item_category text, anniversary_name text,
               box_count integer, outcome text, stage text, approved boolean, shipped_on date, has_photo boolean, photo_version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_no,
         (row_number() over (order by o.registered_at, o.order_no))::integer,
         public.receiving_today_at(o.registered_at),
         o.item_kind, o.item_category, o.anniversary_name,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         case when o.status = 'rejected' then 'declined'
              when o.status = 'expired' then 'expired'
              when o.inspection_result = 'returned' then 'returned'
              else 'in_progress' end,
         case when o.delivery = 'delivered' then 'delivered'
              when o.delivery = 'in_transit' then 'in_transit'
              when o.shipped_at is not null then 'shipped'
              when o.inspection_result = 'passed' then 'inspected'
              when o.received_at is not null then 'received'
              else 'registered' end,
         (o.approved_at is not null and o.status not in ('rejected', 'expired')),
         public.receiving_today_at(o.shipped_at),
         (g.order_id is not null),
         coalesce(g.version, 0)
  from public.orders o
  left join public.gift_photos g on g.order_id = o.id
  where o.fan_id = auth.uid()
    and o.creator_id = p_creator_id
    and public.together_counted(o.registered_at, o.status)
  order by o.registered_at desc, o.order_no desc;
$$;

revoke all on function public.my_together_gifts(uuid) from public, anon;
grant execute on function public.my_together_gifts(uuid) to authenticated;

-- ── 3) 사진 기록 ──────────────────────────────────

-- INV-F2: 본인 주문(취소 제외)의 사진 자리 — 주문 ID·지금 경로·판. 남의 주문·없는 주문은 빈 결과(있는지도 알리지 않는다).
-- 결제 대기 주문도 받는다 — 등록 화면이 등록 직후(결제 전) 사진을 올린다. 화면에 나오는 것은 함께한 선물로 세는 주문뿐이다.
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
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.status <> 'canceled';
$$;

revoke all on function public.my_gift_photo(text) from public, anon;
grant execute on function public.my_gift_photo(text) to authenticated;

-- INV-F2: 서버만 — 사진을 붙이거나 바꾼다. 경로는 그 주문의 팬·주문 폴더여야 한다. 옛 경로와 새 판 번호를 돌려준다(서버가 옛 파일을 지운다).
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
  select o.* into v_order from public.orders o where o.id = p_order_id and o.status <> 'canceled' for update;
  if not found then
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

-- INV-F2: 서버만 — 사진 기록을 지우고 옛 경로를 돌려준다(없으면 null).
create or replace function public.clear_gift_photo(p_order_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  delete from public.gift_photos g where g.order_id = p_order_id returning g.path;
$$;

revoke all on function public.set_gift_photo(uuid, text) from public, anon, authenticated;
revoke all on function public.clear_gift_photo(uuid) from public, anon, authenticated;
grant execute on function public.set_gift_photo(uuid, text) to service_role;
grant execute on function public.clear_gift_photo(uuid) to service_role;

-- ── 4) 사진 저장소 ──────────────────────────────────

-- 비공개, webp 2MB 까지. 쓰기·읽기 정책을 두지 않는다(서버의 비밀 키만 쓰고, 읽기는 서버가 만든 짧은 서명 주소로만).
-- 저장소 표가 아직 없으면(저장소 서비스 전) 건너뛴다 — 로컬은 supabase/config.toml 의 같은 버킷 설정이 만든다.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('gift-photos', 'gift-photos', false, 2097152, array['image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

notify pgrst, 'reload schema';
