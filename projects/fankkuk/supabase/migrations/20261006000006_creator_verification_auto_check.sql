-- 크리에이터 본인 확인 — 확인 방법을 API 여부로 가른 뒤의 DB 쪽 (creator-verification INV-V2 「API 확인」·V9·V13·V16, 결정 2026-10-06).
-- 앞 파일(20261006000001~3)은 고치지 않고 이 파일에서 더하고 바꾼다.
--
-- 1) 플랫폼의 「API 확인」 여부를 표로 둔다 — 유튜브·치지직·인스타그램 있음, SOOP 없음(INV-V2 표). 로그인 확인·자동 확인 함수가 이 표를 본다.
-- 2) 확인 방법 값에 「코드 자동 확인」(auto_code)을 더한다 — 결정 기록에만 적힌다(INV-V13). 신청 줄의 방법 칸은 「인증 코드」 그대로다
--    (자동 확인은 인증 코드 신청을 승인하는 길이고, 신청 횟수 INV-V15 도 코드 신청으로 센다). 읽기 함수는 승인 기록의 방법을 보여 준다.
-- 3) 승인 취소 사유에서 「채널에서 코드가 사라짐」(code_removed)을 빼고 「채널이 없어졌거나 다른 사람에게 넘어감」(channel_gone)을 넣는다(INV-V9).
--    신청 표 제약은 NOT VALID 로 바꾼다 — 이미 code_removed 가 든 줄(2026-10-06 로컬 0줄, 운영 전)이 있어도 마이그레이션이 실패하지 않고,
--    새로 쓰거나 고치는 줄부터 새 목록을 지킨다. 함수가 받는 목록은 새 값뿐이다.
-- 4) 코드 자동 확인(INV-V16) — 함수 둘, 모두 서버 관리자 키 전용:
--    ① claim_creator_verification_auto_check(계정, 신청) — 앱 서버가 플랫폼 API 를 부르기 **전에** 부른다. 「마지막 확인 시각」이 1분 넘게 지났을 때만
--       갱신되는 조건부 update 한 번으로 1분 제한을 잡고, 읽을 채널 키와 찾을 코드를 돌려준다(브라우저가 보낸 값이 아니다).
--    ② confirm_creator_verification_auto_check(신청, 찾았나) — 소개란 글은 받지 않는다. 신청 행을 잠근 뒤 상태(코드 받음)·기한·플랫폼 「있음」을
--       다시 보고, 찾았으면 운영자 승인과 같은 처리(INV-V7)로 승인한다. 못 찾았으면 아무것도 바꾸지 않는다.
--    자동 확인은 발급 시각·7일 기한을 다시 시작하지 않는다(발급 시각 칸은 앞 파일의 트리거가 고치지 못하게 막고 있다).
-- 오류 코드(앞 파일에 더함): FKV14 자동 확인을 하지 않는 플랫폼 · FKV15 1분 안에 다시 확인

-- ── 1) 플랫폼 「API 확인」 (INV-V2 표) ─────────────────────

create table public.creator_verification_platforms (
  platform text primary key check (platform in ('youtube', 'chzzk', 'soop', 'instagram')),
  api_check boolean not null
);
insert into public.creator_verification_platforms (platform, api_check) values
  ('youtube', true), ('chzzk', true), ('instagram', true), ('soop', false);

alter table public.creator_verification_platforms enable row level security;
revoke all on public.creator_verification_platforms from anon, authenticated;

create function public.cv_platform_has_api(p_platform text)
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((select p.api_check from public.creator_verification_platforms p where p.platform = p_platform), false);
$$;

-- 화면이 「○○로 확인하기」·「코드로 확인하기」를 보일지 정하는 데 쓴다. 개인 정보가 없는 플랫폼 성질이다.
-- 판정은 함수들이 다시 한다 — 이 읽기는 안내일 뿐이다.
create function public.creator_verification_platforms()
returns table (platform text, api_check boolean)
language sql stable security definer set search_path = ''
as $$
  select p.platform, p.api_check from public.creator_verification_platforms p order by p.platform;
