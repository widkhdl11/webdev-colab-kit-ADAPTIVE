-- 관리자 화면 — 운영자 판정 · 대표 설정 · 요금표 · 요금 변경 기록 (admin-console INV-K1~K6).
-- 요금이 코드 상수에서 이 표로 옮겨 온다. 등록 함수는 앱이 보낸 금액을 이 표로 다시 계산해 맞지 않으면 거부한다(INV-K3).

-- ── 운영자·대표 판정 ─────────────────────────────────────

-- INV-K1: 운영자 = 로그인 토큰의 사람 ID 로 읽은 계정 역할이 operator. 역할을 바꾸는 함수는 없다.
create function public.is_operator()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'operator');
$$;

-- INV-K2: 대표 = 대표 설정 표(행 하나)에 적힌 운영자. 이 표를 바꾸는 함수·API 는 없다(마이그레이션·DB 에서만).
create table public.owner_setting (
  id boolean primary key default true check (id),
  owner_user_id uuid not null references public.profiles (id)
);
alter table public.owner_setting enable row level security;
revoke all on public.owner_setting from anon, authenticated;

create function public.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_operator() and exists (select 1 from public.owner_setting o where o.owner_user_id = auth.uid());
$$;

-- ── 요금표 ───────────────────────────────────────────────

-- INV-K4 (a)(b): 행마다. (c) 구간 사이 크기 순서는 아래 지연 검사가 처리 끝에 표 전체로 본다.
create table public.tier_prices (
  tier public.parcel_tier primary key check (tier in ('small', 'medium', 'large')),
  price_krw integer not null check (price_krw >= 1),
  carrier_cost_krw integer not null check (carrier_cost_krw >= 0),
  inspection_fee_krw integer not null check (inspection_fee_krw >= 0),
  constraint tier_prices_costs_within_price check (carrier_cost_krw + inspection_fee_krw <= price_krw)
);
alter table public.tier_prices enable row level security;
revoke all on public.tier_prices from anon, authenticated;

-- 첫 요금(payment INV-M1·M7, admin-console INV-K6)
insert into public.tier_prices (tier, price_krw, carrier_cost_krw, inspection_fee_krw) values
  ('small', 6900, 4000, 1500),
  ('medium', 8900, 5000, 2000),
  ('large', 10900, 6500, 2500);

-- INV-K4 (c): 받는 값·택배 원가·검수비 각각 소형 ≤ 중형 ≤ 대형, 세 구간이 모두 있다. 처리가 끝날 때 표 전체로 확인한다.
create function public.tier_prices_check_ascending()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  s public.tier_prices;
  m public.tier_prices;
  l public.tier_prices;
begin
  select * into s from public.tier_prices where tier = 'small';
  select * into m from public.tier_prices where tier = 'medium';
  select * into l from public.tier_prices where tier = 'large';
  if s.tier is null or m.tier is null or l.tier is null then
    raise exception '요금표에 소형·중형·대형이 모두 있어야 한다' using errcode = '22023';
  end if;
  if not (s.price_krw <= m.price_krw and m.price_krw <= l.price_krw
          and s.carrier_cost_krw <= m.carrier_cost_krw and m.carrier_cost_krw <= l.carrier_cost_krw
          and s.inspection_fee_krw <= m.inspection_fee_krw and m.inspection_fee_krw <= l.inspection_fee_krw) then
    raise exception '요금표는 소형 ≤ 중형 ≤ 대형이어야 한다' using errcode = '22023';
  end if;
  return null;
end $$;

create constraint trigger tier_prices_ascending
  after insert or update or delete on public.tier_prices
  deferrable initially deferred
  for each row execute function public.tier_prices_check_ascending();

-- ── 요금 변경 기록 (INV-K5) ──────────────────────────────

create table public.tier_price_changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  changed_by uuid not null references public.profiles (id),
  tier public.parcel_tier not null,
  field text not null check (field in ('price_krw', 'carrier_cost_krw', 'inspection_fee_krw')),
  before_krw integer not null,
  after_krw integer not null
);
alter table public.tier_price_changes enable row level security;
revoke all on public.tier_price_changes from anon, authenticated;

create function public.tier_price_changes_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '요금 변경 기록은 고치거나 지울 수 없다' using errcode = '42501';
end $$;

create trigger tier_price_changes_no_update before update on public.tier_price_changes
  for each row execute function public.tier_price_changes_append_only();
create trigger tier_price_changes_no_delete before delete on public.tier_price_changes
  for each row execute function public.tier_price_changes_append_only();

-- ── 읽기 ─────────────────────────────────────────────────

