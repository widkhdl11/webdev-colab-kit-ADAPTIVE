-- 크리에이터 선물 현황 읽기 (action-center INV-J9·J10·J11, S9~S11b · design-rules 13절 · 카드 d93 ④⑤⑥⑦, d96 ①).
-- my_gift_progress() — 인자 없음. 로그인 토큰의 계정이 크리에이터일 때만 그 사람 것을 돌려준다(팬·직원·대표·로그인 안 함 = 0줄, J10).
-- 저장하지 않고 읽을 때마다 원천에서 계산한다(J9). 단계는 새로 계산하지 않고 기존 읽기 함수의 결과를 그대로 쓴다:
--   받는 선물 = my_incoming_gifts() 의 stage(office-workflow INV-W9) — 결제 끝(결제 대기 없음)이고 수령·반송·닫힘이 아닌 것.
--               출고 뒤 줄은 배송 칸이 수령(delivered)이 될 때 빠진다 — 날짜로 빼지 않는다(카드 d93 ⑤).
--               승인 대기는 승인 전(approved_at 없음)인지만 더한다 — 승인은 단계가 아니라 출고 조건이다(INV-W9 과 같은 모양).
--   보내는 선물 = my_sent_revgifts() 의 받기 상태 + my_share_boxes() 의 상자 상태 — 결제 끝 보내기의 몫 가운데 끝나지 않은 것.
--               끝남 = 취소·반송 기록이 있거나, 상자가 반송됐거나(returned)·닫혔거나(missing), 받지 않음인데 상자가 오지 않았고 찾기 판정(입고 전·닫히지 않음)도 아님.
--               몫에는 배송 칸이 없다 — 택배사 연결 전에는 출고된 몫이 출고로 남는다(J9 「연결 전에는 가는 중으로 남는다」).
-- 늦음(J11) = revgift_share_late(처리할 일 미확인 상자 줄과 같은 함수, 결제 완료 + 336시간), 「내 상자 찾기」 자리(J10) = revgift_share_before_inbound(찾기 후보와 같은 함수).
-- 칸(J10): 상대 닉네임·물품 종류·상자 수와 크기·요청/승인 날·단계·늦음 + 줄을 처리할 일 결과와 맞춰 볼 주문(몫)번호와 찾기 창이 먼저 고를 몫 ID.
--   받는 주소 6자리·원 송장번호·팬 주소·실명·메모·처리한 운영자는 없다.
-- 순서: 받는 선물은 최근 요청 먼저 · 보내는 선물은 보낸 날(결제 완료) 이른 보내기 먼저, 보내기 안은 몫 순서.
-- 다시 적용해도 결과가 같다(create or replace).

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
    -- 진행 중인 단계만 — 수령·반송·닫힘(거절·반려·취소)은 받은 선물에 있다(J9, isIncomingInProgress 와 같은 경계)
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
      -- 받지 않음(거절·기한 지남)인데 상자가 아직 오지 않았으면, 찾기 판정(살려 둔 6자리로 올 수 있음)일 때만 남는다
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

revoke all on function public.my_gift_progress() from public, anon;
grant execute on function public.my_gift_progress() to authenticated;

notify pgrst, 'reload schema';
