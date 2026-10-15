-- 처리할 일 (action-center INV-J1·J2·J3·J4, 카드 d91).
--
-- 팬이 직접 무언가를 해야 선물이 계속 진행되는 일을 카드로 모은 목록. 저장하지 않는다 — 표·숫자 칸·읽음 표시 없이,
-- 읽을 때마다 원천(차액 요청·상자·역조공 몫)의 지금 상태에서 계산한다(J1). 사이드바 숫자·홈 한 줄·처리할 일 화면·선물 상세 맨 위 한 줄은
-- 모두 이 함수 하나의 결과 줄 수다(J2) — 따로 세는 함수를 만들지 않는다.
--
-- 카드 세 종류와 보이는 조건 — 그 일을 처리하는 기존 함수가 처리를 받아 주는 조건과 같은 판정이다(J1). 기존 함수는 바꾸지 않는다(J4).
--   difference  : prepare_difference_payment 가 결제를 시작해 주는 상태 — 미결제(대기·실패), 기한 지남 표시 없음, 요청 + 168시간 전,
--                 주문이 반려·만료·취소가 아님, 상자가 반송·출고 쪽(return_waiting·return_printed·returned·label_printed·shipped)이 아님.
--                 승인 중(confirming)·완료(done)는 그 함수가 P0024·P0023 으로 거부하므로 카드가 없다.
--   missing_box : 결제 완료 + 336시간(「아직 도착하지 않은 상자」 알림과 같은 조건 — 승인됨·주문 진행 중·상자가 닫히지 않음·입고 전)
--                 이고 find_held_parcel 이 그 상자를 받아 주는 상태(닫히지 않음·주문 진행 중). 입고 전 = 상자 작업 줄이 없거나 대기(awaiting).
--                 기한은 상자가 닫히는 결제 + 720시간(office-workflow INV-W10).
--   revgift     : decline_revgift·accept_revgift 가 받아 주는 상태 — 보내기 결제 완료, 받기 대기, 반송·취소 아님, 결제 + 168시간 전(reverse-gift INV-R10).
-- 시간은 서버 시각(now())의 경과 시간으로 센다(office-workflow INV-W6 과 같다).
--
-- 누구 것(J3): 계정 인자가 없다. 로그인 토큰의 계정이 보낸 주문(역할과 상관없다 — 크리에이터가 보낸 선물도)과 그 계정이 받는 팬인 역조공 몫만.
-- 직원·대표는 주문·몫이 없어 0줄, 로그인하지 않은 키에는 열지 않는다.
-- 칸은 기존 읽기 함수가 그 사람에게 이미 주는 칸까지: 주문번호·상자 이름표와 순번(my_gift_boxes)·상자 id(my_gift_boxes·my_difference_payments)·
-- 크리에이터 공개 이름(my_gifts·my_received_revgifts)·신고 구간·실측 구간·차액·기한(my_difference_payments·my_received_revgifts).
-- 크리에이터 주소·연락처·나만 보는 메모(together INV-F8)는 없다. 개인정보 구역(pii)에 닿지 않는다.
--
-- 운영 적용 순서: 앱 배포 전에 적용한다(새 화면이 이 함수를 부른다). 기존 함수·표를 바꾸지 않으므로 앞뒤 마이그레이션과 순서가 엮이지 않는다.
-- 다시 적용해도 결과가 같다(create or replace).

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
           o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end as box_label,
           b.seq as box_seq, c.name as creator_name, b.declared_tier::text as tier, b.measured_tier::text as measured_tier,
           p.amount_krw, p.created_at + interval '168 hours' as due_at
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'difference'
    join public.boxes b on b.id = p.box_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels x on x.box_id = b.id
    where p.status in ('pending', 'failed')
      and p.expired_at is null
      and now() < p.created_at + interval '168 hours'
      and o.status not in ('rejected', 'expired', 'canceled')
      and (x.state is null or x.state not in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped'))

    union all

    -- 도착하지 않은 상자 — 「아직 도착하지 않은 상자」 알림 조건 + find_held_parcel 이 받아 주는 상태
    select 'missing_box', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes x2 where x2.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, o.registered_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is not null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and b.missing_at is null
      and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting')

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
