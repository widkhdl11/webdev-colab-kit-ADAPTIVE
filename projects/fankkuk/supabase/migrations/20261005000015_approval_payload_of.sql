-- 승인할 원문 읽기 (approval-signature INV-S11). 앱 서버가 서명 창구에 원문을 넘기기 전에 부른다.
-- 승인하는 사람이 그 주문의 크리에이터일 때만 원문을 돌려주고, 아니면 없는 요청과 같은 빈 결과다.
-- 서비스 키 전용 — 승인하는 사람은 앱 서버가 세션에서 확인한 ID 만 넘긴다(INV-L3).
create function public.approval_payload_of(p_request_id text, p_actor_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select q.payload
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where q.request_id = p_request_id and c.profile_id = p_actor_id;
$$;

revoke all on function public.approval_payload_of(text, uuid) from public, anon, authenticated;
grant execute on function public.approval_payload_of(text, uuid) to service_role;