-- 요금은 공개 정보다(메인 요금표·선물 보내기 화면). 누구나 읽는다.
create function public.current_tier_prices()
returns table (tier text, price_krw integer, carrier_cost_krw integer, inspection_fee_krw integer)
language sql stable security definer set search_path = ''
as $$
  select tp.tier::text, tp.price_krw, tp.carrier_cost_krw, tp.inspection_fee_krw from public.tier_prices tp order by tp.tier;
$$;

-- INV-K1: 관리자 읽기는 운영자만 — 아니면 빈 결과
create function public.admin_tier_prices()
returns table (tier text, price_krw integer, carrier_cost_krw integer, inspection_fee_krw integer)
language sql stable security definer set search_path = ''
as $$
  select tp.tier::text, tp.price_krw, tp.carrier_cost_krw, tp.inspection_fee_krw
  from public.tier_prices tp where public.is_operator() order by tp.tier;
$$;

-- INV-K5 · INV-K8: 바꾼 사람은 닉네임으로만
create function public.admin_price_changes()
returns table (at timestamptz, changed_by_nickname text, tier text, field text, before_krw integer, after_krw integer)
language sql stable security definer set search_path = ''
as $$
  select c.at, p.nickname, c.tier::text, c.field, c.before_krw, c.after_krw
  from public.tier_price_changes c join public.profiles p on p.id = c.changed_by
  where public.is_operator()
  order by c.at desc, c.id desc;
$$;

-- ── 쓰기 ─────────────────────────────────────────────────

-- INV-K2·K4·K5: 대표만, 세 구간을 한 번에, 조건을 하나라도 어기면 통째로 거부, 바뀐 칸마다 기록.
create function public.admin_set_tier_prices(p_rows jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  v_tier public.parcel_tier;
  v_old public.tier_prices;
  v_new integer;
  v_field text;
begin
  if not public.is_owner() then
    raise exception '요금은 대표만 바꾼다' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) <> 3 then
    raise exception '요금표는 소형·중형·대형 세 줄이다' using errcode = '22023';
  end if;
  if (select count(distinct x ->> 'tier') from jsonb_array_elements(p_rows) x where x ->> 'tier' in ('small', 'medium', 'large')) <> 3 then
    raise exception '요금표는 소형·중형·대형 세 줄이다' using errcode = '22023';
  end if;
  -- INV-K4 (a): 칸은 세 개, 모두 정수(소수·문자 거부)
  if exists (
    select 1 from jsonb_array_elements(p_rows) x, unnest(array['price_krw', 'carrier_cost_krw', 'inspection_fee_krw']) f
    where jsonb_typeof(x -> f) is distinct from 'number' or (x ->> f)::numeric <> trunc((x ->> f)::numeric)
       or abs((x ->> f)::numeric) > 10000000
  ) then
    raise exception '요금은 정수여야 한다' using errcode = '22023';
  end if;

  -- 지금 값을 잠그고, 바뀐 칸만 기록하며 고친다
  perform 1 from public.tier_prices for update;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_tier := (r ->> 'tier')::public.parcel_tier;
    select * into v_old from public.tier_prices where tier = v_tier;
    foreach v_field in array array['price_krw', 'carrier_cost_krw', 'inspection_fee_krw'] loop
      v_new := (r ->> v_field)::integer;
      if v_new <> (to_jsonb(v_old) ->> v_field)::integer then
        insert into public.tier_price_changes (changed_by, tier, field, before_krw, after_krw)
        values (auth.uid(), v_tier, v_field, (to_jsonb(v_old) ->> v_field)::integer, v_new);
      end if;
    end loop;
    update public.tier_prices
    set price_krw = (r ->> 'price_krw')::integer,
        carrier_cost_krw = (r ->> 'carrier_cost_krw')::integer,
        inspection_fee_krw = (r ->> 'inspection_fee_krw')::integer
    where tier = v_tier;
  end loop;

  -- INV-K4 (c) 를 함수 안에서 바로 확인한다 — 지연 검사에만 맡기면 오류가 커밋 때 다른 꼴로 난다
  set constraints public.tier_prices_ascending immediate;
exception
  when check_violation then
    raise exception '요금표 조건을 어겼다' using errcode = '22023';
end $$;

revoke all on function public.is_operator() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.admin_tier_prices() from public, anon;
revoke all on function public.admin_price_changes() from public, anon;
revoke all on function public.admin_set_tier_prices(jsonb) from public, anon;
grant execute on function public.is_operator() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.admin_tier_prices() to authenticated;
grant execute on function public.admin_price_changes() to authenticated;
grant execute on function public.admin_set_tier_prices(jsonb) to authenticated;
grant execute on function public.current_tier_prices() to anon, authenticated, service_role;

-- ── 등록 함수: 금액을 요금표로 다시 계산한다 (INV-K3) ─────────

