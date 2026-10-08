-- 승인 뒤 도착하지 않은 상자 (office-workflow INV-W10 S10~S10c · payment INV-M8·M9·M14 S8d·S8e · notifications INV-N15 S15, 카드 d50).
-- 결제 완료 + 14일(336시간)에 아직 안 온 상자가 있으면 보낸 팬에게 알림 한 번, + 30일(720시간)에 안 온 상자를 「도착하지 않음」으로 닫는다.
-- 닫힌 상자는 받는 주소 6자리가 무효가 되고 그 상자 금액이 상자 환불 대상이 된다. 같은 주문의 다른 상자는 그대로 진행하고,
-- 상자가 하나도 오지 않았으면 주문을 취소한다(입고 전 취소 = 전액, 6자리는 주문 상태 트리거가 전부 무효로).
--
-- 1) boxes.missing_at — 닫힌 시각. 한 번 적으면 바꾸지 못한다.
-- 2) refunds.box_id — 한 결제에 주문 환불 하나 + 닫힌 상자마다 상자 환불 하나(INV-M9). 합계는 결제 금액을 넘지 않는다(트리거).
-- 3) refund_due_of_box — 닫힌 상자의 환불 대상 금액(그 상자 금액). 주문이 반려·만료·취소로 끝났으면 주문 환불이 맡는다(없음).
-- 4) refund_due_of_payment — 20261008000006 과 같고, 이미 정한 상자 환불을 뺀다.
-- 5) admin_claim_refund — 'gift_box'(상자 id). 같은 결제의 다른 환불을 처리하는 중이면 기다리게 한다(주문 환불도 같다).
-- 6) admin_payment_rows — 주문 환불 줄은 상자 환불을 빼고 잇고, 닫힌 상자마다 줄 하나('gift_box', payment_kind 'missing_box').
-- 7) my_gift_payment — 상자 줄에 missing. 환불 목록은 주문 환불과 상자 환불을 함께 보인다.
-- 8) office_sync_order — 닫힌 상자는 주문 집계에서 뺀다(남은 상자가 출고로 갈 수 있게).
-- 9) find_held_parcel — 닫힌 상자에는 잇지 않는다.
-- 10) office_close_missing_boxes(안에서만) · office_run_expiry — 닫기와 알림 단계를 더했다(돌려주는 값 boxes_missing · box_missing_alerts).
-- 잠금 순서는 입고·주인의 찾기와 같다: 상자 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄. 닫기와 그 상자의 입고가 겹쳐도 하나만 반영된다.
--
-- 오류 꼴: 42501 대표 아님 · P0002 없는 상자 · P0022 환불할 상태 아님 · P0024 같은 결제의 환불 처리 중 · 55000 닫힌 시각 바꾸기

-- ── 1) 상자의 닫힌 시각 ──────────────────────────────────

alter table public.boxes add column missing_at timestamptz;

create function public.boxes_missing_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.missing_at is not null and new.missing_at is distinct from old.missing_at then
    raise exception '닫힌 상자는 되돌릴 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger boxes_missing_guard before update of missing_at on public.boxes
for each row execute function public.boxes_missing_guard();

revoke all on function public.boxes_missing_guard() from public, anon, authenticated;

-- ── 2) 상자 환불 ──────────────────────────────────

alter table public.refunds add column box_id uuid references public.boxes (id);
alter table public.refunds add constraint refunds_box_has_payment check (box_id is null or payment_id is not null);
alter table public.refunds drop constraint refunds_payment_id_key;
create unique index refunds_order_refund_once on public.refunds (payment_id) where box_id is null;
alter table public.refunds add constraint refunds_box_id_key unique (box_id);

create or replace function public.refunds_within_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_share public.revgift_shares;
  v_refunded integer;
