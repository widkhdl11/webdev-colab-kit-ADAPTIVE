-- 0028 가입 휴대폰 번호 암호화 1차 — 새 칸·함수 교체·휴대폰 비밀번호 찾기·대표 번호 보기와 접속 기록
--
-- 사람이 직접 적용한다(개인정보 구역 pii). 0002·0004·0013·0016·0018·0025·0026 다음에 적용한다.
-- 스펙: signup INV-U18 · session-login INV-L10·L11 · admin-console INV-K14 (2026-11-06 카드 fankkuk-20261105-1-d3·d4)
--
-- 적용 순서(전체): ① 이 파일 → ② 앱 배포(키 두 개가 들어간 상태) → ③ 변환 스크립트(scripts/phone-encrypt-backfill.mjs)
--                  → ④ 0029_phone_plaintext_drop.sql. 실행 명령과 확인 쿼리는 docs/ops/phone-encryption-rollout.md.
--
-- 바뀌는 것:
--   1) pii.account_contacts 에 칸 넷 — phone_sealed(암호문) · phone_hash(같은 번호 찾기 해시) · phone_prefix(앞 3자리) · phone_last4(뒤 4자리).
--      넷은 다 있거나 다 없다. 번호 하나에 계정 하나(INV-U3)는 phone_hash 유일 색인이 지킨다. 옛 칸 phone 은 ④ 에서 지운다.
--      pii.phone_verifications 에 phone_hash. 인증번호 요청 한도는 이 해시로 센다. 옛 칸 phone 은 이제 비워 두고 ④ 에서 지운다.
--   2) 함수의 인자 이름은 그대로 두고 값의 뜻만 바꾼다 — 옛 앱이 숫자 번호를 보내면 꼴 검사에서 거부된다(섞인 상태에서 안전하게 실패).
--      · request_phone_code(id, p_phone = 번호 해시, ip 해시, 인증번호 해시)
--      · usable_phone_verification(id) → 번호 해시
--      · create_account(..., p_phone = 번호 묶음 JSON 글자, ...) · change_my_phone(계정, p_phone = 번호 묶음 JSON 글자, 확인 id)
--        번호 묶음: {"hash":"<64 hex>","sealed":"v1.…","prefix":"010","last4":"5678"} — 열쇠 넷 그대로, 다른 열쇠 없음.
--        create_creator_account 는 p_phone 을 그대로 넘기므로 고치지 않는다.
--      · is_my_current_phone(계정, p_phone = 번호 해시)
--      · my_account — 가린 번호를 앞 3자리·뒤 4자리로 만든다
--      · notification_contact — 카카오 알림은 {계정 ID, 암호문} JSON 글자를 돌려준다(앱이 그 계정 ID 로 풀어 솔라피에 넘긴다)
--      · pii.withdraw_account — 인증 기록을 해시로 지운다
--   3) 휴대폰 비밀번호 찾기(INV-L10·L11): password_reset_target(번호 해시) · issue_phone_password_reset(확인 id, 번호 해시, 표).
--      재설정 표는 옛 재설정 링크 표(public.password_resets)에 담는다 — 링크 확인·사용(password_reset_login_id · claim_password_reset)은 그대로.
--      옛 이메일 재설정 요청 함수 request_password_reset 은 지운다.
--   4) 운영자(INV-K14): admin_phone_masks(크리에이터 아이디 목록) — 직원·대표, 가린 번호만 · admin_reveal_phone(크리에이터 아이디) — 대표만, 접속 기록 한 줄을
--      같은 처리에서 남기고 암호문을 돌려준다(앱 서버가 풀어 화면에 보인다) · 접속 기록 표 public.phone_access_log(고치기 불가, 1년 지난 줄만 지울 수 있음)
--      · purge_phone_access_log() — 1년 지난 줄 지우기(하루 한 번 DB 예약 작업 fankkuk-phone-access-log).
--   5) 변환용 임시 함수 둘(phone_backfill_pending · phone_backfill_set) — ④ 에서 지운다. 관리자 키만.
--
-- 섞인 상태: 이 파일만 적용하고 앱이 옛것이면 가입·번호 바꾸기·인증번호 받기·옛 비밀번호 찾기가 거부된다(숫자 번호가 꼴 검사에 걸린다).
--   카카오 알림은 변환 전 계정은 연락처가 없어(암호문 없음) 보내지 못한 알림으로 남는다 — ③ 뒤 「알림 지금 보내기」로 다시 보낸다.
--   ② 와 ③ 사이에는 변환 전 번호와 같은 번호로 새 가입이 될 수 있다 — ③ 을 ② 바로 뒤에 돌린다. 변환 스크립트가 그런 겹침을 찾으면 멈추고 알린다.
--
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if to_regclass('pii.account_contacts') is null or to_regclass('pii.phone_verifications') is null then
    raise exception '연락처·본인 확인 표가 없다 — 0002·0004 를 먼저 적용한다';
  end if;
  if to_regprocedure('public.check_phone_code(uuid,text)') is null then
    raise exception '인증번호 함수가 없다 — 0026_phone_sms_code.sql 을 먼저 적용한다';
  end if;
  if to_regprocedure('pii.withdraw_account(uuid,uuid,uuid)') is null then
    raise exception '탈퇴 함수가 없다 — 0025_account_withdrawal.sql 을 먼저 적용한다';
  end if;
  if to_regclass('public.password_resets') is null or to_regprocedure('public.is_owner()') is null then
    raise exception '재설정 표·대표 확인 함수가 없다 — 마이그레이션을 먼저 적용한다';
  end if;
