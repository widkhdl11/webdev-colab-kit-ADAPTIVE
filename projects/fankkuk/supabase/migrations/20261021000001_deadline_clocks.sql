-- 기한 정리 — 단계 넷, 시계 하나씩 (DECISIONS 2026-10-21 「기한 정리」, 사용자 「다섯 다 추천대로 바꾸자」 · 「배송 문제 재정리」 네 절).
-- 스펙: payment INV-M13·M18 (S13·S13b·S18h·S18j) · inbound-address-code INV-C3·C6·C9·C12 (S3e·S6·S9c·S9e) · office-workflow INV-W6·W10·W13·W14·W15
--       (S6d·S10d·S10e·S10g·S13f·S14e·S15c) · reverse-gift INV-R11 (S11·S11e) · notifications INV-N13·N15·N18·N22 (S13h·S15·S18c) · action-center INV-J1.
--
-- 1) 차액 기한 시계 = 그 상자의 검수 완료 스캔 시각(INV-M13). difference_due_at(상자) = 검수 완료 스캔 + 168시간, 스캔 전이면 비어 있다(기한 없음 —
--    실측은 스캔 앞에 있어 그 사이 미리 낼 수 있다). 차액 결제 준비·확정 시작·팬 차액 읽기·다음 단계·처리할 일 카드·운영자 「곧 처리」·자동 처리가 이 하나를 본다.
-- 2) 끝난 주문의 살려 둔 상자는 결제 완료 + 720시간, 역조공 몫의 살려 둔 6자리는 그 몫 결제 완료 + 720시간에 자동 처리가 닫는다(INV-M18 ③·R11).
--    주문이 끝날 때 이미 결제 + 720시간이 지났으면 살려 두지 않고 그 처리에서 바로 닫는다(S18j) — 환불 몫은 살려 둔 상자와 같다(살려 둔 시각도 적는다).
-- 3) 주인 없는 보류 상자는 보류 사유와 상관없이 도착 + 720시간(INV-C6·W6). 주문에 묶인 보류 상자의 자동 넘기기도 도착 + 720시간이고,
--    분쟁 보류는 보류 + 168시간 주인 확인을 그대로 기다린다(둘 중 늦은 때, S9e). 운영자 넘기기는 지금처럼 분쟁만 보류 + 168시간 뒤(S9b).
--    주인의 찾기(find_held_parcel)도 도착 + 720시간 안의 상자만.
-- 4) 재알림 차례: 추적 장치 발견(hold)·확인할 선물(creator_check)은 검수 완료 + 72시간에 상자마다 한 번, 추가 결제(difference_due)는 먼저 검수한 상자 + 72시간에
--    주문마다 한 번(차례 2). 도착하지 않은 상자(box_missing)는 결제 + 7·14·25일, 반송 주소 재알림(return_address_reminder)은 반송 대기 + 7·14·25일(차례 1·2·3) —
--    자동 처리는 지금 닿은 차례 하나만 넣는다(처음 돌린 때가 늦으면 지난 차례를 몰아 보내지 않는다).
--    꺼낼 때(notification_claim) 다시 본다 — 재알림 차례의 상자에 그 사이 고른 것이 있거나 질문이 닫혔으면, 주문의 차액이 다 결제됐거나 반송 대상·주문이 끝났으면 건너뜀.
--
-- 개인정보 구역(pii)은 건드리지 않는다.

-- ── 1) 차액 기한 ──
create or replace function public.difference_due_at(p_box_id uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  -- payment INV-M13 (2026-10-21): 차액 기한은 그 상자의 검수 완료 스캔 + 168시간. 스캔 전이면 null(기한 없음)
  select x.inspected_at + interval '168 hours' from public.office_parcels x where x.box_id = p_box_id;
$$;
revoke all on function public.difference_due_at(uuid) from public, anon, authenticated;

-- ── 4) 재알림 차례 ──
alter table public.notification_outbox drop constraint notification_outbox_round_check;
alter table public.notification_outbox add constraint notification_outbox_round_check check (
  round between 1 and 3 and (
    kind in ('approval_request', 'box_missing', 'return_address_reminder')
    or (kind in ('revgift_offer', 'hold', 'creator_check', 'difference_due') and round <= 2)
    or round = 1
  )
);