begin
  if tg_op = 'UPDATE' then
    if new.amount_krw <> old.amount_krw or new.payment_id is distinct from old.payment_id
       or new.share_id is distinct from old.share_id or new.box_id is distinct from old.box_id then
      raise exception '환불 금액·대상은 바꿀 수 없다' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.payment_id is not null then
    select amount_krw into v_limit from public.payments where id = new.payment_id for update;
    -- 상자 환불은 그 상자 주문의 첫 결제에만 붙는다
    if new.box_id is not null and not exists (
      select 1 from public.boxes b join public.payments p on p.order_id = b.order_id
      where b.id = new.box_id and p.id = new.payment_id and p.kind = 'initial'
    ) then
      raise exception '상자 환불은 그 주문의 첫 결제에만 붙는다' using errcode = '23514';
    end if;
    -- 결제 줄을 잠근 뒤 센다 — 같은 결제의 환불 둘이 동시에 들어와도 합계를 넘지 않는다
    select coalesce(sum(r.amount_krw), 0) into v_refunded from public.refunds r where r.payment_id = new.payment_id;
    if v_refunded + new.amount_krw > v_limit then
      raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_share from public.revgift_shares where id = new.share_id;
  if new.amount_krw > v_share.amount_krw then
    raise exception '몫 금액보다 많이 환불할 수 없다' using errcode = '23514';
  end if;
  select amount_krw into v_limit from public.revgift_sends where id = v_share.send_id for update;
  select coalesce(sum(r.amount_krw), 0) into v_refunded
  from public.refunds r join public.revgift_shares s on s.id = r.share_id
  where s.send_id = v_share.send_id;
  if v_refunded + new.amount_krw > v_limit then
    raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
  end if;
  return new;
end $$;

-- ── 3) 닫힌 상자의 환불 대상 금액 ──────────────────────────────────

create function public.refund_due_of_box(p_box_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.missing_at is null or p.status <> 'done' then null
    -- 주문이 반려·만료·취소로 끝났으면 주문 환불이 그 상자 몫까지 맡는다(이미 정한 상자 환불은 주문 환불에서 뺀다)
    when o.status in ('rejected', 'expired', 'canceled') then null
    else b.price_krw
  end
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  where b.id = p_box_id;
$$;

revoke all on function public.refund_due_of_box(uuid) from public, anon, authenticated;

-- ── 4) 주문 환불 = 표대로 정한 값 − 이미 정한 상자 환불 ──────────────────────────────────

create or replace function public.refund_due_of_payment(p_payment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- 상자 환불이 없으면 예전 값 그대로(0 도 0). 있으면 빼고, 0 아래로는 내려가지 않는다.
  select case when x.due is null then null when x.boxed = 0 then x.due else greatest(x.due - x.boxed, 0) end
  from (
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
    end as due,
    (select coalesce(sum(r.amount_krw), 0) from public.refunds r where r.payment_id = p.id and r.box_id is not null) as boxed
    from public.payments p join public.orders o on o.id = p.order_id
    where p.id = p_payment_id
  ) x;
$$;

-- ── 5) 환불 청구 ──────────────────────────────────

