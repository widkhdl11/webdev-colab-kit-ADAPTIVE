-- 거절과 팬 차단 (decline-block INV-D1~D10, 카드 d26).
--
-- - 거절: 크리에이터가 승인 요청 하나를 받지 않는다. 로그인 세션으로(카카오 서명 없음). 요청·주문·검수 완료 상자를 한 처리에서 바꾼다.
-- - 차단: (크리에이터, 보낸 사람 계정) 한 쌍. 거절 창의 「앞으로 받지 않기」로만 생긴다. 차단하면 그 사람의 진행 중 주문을 모두 거절한다.
-- - 등록 함수는 살아 있는 차단이 있으면 「받을 수 없는 크리에이터」로 거부한다 — 본인 확인 전 크리에이터와 같은 오류라 앱도 같은 문구를 낸다.
-- - 차단 쓰기와 등록은 (크리에이터, 보낸 사람) 쌍의 같은 잠금으로 줄을 선다(INV-D7).
-- - 팬 읽기는 거절·7일 반려·차단에 따른 거절을 한 값(rejected)으로 돌려주고, 거절된 주문의 승인 시각을 주지 않는다(INV-D5).
--
-- 잠그는 순서: 쌍 잠금 → 승인 요청 줄 → 주문 줄. 승인 함수(요청 → 주문)와 같은 방향이다.
-- 결과 값: declined = 이번에 거절함 / already = 이미 결정된 요청 / not_declinable = 열린 요청이지만 주문이 거절할 수 없는 상태 /
--          not_found = 없거나 남의 요청(같은 답, INV-D1).

-- ── 차단 표 ─────────────────────────────────────────────

create table public.creator_blocks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id),
  sender_id uuid not null references public.profiles (id),
  blocked_at timestamptz not null default now(),
  unblocked_at timestamptz,
  check (unblocked_at is null or unblocked_at >= blocked_at)
);
-- INV-D6: 쌍마다 살아 있는 차단 하나
create unique index creator_blocks_one_active on public.creator_blocks (creator_id, sender_id) where unblocked_at is null;
alter table public.creator_blocks enable row level security;
revoke all on public.creator_blocks from anon, authenticated;

-- 결제 전에 차단으로 거절된 주문은 등록 시각이 없다(INV-D8). 그 뒤 결제가 끝나면 결제 반영이 시각을 채운다.
alter table public.orders drop constraint orders_check1;
alter table public.orders add constraint orders_registered_unless_unpaid
  check (status in ('pending_payment', 'rejected') or registered_at is not null);

-- ── 공용 ────────────────────────────────────────────────

-- (크리에이터, 보낸 사람) 쌍의 잠금. 트랜잭션이 끝나면 풀린다.
create function public.lock_sender_pair(p_creator_id uuid, p_sender_id uuid)
returns void
language sql volatile set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('creator_block:' || p_creator_id::text || ':' || p_sender_id::text, 0));
$$;

create function public.sender_blocked(p_creator_id uuid, p_sender_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.creator_blocks k
    where k.creator_id = p_creator_id and k.sender_id = p_sender_id and k.unblocked_at is null
  );
$$;

-- 거절된 주문의 상자 중 검수 완료로 보관 중인 것은 반송 대기로(INV-D3). 아직 안 온 상자는 검수 스캔이 반송 대기로 보낸다.
create function public.return_inspected_boxes(p_order_id uuid)
returns void
language sql volatile set search_path = ''
as $$
  update public.office_parcels p
  set state = 'return_waiting'
  from public.boxes b
  where p.box_id = b.id and b.order_id = p_order_id and p.state = 'inspected';
$$;

-- ── 거절 (+ 차단) ───────────────────────────────────────

