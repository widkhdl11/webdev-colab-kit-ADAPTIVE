-- 팬 주소 등록 없애기 · 팬 선물 반송 주소는 결제 때 받은 주문 사본으로 · 역조공 받기는 그때 입력.
-- 결정: docs/DECISIONS.md 2026-11-08 「팬 주소 등록을 없앤다」·「팬 선물의 반송 주소는 보낼 때(결제 화면) 받는다(B)」.
-- 스펙: docs/specs/payment.md INV-M25 (S25~S25c), docs/specs/address-protection.md INV-P17·P18, docs/specs/office-workflow.md INV-W11·W15 (S15·S15f),
--       docs/specs/reverse-gift.md INV-R4·R6 (S4·S6).
-- 사람이 직접 적용한다(개인정보 구역 pii 의 표를 지우고 함수를 바꾼다). manual 0019·0020·0024·0029·0031 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0032.sh
-- 확인: npx vitest run --config vitest.integration.config.mts order-return-address-db return-address-confirm-db revgift-address-db fan-address-db
--   → 「(manual/0032 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- ■ 무엇이 지워지나 — 되돌릴 수 없다
--   · pii.fan_addresses 표 전체 — 팬들이 설정에 등록해 둔 받을 주소(봉인 암호문·이름표·할증 구분)가 모두 사라진다. 백업은 남기지 않는다.
--     이미 역조공 몫·반송 상자·선물함 신청에 복사된 사본(pii.revgift_addresses·pii.return_addresses·pii.revgift_box_addresses)은 그대로 남는다.
--   · 함수 set_my_fan_address(jsonb, text, text) · delete_my_fan_address() · my_fan_address_status() — 팬 주소 등록·지우기·상태 읽기.
--   · 함수 accept_revgift(text)(등록 주소를 몫에 복사하던 받기) · confirm_return_address(text, integer)(등록 주소를 상자에 복사하던 반송 확인).
--   남는 것: pii.fan_address_events(누가·언제 등록·변경·지웠는지 기록, 주소 값 없음) — 지난 기록이라 지우지 않는다. 탈퇴 때는 지금처럼 그 계정 줄을 지운다.
--
-- ■ 무엇을 만들고 바꾸나
--   1) pii.order_return_addresses — 팬 선물 주문 하나에 반송 주소 사본 하나(봉인 암호문 + 넣은 계정 + 할증 구분 + 시각). 화면 쪽 키·서버 키 모두 읽지 못한다.
--      pii.order_return_address_events — 저장(saved)·지움(deleted + 까닭) 기록, 주소 값 없음.
--   2) save_my_order_return_address(주문번호, 봉인, 구분) — 로그인한 보낸 사람 본인의 결제 대기 주문에만(INV-M25 ②). 결과: saved · not_found(남의·없는 주문, 로그인 없음 — 같은 답)
--      · closed(결제 대기가 아님 · 첫 결제가 이미 완료·승인 중). 봉인 꼴·구분 목록이 아니면 22023. 다시 넣으면 덮어쓴다.
--   3) confirm_return_address(주문번호, 상자 순번, 봉인) — 세 인자. 봉인이 있으면(「다른 주소 입력」) 그 봉인을, 없으면 그 주문의 결제 때 사본을 상자에 복사한다.
--      주문 사본도 봉인도 없으면: 보낸 사람이 크리에이터 계정이면 크리에이터 등록 주소(지금과 같음), 팬이면 no_address(화면이 입력 칸을 띄운다).
--      역조공 몫 상자는 보낸 크리에이터의 등록 주소로만 — 봉인을 넣으면 22023. 결과 값·잠금 순서·기한은 manual/0020 과 같다.
--   4) accept_revgift(주문번호, 봉인) — 두 인자. 받기 창에서 입력한 봉인을 몫에 넣는다(INV-R4). 봉인이 없거나 꼴이 아니면 22023. 나머지 판정은 manual/0019 와 같다.
--   5) office_drop_address_copies() — manual/0024 그대로에 「끝난 주문의 반송 주소 사본 지우기」를 더한다(INV-M25 ④). 끝남은 public.order_is_finished(탈퇴·보관 기한이 쓰는 판정).
--      돌려주는 값에 order_return(지운 주문 사본 수)이 더해진다.
--   6) pii.withdraw_account — manual/0029 그대로에서 pii.fan_addresses 지우기를 빼고, 그 계정의 주문 사본·선물함 신청 사본 지우기를 더한다.
--   7) pii.revgift_box_save_copy — 지금 0031 과 같은 본문으로 다시 쓴다. 옛 0031(99eb38ee 판, 봉인이 없으면 등록 주소를 복사하던 갈래)이 이미 적용된 DB 에서도
--      이 파일 하나로 새 0031 → 0032 를 적용한 DB 와 같은 상태가 된다(옛 판의 갈래는 지워진 pii.fan_addresses 를 읽어 실행 때 실패했을 것이다).
--      그래서 이미 0031 을 적용한 DB 에 0031 을 다시 넣지 않는다.
--
-- ■ 앱과 DB 가 한쪽만 바뀐 상태
--   이 파일만(옛 앱): 설정의 받을 주소 저장·역조공 받기(한 인자)·반송 주소 확인(두 인자)·선물함 신청(봉인 없이)이 「함수 없음」·22023 으로 실패한다(아무것도 저장되지 않는다).
--                    선물 결제는 그대로 되지만 반송 주소 사본이 없어, 반송이 생기면 확인 창의 「주소 입력」 칸으로 받는다(새 앱).
--   앱만(이 파일 없이): 선물 등록이 반송 주소 저장 함수가 없어 결제창을 열기 전에 실패한다 — 주문은 결제 대기로 남았다가 24시간 뒤 닫힌다(돈은 나가지 않는다).
--                    역조공 받기·반송 주소 확인도 「함수 없음」으로 실패한다. 주소가 엉뚱한 곳에 저장되거나 열리는 경우는 없다.
--   그래서 운영에는 0031 다음에, 앱 배포와 같은 때 적용한다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('pii.fan_addresses') is null or to_regclass('pii.return_addresses') is null or to_regclass('pii.revgift_addresses') is null then
    raise exception '팬 주소·반송 복사본·몫 사본 표가 없다 — manual/0019·0020 을 먼저 적용한다';
  end if;
  if to_regprocedure('public.office_drop_address_copies()') is null or to_regprocedure('pii.withdraw_account(uuid,uuid,uuid)') is null then
    raise exception '사본 72시간 지우기·탈퇴 정리 함수가 없다 — manual/0024·0025 를 먼저 적용한다';
  end if;
  if to_regclass('pii.revgift_box_addresses') is null then
    raise exception '선물함 신청 사본 표가 없다 — manual/0031 을 먼저 적용한다';
  end if;
  if to_regprocedure('public.order_is_finished(uuid)') is null then
    raise exception '주문 끝남 판정이 없다 — 마이그레이션 20261023000009 를 먼저 적용한다';
  end if;
