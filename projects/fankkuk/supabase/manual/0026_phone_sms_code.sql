-- 휴대폰 번호 확인을 카카오톡 본인 확인에서 문자 인증번호로 바꾼다 (2026-10-29 「가입 흐름 확정」).
-- 스펙: docs/specs/signup.md INV-U1·U10·U12·U15·U16 (S9·S10·S10b·S15·S15b·S16)
-- 사람이 직접 적용한다(개인정보 구역 pii.phone_verifications 와 계정 만들기 함수). 0004·0013·0018 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0026.sh
-- 확인: npx vitest run --config vitest.integration.config.mts phone-code-db signup-db
--
-- 무엇을 바꾸나
--   1) pii.phone_verifications 에 칸 다섯 — code_hash(인증번호 해시, 원문 아님) · expires_at(보낸 때 + 3분) · wrong_count(틀린 횟수, 5 까지)
--      · ip_hash(요청한 접속 주소의 해시) · discarded_at(버려진 때 — 새로 받음·발송 실패).
--      인증번호 원문을 담는 칸은 없다(INV-U15). 해시는 앱 서버가 비밀 값과 번호표를 섞어 만든다.
--   2) request_phone_code(id, phone, ip_hash, code_hash) — 한도 확인·앞 인증번호 버리기·기록을 한 처리에서(INV-U10).
--      같은 번호 1분 한 번(FK428) · 같은 번호 하루 다섯 번 · 같은 접속 주소 하루 스무 번(FK429). 하루는 한국 시간 0시부터.
--      번호와 접속 주소로 잠그고 센다 — 동시에 온 요청도 차례로 지나가 한도를 넘지 못한다. 거부된 요청은 기록하지 않는다.
--   3) check_phone_code(id, code_hash) → (result, remaining) — 줄을 잠그고 만료·틀린 횟수·사용 여부를 보고 횟수를 올리는 것까지 한 처리에서.
--      result: verified · wrong(남은 횟수) · locked(다섯 번째 틀림 — 그 인증번호는 버려짐) · expired(3분 지남) · invalid(없음·버려짐·이미 맞힘·이미 씀).
--      맞히면 「확인됨」을 적고 해시를 지운다 — 같은 인증번호로 다시 확인받을 수 없다.
--   4) discard_phone_code(id) — 문자를 끝내 보내지 못한 인증번호를 버린다.
--   5) 옛 카카오 함수 넷(request_phone_verification · attach_phone_verification_tx · phone_verification_tx · complete_phone_verification)을 지운다 —
--      남아 있으면 인증번호 없이 「확인됨」을 만드는 길이 남는다.
--   6) create_account — 「만 14세 이상입니다」(약관 키 age14)가 없으면 거부(INV-U16). 나머지는 0018 그대로.
--      terms_consents 의 약관 키에 age14 를 더한다(동의 시각으로 남는다).
--   가입·번호 바꾸기가 확인 결과를 쓰는 방법(usable_phone_verification · create_account · change_my_phone — 확인된 지 10분 안, 한 번만)은 그대로다.
--
-- 앱과 한쪽만 적용된 상태
--   이 파일만(앱은 옛 코드): 옛 카카오 함수가 없어 인증 요청이 실패한다 — 가입·번호 바꾸기가 막힌다. 계정이 잘못 생기는 길은 없다.
--   앱만(이 파일 없음): request_phone_code 를 찾지 못해 인증번호 요청이 실패한다 — 가입·번호 바꾸기가 막힌다. 문자도 나가지 않는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if to_regclass('pii.phone_verifications') is null then
    raise exception '본인 확인 표(pii.phone_verifications)가 없다 — 0004_signup.sql 을 먼저 적용한다';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'create_account' and p.pronargs = 8) then
    raise exception '닉네임을 받는 create_account 가 없다 — 0018_signup_nickname.sql 을 먼저 적용한다';
  end if;
end $$;

-- ── 1) 칸 ───────────────────────────────────────────────

alter table pii.phone_verifications
  add column if not exists code_hash text check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists expires_at timestamptz,
  add column if not exists wrong_count integer not null default 0 check (wrong_count between 0 and 5),
  add column if not exists ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists discarded_at timestamptz;

create index if not exists phone_verifications_ip_requested on pii.phone_verifications (ip_hash, requested_at) where ip_hash is not null;

-- ── 5) 옛 카카오 함수 지우기 ─────────────────────────────

drop function if exists public.request_phone_verification(text);
drop function if exists public.attach_phone_verification_tx(uuid, text);
drop function if exists public.phone_verification_tx(uuid);
drop function if exists public.complete_phone_verification(uuid, text);

-- ── 2) 인증번호 받기 ─────────────────────────────────────

