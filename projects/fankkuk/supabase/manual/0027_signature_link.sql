-- 승인 서명 연결하기 (2026-10-29 「가입 흐름 확정」 — 크리에이터 가입 5단계·상세 설정).
-- 스펙: docs/specs/approval-signature.md INV-S16 (S16·S16b·S16c·S16d), docs/specs/creator-link.md INV-E15 (S15)
-- 사람이 직접 적용한다(개인정보 구역 pii 에 새 표 둘). 0005(pii.is_sealed_envelope)·0025(탈퇴)·0026(문자 인증번호) 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0027.sh
-- 확인: npx vitest run --config vitest.integration.config.mts signature-link-db
--
-- 무엇을 바꾸나
--   1) pii.signature_links — 크리에이터 한 명에 줄 하나. 연결된 이름·생년월일·휴대폰 번호의 봉투(브라우저가 공개키로 봉인한 암호문)·연결 방식(kakao|fake)·연결한 때.
--      평문 칸은 없다. 앱 서버·DB 는 봉투를 풀 수 없고, 서명 게이트웨이만 KMS 로 푼다(INV-S16).
--   2) pii.signature_link_requests — 연결 요청 하나에 줄 하나. 그 요청의 봉투·고정 원문(연결 요청 ID + 요청 시각)·기한(요청 + 10분)·상태.
--      시험 서명이 검증되면 같은 처리에서 요청 줄을 「연결됨」으로 바꾸고 그 봉투를 1) 에 옮긴다. 다시 연결해도 새 서명이 검증될 때까지 전 연결은 그대로다.
--   3) start_signature_link(사람, 봉투, 방식, 접속 주소 해시) — 크리에이터 본인 줄을 잠그고, 앞의 대기 요청을 버리고, 새 요청을 만든다.
--      한도: 크리에이터마다 한 시간 다섯 번(too_many) · 하루 다섯 번 · 같은 접속 주소 하루 스무 번(too_many_day). 하루는 한국 시간 0시부터.
--      접속 주소는 가입 인증번호(signup INV-U10)와 같은 비밀 값 섞은 해시로만 받는다.
--      signature_link_request(사람, 요청) — 대기 중이면 원문을 돌려준다(기한이 지났으면 실패로 적고 expired).
--      settle_signature_link(사람, 요청, 결과, 서명된 원문, 방식) — 원문이 저장한 원문과 같고 기한 안이고 방식이 이 DB 에서 받는 것일 때만 「연결됨」.
--      셋 다 앱 서버(서비스 키) 전용. 누구의 요청인지는 앱 서버가 세션에서 확인한 사람 ID 로 정한다.
--   4) my_signature_link() — 로그인한 크리에이터 본인의 연결 여부와 연결한 날만. 봉투·방식은 돌려주지 않는다.
--      my_pending_signature_link() — 로그인한 크리에이터 본인의 기한 안 대기 요청 하나(요청 ID·기한)만. 화면을 떠났다 돌아와도 이어 묻게.
--      creator_signature_linked(크리에이터) — 공개 읽기. 참/거짓 하나만(creator-link INV-E15).
--   5) 주문을 넣는 순간 받는 크리에이터가 연결 전이면 거부한다(트리거, 오류 FKS16). 탈퇴한 크리에이터는 탈퇴 거부(INV-S15)가 먼저 답하게 비켜 간다.
--      이미 있는 주문·승인 요청은 건드리지 않는다.
--   6) 크리에이터가 탈퇴로 표시되면 그 크리에이터의 연결 봉투와 요청 줄을 같은 처리에서 지운다(INV-S15 — 이름이 든 값을 남기지 않는다).
--   7) 가짜 서명 허용 줄(allow_fake_signatures — 로컬 seed 만 넣는다)이 있는 DB 에서만: 시드 크리에이터를 방식 fake 로 연결된 상태로 넣는다.
--      봉투는 자리 표시 값이다(iv = 「seed-sig-lnk」). 운영 DB 에는 그 줄이 없어 아무것도 넣지 않는다 — 운영의 기존 크리에이터는 모두 연결 전으로 시작한다.
--
-- 앱과 한쪽만 적용된 상태
--   이 파일만(앱은 옛 코드): 운영의 기존 크리에이터가 모두 연결 전이라 새 주문이 전부 거부된다(옛 앱은 FKS16 을 몰라 「결제를 시작하지 못함」류로 보인다).
--     연결 화면이 없으니 풀 길도 없다 — 앱과 같이 올린다.
--   앱만(이 파일 없음): 링크 페이지는 연결 여부를 읽지 못해 「승인 수단 등록 전」으로 보이고(닫힌 쪽으로 실패), 연결 요청은 함수를 찾지 못해 실패한다.
--     주문 생성 함수는 그대로라 주문은 들어간다 — 화면이 버튼을 숨길 뿐이다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'check_phone_code') then
    raise exception '문자 인증번호 확인 함수가 없다 — 0026_phone_sms_code.sql 을 먼저 적용한다';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'pii' and p.proname = 'is_sealed_envelope') then
    raise exception '봉인 형식 검사 함수(pii.is_sealed_envelope)가 없다 — 0005_revgift_address.sql 을 먼저 적용한다';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'pii' and p.proname = 'withdraw_account') then
    raise exception '탈퇴 처리 함수가 없다 — 0025_account_withdrawal.sql 을 먼저 적용한다';
  end if;
