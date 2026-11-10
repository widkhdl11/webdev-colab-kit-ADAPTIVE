-- 0037 크리에이터 가입 3단계 카카오 서명 — 휴대폰 확인과 승인 서명 연결을 서명 한 번으로(2026-11-10, DECISIONS 「크리에이터 가입은 카카오 서명 한 번으로…」).
-- 스펙: docs/specs/signup.md INV-U1·U2·U3·U5·U10·U12(정함)·U16·U19·U20 (S19~S20c) · approval-signature INV-S16 (S16e)
--
-- 사람이 직접 적용한다(개인정보 구역 pii 에 새 표 하나, 칸 넷, 함수). 에이전트는 로컬에도 적용하지 않는다.
-- 마이그레이션 20261110000040_creator_signup_kakao_sign.sql 과 manual 0027·0028(둘 다)·0029 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0037.sh
-- 확인: npx vitest run --config vitest.integration.config.mts signup-kakao-sign-db
--   → 적용 전에는 「(manual/0037 뒤)」 시험이 함수가 없다고 실패하고, 적용 뒤에는 통과한다.
--
-- 무엇을 바꾸나
--   1) pii.signup_sign_requests — 가입 3단계 서명 요청 하나에 줄 하나. 번호표(ticket — 가입 요청이 쓰는 확인 ID)·크리에이터 ID(브라우저가 정해 봉투에도 넣은 값)·
--      번호 해시·접속 주소 해시·봉투·고정 원문(승인 서명 연결과 같은 꼴)·방식·거래 ID·기한(5분)·상태. 평문 칸은 없다.
--      상태: pending → verified(서명 검증, 확인 줄 생김) → used(계정·연결 기록 생김) / failed · expired · exists(이미 가입된 번호) · down(창구 장애) · superseded(새 요청).
--      계정이 생기지 않고 끝나는 처리에서 봉투를 바로 지운다(INV-U19 ⑤ 정함). 끝나는 처리를 거치지 않은 줄은 정리 작업이 지운다(아래 7).
--   2) pii.phone_verifications 에 칸 셋 — method(code|sign) · sign_request_id(서명 길의 요청) · gateway_down_at(「창구 장애 확인」을 옮겨 받은 때, INV-U20).
--      pii.signature_links 에 칸 하나 — signup_linked_at(가입 3단계에서 연결한 때. 설정에서 다시 연결하면 linked_at 이 바뀌어 같지 않게 된다).
--   3) 서명 요청 함수 다섯(앱 서버 키 전용) — start_signup_sign · record_signup_sign_tx · close_signup_sign · signup_sign_request · settle_signup_sign.
--      한도(INV-U19 ④): 같은 번호 해시 1시간 5번·하루 5번, 같은 접속 주소 하루 20번. 인증번호 한도(INV-U10)와 따로 센다.
--      서명이 검증되면 그 번호표로 확인 줄(method sign)을 만든다 — 가입 요청은 기존 번호표 규칙(10분·한 번, INV-U2)을 그대로 지난다.
--      검증된 번호가 이미 가입된 번호면 확인 줄을 만들지 않고 exists 로 끝낸다(INV-U3·U11).
--   4) 장애 대비 길(INV-U20) — carry_signup_sign_down(앞 번호표, 새 번호표): 앞 번호표의 요청이 down 으로 끝났고 10분 안이고 번호 해시가 같고
--      아직 옮기지 않았을 때만 새 인증번호 번호표에 gateway_down_at 을 옮기고, 그 요청에 옮긴 번호표(carried_to)를 적는다 — 한 번만 옮긴다. signup_verification_kind(번호표) → sign | code_down | code (앱 서버가 가입 전에 본다).
--   5) 계정 만들기(public.create_account — 0028 본문 그대로에 두 줄): 팬이 서명 번호표로 가입하면 거부, 크리에이터가 인증번호 번호표로 가입하면
--      gateway_down_at 이 10분 안일 때만(정함 — 「창구 장애 확인」은 번호표와 같은 10분). 아니면 FKU01.
--      pii.signup_sign_creator_id · pii.signup_sign_link — 마이그레이션의 create_creator_account 가 부른다. 연결 기록은 계정과 한 처리에서만 생긴다.
--      discard_signup_sign(번호표) — 가입이 「이미 가입된 번호」로 끝났을 때 앱 서버가 봉투를 지운다.
--   6) 인증번호 요청(public.request_phone_code — 0028 본문 그대로)의 한도 셈에서 서명 확인 줄을 뺀다(method = 'code' 만 센다).
--      번호 바꾸기(public.change_my_phone — 0029 본문 그대로)는 가입 3단계에서 연결된 크리에이터면 승인 서명 연결을 같은 처리에서 푼다(INV-U12 정함).
--   7) purge_signup_sign_requests() — 기한이 지난 줄의 봉투를 지우고(기다리는 줄은 expired 로), 이틀 지난 줄은 지운다. 10분마다(DB 예약 작업 fankkuk-signup-sign).
--
-- 앱과 마이그레이션과 이 파일이 한쪽만 적용된 상태
--   마이그레이션만(이 파일 없음): 크리에이터 가입이 모두 막힌다 — 새 앱은 서명 요청·확인 방법 함수가 없어 「현재 회원가입을 이용할 수 없습니다」,
--     옛 앱은 계정 만들기가 없는 pii 함수를 부르다 실패한다(아무것도 남지 않음). 팬 가입은 그대로다.
--   이 파일만(마이그레이션 없음): 첫 검사가 멈춘다(적용되지 않는다).
--   둘 다 + 옛 앱: 옛 앱의 크리에이터 6자리 가입은 FKU01(「휴대폰 번호를 다시 확인해 주세요」)로 막힌다 — 장애 기록 없는 인증번호 번호표라서.
--     옛 앱의 가입 5단계 연결 화면·설정의 연결은 그대로 된다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.create_creator_account(uuid,text,text,text,uuid,jsonb,uuid[],text,text,text)')
                 and prosrc like '%pii.signup_sign_link%') then
    raise exception '마이그레이션 20261110000040 을 먼저 적용해야 한다';
  end if;
  if to_regclass('pii.signature_links') is null or to_regprocedure('public.record_signature_link_tx(uuid,uuid,text)') is null then
    raise exception 'manual 0027·0028_approval_sign_requests 를 먼저 적용해야 한다';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'phone_verifications' and column_name = 'phone_hash') then
    raise exception 'manual 0028_phone_encrypt 를 먼저 적용해야 한다';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'account_contacts' and column_name = 'phone') then
    raise exception 'manual 0029_phone_plaintext_drop 을 먼저 적용해야 한다(번호 바꾸기 함수를 그 본문에서 고친다)';
  end if;