end $$;

-- ── 1) 주문 반송 주소 사본 (INV-M25) ─────────────────

create table pii.order_return_addresses (
  order_id uuid primary key references public.orders (id) on delete cascade,
  -- 넣은 계정(그 주문을 보낸 계정) — 봉인 속에도 같은 계정이 묶여 있다
  account_id uuid not null references public.profiles (id),
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  surcharge_region text not null constraint order_return_addresses_surcharge_region check (surcharge_region in ('none', 'jeju', 'island')),
  created_at timestamptz not null default now()
);
alter table pii.order_return_addresses enable row level security;
revoke all on pii.order_return_addresses from public, anon, authenticated, service_role;

-- 저장·지움 기록 — 주소 값은 없다. 주문이 보관 기한으로 지워져도 기록은 남도록 주문에 외래 키를 걸지 않는다.
create table pii.order_return_address_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  event text not null check (event in ('saved', 'deleted')),
  reason text check (reason is null or reason in ('order_finished', 'withdrawn_account')),
  at timestamptz not null default now()
);
alter table pii.order_return_address_events enable row level security;
revoke all on pii.order_return_address_events from public, anon, authenticated, service_role;

-- 누구의 주문인지는 로그인 토큰이 정한다 — 인자에 계정이 없다. 주문 줄을 잠근 뒤 상태를 보고 사본과 기록을 한 처리에서 쓴다.
create function public.save_my_order_return_address(p_order_no text, p_envelope jsonb, p_region text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.orders;
begin
  if p_envelope is null or not pii.is_sealed_envelope(p_envelope) or p_region is null or p_region not in ('none', 'jeju', 'island') then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  select * into v from public.orders o where o.order_no = p_order_no for update;
  if not found or auth.uid() is null or v.fan_id is distinct from auth.uid() then
    return 'not_found';
  end if;
  -- 결제 대기에서만 — 첫 결제가 완료·승인 중이면 닫혔다(결제 뒤에 반송 주소를 바꾸는 길은 반송 주소 확인 창뿐이다)
  if v.status <> 'pending_payment'
     or exists (select 1 from public.payments p where p.order_id = v.id and p.kind = 'initial' and p.status in ('confirming', 'done')) then
    return 'closed';
  end if;
  insert into pii.order_return_addresses (order_id, account_id, envelope, surcharge_region) values (v.id, v.fan_id, p_envelope, p_region)
  on conflict (order_id) do update set envelope = excluded.envelope, surcharge_region = excluded.surcharge_region, created_at = now();
  insert into pii.order_return_address_events (order_id, event) values (v.id, 'saved');
  return 'saved';
end $$;

-- ── 2) 팬 등록 주소 없애기 (INV-P17) ─────────────────