end $$;

-- ── 1) 칸 ───────────────────────────────────────────────

alter table pii.account_contacts
  add column if not exists phone_sealed text check (phone_sealed is null or phone_sealed ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{30,64}$'),
  add column if not exists phone_hash text check (phone_hash is null or phone_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists phone_prefix text check (phone_prefix is null or phone_prefix ~ '^01[016789]$'),
  add column if not exists phone_last4 text check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$');

alter table pii.account_contacts drop constraint if exists account_contacts_phone_parts;
alter table pii.account_contacts add constraint account_contacts_phone_parts check (
  (phone_sealed is null) = (phone_hash is null)
  and (phone_hash is null) = (phone_prefix is null)
  and (phone_prefix is null) = (phone_last4 is null)
);
create unique index if not exists account_contacts_phone_hash_unique on pii.account_contacts (phone_hash) where phone_hash is not null;

alter table pii.phone_verifications alter column phone drop not null;
alter table pii.phone_verifications
  add column if not exists phone_hash text check (phone_hash is null or phone_hash ~ '^[0-9a-f]{64}$');
create index if not exists phone_verifications_hash_requested on pii.phone_verifications (phone_hash, requested_at) where phone_hash is not null;

-- 번호 묶음 JSON 글자를 칸 넷으로 — 열쇠가 정확히 넷이고 꼴이 다 맞을 때만. 틀리면 22023.
create or replace function pii.phone_bundle(p_bundle text)
returns table (b_hash text, b_sealed text, b_prefix text, b_last4 text)
language plpgsql immutable set search_path = ''
as $fn$
declare
  v jsonb;
begin
  begin
    v := p_bundle::jsonb;
  exception when others then
    raise exception '휴대폰 번호 꼴이 아니다' using errcode = '22023';
  end;
  if v is null or jsonb_typeof(v) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(v) k) is distinct from array['hash', 'last4', 'prefix', 'sealed']
     or coalesce(v ->> 'hash', '') !~ '^[0-9a-f]{64}$'
     or coalesce(v ->> 'sealed', '') !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{30,64}$'
     or coalesce(v ->> 'prefix', '') !~ '^01[016789]$'
     or coalesce(v ->> 'last4', '') !~ '^[0-9]{4}$' then
    raise exception '휴대폰 번호 꼴이 아니다' using errcode = '22023';
  end if;
  return query select v ->> 'hash', v ->> 'sealed', v ->> 'prefix', v ->> 'last4';
end;
$fn$;
revoke all on function pii.phone_bundle(text) from public, anon, authenticated, service_role;

-- ── 2) 인증번호 받기 — 번호 대신 번호 해시 ────────────────

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

  if exists (
    select 1 from pii.phone_verifications v
    where v.phone_hash = p_phone and v.requested_at > now() - interval '1 minute'
  ) then
    raise exception '같은 번호는 1분에 한 번' using errcode = 'FK428';
  end if;
  if (select count(*) from pii.phone_verifications v where v.phone_hash = p_phone and v.requested_at >= v_day_start) >= 5 then
    raise exception '같은 번호 하루 다섯 번' using errcode = 'FK429';
  end if;
  if (select count(*) from pii.phone_verifications v where v.ip_hash = p_ip_hash and v.requested_at >= v_day_start) >= 20 then
    raise exception '같은 접속 주소 하루 스무 번' using errcode = 'FK429';
  end if;

  -- 같은 번호로 새로 받으면 아직 맞히지 않은 앞 인증번호는 버린다(INV-U15)
  update pii.phone_verifications v set discarded_at = now(), code_hash = null
   where v.phone_hash = p_phone and v.verified_at is null and v.discarded_at is null;

  insert into pii.phone_verifications (id, phone_hash, code_hash, expires_at, ip_hash)
  values (p_id, p_phone, p_code_hash, now() + interval '3 minutes', p_ip_hash);