end $$;

-- ── 1)·2) 표와 칸 ───────────────────────────────────────

create table if not exists pii.signup_sign_requests (
  id uuid primary key default gen_random_uuid(),
  -- 번호표 — 가입 요청이 쿠키로 들고 오는 확인 ID. 서명이 검증되면 같은 ID 로 확인 줄이 생긴다
  ticket uuid not null unique,
  -- 브라우저가 정해 봉투에도 넣은 크리에이터 ID — 계정이 생기면 그 크리에이터 행의 ID 가 된다(게이트웨이 봉투 대조)
  creator_id uuid not null,
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  -- 끝나면 지운다(계정이 생기면 연결 기록으로 옮긴 뒤)
  envelope jsonb check (envelope is null or pii.is_sealed_envelope(envelope)),
  payload text not null check (payload ~ '^fankkuk-signature-link:v1\|req=[0-9a-f-]{36}\|at=[0-9T:.Z-]+$'),
  method text not null check (method in ('kakao', 'fake')),
  gateway_tx_id text check (gateway_tx_id is null or gateway_tx_id ~ '^[0-9A-Za-z_.:-]{1,128}$'),
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'verified', 'used', 'failed', 'expired', 'exists', 'down', 'superseded')),
  finished_at timestamptz,
  -- 「창구 장애 확인」을 옮겨 받은 인증번호 번호표 — 한 번만 옮긴다(여러 번호표로 퍼지지 않게, 보안 리뷰 낮음1)
  carried_to uuid,
  check (expires_at = requested_at + interval '5 minutes'),
  check ((state = 'pending') = (finished_at is null)),
  -- 기다림·검증됨만 봉투를 가진다
  check (envelope is null or state in ('pending', 'verified'))
);
create index if not exists signup_sign_requests_phone on pii.signup_sign_requests (phone_hash, requested_at);
create index if not exists signup_sign_requests_ip on pii.signup_sign_requests (ip_hash, requested_at);
alter table pii.signup_sign_requests add column if not exists carried_to uuid;
alter table pii.signup_sign_requests enable row level security;
revoke all on pii.signup_sign_requests from public, anon, authenticated;

