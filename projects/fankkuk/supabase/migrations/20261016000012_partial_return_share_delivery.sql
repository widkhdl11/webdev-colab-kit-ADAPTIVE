-- 카드 d97 (action-center INV-J9 끝 두 줄, 2026-10-16 사용자).
-- ① 받은 선물 단계(my_incoming_gifts, office-workflow INV-W9)는 반송되지 않은 상자들로 계산한다 — 남은 상자가 전부 반송일 때만 「반송」.
--    상자 일부만 반송된 주문은 나머지 상자의 단계로 남는다. 선물 현황(my_gift_progress)은 이 함수를 그대로 쓰므로 함께 바뀐다.
--    예전(20261012000006)은 상자 하나라도 반송이면 주문 전체가 「반송」이었다(BACKLOG 의 「같은 문제」).
--    도착하지 않음으로 닫힌 상자(missing_at, INV-W10)는 주문 상태 계산(office_sync_order)처럼 세지 않는다.
--    검수 결과는 전부 반송이면 「반송」, 남은 상자가 검수를 지났으면 「통과」.
-- ② 역조공 몫에 팬 선물 주문(orders.delivery·delivered_at)과 같은 수령 칸을 둔다. 값을 쓰는 함수는 없다 — 택배사 연결만 쓴다(notifications INV-N12).
--    선물 현황은 출고된 몫이 수령(delivered)이면 뺀다.
-- 다시 적용해도 결과가 같다(add column if not exists · 제약은 지운 뒤 다시 · create or replace).

alter table public.revgift_shares add column if not exists delivery text;
alter table public.revgift_shares add column if not exists delivered_at timestamptz;
alter table public.revgift_shares drop constraint if exists revgift_shares_delivery_check;
alter table public.revgift_shares add constraint revgift_shares_delivery_check check (delivery in ('in_transit', 'delivered'));

create or replace function public.my_incoming_gifts()
returns table (
  order_no text,
  sender_nickname text,
  box_count integer,
  stage text,
  paid_at timestamptz,
  received_at timestamptz,
  inspected_at timestamptz,
  shipped_at timestamptz,
  inspection_result text,
  delivery text
)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select o.*,
           -- 반송되지 않은 상자들의 가장 늦은 단계(주문 상태 계산과 같은 순서) — 0 입고 전 · 1 입고 · 3 검수 완료 · 5 출고
           (select min(case p.state
                         when 'received' then 1 when 'labeled' then 1 when 'held' then 1
                         when 'inspected' then 3 when 'label_printed' then 3
                         when 'shipped' then 5
                         else 0 end)
            from public.boxes b left join public.office_parcels p on p.box_id = b.id
            where b.order_id = o.id and b.missing_at is null
              and (p.state is null or p.state not in ('return_waiting', 'return_printed', 'returned'))) as live_min,
           -- 남은 상자가 있고 그 전부가 반송(반송 대기 포함)인가
           exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                   where b.order_id = o.id and b.missing_at is null and p.state in ('return_waiting', 'return_printed', 'returned'))
           and not exists (select 1 from public.boxes b left join public.office_parcels p on p.box_id = b.id
                           where b.order_id = o.id and b.missing_at is null
                             and (p.state is null or p.state not in ('return_waiting', 'return_printed', 'returned'))) as all_returned
    from public.orders o
    join public.creators c on c.id = o.creator_id
    join public.profiles me on me.id = c.profile_id
    where c.profile_id = auth.uid()
      and me.role = 'creator'
      and o.registered_at is not null
      and o.status <> 'pending_payment'
  ),
  staged as (
    select m.*,
           case
             when m.status in ('rejected', 'expired', 'canceled') then 'closed'
             when m.all_returned then 'returned'
             when m.delivery = 'delivered' then 'delivered'
             when m.delivery = 'in_transit' then 'in_transit'
             when m.live_min = 5 or m.status = 'shipped' then 'shipped'
             when m.live_min = 3 then 'inspected'
             when m.live_min = 1 then 'received'
             -- 남은 상자가 없으면(전부 닫힘) 주문 상태로
             when m.live_min is null and m.status in ('inspected', 'label_printed') then 'inspected'
             when m.live_min is null and m.status in ('received', 'labeled') then 'received'
             else 'paid'
           end as stage
    from mine m
  )
  select m.order_no,
         f.nickname,
         (select count(*)::integer from public.boxes b where b.order_id = m.id),
         m.stage,
         m.registered_at,
         m.received_at,
         m.inspected_at,
         m.shipped_at,
         case
           when m.all_returned or (m.live_min is null and m.inspection_result = 'returned') then 'returned'
           when m.stage in ('inspected', 'shipped', 'in_transit', 'delivered') then 'passed'
           else null
         end,
         m.delivery
  from staged m
  join public.profiles f on f.id = m.fan_id
  order by m.registered_at desc;
