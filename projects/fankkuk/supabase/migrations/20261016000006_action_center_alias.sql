-- 처리할 일 읽기 함수 다듬기 (action-center INV-J1·J3). 20261016000005 와 결과가 같고, 별칭만 고쳤다.
--
-- 고친 것: 추가 결제 줄에서 상자 수를 세는 안쪽 질의의 boxes 별칭이 바깥의 office_parcels 별칭(x)과 같은 이름이었다.
-- 안쪽 별칭이 바깥 것을 가려 결과는 맞았지만, 읽는 사람이 어느 x 인지 헷갈린다 — 안쪽은 bx, 상자 작업 줄은 op 로 나눴다.
--
-- 확인하고 바꾸지 않은 것(기존 처리 함수와 같은 판정을 유지 — INV-J1):
--   - 추가 결제의 상자 상태 목록에 held(크리에이터 확인 대기)를 넣지 않는다. 지금 prepare_difference_payment·claim_difference_payment
--     (20261012000011 의 12번)는 held 를 막지 않는다 — 넣으면 결제할 수 있는 차액의 카드가 사라진다.
--     주문 상태 rejected·expired·canceled 는 이미 목록에 있다.
--   - 도착하지 않은 상자에 「결제 + 720시간 전」 조건을 더하지 않는다. find_held_parcel 은 시각을 보지 않고 상자가 닫혔는지(missing_at)만 본다 —
--     720시간이 지나도 5분마다 도는 기한 처리가 닫기 전까지는 찾기가 받아 준다. 시각으로 먼저 빼면 받아 주는 동안 카드가 없다.
--
-- 운영 적용 순서: 20261016000005 다음에. 반환 칸·인자·권한이 같아 앱 배포와 순서가 엮이지 않는다. 다시 적용해도 결과가 같다(create or replace).

create or replace function public.my_action_items()
returns table (
  kind text,
  order_no text,
  box_id uuid,
  box_label text,
  box_seq smallint,
  creator_name text,
  tier text,
  measured_tier text,
  amount_krw integer,
  due_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select auth.uid() as uid
  ),
  cards as (
    -- 추가 결제 — prepare_difference_payment 가 받아 주는 상태
    select 'difference'::text as kind, o.order_no, b.id as box_id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end as box_label,
           b.seq as box_seq, c.name as creator_name, b.declared_tier::text as tier, b.measured_tier::text as measured_tier,
           p.amount_krw, p.created_at + interval '168 hours' as due_at
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'difference'
    join public.boxes b on b.id = p.box_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels op on op.box_id = b.id
    where p.status in ('pending', 'failed')
      and p.expired_at is null
      and now() < p.created_at + interval '168 hours'
      and o.status not in ('rejected', 'expired', 'canceled')
      and (op.state is null or op.state not in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped'))

    union all

    -- 도착하지 않은 상자 — 「아직 도착하지 않은 상자」 알림 조건 + find_held_parcel 이 받아 주는 상태
    select 'missing_box', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, o.registered_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is not null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and b.missing_at is null
      and not exists (select 1 from public.office_parcels op where op.box_id = b.id and op.state <> 'awaiting')

    union all

    -- 역조공 받기 — decline_revgift·accept_revgift 가 받아 주는 상태
    select 'revgift', s.order_no, null::uuid, null::text, null::smallint, coalesce(cr.name, cp.nickname), s.tier::text, null::text, null::integer,
           public.revgift_deadline(d.settled_at)
    from mine
    join public.revgift_shares s on s.fan_id = mine.uid
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    where d.status = 'done'
      and s.reply = 'waiting'
      and s.returned_at is null
      and s.cancelled_at is null
      and now() < public.revgift_deadline(d.settled_at)
  )
  select kind, order_no, box_id, box_label, box_seq, creator_name, tier, measured_tier, amount_krw, due_at
  from cards
  order by due_at, order_no, box_seq;
$$;

revoke all on function public.my_action_items() from public, anon;
grant execute on function public.my_action_items() to authenticated, service_role;