alter table pii.phone_verifications
  add column if not exists method text not null default 'code' check (method in ('code', 'sign')),
  add column if not exists sign_request_id uuid references pii.signup_sign_requests (id) on delete set null,
  add column if not exists gateway_down_at timestamptz;

alter table pii.signature_links add column if not exists signup_linked_at timestamptz;

-- ── 3) 서명 요청 ───────────────────────────────────────

create or replace function public.start_signup_sign(
  p_ticket uuid, p_prev_ticket uuid, p_creator_id uuid, p_phone_hash text, p_ip_hash text, p_envelope jsonb, p_method text
)
returns table (result text, request_id uuid, payload text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_payload text;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if p_ticket is null or p_creator_id is null or not pii.is_sealed_envelope(p_envelope)
     or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception '가입 서명 요청 꼴이 아니다' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('kakao', 'fake')
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  -- 브라우저가 정한 크리에이터 ID 가 이미 있는 크리에이터 행이면 받지 않는다(새 값으로 다시 봉인)
  if exists (select 1 from public.creators c where c.id = p_creator_id) then
    return query select 'creator_taken'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  -- 잠금 순서는 언제나 번호 → 접속 주소(인증번호 요청과 같은 순서)
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.signup_sign:' || p_phone_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.signup_sign_ip:' || p_ip_hash, 0));
  -- INV-U19 ④: 번호당 1시간 5번·하루 5번, 접속 주소 하루 20번(요청마다 그 번호로 카카오톡이 간다)
  if (select count(*) from pii.signup_sign_requests r where r.phone_hash = p_phone_hash and r.requested_at > v_now - interval '1 hour') >= 5 then
    return query select 'too_many'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if (select count(*) from pii.signup_sign_requests r where r.phone_hash = p_phone_hash and r.requested_at >= v_day_start) >= 5
     or (select count(*) from pii.signup_sign_requests r where r.ip_hash = p_ip_hash and r.requested_at >= v_day_start) >= 20 then
    return query select 'too_many_day'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  -- 「다시 보내기」: 앞 번호표의 기다리는 요청을 끝낸다(봉투도 지운다)
  if p_prev_ticket is not null then
    update pii.signup_sign_requests r set state = 'superseded', finished_at = v_now, envelope = null
     where r.ticket = p_prev_ticket and r.state = 'pending';
  end if;

  v_payload := 'fankkuk-signature-link:v1|req=' || v_id::text
               || '|at=' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into pii.signup_sign_requests (id, ticket, creator_id, phone_hash, ip_hash, envelope, payload, method, requested_at, expires_at)
  values (v_id, p_ticket, p_creator_id, p_phone_hash, p_ip_hash, p_envelope, v_payload, p_method, v_now, v_now + interval '5 minutes');
  return query select 'started'::text, v_id, v_payload, v_now + interval '5 minutes';
end;
$fn$;

