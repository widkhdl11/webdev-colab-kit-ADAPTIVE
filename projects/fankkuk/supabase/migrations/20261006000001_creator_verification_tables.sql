-- 크리에이터 본인 확인 — 표와 제약 (creator-verification INV-V1~V15, 승인 카드 d29).
--
-- 표 셋을 새로 만들고 둘을 고친다.
-- - creator_verification_applications: 신청 한 줄 = 한 계정이 한 채널 키로 낸 확인 요청. 코드는 서버가 만든다(INV-V3).
--   상태: issued(코드 받음) · posted(올림) · approved · rejected · withdrawn(거둠) · closed(닫힘) · expired(기간 지남).
--   기간 지남은 읽을 때 계산한다 — issued 인데 발급 7일이 지난 줄. 새 신청과 부딪힐 때만 expired 로 적어 닫는다(INV-V5).
-- - creator_channel_claims: 채널 키마다 한 줄 = 지금 그 채널을 쥔 쪽(살아 있는 신청 또는 확인된 크리에이터, INV-V8).
-- - creator_verification_unlocks: 운영자가 신청 횟수를 풀어 준 기록(INV-V15). 고치기·지우기 금지.
-- - creators: 플랫폼·채널 주소·채널 키 칸을 더한다. 확인됨과 이 칸들은 승인·취소·로그인 확인 함수 안에서만 바뀐다(INV-V6·V7).
-- - creator_verification_events: 반려·닫힘과 신청·주소·코드·확인 방법·사유 목록 값 칸을 더한다(INV-V6·V9·V13).
--   reason 칸은 운영자 메모로 쓴다(운영자 읽기 함수만 돌려준다).
--
-- 개인정보는 없다 — pii 구역은 건드리지 않는다.

-- ── 채널 키 규칙 (INV-V2) ────────────────────────────────