end $$;

-- ── 1)·2) 표 ─────────────────────────────────────────────

create table if not exists pii.signature_links (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  method text not null check (method in ('kakao', 'fake')),
  linked_at timestamptz not null default now()
);
alter table pii.signature_links enable row level security;
revoke all on pii.signature_links from public, anon, authenticated, service_role;

create table if not exists pii.signature_link_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  -- 고정 원문: 연결 요청 ID + 요청 시각뿐 — 이름·번호는 원문에 넣지 않는다(서명 대상 지정은 게이트웨이가 봉투로 한다)
  payload text not null check (payload ~ '^fankkuk-signature-link:v1\|req=[0-9a-f-]{36}\|at=[0-9T:.Z-]+$'),
  method text not null check (method in ('kakao', 'fake')),
  -- 요청한 접속 주소의 해시(원문 아님) — 같은 주소 하루 한도
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'linked', 'failed', 'superseded')),
  finished_at timestamptz,
  check (expires_at = requested_at + interval '10 minutes'),
  check ((state = 'pending') = (finished_at is null))
);
create index if not exists signature_link_requests_creator on pii.signature_link_requests (creator_id, requested_at);
create index if not exists signature_link_requests_ip on pii.signature_link_requests (ip_hash, requested_at);
alter table pii.signature_link_requests enable row level security;
revoke all on pii.signature_link_requests from public, anon, authenticated, service_role;

-- ── 3) 연결 요청·결과(앱 서버 전용) ──────────────────────