create or replace function public.admin_claim_refund(p_kind text, p_unit_id uuid)
returns table (refund_id uuid, payment_key text, amount_krw integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_send_id uuid;
  v_payment_id uuid;
  v_refund public.refunds;
  v_due integer;
begin
  if not public.is_owner() then
    raise exception '환불은 대표만 한다' using errcode = '42501';
  end if;
  if p_kind = 'gift' then
    select p.payment_key, p.id into v_key, v_payment_id from public.payments p where p.id = p_unit_id for update;
    if not found then
      raise exception '결제를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.payment_id = p_unit_id and r.box_id is null for update;
  elsif p_kind = 'gift_box' then
    -- 결제 줄을 먼저 잠근다(주문 환불과 같은 순서) — 같은 결제의 환불 청구는 하나씩
    select p.payment_key, p.id into v_key, v_payment_id
    from public.boxes b join public.payments p on p.order_id = b.order_id and p.kind = 'initial'
    where b.id = p_unit_id for update of p;
    if not found then
      raise exception '상자를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.box_id = p_unit_id for update;
  elsif p_kind = 'revgift' then
    select d.payment_key, d.id into v_key, v_send_id
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_unit_id for update of s, d;
    if not found then
      raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.share_id = p_unit_id for update;
    if exists (
      select 1 from public.refunds r join public.revgift_shares s on s.id = r.share_id
      where s.send_id = v_send_id and r.share_id <> p_unit_id
        and r.status = 'requesting' and r.claimed_at > now() - interval '2 minutes'
    ) then
      raise exception '같은 결제의 다른 환불을 처리하고 있다' using errcode = 'P0024';
    end if;
  else
    raise exception '환불 종류는 gift · gift_box · revgift' using errcode = '22023';
  end if;

  -- 한 결제에 주문 환불과 상자 환불이 함께 있을 수 있다 — 결제사에 부분 취소 둘을 동시에 보내지 않는다
  if v_payment_id is not null and exists (
    select 1 from public.refunds r
    where r.payment_id = v_payment_id and r.id is distinct from v_refund.id
      and r.status = 'requesting' and r.claimed_at > now() - interval '2 minutes'
  ) then
    raise exception '같은 결제의 다른 환불을 처리하고 있다' using errcode = 'P0024';
  end if;

  if v_refund.id is not null then
    if v_refund.status = 'done' then
      raise exception '이미 환불했다' using errcode = 'P0023';
    end if;
    if v_refund.status = 'requesting' and v_refund.claimed_at > now() - interval '2 minutes' then
      raise exception '환불을 처리하고 있다' using errcode = 'P0024';
    end if;
    if v_refund.created_at <= now() - interval '14 days' then
      raise exception '다시 시도 기한(14일)이 지났다 — 결제사에서 확인한다' using errcode = 'P0025';
    end if;
    update public.refunds r
    set status = 'requesting', attempts = r.attempts + 1, claimed_at = now(), requested_by = auth.uid(), last_error = null
    where r.id = v_refund.id;
    return query select v_refund.id, v_key, v_refund.amount_krw;
    return;
  end if;

  v_due := case p_kind
    when 'gift' then public.refund_due_of_payment(p_unit_id)
    when 'gift_box' then public.refund_due_of_box(p_unit_id)
    else public.refund_due_of_share(p_unit_id)
  end;
  if v_due is null or v_due <= 0 or v_key is null then
    raise exception '환불할 수 있는 상태가 아니다' using errcode = 'P0022';
  end if;
  insert into public.refunds (payment_id, share_id, box_id, amount_krw, requested_by)
  values (case when p_kind in ('gift', 'gift_box') then v_payment_id end,
          case when p_kind = 'revgift' then p_unit_id end,
          case when p_kind = 'gift_box' then p_unit_id end,
          v_due, auth.uid())
  returning * into v_refund;
  return query select v_refund.id, v_key, v_refund.amount_krw;
end $$;

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
    -- 도착하지 않음으로 닫힌 상자(INV-M8) — 상자마다 한 줄. 금액은 그 상자 금액, 칸 나눔은 없다.
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end, 'missing_box', fp.nickname,
           b.price_krw, 0, 0, 0, 0, p.settled_at,
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

-- ── 7) 팬의 결제 내역 ──────────────────────────────────

create or replace function public.my_gift_payment(p_order_no text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'paid_krw', p.amount_krw,
    'paid_at', p.settled_at,
    'boxes', (
      select jsonb_agg(jsonb_build_object(
               'label', o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
               'tier', b.declared_tier::text,
               'amount_krw', b.price_krw,
               'missing', b.missing_at is not null) order by b.seq)
      from public.boxes b
      cross join (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
      where b.order_id = o.id
    ),
    -- 주문 환불과 상자 환불(INV-M9)을 함께 — 합이 돌려받는 금액이다
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount_krw', r.amount_krw,
               'status', r.status,
               'at', coalesce(r.settled_at, r.created_at)) order by r.created_at, r.id)
      from public.refunds r
      join public.payments x on x.id = r.payment_id
      where x.order_id = o.id and x.status = 'done'
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
  where o.order_no = p_order_no
    and o.fan_id = auth.uid()
    and o.registered_at is not null;
$$;

-- ── 8) 주문 집계 — 닫힌 상자는 빼고 ──────────────────────────────────