-- 플랫폼별 채널 키 꼴. 키는 이미 소문자로 정리된 값이어야 한다.
create function public.cv_key_valid(p_platform text, p_key text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_key is not null and p_key = lower(p_key) and case p_platform
    -- 유튜브 핸들: 영문 소문자·숫자·한글, 가운데에는 _ - . · 도. 처음·끝은 글자나 숫자. 30자까지, 한글이 없으면 3자 이상.
    when 'youtube' then p_key ~ '^[a-z0-9가-힣]([a-z0-9가-힣_.·-]*[a-z0-9가-힣])?$'
                        and char_length(p_key) <= 30 and (char_length(p_key) >= 3 or p_key ~ '[가-힣]')
    -- 치지직 채널 ID: 16진수 32자
    when 'chzzk' then p_key ~ '^[0-9a-f]{32}$'
    -- SOOP 방송국 아이디 (글자 규칙은 확인 필요 — 스펙 INV-V2 표)
    when 'soop' then p_key ~ '^[a-z0-9_]{3,24}$'
    -- 인스타그램 사용자 이름: 30자까지, 영문·숫자·. _ , . 로 시작·끝 금지, .. 금지, 사이트 경로 이름 금지
    when 'instagram' then p_key ~ '^[a-z0-9._]{1,30}$' and p_key !~ '^\.|\.$|\.\.'
                          and p_key not in ('explore', 'accounts', 'reels', 'reel', 'p', 'stories', 'direct', 'about', 'developer', 'legal', 'tv')
    else false
  end;
$$;

-- 채널 키로 다시 만든 주소 — 저장하는 주소는 언제나 이것이다(브라우저가 보낸 문자열이 아니다).
create function public.cv_channel_url(p_platform text, p_key text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_platform
    when 'youtube' then 'https://www.youtube.com/@' || p_key
    when 'chzzk' then 'https://chzzk.naver.com/' || p_key
    when 'soop' then 'https://www.sooplive.com/station/' || p_key
    when 'instagram' then 'https://www.instagram.com/' || p_key
  end;
$$;

-- 찾기 화면의 채널 칸(creators.channel)에 쓰는 플랫폼 이름 — 시드가 쓰던 값과 같다.
create function public.cv_platform_label(p_platform text)
returns text
language sql immutable set search_path = ''
as $$
  select case p_platform when 'youtube' then '유튜브' when 'chzzk' then '치지직' when 'soop' then 'SOOP' when 'instagram' then '인스타그램' end;
$$;

-- ── 크리에이터 공개 정보 ─────────────────────────────────

alter table public.creators
  add column platform text,
  add column channel_url text,
  add column channel_key text,
  add constraint creators_channel_all_or_none check (
    (platform is null and channel_url is null and channel_key is null)
    or (public.cv_key_valid(platform, channel_key) and channel_url = public.cv_channel_url(platform, channel_key))
  );

-- INV-V6·V7: 확인됨과 플랫폼·채널 칸은 승인·취소·로그인 확인 함수가 켠 표시가 있을 때만 바뀐다.
-- 확인된 상태로 바로 넣는 것도 같다(시드는 표시를 켜고 넣는다).
create function public.cv_change_allowed()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(current_setting('fankkuk.verifying', true), '') = 'on';
$$;

create function public.guard_creator_verification()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.cv_change_allowed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.identity_verified or new.platform is not null then
      raise exception '확인된 크리에이터는 승인 함수로만 생긴다 (INV-V6)' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.identity_verified is distinct from old.identity_verified
     or new.platform is distinct from old.platform
     or new.channel_url is distinct from old.channel_url
     or new.channel_key is distinct from old.channel_key
     or new.channel is distinct from old.channel then
    raise exception '본인 확인 상태와 채널은 승인 함수로만 바뀐다 (INV-V6·V7)' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger creators_verification_guard before insert or update on public.creators
  for each row execute function public.guard_creator_verification();

-- ── 신청 ────────────────────────────────────────────────

create table public.creator_verification_applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles (id),
  platform text not null,
  channel_key text not null,
  channel_url text not null,
  -- INV-V3: 서버가 만든 코드. 신청마다 하나, 겹치지 않는다. 로그인 확인 줄(method = login)에는 코드가 없다.
  code text unique,
  -- INV-V13: code = 인증 코드, login = 플랫폼 로그인
  method text not null check (method in ('code', 'login')),
  status text not null check (status in ('issued', 'posted', 'approved', 'rejected', 'withdrawn', 'closed', 'expired')),
  issued_at timestamptz not null default now(),
  posted_at timestamptz,
  ended_at timestamptz,
  -- 반려·닫힘 사유, 또는 승인됐다 취소된 줄의 취소 사유(목록 값만 — 메모는 기록 표에만 있다, INV-V9)
  reason_code text,
  revoked_at timestamptz,
  constraint cva_channel_shape check (public.cv_key_valid(platform, channel_key) and channel_url = public.cv_channel_url(platform, channel_key)),
  constraint cva_code_shape check (
    (method = 'code' and code ~ '^FK-[2-9A-HJ-NP-Z]{4}-[0-9]{2}$') or (method = 'login' and code is null and status = 'approved')
  ),
  constraint cva_posted_has_time check (status <> 'posted' or posted_at is not null),
  constraint cva_reason_by_status check (
    (status = 'rejected' and reason_code in ('code_not_found', 'channel_unreachable', 'profile_mismatch', 'other'))
    or (status = 'closed' and reason_code = 'owner_confirmed_elsewhere')
    or (status = 'approved' and (reason_code is null or reason_code in ('code_removed', 'not_owner_confirmed', 'policy_violation', 'other')))
    or (status in ('issued', 'posted', 'withdrawn', 'expired') and reason_code is null)
  )
);

-- INV-V4: 계정마다 코드 받음·올림 상태 신청은 하나
create unique index cva_one_open_per_account on public.creator_verification_applications (account_id) where status in ('issued', 'posted');
create index cva_account_channel on public.creator_verification_applications (account_id, platform, channel_key);

-- INV-V3·V6: 코드·채널·발급 시각은 고칠 수 없고, 끝난 신청은 다시 살아나지 않는다. 지우기도 막는다.
create function public.guard_verification_application()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception '신청은 지울 수 없다' using errcode = '42501';
  end if;
  if new.code is distinct from old.code or new.account_id <> old.account_id or new.platform <> old.platform
     or new.channel_key <> old.channel_key or new.channel_url <> old.channel_url or new.method <> old.method
     or new.issued_at <> old.issued_at or new.id <> old.id then
    raise exception '신청의 코드·채널·발급 시각은 고칠 수 없다 (INV-V3)' using errcode = '42501';
  end if;
  if old.status in ('approved', 'rejected', 'withdrawn', 'closed', 'expired') and new.status <> old.status then
    raise exception '끝난 신청은 다시 살아나지 않는다 (INV-V6·V9)' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger cva_guard before update or delete on public.creator_verification_applications
  for each row execute function public.guard_verification_application();

-- ── 채널 점유 (INV-V8) ───────────────────────────────────

create table public.creator_channel_claims (
  platform text not null,
  channel_key text not null,
  kind text not null check (kind in ('application', 'verified')),
  account_id uuid references public.profiles (id),
  creator_id uuid references public.creators (id),
  application_id uuid unique references public.creator_verification_applications (id),
  claimed_at timestamptz not null default now(),
  -- 채널 키마다 한 줄 — 동시에 온 두 신청이 둘 다 확인을 통과해도 둘째 줄은 여기서 막힌다
  primary key (platform, channel_key),
  constraint ccc_holder check (
    (kind = 'application' and application_id is not null and account_id is not null and creator_id is null)
    or (kind = 'verified' and creator_id is not null)
  ),
  constraint ccc_key_shape check (public.cv_key_valid(platform, channel_key))
);
-- 크리에이터 한 명에 확인된 채널 하나
create unique index ccc_one_verified_per_creator on public.creator_channel_claims (creator_id) where kind = 'verified';

-- ── 횟수 풀기 기록 (INV-V15) ─────────────────────────────

create table public.creator_verification_unlocks (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  acted_by uuid not null references public.profiles (id),
  account_id uuid not null references public.profiles (id),
  platform text not null,
  channel_key text not null,
  memo text not null default '' check (char_length(memo) <= 200)
);
create index cvu_account_channel on public.creator_verification_unlocks (account_id, platform, channel_key, at desc);

create trigger cvu_no_update before update on public.creator_verification_unlocks
  for each row execute function public.append_only_log();
create trigger cvu_no_delete before delete on public.creator_verification_unlocks
  for each row execute function public.append_only_log();

-- ── 결정 기록 ────────────────────────────────────────────

alter table public.creator_verification_events
  drop constraint creator_verification_events_action_check,
  add constraint creator_verification_events_action_check check (action in ('approve', 'reject', 'close', 'revoke')),
  add column application_id uuid references public.creator_verification_applications (id),
  add column channel_url text,
  add column code text,
  add column method text check (method in ('code', 'login')),
  add column reason_code text;
create index creator_verification_events_application_idx on public.creator_verification_events (application_id);

-- ── 직접 접근 차단 (INV-V11) ─────────────────────────────

alter table public.creator_verification_applications enable row level security;
alter table public.creator_channel_claims enable row level security;
alter table public.creator_verification_unlocks enable row level security;
revoke all on public.creator_verification_applications from anon, authenticated;
revoke all on public.creator_channel_claims from anon, authenticated;
revoke all on public.creator_verification_unlocks from anon, authenticated;

revoke all on function public.cv_key_valid(text, text) from public, anon, authenticated;
revoke all on function public.cv_channel_url(text, text) from public, anon, authenticated;
revoke all on function public.cv_platform_label(text) from public, anon, authenticated;
revoke all on function public.cv_change_allowed() from public, anon, authenticated;
revoke all on function public.guard_creator_verification() from public, anon, authenticated;
revoke all on function public.guard_verification_application() from public, anon, authenticated;

-- 반환 칸이 바뀌는 읽기 함수는 다음 파일에서 다시 만든다
drop function public.admin_creator_verification_events();
