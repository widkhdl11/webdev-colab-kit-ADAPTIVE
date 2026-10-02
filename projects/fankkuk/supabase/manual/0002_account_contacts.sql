-- 내 정보 — 연락처(이메일·휴대폰)와 이메일 확인. 스펙: docs/specs/my-account.md (INV-A1~A8)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 0001_pii_schema.sql 다음에 적용한다.
--
-- 적용(로컬): docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/manual/0002_account_contacts.sql
-- 로컬 시험 계정 연락처: 이어서 0002_account_contacts.local-seed.sql (호스팅 DB 에는 넣지 않는다)
--
-- 읽기·고치기 함수는 사람 ID 를 받지 않고 auth.uid() 만 쓴다(INV-A3).
-- 확인 링크를 만드는 함수와 알림 받을 주소를 고르는 함수만 앱 서버 키 전용이고 계정 ID 를 받는다 —
-- 로그인 사용자가 링크 값을 받아 가면 메일을 열지 않고도 남의 주소를 「확인」할 수 있기 때문이다(INV-A7).
-- 앱 서버는 이 둘에 세션에서 확인한 ID(readVerifiedUserId)만 넘긴다(INV-L3).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않으니 고쳐서 다시 적용하면 된다.

begin;

-- ── 표 ──────────────────────────────────────────────────

