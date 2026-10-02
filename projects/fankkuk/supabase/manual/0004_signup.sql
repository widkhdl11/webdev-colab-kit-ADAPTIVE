-- 회원가입 — 휴대폰 본인 확인 기록, 약관 동의 기록, 계정 만들기 함수. 스펙: docs/specs/signup.md (INV-U1~U11)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 0003_account_contacts_review.sql 다음에 적용한다.
--
-- 적용(로컬, Bash): docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/manual/0004_signup.sql
--
-- 여기 함수는 모두 앱 서버 키 전용이다. 가입하는 사람은 아직 로그인 전이라 auth.uid() 로 사람을 정할 수 없고,
-- 앱 서버가 Supabase Auth 에 방금 만든 사용자 ID 를 넘긴다. 화면 쪽 키(익명·로그인)로는 어느 것도 부를 수 없다.
-- 오류 코드: 22023 입력 꼴 · FK429 요청 한도 · FKU01 본인 확인이 쓸 수 없음 · FKU02 이미 가입된 번호 · FKU03 이미 쓰는 아이디
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않으니 고쳐서 다시 적용하면 된다.

begin;

-- ── 표 ──────────────────────────────────────────────────

-- 본인 확인 요청 한 건당 한 줄. 번호표(id)는 가입 화면에 주고, 제공자의 거래 값(provider_tx)은 서버만 본다.
-- 요청 기록은 한 시간 다섯 번 한도의 기록이기도 하다(INV-U10) — 쓴 줄도 지우지 않는다.
create table pii.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^01[016789][0-9]{7,8}$'),
  provider_tx text check (provider_tx is null or char_length(provider_tx) between 1 and 200),
  requested_at timestamptz not null default now(),
  verified_at timestamptz,
  used_at timestamptz,
  check (used_at is null or verified_at is not null)
);
create index phone_verifications_phone_requested on pii.phone_verifications (phone, requested_at);

-- 번호 하나에 계정 하나(INV-U3). 동시에 온 두 가입도 여기서 하나만 지나간다.
create unique index account_contacts_phone_unique on pii.account_contacts (phone) where phone is not null;

-- 약관 동의 기록(INV-U6). 동의한 약관만 한 줄씩 — 판 번호와 시각을 남긴다.
create table public.terms_consents (
  account_id uuid not null references public.profiles (id) on delete cascade,
  term_key text not null check (term_key in ('service', 'privacy', 'news')),
  version text not null check (char_length(version) between 1 and 20),
  agreed_at timestamptz not null default now(),
  primary key (account_id, term_key)
);

alter table pii.phone_verifications enable row level security;
alter table public.terms_consents enable row level security;
-- 정책은 만들지 않는다. 아래 함수만 통한다.
revoke all on pii.phone_verifications from public, anon, authenticated;
revoke all on public.terms_consents from public, anon, authenticated;

-- ── 본인 확인 요청 ────────────────────────────────────────

