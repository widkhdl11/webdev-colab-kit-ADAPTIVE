-- 반송은 팬꾹이 선불로 보내고 환불에서 택배 원가(배송비 칸)를 뺀다 (payment INV-M8, DECISIONS 2026-10-08 — 정책 질문 ③).
-- 지금까지 반송은 착불이라 「차액 요청 뒤 7일 미납 반송」은 쓰지 않은 배송비 칸을 돌려줬다. 선불 반송이면 그 칸이 반송에 쓰이므로
-- 이 갈래는 상품 대금 칸만 돌려준다(검수 불합격과 같은 「팬의 위반」 줄). 나머지 갈래는 20261006000013 그대로다 —
-- 입고 뒤 거절·반려는 이미 배송비 칸을 빼고(= 반송비), 검수 불합격은 이미 상품 대금 칸만 돌려준다.
-- 주문에 이어지지 않은 상자(미확인·보류·거절 뒤 늦게 온 상자)는 뺄 결제가 없어 지금처럼 착불이다(office-workflow 원칙 2).

create or replace function public.refund_due_of_payment(p_payment_id uuid)
returns integer
language sql stable security definer set search_path = ''
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
    when o.received_at is null then p.amount_krw
    when o.status = 'canceled' then p.shipping_fee_krw
    else p.amount_krw - p.shipping_fee_krw
  end
  from public.payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id;
$$;
