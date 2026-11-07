-- 개인접수 (payment INV-M23, 2026-11-07 — 사용자 「요금 11-07 최종」 3번).
-- 팬 선물 상자의 실측이 대형을 넘으면, 열린 주문(거절·만료·취소가 아님)에서는 검수 불합격으로 닫지 않고
-- 운영자가 넣은 우체국 실비로 차액 결제를 요청한다. 그 뒤 차액 결제·7일 미납 반송·송장 잠금은 INV-M11~M13 그대로다.
--
-- 1) boxes.personal_intake_cost_krw — 개인접수 상자의 우체국 실비(원). 있으면 실측 구간은 대형이다.
-- 2) personal_intake_cost_max_krw() — 실비 상한 100,000원(시험·화면이 이 값을 같이 본다).
-- 3) office_record_measurement(p_qr, p_tier, p_cost_krw default null) — 옛 2인자 함수는 지우고 다시 만든다(겹침 없게).
--    본문은 20261009000004_difference_alert.sql 그대로에 개인접수 갈래. 실비 오류는 P0110(화면이 실비 칸 안내를 고른다).
-- 4) my_gift_boxes · my_difference_payments — 개인접수 상자의 크기 칸을 'personal_intake' 로(INV-M23 ④).
--    나머지 칸·판정은 각각 20261102000001_approval_cancel.sql · 20261021000001_deadline_clocks.sql 그대로.

alter table public.boxes add column if not exists personal_intake_cost_krw integer;
alter table public.boxes drop constraint if exists boxes_personal_intake_cost;
alter table public.boxes add constraint boxes_personal_intake_cost
  check (personal_intake_cost_krw is null or (personal_intake_cost_krw between 1 and 100000 and measured_tier = 'large'));

create or replace function public.personal_intake_cost_max_krw()
returns integer
language sql immutable set search_path = ''
as $$ select 100000 $$;
revoke all on function public.personal_intake_cost_max_krw() from public, anon;
grant execute on function public.personal_intake_cost_max_krw() to authenticated;

drop function if exists public.office_record_measurement(text, text);

create or replace function public.office_record_measurement(p_qr text, p_tier text, p_cost_krw numeric default null)
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
  v_open boolean;
  v_cost integer;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_tier is null or p_tier not in ('small', 'medium', 'large', 'oversize') then
    raise exception '실측 구간 값이 아니다' using errcode = '22023';
  end if;
  v_tier := p_tier::public.parcel_tier;
  -- INV-M23: 실비는 개인접수(대형 초과)에만
  if p_cost_krw is not null and v_tier <> 'oversize' then
    raise exception '실비는 대형 초과에만 넣는다' using errcode = 'P0110';
  end if;
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
  v_open := v_order.status not in ('rejected', 'expired', 'canceled');

  if v_tier = 'oversize' then
    -- 닫힌 주문은 지금처럼 검수 불합격(INV-M8 그 줄). 실비를 넣어도 남기지 않는다
    if not v_open then
      update public.boxes set measured_tier = 'oversize' where id = v_box.id;
      return jsonb_build_object('result', 'inspection_failed');
    end if;
    -- INV-M23 ①②: 열린 주문은 실비가 있어야 하고, 대형 택배 원가 이상 · 상한 이하 정수
    select * into v_measured from public.tier_prices where tier = 'large';
    if p_cost_krw is null
       or p_cost_krw <> trunc(p_cost_krw)
       or p_cost_krw < v_measured.carrier_cost_krw
       or p_cost_krw > public.personal_intake_cost_max_krw() then
      raise exception '우체국 실비가 범위 밖이다' using errcode = 'P0110';
    end if;
    v_cost := p_cost_krw::integer;
    select * into v_declared from public.tier_prices where tier = v_box.declared_tier;
    -- 개인접수 금액 = 실비 + 대형 검수비 + 대형 기본 서비스료(받는 값 − 택배 원가 − 검수비). 칸은 각각 신고 구간과의 차
    v_shipping := v_cost - v_declared.carrier_cost_krw;
    v_inspection := v_measured.inspection_fee_krw - v_declared.inspection_fee_krw;
    v_service := (v_measured.price_krw - v_measured.carrier_cost_krw - v_measured.inspection_fee_krw)
               - (v_declared.price_krw - v_declared.carrier_cost_krw - v_declared.inspection_fee_krw);
    v_amount := v_shipping + v_inspection + v_service;
    update public.boxes set measured_tier = 'large', personal_intake_cost_krw = v_cost where id = v_box.id;
  else
    update public.boxes set measured_tier = v_tier where id = v_box.id;

    if public.parcel_tier_rank(v_tier) <= public.parcel_tier_rank(v_box.declared_tier) or not v_open then
      return jsonb_build_object('result', 'none');
    end if;

    select * into v_declared from public.tier_prices where tier = v_box.declared_tier;
    select * into v_measured from public.tier_prices where tier = v_tier;
    v_amount := v_measured.price_krw - v_declared.price_krw;
    v_shipping := v_measured.carrier_cost_krw - v_declared.carrier_cost_krw;
    v_inspection := v_measured.inspection_fee_krw - v_declared.inspection_fee_krw;
    v_service := v_amount - v_shipping - v_inspection;
  end if;

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

