-- 반송 주소 확인 — 등록 주소를 상자에 복사 · 반송 송장의 주소 열기 · 반송 확정·처분 때 복사본 지우기.
-- 스펙: docs/specs/office-workflow.md INV-W15 (S15·S15b·S15c·S15e), docs/specs/address-protection.md INV-P17·P18 (S17c·S18·S18b·S18c),
--       docs/specs/action-center.md INV-J1·J4 (S1d)
-- 결정: docs/DECISIONS.md 2026-10-17 ②(카드 d100 「고쳐서」·d101 「승인」).
-- 사람이 직접 적용한다(개인정보 구역 표·함수를 바꾼다). manual/0007·0017(크리에이터 주소)·0019(팬 주소)와 마이그레이션 20261017000004 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0020.sh
-- 확인: npx vitest run --config vitest.integration.config.mts tests/integration/return-address-confirm-db.integration.test.ts
--
-- 무엇을 바꾸나
--   1) pii.return_addresses — 상자 하나에 복사본 하나(봉인 암호문 + 복사한 계정 + 확인 시각). 보낸 사람이 반송 주소를 확인한 순간 그 사람의 등록 주소
--      암호문(팬은 pii.fan_addresses, 크리에이터는 pii.creator_addresses)을 그대로 옮겨 둔다 — 그 뒤 설정 주소를 바꾸거나 지워도 이 상자는 그대로다.
--   2) confirm_return_address(p_order_no, p_box_seq) — 로그인한 보낸 사람 본인만(팬 선물은 주문번호 + 상자 순번, 역조공 몫은 주문번호).
--      상자 → 주문(몫) → 사무소 상자 줄 순으로 잠근 뒤 상태·기한을 다시 본다(INV-W12 — 자동 처리의 처분 대상 단계와 같은 잠금이라 겹쳐도 하나만).
--      결과: confirmed · not_found(남의·없는 상자, 로그인 없음 — 같은 답) · no_address(등록 주소 없음, 화면이 먼저 등록시킨다)
--            · expired(처분 대상·처분, 또는 확인 전인데 반송 대기 + 720시간 지남) · closed(반송 송장을 이미 출력함·반송 대기가 아님)
--      반송 송장을 출력하기 전까지 다시 확인(바꾼 등록 주소로 덮어쓰기)할 수 있다. 확인 표시 칸(office_parcels.return_confirmed_at)도 같은 처리에서 적는다.
--   3) return_claim_print(QR, 요청자) — 송장 출력 함수(복호화 전용 역할)만 부른다. 상자를 잠근 자리에서 다시 보고, 열 수 있으면 「연 줄」을 남기며
--      복사본과 그 상자 주문을 보낸 계정(sender_id, 크리에이터면 sender_creator_id)을 내준다 — 송장 출력 함수가 봉인 속 계정과 대조한다(INV-P18 b).
--      거부: no_valid_approval(어느 주문에도 이어지지 않은 상자 · 확인 전 · 복사본 없음) · order_not_printable(반송 대기·반송 송장 출력함이 아님)
--            · decrypt_limit_reached(상자마다 3회). 거부도 기록 줄을 남긴다.
--   4) 복사본 지우기 — 상자가 반송 확정(returned)·처분(disposed)으로 바뀌는 처리 안에서 트리거가 복사본을 지우고, 지운 사실을 public.return_address_events 에
--      한 줄 남긴다(값은 없다). 설정의 등록 주소는 지우지 않는다(INV-P18).
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   DB 만 새것: 옛 앱에는 확인 경로·반송 송장 출력 함수가 없다 — 주문에 이어진 상자의 반송 송장은 나가지 않는다(마이그레이션 20261017000004 가 봉투 번호 길을 막았다).
--   앱만 새것: 확인 경로가 함수 없음으로 실패하고(복사되지 않음), 반송 송장 출력 함수는 봉투 함수가 없어 「실패」로 끝난다(주소는 열리지 않는다).
--   그래서 운영에는 앱 배포와 같은 때 적용한다. 어느 쪽이든 주소가 잘못 열리거나 다른 상자로 가지 않는다 — 출력이 멈출 뿐이다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 앞 파일이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다.
do $$
begin
  if to_regprocedure('pii.is_sealed_envelope(jsonb)') is null or to_regclass('pii.fan_addresses') is null or to_regclass('pii.creator_addresses') is null then
    raise exception '봉인 형식 검사·팬 주소·크리에이터 주소 표가 없다 — manual/0005·0007·0019 를 먼저 적용한다';
  end if;
  if to_regprocedure('public.return_parcel_for_sender(text,integer)') is null or to_regclass('public.return_decrypt_log') is null
     or to_regclass('public.return_address_events') is null then
    raise exception '반송 주소 public 쪽이 없다 — 마이그레이션 20261017000004_return_address.sql 을 먼저 적용한다';
  end if;
end $$;

-- ── 1) 상자 복사본 ─────────────────────────────────

create table pii.return_addresses (
  parcel_id uuid primary key references public.office_parcels (id) on delete cascade,
  -- 복사한 등록 주소의 주인(그 상자 주문을 보낸 계정) — 봉인 속에도 같은 계정이 묶여 있다
  account_id uuid not null references public.profiles (id),
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  confirmed_at timestamptz not null default now()
);
alter table pii.return_addresses enable row level security;
revoke all on pii.return_addresses from public, anon, authenticated, service_role;