-- 계정당 한 줄. 이메일 = 확인된 이메일(INV-A7). 휴대폰은 숫자만(01012345678).
create table pii.account_contacts (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  pending_email text check (pending_email is null or (char_length(pending_email) <= 254 and pending_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone text check (phone is null or phone ~ '^01[016789][0-9]{7,8}$'),
  notify_kakao boolean not null default true,
  notify_email boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 보낸 확인 메일 한 통당 한 줄. 링크 값 원문은 두지 않고 SHA-256 해시만 둔다(INV-A7).
-- 보낸 시각(sent_at)은 한 시간 다섯 통 한도의 기록이기도 하다(INV-A8) — 무효가 된 줄도 지우지 않는다.
create table pii.email_verifications (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  token_hash bytea not null unique,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index email_verifications_account_sent on pii.email_verifications (account_id, sent_at);

alter table pii.account_contacts enable row level security;
alter table pii.email_verifications enable row level security;
-- 정책은 만들지 않는다. 화면 쪽 키는 구역 사용 권한부터 없고(0001), 아래 함수만 통한다(INV-A1).
revoke all on pii.account_contacts, pii.email_verifications from public, anon, authenticated;

-- 이미 있는 계정마다 빈 줄 하나. 새 계정은 고치기 함수가 처음 저장할 때 만든다.
insert into pii.account_contacts (account_id) select id from public.profiles;

-- ── 읽기: 내 정보 ────────────────────────────────────────

-- 휴대폰은 가운데 넷을 가린 모양만 내보낸다(INV-A2). 전체 번호는 이 함수 밖으로 나가지 않는다.
create function public.my_account()
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
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  return query
    select p.login_id, p.nickname, c.email, c.pending_email,
           case when c.phone is null then null
                else left(c.phone, 3) || '-****-' || right(c.phone, 4) end,
           coalesce(c.notify_kakao, true), coalesce(c.notify_email, true)
    from public.profiles p
    left join pii.account_contacts c on c.account_id = p.id
    where p.id = v_uid;
end;
$$;

-- ── 쓰기: 내 정보 고치기 ──────────────────────────────────

-- 고치는 칸은 닉네임·알림 둘·확인 대기 이메일뿐이다(INV-A4). 확인된 이메일·휴대폰·아이디·역할은 여기서 바뀌지 않는다.
-- 이메일이 확인된 이메일과 다르면 확인 대기로 저장하고 true 를 돌려준다 — 앱 서버가 이어서 확인 메일을 보낸다.
-- 확인된 이메일과 같으면 확인 대기를 건드리지 않는다(닉네임만 고친 저장이 대기 중인 확인을 지우지 않게).
-- 검사(INV-A5)를 모두 통과한 뒤에만 쓴다 — 하나라도 틀리면 아무 칸도 바뀌지 않는다.
-- 한 시간에 다섯 통을 이미 보냈으면 확인 대기도 바꾸지 않고 거부한다(INV-A8, 오류 코드 FK429).
create function public.update_my_account(p_nickname text, p_email text, p_notify_kakao boolean, p_notify_email boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := btrim(coalesce(p_nickname, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_current text;
  v_needs_mail boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if char_length(v_nickname) not between 1 and 12 then
    raise exception '닉네임은 1~12자다' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception '이메일 꼴이 아니다' using errcode = '22023';
  end if;
  if p_notify_kakao is null or p_notify_email is null then
    raise exception '알림 설정이 비었다' using errcode = '22023';
  end if;

  insert into pii.account_contacts (account_id) values (v_uid) on conflict (account_id) do nothing;
  -- 같은 계정의 저장·확인 메일 발급이 한 줄씩 차례로 지나가게 잠근다(INV-A8 개수 확인).
  select c.email into v_current from pii.account_contacts c where c.account_id = v_uid for update;

  v_needs_mail := v_current is null or lower(v_current) <> lower(v_email);
  if v_needs_mail and (
    select count(*) from pii.email_verifications v
    where v.account_id = v_uid and v.sent_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception '확인 메일 한도를 넘었다' using errcode = 'FK429';
  end if;

  update public.profiles set nickname = v_nickname where id = v_uid;
  update pii.account_contacts
     set notify_kakao = p_notify_kakao,
         notify_email = p_notify_email,
         pending_email = case when v_needs_mail then v_email else pending_email end,
         updated_at = now()
   where account_id = v_uid;
  return v_needs_mail;
end;
$$;

-- ── 쓰기(앱 서버 전용): 확인 링크 만들기 ──────────────────

-- 확인 대기 이메일에 묶인 링크 값을 새로 만들어 돌려준다. 이전 링크는 모두 무효(INV-A7).
-- 링크 값은 DB 가 만들고 해시만 남긴다. 돌려주는 닉네임은 메일 본문용(INV-A8 — 본문에는 링크와 닉네임만).
-- 보낸 기록과 개수 확인은 같은 잠금 안에서 한 번에 한다(INV-A8).
create function public.issue_email_verification(p_account_id uuid)
returns table (token text, email text, nickname text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_pending text;
  v_token text;
begin
  select c.pending_email into v_pending from pii.account_contacts c where c.account_id = p_account_id for update;
  if v_pending is null then
    raise exception '확인 대기 이메일이 없다' using errcode = 'P0002';
  end if;
  if (
    select count(*) from pii.email_verifications v
    where v.account_id = p_account_id and v.sent_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception '확인 메일 한도를 넘었다' using errcode = 'FK429';
  end if;

  update pii.email_verifications v set revoked_at = now()
   where v.account_id = p_account_id and v.used_at is null and v.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into pii.email_verifications (account_id, email, token_hash, expires_at)
  values (p_account_id, v_pending, extensions.digest(v_token, 'sha256'), now() + interval '24 hours');

  return query
    select v_token, v_pending, p.nickname from public.profiles p where p.id = p_account_id;
end;
$$;

-- ── 쓰기: 링크 확인 ──────────────────────────────────────

-- 링크를 연 사람이 그 링크의 계정으로 로그인해 있어야 한다. 한 번만, 24시간 안에, 무효가 안 된 링크만,
-- 그리고 그 링크의 주소가 아직 확인 대기 이메일일 때만 확인된 이메일로 옮긴다(INV-A7).
-- 거부 사유는 하나로 묶는다 — 어느 조건에서 떨어졌는지 알려 주면 남의 링크를 시험하는 데 쓰인다.
create function public.confirm_my_email(p_token text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row pii.email_verifications%rowtype;
  v_pending text;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;

  select * into v_row from pii.email_verifications v
   where v.token_hash = extensions.digest(p_token, 'sha256') for update;
  if not found or v_row.account_id <> v_uid or v_row.used_at is not null
     or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;

  select c.pending_email into v_pending from pii.account_contacts c where c.account_id = v_uid for update;
  if v_pending is null or v_pending <> v_row.email then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;

  update pii.account_contacts set email = v_row.email, pending_email = null, updated_at = now() where account_id = v_uid;
  update pii.email_verifications set used_at = now() where id = v_row.id;
  return v_row.email;
end;
$$;

-- ── 읽기(앱 서버 전용): 알림 메일 받을 주소 ─────────────────

-- 배송 소식·알림 메일은 확인된 이메일로만 간다(INV-A7). 이메일 알림을 껐거나 확인된 이메일이 없으면 null.
create function public.notification_email(p_account_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select c.email from pii.account_contacts c where c.account_id = p_account_id and c.notify_email;
$$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.my_account() from public, anon;
revoke all on function public.update_my_account(text, text, boolean, boolean) from public, anon;
revoke all on function public.confirm_my_email(text) from public, anon;
revoke all on function public.issue_email_verification(uuid) from public, anon, authenticated;
revoke all on function public.notification_email(uuid) from public, anon, authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.update_my_account(text, text, boolean, boolean) to authenticated;
grant execute on function public.confirm_my_email(text) to authenticated;
grant execute on function public.issue_email_verification(uuid) to service_role;
grant execute on function public.notification_email(uuid) to service_role;

commit;
