-- 크리에이터 본인 확인 — 함수 (creator-verification INV-V1~V15, admin-console INV-K10, signup INV-U5).
-- 이 파일은 create or replace 와 권한 문장만 담는다(앞 파일 20261006000001 이 표를 만든다).
--
-- 잠그는 순서 — 모든 쓰기 함수가 같은 방향으로 잡는다:
--   ① 크리에이터 공개 정보 행(계정 단위, for no key update — 기록 줄의 외래 키 확인과 부딪히지 않게) → ② 채널 키 잠금(cv_lock_channel) → ③ 신청 행.
--   선물 등록은 ① 을 for share 로 잡는다 — 이사 신청과 등록이 줄을 선다(INV-V12).
--   로그인 확인은 자기 ① → ② → 다른 계정의 신청 행 순서다(다른 계정의 ① 은 잡지 않는다).
-- 오류 코드: 42501 권한 · 22023 입력 꼴 · P0002 없음 · 55000 이미 처리됨 ·
--   FKV02 받지 않는 플랫폼(1:1 문의) · FKV03 이미 진행 중인 신청 · FKV04 신청 횟수 다 씀 · FKV05 이미 등록한 채널 ·
--   FKV06 이미 확인중인 채널 · FKV07 다시 받기 불가(횟수) · FKV08 올리기 기한 지남 · FKV10 채널 이사 중 ·
--   FKV11 신청 없는 승인 · FKV13 지금 확인된 자기 채널

-- ── 공용 ────────────────────────────────────────────────

-- 올리기 기한(INV-V5 a). 운영자 확인에는 기한이 없다(INV-V5 b).
create or replace function public.cv_post_window()
returns interval
language sql immutable set search_path = ''
as $$ select interval '7 days'; $$;

-- 살아 있는 신청 = 기간이 지나지 않은 코드 받음, 또는 올림
create or replace function public.cv_is_live(p_status text, p_issued_at timestamptz)
returns boolean
language sql stable set search_path = ''
as $$
  select p_status = 'posted' or (p_status = 'issued' and p_issued_at > now() - public.cv_post_window());
$$;

-- 화면에 보이는 상태 — 기간 지남은 읽을 때 계산한다
create or replace function public.cv_shown_status(p_status text, p_issued_at timestamptz)
returns text
language sql stable set search_path = ''
as $$
  select case when p_status = 'issued' and p_issued_at <= now() - public.cv_post_window() then 'expired' else p_status end;
$$;

create or replace function public.cv_lock_channel(p_platform text, p_key text)
returns void
language sql volatile set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('cv_channel:' || p_platform || ':' || p_key, 0));
$$;

-- INV-V15: 그 계정·그 채널 키의 코드 신청 가운데 승인되지 않고 끝난 것. 마지막 풀기 뒤에 끝난 것만 센다.
-- 기간 지남은 발급 7일 뒤에 끝난 것으로 본다(나중에 닫힌 줄이어도).
create or replace function public.cv_failure_count(p_account uuid, p_platform text, p_key text)
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::integer
  from public.creator_verification_applications a
  where a.account_id = p_account and a.platform = p_platform and a.channel_key = p_key and a.method = 'code'
    and (a.status in ('rejected', 'withdrawn', 'closed', 'expired') or (a.status = 'issued' and a.issued_at <= now() - public.cv_post_window()))
    and (case when a.status in ('issued', 'expired') then a.issued_at + public.cv_post_window() else a.ended_at end)
        > coalesce((select max(u.at) from public.creator_verification_unlocks u
                    where u.account_id = p_account and u.platform = p_platform and u.channel_key = p_key), '-infinity'::timestamptz);
$$;

-- 이사 중 = 확인된 크리에이터에게 살아 있는 신청이 있다(INV-V12)
create or replace function public.cv_moving(p_creator_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.creators c
    join public.creator_verification_applications a on a.account_id = c.profile_id
    where c.id = p_creator_id and c.identity_verified and public.cv_is_live(a.status, a.issued_at)
  );
$$;

