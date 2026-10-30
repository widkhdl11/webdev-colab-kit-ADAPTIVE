-- 크리에이터 처리할 일의 승인 요청 순서 (action-center INV-J5, 2026-10-30).
-- 알림톡 [승인 화면 열기]가 주문 없이 승인 대기 목록으로 오므로(notification-batching INV-NB4), 목록 맨 위에 새 요청을 둔다 —
-- 결제 뒤 24시간 안인 승인 요청을 최근 순으로 먼저, 그다음 나머지를 오래된 순(카드 fankkuk-20261030-1-d1 「추천대로」).
-- 함수 본문은 20261021000004 그대로이고 정렬 줄 둘만 더했다. 돌려주는 칸이 같아 권한은 그대로 남는다.

CREATE OR REPLACE FUNCTION public.my_creator_action_items()
 RETURNS TABLE(kind text, board text, order_no text, request_id text, share_id uuid, box_id uuid, box_seq integer, box_count integer, box_label text, nickname text, item_kind text, tier text, measured_tier text, amount_krw integer, has_electronics_or_metal boolean, bluetooth boolean, rf boolean, choice text, sent_at timestamp with time zone, received_at timestamp with time zone, due_at timestamp with time zone, prior_gift_count integer, prior_passed_count integer, prior_returned_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select p.id as uid from public.profiles p where p.id = auth.uid() and p.role = 'creator'
  ),
  lines as (
    -- 추적 장치 발견 / 블루투스 발견: 그 일을 받아 주는 고르기(choose_creator_check)와 같은 판정 —
    -- 추적기 보관 · 운영자 처리 전 · 기한 전(주문이 끝나도) / 확인 대기 · 운영자 처리 전 · 기한 전 · 주문 진행 중 · 나갈 수 있는 상자
    select case when k.kind = 'tracker' then 'tracker' else 'bluetooth' end::text as kind, 'received'::text as board, o.order_no, null::text as request_id,
           null::uuid as share_id, b.id as box_id,
           b.seq::integer as box_seq, (select count(*)::integer from public.boxes bx where bx.order_id = o.id) as box_count, null::text as box_label,
           f.nickname, o.item_kind, coalesce(b.measured_tier, b.declared_tier)::text as tier, null::text as measured_tier, null::integer as amount_krw,
           o.has_electronics_or_metal, coalesce(i.bluetooth = 'found', false) as bluetooth, coalesce(i.rf = 'found', false) as rf, k.choice,
           o.registered_at as sent_at, x.received_at, x.inspected_at + interval '168 hours' as due_at,
           h.gifts as prior_gift_count, h.passed as prior_passed_count, h.returned as prior_returned_count
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.office_creator_checks k on k.parcel_id = x.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select ii.bluetooth, ii.rf from public.office_inspections ii where ii.parcel_id = x.id order by ii.at desc, ii.id desc limit 1
    ) i on true
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where k.answer is null and now() < x.inspected_at + interval '168 hours'
      and ((k.kind = 'tracker' and x.state = 'tracker_held')
           or (k.kind = 'confirm' and x.state = 'held'
               and o.status not in ('rejected', 'expired', 'canceled') and not public.office_parcel_dead(x)))

    union all

    -- 승인 요청: 대기 · 승인 전 · 진행 중 · 검수 반송 아님 · 결제 완료 + 168시간 전(approve_request 와 같은 판정)
    select 'approval', 'received', o.order_no, r.request_id, null, null, null,
           (select count(*)::integer from public.boxes bx where bx.order_id = o.id), null,
           f.nickname, o.item_kind, null, null, null, o.has_electronics_or_metal, null, null, null,
           o.registered_at, o.received_at, o.registered_at + interval '168 hours',
           h.gifts, h.passed, h.returned
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.approval_requests r on r.order_id = o.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and now() < o.registered_at + interval '168 hours'

    union all

    -- 미확인 상자: 내가 보낸 몫이 늦을 때만(INV-J7 — 보류 상자가 있는지와 상관없다). 칸은 받는 팬 닉네임·상자 크기·보낸 날뿐
    select 'unconfirmed', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, null, null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.profiles fp on fp.id = s.fan_id
    -- 결제 끝·336시간 지난 보내기만 먼저 거른 뒤 판정 함수를 부른다(같은 결과, 부르는 수만 줄인다 — INV-J11 판정은 그 함수 하나)
    where d.status = 'done' and d.settled_at <= now() - interval '336 hours'
      and public.revgift_share_late(s.id, me.uid)

    union all

    -- 보낸 팬 선물: 팬 처리할 일과 같은 함수의 같은 줄(action-center INV-J3 · 카드 d93 ⑩)
    select a.kind, 'sent', a.order_no, null, null, a.box_id, a.box_seq::integer, null, a.box_label,
           a.creator_name, null, a.tier, a.measured_tier, a.amount_krw, null, null, null, null,
           coalesce(o.registered_at, o.created_at), null, a.due_at, null, null, null
    from me
    cross join public.my_action_items() a
    join public.orders o on o.order_no = a.order_no
    -- 결제를 마치지 않은 선물(unpaid, payment INV-M22 ⑤ — 2026-10-21): 결제 전이라 보낸 날 칸은 주문을 만든 때
    where a.kind in ('difference', 'missing_box', 'return_address', 'unpaid')

    union all

    -- 보낸 역조공 반송 주소(INV-J5 · office-workflow INV-W15): 보낸 몫의 상자가 반송 대기 · 확인 전 · 반송 대기 + 720시간 전. 칸은 받는 팬 닉네임·상자 크기·보낸 날·기한
    select 'return_address', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, x.return_waiting_at + interval '720 hours', null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.office_parcels x on x.share_id = s.id
    join public.profiles fp on fp.id = s.fan_id
    where x.state = 'return_waiting'
      and x.return_confirmed_at is null
      and now() < x.return_waiting_at + interval '720 hours'
  )
  select l.kind, l.board, l.order_no, l.request_id, l.share_id, l.box_id, l.box_seq, l.box_count, l.box_label, l.nickname, l.item_kind, l.tier,
         l.measured_tier, l.amount_krw, l.has_electronics_or_metal, l.bluetooth, l.rf, l.choice, l.sent_at, l.received_at, l.due_at,
         l.prior_gift_count, l.prior_passed_count, l.prior_returned_count
  from lines l
  order by (l.board = 'sent'),
           case l.kind when 'tracker' then 0 when 'bluetooth' then 1 else 2 end,
           -- 승인 요청은 결제 뒤 24시간 안인 새 요청을 최근 순으로 먼저(2026-10-30 알림톡 규칙 4, 카드 fankkuk-20261030-1-d1) — 그다음은 아래 기한 순(= 오래된 순)
           case when l.kind = 'approval' and now() < l.sent_at + interval '24 hours' then 0 else 1 end,
           case when l.kind = 'approval' and now() < l.sent_at + interval '24 hours' then l.sent_at end desc nulls last,
           case when l.board = 'received' then l.due_at else l.sent_at end,
           -- 같은 시각이면 받은 선물은 주문번호·상자 순, 보낸 선물은 몫(상자) id 순
           case when l.board = 'received' then l.order_no end, l.box_seq, coalesce(l.share_id, l.box_id);
$function$;

notify pgrst, 'reload schema';
