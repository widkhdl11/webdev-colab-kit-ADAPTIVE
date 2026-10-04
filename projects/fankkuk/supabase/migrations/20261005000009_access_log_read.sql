-- 크리에이터 「주소 열람 기록」 읽기 (주소 보호 스펙 INV-P7: 크리에이터는 자기 주문의 기록 전부를 본다).
--
-- 기록 표(decrypt_log)의 권한은 그대로 둔다 — 앱 서버는 읽기만, 복호화 전용 역할만 쓰기, 고치기·지우기는 아무도(INV-P7).
-- 로그인한 크리에이터는 아래 함수로만 읽는다. 인자를 받지 않고 auth.uid() 로 크리에이터를 고른다
-- (my_approval_requests 와 같은 방식: 주문 → creators.profile_id = auth.uid()).
--
-- 요청자는 계정 id·아이디·닉네임을 내보내지 않고 「대표」인지 아닌지만 돌려준다. 판단은 기록 자체로 한다 —
-- 복호화 함수는 대표 계정이 아닌 요청을 not_owner 로 거부하고 그 밖의 줄은 대표 계정의 요청이다(INV-P8).
-- DB 의 역할 컬럼은 대표 판단 근거가 아니므로(INV-P8) 프로필과 잇지 않는다.
--
-- 역조공(팬 주소) 쪽 기록은 여기 없다.

-- 기록은 전부 돌려준다(INV-P7). p_limit 을 주면 최신 줄부터 그만큼만 — 크리에이터 메인의 「최근 열람 기록」 세 줄.
-- p_limit 은 없음(null = 전부) 또는 1~100. 0·음수·100 초과는 거부한다.
create function public.my_access_log(p_limit integer default null)
returns table (
  at timestamptz,
  order_no text,
  result text,
  print_no smallint,
  deny_reason text,
  requester text
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is not null and (p_limit < 1 or p_limit > 100) then
    raise exception '읽을 줄 수는 1~100 이다' using errcode = '22023';
  end if;
  return query
  select l.at, o.order_no, l.result, l.print_no, l.deny_reason,
         case when l.deny_reason = 'not_owner' then 'other' else 'owner' end
  from public.decrypt_log l
  join public.orders o on o.id = l.order_id
  join public.creators c on c.id = o.creator_id
  where c.profile_id = auth.uid()
  order by l.at desc, l.id desc
  limit p_limit; -- null 이면 제한 없음
end $$;

-- 같은 화면의 「이번 달」 숫자 넷: 승인한 주문 · 주소 열림 · 그중 재출력(2회째부터, INV-P5) · 거부.
-- 이번 달은 서울 기준 달력 달 [1일 00:00, 다음 달 1일 00:00) 이다. 기록 줄 수와 상관없이 DB 가 직접 센다.
create function public.my_access_month_summary()
returns table (approved_count integer, opened_count integer, reprint_count integer, denied_count integer)
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
    select l.result, l.print_no
    from public.decrypt_log l
    join mine on mine.id = l.order_id
    cross join m
    where l.at >= m.since and l.at < m.until
  )
  select
    (select count(*) from mine cross join m where mine.approved_at >= m.since and mine.approved_at < m.until)::integer,
    (select count(*) from logs where logs.result = 'opened')::integer,
    (select count(*) from logs where logs.result = 'opened' and logs.print_no >= 2)::integer,
    (select count(*) from logs where logs.result = 'denied')::integer;
$$;

revoke all on function public.my_access_log(integer) from public, anon;
revoke all on function public.my_access_month_summary() from public, anon;
grant execute on function public.my_access_log(integer) to authenticated;
grant execute on function public.my_access_month_summary() to authenticated;