-- URL 의 %XX 를 푼다(한글 핸들). 꼴이 깨졌으면 null.
create or replace function public.cv_percent_decode(p text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v bytea := ''::bytea;
  i integer := 1;
  n integer := char_length(p);
  ch text;
begin
  while i <= n loop
    ch := substr(p, i, 1);
    if ch = '%' then
      if substr(p, i + 1, 2) !~ '^[0-9A-Fa-f]{2}$' then
        return null;
      end if;
      v := v || decode(substr(p, i + 1, 2), 'hex');
      i := i + 3;
    else
      v := v || convert_to(ch, 'UTF8');
      i := i + 1;
    end if;
  end loop;
  return convert_from(v, 'UTF8');
exception when others then
  return null;
end $$;

-- INV-V2: 채널 주소 → (플랫폼, 채널 키, 다시 만든 주소). 받지 않는 플랫폼은 FKV02, 꼴이 틀리면 22023.
create or replace function public.cv_parse_channel_url(p_url text)
returns table (platform text, channel_key text, channel_url text)
language plpgsql immutable set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_url, ''));
  v_rest text;
  v_authority text;
  v_host text;
  v_path text;
  v_parts text[];
  v_n integer;
  v_platform text;
  v_key text;
begin
  if char_length(v) > 300 or lower(left(v, 8)) <> 'https://' then
    raise exception '채널 주소 꼴이 아니다 (https 주소만)' using errcode = '22023';
  end if;
  v_rest := split_part(split_part(substr(v, 9), '#', 1), '?', 1);
  v_authority := split_part(v_rest, '/', 1);
  v_path := substr(v_rest, char_length(v_authority) + 1);
  v_host := lower(v_authority);
  -- 사용자 정보(@)·포트(:) 같은 것이 붙은 주소는 받지 않는다
  if v_host !~ '^[a-z0-9.-]+$' then
    raise exception '채널 주소 꼴이 아니다' using errcode = '22023';
  end if;
  v_host := regexp_replace(v_host, '^(www|m)\.', '');
  v_path := regexp_replace(v_path, '/+$', '');
  v_parts := case when v_path = '' then array[]::text[] else string_to_array(substr(v_path, 2), '/') end;
  v_n := coalesce(array_length(v_parts, 1), 0);

  if v_host = 'youtube.com' then
    -- /@핸들, 뒤의 탭 경로(/videos 등) 하나는 버린다. /channel/UC… 은 받지 않는다.
    if v_n not in (1, 2) or left(v_parts[1], 1) <> '@' or (v_n = 2 and v_parts[2] !~ '^[a-z]+$') then
      raise exception '유튜브는 @핸들 주소만 받는다' using errcode = '22023';
    end if;
    v_platform := 'youtube';
    v_key := lower(public.cv_percent_decode(substr(v_parts[1], 2)));
  elsif v_host = 'chzzk.naver.com' then
    if v_n = 1 then
      v_key := lower(v_parts[1]);
    elsif v_n = 2 and v_parts[1] = 'live' then
      v_key := lower(v_parts[2]);
    else
      raise exception '치지직 채널 주소 꼴이 아니다' using errcode = '22023';
    end if;
    v_platform := 'chzzk';
  elsif v_host = 'sooplive.com' then
    if v_n <> 2 or v_parts[1] <> 'station' then
      raise exception 'SOOP 방송국 주소 꼴이 아니다' using errcode = '22023';
    end if;
    v_platform := 'soop';
    v_key := lower(v_parts[2]);
  elsif v_host = 'ch.sooplive.co.kr' then
    if v_n <> 1 then
      raise exception 'SOOP 방송국 주소 꼴이 아니다' using errcode = '22023';
    end if;
    v_platform := 'soop';
    v_key := lower(v_parts[1]);
  elsif v_host = 'instagram.com' then
    if v_n <> 1 then
      raise exception '인스타그램 주소 꼴이 아니다' using errcode = '22023';
    end if;
    v_platform := 'instagram';
    v_key := lower(v_parts[1]);
  else
    -- 알플레이·틱톡·그 밖의 플랫폼: 규칙을 표에 더하기 전까지 받지 않는다
    raise exception '아직 받지 않는 플랫폼이에요. 1:1 문의로 알려 주세요' using errcode = 'FKV02';
  end if;

  if v_key is null or not public.cv_key_valid(v_platform, v_key) then
    raise exception '채널 주소 꼴이 아니다' using errcode = '22023';
  end if;
  return query select v_platform, v_key, public.cv_channel_url(v_platform, v_key);
