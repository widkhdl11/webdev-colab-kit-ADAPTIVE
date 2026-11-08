-- 선물함 3부 — 명세서 생성이 신청 사본의 할증 구분을 읽는 함수 · 도착 안 함(missing) 사본 삭제 까닭.
-- 스펙: docs/specs/revgift-box.md INV-GB11·GB17·GB20 (S11b·S17·S17b), 순서: workspace/revgift-box-plan.md 3부.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 함수를 만들고 고친다). 표는 만들거나 지우지 않는다 — 지우는 데이터 없음.
-- 마이그레이션 20261109000001_revgift_box_intake.sql 과 manual 0031·0032 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0033.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-box-intake-db
--   → 「(manual/0033 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 하나
--   1) pii.revgift_box_regions(신청 목록) — 그 신청들의 사본 할증 구분(none·jeju·island)만 돌려준다. 주소 암호문은 돌려주지 않는다.
--      아무에게도 실행 권한이 없다 — 공개 구역의 명세서 생성 함수(public.revgift_box_try_invoice, 소유자 권한)만 안에서 부른다(INV-GB17).
--      크리에이터·서버 키가 아무 팬의 지역을 알아내는 길이 없다(S17b).
--   2) pii.revgift_box_drop_copies — 0031 본문 그대로에 까닭 「missing」(도착 안 함, INV-GB11)을 더한다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   마이그레이션만 있고 이 파일이 없으면: 입고·실측·확인 필요는 되고, 명세서는 만들어지지 않고 기다린다(선물함은 「도착 · 실측 중」에 머문다).
--               첫 입고 + 168시간의 도착 안 함 처리는 실패해 그 신청이 그대로 남는다(예약 작업이 경고를 남기고 다음 회차에 다시 본다).
--               이 파일을 적용하면 다음 회차(5분 안)에 기다리던 명세서가 만들어진다.
--   이 파일만 있고 마이그레이션이 없으면: 첫 검사가 멈춘다(적용되지 않는다).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('public.revgift_box_holds') is null then
    raise exception '마이그레이션 20261109000001 을 먼저 적용해야 한다';
  end if;
  if to_regclass('pii.revgift_box_addresses') is null or to_regprocedure('pii.revgift_box_drop_copies(uuid[], text)') is null then
    raise exception 'manual 0031 을 먼저 적용해야 한다';
  end if;
end $$;

-- ── 1) 할증 구분 읽기 (INV-GB17) ─────────────────

create or replace function pii.revgift_box_regions(p_application_ids uuid[])
returns table (application_id uuid, surcharge_region text)
language sql stable security definer set search_path = ''
as $$
  select a.application_id, a.surcharge_region
  from pii.revgift_box_addresses a
  where a.application_id = any (coalesce(p_application_ids, '{}'));
$$;

-- ── 2) 사본 삭제 — 까닭에 missing ─────────────────

create or replace function pii.revgift_box_drop_copies(p_application_ids uuid[], p_reason text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_reason is null or p_reason not in ('excluded_at_close', 'box_cancelled', 'withdrawn', 'missing') then
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

revoke all on function pii.revgift_box_regions(uuid[]) from public, anon, authenticated, service_role;
revoke all on function pii.revgift_box_drop_copies(uuid[], text) from public, anon, authenticated, service_role;

commit;

-- 적용 확인(둘 다 t):
-- select to_regprocedure('pii.revgift_box_regions(uuid[])') is not null as regions,
--        prosrc like '%''missing''%' as drop_missing from pg_proc where oid = 'pii.revgift_box_drop_copies(uuid[], text)'::regprocedure;
