-- 승인 요청 카드의 지난 검수 내역 (decline-block INV-D11, 결정 카드 d80 「나에게 보낸 것만」).
--
-- my_approval_requests 가 줄마다 세 수를 더 돌려준다. 그 팬(보낸 사람 계정)이 **이 크리에이터에게** 보낸 주문 가운데
-- 지금 요청의 주문을 뺀, 결제가 끝난 주문만 센다.
--   prior_gift_count     — 그런 주문의 수(0 이면 화면은 「처음 보내는 팬이에요」)
--   prior_passed_count   — 그중 주문 검수 결과가 통과인 수
--   prior_returned_count — 그중 주문 검수 결과가 반송인 수
-- 다른 크리에이터에게 보낸 주문, 다른 팬의 주문은 세지 않는다. 개별 주문 칸(주문번호·날짜·품목)은 돌려주지 않는다.
-- 경고·자동 거절·점수는 없다 — 받을지는 크리에이터가 정한다.
-- 그 밖의 조건(로그인 계정의 크리에이터에게 온 열린 요청만, 승인할 수 없는 상태·검수 반송 제외, 오래 기다린 것부터)은
-- 20261002000002 와 같다. 돌려주는 칸이 바뀌어 지우고 다시 만든다(권한도 다시 준다).

drop function if exists public.my_approval_requests();

create function public.my_approval_requests()
returns table (
  request_id text,
  order_no text,
  fan_nickname text,
  item_kind text,
  box_count integer,
  has_electronics_or_metal boolean,
  registered_at timestamptz,
  received_at timestamptz,
  prior_gift_count integer,
  prior_passed_count integer,
  prior_returned_count integer
)
language sql stable security definer set search_path = ''
as $$
  select r.request_id, o.order_no, f.nickname, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal, o.registered_at, o.received_at,
         coalesce(h.gifts, 0), coalesce(h.passed, 0), coalesce(h.returned, 0)
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles f on f.id = o.fan_id
  left join lateral (
    select count(*)::integer as gifts,
           (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
           (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
    from public.orders p
    where p.creator_id = o.creator_id
      and p.fan_id = o.fan_id
      and p.id <> o.id
      and p.registered_at is not null
      and p.status <> 'pending_payment'
  ) h on true
  where c.profile_id = auth.uid()
    and r.status = 'waiting'
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.inspection_result is distinct from 'returned'
  order by o.registered_at asc;
$$;

revoke all on function public.my_approval_requests() from public, anon;
grant execute on function public.my_approval_requests() to authenticated;