end $$;

-- INV-V3: FK-XXXX-NN. 글자는 헷갈리는 0·1·I·O 를 뺀 32자, 숫자 둘. 암호학적 난수에서 뽑는다(치우침 없게 거른다).
create or replace function public.cv_new_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea := extensions.gen_random_bytes(16);
  j integer := 4;
  x integer;
  digits integer := 0;
  v text := 'FK-';
begin
  for i in 0..3 loop
    v := v || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  v := v || '-';
  while digits < 2 loop
    if j > 15 then
      b := extensions.gen_random_bytes(16);
      j := 0;
    end if;
    x := get_byte(b, j);
    j := j + 1;
    if x < 250 then
      v := v || (x % 10)::text;
      digits := digits + 1;
    end if;
  end loop;
  return v;
end $$;

-- 열린 신청 하나를 끝내고 그 신청이 쥔 점유를 푼다. p_live_only: 기간 지난 코드 받음은 끝내지 않는다(이미 끝난 것으로 본다).
-- 끝냈으면 true. 조건을 update 의 where 에 두어, 다른 처리가 먼저 끝낸 신청은 건드리지 않는다.
create or replace function public.cv_end_application(p_id uuid, p_status text, p_reason text, p_live_only boolean)
returns boolean
language plpgsql volatile set search_path = ''
as $$
begin
  update public.creator_verification_applications a
  set status = p_status, ended_at = now(), reason_code = p_reason
  where a.id = p_id
    and (a.status = 'posted' or (a.status = 'issued' and (not p_live_only or a.issued_at > now() - public.cv_post_window())));
  if not found then
    return false;
  end if;
  delete from public.creator_channel_claims k where k.application_id = p_id;
  return true;
end $$;

-- INV-V7: 승인 한 처리 — 신청 승인, 옛 확인 채널 놓기(이사, INV-V12), 점유를 확인된 크리에이터로, 공개 정보 채널 칸과 확인됨, 기록 한 줄.
create or replace function public.cv_grant(p_app_id uuid, p_creator_id uuid, p_actor uuid)
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
  values (p_creator_id, p_actor, 'approve', v_app.id, v_app.channel_url, v_app.code, v_app.method);
end $$;

-- 새 코드 신청을 만든다(신청·다시 받기 공용). 부르는 쪽이 ① 공개 정보 행을 잡고 있어야 한다.
create or replace function public.cv_open_application(p_account uuid, p_creator_id uuid, p_platform text, p_key text)
returns jsonb
language plpgsql volatile set search_path = ''
as $$
declare
  v_open public.creator_verification_applications;
  v_claim public.creator_channel_claims;
  v_holder public.creator_verification_applications;
  v_app public.creator_verification_applications;
  v_constraint text;
