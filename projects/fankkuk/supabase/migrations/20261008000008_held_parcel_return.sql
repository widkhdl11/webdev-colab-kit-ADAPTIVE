-- 주문에 묶인 채 멈춘 상자의 반송 (inbound-address-code INV-C9 S9b~S9d, DECISIONS 2026-10-08 — 정책 질문 12).
-- 지금까지 「반송으로 넘기기」(admin_return_unmatched)와 7일 자동 처리는 어느 주문에도 이어지지 않은 보류 상자(office_unmatched)에만 있었다.
-- 상자 작업 줄(office_parcels)에 보류 표시가 붙은 상자 — 같은 6자리 분쟁 · 같은 송장번호 분쟁 · 「제가 보낸 게 아니에요」 · 분쟁 끝에 떼어 낸 상자 —
-- 는 끝이 없었다. 그래서:
-- 1) 넘긴 표시 두 칸(hold_closed_at · hold_closed_by — 자동 처리면 비어 있다).
-- 2) office_close_held_parcel — 안에서만 쓰는 넘기기: 상자를 주문(·몫)에서 떼어 내고 넘긴 표시를 적은 뒤 주문을 다시 집계한다.
--    이 반송은 주문 환불을 만들지 않는다(주문 쪽에서는 그 상자가 아직 오지 않은 것으로 돌아간다). 떼어 낸 상자는 착불 반송(office-workflow 원칙 2).
-- 3) admin_return_held_parcel(상자 줄 id) — 운영자만. 분쟁 둘은 보류 + 168시간이 지나야, 「아니에요」·떼어 낸 상자는 바로.
-- 4) office_run_expiry — 20261008000007 과 같고, 보류 + 168시간 지난 상자를 넘기는 단계를 더했다(돌려주는 값 held_parcels).
-- 5) admin_unmatched_parcels — 상자 줄의 「넘김」을 반송 대상(expired)으로, 기한(보류 + 168시간)을 채운다.
-- 잠금 순서는 주인의 찾기(find_held_parcel)와 같다: 상자 → 승인 요청 → 주문 → 상자 작업 줄. 넘기기와 주인의 확인이 겹쳐도 하나만 반영된다.
--
-- 오류 꼴: 42501 운영자 아님 · P0002 없는 상자 줄 · 55000 보류가 아님·이미 넘김·분쟁 기한 전

alter table public.office_parcels add column hold_closed_at timestamptz;
alter table public.office_parcels add column hold_closed_by uuid references public.profiles (id);
-- 넘긴 상자는 어느 주문·몫에도 묶이지 않는다 — 떼어 낸 상자(detached)만 허용하던 제약에 「넘김」을 더한다
alter table public.office_parcels drop constraint office_parcels_one_unit;
alter table public.office_parcels add constraint office_parcels_one_unit
  check (num_nonnulls(box_id, share_id) = 1 or (num_nonnulls(box_id, share_id) = 0 and (hold_reason = 'detached' or hold_closed_at is not null)));
alter table public.office_parcels add constraint office_parcels_hold_closed
  check ((hold_closed_by is null or hold_closed_at is not null) and (hold_closed_at is null or hold_reason is not null));

-- ── 2) 넘기기 (안에서만) ──────────────────────────────────

create function public.office_close_held_parcel(p_id uuid, p_by uuid, p_require_due boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_box_id uuid;
  v_order_id uuid;
begin
  -- 잠금 순서: 상자 → 승인 요청 → 주문 → 상자 작업 줄(find_held_parcel 과 같다)
  select p.box_id into v_box_id from public.office_parcels p where p.id = p_id;
  if v_box_id is not null then
    select b.order_id into v_order_id from public.boxes b where b.id = v_box_id for update;
    perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
    perform 1 from public.orders o where o.id = v_order_id for update;
  end if;
  select * into v from public.office_parcels p where p.id = p_id for update;
  if v.id is null then
    raise exception '없는 상자 줄이다' using errcode = 'P0002';
  end if;
  if v.hold_reason is null or v.hold_closed_at is not null or v.box_id is distinct from v_box_id then
    return false;
  end if;
  if p_require_due and v.hold_reason in ('code_dispute', 'waybill_dispute') and v.hold_at > now() - interval '168 hours' then
    return false;
  end if;

  update public.office_parcels
  set box_id = null, share_id = null, hold_closed_at = now(), hold_closed_by = p_by
  where id = v.id;
  if v_order_id is not null then
    perform public.office_sync_order(v_order_id);
  end if;
  return true;
end $$;

-- ── 3) 운영자의 넘기기 ────────────────────────────────────

create function public.admin_return_held_parcel(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if not public.office_close_held_parcel(p_id, auth.uid(), true) then
    raise exception '보류가 아니거나 이미 넘겼거나 아직 기다리는 상자다' using errcode = '55000';
  end if;
end $$;

-- ── 5) 운영자 확인 목록 ───────────────────────────────────

create or replace function public.admin_unmatched_parcels()
returns table (
  id uuid, source text, qr text, waybill_no text, carrier text, arrived_at timestamptz, sender_initial text, shelf text,
  reason text, suspected_theft boolean, state text, deadline_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select u.id, 'unmatched'::text, null::text, u.waybill_no, u.carrier, u.arrived_at, u.sender_initial, u.shelf,
           u.reason, u.suspected_theft,
           case when u.matched_parcel_id is not null then 'matched' when u.expired_at is not null then 'expired' else 'waiting' end,
           u.arrived_at + interval '168 hours'
    from public.office_unmatched u
    union all
    select p.id, 'parcel', p.qr_code, p.inbound_waybill_no, null, p.received_at, null, null,
           p.hold_reason,
           p.hold_reason in ('not_mine', 'detached') or exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
           case when p.hold_closed_at is not null then 'expired' else 'on_hold' end,
           p.hold_at + interval '168 hours'
    from public.office_parcels p
    where p.hold_reason is not null
  ) h (id, source, qr, waybill_no, carrier, arrived_at, sender_initial, shelf, reason, suspected_theft, state, deadline_at)
  where public.is_operator()
  order by (h.state in ('waiting', 'on_hold')) desc, h.arrived_at desc nulls last
  limit 500;
$$;

revoke all on function public.office_close_held_parcel(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_return_held_parcel(uuid) from public, anon;
grant execute on function public.admin_return_held_parcel(uuid) to authenticated;

-- ── 4) 자동 처리 ─────────────────────────────────────────

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
  v_held_parcels integer := 0;
  v_parcel uuid;
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

  -- 6) 주문에 묶인 채 보류된 상자: 보류 + 168시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9).
  --    상자마다 넘기기 함수를 부른다 — 주인의 확인과 같은 잠금 순서, 이미 넘긴 상자는 그 함수가 건너뛴다(두 번 돌려도 한 번).
  for v_parcel in
    select p.id from public.office_parcels p
    where p.hold_reason is not null and p.hold_closed_at is null and p.hold_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no))
    order by p.hold_at, p.id
  loop
    if public.office_close_held_parcel(v_parcel, null, true) then
      v_held_parcels := v_held_parcels + 1;
    end if;
  end loop;

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
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels);
end $$;
