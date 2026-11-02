-- 크리에이터 채널 확인을 「팬꾹 링크 게시 확인」으로 바꾼다 (creator-verification INV-V17·V18·V19·V20·V22, 결정 카드 fankkuk-20261102-3-d1 「추천대로」).
-- 앞 파일(20261006000001~8, 20261007000002)은 고치지 않고 이 파일에서 더하고 바꾼다.
--
-- 1) 확인 요청(method = link): 채널 주소 하나로 내면 바로 확인 대기(posted)다 — 코드 받음 단계·7일 기한·코드 다시 받기가 없다(INV-V17).
--    요청 줄에 그때의 링크용 아이디(link_handle)를 적는다. 링크용 아이디가 없으면 거부(FKV17).
-- 2) 인증 코드·코드 자동 확인(INV-V3·V16)은 뺀다 — 크리에이터가 부르던 함수(다시 받기·코드 올렸어요·자동 확인 둘)를 지운다.
--    이미 열려 있던 코드 신청(코드 받음·올림)은 닫힘, 사유 「확인 방식이 바뀜」(method_changed)으로 끝내고 3번 횟수(INV-V15)에 세지 않는다.
-- 3) 반려 사유 목록을 바꾼다(INV-V19): 팬꾹 링크를 찾지 못함 · 링크 주소가 다름 · 채널 이름이 다름 · 채널 주소가 열리지 않음 · 그 밖.
--    승인 취소 사유에 「팬꾹 링크가 채널에서 내려감」(link_removed)을 더한다. 옛 값은 기록에 남은 줄만 읽는다.
-- 4) 재확인(INV-V20): 크리에이터 공개 정보에 마지막 확인 시각·그때의 링크용 아이디·유예 시작 시각·다시 확인 요청 시각을 둔다.
--    마지막 확인 시각에서 90일, 또는 링크용 아이디가 그때와 달라지면 운영자 재확인 목록에 오른다. 「링크 없음」이면 14일 유예,
--    유예가 끝날 때까지 「링크 있음」이 없으면 예약 작업이 승인을 취소한다(사유 link_removed). 이미 확인된 크리에이터의 마지막 확인 시각은 승인 시각.
-- 5) 확인 대기 중인 크리에이터의 링크 페이지(INV-V22): 공개 읽기 하나 — 공개 이름·사진·한 줄 소개만. 선물 등록 함수는 그대로 확인됨만 받는다.
-- 6) 플랫폼 로그인 확인(INV-V14)은 치지직만 남긴다(유튜브·인스타그램 로그인 확인은 뺀다).
-- 오류 코드(더함): FKV17 링크용 아이디가 없음

-- ── 확인 방법·사유·아이디 칸 ──────────────────────────────

alter table public.creator_verification_applications add column link_handle text;

alter table public.creator_verification_applications
  drop constraint creator_verification_applications_method_check,
  add constraint creator_verification_applications_method_check check (method in ('code', 'login', 'link'));

alter table public.creator_verification_applications
  drop constraint cva_code_shape,
  add constraint cva_code_shape check (
    (method = 'code' and code ~ '^FK-[2-9A-HJ-NP-Z]{4}-[0-9]{2}$')
    or (method = 'login' and code is null and status = 'approved')
    or (method = 'link' and code is null and link_handle ~ '^[a-z0-9_]{3,20}$')
  );

-- 옛 값(code_not_found·profile_mismatch·code_removed)은 지난 줄에 남아 있을 수 있어 목록에 둔다. 함수가 받는 목록은 새 값뿐이다.
alter table public.creator_verification_applications
  drop constraint cva_reason_by_status,
  add constraint cva_reason_by_status check (
    (status = 'rejected' and reason_code in ('link_not_found', 'link_mismatch', 'name_mismatch', 'channel_unreachable', 'other', 'code_not_found', 'profile_mismatch'))
    or (status = 'closed' and reason_code in ('owner_confirmed_elsewhere', 'method_changed'))
    or (status = 'approved' and (reason_code is null or reason_code in ('channel_gone', 'not_owner_confirmed', 'policy_violation', 'other', 'link_removed', 'code_removed')))
    or (status in ('issued', 'posted', 'withdrawn', 'expired') and reason_code is null)
  ) not valid;