drop function public.set_my_fan_address(jsonb, text, text);
drop function public.delete_my_fan_address();
drop function public.my_fan_address_status();
drop function public.accept_revgift(text);
drop function public.confirm_return_address(text, integer);
drop table pii.fan_addresses;

-- ── 3) 반송 주소 확인 — 주문 사본·새 봉인·크리에이터 등록 주소 (INV-W15 · P18) ─────

create function public.confirm_return_address(p_order_no text, p_box_seq integer, p_envelope jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcel uuid;
  v public.office_parcels;
  v_sender uuid;
  v_role text;
  v_envelope jsonb;
begin
  -- 봉인 꼴은 무엇보다 먼저 — 평문이 들어올 자리가 없다
  if p_envelope is not null and not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  -- 누구의 상자인지는 로그인 토큰이 정한다 — 남의 상자·없는 상자는 같은 답
  v_parcel := public.return_parcel_for_sender(p_order_no, p_box_seq);
  if v_parcel is null then
    return 'not_found';
  end if;
  -- 상자 → 주문(몫) → 사무소 상자 줄 — 자동 처리(처분 대상)·반송 송장 출력과 같은 순서(INV-W12)
  v := public.office_lock_parcel(v_parcel);
  v_sender := public.return_sender_of(v.id);
  if v_sender is null or v_sender is distinct from auth.uid() then
    return 'not_found';
  end if;
  if v.state in ('dispose_due', 'disposed') then
    return 'expired';
  end if;
  if v.state <> 'return_waiting' then
    return 'closed';
  end if;
  if v.return_confirmed_at is null and now() >= v.return_waiting_at + interval '720 hours' then
    return 'expired';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_sender;
  if v.box_id is not null then
    -- 팬 선물 상자: 새로 입력한 봉인 → 결제 때 주문 사본 → (크리에이터가 보낸 주문이면) 크리에이터 등록 주소
    if p_envelope is not null then
      v_envelope := p_envelope;
    else
      select a.envelope into v_envelope
      from pii.order_return_addresses a join public.boxes b on b.order_id = a.order_id
      where b.id = v.box_id and a.account_id = v_sender
      for share of a;
      if v_envelope is null and v_role = 'creator' then
        select a.envelope into v_envelope
        from pii.creator_addresses a join public.creators c on c.id = a.creator_id
        where c.profile_id = v_sender
        for share of a;
      end if;
    end if;
  else
    -- 역조공 몫 상자: 보낸 크리에이터의 등록 주소로만(INV-P13) — 봉인을 직접 넣는 길은 없다
    if p_envelope is not null then
      raise exception '역조공 몫은 등록 주소로만 확인한다' using errcode = '22023';
    end if;
    select a.envelope into v_envelope
    from pii.creator_addresses a join public.creators c on c.id = a.creator_id
    where c.profile_id = v_sender
    for share of a;
  end if;
  if v_envelope is null then
    return 'no_address';
  end if;

  insert into pii.return_addresses (parcel_id, account_id, envelope, confirmed_at) values (v.id, v_sender, v_envelope, now())
  on conflict (parcel_id) do update set account_id = excluded.account_id, envelope = excluded.envelope, confirmed_at = excluded.confirmed_at;
  update public.office_parcels set return_confirmed_at = now() where id = v.id;
  return 'confirmed';
end $$;

-- ── 4) 역조공 받기 — 그때 입력한 봉인 (INV-R4 · R6) ─────

