-- 승인 요청 알림에 보낸 팬 닉네임 · 선물 종류 · 개수 (notifications INV-N1·N3, 2026-10-29 사용자 결정 「가입 흐름과 승인 흐름 확정」).
-- 세 값은 앱이 넘기지 않는다 — 알림을 꺼낼 때(notification_claim) DB 가 주문에서 읽어 돌려준다. 다른 종류의 줄에는 비어 있다.
--
-- 뜻(approval-signature INV-S1 서명 원문과 같은 값 — 승인 흐름도 이 함수를 쓰면 정의가 하나가 된다):
--   보낸 팬 닉네임 = 그 주문의 팬 계정 닉네임(profiles.nickname)
--   선물 종류     = 팬이 등록 때 고른 정해진 목록 값의 라벨 = public.item_category_label(orders.item_category).
--                   orders.item_kind 는 쓰지 않는다 — 「기타」(other)면 팬이 직접 쓴 1~30자 글이 들어 있어서다(hard-items INV-H1).
--                   기타·종류 코드가 없는 옛 주문은 「기타」.
--   개수         = 그 주문의 상자 수(public.boxes 줄 수 — 처리할 일 목록의 box_count 와 같은 셈)
-- 여러 번 돌려도 같다(create or replace · drop if exists 뒤 다시 만듦). 데이터는 바꾸지 않는다.

create or replace function public.approval_gift_facts(p_order_id uuid)
returns table (fan_nickname text, gift_kind text, box_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.nickname,
         coalesce(public.item_category_label(o.item_category), public.item_category_label('other')),
         (select count(*)::integer from public.boxes b where b.order_id = o.id)
  from public.orders o
  join public.profiles p on p.id = o.fan_id
  where o.id = p_order_id
$$;
revoke all on function public.approval_gift_facts(uuid) from public, anon, authenticated;
grant execute on function public.approval_gift_facts(uuid) to service_role;

-- 알림 꺼내기 — 20261021000001 과 같고, 승인 요청 줄의 세 칸을 끝에 더했다. 돌려주는 칸이 바뀌어 지우고 다시 만든다(권한도 다시)
drop function if exists public.notification_claim(integer);
CREATE FUNCTION public.notification_claim(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, kind text, channel text, round smallint, order_no text, nickname text, auto_reject_at timestamp with time zone, undelivered_reason text, must_deliver boolean, attempts integer, claimed_at timestamp with time zone, sender_name text, dispose_due_at timestamp with time zone, approval_sender text, approval_gift_kind text, approval_box_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with picked as (
    select n.id,
           case
             when n.kind = 'approval_request' and not exists (
               select 1 from public.approval_requests r where r.id = n.approval_request_id and r.status = 'waiting') then 'request_not_waiting'
             when n.kind = 'revgift_offer' and not exists (
               select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
               where s.id = n.share_id and s.reply = 'waiting' and s.cancelled_at is null and d.status = 'done'
                 and now() < public.revgift_deadline(d.settled_at)) then 'share_not_waiting'
             -- 반송 주소 재알림: 그 사이 확인했거나 반송 대기가 아니면 보내지 않는다(INV-N22 「이미 확인한 상자에는 가지 않는다」)
             when n.kind = 'return_address_reminder' and not exists (
               select 1 from public.office_parcels x where x.id = n.parcel_id and x.state = 'return_waiting' and x.return_confirmed_at is null) then 'return_not_waiting'
             -- 추적 장치 발견·확인할 선물 재알림(차례 2, INV-N13 — 2026-10-21): 그 사이 골랐거나 처리·기한 지남·질문이 닫혔으면 보내지 않는다
             when n.kind in ('hold', 'creator_check') and n.round = 2 and not exists (
               select 1 from public.office_parcels x join public.office_creator_checks k on k.parcel_id = x.id
               where x.id = n.parcel_id
                 and x.state = (case when n.kind = 'hold' then 'tracker_held' else 'held' end)::public.office_state
                 and k.choice is null and k.answer is null and now() < x.inspected_at + interval '168 hours'
                 and (n.kind = 'hold' or not public.office_parcel_dead(x))) then 'check_not_waiting'
             -- 추가 결제 재알림(차례 2, INV-N18 — 2026-10-21): 그 주문에 아직 낼 수 있는 차액이 없으면(모두 결제·반송 대상·주문 끝남) 보내지 않는다
             when n.kind = 'difference_due' and n.round = 2 and not exists (
               select 1 from public.payments d join public.orders o on o.id = d.order_id
               where d.order_id = n.order_id and d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
                 and o.status in ('registered', 'received', 'labeled', 'inspected')
                 and coalesce(now() < public.difference_due_at(d.box_id), true)) then 'difference_not_due'
           end as closed_code,
           (now() >= n.event_at + interval '24 hours') as expired
    from public.notification_outbox n
    where n.status = 'pending' and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of n skip locked
  ), expired as (
    update public.notification_outbox n
    set status = 'failed', error_code = 'expired', finished_at = now()
    from picked p
    where n.id = p.id and p.expired and n.status = 'pending'
    returning n.id
  ), skipped as (
    update public.notification_outbox n
    set status = 'skipped', error_code = p.closed_code, finished_at = now()
    from picked p
    where n.id = p.id and not p.expired and p.closed_code is not null and n.status = 'pending'
    returning n.id
  ), claimed as (
    update public.notification_outbox n
    set status = 'sending', claimed_at = clock_timestamp()
    from picked p
    where n.id = p.id and not p.expired and p.closed_code is null and n.status = 'pending'
    returning n.*
  )
  select c.id, c.kind, c.channel, c.round, coalesce(o.order_no, rs.order_no, ss.order_no), pr.nickname,
         case when c.kind = 'approval_request' then o.registered_at + interval '168 hours' end,
         case when c.kind = 'gift_undelivered' then (case when o.status = 'expired' then 'expired' else 'declined' end) end,
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at,
         -- 역조공 받기만 — 보낸 크리에이터의 공개 이름(크리에이터 줄이 없으면 닉네임). 다른 종류는 비어 있다(INV-N1)
         case when c.kind = 'revgift_offer' then coalesce(cr.name, sp.nickname) end,
         -- 반송 주소 재알림만 — 처분 예정 시각(반송 대기 + 720시간, INV-N22). 다른 종류는 비어 있다
         case when c.kind = 'return_address_reminder' then pp.return_waiting_at + interval '720 hours' end,
         -- 승인 요청만 — 보낸 팬 닉네임 · 선물 종류(목록 라벨) · 상자 수(INV-N1, 2026-10-29). 다른 종류는 비어 있다
         case when c.kind = 'approval_request' then g.fan_nickname end,
         case when c.kind = 'approval_request' then g.gift_kind end,
         case when c.kind = 'approval_request' then g.box_count end
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = c.share_id
  left join public.revgift_sends sd on sd.id = ss.send_id
  left join public.profiles sp on sp.id = sd.sender_id
  left join public.creators cr on cr.profile_id = sd.sender_id
  join public.profiles pr on pr.id = c.account_id
  left join lateral public.approval_gift_facts(case when c.kind = 'approval_request' then c.order_id end) g on true
  order by c.id;
end $function$;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;

notify pgrst, 'reload schema';