-- 요청 줄의 아이디는 고칠 수 없다 — 운영자가 찾을 링크가 요청 뒤에 바뀌지 않게(INV-V17)
create or replace function public.guard_verification_application()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception '신청은 지울 수 없다' using errcode = '42501';
  end if;
  if new.code is distinct from old.code or new.account_id <> old.account_id or new.platform <> old.platform
     or new.channel_key <> old.channel_key or new.channel_url <> old.channel_url or new.method <> old.method
     or new.issued_at <> old.issued_at or new.id <> old.id or new.link_handle is distinct from old.link_handle then
    raise exception '신청의 코드·채널·아이디·발급 시각은 고칠 수 없다 (INV-V3·V17)' using errcode = '42501';
  end if;
  if old.status in ('approved', 'rejected', 'withdrawn', 'closed', 'expired') and new.status <> old.status then
    raise exception '끝난 신청은 다시 살아나지 않는다 (INV-V6·V9)' using errcode = '42501';
  end if;
  return new;
end $$;

alter table public.creator_verification_events
  drop constraint creator_verification_events_action_check,
  add constraint creator_verification_events_action_check check (action in ('approve', 'reject', 'close', 'revoke', 'recheck_found', 'recheck_missing')),
  drop constraint creator_verification_events_method_check,
  add constraint creator_verification_events_method_check check (method in ('code', 'auto_code', 'login', 'link')),
  add column link_handle text;

-- ── 재확인 칸 (INV-V20) ─────────────────────────────────

alter table public.creators
  add column link_checked_at timestamptz,
  add column link_checked_handle text,
  add column link_missing_at timestamptz,
  add column recheck_requested_at timestamptz;

-- 확인됨·채널 칸과 같이, 재확인 칸도 승인·취소·재확인 함수가 켠 표시가 있을 때만 바뀐다(INV-V6·V7·V20)
create or replace function public.guard_creator_verification()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if public.cv_change_allowed() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.identity_verified or new.platform is not null or new.link_checked_at is not null or new.link_missing_at is not null then
      raise exception '확인된 크리에이터는 승인 함수로만 생긴다 (INV-V6)' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.identity_verified is distinct from old.identity_verified
     or new.platform is distinct from old.platform
     or new.channel_url is distinct from old.channel_url
     or new.channel_key is distinct from old.channel_key
     or new.channel is distinct from old.channel
     or new.link_checked_at is distinct from old.link_checked_at
     or new.link_checked_handle is distinct from old.link_checked_handle
     or new.link_missing_at is distinct from old.link_missing_at
     or new.recheck_requested_at is distinct from old.recheck_requested_at then
    raise exception '본인 확인 상태·채널·재확인 칸은 승인 함수·재확인 함수로만 바뀐다 (INV-V6·V7·V20)' using errcode = '42501';
  end if;
  return new;
end $$;

-- ── 공용 ────────────────────────────────────────────────

-- INV-V20: 재확인 주기와 유예 기간
create function public.cv_recheck_window()
returns interval
language sql immutable set search_path = ''
as $$ select interval '90 days'; $$;

create function public.cv_link_grace()
returns interval
language sql immutable set search_path = ''
as $$ select interval '14 days'; $$;

-- 그 크리에이터의 지금 링크용 아이디(없으면 null)
create function public.cv_current_handle(p_creator_id uuid)
returns text
language sql stable set search_path = ''
as $$
  select h.handle from public.creator_handles h where h.creator_id = p_creator_id and h.retired_until is null;
$$;

-- INV-V20: 재확인 목록에 오른 이유 — handle(아이디를 바꿈) · days(90일 지남) · null(오르지 않음). 확인 전이면 null.
create function public.cv_recheck_reason(p_creator_id uuid)
returns text
language sql stable set search_path = ''
as $$
  select case
    when not c.identity_verified then null
    when public.cv_current_handle(c.id) is distinct from c.link_checked_handle then 'handle'
    when c.link_checked_at is null or c.link_checked_at <= now() - public.cv_recheck_window() then 'days'
  end
  from public.creators c where c.id = p_creator_id;
$$;

-- INV-V15: 그 계정·그 채널 키의 확인 요청 가운데 승인되지 않고 끝난 것. 마지막 풀기 뒤에 끝난 것만 센다.
-- 「확인 방식이 바뀜」으로 닫힌 옛 코드 신청은 세지 않는다(크리에이터의 실패가 아니다).
create or replace function public.cv_failure_count(p_account uuid, p_platform text, p_key text)
returns integer
language sql stable set search_path = ''
as $$
  select count(*)::integer
  from public.creator_verification_applications a
  where a.account_id = p_account and a.platform = p_platform and a.channel_key = p_key and a.method in ('code', 'link')
    and (a.status in ('rejected', 'withdrawn', 'closed', 'expired') or (a.status = 'issued' and a.issued_at <= now() - public.cv_post_window()))
    and a.reason_code is distinct from 'method_changed'
    and (case when a.status in ('issued', 'expired') then a.issued_at + public.cv_post_window() else a.ended_at end)
        > coalesce((select max(u.at) from public.creator_verification_unlocks u
                    where u.account_id = p_account and u.platform = p_platform and u.channel_key = p_key), '-infinity'::timestamptz);
