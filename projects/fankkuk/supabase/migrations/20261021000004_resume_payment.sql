-- 결제 이어 하기 (payment INV-M22 · S22·S22b·S22c, 2026-10-21 카드 d105) 와 팬 지금 할 일 「결제 미완료」(action-center INV-J1 표 · J2 · J3 · J13).
--
-- 시도 기록의 모양 — 팬 선물 주문의 첫 결제 줄(payments, kind = 'initial')은 지금처럼 **주문마다 하나**로 둔다.
--   이어 하기는 새 줄을 넣지 않고 그 줄의 결제 번호(toss_order_id)를 새것으로 바꾸고, 앞 결제 번호를 「대체됨」 기록(payment_superseded_attempts)에 남긴다.
--   차액 결제 다시 준비(prepare_difference_payment)가 이미 쓰는 방식과 같다. 이렇게 두는 까닭:
--   ① 금액·칸 나눔(INV-M22 ①): 줄이 그대로라 처음 결제 대기 때 저장한 금액·네 칸·상자 금액이 손대지 않고 남는다 — 요금표를 다시 읽을 자리가 없다.
--   ② 대체됨 시도(INV-M22 ②): 앞 결제 번호는 결제 줄에 더는 없다 — 늦게 온 성공 주소는 「없는 결제」라 승인 API 를 부르지 않는다(INV-M2, 앱 서버 confirm-flow).
--   ③ 이중 결제 막기(INV-M22 ③·M5): 주문의 결제 줄이 하나이고 결제 확정 시작(claim_payment)은 「결제 대기인 줄만 승인 중으로」 한 문장이다 —
--      주문 단위의 조건부 갱신이 곧 줄 단위의 조건부 갱신이다. 두 시도가 동시에 승인 중이 되는 상태가 만들어질 수 없다
--      (이어 하기는 줄을 잠근 뒤 결제 대기·실패일 때만 번호를 바꾸고, 승인 중이면 거부한다). 아래 유일 색인이 「주문마다 첫 결제 줄 하나」를 DB 로 지킨다.
--      그래서 승인 API 를 부른 뒤 지는 시도가 생기지 않는다. 결과를 모르는 승인은 지금처럼 INV-M19 가 정리한다.
--   ④ 시계(INV-M22 ④): 줄의 created_at 은 「처음 결제 대기를 만든 때」 그대로다 — 24시간 닫기(INV-M15, office_run_expiry 0a)·운영자 「곧 처리」 목록이
--      지금 그 칸을 보므로 이어 하기가 시계를 다시 시작하지 않는다. 함수 둘은 고치지 않는다.
--   결제 번호가 바뀌면 지난 승인 중 시각·확인 필요 표시는 기존 줄 지키기 트리거(guard_review_cancel ⑤)가 비운다.
--
-- 1) 「대체됨」 기록 표 + 주문마다 첫 결제 줄 하나(유일 색인)
-- 2) gift_payment_resumable(결제 줄, 주문) — 이어 할 수 있는가. 이어 하기 함수와 지금 할 일 읽기가 이 판정 하나를 쓴다(INV-J1 「보이는 조건 = 처리 함수가 받아 주는 조건」).
--    주문이 결제 대기 · 결제 줄이 결제 대기 또는 실패(승인 거절 등 — 승인 중·완료가 아님) · 처음 결제 대기 + 24시간 전 · 확인 필요 전액 취소(INV-M20)를 거친 줄이 아님.
-- 3) resume_gift_payment(주문번호) — 로그인 토큰의 계정이 보낸 사람인 주문만(INV-M22 ⑤). 남의 주문·없는 주문·닫힌 주문·결제가 끝난 주문은 같은 거부(P0002).
--    결제 확정 중이면 P0024(자기 주문일 때만 닿는다). 돌려주는 것은 새 결제 번호·저장된 금액·주문번호.
-- 4) my_action_items 에 「결제 미완료」(unpaid) 줄 — 주문 하나에 하나, 금액 = 저장된 결제 금액, 기한 = 처음 결제 대기 + 24시간. 반환 칸은 그대로(열 개).
--    크리에이터 지금 할 일(my_creator_action_items)은 이 함수의 difference·missing_box·return_address 만 골라 쓰므로 바뀌지 않는다.
-- 개인정보 구역(pii)은 건드리지 않는다.

