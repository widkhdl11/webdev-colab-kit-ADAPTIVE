-- 2026-10-11 물품 종류 고정 목록 · 받기 어려운 품목.
-- 스펙: hard-items INV-H1~H8 (추가분 「팬·크리에이터 화면 기능」 F-3, DECISIONS 2026-10-11 ⑩).
--
-- 1) orders.item_category — 물품 종류 코드 여덟 가지(doll·flower·clothing·beauty·large·stationery·electronics·other). 이 기능 전 주문은 비어 있다.
--    item_kind(물품 이름)는 그대로 보여 주기용으로 계속 채운다 — 기타면 팬의 글(1~30자), 나머지는 종류 이름(INV-H1).
-- 2) creator_hard_items — 크리에이터당 설정 하나: 품목(종류 코드 1~8개)·이유·기간·끝나는 날·동작. 화면 쪽 API 로 읽기·쓰기 불가(INV-H3).
--    끝나는 날을 저장하고 읽을 때·등록할 때 한국 시간 오늘과 비교한다 — 예약 작업 없음(INV-H5, 받는 양 조절의 「다시 받는 날」과 같은 방식).
-- 3) 저장 함수 update_my_creator_hard_items — 크리에이터 ID 인자 없이 로그인 토큰의 계정에 연결된 크리에이터 한 줄만(INV-H3).
--    인자는 고르는 값 넷뿐이고 문장 칸이 없다(INV-H4). 품목이 비면 지운다.
-- 4) 읽기: my_creator_hard_items(본인 — 기간·끝나는 날 포함) · creator_hard_items(공개 — 품목·이유·동작만, INV-H6).
-- 5) register_order — 물품 종류 검사와 물품 이름 정하기(INV-H1) · 전자기기면 신고 켬(INV-H2) · 「등록 막기」 품목 거부(FKR03, INV-H7).
--    p_item_category 는 맨 뒤에 기본값 'other' 로 더했다 — 종류 없이 부르는 옛 호출(통합 시험 도우미)은 p_item_kind 를 기타 글로 친다.
--    앱은 늘 종류를 넘기고, 기타가 아니면 p_item_kind 를 비워 보낸다. 20261010000006 의 정의를 그대로 옮겨 고쳤다.
--
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 함수는 create or replace, 옛 register_order 는 drop if exists).

-- ── 1) 물품 종류 ──────────────────────────────────

alter table public.orders add column if not exists item_category text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_item_category_known') then
    alter table public.orders add constraint orders_item_category_known
      check (item_category in ('doll', 'flower', 'clothing', 'beauty', 'large', 'stationery', 'electronics', 'other'));
  end if;
end $$;