$$;

-- ── 옛 코드 신청 닫기 · 마지막 확인 시각 채우기 ─────────────

with closed as (
  update public.creator_verification_applications a
  set status = 'closed', reason_code = 'method_changed', ended_at = now()
  where a.method = 'code' and a.status in ('issued', 'posted')
  returning a.id
)
delete from public.creator_channel_claims k using closed where k.application_id = closed.id and k.kind = 'application';

-- INV-V20: 이미 확인된 크리에이터의 마지막 확인 시각 = 승인 시각(기록이 없으면 지금), 그때의 아이디 = 지금 아이디
select set_config('fankkuk.verifying', 'on', true);
update public.creators c
set link_checked_at = coalesce((select max(e.at) from public.creator_verification_events e where e.creator_id = c.id and e.action = 'approve'), now()),
    link_checked_handle = public.cv_current_handle(c.id)
where c.identity_verified;
select set_config('fankkuk.verifying', '', true);

-- INV-V14: 로그인 확인은 치지직만
update public.creator_verification_platforms set api_check = false where platform in ('youtube', 'instagram');

-- ── 승인 한 처리 — 재확인 칸도 함께 (INV-V7·V20) ─────────────
-- 20261006000006 의 cv_grant_by 와 같고, 마지막 확인 시각·그때의 아이디를 적고 유예를 지우는 일, 기록의 아이디 칸이 더해졌다.

create or replace function public.cv_grant_by(p_app_id uuid, p_creator_id uuid, p_actor uuid, p_method text)
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
  -- 확인한 아이디는 요청 줄의 것이다(운영자가 본 링크). 지금 아이디와 다르면 바로 재확인 목록에 오른다(INV-V20).
  update public.creators c
  set identity_verified = true, platform = v_app.platform, channel_url = v_app.channel_url, channel_key = v_app.channel_key,
      channel = public.cv_platform_label(v_app.platform),
      link_checked_at = now(), link_checked_handle = coalesce(v_app.link_handle, public.cv_current_handle(p_creator_id)),
      link_missing_at = null, recheck_requested_at = null
  where c.id = p_creator_id;
  perform set_config('fankkuk.verifying', '', true);

  insert into public.creator_verification_events (creator_id, acted_by, action, application_id, channel_url, code, method, link_handle)
  values (p_creator_id, p_actor, 'approve', v_app.id, v_app.channel_url, v_app.code, p_method, v_app.link_handle);
end $$;

-- ── 크리에이터 쪽 ────────────────────────────────────────

