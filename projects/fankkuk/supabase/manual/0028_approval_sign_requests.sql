-- 승인 서명 요청 — 만들기·승인 (2026-10-29 (2) 「가입 흐름과 승인 흐름 확정」). 사람이 직접 적용한다(개인정보 구역 pii 를 읽고 고친다).
-- 스펙: docs/specs/approval-signature.md INV-S1·S2·S4·S7·S11·S12·S13·S16·S17 (S1·S11b·S12·S13·S16c·S17~S17d)
-- 순서: 마이그레이션 20261029000010_approval_sign_requests.sql(표·읽기 함수) → 0017(주소)·0027(승인 서명 연결) → 이 파일.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0028.sh
-- 확인: npx vitest run --config vitest.integration.config.mts approval-db approval-sign-db signature-link-db
--
-- 무엇을 바꾸나
--   1) start_approval_sign(사람, 승인 요청, 방식) — 크리에이터가 「승인」을 누를 때 서명 요청을 만든다(INV-S17). 결제 때는 부르지 않는다.
--      승인 요청 줄을 잠그고: 그 주문의 크리에이터인가(아니면 없는 요청과 같은 답) · 승인할 수 있는 주문인가(INV-S6) · 받는 주소가 있는가(INV-S13)
--      · 승인 서명이 연결됐는가(INV-S16) 를 본다. 기다리는 요청이 있으면 새로 만들지 않고 그것을 돌려준다. 새 요청은 승인 요청 하나에 하루 다섯 번.
--      원문은 마이그레이션의 원문 함수 하나가 주문에서 만든다(INV-S1). 새 요청이면 그 크리에이터의 연결 봉투와 크리에이터 ID 를 같이 돌려준다 —
--      앱 서버는 열지 않고 게이트웨이에 넘긴다(게이트웨이만 KMS 로 풀어 서명 대상을 지정한다, INV-S4).
--   2) settle_approval_sign(사람, 서명 요청, 서명된 원문, 서명값, 서명 시각, 방식) — 승인하는 유일한 입구(INV-S7).
--      기한(5분) 안이고, 서명된 원문이 저장한 원문과 같고(INV-S2), 방식이 요청 때와 같고 가짜는 허용 줄이 있는 DB 에서만(INV-S11),
--      게이트웨이 거래 ID 가 적혀 있을 때만. 승인과 서명 저장(서명값·원문 해시·서명 시각·방식)은 한 처리(INV-S12).
--   3) 옛 승인 함수 approve_request(서명자 식별값을 받던 판)와 옛 원문 읽기 approval_payload_of 를 지운다 — 승인 입구는 2) 하나다.
--   4) 승인 서명 연결의 시험 서명 — 기한 10분 → 5분(드림시큐리티 결과 유효 시간), 게이트웨이 거래 ID 칸과 그것을 적는 함수.
--      결과 읽기(signature_link_request)가 거래 ID 를 같이 돌려준다. 거래 ID 없이 「연결됨」을 적지 않는다.
--
-- 앱과 한쪽만 적용된 상태
--   이 파일만(앱은 옛 코드): 옛 앱의 승인은 함수를 찾지 못해 실패한다(닫힌 쪽). 연결 요청은 5분 기한으로 만들어지고, 옛 앱은 거래 ID 를 적지 않아
--     「연결됨」이 되지 않는다 — 앱과 같이 올린다.
--   앱만(이 파일 없음): 승인 요청·연결 요청 모두 함수를 찾지 못해 실패한다(닫힌 쪽). 옛 승인 함수는 남아 있지만 새 앱은 부르지 않는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if to_regclass('public.approval_sign_requests') is null then
    raise exception '서명 요청 표가 없다 — 마이그레이션 20261029000010_approval_sign_requests.sql 을 먼저 적용한다';
  end if;
  if to_regclass('pii.signature_links') is null then
    raise exception '승인 서명 연결 표가 없다 — 0027_signature_link.sql 을 먼저 적용한다';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'creator_addresses' and column_name = 'label') then
    raise exception '크리에이터 주소 이름표 칸이 없다 — 0017_creator_address_label.sql 을 먼저 적용한다';
  end if;
end $$;

-- ── 1) 서명 요청 만들기 ──────────────────────────────────

