-- 크리에이터 본인 확인 — 「이용 규칙 위반」 취소 뒤에는 운영자 확인만 (creator-verification INV-V10, 결정 d32 2026-10-06 「추천대로」).
-- 그 크리에이터의 마지막 승인·취소 기록이 「이용 규칙 위반」 취소면 플랫폼 로그인 확인(INV-V14)과 코드 자동 확인(INV-V16)을 거부한다.
-- 코드 신청 → 확인 요청 → 운영자 승인 길은 그대로이고, 운영자가 승인하면 마지막 기록이 승인이 되어 제한이 풀린다.
-- 함께 끝난 신청의 반려 줄(reject)·닫힘 줄(close)은 승인·취소 결정이 아니므로 보지 않는다.

create function public.cv_operator_only(p_creator_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((
    select e.action = 'revoke' and e.reason_code = 'policy_violation'
    from public.creator_verification_events e
    where e.creator_id = p_creator_id and e.action in ('approve', 'revoke')
    -- 기록 시각(at)은 거래가 시작된 시각이라 겹친 처리에서 순서가 뒤바뀔 수 있다. id 는 줄을 넣을 때 매겨지고,
    -- 기록을 넣는 함수는 모두 공개 정보 행을 잠근 채 넣으므로 id 순서가 실제 처리 순서다(보안 리뷰 2026-10-06)
    order by e.id desc
    limit 1
  ), false);
$$;
revoke all on function public.cv_operator_only(uuid) from public, anon, authenticated;

-- ── 로그인 확인·자동 확인 ① ② — 앞 파일 정의에 검사 한 곳씩 ──

CREATE OR REPLACE FUNCTION public.confirm_creator_channel_by_login(p_account_id uuid, p_platform text, p_channel_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- INV-V10(d32): 공개 정보 행을 잠근 뒤 본다 — 동시에 온 위반 취소가 먼저 끝났으면 여기서 보인다
  if public.cv_operator_only(v_creator.id) then
    raise exception '운영자 확인으로만 다시 확인할 수 있어요. 코드를 받아 「확인 요청」을 눌러 주세요' using errcode = 'FKV16';
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
end $function$;

CREATE OR REPLACE FUNCTION public.claim_creator_verification_auto_check(p_account_id uuid, p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app public.creator_verification_applications;
begin
  -- INV-V10(d32): 1분 제한을 쓰기 전에 거부한다. 승인 함수가 잠근 뒤 다시 본다
  if public.cv_operator_only((select c.id from public.creators c where c.profile_id = p_account_id)) then
    raise exception '운영자 확인으로만 다시 확인할 수 있어요. 코드를 받아 「확인 요청」을 눌러 주세요' using errcode = 'FKV16';
  end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_creator_verification_auto_check(p_application_id uuid, p_found boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- INV-V10(d32): 공개 정보 행을 잠근 뒤 본다
  if public.cv_operator_only(v_creator.id) then
    raise exception '운영자 확인으로만 다시 확인할 수 있어요. 코드를 받아 「확인 요청」을 눌러 주세요' using errcode = 'FKV16';
  end if;
  -- 못 찾았으면 아무것도 바꾸지 않는다 — 실패로 세지 않고, 발급 시각·기한도 그대로다
  if not coalesce(p_found, false) then
    return 'not_found';
  end if;
  perform public.cv_grant_by(v_app.id, v_creator.id, v_app.account_id, 'auto_code');
  return 'approved';
end $function$;

-- ── 화면이 두 버튼을 감추도록 — 내 확인 상태에 operator_only 칸 ──
-- 반환 칸이 바뀌어 지우고 다시 만든다(권한도 다시).
drop function public.my_creator_verification_state();
create function public.my_creator_verification_state()
returns table (
  creator_id uuid, name text, channel_title text, verified boolean, platform text, channel_url text, verified_at timestamptz,
  operator_only boolean
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.channel_title, c.identity_verified, c.platform, c.channel_url,
         case when c.identity_verified then (
           select max(e.at) from public.creator_verification_events e where e.creator_id = c.id and e.action = 'approve'
         ) end,
         public.cv_operator_only(c.id)
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;
revoke all on function public.my_creator_verification_state() from public, anon;
grant execute on function public.my_creator_verification_state() to authenticated;
