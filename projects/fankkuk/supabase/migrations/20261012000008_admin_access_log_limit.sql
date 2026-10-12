-- 운영자 내부 주소 열람 기록(admin_access_log) 다듬기 — 20261012000007 의 리뷰 반영 (2026-10-12 문제집 D12).
--
-- 1) 표마다 최신 p_limit 줄만 먼저 골라 합친 뒤 정렬·자른다. 두 표를 통째로 합쳐 정렬하던 것과 결과는 같다 —
--    합친 결과의 최신 p_limit 줄은 어느 표에서 왔든 그 표의 최신 p_limit 줄 안에 있다. 정렬 기준도 표 안과 밖이 같다(시각 → 줄 번호).
-- 2) 요청자 칸(owner / other)이 무엇에 기대는지 주석으로 밝힌다.
-- 반환 칸·인자·권한은 그대로다(create or replace). 기본 줄 수 200 과 범위 1~500 도 그대로 — 앱은 같은 값(ADMIN_ACCESS_LOG_LIMIT)을 넘긴다.
-- pii 스키마는 읽지 않는다.

create or replace function public.admin_access_log(p_limit integer default 200)
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
  with gift as (
    select l.at, 'gift'::text as target, o.order_no, l.result, l.print_no, l.deny_reason, l.requester_id,
           exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id) as released,
           0 as src, l.id as seq
    from public.decrypt_log l
    join public.orders o on o.id = l.order_id
    order by l.at desc, l.id desc
    limit p_limit
  ),
  revgift as (
    select l.at, 'revgift'::text as target, s.order_no, l.result, l.print_no, l.deny_reason, l.requester_id,
           exists (select 1 from public.revgift_decrypt_releases r where r.opened_log_id = l.id) as released,
           1 as src, l.id as seq
    from public.revgift_decrypt_log l
    join public.revgift_shares s on s.id = l.share_id
    order by l.at desc, l.id desc
    limit p_limit
  ),
  rows_ as (
    select * from gift
    union all
    select * from revgift
  )
  select x.at, x.target, x.order_no, x.result, x.print_no, x.deny_reason,
         -- 요청자가 대표인지는 기록 줄에 따로 없다 — 복호화 함수가 대표가 아닌 요청을 not_owner 로 거부하므로(INV-P8) 그 줄만 other 다.
         -- 이 판단은 복호화 함수 설정의 대표 ID 가 채워져 있다는 데 기댄다. 그 설정이 비면 대표의 요청도 not_owner 로 거부되어
         -- 여기서 other(「대표 아님」)로 보인다 — 그때 이 칸은 「대표 ID 설정과 맞지 않은 요청」으로 읽는다.
         case when x.deny_reason = 'not_owner' then 'other' else 'owner' end,
         p.nickname,
         x.released
  from rows_ x
  left join public.profiles p on p.id = x.requester_id
  -- 같은 시각이면 역조공 줄이 위(src 1), 같은 표 안에서는 나중 줄이 위
  order by x.at desc, x.src desc, x.seq desc
  limit p_limit;
end $$;

revoke all on function public.admin_access_log(integer) from public, anon, service_role;
grant execute on function public.admin_access_log(integer) to authenticated;

notify pgrst, 'reload schema';
