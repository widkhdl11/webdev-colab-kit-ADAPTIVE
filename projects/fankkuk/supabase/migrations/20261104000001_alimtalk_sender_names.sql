-- 알림톡에 보낸 사람 이름을 넣는다 (2026-11-04 카카오 검수 반려 — DECISIONS 2026-11-04, 사용자 지시)
-- notifications INV-N1 · notification-batching INV-NB3 를 바꿈. 템플릿 본문의 정본은 docs/copy/alimtalk-templates.md 2·3·8·10절.
--
-- 알림을 꺼내는 함수(notification_claim)가 이미 돌려주던 보낸 사람 이름 칸(sender_name — 역조공 받기)을 세 종류에도 채운다.
--   승인 요청(approval_request): 이 통에 새로 묶인 요청을 보낸 팬 — 가장 먼저 온 요청(요청 시각 순)의 팬 닉네임.
--     「이 통에 새로 묶인 요청」 = 이 줄이 가리키는 요청 + 같은 크리에이터의 요청 중 바로 앞 승인 요청 통이 가리킨 요청보다 뒤, 이 줄의 요청보다 앞에 온 것.
--     창 첫 통이면 창을 연 요청 하나, 창 끝 통이면 창 안에 쌓인 요청들(INV-NB1 ②③). 끝 통 없이 새 창이 열렸으면 쌓였던 요청도 새 첫 통에 들어간다(INV-NB1 ③ 끝).
--     「바로 앞 통」은 발송 줄이 생긴 순서(DB 시각)로 고르고, 같은 요청을 가리키는 줄(같은 통의 다른 통로)은 앞 통으로 치지 않는다.
--     이 줄이 가리키는 요청은 늘 들어간다 — 요청 시각이 같거나 앞뒤가 뒤바뀌어도 이름 칸이 비지 않는다. 앞 통이 없으면 이 줄의 요청 하나뿐이다.
--   승인 재알림(approval_reminder): 보내는 순간 대기 중인 요청(처리할 일 목록과 같은 판정 approval_request_open)의 팬 —
--     가장 빨리 자동 반려될(결제 완료가 가장 이른) 요청의 팬이 앞.
--   답장 도착(gift_reply): 답장한 크리에이터의 공개 이름(크리에이터 줄의 이름, 없으면 닉네임 — 역조공 받기와 같은 규칙).
-- 새 칸 sender_count: 승인 요청·재알림만 — 그 요청들을 보낸 서로 다른 팬의 수. 「별빛님 외 2명」 꼴은 앱이 이 두 칸으로 만든다.
-- 선물 종류·개수·주문번호는 여전히 돌려주지 않는다.
-- 돌려주는 칸이 바뀌어 지우고 다시 만든다(권한도 다시). 나머지 본문은 20261030000001_notification_batching 과 같다. 데이터는 바꾸지 않는다.
-- 운영 적용 순서: 앱 배포 전에 적용해도 된다 — 옛 앱은 새 칸(sender_count)을 읽지 않고, 승인 요청·재알림·답장의 sender_name 도 쓰지 않는다.

