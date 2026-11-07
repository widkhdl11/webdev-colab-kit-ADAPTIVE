-- 택배 원가 경로표 · 기본 경로 · 팬에게 보내기 택배비 · 요금 검사 (admin-console INV-K15·K16, S15~S16c).
-- 팬 선물 요금표(tier_prices)의 택배 원가 칸(소·중·대)은 기본 경로의 같은 구간 값이다. 이 파일은 tier_prices 를 덮지 않는다 —
-- 운영 DB 의 지금 요금표는 그대로 두고, 대표가 기본 경로를 바꾸거나 경로 값을 저장할 때만 칸이 바뀐다.
-- 팬에게 보내기 택배비는 저장과 검사만 한다. 역조공 요금 계산(받는 값 − 검수비, reverse-gift INV-R3)은 이 파일에서 바꾸지 않는다.

-- ── 표 ───────────────────────────────────────────────────

-- 경로 넷 × 구간 넷. 비어 있는 칸(null)은 아직 값이 없는 것이다 — 칸이 하나라도 비면 기본 경로가 될 수 없다.
create table public.carrier_route_costs (
  route text not null check (route in ('post_office', 'logii_cj_a', 'logii_visit', 'agency')),
  tier text not null check (tier in ('xsmall', 'small', 'medium', 'large')),
  cost_krw integer check (cost_krw is null or (cost_krw >= 0 and cost_krw <= 10000000)),
  primary key (route, tier)
);
alter table public.carrier_route_costs enable row level security;
revoke all on public.carrier_route_costs from anon, authenticated;

-- 첫 값(INV-K15 문장 그대로). 우체국 창구 대형(140cm)은 120cm 를 넘어 13,000. 로지아이 방문택배는 30개 미만 가정.
insert into public.carrier_route_costs (route, tier, cost_krw) values
  ('post_office', 'xsmall', 4000), ('post_office', 'small', 4500), ('post_office', 'medium', 6000), ('post_office', 'large', 13000),
  ('logii_cj_a', 'xsmall', 2990), ('logii_cj_a', 'small', 3490), ('logii_cj_a', 'medium', 4390), ('logii_cj_a', 'large', 5500),
  ('logii_visit', 'xsmall', 4490), ('logii_visit', 'small', 4490), ('logii_visit', 'medium', 4490), ('logii_visit', 'large', 4490),
  ('agency', 'xsmall', null), ('agency', 'small', null), ('agency', 'medium', null), ('agency', 'large', null);

-- 기본 경로 설정값 하나(행 하나)
create table public.pricing_settings (
  id boolean primary key default true check (id),
  default_route text not null check (default_route in ('post_office', 'logii_cj_a', 'logii_visit', 'agency'))
);
alter table public.pricing_settings enable row level security;
revoke all on public.pricing_settings from anon, authenticated;
insert into public.pricing_settings (default_route) values ('logii_cj_a');

-- 팬에게 보내기 택배비(극소·소·중·대, 요금 11-07 최종 ②)
create table public.fan_send_fees (
  tier text primary key check (tier in ('xsmall', 'small', 'medium', 'large')),
  fee_krw integer not null check (fee_krw >= 0 and fee_krw <= 10000000)
);
alter table public.fan_send_fees enable row level security;
revoke all on public.fan_send_fees from anon, authenticated;
insert into public.fan_send_fees (tier, fee_krw) values ('xsmall', 3000), ('small', 3500), ('medium', 4400), ('large', 5500);

-- 경로 값·기본 경로·팬에게 보내기 택배비 변경 기록(INV-K5 와 같은 원칙 — 고치거나 지울 수 없다).
-- 팬 선물 요금표 칸이 바뀐 것은 지금처럼 tier_price_changes 에 남는다.
create table public.pricing_setting_changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  changed_by uuid not null references public.profiles (id),
  item text not null check (item in ('route_cost', 'default_route', 'fan_send_fee')),
  route text,
  tier text,
  before_value text,
  after_value text
);
alter table public.pricing_setting_changes enable row level security;
revoke all on public.pricing_setting_changes from anon, authenticated;

create trigger pricing_setting_changes_no_update before update on public.pricing_setting_changes
  for each row execute function public.tier_price_changes_append_only();