$$;

-- ── 2) 확인 방법 「코드 자동 확인」 (INV-V13) ────────────────

alter table public.creator_verification_events
  drop constraint creator_verification_events_method_check,
  add constraint creator_verification_events_method_check check (method in ('code', 'auto_code', 'login'));

-- 신청이 어느 방법으로 승인됐는지 — 승인 기록이 있으면 그 방법, 없으면 신청 줄의 방법
create function public.cv_shown_method(p_application_id uuid, p_method text)
returns text
language sql stable set search_path = ''
as $$
  select coalesce(
    (select e.method from public.creator_verification_events e
     where e.application_id = p_application_id and e.action = 'approve' order by e.id desc limit 1),
    p_method);
$$;

-- ── 3) 승인 취소 사유 (INV-V9) ───────────────────────────

alter table public.creator_verification_applications
  drop constraint cva_reason_by_status,
  add constraint cva_reason_by_status check (
    (status = 'rejected' and reason_code in ('code_not_found', 'channel_unreachable', 'profile_mismatch', 'other'))
    or (status = 'closed' and reason_code = 'owner_confirmed_elsewhere')
    or (status = 'approved' and (reason_code is null or reason_code in ('channel_gone', 'not_owner_confirmed', 'policy_violation', 'other')))
    or (status in ('issued', 'posted', 'withdrawn', 'expired') and reason_code is null)
  ) not valid;

-- 1분 제한(INV-V16)의 「마지막 확인 시각」
alter table public.creator_verification_applications add column last_auto_check_at timestamptz;

-- ── 승인 한 처리 — 기록에 적을 확인 방법을 받는다 (INV-V7·V13) ──

-- 20261006000002 의 cv_grant 와 같고, 기록의 확인 방법만 인자로 받는다.
create function public.cv_grant_by(p_app_id uuid, p_creator_id uuid, p_actor uuid, p_method text)
returns void
language plpgsql volatile set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
begin
  update public.creator_verification_applications a
  set status = 'approved', ended_at = coalesce(a.ended_at, now())
  where a.id = p_app_id
  returning * into v_app;

  delete from public.creator_channel_claims k
  where k.creator_id = p_creator_id and k.kind = 'verified'
    and not (k.platform = v_app.platform and k.channel_key = v_app.channel_key);

  update public.creator_channel_claims k
  set kind = 'verified', account_id = v_app.account_id, creator_id = p_creator_id, claimed_at = now()
  where k.platform = v_app.platform and k.channel_key = v_app.channel_key and k.application_id = v_app.id;
  if not found then
    insert into public.creator_channel_claims (platform, channel_key, kind, account_id, creator_id, application_id)
    values (v_app.platform, v_app.channel_key, 'verified', v_app.account_id, p_creator_id, v_app.id);
  end if;

  perform set_config('fankkuk.verifying', 'on', true);
  update public.creators c
  set identity_verified = true, platform = v_app.platform, channel_url = v_app.channel_url, channel_key = v_app.channel_key,
      channel = public.cv_platform_label(v_app.platform)
  where c.id = p_creator_id;
  perform set_config('fankkuk.verifying', '', true);

  insert into public.creator_verification_events (creator_id, acted_by, action, application_id, channel_url, code, method)
  values (p_creator_id, p_actor, 'approve', v_app.id, v_app.channel_url, v_app.code, p_method);
end $$;

-- 운영자 승인·로그인 확인은 신청 줄의 방법(인증 코드·플랫폼 로그인)을 그대로 적는다
create or replace function public.cv_grant(p_app_id uuid, p_creator_id uuid, p_actor uuid)
returns void
language plpgsql volatile set search_path = ''
as $$
begin
  perform public.cv_grant_by(p_app_id, p_creator_id, p_actor,
    (select a.method from public.creator_verification_applications a where a.id = p_app_id));
