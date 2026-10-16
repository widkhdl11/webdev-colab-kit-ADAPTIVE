-- 팬 받을 주소(설정에 하나) · 역조공 받기 때 등록 주소 복사.
-- 스펙: docs/specs/address-protection.md INV-P1·P9·P16·P17 (S17·S17b), docs/specs/reverse-gift.md INV-R4·R5·R6·R7 (b)·R9 (S4·S5·S6·S9)
-- 결정: docs/DECISIONS.md 2026-10-17 ④(카드 d100 「추천대로」).
-- 사람이 직접 적용한다(개인정보 구역 표·함수를 바꾼다). manual/0005·0006·0014·0017 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0019.sh
-- 확인: npx vitest run --config vitest.integration.config.mts fan-address-db revgift-address-db revgift-print-db
--
-- 무엇을 바꾸나
--   1) pii.fan_addresses — 팬 계정 하나에 주소 하나(봉인 암호문 + 주소 이름표 + 바꾼 시각). 크리에이터 주소(pii.creator_addresses)와 같은 꼴.
--      pii.fan_address_events — 등록·변경·지우기 기록(누가·언제, 주소 값 없음). 추가만 된다.
--   2) set_my_fan_address(p_envelope, p_label) · delete_my_fan_address() · my_fan_address_status()
--      — 로그인 토큰(auth.uid())의 팬 본인 칸에만. 카카오 재서명은 받지 않는다(INV-P17 — 팬 주소로 가는 것은 그 팬 본인 몫뿐).
--      결과: set → 'saved' | 'not_fan' · 22023 봉인 형식이 아니거나 이름표가 목록 밖 / delete → 'deleted' | 'none' | 'not_fan'
--      상태 읽기는 등록 여부·이름표·바꾼 시각만 — 주소·암호문은 본인에게도 돌려주지 않는다(INV-P16). 팬이 아니면 줄이 없다.
--   3) accept_revgift(p_order_no) — 봉투를 받지 않는다. 받기 처리에서 그 팬의 등록 주소 암호문을 몫에 복사한다(INV-R4).
--      등록 주소가 없으면 P0026(화면이 먼저 등록시킨다). 옛 두 인자 함수(봉투를 받아 바로 넣던 것)는 지운다 —
--      팬 주소가 저장되는 자리는 등록 주소와 받기 때 복사본 둘뿐이다(INV-R6).
--      오류 순서: 22023 없음 → P0002 남의 몫·결제 전 → P0022 지금 받을 수 없음 → P0026 등록 주소 없음.
--   4) revgift_claim_print — 0014 와 같고, 내주는 값에 그 몫의 받는 팬(fan_id)을 더한다. 송장 출력 함수가
--      봉인 속 계정 식별값을 이 값과 대조한다(INV-R7 b). 이 날 전에 주문번호로 묶인 봉인은 주문번호로 계속 대조한다.
--   몫 닫기(close_revgift_share, 0006)는 그대로다 — 몫 복사본(pii.revgift_addresses)만 지우고 등록 주소는 건드리지 않는다(INV-R9).
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   DB 만 새것: 옛 앱의 받기(두 인자)가 함수 없음으로 실패한다 — 받기가 멈출 뿐 주소가 잘못 저장되지 않는다.
--               옛 앱의 송장 출력은 더해진 fan_id 칸을 무시하고 주문번호 봉인만 연다(새 봉인은 옛 앱으로는 만들 수 없다).
--   앱만 새것: 팬 주소 등록·받기가 함수 없음으로 실패한다(저장 안 됨). 송장 출력은 fan_id 가 없어 계정 봉인을 쓰지 않는다(거부 쪽).
--   그래서 운영에는 앱 배포와 같은 때 적용한다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 앞 파일이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다.
do $$
begin
  if to_regprocedure('pii.is_sealed_envelope(jsonb)') is null or to_regclass('pii.revgift_addresses') is null then
    raise exception '봉인 형식 검사·몫 주소 표가 없다 — manual/0005 를 먼저 적용한다';
  end if;
  if to_regprocedure('public.revgift_claim_print(text,uuid)') is null then
    raise exception '봉투를 내주는 함수가 없다 — manual/0014 를 먼저 적용한다';
  end if;
end $$;

-- ── 1) 팬 주소 칸과 기록 ──────────────────────────

