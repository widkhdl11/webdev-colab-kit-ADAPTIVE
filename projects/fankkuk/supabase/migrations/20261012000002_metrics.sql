-- 2026-10-12 측정 — 재발송률·감사 답장률·답장 여부별 재발송률·가입 경로·품목 안내 뒤 바꾼 비율·거절률 (운영자 화면).
-- 스펙: metrics INV-Q1~Q5 (추가분 F-9·봉인 불변식 18).
--
-- 1) gift_was_sent(상태, 결제 시각) — 「보낸 선물」 판정 하나. 결제가 끝났고 취소·결제 전이 아닌 주문(거절·7일 자동 반려 포함).
--    결제 실패는 결제 전(pending_payment)으로 남아 결제 시각이 없다. 선물 링크 페이지의 「이번 달 N명」(creator_month_fan_total)도 같은 판정을 쓰게 다시 만든다(뜻은 그대로).
-- 2) orders.hard_notice_category — 받기 어려운 품목 안내가 뜬 품목(INV-Q5). 마지막에 고른 품목은 기존 item_category.
-- 3) register_order — 맨 뒤에 p_hard_notice_category(기본 null)를 더한다. 그 값은 크리에이터 줄을 잠근 뒤
--    그때 살아 있는 받기 어려운 품목(안내만·등록 막기 모두)에 있을 때만 남기고, 아니면 버린다(화면 값만 믿지 않는다).
--    나머지는 20261011000001_hard_items.sql 의 정의 그대로다.
-- 4) signup_sources — 가입 경로(고르는 다섯 값 또는 빈 칸)·처음 들어온 공유 링크의 utm 세 값. 계정과 1:1, pii 구역 밖.
--    record_signup_source — 앱 서버 키로만. 목록 밖 경로는 22023, 꼴이 틀린 utm 은 버리고(빈 칸) 저장, 이미 있으면 덮어쓰지 않는다.
-- 5) metrics_rows_at(기준 시각) — 집계 하나. 칸은 지표·기간·묶음·분자·분모·비율뿐(INV-Q2). 누구도 바로 부르지 못한다(경계 시험은 DB 소유자로 부른다).
--    admin_metrics() — 운영자(대표·직원)가 아니면 42501(INV-Q1), 운영자면 지금 시각으로 metrics_rows_at.
--
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 함수는 create or replace, 옛 register_order 는 drop if exists).

-- ── 1) 보낸 선물 판정 ──────────────────────────────────

create or replace function public.gift_was_sent(p_status public.order_status, p_registered_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_registered_at is not null and p_status not in ('pending_payment', 'canceled');
$$;

revoke all on function public.gift_was_sent(public.order_status, timestamptz) from public, anon, authenticated;

-- creator-link INV-E8: 이번 달(한국 시간) 이 크리에이터에게 선물을 보낸 팬 수 — 판정만 gift_was_sent 로 옮겼다(권한은 그대로 남는다)
create or replace function public.creator_month_fan_total(p_creator_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct o.fan_id)::integer
  from public.orders o
  join public.creators c on c.id = o.creator_id and c.identity_verified
  where o.creator_id = p_creator_id
    and public.gift_was_sent(o.status, o.registered_at)
    and o.registered_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

-- ── 2) 안내가 뜬 품목 ──────────────────────────────────

alter table public.orders add column if not exists hard_notice_category text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_hard_notice_category_known') then
    alter table public.orders add constraint orders_hard_notice_category_known
      check (hard_notice_category in ('doll', 'flower', 'clothing', 'beauty', 'large', 'stationery', 'electronics', 'other'));
  end if;
end $$;

-- ── 3) register_order ──────────────────────────────────

drop function if exists public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text);

create or replace function public.register_order(p_fan_id uuid, p_creator_id uuid, p_order_no text, p_item_kind text, p_has_electronics_or_metal boolean, p_tiers public.parcel_tier[], p_toss_order_id text, p_goods_krw integer, p_service_fee_krw integer, p_inspection_fee_krw integer, p_shipping_fee_krw integer, p_amount_krw integer, p_anniversary_name text default null, p_item_category text default 'other', p_hard_notice_category text default null)
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
  v_notice text;
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
  -- metrics INV-Q5: 화면이 보낸 안내 품목은 같은 잠금 안에서 그때 살아 있는 받기 어려운 품목과 다시 맞춰 본다 — 없으면 버린다(거부하지 않는다)
  select p_hard_notice_category into v_notice
  from public.creator_hard_items h
  where h.creator_id = p_creator_id and p_hard_notice_category = any(h.categories) and public.hard_items_live(h.ends_on, v_today);
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

  insert into public.orders (order_no, fan_id, creator_id, item_kind, item_category, has_electronics_or_metal, anniversary_name, hard_notice_category)
  values (p_order_no, p_fan_id, p_creator_id, v_item_name, p_item_category, v_metal, v_mark, v_notice)
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

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer, text, text, text) to service_role;

-- ── 4) 가입 경로·utm ──────────────────────────────────

