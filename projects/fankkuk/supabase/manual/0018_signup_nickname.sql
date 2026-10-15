-- 운영 적용: 마이그레이션 20261015000001 뒤, 앱 배포와 같은 때.
--
-- 가입 닉네임 (signup INV-U13, PRODUCT 「추가 요청 3」, 2026-10-15). 개인정보 구역(pii)에 쓰는 함수 둘을 다시 정의해 사람이 적용한다.
-- 마이그레이션 20261015000001 의 nickname_problem(닉네임 검사)과 profiles 닉네임 비교 값 유일 인덱스(profiles_nickname_key)가 먼저 있어야 한다.
--
-- 1) create_account — 닉네임 인자(p_nickname)를 받는다. 전에는 로그인 아이디 앞 12자를 닉네임으로 썼다(0004).
--    검사: nickname_problem — 길이·보이지 않는 글자는 22023, 금칙어 FKU05 · 전화번호·이메일·인터넷 주소 FKU06 · 글자 없음 FKU07.
--    겹침: 유일 인덱스가 판정한다 — 같은 닉네임(영문 대소문자·앞뒤 공백 무시)으로 동시에 둘이 와도 하나만 들어가고 진 쪽은 FKU04.
--    검사·겹침에 걸리면 번호표는 「씀」이 되지 않는다(전과 같이 한 처리 안).
--    인자가 바뀌어 옛 함수(7개 인자)를 지운다 — 옛 함수가 남으면 아이디 앞 12자 닉네임이 남의 닉네임과 겹쳐 실패한다.
-- 2) update_my_account — 내 정보에서 닉네임을 바꿀 때도 같은 검사와 같은 겹침 판정(INV-U13 「내 정보에서 바꿀 때도 같은 규칙」, my-account INV-A5).
--    나머지는 0003 그대로.
--
-- 다시 적용해도 결과가 같다.

drop function if exists public.create_account(uuid, text, text, text, text, uuid, jsonb);

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
       or coalesce(t ->> 'key', '') not in ('service', 'privacy', 'news')
       or char_length(coalesce(t ->> 'version', '')) not between 1 and 20
  ) then
    raise exception '약관 동의 꼴이 아니다' using errcode = '22023';
  end if;
  select array_agg(t ->> 'key') into v_keys from jsonb_array_elements(p_terms) t;
  if not (v_keys @> array['service', 'privacy']) then
    raise exception '필수 약관 동의가 빠졌다' using errcode = '22023';
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

revoke all on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_account(uuid, text, text, text, text, uuid, jsonb, text) to service_role;

create or replace function public.update_my_account(p_nickname text, p_email text, p_notify_kakao boolean, p_notify_email boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_current text;
  v_pending text;
  v_needs_mail boolean;
  v_problem text;
  v_constraint text;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if char_length(v_nickname) not between 1 and 12 then
    raise exception '닉네임은 1~12자다' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' then
    raise exception '이메일 꼴이 아니다' using errcode = '22023';
  end if;
  if p_notify_kakao is null or p_notify_email is null then
    raise exception '알림 설정이 비었다' using errcode = '22023';
  end if;
  -- signup INV-U13: 가입 때와 같은 닉네임 검사
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

  insert into pii.account_contacts (account_id) values (v_uid) on conflict (account_id) do nothing;
  -- 같은 계정의 저장·발급·링크 확인이 이 줄에서 차례로 지나간다(INV-A8). 잠그는 순서: 연락처 줄 → 확인 기록.
  select c.email, c.pending_email into v_current, v_pending
    from pii.account_contacts c where c.account_id = v_uid for update;

  v_needs_mail := (v_current is null or lower(v_current) <> lower(v_email))
              and (v_pending is null or lower(v_pending) <> lower(v_email));
  if v_needs_mail then
    if (
      select count(*) from pii.email_verifications v
      where v.account_id = v_uid and v.sent_at > now() - interval '1 hour'
    ) >= 5 then
      raise exception '확인 메일 한도를 넘었다' using errcode = 'FK429';
    end if;
    insert into pii.email_verifications (account_id, email, token_hash, expires_at)
    values (v_uid, v_email, extensions.gen_random_bytes(32), now() + interval '24 hours');
  end if;

  -- signup INV-U13: 겹침은 유일 인덱스가 판정한다. 걸리면 위의 확인 기록도 함께 되돌아간다(한 처리)
  begin
    update public.profiles set nickname = v_nickname where id = v_uid;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'profiles_nickname_key' then
      raise exception '이미 쓰는 닉네임이다' using errcode = 'FKU04';
    end if;
    raise;
  end;
  update pii.account_contacts
     set notify_kakao = p_notify_kakao,
         notify_email = p_notify_email,
         pending_email = case when v_needs_mail then v_email else pending_email end,
         updated_at = now()
   where account_id = v_uid;
  return v_needs_mail;
end;
$fn$;

revoke all on function public.update_my_account(text, text, boolean, boolean) from public, anon;
grant execute on function public.update_my_account(text, text, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