begin
  -- INV-V4·V5: 같은 계정의 열린 신청 — 살아 있으면 거부, 기간 지났으면 닫고 진행
  for v_open in
    select * from public.creator_verification_applications a where a.account_id = p_account and a.status in ('issued', 'posted')
  loop
    if public.cv_is_live(v_open.status, v_open.issued_at) then
      raise exception '이미 진행 중인 신청이 있어요' using errcode = 'FKV03';
    end if;
    perform public.cv_end_application(v_open.id, 'expired', null, false);
  end loop;

  -- INV-V15: 이 채널로 끝난 신청이 3번이면 거부
  if public.cv_failure_count(p_account, p_platform, p_key) >= 3 then
    raise exception '이 채널로는 더 신청할 수 없어요. 1:1 문의로 알려 주세요' using errcode = 'FKV04';
  end if;

  -- INV-V8: 채널 키 잠금 뒤 점유 확인
  perform public.cv_lock_channel(p_platform, p_key);
  select * into v_claim from public.creator_channel_claims k where k.platform = p_platform and k.channel_key = p_key for no key update;
  if found then
    if v_claim.kind = 'verified' then
      if v_claim.creator_id = p_creator_id then
        raise exception '지금 확인된 채널이에요' using errcode = 'FKV13';
      end if;
      raise exception '이미 등록한 채널이에요' using errcode = 'FKV05';
    end if;
    select * into v_holder from public.creator_verification_applications a where a.id = v_claim.application_id;
    if public.cv_is_live(v_holder.status, v_holder.issued_at) then
      raise exception '이미 확인중인 채널이에요' using errcode = 'FKV06';
    end if;
    -- 다른 계정의 기간 지난 신청이 쥔 점유: 그 신청을 기간 지남으로 닫는다(INV-V5)
    perform public.cv_end_application(v_holder.id, 'expired', null, false);
  end if;

  -- INV-V3·V13: 코드와 확인 방법은 서버가 정한다. 코드가 겹치면 새로 뽑는다.
  loop
    begin
      insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status)
      values (p_account, p_platform, p_key, public.cv_channel_url(p_platform, p_key), public.cv_new_code(), 'code', 'issued')
      returning * into v_app;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'creator_verification_applications_code_key' then
        raise;
      end if;
    end;
  end loop;

  insert into public.creator_channel_claims (platform, channel_key, kind, account_id, application_id)
  values (p_platform, p_key, 'application', p_account, v_app.id);

  return jsonb_build_object(
    'application_id', v_app.id, 'code', v_app.code, 'platform', v_app.platform, 'channel_url', v_app.channel_url,
    'issued_at', v_app.issued_at, 'post_deadline', v_app.issued_at + public.cv_post_window()
  );
end $$;

-- 로그인한 크리에이터의 공개 정보 행을 잠근다(계정 단위 잠금 ①). 크리에이터가 아니면 42501.
create or replace function public.cv_lock_my_creator()
returns public.creators
language plpgsql volatile set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_creator public.creators;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 한다' using errcode = '42501';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 공개 정보가 없다' using errcode = 'P0002';
  end if;
  return v_creator;
end $$;

-- ── 크리에이터 쪽 ────────────────────────────────────────

