-- 2026-10-10 늦게 오는 상자 — 정책 문제집 메모 B8·B9·C10·D10 (DECISIONS 2026-10-10 A~C).
-- 스펙: payment INV-M8·M9·M16·M17·M18 · inbound-address-code INV-C3 · office-workflow INV-W10 · decline-block INV-D3 · notifications INV-N17 · reverse-gift INV-R11.
--
-- 팬 선물: 받는 주소를 본 적이 있는 주문(승인됨 · 「먼저 보내기」 누름 · 도착한 상자 있음)이 끝나면(거절·반려·취소) 안 온 상자의 6자리를 살려 둔다.
--   주문 환불에 그 상자 금액 − 배송비 칸을 먼저 넣고(배송비 칸만 남겨 둠), 늦게 오면 그 주문 상자로 입고 → 반송(더 돌려줄 것 없음),
--   살려 둔 때부터 168시간 안에 안 오면 자동 처리(또는 그 전에 대표)가 닫는다 — 상자 환불 = 남겨 둔 배송비 칸.
--   입고 뒤 취소(대표)는 검수에 걸린 상자가 있어도 받는다 — 걸린 상자 0, 나머지 도착한 상자는 상자 금액 − 검수비 − 배송비.
-- 역조공 몫: 받지 않음·기한 지남이 되면 6자리를 살려 두고 환불을 미룬다(몫마다 환불이 하나라 먼저 일부를 돌려주지 않는다).
--   168시간 안에 오면 입고 → 반송, 환불 = 몫 금액 − 배송비. 안 오면 자동 처리가 6자리를 무효로 하고 환불 = 몫 금액.
--
-- 1) inbound_void_for_order — 살려 두는 갈래를 넓힘(안내 줄은 거절·반려만, 취소는 안내 없음)
-- 2) inbound_void_for_share — 받지 않음·기한 지남은 살려 둠, 취소는 지금처럼 무효
-- 3) refund_due_of_payment — 끝난 주문은 상자마다 정한 몫의 합
-- 4) refund_due_of_box — 닫힌 상자만: 살려 둔 상자는 배송비 칸, 진행 중 주문의 닫힌 상자는 상자 금액
-- 5) refund_due_of_share — 살려 둔 6자리가 아직 유효하면 환불을 정하지 않는다
-- 6) admin_payment_rows — 상자 줄은 닫힌 상자만(늦게 온 상자 줄 'late_box' 는 더 생기지 않는다 — 상자 환불이 없다)
-- 7) office_close_kept_box(상자) — 살려 둔 상자 닫기의 몸통(잠금 순서는 입고와 같다). admin_close_pending_box 는 대표 판정 뒤 이것을 부른다
-- 8) admin_pending_boxes · admin_close_pending_box — 취소된 주문도
-- 9) admin_cancel_received_gift — 검수에 걸린 상자가 있어도 취소한다
-- 10) office_run_expiry — 9단계: 살려 둔 지 168시간 지난 상자·몫 닫기(kept_closed)
-- 11) my_share_boxes — 받지 않음·기한 지남·취소된 몫의 살려 둔 6자리는 크리에이터 화면에 내주지 않는다(reverse-gift INV-R14)


-- ── 1) ──
create or replace function public.inbound_void_for_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- payment INV-M18 · inbound-address-code INV-C3 (2026-10-10): 받는 주소를 본 적이 있으면(승인 · 「먼저 보내기」 · 도착한 상자 있음)
  -- 아직 안 온 상자의 6자리는 무효로 하지 않고 살려 둔 시각을 적는다. 도착한 상자의 6자리는 이미 사용됨, 닫힌 상자의 6자리는 이미 무효라
  -- 남은 유효한 6자리가 곧 안 온 상자다.
  if new.approved_at is not null or new.fan_send_ack_at is not null or exists (
    select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
    where b.order_id = new.id and x.state <> 'awaiting'
  ) then
    update public.inbound_codes c
    set kept_at = now()
    from public.boxes b
    where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and c.kept_at is null and b.missing_at is null;
    -- 보낸 팬에게 안내 한 번(notifications INV-N17) — 거절·반려·차단 거절 모두 같은 종류. 팬이 스스로 취소한 주문에는 보내지 않는다
    if found and new.status in ('rejected', 'expired') then
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

