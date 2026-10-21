-- 6자리 없이 온 보류 상자의 원 송장 전화번호 뒤 4자리 — 개인정보 구역(pii) 칸·저장·운영자 목록 읽기·검색·지우기.
-- 스펙: docs/specs/inbound-address-code.md INV-C5 · INV-C12 ③ (S5f·S12c), office-workflow INV-W5·W7 (S5d), admin-console INV-K8 (DECISIONS 2026-10-21 「B로 하자」)
-- 사람이 직접 적용한다(전화번호의 일부를 pii 구역에 저장한다 — 개인정보 수동 SQL 은 에이전트가 로컬에도 적용하지 않는다).
-- 앞 파일: manual/0001(pii 구역) · 마이그레이션 20261021000003_storage. 그 다음에 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0023.sh
-- 확인: npx vitest run --config vitest.integration.config.mts phone-last4-db   (적용 전에는 6개 모두 실패 — 입고가 0A000 으로 거부, 적용 뒤 통과)
--       npm run check:pii   (적용 뒤 admin_unmatched_parcels · admin_unmatched_by_phone_last4 가 pii 에 닿는다 — 검사의 「manual 적용 뒤」 목록이 이 표를 보고 허용한다)
--
-- 왜
--   6자리도 닉네임도 없이 온 상자의 주인이 송장번호를 모르면 1:1 문의로 찾는다. 회원은 보낸 이름은 몰라도 자기 전화번호는 안다.
--   운영자가 그 번호의 뒤 4자리로 보류 상자를 좁히고, 선반의 원 송장을 직접 보고 이름·주소까지 맞춰 본 뒤 잇는다(INV-C12 ③).
--   실명·주소·전체 번호는 지금처럼 시스템에 넣지 않는다 — 털려도 뒤 4자리로는 사람을 알 수 없다(최소 수집). 그래도 전화번호의 일부라 public 이 아니라 pii 구역에 둔다.
--
-- 무엇을 바꾸나
--   ① 표 pii.unmatched_phone_last4(보류 줄 하나에 4자리 하나, 숫자 넷만). 데이터 API 로 열리지 않는다(pii 는 노출 구역이 아니고 권한도 걷는다).
--   ② office_unmatched_set_phone_last4 — 마이그레이션의 자리표(값을 받으면 거부)를 실제 저장으로 바꾼다. 입고 함수가 6자리 없이 온 상자에만 부른다
--      (꼴 검사·호출은 마이그레이션 20261021000003 의 입고 함수에 이미 있다).
--   ③ office_unmatched_phone_last4 — 마이그레이션의 자리표(늘 비어 있음)를 표 읽기로 바꾼다. 운영자 보류 목록(admin_unmatched_parcels)이 이것을 부른다.
--   ④ 지우기 트리거 — 보류 줄이 주문 상자로 이어지거나(matched) 반송 대상이 되는(expired — 운영자 넘기기·자동 처리 도착 + 720시간) 처리 안에서 그 줄의 4자리를 지운다.
--      주인 없는 보류 상자에는 처분 단계가 없다 — 반송 대상이 곧 마지막 처리다.
--   ⑤ admin_unmatched_by_phone_last4(4자리) — 운영자만. 대기 중인 보류 상자 가운데 그 4자리인 줄, 칸은 운영자 보류 목록과 같다.
--   회원 물품 보관소 목록(storage_parcels)·알림 본문·크리에이터 화면은 이 표를 읽지 않는다(바꾸지 않는다).
--
-- 마이그레이션 20261021000003 과 한쪽만 적용된 상태
--   마이그레이션만(이 파일 전): 입고 때 뒤 4자리를 넣으면 입고 전체가 거부된다(0A000 — 값을 버리고 통과하지 않는다). 빈 칸이면 입고는 그대로 된다.
--     운영자 목록의 4자리 칸은 늘 비어 있고, 검색 함수가 없어 검색은 실패한다(앱은 「아직 쓸 수 없어요」). 4자리는 어디에도 저장되지 않는다.
--   이 파일만(마이그레이션 전): 아래 첫 검사가 자리표 함수가 없음을 보고 멈춘다 — 아무것도 바뀌지 않는다.
--   나중 마이그레이션이 office_unmatched_phone_last4 · office_unmatched_set_phone_last4 를 다시 정의하면 이 파일의 저장·읽기가 자리표로 돌아간다 —
--   그 두 함수는 이 파일만 바꾼다(마이그레이션에서 다시 만들지 않는다). 그때는 입고가 다시 0A000 으로 막혀 조용히 버려지지 않는다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다. 여러 번 적용해도 결과가 같다.

