-- 「아직 보내지 않음」과 운영자 「배송문제 확인」 (DECISIONS 2026-10-21 「도착하지 않은 상자는 30일 하나로, 알림 세 번」, 사용자 「그렇게하자」).
-- 스펙: office-workflow INV-W10 (S10f) · INV-W7, notifications INV-N15.
--
-- 1) 주문 칸 fan_not_sent_at — 보낸 사람이 「아직 보내지 않음」을 누른 시각(「고객 확인: 아직 안 보냄」). 다시 누르면 시각만 바뀐다.
--    기한은 바꾸지 않는다 — 자동 처리는 지금처럼 결제 완료 + 720시간에 닫는다(이 칸을 읽지 않는다).
-- 2) mark_gift_not_sent(주문번호) — 로그인 토큰의 계정이 보낸 진행 중 주문이고 아직 입고 전이며 닫히지 않은 상자가 있을 때만.
--    남의 주문·없는 주문·상자가 다 온 주문·끝난 주문은 같은 「없음」(P0002 — 있는지 알려 주지 않는다).
-- 3) admin_shipping_issues() — 운영자만. 결제 완료 + 168시간이 지났고 아직 입고 전·닫히지 않은 상자가 있는 승인된 진행 중 주문.
--    칸: 주문번호 · 보낸 사람 닉네임 · 결제 완료 시각 · 결제 후 경과일 · 미도착 상자 수 · 고객 답변 시각 · 자동 취소일(결제 + 720시간). 실명·주소·전화번호는 없다(INV-W7).
--    결제 후 경과일 순(오래된 것 먼저).
-- 개인정보 구역(pii)은 건드리지 않는다.

alter table public.orders add column if not exists fan_not_sent_at timestamptz;
comment on column public.orders.fan_not_sent_at is '보낸 사람이 「아직 보내지 않음」을 누른 시각(office-workflow INV-W10). 기한을 바꾸지 않는다.';

create or replace function public.mark_gift_not_sent(p_order_no text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  -- 사람 ID 는 받지 않는다 — 로그인 토큰의 계정이 보낸 주문만. 진행 중이고 아직 입고 전·닫히지 않은 상자가 있을 때만
  update public.orders o
  set fan_not_sent_at = now()
  where o.order_no = p_order_no and o.fan_id = v_uid
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and exists (select 1 from public.boxes b
                where b.order_id = o.id and b.missing_at is null
                  and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
  returning o.fan_not_sent_at into v_at;
  if v_at is null then
    raise exception '아직 보내지 않음을 남길 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  return v_at;
end $$;
revoke all on function public.mark_gift_not_sent(text) from public, anon;
grant execute on function public.mark_gift_not_sent(text) to authenticated;

create or replace function public.admin_shipping_issues()
returns table (order_no text, sender_nickname text, paid_at timestamptz, elapsed_days integer, missing_boxes integer, not_sent_at timestamptz, auto_cancel_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return query
  select o.order_no, f.nickname, o.registered_at,
         floor(extract(epoch from (now() - o.registered_at)) / 86400)::integer,
         m.n, o.fan_not_sent_at, o.registered_at + interval '720 hours'
  from public.orders o
  join public.profiles f on f.id = o.fan_id
  join lateral (
    select count(*)::integer as n from public.boxes b
    where b.order_id = o.id and b.missing_at is null
      and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting')
  ) m on m.n > 0
  where o.approved_at is not null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.registered_at <= now() - interval '168 hours'
  order by o.registered_at, o.order_no
  limit 500;
end $$;
revoke all on function public.admin_shipping_issues() from public, anon;
grant execute on function public.admin_shipping_issues() to authenticated;

notify pgrst, 'reload schema';