-- ── 2) ──
create or replace function public.inbound_void_for_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- reverse-gift INV-R11 (2026-10-10): 받지 않음·기한 지남은 크리에이터가 이미 보냈을 수 있어(결제 직후 받는 주소가 보인다) 6자리를 살려 둔다.
  -- 취소는 지금처럼 무효.
  if new.cancelled_at is null and new.reply in ('declined', 'expired') then
    update public.inbound_codes c
    set kept_at = now()
    where c.share_id = new.id and c.state = 'valid' and c.kept_at is null;
    return null;
  end if;
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  where c.share_id = new.id and c.state = 'valid';
  return null;
end $$;

-- ── 3) ──
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
    -- 끝난 주문(INV-M9, 2026-10-10): 상자마다 정한 몫의 합
    when o.status in ('rejected', 'expired', 'canceled') and p.kind = 'initial' then c.ended_sum
    -- 끝난 주문의 차액 결제: 취소는 그 결제의 검수비·배송비 칸, 거절·반려는 배송비 칸을 뺀다(그대로)
    when o.status = 'canceled' then greatest(p.amount_krw - p.inspection_fee_krw - p.shipping_fee_krw, 0)
    when o.status in ('rejected', 'expired') then p.amount_krw - p.shipping_fee_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    else null
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  cross join lateral (
    -- whole: 입고 없이 끝났고 살려 둔 상자도 없는 주문 — 닫힌 상자까지 주문 환불이 전부 맡는다(상자 환불은 생기지 않는다)
    select (o.received_at is null
            and not exists (select 1 from public.boxes b join public.inbound_codes k on k.box_id = b.id
                            where b.order_id = o.id and k.kept_at is not null)) as whole
  ) w
  cross join lateral (
    select coalesce(sum(case
      -- 살려 둔 상자(INV-M18 ①): 상자 금액 − 배송비 칸 — 그 뒤 도착하든 닫히든 그대로
      when exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null) then b.price_krw - b.shipping_fee_krw
      -- 닫힌 상자: 상자 환불이 맡는다(입고 없이 끝난 주문은 주문 환불이 맡는다)
      when b.missing_at is not null then case when w.whole then b.price_krw else 0 end
      -- 끝날 때 도착해 있던 상자
      when exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting') then case
        -- 검수에 걸림(반송·보관·중형 초과 실측): 검수 불합격 줄 — 상품 대금 칸만인데 상자에는 그 칸이 없다(0)
        when b.measured_tier = 'oversize'
             or exists (select 1 from public.office_parcels x join public.office_inspections i on i.parcel_id = x.id
                        where x.box_id = b.id and i.outcome in ('return', 'hold')) then 0
        -- 입고 뒤 취소(INV-M17): 검수비·배송비 칸을 뺀다
        when o.status = 'canceled' then b.price_krw - b.inspection_fee_krw - b.shipping_fee_krw
        -- 입고 뒤 거절·반려: 배송비 칸을 뺀다
        else b.price_krw - b.shipping_fee_krw
      end
      -- 받는 주소를 본 적이 없어 올 수 없는 상자: 그 상자 금액 전액
      else b.price_krw
    end), 0)::integer as ended_sum
    from public.boxes b
    where b.order_id = o.id
  ) c
  where p.id = p_payment_id;
$$;

-- ── 4) ──
create or replace function public.refund_due_of_box(p_box_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- 상자 환불은 「도착하지 않음」으로 닫힌 상자에만(INV-M9, 2026-10-10)
  select case
    when p.status <> 'done' or b.missing_at is null then null
    -- 살려 둔 상자가 닫힘(INV-M18 ③): 남겨 둔 배송비 칸 — 상자 금액 − 배송비 칸은 주문 환불이 이미 맡았다
    when exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null) then b.shipping_fee_krw
    -- 입고 없이 끝났고 살려 둔 상자도 없는 주문은 주문 환불이 결제 금액 전액을 맡는다
    when o.status in ('rejected', 'expired', 'canceled') and o.received_at is null
         and not exists (select 1 from public.boxes x join public.inbound_codes k on k.box_id = x.id
                         where x.order_id = o.id and k.kept_at is not null) then null
    -- 진행 중 주문에서 30일 뒤 닫힌 상자(INV-W10): 택배·검수를 하지 않았으므로 그 상자 금액 전액
    else b.price_krw
  end
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  where b.id = p_box_id;
$$;

