-- 일부만 도착한 주문의 거절·반려 — 상자마다 반송·환불 (카드 d52, 2026-10-08)
-- payment INV-M8·M9·M18 S18~S18f · inbound-address-code INV-C3 S3c · office-workflow INV-W10 S10d · decline-block INV-D3 · notifications INV-N17 S17.
--
-- 상자가 하나라도 도착한 팬 선물 주문이 거절·7일 자동 반려(차단 거절 포함)되면, 그때 아직 안 온 상자(입고 안 됐고 닫히지 않은 상자)는
-- 6자리를 무효로 하지 않고 「살려 둔 시각」을 적는다. 그 상자 몫은 주문 환불에서 빠지고, 상자는 둘 중 하나로 끝난다:
--   ① 늦게 도착 — 살아 있는 6자리라 그 주문 상자로 입고 → 검수 → 반송 대기(나갈 수 없는 상자 길). 상자 환불 = 상자 금액 − 배송비 칸,
--      검수에 걸리면(반송·보관) 상품 대금 칸만 — 상자에는 상품 대금 칸이 없어(지금 0) 환불 없음.
--   ② 대표가 「도착하지 않음」으로 닫음 — 6자리 무효, 상자 환불 = 상자 금액 전액.
-- 상자가 하나도 오지 않은 주문의 거절·반려와 취소는 그대로(6자리 전부 무효).
--
-- 표시를 상자 줄이 아니라 6자리 줄에 두는 이유: 거절·반려는 주문 줄을 잡은 뒤 트리거에서 표시를 적는다. 입고·취소·닫기는
-- 상자 줄 → 승인 요청 → 주문 → 6자리 순으로 잠그므로, 주문 뒤에 상자 줄을 고치면 순서가 뒤집혀 교착(40P01)이 날 수 있다.
-- 6자리 줄은 원래 주문 뒤에 잠그는 줄이다(지금의 무효 처리도 같은 자리).
--
-- 1) inbound_codes.kept_at — 거절·반려 때 살려 둔 시각. 유효한 6자리에만, 한 번 적으면 바꾸거나 지우지 못한다(inbound_codes_guard).
-- 2) inbound_void_for_order(주문 상태 트리거) — 거절·반려 + 도착한 상자 있음이면 유효한 6자리에 kept_at 을 적고(무효로 하지 않음)
--    보낸 팬에게 'gift_pending_box' 알림 줄 하나(주문마다 한 번 — 같은 이름의 줄은 넣지 않는다). 그 밖에는 지금처럼 전부 무효.
-- 3) 알림 종류에 gift_pending_box. 카카오 템플릿 표의 종류 제약에는 빠져 있던 box_missing 도 같이 더한다.
-- 4) refund_due_of_payment — 20261008000013 을 대체. 입고 뒤 거절·반려 = 거절 때 도착해 있던 상자마다 (상자 금액 − 배송비 칸)
--    (닫힌 상자·살려 둔 상자는 뺀다). 나머지 갈래는 그대로.
-- 5) refund_due_of_box — 20261008000010 을 대체. 살려 둔 상자: 닫혔으면 상자 금액, 도착해 검수 통과면 상자 금액 − 배송비 칸,
--    검수 전·검수에 걸림·아직 안 옴이면 없음. 그 밖은 그대로.
-- 6) admin_payment_rows — 20261008000010 을 대체. 늦게 도착한 살려 둔 상자도 상자 환불 줄('gift_box', payment_kind 'late_box').
-- 7) admin_pending_boxes() — 새 읽기 함수(운영자). 대표가 닫을 수 있는 상자 목록.
-- 8) admin_close_pending_box(상자 id) — 새 함수(대표만). 잠금 순서는 office_close_missing_boxes 와 같다:
--    상자 줄 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄. 잠근 뒤 다시 보므로 그 상자의 입고와 겹쳐도 하나만 반영된다.
-- 9) my_gift_boxes — 끝난 주문(거절·반려·취소)의 6자리는 내주지 않는다(살려 둔 6자리도 팬 화면에 나오지 않음, approval-signature INV-S9).
--
-- 오류 꼴: 42501 대표 아님 · P0002 닫을 수 있는 상자가 아님(없는 상자 · 이미 도착 · 이미 닫힘 · 진행 중 주문 · 살려 둔 상자 아님)
--         · 55000 살려 둔 시각 바꾸기·지우기, 유효하지 않은 6자리에 적기

-- ── 1) 살려 둔 시각 ──────────────────────────────────

alter table public.inbound_codes add column if not exists kept_at timestamptz;