-- 팬 계정 하나에 주소 하나(INV-P17) — 바꾸면 덮어쓴다. 값은 팬 브라우저에서 봉인된 봉투(INV-P1):
-- 받는 사람 이름·전화번호·주소와 그 계정의 식별값(profiles.id)을 함께 봉인한 것. 이름표는 고른 값(INV-P16).
create table pii.fan_addresses (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  label text not null constraint fan_addresses_label check (label in ('home', 'studio', 'office', 'other')),
  updated_at timestamptz not null default now()
);
alter table pii.fan_addresses enable row level security;
revoke all on pii.fan_addresses from public, anon, authenticated, service_role;

-- 등록·변경·지우기 기록: 누가(본인 계정)·언제. 주소·이름표 칸은 없다. 추가만 된다.
-- 기록은 계정에 연쇄 삭제를 걸지 않는다 — 크리에이터 주소 기록(manual/0007)과 같다.
create table pii.fan_address_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles (id),
  event text not null check (event in ('registered', 'changed', 'deleted')),
  at timestamptz not null default now()
);
alter table pii.fan_address_events enable row level security;
revoke all on pii.fan_address_events from public, anon, authenticated, service_role;

create function pii.fan_address_events_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '주소 등록 기록은 추가만 된다' using errcode = '42501';
end $$;
create trigger fan_address_events_no_update before update or delete on pii.fan_address_events
for each row execute function pii.fan_address_events_append_only();
create trigger fan_address_events_no_truncate before truncate on pii.fan_address_events
for each statement execute function pii.fan_address_events_append_only();

-- ── 2) 등록·변경·지우기·상태 읽기(로그인한 팬 본인, INV-P17) ──