revoke all on function public.office_record_measurement(text, text, numeric) from public, anon;
grant execute on function public.office_record_measurement(text, text, numeric) to authenticated;

-- ── 4) 팬 읽기: 개인접수 상자는 크기 칸이 'personal_intake' ──
create or replace function public.my_gift_boxes(p_order_no text)
 RETURNS TABLE(box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean, send_ack_needed boolean, not_sent_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         -- payment INV-M23 ④: 개인접수 상자는 구간 이름 대신 개인접수
         case when b.personal_intake_cost_krw is not null then 'personal_intake' else b.declared_tier::text end,
         p.tracking_no,
         case when b.missing_at is not null then 'missing'
              when p.state in ('tracker_held', 'report_held', 'police_handed') then 'checking'
              else coalesce(p.state::text, 'no_waybill') end,
         -- 승인 전이면 「먼저 보내기」를 누른 뒤에만(INV-S9). 거절·반려·취소된 주문은 살려 둔 6자리도 보이지 않는다(INV-C3).
         -- approval-cancel INV-AC6: 승인 이력이 있으면 입고 전 취소로 대기로 돌아가도 그대로 보인다
         case when public.order_send_guide_shown(o.id)
                   and o.status not in ('rejected', 'expired', 'canceled')
              then (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
         not public.order_send_guide_shown(o.id) and o.status in ('registered', 'received', 'labeled', 'inspected'),
         -- 「아직 보내지 않음」을 누른 시각(office-workflow INV-W10) — 아직 입고 전·닫히지 않은 상자에만. 도착한 상자에는 붙이지 않는다.
         -- 누른 뒤 그 상자에 송장번호를 넣었으면 보낸 상자라 붙이지 않는다(2026-10-22 리뷰)
         case when b.missing_at is null and (p.state is null or p.state = 'awaiting') and p.tracking_no is null then o.fan_not_sent_at end
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$function$;

create or replace function public.my_difference_payments(p_order_no text)
 RETURNS TABLE(box_id uuid, box_seq smallint, declared_tier text, measured_tier text, amount_krw integer, status text, due_at timestamp with time zone, expired boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id, b.seq, b.declared_tier::text,
         case when b.personal_intake_cost_krw is not null then 'personal_intake' else b.measured_tier::text end,
         p.amount_krw, p.status::text,
         public.difference_due_at(b.id),
         coalesce(p.expired_at is not null or now() >= public.difference_due_at(b.id), false)
  from public.payments p
  join public.boxes b on b.id = p.box_id
  join public.orders o on o.id = p.order_id
  where p.kind = 'difference' and o.order_no = p_order_no and o.fan_id = auth.uid()
  order by b.seq;
$function$;
