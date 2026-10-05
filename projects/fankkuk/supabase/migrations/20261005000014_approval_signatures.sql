-- 승인 서명 저장과 로그인한 크리에이터 확인 (approval-signature INV-S11·S12, 카드 d28 — 2026-10-05).
--
-- 1) approval_signatures: 승인마다 검증한 서명(서명된 원문·서명자 식별값·방식 kakao|fake)을 한 줄. 추가만 된다.
--    복호화 함수가 INV-P4 (a) 에서 다시 검증하는 재료다. 방식이 fake 인 승인은 기록에 그대로 남는다.
-- 2) approve_request 가 승인하는 사람과 서명을 함께 받는다. 승인 입구는 여전히 이 함수 하나다(INV-S7) —
--    옛 꼴(요청 ID 하나)은 지운다. 서명 검증(인증서·본인 일치)은 앱 서버가 먼저 하고, 이 함수는 다시 한 번 확인한다:
--    승인하는 사람이 그 주문의 크리에이터인가(아니면 없는 요청과 같은 답), 서명된 원문이 저장한 원문과 같은가,
--    fake 서명이면 서명자가 그 크리에이터의 가짜 식별값인가.

create table public.approval_signatures (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique references public.approval_requests (request_id),
  signed_content text not null,
  signer_id text not null check (length(signer_id) between 1 and 200),
  method text not null check (method in ('kakao', 'fake')),
  signed_at timestamptz not null default now()
);
alter table public.approval_signatures enable row level security;
revoke all on public.approval_signatures from anon, authenticated, service_role;

-- 추가만: 고치기·지우기는 누구도(서비스 키 포함) 못 한다
create function public.approval_signatures_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'approval_signatures 는 추가만 된다' using errcode = '42501';
end $$;
create trigger approval_signatures_no_update before update or delete on public.approval_signatures
for each row execute function public.approval_signatures_append_only();

drop function public.approve_request(text);

-- 결과: approved | already | not_approvable | not_found | signature_mismatch
create function public.approve_request(
  p_request_id text,
  p_actor_id uuid,
  p_signed_content text,
  p_signer_id text,
  p_method text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_now timestamptz := now();
begin
  -- INV-S11: 승인하는 사람이 그 주문의 크리에이터일 때만. 아니면 없는 요청과 같은 답.
  if p_actor_id is null or not exists (
    select 1 from public.approval_requests q
    join public.orders o on o.id = q.order_id
    join public.creators c on c.id = o.creator_id
    where q.request_id = p_request_id and c.profile_id = p_actor_id
  ) then
    return 'not_found';
  end if;

  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if v_req.status = 'approved' then
    return 'already';
  end if;

  -- INV-S2 를 DB 에서도: 서명된 원문은 저장한 원문과 같아야 한다. fake 서명자는 그 크리에이터의 가짜 식별값뿐.
  if p_signed_content is distinct from v_req.payload
     or p_method is null or p_method not in ('kakao', 'fake')
     or p_signer_id is null or p_signer_id = ''
     or (p_method = 'fake' and p_signer_id <> 'fake:' || p_actor_id::text) then
    return 'signature_mismatch';
  end if;

  if v_req.status <> 'waiting' or not exists (
    select 1 from public.orders o
    where o.id = v_req.order_id
      and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and v_now < o.registered_at + interval '168 hours'
  ) then
    return 'not_approvable';
  end if;

  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests set status = 'approved', decided_at = v_now where id = v_req.id;
  update public.orders set approved_at = v_now where id = v_req.order_id;
  perform set_config('fankkuk.approving', '', true);
  -- INV-S12: 승인과 서명 저장은 한 처리
  insert into public.approval_signatures (request_id, signed_content, signer_id, method, signed_at)
  values (p_request_id, p_signed_content, p_signer_id, p_method, v_now);
  return 'approved';
end $$;

revoke all on function public.approve_request(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.approve_request(text, uuid, text, text, text) to service_role;
revoke all on function public.approval_signatures_append_only() from public, anon, authenticated;