-- ── 1) 차액 기한을 쓰는 함수들 · 3) 주인의 찾기(도착 + 720시간) ──
CREATE OR REPLACE FUNCTION public.claim_difference_payment(p_toss_order_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pay public.payments;
  v_state public.office_state;
begin
  select * into v_pay from public.payments p
  where p.toss_order_id = p_toss_order_id and p.kind = 'difference'
  for update;
  if v_pay.id is null or v_pay.status <> 'pending'
     or v_pay.expired_at is not null or now() >= public.difference_due_at(v_pay.box_id) then
    return false;
  end if;
  if exists (select 1 from public.orders o where o.id = v_pay.order_id and o.status in ('rejected', 'expired', 'canceled')) then
    return false;
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = v_pay.box_id for share;
  if v_state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped', 'tracker_held', 'report_held', 'police_handed') then
    return false;
  end if;
  update public.payments set status = 'confirming', confirming_at = now() where id = v_pay.id;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.prepare_difference_payment(p_box_id uuid)
 RETURNS TABLE(toss_order_id text, amount_krw integer, order_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_order public.orders;
  v_pay public.payments;
  v_state public.office_state;
begin
  select o.* into v_order from public.orders o join public.boxes b on b.order_id = o.id where b.id = p_box_id;
  if v_order.id is null or v_order.fan_id is distinct from auth.uid() then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select p.* into v_pay from public.payments p where p.box_id = p_box_id and p.kind = 'difference' for update;
  if v_pay.id is null then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_pay.status = 'done' then
    raise exception '이미 낸 차액이다' using errcode = 'P0023';
  end if;
  if v_pay.status = 'confirming' then
    raise exception '결제를 처리하고 있다' using errcode = 'P0024';
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = p_box_id;
  -- M13: 기한(검수 완료 스캔 + 168시간, 2026-10-21)이 지났으면 7일 처리 전이라도 받지 않는다 — 사람 처리 쪽의 기한 확인(W6)
  if v_pay.expired_at is not null or now() >= public.difference_due_at(v_pay.box_id)
     or v_order.status in ('rejected', 'expired', 'canceled')
     or v_state in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped', 'tracker_held', 'report_held', 'police_handed') then
    raise exception '차액을 낼 수 없는 상태다' using errcode = 'P0022';
  end if;
  if v_pay.status = 'failed' then
    update public.payments p
    set toss_order_id = 'diff_' || replace(gen_random_uuid()::text, '-', ''), status = 'pending', payment_key = null, settled_at = null
    where p.id = v_pay.id
    returning p.* into v_pay;
  end if;
  return query select v_pay.toss_order_id, v_pay.amount_krw, v_order.order_no;
end $function$;

CREATE OR REPLACE FUNCTION public.my_difference_payments(p_order_no text)
 RETURNS TABLE(box_id uuid, box_seq smallint, declared_tier text, measured_tier text, amount_krw integer, status text, due_at timestamp with time zone, expired boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id, b.seq, b.declared_tier::text, b.measured_tier::text, p.amount_krw, p.status::text,
         public.difference_due_at(b.id),
         coalesce(p.expired_at is not null or now() >= public.difference_due_at(b.id), false)
  from public.payments p
  join public.boxes b on b.id = p.box_id
  join public.orders o on o.id = p.order_id
  where p.kind = 'difference' and o.order_no = p_order_no and o.fan_id = auth.uid()
  order by b.seq;
$function$;

CREATE OR REPLACE FUNCTION public.office_next_step(p_parcel office_parcels, p_kind text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_parcel.hold_reason is not null and p_parcel.state in ('inspected', 'label_printed') then 'on_hold'
    else case coalesce(p_parcel.state::text, 'no_waybill')
    when 'no_waybill' then 'wait_waybill'
    when 'awaiting' then 'scan_inbound'
    when 'received' then 'confirm_label'
    when 'labeled' then 'inspect'
    when 'inspected' then case when public.office_parcel_shippable(p_parcel) then 'print_label'
                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.payments d on d.order_id = b.order_id
                                 where b.id = p_parcel.box_id and d.kind = 'difference' and d.status in ('pending', 'failed')
                                   and d.expired_at is null and public.difference_due_at(d.box_id) <= now()
                               ) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.orders o on o.id = b.order_id
                                 where b.id = p_parcel.box_id and o.approved_at is not null
                                   and exists (select 1 from public.payments d
                                               where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
                               ) then 'wait_difference'
                               when p_kind = 'gift' then 'wait_approval' else 'wait_accept' end
    when 'held' then 'held'
    when 'tracker_held' then 'tracker_held'
    when 'report_held' then 'report_held'
    -- 주문에 이어진 상자는 보낸 사람이 반송 주소를 확인해야 출력한다(INV-W15)
    when 'return_waiting' then case when (p_parcel.box_id is not null or p_parcel.share_id is not null) and p_parcel.return_confirmed_at is null
                                    then 'wait_return_address' else 'print_return' end
    when 'return_printed' then 'confirm_return'
    when 'label_printed' then 'confirm_shipment'
    when 'dispose_due' then 'record_disposal'
    else 'done'
    end
  end;
$function$;

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

    -- 도착하지 않은 상자 — 「아직 도착하지 않은 상자」 알림 조건 + find_held_parcel 이 받아 주는 상태
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
  )
  select kind, order_no, box_id, box_label, box_seq, creator_name, tier, measured_tier, amount_krw, due_at
  from cards
  order by due_at, order_no, box_seq;
$function$;

CREATE OR REPLACE FUNCTION public.admin_expiry_due()
 RETURNS TABLE(category text, order_no text, sender_nickname text, receiver_name text, due_at timestamp with time zone, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select * from (
    select 'gift'::text, o.order_no, f.nickname, c.name, o.registered_at + interval '168 hours', null::text
    from public.orders o
    join public.approval_requests r on r.order_id = o.id and r.status = 'waiting'
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
    union all
    select 'revgift', s.order_no, c.name, f.nickname, public.revgift_deadline(d.settled_at), null
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    where s.reply = 'waiting' and now() >= public.revgift_deadline(d.settled_at)
    union all
    select 'difference', o.order_no, f.nickname, c.name, public.difference_due_at(pd.box_id),
           '+' || to_char(pd.amount_krw, 'FM999,999,999') || '원'
    from public.payments pd
    join public.orders o on o.id = pd.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where pd.kind = 'difference' and pd.status in ('pending', 'failed') and pd.expired_at is null
      and public.difference_due_at(pd.box_id) <= now()
    union all
    select 'unpaid', o.order_no, f.nickname, c.name, pi.created_at + interval '24 hours',
           to_char(pi.amount_krw, 'FM999,999,999') || '원'
    from public.payments pi
    join public.orders o on o.id = pi.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where pi.kind = 'initial' and pi.status = 'pending' and pi.created_at <= now() - interval '24 hours'
    union all
    select 'unpaid', first.order_no, c.name,
           f.nickname || case when shares.n > 1 then ' 외 ' || (shares.n - 1) || '명' else '' end,
           d.created_at + interval '24 hours', to_char(d.amount_krw, 'FM999,999,999') || '원'
    from public.revgift_sends d
    join public.creators c on c.id = d.creator_id
    join lateral (select s.order_no, s.fan_id from public.revgift_shares s where s.send_id = d.id order by s.seq limit 1) first on true
    join lateral (select count(*) as n from public.revgift_shares s where s.send_id = d.id) shares on true
    join public.profiles f on f.id = first.fan_id
    where d.status = 'pending' and d.created_at <= now() - interval '24 hours'
  ) due
  where public.is_operator()
  order by 5, 2
  limit 500;
$function$;

CREATE OR REPLACE FUNCTION public.find_held_parcel(p_box_id uuid, p_share_id uuid, p_waybill text, p_carrier text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  c public.inbound_codes;
  t public.office_parcels;
  u public.office_unmatched;
  v public.office_parcels;
  v_order_id uuid;
  v_ok boolean := false;
  v_result text := 'not_found';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if num_nonnulls(p_box_id, p_share_id) <> 1 or p_carrier is null or not public.inbound_carrier_ok(p_carrier) then
    raise exception '상자 하나와 택배사가 필요하다' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.find:' || v_uid::text, 0));
  -- INV-C10: 그날(서울 날짜)의 틀린 시도만 센다
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched
        and a.at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) >= 5 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;

  -- 잠금 순서(교착 방지 — 입고 함수와 같다): 상자 줄 → 승인 요청 줄 → 주문 줄(역조공은 몫 줄) → 6자리 줄 → 상자 작업 줄 → 보류 줄
  if p_box_id is not null then
    select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = p_box_id and b.missing_at is null and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
    for update of b;
    if v_order_id is not null then
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      perform 1 from public.orders o
      where o.id = v_order_id and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
      for update;
      v_ok := found;
    end if;
  else
    perform 1 from public.revgift_shares s where s.id = p_share_id for update;
    -- 몫 줄을 잠근 뒤 판정 — 내가 보낸 결제 끝·입고 전·닫히지 않은 몫만(INV-C4 ②-나). 후보가 아니면 틀린 시도로 센다(INV-C10)
    v_ok := found and public.revgift_share_before_inbound(p_share_id, v_uid);
  end if;

  if v_ok then
    select * into c from public.inbound_codes x where x.box_id = p_box_id or x.share_id = p_share_id for update;
    select * into t from public.office_parcels x where x.box_id = p_box_id or x.share_id = p_share_id for update;

    if t.id is not null and t.hold_reason in ('code_dispute', 'waybill_dispute') and t.inbound_waybill_no = p_waybill
       and not exists (select 1 from public.office_not_mine_reports r where r.parcel_id = t.id) then
      update public.office_parcels set hold_reason = null, hold_at = null where id = t.id;
      v_result := 'matched';
    elsif t.id is null or t.state = 'awaiting' or t.hold_reason in ('code_dispute', 'waybill_dispute') then
      select * into u from public.office_unmatched x
      where x.waybill_no = p_waybill and x.carrier = p_carrier
        and (p_share_id is not null or x.code_id is not null or x.nickname_profile_id = v_uid)
        and x.matched_parcel_id is null and x.expired_at is null and x.arrived_at > now() - interval '720 hours'
        and (x.code_id is null or x.code_id is not distinct from c.id)
        and not exists (select 1 from public.office_parcels y where y.inbound_waybill_no = p_waybill)
      for update;
      if u.id is not null then
        if t.id is not null and t.state <> 'awaiting' then
          update public.office_parcels set box_id = null, share_id = null, hold_reason = 'detached', hold_at = now()
          where id = t.id;
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        elsif t.id is null then
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        else
          update public.office_parcels set inbound_waybill_no = p_waybill, state = 'received', received_at = u.arrived_at
          where id = t.id returning * into v;
        end if;
        perform public.office_finish_held_receive(u.id, v.id, c.id);
        v_result := 'matched';
      end if;
    end if;
  end if;

  insert into public.office_match_attempts (profile_id, matched) values (v_uid, v_result = 'matched');
  if v_result <> 'matched' and (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched and a.at > now() - interval '24 hours') >= 3 then
    insert into public.office_find_flags (profile_id) values (v_uid)
    on conflict (profile_id) do update set last_flagged_at = now();
  end if;
  return v_result;
end $function$;

-- ── 자동 처리: 2) 살려 둔 상자 · 3) 보류 상자 · 4) 재알림 차례 ──
CREATE OR REPLACE FUNCTION public.office_run_expiry(p_order_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
  v_pending_gifts integer;
  v_pending_revgifts integer;
  v_held integer;
  v_held_parcels integer := 0;
  v_parcel uuid;
  v_order uuid;
  v_boxes_missing integer := 0;
  v_box_missing_alerts integer;
  v_kept_closed integer := 0;
  v_box uuid;
  v_kept_shares integer;
  v_n integer;
  v_p public.office_parcels;
  v_k public.office_creator_checks;
  v_dispose_due integer := 0;
  v_return_reminders integer := 0;
  v_check_reminders integer := 0;
  v_difference_reminders integer := 0;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15)
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15)
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  v_gifts := 0;
  for v_order in
    select o.id from public.orders o join public.approval_requests r on r.order_id = o.id
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    order by o.registered_at, o.id
  loop
    perform 1 from public.boxes b where b.order_id = v_order order by b.seq for update;
    perform 1 from public.approval_requests r where r.order_id = v_order for no key update;
    perform 1 from public.orders o where o.id = v_order for update;
    with expired as (
      update public.approval_requests r
      set status = 'expired', decided_at = now()
      from public.orders o
      where o.id = r.order_id and r.order_id = v_order and r.status = 'waiting' and o.approved_at is null
        and o.status in ('registered', 'received', 'labeled', 'inspected')
        and o.registered_at <= now() - interval '168 hours'
      returning r.order_id
    )
    update public.orders o set status = 'expired'
    from expired e where o.id = e.order_id and o.approved_at is null;
    get diagnostics v_n = row_count;
    v_gifts := v_gifts + v_n;
  end loop;

  -- 3) 차액 미납(payment INV-M13, 2026-10-21): 그 상자의 검수 완료 스캔 + 168시간. 스캔 전 차액은 기한이 없다
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and public.difference_due_at(d.box_id) <= now()
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 3-2) 차액 재알림(notifications INV-N18, 2026-10-21): 먼저 검수 기록한 차액 상자의 검수 완료 스캔 + 72시간에 아직 결제되지 않은 차액이 있으면
  --      보낸 팬에게 주문마다 한 줄(차례 2). 줄은 그 먼저 검수한 상자를 가리킨다. 주문에 이미 차례 2 줄이 있으면 넣지 않는다(두 번 돌려도 한 줄).
  with due as (
    select distinct on (o.id) o.id as order_id, x.id as parcel_id, x.inspected_at, o.fan_id
    from public.orders o
    join public.payments d on d.order_id = o.id and d.kind = 'difference'
    join public.office_parcels x on x.box_id = d.box_id and x.inspected_at is not null
    where o.status in ('registered', 'received', 'labeled', 'inspected')
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.payments u
                  where u.order_id = o.id and u.kind = 'difference' and u.status in ('pending', 'failed') and u.expired_at is null
                    and coalesce(now() < public.difference_due_at(u.box_id), true))
      and not exists (select 1 from public.notification_outbox n where n.kind = 'difference_due' and n.order_id = o.id and n.round = 2)
    order by o.id, x.inspected_at, x.id
  ), sent as (
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select 'difference_due', due.order_id, due.parcel_id, 2, due.fan_id, ch.channel, now()
    from due
    cross join (values ('email'), ('kakao')) as ch (channel)
    where due.inspected_at <= now() - interval '72 hours'
      and (ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'difference_due'))
    on conflict do nothing
    returning channel
  )
  select (count(*) filter (where channel = 'email'))::integer into v_difference_reminders from sent;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 4-2) 크리에이터 확인 대기·추적기 보관 재알림(office-workflow INV-W13·W14, notifications INV-N13, 2026-10-21): 검수 완료 스캔 + 72시간이 지났는데
  --      고른 것이 없고 아직 기한(168시간) 전이면 그 주문의 크리에이터에게 상자마다 한 줄(차례 2, 확인 대기는 creator_check · 추적기 보관은 hold).
  --      끝난 주문의 확인 대기 상자는 질문이 닫혀 넣지 않는다(추적기 보관은 주문이 끝나도 신고 선택을 받는다). 재알림은 기한을 늘리지 않는다.
  with sent as (
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select q.kind, q.order_id, q.parcel_id, 2, q.creator_profile_id, ch.channel, now()
    from (
      select case when p.state = 'tracker_held' then 'hold' else 'creator_check' end as kind, o.id as order_id, p.id as parcel_id, c.profile_id as creator_profile_id
      from public.office_parcels p
      join public.office_creator_checks k on k.parcel_id = p.id
      join public.boxes b on b.id = p.box_id
      join public.orders o on o.id = b.order_id
      join public.creators c on c.id = o.creator_id
      where p.state in ('tracker_held', 'held') and k.choice is null and k.answer is null
        and p.inspected_at <= now() - interval '72 hours' and now() < p.inspected_at + interval '168 hours'
        and (p.state = 'tracker_held' or not public.office_parcel_dead(p))
        and c.profile_id is not null
        and (p_order_no is null or o.order_no = p_order_no)
    ) q
    cross join (values ('email'), ('kakao')) as ch (channel)
    where ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = q.kind)
    on conflict do nothing
    returning channel
  )
  select (count(*) filter (where channel = 'email'))::integer into v_check_reminders from sent;

  -- 5) 크리에이터 확인 대기 상자: 검수 완료 + 168시간이 지나도 운영자가 처리하지 않았으면 자동 처리가 닫는다(office-workflow INV-W13·W6).
  --    고른 것이 있으면 고른 쪽대로 운영자 처리와 같은 결과(처리한 사람 칸은 비어 있다 = 자동 처리): 받기 → 검수 완료, 거절 → 반송 대기 + 팬 hold_fan.
  --    고른 것이 없으면 반송 대기 + 확인 줄 「기한 지남」 + 팬 hold_fan. 끝난 주문의 상자는 아래 「나갈 수 없게 된 상자」가 맡는다.
  --    상자마다 상자 → 주문(몫) → 사무소 상자 줄 → 확인 줄 순으로 잠그고(INV-W12 — 고르기·취소·운영자 처리와 같다) 다시 본다.
  v_held := 0;
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'held' and p.inspected_at <= now() - interval '168 hours' and not public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    select * into v_k from public.office_creator_checks k where k.parcel_id = v_parcel for update;
    if v_p.state <> 'held' or v_p.inspected_at > now() - interval '168 hours' or public.office_parcel_dead(v_p) or v_k.answer is not null then
      continue;
    end if;
    if v_k.choice = 'accept' then
      update public.office_parcels set state = 'inspected' where id = v_parcel;
      update public.office_creator_checks set answer = 'accept', answered_at = now(), answered_by = null where parcel_id = v_parcel;
      perform public.office_sync(v_parcel);
    else
      update public.office_parcels set state = 'return_waiting' where id = v_parcel;
      if v_k.parcel_id is not null then
        update public.office_creator_checks
        set answer = case when v_k.choice = 'return' then 'return' else 'expired' end, answered_at = now(), answered_by = null
        where parcel_id = v_parcel;
      end if;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    v_held := v_held + 1;
  end loop;

  -- 5-2) 추적기 보관 상자: 검수 완료 + 168시간이 지나도 운영자가 처리하지 않았으면 고른 쪽대로(office-workflow INV-W14·W6).
  --      신고하기 → 신고 보관(팬 알림 없음), 신고하지 않기 → 반송 대기 + 팬 hold_fan, 고른 것이 없으면 신고하지 않기와 같고 확인 줄은 「기한 지남」.
  --      주문이 끝났어도 같다 — 추적기 보관 상자는 「나갈 수 없게 된 상자」 단계가 건드리지 않는다. 잠금은 5) 와 같은 순서.
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'tracker_held' and p.inspected_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no))
    order by p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    select * into v_k from public.office_creator_checks k where k.parcel_id = v_parcel for update;
    if v_p.state <> 'tracker_held' or v_p.inspected_at > now() - interval '168 hours' or v_k.answer is not null then
      continue;
    end if;
    if v_k.choice = 'report' then
      update public.office_parcels set state = 'report_held' where id = v_parcel;
      update public.office_creator_checks set answer = 'report', answered_at = now(), answered_by = null where parcel_id = v_parcel;
    else
      update public.office_parcels set state = 'return_waiting' where id = v_parcel;
      if v_k.parcel_id is not null then
        update public.office_creator_checks
        set answer = case when v_k.choice = 'no_report' then 'no_report' else 'expired' end, answered_at = now(), answered_by = null
        where parcel_id = v_parcel;
      end if;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    perform public.office_sync(v_parcel);
    v_held := v_held + 1;
  end loop;

  -- 6) 주문에 묶인 채 보류된 상자: 도착 + 720시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9, 2026-10-21 — 그 전 보류 + 168시간).
  --    분쟁 보류는 보류 + 168시간 주인 확인을 기다린다 — 둘 중 늦은 때(넘기기 함수가 잠근 뒤 보류 + 168시간을 다시 본다)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.hold_reason is not null and p.hold_closed_at is null
      and p.received_at <= now() - interval '720 hours'
      and (p.hold_reason not in ('code_dispute', 'waybill_dispute') or p.hold_at <= now() - interval '168 hours')
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.hold_at, p.id
  loop
    if public.office_close_held_parcel(v_parcel, null, true) then
      v_held_parcels := v_held_parcels + 1;
    end if;
  end loop;

  -- 7) 승인 뒤 도착하지 않은 상자: 결제 완료 + 720시간 → 그 상자를 닫는다(office-workflow INV-W10)
  for v_order in
    select o.id from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '720 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
    order by o.registered_at, o.id
  loop
    v_boxes_missing := v_boxes_missing + public.office_close_missing_boxes(v_order);
  end loop;

  -- 8) 결제 완료 + 168·336·600시간(7·14·25일)에 아직 안 온 상자가 있는 진행 중 주문 → 보낸 팬에게 때마다 한 번(notifications INV-N15, 2026-10-21).
  --    지금 닿은 차례 하나만 넣는다 — 처음 돌린 때가 400시간이면 14일 차례만. 줄 이름에 차례가 들어가 두 번 돌려도 한 줄이다
  select count(*)::integer into v_box_missing_alerts
  from (
    select public.notification_enqueue('box_missing', o.id, null,
             (case when o.registered_at <= now() - interval '600 hours' then 3
                   when o.registered_at <= now() - interval '336 hours' then 2 else 1 end)::smallint,
             o.fan_id, now()) as n
    from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
  ) q
  where q.n > 0;

  -- 9) 살려 둔 상자·몫(payment INV-M18 ③ · reverse-gift INV-R11, 2026-10-21): 결제 완료 + 720시간 — 진행 중 주문의 30일 닫기와 같은 날.
  --    (그 전에는 살려 둔 때 + 168시간)
  for v_box in
    select c.box_id from public.inbound_codes c
    join public.boxes b on b.id = c.box_id
    join public.orders o on o.id = b.order_id
    where c.box_id is not null and c.kept_at is not null and c.state = 'valid' and o.registered_at <= now() - interval '720 hours'
      and b.missing_at is null
      and (p_order_no is null or o.order_no = p_order_no)
    order by o.registered_at, c.box_id
  loop
    if public.office_close_kept_box(v_box) then
      v_kept_closed := v_kept_closed + 1;
    end if;
  end loop;
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  where s.id = c.share_id and c.kept_at is not null and c.state = 'valid' and d.settled_at <= now() - interval '720 hours'
    and (p_order_no is null or s.order_no = p_order_no);
  get diagnostics v_kept_shares = row_count;
  v_kept_closed := v_kept_closed + v_kept_shares;

  -- 나갈 수 없게 된 상자 중 검수 완료·크리에이터 확인 대기인 것은 반송 대기로(답은 빈 채, 팬 알림 없음). 추적기 보관·신고 보관은 넘기지 않는다(INV-W14)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state in ('inspected', 'held') and public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      perform public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    update public.office_parcels p set state = 'return_waiting'
    where p.id = v_parcel and p.state in ('inspected', 'held') and public.office_parcel_dead(p);
  end loop;

  -- 10) 반송 주소 기한(office-workflow INV-W15, notifications INV-N22) — 주문에 이어진 반송 대기 상자 중 보낸 사람이 확인하지 않은 것.
  --  ① 반송 대기 + 720시간 → 처분 대상. 상자마다 상자 → 주문(몫) → 사무소 상자 줄 순으로 잠근 뒤 다시 본다 — 확인 함수와 같은 잠금이라 겹쳐도 하나만(INV-W12)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'return_waiting' and p.return_confirmed_at is null and (p.box_id is not null or p.share_id is not null)
      and p.return_waiting_at <= now() - interval '720 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.return_waiting_at, p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    if v_p.state <> 'return_waiting' or v_p.return_confirmed_at is not null or v_p.return_waiting_at > now() - interval '720 hours'
       or (v_p.box_id is null and v_p.share_id is null) then
      continue;
    end if;
    update public.office_parcels set state = 'dispose_due' where id = v_parcel;
    perform public.office_sync(v_parcel);
    v_dispose_due := v_dispose_due + 1;
  end loop;

  --  ② 반송 대기 + 168·336·600시간(7·14·25일, 2026-10-21 — 그 전 336시간 한 번) → 보낸 사람에게 차례마다 상자마다 한 번. 600시간은 마감 안내(차례 3).
  --     지금 닿은 차례 하나만 넣는다. 줄 이름에 상자·차례가 들어가 두 번 돌려도 한 줄이다.
  --     이미 확인한 상자·처분 대상에는 가지 않는다(꺼낼 때도 다시 본다 — notification_claim). 세는 것은 이메일 줄(상자 수)
  with sent as (
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select 'return_address_reminder', o.id, p.id,
           case when p.return_waiting_at <= now() - interval '600 hours' then 3
                when p.return_waiting_at <= now() - interval '336 hours' then 2 else 1 end,
           public.return_sender_of(p.id), ch.channel, now()
    from public.office_parcels p
    left join public.boxes b on b.id = p.box_id
    left join public.orders o on o.id = b.order_id
    left join public.revgift_shares s on s.id = p.share_id
    cross join (values ('email'), ('kakao')) as ch (channel)
    where p.state = 'return_waiting' and p.return_confirmed_at is null and (p.box_id is not null or p.share_id is not null)
      and p.return_waiting_at <= now() - interval '168 hours'
      and public.return_sender_of(p.id) is not null
      and (p_order_no is null or o.order_no = p_order_no or s.order_no = p_order_no)
      and (ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'return_address_reminder'))
    on conflict do nothing
    returning channel
  )
  select (count(*) filter (where channel = 'email'))::integer into v_return_reminders from sent;

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  -- 2) 매칭 안 된 미확인 입고: 도착 + 720시간 — 보류 사유와 상관없이 같다(inbound-address-code INV-C6·C13, office-workflow INV-W6, 2026-10-21). 맨 뒤에 둔다 — 찾기 함수가 이 표를 상자·주문·사무소 상자 줄 다음에 잠근다(INV-W12)
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '720 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels,
                            'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts, 'kept_closed', v_kept_closed,
                            'dispose_due', v_dispose_due, 'return_reminders', v_return_reminders,
                            'check_reminders', v_check_reminders, 'difference_reminders', v_difference_reminders);