end;
$fn$;

-- 가입·번호 바꾸기 전에 번호표가 쓸 수 있는지 본다(INV-U2). 쓸 수 있으면 그 번호 해시, 아니면 null.
drop function if exists public.usable_phone_verification(uuid);
create function public.usable_phone_verification(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $fn$
  select v.phone_hash from pii.phone_verifications v
   where v.id = p_id and v.verified_at is not null and v.used_at is null
     and v.verified_at > now() - interval '10 minutes';
$fn$;

-- ── 3) 계정 만들기 — 번호 묶음 ────────────────────────────

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

-- ── 4) 번호 바꾸기 · 지금 번호인지 ─────────────────────────

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
      set phone = null, phone_sealed = excluded.phone_sealed, phone_hash = excluded.phone_hash,
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
  return 'changed';
end;
$fn$;

-- p_phone 은 번호 해시다
create or replace function public.is_my_current_phone(p_account_id uuid, p_phone text)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (select 1 from pii.account_contacts c where c.account_id = p_account_id and c.phone_hash = p_phone);
$fn$;

-- ── 5) 내 정보 가린 번호 · 알림톡 연락처 · 탈퇴 ─────────────

-- 휴대폰은 가운데 넷을 가린 모양만 내보낸다(my-account INV-A2) — 앞 3자리·뒤 4자리 칸으로 만든다. 암호문은 이 함수 밖으로 나가지 않는다.
create or replace function public.my_account()
returns table (
  login_id text,
  nickname text,
  email text,
  pending_email text,
  phone_masked text,
  notify_kakao boolean,
  notify_email boolean
)
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  return query
    select p.login_id, p.nickname, c.email, c.pending_email,
           case when c.phone_last4 is null then null
                else c.phone_prefix || '-****-' || c.phone_last4 end,
           coalesce(c.notify_kakao, true), coalesce(c.notify_email, true)
    from public.profiles p
    left join pii.account_contacts c on c.account_id = p.id
    where p.id = v_uid;
end;
$fn$;

-- 카카오 알림은 {"account": 계정 ID, "sealed": 번호 암호문} JSON 글자를 돌려준다 — 암호문이 계정에 묶여 있어 앱 서버가 그 계정 ID 로
-- 풀어 문자 대행사에 넘긴다(INV-U18). 화면에는 나오지 않는다. 이메일은 지금처럼 주소 글자.
create or replace function public.notification_contact(p_outbox_id uuid)
returns text
language sql stable security definer set search_path = ''
as $fn$
  select case n.channel
           when 'email' then c.email
           when 'kakao' then case when c.phone_sealed is null then null
                                  else jsonb_build_object('account', n.account_id, 'sealed', c.phone_sealed)::text end
         end
  from public.notification_outbox n
  join pii.account_contacts c on c.account_id = n.account_id
  where n.id = p_outbox_id
    and n.status = 'sending'
    and (
      public.notification_kind_must_deliver(n.kind)
      or (n.channel = 'email' and c.notify_email)
      or (n.channel = 'kakao' and c.notify_kakao)
    );
$fn$;

