-- 2026-10-12 D11 리뷰 반영 — 차단 때 결제 대기였던 주문이 그 뒤 결제가 끝나면 거절 알림(gift_undelivered) 한 줄.
-- 스펙: notifications INV-N2·N17 ② (S2·S17b), decline-block INV-D8 (S8b).
--
-- 결제 전 주문은 차단으로만 거절된다(decline-block INV-D8). 거절되는 순간에는 돌려줄 결제 금액이 없어 알림을 넣지 않는다
-- (inbound_void_for_order, 20261012000004). 그런데 그 주문의 결제가 뒤늦게 끝나면 주문은 거절 그대로이고 결제 금액은 전액 환불 대상이다.
-- 직접 거절·7일 반려된 주문의 팬은 「선물이 전해지지 못했어요」를 받는데 이 경우만 아무것도 오지 않으면,
-- 알림이 오는지로 차단을 가려낼 수 있다(INV-N2 — 발송 여부로도 거절 종류가 드러나면 안 된다).
-- 그래서 결제 반영 함수가 거절된 주문에 결제를 반영하는 그 처리에서 같은 거절 알림을 한 번 넣는다.
-- 한 번만: 결제 줄은 승인 중(pending·confirming)일 때만 반영되고, 이 갈래는 registered_at 이 비어 있을 때만 탄다. 줄 이름도 같아 겹치지 않는다(INV-N4).
--
-- 나머지는 20261007000006 의 settle_payment 그대로. 다시 적용해도 결과가 같다(create or replace).

create or replace function public.settle_payment(p_toss_order_id text, p_status payment_status, p_payment_key text, p_request_id text, p_payload text, p_requested_at timestamp with time zone)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
  v_request_id uuid;
  v_fan_id uuid;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'settle_payment 는 done 또는 failed 만' using errcode = '22023';
  end if;

  update public.payments
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = now()
  where toss_order_id = p_toss_order_id and status in ('pending', 'confirming')
  returning * into v_payment;

  if not found then
    return false;
  end if;

  if p_status = 'done' and v_payment.kind = 'initial' then
    update public.orders set status = 'registered', registered_at = p_requested_at
    where id = v_payment.order_id and status = 'pending_payment';
    if found then
      insert into public.approval_requests (request_id, order_id, payload, created_at)
      values (p_request_id, v_payment.order_id, p_payload, p_requested_at)
      returning id into v_request_id;
      -- 알림 INV-N3·N8: 승인 요청 1차는 그 주문의 크리에이터 계정에게
      perform public.notification_enqueue('approval_request', v_payment.order_id, v_request_id, 1::smallint,
        (select c.profile_id from public.orders o join public.creators c on c.id = o.creator_id where o.id = v_payment.order_id),
        p_requested_at);
      -- INV-C1: 상자마다 받는 주소 6자리
      perform public.inbound_issue_for_order(v_payment.order_id);
    else
      update public.orders set registered_at = p_requested_at
      where id = v_payment.order_id and status = 'rejected' and registered_at is null
      returning fan_id into v_fan_id;
      -- 결제 전에 (차단으로) 거절된 주문의 결제가 끝났다 — 전액 환불 대상. 직접 거절·7일 반려와 같은 거절 알림을 보낸 팬에게 한 번
      -- (notifications INV-N2·N17 ②). 거절한 사람·차단 표시는 읽지 않는다 — 상자가 하나도 오지 않은 결제된 거절 주문이라는 사정만 본다.
      if found then
        perform public.notification_enqueue('gift_undelivered', v_payment.order_id, null, 1::smallint, v_fan_id, now());
      end if;
    end if;
  end if;
  return true;
end $$;
