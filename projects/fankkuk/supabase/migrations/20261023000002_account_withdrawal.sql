-- 회원 탈퇴 — 가명 처리와 탈퇴한 크리에이터 막기 (2026-10-23 카드 d121) — public 쪽.
-- 스펙: docs/specs/my-account.md INV-A15 (S15~S15c), docs/specs/approval-signature.md INV-S14·S15 (S14·S14b·S15~S15c)
--
-- 무엇을 바꾸나
--   1) profiles.withdrawn_at · creators.withdrawn_at — 탈퇴한 때. 가명 계정은 profiles 에 withdrawn_at 이 찍힌 줄로 둔다(로그인 계정 없음).
--      profiles.id → auth.users 외래키를 트리거 둘로 바꾼다 — 「탈퇴하지 않은 계정은 로그인 계정이 있어야 한다」·「로그인 계정을 지우면 계정 행도 지운다」. 가명 계정에는 로그인 계정이 없다.
--      닉네임 중복 금지는 탈퇴하지 않은 계정끼리만. 「탈퇴한 회원」은 가명 계정 말고는 쓸 수 없다.
--   2) approval_signatures.content_hash — 탈퇴 때 서명 원문 대신 남기는 해시. 서명자 식별값·원문은 탈퇴 때 비운다(빈 값 허용).
--   3) 탈퇴한 크리에이터·팬 앞으로 주문·승인 요청·역조공 몫이 생기지 않는다(넣는 순간 트리거가 거부, INV-S15).
--   4) account_withdrawals — 탈퇴 처리 기록(가명 식별자·역할·시각·처리한 대표). 원래 계정을 되짚는 칸은 없다(INV-A15).
--   6) withdrawn_creator(handle, id) — 링크 주소(지금·옛 아이디)나 크리에이터 ID 가 탈퇴한 크리에이터면 true. 공개 읽기 — 크리에이터 페이지가 「탈퇴한 크리에이터입니다.」를 그린다(INV-S15).
--   5) withdraw_account(login_id) — 대표만. 없는 회원·운영자·이미 탈퇴한 계정은 P0002, 진행 중인 일이 있으면 55000 으로 거부. 한 처리 안에서
--      가명 계정 만들기 → 개인정보 구역 지우기(pii.withdraw_account, manual/0025) → 서명 기록 가명 처리 → 크리에이터 행 비우기 →
--      계정을 가리키는 칸을 가명 계정으로 옮기기 → 원래 계정·로그인 계정 지우기. 저장소에서 지울 사진 경로를 저장소별로(팬 사진·크리에이터 사진) 돌려준다(서버가 지운다).
--
-- manual/0025 와 한쪽만 적용된 상태
--   이 파일만: withdraw_account 가 pii.withdraw_account 를 찾지 못해 실패하고, 한 처리라 아무것도 지워지지 않는다. 막기 트리거(3)는 탈퇴한 계정이 없으니 하는 일이 없다.
--   manual/0025 만: pii.withdraw_account 가 있지만 부르는 곳이 없다. 지금과 같다.

-- ── 1) 탈퇴 칸과 가명 계정 ─────────────────────────────

alter table public.profiles add column if not exists withdrawn_at timestamptz;
alter table public.creators add column if not exists withdrawn_at timestamptz;

alter table public.profiles drop constraint if exists profiles_id_fkey;

create or replace function public.profiles_need_login_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.withdrawn_at is null and not exists (select 1 from auth.users u where u.id = new.id) then
    raise exception '탈퇴하지 않은 계정은 로그인 계정이 있어야 한다' using errcode = '23503';
  end if;
  if new.withdrawn_at is null and lower(public.app_trim(new.nickname)) = '탈퇴한 회원' then
    raise exception '이미 쓰는 닉네임' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists profiles_need_login_account on public.profiles;
create trigger profiles_need_login_account before insert or update of id, nickname, withdrawn_at on public.profiles
  for each row execute function public.profiles_need_login_account();

-- 외래키가 하던 「로그인 계정을 지우면 계정 행도 지운다」는 트리거로 이어 간다(가명 계정은 로그인 계정이 없어 해당 없음)
create or replace function public.profiles_drop_with_login_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;

drop trigger if exists profiles_drop_with_login_account on auth.users;
create trigger profiles_drop_with_login_account after delete on auth.users
  for each row execute function public.profiles_drop_with_login_account();

drop index if exists public.profiles_nickname_key;
create unique index profiles_nickname_key on public.profiles (lower(btrim(nickname))) where withdrawn_at is null;

-- ── 2) 서명 기록 ───────────────────────────────────────

alter table public.approval_signatures add column if not exists content_hash text;
alter table public.approval_signatures alter column signer_id drop not null;
alter table public.approval_signatures alter column signed_content drop not null;
alter table public.approval_signatures drop constraint if exists approval_signatures_withdrawn_shape;
alter table public.approval_signatures add constraint approval_signatures_withdrawn_shape
  check ((signed_content is not null and signer_id is not null) or (signed_content is null and signer_id is null and content_hash is not null));

-- ── 3) 탈퇴한 계정 앞으로 새 일이 생기지 않는다 ─────────