-- result: started(새 요청 — 봉투가 있다) · pending(기다리는 요청을 그대로 — 봉투 없음) · not_found(없는 요청·남의 요청 — 같은 답)
--         · already(이미 승인) · expired(결제 뒤 168시간 지남, INV-S6) · not_approvable · no_address(INV-S13) · not_linked(INV-S16)
--         · method_refused(이 DB 가 받지 않는 방식) · too_many_day(이 승인 요청의 하루 다섯 번)
-- 돌려주는 칸이 바뀌어(creator_id 추가) create or replace 로는 못 바꾼다 — 지우고 다시 만든다. 다시 적용해도 같다.
drop function if exists public.start_approval_sign(uuid, text, text);
create or replace function public.start_approval_sign(p_actor_id uuid, p_request_id text, p_method text)
returns table (result text, sign_request_id uuid, plaintext text, expires_at timestamptz, envelope jsonb, creator_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req public.approval_requests;
  v_order public.orders;
  v_withdrawn timestamptz;
  v_env jsonb;
  v_sr public.approval_sign_requests;
  v_now timestamptz := now();
  v_id uuid := gen_random_uuid();
  v_plain text;
  -- 하루 = 한국 시간 0시부터(승인 서명 연결·가입 인증번호와 같다)
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  -- 승인 요청 줄을 잠근다 — 같은 주문의 「승인」이 두 탭에서 동시에 와도 차례로 본다(INV-S17 S17b)
  select q.* into v_req
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where q.request_id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id
  for update of q;
  if v_req.id is null then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  select o.* into v_order from public.orders o where o.id = v_req.order_id;
  select c.withdrawn_at into v_withdrawn from public.creators c where c.id = v_order.creator_id;

  if p_method is null or p_method not in ('kakao', 'fake')
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  if v_req.status = 'approved' then
    return query select 'already'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  -- INV-S6: 결제 완료부터 168시간이 지났으면 「기한 지남」(승인 함수와 같은 답)
  if v_req.status = 'waiting' and v_order.approved_at is null and v_now >= v_order.registered_at + interval '168 hours' then
    return query select 'expired'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  -- INV-S15: 탈퇴한 크리에이터에게는 새 승인 요청이 없다
  if v_req.status <> 'waiting' or v_withdrawn is not null
     or v_order.approved_at is not null
     or v_order.status not in ('registered', 'received', 'labeled', 'inspected')
     or v_order.inspection_result is not distinct from 'returned' then
    return query select 'not_approvable'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  -- INV-S13: 받는 주소가 없으면 서명 요청(카카오톡)을 보내지 않는다 — 승인 함수도 같은 답을 한다
  if not exists (select 1 from pii.creator_addresses a where a.creator_id = v_order.creator_id) then
    return query select 'no_address'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;
  -- INV-S16·S4: 서명 대상은 연결 때 등록한 정보로 지정한다 — 연결 전이면 보낼 곳이 없다
  select l.envelope into v_env from pii.signature_links l where l.creator_id = v_order.creator_id;
  if v_env is null then
    return query select 'not_linked'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;

  -- 기한이 지난 기다림은 끝낸다. 기한 안의 기다림이 있으면 새로 만들지 않고 그것을 돌려준다(INV-S17)
  update public.approval_sign_requests r set state = 'expired', finished_at = v_now
   where r.approval_request_id = p_request_id and r.state = 'pending' and v_now > r.expires_at;
  select r.* into v_sr from public.approval_sign_requests r where r.approval_request_id = p_request_id and r.state = 'pending';
  if v_sr.id is not null then
    return query select 'pending'::text, v_sr.id, v_sr.plaintext, v_sr.expires_at, null::jsonb, null::uuid;
    return;
  end if;

  -- 요청마다 크리에이터 카카오톡으로 서명 요청이 간다 — 승인 요청 하나에 하루 다섯 번
  if (select count(*) from public.approval_sign_requests r
      where r.approval_request_id = p_request_id and r.created_at >= v_day_start) >= 5 then
    return query select 'too_many_day'::text, null::uuid, null::text, null::timestamptz, null::jsonb, null::uuid;
    return;
  end if;

  -- INV-S1: 원문은 원문 함수 하나가 주문에서 만든다
  v_plain := public.approval_sign_plaintext_of_order(v_order.id);
  insert into public.approval_sign_requests (id, approval_request_id, plaintext, method, created_at, expires_at)
  values (v_id, p_request_id, v_plain, p_method, v_now, v_now + interval '5 minutes');
  return query select 'started'::text, v_id, v_plain, v_now + interval '5 minutes', v_env, v_order.creator_id;
end;
$fn$;

-- ── 2) 승인 — 검증한 서명으로만 ───────────────────────────

