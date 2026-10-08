-- 추적 장치로 보관된 상자 — 팬에게도 알리고 168시간 뒤 반송 대기 (office-workflow INV-W4·W6 S4f, notifications INV-N13,
-- DECISIONS 2026-10-08 — 정책 질문 ②). 환불은 기존 검수 불합격 줄(상품 대금 칸만)이 그대로 맡는다 — 반송 대기로 넘어가면
-- 주문 집계(office_sync_order)가 검수 결과를 「반송」으로 바꾸고, refund_due_of_payment 가 상품 대금 칸을 돌려준다.
-- 1) 알림 종류에 hold_fan(보낸 팬에게 「돌려보낼 상자」)을 더한다.
-- 2) office_scan_inspect — 20261008000004 와 같고, 보관이면 그 주문의 팬에게 hold_fan 줄을 하나 더 넣는다(주문 단위 한 번 — 같은 이름의 줄은 넣지 않는다).
-- 3) office_run_expiry — 20261006000020 과 같고, 보관된 시각(inspected_at)부터 168시간 지난 보관 상자를 반송 대기로 넘기는 단계를 더했다.
--    조건부 갱신 한 문장이라 두 번 돌려도 같은 상자를 다시 처리하지 않는다(INV-W6). 돌려주는 값에 held(넘긴 상자 수)를 더한다.

alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan'));
alter table public.notification_kakao_templates drop constraint notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan'));

create or replace function public.office_scan_inspect(p_qr text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_outcome text;
  v_next public.office_state;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'labeled' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  select i.outcome into v_outcome from public.office_inspections i
  where i.parcel_id = v.id order by i.at desc, i.id desc limit 1;
  if v_outcome is null then
    raise exception '검수 기록이 없다' using errcode = 'P0044';
  end if;
  v_next := case
    when v_outcome = 'hold' then 'held'
    when v_outcome = 'return' or public.office_parcel_dead(v) then 'return_waiting'
    else 'inspected'
  end;
  if v_next = 'inspected' and v.box_id is not null
     and exists (select 1 from public.boxes b where b.id = v.box_id and b.measured_tier is null) then
    raise exception '실측 기록이 없다' using errcode = 'P0053';
  end if;
  update public.office_parcels set state = v_next, inspected_at = now() where id = v.id;
  if v_next = 'held' then
    insert into public.office_hold_alerts (parcel_id, creator_id)
    select v.id, o.creator_id from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
    -- 알림 INV-N13: 그 주문의 크리에이터 계정에게 주문 단위로 한 번. 팬에게는 보관 알림이 없다.
    perform public.notification_enqueue('hold', o.id, null, 1::smallint, c.profile_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id join public.creators c on c.id = o.creator_id
    where b.id = v.box_id;
    -- INV-N13: 보낸 팬에게 「돌려보낼 상자」 — 주문 단위로 한 번. 무엇이 나왔는지는 본문 틀에 칸이 없다
    perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;

create or replace function public.office_run_expiry(p_order_no text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
  v_pending_gifts integer;
  v_pending_revgifts integer;
  v_held integer;
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
  with expired as (
    update public.approval_requests r
    set status = 'expired', decided_at = now()
    from public.orders o
    where o.id = r.order_id and r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    returning r.order_id
  )
  update public.orders o set status = 'expired'
  from expired e where o.id = e.order_id and o.approved_at is null;
  get diagnostics v_gifts = row_count;

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

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
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'held' and p.inspected_at <= now() - interval '168 hours'
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));
  get diagnostics v_held = row_count;

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공)
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'inspected' and public.office_parcel_dead(p)
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held);
end $$;