end $$;

-- ── 승인 취소 — 새 사유 목록 (INV-K10·V9·V10) ───────────────
-- 20261006000002 의 admin_revoke_creator 와 같고, 받는 사유 목록만 바꿨다.

create or replace function public.admin_revoke_creator(p_creator_id uuid, p_reason_code text, p_memo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_claim public.creator_channel_claims;
  v_open public.creator_verification_applications;
  v_granted public.creator_verification_applications;
  v_memo text := btrim(coalesce(p_memo, ''));
begin
  if not public.is_operator() then
    raise exception '운영자만 취소한다' using errcode = '42501';
  end if;
  perform public.cv_check_reason(p_reason_code, array['channel_gone', 'not_owner_confirmed', 'policy_violation', 'other'], v_memo);
  select * into v_creator from public.creators c where c.id = p_creator_id for no key update;
  if not found then
    raise exception '없는 크리에이터다' using errcode = 'P0002';
  end if;
  if not v_creator.identity_verified then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;

  select * into v_claim from public.creator_channel_claims k where k.creator_id = p_creator_id and k.kind = 'verified';
  if found then
    perform public.cv_lock_channel(v_claim.platform, v_claim.channel_key);
    delete from public.creator_channel_claims k where k.platform = v_claim.platform and k.channel_key = v_claim.channel_key;
    if v_claim.application_id is not null then
      update public.creator_verification_applications a set reason_code = p_reason_code, revoked_at = now()
      where a.id = v_claim.application_id
      returning * into v_granted;
    end if;
  end if;

  if v_creator.profile_id is not null then
    for v_open in
      select * from public.creator_verification_applications a where a.account_id = v_creator.profile_id and a.status in ('issued', 'posted')
    loop
      perform public.cv_lock_channel(v_open.platform, v_open.channel_key);
      if public.cv_end_application(v_open.id, 'rejected', 'other', true) then
        insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code)
        values (p_creator_id, auth.uid(), 'reject', '승인 취소로 함께 끝남', v_open.id, v_open.channel_url, v_open.code, v_open.method, 'other');
      else
        perform public.cv_end_application(v_open.id, 'expired', null, false);
      end if;
    end loop;
  end if;

  perform set_config('fankkuk.verifying', 'on', true);
  update public.creators c set identity_verified = false where c.id = p_creator_id;
  perform set_config('fankkuk.verifying', '', true);

  insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code)
  values (p_creator_id, auth.uid(), 'revoke', v_memo, v_granted.id, v_creator.channel_url, v_granted.code,
          public.cv_shown_method(v_granted.id, v_granted.method), p_reason_code);
end $$;

-- ── 로그인 확인 — 받는 플랫폼을 표에서 (INV-V14) ────────────
-- 20261006000002 의 confirm_creator_channel_by_login 과 같고, 첫 검사만 「API 확인」 표를 본다.

