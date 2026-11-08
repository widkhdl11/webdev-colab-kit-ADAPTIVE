-- 선물함 4부 — 송장 출력 때 신청 사본(봉인)을 내주는 함수 · 사본 삭제 까닭 「미결제 반송」「출고 + 72시간」.
-- 스펙: docs/specs/revgift-box.md INV-GB19·GB20 (S19·S20·S20b·S20c), 순서: workspace/revgift-box-plan.md 4부.
-- 사람이 직접 적용한다(개인정보 구역 pii 의 사본 표를 읽는 함수를 만들고, pii 함수를 고친다). 표는 만들거나 지우지 않는다 — 지우는 데이터 없음.
-- 마이그레이션 20261109000002_revgift_box_settle.sql 과 manual 0031·0032·0033 다음에 적용한다(파일 첫 검사가 본다).
--
-- 적용(로컬, bash): bash /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/apply-0034.sh
-- 확인: npx vitest run --config vitest.integration.config.mts revgift-box-settle-db
--   → 「(manual/0034 뒤)」 시험들이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 하나
--   1) public.revgift_box_claim_print(신청 번호, 요청자) — 송장 출력 함수(복호화 전용 역할 address_decryptor)만 부른다.
--      선물함 줄 → 신청 줄을 잠근 뒤 INV-GB20 의 (a)(c)·상한을 보고, 열 수 있으면 「연 줄」을 남기고 그 신청의 봉인 사본을 내준다.
--        (a) 그 신청에 사본이 있다 (c) 신청이 결제됨이고 선물함이 발송 중이다 — 또는 출고 확정 뒤 이미 한 번 이상 연 재출력이고 출고 + 72시간 전이다
--        상한: 한 신청에 3회(돌려받은 줄은 빼고 센다)
--      (b) 봉인 속 계정과 그 신청의 팬 대조, (d) 대표 계정 판정은 봉인을 연 송장 출력 함수가 한다(팬 선물·역조공과 같은 자리) — 그래서 신청의 팬 ID 를 같이 내준다.
--      이미 송장을 출력한 신청인지(printed)도 내준다 — 다시 출력에는 새 운송장 번호를 받지 않는다.
--      거부면 거부 줄을 남긴다. 응답에 주소 평문은 없다(봉인 그대로).
--   2) pii.revgift_box_drop_copies — 0033 본문 그대로에 까닭 「unpaid_return」(INV-GB19)·「shipped」(INV-GB20)를 더한다.
--
-- 앱과 DB 가 한쪽만 바뀐 상태
--   마이그레이션만 있고 이 파일이 없으면: 결제·출고 확정은 되지만 송장 출력이 「함수 없음」으로 실패한다(주소가 열리지 않는 쪽).
--               명세서 발행 + 168시간 미결제 반송과 출고 + 72시간 사본 삭제는 실패해 그대로 남는다(예약 작업이 경고를 남기고 다음 회차에 다시 본다).
--               168시간이 지나면 결제 시작은 거부되므로 반송을 기다리는 동안 돈이 나가지는 않는다. 이 파일을 적용하면 다음 회차(5분 안)에 처리된다.
--   이 파일만 있고 마이그레이션이 없으면: 첫 검사가 멈춘다(적용되지 않는다).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('public.revgift_box_decrypt_log') is null or to_regprocedure('public.revgift_box_finish_print(text, text)') is null then
    raise exception '마이그레이션 20261109000002 를 먼저 적용해야 한다';
  end if;
  if to_regprocedure('pii.revgift_box_regions(uuid[])') is null then
    raise exception 'manual 0033 을 먼저 적용해야 한다';
  end if;
end $$;

-- ── 1) 봉인 사본 내주기 (INV-GB20) ─────────────────

create or replace function public.revgift_box_claim_print(p_label text, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications;
  v_box public.revgift_boxes;
  v_copy pii.revgift_box_addresses;
  v_count integer;
  v_reason text;
  v_log_id bigint;
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  v := public.revgift_box_app_of_label(p_label);
  -- 잠금 순서: 선물함 → 신청(INV-GB2). 반송 전환·출고 확정과 같은 순서다
  select * into v_box from public.revgift_boxes b where b.id = v.box_id for update;
  select * into v from public.revgift_box_applications a where a.id = v.id for update;

  select (select count(*) from public.revgift_box_decrypt_log where application_id = v.id and result = 'opened')
       - (select count(*) from public.revgift_box_decrypt_releases where application_id = v.id)
    into v_count;
  select * into v_copy from pii.revgift_box_addresses where application_id = v.id;

  if v_copy.application_id is null then
    v_reason := 'no_valid_approval';                                                                 -- (a) 신청 때 봉인한 사본
  elsif v.shipped_at is not null then
    -- (c) 출고 확정 뒤 — 이미 한 번 이상 연 재출력만, 출고 확정 + 72시간 전. 경계는 잠금을 기다린 뒤의 실제 시각으로 본다
    if v_count < 1 or clock_timestamp() >= v.shipped_at + make_interval(hours => (public.revgift_box_rules() ->> 'copy_after_ship_hours')::integer) then
      v_reason := 'order_not_printable';
    end if;
  elsif v.status <> 'paid' or v_box.status <> 'paid' then
    v_reason := 'order_not_printable';                                                               -- (c) 결제된 선물함의 결제된 신청만
  end if;
  if v_reason is null and v_count >= (public.revgift_box_rules() ->> 'print_max')::integer then
    v_reason := 'decrypt_limit_reached';
  end if;
  if v_reason is not null then
    insert into public.revgift_box_decrypt_log (application_id, requester_id, result, deny_reason) values (v.id, p_requester, 'denied', v_reason);
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.revgift_box_decrypt_log (application_id, requester_id, result, print_no) values (v.id, p_requester, 'opened', v_count + 1)
    returning id into v_log_id;
  return jsonb_build_object('result', 'opened', 'print_no', v_count + 1, 'log_id', v_log_id,
    'label', public.revgift_box_label_text(v.label_no), 'fan_id', v.fan_id, 'printed', v.printed_at is not null, 'envelope', v_copy.envelope);
end $$;

revoke all on function public.revgift_box_claim_print(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.revgift_box_claim_print(text, uuid) to address_decryptor;

-- ── 2) 사본 삭제 — 까닭에 unpaid_return · shipped ─────────────────

create or replace function pii.revgift_box_drop_copies(p_application_ids uuid[], p_reason text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_reason is null or p_reason not in ('excluded_at_close', 'box_cancelled', 'withdrawn', 'missing', 'unpaid_return', 'shipped') then
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

-- 적용 확인(둘 다 t):
-- select to_regprocedure('public.revgift_box_claim_print(text, uuid)') is not null as claim_print,
--        prosrc like '%''unpaid_return''%' and prosrc like '%''shipped''%' as drop_reasons
--   from pg_proc where oid = 'pii.revgift_box_drop_copies(uuid[], text)'::regprocedure;