-- INV-V1: 인자는 채널 주소 하나. 누구의 신청인지는 로그인 토큰으로 정한다.
create or replace function public.request_creator_verification(p_channel_url text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_ch record;
begin
  v_creator := public.cv_lock_my_creator();
  select * into v_ch from public.cv_parse_channel_url(p_channel_url);
  return public.cv_open_application(v_creator.profile_id, v_creator.id, v_ch.platform, v_ch.channel_key);
end $$;

-- INV-V4: 코드 다시 받기 — 코드 받음 신청을 거두고 같은 채널로 새 신청을 한 처리에서.
-- INV-V15: 끝난 신청이 이미 2번이면 거부(지금 신청을 버리면 3이 되어 새 신청을 만들 수 없다).
create or replace function public.regenerate_creator_verification_code()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_open public.creator_verification_applications;
begin
  v_creator := public.cv_lock_my_creator();
  select * into v_open from public.creator_verification_applications a
  where a.account_id = v_creator.profile_id and a.status in ('issued', 'posted');
  if not found then
    raise exception '다시 받을 신청이 없다' using errcode = 'P0002';
  end if;
  if v_open.status <> 'issued' then
    raise exception '이미 코드를 올린 신청이다' using errcode = '55000';
  end if;
  if not public.cv_is_live(v_open.status, v_open.issued_at) then
    raise exception '올리기 기한이 지났어요. 새로 신청해 주세요' using errcode = 'FKV08';
  end if;
  if public.cv_failure_count(v_creator.profile_id, v_open.platform, v_open.channel_key) >= 2 then
    raise exception '이 채널로는 코드를 더 받을 수 없어요. 1:1 문의로 알려 주세요' using errcode = 'FKV07';
  end if;
  perform public.cv_lock_channel(v_open.platform, v_open.channel_key);
  if not public.cv_end_application(v_open.id, 'withdrawn', null, true) then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  return public.cv_open_application(v_creator.profile_id, v_creator.id, v_open.platform, v_open.channel_key);
end $$;

-- INV-V5 (a): 「코드 올렸어요」. 발급 7일 안의 코드 받음만 올림이 된다.
create or replace function public.mark_creator_verification_posted(p_application_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
begin
  v_app := null;
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id for no key update;
  if v_app.id is null or v_app.account_id is distinct from auth.uid() then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  if v_app.status <> 'issued' then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  if v_app.issued_at <= now() - public.cv_post_window() then
    raise exception '올리기 기한이 지났어요' using errcode = 'FKV08';
  end if;
  update public.creator_verification_applications set status = 'posted', posted_at = now() where id = v_app.id;
end $$;

-- INV-V4: 크리에이터가 코드 받음·올림 신청을 거둔다. 점유가 풀린다.
create or replace function public.withdraw_creator_verification(p_application_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_app public.creator_verification_applications;
begin
  v_creator := public.cv_lock_my_creator();
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found or v_app.account_id <> v_creator.profile_id then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  perform public.cv_lock_channel(v_app.platform, v_app.channel_key);
  if not public.cv_end_application(v_app.id, 'withdrawn', null, true) then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
end $$;

-- INV-V11: 자기 신청만. 메모·상대 계정 칸은 없다.
create or replace function public.my_creator_verifications()
returns table (
  id uuid, platform text, channel_url text, code text, method text, status text,
  issued_at timestamptz, post_deadline timestamptz, reason_code text, remaining_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.platform, a.channel_url, a.code, a.method, public.cv_shown_status(a.status, a.issued_at),
         a.issued_at, case when a.method = 'code' then a.issued_at + public.cv_post_window() end,
         a.reason_code, greatest(0, 3 - public.cv_failure_count(a.account_id, a.platform, a.channel_key))
  from public.creator_verification_applications a
  where a.account_id = auth.uid()
  order by a.issued_at desc, a.id;
$$;

-- ── 운영자 쪽 ────────────────────────────────────────────

create or replace function public.cv_check_reason(p_code text, p_allowed text[], p_memo text)
returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_code is null or not (p_code = any (p_allowed)) or char_length(coalesce(p_memo, '')) > 200 then
    raise exception '사유는 목록에서 고르고 메모는 200자까지다' using errcode = '22023';
  end if;
end $$;

-- INV-V6·V7: 올림 상태 신청만 승인한다. 한 번만.
create or replace function public.admin_approve_creator_verification(p_application_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
  v_creator public.creators;
begin
  if not public.is_operator() then
    raise exception '운영자만 승인한다' using errcode = '42501';
  end if;
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_app.account_id for no key update;
  perform public.cv_lock_channel(v_app.platform, v_app.channel_key);
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id for no key update;
  if v_app.status <> 'posted' or v_creator.id is null then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  perform public.cv_grant(v_app.id, v_creator.id, auth.uid());
end $$;

-- INV-V6·V9: 코드 받음·올림 신청을 반려. 사유 목록 값 + 운영자 메모.
create or replace function public.admin_reject_creator_verification(p_application_id uuid, p_reason_code text, p_memo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
  v_creator_id uuid;
begin
  if not public.is_operator() then
    raise exception '운영자만 반려한다' using errcode = '42501';
  end if;
  perform public.cv_check_reason(p_reason_code, array['code_not_found', 'channel_unreachable', 'profile_mismatch', 'other'], p_memo);
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  select c.id into v_creator_id from public.creators c where c.profile_id = v_app.account_id for no key update;
  perform public.cv_lock_channel(v_app.platform, v_app.channel_key);
  if not public.cv_end_application(v_app.id, 'rejected', p_reason_code, true) then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code)
  values (v_creator_id, auth.uid(), 'reject', btrim(coalesce(p_memo, '')), v_app.id, v_app.channel_url, v_app.code, v_app.method, p_reason_code);
end $$;

-- INV-K10·V9·V10: 승인 취소. 확인됨 끔, 점유 풀기, 살아 있는 이사 신청도 함께 끝냄(취소된 크리에이터가 이사 승인으로 되살아나지 않게).
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
  perform public.cv_check_reason(p_reason_code, array['code_removed', 'not_owner_confirmed', 'policy_violation', 'other'], v_memo);
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
  values (p_creator_id, auth.uid(), 'revoke', v_memo, v_granted.id, v_creator.channel_url, v_granted.code, v_granted.method, p_reason_code);
end $$;

-- 옛 화면이 부르는 함수. 신청 없는 승인은 거부하고(INV-V6), 취소는 「그 밖」 사유 + 메모로 넘긴다.
-- 관리자 화면을 새 함수로 옮기면(I2) 지운다.
create or replace function public.admin_set_creator_verified(p_creator_id uuid, p_verified boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 승인·취소한다' using errcode = '42501';
  end if;
  if p_verified is distinct from false then
    raise exception '신청 없이 승인할 수 없다 — 올림 상태의 신청을 승인한다 (INV-V6)' using errcode = 'FKV11';
  end if;
  perform public.admin_revoke_creator(p_creator_id, 'other', p_reason);
end $$;

-- INV-V15: 그 계정·그 채널의 신청 횟수를 푼다. 고칠 수 없는 기록을 남긴다.
create or replace function public.admin_unlock_creator_verification_count(p_application_id uuid, p_memo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.creator_verification_applications;
  v_memo text := btrim(coalesce(p_memo, ''));
begin
  if not public.is_operator() then
    raise exception '운영자만 횟수를 푼다' using errcode = '42501';
  end if;
  if char_length(v_memo) > 200 then
    raise exception '메모는 200자까지다' using errcode = '22023';
  end if;
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found or v_app.method <> 'code' then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  perform 1 from public.creators c where c.profile_id = v_app.account_id for no key update;
  insert into public.creator_verification_unlocks (acted_by, account_id, platform, channel_key, memo)
  values (auth.uid(), v_app.account_id, v_app.platform, v_app.channel_key, v_memo);
end $$;

-- INV-V11: 운영자 신청 목록. 연락처·실명 칸은 없다(INV-K8).
create or replace function public.admin_creator_verifications()
returns table (
  id uuid, nickname text, login_id text, creator_name text, channel_title text, platform text, channel_url text,
  code text, method text, status text, issued_at timestamptz, posted_at timestamptz, used_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, p.nickname, p.login_id, c.name, c.channel_title, a.platform, a.channel_url, a.code, a.method,
         public.cv_shown_status(a.status, a.issued_at), a.issued_at, a.posted_at,
         public.cv_failure_count(a.account_id, a.platform, a.channel_key)
  from public.creator_verification_applications a
  join public.profiles p on p.id = a.account_id
  left join public.creators c on c.profile_id = a.account_id
  where public.is_operator()
  order by (a.status = 'posted') desc, a.issued_at desc, a.id
  limit 500;
$$;

create or replace function public.admin_creator_verification_events()
returns table (
  at timestamptz, actor_nickname text, creator_id uuid, creator_name text, action text, reason text,
  application_id uuid, reason_code text, method text, channel_url text, code text
)
language sql stable security definer set search_path = ''
as $$
  select e.at, a.nickname, e.creator_id, c.name, e.action, e.reason, e.application_id, e.reason_code, e.method, e.channel_url, e.code
  from public.creator_verification_events e
  join public.profiles a on a.id = e.acted_by
  join public.creators c on c.id = e.creator_id
  where public.is_operator()
  order by e.at desc, e.id desc
  limit 500;
$$;

-- ── 서버 쪽: 플랫폼 로그인 확인 (INV-V13·V14) ─────────────

-- 앱 서버가 플랫폼에 직접 물어 얻은 채널 키로 부른다. 서버 관리자 키 전용.
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
  if p_platform is null or p_platform not in ('youtube', 'chzzk', 'instagram') or not public.cv_key_valid(p_platform, p_channel_key) then
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
      -- 다른 계정의 살아 있는 코드 신청은 닫힌다. 기록에는 닫힌 쪽 크리에이터로 남긴다.
      select c.id into v_loser from public.creators c where c.profile_id = v_holder.account_id;
      insert into public.creator_verification_events (creator_id, acted_by, action, application_id, channel_url, code, method, reason_code)
      values (v_loser, p_account_id, 'close', v_holder.id, v_holder.channel_url, v_holder.code, v_holder.method, 'owner_confirmed_elsewhere');
    else
      perform public.cv_end_application(v_holder.id, 'expired', null, false);
    end if;
  end if;

  -- 로그인한 계정의 다른 채널 열린 신청은 거둔다(INV-V4)
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

-- ── 크리에이터 가입: 공개 정보 행 (INV-V1, signup INV-U5) ──

-- create_account(supabase/manual/0004_signup.sql)로 계정을 만들고, 같은 처리에서 확인 안 된 공개 정보 행을 만든다.
-- 하나라도 실패하면 아무것도 남지 않는다. slug 는 서버가 정한다(아이디 규칙과 slug 규칙이 달라 아이디를 쓰지 않는다).
-- create_account 는 수동 적용 파일에 있어 이 마이그레이션보다 늦게 생길 수 있다 — plpgsql 은 부를 때 찾으므로 괜찮다.
create or replace function public.create_creator_account(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_phone text,
  p_verification_id uuid,
  p_terms jsonb,
  p_name text,
  p_channel_title text,
  p_category text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_channel_title, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_slug text;
  v_constraint text;
begin
  if char_length(v_name) not between 1 and 20 or char_length(v_title) not between 1 and 40 or char_length(v_category) not between 1 and 20 then
    raise exception '이름은 1~20자, 채널 이름은 1~40자, 분야는 1~20자다' using errcode = '22023';
  end if;
  perform public.create_account(p_user_id, p_login_id, 'creator', p_email, p_phone, p_verification_id, p_terms);
  loop
    v_slug := 'c-' || encode(extensions.gen_random_bytes(5), 'hex');
    begin
      insert into public.creators (profile_id, slug, name, channel, channel_title, category)
      values (p_user_id, v_slug, v_name, '', v_title, v_category);
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'creators_slug_key' then
        raise;
      end if;
    end;
  end loop;
end $$;

-- ── 선물 등록: 채널 이사 중이면 거부 (INV-V12) ────────────
-- 20261005000010_decline_block.sql 의 register_order 와 같고, 받는 크리에이터 행 공유 잠금과 이사 중 확인만 더했다.

create or replace function public.register_order(
  p_fan_id uuid,
  p_creator_id uuid,
  p_order_no text,
  p_item_kind text,
  p_has_electronics_or_metal boolean,
  p_tiers public.parcel_tier[],
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_inspection_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
  v_role public.user_role;
  c record;
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  -- INV-K3: 등록하는 순간의 요금표로 계산한 금액과 칸마다 같아야 한다. 아니면 요금이 바뀐 것이다 — 다시 계산해 오게 한다.
  select * into c from public.fan_charge_of(p_tiers);
  if c.found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if p_goods_krw <> 0 or p_amount_krw <> c.total or p_shipping_fee_krw <> c.carrier or p_inspection_fee_krw <> c.inspection
     or p_service_fee_krw <> c.total - c.carrier - c.inspection then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_fan_id;
  if v_role is null or v_role not in ('fan', 'creator') then
    raise exception '선물을 보낼 수 있는 계정이 아니다' using errcode = '42501';
  end if;
  -- INV-V12: 받는 크리에이터 행을 공유 잠금 — 이사 신청(같은 행 for no key update)이 끝날 때까지 기다리고, 끝난 뒤의 상태로 판단한다
  perform 1 from public.creators cr where cr.id = p_creator_id for share;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if public.cv_moving(p_creator_id) then
    raise exception '채널 이사 중인 크리에이터라 지금은 선물을 등록할 수 없다' using errcode = 'FKV10';
  end if;
  if v_role = 'creator' then
    if exists (select 1 from public.creators c2 where c2.id = p_creator_id and c2.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
    if not public.creators_follow_either_way(p_fan_id, p_creator_id) then
      raise exception '팔로우가 없는 크리에이터에게는 보낼 수 없다' using errcode = 'P0012';
    end if;
  end if;
  -- INV-D7: 차단 쓰기와 같은 쌍 잠금을 잡고 확인한다 — 이 등록이 끝날 때까지 차단은 줄을 서고, 차단 뒤에는 이 확인이 막는다.
  -- 차단을 말하지 않고 본인 확인 전 크리에이터와 같은 오류를 낸다(카드 d26).
  perform public.lock_sender_pair(p_creator_id, p_fan_id);
  if public.sender_blocked(p_creator_id, p_fan_id) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal)
  values (p_order_no, p_fan_id, p_creator_id, p_item_kind, p_has_electronics_or_metal)
  returning id into v_order_id;

  insert into public.boxes (order_id, seq, declared_tier)
  select v_order_id, t.ord::smallint, t.tier
  from unnest(p_tiers) with ordinality as t(tier, ord);

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.cv_post_window() from public, anon, authenticated;
revoke all on function public.cv_is_live(text, timestamptz) from public, anon, authenticated;
revoke all on function public.cv_shown_status(text, timestamptz) from public, anon, authenticated;
revoke all on function public.cv_lock_channel(text, text) from public, anon, authenticated;
revoke all on function public.cv_failure_count(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cv_moving(uuid) from public, anon, authenticated;
revoke all on function public.cv_percent_decode(text) from public, anon, authenticated;
revoke all on function public.cv_parse_channel_url(text) from public, anon, authenticated;
revoke all on function public.cv_new_code() from public, anon, authenticated;
revoke all on function public.cv_end_application(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cv_grant(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.cv_open_application(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cv_lock_my_creator() from public, anon, authenticated;
revoke all on function public.cv_check_reason(text, text[], text) from public, anon, authenticated;

revoke all on function public.request_creator_verification(text) from public, anon;
revoke all on function public.regenerate_creator_verification_code() from public, anon;
revoke all on function public.mark_creator_verification_posted(uuid) from public, anon;
revoke all on function public.withdraw_creator_verification(uuid) from public, anon;
revoke all on function public.my_creator_verifications() from public, anon;
grant execute on function public.request_creator_verification(text) to authenticated;
grant execute on function public.regenerate_creator_verification_code() to authenticated;
grant execute on function public.mark_creator_verification_posted(uuid) to authenticated;
grant execute on function public.withdraw_creator_verification(uuid) to authenticated;
grant execute on function public.my_creator_verifications() to authenticated;

revoke all on function public.admin_approve_creator_verification(uuid) from public, anon;
revoke all on function public.admin_reject_creator_verification(uuid, text, text) from public, anon;
revoke all on function public.admin_revoke_creator(uuid, text, text) from public, anon;
revoke all on function public.admin_set_creator_verified(uuid, boolean, text) from public, anon;
revoke all on function public.admin_unlock_creator_verification_count(uuid, text) from public, anon;
revoke all on function public.admin_creator_verifications() from public, anon;
revoke all on function public.admin_creator_verification_events() from public, anon;
grant execute on function public.admin_approve_creator_verification(uuid) to authenticated;
grant execute on function public.admin_reject_creator_verification(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_creator(uuid, text, text) to authenticated;
grant execute on function public.admin_set_creator_verified(uuid, boolean, text) to authenticated;
grant execute on function public.admin_unlock_creator_verification_count(uuid, text) to authenticated;
grant execute on function public.admin_creator_verifications() to authenticated;
grant execute on function public.admin_creator_verification_events() to authenticated;

-- INV-V14: 로그인한 사용자 권한으로는 부를 수 없다
revoke all on function public.confirm_creator_channel_by_login(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_creator_channel_by_login(uuid, text, text) to service_role;

revoke all on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.create_creator_account(uuid, text, text, text, uuid, jsonb, text, text, text) to service_role;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer) to service_role;
