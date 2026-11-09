-- 배송 조회 서비스 연결 — 역조공 몫(크리에이터 → 팬)의 팬 주소 사본을 지우는 때를 단계 설정값에 묶는다.
-- 스펙: docs/specs/delivery-status.md INV-DS11 ③ (S11), 결정: DECISIONS 2026-11-09 「배송 현황 표시·조회 연동」 ⑧.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 주소 사본을 지우는 함수를 고친다). 표는 만들거나 지우지 않는다 — 지우는 데이터 없음.
-- 마이그레이션 20261109000010_delivery_tracking.sql 과 manual 0032 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0035.sh
-- 확인: npx vitest run --config vitest.integration.config.mts delivery-tracking-db
--   → 「(manual/0035 뒤)」 시험이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 하나
--   office_drop_address_copies() — manual/0032 본문 그대로에서 역조공 몫 사본의 시각 조건 한 줄만 바꾼다.
--     전: 출고 확정 + 72시간.  후: public.delivery_copy_drop_due(상자, null, 출고 시각, 72) —
--     설정값이 estimate 면 출고 + 72시간(전과 같다), webhook 이면 배달 완료 + 24시간, 배달 완료가 오지 않으면 출고 + 14일.
--   반송 주소 사본·끝난 주문의 반송 주소 사본 규칙은 그대로다. 재출력 창(출고 + 72시간, revgift_claim_print)도 그대로 — 더 좁은 쪽이다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   마이그레이션만 있고 이 파일이 없으면: 설정값이 estimate 인 동안은 차이가 없다. webhook 으로 바꾼 뒤에는 역조공 몫 사본만 출고 + 72시간에 지워진다
--               (배달 전에 지워질 수 있다 — 그래서 webhook 으로 바꾸기 전에 이 파일을 먼저 적용한다, docs/deploy-runbook.md).
--               선물함 신청 사본·탈퇴 기준·헤더·delivered 는 마이그레이션만으로 설정값을 따른다.
--   이 파일만 있고 마이그레이션이 없으면: 첫 검사가 멈춘다(적용되지 않는다).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regprocedure('public.delivery_copy_drop_due(uuid, uuid, timestamptz, integer)') is null then
    raise exception '마이그레이션 20261109000010 을 먼저 적용해야 한다';
  end if;
  if to_regprocedure('public.office_drop_address_copies()') is null
     or not exists (select 1 from pg_proc where oid = 'public.office_drop_address_copies()'::regprocedure and prosrc like '%order_return_addresses%') then
    raise exception 'manual 0032 를 먼저 적용해야 한다';
  end if;
end $$;

-- ── 사본 지우기 — 0032 그대로에서 역조공 몫의 시각 조건만 (INV-DS11 ③) ─────

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
    where s.shipped_at is not null
      and public.delivery_copy_drop_due(
            (select op.id from public.office_parcels op where op.share_id = s.id and op.state = 'shipped' order by op.shipped_at desc limit 1),
            null, s.shipped_at, 72)
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

revoke all on function public.office_drop_address_copies() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- 적용 확인(t):
-- select prosrc like '%delivery_copy_drop_due%' as drop_follows_setting from pg_proc where oid = 'public.office_drop_address_copies()'::regprocedure;