-- result: approved · already · not_found(없는 요청·남의 요청 — 같은 답) · sign_expired(서명 요청 5분 지남, INV-S17)
--         · sign_failed(이미 끝난 서명 요청) · signature_mismatch(원문·방식·서명값이 맞지 않음 — 그 요청은 끝난다)
--         · expired(결제 뒤 168시간, INV-S6) · not_approvable · no_address(INV-S13 — 서명 요청은 그대로 기다린다)
create or replace function public.settle_approval_sign(
  p_actor_id uuid,
  p_sign_request_id uuid,
  p_signed_plaintext text,
  p_signature text,
  p_signed_at timestamptz,
  p_method text
)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_sr public.approval_sign_requests;
  v_req public.approval_requests;
  v_order public.orders;
  v_now timestamptz := now();
begin
  -- INV-S11: 승인하는 사람이 그 주문의 크리에이터일 때만. 아니면 없는 요청과 같은 답(S17d).
  select r.* into v_sr
  from public.approval_sign_requests r
  join public.approval_requests q on q.request_id = r.approval_request_id
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where r.id = p_sign_request_id and p_actor_id is not null and c.profile_id = p_actor_id;
  if v_sr.id is null then
    return 'not_found';
  end if;

  -- 잠그는 순서는 서명 요청 만들기와 같다: 승인 요청 → 서명 요청(같은 서명이 동시에 두 번 와도 승인은 한 번, INV-S5)
  select q.* into v_req from public.approval_requests q where q.request_id = v_sr.approval_request_id for update;
  select r.* into v_sr from public.approval_sign_requests r where r.id = p_sign_request_id for update;
  if v_req.status = 'approved' then
    return 'already';
  end if;
  if v_sr.state = 'expired' then
    return 'sign_expired';
  end if;
  if v_sr.state <> 'pending' then
    return 'sign_failed';
  end if;
  -- INV-S17: 만든 때부터 5분이 지난 요청의 결과는 받지 않는다(S17c)
  if v_now > v_sr.expires_at then
    update public.approval_sign_requests r set state = 'expired', finished_at = v_now where r.id = v_sr.id;
    return 'sign_expired';
  end if;

  -- INV-S2·S11: 서명된 원문은 저장한 원문과 같아야 하고(바이트 그대로), 방식은 요청 때와 같아야 하고, 가짜는 허용 줄이 있는 DB 에서만.
  -- 게이트웨이 거래 ID 없이 온 결과는 게이트웨이를 거치지 않은 것이다.
  if p_method is null or p_method not in ('kakao', 'fake') or p_method <> v_sr.method
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures'))
     or v_sr.gateway_tx_id is null
     or p_signed_plaintext is distinct from v_sr.plaintext
     or p_signature is null or char_length(p_signature) not between 1 and 65536
     or p_signed_at is null then
    update public.approval_sign_requests r set state = 'failed', finished_at = v_now where r.id = v_sr.id;
    return 'signature_mismatch';
  end if;

  select o.* into v_order from public.orders o where o.id = v_req.order_id;
  -- INV-S6 (2026-10-10): 대기 중인데 결제 완료부터 168시간이 지났으면 「기한 지남」 — 반려는 자동 처리가 한다
  if v_req.status = 'waiting' and v_order.approved_at is null and v_now >= v_order.registered_at + interval '168 hours' then
    update public.approval_sign_requests r set state = 'failed', finished_at = v_now where r.id = v_sr.id;
    return 'expired';
  end if;
  if v_req.status <> 'waiting'
     or v_order.approved_at is not null
     or v_order.status not in ('registered', 'received', 'labeled', 'inspected')
     or v_order.inspection_result is not distinct from 'returned'
     or v_now >= v_order.registered_at + interval '168 hours' then
    update public.approval_sign_requests r set state = 'failed', finished_at = v_now where r.id = v_sr.id;
    return 'not_approvable';
  end if;
  -- INV-S13 (2026-10-14): 받는 주소를 등록하지 않은 크리에이터는 승인하지 못한다. 서명 요청은 기한까지 그대로 둔다 —
  -- 주소를 등록하고 「승인 요청 보내기」를 다시 누르면 같은 요청을 이어 기다린다.
  if not exists (select 1 from pii.creator_addresses a where a.creator_id = v_order.creator_id) then
    return 'no_address';
  end if;

  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests q set status = 'approved', decided_at = v_now where q.id = v_req.id;
  update public.orders o set approved_at = v_now where o.id = v_req.order_id;
  perform set_config('fankkuk.approving', '', true);
  -- INV-S12: 승인과 서명 저장은 한 처리. 서명값·원문 해시·서명 시각·방식만 — 원문은 서명 요청 줄에 있다
  insert into public.approval_signatures (request_id, signed_content, signer_id, content_hash, signature, method, signed_at, sign_request_id)
  values (v_req.request_id, null, null,
          encode(extensions.digest(convert_to(v_sr.plaintext, 'UTF8'), 'sha256'), 'hex'),
          p_signature, p_method, p_signed_at, v_sr.id);
  update public.approval_sign_requests r set state = 'signed', finished_at = v_now where r.id = v_sr.id;
  return 'approved';