-- 종류 코드 → 화면 이름. 목록에 없으면 null. 화면 쪽 목록(entities/gift-item/model/item-category.ts)과 같은 이름이다.
create or replace function public.item_category_label(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'doll' then '인형·쿠션'
    when 'flower' then '꽃'
    when 'clothing' then '의류'
    when 'beauty' then '향수·화장품'
    when 'large' then '대형 물품'
    when 'stationery' then '문구'
    when 'electronics' then '전자기기'
    when 'other' then '기타'
  end;
$$;

-- 목록 순서 — 저장할 때 품목을 이 순서로 줄 세운다(공개 문구도 이 순서, INV-H6)
create or replace function public.item_category_order(p_category text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select array_position(array['doll', 'flower', 'clothing', 'beauty', 'large', 'stationery', 'electronics', 'other'], p_category);
$$;

-- ── 2) 받기 어려운 품목 설정 ──────────────────────────────────

create table if not exists public.creator_hard_items (
  creator_id uuid primary key references public.creators(id) on delete cascade,
  categories text[] not null check (
    cardinality(categories) between 1 and 8
    and array_position(categories, null) is null
    and categories <@ array['doll', 'flower', 'clothing', 'beauty', 'large', 'stationery', 'electronics', 'other']
  ),
  reason text not null check (reason in ('many', 'storage', 'away', 'none')),
  period text not null check (period in ('week1', 'week2', 'month1', 'manual')),
  ends_on date,
  action text not null check (action in ('notice', 'block')),
  updated_at timestamptz not null default now(),
  check ((period = 'manual') = (ends_on is null))
);
alter table public.creator_hard_items enable row level security;
revoke all on table public.creator_hard_items from anon, authenticated;

-- INV-H5: 저장한 날(한국 시간)부터 — 1주 +7일, 2주 +14일, 한 달은 달력의 한 달(1월 31일 → 2월 28일·29일). 직접 해제는 끝이 없다(null).
create or replace function public.hard_items_ends_on(p_period text, p_today date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_period
    when 'week1' then p_today + 7
    when 'week2' then p_today + 14
    when 'month1' then (p_today + interval '1 month')::date
  end;
$$;

-- INV-H5: 끝나는 날이 없거나 오늘보다 뒤면 살아 있다 — 끝나는 날 한국 시간 0시부터 없는 것
create or replace function public.hard_items_live(p_ends_on date, p_today date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_ends_on is null or p_ends_on > p_today;
$$;

revoke all on function public.item_category_label(text) from public, anon, authenticated;
revoke all on function public.item_category_order(text) from public, anon, authenticated;
revoke all on function public.hard_items_ends_on(text, date) from public, anon, authenticated;
revoke all on function public.hard_items_live(date, date) from public, anon, authenticated;

-- ── 3) 저장 함수 ──────────────────────────────────

-- INV-H3·H4·H5: 품목(종류 코드)·이유·기간·동작. 품목이 비면(빈 목록·null) 설정을 지운다. 다시 저장하면 그날부터 다시 센다.
create or replace function public.update_my_creator_hard_items(p_categories text[], p_reason text, p_period text, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_id uuid;
  v_clear boolean := p_categories is null or cardinality(p_categories) = 0;
  v_sorted text[];
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if not v_clear then
    -- INV-H4: 목록 안의 품목 1~8개, 같은 품목 두 번 없음
    if cardinality(p_categories) > 8 or array_position(p_categories, null) is not null
       or exists (select 1 from unnest(p_categories) as c where public.item_category_order(c) is null)
       or (select count(distinct c) from unnest(p_categories) as c) <> cardinality(p_categories) then
      raise exception '품목은 목록에서 겹치지 않게 1~8개다' using errcode = '22023';
    end if;
    if p_reason is null or p_reason not in ('many', 'storage', 'away', 'none') then
      raise exception '이유는 정해진 넷 중 하나다' using errcode = '22023';
    end if;
    if p_period is null or p_period not in ('week1', 'week2', 'month1', 'manual') then
      raise exception '기간은 정해진 넷 중 하나다' using errcode = '22023';
    end if;
    if p_action is null or p_action not in ('notice', 'block') then
      raise exception '동작은 안내만·등록 막기 중 하나다' using errcode = '22023';
    end if;
    select array_agg(c order by public.item_category_order(c)) into v_sorted from unnest(p_categories) as c;
  end if;

  -- INV-H7: 등록(register_order)이 같은 크리에이터 줄을 공유 잠금하므로, 저장과 등록은 서로 끝난 뒤의 상태를 본다
  select c.id into v_creator_id from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  if v_clear then
    delete from public.creator_hard_items h where h.creator_id = v_creator_id;
    return;
  end if;
  insert into public.creator_hard_items (creator_id, categories, reason, period, ends_on, action, updated_at)
  values (v_creator_id, v_sorted, p_reason, p_period, public.hard_items_ends_on(p_period, public.receiving_today()), p_action, now())
  on conflict (creator_id) do update
    set categories = excluded.categories, reason = excluded.reason, period = excluded.period,
        ends_on = excluded.ends_on, action = excluded.action, updated_at = excluded.updated_at;
end $$;

-- ── 4) 읽기 ──────────────────────────────────

-- 본인 — 로그인한 크리에이터의 살아 있는 설정만. 기간·끝나는 날은 여기에만 있다(INV-H6).
create or replace function public.my_creator_hard_items()
returns table (categories text[], reason text, period text, ends_on date, action text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.categories, h.reason, h.period, h.ends_on, h.action
  from public.creator_hard_items h
  join public.creators c on c.id = h.creator_id
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator' and public.hard_items_live(h.ends_on, public.receiving_today());
$$;

-- 공개 — 크리에이터 페이지·등록 화면이 읽는다. 본인 확인을 마친 크리에이터의 살아 있는 설정만, 품목·이유·동작만(INV-H6).
create or replace function public.creator_hard_items(p_ids uuid[])
returns table (id uuid, categories text[], reason text, action text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, h.categories, h.reason, h.action
  from public.creator_hard_items h
  join public.creators c on c.id = h.creator_id
  where c.identity_verified and c.id = any(p_ids) and public.hard_items_live(h.ends_on, public.receiving_today())
  order by c.created_at, c.id;
$$;

revoke all on function public.update_my_creator_hard_items(text[], text, text, text) from public, anon;
revoke all on function public.my_creator_hard_items() from public, anon;
revoke all on function public.creator_hard_items(uuid[]) from public;
grant execute on function public.update_my_creator_hard_items(text[], text, text, text) to authenticated;
grant execute on function public.my_creator_hard_items() to authenticated;
grant execute on function public.creator_hard_items(uuid[]) to anon, authenticated;

-- ── 5) register_order ──────────────────────────────────

drop function if exists public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text);

create or replace function public.register_order(p_fan_id uuid, p_creator_id uuid, p_order_no text, p_item_kind text, p_has_electronics_or_metal boolean, p_tiers public.parcel_tier[], p_toss_order_id text, p_goods_krw integer, p_service_fee_krw integer, p_inspection_fee_krw integer, p_shipping_fee_krw integer, p_amount_krw integer, p_anniversary_name text default null, p_item_category text default 'other')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
  v_role public.user_role;
  c record;
  v_today date := public.receiving_today();
  v_limit smallint;
  v_mark text;
  v_item_name text;
  v_metal boolean;
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  -- hard-items INV-H1: 물품 종류는 여덟 가지 중 하나. 기타면 1~30자 글이 물품 이름, 나머지는 글 없이 종류 이름이 물품 이름이다.
  if public.item_category_label(p_item_category) is null then
    raise exception '목록에 없는 물품 종류' using errcode = '22023';
  end if;
  if p_item_category = 'other' then
    v_item_name := public.app_trim(p_item_kind);
    if v_item_name is null or char_length(v_item_name) not between 1 and 30 then
      raise exception '기타 물품은 1~30자로 적는다' using errcode = '22023';
    end if;
  else
    if p_item_kind is not null then
      raise exception '기타가 아닌 물품 종류에는 글을 받지 않는다' using errcode = '22023';
    end if;
    v_item_name := public.item_category_label(p_item_category);
  end if;
  -- hard-items INV-H2: 전자기기를 고르면 신고를 켠다(팬이 「없어요」를 보내도)
  v_metal := coalesce(p_has_electronics_or_metal, false) or p_item_category = 'electronics';
  -- INV-K3: 등록하는 순간의 요금표로 계산한 금액과 칸마다 같아야 한다. 아니면 요금이 바뀐 것이다 — 다시 계산해 오게 한다.
  select * into c from public.fan_charge_of(p_tiers);
  if c.found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if p_goods_krw <> 0 or p_amount_krw <> c.total or p_shipping_fee_krw <> c.carrier or p_inspection_fee_krw <> c.inspection
     or p_service_fee_krw <> c.total - c.carrier - c.inspection then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_fan_id;
  if v_role is null or v_role not in ('fan', 'creator') then
    raise exception '선물을 보낼 수 있는 계정이 아니다' using errcode = '42501';
  end if;
  -- INV-V12: 받는 크리에이터 행을 공유 잠금 — 이사 신청(같은 행 for no key update)이 끝날 때까지 기다리고, 끝난 뒤의 상태로 판단한다
  -- creator-receiving INV-B2·B4: 받는 상태·한도 저장(같은 행 for no key update)도 이 잠금에서 줄을 선다
  -- hard-items INV-H7: 받기 어려운 품목 저장(같은 행 for no key update)도 이 잠금에서 줄을 선다
  perform 1 from public.creators cr where cr.id = p_creator_id for share;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if public.cv_moving(p_creator_id) then
    raise exception '채널 이사 중인 크리에이터라 지금은 선물을 등록할 수 없다' using errcode = 'FKV10';
  end if;
  -- creator-receiving INV-B2: 쉬는 중(다시 받는 날이 한국 시간 오늘보다 뒤)이면 새 주문을 만들지 않는다. 그날 0시부터는 받는다.
  if exists (select 1 from public.creators cr where cr.id = p_creator_id and cr.resume_on > v_today) then
    raise exception '잠시 선물 받기를 쉬는 크리에이터' using errcode = 'FKR01';
  end if;
  -- hard-items INV-H7: 살아 있는 설정이 「등록 막기」이고 고른 종류가 받기 어려운 품목에 있으면 만들지 않는다. 「안내만」·끝난 설정은 지나간다.
  if exists (select 1 from public.creator_hard_items h
              where h.creator_id = p_creator_id and h.action = 'block' and p_item_category = any(h.categories)
                and public.hard_items_live(h.ends_on, v_today)) then
    raise exception '받기 어려운 품목으로 등록을 막아 둔 크리에이터' using errcode = 'FKR03';
  end if;
  if v_role = 'creator' then
    if exists (select 1 from public.creators c2 where c2.id = p_creator_id and c2.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
  end if;
  -- INV-L9: 팬·크리에이터 모두 — 보내는 사람이 받는 크리에이터를 팔로우하고 있어야 한다
  if not exists (select 1 from public.follows f where f.fan_id = p_fan_id and f.creator_id = p_creator_id) then
    raise exception '팔로우한 크리에이터에게만 보낼 수 있다' using errcode = 'P0012';
  end if;
  -- INV-D7: 차단 쓰기와 같은 쌍 잠금을 잡고 확인한다 — 이 등록이 끝날 때까지 차단은 줄을 서고, 차단 뒤에는 이 확인이 막는다.
  -- 차단을 말하지 않고 본인 확인 전 크리에이터와 같은 오류를 낸다(카드 d26).
  -- creator-receiving INV-B4: 같은 쌍 잠금 안에서 세고 만든다 — 같은 팬의 동시 등록은 여기서 줄을 서서 앞 등록이 만든 주문을 센다.
  perform public.lock_sender_pair(p_creator_id, p_fan_id);
  if public.sender_blocked(p_creator_id, p_fan_id) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  select cr.monthly_fan_limit into v_limit from public.creators cr where cr.id = p_creator_id;
  if v_limit is not null and public.receiving_counted_orders(p_fan_id, p_creator_id) >= v_limit then
    raise exception '이번 달 한도에 닿았다' using errcode = 'FKR02';
  end if;
  -- creator-receiving INV-B9: 표시는 서버가 그날 다시 계산한다 — 그 크리에이터의 기념일 중 이름이 같고 D-7 ~ D-day 인 것만.
  -- 아니면 표시 없이 저장한다(거부하지 않는다). 이름은 지금 기념일 이름을 복사해 둔다.
  -- 이름은 지금 필터를 다시 거친다 — 저장 뒤 금칙어가 늘어 공개 읽기(creator_receiving)에서 빠진 이름은 표시로도 붙지 않는다.
  if p_anniversary_name is not null then
    select a.name into v_mark
    from public.creator_anniversaries a
    where a.creator_id = p_creator_id and a.name = public.app_trim(p_anniversary_name)
      and public.creator_tag_text_problem(a.name) is null
      and public.receiving_next_date(a.month, a.day, v_today) - v_today between 0 and 7
    order by a.position
    limit 1;
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, item_category, has_electronics_or_metal, anniversary_name)
  values (p_order_no, p_fan_id, p_creator_id, v_item_name, p_item_category, v_metal, v_mark)
  returning id into v_order_id;

  -- INV-M14: 상자마다 등록 순간의 요금(신고 구간)을 적는다. 합은 위에서 검사한 결제 금액과 같다(처리 끝에 DB 가 다시 확인).
  insert into public.boxes (order_id, seq, declared_tier, price_krw)
  select v_order_id, t.ord::smallint, t.tier, tp.price_krw
  from unnest(p_tiers) with ordinality as t(tier, ord)
  join public.tier_prices tp on tp.tier = t.tier;

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text) to service_role;
