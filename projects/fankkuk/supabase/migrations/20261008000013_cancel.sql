-- 취소 (payment INV-M16 팬의 입고 전 취소 · INV-M17 대표의 입고 뒤 취소 · INV-M8 「입고 뒤 취소」 줄, 정책 ① 「추천대로」 — 카드 d49).
--
-- 1) order_cancellations — 대표의 입고 뒤 취소 기록(사유 1~200자, 누가·언제). 주문마다 한 줄, 추가만.
-- 2) cancel_my_gift(주문번호) — 로그인한 보낸 사람이 아직 상자가 하나도 입고되지 않은 결제 완료 주문을 취소한다(전액 환불 대상).
--    잠금 순서는 입고와 같다: 상자 줄 → 승인 요청 → 주문. 잠근 뒤 「입고된 상자 없음」을 다시 본다 — 입고와 겹치면 하나만 반영된다.
--    6자리는 주문 상태 트리거(orders_void_inbound_codes)가 같은 처리에서 전부 무효로 만든다.
-- 3) admin_cancel_received_gift(주문번호, 사유) — 대표만. 상자가 하나라도 도착했고 출고 송장을 출력하기 전인 진행 중 주문.
--    검수를 마친 상자는 바로 반송 대기로, 아직 검수 전인 상자는 검수 뒤 「나갈 수 없는 상자」(office_parcel_dead — 취소 포함)로 반송 대기에 간다.
-- 4) refund_due_of_payment — 20261008000010 을 대체. 「입고 뒤 취소」 = 결제 금액 − 닫힌 상자 금액 − 도착한 상자마다 (검수비 + 배송비).
--    오지 않은 상자의 칸은 빼지 않는다. 차액 결제는 그 결제의 검수비·배송비 칸을 뺀다.
--
-- 오류 꼴: 42501 로그인 안 함·대표 아님 · 22023 사유 꼴 · P0002 내 주문이 아니거나 취소할 수 있는 상태가 아님
--         · P0061 검수에 걸린 상자가 있는 주문(입고 뒤 취소 — 검수 불합격 반송으로만 끝난다, 카드 d53)

-- ── 1) 대표 취소 기록 ──────────────────────────────────

create table public.order_cancellations (
  order_id uuid primary key references public.orders (id) on delete cascade,
  canceled_by uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) between 1 and 200),
  canceled_at timestamptz not null default now()
);

alter table public.order_cancellations enable row level security;
revoke all on public.order_cancellations from anon, authenticated;

-- ── 2) 팬의 입고 전 취소 ──────────────────────────────────

create function public.cancel_my_gift(p_order_no text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  -- 사람 ID 는 받지 않는다 — 로그인 토큰의 계정이 보낸 주문만. 남의 주문·없는 주문은 같은 거부(있는지 알려 주지 않는다).
  select o.id into v_order_id from public.orders o where o.order_no = p_order_no and o.fan_id = v_uid;
  if v_order_id is null then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  perform 1 from public.boxes b where b.order_id = v_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  perform 1 from public.orders o where o.id = v_order_id for update;
  -- 잠근 뒤 다시 본다: 진행 중 · 결제 완료 · 들어온 상자 없음
  update public.orders o
  set status = 'canceled'
  where o.id = v_order_id
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'initial' and p.status = 'done')
    and not exists (select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
                    where b.order_id = o.id and x.state <> 'awaiting');
  if not found then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.cancel_my_gift(text) from public, anon;
grant execute on function public.cancel_my_gift(text) to authenticated;

-- ── 3) 대표의 입고 뒤 취소 ──────────────────────────────────

create function public.admin_cancel_received_gift(p_order_no text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  -- 사무소 상자 줄을 주문보다 먼저 잠근다 — 송장 출력이 상자 줄 → 주문 순으로 잠그므로 순서가 반대면 서로 기다린다
  perform 1 from public.office_parcels x join public.boxes b on b.id = x.box_id
  where b.order_id = v_order_id order by x.id for update of x;
  perform 1 from public.orders o where o.id = v_order_id for update;
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

revoke all on function public.admin_cancel_received_gift(text, text) from public, anon;
grant execute on function public.admin_cancel_received_gift(text, text) to authenticated;

-- ── 4) 환불 계산 — 입고 뒤 취소 줄 ──────────────────────────────────

create or replace function public.refund_due_of_payment(p_payment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.status <> 'done' or o.shipped_at is not null then null
    when o.status not in ('rejected', 'expired', 'canceled')
         and exists (select 1 from public.payments d
                     where d.order_id = o.id and d.kind = 'difference' and d.expired_at is not null and d.status <> 'done')
         and not exists (select 1 from public.boxes b where b.order_id = o.id and b.measured_tier = 'oversize')
         and not exists (select 1 from public.boxes b
                         join public.office_parcels x on x.box_id = b.id
                         join public.office_inspections i on i.parcel_id = x.id
                         where b.order_id = o.id and i.outcome = 'return')
      then p.goods_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    when o.status not in ('rejected', 'expired', 'canceled') then null
    -- 입고 전에 끝남: 결제 금액에서 이미 정한 상자 환불만 뺀다
    when o.received_at is null then greatest(p.amount_krw - c.refunded, 0)
    -- 입고 뒤 취소(INV-M17): 도착한 상자의 검수비·반송 택배비만 뺀다. 오지 않은 상자는 빼지 않는다. 차액 결제는 그 결제의 두 칸을 뺀다.
    when o.status = 'canceled' and p.kind = 'initial' then greatest((p.amount_krw - c.price) - c.arrived_fees, 0)
    when o.status = 'canceled' then greatest(p.amount_krw - p.inspection_fee_krw - p.shipping_fee_krw, 0)
    -- 입고 뒤 거절·반려: 남은 상자 몫에서 남은 상자의 반송 택배비만 뺀다
    else (p.amount_krw - c.price) - (p.shipping_fee_krw - c.shipping)
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  -- 닫힌 상자의 금액·배송비, 도착한 상자의 검수비 + 배송비, 이미 정한 상자 환불 — 첫 결제에만 붙는다
  cross join lateral (
    select coalesce(sum(b.price_krw) filter (where p.kind = 'initial' and b.missing_at is not null), 0) as price,
           coalesce(sum(b.shipping_fee_krw) filter (where p.kind = 'initial' and b.missing_at is not null), 0) as shipping,
           coalesce(sum(b.inspection_fee_krw + b.shipping_fee_krw)
                      filter (where p.kind = 'initial' and b.missing_at is null
                                and exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting')), 0) as arrived_fees,
           (select coalesce(sum(r.amount_krw), 0) from public.refunds r where r.payment_id = p.id and r.box_id is not null) as refunded
    from public.boxes b
    where b.order_id = o.id
  ) c
  where p.id = p_payment_id;
$$;