create or replace function public.inbound_codes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.code, new.box_id, new.share_id, new.issued_at) is distinct from (old.code, old.box_id, old.share_id, old.issued_at) then
    raise exception '받는 주소 6자리의 값·상자는 바꿀 수 없다' using errcode = '55000';
  end if;
  if new.state <> old.state and not (old.state = 'valid' and new.state in ('used', 'void')) then
    raise exception '받는 주소 6자리 상태를 % 에서 % 로 바꿀 수 없다', old.state, new.state using errcode = '55000';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.voided_at is not null and new.voided_at is distinct from old.voided_at) then
    raise exception '받는 주소 6자리의 사용·무효 시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  -- 거절·반려 때 살려 둔 시각(payment INV-M18): 한 번 적으면 바꿀 수 없고, 유효한 6자리에만 적는다
  if old.kept_at is not null and new.kept_at is distinct from old.kept_at then
    raise exception '살려 둔 시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  if old.kept_at is null and new.kept_at is not null and (old.state <> 'valid' or new.state <> 'valid') then
    raise exception '살려 둔 시각은 유효한 6자리에만 적는다' using errcode = '55000';
  end if;
  return new;
end $$;

-- ── 2) 주문 상태 트리거 — 거절·반려 때 안 온 상자의 6자리는 살려 둔다 ──────────────────────────────────

create or replace function public.inbound_void_for_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 상자가 하나라도 도착한 주문이 거절·반려되면(INV-M18·C3 예외) 아직 안 온 상자의 6자리는 무효로 하지 않고 살려 둔 시각을 적는다.
  -- 도착한 상자의 6자리는 이미 사용됨, 닫힌 상자의 6자리는 이미 무효라 남은 유효한 6자리가 곧 안 온 상자다. 취소는 예외 없이 전부 무효.
  if new.status in ('rejected', 'expired') and exists (
    select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
    where b.order_id = new.id and x.state <> 'awaiting'
  ) then
    update public.inbound_codes c
    set kept_at = now()
    from public.boxes b
    where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and b.missing_at is null;
    if found then
      -- 보낸 팬에게 안내 한 번(notifications INV-N17) — 거절·반려·차단 거절 모두 같은 종류
      perform public.notification_enqueue('gift_pending_box', new.id, null, 1::smallint, new.fan_id, now());
    end if;
    return null;
  end if;

  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.boxes b
  where b.order_id = new.id and c.box_id = b.id and c.state = 'valid';
  return null;
end $$;

-- ── 3) 알림 종류 ──────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan',
                  'box_missing', 'gift_pending_box'));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan',
                  'box_missing', 'gift_pending_box'));

-- ── 4) 주문 환불 ──────────────────────────────────

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
    -- 입고 뒤 거절·반려(INV-M8·M9·M18): 거절 때 도착해 있던 상자마다 (상자 금액 − 배송비 칸).
    -- 그 상자가 검수에 걸렸으면(반송·보관, 중형 초과 실측) 검수 불합격 줄 — 상품 대금 칸만인데 상자에는 그 칸이 없어 0 이다.
    -- 늦게 온 상자(상자 환불)와 같은 판정이다 — 먼저 왔든 늦게 왔든 위반한 상자는 차감을 피하지 못한다(카드 d53 과 같은 원칙).
    -- 닫힌 상자는 상자 환불이 맡았고, 살려 둔 상자(그때 안 온 상자)는 상자 환불이 따로 맡는다.
    when p.kind = 'initial' then c.arrived_net
    else p.amount_krw - p.shipping_fee_krw
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  -- 닫힌 상자의 금액, 도착한 상자의 검수비 + 배송비, 거절 때 도착해 있던 상자의 몫, 이미 정한 상자 환불 — 첫 결제에만 붙는다
  cross join lateral (
    select coalesce(sum(b.price_krw) filter (where p.kind = 'initial' and b.missing_at is not null), 0) as price,
           coalesce(sum(b.inspection_fee_krw + b.shipping_fee_krw)
                      filter (where p.kind = 'initial' and b.missing_at is null
                                and exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting')), 0) as arrived_fees,
           coalesce(sum(b.price_krw - b.shipping_fee_krw)
                      filter (where p.kind = 'initial' and b.missing_at is null
                                and not exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null)
                                and b.measured_tier is distinct from 'oversize'
                                and not exists (select 1 from public.office_parcels x join public.office_inspections i on i.parcel_id = x.id
                                                where x.box_id = b.id and i.outcome in ('return', 'hold'))), 0) as arrived_net,
           (select coalesce(sum(r.amount_krw), 0) from public.refunds r where r.payment_id = p.id and r.box_id is not null) as refunded
    from public.boxes b
    where b.order_id = o.id
  ) c
  where p.id = p_payment_id;
$$;

-- ── 5) 상자 환불 ──────────────────────────────────