create function public.accept_revgift(p_order_no text, p_envelope jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_send public.revgift_sends;
begin
  if p_envelope is null or not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found or auth.uid() is null or v_share.fan_id is distinct from auth.uid() then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select * into v_send from public.revgift_sends where id = v_share.send_id;
  if v_send.status <> 'done' then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.reply <> 'waiting'
     or v_share.returned_at is not null or v_share.cancelled_at is not null
     or now() >= public.revgift_deadline(v_send.settled_at) then
    raise exception '지금은 받을 수 없다' using errcode = 'P0022';
  end if;

  insert into pii.revgift_addresses (share_id, envelope) values (v_share.id, p_envelope);
  update public.revgift_shares set reply = 'accepted', replied_at = now() where id = v_share.id;
end $$;

-- ── 5) 사본 지우기 — 0024 그대로 + 끝난 주문의 반송 주소 사본 (INV-W11 · M25 ④) ─────

create or replace function public.office_drop_address_copies()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_revgift integer := 0;
  v_return integer := 0;
  v_order integer := 0;
begin
  for v_id in
    select a.share_id from pii.revgift_addresses a join public.revgift_shares s on s.id = a.share_id
    where s.shipped_at is not null and s.shipped_at <= now() - interval '72 hours'
  loop
    delete from pii.revgift_addresses where share_id = v_id;
    if found then
      insert into public.revgift_address_events (share_id, event, outcome) values (v_id, 'deleted', 'shipped');
      v_revgift := v_revgift + 1;
    end if;
  end loop;

  for v_id in
    select a.parcel_id from pii.return_addresses a join public.office_parcels p on p.id = a.parcel_id
    where p.state = 'returned' and p.returned_at is not null and p.returned_at <= now() - interval '72 hours'
  loop
    delete from pii.return_addresses where parcel_id = v_id;
    if found then
      insert into public.return_address_events (parcel_id, event, outcome) values (v_id, 'deleted', 'returned');
      v_return := v_return + 1;
    end if;
  end loop;

  -- 끝난 주문의 반송 주소 사본 — 끝남은 탈퇴·보관 기한이 쓰는 판정 그대로(출고 확정·거절·기한 반려·취소, 모든 상자 반송 확정·처분·인계,
  -- 이어 하기 기한이 지난 결제 대기). 반송 상자로 복사된 것은 위 반송 복사본 규칙이 맡는다.
  for v_id in
    select a.order_id from pii.order_return_addresses a where public.order_is_finished(a.order_id)
  loop
    delete from pii.order_return_addresses where order_id = v_id;
    if found then
      insert into pii.order_return_address_events (order_id, event, reason) values (v_id, 'deleted', 'order_finished');
      v_order := v_order + 1;
    end if;
  end loop;

  return jsonb_build_object('revgift', v_revgift, 'return', v_return, 'order_return', v_order);
end $$;

-- ── 6) 탈퇴 정리 — 0029 그대로에서 팬 등록 주소를 빼고 주문·신청 사본을 더한다 ─────

create or replace function pii.withdraw_account(p_account uuid, p_pseudonym uuid, p_creator uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_hash text;
begin
  if p_account is null or p_pseudonym is null then
    raise exception '계정과 가명 식별자가 있어야 한다' using errcode = '22023';
  end if;
  select c.phone_hash into v_hash from pii.account_contacts c where c.account_id = p_account;

  delete from pii.account_contacts where account_id = p_account;
  delete from pii.email_verifications where account_id = p_account;
  if v_hash is not null then
    delete from pii.phone_verifications where phone_hash = v_hash;
  end if;
  delete from pii.return_addresses where account_id = p_account;
  delete from pii.revgift_addresses a using public.revgift_shares s where s.id = a.share_id and s.fan_id = p_account;
  delete from pii.revgift_box_addresses a using public.revgift_box_applications x where x.id = a.application_id and x.fan_id = p_account;
  with gone as (delete from pii.order_return_addresses where account_id = p_account returning order_id)
  insert into pii.order_return_address_events (order_id, event, reason) select order_id, 'deleted', 'withdrawn_account' from gone;

  alter table pii.fan_address_events disable trigger fan_address_events_no_update;
  alter table pii.creator_address_events disable trigger creator_address_events_no_update;
  delete from pii.fan_address_events where account_id = p_account;
  delete from pii.creator_address_events where actor_id = p_account or (p_creator is not null and creator_id = p_creator);
  alter table pii.fan_address_events enable trigger fan_address_events_no_update;
  alter table pii.creator_address_events enable trigger creator_address_events_no_update;

  if p_creator is not null then
    delete from pii.creator_addresses where creator_id = p_creator;
  end if;
end $fn$;

-- ── 7) 선물함 신청 사본 저장 — 옛 0031 판 정리(새 0031 과 같은 본문) ─────

