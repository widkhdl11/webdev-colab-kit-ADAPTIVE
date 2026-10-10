-- 2026-10-10 크리에이터 받는 양 조절 — 받는 상태(쉬는 중)·팬당 한 달 한도·생일·기념일.
-- 스펙: creator-receiving INV-B1~B9 (추가분 「팬·크리에이터 화면 기능」 F-4·F-6).
--
-- 1) creators 칸: resume_on(다시 받는 날 — 오늘보다 뒤면 쉬는 중, 지나면 따로 바꾸지 않아도 받는 중) · monthly_fan_limit(꺼짐 null 또는 1~10) ·
--    birthday_month·birthday_day(연도 칸 없음). 크리에이터 표는 화면 쪽 API 로 쓸 수 없다(권한 없음) — 아래 저장 함수로만.
-- 2) creator_anniversaries — 기념일 최대 3개(이름 1~12자 + 월·일), position 이 등록 순서. 화면 쪽 API 로 읽기·쓰기 불가.
-- 3) orders.anniversary_name — 등록 때 7일 안이던 기념일 이름을 복사해 둔다(INV-B9 — 나중에 기념일을 지워도 남는다).
-- 4) 저장 함수 둘 — 크리에이터 ID 인자 없이 로그인 토큰의 계정에 연결된 크리에이터 한 줄만(INV-B1, update_my_creator_profile 과 같은 본인 확인):
--    update_my_creator_receiving(받는 상태·다시 받는 날·한도) · update_my_creator_days(생일·기념일).
-- 5) 읽기: my_creator_receiving(본인 설정) · creator_receiving(공개 — 쉬는 중 날짜·생일·기념일, 한도 칸 없음 INV-B6) ·
--    my_gift_limit_reached(로그인한 보내는 사람 본인이 한도에 닿은 크리에이터만, INV-B6).
-- 6) register_order — 쉬는 중 거부(FKR01, INV-B2) · 한도 거부(FKR02, 팬·크리에이터 쌍 잠금 뒤 세고 만든다, INV-B4) ·
--    기념일 표시(p_anniversary_name, 서버가 그날 다시 계산, INV-B9). 2026-10-10 DB 의 정의(pg_get_functiondef)를 떠서 고쳤다.
--
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 함수는 create or replace, 옛 register_order 는 drop if exists).

-- ── 1)·2)·3) 칸과 표 ──────────────────────────────────

alter table public.creators add column if not exists resume_on date;
alter table public.creators add column if not exists monthly_fan_limit smallint check (monthly_fan_limit between 1 and 10);
alter table public.creators add column if not exists birthday_month smallint;
alter table public.creators add column if not exists birthday_day smallint;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creators_birthday_both_or_none') then
    alter table public.creators add constraint creators_birthday_both_or_none
      check ((birthday_month is null) = (birthday_day is null));
  end if;
end $$;

create table if not exists public.creator_anniversaries (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  name text not null check (char_length(name) between 1 and 12),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  created_at timestamptz not null default now(),
  unique (creator_id, position)
);
alter table public.creator_anniversaries enable row level security;
revoke all on table public.creator_anniversaries from anon, authenticated;

alter table public.orders add column if not exists anniversary_name text check (char_length(anniversary_name) between 1 and 12);

-- ── 날짜 도우미 ──────────────────────────────────