-- ── 1) 대체됨 기록 · 주문마다 첫 결제 줄 하나 ──
create table if not exists public.payment_superseded_attempts (
  toss_order_id text primary key check (toss_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  payment_id uuid not null references public.payments (id) on delete cascade,
  superseded_at timestamptz not null default now()
);
create index if not exists payment_superseded_attempts_payment_idx on public.payment_superseded_attempts (payment_id);
alter table public.payment_superseded_attempts enable row level security;
revoke all on table public.payment_superseded_attempts from public, anon, authenticated;

create unique index if not exists payments_one_initial_per_order on public.payments (order_id) where kind = 'initial';

-- ── 2) 이어 할 수 있는가 ──
create or replace function public.gift_payment_resumable(p public.payments, o public.orders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.kind = 'initial'
     and p.order_id = o.id
     and o.status = 'pending_payment'
     and p.status in ('pending', 'failed')
     -- 처음 결제 대기를 만든 때부터 24시간(INV-M15 와 같은 시계 — 그 함수는 created_at <= now() - 24시간을 닫는다)
     and now() < p.created_at + interval '24 hours'
     and not exists (select 1 from public.review_cancels c where c.payment_id = p.id);
$$;
revoke all on function public.gift_payment_resumable(public.payments, public.orders) from public, anon, authenticated;

-- ── 3) 이어 하기 ──
create or replace function public.resume_gift_payment(p_order_no text)
returns table (toss_order_id text, amount_krw integer, order_no text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_order public.orders;
  v_pay public.payments;
  v_new text;
begin
  select o.* into v_order from public.orders o where o.order_no = p_order_no and o.fan_id = auth.uid();
  if v_order.id is null then
    raise exception '결제할 주문을 찾을 수 없다' using errcode = 'P0002';
  end if;
  -- 결제 줄을 잠근다 — 결제 확정 시작(claim_payment)·24시간 닫기와 같은 줄이라 둘 중 하나만 반영된다(S22b·S15c)
  select p.* into v_pay from public.payments p where p.order_id = v_order.id and p.kind = 'initial' for update;
  if v_pay.id is null then
    raise exception '결제할 주문을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_pay.status = 'confirming' and v_order.status = 'pending_payment' then
    raise exception '결제를 처리하고 있다' using errcode = 'P0024';
  end if;
  if not public.gift_payment_resumable(v_pay, v_order) then
    raise exception '결제할 주문을 찾을 수 없다' using errcode = 'P0002';
  end if;

  v_new := 'pay_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.payment_superseded_attempts (toss_order_id, payment_id) values (v_pay.toss_order_id, v_pay.id);
  -- 금액·칸·처음 만든 때는 그대로 — 결제 번호와 상태만
  update public.payments p
  set toss_order_id = v_new, status = 'pending', payment_key = null, settled_at = null
  where p.id = v_pay.id;
  return query select v_new, v_pay.amount_krw, v_order.order_no;
end $$;
revoke all on function public.resume_gift_payment(text) from public, anon;
grant execute on function public.resume_gift_payment(text) to authenticated;

-- ── 4) 지금 할 일 읽기 — 20261021000001_deadline_clocks.sql 의 정의 그대로에 「결제 미완료」 한 갈래 ──
CREATE OR REPLACE FUNCTION public.my_action_items()
 RETURNS TABLE(kind text, order_no text, box_id uuid, box_label text, box_seq smallint, creator_name text, tier text, measured_tier text, amount_krw integer, due_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with mine as (
    select auth.uid() as uid
  ),
  cards as (
    -- 추가 결제 — prepare_difference_payment 가 받아 주는 상태
    select 'difference'::text as kind, o.order_no, b.id as box_id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end as box_label,
           b.seq as box_seq, c.name as creator_name, b.declared_tier::text as tier, b.measured_tier::text as measured_tier,
           p.amount_krw, public.difference_due_at(b.id) as due_at
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'difference'
    join public.boxes b on b.id = p.box_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels op on op.box_id = b.id
    where p.status in ('pending', 'failed')
      and p.expired_at is null
      and coalesce(now() < public.difference_due_at(b.id), true)
      and o.status not in ('rejected', 'expired', 'canceled')
      and (op.state is null or op.state not in ('return_waiting', 'return_printed', 'returned', 'dispose_due', 'disposed', 'label_printed', 'shipped',
                                                'tracker_held', 'report_held', 'police_handed'))

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

    union all

    -- 반송 주소 확인(office-workflow INV-W15) — 확인 함수(confirm_return_address)가 받아 주는 상태: 반송 대기 · 확인 전 · 반송 대기 + 720시간 전. 상자마다
    select 'return_address', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, x.return_waiting_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.creators c on c.id = o.creator_id
    where x.state = 'return_waiting'
      and x.return_confirmed_at is null
      and now() < x.return_waiting_at + interval '720 hours'

    union all

    -- 결제 미완료(payment INV-M22 · action-center INV-J1 표) — 이어 하기 함수(resume_gift_payment)가 받아 주는 상태: 같은 판정 함수. 주문마다 하나
    select 'unpaid', o.order_no, null::uuid, null::text, null::smallint, c.name, null::text, null::text, p.amount_krw, p.created_at + interval '24 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'initial'
    join public.creators c on c.id = o.creator_id
    where public.gift_payment_resumable(p, o)
  )
  select kind, order_no, box_id, box_label, box_seq, creator_name, tier, measured_tier, amount_krw, due_at
  from cards
  order by due_at, order_no, box_seq;
$function$;

-- ── 5) 크리에이터 지금 할 일 — 20261017000004_return_address.sql 의 정의 그대로에 보낸 팬 선물의 「결제를 마치지 않은 선물」(unpaid)을 더한다 ──
-- payment INV-M22 ⑤ 「로그인한 계정이 보낸 사람」 — 크리에이터 계정이 보낸 팬 선물도 팬 지금 할 일 읽기의 같은 줄을 보낸 선물 판에 쓴다(INV-J3·J5·J6).
-- 결제 전 주문은 결제 완료 시각(registered_at)이 비어 있어 보낸 날 칸은 주문을 만든 때로 채운다. 나머지는 그대로.
CREATE OR REPLACE FUNCTION public.my_creator_action_items()
 RETURNS TABLE(kind text, board text, order_no text, request_id text, share_id uuid, box_id uuid, box_seq integer, box_count integer, box_label text, nickname text, item_kind text, tier text, measured_tier text, amount_krw integer, has_electronics_or_metal boolean, bluetooth boolean, rf boolean, choice text, sent_at timestamp with time zone, received_at timestamp with time zone, due_at timestamp with time zone, prior_gift_count integer, prior_passed_count integer, prior_returned_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select p.id as uid from public.profiles p where p.id = auth.uid() and p.role = 'creator'
  ),
  lines as (
    -- 추적 장치 발견 / 블루투스 발견: 그 일을 받아 주는 고르기(choose_creator_check)와 같은 판정 —
    -- 추적기 보관 · 운영자 처리 전 · 기한 전(주문이 끝나도) / 확인 대기 · 운영자 처리 전 · 기한 전 · 주문 진행 중 · 나갈 수 있는 상자
    select case when k.kind = 'tracker' then 'tracker' else 'bluetooth' end::text as kind, 'received'::text as board, o.order_no, null::text as request_id,
           null::uuid as share_id, b.id as box_id,
           b.seq::integer as box_seq, (select count(*)::integer from public.boxes bx where bx.order_id = o.id) as box_count, null::text as box_label,
           f.nickname, o.item_kind, coalesce(b.measured_tier, b.declared_tier)::text as tier, null::text as measured_tier, null::integer as amount_krw,
           o.has_electronics_or_metal, coalesce(i.bluetooth = 'found', false) as bluetooth, coalesce(i.rf = 'found', false) as rf, k.choice,
           o.registered_at as sent_at, x.received_at, x.inspected_at + interval '168 hours' as due_at,
           h.gifts as prior_gift_count, h.passed as prior_passed_count, h.returned as prior_returned_count
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.office_creator_checks k on k.parcel_id = x.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select ii.bluetooth, ii.rf from public.office_inspections ii where ii.parcel_id = x.id order by ii.at desc, ii.id desc limit 1
    ) i on true
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where k.answer is null and now() < x.inspected_at + interval '168 hours'
      and ((k.kind = 'tracker' and x.state = 'tracker_held')
           or (k.kind = 'confirm' and x.state = 'held'
               and o.status not in ('rejected', 'expired', 'canceled') and not public.office_parcel_dead(x)))

    union all

    -- 승인 요청: 대기 · 승인 전 · 진행 중 · 검수 반송 아님 · 결제 완료 + 168시간 전(approve_request 와 같은 판정)
    select 'approval', 'received', o.order_no, r.request_id, null, null, null,
           (select count(*)::integer from public.boxes bx where bx.order_id = o.id), null,
           f.nickname, o.item_kind, null, null, null, o.has_electronics_or_metal, null, null, null,
           o.registered_at, o.received_at, o.registered_at + interval '168 hours',
           h.gifts, h.passed, h.returned
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.approval_requests r on r.order_id = o.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and now() < o.registered_at + interval '168 hours'

    union all

    -- 미확인 상자: 내가 보낸 몫이 늦을 때만(INV-J7 — 보류 상자가 있는지와 상관없다). 칸은 받는 팬 닉네임·상자 크기·보낸 날뿐
    select 'unconfirmed', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, null, null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.profiles fp on fp.id = s.fan_id
    -- 결제 끝·336시간 지난 보내기만 먼저 거른 뒤 판정 함수를 부른다(같은 결과, 부르는 수만 줄인다 — INV-J11 판정은 그 함수 하나)
    where d.status = 'done' and d.settled_at <= now() - interval '336 hours'
      and public.revgift_share_late(s.id, me.uid)

    union all

    -- 보낸 팬 선물: 팬 처리할 일과 같은 함수의 같은 줄(action-center INV-J3 · 카드 d93 ⑩)
    select a.kind, 'sent', a.order_no, null, null, a.box_id, a.box_seq::integer, null, a.box_label,
           a.creator_name, null, a.tier, a.measured_tier, a.amount_krw, null, null, null, null,
           coalesce(o.registered_at, o.created_at), null, a.due_at, null, null, null
    from me
    cross join public.my_action_items() a
    join public.orders o on o.order_no = a.order_no
    -- 결제를 마치지 않은 선물(unpaid, payment INV-M22 ⑤ — 2026-10-21): 결제 전이라 보낸 날 칸은 주문을 만든 때
    where a.kind in ('difference', 'missing_box', 'return_address', 'unpaid')

    union all

    -- 보낸 역조공 반송 주소(INV-J5 · office-workflow INV-W15): 보낸 몫의 상자가 반송 대기 · 확인 전 · 반송 대기 + 720시간 전. 칸은 받는 팬 닉네임·상자 크기·보낸 날·기한
    select 'return_address', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, x.return_waiting_at + interval '720 hours', null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.office_parcels x on x.share_id = s.id
    join public.profiles fp on fp.id = s.fan_id
    where x.state = 'return_waiting'
      and x.return_confirmed_at is null
      and now() < x.return_waiting_at + interval '720 hours'
  )
  select l.kind, l.board, l.order_no, l.request_id, l.share_id, l.box_id, l.box_seq, l.box_count, l.box_label, l.nickname, l.item_kind, l.tier,
         l.measured_tier, l.amount_krw, l.has_electronics_or_metal, l.bluetooth, l.rf, l.choice, l.sent_at, l.received_at, l.due_at,
         l.prior_gift_count, l.prior_passed_count, l.prior_returned_count
  from lines l
  order by (l.board = 'sent'),
           case l.kind when 'tracker' then 0 when 'bluetooth' then 1 else 2 end,
           case when l.board = 'received' then l.due_at else l.sent_at end,
           -- 같은 시각이면 받은 선물은 주문번호·상자 순, 보낸 선물은 몫(상자) id 순
           case when l.board = 'received' then l.order_no end, l.box_seq, coalesce(l.share_id, l.box_id);
$function$;
