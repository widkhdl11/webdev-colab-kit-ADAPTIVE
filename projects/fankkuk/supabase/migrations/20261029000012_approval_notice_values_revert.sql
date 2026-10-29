-- 승인 요청 알림 본문에서 보낸 팬 닉네임·선물 종류·개수를 다시 뺀다 (notifications INV-N1).
-- 2026-10-29 운영 준비 카드 d2 사용자 답 ②: 「알림톡 본문에 팬 닉네임·선물 종류·개수는 넣지 않는다. 승인 화면에서만 보인다.
-- 본문 문구는 다음 작업에서 알림 규칙과 함께 정한다.」 — 20261029000001 이 더한 세 칸과 그 값을 고르는 함수를 없앤다.

-- 알림 꺼내기 — 20261029000001 앞의 판으로 되돌린다(승인 요청 줄의 세 칸을 뺌). 돌려주는 칸이 바뀌어 지우고 다시 만든다(권한도 다시)
drop function if exists public.notification_claim(integer);
CREATE FUNCTION public.notification_claim(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, kind text, channel text, round smallint, order_no text, nickname text, auto_reject_at timestamp with time zone, undelivered_reason text, must_deliver boolean, attempts integer, claimed_at timestamp with time zone, sender_name text, dispose_due_at timestamp with time zone)
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
         case when c.kind = 'return_address_reminder' then pp.return_waiting_at + interval '720 hours' end
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = c.share_id
  left join public.revgift_sends sd on sd.id = ss.send_id
  left join public.profiles sp on sp.id = sd.sender_id
  left join public.creators cr on cr.profile_id = sd.sender_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $function$;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;


drop function if exists public.approval_gift_facts(uuid);

notify pgrst, 'reload schema';
