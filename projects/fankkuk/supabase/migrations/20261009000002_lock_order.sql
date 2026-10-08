-- 잠금 순서 하나 (office-workflow INV-W12): 같은 주문을 만지는 쓰기 처리는 모두
-- 상자 줄(순번 차례) → 승인 요청 → 주문 줄(역조공은 몫 줄) → 받는 주소 6자리 → 사무소 상자 줄 순으로 잠근다.
--
-- 입고·팬 취소·보관 상자 닫기·안 온 상자 닫기·찾기는 이미 이 순서였다. 어긋난 곳은 둘이었다.
--   1) office_lock_qr — 내부 QR 로 시작하는 처리(라벨 확인·검수·실측·송장 출력·출고·반송 등 13개)의 첫 잠금이
--      사무소 상자 줄이었고, 그 뒤에 실측은 상자를, 단계 맞추기(office_sync_order)는 주문을 잠갔다.
--   2) admin_cancel_received_gift — 송장 출력(사무소 상자 줄 → 주문)에 맞추려고 사무소 상자 줄을 주문보다 먼저 잠갔다.
--      그래서 실측(사무소 상자 줄 → 상자)과는 여전히 엇갈렸다.
--   3) office_run_expiry(자동 처리) — 1단계가 주문을 한꺼번에 잠근 뒤 6단계가 같은 주문의 상자를 잠갔고,
--      5단계·마지막 단계는 사무소 상자 줄을 상자·주문 없이 갱신한 뒤 주문을 잠갔다(1) 을 고치면 QR 처리와 반대가 된다 — 코드 리뷰 high).
-- 같은 주문에서 겹치면 서로를 기다리다 한쪽이 40P01 로 되돌려졌다(자료는 어긋나지 않음).
--
-- 1) 은 QR 잠금 함수 하나만 고쳐 13개 처리를 한 번에 맞춘다: 사무소 상자 줄을 잠그지 않고 읽어 상자·주문(몫)을 찾고,
--    그 순서대로 잠근 뒤 사무소 상자 줄을 잠근다. 그 사이 상자 연결이 바뀌었으면(찾기가 떼어 낸 경우) 40001 로 끝낸다 — 다시 스캔하면 새 연결로 처음부터 잠근다.
--    부르는 쪽이 뒤에서 같은 주문·상자를 다시 잠그는 문장은 이미 쥔 잠금이라 그대로 둔다.
--    잠그는 몸통은 office_lock_parcel(사무소 상자 줄 id) 로 빼서 자동 처리도 같은 순서로 잠근다.
-- 2) 는 사무소 상자 줄 잠금을 주문 뒤로 옮기고, 그 사이에 6자리 줄을 잠근다(취소가 6자리를 무효로 바꾸는 트리거보다 먼저).
-- 3) 은 세 단계를 주문마다·상자마다 반복하며 위 순서로 잠근 뒤 조건을 다시 보고 갱신한다. 미확인 입고 기한(2단계)은
--    찾기 함수가 그 표를 맨 마지막에 잠그므로 자동 처리에서도 맨 뒤로 옮긴다.

create or replace function public.office_lock_parcel(p_id uuid)
returns public.office_parcels
language plpgsql
set search_path = ''
as $$
declare
  v public.office_parcels;
  v_box uuid;
  v_share uuid;
  v_order uuid;
begin
  -- 사무소 상자 줄은 아직 잠그지 않고 읽는다 — 앞 단계 줄을 먼저 잠가야 한다(INV-W12)
  select x.box_id, x.share_id into v_box, v_share from public.office_parcels x where x.id = p_id;
  if not found then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
  if v_box is not null then
    select b.order_id into v_order from public.boxes b where b.id = v_box for update;
    perform 1 from public.approval_requests r where r.order_id = v_order for key share;
    perform 1 from public.orders o where o.id = v_order for update;
  elsif v_share is not null then
    perform 1 from public.revgift_shares s where s.id = v_share for update;
  end if;
  select * into v from public.office_parcels x where x.id = p_id for update;
  if v.id is null then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
  -- 잠그는 사이 상자 연결이 바뀌었으면(찾기가 떼어 낸 경우) 다시 읽지 않고 끝낸다 — 사무소 상자 줄을 쥔 채
  -- 새 상자·주문을 잠그면 순서가 거꾸로 된다. 작업자가 다시 스캔하면 새 연결로 처음부터 잠근다.
  if v.box_id is distinct from v_box or v.share_id is distinct from v_share then
    raise exception '상자 정보가 바뀌는 중이다 — 다시 스캔한다' using errcode = '40001';
  end if;
  return v;