create or replace function pii.withdraw_account(p_account uuid, p_pseudonym uuid, p_creator uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_hash text;
  v_phone text;
begin
  if p_account is null or p_pseudonym is null then
    raise exception '계정과 가명 식별자가 있어야 한다' using errcode = '22023';
  end if;
  select c.phone_hash, c.phone into v_hash, v_phone from pii.account_contacts c where c.account_id = p_account;

  delete from pii.account_contacts where account_id = p_account;
  delete from pii.email_verifications where account_id = p_account;
  if v_hash is not null then
    delete from pii.phone_verifications where phone_hash = v_hash;
  end if;
  -- 변환 전 줄(옛 칸)도 지운다 — 0029 에서 옛 칸이 없어질 때 이 줄도 함께 지운다
  if v_phone is not null then
    delete from pii.phone_verifications where phone = v_phone;
  end if;
  delete from pii.fan_addresses where account_id = p_account;
  delete from pii.return_addresses where account_id = p_account;
  delete from pii.revgift_addresses a using public.revgift_shares s where s.id = a.share_id and s.fan_id = p_account;

  alter table pii.fan_address_events disable trigger fan_address_events_no_update;
  alter table pii.creator_address_events disable trigger creator_address_events_no_update;
  delete from pii.fan_address_events where account_id = p_account;
  delete from pii.creator_address_events where actor_id = p_account or (p_creator is not null and creator_id = p_creator);
  alter table pii.fan_address_events enable trigger fan_address_events_no_update;
  alter table pii.creator_address_events enable trigger creator_address_events_no_update;

  if p_creator is not null then
    delete from pii.creator_addresses where creator_id = p_creator;
  end if;
end $fn$;

-- ── 6) 휴대폰 비밀번호 찾기(session-login INV-L10·L11) ──────

-- 그 번호 해시로 가입한 팬·크리에이터 계정이 있는가. 운영자 계정·없는 번호는 false — 앱은 어느 쪽이든 같은 응답을 돌려주고 인증번호는 true 일 때만 보낸다.
create or replace function public.password_reset_target(p_phone_hash text)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select p_phone_hash ~ '^[0-9a-f]{64}$' and exists (
    select 1 from pii.account_contacts c join public.profiles p on p.id = c.account_id
    where c.phone_hash = p_phone_hash and p.role in ('fan', 'creator')
  );
$fn$;

-- 인증번호를 맞힌 확인 줄로 재설정 표를 발급한다. 확인 줄을 잠그고 — 확인됐고·안 썼고·10분 안이고·그 번호 해시인 줄만 — 「씀」으로 바꾼 뒤,
-- 그 계정의 안 쓴 표를 무효로 하고 새 표(해시만, 10분)를 넣는다. 계정이 없으면(운영자 포함) invalid — 확인 줄은 그대로 둔다.
create or replace function public.issue_phone_password_reset(p_verification_id uuid, p_phone_hash text, p_token text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_ver pii.phone_verifications%rowtype;
  v_account uuid;
begin
  if p_verification_id is null or p_phone_hash is null or p_phone_hash !~ '^[0-9a-f]{64}$'
     or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception '재설정 표 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v_ver from pii.phone_verifications v where v.id = p_verification_id for update;
  if not found or v_ver.verified_at is null or v_ver.used_at is not null
     or v_ver.verified_at <= now() - interval '10 minutes' or v_ver.phone_hash is distinct from p_phone_hash then
    return 'invalid';
  end if;
  select c.account_id into v_account
    from pii.account_contacts c join public.profiles p on p.id = c.account_id
   where c.phone_hash = p_phone_hash and p.role in ('fan', 'creator');
  if v_account is null then
    return 'invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.password_reset:' || v_account::text, 0));
  update pii.phone_verifications set used_at = now() where id = v_ver.id;
  update public.password_resets r set revoked_at = now()
   where r.account_id = v_account and r.used_at is null and r.revoked_at is null;
  insert into public.password_resets (account_id, token_hash, expires_at)
  values (v_account, extensions.digest(p_token, 'sha256'), now() + interval '10 minutes');
  return 'issued';
end;
$fn$;

drop function if exists public.request_password_reset(text, text);

-- ── 7) 운영자 가린 번호 · 대표 번호 보기 · 접속 기록(admin-console INV-K14) ──