-- 상자 구간 목록의 팬 선물 금액(네 칸). 한 문장으로 읽어 두 요금이 섞이지 않는다. 모르는 구간이 있으면 found < n.
create function public.fan_charge_of(p_tiers public.parcel_tier[])
returns table (found integer, total integer, carrier integer, inspection integer)
language sql stable set search_path = ''
as $$
  select count(tp.tier)::integer, coalesce(sum(tp.price_krw), 0)::integer,
         coalesce(sum(tp.carrier_cost_krw), 0)::integer, coalesce(sum(tp.inspection_fee_krw), 0)::integer
  from unnest(p_tiers) as t(tier) left join public.tier_prices tp on tp.tier = t.tier;
$$;
revoke all on function public.fan_charge_of(public.parcel_tier[]) from public, anon, authenticated;

create or replace function public.register_order(
  p_fan_id uuid,
  p_creator_id uuid,
  p_order_no text,
  p_item_kind text,
  p_has_electronics_or_metal boolean,
  p_tiers public.parcel_tier[],
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_inspection_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
  v_role public.user_role;
  c record;
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
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
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if v_role = 'creator' then
    if exists (select 1 from public.creators c2 where c2.id = p_creator_id and c2.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
    if not public.creators_follow_either_way(p_fan_id, p_creator_id) then
      raise exception '팔로우가 없는 크리에이터에게는 보낼 수 없다' using errcode = 'P0012';
    end if;
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal)
  values (p_order_no, p_fan_id, p_creator_id, p_item_kind, p_has_electronics_or_metal)
  returning id into v_order_id;

  insert into public.boxes (order_id, seq, declared_tier)
  select v_order_id, t.ord::smallint, t.tier
  from unnest(p_tiers) with ordinality as t(tier, ord);

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

create or replace function public.register_revgift(
  p_sender uuid,
  p_shares jsonb,
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_inspection_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_send_id uuid;
  v_n integer;
  v_sum integer;
  v_found integer;
  v_total integer;
  v_carrier integer;
  v_bad integer;
begin
  if jsonb_typeof(p_shares) is distinct from 'array' then
    raise exception '몫 목록이 아니다' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_shares);
  if v_n = 0 or v_n > 10 then
    raise exception '받는 팬은 1~10명' using errcode = '22023';
  end if;

  select c.id into v_creator_id
  from public.creators c join public.profiles p on p.id = c.profile_id
  where c.profile_id = p_sender and p.role = 'creator';
  if v_creator_id is null then
    raise exception '역조공은 크리에이터만 보낸다' using errcode = '42501';
  end if;

  -- INV-R1: 받는 사람은 지금 이 크리에이터를 팔로우하는 팬 계정이다(크리에이터·자기 자신·팔로우 안 한 팬은 아니다)
  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    where not exists (
      select 1 from public.profiles p
      join public.follows f on f.fan_id = p.id and f.creator_id = v_creator_id
      where p.id = (s ->> 'fan_id')::uuid and p.role = 'fan'
    )
  ) then
    raise exception '나를 팔로우하는 팬에게만 보낼 수 있다' using errcode = 'P0021';
  end if;

  select coalesce(sum((s ->> 'amount_krw')::integer), 0) into v_sum from jsonb_array_elements(p_shares) s;
  if v_sum <> p_amount_krw then
    raise exception '몫 금액의 합이 결제 금액과 다르다' using errcode = '22023';
  end if;

  -- INV-K3 · reverse-gift INV-R3: 몫 금액 = 등록 순간 요금표의 받는 값 − 검수비, 배송비 칸 = 택배 원가. 한 문장으로 읽는다.
  select count(tp.tier)::integer, coalesce(sum(tp.price_krw - tp.inspection_fee_krw), 0)::integer, coalesce(sum(tp.carrier_cost_krw), 0)::integer,
         count(*) filter (where tp.tier is not null and ((s ->> 'amount_krw')::integer <> tp.price_krw - tp.inspection_fee_krw
                                                        or (s ->> 'shipping_fee_krw')::integer <> tp.carrier_cost_krw))::integer
  into v_found, v_total, v_carrier, v_bad
  from jsonb_array_elements(p_shares) s left join public.tier_prices tp on tp.tier::text = s ->> 'tier';
  if v_found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if v_bad > 0 or p_goods_krw <> 0 or p_inspection_fee_krw <> 0 or p_amount_krw <> v_total or p_shipping_fee_krw <> v_carrier
     or p_service_fee_krw <> v_total - v_carrier then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (p_sender, v_creator_id, p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw)
  returning id into v_send_id;

  insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw)
  select v_send_id, s.ord::smallint, s.v ->> 'order_no', (s.v ->> 'fan_id')::uuid, (s.v ->> 'tier')::public.parcel_tier,
         (s.v ->> 'amount_krw')::integer, (s.v ->> 'shipping_fee_krw')::integer
  from jsonb_array_elements(p_shares) with ordinality as s(v, ord);

  return v_send_id;
end $$;