create or replace function public.office_sync_order(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_min integer;
  v_now integer;
  v_returned boolean;
  v_old public.orders;
  v_new public.orders;
  v_old_idx integer;
  v_new_idx integer;
  v_creator_account uuid;
begin
  select * into v_old from public.orders o where o.id = p_order_id for update;

  -- 닫힌 상자(도착하지 않음, INV-W10)는 세지 않는다 — 그 상자를 기다리느라 남은 상자가 멈추지 않게
  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then null when 'returned' then null
           else 0 end) filter (where p.state is null or p.state not in ('held', 'returned')), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned'))
    into v_min, v_returned
  from public.boxes b left join public.office_parcels p on p.box_id = b.id
  where b.order_id = p_order_id and b.missing_at is null;

  select array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], o.status::text) - 1
    into v_now
  from public.orders o where o.id = p_order_id;
  v_min := greatest(v_min, coalesce(v_now, 0));

  update public.orders o
  set received_at = (select min(p.received_at) from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id)
  where o.id = p_order_id and o.received_at is null
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.received_at is not null);

  update public.orders o
  set status = (array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'])[v_min + 1]::public.order_status,
      received_at = case when v_min >= 1 then coalesce(o.received_at, now()) else o.received_at end,
      inspected_at = case when v_min >= 3 then coalesce(o.inspected_at, now()) else o.inspected_at end,
      inspection_result = case when v_min >= 3 then (case when coalesce(v_returned, false) then 'returned' else 'passed' end)
                               else o.inspection_result end,
      shipped_at = case when v_min >= 5 then coalesce(o.shipped_at, now()) else o.shipped_at end
  where o.id = p_order_id
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped');

  -- ── 알림 (notifications INV-N3·N4·N8) ──
  select * into v_new from public.orders o where o.id = p_order_id;
  if v_new.id is null then
    return;
  end if;

  -- 상자가 처음 입고됨 + 승인 요청이 아직 대기 → 승인 요청 2차(크리에이터)
  if v_old.received_at is null and v_new.received_at is not null then
    select c.profile_id into v_creator_account from public.creators c where c.id = v_new.creator_id;
    perform public.notification_enqueue('approval_request', v_new.id, r.id, 2::smallint, v_creator_account, now())
    from public.approval_requests r
    where r.order_id = v_new.id and r.status = 'waiting';
  end if;

  -- 주문 상태가 입고·검수·출고 단계를 넘음 → 팬. 상태는 줄지 않으므로 넘은 단계마다 한 번.
  v_old_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_old.status::text) - 1, -1);
  v_new_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_new.status::text) - 1, -1);
  if v_old_idx >= 0 and v_new_idx > v_old_idx then
    if v_old_idx < 1 and v_new_idx >= 1 then
      perform public.notification_enqueue('arrived', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 3 and v_new_idx >= 3 then
      perform public.notification_enqueue('inspected', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 5 and v_new_idx >= 5 then
      perform public.notification_enqueue('shipped', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
  end if;
end $$;

-- ── 9) 주인의 찾기 — 닫힌 상자에는 잇지 않는다 ──────────────────────────────────

create or replace function public.find_held_parcel(p_box_id uuid, p_share_id uuid, p_waybill text, p_carrier text, p_sender_initial text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_initial text := upper(btrim(coalesce(p_sender_initial, '')));
  c public.inbound_codes;
  t public.office_parcels;
  u public.office_unmatched;
  v public.office_parcels;
  v_order_id uuid;
  v_result text := 'not_found';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if num_nonnulls(p_box_id, p_share_id) <> 1 or p_carrier is null or not public.inbound_carrier_ok(p_carrier)
     or char_length(v_initial) <> 1 then
    raise exception '상자 하나와 택배사·보낸 사람 이름 앞 한 글자가 필요하다' using errcode = '22023';
  end if;
  -- 같은 번호의 입고·송장번호 등록·찾기는 하나씩 — 이 번호의 보류 상자를 잇는 동안 같은 바코드의 입고가 끼어들지 않게
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  -- INV-C10: 시도 기록과 횟수 확인을 한 처리로 — 같은 계정의 찾기는 하나씩.
  -- 프로필 줄을 잠그지 않고 계정마다 처리 잠금을 쓴다 — 입고가 넣는 알림 줄이 주인 프로필을 가리켜(가벼운 잠금) 줄 잠금과 엇갈린다.
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.find:' || v_uid::text, 0));
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and a.at > now() - interval '24 hours') >= 5 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;

  -- 잠금 순서(교착 방지 — 입고 함수와 같다): 상자 줄 → 승인 요청 줄 → 주문 줄(역조공은 몫 줄) → 6자리 줄 → 상자 작업 줄
  if p_box_id is not null then
    -- 도착하지 않음으로 닫힌 상자(INV-W10)는 찾기로도 잇지 않는다 — 늦게 온 상자는 보류에서 반송된다
    select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = p_box_id and b.missing_at is null and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
    for update of b;
    if v_order_id is not null then
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      -- 잠근 뒤 조건을 다시 본다 — 그 사이 거절·반려가 끝났으면 찾지 않는다
      perform 1 from public.orders o
      where o.id = v_order_id and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
      for update;
    end if;
  else
    perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_share_id and d.sender_id = v_uid and d.status = 'done' and s.cancelled_at is null
      and s.reply in ('waiting', 'accepted')
    for update of s;
  end if;

  if found then
    select * into c from public.inbound_codes x where x.box_id = p_box_id or x.share_id = p_share_id for update;
    select * into t from public.office_parcels x where x.box_id = p_box_id or x.share_id = p_share_id for update;

    if t.id is not null and t.hold_reason in ('code_dispute', 'waybill_dispute') and t.inbound_waybill_no = p_waybill
       and not exists (select 1 from public.office_not_mine_reports r where r.parcel_id = t.id) then
      update public.office_parcels set hold_reason = null, hold_at = null where id = t.id;
      v_result := 'matched';
    elsif t.id is null or t.state = 'awaiting' or t.hold_reason in ('code_dispute', 'waybill_dispute') then
      select * into u from public.office_unmatched x
      where x.waybill_no = p_waybill and x.carrier = p_carrier and x.sender_initial = v_initial
        and x.matched_parcel_id is null and x.expired_at is null and x.arrived_at > now() - interval '168 hours'
        and (x.code_id is null or x.code_id is not distinct from c.id)
        and not exists (select 1 from public.office_parcels y where y.inbound_waybill_no = p_waybill)
      for update;
      if u.id is not null then
        if t.id is not null and t.state <> 'awaiting' then
          update public.office_parcels set box_id = null, share_id = null, hold_reason = 'detached', hold_at = now()
          where id = t.id;
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        elsif t.id is null then
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        else
          update public.office_parcels set inbound_waybill_no = p_waybill, state = 'received', received_at = u.arrived_at
          where id = t.id returning * into v;
        end if;
        update public.office_unmatched set matched_parcel_id = v.id, matched_at = now() where id = u.id;
        if c.id is not null then
          update public.inbound_codes
          set state = case when state = 'valid' then 'used' else state end,
              used_at = case when state = 'valid' then now() else used_at end,
              first_parcel_id = v.id
          where id = c.id;
        end if;
        -- 주문 행을 먼저 무겁게 잠근다(office_sync). 알림 줄을 먼저 넣으면 주문 행에 가벼운 잠금이 걸려,
        -- 같은 주문의 상자 둘이 동시에 오면 서로의 가벼운 잠금을 기다리다 교착(40P01)이 난다.
        perform public.office_sync(v.id);
        perform public.notification_enqueue_box_arrived(v.id);
        v_result := 'matched';
      end if;
    end if;
  end if;

  insert into public.office_match_attempts (profile_id, matched) values (v_uid, v_result = 'matched');
  if v_result <> 'matched' and (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched and a.at > now() - interval '24 hours') >= 3 then
    insert into public.office_find_flags (profile_id) values (v_uid)
    on conflict (profile_id) do update set last_flagged_at = now();
  end if;
  return v_result;
end $$;

-- ── 10) 알림 종류 · 닫기 · 자동 처리 ──────────────────────────────────

alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing'));

-- 한 주문의 안 온 상자를 닫는다. 닫은 상자 수를 돌려준다. 결제 + 720시간·승인됨·진행 중을 잠근 뒤 다시 본다.
create function public.office_close_missing_boxes(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_box public.boxes;
  c public.inbound_codes;
  t public.office_parcels;
  v_closed integer := 0;
begin
  -- 잠금 순서: 상자 줄(입고는 같은 줄을 가볍게 잡는다 — 겹치면 한쪽이 기다린다) → 승인 요청 → 주문 → 6자리 → 상자 작업 줄
  perform 1 from public.boxes b where b.order_id = p_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = p_order_id for key share;
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if v_order.id is null or v_order.approved_at is null
     or v_order.status not in ('registered', 'received', 'labeled', 'inspected')
     or v_order.registered_at > now() - interval '720 hours' then
    return 0;
  end if;

  for v_box in select * from public.boxes b where b.order_id = p_order_id and b.missing_at is null order by b.seq loop
    select * into c from public.inbound_codes x where x.box_id = v_box.id for update;
    select * into t from public.office_parcels x where x.box_id = v_box.id for update;
    -- 그 사이 입고됐으면 닫지 않는다(송장번호만 등록한 「입고 전」 줄은 아직 안 온 것)
    if t.id is not null and t.state <> 'awaiting' then
      continue;
    end if;
    update public.boxes set missing_at = now() where id = v_box.id;
    if c.id is not null and c.state = 'valid' then
      update public.inbound_codes set state = 'void', voided_at = now() where id = c.id;
    end if;
    v_closed := v_closed + 1;
  end loop;

  if v_closed = 0 then
    return 0;
  end if;
  if not exists (
    select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
    where b.order_id = p_order_id and x.state <> 'awaiting'
  ) then
    -- 상자가 하나도 오지 않았다 — 주문 취소(입고 전 취소 = 전액, 남은 6자리는 주문 상태 트리거가 무효로)
    update public.orders set status = 'canceled' where id = p_order_id;
  else
    perform public.office_sync_order(p_order_id);
  end if;
  return v_closed;
end $$;

revoke all on function public.office_close_missing_boxes(uuid) from public, anon, authenticated;

create or replace function public.office_run_expiry(p_order_no text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  with expired as (
    update public.approval_requests r
    set status = 'expired', decided_at = now()
    from public.orders o
    where o.id = r.order_id and r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    returning r.order_id
  )
  update public.orders o set status = 'expired'
  from expired e where o.id = e.order_id and o.approved_at is null;
  get diagnostics v_gifts = row_count;

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

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
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'held' and p.inspected_at <= now() - interval '168 hours'
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));
  get diagnostics v_held = row_count;

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

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공)
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'inspected' and public.office_parcel_dead(p)
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels,
                            'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts);
