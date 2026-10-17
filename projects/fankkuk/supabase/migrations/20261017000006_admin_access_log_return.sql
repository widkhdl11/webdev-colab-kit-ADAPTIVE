-- 운영자 내부 주소 열람 기록(admin_access_log)에 반송 송장의 주소 열기 줄을 더한다 (address-protection INV-P7·P18, office-workflow INV-W15).
--
-- 20261017000004 가 반송 송장의 주소 열기 기록 표(return_decrypt_log · return_decrypt_releases)를 만들었지만, 운영자 화면의 내부 열람 기록은
-- 팬 선물(decrypt_log)·역조공(revgift_decrypt_log) 두 표만 읽어 반송 때 연 줄과 거부 줄(직원 시도 「대표 아님」 포함)이 운영자에게 보이지 않았다.
-- 세 번째 표를 같은 꼴로 합친다 — 대상 칸(target)은 'return', 주문번호는 그 상자의 주문(팬 선물 상자) 또는 몫(역조공 몫 상자)의 번호.
-- 반환 칸·인자·권한·줄 수 범위는 그대로다(create or replace). 대상 칸에 값이 하나 늘어 앱의 읽기 꼴도 같이 늘린다.
-- 정렬: 시각 → 같은 시각이면 반송(2)·역조공(1)·팬 선물(0) 순 → 같은 표 안에서는 나중 줄이 위.
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
  -- 반송 송장(INV-P18) — 주문에 이어진 상자만 주소를 열고, 이어지지 않은 상자의 거부 줄은 주문번호가 없어 빠진다
  returns_ as (
    select l.at, 'return'::text as target,
           coalesce(o.order_no, s.order_no) as order_no,
           l.result, l.print_no, l.deny_reason, l.requester_id,
           exists (select 1 from public.return_decrypt_releases r where r.opened_log_id = l.id) as released,
           2 as src, l.id as seq
    from public.return_decrypt_log l
    join public.office_parcels p on p.id = l.parcel_id
    left join public.boxes b on b.id = p.box_id
    left join public.orders o on o.id = b.order_id
    left join public.revgift_shares s on s.id = p.share_id
    where coalesce(o.order_no, s.order_no) is not null
    order by l.at desc, l.id desc
    limit p_limit
  ),
  rows_ as (
    select * from gift
    union all
    select * from revgift
    union all
    select * from returns_
  )
  select x.at, x.target, x.order_no, x.result, x.print_no, x.deny_reason,
         -- 요청자가 대표인지는 기록 줄에 따로 없다 — 복호화 함수가 대표가 아닌 요청을 not_owner 로 거부하므로(INV-P8) 그 줄만 other 다(20261012000008 과 같다)
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