-- INV-V17: 확인 요청. 인자는 채널 주소 하나. 링크용 아이디가 없으면 거부. 만들어지면 바로 확인 대기.
-- 잠그는 순서는 앞 파일과 같다: ① 공개 정보 행 → ② 채널 키 → ③ 신청 행.
create or replace function public.request_creator_verification(p_channel_url text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_ch record;
  v_handle text;
  v_open public.creator_verification_applications;
  v_claim public.creator_channel_claims;
  v_holder public.creator_verification_applications;
  v_app public.creator_verification_applications;
begin
  v_creator := public.cv_lock_my_creator();
  v_handle := public.cv_current_handle(v_creator.id);
  if v_handle is null then
    raise exception '팬꾹 링크를 먼저 만들어 주세요' using errcode = 'FKV17';
  end if;
  select * into v_ch from public.cv_parse_channel_url(p_channel_url);

  -- INV-V4: 같은 계정의 살아 있는 요청은 하나
  for v_open in
    select * from public.creator_verification_applications a where a.account_id = v_creator.profile_id and a.status in ('issued', 'posted')
  loop
    if public.cv_is_live(v_open.status, v_open.issued_at) then
      raise exception '이미 진행 중인 신청이 있어요' using errcode = 'FKV03';
    end if;
    perform public.cv_end_application(v_open.id, 'expired', null, false);
  end loop;

  -- INV-V15: 이 채널로 끝난 요청이 3번이면 거부
  if public.cv_failure_count(v_creator.profile_id, v_ch.platform, v_ch.channel_key) >= 3 then
    raise exception '이 채널로는 더 신청할 수 없어요. 1:1 문의로 알려 주세요' using errcode = 'FKV04';
  end if;

  -- INV-V8: 채널 키 잠금 뒤 점유 확인
  perform public.cv_lock_channel(v_ch.platform, v_ch.channel_key);
  select * into v_claim from public.creator_channel_claims k where k.platform = v_ch.platform and k.channel_key = v_ch.channel_key for no key update;
  if found then
    if v_claim.kind = 'verified' then
      if v_claim.creator_id = v_creator.id then
        raise exception '지금 확인된 채널이에요' using errcode = 'FKV13';
      end if;
      raise exception '이미 등록한 채널이에요' using errcode = 'FKV05';
    end if;
    select * into v_holder from public.creator_verification_applications a where a.id = v_claim.application_id;
    if public.cv_is_live(v_holder.status, v_holder.issued_at) then
      raise exception '이미 확인중인 채널이에요' using errcode = 'FKV06';
    end if;
    perform public.cv_end_application(v_holder.id, 'expired', null, false);
  end if;

  insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status, posted_at, link_handle)
  values (v_creator.profile_id, v_ch.platform, v_ch.channel_key, public.cv_channel_url(v_ch.platform, v_ch.channel_key), null, 'link', 'posted', now(), v_handle)
  returning * into v_app;

  insert into public.creator_channel_claims (platform, channel_key, kind, account_id, application_id)
  values (v_ch.platform, v_ch.channel_key, 'application', v_creator.profile_id, v_app.id);

  return jsonb_build_object(
    'application_id', v_app.id, 'platform', v_app.platform, 'channel_url', v_app.channel_url, 'link_handle', v_app.link_handle, 'issued_at', v_app.issued_at
  );
end $$;

-- INV-V20: 유예 중인 크리에이터의 「다시 확인 요청」 — 운영자 화면에 표시만 붙인다. 유예 기간은 바뀌지 않는다.
create function public.request_creator_link_recheck()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
begin
  v_creator := public.cv_lock_my_creator();
  if not v_creator.identity_verified or v_creator.link_missing_at is null then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  perform set_config('fankkuk.verifying', 'on', true);
  update public.creators c set recheck_requested_at = now() where c.id = v_creator.id;
  perform set_config('fankkuk.verifying', '', true);
end $$;

-- 코드 단계에서 부르던 함수는 지운다(INV-V3·V16 뺌)
drop function public.regenerate_creator_verification_code();
drop function public.mark_creator_verification_posted(uuid);
drop function public.claim_creator_verification_auto_check(uuid, uuid);
drop function public.confirm_creator_verification_auto_check(uuid, boolean);