create or replace function public.refund_due_of_box(p_box_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.status <> 'done' then null
    -- 거절·반려 때 살려 둔 상자(INV-M18)
    when k.kept then case
      -- ② 대표가 닫음: 택배·검수를 하지 않았으니 그 상자 금액 전액
      when b.missing_at is not null then b.price_krw
      -- ① 늦게 도착: 검수를 통과했으면 반송 택배비만 뺀다. 검수 전·아직 안 옴은 아직 정하지 않는다.
      --    검수에 걸리면(반송·보관, 중형 초과 실측) 상품 대금 칸만인데 상자에는 상품 대금 칸이 없다(0) — 환불 없음.
      when i.outcome = 'pass' and b.measured_tier is distinct from 'oversize' then b.price_krw - b.shipping_fee_krw
      else null
    end
    when b.missing_at is null then null
    -- 입고가 하나도 없이 끝난 주문은 주문 환불이 결제 금액 전액을 맡는다
    when o.status in ('rejected', 'expired', 'canceled') and o.received_at is null then null
    else b.price_krw
  end
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  cross join lateral (
    select exists (select 1 from public.inbound_codes c where c.box_id = b.id and c.kept_at is not null) as kept
  ) k
  left join lateral (
    select y.outcome from public.office_parcels x join public.office_inspections y on y.parcel_id = x.id
    where x.box_id = b.id order by y.at desc, y.id desc limit 1
  ) i on true
  where b.id = p_box_id;
$$;

-- ── 6) 관리자 결제·환불 내역 ──────────────────────────────────

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
    -- 상자마다 한 줄(INV-M8·M18): 도착하지 않음으로 닫힌 상자('missing_box'), 거절·반려 뒤 늦게 도착한 상자('late_box').
    -- 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
           case when b.missing_at is not null then 'missing_box' else 'late_box' end, fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    where b.missing_at is not null
       or (exists (select 1 from public.inbound_codes c where c.box_id = b.id and c.kept_at is not null)
           and exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
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

-- ── 7) 대표가 닫을 수 있는 상자 목록 ──────────────────────────────────

-- 거절·반려 때 살려 둔 상자 가운데 아직 안 왔고 닫히지 않은 것. 팬이 넣은 배송 조회용 송장번호가 있으면 같이 보인다(확인용).
create or replace function public.admin_pending_boxes()
returns table (box_id uuid, label text, order_no text, fan_nickname text, tier text, amount_krw integer, ended_at timestamptz, tracking_no text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         o.order_no, fp.nickname, b.declared_tier::text, b.price_krw, c.kept_at, t.tracking_no
  from public.inbound_codes c
  join public.boxes b on b.id = c.box_id
  join public.orders o on o.id = b.order_id
  join public.profiles fp on fp.id = o.fan_id
  left join public.office_parcels t on t.box_id = b.id
  where public.is_operator()
    and c.kept_at is not null and c.state = 'valid' and b.missing_at is null
    and o.status in ('rejected', 'expired')
    and (t.id is null or t.state = 'awaiting')
  order by c.kept_at, o.order_no, b.seq
  limit 500;
$$;

revoke all on function public.admin_pending_boxes() from public, anon;
grant execute on function public.admin_pending_boxes() to authenticated;

-- ── 8) 대표가 그 상자를 「도착하지 않음」으로 닫는다 ──────────────────────────────────

create or replace function public.admin_close_pending_box(p_box_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order public.orders;
  v_box public.boxes;
  c public.inbound_codes;
  t public.office_parcels;
begin
  if not public.is_owner() then
    raise exception '도착하지 않은 상자는 대표만 닫는다' using errcode = '42501';
  end if;
  select b.order_id into v_order_id from public.boxes b where b.id = p_box_id;
  if v_order_id is null then
    raise exception '닫을 수 있는 상자가 아니다' using errcode = 'P0002';
  end if;
  -- 잠금 순서(office_close_missing_boxes·입고와 같다): 상자 줄 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄
  perform 1 from public.boxes b where b.order_id = v_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  select * into v_order from public.orders o where o.id = v_order_id for update;
  select * into v_box from public.boxes b where b.id = p_box_id;
  select * into c from public.inbound_codes x where x.box_id = p_box_id for update;
  select * into t from public.office_parcels x where x.box_id = p_box_id for update;
  -- 잠근 뒤 다시 본다: 거절·반려된 주문 · 살려 둔 유효한 6자리 · 닫히지 않음 · 아직 입고 전(송장번호만 등록한 줄은 아직 안 온 것)
  if v_order.status not in ('rejected', 'expired')
     or c.id is null or c.kept_at is null or c.state <> 'valid'
     or v_box.missing_at is not null
     or (t.id is not null and t.state <> 'awaiting') then
    raise exception '닫을 수 있는 상자가 아니다' using errcode = 'P0002';
  end if;
  update public.boxes set missing_at = now() where id = p_box_id;
  update public.inbound_codes set state = 'void', voided_at = now() where id = c.id;
end $$;

revoke all on function public.admin_close_pending_box(uuid) from public, anon;
grant execute on function public.admin_close_pending_box(uuid) to authenticated;

-- ── 9) 팬의 상자 목록 — 끝난 주문의 6자리는 내주지 않는다 ──────────────────────────────────

create or replace function public.my_gift_boxes(p_order_no text)
returns table (box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean, send_ack_needed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.tracking_no,
         case when b.missing_at is not null then 'missing' else coalesce(p.state::text, 'no_waybill') end,
         -- 승인 전이면 「먼저 보내기」를 누른 뒤에만(INV-S9). 거절·반려·취소된 주문은 살려 둔 6자리도 보이지 않는다(INV-C3).
         case when (o.approved_at is not null or o.fan_send_ack_at is not null)
                   and o.status not in ('rejected', 'expired', 'canceled')
              then (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
         o.approved_at is null and o.fan_send_ack_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$$;