create table if not exists public.phone_access_log (
  id bigint generated always as identity primary key,
  viewer_id uuid not null,
  account_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists phone_access_log_at on public.phone_access_log (at);
alter table public.phone_access_log enable row level security;
revoke all on public.phone_access_log from public, anon, authenticated;

-- 고치기는 언제나, 지우기는 1년 지난 줄만 거부하지 않는다. 비우기(truncate)도 거부.
create or replace function public.phone_access_log_guard()
returns trigger
language plpgsql set search_path = ''
as $fn$
begin
  if tg_op = 'DELETE' and old.at < now() - interval '1 year' then
    return old;
  end if;
  raise exception '접속 기록은 고치거나 지울 수 없다(1년 지난 줄만 지운다)' using errcode = '42501';
end;
$fn$;
drop trigger if exists phone_access_log_no_change on public.phone_access_log;
create trigger phone_access_log_no_change before update or delete on public.phone_access_log
for each row execute function public.phone_access_log_guard();
drop trigger if exists phone_access_log_no_truncate on public.phone_access_log;
create trigger phone_access_log_no_truncate before truncate on public.phone_access_log
for each statement execute function public.phone_access_log_guard();

-- 직원·대표 — 크리에이터 계정(아이디로 찾는다)마다 가린 번호(앞 3자리-****-뒤 4자리)만. 크리에이터가 아닌 계정은 찾지 않는다. 한 번에 200개까지.
create or replace function public.admin_phone_masks(p_login_ids text[])
returns table (login_id text, phone_masked text)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.is_operator() then
    raise exception '운영자만' using errcode = '42501';
  end if;
  if p_login_ids is null or cardinality(p_login_ids) > 200 then
    raise exception '아이디는 200개까지' using errcode = '22023';
  end if;
  return query
    select p.login_id, c.phone_prefix || '-****-' || c.phone_last4
    from public.profiles p
    join pii.account_contacts c on c.account_id = p.id
    where p.login_id = any(p_login_ids) and p.role = 'creator' and c.phone_last4 is not null;
end;
$fn$;

-- 대표만 — 접속 기록 한 줄(누가·언제·어느 계정)을 남기고 그 크리에이터 계정의 ID 와 번호 암호문을 돌려준다
-- (암호문이 계정에 묶여 있어 앱 서버가 그 계정 ID 로 풀어 그 응답에만 싣는다). 크리에이터가 아닌 계정은 찾지 않는다.
-- 기록과 읽기가 한 처리다 — 기록을 못 남기면 암호문도 나가지 않는다. 번호가 없으면 줄 없음, 기록도 없다.
create or replace function public.admin_reveal_phone(p_login_id text)
returns table (account_id uuid, phone_sealed text)
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v_account uuid;
  v_sealed text;
begin
  if not public.is_owner() then
    raise exception '대표만' using errcode = '42501';
  end if;
  select c.account_id, c.phone_sealed into v_account, v_sealed
    from public.profiles p join pii.account_contacts c on c.account_id = p.id
   where p.login_id = p_login_id and p.role = 'creator';
  if v_sealed is null then
    return;
  end if;
  insert into public.phone_access_log (viewer_id, account_id) values (auth.uid(), v_account);
  return query select v_account, v_sealed;
end;
$fn$;

-- 1년 지난 접속 기록을 지운다(자동 처리). 지운 줄 수를 돌려준다.
create or replace function public.purge_phone_access_log()
returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_count integer;
begin
  delete from public.phone_access_log where at < now() - interval '1 year';
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ── 8) 변환용 임시 함수(0029 에서 지운다) ───────────────────

-- 아직 변환하지 않은 줄 — 계정 ID 와 옛 번호. 관리자 키만.
create or replace function public.phone_backfill_pending(p_limit integer)
returns table (account_id uuid, phone text)
language sql stable security definer set search_path = ''
as $fn$
  select c.account_id, c.phone from pii.account_contacts c
   where c.phone is not null and c.phone_hash is null
   order by c.account_id
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
$fn$;