-- ── 2) 반송 주소 확인 (INV-W15 · P18) ─────────────────

create function public.confirm_return_address(p_order_no text, p_box_seq integer)
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
  -- 누구의 상자인지는 로그인 토큰이 정한다 — 남의 상자·없는 상자는 같은 답
  v_parcel := public.return_parcel_for_sender(p_order_no, p_box_seq);
  if v_parcel is null then
    return 'not_found';
  end if;
  -- 상자 → 주문(몫) → 사무소 상자 줄 — 자동 처리(처분 대상)·반송 송장 출력과 같은 순서(INV-W12). 연결이 바뀌는 중이면 40001(다시 하면 된다)
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
  -- 30일(720시간)이 지나면 처분 대상 전이라도 확인을 받지 않는다 — 이미 확인한 상자는 기한이 없고 출력 전까지 다시 확인할 수 있다
  if v.return_confirmed_at is null and now() >= v.return_waiting_at + interval '720 hours' then
    return 'expired';
  end if;

  -- 보낸 사람의 등록 주소 — 크리에이터 계정이면 크리에이터 주소(INV-P13), 팬이면 팬 주소(INV-P17). 줄을 잠가 그 순간의 한 값을 옮긴다
  select p.role into v_role from public.profiles p where p.id = v_sender;
  if v_role = 'creator' then
    select a.envelope into v_envelope
    from pii.creator_addresses a join public.creators c on c.id = a.creator_id
    where c.profile_id = v_sender
    for share of a;
  else
    select a.envelope into v_envelope from pii.fan_addresses a where a.account_id = v_sender for share;
  end if;
  if v_envelope is null then
    return 'no_address';
  end if;

  insert into pii.return_addresses (parcel_id, account_id, envelope, confirmed_at) values (v.id, v_sender, v_envelope, now())
  on conflict (parcel_id) do update set account_id = excluded.account_id, envelope = excluded.envelope, confirmed_at = excluded.confirmed_at;
  update public.office_parcels set return_confirmed_at = now() where id = v.id;
  return 'confirmed';
end $$;

-- ── 3) 반송 송장의 봉투 내주기 (INV-P18) ─────────────────

-- 송장 출력 함수(복호화 전용 역할)만 부른다. 판정(대표·확인·단계·횟수)은 송장 출력 함수가 먼저 했다 —
-- 여기서는 상자를 잠근 자리에서 다시 보고, 열 수 있으면 「연 줄」을 남기며 복사본을 내준다. 횟수 확인과 증가가 이 잠금 안에서 한 번에 일어난다.
create function public.return_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_count integer;
  v_reason text;
  v_address pii.return_addresses;
  v_sender uuid;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  select (select count(*) from public.return_decrypt_log where parcel_id = v.id and result = 'opened')
       - (select count(*) from public.return_decrypt_releases where parcel_id = v.id)
    into v_count;
  select * into v_address from pii.return_addresses where parcel_id = v.id;
  v_sender := public.return_sender_of(v.id);

  if v.box_id is null and v.share_id is null then
    v_reason := 'no_valid_approval';                                                  -- 어느 주문에도 이어지지 않은 상자 — 확인할 사람이 없다
  elsif v.state not in ('return_waiting', 'return_printed') then
    v_reason := 'order_not_printable';                                                -- (a) 반송 대기(재출력 포함)
  elsif v.return_confirmed_at is null or v_address.parcel_id is null or v_address.account_id is distinct from v_sender then
    v_reason := 'no_valid_approval';                                                  -- (a) 보낸 사람이 확인하며 복사한 암호문
  elsif v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.return_decrypt_log (parcel_id, requester_id, result, deny_reason) values (v.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.return_decrypt_log (parcel_id, requester_id, result, print_no) values (v.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object(
    'result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id,
    'order_no', coalesce((select o.order_no from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id),
                         (select s.order_no from public.revgift_shares s where s.id = v.share_id)),
    'sender_id', v_sender,
    'sender_creator_id', (select c.id from public.creators c join public.profiles p on p.id = c.profile_id where c.profile_id = v_sender and p.role = 'creator'),
    'envelope', v_address.envelope);
end $$;

-- ── 4) 반송 확정·처분 때 복사본 지우기 (INV-P18) ─────────

-- 상자가 반송 확정·처분으로 바뀌는 그 처리 안에서 지운다. 지운 사실은 public 기록 표에 한 줄(상자·결과·시각, 값 없음)
create function pii.return_address_drop_copy()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from pii.return_addresses where parcel_id = new.id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.return_address_events (parcel_id, event, outcome) values (new.id, 'deleted', new.state::text);
  end if;
  return null;
end $$;
create trigger office_parcels_return_copy_drop after update of state on public.office_parcels
  for each row when (new.state in ('returned', 'disposed') and old.state is distinct from new.state)
  execute function pii.return_address_drop_copy();

-- ── 권한 ─────────────────────────────────────────

revoke all on function pii.return_address_drop_copy() from public, anon, authenticated, service_role;
-- 확인은 로그인한 보낸 사람 본인만 — 앱 서버 키로도 남의 상자에 주소를 넣는 길이 없다
revoke all on function public.confirm_return_address(text, integer) from public, anon, service_role;
grant execute on function public.confirm_return_address(text, integer) to authenticated;
revoke all on function public.return_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.return_claim_print(text, uuid) to address_decryptor;

notify pgrst, 'reload schema';

commit;
