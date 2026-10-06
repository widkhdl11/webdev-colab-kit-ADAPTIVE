-- 비밀번호 재설정 링크 만들기(아이디+확인된 이메일 대조)와 휴대폰 번호 바꾸기.
-- 스펙: docs/specs/session-login.md (INV-L10), docs/specs/signup.md (INV-U12)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md — 개인정보 구역을 읽고 쓰는 함수).
-- 마이그레이션 20261006000019_password_reset.sql(재설정 링크 표·번호 바꾼 기록 표)과 0004_signup.sql 이 적용된 DB 에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0013_password_reset_phone_change.sql
-- 되돌리기:
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "begin; drop trigger password_resets_revoke_on_email on pii.account_contacts; drop trigger password_resets_revoke_on_password on auth.users; drop function public.revoke_password_resets_on_email(); drop function public.revoke_password_resets_on_password(); drop function public.request_password_reset(text, text); drop function public.change_my_phone(uuid, text, uuid); drop function public.is_my_current_phone(uuid, text); commit;"
-- 확인 시험(적용 전에는 빨간불, 적용 뒤 초록불 — projects/fankkuk 에서 하나씩):
--   npx vitest run --config vitest.integration.config.mts tests/integration/password-reset.integration.test.ts
--   npx vitest run --config vitest.integration.config.mts tests/integration/phone-change.integration.test.ts
--
-- 무엇을 하나:
--   · request_password_reset(아이디, 이메일) — 아이디의 계정을 찾아, 입력한 이메일이 그 계정의 「확인된」 이메일과 같을 때만
--     재설정 링크를 하나 만들어 (링크 값, 보낼 주소, 닉네임) 한 줄을 돌려준다. 계정이 없거나·이메일이 다르거나·확인된 이메일이 없거나·
--     한 시간 다섯 통을 넘었으면 빈 결과다 — 무엇 때문에 비었는지 돌려주지 않는다(INV-L10: 응답 하나). 확인 대기 이메일은 쓰지 않는다.
--     새 링크를 만들면 그 계정의 살아 있는 이전 링크는 모두 무효가 된다(INV-L11). 표에는 링크의 해시만 둔다.
--     개수 확인과 기록은 계정마다 하나씩만 지나가는 잠금 안에서 한다 — 동시에 온 요청이 한도를 넘지 못한다.
--   · 남은 재설정 링크 무효(보안 리뷰 권고 2026-10-06) — 그 계정의 확인된 이메일이 바뀌거나(연락처 줄) 비밀번호가 바뀌면(로그인 정보 줄)
--     아직 안 쓴 링크를 모두 무효로 한다. 옛 주소의 메일함·바꾸기 전에 받은 메일에 남은 링크로 새 비밀번호를 덮어쓰지 못하게.
--     트리거라 어느 길로 바뀌든(이메일 확인 링크·비밀번호 바꾸기·재설정·관리자) 같이 일어난다. 링크 만들기와 같은 계정 잠금을 잡아,
--     동시에 만들어지던 링크도 바뀐 뒤에 무효가 된다.
--   · change_my_phone(계정, 새 번호, 본인 확인 번호표) — 본인 확인 줄을 잠그고, 확인됐고·안 썼고·확인된 지 10분 안이고·확인한 번호가
--     바꿀 번호와 같을 때만(INV-U1·U2) 연락처 줄의 번호를 바꾸고, 확인을 「씀」으로, 바꾼 기록 한 줄(번호 값 없음)을 남긴다.
--     다른 계정이 쓰는 번호면 FKU02(이미 가입된 번호) — 확인을 통과한 뒤에만 알려 준다(INV-U11). 같은 번호로 두 계정이 동시에 와도
--     번호 유일 제약(0004)으로 하나만 지나간다(INV-U3). 지금 비밀번호 확인은 앱 서버가 이 함수를 부르기 전에 한다.
--     지금 번호와 같은 번호면 FKU03(바꿀 것이 없다). 검사 순서는 계정 → 번호 꼴 → 지금 번호와 같은지 → 본인 확인 → 다른 계정 번호다 —
--     쓴 번호표·10분 지난 번호표에 남의 번호를 넣으면 「이미 가입된 번호」가 아니라 FKU01 이다(INV-U11: 확인을 마친 뒤에만 알려 준다).
--   · is_my_current_phone(계정, 번호) — 그 번호가 그 계정의 지금 번호인가. 앱 서버가 카카오 확인 요청 전에 같은 번호를 거부하려고 묻는다.
--     다른 계정의 번호인지는 알려 주지 않는다.
--   · 함수 모두 앱 서버 키만 실행한다. 계정 ID 는 앱 서버가 세션에서 확인한 ID 만 넘긴다(INV-L3) — 화면 쪽 키로 부르면
--     비밀번호 확인 없이 번호를 바꿀 수 있게 되므로 로그인 키에는 열지 않는다.
-- 오류 코드: 22023 입력 꼴 · FKU01 본인 확인을 쓸 수 없음 · FKU02 이미 가입된 번호 · FKU03 지금 번호와 같음 · 42501 계정 없음
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('public.password_resets') is null or to_regclass('public.phone_change_events') is null then
    raise exception '재설정 링크 표·번호 바꾼 기록 표가 없다 — 마이그레이션 20261006000019_password_reset.sql 을 먼저 적용한다';
  end if;
  if to_regclass('pii.phone_verifications') is null then
    raise exception '본인 확인 표(pii.phone_verifications)가 없다 — 0004_signup.sql 을 먼저 적용한다';
  end if;