-- INV-V11: 자기 요청만. 코드·기한 칸 대신 요청 때의 아이디.
drop function public.my_creator_verifications();
create function public.my_creator_verifications()
returns table (
  id uuid, platform text, channel_url text, link_handle text, method text, status text,
  issued_at timestamptz, reason_code text, remaining_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.platform, a.channel_url, a.link_handle, public.cv_shown_method(a.id, a.method), public.cv_shown_status(a.status, a.issued_at),
         a.issued_at, a.reason_code, greatest(0, 3 - public.cv_failure_count(a.account_id, a.platform, a.channel_key))
  from public.creator_verification_applications a
  where a.account_id = auth.uid()
  order by greatest(
             a.issued_at, a.revoked_at,
             case when public.cv_shown_status(a.status, a.issued_at) = 'expired' then a.issued_at + public.cv_post_window() else a.ended_at end
           ) desc,
           a.issued_at desc, a.id;
$$;
revoke all on function public.my_creator_verifications() from public, anon;
grant execute on function public.my_creator_verifications() to authenticated;

-- 내 확인 상태 — 지금 아이디·다음 재확인·유예 끝·다시 확인 요청 칸을 더한다(INV-V17·V20)
drop function public.my_creator_verification_state();
create function public.my_creator_verification_state()
returns table (
  creator_id uuid, name text, channel_title text, verified boolean, platform text, channel_url text, verified_at timestamptz,
  operator_only boolean, handle text, next_recheck_at timestamptz, grace_until timestamptz, recheck_requested_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.name, c.channel_title, c.identity_verified, c.platform, c.channel_url,
         case when c.identity_verified then (
           select max(e.at) from public.creator_verification_events e where e.creator_id = c.id and e.action = 'approve'
         ) end,
         public.cv_operator_only(c.id),
         public.cv_current_handle(c.id),
         case when c.identity_verified then coalesce(c.link_checked_at, now()) + public.cv_recheck_window() end,
         case when c.identity_verified then c.link_missing_at + public.cv_link_grace() end,
         case when c.identity_verified then c.recheck_requested_at end
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;
revoke all on function public.my_creator_verification_state() from public, anon;
grant execute on function public.my_creator_verification_state() to authenticated;

-- ── 운영자 쪽 ────────────────────────────────────────────

-- INV-V19: 반려 — 새 사유 목록
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
  perform public.cv_check_reason(p_reason_code, array['link_not_found', 'link_mismatch', 'name_mismatch', 'channel_unreachable', 'other'], p_memo);
  select * into v_app from public.creator_verification_applications a where a.id = p_application_id;
  if not found then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  select c.id into v_creator_id from public.creators c where c.profile_id = v_app.account_id for no key update;
  perform public.cv_lock_channel(v_app.platform, v_app.channel_key);
  if not public.cv_end_application(v_app.id, 'rejected', p_reason_code, true) then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;
  insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code, link_handle)
  values (v_creator_id, auth.uid(), 'reject', btrim(coalesce(p_memo, '')), v_app.id, v_app.channel_url, v_app.code, v_app.method, p_reason_code, v_app.link_handle);
end $$;

-- INV-K10·V9·V10: 승인 취소 본체 — 운영자 취소와 유예 끝 취소(INV-V20)가 같이 쓴다. 부르는 쪽이 사유를 확인한다.
-- 20261006000006 의 admin_revoke_creator 본문과 같고, 처리한 사람을 인자로 받고 재확인 칸을 지운다.
create function public.cv_revoke(p_creator_id uuid, p_reason_code text, p_memo text, p_actor uuid)
returns void
language plpgsql volatile set search_path = ''
as $$
declare
  v_creator public.creators;
  v_claim public.creator_channel_claims;
  v_open public.creator_verification_applications;
  v_granted public.creator_verification_applications;
begin
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
        insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code, link_handle)
        values (p_creator_id, p_actor, 'reject', '승인 취소로 함께 끝남', v_open.id, v_open.channel_url, v_open.code, v_open.method, 'other', v_open.link_handle);
      else
        perform public.cv_end_application(v_open.id, 'expired', null, false);
      end if;
    end loop;
  end if;

  perform set_config('fankkuk.verifying', 'on', true);
  update public.creators c set identity_verified = false, link_missing_at = null, recheck_requested_at = null where c.id = p_creator_id;
  perform set_config('fankkuk.verifying', '', true);

  insert into public.creator_verification_events (creator_id, acted_by, action, reason, application_id, channel_url, code, method, reason_code, link_handle)
  values (p_creator_id, p_actor, 'revoke', p_memo, v_granted.id, v_creator.channel_url, v_granted.code,
          public.cv_shown_method(v_granted.id, v_granted.method), p_reason_code, v_granted.link_handle);
end $$;