drop function if exists public.notification_claim(integer);
create function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid, kind text, channel text, round smallint, order_no text, nickname text, undelivered_reason text, must_deliver boolean,
  attempts integer, claimed_at timestamptz, sender_name text, dispose_due_at timestamptz,
  waiting_count integer, days_left integer, item_count integer, recipient_is_creator boolean, sender_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select n.id,
           case
             -- 승인 요청(창 첫 통·끝 통): 보내는 순간 그 크리에이터의 대기가 0건이면 보내지 않는다(INV-NB1)
             when n.kind = 'approval_request' and not exists (
               select 1 from public.approval_requests r join public.orders o on o.id = r.order_id join public.creators cr on cr.id = o.creator_id
               where cr.profile_id = n.account_id and public.approval_request_open(r.id)) then 'no_waiting_requests'
             -- 승인 재알림: 그 요청이 대기가 아니면 보내지 않는다. 그 크리에이터의 창이 열려 있어도(10분 안에 승인 요청 알림이 갔다) 보내지 않는다(INV-NB2)
             when n.kind = 'approval_reminder' and not public.approval_request_open(n.approval_request_id) then 'request_not_waiting'
             when n.kind = 'approval_reminder' and exists (
               select 1 from public.approval_notice_windows w where w.account_id = n.account_id and w.ends_at > now()) then 'approval_window_open'
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
  ), waiting as (
    -- 받는 크리에이터의 대기 승인 요청 — 건수와 가장 이른 자동 반려 시각(결제 완료 + 168시간)을 보내는 순간에 센다(INV-NB1·NB2)
    select cr.profile_id as account_id, count(*)::integer as n, min(o.registered_at) + interval '168 hours' as first_reject_at
    from public.approval_requests r join public.orders o on o.id = r.order_id join public.creators cr on cr.id = o.creator_id
    where public.approval_request_open(r.id) and cr.profile_id in (select c.account_id from claimed c where c.kind in ('approval_request', 'approval_reminder'))
    group by cr.profile_id
  ), request_members as (
    -- 승인 요청 통에 새로 묶인 요청(위 머리말) — 이 줄의 요청 + 바로 앞 통의 요청과 이 줄의 요청 사이에 온 같은 크리에이터의 요청
    select c.id as outbox_id, r.created_at as came_at, r.id as request_id, o.fan_id
    from claimed c
    join public.approval_requests cur on cur.id = c.approval_request_id
    left join lateral (
      select pr.created_at, pr.id
      from public.notification_outbox m join public.approval_requests pr on pr.id = m.approval_request_id
      where m.kind = 'approval_request' and m.account_id = c.account_id and m.approval_request_id <> c.approval_request_id
        and (m.created_at, m.id) < (c.created_at, c.id)
      order by m.created_at desc, m.id desc
      limit 1
    ) prev on true
    -- 앞 통이 없으면(그 크리에이터의 첫 승인 요청 통) 이 줄의 요청 하나 — 알림 줄이 생기기 전의 옛 요청을 끌어오지 않는다
    join public.approval_requests r on r.id = cur.id or (
      prev.id is not null
      and (r.created_at, r.id) < (cur.created_at, cur.id)
      and (r.created_at, r.id) > (prev.created_at, prev.id))
    join public.orders o on o.id = r.order_id
    join public.creators k on k.id = o.creator_id and k.profile_id = c.account_id
    where c.kind = 'approval_request'
    union all
    -- 승인 재알림 — 보내는 순간 대기 중인 요청 전부, 자동 반려가 가장 이른(결제 완료가 가장 이른) 순
    select c.id, o.registered_at, r.id, o.fan_id
    from claimed c
    join public.creators k on k.profile_id = c.account_id
    join public.orders o on o.creator_id = k.id
    join public.approval_requests r on r.order_id = o.id
    where c.kind = 'approval_reminder' and public.approval_request_open(r.id)
  ), request_senders as (
    -- 맨 앞 팬의 닉네임과 서로 다른 팬의 수(INV-N1 · INV-NB3, 2026-11-04)
    select rm.outbox_id, (array_agg(fp.nickname order by rm.came_at, rm.request_id))[1] as first_nickname, count(distinct rm.fan_id)::integer as fans
    from request_members rm join public.profiles fp on fp.id = rm.fan_id
    group by rm.outbox_id
  )
  select c.id, c.kind, c.channel, c.round,
         -- 묶음 알림은 주문번호를 내주지 않는다(INV-NB3)
         case when c.kind not in ('approval_request', 'approval_reminder', 'status_digest') then coalesce(o.order_no, rs.order_no, ss.order_no) end,
         pr.nickname,
         case when c.kind = 'gift_undelivered' then (case when o.status = 'expired' then 'expired' else 'declined' end) end,
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at,
         -- 보낸 사람 이름(INV-N1): 역조공 받기 — 보낸 크리에이터의 공개 이름(크리에이터 줄이 없으면 닉네임) ·
         -- 승인 요청·재알림 — 맨 앞 팬의 닉네임 · 답장 도착 — 답장한 크리에이터의 공개 이름(2026-11-04). 다른 종류는 비어 있다
         case
           when c.kind = 'revgift_offer' then coalesce(cr.name, sp.nickname)
           when c.kind in ('approval_request', 'approval_reminder') then snd.first_nickname
           when c.kind = 'gift_reply' then coalesce(gc.name, gp.nickname)
         end,
         -- 반송 주소 재알림만 — 처분 예정 시각(반송 대기 + 720시간, INV-N22). 다른 종류는 비어 있다
         case when c.kind = 'return_address_reminder' then pp.return_waiting_at + interval '720 hours' end,
         -- 승인 요청·재알림만 — 보내는 순간의 승인 대기 건수(INV-NB1·NB3)
         case when c.kind in ('approval_request', 'approval_reminder') then coalesce(wt.n, 0) end,
         -- 재알림만 — 가장 빨리 자동 반려될 건까지 남은 시간을 하루 단위로 올림, 최소 1(INV-NB2)
         case when c.kind = 'approval_reminder' then
           greatest(1, ceil(extract(epoch from (wt.first_reject_at - now())) / 86400.0))::integer end,
         -- 하루 묶음만 — 소식 건수(INV-NB5)
         case when c.kind = 'status_digest' then c.item_count end,
         -- 받는 사람이 크리에이터인가 — 하루 묶음 링크(팬 /gifts · 크리에이터 /creator/actions)
         exists (select 1 from public.creators x where x.profile_id = c.account_id),
         -- 승인 요청·재알림만 — 보낸 서로 다른 팬의 수(「외 N명」, 2026-11-04)
         case when c.kind in ('approval_request', 'approval_reminder') then snd.fans end
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = c.share_id
  left join public.revgift_sends sd on sd.id = ss.send_id
  left join public.profiles sp on sp.id = sd.sender_id
  left join public.creators cr on cr.profile_id = sd.sender_id
  left join public.creators gc on gc.id = o.creator_id
  left join public.profiles gp on gp.id = gc.profile_id
  left join waiting wt on wt.account_id = c.account_id
  left join request_senders snd on snd.outbox_id = c.id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $$;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;

notify pgrst, 'reload schema';
