-- 본인 탈퇴 보안 리뷰 반영 (my-account INV-A17 · INV-A15, 2026-11-27 보안 리뷰 중간 2건).
--
-- 1) 비밀번호 확인을 DB 에서도 강제한다. 20261127000001 의 withdraw_my_account() 는 로그인 키만 있으면 데이터 API 로 바로 불러
--    비밀번호 없이 탈퇴됐다(세션 쿠키를 가진 사람 누구나). 이제 서버가 비밀번호 확인에 성공하면 서버 키로 일회용 허가(2분)를 남기고,
--    withdraw_my_account() 는 그 요청의 로그인한 사람 앞으로 유효한 허가가 있을 때만 처리한다 — 허가는 같은 처리에서 지운다(한 번만 쓴다).
--    허가가 없거나 기한이 지났으면 28000 으로 거부. 허가 표는 화면 쪽 키(anon·authenticated)에 아무 권한이 없다(행 보안 켜고 정책 없음).
--    허가를 남기고 지우는 함수 둘은 서버 키(service_role)만 부른다.
-- 2) 지울 사진을 잃어버리지 않는다. 지금까지는 탈퇴 처리가 돌려준 사진 경로를 서버가 지우다 실패하면 공개 저장소에 사진이 남고 기록도 없었다.
--    이제 안쪽 처리(대표·본인 공통)가 지울 사진을 「지울 사진」 표에 같은 처리로 넣는다. 서버는 저장소에서 지운 뒤 그 줄을 지우고,
--    실패하면 줄이 남는다. 매일 도는 예약 작업이 남은 줄이 있을 때만 앱의 /api/cron/photo-deletions 를 불러 다시 지운다
--    (구독 대기 줄 보내기 schedule_delivery_subscribe 와 같은 주소·비밀 값).
-- 개인정보 구역(pii)은 바꾸지 않는다. 안쪽 처리 본문은 20261127000001 그대로에 「지울 사진 넣기」 한 덩어리만 더했다.

-- ── 1) 일회용 허가 ───────────────────────────────────────
create table if not exists public.self_withdrawal_grants (
  -- 계정 표와 잇지 않는다 — 탈퇴로 계정이 지워져도 허가 줄은 본인용 입구가 지운 것만 사라진다(한 번 쓰면 사라지는지 시험이 볼 수 있게).
  -- 쓰이지 않은 허가는 2분 뒤 효력이 없고, 다음에 누가 허가를 받을 때 하루 지난 줄을 치운다. 계정을 가리키는 칸이 아니라 탈퇴 때 옮기지 않는다.
  profile_id uuid primary key,
  expires_at timestamptz not null
);
alter table public.self_withdrawal_grants enable row level security;
revoke all on public.self_withdrawal_grants from public, anon, authenticated;

