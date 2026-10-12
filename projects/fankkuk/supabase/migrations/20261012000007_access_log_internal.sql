-- 열람 기록 공개 범위 바꿈 (2026-10-12 정책 문제집 D12 — 2026-10-08 결정 ⑨를 바꾼다).
--
-- 크리에이터(my_access_log)와 역조공 받는 팬(my_revgift_access_log)에게는 주소가 열린 줄(시각·몇 번째)과 지운 줄만 돌려준다.
-- 거부 줄(직원 시도 「대표 아님」 포함)과 대표·직원 구분은 돌려주지 않는다 — 운영자만 읽는 내부 기록(admin_access_log)으로 옮긴다.
-- 기록 표 셋(decrypt_log · revgift_decrypt_log · revgift_address_events)과 그 권한·쓰는 함수는 그대로다 — 직원의 시도는 지금처럼
-- 복호화 함수까지 가서 거부 줄로 남는다(address-protection INV-P7). 바뀌는 것은 누가 어느 줄을 읽느냐뿐이다.
--
-- 반환 칸이 줄어 크리에이터·팬 함수는 지우고 다시 만든다 — 권한도 다시 준다.
-- pii 스키마는 읽지 않는다(주소 값은 어느 칸에도 없다).

-- ── 1) 크리에이터 열람 기록: 연 줄만 ─────────────────────────────

drop function if exists public.my_access_log(integer);

-- 칸: 시각 · 주문번호 · 그 상자의 몇 번째 출력(INV-P5) · 돌려받은 줄인지(INV-P15 — 화면에 「출력 실패」).
-- p_limit 은 없음(null = 전부) 또는 1~100. 0·음수·100 초과는 거부한다.
create function public.my_access_log(p_limit integer default null)
returns table (
  at timestamptz,
  order_no text,
  print_no smallint,
  released boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is not null and (p_limit < 1 or p_limit > 100) then
    raise exception '읽을 줄 수는 1~100 이다' using errcode = '22023';
  end if;
  return query
  select l.at, o.order_no, l.print_no,
         exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id)
  from public.decrypt_log l
  join public.orders o on o.id = l.order_id
  join public.creators c on c.id = o.creator_id
  where c.profile_id = auth.uid()
    and l.result = 'opened'
  order by l.at desc, l.id desc
  limit p_limit; -- null 이면 제한 없음
end $$;

revoke all on function public.my_access_log(integer) from public, anon;
grant execute on function public.my_access_log(integer) to authenticated;

-- ── 2) 이번 달 숫자: 승인 · 열림 · 재출력 (거부 숫자는 내보내지 않는다) ─────────────────────────────

drop function if exists public.my_access_month_summary();

create function public.my_access_month_summary()
returns table (approved_count integer, opened_count integer, reprint_count integer)
language sql stable security definer set search_path = ''
as $$
  with m as (
    select (t.start at time zone 'Asia/Seoul') as since,
           ((t.start + interval '1 month') at time zone 'Asia/Seoul') as until
    from (select date_trunc('month', now() at time zone 'Asia/Seoul') as start) t
  ),
  mine as (
    select o.id, o.approved_at
    from public.orders o
    join public.creators c on c.id = o.creator_id
    where c.profile_id = auth.uid()
  ),
  logs as (
    select l.print_no, exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id) as released
    from public.decrypt_log l
    join mine on mine.id = l.order_id
    cross join m
    where l.result = 'opened' and l.at >= m.since and l.at < m.until
  )
  select
    (select count(*) from mine cross join m where mine.approved_at >= m.since and mine.approved_at < m.until)::integer,
    (select count(*) from logs)::integer,
    -- 돌려준 줄은 열림으로는 세고(주소는 열렸다) 재출력으로는 세지 않는다(송장이 안 나왔다)
    (select count(*) from logs where logs.print_no >= 2 and not logs.released)::integer;
$$;

revoke all on function public.my_access_month_summary() from public, anon;
grant execute on function public.my_access_month_summary() to authenticated;

-- ── 3) 팬의 몫 열람 기록: 연 줄과 지운 줄만 ─────────────────────────────

drop function if exists public.my_revgift_access_log(text);