-- 한국 시간 오늘
create or replace function public.receiving_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- 월·일이 달력에 있는 날인가 — 2월 29일은 있다(윤년에 있는 날)
create or replace function public.receiving_valid_month_day(p_month integer, p_day integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_month between 1 and 12 and p_day >= 1
     and p_day <= extract(day from (make_date(2000, p_month, 1) + interval '1 month' - interval '1 day'))::integer;
$$;

-- 오늘이거나 그 뒤로 가장 가까운 그 월·일. 2월 29일은 윤년이 아닌 해에 2월 28일로 친다(INV-B8 — 화면 계산과 같은 규칙).
create or replace function public.receiving_next_date(p_month integer, p_day integer, p_today date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_year integer := extract(year from p_today)::integer;
  v_date date;
begin
  for i in 0..1 loop
    if p_month = 2 and p_day = 29
       and not ((v_year + i) % 4 = 0 and ((v_year + i) % 100 <> 0 or (v_year + i) % 400 = 0)) then
      v_date := make_date(v_year + i, 2, 28);
    else
      v_date := make_date(v_year + i, p_month, p_day);
    end if;
    if v_date >= p_today then
      return v_date;
    end if;
  end loop;
  return v_date;
end $$;

-- 한도에 세는 주문 수(INV-B4 용어): 이번 달(한국 시간) 그 보내는 사람 → 그 크리에이터 주문 중
-- 거절·반려(7일 자동)·취소로 끝나지 않았고, 결제가 실패로 닫히지 않은 것(결제 대기는 센다).
create or replace function public.receiving_counted_orders(p_sender_id uuid, p_creator_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.orders o
  where o.fan_id = p_sender_id and o.creator_id = p_creator_id
    and o.created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    and o.status not in ('rejected', 'expired', 'canceled')
    and (o.status <> 'pending_payment'
         or exists (select 1 from public.payments p
                     where p.order_id = o.id and p.kind = 'initial' and p.status in ('pending', 'confirming', 'done')));
$$;

revoke all on function public.receiving_today() from public, anon, authenticated;
revoke all on function public.receiving_valid_month_day(integer, integer) from public, anon, authenticated;
revoke all on function public.receiving_next_date(integer, integer, date) from public, anon, authenticated;
revoke all on function public.receiving_counted_orders(uuid, uuid) from public, anon, authenticated;

-- ── 4) 저장 함수 ──────────────────────────────────

-- INV-B1·B3·B5: 받는 상태·다시 받는 날·팬당 한도. 받는 중이면 날짜는 지운다(실어 보내도). 한도는 바로 적용 — 이미 만든 주문은 건드리지 않는다.
create or replace function public.update_my_creator_receiving(p_resting boolean, p_resume_on date, p_monthly_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public.receiving_today();
  v_resume date;
  v_creator_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if p_resting is null then
    raise exception '받는 상태가 비었다' using errcode = '22023';
  end if;
  if p_resting then
    -- INV-B3: 쉬는 중이면 다시 받는 날을 꼭 정한다 — 오늘(한국 시간)보다 뒤, 오늘부터 365일 안
    if p_resume_on is null or p_resume_on <= v_today or p_resume_on > v_today + 365 then
      raise exception '다시 받는 날은 내일부터 365일 안이다' using errcode = '22023';
    end if;
    v_resume := p_resume_on;
  end if;
  -- INV-B5: 꺼짐 또는 1~10
  if p_monthly_limit is not null and p_monthly_limit not between 1 and 10 then
    raise exception '팬당 한도는 꺼짐 또는 1~10 이다' using errcode = '22023';
  end if;

  -- 등록(register_order)이 같은 줄을 공유 잠금하므로, 저장과 등록은 서로 끝난 뒤의 상태를 본다
  select c.id into v_creator_id from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  update public.creators c set resume_on = v_resume, monthly_fan_limit = p_monthly_limit where c.id = v_creator_id;
end $$;

-- INV-B1·B7: 생일(월·일, 연도 없음)·기념일(최대 3개, 이름 1~12자 + 월·일). 통째로 바꾼다 — 배열 순서가 등록 순서.
-- 이름은 직접 입력 태그와 같은 업계 기본 필터(creator-tags INV-T7)를 거친다: P0081 금칙어 · P0082 연락처·주소 꼴 · P0083 기호만.
create or replace function public.update_my_creator_days(p_birthday_month integer, p_birthday_day integer, p_anniversaries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_id uuid;
  v_item jsonb;
  v_name text;
  v_month integer;
  v_day integer;
  v_problem text;
  v_names text[] := '{}';
  v_months integer[] := '{}';
  v_days integer[] := '{}';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if (p_birthday_month is null) <> (p_birthday_day is null) then
    raise exception '생일은 월과 일을 같이 정한다' using errcode = '22023';
  end if;
  if p_birthday_month is not null and not public.receiving_valid_month_day(p_birthday_month, p_birthday_day) then
    raise exception '달력에 없는 생일이다' using errcode = '22023';
  end if;
  if p_anniversaries is null or jsonb_typeof(p_anniversaries) <> 'array' then
    raise exception '기념일 목록이 비었다' using errcode = '22023';
  end if;
  if jsonb_array_length(p_anniversaries) > 3 then
    raise exception '기념일은 3개까지다' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_anniversaries) as e loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or jsonb_typeof(v_item -> 'month') is distinct from 'number' or jsonb_typeof(v_item -> 'day') is distinct from 'number'
       or (v_item ->> 'month') !~ '^[0-9]{1,2}$' or (v_item ->> 'day') !~ '^[0-9]{1,2}$' then
      raise exception '기념일은 이름과 월·일이다' using errcode = '22023';
    end if;
    v_name := public.app_trim(v_item ->> 'name');
    v_month := (v_item ->> 'month')::integer;
    v_day := (v_item ->> 'day')::integer;
    if char_length(v_name) not between 1 and 12 then
      raise exception '기념일 이름은 1~12자다' using errcode = '22023';
    end if;
    if v_name ~ '[\u0001-\u001f\u007f-\u009f­؜ᅟᅠ᠎​-‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ￹-￻]' then
      raise exception '기념일 이름에 제어 문자·보이지 않는 글자는 쓸 수 없다' using errcode = '22023';
    end if;
    v_problem := public.creator_tag_text_problem(v_name);
    if v_problem = 'banned' then
      raise exception '기념일 이름에 쓸 수 없는 말이 들어 있다' using errcode = 'P0081';
    elsif v_problem = 'contact' then
      raise exception '기념일 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'P0082';
    elsif v_problem = 'symbols' then
      raise exception '기념일 이름에 글자나 숫자가 하나는 있어야 한다' using errcode = 'P0083';
    end if;
    if not public.receiving_valid_month_day(v_month, v_day) then
      raise exception '달력에 없는 기념일이다' using errcode = '22023';
    end if;
    v_names := v_names || v_name;
    v_months := v_months || v_month;
    v_days := v_days || v_day;
  end loop;

  select c.id into v_creator_id from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;
  update public.creators c set birthday_month = p_birthday_month, birthday_day = p_birthday_day where c.id = v_creator_id;
  delete from public.creator_anniversaries a where a.creator_id = v_creator_id;
  insert into public.creator_anniversaries (creator_id, position, name, month, day)
  select v_creator_id, i::smallint, v_names[i], v_months[i]::smallint, v_days[i]::smallint
  from generate_subscripts(v_names, 1) as i;
end $$;

-- ── 5) 읽기 ──────────────────────────────────

-- 본인 설정 — 로그인한 크리에이터의 것만. 다시 받는 날은 쉬는 중일 때만(지났으면 받는 중이라 비운다).
create or replace function public.my_creator_receiving()
returns table (resume_on date, monthly_limit integer, birthday_month integer, birthday_day integer, anniversaries jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.resume_on > public.receiving_today() then c.resume_on end,
         c.monthly_fan_limit::integer, c.birthday_month::integer, c.birthday_day::integer,
         coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'month', a.month, 'day', a.day) order by a.position)
                     from public.creator_anniversaries a where a.creator_id = c.id), '[]'::jsonb)
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

