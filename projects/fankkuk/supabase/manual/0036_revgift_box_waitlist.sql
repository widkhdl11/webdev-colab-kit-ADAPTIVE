-- 선물함 2026-11-09 개정 — 사본 삭제 까닭 「마감 때 고르지 않은 대기 신청」(waitlist_at_close).
-- 스펙: docs/specs/revgift-box.md INV-GB7·GB20 (S7d). 마감 처리에서 크리에이터가 고르지 않은 대기 신청의 주소 사본을 그 처리 안에서 지운다.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 함수를 고친다). 표는 만들거나 지우지 않는다 — 지우는 데이터 없음.
-- 마이그레이션 20261109000040_revgift_box_waitlist.sql 과 manual 0034 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0036.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-box-waitlist-db
--   → 「(manual/0036 뒤)」 시험 셋이 적용 전에는 「까닭이 목록에 없다」(22023)로 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 하나
--   pii.revgift_box_drop_copies — 0034 본문 그대로에 까닭 「waitlist_at_close」를 더한다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   마이그레이션만 있고 이 파일이 없으면: 대기 신청을 받고(신청은 사본 저장 뒤 같은 처리에서 대기로 바꾼다) 보여 주는 것은 된다.
--               고르지 않은 대기 신청이 남는 마감만 「까닭이 목록에 없다」로 통째로 실패한다(선물함은 신청 받는 중 그대로 — 주소가 남는 쪽이 아니라
--               마감이 안 되는 쪽). 대기를 모두 고르거나 대기가 없는 마감, 0명 마감, 선물함 취소(까닭 box_cancelled)는 된다.
--   이 파일만 있고 마이그레이션이 없으면: 첫 검사가 멈춘다(적용되지 않는다) — 공개 구역의 기록 표가 그 까닭을 아직 받지 않기 때문이다.
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regprocedure('public.revgift_box_waitlist_no(uuid)') is null
     or not exists (select 1 from pg_constraint where conname = 'revgift_box_address_events_reason_check'
                    and pg_get_constraintdef(oid) like '%waitlist_at_close%') then
    raise exception '마이그레이션 20261109000040 을 먼저 적용해야 한다';
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('pii.revgift_box_drop_copies(uuid[], text)') and prosrc like '%''shipped''%') then
    raise exception 'manual 0034 를 먼저 적용해야 한다';
  end if;
end $$;

create or replace function pii.revgift_box_drop_copies(p_application_ids uuid[], p_reason text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_reason is null or p_reason not in ('excluded_at_close', 'box_cancelled', 'withdrawn', 'missing', 'unpaid_return', 'shipped', 'waitlist_at_close') then
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

revoke all on function pii.revgift_box_drop_copies(uuid[], text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- 적용 확인(t):
-- select prosrc like '%''waitlist_at_close''%' as drop_waitlist
--   from pg_proc where oid = 'pii.revgift_box_drop_copies(uuid[], text)'::regprocedure;
