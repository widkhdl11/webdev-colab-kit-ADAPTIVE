-- 크리에이터가 받은 선물의 진행 단계 읽기 (office-workflow INV-W9, S9·S9b). 결정 카드 fankkuk-20261001-1-d35.
--
-- 크리에이터 메인 「진행 중인 선물」이 승인 요청만이 아니라 검수·출고·배송 단계까지 보여 주려고 만든다.
-- 인자는 없다 — 로그인 토큰의 계정이 크리에이터이고 그 계정에 연결된 크리에이터가 받는 주문만 돌려준다
-- (my_approval_requests·my_access_log 와 같은 방식). 팬·운영자·로그인하지 않은 사람에게는 줄이 없다.
-- 결제가 끝나지 않은 주문(등록 시각 없음)은 돌려주지 않는다(payment INV-M6).
--
-- 칸은 주문번호 · 보낸 사람 닉네임 · 상자 수 · 지금 단계 · 단계 시각(결제 완료·입고·검수·출고) · 검수 결과 · 배송 칸뿐이다.
-- 실명·주소·전화, 보낸 사람 계정 ID·아이디, 팬이 쓴 원 송장번호, 출고 송장번호, 검수 장비별 세부, 처리한 운영자는 없다(INV-W7).
--
-- 지금 단계(stage): paid 결제 완료(입고 전) · received 입고 · inspected 검수 완료 · shipped 출고 · in_transit 배송중 · delivered 수령
--                   · returned 검수에서 반송 · closed 거절·7일 반려·취소
-- 검수 결과(inspection_result): passed 통과 · held 보관(추적 장치) · returned 반송 · 검수 전이면 null.
--   주문 표의 검수 결과 칸은 보관 상자를 「통과」로 적는다(보관 상자는 주문 단계 계산에서 빠진다) — 그래서 상자 작업 줄을 직접 본다.

create function public.my_incoming_gifts()
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
           exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                   where b.order_id = o.id and p.state in ('return_waiting', 'return_printed', 'returned')) as any_returned,
           exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                   where b.order_id = o.id and p.state = 'held') as any_held
    from public.orders o
    join public.creators c on c.id = o.creator_id
    join public.profiles me on me.id = c.profile_id
    where c.profile_id = auth.uid()
      and me.role = 'creator'
      and o.registered_at is not null
      and o.status <> 'pending_payment'
  )
  select m.order_no,
         f.nickname,
         (select count(*)::integer from public.boxes b where b.order_id = m.id),
         case
           when m.status in ('rejected', 'expired', 'canceled') then 'closed'
           when m.any_returned or m.inspection_result = 'returned' then 'returned'
           when m.delivery = 'delivered' then 'delivered'
           when m.delivery = 'in_transit' then 'in_transit'
           when m.status = 'shipped' then 'shipped'
           when m.status in ('inspected', 'label_printed') then 'inspected'
           when m.status in ('received', 'labeled') then 'received'
           else 'paid'
         end,
         m.registered_at,
         m.received_at,
         m.inspected_at,
         m.shipped_at,
         case
           when m.any_returned or m.inspection_result = 'returned' then 'returned'
           when m.any_held then 'held'
           when m.inspection_result = 'passed' then 'passed'
           else null
         end,
         m.delivery
  from mine m
  join public.profiles f on f.id = m.fan_id
  order by m.registered_at desc;
$$;

revoke all on function public.my_incoming_gifts() from public, anon;
grant execute on function public.my_incoming_gifts() to authenticated;
