-- 크리에이터가 이미 처리한 승인 요청(승인·받지 않음·7일 자동 반려) — 승인 요청 화면의 「처리한 요청」 목록.
-- 로그인한 사람이 크리에이터 계정일 때만 행이 나온다. 최근 처리 순, 30건까지. 팬의 송장번호·결제 정보는 넣지 않는다.

create function public.my_decided_requests()
returns table (
  order_no text,
  fan_nickname text,
  item_kind text,
  box_count integer,
  outcome public.approval_request_status,
  decided_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select o.order_no, f.nickname, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         r.status, r.decided_at
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
