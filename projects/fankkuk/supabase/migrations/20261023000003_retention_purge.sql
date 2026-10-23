-- 기간 지난 가명 기록 자동 삭제 (2026-10-23, my-account INV-A16 · approval-signature INV-S14 S14c) — public 쪽.
-- 스펙: docs/specs/my-account.md INV-A15·A16 (S16~S16c), docs/specs/approval-signature.md INV-S14 (S14c)
--
-- 무엇을 바꾸나
--   1) withdraw_account — 탈퇴한 사람이 쓴 1:1 문의를 지우지 않고 가명 계정으로 옮긴다. 문의는 3년 보관 대상(INV-A16)인데,
--      계정을 지우면 함께 지워지는 칸이라 20261023000002 의 「계정을 가리키는 칸 옮기기」가 건너뛰어 탈퇴 즉시 지워지고 있었다.
--      나머지 본문은 20261023000002 그대로다.
--   2) retention_purge_runs — 자동 삭제가 돌 때마다 시각과 지운 건수를 한 줄. 사람을 가리키는 칸은 없다.
--   3) retention_purge() — 기간 계산은 DB 시각(now()) 기준. 예약 작업 실행자(postgres)만 부른다(누구에게도 실행 권한을 주지 않는다).
--      · 가명 처리된 승인 서명(원문을 비우고 해시만 남긴 줄) — 서명 시각부터 5년
--      · 탈퇴한 사람(가명 계정)이 쓴 1:1 문의 — 쓴 때부터 3년
--      · 주문 기록 — 한쪽만 탈퇴한 주문을 어떻게 할지 결정(카드 d123) 뒤에 붙인다. 지금은 0건.
--      · 운영자 접속 기록(관리자 로그인·조회) — 그런 기록 표가 아직 없다. 0건.
--      실패하면 그 회차 전체가 되돌려지고 cron.job_run_details 에 오류가 남는다. 다음 날 다시 시도한다.
--   4) 예약 작업 fankkuk-retention — 매일 03:30(한국 시각, cron 은 UTC 라 18:30). 같은 이름으로 다시 등록하면 덮어쓴다.

-- ── 1) 탈퇴 처리 — 1:1 문의를 가명 계정으로 ─────────────────

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

revoke all on function public.withdraw_account(text) from public, anon;
grant execute on function public.withdraw_account(text) to authenticated;

-- ── 2) 자동 삭제 기록 ──────────────────────────────────

create table if not exists public.retention_purge_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  counts jsonb not null
);
alter table public.retention_purge_runs enable row level security;
revoke all on public.retention_purge_runs from public, anon, authenticated, service_role;

-- ── 3) 자동 삭제 ───────────────────────────────────────

create or replace function public.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signatures integer;
  v_inquiries integer;
  v_counts jsonb;
begin
  -- 가명 처리된 서명 기록(INV-S14) — 「고치거나 지울 수 없다」 트리거를 이 처리 동안만 끈다. 탈퇴하지 않은 크리에이터의 서명은 대상이 아니다.
  perform public.withdrawal_toggle_append_only('public.approval_signatures'::regclass, false);
  delete from public.approval_signatures s
   where s.signed_content is null and s.signer_id is null and s.content_hash is not null
     and s.signed_at < now() - interval '5 years';
  get diagnostics v_signatures = row_count;
  perform public.withdrawal_toggle_append_only('public.approval_signatures'::regclass, true);

  -- 탈퇴한 사람이 쓴 1:1 문의(INV-A16 — 3년)
  delete from public.inquiries i
   using public.profiles p
   where p.id = i.author_id and p.withdrawn_at is not null
     and i.created_at < now() - interval '3 years';
  get diagnostics v_inquiries = row_count;

  v_counts := jsonb_build_object('signatures', v_signatures, 'inquiries', v_inquiries, 'orders', 0, 'access_logs', 0);
  insert into public.retention_purge_runs (counts) values (v_counts);
  return v_counts;
end $$;

revoke all on function public.retention_purge() from public, anon, authenticated, service_role;

-- ── 4) 예약 작업 ──────────────────────────────────

select cron.schedule('fankkuk-retention', '30 18 * * *', 'select public.retention_purge()');
