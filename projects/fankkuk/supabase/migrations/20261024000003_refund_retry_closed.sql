-- 처음 누른 지 14일이 지나 다시 시도가 막힌 환불 줄에는 「직접 환불함」만 보인다 (2026-10-24, 카드 d126 사용자 「수정안으로」).
-- 스펙: docs/specs/admin-console.md INV-K7 (S7f).
--
-- 왜
--   카드 d126 은 「14일이 지나 다시 시도가 막힌 기록은 직접 환불함만」이었는데, 결제·역조공 목록이 환불 기록의 처음 누른 시각을 받지 않아
--   화면이 그 줄을 가려내지 못했다. 그래서 「다시 시도」가 함께 보였고, 누르면 그제서야 거부(P0025)됐다.
--
-- 무엇을
--   admin_payment_rows · admin_revgift_shares 에 refund_retry_closed 칸 하나 — 환불 기록이 있고 처음 누른 지 14일이 지났으면 true(완료 줄에는 어차피 버튼이 없다).
--   시각 자체는 내보내지 않고 판정만 내보낸다. 기준은 admin_claim_refund 의 P0025 와 같다(created_at <= now() - 14일).
--   돌려주는 칸이 바뀌어 함수를 지우고 다시 만든다 — 권한도 다시 준다. 개인정보 구역(pii)은 건드리지 않는다.
--   admin_revgift_shares 의 환불 상태는 하위 조회에서 left join 으로 바꿨다 — 몫 하나에 환불 기록은 하나뿐이다(refunds.share_id 유일).

drop function if exists public.admin_payment_rows();

create function public.admin_payment_rows()
 RETURNS TABLE(unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text, amount_krw integer, goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer, paid_at timestamp with time zone, refund_status text, refund_krw integer, refund_error text, needs_review boolean, refund_retry_closed boolean)
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
           r.status as refund_state, r.amount_krw as refunded, r.last_error, r.created_at as refund_created_at,
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
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error, r.created_at, false
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
           case when d.status = 'done' then public.refund_due_of_share(s.id) else 0 end, r.status, r.amount_krw, r.last_error, r.created_at,
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
         u.last_error, u.needs_review,
         -- admin_claim_refund 가 P0025 로 거부하는 기준과 같다(처음 누른 지 14일)
         coalesce(u.refund_created_at <= now() - interval '14 days', false)
  from units u
  where public.is_operator()
  order by u.paid_at desc, u.order_no
  limit 500;
$function$;

revoke all on function public.admin_payment_rows() from public, anon;
grant execute on function public.admin_payment_rows() to authenticated;

drop function if exists public.admin_revgift_shares();

create function public.admin_revgift_shares()
 RETURNS TABLE(share_id uuid, order_no text, creator_name text, fan_nickname text, tier text, reply text, deadline_at timestamp with time zone, received_at timestamp with time zone, refund_status text, refund_retry_closed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id, s.order_no, c.name, f.nickname, s.tier::text, s.reply,
         public.revgift_deadline(d.settled_at), coalesce(p.received_at, s.received_at),
         rf.status,
         -- admin_claim_refund 가 P0025 로 거부하는 기준과 같다(처음 누른 지 14일)
         coalesce(rf.created_at <= now() - interval '14 days', false)
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
  join public.creators c on c.id = d.creator_id
  join public.profiles f on f.id = s.fan_id
  left join public.office_parcels p on p.share_id = s.id
  left join public.refunds rf on rf.share_id = s.id
  where public.is_operator()
  order by d.settled_at desc, s.seq
  limit 500;
$function$;

revoke all on function public.admin_revgift_shares() from public, anon;
grant execute on function public.admin_revgift_shares() to authenticated;
