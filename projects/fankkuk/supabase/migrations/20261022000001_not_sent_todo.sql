-- 「아직 보내지 않음」을 누르면 지금 할 일 줄을 지운다 (DECISIONS 2026-10-22 「UX 정돈 시범 승인」 d113 — 고를 것 ③ 추천대로, 진단 C-1).
-- 기록 자체(orders.fan_not_sent_at · mark_gift_not_sent)는 20261021000002_not_sent_shipping_issues.sql 그대로다 — 기한은 바뀌지 않는다(office-workflow INV-W10).
--
-- 1) my_action_items — 「도착하지 않은 상자」 줄에 「보낸 사람이 아직 보내지 않음을 누르지 않았다」 조건 하나(action-center INV-J1).
--    누른 뒤 남은 일은 상자를 보내는 것뿐이라 팬이 눌러야 끝나는 일이 아니다. 30일 닫기·알림·운영자 목록은 그대로 돈다.
--    크리에이터 지금 할 일(my_creator_action_items)은 이 함수의 줄을 그대로 쓰므로 같이 따른다.
-- 2) my_gift_boxes — 칸 not_sent_at 하나. 아직 입고 전·닫히지 않은 상자에만 그 주문의 누른 시각을 싣는다(선물 상세 상자 칸 「아직 보내지 않음 · ○월 ○일」).
--    반환 칸이 바뀌므로 지우고 다시 만든다. 그 밖의 칸·판정은 20261017000002_tracker_report.sql 그대로.

-- ── 1) 지금 할 일 읽기 — 20261021000004_resume_payment.sql 의 정의 그대로에 missing_box 조건 한 줄 ──
CREATE OR REPLACE FUNCTION public.my_action_items()
 RETURNS TABLE(kind text, order_no text, box_id uuid, box_label text, box_seq smallint, creator_name text, tier text, measured_tier text, amount_krw integer, due_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with mine as (
    select auth.uid() as uid
  ),
  cards as (
    -- 추가 결제 — prepare_difference_payment 가 받아 주는 상태
    select 'difference'::text as kind, o.order_no, b.id as box_id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end as box_label,
           b.seq as box_seq, c.name as creator_name, b.declared_tier::text as tier, b.measured_tier::text as measured_tier,
           p.amount_krw, public.difference_due_at(b.id) as due_at
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'difference'
    join public.boxes b on b.id = p.box_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels op on op.box_id = b.id
    where p.status in ('pending', 'failed')
      and p.expired_at is null
      and coalesce(now() < public.difference_due_at(b.id), true)
      and o.status not in ('rejected', 'expired', 'canceled')
      and (op.state is null or op.state not in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped',
                                                'tracker_held', 'report_held', 'police_handed'))

    union all

    -- 도착하지 않은 상자 — 「아직 도착하지 않은 상자」 알림 조건 + find_held_parcel 이 받아 주는 상태.
    -- 보낸 사람이 「아직 보내지 않음」을 눌렀으면 줄이 없다(2026-10-22 d113) — 기한·닫기는 그대로(INV-W10)
    select 'missing_box', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, o.registered_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is not null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and o.fan_not_sent_at is null
      and b.missing_at is null
      and not exists (select 1 from public.office_parcels op where op.box_id = b.id and op.state <> 'awaiting')

    union all

    -- 역조공 받기 — decline_revgift·accept_revgift 가 받아 주는 상태
    select 'revgift', s.order_no, null::uuid, null::text, null::smallint, coalesce(cr.name, cp.nickname), s.tier::text, null::text, null::integer,
           public.revgift_deadline(d.settled_at)
    from mine
    join public.revgift_shares s on s.fan_id = mine.uid
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    where d.status = 'done'
      and s.reply = 'waiting'
      and s.returned_at is null
      and s.cancelled_at is null
      and now() < public.revgift_deadline(d.settled_at)

    union all

    -- 반송 주소 확인(office-workflow INV-W15) — 확인 함수(confirm_return_address)가 받아 주는 상태: 반송 대기 · 확인 전 · 반송 대기 + 720시간 전. 상자마다
    select 'return_address', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, x.return_waiting_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.creators c on c.id = o.creator_id
    where x.state = 'return_waiting'
      and x.return_confirmed_at is null
      and now() < x.return_waiting_at + interval '720 hours'

    union all

    -- 결제 미완료(payment INV-M22 · action-center INV-J1 표) — 이어 하기 함수(resume_gift_payment)가 받아 주는 상태: 같은 판정 함수. 주문마다 하나
    select 'unpaid', o.order_no, null::uuid, null::text, null::smallint, c.name, null::text, null::text, p.amount_krw, p.created_at + interval '24 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'initial'
    join public.creators c on c.id = o.creator_id
    where public.gift_payment_resumable(p, o)
  )
  select kind, order_no, box_id, box_label, box_seq, creator_name, tier, measured_tier, amount_krw, due_at
  from cards
  order by due_at, order_no, box_seq;
$function$;

-- ── 2) 팬 상자 읽기 — 20261017000002_tracker_report.sql 의 정의 그대로에 not_sent_at 칸 ──
drop function if exists public.my_gift_boxes(text);
CREATE FUNCTION public.my_gift_boxes(p_order_no text)
 RETURNS TABLE(box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean, send_ack_needed boolean, not_sent_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.tracking_no,
         case when b.missing_at is not null then 'missing'
              when p.state in ('tracker_held', 'report_held', 'police_handed') then 'checking'
              else coalesce(p.state::text, 'no_waybill') end,
         -- 승인 전이면 「먼저 보내기」를 누른 뒤에만(INV-S9). 거절·반려·취소된 주문은 살려 둔 6자리도 보이지 않는다(INV-C3).
         case when (o.approved_at is not null or o.fan_send_ack_at is not null)
                   and o.status not in ('rejected', 'expired', 'canceled')
              then (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
         o.approved_at is null and o.fan_send_ack_at is null and o.status in ('registered', 'received', 'labeled', 'inspected'),
         -- 「아직 보내지 않음」을 누른 시각(office-workflow INV-W10) — 아직 입고 전·닫히지 않은 상자에만. 도착한 상자에는 붙이지 않는다.
         -- 누른 뒤 그 상자에 송장번호를 넣었으면 보낸 상자라 붙이지 않는다(2026-10-22 리뷰)
         case when b.missing_at is null and (p.state is null or p.state = 'awaiting') and p.tracking_no is null then o.fan_not_sent_at end
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$function$;
revoke all on function public.my_gift_boxes(text) from public, anon;
grant execute on function public.my_gift_boxes(text) to authenticated;