create or replace function public.record_signup_sign_tx(p_ticket uuid, p_request_id uuid, p_tx_id text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_tx_id is null or p_tx_id !~ '^[0-9A-Za-z_.:-]{1,128}$' then
    raise exception '거래 ID 꼴이 아니다' using errcode = '22023';
  end if;
  update pii.signup_sign_requests r set gateway_tx_id = p_tx_id
   where r.id = p_request_id and r.ticket = p_ticket and r.state = 'pending' and r.gateway_tx_id is null;
  return case when found then 'recorded' else 'not_found' end;
end;
$fn$;

-- 기다리는 요청을 끝낸다 — failed(창구가 받지 않음 등) · down(창구 장애, INV-U20). 봉투는 같은 처리에서 지운다.
create or replace function public.close_signup_sign(p_ticket uuid, p_request_id uuid, p_outcome text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_outcome is null or p_outcome not in ('failed', 'down') then
    raise exception '끝내는 까닭은 failed·down 둘뿐이다' using errcode = '22023';
  end if;
  update pii.signup_sign_requests r set state = p_outcome, finished_at = now(), envelope = null
   where r.id = p_request_id and r.ticket = p_ticket and r.state = 'pending';
  return case when found then 'closed' else 'not_found' end;
end;
$fn$;

create or replace function public.signup_sign_request(p_ticket uuid, p_request_id uuid)
returns table (state text, payload text, gateway_tx_id text)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.signup_sign_requests%rowtype;
begin
  select * into v_req from pii.signup_sign_requests r where r.id = p_request_id and r.ticket = p_ticket for update;
  if not found then
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;
  if v_req.state = 'pending' and v_req.expires_at <= now() then
    update pii.signup_sign_requests r set state = 'expired', finished_at = now(), envelope = null where r.id = v_req.id;
    return query select 'expired'::text, null::text, null::text;
    return;
  end if;
  if v_req.state = 'pending' then
    return query select 'pending'::text, v_req.payload, v_req.gateway_tx_id;
    return;
  end if;
  return query select (case v_req.state when 'used' then 'verified' when 'superseded' then 'failed' else v_req.state end)::text, null::text, null::text;
end;
$fn$;

-- 서명 결과를 적는다. signed 는 서명된 원문이 저장 원문과 같고 기한 안이고 방식이 요청 때 방식일 때만 받는다(INV-S2).
-- 검증되면 그 번호표로 확인 줄을 만든다(INV-U1 ②) — 이미 가입된 번호면 만들지 않고 exists(INV-U3·U11).
create or replace function public.settle_signup_sign(p_ticket uuid, p_request_id uuid, p_outcome text, p_signed_content text, p_method text)
returns table (result text)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.signup_sign_requests%rowtype;
  v_now timestamptz := now();
begin
  if p_outcome is null or p_outcome not in ('signed', 'failed') then
    raise exception '결과는 signed·failed 둘뿐이다' using errcode = '22023';
  end if;
  select * into v_req from pii.signup_sign_requests r where r.id = p_request_id and r.ticket = p_ticket for update;
  if not found then
    return query select 'not_found'::text;
    return;
  end if;
  if v_req.state <> 'pending' then
    return query select (case v_req.state when 'used' then 'verified' when 'verified' then 'verified' when 'exists' then 'exists'
                                          when 'expired' then 'expired' else 'failed' end)::text;
    return;
  end if;
  if v_req.expires_at <= v_now then
    update pii.signup_sign_requests r set state = 'expired', finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select 'expired'::text;
    return;
  end if;
  if p_outcome = 'signed' and (p_method is distinct from v_req.method
     or (v_req.method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures'))) then
    return query select 'method_refused'::text;
    return;
  end if;
  if p_outcome <> 'signed' or p_signed_content is null or p_signed_content <> v_req.payload then
    update pii.signup_sign_requests r set state = 'failed', finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select 'failed'::text;
    return;
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone_hash = v_req.phone_hash) then
    update pii.signup_sign_requests r set state = 'exists', finished_at = v_now, envelope = null where r.id = v_req.id;
    return query select 'exists'::text;
    return;
  end if;
  update pii.signup_sign_requests r set state = 'verified', finished_at = v_now where r.id = v_req.id;
  insert into pii.phone_verifications (id, phone_hash, verified_at, method, sign_request_id)
  values (v_req.ticket, v_req.phone_hash, v_now, 'sign', v_req.id);
  return query select 'verified'::text;
end;
$fn$;

-- ── 4) 장애 대비 길 · 확인 방법 ────────────────────────────

create or replace function public.carry_signup_sign_down(p_from uuid, p_to uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- 장애 기록은 한 번만 옮긴다 — 옮긴 요청에 carried_to 를 적고, 이미 옮긴 요청은 다시 옮기지 않는다(줄을 잠가 동시에 와도 하나만)
  update pii.signup_sign_requests r set carried_to = p_to
    from pii.phone_verifications v
   where r.ticket = p_from and r.state = 'down' and r.carried_to is null and r.finished_at > now() - interval '10 minutes'
     and v.id = p_to and v.method = 'code' and v.verified_at is null and v.phone_hash = r.phone_hash;
  if not found then
    return false;
  end if;
  update pii.phone_verifications v set gateway_down_at = r.finished_at
    from pii.signup_sign_requests r
   where v.id = p_to and r.ticket = p_from and r.carried_to = p_to;
  return true;
end;
$fn$;

create or replace function public.signup_verification_kind(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $fn$
  select case
           when v.method = 'sign' then 'sign'
           when v.gateway_down_at is not null and v.gateway_down_at > now() - interval '10 minutes' then 'code_down'
           else 'code'
         end
    from pii.phone_verifications v where v.id = p_id;
$fn$;

-- ── 5) 계정 만들기 ─────────────────────────────────────

create or replace function public.create_account(
  p_user_id uuid,
  p_login_id text,
  p_role text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ver pii.phone_verifications%rowtype;
  v_keys text[];
  v_constraint text;
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_problem text;
  v_hash text;
  v_sealed text;
  v_prefix text;
  v_last4 text;
begin
  if p_user_id is null or p_login_id is null or p_login_id !~ '^[a-z0-9_]{4,20}$' then
    raise exception '아이디 꼴이 아니다' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('fan', 'creator') then
    raise exception '역할은 팬·크리에이터 둘 중 하나다' using errcode = '22023';
  end if;
  if p_email is null or char_length(p_email) > 254 or p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' then
    raise exception '이메일 꼴이 아니다' using errcode = '22023';
  end if;
  -- INV-U18: p_phone 은 번호 묶음(해시·암호문·앞 3자리·뒤 4자리) — 숫자 번호는 받지 않는다
  select b.b_hash, b.b_sealed, b.b_prefix, b.b_last4 into v_hash, v_sealed, v_prefix, v_last4 from pii.phone_bundle(p_phone) b;
  if p_terms is null or jsonb_typeof(p_terms) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_terms) t
    where jsonb_typeof(t) <> 'object'
       or coalesce(t ->> 'key', '') not in ('age14', 'service', 'privacy', 'news')
       or char_length(coalesce(t ->> 'version', '')) not between 1 and 20
  ) then
    raise exception '약관 동의 꼴이 아니다' using errcode = '22023';
  end if;
  select array_agg(t ->> 'key') into v_keys from jsonb_array_elements(p_terms) t;
  -- INV-U16: 만 14세 확인도 필수 — 없으면 계정을 만들지 않는다
  if not (v_keys @> array['age14', 'service', 'privacy']) then
    raise exception '필수 동의(만 14세 확인·약관)가 빠졌다' using errcode = '22023';
  end if;
  -- INV-U13: 닉네임 검사(태그·팬덤 이름과 같은 필터). 어느 금칙어에 걸렸는지는 알리지 않는다
  v_problem := public.nickname_problem(v_nickname);
  if v_problem = 'banned' then
    raise exception '닉네임에 쓸 수 없는 말이 들어 있다' using errcode = 'FKU05';
  elsif v_problem = 'contact' then
    raise exception '닉네임에 전화번호·이메일·인터넷 주소는 쓸 수 없다' using errcode = 'FKU06';
  elsif v_problem = 'symbols' then
    raise exception '닉네임에 글자나 숫자가 하나는 있어야 한다' using errcode = 'FKU07';
  elsif v_problem is not null then
    raise exception '닉네임은 1~12자, 보이지 않는 글자 없이' using errcode = '22023';
  end if;

  select * into v_ver from pii.phone_verifications v where v.id = p_verification_id for update;
  if not found or v_ver.verified_at is null or v_ver.used_at is not null
     or v_ver.verified_at <= now() - interval '10 minutes' or v_ver.phone_hash is distinct from v_hash then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  -- INV-U1·U19: 카카오 서명 확인은 크리에이터 가입에만 쓴다(연결 기록과 한 처리로 만들어진다)
  if v_ver.method = 'sign' and p_role <> 'creator' then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  -- INV-U1·U20: 크리에이터의 인증번호 확인은 「창구 장애 확인」이 10분 안일 때만
  if p_role = 'creator' and v_ver.method = 'code'
     and (v_ver.gateway_down_at is null or v_ver.gateway_down_at <= now() - interval '10 minutes') then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone_hash = v_hash) then
    raise exception '이미 가입된 번호다' using errcode = 'FKU02';
  end if;

  begin
    insert into public.profiles (id, login_id, nickname, role)
    values (p_user_id, p_login_id, v_nickname, p_role::public.user_role);
    insert into pii.account_contacts (account_id, phone_sealed, phone_hash, phone_prefix, phone_last4, pending_email)
    values (p_user_id, v_sealed, v_hash, v_prefix, v_last4, p_email);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'account_contacts_phone_hash_unique' then
      raise exception '이미 가입된 번호다' using errcode = 'FKU02';
    elsif v_constraint = 'profiles_login_id_key' then
      raise exception '이미 쓰는 아이디다' using errcode = 'FKU03';
    elsif v_constraint = 'profiles_nickname_key' then
      raise exception '이미 쓰는 닉네임이다' using errcode = 'FKU04';
    end if;
    raise;
  end;

  insert into pii.email_verifications (account_id, email, token_hash, expires_at)
  values (p_user_id, p_email, extensions.gen_random_bytes(32), now() + interval '24 hours');

  insert into public.terms_consents (account_id, term_key, version)
  select distinct on (t ->> 'key') p_user_id, t ->> 'key', t ->> 'version' from jsonb_array_elements(p_terms) t;

  update pii.phone_verifications set used_at = now() where id = v_ver.id;
end;
$fn$;

-- 카카오 서명으로 확인된 번호표면 그 요청의 크리에이터 ID, 아니면 null. create_creator_account(마이그레이션)만 부른다.
create or replace function pii.signup_sign_creator_id(p_verification_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $fn$
  select r.creator_id
    from pii.phone_verifications v
    join pii.signup_sign_requests r on r.id = v.sign_request_id
   where v.id = p_verification_id and v.method = 'sign';
$fn$;

-- INV-U19 ①·INV-S16 (S16e): 서명 길이면 그 요청의 봉투를 승인 서명 연결로 옮긴다. 인증번호 길이면 아무것도 하지 않는다(연결 전으로 시작, INV-U20).
create or replace function pii.signup_sign_link(p_creator_id uuid, p_verification_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ver pii.phone_verifications%rowtype;
  v_req pii.signup_sign_requests%rowtype;
  v_now timestamptz := now();
begin
  select * into v_ver from pii.phone_verifications v where v.id = p_verification_id;
  if not found or v_ver.method <> 'sign' then
    return;
  end if;
  select * into v_req from pii.signup_sign_requests r where r.id = v_ver.sign_request_id for update;
  if not found or v_req.state <> 'verified' or v_req.envelope is null or v_req.creator_id <> p_creator_id then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  insert into pii.signature_links (creator_id, envelope, method, linked_at, signup_linked_at)
  values (p_creator_id, v_req.envelope, v_req.method, v_now, v_now);
  update pii.signup_sign_requests r set state = 'used', envelope = null where r.id = v_req.id;
end;
$fn$;

-- 가입이 「이미 가입된 번호」로 끝났을 때 — 검증된 요청의 봉투를 지운다(INV-U19 ⑤ 정함)
create or replace function public.discard_signup_sign(p_verification_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  update pii.signup_sign_requests r set state = 'exists', envelope = null
   where r.ticket = p_verification_id and r.state = 'verified';
$fn$;

-- ── 6) 인증번호 요청 한도 · 번호 바꾸기 ──────────────────────

create or replace function public.request_phone_code(p_id uuid, p_phone text, p_ip_hash text, p_code_hash text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  -- p_phone 은 번호 해시다(INV-U18). 하루 = 한국 시간 0시부터
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if p_id is null or p_phone is null or p_phone !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception '인증번호 요청 꼴이 아니다' using errcode = '22023';
  end if;
  -- 잠금 순서는 언제나 번호 → 접속 주소(서로 기다리며 멈추지 않게)
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.phone_verification:' || p_phone, 0));
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.phone_verification_ip:' || p_ip_hash, 0));

  -- 0037: 카카오 서명 확인 줄(method sign)은 인증번호 한도에 세지 않는다(INV-U10 — 가입 서명 요청 한도는 따로, INV-U19 ④)
  if exists (
    select 1 from pii.phone_verifications v
    where v.phone_hash = p_phone and v.method = 'code' and v.requested_at > now() - interval '1 minute'
  ) then
    raise exception '같은 번호는 1분에 한 번' using errcode = 'FK428';
  end if;
  if (select count(*) from pii.phone_verifications v where v.phone_hash = p_phone and v.method = 'code' and v.requested_at >= v_day_start) >= 5 then
    raise exception '같은 번호 하루 다섯 번' using errcode = 'FK429';
  end if;
  if (select count(*) from pii.phone_verifications v where v.ip_hash = p_ip_hash and v.method = 'code' and v.requested_at >= v_day_start) >= 20 then
    raise exception '같은 접속 주소 하루 스무 번' using errcode = 'FK429';
  end if;

  -- 같은 번호로 새로 받으면 아직 맞히지 않은 앞 인증번호는 버린다(INV-U15)
  update pii.phone_verifications v set discarded_at = now(), code_hash = null
   where v.phone_hash = p_phone and v.verified_at is null and v.discarded_at is null;

  insert into pii.phone_verifications (id, phone_hash, code_hash, expires_at, ip_hash)
  values (p_id, p_phone, p_code_hash, now() + interval '3 minutes', p_ip_hash);
end;
$fn$;

create or replace function public.change_my_phone(p_account_id uuid, p_phone text, p_verification_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ver pii.phone_verifications%rowtype;
  v_constraint text;
  v_hash text;
  v_sealed text;
  v_prefix text;
  v_last4 text;
begin
  if p_account_id is null or not exists (select 1 from public.profiles p where p.id = p_account_id) then
    raise exception '계정이 없다' using errcode = '42501';
  end if;
  -- INV-U18: p_phone 은 번호 묶음
  select b.b_hash, b.b_sealed, b.b_prefix, b.b_last4 into v_hash, v_sealed, v_prefix, v_last4 from pii.phone_bundle(p_phone) b;
  if exists (select 1 from pii.account_contacts c where c.account_id = p_account_id and c.phone_hash = v_hash) then
    raise exception '지금 번호와 같다' using errcode = 'FKU03';
  end if;

  select * into v_ver from pii.phone_verifications v where v.id = p_verification_id for update;
  if not found or v_ver.verified_at is null or v_ver.used_at is not null
     or v_ver.verified_at <= now() - interval '10 minutes' or v_ver.phone_hash is distinct from v_hash then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone_hash = v_hash and c.account_id <> p_account_id) then
    raise exception '이미 가입된 번호다' using errcode = 'FKU02';
  end if;

  begin
    insert into pii.account_contacts (account_id, phone_sealed, phone_hash, phone_prefix, phone_last4)
    values (p_account_id, v_sealed, v_hash, v_prefix, v_last4)
    on conflict (account_id) do update
      set phone_sealed = excluded.phone_sealed, phone_hash = excluded.phone_hash,
          phone_prefix = excluded.phone_prefix, phone_last4 = excluded.phone_last4, updated_at = now();
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'account_contacts_phone_hash_unique' then
      raise exception '이미 가입된 번호다' using errcode = 'FKU02';
    end if;
    raise;
  end;

  update pii.phone_verifications set used_at = now() where id = v_ver.id;
  insert into public.phone_change_events (account_id) values (p_account_id);
  -- INV-U12 정함: 가입 3단계 서명으로 연결된 크리에이터(그 뒤 설정에서 다시 연결하지 않음)는 번호를 바꾸면 연결이 풀린다 — 새 번호로 다시 연결한다
  delete from pii.signature_links l
   using public.creators c
   where c.profile_id = p_account_id and l.creator_id = c.id and l.signup_linked_at = l.linked_at;
  return 'changed';
end;
$fn$;

-- ── 7) 정리 ─────────────────────────────────────────

create or replace function public.purge_signup_sign_requests()
returns void
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- 기한이 지난 기다림 → expired(봉투 지움). 검증됐지만 10분 안에 가입하지 않은 요청의 봉투도 지운다(INV-U19 ⑤ 정함)
  update pii.signup_sign_requests r set state = 'expired', finished_at = now(), envelope = null
   where r.state = 'pending' and r.expires_at <= now();
  update pii.signup_sign_requests r set envelope = null
   where r.state = 'verified' and r.envelope is not null and r.finished_at <= now() - interval '10 minutes';
  -- 한도는 하루치만 센다 — 이틀 지난 줄은 지운다(확인 줄의 요청 칸은 비워진다)
  delete from pii.signup_sign_requests r where r.requested_at < now() - interval '2 days' and r.state <> 'pending';
end;
$fn$;

revoke all on function public.start_signup_sign(uuid, uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.record_signup_sign_tx(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.close_signup_sign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.signup_sign_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_signup_sign(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.carry_signup_sign_down(uuid, uuid) from public, anon, authenticated;
revoke all on function public.signup_verification_kind(uuid) from public, anon, authenticated;
revoke all on function public.discard_signup_sign(uuid) from public, anon, authenticated;
revoke all on function public.purge_signup_sign_requests() from public, anon, authenticated;
revoke all on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.request_phone_code(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.change_my_phone(uuid, text, uuid) from public, anon, authenticated;
revoke all on function pii.signup_sign_creator_id(uuid) from public, anon, authenticated, service_role;
revoke all on function pii.signup_sign_link(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.start_signup_sign(uuid, uuid, uuid, text, text, jsonb, text) to service_role;
grant execute on function public.record_signup_sign_tx(uuid, uuid, text) to service_role;
grant execute on function public.close_signup_sign(uuid, uuid, text) to service_role;
grant execute on function public.signup_sign_request(uuid, uuid) to service_role;
grant execute on function public.settle_signup_sign(uuid, uuid, text, text, text) to service_role;
grant execute on function public.carry_signup_sign_down(uuid, uuid) to service_role;
grant execute on function public.signup_verification_kind(uuid) to service_role;
grant execute on function public.discard_signup_sign(uuid) to service_role;
grant execute on function public.purge_signup_sign_requests() to service_role;
grant execute on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) to service_role;
grant execute on function public.request_phone_code(uuid, text, text, text) to service_role;
grant execute on function public.change_my_phone(uuid, text, uuid) to service_role;

-- 10분마다(같은 이름으로 다시 등록하면 덮어쓴다)
select cron.schedule('fankkuk-signup-sign', '*/10 * * * *', 'select public.purge_signup_sign_requests()');

notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인 — 모두 t 여야 한다
select to_regclass('pii.signup_sign_requests') is not null as sign_requests_table;
select exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'phone_verifications' and column_name = 'gateway_down_at') as verifications_down_column;
select not has_function_privilege('authenticated', 'public.start_signup_sign(uuid,uuid,uuid,text,text,jsonb,text)', 'execute') as start_not_callable_by_login;
select not has_function_privilege('anon', 'public.settle_signup_sign(uuid,uuid,text,text,text)', 'execute') as settle_not_callable_by_anon;
