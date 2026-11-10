-- 0038 크리에이터 가입 장애 대비 길 고침 — 장애 기록 옮기기를 「한 번호표에서 다음 번호표로 넘김」으로, 장애 기록 시간 기준을 한 함수로 (2026-11-11 코드 리뷰).
-- 스펙: docs/specs/signup.md INV-U20 (정함 2026-11-11 — 「장애 기록은 기록된 때부터 10분 안에 인증번호 요청에 쓰여야 하고, 옮겨진 뒤에는 인증번호 번호표의 10분 규칙(INV-U2)을 따른다」)
--
-- 사람이 직접 적용한다(개인정보 구역 pii 의 함수를 고친다). 에이전트는 로컬에도 적용하지 않는다. 표·데이터는 바꾸지 않는다.
-- manual/0037 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0038.sh
-- 확인: npx vitest run --config vitest.integration.config.mts signup-kakao-sign-db
--   → 「(manual/0038 뒤)」 시험이 적용 전에는 실패하고(장애 길에서 인증번호를 다시 받으면 가입 거부 · 시간 함수 없음) 적용 뒤에는 통과한다.
--
-- 무엇을 바꾸나
--   1) pii.signup_sign_down_window() — 「창구 장애 확인」을 인증번호 요청에 옮길 수 있는 시간(10분). 장애 기록 시간 기준은 이 함수 하나에서만 정한다.
--   2) carry_signup_sign_down(앞 번호표, 새 번호표) — 앞 번호표가 서명 요청의 번호표이거나, 그 요청의 장애 기록을 지금 가진 인증번호 번호표이면
--      (같은 번호 해시·기록된 때부터 위 시간 안·지금 가진 번호표가 아직 확인 전) 장애 기록을 새 번호표로 넘긴다 — 앞 번호표의 기록은 지운다(언제나 한 번호표만 가진다).
--      옮긴 시각은 원래 기록 시각 그대로라 다시 받아도 기한이 늘지 않는다. 발송이 실패해 버려진 번호표에 넘어간 기록도 다음 요청이 다시 가져간다.
--      (0037 은 한 번 옮기면 끝이라, 장애 길에서 인증번호를 다시 받거나 발송이 한 번 실패하면 크리에이터 가입이 「다시 확인」으로 막혔다)
--   3) signup_verification_kind · create_account — 옮겨 받은 장애 기록이 있으면 code_down. 옮긴 뒤에는 기록 시각으로 다시 재지 않는다
--      (인증번호 번호표 규칙 — 확인된 때부터 10분 — 이 그대로 지킨다).
--
-- 앱과 한쪽만 적용된 상태: 이 파일은 함수 본문만 바꾸고 인자·반환 꼴이 같아 앱은 그대로다. 적용 전에는 위 2) 의 결함만 남는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if to_regclass('pii.signup_sign_requests') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'signup_sign_requests' and column_name = 'carried_to') then
    raise exception 'manual/0037 을 먼저 적용해야 한다';
  end if;
end $$;

-- ── 1) 시간 기준 ───────────────────────────────────────

create or replace function pii.signup_sign_down_window()
returns interval
language sql immutable set search_path = ''
as $fn$ select interval '10 minutes' $fn$;
revoke all on function pii.signup_sign_down_window() from public, anon, authenticated;
grant execute on function pii.signup_sign_down_window() to service_role;

-- 앱 시험이 경계를 이 값에서 빼서 만들 수 있게 읽기 함수(앱 서버 키 전용)
create or replace function public.signup_sign_down_window_seconds()
returns integer
language sql immutable security definer set search_path = ''
as $fn$ select extract(epoch from pii.signup_sign_down_window())::integer $fn$;
revoke all on function public.signup_sign_down_window_seconds() from public, anon, authenticated;
grant execute on function public.signup_sign_down_window_seconds() to service_role;

-- ── 2) 장애 기록 넘기기 ─────────────────────────────────

create or replace function public.carry_signup_sign_down(p_from uuid, p_to uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_req pii.signup_sign_requests%rowtype;
  v_to pii.phone_verifications%rowtype;
begin
  if p_from is null or p_to is null or p_from = p_to then
    return false;
  end if;
  -- 앞 번호표가 서명 요청의 번호표이거나, 그 요청의 장애 기록을 지금 가진 번호표
  select * into v_req from pii.signup_sign_requests r
   where r.state = 'down' and (r.ticket = p_from or r.carried_to = p_from)
   for update;
  if not found or v_req.finished_at <= now() - pii.signup_sign_down_window() then
    return false;
  end if;
  select * into v_to from pii.phone_verifications v where v.id = p_to for update;
  if not found or v_to.method <> 'code' or v_to.verified_at is not null or v_to.phone_hash is distinct from v_req.phone_hash then
    return false;
  end if;
  -- 지금 가진 번호표가 이미 확인됐으면(가입에 쓰일 수 있음) 넘기지 않는다 — 언제나 한 번호표만
  if v_req.carried_to is not null and exists (
    select 1 from pii.phone_verifications v where v.id = v_req.carried_to and v.verified_at is not null
  ) then
    return false;
  end if;
  if v_req.carried_to is not null then
    update pii.phone_verifications v set gateway_down_at = null where v.id = v_req.carried_to;
  end if;
  update pii.phone_verifications v set gateway_down_at = v_req.finished_at where v.id = p_to;
  update pii.signup_sign_requests r set carried_to = p_to where r.id = v_req.id;
  return true;
end;
$fn$;
revoke all on function public.carry_signup_sign_down(uuid, uuid) from public, anon, authenticated;
grant execute on function public.carry_signup_sign_down(uuid, uuid) to service_role;

-- ── 3) 확인 방법 · 계정 만들기 ────────────────────────────

create or replace function public.signup_verification_kind(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $fn$
  select case
           when v.method = 'sign' then 'sign'
           when v.gateway_down_at is not null then 'code_down'
           else 'code'
         end
    from pii.phone_verifications v where v.id = p_id;
$fn$;
revoke all on function public.signup_verification_kind(uuid) from public, anon, authenticated;
grant execute on function public.signup_verification_kind(uuid) to service_role;

create or replace function public.create_account(p_user_id uuid, p_login_id text, p_role text, p_email text, p_phone text, p_verification_id uuid, p_terms jsonb, p_nickname text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
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
  -- INV-U1·U20 (2026-11-11 정함): 크리에이터의 인증번호 확인은 「창구 장애 확인」을 옮겨 받은 번호표일 때만.
  -- 장애 기록은 기록된 때부터 정한 시간(pii.signup_sign_down_window) 안에 인증번호 요청에 옮겨져야 하고(carry_signup_sign_down 이 본다),
  -- 옮겨진 뒤에는 인증번호 번호표의 규칙(확인된 때부터 10분, INV-U2 — 위 검사)을 따른다
  if p_role = 'creator' and v_ver.method = 'code' and v_ver.gateway_down_at is null then
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
revoke all on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) to service_role;

notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인 — 모두 t 여야 한다
select to_regprocedure('pii.signup_sign_down_window()') is not null as down_window_fn;
select (select prosrc from pg_proc where oid = to_regprocedure('public.carry_signup_sign_down(uuid,uuid)')) like '%r.carried_to = p_from%' as carry_moves;
select not has_function_privilege('authenticated', 'public.carry_signup_sign_down(uuid,uuid)', 'execute') as carry_not_callable_by_login;