-- 공개 — 크리에이터 페이지·등록 화면이 읽는다. 본인 확인을 마친 크리에이터만. 한도 칸은 없다(INV-B6).
-- 기념일 이름은 지금 필터를 다시 거친다(저장 뒤 금칙어가 늘었을 때 공개 화면에 뜨지 않게 — creator_rows 의 직접 입력 태그와 같은 방식).
create or replace function public.creator_receiving(p_ids uuid[])
returns table (id uuid, resume_on date, birthday_month integer, birthday_day integer, anniversaries jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         case when c.resume_on > public.receiving_today() then c.resume_on end,
         c.birthday_month::integer, c.birthday_day::integer,
         coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'month', a.month, 'day', a.day) order by a.position)
                     from public.creator_anniversaries a
                    where a.creator_id = c.id and public.creator_tag_text_problem(a.name) is null), '[]'::jsonb)
  from public.creators c
  where c.identity_verified and c.id = any(p_ids)
  order by c.created_at, c.id;
$$;

-- INV-B6: 로그인한 보내는 사람 본인이 이번 달 한도에 닿은 크리에이터만 돌려준다. 다른 사람 ID 를 넣을 칸이 없다.
create or replace function public.my_gift_limit_reached(p_creator_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.creators c
  where auth.uid() is not null and c.id = any(p_creator_ids) and c.monthly_fan_limit is not null
    and public.receiving_counted_orders(auth.uid(), c.id) >= c.monthly_fan_limit
  order by c.id;
$$;

revoke all on function public.update_my_creator_receiving(boolean, date, integer) from public, anon;
revoke all on function public.update_my_creator_days(integer, integer, jsonb) from public, anon;
revoke all on function public.my_creator_receiving() from public, anon;
revoke all on function public.my_gift_limit_reached(uuid[]) from public, anon;
revoke all on function public.creator_receiving(uuid[]) from public;
grant execute on function public.update_my_creator_receiving(boolean, date, integer) to authenticated;
grant execute on function public.update_my_creator_days(integer, integer, jsonb) to authenticated;
grant execute on function public.my_creator_receiving() to authenticated;
grant execute on function public.my_gift_limit_reached(uuid[]) to authenticated;
grant execute on function public.creator_receiving(uuid[]) to anon, authenticated;

-- ── 6) register_order ──────────────────────────────────

drop function if exists public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer);

create or replace function public.register_order(p_fan_id uuid, p_creator_id uuid, p_order_no text, p_item_kind text, p_has_electronics_or_metal boolean, p_tiers public.parcel_tier[], p_toss_order_id text, p_goods_krw integer, p_service_fee_krw integer, p_inspection_fee_krw integer, p_shipping_fee_krw integer, p_amount_krw integer, p_anniversary_name text default null)
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
  -- INV-V12: 받는 크리에이터 행을 공유 잠금 — 이사 신청(같은 행 for no key update)이 끝날 때까지 기다리고, 끝난 뒤의 상태로 판단한다
  -- creator-receiving INV-B2·B4: 받는 상태·한도 저장(같은 행 for no key update)도 이 잠금에서 줄을 선다
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
  if p_anniversary_name is not null then
    select a.name into v_mark
    from public.creator_anniversaries a
    where a.creator_id = p_creator_id and a.name = public.app_trim(p_anniversary_name)
      and public.receiving_next_date(a.month, a.day, v_today) - v_today between 0 and 7
    order by a.position
    limit 1;
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, anniversary_name)
  values (p_order_no, p_fan_id, p_creator_id, p_item_kind, p_has_electronics_or_metal, v_mark)
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

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text) to service_role;