end $function$;

-- ── 2) 끝나는 때 이미 결제 + 720시간이 지났으면 바로 닫는다(S18j) ──
CREATE OR REPLACE FUNCTION public.inbound_void_for_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- payment INV-M18 · inbound-address-code INV-C3 (2026-10-10): 받는 주소를 본 적이 있으면(승인 · 「먼저 보내기」 · 도착한 상자 있음)
  -- 아직 안 온 상자의 6자리는 무효로 하지 않고 살려 둔 시각을 적는다. 도착한 상자의 6자리는 이미 사용됨, 닫힌 상자의 6자리는 이미 무효라
  -- 남은 유효한 6자리가 곧 안 온 상자다.
  if new.approved_at is not null or new.fan_send_ack_at is not null or exists (
    select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
    where b.order_id = new.id and x.state <> 'awaiting'
  ) then
    update public.inbound_codes c
    set kept_at = now()
    from public.boxes b
    where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and c.kept_at is null and b.missing_at is null;
    -- payment INV-M18 ③ (2026-10-21 기한 정리): 살려 둔 상자는 결제 완료 + 720시간에 닫는다 — 끝나는 때 이미 지났으면 살려 두지 않고 이 처리에서 바로 닫는다(S18j).
    -- 살려 둔 시각은 위에서 적었다 — 환불 몫은 살려 둔 상자와 같다(주문 환불에 상자 금액 − 배송비 칸, 상자 환불 대상 = 배송비 칸)
    if new.registered_at <= now() - interval '720 hours' then
      with closed as (
        update public.inbound_codes c
        set state = 'void', voided_at = now()
        from public.boxes b
        where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and c.kept_at is not null and b.missing_at is null
        returning c.box_id
      )
      update public.boxes b set missing_at = now() from closed where b.id = closed.box_id;
    end if;
    -- 보낸 팬에게 안내 한 번(notifications INV-N17 ①) — 거절·반려·차단 거절 모두 같은 종류. 팬이 스스로 취소한 주문에는 보내지 않는다.
    -- 살려 둔 상자가 남았을 때만(바로 닫힌 상자뿐이면 「도착하는 대로 돌려보내 드려요」가 맞지 않는다)
    if new.status in ('rejected', 'expired') and exists (
      select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id
      where b.order_id = new.id and c.state = 'valid' and c.kept_at is not null and b.missing_at is null
    ) then
      perform public.notification_enqueue('gift_pending_box', new.id, null, 1::smallint, new.fan_id, now());
    end if;
    return null;
  end if;

  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.boxes b
  where b.order_id = new.id and c.box_id = b.id and c.state = 'valid';
  -- 받는 주소를 본 적이 없는(상자가 하나도 오지 않은) 주문의 거절 알림(notifications INV-N17 ②, 2026-10-12 문제집 D11).
  -- 거절·7일 반려·차단 거절 모두 같은 종류 — 차단 표시(rejected_by_block)는 읽지 않는다(INV-N2).
  -- 결제 전 주문(차단으로만 거절된다)에는 여기서 보내지 않는다 — 거절되는 순간에는 아직 돌려줄 결제 금액이 없다.
  -- 그 뒤 결제가 끝나면(전액 환불 대상) 결제 반영 함수(settle_payment, 20261012000005)가 같은 거절 알림을 한 번 넣는다. 팬의 취소에는 보내지 않는다.
  if new.status in ('rejected', 'expired') and old.status <> 'pending_payment' then
    perform public.notification_enqueue('gift_undelivered', new.id, null, 1::smallint, new.fan_id, now());
  end if;
  return null;
end $function$;

-- ── 4) 꺼낼 때 다시 본다 ──
CREATE OR REPLACE FUNCTION public.notification_claim(p_limit integer DEFAULT 20)
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

notify pgrst, 'reload schema';