end;
$fn$;

-- ── 3) 옛 승인 입구를 지운다(INV-S7 — 입구는 하나) ──────

drop function if exists public.approve_request(text, uuid, text, text, text);
drop function if exists public.approval_payload_of(text, uuid);

-- ── 4) 승인 서명 연결 — 5분, 게이트웨이 거래 ID ───────────

-- 기한: 새 요청은 요청 + 5분. 이 파일 전에 만든 요청(10분)도 상태를 바꿀 수 있게 두 값을 다 받는다 — 만드는 함수는 5분만 만든다.
alter table pii.signature_link_requests drop constraint if exists signature_link_requests_check;
alter table pii.signature_link_requests drop constraint if exists signature_link_requests_expiry;
alter table pii.signature_link_requests add constraint signature_link_requests_expiry
  check (expires_at in (requested_at + interval '5 minutes', requested_at + interval '10 minutes'));
alter table pii.signature_link_requests add column if not exists gateway_tx_id text
  check (gateway_tx_id is null or gateway_tx_id ~ '^[0-9A-Za-z_.:-]{1,128}$');

-- 0027 그대로에 기한만 5분으로, 그리고 크리에이터 ID 를 같이 돌려준다(게이트웨이가 봉투 안 크리에이터 ID 와 대조한다).
-- 돌려주는 칸이 바뀌어 지우고 다시 만든다.
drop function if exists public.start_signature_link(uuid, jsonb, text, text);
create or replace function public.start_signature_link(p_actor_id uuid, p_envelope jsonb, p_method text, p_ip_hash text)
returns table (result text, request_id uuid, payload text, expires_at timestamptz, creator_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_creator_id uuid;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_payload text;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 연결 정보가 아니다' using errcode = '22023';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception '접속 주소 해시 꼴이 아니다' using errcode = '22023';
  end if;

  select c.id into v_creator_id
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where p_actor_id is not null and c.profile_id = p_actor_id and p.role = 'creator' and c.withdrawn_at is null
  for update of c;
  if v_creator_id is null then
    return query select 'not_creator'::text, null::uuid, null::text, null::timestamptz, null::uuid;
    return;
  end if;

  if p_method is null or p_method not in ('kakao', 'fake')
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::uuid, null::text, null::timestamptz, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fankkuk.signature_link_ip:' || p_ip_hash, 0));
  if (select count(*) from pii.signature_link_requests r
      where r.creator_id = v_creator_id and r.requested_at > v_now - interval '1 hour') >= 5 then
    return query select 'too_many'::text, null::uuid, null::text, null::timestamptz, null::uuid;
    return;
  end if;
  if (select count(*) from pii.signature_link_requests r
      where r.creator_id = v_creator_id and r.requested_at >= v_day_start) >= 5
     or (select count(*) from pii.signature_link_requests r
         where r.ip_hash = p_ip_hash and r.requested_at >= v_day_start) >= 20 then
    return query select 'too_many_day'::text, null::uuid, null::text, null::timestamptz, null::uuid;
    return;
  end if;

  update pii.signature_link_requests r set state = 'superseded', finished_at = v_now
   where r.creator_id = v_creator_id and r.state = 'pending';

  v_payload := 'fankkuk-signature-link:v1|req=' || v_id::text
               || '|at=' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  -- INV-S16: 기한은 요청부터 5분(드림시큐리티 결과 유효 시간)
  insert into pii.signature_link_requests (id, creator_id, envelope, payload, method, ip_hash, requested_at, expires_at)
  values (v_id, v_creator_id, p_envelope, v_payload, p_method, p_ip_hash, v_now, v_now + interval '5 minutes');

  return query select 'started'::text, v_id, v_payload, v_now + interval '5 minutes', v_creator_id;
end;
$fn$;

-- 게이트웨이가 시험 서명 요청을 받고 돌려준 거래 ID 를 적는다. 기다리는 중이고 비어 있을 때만.
-- result: recorded · not_found · not_pending
create or replace function public.record_signature_link_tx(p_actor_id uuid, p_request_id uuid, p_tx_id text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.signature_link_requests%rowtype;
begin
  select r.* into v_req
  from pii.signature_link_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id
  for update of r;
  if not found then
    return 'not_found';
  end if;
  if v_req.state <> 'pending' or v_req.gateway_tx_id is not null then
    return 'not_pending';
  end if;
  update pii.signature_link_requests r set gateway_tx_id = p_tx_id where r.id = v_req.id;
  return 'recorded';
end;
$fn$;

-- 결과 읽기 — 0027 그대로에 거래 ID 칸을 더했다(반환 꼴이 바뀌어 다시 만든다)
drop function if exists public.signature_link_request(uuid, uuid);
create function public.signature_link_request(p_actor_id uuid, p_request_id uuid)
returns table (state text, payload text, method text, gateway_tx_id text)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.signature_link_requests%rowtype;
begin
  select r.* into v_req
  from pii.signature_link_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id
  for update of r;
  if not found then
    return query select 'not_found'::text, null::text, null::text, null::text;
    return;
  end if;
  if v_req.state = 'linked' then
    return query select 'linked'::text, null::text, null::text, null::text;
    return;
  end if;
  if v_req.state <> 'pending' then
    return query select 'failed'::text, null::text, null::text, null::text;
    return;
  end if;
  if now() > v_req.expires_at then
    update pii.signature_link_requests r set state = 'failed', finished_at = now() where r.id = v_req.id;
    return query select 'expired'::text, null::text, null::text, null::text;
    return;
  end if;
  return query select 'pending'::text, v_req.payload, v_req.method, v_req.gateway_tx_id;
end;
$fn$;

-- 결과 적기 — 0027 그대로에 「거래 ID 없이 연결됨을 적지 않는다」를 더했다
create or replace function public.settle_signature_link(p_actor_id uuid, p_request_id uuid, p_outcome text, p_signed_content text, p_method text)
returns table (result text, linked_at timestamptz)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.signature_link_requests%rowtype;
  v_now timestamptz := now();
begin
  select r.* into v_req
  from pii.signature_link_requests r
  join public.creators c on c.id = r.creator_id
  where r.id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id and c.withdrawn_at is null
  for update of r;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if v_req.state = 'linked' then
    return query select 'linked'::text, (select l.linked_at from pii.signature_links l where l.creator_id = v_req.creator_id);
    return;
  end if;
  if v_req.state <> 'pending' then
    return query select 'failed'::text, null::timestamptz;
    return;
  end if;
  if v_now > v_req.expires_at then
    update pii.signature_link_requests r set state = 'failed', finished_at = v_now where r.id = v_req.id;
    return query select 'expired'::text, null::timestamptz;
    return;
  end if;
  if p_outcome is distinct from 'signed' then
    update pii.signature_link_requests r set state = 'failed', finished_at = v_now where r.id = v_req.id;
    return query select 'failed'::text, null::timestamptz;
    return;
  end if;
  if p_method is distinct from v_req.method
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::timestamptz;
    return;
  end if;
  -- INV-S2 와 같은 대조 + 게이트웨이를 거친 결과인가(거래 ID)
  if p_signed_content is distinct from v_req.payload or v_req.gateway_tx_id is null then
    update pii.signature_link_requests r set state = 'failed', finished_at = v_now where r.id = v_req.id;
    return query select 'failed'::text, null::timestamptz;
    return;
  end if;

  update pii.signature_link_requests r set state = 'linked', finished_at = v_now where r.id = v_req.id;
  insert into pii.signature_links (creator_id, envelope, method, linked_at)
  values (v_req.creator_id, v_req.envelope, v_req.method, v_now)
  on conflict (creator_id) do update set envelope = excluded.envelope, method = excluded.method, linked_at = excluded.linked_at;
  return query select 'linked'::text, v_now;
end;
$fn$;

-- ── 권한 ─────────────────────────────────────────────────

revoke all on function public.start_approval_sign(uuid, text, text) from public, anon, authenticated;
revoke all on function public.settle_approval_sign(uuid, uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.start_approval_sign(uuid, text, text) to service_role;
grant execute on function public.settle_approval_sign(uuid, uuid, text, text, timestamptz, text) to service_role;
revoke all on function public.start_signature_link(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.record_signature_link_tx(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.signature_link_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_signature_link(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.start_signature_link(uuid, jsonb, text, text) to service_role;
grant execute on function public.record_signature_link_tx(uuid, uuid, text) to service_role;
grant execute on function public.signature_link_request(uuid, uuid) to service_role;
grant execute on function public.settle_signature_link(uuid, uuid, text, text, text) to service_role;

commit;
