-- 처리한 요청 목록에 「차단함」 (decline-block 「지금 코드와 다른 점」 — 결과 값이 승인·거절·자동 반려 셋뿐이었다).
--
-- blocked = 주문이 거절됐고 그 보낸 사람이 지금 이 크리에이터에게 차단돼 있다. 차단하며 거절한 요청과,
-- 승인했지만 차단으로 주문이 거절된 요청(승인 기록은 남는다, INV-D4 예외) 둘 다 여기에 든다.
-- 차단을 풀면 과거 거절은 declined 로 보인다 — 화면의 「풀려면 주소와 설정에서」 안내가 풀린 뒤에 남지 않게.
-- 결과 칸의 꼴이 승인 요청 상태 값 목록에서 글자로 바뀌므로 함수를 지우고 다시 만든다.

drop function public.my_decided_requests();

create function public.my_decided_requests()
returns table (
  order_no text,
  fan_nickname text,
  item_kind text,
  box_count integer,
  outcome text,
  decided_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select o.order_no, f.nickname, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         case when o.status = 'rejected' and public.sender_blocked(o.creator_id, o.fan_id) then 'blocked' else r.status::text end,
         r.decided_at
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles f on f.id = o.fan_id
  where c.profile_id = auth.uid() and r.status <> 'waiting'
  order by r.decided_at desc
  limit 30;
$$;

revoke all on function public.my_decided_requests() from public, anon;
grant execute on function public.my_decided_requests() to authenticated;
