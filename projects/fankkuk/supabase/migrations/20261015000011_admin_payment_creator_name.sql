-- 관리자 결제 목록(admin_payment_rows)의 역조공 줄 — 낸 사람 이름을 크리에이터 공개 이름으로(없으면 닉네임).
-- 2026-10-15: 가입 닉네임 작업(signup INV-U13)이 크리에이터 닉네임을 공개 이름으로 덮던 처리를 뺐다. 원래 무통장 입금 마이그레이션에 같이 들어 있던 수정인데,
-- 무통장 입금을 뺄 때(사용자 「무통장 입금은 일단 빼줘」) 함께 빠져 따로 둔다. 나머지는 20261010000003_late_box.sql 의 정의와 같다.
-- 운영 적용: 아무 때나(함수 이름·인자·돌려주는 칸이 그대로라 앱 배포와 상관없다).

create or replace function public.admin_payment_rows()
 RETURNS TABLE(unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text, amount_krw integer, goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer, paid_at timestamp with time zone, refund_status text, refund_krw integer, refund_error text, needs_review boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with units as (
    -- 확인 필요(INV-M19) 결제는 끝나지 않았어도 나온다 — 시각은 「승인 중」이 된 시각, 환불 대상은 아니다
    select 'gift'::text as unit_kind, p.id as unit_id, o.order_no, p.kind as payment_kind, fp.nickname as payer_nickname,
           p.amount_krw, p.goods_krw, p.service_fee_krw, p.inspection_fee_krw, p.shipping_fee_krw,
           coalesce(p.settled_at, p.confirming_at) as paid_at,
           case when p.status = 'done' then public.refund_due_of_payment(p.id) else 0 end as due,
           r.status as refund_state, r.amount_krw as refunded, r.last_error,
           p.review_at is not null and p.status = 'confirming' as needs_review
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    left join public.refunds r on r.payment_id = p.id and r.box_id is null
    where p.status = 'done' or (p.review_at is not null and p.status = 'confirming')
    union all
    -- 상자마다 한 줄(INV-M8·M9): 도착하지 않음으로 닫힌 상자('missing_box'). 늦게 온 상자는 주문 환불에서 배송비를 뺀 몫으로만 돌려주고 상자 줄을 따로 만들지 않는다.
    -- 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
           'missing_box', fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error, false
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    -- 상자 환불은 닫힌 상자에만 있다(INV-M9, 2026-10-10)
    where b.missing_at is not null
    union all
    select 'revgift', s.id, s.order_no, 'revgift', coalesce(cr.name, cp.nickname),
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, coalesce(d.settled_at, d.confirming_at),
           case when d.status = 'done' then public.refund_due_of_share(s.id) else 0 end, r.status, r.amount_krw, r.last_error,
           d.review_at is not null and d.status = 'confirming'
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    left join public.refunds r on r.share_id = s.id
    where d.status = 'done' or (d.review_at is not null and d.status = 'confirming')
  )
  select u.unit_kind, u.unit_id, u.order_no, u.payment_kind, u.payer_nickname,
         u.amount_krw, u.goods_krw, u.service_fee_krw, u.inspection_fee_krw, u.shipping_fee_krw, u.paid_at,
         coalesce(u.refund_state, case when u.due > 0 then 'due' else 'none' end),
         coalesce(u.refunded, case when u.due > 0 then u.due end),
         u.last_error, u.needs_review
  from units u
  where public.is_operator()
  order by u.paid_at desc, u.order_no
  limit 500;
$function$;
