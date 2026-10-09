-- 차액 결제 요청 알림 (notifications INV-N18, 2026-10-09 카드 d55 — 사용자 지시).
-- 사무실 실측이 신고보다 커서 차액 결제 줄이 생기면, 같은 처리에서 그 주문의 보낸 팬에게 알림 줄을 넣는다.
-- 상자마다 한 번이라 상자 칸(parcel_id)을 채운다 — 같은 주문의 두 상자가 모두 크면 두 줄.
-- 1) 종류 목록에 difference_due 를 더한다(발송 대기 줄 · 카카오 템플릿).
-- 2) 상자 칸을 채울 수 있는 종류에 difference_due 를 더한다.
-- 3) office_record_measurement — 차액 결제 줄을 만든 직후 알림 줄. 나머지 본문은 20261006000013 그대로.

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan',
                  'box_missing', 'gift_pending_box', 'difference_due'));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan',
                  'box_missing', 'gift_pending_box', 'difference_due'));

alter table public.notification_outbox drop constraint notification_outbox_parcel_kind;
alter table public.notification_outbox add constraint notification_outbox_parcel_kind
  check ((kind in ('box_arrived', 'difference_due')) = (parcel_id is not null));

create or replace function public.office_record_measurement(p_qr text, p_tier text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_box public.boxes;
  v_order public.orders;
  v_tier public.parcel_tier;
  v_declared public.tier_prices;
  v_measured public.tier_prices;
  v_amount integer;
  v_shipping integer;
  v_inspection integer;
  v_service integer;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_tier is null or p_tier not in ('small', 'medium', 'large', 'oversize') then
    raise exception '실측 구간 값이 아니다' using errcode = '22023';
  end if;
  v_tier := p_tier::public.parcel_tier;
  v := public.office_lock_qr(p_qr);
  if v.box_id is null then
    raise exception '실측 차액은 팬 선물 상자만' using errcode = '22023';
  end if;
  if v.state not in ('received', 'labeled') then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  select * into v_box from public.boxes where id = v.box_id for update;
  if v_box.measured_tier is not null then
    raise exception '실측은 상자마다 한 번만 기록한다' using errcode = '55000';
  end if;
  select * into v_order from public.orders where id = v_box.order_id;

  update public.boxes set measured_tier = v_tier where id = v_box.id;

  if v_tier = 'oversize' then
    return jsonb_build_object('result', 'inspection_failed');
  end if;
  if public.parcel_tier_rank(v_tier) <= public.parcel_tier_rank(v_box.declared_tier)
     or v_order.status in ('rejected', 'expired', 'canceled') then
    return jsonb_build_object('result', 'none');
  end if;

  select * into v_declared from public.tier_prices where tier = v_box.declared_tier;
  select * into v_measured from public.tier_prices where tier = v_tier;
  v_amount := v_measured.price_krw - v_declared.price_krw;
  v_shipping := v_measured.carrier_cost_krw - v_declared.carrier_cost_krw;
  v_inspection := v_measured.inspection_fee_krw - v_declared.inspection_fee_krw;
  v_service := v_amount - v_shipping - v_inspection;
  if v_amount <= 0 then
    return jsonb_build_object('result', 'none');
  end if;
  -- 요금표가 구간마다 칸별로 커지지 않으면(기본 서비스료 칸이 줄면) 차액 칸이 음수가 된다 — 만들지 않고 거부한다
  if v_shipping < 0 or v_inspection < 0 or v_service < 0 then
    raise exception '요금표의 칸 차이가 음수다' using errcode = '22023';
  end if;

  insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order.id, 'difference', v_box.id, 'diff_' || replace(gen_random_uuid()::text, '-', ''), v_amount, 0, v_service, v_inspection, v_shipping);

  -- notifications INV-N18: 차액 요청이 생긴 그 처리에서 보낸 팬에게 상자마다 한 번. 금액·구간은 줄에 담지 않는다(본문 틀에도 칸이 없다, INV-N1).
  insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
  select 'difference_due', v_order.id, v.id, 1, v_order.fan_id, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where v_order.fan_id is not null
    and (ch.channel = 'email'
         or exists (select 1 from public.notification_kakao_templates t where t.kind = 'difference_due'))
  on conflict do nothing;

  return jsonb_build_object('result', 'difference', 'amount_krw', v_amount);
end $$;