-- 한 줄 변환 — 옛 번호가 아직 그 값일 때만 칸 넷을 채우고 옛 번호를 지운다. 같은 해시가 이미 다른 계정에 있으면 'duplicate'(바꾸지 않음).
create or replace function public.phone_backfill_set(p_account_id uuid, p_phone text, p_bundle text)
returns text
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_hash text;
  v_sealed text;
  v_prefix text;
  v_last4 text;
begin
  select b.b_hash, b.b_sealed, b.b_prefix, b.b_last4 into v_hash, v_sealed, v_prefix, v_last4 from pii.phone_bundle(p_bundle) b;
  if p_phone is null or left(p_phone, 3) <> v_prefix or right(p_phone, 4) <> v_last4 then
    raise exception '번호와 묶음이 맞지 않다' using errcode = '22023';
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone_hash = v_hash and c.account_id <> p_account_id) then
    return 'duplicate';
  end if;
  update pii.account_contacts c
     set phone = null, phone_sealed = v_sealed, phone_hash = v_hash, phone_prefix = v_prefix, phone_last4 = v_last4, updated_at = now()
   where c.account_id = p_account_id and c.phone = p_phone and c.phone_hash is null;
  return case when found then 'done' else 'skipped' end;
end;
$fn$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.request_phone_code(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.usable_phone_verification(uuid) from public, anon, authenticated;
revoke all on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.change_my_phone(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.is_my_current_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.notification_contact(uuid) from public, anon, authenticated;
revoke all on function pii.withdraw_account(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.password_reset_target(text) from public, anon, authenticated;
revoke all on function public.issue_phone_password_reset(uuid, text, text) from public, anon, authenticated;
revoke all on function public.phone_access_log_guard() from public, anon, authenticated;
revoke all on function public.admin_phone_masks(text[]) from public, anon;
revoke all on function public.admin_reveal_phone(text) from public, anon;
revoke all on function public.purge_phone_access_log() from public, anon, authenticated;
revoke all on function public.phone_backfill_pending(integer) from public, anon, authenticated;
revoke all on function public.phone_backfill_set(uuid, text, text) from public, anon, authenticated;

grant execute on function public.request_phone_code(uuid, text, text, text) to service_role;
grant execute on function public.usable_phone_verification(uuid) to service_role;
grant execute on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) to service_role;
grant execute on function public.change_my_phone(uuid, text, uuid) to service_role;
grant execute on function public.is_my_current_phone(uuid, text) to service_role;
grant execute on function public.notification_contact(uuid) to service_role;
grant execute on function public.password_reset_target(text) to service_role;
grant execute on function public.issue_phone_password_reset(uuid, text, text) to service_role;
grant execute on function public.admin_phone_masks(text[]) to authenticated;
grant execute on function public.admin_reveal_phone(text) to authenticated;
grant execute on function public.purge_phone_access_log() to service_role;
grant execute on function public.phone_backfill_pending(integer) to service_role;
grant execute on function public.phone_backfill_set(uuid, text, text) to service_role;

-- 개인정보 노출 검사(scripts/pii-exposure.mjs)가 이 파일이 적용됐는지 보는 표식
create table if not exists pii.phone_encrypt_marker (id boolean primary key default true check (id));
revoke all on pii.phone_encrypt_marker from public, anon, authenticated;

-- 1년 지난 접속 기록 지우기 — 하루 한 번(한국 시간 03:40, 보관 기한 정리 03:30 다음). 같은 이름으로 다시 등록하면 덮어쓴다.
-- (2026-11-06 로컬에 이 파일을 먼저 적용한 뒤 덧붙인 줄이다 — 로컬에는 이 한 줄만 따로 실행한다)
select cron.schedule('fankkuk-phone-access-log', '40 18 * * *', 'select public.purge_phone_access_log()');

notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인 — 모두 t 여야 한다
select to_regclass('pii.account_contacts') is not null
   and exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'account_contacts' and column_name = 'phone_hash') as contacts_has_hash;
select to_regprocedure('public.request_password_reset(text,text)') is null as old_email_reset_gone;
select not has_function_privilege('authenticated', 'public.issue_phone_password_reset(uuid,text,text)', 'execute') as reset_not_callable_by_login;
select not has_function_privilege('authenticated', 'public.phone_backfill_pending(integer)', 'execute') as backfill_not_callable_by_login;