create or replace function pii.revgift_box_save_copy(p_application_id uuid, p_fan_id uuid, p_envelope jsonb, p_region text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.revgift_box_applications a where a.id = p_application_id and a.fan_id = p_fan_id and a.status = 'applied') then
    raise exception '신청을 찾을 수 없다' using errcode = 'P0002';
  end if;
  -- INV-GB6: 신청 때 입력한 봉인만 받는다 — 팬 등록 주소는 없고(2026-11-08), 봉인 없이 신청하는 길도 없다
  if p_envelope is null or not pii.is_sealed_envelope(p_envelope) or p_region is null or p_region not in ('none', 'jeju', 'island') then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  insert into pii.revgift_box_addresses (application_id, envelope, surcharge_region) values (p_application_id, p_envelope, p_region)
  on conflict (application_id) do update set envelope = excluded.envelope, surcharge_region = excluded.surcharge_region, created_at = now();
  insert into public.revgift_box_address_events (application_id, event) values (p_application_id, 'entered');
end $$;

-- ── 권한 ─────────────────────────────────────────

-- 사본 저장·받기·반송 확인은 로그인한 본인만 — 앱 서버 키로도 남의 주문·몫·상자에 주소를 넣는 길이 없다
revoke all on function public.save_my_order_return_address(text, jsonb, text) from public, anon, service_role;
grant execute on function public.save_my_order_return_address(text, jsonb, text) to authenticated;
revoke all on function public.confirm_return_address(text, integer, jsonb) from public, anon, service_role;
grant execute on function public.confirm_return_address(text, integer, jsonb) to authenticated;
revoke all on function public.accept_revgift(text, jsonb) from public, anon, service_role;
grant execute on function public.accept_revgift(text, jsonb) to authenticated;
-- 예약 작업 실행자(postgres)만(0024 와 같다)
revoke all on function public.office_drop_address_copies() from public, anon, authenticated, service_role;
revoke all on function pii.withdraw_account(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function pii.revgift_box_save_copy(uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- 적용 결과 확인 — 모두 t 여야 한다
select to_regclass('pii.fan_addresses') is null as fan_addresses_gone;
select to_regprocedure('public.set_my_fan_address(jsonb, text, text)') is null and to_regprocedure('public.my_fan_address_status()') is null as fan_address_functions_gone;
select to_regprocedure('public.confirm_return_address(text, integer, jsonb)') is not null and to_regprocedure('public.accept_revgift(text, jsonb)') is not null as new_functions_exist;
select to_regclass('pii.order_return_addresses') is not null as order_copy_table_exists;
select prosrc not like '%fan_addresses%' as box_save_copy_no_registered_branch from pg_proc where oid = 'pii.revgift_box_save_copy(uuid, uuid, jsonb, text)'::regprocedure;

-- 두 경로(옛 0031 → 0032, 새 0031 → 0032)가 같은 상태인지 — 두 DB 에서 각각 돌려 결과 줄이 같으면 같다(읽기만 한다)
-- select p.oid::regprocedure::text as fn, md5(pg_get_functiondef(p.oid)) as def_md5
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname in ('public', 'pii') and (p.proname like '%revgift_box%' or p.proname like '%return_address%' or p.proname like '%fan_address%'
--   or p.proname in ('accept_revgift', 'office_drop_address_copies', 'withdraw_account', 'save_my_order_return_address'))
-- order by 1;