-- 로그인한 크리에이터 본인 줄을 잠근 뒤 만든다 — 같은 크리에이터의 요청 둘이 겹쳐도 대기 요청은 마지막 하나뿐이다.
-- result: started · not_creator(크리에이터가 아님·탈퇴) · method_refused(이 DB 가 받지 않는 방식)
--         · too_many(크리에이터 한 시간 다섯 번) · too_many_day(크리에이터 하루 다섯 번 · 같은 접속 주소 하루 스무 번)
create or replace function public.start_signature_link(p_actor_id uuid, p_envelope jsonb, p_method text, p_ip_hash text)
returns table (result text, request_id uuid, payload text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_creator_id uuid;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_payload text;
  -- 하루 = 한국 시간 0시부터(가입 인증번호와 같다)
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
    return query select 'not_creator'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  -- 가짜(시험) 서명은 허용 줄이 있는 DB(로컬·시험 사이트)에서만(INV-S11 과 같은 줄)
  if p_method is null or p_method not in ('kakao', 'fake')
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  -- 요청마다 그 번호의 카카오톡으로 서명 요청이 간다 — 남의 번호로 요청을 퍼붓지 못하게 크리에이터·접속 주소마다 센다.
  -- 크리에이터는 위에서 줄을 잠갔다. 접속 주소는 여기서 잠근다(잠금 순서: 크리에이터 → 접속 주소) — 동시에 온 요청도 차례로 센다.
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.signature_link_ip:' || p_ip_hash, 0));
  if (select count(*) from pii.signature_link_requests r
      where r.creator_id = v_creator_id and r.requested_at > v_now - interval '1 hour') >= 5 then
    return query select 'too_many'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if (select count(*) from pii.signature_link_requests r
      where r.creator_id = v_creator_id and r.requested_at >= v_day_start) >= 5
     or (select count(*) from pii.signature_link_requests r
         where r.ip_hash = p_ip_hash and r.requested_at >= v_day_start) >= 20 then
    return query select 'too_many_day'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  update pii.signature_link_requests r set state = 'superseded', finished_at = v_now
   where r.creator_id = v_creator_id and r.state = 'pending';

  v_payload := 'fankkuk-signature-link:v1|req=' || v_id::text
               || '|at=' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into pii.signature_link_requests (id, creator_id, envelope, payload, method, ip_hash, requested_at, expires_at)
  values (v_id, v_creator_id, p_envelope, v_payload, p_method, p_ip_hash, v_now, v_now + interval '10 minutes');

  return query select 'started'::text, v_id, v_payload, v_now + interval '10 minutes';
end;
$fn$;

-- 그 사람의 요청 하나의 지금 상태. 대기 중이면 원문(서명 창구에 넘길 값)을 돌려준다. 기한이 지난 대기 요청은 여기서 실패로 적는다.
-- state: pending · linked · failed(실패·다른 요청으로 바뀜) · expired · not_found
create or replace function public.signature_link_request(p_actor_id uuid, p_request_id uuid)
returns table (state text, payload text, method text)
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
    return query select 'not_found'::text, null::text, null::text;
    return;
  end if;
  if v_req.state = 'linked' then
    return query select 'linked'::text, null::text, null::text;
    return;
  end if;
  if v_req.state <> 'pending' then
    return query select 'failed'::text, null::text, null::text;
    return;
  end if;
  if now() > v_req.expires_at then
    update pii.signature_link_requests r set state = 'failed', finished_at = now() where r.id = v_req.id;
    return query select 'expired'::text, null::text, null::text;
    return;
  end if;
  return query select 'pending'::text, v_req.payload, v_req.method;
end;
$fn$;

-- 서명 창구의 결과를 적는다. 연결 표시는 이 함수의 signed 갈래 하나뿐이다(INV-S16 — 브라우저가 보낸 「연결됨」이 들어올 자리가 없다).
-- p_outcome: signed(검증된 서명 — 서명된 원문이 있다) · failed(창구가 거절·기한 지남·서명 오류로 답함)
-- result: linked · failed · expired · not_found · method_refused
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
  -- 같은 결과가 두 번 와도 처음 결과 그대로(아무것도 바꾸지 않는다)
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
  -- 방식은 요청을 만들 때와 같아야 하고, 가짜는 허용 줄이 있는 DB 에서만
  if p_method is distinct from v_req.method
     or (p_method = 'fake' and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures')) then
    return query select 'method_refused'::text, null::timestamptz;
    return;
  end if;
  -- INV-S2 와 같은 대조: 서명된 원문이 저장한 원문과 같아야 한다
  if p_signed_content is distinct from v_req.payload then
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

-- ── 4) 읽기 ──────────────────────────────────────────────

-- 로그인 토큰의 크리에이터 줄 하나만. 연결 여부와 연결한 때만 — 이름·생년월일·번호(암호문 포함)와 방식은 내보내지 않는다.
create or replace function public.my_signature_link()
returns table (linked boolean, linked_at timestamptz)
language sql stable security definer set search_path = ''
as $fn$
  select l.creator_id is not null, l.linked_at
  from public.creators c
  left join pii.signature_links l on l.creator_id = c.id
  where auth.uid() is not null and c.profile_id = auth.uid();
$fn$;

-- 로그인 토큰의 크리에이터 본인의 대기 요청 중 기한 안의 가장 새 것 하나 — 요청 ID 와 기한만(원문·봉투·접속 주소는 내보내지 않는다).
-- 화면을 떠났다 돌아온 크리에이터가 같은 요청의 결과를 이어 묻는 데만 쓴다. 결과를 적는 함수는 여전히 앱 서버 전용이다.
create or replace function public.my_pending_signature_link()
returns table (request_id uuid, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $fn$
  select r.id, r.expires_at
  from pii.signature_link_requests r
  join public.creators c on c.id = r.creator_id
  where auth.uid() is not null and c.profile_id = auth.uid() and c.withdrawn_at is null
    and r.state = 'pending' and r.expires_at > now()
  order by r.requested_at desc
  limit 1;
$fn$;

-- 공개 읽기 — 링크 페이지가 「승인 수단 등록 전」을 정한다(creator-link INV-E15). 참/거짓 하나만.
create or replace function public.creator_signature_linked(p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from pii.signature_links l where l.creator_id = p_creator);
$fn$;

-- ── 5) 연결 전 크리에이터 앞 주문 거부 ───────────────────

create or replace function public.reject_for_unsigned()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  -- 탈퇴한 크리에이터는 탈퇴 거부(orders_reject_withdrawn, INV-S15)가 답한다 — 탈퇴하면 연결 줄도 지워지므로 여기서 먼저 막으면 이유가 바뀐다
  if exists (select 1 from public.creators c where c.id = new.creator_id and c.withdrawn_at is not null) then
    return new;
  end if;
  if not exists (select 1 from pii.signature_links l where l.creator_id = new.creator_id) then
    raise exception '승인 서명 연결 전인 크리에이터' using errcode = 'FKS16', hint = 'unsigned';
  end if;
  return new;
end;
$fn$;

drop trigger if exists orders_reject_unsigned on public.orders;
create trigger orders_reject_unsigned before insert on public.orders for each row execute function public.reject_for_unsigned();

-- ── 6) 탈퇴하면 연결 정보를 지운다 ────────────────────────