-- 한 번호에 한 시간 다섯 번까지(INV-U10). 개수 확인과 기록을 같은 잠금 안에서 한다 — 같은 번호로 동시에 온 요청이
-- 차례로 지나가서 여섯 번째는 반드시 거부된다. 번호 줄이 아직 없을 수 있어 행 대신 번호로 잠근다.
-- 이 함수가 성공한 뒤에만 앱 서버가 카카오를 부른다.
create function public.request_phone_verification(p_phone text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_phone is null or p_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception '휴대폰 번호 꼴이 아니다' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.phone_verification:' || p_phone, 0));
  if (
    select count(*) from pii.phone_verifications v
    where v.phone = p_phone and v.requested_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception '본인 확인 요청 한도를 넘었다' using errcode = 'FK429';
  end if;
  insert into pii.phone_verifications (phone) values (p_phone) returning id into v_id;
  return v_id;
end;
$$;

-- 카카오가 돌려준 거래 값을 단다. 한 번만 단다 — 이미 달린 줄은 바꾸지 않는다.
create function public.attach_phone_verification_tx(p_id uuid, p_tx text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update pii.phone_verifications v set provider_tx = p_tx
   where v.id = p_id and v.provider_tx is null;
  if not found then
    raise exception '거래 값을 달 수 없다' using errcode = 'FKU01';
  end if;
end;
$$;

-- 결과를 물어볼 때 쓸 값. 요청한 지 10분이 지났거나 이미 확인·사용된 줄은 돌려주지 않는다.
create function public.phone_verification_tx(p_id uuid)
returns table (phone text, provider_tx text)
language sql stable security definer set search_path = ''
as $$
  select v.phone, v.provider_tx from pii.phone_verifications v
   where v.id = p_id and v.provider_tx is not null and v.verified_at is null and v.used_at is null
     and v.requested_at > now() - interval '10 minutes';
$$;

-- 서버가 카카오에게 받은 확인 결과를 적는다(INV-U1). 카카오가 확인한 번호가 요청한 번호와 같을 때만 확인으로 친다.
create function public.complete_phone_verification(p_id uuid, p_verified_phone text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update pii.phone_verifications v set verified_at = now()
   where v.id = p_id and v.phone = p_verified_phone and v.provider_tx is not null
     and v.verified_at is null and v.used_at is null
     and v.requested_at > now() - interval '10 minutes';
  return found;
end;
$$;

-- 가입 전에 번호표가 쓸 수 있는지 본다 — 확인됐고, 안 썼고, 확인된 지 10분 안(INV-U2). 쓸 수 있으면 그 번호, 아니면 null.
-- 로그인 정보를 만들기 전에 거르는 용도다. 최종 판정은 create_account 가 잠금 안에서 다시 한다.
create function public.usable_phone_verification(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select v.phone from pii.phone_verifications v
   where v.id = p_id and v.verified_at is not null and v.used_at is null
     and v.verified_at > now() - interval '10 minutes';
$$;

-- ── 계정 만들기 ──────────────────────────────────────────

-- 앱 서버가 Supabase Auth 에 사용자를 만든 직후 부른다. 프로필·연락처 줄·확인 메일 기록·약관 동의를 한 번에 만들고
-- 본인 확인을 「씀」으로 바꾼다(INV-U4). 하나라도 실패하면 아무것도 남지 않는다 — 그때 앱 서버가 Auth 사용자를 지운다.
-- 확인 줄을 잠그고 시작한다 — 같은 번호표로 동시에 온 둘째 가입은 첫째가 끝난 뒤 「이미 씀」을 보고 거부된다(INV-U2).
-- 번호 중복은 확인을 통과한 뒤에만 알려 준다(INV-U11).
-- 닉네임은 아이디 앞 12자로 시작한다 — 가입 화면에 닉네임 칸이 없고, 내 정보에서 바꾼다(INV-A5 의 12자).
-- 이메일은 확인 대기로만 둔다(INV-U7). 확인 메일 기록 한 줄을 남겨 두면 앱 서버가 issue_email_verification 으로 링크를 단다.
create function public.create_account(
  p_user_id uuid,
  p_login_id text,
  p_role text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_ver pii.phone_verifications%rowtype;
  v_keys text[];
  v_constraint text;
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
       or coalesce(t ->> 'key', '') not in ('service', 'privacy', 'news')
       or char_length(coalesce(t ->> 'version', '')) not between 1 and 20
  ) then
    raise exception '약관 동의 꼴이 아니다' using errcode = '22023';
  end if;
  select array_agg(t ->> 'key') into v_keys from jsonb_array_elements(p_terms) t;
  if not (v_keys @> array['service', 'privacy']) then
    raise exception '필수 약관 동의가 빠졌다' using errcode = '22023';
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
    values (p_user_id, p_login_id, left(p_login_id, 12), p_role::public.user_role);
    insert into pii.account_contacts (account_id, phone, pending_email) values (p_user_id, p_phone, p_email);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'account_contacts_phone_unique' then
      raise exception '이미 가입된 번호다' using errcode = 'FKU02';
    elsif v_constraint = 'profiles_login_id_key' then
      raise exception '이미 쓰는 아이디다' using errcode = 'FKU03';
    end if;
    raise;
  end;

  insert into pii.email_verifications (account_id, email, token_hash, expires_at)
  values (p_user_id, p_email, extensions.gen_random_bytes(32), now() + interval '24 hours');

  insert into public.terms_consents (account_id, term_key, version)
  select distinct on (t ->> 'key') p_user_id, t ->> 'key', t ->> 'version' from jsonb_array_elements(p_terms) t;

  update pii.phone_verifications set used_at = now() where id = v_ver.id;
end;
$$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.request_phone_verification(text) from public, anon, authenticated;
revoke all on function public.attach_phone_verification_tx(uuid, text) from public, anon, authenticated;
revoke all on function public.phone_verification_tx(uuid) from public, anon, authenticated;
revoke all on function public.complete_phone_verification(uuid, text) from public, anon, authenticated;
revoke all on function public.usable_phone_verification(uuid) from public, anon, authenticated;
revoke all on function public.create_account(uuid, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.request_phone_verification(text) to service_role;
grant execute on function public.attach_phone_verification_tx(uuid, text) to service_role;
grant execute on function public.phone_verification_tx(uuid) to service_role;
grant execute on function public.complete_phone_verification(uuid, text) to service_role;
grant execute on function public.usable_phone_verification(uuid) to service_role;
grant execute on function public.create_account(uuid, text, text, text, text, uuid, jsonb) to service_role;

commit;