create or replace function public.request_phone_code(p_id uuid, p_phone text, p_ip_hash text, p_code_hash text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  -- 하루 = 한국 시간 0시부터
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if p_id is null or p_phone is null or p_phone !~ '^01[016789][0-9]{7,8}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception '인증번호 요청 꼴이 아니다' using errcode = '22023';
  end if;
  -- 잠금 순서는 언제나 번호 → 접속 주소(서로 기다리며 멈추지 않게)
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.phone_verification:' || p_phone, 0));
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.phone_verification_ip:' || p_ip_hash, 0));

  if exists (
    select 1 from pii.phone_verifications v
    where v.phone = p_phone and v.requested_at > now() - interval '1 minute'
  ) then
    raise exception '같은 번호는 1분에 한 번' using errcode = 'FK428';
  end if;
  if (select count(*) from pii.phone_verifications v where v.phone = p_phone and v.requested_at >= v_day_start) >= 5 then
    raise exception '같은 번호 하루 다섯 번' using errcode = 'FK429';
  end if;
  if (select count(*) from pii.phone_verifications v where v.ip_hash = p_ip_hash and v.requested_at >= v_day_start) >= 20 then
    raise exception '같은 접속 주소 하루 스무 번' using errcode = 'FK429';
  end if;

  -- 같은 번호로 새로 받으면 아직 맞히지 않은 앞 인증번호는 버린다(INV-U15)
  update pii.phone_verifications v set discarded_at = now(), code_hash = null
   where v.phone = p_phone and v.verified_at is null and v.discarded_at is null;

  insert into pii.phone_verifications (id, phone, code_hash, expires_at, ip_hash)
  values (p_id, p_phone, p_code_hash, now() + interval '3 minutes', p_ip_hash);
end;
$fn$;

-- ── 4) 보내지 못한 인증번호 버리기 ───────────────────────

create or replace function public.discard_phone_code(p_id uuid)
returns void
language sql security definer set search_path = ''
as $fn$
  update pii.phone_verifications v set discarded_at = now(), code_hash = null
   where v.id = p_id and v.verified_at is null and v.discarded_at is null;
$fn$;

-- ── 3) 인증번호 확인 ─────────────────────────────────────

create or replace function public.check_phone_code(p_id uuid, p_code_hash text)
returns table (result text, remaining integer)
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_row pii.phone_verifications%rowtype;
begin
  select * into v_row from pii.phone_verifications v where v.id = p_id for update;
  if not found or v_row.code_hash is null or v_row.discarded_at is not null
     or v_row.verified_at is not null or v_row.used_at is not null then
    return query select 'invalid'::text, 0;
    return;
  end if;
  -- 다섯 번째로 틀리는 순간 그 줄은 버려진다(아래) — 그 뒤의 확인은 위의 invalid 로 끝나므로 여기서 횟수를 다시 보지 않는다
  if v_row.expires_at is null or v_row.expires_at <= now() then
    return query select 'expired'::text, 5 - v_row.wrong_count;
    return;
  end if;
  if p_code_hash is not null and v_row.code_hash = p_code_hash then
    update pii.phone_verifications v set verified_at = now(), code_hash = null where v.id = p_id;
    return query select 'verified'::text, 5 - v_row.wrong_count;
    return;
  end if;
  update pii.phone_verifications v set wrong_count = v.wrong_count + 1 where v.id = p_id;
  if v_row.wrong_count + 1 >= 5 then
    -- 다섯 번째 틀림 — 이 인증번호는 버려지고 다시 받아야 한다(INV-U10)
    update pii.phone_verifications v set discarded_at = now(), code_hash = null where v.id = p_id;
    return query select 'locked'::text, 0;
  else
    return query select 'wrong'::text, 5 - (v_row.wrong_count + 1);
  end if;
end;
$fn$;

-- ── 6) 만 14세 확인 ──────────────────────────────────────

alter table public.terms_consents drop constraint if exists terms_consents_term_key_check;
alter table public.terms_consents add constraint terms_consents_term_key_check check (term_key in ('age14', 'service', 'privacy', 'news'));

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
  if p_phone is null or p_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception '휴대폰 번호 꼴이 아니다' using errcode = '22023';
  end if;
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
     or v_ver.verified_at <= now() - interval '10 minutes' or v_ver.phone <> p_phone then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone = p_phone) then
    raise exception '이미 가입된 번호다' using errcode = 'FKU02';
  end if;

  begin
    insert into public.profiles (id, login_id, nickname, role)
    values (p_user_id, p_login_id, v_nickname, p_role::public.user_role);
    insert into pii.account_contacts (account_id, phone, pending_email) values (p_user_id, p_phone, p_email);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'account_contacts_phone_unique' then
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

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.request_phone_code(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.discard_phone_code(uuid) from public, anon, authenticated;
revoke all on function public.check_phone_code(uuid, text) from public, anon, authenticated;
revoke all on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.request_phone_code(uuid, text, text, text) to service_role;
grant execute on function public.discard_phone_code(uuid) to service_role;
grant execute on function public.check_phone_code(uuid, text) to service_role;
grant execute on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) to service_role;

commit;
