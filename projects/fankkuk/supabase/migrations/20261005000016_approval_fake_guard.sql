-- 승인 서명 보안 리뷰 반영 (2026-10-05, approval-signature INV-S11·S12).
--
-- 1) 가짜 서명(fake)은 local_dev_flags 에 'allow_fake_signatures' 줄이 있는 DB 에서만 받는다. 그 줄은 로컬 seed.sql 만 넣는다 —
--    운영(호스팅) DB 에는 seed 가 돌지 않아 표가 비어 있으므로, 로컬 앱이 운영 DB 키로 떠 있어도 가짜 서명 승인은 운영 DB 가 거부한다.
--    앱의 환경 판정(서명 창구를 고르는 곳)과 따로 서는 두 번째 막음이다. 표는 소유자만 쓴다(서비스 키·로그인 키는 읽지도 못한다).

create table public.local_dev_flags (
  flag text primary key check (flag in ('allow_fake_signatures'))
);
alter table public.local_dev_flags enable row level security;
revoke all on public.local_dev_flags from anon, authenticated, service_role;

-- 2) 서명 표는 통째로 비우기(truncate)도 막는다 — 열람 기록(decrypt_log)과 같은 수준.

create or replace function public.approve_request(
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
     or (p_method = 'fake' and p_signer_id <> 'fake:' || p_actor_id::text)
     -- 가짜 서명은 허용 줄이 있는 DB(로컬 — seed.sql 이 넣는다)에서만. 운영 DB 에는 seed 가 돌지 않아 줄이 없다.
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
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

create trigger approval_signatures_no_truncate before truncate on public.approval_signatures
for each statement execute function public.approval_signatures_append_only();