-- 누구의 칸인지는 로그인 토큰이 정한다 — 인자에 계정이 없다. 팬 역할이어야 쓴다(크리에이터 주소는 INV-P13 이 맡는다).
-- 계정 줄을 잠근 뒤 주소 칸 덮어쓰기와 기록 한 줄을 한 처리에서 한다 — 같은 팬의 등록 두 번이 겹쳐도 칸은 하나,
-- 기록은 등록마다 한 줄이고 registered/changed 가 뒤섞이지 않는다.
create function public.set_my_fan_address(p_envelope jsonb, p_label text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_existing boolean;
begin
  if not pii.is_sealed_envelope(p_envelope) then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  -- INV-P16: 이름표는 정해진 목록에서만 — 자유 입력이면 주소가 평문으로 들어올 수 있다
  if p_label is null or p_label not in ('home', 'studio', 'office', 'other') then
    raise exception '이름표가 목록에 없다' using errcode = '22023';
  end if;

  select p.id into v_account from public.profiles p where p.id = auth.uid() and p.role = 'fan' for no key update;
  if auth.uid() is null or v_account is null then
    return 'not_fan';
  end if;

  select exists (select 1 from pii.fan_addresses where account_id = v_account) into v_existing;
  insert into pii.fan_addresses (account_id, envelope, label, updated_at) values (v_account, p_envelope, p_label, now())
  on conflict (account_id) do update set envelope = excluded.envelope, label = excluded.label, updated_at = excluded.updated_at;
  insert into pii.fan_address_events (account_id, event) values (v_account, case when v_existing then 'changed' else 'registered' end);
  return 'saved';
end $$;

-- 지우면 설정의 칸만 빈다. 이미 받기를 한 몫에 복사해 둔 암호문은 그 몫이 끝날 때까지 남는다(INV-P17·R4).
create function public.delete_my_fan_address()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_deleted integer;
begin
  select p.id into v_account from public.profiles p where p.id = auth.uid() and p.role = 'fan' for no key update;
  if auth.uid() is null or v_account is null then
    return 'not_fan';
  end if;
  delete from pii.fan_addresses where account_id = v_account;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return 'none';
  end if;
  insert into pii.fan_address_events (account_id, event) values (v_account, 'deleted');
  return 'deleted';
end $$;

-- 로그인한 팬 본인의 줄 하나만. 등록 여부·이름표·바꾼 시각만 — 주소 값(암호문 포함)은 내보내지 않는다(INV-P9·P16).
-- 팬이 아니거나 로그인하지 않았으면 줄이 없다 — 크리에이터·운영자에게는 등록 여부조차 보이지 않는다(INV-P17).
create function public.my_fan_address_status()
returns table (registered boolean, label text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.account_id is not null, a.label, a.updated_at
  from public.profiles p
  left join pii.fan_addresses a on a.account_id = p.id
  where auth.uid() is not null and p.id = auth.uid() and p.role = 'fan';
$$;

-- ── 3) 역조공 받기 — 등록 주소 복사(INV-R4·R6·R10) ──

drop function public.accept_revgift(text, jsonb);

-- 로그인한 팬 본인의 몫에만. 몫 줄을 잠근 뒤 확인하고, 그 팬의 등록 주소 암호문을 그 자리에서 복사한다 —
-- 같은 몫의 받기 두 번, 받기와 기한 처리가 겹쳐도 하나만 반영된다. 받은 뒤 설정 주소를 바꾸거나 지워도 몫의 복사본은 그대로다.
create function public.accept_revgift(p_order_no text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_send public.revgift_sends;
  v_envelope jsonb;
begin
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

  -- 등록 주소 줄도 잠근다 — 같은 때 들어온 지우기·바꾸기와 겹쳐도 복사본은 그 순간의 한 값이다
  select a.envelope into v_envelope from pii.fan_addresses a where a.account_id = v_share.fan_id for share;
  if v_envelope is null then
    raise exception '등록한 받을 주소가 없다' using errcode = 'P0026';
  end if;

  insert into pii.revgift_addresses (share_id, envelope) values (v_share.id, v_envelope);
  update public.revgift_shares set reply = 'accepted', replied_at = now() where id = v_share.id;
end $$;

-- ── 4) 송장 봉투 — 받는 팬을 같이 내준다(INV-R7 b) ──
-- 0014 와 같다. 다른 것은 돌려주는 값의 fan_id 하나뿐이다.
create or replace function public.revgift_claim_print(p_qr text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_share public.revgift_shares;
  v_paid boolean;
  v_count integer;
  v_reason text;
  v_address pii.revgift_addresses;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.share_id is null then
    raise exception '역조공 상자가 아니다' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where id = v.share_id for update;
  select d.status = 'done' into v_paid from public.revgift_sends d where d.id = v_share.send_id;

  select (select count(*) from public.revgift_decrypt_log where share_id = v_share.id and result = 'opened')
       - (select count(*) from public.revgift_decrypt_releases where share_id = v_share.id)
    into v_count;

  select * into v_address from pii.revgift_addresses where share_id = v_share.id;

  if v_share.reply <> 'accepted' or v_address.share_id is null then
    v_reason := 'no_valid_approval';                                                                 -- (a) 받기 때 복사한 암호문
  elsif not v_paid or v.state not in ('inspected', 'label_printed') or v_share.inspected_at is null
     or v_share.shipped_at is not null or v_share.returned_at is not null or v_share.cancelled_at is not null
     or not public.office_parcel_shippable(v) then
    v_reason := 'order_not_printable';                                                               -- (c)
  elsif v_count >= 3 then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason) values (v_share.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.revgift_decrypt_log (share_id, requester_id, result, print_no) values (v_share.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id, 'order_no', v_share.order_no,
    'fan_id', v_share.fan_id, 'envelope', v_address.envelope);
end $$;

-- ── 권한 ─────────────────────────────────────────

revoke all on function pii.fan_address_events_append_only() from public, anon, authenticated, service_role;
revoke all on function public.set_my_fan_address(jsonb, text) from public, anon, service_role;
grant execute on function public.set_my_fan_address(jsonb, text) to authenticated;
revoke all on function public.delete_my_fan_address() from public, anon, service_role;
grant execute on function public.delete_my_fan_address() to authenticated;
revoke all on function public.my_fan_address_status() from public, anon, service_role;
grant execute on function public.my_fan_address_status() to authenticated;
-- 받기는 로그인한 팬 본인만 — 앱 서버 키로도 남의 몫에 주소를 넣는 길이 없다
revoke all on function public.accept_revgift(text) from public, anon, service_role;
grant execute on function public.accept_revgift(text) to authenticated;
revoke all on function public.revgift_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.revgift_claim_print(text, uuid) to address_decryptor;

notify pgrst, 'reload schema';

commit;