$$;

-- 선물 현황 — 20261016000011 과 같고, 출고된 몫이 수령이면 뺀다(② · J9)
create or replace function public.my_gift_progress()
returns table (
  board text,
  order_no text,
  share_id uuid,
  nickname text,
  item_kind text,
  box_count integer,
  tier text,
  stage text,
  approval_waiting boolean,
  requested_at timestamptz,
  approved_at timestamptz,
  reply_state text,
  box_state text,
  sent_at timestamptz,
  before_inbound boolean,
  late boolean
)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select p.id as uid from public.profiles p where p.id = auth.uid() and p.role = 'creator'
  ),
  received as (
    select 'received'::text as board, g.order_no, null::uuid as share_id, g.sender_nickname as nickname, o.item_kind, g.box_count,
           null::text as tier, g.stage, (o.approved_at is null) as approval_waiting, g.paid_at as requested_at, o.approved_at,
           null::text as reply_state, null::text as box_state, null::timestamptz as sent_at, null::boolean as before_inbound, null::boolean as late,
           0 as part, g.paid_at as sort_at, 0::smallint as seq
    from me
    cross join public.my_incoming_gifts() g
    join public.orders o on o.order_no = g.order_no
    where g.stage in ('paid', 'received', 'inspected', 'shipped', 'in_transit')
  ),
  sent as (
    select 'sent'::text, r.order_no, s.id, r.fan_nickname, null::text, null::integer,
           r.tier::text, null::text, null::boolean, null::timestamptz, null::timestamptz,
           r.state, b.state, r.sent_at,
           -- 판정 함수는 상자가 아직 오지 않은 몫에만 부른다 — 온 몫은 두 판정 모두 거짓이라 결과가 같고, 부르는 수만 줄인다
           case when b.state in ('no_waybill', 'awaiting') then public.revgift_share_before_inbound(s.id, me.uid) else false end,
           case when b.state in ('no_waybill', 'awaiting') then public.revgift_share_late(s.id, me.uid) else false end,
           1, r.sent_at, s.seq
    from me
    cross join public.my_sent_revgifts() r
    join public.my_share_boxes() b on b.order_no = r.order_no
    join public.revgift_shares s on s.order_no = r.order_no
    where s.cancelled_at is null and s.returned_at is null
      and b.state not in ('returned', 'missing')
      -- 출고된 몫은 수령 칸이 수령이 될 때 빠진다 — 날짜로 빼지 않는다(카드 d93 ⑤ · d97 ②)
      and s.delivery is distinct from 'delivered'
      and (r.state <> 'not_received' or b.state not in ('no_waybill', 'awaiting') or public.revgift_share_before_inbound(s.id, me.uid))
  )
  select x.board, x.order_no, x.share_id, x.nickname, x.item_kind, x.box_count, x.tier, x.stage, x.approval_waiting, x.requested_at, x.approved_at,
         x.reply_state, x.box_state, x.sent_at, x.before_inbound, x.late
  from (select * from received union all select * from sent) x
  order by x.part,
           case when x.part = 0 then x.sort_at end desc,
           case when x.part = 1 then x.sort_at end asc,
           x.seq, x.order_no;
$$;

revoke all on function public.my_incoming_gifts() from public, anon;
grant execute on function public.my_incoming_gifts() to authenticated;
revoke all on function public.my_gift_progress() from public, anon;
grant execute on function public.my_gift_progress() to authenticated;

notify pgrst, 'reload schema';
