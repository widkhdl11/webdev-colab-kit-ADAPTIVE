-- 비밀번호 재설정 링크 표와 링크 확인·사용 함수, 휴대폰 번호 바꾼 기록 표.
-- 스펙: docs/specs/session-login.md (INV-L10·L11), docs/specs/signup.md (INV-U12)
--
-- 여기에는 개인정보 구역(pii)을 읽거나 쓰는 것이 없다. 계정·이메일을 대조해 링크를 만드는 함수와
-- 번호를 바꾸는 함수는 연락처(pii)를 만지므로 사람이 적용하는 supabase/manual/0013_password_reset_phone_change.sql 에 있다.
--
-- 표 둘 다 RLS 를 켜고 정책을 두지 않는다 — 화면 쪽 키로는 읽지도 쓰지도 못하고, 아래 함수와 manual 0013 의 함수만 통한다.

-- ── 재설정 링크 ──────────────────────────────────────────

-- 보낸 재설정 메일 한 통당 한 줄. 링크 값 원문은 두지 않고 SHA-256 해시만 둔다(INV-L11, my-account INV-A7 과 같다).
-- 보낸 시각(sent_at)은 한 계정 한 시간 다섯 통 한도의 기록이기도 하다(INV-L10) — 쓴 줄·무효가 된 줄도 지우지 않는다.
create table public.password_resets (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  token_hash bytea not null unique,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > sent_at)
);
create index password_resets_account_sent on public.password_resets (account_id, sent_at);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from public, anon, authenticated;

-- 링크가 아직 쓸 수 있으면 그 계정의 아이디를 돌려준다(쓰지 않는다). 새 비밀번호가 아이디와 같은지(signup INV-U6)를
-- 링크를 쓰기 전에 보려고 둔다 — 그 검사로 링크가 버려지지 않게. 쓸 수 없는 링크면 빈 값.
create function public.password_reset_login_id(p_token text)
returns text
language sql stable security definer set search_path = ''
as $$
  select p.login_id
    from public.password_resets r
    join public.profiles p on p.id = r.account_id
   where p_token ~ '^[0-9a-f]{64}$'
     and r.token_hash = extensions.digest(p_token, 'sha256')
     and r.used_at is null and r.revoked_at is null and r.expires_at > now();
$$;

-- 링크 확인과 사용 표시를 한 처리에서 한다(INV-L11). 줄을 잠그므로 같은 링크로 동시에 온 두 요청 중 하나만 지나간다.
-- 이미 쓴 링크·무효가 된 링크(새 요청이 나옴)·1시간 지난 링크·없는 링크는 모두 P0002 하나로 거부한다.
-- 계정은 링크가 정한다 — 계정 ID 를 인자로 받지 않는다.
create function public.claim_password_reset(p_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.password_resets%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;
  select * into v_row from public.password_resets r
   where r.token_hash = extensions.digest(p_token, 'sha256') for update;
  if not found or v_row.used_at is not null or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception '쓸 수 없는 링크다' using errcode = 'P0002';
  end if;
  update public.password_resets set used_at = now() where id = v_row.id;
  return v_row.account_id;
end;
$$;

revoke all on function public.password_reset_login_id(text) from public, anon, authenticated;
revoke all on function public.claim_password_reset(text) from public, anon, authenticated;
grant execute on function public.password_reset_login_id(text) to service_role;
grant execute on function public.claim_password_reset(text) to service_role;

-- ── 휴대폰 번호 바꾼 기록 ─────────────────────────────────

-- 번호를 바꿀 때마다 한 줄(signup INV-U12). 누가·언제만 남기고 번호 값은 두지 않는다(주소 등록 기록 INV-P13 과 같은 방식).
-- 계정 표에 묶지 않는다 — 계정을 지워도 기록은 남고, 추가만 되는 표라 계정 삭제가 기록 지우기에 막히지 않게.
create table public.phone_change_events (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  at timestamptz not null default now()
);
create index phone_change_events_account on public.phone_change_events (account_id, at);
alter table public.phone_change_events enable row level security;
revoke all on public.phone_change_events from public, anon, authenticated, service_role;

-- 고치기·지우기·통째로 비우기는 누구도(서비스 키 포함) 못 한다
create function public.phone_change_events_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '휴대폰 번호 바꾼 기록은 추가만 된다' using errcode = '42501';
end $$;
create trigger phone_change_events_no_update before update or delete on public.phone_change_events
for each row execute function public.phone_change_events_append_only();
create trigger phone_change_events_no_truncate before truncate on public.phone_change_events
for each statement execute function public.phone_change_events_append_only();
