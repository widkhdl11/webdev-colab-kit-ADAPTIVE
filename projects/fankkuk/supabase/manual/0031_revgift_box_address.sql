-- 선물함 신청의 받을 주소 사본 — 사본 표 · 사본 저장 · 사본 삭제.
-- 스펙: docs/specs/revgift-box.md INV-GB6·GB7·GB20 (S6·S6b·S7·S7c), 순서: workspace/revgift-box-plan.md 2부.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 표·함수를 만든다). 마이그레이션 20261108000004_revgift_box_apply.sql 과 manual 0019·0030 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0031.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-box-apply-db
--   → 「(manual/0031 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 만드나
--   1) pii.revgift_box_addresses — 신청 하나에 사본 하나(봉인 암호문 + 할증 구분 + 넣은 시각). 화면 쪽 키·서버 키 모두 읽지 못한다.
--      암호문은 팬 브라우저가 봉인한 값(INV-P1)이거나 신청 때 복사한 설정의 등록 주소(INV-GB6, reverse-gift INV-R4)다.
--   2) pii.revgift_box_save_copy(신청, 팬, 봉인, 구분) — 신청 함수(public.revgift_box_apply)가 같은 처리 안에서 부른다.
--      봉인이 null 이면 그 팬의 등록 주소 암호문과 구분을 복사하고(등록 주소 줄을 잠근 채), 등록 주소가 없으면 P0026.
--      봉인이 있으면 꼴(22023)과 구분 목록(22023)을 다시 본다. 기록 한 줄(copied·entered, 주소 값 없음).
--   3) pii.revgift_box_drop_copies(신청 목록, 까닭) — 마감(제외된 신청)·선물함 취소(모든 신청)·신청 취소가 같은 처리 안에서 부른다.
--      사본이 있던 신청마다 지우고 기록 한 줄(deleted + 까닭). 팬의 설정 등록 주소는 건드리지 않는다(INV-GB20).
--   두 함수는 아무에게도 실행 권한이 없다 — 공개 구역의 그 함수들(소유자 권한)만 안에서 부른다. 앱 키·서버 키로 남의 신청에 주소를 넣는 길이 없다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   마이그레이션만 있고 이 파일이 없으면: 신청·신청 취소·마감·선물함 취소가 「함수 없음」으로 실패한다(한 처리라 아무것도 바뀌지 않는다).
--               만들기·신청 관리 창·제외/다시 넣기·초대 링크는 그대로 된다.
--   이 파일만 있고 마이그레이션이 없으면: 첫 검사가 멈춘다(적용되지 않는다).
--   그래서 운영에는 마이그레이션 뒤, 선물함 화면을 여는 배포와 같은 때 적용한다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('public.revgift_box_applications') is null or to_regclass('public.revgift_box_address_events') is null then
    raise exception '마이그레이션 20261108000003·20261108000004 를 먼저 적용해야 한다';
  end if;
  if to_regprocedure('pii.is_sealed_envelope(jsonb)') is null or to_regclass('pii.fan_addresses') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'pii' and table_name = 'fan_addresses' and column_name = 'surcharge_region') then
    raise exception 'manual 0005·0019·0030 을 먼저 적용해야 한다';
  end if;
end $$;

-- ── 1) 사본 표 ───────────────────────────────────

create table pii.revgift_box_addresses (
  application_id uuid primary key references public.revgift_box_applications (id) on delete cascade,
  envelope jsonb not null check (pii.is_sealed_envelope(envelope)),
  surcharge_region text not null constraint revgift_box_addresses_surcharge_region check (surcharge_region in ('none', 'jeju', 'island')),
  created_at timestamptz not null default now()
);
alter table pii.revgift_box_addresses enable row level security;
revoke all on pii.revgift_box_addresses from public, anon, authenticated, service_role;

-- ── 2) 사본 저장 ─────────────────────────────────

create function pii.revgift_box_save_copy(p_application_id uuid, p_fan_id uuid, p_envelope jsonb, p_region text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_envelope jsonb := p_envelope;
  v_region text := p_region;
begin
  if not exists (select 1 from public.revgift_box_applications a where a.id = p_application_id and a.fan_id = p_fan_id and a.status = 'applied') then
    raise exception '신청을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_envelope is null then
    -- 등록 주소 줄을 잠근다 — 같은 때 들어온 지우기·바꾸기와 겹쳐도 사본은 그 순간의 한 값이다
    select a.envelope, a.surcharge_region into v_envelope, v_region from pii.fan_addresses a where a.account_id = p_fan_id for share;
    if v_envelope is null then
      raise exception '등록한 받을 주소가 없다' using errcode = 'P0026';
    end if;
  elsif not pii.is_sealed_envelope(v_envelope) or v_region is null or v_region not in ('none', 'jeju', 'island') then
    raise exception '봉인된 주소가 아니다' using errcode = '22023';
  end if;
  insert into pii.revgift_box_addresses (application_id, envelope, surcharge_region) values (p_application_id, v_envelope, v_region)
  on conflict (application_id) do update set envelope = excluded.envelope, surcharge_region = excluded.surcharge_region, created_at = now();
  insert into public.revgift_box_address_events (application_id, event) values (p_application_id, case when p_envelope is null then 'copied' else 'entered' end);
end $$;

-- ── 3) 사본 삭제 ─────────────────────────────────

create function pii.revgift_box_drop_copies(p_application_ids uuid[], p_reason text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_reason is null or p_reason not in ('excluded_at_close', 'box_cancelled', 'withdrawn') then
    raise exception '까닭이 목록에 없다' using errcode = '22023';
  end if;
  with gone as (
    delete from pii.revgift_box_addresses where application_id = any (coalesce(p_application_ids, '{}')) returning application_id
  )
  select coalesce(array_agg(application_id), '{}') into v_ids from gone;
  insert into public.revgift_box_address_events (application_id, event, reason)
  select unnest(v_ids), 'deleted', p_reason;
  return coalesce(array_length(v_ids, 1), 0);
end $$;

revoke all on function pii.revgift_box_save_copy(uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function pii.revgift_box_drop_copies(uuid[], text) from public, anon, authenticated, service_role;

commit;