create or replace function public.reject_for_withdrawn()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_withdrawn boolean;
begin
  if tg_table_name = 'orders' then
    v_withdrawn := exists (select 1 from public.creators c where c.id = new.creator_id and c.withdrawn_at is not null)
      or exists (select 1 from public.profiles p where p.id = new.fan_id and p.withdrawn_at is not null);
  elsif tg_table_name = 'approval_requests' then
    v_withdrawn := exists (select 1 from public.orders o join public.creators c on c.id = o.creator_id
                           where o.id = new.order_id and c.withdrawn_at is not null);
  elsif tg_table_name = 'revgift_shares' then
    v_withdrawn := exists (select 1 from public.profiles p where p.id = new.fan_id and p.withdrawn_at is not null);
  elsif tg_table_name = 'revgift_sends' then
    v_withdrawn := exists (select 1 from public.creators c where c.id = new.creator_id and c.withdrawn_at is not null);
  end if;
  if v_withdrawn then
    raise exception '탈퇴한 회원' using errcode = 'P0001', hint = 'withdrawn';
  end if;
  return new;
end $$;

drop trigger if exists orders_reject_withdrawn on public.orders;
create trigger orders_reject_withdrawn before insert on public.orders for each row execute function public.reject_for_withdrawn();
drop trigger if exists approval_requests_reject_withdrawn on public.approval_requests;
create trigger approval_requests_reject_withdrawn before insert on public.approval_requests for each row execute function public.reject_for_withdrawn();
drop trigger if exists revgift_shares_reject_withdrawn on public.revgift_shares;
create trigger revgift_shares_reject_withdrawn before insert on public.revgift_shares for each row execute function public.reject_for_withdrawn();
drop trigger if exists revgift_sends_reject_withdrawn on public.revgift_sends;
create trigger revgift_sends_reject_withdrawn before insert on public.revgift_sends for each row execute function public.reject_for_withdrawn();

-- ── 4) 탈퇴 처리 기록 ──────────────────────────────────

create table if not exists public.account_withdrawals (
  pseudonym_id uuid primary key references public.profiles (id),
  role public.user_role not null,
  withdrawn_at timestamptz not null default now(),
  processed_by uuid not null references public.profiles (id)
);
alter table public.account_withdrawals enable row level security;
revoke all on public.account_withdrawals from public, anon, authenticated;

-- ── 5) 탈퇴 처리 ───────────────────────────────────────

-- 진행 중인 일 — 끝나지 않은 주문, 사무실에 남은 상자, 끝나지 않은 역조공. 하나라도 있으면 탈퇴하지 않는다(INV-A15·S15).
create or replace function public.account_has_open_work(p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with my_orders as (
    select o.id, o.status from public.orders o where o.fan_id = p_account or (p_creator is not null and o.creator_id = p_creator)
  ), my_shares as (
    select s.id, s.reply, s.shipped_at, s.returned_at, s.cancelled_at, s.disposed_at
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.fan_id = p_account or (p_creator is not null and d.creator_id = p_creator)
  )
  select exists (select 1 from my_orders where status not in ('shipped', 'rejected', 'expired', 'canceled'))
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from my_shares where reply in ('waiting', 'accepted')
               and shipped_at is null and returned_at is null and cancelled_at is null and disposed_at is null)
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'));
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated;

-- 표 하나의 「고치거나 지울 수 없다」 트리거를 이 처리 동안만 끈다. 표를 잠그므로 다른 처리는 이 처리가 끝날 때까지 기다린다.
-- 처리가 실패하면 끈 것도 함께 되돌아간다.
create or replace function public.withdrawal_toggle_append_only(p_table regclass, p_enable boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
begin
  for t in
    select tg.tgname from pg_trigger tg join pg_proc p on p.oid = tg.tgfoid
    where tg.tgrelid = p_table and not tg.tgisinternal and p.proname like '%append%'
  loop
    execute format('alter table %s %s trigger %I', p_table, case when p_enable then 'enable' else 'disable' end, t.tgname);
  end loop;
end $$;
revoke all on function public.withdrawal_toggle_append_only(regclass, boolean) from public, anon, authenticated;

create or replace function public.withdraw_account(p_login_id text)
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
  if not public.is_owner() then
    raise exception '대표만 탈퇴를 처리한다' using errcode = '42501';
  end if;
  select * into v_old from public.profiles p where p.login_id = p_login_id and p.withdrawn_at is null for update;
  if not found or v_old.role not in ('fan', 'creator') then
    raise exception '탈퇴할 수 있는 회원이 아니다' using errcode = 'P0002';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_old.id for update;
  if public.account_has_open_work(v_old.id, v_creator.id) then
    raise exception '진행 중인 선물·역조공이 있다' using errcode = '55000';
  end if;
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
  insert into public.account_withdrawals (pseudonym_id, role, processed_by) values (v_pseudonym, v_old.role, auth.uid());

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

  delete from public.profiles where id = v_old.id;
  delete from auth.users where id = v_old.id;

  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  return jsonb_build_object('pseudonym', v_pseudonym, 'fan_photo_paths', to_jsonb(v_fan_paths), 'creator_photo_paths', to_jsonb(v_creator_paths));
end $$;

revoke all on function public.withdraw_account(text) from public, anon;
grant execute on function public.withdraw_account(text) to authenticated;

-- ── 6) 탈퇴한 크리에이터인지 (크리에이터 페이지 「탈퇴한 크리에이터입니다.」) ──

create or replace function public.withdrawn_creator(p_handle text default null, p_creator uuid default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.creators c
    where c.withdrawn_at is not null
      and (c.id = p_creator or exists (select 1 from public.creator_handles h where h.creator_id = c.id and h.handle = lower(coalesce(p_handle, ''))))
  );
$$;
revoke all on function public.withdrawn_creator(text, uuid) from public;
grant execute on function public.withdrawn_creator(text, uuid) to anon, authenticated;