create or replace function public.admin_revoke_creator(p_creator_id uuid, p_reason_code text, p_memo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
begin
  if not public.is_operator() then
    raise exception '운영자만 취소한다' using errcode = '42501';
  end if;
  perform public.cv_check_reason(p_reason_code, array['channel_gone', 'not_owner_confirmed', 'policy_violation', 'link_removed', 'other'], v_memo);
  perform public.cv_revoke(p_creator_id, p_reason_code, v_memo, auth.uid());
end $$;

-- INV-V15: 횟수 풀기 — 팬꾹 링크 요청도 받는다
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
  if not found or v_app.method not in ('code', 'link') then
    raise exception '없는 신청이다' using errcode = 'P0002';
  end if;
  perform 1 from public.creators c where c.profile_id = v_app.account_id for no key update;
  insert into public.creator_verification_unlocks (acted_by, account_id, platform, channel_key, memo)
  values (auth.uid(), v_app.account_id, v_app.platform, v_app.channel_key, v_memo);
end $$;

-- INV-V11·V18: 운영자 요청 목록 — 찾을 링크(요청 때 아이디)와 채널 이름. 연락처·실명 칸은 없다(INV-K8).
drop function public.admin_creator_verifications();
create function public.admin_creator_verifications()
returns table (
  id uuid, nickname text, login_id text, creator_name text, channel_title text, platform text, channel_url text,
  link_handle text, method text, status text, issued_at timestamptz, posted_at timestamptz, used_count integer
)
language sql stable security definer set search_path = ''
as $$
  select a.id, p.nickname, p.login_id, c.name, c.channel_title, a.platform, a.channel_url, a.link_handle, public.cv_shown_method(a.id, a.method),
         public.cv_shown_status(a.status, a.issued_at), a.issued_at, a.posted_at,
         public.cv_failure_count(a.account_id, a.platform, a.channel_key)
  from public.creator_verification_applications a
  join public.profiles p on p.id = a.account_id
  left join public.creators c on c.profile_id = a.account_id
  where public.is_operator()
  order by (a.status = 'posted') desc, a.issued_at desc, a.id
  limit 500;
$$;
revoke all on function public.admin_creator_verifications() from public, anon;
grant execute on function public.admin_creator_verifications() to authenticated;

drop function public.admin_creator_verification_events();
create function public.admin_creator_verification_events()
returns table (
  at timestamptz, actor_nickname text, creator_id uuid, creator_name text, action text, reason text,
  application_id uuid, reason_code text, method text, channel_url text, code text, link_handle text
)
language sql stable security definer set search_path = ''
as $$
  select e.at, a.nickname, e.creator_id, c.name, e.action, e.reason, e.application_id, e.reason_code, e.method, e.channel_url, e.code, e.link_handle
  from public.creator_verification_events e
  join public.profiles a on a.id = e.acted_by
  join public.creators c on c.id = e.creator_id
  where public.is_operator()
  order by e.at desc, e.id desc
  limit 500;
$$;
revoke all on function public.admin_creator_verification_events() from public, anon;
grant execute on function public.admin_creator_verification_events() to authenticated;

-- INV-V20: 재확인 목록 — 재확인에 오른 크리에이터와 유예 중인 크리에이터. 오래된 순.
create function public.admin_creator_rechecks()
returns table (
  creator_id uuid, nickname text, login_id text, creator_name text, channel_title text, platform text, channel_url text,
  handle text, recheck_reason text, link_checked_at timestamptz, link_missing_at timestamptz, grace_until timestamptz,
  recheck_requested_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select c.id, p.nickname, p.login_id, c.name, c.channel_title, c.platform, c.channel_url,
         public.cv_current_handle(c.id), public.cv_recheck_reason(c.id), c.link_checked_at, c.link_missing_at,
         c.link_missing_at + public.cv_link_grace(), c.recheck_requested_at
  from public.creators c
  left join public.profiles p on p.id = c.profile_id
  where public.is_operator() and c.identity_verified
    and (c.link_missing_at is not null or public.cv_recheck_reason(c.id) is not null)
  order by coalesce(c.link_missing_at, c.link_checked_at) nulls first, c.id
  limit 500;
$$;
revoke all on function public.admin_creator_rechecks() from public, anon;
grant execute on function public.admin_creator_rechecks() to authenticated;

-- INV-V20: 재확인 판정. 링크 있음(p_found) → 마지막 확인 시각·아이디를 지금으로, 유예를 지운다.
-- 링크 없음 → 유예 시작(재확인에 올랐고 유예 중이 아닐 때만). 한 번만 반영된다 — 공개 정보 행을 잠근 뒤 상태를 다시 본다.
create function public.admin_recheck_creator_link(p_creator_id uuid, p_found boolean, p_memo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_creator public.creators;
  v_memo text := btrim(coalesce(p_memo, ''));
  v_handle text;
  v_reason text;
begin
  if not public.is_operator() then
    raise exception '운영자만 재확인한다' using errcode = '42501';
  end if;
  if p_found is null or char_length(v_memo) > 200 then
    raise exception '판정과 200자까지의 메모' using errcode = '22023';
  end if;
  select * into v_creator from public.creators c where c.id = p_creator_id for no key update;
  if not found then
    raise exception '없는 크리에이터다' using errcode = 'P0002';
  end if;
  v_handle := public.cv_current_handle(v_creator.id);
  v_reason := public.cv_recheck_reason(v_creator.id);
  if not v_creator.identity_verified then
    raise exception '이미 처리됐다' using errcode = '55000';
  end if;

  if p_found then
    if v_reason is null and v_creator.link_missing_at is null then
      raise exception '이미 처리됐다' using errcode = '55000';
    end if;
    if v_handle is null then
      raise exception '팬꾹 링크 주소가 없는 크리에이터다' using errcode = 'FKV17';
    end if;
    perform set_config('fankkuk.verifying', 'on', true);
    update public.creators c
    set link_checked_at = now(), link_checked_handle = v_handle, link_missing_at = null, recheck_requested_at = null
    where c.id = v_creator.id;
    perform set_config('fankkuk.verifying', '', true);
  else
    if v_reason is null or v_creator.link_missing_at is not null then
      raise exception '이미 처리됐다' using errcode = '55000';
    end if;
    perform set_config('fankkuk.verifying', 'on', true);
    update public.creators c set link_missing_at = now(), recheck_requested_at = null where c.id = v_creator.id;
    perform set_config('fankkuk.verifying', '', true);
  end if;

  insert into public.creator_verification_events (creator_id, acted_by, action, reason, channel_url, method, link_handle)
  values (v_creator.id, auth.uid(), case when p_found then 'recheck_found' else 'recheck_missing' end, v_memo, v_creator.channel_url, 'link', v_handle);
end $$;
revoke all on function public.admin_recheck_creator_link(uuid, boolean, text) from public, anon;
grant execute on function public.admin_recheck_creator_link(uuid, boolean, text) to authenticated;

-- INV-V20: 유예가 끝났는데 다시 확인되지 않은 크리에이터의 승인 취소. 예약 작업 실행자(postgres)만 부른다.
-- 처리한 사람 칸은 유예를 시작한 운영자(마지막 「링크 없음」 기록)로 남긴다. 「링크 있음」이 먼저 끝났으면 잠근 뒤 다시 보고 건너뛴다.
create function public.cv_expire_link_grace()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_creator public.creators;
  v_actor uuid;
  v_done integer := 0;
begin
  for v_id in
    select c.id from public.creators c
    where c.identity_verified and c.link_missing_at is not null and c.link_missing_at <= now() - public.cv_link_grace()
    order by c.link_missing_at
  loop
    select * into v_creator from public.creators c where c.id = v_id for no key update;
    if not v_creator.identity_verified or v_creator.link_missing_at is null or v_creator.link_missing_at > now() - public.cv_link_grace() then
      continue;
    end if;
    select e.acted_by into v_actor from public.creator_verification_events e
    where e.creator_id = v_id and e.action = 'recheck_missing' order by e.id desc limit 1;
    if v_actor is null then
      continue;
    end if;
    perform public.cv_revoke(v_id, 'link_removed', '유예 기간이 끝남', v_actor);
    v_done := v_done + 1;
  end loop;
  return v_done;
end $$;
revoke all on function public.cv_expire_link_grace() from public, anon, authenticated, service_role;

select cron.schedule('fankkuk-link-grace', '7 * * * *', 'select public.cv_expire_link_grace()');

-- ── 확인 대기 중인 크리에이터의 링크 페이지 (INV-V22) ─────────

-- 지금 아이디·묶인 옛 아이디로 찾는다. 확인 전이고 살아 있는 팬꾹 링크 요청이 있는 크리에이터만.
-- 돌려주는 것은 공개 이름·한 줄 소개·프로필 사진 경로·얼굴 색과 지금 아이디뿐이다(채널·주소·요청 내용은 없다).
create function public.verifying_creator_by_handle(p_handle text)
returns table (creator_id uuid, handle text, name text, intro text, photo_path text, face_tone text)
language sql stable security definer set search_path = ''
as $$
  select c.id, cur.handle, c.name, c.intro, c.photo_path, c.face_tone
  from public.creator_handles h
  join public.creators c on c.id = h.creator_id and not c.identity_verified and c.profile_id is not null
  join public.creator_handles cur on cur.creator_id = h.creator_id and cur.retired_until is null
  where h.handle = lower(coalesce(p_handle, ''))
    and (h.retired_until is null or h.retired_until > now())
    and exists (
      select 1 from public.creator_verification_applications a
      where a.account_id = c.profile_id and a.method = 'link' and a.status = 'posted'
    );
$$;
revoke all on function public.verifying_creator_by_handle(text) from public;
grant execute on function public.verifying_creator_by_handle(text) to anon, authenticated;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.cv_recheck_window() from public, anon, authenticated;
revoke all on function public.cv_link_grace() from public, anon, authenticated;
revoke all on function public.cv_current_handle(uuid) from public, anon, authenticated;
revoke all on function public.cv_recheck_reason(uuid) from public, anon, authenticated;
revoke all on function public.cv_revoke(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.request_creator_link_recheck() from public, anon;
grant execute on function public.request_creator_link_recheck() to authenticated;

-- ── 팬꾹 링크 미리 확인 — 채널 확인 단계의 링크 만들기 칸 (signup INV-U14, 2026-11-02 사용자 「팬꾹 링크도 이미 사용중인건지 체크를 해야겠네」) ──
-- 20261015000010 의 signup_name_check 와 같고, 종류 link_handle 과 답 reserved(예약어)만 더했다. 한도(1분 30번)·해시·권한은 그대로.
create or replace function public.signup_name_check(p_ip_hash text, p_kind text, p_value text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- link_handle 은 소문자로 바꾼 뒤 본다(creator-link INV-E2 — 저장 때와 같은 순서)
  v_value text := case when p_kind = 'link_handle' then lower(btrim(coalesce(p_value, ''))) else btrim(coalesce(p_value, '')) end;
  v_row public.signup_check_hits;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception '접속 주소는 64자리 해시로만 받는다' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('login_id', 'nickname', 'link_handle') then
    raise exception '확인 종류는 login_id·nickname·link_handle 이다' using errcode = '22023';
  end if;

  -- 형식이 틀린 값은 한도와 상관없이 invalid — 계정 표를 찾지 않고 횟수에도 넣지 않는다
  if p_kind = 'login_id' and v_value !~ '^[a-z0-9_]{4,20}$' then -- 가입 아이디 꼴(INV-U6)과 같다
    return 'invalid';
  end if;
  if p_kind = 'nickname' and public.nickname_problem(v_value) is not null then
    return 'invalid';
  end if;
  -- signup INV-U14: 팬꾹 링크 — 꼴이 틀리면 invalid, 예약어(사이트 첫 단계 주소 포함)면 reserved. 둘 다 계정 표를 찾지 않고 횟수에도 넣지 않는다
  if p_kind = 'link_handle' and v_value !~ '^[a-z0-9_]{3,20}$' then
    return 'invalid';
  end if;
  if p_kind = 'link_handle' and exists (select 1 from public.creator_handle_reserved r where r.word = v_value) then
    return 'reserved';
  end if;

  -- 10분 넘게 조용하고 쉬는 중이 아닌 주소의 줄은 지운다 — 해시도 오래 남기지 않는다
  delete from public.signup_check_hits h
  where h.touched_at < now() - interval '10 minutes' and (h.blocked_until is null or h.blocked_until < now());

  -- 같은 주소의 확인은 이 줄에서 차례로 지나간다(동시에 와도 한도를 넘지 않게)
  insert into public.signup_check_hits (ip_hash) values (p_ip_hash) on conflict (ip_hash) do nothing;
  select * into v_row from public.signup_check_hits h where h.ip_hash = p_ip_hash for update;

  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    update public.signup_check_hits h set touched_at = now() where h.ip_hash = p_ip_hash;
    return 'rate_limited';
  end if;
  if v_row.window_started_at <= now() - interval '1 minute' then
    v_row.window_started_at := now();
    v_row.hits := 0;
  end if;
  v_row.hits := v_row.hits + 1;
  if v_row.hits > 30 then
    update public.signup_check_hits h
    set window_started_at = v_row.window_started_at, hits = v_row.hits, blocked_until = now() + interval '1 minute', touched_at = now()
    where h.ip_hash = p_ip_hash;
    return 'rate_limited';
  end if;
  update public.signup_check_hits h
  set window_started_at = v_row.window_started_at, hits = v_row.hits, blocked_until = null, touched_at = now()
  where h.ip_hash = p_ip_hash;

  if p_kind = 'login_id' then
    return case when exists (select 1 from public.profiles p where p.login_id = v_value) then 'taken' else 'available' end;
  end if;
  -- 지금 쓰는 아이디 또는 90일 묶인 옛 아이디(creator-link INV-E3). 누구의 것인지는 돌려주지 않는다
  if p_kind = 'link_handle' then
    return case when exists (select 1 from public.creator_handles h where h.handle = v_value and (h.retired_until is null or h.retired_until > now()))
                then 'taken' else 'available' end;
  end if;
  return case when exists (select 1 from public.profiles p where lower(btrim(p.nickname)) = lower(v_value)) then 'taken' else 'available' end;
end $function$;

revoke all on function public.signup_name_check(text, text, text) from public, anon, authenticated;
grant execute on function public.signup_name_check(text, text, text) to service_role;

notify pgrst, 'reload schema';