create function public.decline_gift(p_request_id text, p_block boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_creator_id uuid;
  v_sender_id uuid;
  v_req public.approval_requests;
  v_now timestamptz := now();
  r record;
begin
  -- INV-D1: 로그인한 사람이 이 주문의 크리에이터일 때만. 아니면 없는 요청과 같은 답.
  select o.id, o.creator_id, o.fan_id into v_order_id, v_creator_id, v_sender_id
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where q.request_id = p_request_id and c.profile_id = auth.uid();
  if v_order_id is null then
    return 'not_found';
  end if;

  if coalesce(p_block, false) then
    perform public.lock_sender_pair(v_creator_id, v_sender_id);
  end if;

  -- INV-D4: 승인·자동 반려와 같은 요청 줄을 잠근다
  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if v_req.status <> 'waiting' then
    return 'already';
  end if;
  -- INV-D2
  perform 1 from public.orders o
  where o.id = v_order_id
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.inspection_result is distinct from 'returned'
  for update;
  if not found then
    return 'not_declinable';
  end if;

  -- INV-D3
  update public.approval_requests set status = 'declined', decided_at = v_now where id = v_req.id;
  update public.orders set status = 'rejected' where id = v_order_id;
  perform public.return_inspected_boxes(v_order_id);

  if coalesce(p_block, false) then
    -- INV-D6
    insert into public.creator_blocks (creator_id, sender_id) values (v_creator_id, v_sender_id)
    on conflict (creator_id, sender_id) where unblocked_at is null do nothing;

    -- INV-D8: 같은 쌍의 진행 중 주문 전부(결제 대기 포함). 출고 송장이 나온 상자가 있는 주문은 그대로 간다.
    -- 요청 줄 → 주문 줄 순서로 잠근 뒤 바꾼다. 결제 반영이 동시에 오면 주문 줄에서 줄을 서고, 거절된 주문은 등록으로 넘기지 않는다.
    for r in
      select o.id from public.orders o
      where o.creator_id = v_creator_id and o.fan_id = v_sender_id
        and o.status in ('pending_payment', 'registered', 'received', 'labeled', 'inspected')
        and not exists (
          select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
          where b.order_id = o.id and p.state in ('label_printed', 'shipped')
        )
      order by o.id
    loop
      perform 1 from public.approval_requests q where q.order_id = r.id and q.status = 'waiting' for update;
      perform 1 from public.orders o where o.id = r.id for update;
      update public.approval_requests set status = 'declined', decided_at = v_now where order_id = r.id and status = 'waiting';
      -- 승인된 요청의 승인 기록은 지우지 않는다(INV-D4 예외) — 주문만 거절한다
      update public.orders set status = 'rejected'
      where id = r.id and status in ('pending_payment', 'registered', 'received', 'labeled', 'inspected');
      perform public.return_inspected_boxes(r.id);
    end loop;
  end if;
  return 'declined';
end $$;

-- ── 차단 목록 · 해제 ────────────────────────────────────

-- INV-D9: 로그인한 크리에이터의 살아 있는 차단만. 칸은 줄 식별값·지금 닉네임·차단한 때뿐.
create function public.my_blocked_senders()
returns table (block_id uuid, nickname text, blocked_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select k.id, f.nickname, k.blocked_at
  from public.creator_blocks k
  join public.creators c on c.id = k.creator_id
  join public.profiles f on f.id = k.sender_id
  where c.profile_id = auth.uid() and k.unblocked_at is null
  order by k.blocked_at desc, k.id;
$$;

-- INV-D10: 본인 것만, 그 줄만 푼다. 과거 주문·요청은 건드리지 않는다. 남의 줄·없는 줄·이미 푼 줄은 같은 답.
create function public.unblock_sender(p_block_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  update public.creator_blocks k
  set unblocked_at = now()
  where k.id = p_block_id and k.unblocked_at is null
    and k.creator_id in (select c.id from public.creators c where c.profile_id = auth.uid());
  return case when found then 'unblocked' else 'not_found' end;
end $$;

-- ── 등록: 차단 확인 (INV-D7) ─────────────────────────────

create or replace function public.register_order(
  p_fan_id uuid,
  p_creator_id uuid,
  p_order_no text,
  p_item_kind text,
  p_has_electronics_or_metal boolean,
  p_tiers public.parcel_tier[],
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_inspection_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
  v_role public.user_role;
  c record;
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  -- INV-K3: 등록하는 순간의 요금표로 계산한 금액과 칸마다 같아야 한다. 아니면 요금이 바뀐 것이다 — 다시 계산해 오게 한다.
  select * into c from public.fan_charge_of(p_tiers);
  if c.found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if p_goods_krw <> 0 or p_amount_krw <> c.total or p_shipping_fee_krw <> c.carrier or p_inspection_fee_krw <> c.inspection
     or p_service_fee_krw <> c.total - c.carrier - c.inspection then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_fan_id;
  if v_role is null or v_role not in ('fan', 'creator') then
    raise exception '선물을 보낼 수 있는 계정이 아니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if v_role = 'creator' then
    if exists (select 1 from public.creators c2 where c2.id = p_creator_id and c2.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
    if not public.creators_follow_either_way(p_fan_id, p_creator_id) then
      raise exception '팔로우가 없는 크리에이터에게는 보낼 수 없다' using errcode = 'P0012';
    end if;
  end if;
  -- INV-D7: 차단 쓰기와 같은 쌍 잠금을 잡고 확인한다 — 이 등록이 끝날 때까지 차단은 줄을 서고, 차단 뒤에는 이 확인이 막는다.
  -- 차단을 말하지 않고 본인 확인 전 크리에이터와 같은 오류를 낸다(카드 d26).
  perform public.lock_sender_pair(p_creator_id, p_fan_id);
  if public.sender_blocked(p_creator_id, p_fan_id) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal)
  values (p_order_no, p_fan_id, p_creator_id, p_item_kind, p_has_electronics_or_metal)
  returning id into v_order_id;

  insert into public.boxes (order_id, seq, declared_tier)
  select v_order_id, t.ord::smallint, t.tier
  from unnest(p_tiers) with ordinality as t(tier, ord);

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

-- ── 결제 반영: 거절된 주문에는 승인 요청을 만들지 않는다 (INV-D8) ──

-- 결제 대기였던 주문만 등록으로 넘기고 승인 요청을 만든다. 차단으로 이미 거절된 주문은 거절 그대로 두고
-- 등록 시각만 채운다(팬 목록에 거절로 보이고, 환불은 입고 전이라 전액).
create or replace function public.settle_payment(
  p_toss_order_id text,
  p_status public.payment_status,
  p_payment_key text,
  p_request_id text,
  p_payload text,
  p_requested_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
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
      values (p_request_id, v_payment.order_id, p_payload, p_requested_at);
    else
      update public.orders set registered_at = p_requested_at
      where id = v_payment.order_id and status = 'rejected' and registered_at is null;
    end if;
  end if;
  return true;
end $$;

-- ── 팬 읽기: 거절·7일 반려·차단에 따른 거절은 한 값 (INV-D5) ──

-- 결제가 끝난 주문만(등록 시각이 있는 것). 반려(expired)도 rejected 로, 거절된 주문의 승인 시각은 주지 않는다 —
-- 차단으로 거절된 승인 주문에서 「승인 뒤 거절됨 = 차단」을 읽어 내지 못하게.
create or replace function public.my_gifts()
returns table (
  order_no text,
  creator_name text,
  item_kind text,
  box_count integer,
  has_electronics_or_metal boolean,
  status public.order_status,
  registered_at timestamptz,
  approved_at timestamptz,
  received_at timestamptz,
  inspection_result text,
  inspected_at timestamptz,
  shipped_at timestamptz,
  expected_arrival_date date,
  delivery text,
  fan_tracking_no text
)
language sql stable security definer set search_path = ''
as $$
  select o.order_no, c.name, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal,
         case when o.status = 'expired' then 'rejected'::public.order_status else o.status end,
         o.registered_at,
         case when o.status in ('rejected', 'expired') then null else o.approved_at end,
         o.received_at, o.inspection_result, o.inspected_at, o.shipped_at, o.expected_arrival_date, o.delivery, o.fan_tracking_no
  from public.orders o
  join public.creators c on c.id = o.creator_id
  where o.fan_id = auth.uid() and o.registered_at is not null
  order by o.registered_at desc;
$$;

create or replace function public.my_gift_boxes(p_order_no text)
returns table (box_id uuid, label text, tier text, waybill_no text, state text)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.inbound_waybill_no, coalesce(p.state::text, 'no_waybill')
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.lock_sender_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sender_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.return_inspected_boxes(uuid) from public, anon, authenticated;
revoke all on function public.decline_gift(text, boolean) from public, anon;
revoke all on function public.my_blocked_senders() from public, anon;
revoke all on function public.unblock_sender(uuid) from public, anon;
grant execute on function public.decline_gift(text, boolean) to authenticated;
grant execute on function public.my_blocked_senders() to authenticated;
grant execute on function public.unblock_sender(uuid) to authenticated;