-- 칸: 시각 · 종류(opened 연 줄 / deleted 지운 줄) · 몇 번째 출력 · 지운 까닭(shipped·returned·cancelled) · 돌려받은 줄인지.
-- plpgsql 로 둔다 — 지운 줄 표(revgift_address_events)는 사람이 적용하는 manual/0006 이 만들어서 새 DB 에서는 아직 없을 수 있다.
create function public.my_revgift_access_log(p_order_no text)
returns table (
  at timestamptz,
  kind text,
  print_no smallint,
  outcome text,
  released boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with mine as (
    select s.id
    from public.revgift_shares s
    where s.order_no = p_order_no
      and s.fan_id = auth.uid()
  ),
  rows_ as (
    select l.at, 'opened'::text as kind, l.print_no, null::text as outcome,
           exists (select 1 from public.revgift_decrypt_releases r where r.opened_log_id = l.id) as released,
           0 as src, l.id as seq
    from public.revgift_decrypt_log l
    join mine on mine.id = l.share_id
    where l.result = 'opened'
    union all
    select e.at, 'deleted', null::smallint, e.outcome, false,
           1, 0::bigint
    from public.revgift_address_events e
    join mine on mine.id = e.share_id
    where e.event = 'deleted'
  )
  -- 같은 시각이면 지운 줄이 위(주소는 마지막에 지워진다), 연 줄끼리는 나중 줄이 위
  select r.at, r.kind, r.print_no, r.outcome, r.released
  from rows_ r
  order by r.at desc, r.src desc, r.seq desc;
end $$;

revoke all on function public.my_revgift_access_log(text) from public, anon;
grant execute on function public.my_revgift_access_log(text) to authenticated;

-- ── 4) 운영자 내부 기록: 연 줄·거부 줄 전부, 대표인지와 닉네임까지 ─────────────────────────────

-- 팬 선물(decrypt_log)과 역조공 몫(revgift_decrypt_log)의 기록을 최신 줄부터 p_limit 줄(1~500, 기본 200).
-- 운영자(대표·직원)가 아니면 42501. 칸: 시각 · 대상(gift 팬 선물 / revgift 역조공 몫) · 주문번호 · 결과 · 몇 번째 출력 · 거부 사유
-- · 요청자가 대표인지(owner / other — 크리에이터 화면이 쓰던 판단 그대로: 복호화 함수는 대표가 아닌 요청을 not_owner 로 거부한다, INV-P8)
-- · 요청자 닉네임(관리자 화면은 사람을 아이디·닉네임으로만 보인다 — admin-console INV-K8. 계정 id 는 싣지 않는다) · 돌려받은 줄인지.
drop function if exists public.admin_access_log(integer);
create function public.admin_access_log(p_limit integer default 200)
returns table (
  at timestamptz,
  target text,
  order_no text,
  result text,
  print_no smallint,
  deny_reason text,
  requester text,
  requester_nickname text,
  released boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception '읽을 줄 수는 1~500 이다' using errcode = '22023';
  end if;
  return query
  with rows_ as (
    select l.at, 'gift'::text as target, o.order_no, l.result, l.print_no, l.deny_reason, l.requester_id,
           exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id) as released,
           0 as src, l.id as seq
    from public.decrypt_log l
    join public.orders o on o.id = l.order_id
    union all
    select l.at, 'revgift', s.order_no, l.result, l.print_no, l.deny_reason, l.requester_id,
           exists (select 1 from public.revgift_decrypt_releases r where r.opened_log_id = l.id),
           1, l.id
    from public.revgift_decrypt_log l
    join public.revgift_shares s on s.id = l.share_id
  )
  select x.at, x.target, x.order_no, x.result, x.print_no, x.deny_reason,
         case when x.deny_reason = 'not_owner' then 'other' else 'owner' end,
         p.nickname,
         x.released
  from rows_ x
  left join public.profiles p on p.id = x.requester_id
  order by x.at desc, x.src desc, x.seq desc
  limit p_limit;
end $$;

revoke all on function public.admin_access_log(integer) from public, anon, service_role;
grant execute on function public.admin_access_log(integer) to authenticated;

notify pgrst, 'reload schema';