create table if not exists public.signup_sources (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  -- 「어디서 알게 되셨나요」 — 고르지 않으면 비어 있다
  heard_from text check (heard_from in ('x', 'creator_stream', 'fan_community', 'friend', 'other')),
  -- 처음 들어온 공유 링크의 utm — 영문 소문자·숫자·밑줄·하이픈 1~50자만
  utm_source text check (utm_source ~ '^[a-z0-9_-]{1,50}$'),
  utm_medium text check (utm_medium ~ '^[a-z0-9_-]{1,50}$'),
  utm_campaign text check (utm_campaign ~ '^[a-z0-9_-]{1,50}$'),
  created_at timestamptz not null default now()
);
create index if not exists signup_sources_created_idx on public.signup_sources (created_at);
alter table public.signup_sources enable row level security;
revoke all on table public.signup_sources from anon, authenticated;

-- utm 한 값 — 꼴이 맞으면 그대로, 아니면 null(버린다)
create or replace function public.clean_utm_value(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_value ~ '^[a-z0-9_-]{1,50}$' then p_value end;
$$;

revoke all on function public.clean_utm_value(text) from public, anon, authenticated;

-- INV-Q4: 가입이 끝난 계정에 가입 경로·utm 을 붙인다. 앱 서버 키로만(가입하는 사람은 아직 로그인 전이다).
create or replace function public.record_signup_source(p_account_id uuid, p_heard_from text, p_utm_source text, p_utm_medium text, p_utm_campaign text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_heard_from is not null and p_heard_from not in ('x', 'creator_stream', 'fan_community', 'friend', 'other') then
    raise exception '목록에 없는 가입 경로' using errcode = '22023';
  end if;
  -- 처음 기록이 있으면 덮어쓰지 않는다
  insert into public.signup_sources (account_id, heard_from, utm_source, utm_medium, utm_campaign)
  values (p_account_id, p_heard_from, public.clean_utm_value(p_utm_source), public.clean_utm_value(p_utm_medium), public.clean_utm_value(p_utm_campaign))
  on conflict (account_id) do nothing;
end $fn$;

revoke all on function public.record_signup_source(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_signup_source(uuid, text, text, text, text) to service_role;

-- ── 5) 집계 ──────────────────────────────────

-- 기준 시각 p_now 로 센 집계. 기간: 'all'(전체) · 'YYYY-MM'(p_now 의 한국 시간 달과 그 앞 두 달).
-- 지표(분자 / 분모):
--   resend · resend_replied · resend_not_replied — 첫 선물 뒤 60일 안에 다시 보낸 팬 / 첫 선물을 보낸 지 60일이 지난 팬(INV-Q3).
--     첫 선물 = 한 팬의 보낸 선물 가운데 결제 시각이 가장 이른 것(크리에이터와 상관없이). 달은 첫 선물의 한국 시간 달.
--     답장 여부는 첫 선물 주문의 상자 가운데 지우지 않은 답장이 하나라도 있는가.
--   reply — 답장이 남은(지우지 않은) 상자 / 받았어요가 남은 상자. 달은 받았어요의 한국 시간 달.
--   notice_changed — 품목을 바꾼 주문 / 안내가 뜬 뒤 결제까지 간 주문(INV-Q5). 달은 결제 시각의 한국 시간 달.
--   decline — 거절·7일 자동 반려 / 결정이 난(승인됐거나 거절·반려된) 보낸 선물. 달은 결제 시각의 한국 시간 달.
--   signup_source — 그 경로(none = 고르지 않음) 가입 / 가입 전체. 달은 가입의 한국 시간 달.
--   utm_source · utm_medium · utm_campaign — 그 값으로 들어온 가입 / 가입 전체(값마다 많은 순 20개까지).
-- 비율은 분모가 0 이면 비어 있다.
create or replace function public.metrics_rows_at(p_now timestamptz)
returns table (metric text, period text, bucket text, numerator integer, denominator integer, rate numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with months as (
    select to_char(date_trunc('month', p_now at time zone 'Asia/Seoul') - make_interval(months => k), 'YYYY-MM') as period, k
    from generate_series(0, 2) as g(k)
  ),
  periods as (
    select 'all'::text as period, -1 as ord
    union all
    select m.period, m.k from months m
  ),
  sent as (
    select o.id, o.fan_id, o.registered_at
    from public.orders o
    where public.gift_was_sent(o.status, o.registered_at) and o.registered_at <= p_now
  ),
  firsts as (
    select distinct on (s.fan_id) s.fan_id, s.id as order_id, s.registered_at as first_at
    from sent s
    order by s.fan_id, s.registered_at, s.id
  ),
  cohort as (
    select
      to_char(f.first_at at time zone 'Asia/Seoul', 'YYYY-MM') as period,
      exists (
        select 1 from sent s2
        where s2.fan_id = f.fan_id and s2.id <> f.order_id
          and s2.registered_at >= f.first_at and s2.registered_at <= f.first_at + interval '60 days'
      ) as resent,
      exists (select 1 from public.gift_replies r where r.order_id = f.order_id and r.phrase is not null) as replied
    from firsts f
    where f.first_at <= p_now - interval '60 days'
  ),
  facts as (
    select 'resend'::text as metric, c.period, c.resent as hit from cohort c
    union all
    select case when c.replied then 'resend_replied' else 'resend_not_replied' end, c.period, c.resent from cohort c
    union all
    select 'reply', to_char(r.received_at at time zone 'Asia/Seoul', 'YYYY-MM'), r.phrase is not null
    from public.gift_replies r
    where r.received_at <= p_now
    union all
    select 'notice_changed', to_char(o.registered_at at time zone 'Asia/Seoul', 'YYYY-MM'), o.item_category is distinct from o.hard_notice_category
    from public.orders o
    where o.hard_notice_category is not null and o.registered_at is not null and o.registered_at <= p_now
    union all
    select 'decline', to_char(o.registered_at at time zone 'Asia/Seoul', 'YYYY-MM'), o.status in ('rejected', 'expired')
    from public.orders o
    where public.gift_was_sent(o.status, o.registered_at) and o.registered_at <= p_now
      and (o.approved_at is not null or o.status in ('rejected', 'expired'))
  ),
  ratio as (
    select k.metric, p.period, ''::text as bucket,
           count(f.metric) filter (where f.hit)::integer as numerator,
           count(f.metric)::integer as denominator,
           k.ord as mord, p.ord as pord
    from unnest(array['resend', 'resend_replied', 'resend_not_replied', 'reply', 'notice_changed', 'decline']) with ordinality as k(metric, ord)
    cross join periods p
    left join facts f on f.metric = k.metric and (p.period = 'all' or f.period = p.period)
    group by k.metric, k.ord, p.period, p.ord
  ),
  signups as (
    select s.heard_from, s.utm_source, s.utm_medium, s.utm_campaign, to_char(s.created_at at time zone 'Asia/Seoul', 'YYYY-MM') as period
    from public.signup_sources s
    where s.created_at <= p_now
  ),
  signup_totals as (
    select p.period, p.ord, count(g.period)::integer as total
    from periods p
    left join signups g on p.period = 'all' or g.period = p.period
    group by p.period, p.ord
  ),
  sources as (
    select 'signup_source'::text as metric, t.period, b.bucket,
           (select count(*) from signups g where (t.period = 'all' or g.period = t.period) and coalesce(g.heard_from, 'none') = b.bucket)::integer as numerator,
           t.total as denominator,
           7::bigint as mord, t.ord as pord, b.ord as bord
    from signup_totals t
    cross join unnest(array['x', 'creator_stream', 'fan_community', 'friend', 'other', 'none']) with ordinality as b(bucket, ord)
  ),
  utm_values as (
    select v.kind, v.kind_ord, v.val, g.period from signups g
    cross join lateral (values ('utm_source', 8, g.utm_source), ('utm_medium', 9, g.utm_medium), ('utm_campaign', 10, g.utm_campaign)) as v(kind, kind_ord, val)
    where v.val is not null
  ),
  utm as (
    select x.kind as metric, x.period, x.val as bucket, x.n as numerator, t.total as denominator, x.kind_ord::bigint as mord, t.ord as pord, x.rn as bord
    from (
      select u.kind, u.kind_ord, p.period, u.val, count(*)::integer as n,
             row_number() over (partition by u.kind, p.period order by count(*) desc, u.val) as rn
      from periods p
      join utm_values u on p.period = 'all' or u.period = p.period
      group by u.kind, u.kind_ord, p.period, u.val
    ) x
    join signup_totals t on t.period = x.period
    where x.rn <= 20
  ),
  all_rows as (
    select r.metric, r.period, r.bucket, r.numerator, r.denominator, r.mord, r.pord, 0::bigint as bord from ratio r
    union all
    select s.metric, s.period, s.bucket, s.numerator, s.denominator, s.mord, s.pord, s.bord from sources s
    union all
    select u.metric, u.period, u.bucket, u.numerator, u.denominator, u.mord, u.pord, u.bord from utm u
  )
  select a.metric, a.period, a.bucket, a.numerator, a.denominator,
         case when a.denominator > 0 then round(a.numerator::numeric / a.denominator, 4) end as rate
  from all_rows a
  order by a.mord, a.pord, a.bord;
$$;

revoke all on function public.metrics_rows_at(timestamptz) from public, anon, authenticated, service_role;

-- INV-Q1: 운영자(대표·직원)만. 아니면 42501 — 빈 결과가 아니라 거부다.
create or replace function public.admin_metrics()
returns table (metric text, period text, bucket text, numerator integer, denominator integer, rate numeric)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return query select m.metric, m.period, m.bucket, m.numerator, m.denominator, m.rate from public.metrics_rows_at(now()) m;
end $fn$;

revoke all on function public.admin_metrics() from public, anon, service_role;
grant execute on function public.admin_metrics() to authenticated;