create or replace function public.confirm_creator_channel_by_login(p_account_id uuid, p_platform text, p_channel_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_claim public.creator_channel_claims;
  v_holder public.creator_verification_applications;
  v_open public.creator_verification_applications;
  v_loser uuid;
  v_app public.creator_verification_applications;
begin
  if not public.cv_platform_has_api(p_platform) or not public.cv_key_valid(p_platform, p_channel_key) then
    raise exception '로그인 확인을 받는 플랫폼·채널 키가 아니다' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_account_id and p.role = 'creator') then
    raise exception '크리에이터 계정이 아니다' using errcode = '42501';
  end if;
  select * into v_creator from public.creators c where c.profile_id = p_account_id for no key update;
  if not found then
    raise exception '크리에이터 공개 정보가 없다' using errcode = 'P0002';
  end if;

  perform public.cv_lock_channel(p_platform, p_channel_key);
  select * into v_claim from public.creator_channel_claims k where k.platform = p_platform and k.channel_key = p_channel_key for no key update;
  if found and v_claim.kind = 'verified' then
    if v_claim.creator_id = v_creator.id then
      raise exception '이미 처리됐다' using errcode = '55000';
    end if;
    raise exception '이미 등록한 채널이에요. 1:1 문의로 알려 주세요' using errcode = 'FKV05';
  end if;
  if found then
    select * into v_holder from public.creator_verification_applications a where a.id = v_claim.application_id for no key update;
    if v_holder.account_id = p_account_id then
      if not public.cv_end_application(v_holder.id, 'withdrawn', null, true) then
        perform public.cv_end_application(v_holder.id, 'expired', null, false);
      end if;
    elsif public.cv_end_application(v_holder.id, 'closed', 'owner_confirmed_elsewhere', true) then
      select c.id into v_loser from public.creators c where c.profile_id = v_holder.account_id;
      insert into public.creator_verification_events (creator_id, acted_by, action, application_id, channel_url, code, method, reason_code)
      values (v_loser, p_account_id, 'close', v_holder.id, v_holder.channel_url, v_holder.code, v_holder.method, 'owner_confirmed_elsewhere');
    else
      perform public.cv_end_application(v_holder.id, 'expired', null, false);
    end if;
  end if;

  for v_open in
    select * from public.creator_verification_applications a where a.account_id = p_account_id and a.status in ('issued', 'posted')
  loop
    perform public.cv_lock_channel(v_open.platform, v_open.channel_key);
    if not public.cv_end_application(v_open.id, 'withdrawn', null, true) then
      perform public.cv_end_application(v_open.id, 'expired', null, false);
    end if;
  end loop;

  insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status, ended_at)
  values (p_account_id, p_platform, p_channel_key, public.cv_channel_url(p_platform, p_channel_key), null, 'login', 'approved', now())
  returning * into v_app;
  perform public.cv_grant(v_app.id, v_creator.id, p_account_id);
end $$;

-- ── 4) 코드 자동 확인 (INV-V16) ───────────────────────────

create function public.cv_auto_check_interval()
returns interval
language sql immutable set search_path = ''
as $$ select interval '1 minute'; $$;

