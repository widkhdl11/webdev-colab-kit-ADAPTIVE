-- 선물함 신청의 받을 주소 사본 — 사본 표 · 사본 저장 · 사본 삭제.
-- 스펙: docs/specs/revgift-box.md INV-GB6·GB7·GB20 (S6·S6b·S7·S7c), 순서: workspace/revgift-box-plan.md 2부.
-- 2026-11-08 다시 씀(적용 전) — 팬 주소 등록을 없애(DECISIONS 2026-11-08) 「봉인이 없으면 등록 주소를 복사」하던 갈래를 뺐다. 이제 봉인이 없으면 거부한다.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 표·함수를 만든다). 마이그레이션 20261108000004_revgift_box_apply.sql 과 manual 0005 다음에 적용한다(파일 첫 검사가 본다).
-- 이 파일 다음에 0032(팬 등록 주소 지우기)를 적용한다.
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0031.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-box-apply-db
--   → 「(manual/0031 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 만드나
--   1) pii.revgift_box_addresses — 신청 하나에 사본 하나(봉인 암호문 + 할증 구분 + 넣은 시각). 화면 쪽 키·서버 키 모두 읽지 못한다.
--      암호문은 팬 브라우저가 신청 때 봉인한 값(INV-P1·GB6)뿐이다.
--   2) pii.revgift_box_save_copy(신청, 팬, 봉인, 구분) — 신청 함수(public.revgift_box_apply)가 같은 처리 안에서 부른다.
--      봉인이 없거나 꼴이 아니면, 구분이 목록에 없으면 22023(INV-GB6 — 등록 주소를 복사하는 길은 없다). 기록 한 줄(entered, 주소 값 없음).
--   3) pii.revgift_box_drop_copies(신청 목록, 까닭) — 마감(제외된 신청)·선물함 취소(모든 신청)·신청 취소가 같은 처리 안에서 부른다.
--      사본이 있던 신청마다 지우고 기록 한 줄(deleted + 까닭)(INV-GB20).
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
  if to_regprocedure('pii.is_sealed_envelope(jsonb)') is null then
    raise exception 'manual 0005 를 먼저 적용해야 한다';
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