create or replace function public.drop_signature_link_on_withdraw()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  delete from pii.signature_link_requests r where r.creator_id = new.id;
  delete from pii.signature_links l where l.creator_id = new.id;
  return null;
end;
$fn$;

drop trigger if exists creators_drop_signature_link on public.creators;
create trigger creators_drop_signature_link after update of withdrawn_at on public.creators
for each row when (new.withdrawn_at is not null and old.withdrawn_at is null)
execute function public.drop_signature_link_on_withdraw();

-- ── 7) 로컬 시드 크리에이터 — 시험 서명(fake)으로 연결된 상태 ──

do $$
begin
  if exists (select 1 from public.local_dev_flags where flag = 'allow_fake_signatures') then
    insert into pii.signature_links (creator_id, envelope, method, linked_at)
    select c.id,
           jsonb_build_object(
             'v', 1,
             'alg', 'RSA-OAEP-256+A256GCM',
             'wrappedKey', replace(encode(extensions.gen_random_bytes(256), 'base64'), E'\n', ''),
             'iv', encode(convert_to('seed-sig-lnk', 'UTF8'), 'base64'),
             'ciphertext', replace(encode(extensions.gen_random_bytes(40), 'base64'), E'\n', '')
           ),
           'fake',
           now()
    from public.creators c
    where c.id::text like '00000000-0000-4000-b000-0000000000%' and c.withdrawn_at is null
    on conflict (creator_id) do nothing;
  end if;
end $$;

-- ── 권한 ─────────────────────────────────────────────────

revoke all on function public.start_signature_link(uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.signature_link_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_signature_link(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.start_signature_link(uuid, jsonb, text, text) to service_role;
grant execute on function public.signature_link_request(uuid, uuid) to service_role;
grant execute on function public.settle_signature_link(uuid, uuid, text, text, text) to service_role;
revoke all on function public.my_signature_link() from public, anon, service_role;
grant execute on function public.my_signature_link() to authenticated;
revoke all on function public.my_pending_signature_link() from public, anon, service_role;
grant execute on function public.my_pending_signature_link() to authenticated;
revoke all on function public.creator_signature_linked(uuid) from public;
grant execute on function public.creator_signature_linked(uuid) to anon, authenticated, service_role;
revoke all on function public.reject_for_unsigned() from public, anon, authenticated, service_role;
revoke all on function public.drop_signature_link_on_withdraw() from public, anon, authenticated, service_role;

commit;
