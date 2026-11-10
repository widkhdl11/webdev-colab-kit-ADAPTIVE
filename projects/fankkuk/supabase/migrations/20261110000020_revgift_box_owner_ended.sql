-- 크리에이터가 보는 선물함에 끝난 시각(ended_at)을 더한다(2026-11-10 ux 리뷰 — 0명 마감 선물함을 열면 상자 고르기 화면이 떴다).
-- 「closed 이고 끝난 시각이 있음」= 0명 마감이다(20261109000040 · 스펙 INV-GB1 · Q21). 화면은 이 값으로 명세 closed_empty(「마감」 + 읽기 전용 목록, 2·3페이지·선물함 취소 없음)를 그린다.
-- 본문은 20261109000040 의 정의 그대로에 'ended_at' 한 칸만 더했다. 권한(security definer · search_path · grant)도 그대로다. 다시 돌려도 결과가 같다.

create or replace function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at, 'ended_at', b.ended_at,
    'inbound_code', case when b.code_voided_at is null and b.status in ('awaiting_box', 'arrived', 'held') then b.inbound_code end,
    'carton_count', b.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = b.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status, 'chosen_tier', a.chosen_tier,
                                         'waitlist_no', public.revgift_box_waitlist_no(a.id))
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb),
    'invoice', (
      select jsonb_build_object(
        'amount_krw', i.amount_krw, 'shipping_fee_krw', i.shipping_fee_krw, 'service_fee_krw', i.service_fee_krw,
        'carton_cod_krw', i.carton_cod_krw, 'created_at', i.created_at,
        'pay_due_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'pay_due_hours')::integer),
        'return_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'unpaid_return_hours')::integer),
        'paying', exists (select 1 from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'confirming'),
        'paid_at', (select x.settled_at from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'done'),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nickname', p.nickname, 'tier', l.tier, 'shipping_fee_krw', l.shipping_fee_krw, 'surcharge_region', l.surcharge_region,
                   'surcharge_krw', l.surcharge_krw, 'service_fee_krw', l.service_fee_krw, 'amount_krw', l.amount_krw,
                   'progress', case
                     when a.status in ('shipped', 'delivered') then 'shipped'
                     when a.status = 'ended' and exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done') then 'refunded'
                     when a.status = 'ended' then 'ended'
                     when a.status = 'paid' then 'paid'
                     else 'unpaid' end,
                   -- 배송 단계 재료(delivery-status INV-DS1·DS2) — 송장 출력 여부·출고한 서울 날짜·팬의 받았어요. 송장번호는 넣지 않는다(INV-DS3)
                   'printed', a.printed_at is not null or a.shipped_at is not null,
                   'shipped_on', case when a.shipped_at is not null then to_char((a.shipped_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') end,
                   'received', a.fan_received_at is not null,
                   'carrier', (select t.carrier_state from public.delivery_trackings t where t.application_id = a.id order by t.created_at desc limit 1)) order by l.line_no)
          from public.revgift_box_invoice_lines l
          join public.revgift_box_applications a on a.id = l.application_id
          join public.profiles p on p.id = a.fan_id
          where l.invoice_id = i.id), '[]'::jsonb))
      from public.revgift_box_invoices i where i.box_id = b.id))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;
revoke all on function public.my_revgift_box(uuid) from public, anon, service_role;
grant execute on function public.my_revgift_box(uuid) to authenticated;
