-- 알림톡 링크로 바로 로그인 — 1회용 로그인 토큰 (docs/specs/link-login.md INV-K1·K2, 2026-10-30)
--
-- 1) 토큰 표: 토큰 원문은 없다 — SHA-256 해시(소문자 16진수 64자)·계정·만든 시각·만료 시각·쓴 시각만(INV-K1).
-- 2) 실패 기록 표: 해시 앞 8자·사유(없는 토큰 unknown·이미 씀 used·만료 expired)·시각(INV-K2·K5).
-- 3) 발급 함수(login_link_issue): 보내는 중인 카카오 승인 요청 줄(outbox id)을 받아, 그 줄의 받는 계정을 DB 가 찾아 묶는다.
--    부르는 쪽은 계정을 고르지 못한다(S1e). 해시는 앱이 만들어 넘긴다 — 원문은 DB 에 들어오지 않는다.
-- 4) 쓰기 함수(login_link_consume): 해시를 받아 행을 잠그고 「안 썼고 만료 전이면 쓴 것으로」를 한 번에 — 계정 id 또는 null.
--    같은 해시로 동시에 두 번 와도 둘째는 첫째가 끝날 때까지 기다린 뒤 「이미 씀」을 본다(INV-K2). 시각 판정은 DB 시각(now()).
-- 5) 카카오 템플릿 설정 표에 토큰 링크용 템플릿 코드 칸(login_link_template_code) — 승인 요청 줄에만. 비어 있으면 지금 템플릿으로 보낸다
--    (솔라피 검수 전, 스펙 「바깥에서 해야 하는 일」).
-- 표 둘은 화면 쪽 키도 앱 서버 키도 직접 읽거나 쓰지 못한다 — 두 함수(앱 서버 키 전용)로만 움직인다.
-- 시연용 토큰(scripts/dev-login-link.mjs)은 로컬 DB 에 소유자로 직접 넣는다 — 계정을 골라 발급하는 함수는 어디에도 두지 않는다.

-- ── 유효 시간 ─────────────────────────────────────────────

-- INV-K1: 만든 뒤 30분. 시험은 숫자 대신 이 함수를 부른다
create or replace function public.login_link_ttl()
returns interval
language sql immutable set search_path = ''
as $$ select interval '30 minutes' $$;

-- ── 표 ──────────────────────────────────────────────────

create table public.login_link_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at)
);
create index login_link_tokens_account on public.login_link_tokens (account_id);

create table public.login_link_failures (
  id bigint generated always as identity primary key,
  hash_prefix text not null check (hash_prefix ~ '^[0-9a-f]{8}$'),
  reason text not null check (reason in ('unknown', 'used', 'expired')),
  at timestamptz not null default now()
);

alter table public.login_link_tokens enable row level security;
alter table public.login_link_failures enable row level security;
-- 정책은 만들지 않는다. 앱 서버 키도 표에 직접 닿지 않는다 — 아래 두 함수로만
revoke all on public.login_link_tokens, public.login_link_failures from public, anon, authenticated, service_role;

-- ── 토큰 링크용 템플릿 코드 ────────────────────────────────

alter table public.notification_kakao_templates add column if not exists login_link_template_code text;
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_login_link_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_login_link_check check (
  login_link_template_code is null or (kind = 'approval_request' and login_link_template_code ~ '^[A-Za-z0-9_-]{1,64}$')
);

-- ── 발급 ────────────────────────────────────────────────

-- INV-K1·S1e: 보내는 중인 카카오 승인 요청 줄만. 받는 계정은 그 줄에서 읽는다. 줄이 아니면 false(토큰 없이 보내지 않는다 — 부르는 쪽이 판단).
create or replace function public.login_link_issue(p_outbox_id uuid, p_token_hash text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception '로그인 토큰 해시 꼴이 아니다' using errcode = '22023';
  end if;
  select o.account_id into v_account
  from public.notification_outbox o
  where o.id = p_outbox_id and o.kind = 'approval_request' and o.channel = 'kakao' and o.status = 'sending';
  if v_account is null then
    return false;
  end if;
  insert into public.login_link_tokens (token_hash, account_id, created_at, expires_at)
  values (p_token_hash, v_account, now(), now() + public.login_link_ttl());
  return true;
end $$;

-- ── 쓰기 ────────────────────────────────────────────────

-- INV-K2: 행 잠금 뒤 「안 썼고 만료 전」이면 쓴 시각을 남기고 계정 id. 아니면 사유를 남기고 null.
create or replace function public.login_link_consume(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.login_link_tokens%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into v from public.login_link_tokens t where t.token_hash = p_token_hash for update;
  if not found then
    insert into public.login_link_failures (hash_prefix, reason) values (left(p_token_hash, 8), 'unknown');
    return null;
  end if;
  if v.used_at is not null then
    insert into public.login_link_failures (hash_prefix, reason) values (left(p_token_hash, 8), 'used');
    return null;
  end if;
  if now() >= v.expires_at then
    insert into public.login_link_failures (hash_prefix, reason) values (left(p_token_hash, 8), 'expired');
    return null;
  end if;
  update public.login_link_tokens set used_at = now() where token_hash = p_token_hash;
  return v.account_id;
end $$;

revoke all on function public.login_link_issue(uuid, text), public.login_link_consume(text) from public, anon, authenticated;
grant execute on function public.login_link_issue(uuid, text), public.login_link_consume(text) to service_role;