create trigger pricing_setting_changes_no_delete before delete on public.pricing_setting_changes
  for each row execute function public.tier_price_changes_append_only();

-- ── 입력 꼴 검사 ─────────────────────────────────────────

-- 저장·검사 함수가 받는 네 묶음. 모두 비어 있어도 된다(= 지금 값). 꼴이 틀리면 22023.
--   p_default_route: 경로 이름 / p_routes: {경로: {구간: 원 또는 null}} / p_send_fees: {구간: 원}
--   p_prices: 팬 선물 세 줄 [{tier, price_krw, inspection_fee_krw}] — 택배 원가 칸은 기본 경로에서 온다
create function public.carrier_pricing_input_check(p_default_route text, p_routes jsonb, p_send_fees jsonb, p_prices jsonb)
returns void
language plpgsql immutable set search_path = ''
as $$
declare
  v_routes constant text[] := array['post_office', 'logii_cj_a', 'logii_visit', 'agency'];
  v_tiers constant text[] := array['xsmall', 'small', 'medium', 'large'];
  k record;
  t record;
begin
  if p_default_route is not null and not (p_default_route = any (v_routes)) then
    raise exception '모르는 경로' using errcode = '22023';
  end if;
  if p_routes is not null then
    if jsonb_typeof(p_routes) <> 'object' then
      raise exception '경로 값의 꼴이 다르다' using errcode = '22023';
    end if;
    for k in select * from jsonb_each(p_routes) loop
      if not (k.key = any (v_routes)) or jsonb_typeof(k.value) <> 'object' then
        raise exception '경로 값의 꼴이 다르다' using errcode = '22023';
      end if;
      for t in select * from jsonb_each(k.value) loop
        if not (t.key = any (v_tiers))
           or (jsonb_typeof(t.value) <> 'null'
               and (jsonb_typeof(t.value) <> 'number' or (t.value #>> '{}')::numeric <> trunc((t.value #>> '{}')::numeric)
                    or (t.value #>> '{}')::numeric < 0 or (t.value #>> '{}')::numeric > 10000000)) then
          raise exception '경로 값은 0 이상 정수이거나 빈칸이다' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;
  if p_send_fees is not null then
    if jsonb_typeof(p_send_fees) <> 'object' then
      raise exception '택배비의 꼴이 다르다' using errcode = '22023';
    end if;
    for t in select * from jsonb_each(p_send_fees) loop
      if not (t.key = any (v_tiers)) or jsonb_typeof(t.value) <> 'number'
         or (t.value #>> '{}')::numeric <> trunc((t.value #>> '{}')::numeric)
         or (t.value #>> '{}')::numeric < 0 or (t.value #>> '{}')::numeric > 10000000 then
        raise exception '택배비는 0 이상 정수다' using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_prices is not null then
    if jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) <> 3
       or (select count(distinct x ->> 'tier') from jsonb_array_elements(p_prices) x where x ->> 'tier' in ('small', 'medium', 'large')) <> 3 then
      raise exception '요금표는 소형·중형·대형 세 줄이다' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_prices) x, unnest(array['price_krw', 'inspection_fee_krw']) f
      where jsonb_typeof(x -> f) is distinct from 'number' or (x ->> f)::numeric <> trunc((x ->> f)::numeric)
         or (x ->> f)::numeric < 0 or (x ->> f)::numeric > 10000000
    ) or exists (select 1 from jsonb_array_elements(p_prices) x where (select count(*) from jsonb_object_keys(x)) <> 3) then
      raise exception '요금은 정수여야 한다' using errcode = '22023';
    end if;
  end if;
end $$;
revoke all on function public.carrier_pricing_input_check(text, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ── 요금 검사 (INV-K16) ──────────────────────────────────

-- 네 묶음을 지금 값에 얹은 상태로 검사한다(모두 null 이면 지금 상태 그대로). 실패한 줄만 돌려준다.
--   route_incomplete: 기본 경로의 칸이 비었다(INV-K15)
--   fan_gift (a): 팬 선물 받는 값 < 기본 경로 원가 + 검수비. 수정안 = 원가 + 검수비 + 지금 기본 서비스료(지금 요금표의 받는 값 − 택배 원가 − 검수비)
--   fan_send (b): 팬에게 보내기 택배비 < 기본 경로 원가를 100원 단위로 반올림한 값. 수정안 = 그 반올림 값
create function public.pricing_problems_of(p_default_route text, p_routes jsonb, p_send_fees jsonb, p_prices jsonb)
returns table (check_kind text, tier text, amount_krw integer, minimum_krw integer, proposal_krw integer)
language sql stable set search_path = ''
as $$
  with route_cost as (
    select c.route, c.tier,
           case when p_routes is not null and (p_routes -> c.route) ? c.tier then (p_routes -> c.route ->> c.tier)::integer else c.cost_krw end as cost_krw
    from public.carrier_route_costs c
  ),
  chosen as (
    select coalesce(p_default_route, s.default_route) as route from public.pricing_settings s
  ),
  cost as (
    select rc.tier, rc.cost_krw from route_cost rc join chosen on chosen.route = rc.route
  ),
  price as (
    select tp.tier::text as tier,
           coalesce((j.x ->> 'price_krw')::integer, tp.price_krw) as price_krw,
           coalesce((j.x ->> 'inspection_fee_krw')::integer, tp.inspection_fee_krw) as inspection_fee_krw,
           greatest(tp.price_krw - tp.carrier_cost_krw - tp.inspection_fee_krw, 0) as service_now
    from public.tier_prices tp
    left join lateral (
      select e.value as x
      from jsonb_array_elements(case when jsonb_typeof(p_prices) = 'array' then p_prices else '[]'::jsonb end) as e
      where e.value ->> 'tier' = tp.tier::text
      limit 1
    ) j on true
  ),
  fee as (
    select f.tier,
           case when p_send_fees is not null and p_send_fees ? f.tier then (p_send_fees ->> f.tier)::integer else f.fee_krw end as fee_krw
    from public.fan_send_fees f
  ),
  problems as (
    select 1 as kind_order, 'route_incomplete'::text as check_kind, c.tier, null::integer as amount_krw, null::integer as minimum_krw, null::integer as proposal_krw
    from cost c where c.cost_krw is null
    union all
    select 2, 'fan_gift', p.tier, p.price_krw, c.cost_krw + p.inspection_fee_krw, c.cost_krw + p.inspection_fee_krw + p.service_now
    from price p join cost c on c.tier = p.tier
    where c.cost_krw is not null and p.price_krw < c.cost_krw + p.inspection_fee_krw
    union all
    select 3, 'fan_send', f.tier, f.fee_krw, (round(c.cost_krw / 100.0) * 100)::integer, (round(c.cost_krw / 100.0) * 100)::integer
    from fee f join cost c on c.tier = f.tier
    where c.cost_krw is not null and f.fee_krw < (round(c.cost_krw / 100.0) * 100)::integer
  )
  select pr.check_kind, pr.tier, pr.amount_krw, pr.minimum_krw, pr.proposal_krw
  from problems pr
  order by pr.kind_order, array_position(array['xsmall', 'small', 'medium', 'large'], pr.tier);
$$;
revoke all on function public.pricing_problems_of(text, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- 저장 함수가 처리 끝에 부른다 — 실패가 하나라도 있으면 통째로 거부. 오류 코드로 어느 검사인지 가른다.
create function public.pricing_raise_if_problems()
returns void
language plpgsql stable set search_path = ''
as $$
declare
  v_kind text;
begin
  select pr.check_kind into v_kind from public.pricing_problems_of(null, null, null, null) pr limit 1;
  if v_kind = 'route_incomplete' then
    raise exception '값이 다 차지 않은 경로는 기본 경로가 될 수 없다' using errcode = 'P0043';
  elsif v_kind = 'fan_gift' then
    raise exception '팬 선물 받는 값이 기본 경로 원가 + 검수비보다 작다' using errcode = 'P0041';
  elsif v_kind = 'fan_send' then
    raise exception '팬에게 보내기 택배비가 기본 경로 원가(100원 반올림)보다 작다' using errcode = 'P0042';
  end if;
end $$;
revoke all on function public.pricing_raise_if_problems() from public, anon, authenticated;

-- INV-K16 (c): 읽기 전용 검사. 화면은 거부된 저장의 수정안을 얻는 데, 배포 점검은 인자 없이 불러 빈 결과인지 보는 데 쓴다.
-- 운영자만 — API(로그인 토큰)로 부른 사람이 운영자가 아니면 42501. DB 에 직접 붙은 점검(토큰 없음)은 그대로 돈다.
create function public.admin_pricing_check(
  p_default_route text default null,
  p_routes jsonb default null,
  p_send_fees jsonb default null,
  p_prices jsonb default null
)
returns table (check_kind text, tier text, amount_krw integer, minimum_krw integer, proposal_krw integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() and coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    raise exception '요금 검사는 운영자만 본다' using errcode = '42501';
  end if;
  perform public.carrier_pricing_input_check(p_default_route, p_routes, p_send_fees, p_prices);
  return query select * from public.pricing_problems_of(p_default_route, p_routes, p_send_fees, p_prices);
end $$;

-- ── 읽기 ─────────────────────────────────────────────────

-- 관리자 요금 화면의 경로표·기본 경로·팬에게 보내기 택배비. 운영자가 아니면 null(INV-K1).
create function public.admin_carrier_pricing()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when public.is_operator() then jsonb_build_object(
    'default_route', (select s.default_route from public.pricing_settings s),
    'routes', (select jsonb_agg(jsonb_build_object('route', c.route, 'tier', c.tier, 'cost_krw', c.cost_krw)
                                order by array_position(array['post_office', 'logii_cj_a', 'logii_visit', 'agency'], c.route),
                                         array_position(array['xsmall', 'small', 'medium', 'large'], c.tier))
               from public.carrier_route_costs c),
    'send_fees', (select jsonb_agg(jsonb_build_object('tier', f.tier, 'fee_krw', f.fee_krw)
                                   order by array_position(array['xsmall', 'small', 'medium', 'large'], f.tier))
                  from public.fan_send_fees f)
  ) end;
$$;

-- ── 쓰기 (INV-K2·K5·K15·K16) ─────────────────────────────

-- 대표만. 경로 값·팬에게 보내기 택배비·기본 경로·팬 선물 받는 값과 검수비를 한 처리에서 저장한다.
-- 처리 끝에 팬 선물 요금표의 택배 원가 칸(소·중·대)을 기본 경로 값으로 맞추고, 바뀐 칸마다 기록한다.
-- 검사(INV-K16)를 하나라도 어기면 통째로 거부한다.
create function public.admin_save_carrier_pricing(
  p_default_route text default null,
  p_routes jsonb default null,
  p_send_fees jsonb default null,
  p_prices jsonb default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k record;
  t record;
  r jsonb;
  v_old_int integer;
  v_new_int integer;
  v_old_route text;
  v_field text;
  v_tier public.parcel_tier;
  v_old public.tier_prices;
begin
  if not public.is_owner() then
    raise exception '요금은 대표만 바꾼다' using errcode = '42501';
  end if;
  perform public.carrier_pricing_input_check(p_default_route, p_routes, p_send_fees, p_prices);
  if p_default_route is null and p_routes is null and p_send_fees is null and p_prices is null then
    raise exception '바꿀 값이 없다' using errcode = '22023';
  end if;

  -- 요금표 저장(admin_set_tier_prices)과 같은 잠금 순서 — 둘이 겹치면 줄을 선다
  perform 1 from public.tier_prices for update;
  perform 1 from public.pricing_settings for update;

  if p_routes is not null then
    for k in select * from jsonb_each(p_routes) loop
      for t in select * from jsonb_each(k.value) loop
        select c.cost_krw into v_old_int from public.carrier_route_costs c where c.route = k.key and c.tier = t.key for update;
        v_new_int := (t.value #>> '{}')::integer;
        if v_old_int is distinct from v_new_int then
          insert into public.pricing_setting_changes (changed_by, item, route, tier, before_value, after_value)
          values (auth.uid(), 'route_cost', k.key, t.key, v_old_int::text, v_new_int::text);
          update public.carrier_route_costs set cost_krw = v_new_int where route = k.key and tier = t.key;
        end if;
      end loop;
    end loop;
  end if;

  if p_send_fees is not null then
    for t in select * from jsonb_each(p_send_fees) loop
      select f.fee_krw into v_old_int from public.fan_send_fees f where f.tier = t.key for update;
      v_new_int := (t.value #>> '{}')::integer;
      if v_old_int is distinct from v_new_int then
        insert into public.pricing_setting_changes (changed_by, item, tier, before_value, after_value)
        values (auth.uid(), 'fan_send_fee', t.key, v_old_int::text, v_new_int::text);
        update public.fan_send_fees set fee_krw = v_new_int where tier = t.key;
      end if;
    end loop;
  end if;

  if p_default_route is not null then
    select s.default_route into v_old_route from public.pricing_settings s;
    if v_old_route <> p_default_route then
      insert into public.pricing_setting_changes (changed_by, item, before_value, after_value)
      values (auth.uid(), 'default_route', v_old_route, p_default_route);
      update public.pricing_settings set default_route = p_default_route where id;
    end if;
  end if;

  if p_prices is not null then
    for r in select * from jsonb_array_elements(p_prices) loop
      v_tier := (r ->> 'tier')::public.parcel_tier;
      select * into v_old from public.tier_prices where tier = v_tier;
      foreach v_field in array array['price_krw', 'inspection_fee_krw'] loop
        v_new_int := (r ->> v_field)::integer;
        if v_new_int <> (to_jsonb(v_old) ->> v_field)::integer then
          insert into public.tier_price_changes (changed_by, tier, field, before_krw, after_krw)
          values (auth.uid(), v_tier, v_field, (to_jsonb(v_old) ->> v_field)::integer, v_new_int);
        end if;
      end loop;
      update public.tier_prices
      set price_krw = (r ->> 'price_krw')::integer, inspection_fee_krw = (r ->> 'inspection_fee_krw')::integer
      where tier = v_tier;
    end loop;
  end if;

  -- INV-K16 먼저(어긴 검사를 오류 코드로 알린다). 검사는 경로표의 기본 경로 값으로 보므로 요금표 칸을 맞추기 전에 해도 같다 —
  -- 맞춘 뒤에 하면 「원가 + 검수비 ≤ 받는 값」 칸 제약이 먼저 걸려 어느 검사인지 가려지지 않는다.
  perform public.pricing_raise_if_problems();

  -- INV-K15: 팬 선물 요금표의 택배 원가 칸 = 기본 경로의 같은 구간 값. 빈 칸은 건너뛴다(비어 있으면 위 검사가 이미 거부했다).
  for k in
    select tp.tier, tp.carrier_cost_krw as before_krw, c.cost_krw as after_krw
    from public.tier_prices tp
    join public.carrier_route_costs c on c.tier = tp.tier::text
    join public.pricing_settings s on s.default_route = c.route
    where c.cost_krw is not null and c.cost_krw <> tp.carrier_cost_krw
  loop
    insert into public.tier_price_changes (changed_by, tier, field, before_krw, after_krw)
    values (auth.uid(), k.tier, 'carrier_cost_krw', k.before_krw, k.after_krw);
    update public.tier_prices set carrier_cost_krw = k.after_krw where tier = k.tier;
  end loop;

  -- INV-K4 (c) 순서 검사
  set constraints public.tier_prices_ascending immediate;
exception
  when check_violation then
    raise exception '요금표 조건을 어겼다' using errcode = '22023';
end $$;

-- 요금표 저장도 같은 검사를 거친다(INV-K16 (a)). 본문은 20261005000002 와 같고 끝에 검사 한 줄만 더했다.
create or replace function public.admin_set_tier_prices(p_rows jsonb)
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

  -- INV-K16: 받는 값 ≥ 기본 경로 원가 + 검수비 등 — 어기면 P0041~P0043
  perform public.pricing_raise_if_problems();
  -- INV-K4 (c) 를 함수 안에서 바로 확인한다 — 지연 검사에만 맡기면 오류가 커밋 때 다른 꼴로 난다
  set constraints public.tier_prices_ascending immediate;
exception
  when check_violation then
    raise exception '요금표 조건을 어겼다' using errcode = '22023';
end $$;

revoke all on function public.admin_pricing_check(text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.admin_carrier_pricing() from public, anon;
revoke all on function public.admin_save_carrier_pricing(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.admin_pricing_check(text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.admin_carrier_pricing() to authenticated;
grant execute on function public.admin_save_carrier_pricing(text, jsonb, jsonb, jsonb) to authenticated;
