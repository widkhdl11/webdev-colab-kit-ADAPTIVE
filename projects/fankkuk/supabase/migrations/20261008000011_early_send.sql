-- 「먼저 보내기」 (approval-signature INV-S9 S9·S9c·S9d · inbound-address-code INV-C3, 2026-10-08 사용자 지시).
-- 지금까지는 결제가 끝나면 승인을 기다리지 않고 받는 주소 6자리를 바로 보여 줬다(2026-10-02 결정).
-- 이제 크리에이터가 아직 승인하지 않은 주문은 팬이 안내(먼저 보내면 배송이 빨라지지만, 거절되면 반송되고 반송 택배비를 뺀 금액을 돌려준다)를 보고
-- 「먼저 보내기」를 눌러야 6자리가 나온다. 누른 시각을 주문에 한 번 남긴다 — 화면에서 가리기만 하면 안내를 보고 눌렀다는 근거가 남지 않는다.
--
-- 1) orders.fan_send_ack_at — 처음 누른 시각. 한 번 적으면 바꾸지 못한다.
-- 2) ack_early_send(주문번호) — 로그인한 보낸 사람만, 결제가 끝난 진행 중 주문만. 두 번 눌러도 처음 시각 그대로.
-- 3) my_gift_boxes — 20261008000009 를 대체. 6자리는 승인됐거나 누른 기록이 있을 때만, 새 칸 send_ack_needed(누르기 전 안내를 보일 때).
--
-- 오류 꼴: 42501 로그인 안 함 · P0002 내 주문이 아니거나 누를 수 없는 상태 · 55000 누른 시각 바꾸기

-- ── 1) 누른 시각 ──────────────────────────────────

alter table public.orders add column fan_send_ack_at timestamptz;

create function public.orders_send_ack_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.fan_send_ack_at is not null and new.fan_send_ack_at is distinct from old.fan_send_ack_at then
    raise exception '「먼저 보내기」 기록은 바꿀 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger orders_send_ack_guard before update of fan_send_ack_at on public.orders
for each row execute function public.orders_send_ack_guard();

revoke all on function public.orders_send_ack_guard() from public, anon, authenticated;

-- ── 2) 누르기 ──────────────────────────────────

create function public.ack_early_send(p_order_no text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  -- 사람 ID 는 받지 않는다 — 로그인 토큰의 계정이 보낸 주문만. 남의 주문과 없는 주문은 같은 오류로(있는지 알려 주지 않는다).
  update public.orders o
  set fan_send_ack_at = coalesce(o.fan_send_ack_at, now())
  where o.order_no = p_order_no and o.fan_id = v_uid
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'initial' and p.status = 'done');
  if not found then
    raise exception '먼저 보낼 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.ack_early_send(text) from public, anon;
grant execute on function public.ack_early_send(text) to authenticated;

-- ── 3) 팬의 상자 목록 ──────────────────────────────────

drop function public.my_gift_boxes(text);

create function public.my_gift_boxes(p_order_no text)
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
         -- 승인 전이면 「먼저 보내기」를 누른 뒤에만(INV-S9)
         case when o.approved_at is not null or o.fan_send_ack_at is not null
              then (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
         o.approved_at is null and o.fan_send_ack_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$$;

revoke all on function public.my_gift_boxes(text) from public, anon;
grant execute on function public.my_gift_boxes(text) to authenticated;

-- ── 4) 팬의 선물 목록 — 누른 시각 칸 ──────────────────────────────────
-- 홈·선물 목록·선물 상세의 위쪽 표시가 「먼저 보내기」 전이면 「보내 주세요」 대신 「승인 대기」를 보이게 한다(INV-S9). 20261005 무렵 정의에 칸 하나를 더했다.

drop function public.my_gifts();

create function public.my_gifts()
returns table (order_no text, creator_name text, item_kind text, box_count integer, has_electronics_or_metal boolean, status public.order_status,
               registered_at timestamptz, approved_at timestamptz, received_at timestamptz, inspection_result text, inspected_at timestamptz,
               shipped_at timestamptz, expected_arrival_date date, delivery text, fan_tracking_no text, fan_send_ack_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.order_no, c.name, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal,
         case when o.status = 'expired' then 'rejected'::public.order_status else o.status end,
         o.registered_at,
         case when o.status in ('rejected', 'expired') then null else o.approved_at end,
         o.received_at, o.inspection_result, o.inspected_at, o.shipped_at, o.expected_arrival_date, o.delivery, o.fan_tracking_no,
         o.fan_send_ack_at
  from public.orders o
  join public.creators c on c.id = o.creator_id
  where o.fan_id = auth.uid() and o.registered_at is not null
  order by o.registered_at desc;
$$;

revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

-- 단건 읽기 my_gift 는 몸통이 「select g.* from my_gifts()」라 목록 칸이 늘면 반환 모양이 어긋난다(42P13).
-- 반환 칸은 그대로 두고 필요한 칸만 골라 가져온다.
create or replace function public.my_gift(p_order_no text)
returns table (order_no text, creator_name text, item_kind text, box_count integer, has_electronics_or_metal boolean, status public.order_status,
               registered_at timestamptz, approved_at timestamptz, received_at timestamptz, inspection_result text, inspected_at timestamptz,
               shipped_at timestamptz, expected_arrival_date date, delivery text, fan_tracking_no text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.order_no, g.creator_name, g.item_kind, g.box_count, g.has_electronics_or_metal, g.status, g.registered_at, g.approved_at,
         g.received_at, g.inspection_result, g.inspected_at, g.shipped_at, g.expected_arrival_date, g.delivery, g.fan_tracking_no
  from public.my_gifts() g where g.order_no = p_order_no;
$$;
