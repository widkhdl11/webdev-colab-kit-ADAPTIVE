-- 0039 크리에이터 가입은 닉네임 없이 계정을 만든다 — 채널 만들기 단계로 옮김 (2026-11-11, DECISIONS 「크리에이터 가입: 닉네임·팬덤 이름·태그를 마지막 「채널 만들기」 단계로」).
-- 스펙: docs/specs/signup.md INV-U13 (첫 문장)·INV-U21
--
-- 사람이 직접 적용한다(개인정보 구역 pii 를 읽는 public.create_account 를 고친다). 에이전트는 로컬에도 적용하지 않는다. 표·데이터는 바꾸지 않는다.
-- manual/0038 다음, 그리고 migrations/20261111000040_creator_channel_create.sql 다음에 적용한다(파일 첫 검사가 둘 다 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0039.sh
-- 확인: npx vitest run --config vitest.integration.config.mts creator-channel-create-db
--   → 「(manual/0039 뒤)」 시험이 적용 전에는 실패하고(크리에이터 가입이 닉네임 검사에 걸림) 적용 뒤에는 통과한다.
--
-- 무엇을 바꾸나
--   create_account — 역할이 크리에이터면 닉네임을 받지 않고(오면 거부) 비운 채 계정을 만든다. 팬은 그대로 닉네임 검사를 한다.
--   나머지 본문(번호표·확인 방법 대조·연락처·약관)은 0038 그대로다. 인자·반환 꼴도 같다.
--
-- 한쪽만 적용된 상태 (둘 다 막히는 쪽으로 실패한다 — 닉네임 없는 팬 계정이나 이름 없는 공개 크리에이터는 어느 조합에서도 생기지 않는다)
--   마이그레이션만(이 파일 없음): 새 앱은 크리에이터 가입에 닉네임을 보내지 않으므로 옛 create_account 의 닉네임 검사에 걸려 크리에이터 가입이 실패한다. 팬 가입은 그대로.
--   이 파일만(마이그레이션 없음): 파일 첫 검사가 멈춘다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 다시 적용해도 결과가 같다.

begin;

do $$
begin
  if to_regprocedure('pii.signup_sign_down_window()') is null then
    raise exception 'manual/0038 을 먼저 적용해야 한다';
  end if;
  if to_regprocedure('public.create_my_channel(text,text,uuid[],text)') is null then
    raise exception 'migrations/20261111000040_creator_channel_create.sql 을 먼저 적용해야 한다';
  end if;
end $$;

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
  -- INV-U13·U21 (2026-11-11): 팬은 가입 때 닉네임을 받는다. 크리에이터는 받지 않는다 — 닉네임은 채널 만들기(create_my_channel)에서 정한다.
  -- 크리에이터에게 닉네임이 오면 거부한다(화면을 꾸며 채널 만들기 검사를 건너뛰지 못하게).
  if p_role = 'creator' then
    if v_nickname <> '' then
      raise exception '크리에이터 가입은 닉네임을 받지 않는다' using errcode = '22023';
    end if;
  else
    -- 닉네임 검사(태그·팬덤 이름과 같은 필터). 어느 금칙어에 걸렸는지는 알리지 않는다
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
    values (p_user_id, p_login_id, nullif(v_nickname, ''), p_role::public.user_role);
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

-- 적용 결과 확인 — t 여야 한다
select (select prosrc from pg_proc where oid = to_regprocedure('public.create_account(uuid,text,text,text,text,uuid,jsonb,text)')) like '%크리에이터 가입은 닉네임을 받지 않는다%' as creator_no_nickname;