-- ① 1분 제한 잡기. 앱 서버가 플랫폼 API 를 부르기 전에 부른다. 계정은 앱 서버가 로그인 토큰으로 확인한 사람(INV-L2).
-- 조건을 모두 update 의 where 에 둔다 — 동시에 두 번 와도 늦은 쪽은 앞의 갱신을 본 뒤 조건에 걸린다(앱 서버가 여러 대여도 같다).
create function public.claim_creator_verification_auto_check(p_account_id uuid, p_application_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
begin
  update public.creator_verification_applications a
  set last_auto_check_at = now()
  where a.id = p_application_id
    and a.account_id = p_account_id
    and a.method = 'code'
    and a.status = 'issued'
    and a.issued_at > now() - public.cv_post_window()
    and public.cv_platform_has_api(a.platform)
    and (a.last_auto_check_at is null or a.last_auto_check_at <= now() - public.cv_auto_check_interval())
  returning * into v_app;
  if found then
    return jsonb_build_object('platform', v_app.platform, 'channel_key', v_app.channel_key, 'code', v_app.code);
  end if;

  -- 왜 잡지 못했는지
  v_app := null;
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id and a.account_id = p_account_id;
  if v_app.id is null then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  if not public.cv_platform_has_api(v_app.platform) then
    raise exception '이 플랫폼은 자동 확인을 하지 않아요. 「확인 요청」을 눌러 주세요' using errcode = 'FKV14';
  end if;
  if v_app.method <> 'code' or v_app.status <> 'issued' then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  if v_app.issued_at <= now() - public.cv_post_window() then
    raise exception '확인 기한이 지났어요' using errcode = 'FKV08';
  end if;
  raise exception '잠시 뒤 다시 눌러 주세요' using errcode = 'FKV15';
end $$;

-- ② 찾았으면 승인. 잠그는 순서는 운영자 승인과 같다: ① 공개 정보 행 → ② 채널 키 → ③ 신청 행.
create function public.confirm_creator_verification_auto_check(p_application_id uuid, p_found boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
  v_creator public.creators;
begin
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_app.account_id for no key update;
  perform public.cv_lock_channel(v_app.platform, v_app.channel_key);
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id for no key update;

  if not public.cv_platform_has_api(v_app.platform) then
    raise exception '이 플랫폼은 자동 확인을 하지 않아요. 「확인 요청」을 눌러 주세요' using errcode = 'FKV14';
  end if;
  if v_app.method <> 'code' or v_app.status <> 'issued' or v_creator.id is null then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  if v_app.issued_at <= now() - public.cv_post_window() then
    raise exception '확인 기한이 지났어요' using errcode = 'FKV08';
  end if;
  -- 못 찾았으면 아무것도 바꾸지 않는다 — 실패로 세지 않고, 발급 시각·기한도 그대로다
  if not coalesce(p_found, false) then
    return 'not_found';
  end if;
  perform public.cv_grant_by(v_app.id, v_creator.id, v_app.account_id, 'auto_code');
  return 'approved';
end $$;

-- ── 읽기 — 승인 기록의 확인 방법을 보여 준다 (INV-V11·V13) ────
-- 반환 칸은 20261006000002 와 같다. method 칸만 승인 기록의 방법으로.

create or replace function public.my_creator_verifications()
returns table (
  id uuid, platform text, channel_url text, code text, method text, status text,
  issued_at timestamptz, post_deadline timestamptz, reason_code text, remaining_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.platform, a.channel_url, a.code, public.cv_shown_method(a.id, a.method), public.cv_shown_status(a.status, a.issued_at),
         a.issued_at, case when a.method = 'code' then a.issued_at + public.cv_post_window() end,
         a.reason_code, greatest(0, 3 - public.cv_failure_count(a.account_id, a.platform, a.channel_key))
  from public.creator_verification_applications a
  where a.account_id = auth.uid()
  order by a.issued_at desc, a.id;
$$;

create or replace function public.admin_creator_verifications()
returns table (
  id uuid, nickname text, login_id text, creator_name text, channel_title text, platform text, channel_url text,
  code text, method text, status text, issued_at timestamptz, posted_at timestamptz, used_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, p.nickname, p.login_id, c.name, c.channel_title, a.platform, a.channel_url, a.code, public.cv_shown_method(a.id, a.method),
         public.cv_shown_status(a.status, a.issued_at), a.issued_at, a.posted_at,
         public.cv_failure_count(a.account_id, a.platform, a.channel_key)
  from public.creator_verification_applications a
  join public.profiles p on p.id = a.account_id
  left join public.creators c on c.profile_id = a.account_id
  where public.is_operator()
  order by (a.status = 'posted') desc, a.issued_at desc, a.id
  limit 500;
$$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.cv_platform_has_api(text) from public, anon, authenticated;
revoke all on function public.cv_shown_method(uuid, text) from public, anon, authenticated;
revoke all on function public.cv_grant_by(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cv_auto_check_interval() from public, anon, authenticated;

revoke all on function public.creator_verification_platforms() from public, anon;
grant execute on function public.creator_verification_platforms() to authenticated;

-- INV-V16: 로그인한 사용자 권한으로는 부를 수 없다(INV-V14 의 로그인 확인 함수와 같다)
revoke all on function public.claim_creator_verification_auto_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_creator_verification_auto_check(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_creator_verification_auto_check(uuid, uuid) to service_role;
grant execute on function public.confirm_creator_verification_auto_check(uuid, boolean) to service_role;
