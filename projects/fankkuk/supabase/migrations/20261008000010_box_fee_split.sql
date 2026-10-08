-- 상자마다 요금 칸을 나눠 저장한다 (payment INV-M8·M9·M14, 카드 d51 「추천대로」 2026-10-08).
-- 요금표와 결제 기록은 이미 택배 원가(배송비 칸) · 검수비 · 기본 서비스료로 나뉘어 있다. 상자에는 합계(price_krw)만 있어서,
-- 주문의 상자 하나가 도착하지 않음으로 닫혀 그 상자 금액을 돌려준 뒤 남은 상자가 거절되면 닫힌 상자의 배송비를 다시 빼는 계산이 나왔다
-- (소형 2개 13,800원: 6,900 환불 뒤 거절 환불 0 — 도착한 상자의 서비스료·검수비 2,900 이 사라짐).
--
-- 1) boxes.shipping_fee_krw · inspection_fee_krw — 등록 순간의 요금표 값. 기본 서비스료 = price − 둘. 등록 뒤 바꾸지 않는다.
--    빈 칸이면 boxes_fill_price 가 요금표로 채운다(등록·시드 모두 이 길). 지금 있는 줄은 지금 요금표로 채운다 — 배포 전이라 로컬 시험 자료뿐이다.
-- 2) order_box_amounts_match — 상자 금액의 합 = 결제 금액에 더해, 상자 배송비·검수비의 합 = 결제의 배송비·검수비 칸.
-- 3) refund_due_of_box — 닫힌 상자의 환불은 주문이 끝난 뒤에도 그 상자 금액이다. 단 입고가 하나도 없이 끝난 주문(반려·만료·취소)은
--    주문 환불이 전액을 맡는다.
-- 4) refund_due_of_payment — 20261008000009 를 대체. 첫 결제의 표 계산을 닫힌 상자를 뺀 남은 상자 몫에만 적용한다:
--      입고 전 끝남          → 결제 금액 − 이미 정한 상자 환불
--      입고 뒤 취소          → 배송비 칸 − 닫힌 상자 배송비
--      입고 뒤 거절·반려     → (결제 금액 − 닫힌 상자 금액) − (배송비 칸 − 닫힌 상자 배송비)
--    상품 대금 칸 갈래(검수 불합격 반송·차액 미납)는 그대로다. 차액 결제에는 닫힌 상자가 끼지 않는다.
--    상자 환불 + 주문 환불 ≤ 결제 금액(환불 트리거가 다시 검사한다).
-- 5) admin_payment_rows — 20261008000009 를 대체. 닫힌 상자 줄의 칸(기본 서비스료·검수비·배송비)을 상자에 저장한 값으로 보인다.

-- ── 1) 상자 요금 칸 ──────────────────────────────────

alter table public.boxes add column shipping_fee_krw integer;
alter table public.boxes add column inspection_fee_krw integer;

create or replace function public.boxes_fill_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tp public.tier_prices;
begin
  if new.price_krw is null or new.shipping_fee_krw is null or new.inspection_fee_krw is null then
    select * into tp from public.tier_prices x where x.tier = new.declared_tier;
    new.price_krw := coalesce(new.price_krw, tp.price_krw);
    new.shipping_fee_krw := coalesce(new.shipping_fee_krw, tp.carrier_cost_krw);
    new.inspection_fee_krw := coalesce(new.inspection_fee_krw, tp.inspection_fee_krw);
  end if;
  return new;
end $$;

-- 지금 있는 줄: 지금 요금표 값으로(배포 전 로컬 자료). 조건이 있어 다시 돌려도 채운 줄은 건드리지 않는다.
update public.boxes b
set shipping_fee_krw = tp.carrier_cost_krw, inspection_fee_krw = tp.inspection_fee_krw
from public.tier_prices tp
where tp.tier = b.declared_tier and (b.shipping_fee_krw is null or b.inspection_fee_krw is null);

alter table public.boxes alter column shipping_fee_krw set not null;
alter table public.boxes alter column inspection_fee_krw set not null;
alter table public.boxes add constraint boxes_fees_within_price
  check (shipping_fee_krw >= 0 and inspection_fee_krw >= 0 and shipping_fee_krw + inspection_fee_krw <= price_krw);

-- 칸을 바꾸는 갱신에도 합계 검사가 돌게 트리거 대상 칸을 넓힌다
drop trigger boxes_amounts_match on public.boxes;
create constraint trigger boxes_amounts_match after insert or update of price_krw, shipping_fee_krw, inspection_fee_krw, order_id on public.boxes
deferrable initially deferred for each row execute function public.boxes_amounts_check();

-- ── 2) 합계 검사 ──────────────────────────────────

