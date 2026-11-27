-- 본인 탈퇴 (my-account INV-A17 · S17~S17e, 2026-11-27 사용자 「추천대로」). INV-A15 의 탈퇴 처리를 입구 둘이 같이 쓴다.
--
-- 1) account_withdrawals — 「처리한 운영자」 칸을 비울 수 있게 하고 by_self(본인 탈퇴)를 더한다. 본인 탈퇴가 아니면 운영자 칸이 있어야 한다.
-- 2) withdraw_account_core(계정, 본인 탈퇴인가) — 20261109000003 의 withdraw_account 본문을 그대로 옮긴 안쪽 함수. 대표 판정은 하지 않는다 —
--    그래서 화면 쪽 키(anon·authenticated)와 서버 키(service_role) 모두 부를 수 없다. 아래 두 입구가 정의한 계정(security definer)으로 부른다.
--    바뀐 곳은 셋뿐이다: 계정을 아이디 대신 ID 로 받는다, 탈퇴 기록에 by_self 를 적고 본인 탈퇴면 운영자 칸을 비운다, 대표 판정 줄이 입구로 갔다.
-- 3) withdraw_account(아이디) — 대표용 입구. 동작·오류 코드는 그대로다(대표가 아니면 42501, 없는 회원·운영자·이미 탈퇴 P0002, 진행 중인 일 55000,
--    카카오 서명 기록 0A000).
-- 4) withdraw_my_account() — 본인용 입구. 인자가 없다 — 계정은 그 요청의 로그인한 사람(auth.uid())뿐이다. 팬·크리에이터만(그 밖 42501).
--    비밀번호 다시 확인은 서버가 이 함수를 부르기 전에 한다(INV-A17 강제 위치: 서버). 로그인한 사람(authenticated)만 부를 수 있다.
--
-- 개인정보 구역(pii.withdraw_account, manual/0025)은 바꾸지 않는다 — 안쪽 함수가 지금처럼 부른다.
-- manual/0025 가 없는 DB 에서는 두 입구 모두 지금처럼 그 줄에서 실패하고, 한 처리라 아무것도 지워지지 않는다.

-- ── 1) 탈퇴 기록 ─────────────────────────────────────────
alter table public.account_withdrawals alter column processed_by drop not null;
alter table public.account_withdrawals add column if not exists by_self boolean not null default false;
alter table public.account_withdrawals drop constraint if exists account_withdrawals_who_check;
alter table public.account_withdrawals add constraint account_withdrawals_who_check check (by_self or processed_by is not null);

-- ── 2) 안쪽 처리 ─────────────────────────────────────────
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

-- ── 3) 대표용 입구 ───────────────────────────────────────
create or replace function public.withdraw_account(p_login_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_owner() then
    raise exception '대표만 탈퇴를 처리한다' using errcode = '42501';
  end if;
  select p.id into v_id from public.profiles p where p.login_id = p_login_id and p.withdrawn_at is null;
  if v_id is null then
    raise exception '탈퇴할 수 있는 회원이 아니다' using errcode = 'P0002';
  end if;
  -- 운영자 계정이면 안쪽 처리가 P0002 로 거부한다(지금과 같은 코드)
  return public.withdraw_account_core(v_id, false);
end $$;

revoke all on function public.withdraw_account(text) from public, anon;
grant execute on function public.withdraw_account(text) to authenticated;

-- ── 4) 본인용 입구 (INV-A17) ─────────────────────────────
create or replace function public.withdraw_my_account()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
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
  return public.withdraw_account_core(v_uid, true);
end $$;

revoke all on function public.withdraw_my_account() from public, anon, service_role;
grant execute on function public.withdraw_my_account() to authenticated;

notify pgrst, 'reload schema';