-- ── 5) ──
create or replace function public.refund_due_of_share(p_share_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when d.status <> 'done' or s.shipped_at is not null or s.reply not in ('declined', 'expired') then null
    -- 입고 뒤(살려 둔 6자리로 늦게 온 상자 포함): 반송 택배비를 뺀 금액
    when s.received_at is not null then s.amount_krw - s.shipping_fee_krw
    -- 살려 둔 6자리가 아직 유효하면(168시간 안) 환불을 정하지 않는다(reverse-gift INV-R11, 2026-10-10)
    when exists (select 1 from public.inbound_codes c where c.share_id = s.id and c.kept_at is not null and c.state = 'valid') then null
    else s.amount_krw
  end
  from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
  where s.id = p_share_id;
$$;

-- ── 6) ──
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
    -- 상자마다 한 줄(INV-M8·M18): 도착하지 않음으로 닫힌 상자('missing_box'), 거절·반려 뒤 늦게 도착한 상자('late_box').
    -- 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
           case when b.missing_at is not null then 'missing_box' else 'late_box' end, fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error, false
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    -- 상자 환불은 닫힌 상자에만 있다(INV-M9, 2026-10-10) — 늦게 온 상자 줄은 더 생기지 않는다
    where b.missing_at is not null
    union all
    select 'revgift', s.id, s.order_no, 'revgift', cp.nickname,
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, coalesce(d.settled_at, d.confirming_at),
           case when d.status = 'done' then public.refund_due_of_share(s.id) else 0 end, r.status, r.amount_krw, r.last_error,
           d.review_at is not null and d.status = 'confirming'
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
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

-- ── 7) ──
create or replace function public.office_close_kept_box(p_box_id uuid)
returns boolean
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
  select b.order_id into v_order_id from public.boxes b where b.id = p_box_id;
  if v_order_id is null then
    return false;
  end if;
  -- 잠금 순서(office_close_missing_boxes·입고와 같다): 상자 줄 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄
  perform 1 from public.boxes b where b.order_id = v_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  select * into v_order from public.orders o where o.id = v_order_id for update;
  select * into v_box from public.boxes b where b.id = p_box_id;
  select * into c from public.inbound_codes x where x.box_id = p_box_id for update;
  select * into t from public.office_parcels x where x.box_id = p_box_id for update;
  -- 잠근 뒤 다시 본다: 끝난 주문 · 살려 둔 유효한 6자리 · 닫히지 않음 · 아직 입고 전(송장번호만 등록한 줄은 아직 안 온 것)
  if v_order.status not in ('rejected', 'expired', 'canceled')
     or c.id is null or c.kept_at is null or c.state <> 'valid'
     or v_box.missing_at is not null
     or (t.id is not null and t.state <> 'awaiting') then
    return false;
  end if;
  update public.boxes set missing_at = now() where id = p_box_id;
  update public.inbound_codes set state = 'void', voided_at = now() where id = c.id;
  return true;
end $$;

revoke all on function public.office_close_kept_box(uuid) from public, anon, authenticated, service_role;