create or replace function public.order_box_amounts_match(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.payments;
  v_sum bigint;
  v_shipping bigint;
  v_inspection bigint;
begin
  select * into p from public.payments x where x.order_id = p_order_id and x.kind = 'initial';
  if p.id is null then
    return; -- 결제 줄이 들어올 때 확인한다
  end if;
  select coalesce(sum(b.price_krw), 0), coalesce(sum(b.shipping_fee_krw), 0), coalesce(sum(b.inspection_fee_krw), 0)
    into v_sum, v_shipping, v_inspection
  from public.boxes b where b.order_id = p_order_id;
  if v_sum <> p.amount_krw then
    raise exception '상자 금액의 합(%)이 결제 금액(%)과 다르다 (INV-M14)', v_sum, p.amount_krw using errcode = '23514';
  end if;
  if v_shipping <> p.shipping_fee_krw or v_inspection <> p.inspection_fee_krw then
    raise exception '상자 배송비·검수비의 합(%·%)이 결제 칸(%·%)과 다르다 (INV-M14)', v_shipping, v_inspection, p.shipping_fee_krw, p.inspection_fee_krw
      using errcode = '23514';
  end if;
end $$;

-- ── 3) 닫힌 상자의 환불 ──────────────────────────────────

create or replace function public.refund_due_of_box(p_box_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.missing_at is null or p.status <> 'done' then null
    -- 입고가 하나도 없이 끝난 주문은 주문 환불이 결제 금액 전액을 맡는다
    when o.status in ('rejected', 'expired', 'canceled') and o.received_at is null then null
    else b.price_krw
  end
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  where b.id = p_box_id;
$$;

-- ── 4) 주문 환불 — 남은 상자 몫에만 표를 적용 ──────────────────────────────────

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
    -- 입고 뒤 취소: 남은 상자의 배송비만(닫힌 상자의 배송비는 상자 환불에 들어 있다)
    when o.status = 'canceled' then p.shipping_fee_krw - c.shipping
    -- 입고 뒤 거절·반려: 남은 상자 몫에서 남은 상자의 반송 택배비만 뺀다
    else (p.amount_krw - c.price) - (p.shipping_fee_krw - c.shipping)
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  -- 닫힌 상자의 금액·배송비와 이미 정한 상자 환불 — 첫 결제에만 붙는다
  cross join lateral (
    select coalesce(sum(b.price_krw) filter (where p.kind = 'initial'), 0) as price,
           coalesce(sum(b.shipping_fee_krw) filter (where p.kind = 'initial'), 0) as shipping,
           (select coalesce(sum(r.amount_krw), 0) from public.refunds r where r.payment_id = p.id and r.box_id is not null) as refunded
    from public.boxes b
    where b.order_id = o.id and b.missing_at is not null
  ) c
  where p.id = p_payment_id;
$$;

-- ── 5) 관리자 결제·환불 내역 — 닫힌 상자 줄의 칸 ──────────────────────────────────

create or replace function public.admin_payment_rows()
returns table (unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text, amount_krw integer,
               goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer,
               paid_at timestamptz, refund_status text, refund_krw integer, refund_error text)
language sql
stable
security definer
set search_path = ''
as $$
  with units as (
    select 'gift'::text as unit_kind, p.id as unit_id, o.order_no, p.kind as payment_kind, fp.nickname as payer_nickname,
           p.amount_krw, p.goods_krw, p.service_fee_krw, p.inspection_fee_krw, p.shipping_fee_krw, p.settled_at as paid_at,
           public.refund_due_of_payment(p.id) as due, r.status as refund_state, r.amount_krw as refunded, r.last_error
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    left join public.refunds r on r.payment_id = p.id and r.box_id is null
    where p.status = 'done'
    union all
    -- 도착하지 않음으로 닫힌 상자(INV-M8) — 상자마다 한 줄. 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end, 'missing_box', fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    where b.missing_at is not null
    union all
    select 'revgift', s.id, s.order_no, 'revgift', cp.nickname,
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, d.settled_at,
           public.refund_due_of_share(s.id), r.status, r.amount_krw, r.last_error
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.refunds r on r.share_id = s.id
    where d.status = 'done'
  )
  select u.unit_kind, u.unit_id, u.order_no, u.payment_kind, u.payer_nickname,
         u.amount_krw, u.goods_krw, u.service_fee_krw, u.inspection_fee_krw, u.shipping_fee_krw, u.paid_at,
         coalesce(u.refund_state, case when u.due > 0 then 'due' else 'none' end),
         coalesce(u.refunded, case when u.due > 0 then u.due end),
         u.last_error
  from units u
  where public.is_operator()
  order by u.paid_at desc, u.order_no
  limit 500;
$$;