begin;

-- 앞 파일이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다.
do $$
begin
  if to_regnamespace('pii') is null then
    raise exception 'pii 구역이 없다 — manual/0001 을 먼저 적용한다';
  end if;
  if to_regprocedure('public.office_unmatched_set_phone_last4(uuid,text)') is null
     or to_regprocedure('public.office_unmatched_phone_last4(uuid)') is null
     or to_regprocedure('public.office_scan_inbound(text,text,text,text,text,text,public.parcel_tier,text)') is null then
    raise exception '전화번호 뒤 4자리 자리표·입고 함수가 없다 — 마이그레이션 20261021000003_storage 를 먼저 적용한다';
  end if;
end $$;

-- ① 표 — 보류 줄 하나에 숫자 넷 하나
create table if not exists pii.unmatched_phone_last4 (
  unmatched_id uuid primary key references public.office_unmatched (id) on delete cascade,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);
alter table pii.unmatched_phone_last4 enable row level security;
revoke all on pii.unmatched_phone_last4 from public, anon, authenticated, service_role;
comment on table pii.unmatched_phone_last4 is '6자리 없이 온 보류 상자의 원 송장 전화번호 뒤 4자리(inbound-address-code INV-C5). 운영자 검색에만 쓰고, 이어지거나 반송 대상이 되면 지운다.';

-- ② 저장
create or replace function public.office_unmatched_set_phone_last4(p_id uuid, p_last4 text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_last4 is null then
    return;
  end if;
  if p_last4 !~ '^[0-9]{4}$' then
    raise exception '전화번호는 뒤 4자리 숫자만 받는다' using errcode = '22023';
  end if;
  -- 아직 대기 중인 보류 줄에만(이어졌거나 반송 대상이면 적지 않는다)
  insert into pii.unmatched_phone_last4 (unmatched_id, last4)
  select u.id, p_last4 from public.office_unmatched u
  where u.id = p_id and u.matched_parcel_id is null and u.expired_at is null
  on conflict (unmatched_id) do update set last4 = excluded.last4;
end $$;
revoke all on function public.office_unmatched_set_phone_last4(uuid, text) from public, anon, authenticated, service_role;

-- ③ 읽기
create or replace function public.office_unmatched_phone_last4(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select x.last4 from pii.unmatched_phone_last4 x where x.unmatched_id = p_id;
$$;
revoke all on function public.office_unmatched_phone_last4(uuid) from public, anon, authenticated, service_role;

-- ④ 이어지거나 반송 대상이 되는 처리 안에서 지운다
create or replace function pii.unmatched_phone_last4_drop()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from pii.unmatched_phone_last4 where unmatched_id = new.id;
  return null;
end $$;
revoke all on function pii.unmatched_phone_last4_drop() from public, anon, authenticated, service_role;
drop trigger if exists office_unmatched_phone_last4_drop on public.office_unmatched;
create trigger office_unmatched_phone_last4_drop after update of matched_parcel_id, expired_at on public.office_unmatched
  for each row when (new.matched_parcel_id is not null or new.expired_at is not null)
  execute function pii.unmatched_phone_last4_drop();

-- ⑤ 운영자 뒤 4자리 검색 — 칸은 운영자 보류 목록과 같다
create or replace function public.admin_unmatched_by_phone_last4(p_last4 text)
returns table (id uuid, source text, qr text, waybill_no text, carrier text, arrived_at timestamptz, nickname text, shelf text, reason text,
               suspected_theft boolean, state text, deadline_at timestamptz, share_movable boolean,
               look text, tier text, phone_last4 text, auto_return_at timestamptz, in_storage boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 검색한다' using errcode = '42501';
  end if;
  if p_last4 is null or p_last4 !~ '^[0-9]{4}$' then
    raise exception '전화번호 뒤 4자리 숫자로 검색한다' using errcode = '22023';
  end if;
  return query
  select h.* from public.admin_unmatched_parcels() h
  where h.source = 'unmatched' and h.state = 'waiting' and h.phone_last4 = p_last4;
end $$;
revoke all on function public.admin_unmatched_by_phone_last4(text) from public, anon, service_role;
grant execute on function public.admin_unmatched_by_phone_last4(text) to authenticated;

notify pgrst, 'reload schema';

commit;