create or replace function public.admin_close_pending_box(p_box_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception '도착하지 않은 상자는 대표만 닫는다' using errcode = '42501';
  end if;
  if not public.office_close_kept_box(p_box_id) then
    raise exception '닫을 수 있는 상자가 아니다' using errcode = 'P0002';
  end if;
end $$;

-- ── 8) ──
create or replace function public.admin_pending_boxes()
 RETURNS TABLE(box_id uuid, label text, order_no text, fan_nickname text, tier text, amount_krw integer, ended_at timestamp with time zone, tracking_no text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and o.status in ('rejected', 'expired', 'canceled')
    and (t.id is null or t.state = 'awaiting')
  order by c.kept_at, o.order_no, b.seq
  limit 500;
$function$;

-- ── 9) ──
create or replace function public.admin_cancel_received_gift(p_order_no text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform 1 from public.orders o where o.id = v_order_id for update;
  -- 6자리 줄은 주문 뒤·사무소 상자 줄 앞(INV-W12) — 아래 취소가 트리거로 6자리를 무효로 바꾼다
  perform 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id
  where b.order_id = v_order_id order by c.id for update of c;
  -- 사무소 상자 줄은 주문 뒤에(INV-W12) — QR 로 시작하는 처리도 상자 → 주문 → 사무소 상자 줄 순이다
  perform 1 from public.office_parcels x join public.boxes b on b.id = x.box_id
  where b.order_id = v_order_id order by x.id for update of x;
  -- 검수에 걸린 상자가 있어도 취소한다 — 그 상자는 환불에서 0(검수 불합격 줄)이라 차감을 피하지 못한다(INV-M17, 2026-10-10 B9)
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
end $function$;

-- ── 10) ──
create or replace function public.office_run_expiry(p_order_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
  v_pending_gifts integer;
  v_pending_revgifts integer;
  v_held integer;
  v_held_parcels integer := 0;
  v_parcel uuid;
  v_order uuid;
  v_boxes_missing integer := 0;
  v_box_missing_alerts integer;
  v_kept_closed integer := 0;
  v_box uuid;
  v_kept_shares integer;
  v_n integer;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15): 결제 대기인 줄만 실패로 닫는다 — 조건부 갱신 한 문장.
  --     결제 확정 시작(claim_payment: 결제 대기 → 승인 중)도 같은 줄의 조건부 갱신이라, 겹치면 먼저 잡은 쪽만 반영되고
  --     뒤에 온 쪽은 바뀐 상태를 다시 보고 아무것도 하지 않는다. 승인 중·완료·실패 줄은 건드리지 않는다. 주문 줄은 지우지 않는다.
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15): 같은 규칙. 주문번호를 주면 그 몫이 든 보내기만.
  --     보내기의 결제 완료 시각은 받기 기한의 시작이라 결제 완료에만 둔다(표 제약) — 닫을 때는 상태만 바꾼다.
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  --    주문마다 상자 → 승인 요청 → 주문 순으로 잠그고(INV-W12) 조건을 다시 본다 — 한꺼번에 주문을 잠그면
  --    뒤 단계(보관 상자 넘기기)가 같은 주문의 상자를 주문 뒤에 잠가 QR 처리와 엇갈린다.
  v_gifts := 0;
  for v_order in
    select o.id from public.orders o join public.approval_requests r on r.order_id = o.id
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    order by o.registered_at, o.id
  loop
    perform 1 from public.boxes b where b.order_id = v_order order by b.seq for update;
    perform 1 from public.approval_requests r where r.order_id = v_order for no key update;
    perform 1 from public.orders o where o.id = v_order for update;
    with expired as (
      update public.approval_requests r
      set status = 'expired', decided_at = now()
      from public.orders o
      where o.id = r.order_id and r.order_id = v_order and r.status = 'waiting' and o.approved_at is null
        and o.status in ('registered', 'received', 'labeled', 'inspected')
        and o.registered_at <= now() - interval '168 hours'
      returning r.order_id
    )
    update public.orders o set status = 'expired'
    from expired e where o.id = e.order_id and o.approved_at is null;
    get diagnostics v_n = row_count;
    v_gifts := v_gifts + v_n;
  end loop;

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13): 차액 줄에 기한 지남을 적는다. 결제 중(confirming)·완료 줄은 건드리지 않는다.
  --    그 주문의 상자는 나갈 수 없게 되고(office_parcel_dead), 아래에서 검수 완료 상자가 반송 대기로 간다.
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and d.created_at <= now() - interval '168 hours'
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    -- 몫 하나만: expire_revgifts 와 같은 조건(결제 완료 + 168시간, 아직 답이 없음)
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 5) 추적 장치로 보관된 상자: 보관된 시각 + 168시간 → 반송 대기(office-workflow INV-W4·W6)
  --    상자마다 상자 → 주문(몫) → 사무소 상자 줄 순으로 잠그고(INV-W12) 다시 본다. 잠그는 사이 상자 연결이 바뀐 상자는 다음 회차로.
  v_held := 0;
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'held' and p.inspected_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      perform public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    update public.office_parcels p set state = 'return_waiting'
    where p.id = v_parcel and p.state = 'held' and p.inspected_at <= now() - interval '168 hours';
    get diagnostics v_n = row_count;
    v_held := v_held + v_n;
  end loop;

  -- 6) 주문에 묶인 채 보류된 상자: 보류 + 168시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9).
  --    상자마다 넘기기 함수를 부른다 — 주인의 확인과 같은 잠금 순서, 이미 넘긴 상자는 그 함수가 건너뛴다(두 번 돌려도 한 번).
  for v_parcel in
    select p.id from public.office_parcels p
    where p.hold_reason is not null and p.hold_closed_at is null and p.hold_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.hold_at, p.id
  loop
    if public.office_close_held_parcel(v_parcel, null, true) then
      v_held_parcels := v_held_parcels + 1;
    end if;
  end loop;

  -- 7) 승인 뒤 도착하지 않은 상자: 결제 완료 + 720시간 → 그 상자를 닫는다(office-workflow INV-W10).
  --    주문마다 닫기 함수를 부른다 — 입고와 같은 잠금 순서로 잡고 다시 보므로, 그 상자의 입고와 겹쳐도 하나만 반영된다.
  for v_order in
    select o.id from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '720 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
    order by o.registered_at, o.id
  loop
    v_boxes_missing := v_boxes_missing + public.office_close_missing_boxes(v_order);
  end loop;

  -- 8) 결제 완료 + 336시간에 아직 안 온 상자가 있는 진행 중 주문 → 보낸 팬에게 한 번(notifications INV-N15).
  --    같은 이름의 줄은 넣지 않는다(notification_outbox_once) — 두 번 돌려도 한 번. 새로 넣은 주문 수를 센다.
  select count(*)::integer into v_box_missing_alerts
  from (
    select public.notification_enqueue('box_missing', o.id, null, 1::smallint, o.fan_id, now()) as n
    from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
  ) q
  where q.n > 0;

  -- 9) 살려 둔 지 168시간 지난 상자·몫(payment INV-M18 ③ · reverse-gift INV-R11): 팬 선물 상자는 닫고(상자 환불 = 남겨 둔 배송비 칸),
  --    역조공 몫은 6자리를 무효로(환불 = 몫 금액). 상자는 상자마다 닫기 함수를 부른다 — 입고와 같은 잠금 순서로 잡고 다시 보므로 겹쳐도 하나만.
  --    몫의 6자리는 조건부 갱신 한 문장 — 입고가 먼저 사용됨으로 바꿨으면 다시 보고 건너뛴다. 두 번 돌려도 한 번.
  for v_box in
    select c.box_id from public.inbound_codes c
    join public.boxes b on b.id = c.box_id
    join public.orders o on o.id = b.order_id
    where c.box_id is not null and c.kept_at is not null and c.state = 'valid' and c.kept_at <= now() - interval '168 hours'
      and b.missing_at is null
      and (p_order_no is null or o.order_no = p_order_no)
    order by c.kept_at, c.box_id
  loop
    if public.office_close_kept_box(v_box) then
      v_kept_closed := v_kept_closed + 1;
    end if;
  end loop;
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.revgift_shares s
  where s.id = c.share_id and c.kept_at is not null and c.state = 'valid' and c.kept_at <= now() - interval '168 hours'
    and (p_order_no is null or s.order_no = p_order_no);
  get diagnostics v_kept_shares = row_count;
  v_kept_closed := v_kept_closed + v_kept_shares;

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공)
  --    5단계와 같이 상자마다 INV-W12 순서로 잠그고 다시 본다.
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'inspected' and public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      perform public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    update public.office_parcels p set state = 'return_waiting'
    where p.id = v_parcel and p.state = 'inspected' and public.office_parcel_dead(p);
  end loop;

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간. 맨 뒤에 둔다 — 찾기 함수가 이 표를 상자·주문·사무소 상자 줄 다음에 잠근다(INV-W12)
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels,
                            'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts, 'kept_closed', v_kept_closed);
end $function$;

-- ── 11) ──
create or replace function public.my_share_boxes()
 RETURNS TABLE(share_id uuid, order_no text, fan_nickname text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id, s.order_no, f.nickname, s.tier::text, p.tracking_no, coalesce(p.state::text, 'no_waybill'),
         -- 받지 않음·기한 지남·취소된 몫은 살려 둔 6자리도 내주지 않는다(reverse-gift INV-R14)
         case when s.reply not in ('declined', 'expired') and s.cancelled_at is null
              then (select c.code from public.inbound_codes c where c.share_id = s.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id)
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles f on f.id = s.fan_id
  left join public.office_parcels p on p.share_id = s.id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$function$;

notify pgrst, 'reload schema';
