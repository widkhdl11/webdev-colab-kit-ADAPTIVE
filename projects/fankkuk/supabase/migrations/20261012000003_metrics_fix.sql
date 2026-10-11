-- 2026-10-12 측정 리뷰 반영 — metrics_rows_at 만 다시 만든다(칸·권한은 그대로). 스펙: metrics INV-Q2·Q3.
--
-- 1) 재발송률 세 줄(resend · resend_replied · resend_not_replied)의 달마다 칸은 「60일이 다 지난 최근 3개 첫 선물 달」이다.
--    그 달 마지막 날 + 60일 ≤ 기준 시각인 달 — 그 달에 첫 선물을 보낸 팬은 모두 60일이 지났다. 최근 3개월(이번 달·앞 두 달)은
--    늘 60일이 덜 지나 분모가 0 이었다. 다른 지표(답장률·바꾼 비율·거절률·가입 경로)의 최근 3개월은 그대로다.
-- 2) 두 번째 선물 시각은 팬마다 결제 시각 순서의 다음 줄(lead)로 구한다 — 팬마다 보낸 선물 전체를 다시 훑지 않는다. 결과는 같다.
-- 3) 답장 여부는 기준 시각까지 단 답장만(replied_at ≤ 기준 시각) — 감사 답장률·답장 여부별 재발송률 둘 다.
-- 4) utm 값별 집계는 전체 기간만(화면이 전체만 쓴다).
-- 5) 비율은 반올림하지 않고 분자 ÷ 분모 그대로 — 소수 자리 정하기는 화면 한 곳에서만 한다.
--
-- 다시 적용해도 결과가 같다(create or replace, 권한 다시 회수).

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
  -- 재발송률 달: 그 달 다음 달 1일 0시(한국) + 60일 ≤ 기준 시각인 달 가운데 최근 셋. 60일 ≈ 두 달이라 앞 여섯 달 안에 늘 셋이 있다.
  cohort_months as (
    select to_char(c.d, 'YYYY-MM') as period, row_number() over (order by c.d desc)::integer as ord
    from (
      select date_trunc('month', p_now at time zone 'Asia/Seoul') - make_interval(months => k) as d
      from generate_series(0, 6) as g(k)
    ) c
    where ((c.d + interval '1 month') at time zone 'Asia/Seoul') + interval '60 days' <= p_now
    order by c.d desc
    limit 3
  ),
  cohort_periods as (
    select 'all'::text as period, -1 as ord
    union all
    select cm.period, cm.ord from cohort_months cm
  ),
  sent as (
    select o.id, o.fan_id, o.registered_at
    from public.orders o
    where public.gift_was_sent(o.status, o.registered_at) and o.registered_at <= p_now
  ),
  -- 팬마다 결제 시각 순서(같으면 주문 id 순) — 첫 줄이 첫 선물, 다음 줄의 시각이 두 번째 선물
  ranked as (
    select s.fan_id, s.id as order_id, s.registered_at,
           row_number() over w as rn,
           lead(s.registered_at) over w as second_at
    from sent s
    window w as (partition by s.fan_id order by s.registered_at, s.id)
  ),
  cohort as (
    select
      to_char(f.registered_at at time zone 'Asia/Seoul', 'YYYY-MM') as period,
      coalesce(f.second_at <= f.registered_at + interval '60 days', false) as resent,
      exists (
        select 1 from public.gift_replies r
        where r.order_id = f.order_id and r.phrase is not null and r.replied_at <= p_now
      ) as replied
    from ranked f
    where f.rn = 1 and f.registered_at <= p_now - interval '60 days'
  ),
  facts as (
    select 'resend'::text as metric, c.period, c.resent as hit from cohort c
    union all
    select case when c.replied then 'resend_replied' else 'resend_not_replied' end, c.period, c.resent from cohort c
    union all
    select 'reply', to_char(r.received_at at time zone 'Asia/Seoul', 'YYYY-MM'), r.phrase is not null and r.replied_at <= p_now
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
  metric_periods as (
    select k.metric, k.ord as mord, p.period, p.ord as pord
    from unnest(array['resend', 'resend_replied', 'resend_not_replied']) with ordinality as k(metric, ord)
    cross join cohort_periods p
    union all
    select k.metric, k.ord + 3, p.period, p.ord
    from unnest(array['reply', 'notice_changed', 'decline']) with ordinality as k(metric, ord)
    cross join periods p
  ),
  ratio as (
    select mp.metric, mp.period, ''::text as bucket,
           count(f.metric) filter (where f.hit)::integer as numerator,
           count(f.metric)::integer as denominator,
           mp.mord, mp.pord
    from metric_periods mp
    left join facts f on f.metric = mp.metric and (mp.period = 'all' or f.period = mp.period)
    group by mp.metric, mp.mord, mp.period, mp.pord
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
    select v.kind, v.kind_ord, v.val from signups g
    cross join lateral (values ('utm_source', 8, g.utm_source), ('utm_medium', 9, g.utm_medium), ('utm_campaign', 10, g.utm_campaign)) as v(kind, kind_ord, val)
    where v.val is not null
  ),
  -- utm 은 전체 기간만, 값마다 많은 순 20개까지
  utm as (
    select x.kind as metric, 'all'::text as period, x.val as bucket, x.n as numerator, t.total as denominator, x.kind_ord::bigint as mord, t.ord as pord, x.rn as bord
    from (
      select u.kind, u.kind_ord, u.val, count(*)::integer as n,
             row_number() over (partition by u.kind order by count(*) desc, u.val) as rn
      from utm_values u
      group by u.kind, u.kind_ord, u.val
    ) x
    join signup_totals t on t.period = 'all'
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
         case when a.denominator > 0 then a.numerator::numeric / a.denominator end as rate
  from all_rows a
  order by a.mord, a.pord, a.bord;
$$;

revoke all on function public.metrics_rows_at(timestamptz) from public, anon, authenticated, service_role;