-- 서버가 비밀번호 확인에 성공한 뒤에만 부른다. 기한은 DB 시각 기준 2분. 같은 계정이 다시 받으면 기한만 새로 잡는다.
create or replace function public.self_withdrawal_grant(p_profile_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.self_withdrawal_grants where expires_at < now() - interval '1 day';
  insert into public.self_withdrawal_grants (profile_id, expires_at) values (p_profile_id, now() + interval '2 minutes')
  on conflict (profile_id) do update set expires_at = excluded.expires_at;
$$;
revoke all on function public.self_withdrawal_grant(uuid) from public, anon, authenticated;
grant execute on function public.self_withdrawal_grant(uuid) to service_role;

-- 탈퇴가 거부되면(진행 중인 일 등) 서버가 허가를 거둔다 — 거부되면 처리 전체가 되돌아가 허가가 남기 때문이다
create or replace function public.self_withdrawal_grant_drop(p_profile_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.self_withdrawal_grants where profile_id = p_profile_id;
$$;
revoke all on function public.self_withdrawal_grant_drop(uuid) from public, anon, authenticated;
grant execute on function public.self_withdrawal_grant_drop(uuid) to service_role;

-- ── 2) 지울 사진 ─────────────────────────────────────────
create table if not exists public.pending_photo_deletions (
  bucket text not null check (bucket in ('fan-photos', 'creator-photos')),
  path text not null check (path <> ''),
  created_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.pending_photo_deletions enable row level security;
revoke all on public.pending_photo_deletions from public, anon, authenticated;
grant select, delete on public.pending_photo_deletions to service_role;

-- ── 안쪽 처리 — 20261127000001 본문에 지울 사진 넣기만 더한다 ──
create or replace function public.withdraw_account_core(p_profile_id uuid, p_by_self boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.profiles;
  v_creator public.creators;
  v_pseudonym uuid := gen_random_uuid();
  v_fan_paths text[];
  v_creator_paths text[];
  v_tables regclass[];
  v_tab regclass;
  fk record;
begin
  select * into v_old from public.profiles p where p.id = p_profile_id and p.withdrawn_at is null for update;
  if not found or v_old.role not in ('fan', 'creator') then
    raise exception '탈퇴할 수 있는 회원이 아니다' using errcode = 'P0002';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_old.id for update;
  if public.account_has_open_work(v_old.id, v_creator.id) then
    raise exception '진행 중인 선물·역조공이 있다' using errcode = '55000';
  end if;
  -- 진행 중인 선물함 신청은 위 판정이 막는다(2026-11-09). 남은 것 중 신청 받는 중 선물함의 제외 신청만 신청 취소로 닫는다 — 되돌려 넣지 못하게
  perform public.revgift_box_close_excluded_for_withdrawal(v_old.id);
  if v_creator.id is not null and exists (
    select 1 from public.approval_signatures s join public.approval_requests r on r.request_id = s.request_id
    join public.orders o on o.id = r.order_id where o.creator_id = v_creator.id and s.method <> 'fake' and s.signed_content is not null
  ) then
    -- 카카오 서명 묶음에는 인증서(이름)가 들어 있어 떼는 방법은 카카오 연결 때 정한다(external-connections). 그 전에는 지우지 않고 멈춘다.
    raise exception '카카오 서명 기록의 가명 처리는 아직 없다' using errcode = '0A000';
  end if;

  -- 가명 계정 — 로그인 계정 없음, 닉네임은 「탈퇴한 회원」
  insert into public.profiles (id, login_id, nickname, role, withdrawn_at)
  values (v_pseudonym, 'withdrawn_' || substr(replace(v_pseudonym::text, '-', ''), 1, 16), '탈퇴한 회원', v_old.role, now());
  insert into public.account_withdrawals (pseudonym_id, role, processed_by, by_self)
  values (v_pseudonym, v_old.role, case when p_by_self then null else auth.uid() end, p_by_self);

  -- 개인정보 구역(연락처·주소·주소 암호문과 키·확인 기록) — manual/0025. 없으면 여기서 실패하고 아무것도 남지 않는다.
  perform pii.withdraw_account(v_old.id, v_pseudonym, v_creator.id);

  -- 지울 사진(저장소) — 서버가 이 처리 뒤에 지운다
  v_fan_paths := array_remove(array[v_old.fan_photo_path, v_old.fan_bg_path], null);
  v_creator_paths := array_remove(array[v_creator.photo_path, v_creator.bg_path, v_creator.symbol_path], null);
  insert into public.pending_photo_deletions (bucket, path)
  select 'fan-photos', x from unnest(v_fan_paths) x
  union all
  select 'creator-photos', x from unnest(v_creator_paths) x
  on conflict (bucket, path) do nothing;

  -- 계정을 가리키는 칸이 있는 표 전부의 「고치거나 지울 수 없다」 트리거를 잠시 끈다
  select array_agg(distinct c.conrelid) into v_tables
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('public.profiles'::regclass, 'public.creators'::regclass);
  v_tables := v_tables || array['public.approval_signatures'::regclass];
  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  if v_creator.id is not null then
    -- 서명 기록 — 원문은 해시만 남기고 서명자 식별값·원문을 비운다(INV-S14)
    update public.approval_signatures s
       set content_hash = encode(extensions.digest(convert_to(s.signed_content, 'UTF8'), 'sha256'), 'hex'),
           signed_content = null, signer_id = null
      from public.approval_requests r join public.orders o on o.id = r.order_id
     where r.request_id = s.request_id and o.creator_id = v_creator.id and s.signed_content is not null;

    -- 크리에이터 개인 기록(채널·이름 바꾼 기록·확인 신청·기념일)은 보관 대상이 아니라 지운다
    delete from public.creator_name_changes where creator_id = v_creator.id;
    delete from public.creator_channel_claims where creator_id = v_creator.id;
    delete from public.creator_verification_events where creator_id = v_creator.id;
    delete from public.creator_anniversaries where creator_id = v_creator.id;
    delete from public.creator_verification_unlocks where account_id = v_old.id;
    delete from public.creator_verification_applications where account_id = v_old.id;

    -- 크리에이터 행은 주문이 가리키므로 남기고 비운다. 계정 칸이 비면 「탈퇴한 크리에이터」로 읽힌다(gift-reply).
    perform set_config('fankkuk.verifying', 'on', true);
    update public.creators c
       set profile_id = null, withdrawn_at = now(), name = '탈퇴한 크리에이터', channel = '', channel_title = '', intro = '', alias = '',
           platform = null, channel_url = null, channel_key = null, identity_verified = false, searchable = false,
           x_handle = null, fan_name = null, fan_color = null, birthday_month = null, birthday_day = null,
           photo_path = null, bg_path = null, preview_pick = 'photo', symbol_path = null, symbol_rights_at = null
     where c.id = v_creator.id;
    perform set_config('fankkuk.verifying', '', true);
  end if;

  -- 계정을 가리키는 칸(지우면 함께 지워지는 칸 말고)을 가명 계정으로 옮긴다. 크리에이터 행은 위에서 비웠다.
  for fk in
    select c.conrelid::regclass as tab, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype <> 'c' and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.creators'::regclass and c.conrelid <> 'public.account_withdrawals'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tab, fk.col, fk.col) using v_pseudonym, v_old.id;
  end loop;

  -- 1:1 문의는 3년 보관(INV-A16) — 계정을 지우면 함께 지워지는 칸이라 위 반복이 옮기지 않는다.
  -- 답이 달린 문의를 고치지 못하게 하는 트리거는 이 처리 동안만 끈다(표를 잠그고, 실패하면 함께 되돌아간다).
  alter table public.inquiries disable trigger inquiries_freeze_answered;
  update public.inquiries set author_id = v_pseudonym where author_id = v_old.id;
  alter table public.inquiries enable trigger inquiries_freeze_answered;

  delete from public.profiles where id = v_old.id;
  delete from auth.users where id = v_old.id;

  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  return jsonb_build_object('pseudonym', v_pseudonym, 'fan_photo_paths', to_jsonb(v_fan_paths), 'creator_photo_paths', to_jsonb(v_creator_paths));
end $$;
revoke all on function public.withdraw_account_core(uuid, boolean) from public, anon, authenticated, service_role;

-- ── 본인용 입구 — 허가가 있어야 처리 (INV-A17) ──────────
create or replace function public.withdraw_my_account()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception '로그인한 사람만 본인 탈퇴를 한다' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_uid and p.withdrawn_at is null;
  if not found then
    raise exception '탈퇴할 수 있는 회원이 아니다' using errcode = 'P0002';
  end if;
  if v_role not in ('fan', 'creator') then
    raise exception '팬·크리에이터만 본인 탈퇴를 한다' using errcode = '42501';
  end if;
  -- 서버가 비밀번호를 확인하고 남긴 허가 — 한 번 쓰면 사라진다(아래 처리가 실패하면 함께 되돌아간다)
  delete from public.self_withdrawal_grants g where g.profile_id = v_uid returning g.expires_at into v_expires;
  if v_expires is null or v_expires <= now() then
    raise exception '비밀번호 확인 허가가 없다' using errcode = '28000';
  end if;
  return public.withdraw_account_core(v_uid, true);
end $$;

revoke all on function public.withdraw_my_account() from public, anon, service_role;
grant execute on function public.withdraw_my_account() to authenticated;

-- ── 매일 — 남은 사진이 있을 때만 앱을 부른다 ─────────────
create or replace function public.schedule_photo_deletions()
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_origin text;
  v_secret text;
begin
  if not exists (select 1 from public.pending_photo_deletions) then
    return null;
  end if;
  select s.decrypted_secret into v_origin from vault.decrypted_secrets s where s.name = 'fankkuk_app_origin';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'fankkuk_schedule_secret';
  if v_origin is null or v_secret is null or char_length(v_secret) < 32
     or not (v_origin ~ '^https://[^/?#@]+$' or v_origin ~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{1,5})?$') then
    return null;
  end if;
  return net.http_post(
    url := v_origin || '/api/cron/photo-deletions',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function public.schedule_photo_deletions() from public, anon, authenticated, service_role;

select cron.unschedule('fankkuk-photo-deletions') where exists (select 1 from cron.job where jobname = 'fankkuk-photo-deletions');
select cron.schedule('fankkuk-photo-deletions', '50 18 * * *', 'select public.schedule_photo_deletions()');

notify pgrst, 'reload schema';