end $$;

revoke all on function public.office_lock_parcel(uuid) from public, anon, authenticated;

create or replace function public.office_lock_qr(p_qr text)
returns public.office_parcels
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  -- QR 번호는 상자 줄을 만들 때 정해지고 바뀌지 않는다
  select x.id into v_id from public.office_parcels x where x.qr_code = p_qr;
  if v_id is null then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
  return public.office_lock_parcel(v_id);
end $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_received_gift(p_order_no text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_order_id uuid;
begin
  if not public.is_owner() then
    raise exception '입고 뒤 취소는 대표만 한다' using errcode = '42501';
  end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 200 then
    raise exception '사유는 1~200자' using errcode = '22023';
  end if;
  select o.id into v_order_id from public.orders o where o.order_no = p_order_no;
  if v_order_id is null then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  perform 1 from public.boxes b where b.order_id = v_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  perform 1 from public.orders o where o.id = v_order_id for update;
  -- 6자리 줄은 주문 뒤·사무소 상자 줄 앞(INV-W12) — 아래 취소가 트리거로 6자리를 무효로 바꾼다
  perform 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id
  where b.order_id = v_order_id order by c.id for update of c;
  -- 사무소 상자 줄은 주문 뒤에(INV-W12) — QR 로 시작하는 처리도 상자 → 주문 → 사무소 상자 줄 순이다
  perform 1 from public.office_parcels x join public.boxes b on b.id = x.box_id
  where b.order_id = v_order_id order by x.id for update of x;
  -- 검수에 걸린 상자가 하나라도 있으면 취소하지 않는다 — 그 주문은 검수 불합격 반송으로만 끝난다(INV-M17, 카드 d53)
  if exists (select 1 from public.boxes b
             join public.office_parcels x on x.box_id = b.id
             join public.office_inspections i on i.parcel_id = x.id
             where b.order_id = v_order_id and i.outcome = 'return') then
    raise exception '검수에 걸린 상자가 있는 주문은 취소하지 않는다' using errcode = 'P0061';
  end if;
  update public.orders o
  set status = 'canceled'
  where o.id = v_order_id
    -- 주문 상태는 가장 늦은 상자를 따른다 — 상자 하나만 왔으면 아직 「등록」이다. 그래서 상태가 아니라 「도착한 상자가 있음」으로 본다
    and o.status in ('registered', 'received', 'labeled', 'inspected') and o.shipped_at is null
    and exists (select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
                where b.order_id = o.id and x.state <> 'awaiting')
    -- 출고 송장을 출력한 상자가 하나라도 있으면 취소하지 않는다
    and not exists (select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
                    where b.order_id = o.id and x.state in ('label_printed', 'shipped'));
  if not found then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  insert into public.order_cancellations (order_id, canceled_by, reason) values (v_order_id, auth.uid(), v_reason);
  -- 검수를 마친 상자는 바로 반송 대기로(나갈 수 없게 된 상자 — 반려된 주문과 같은 길)
  update public.office_parcels x
  set state = 'return_waiting'
  from public.boxes b
  where b.id = x.box_id and b.order_id = v_order_id and x.state = 'inspected';
end $$;

CREATE OR REPLACE FUNCTION public.office_run_expiry(p_order_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
  v_n integer;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15): 결제 대기인 줄만 실패로 닫는다 — 조건부 갱신 한 문장.
  --     결제 확정 시작(claim_payment: 결제 대기 → 승인 중)도 같은 줄의 조건부 갱신이라, 겹치면 먼저 잡은 쪽만 반영되고
  --     뒤에 온 쪽은 바뀐 상태를 다시 보고 아무것도 하지 않는다. 승인 중·완료·실패 줄은 건드리지 않는다. 주문 줄은 지우지 않는다.
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15): 같은 규칙. 주문번호를 주면 그 몫이 든 보내기만.
  --     보내기의 결제 완료 시각은 받기 기한의 시작이라 결제 완료에만 둔다(표 제약) — 닫을 때는 상태만 바꾼다.
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  --    주문마다 상자 → 승인 요청 → 주문 순으로 잠그고(INV-W12) 조건을 다시 본다 — 한꺼번에 주문을 잠그면
  --    뒤 단계(보관 상자 넘기기)가 같은 주문의 상자를 주문 뒤에 잠가 QR 처리와 엇갈린다.
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

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13): 차액 줄에 기한 지남을 적는다. 결제 중(confirming)·완료 줄은 건드리지 않는다.
  --    그 주문의 상자는 나갈 수 없게 되고(office_parcel_dead), 아래에서 검수 완료 상자가 반송 대기로 간다.
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and d.created_at <= now() - interval '168 hours'
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    -- 몫 하나만: expire_revgifts 와 같은 조건(결제 완료 + 168시간, 아직 답이 없음)
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 5) 추적 장치로 보관된 상자: 보관된 시각 + 168시간 → 반송 대기(office-workflow INV-W4·W6)
  --    상자마다 상자 → 주문(몫) → 사무소 상자 줄 순으로 잠그고(INV-W12) 다시 본다. 잠그는 사이 상자 연결이 바뀐 상자는 다음 회차로.
  v_held := 0;
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'held' and p.inspected_at <= now() - interval '168 hours'
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
    where p.id = v_parcel and p.state = 'held' and p.inspected_at <= now() - interval '168 hours';
    get diagnostics v_n = row_count;
    v_held := v_held + v_n;
  end loop;

  -- 6) 주문에 묶인 채 보류된 상자: 보류 + 168시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9).
  --    상자마다 넘기기 함수를 부른다 — 주인의 확인과 같은 잠금 순서, 이미 넘긴 상자는 그 함수가 건너뛴다(두 번 돌려도 한 번).
  for v_parcel in
    select p.id from public.office_parcels p
    where p.hold_reason is not null and p.hold_closed_at is null and p.hold_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.hold_at, p.id
  loop
    if public.office_close_held_parcel(v_parcel, null, true) then
      v_held_parcels := v_held_parcels + 1;
    end if;
  end loop;

  -- 7) 승인 뒤 도착하지 않은 상자: 결제 완료 + 720시간 → 그 상자를 닫는다(office-workflow INV-W10).
  --    주문마다 닫기 함수를 부른다 — 입고와 같은 잠금 순서로 잡고 다시 보므로, 그 상자의 입고와 겹쳐도 하나만 반영된다.
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

  -- 8) 결제 완료 + 336시간에 아직 안 온 상자가 있는 진행 중 주문 → 보낸 팬에게 한 번(notifications INV-N15).
  --    같은 이름의 줄은 넣지 않는다(notification_outbox_once) — 두 번 돌려도 한 번. 새로 넣은 주문 수를 센다.
  select count(*)::integer into v_box_missing_alerts
  from (
    select public.notification_enqueue('box_missing', o.id, null, 1::smallint, o.fan_id, now()) as n
    from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
  ) q
  where q.n > 0;

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공)
  --    5단계와 같이 상자마다 INV-W12 순서로 잠그고 다시 본다.
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'inspected' and public.office_parcel_dead(p)
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
    where p.id = v_parcel and p.state = 'inspected' and public.office_parcel_dead(p);
  end loop;

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간. 맨 뒤에 둔다 — 찾기 함수가 이 표를 상자·주문·사무소 상자 줄 다음에 잠근다(INV-W12)
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels,
                            'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts);
end $$;