end $$;

-- ── 11) 상자 목록 — 팬에게는 「도착하지 않음」, 사무실 목록에서는 뺀다 ──────────────────────────────────

-- 팬의 상자별 상태: 닫힌 상자는 state 'missing'. 6자리는 무효라 원래대로 나오지 않는다.
create or replace function public.my_gift_boxes(p_order_no text)
returns table (box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.tracking_no,
         case when b.missing_at is not null then 'missing' else coalesce(p.state::text, 'no_waybill') end,
         (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid'),
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id)
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$$;

-- 사무실 상자 목록: 닫힌 상자는 들어올 일이 없으니 「입고 대기」로 남기지 않는다
create or replace function public.admin_office_parcels()
returns table (qr text, kind text, order_no text, sender_nickname text, receiver_name text, tier text, state text, received_at timestamptz, next_step text)
language sql
stable
security definer
set search_path = ''
as $$
  with units as (
    select p as parcel, 'gift'::text as kind,
           o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end as order_no,
           f.nickname as sender, c.name as receiver, b.declared_tier::text as tier, o.registered_at as at
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels p on p.box_id = b.id
    where b.missing_at is null
      and ((p.id is not null and (p.state <> 'awaiting' or not public.office_parcel_dead(p))) or o.status = 'registered')
    union all
    select p, 'revgift', s.order_no, c.name, f.nickname, s.tier::text, d.settled_at
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    left join public.office_parcels p on p.share_id = s.id
    where (p.id is not null and (p.state <> 'awaiting' or not public.office_parcel_dead(p)))
       or (s.cancelled_at is null and s.reply in ('waiting', 'accepted'))
  )
  select (u.parcel).qr_code, u.kind, u.order_no, u.sender, u.receiver, u.tier,
         coalesce((u.parcel).state::text, 'no_waybill'),
         (u.parcel).received_at,
         public.office_next_step(u.parcel, u.kind)
  from units u
  where public.is_operator()
  order by u.at desc nulls last, u.order_no
  limit 500;
$$;

-- ── 12) 송장번호 등록 — 닫힌 상자는 받지 않는다 (코드 리뷰 2026-10-08) ──────────────────────────────────
-- 화면은 닫힌 상자에 입력 칸을 그리지 않지만, 함수를 직접 부르면 저장됐다. 20261007000010 의 정의에 「닫히지 않음」 조건 하나를 더했다.

create or replace function public.set_box_waybill(p_box_id uuid, p_waybill text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v public.office_parcels;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  perform public.office_waybill_attempt(v_uid);
  perform 1 from public.boxes b join public.orders o on o.id = b.order_id
  where b.id = p_box_id and b.missing_at is null and o.fan_id = v_uid
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed')
  for update of b;
  if not found then
    return 'not_found';
  end if;
  insert into public.office_parcels (box_id) values (p_box_id) on conflict (box_id) do nothing;
  select * into v from public.office_parcels where box_id = p_box_id for update;
  if v.state <> 'awaiting' then
    return 'already_received';
  end if;
  perform public.office_register_tracking(v.id, p_waybill);
  return 'saved';
end $function$

;