end $$;

-- ── 비밀번호 재설정 링크 ─────────────────────────────────

create function public.request_password_reset(p_login_id text, p_email text)
returns table (token text, email text, nickname text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_nickname text;
  v_email text;
  v_token text;
begin
  if p_login_id is null or p_email is null or char_length(p_login_id) > 30 or char_length(p_email) > 254 then
    return;
  end if;
  select p.id, p.nickname into v_account, v_nickname from public.profiles p where p.login_id = btrim(p_login_id);
  if v_account is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('fankkuk.password_reset:' || v_account::text, 0));

  -- 이메일이 바뀌는 중이면 그 처리(무효 트리거)가 같은 잠금을 잡으므로, 여기서 읽는 이메일은 바뀌기 전이거나 바뀐 뒤 둘 중 하나다
  select c.email into v_email from pii.account_contacts c where c.account_id = v_account;
  if v_email is null or lower(v_email) <> lower(btrim(p_email)) then
    return;
  end if;
  if (
    select count(*) from public.password_resets r
     where r.account_id = v_account and r.sent_at > now() - interval '1 hour'
  ) >= 5 then
    return;
  end if;

  update public.password_resets r set revoked_at = now()
   where r.account_id = v_account and r.used_at is null and r.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.password_resets (account_id, token_hash, expires_at)
  values (v_account, extensions.digest(v_token, 'sha256'), now() + interval '1 hour');

  return query select v_token, v_email, v_nickname;
end;
$$;

-- ── 휴대폰 번호 바꾸기 ────────────────────────────────────

create function public.change_my_phone(p_account_id uuid, p_phone text, p_verification_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_ver pii.phone_verifications%rowtype;
  v_constraint text;
begin
  if p_account_id is null or not exists (select 1 from public.profiles p where p.id = p_account_id) then
    raise exception '계정이 없다' using errcode = '42501';
  end if;
  if p_phone is null or p_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception '휴대폰 번호 꼴이 아니다' using errcode = '22023';
  end if;
  if exists (select 1 from pii.account_contacts c where c.account_id = p_account_id and c.phone = p_phone) then
    raise exception '지금 번호와 같다' using errcode = 'FKU03';
  end if;

  select * into v_ver from pii.phone_verifications v where v.id = p_verification_id for update;
  if not found or v_ver.verified_at is null or v_ver.used_at is not null
     or v_ver.verified_at <= now() - interval '10 minutes' or v_ver.phone <> p_phone then
    raise exception '본인 확인을 쓸 수 없다' using errcode = 'FKU01';
  end if;
  if exists (select 1 from pii.account_contacts c where c.phone = p_phone and c.account_id <> p_account_id) then
    raise exception '이미 가입된 번호다' using errcode = 'FKU02';
  end if;

  begin
    insert into pii.account_contacts (account_id, phone) values (p_account_id, p_phone)
    on conflict (account_id) do update set phone = excluded.phone, updated_at = now();
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'account_contacts_phone_unique' then
      raise exception '이미 가입된 번호다' using errcode = 'FKU02';
    end if;
    raise;
  end;

  update pii.phone_verifications set used_at = now() where id = v_ver.id;
  insert into public.phone_change_events (account_id) values (p_account_id);
  return 'changed';
end;
$$;

create function public.is_my_current_phone(p_account_id uuid, p_phone text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from pii.account_contacts c where c.account_id = p_account_id and c.phone = p_phone);
$$;

-- ── 남은 재설정 링크 무효 ──────────────────────────────────

-- 확인된 이메일이 바뀌면(이메일 확인 링크로 새 주소가 확인됨) 그 계정의 안 쓴 링크를 무효로 한다.
create function public.revoke_password_resets_on_email()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.password_reset:' || new.account_id::text, 0));
  update public.password_resets r set revoked_at = now()
   where r.account_id = new.account_id and r.used_at is null and r.revoked_at is null;
  return null;
end;
$$;
create trigger password_resets_revoke_on_email
after update of email on pii.account_contacts
for each row when (old.email is distinct from new.email)
execute function public.revoke_password_resets_on_email();

-- 비밀번호가 바뀌면(바꾸기·재설정·관리자) 그 계정의 안 쓴 링크를 무효로 한다. Auth 는 줄을 고칠 때 다른 칸도 같이 쓰므로
-- 비밀번호 해시 값이 실제로 달라졌을 때만 일어난다.
create function public.revoke_password_resets_on_password()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.password_reset:' || new.id::text, 0));
  update public.password_resets r set revoked_at = now()
   where r.account_id = new.id and r.used_at is null and r.revoked_at is null;
  return null;
end;
$$;
create trigger password_resets_revoke_on_password
after update of encrypted_password on auth.users
for each row when (old.encrypted_password is distinct from new.encrypted_password)
execute function public.revoke_password_resets_on_password();

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.request_password_reset(text, text) from public, anon, authenticated;
revoke all on function public.change_my_phone(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.is_my_current_phone(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_password_resets_on_email() from public, anon, authenticated;
revoke all on function public.revoke_password_resets_on_password() from public, anon, authenticated;
grant execute on function public.request_password_reset(text, text) to service_role;
grant execute on function public.change_my_phone(uuid, text, uuid) to service_role;
grant execute on function public.is_my_current_phone(uuid, text) to service_role;

commit;
