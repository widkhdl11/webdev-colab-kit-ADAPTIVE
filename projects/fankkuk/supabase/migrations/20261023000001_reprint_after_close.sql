-- 역조공·반송 송장을 출고·반송 확정 뒤에도 다시 출력 (2026-10-23 카드 d120 ①) — public 쪽.
-- 스펙: docs/specs/reverse-gift.md INV-R7 (c)·R9 (S9·S9c), docs/specs/address-protection.md INV-P5·P18 (S18d), docs/specs/office-workflow.md INV-W11
-- 근거 문서: workspace/spec-additions-2026-10-23-d120.md
--
-- 무엇을 바꾸나
--   1) revgift_finish_print — 출고 확정(shipped) 상자도 재출력 마무리를 받는다: 처음 송장번호를 돌려주고 상자는 출고 확정 그대로(팬 선물 invoice_finish_print 와 같다).
--   2) return_finish_print — 반송 확정(returned) 상자도 같은 방식(처음 반송 송장번호, 상자는 반송 확정 그대로). 확인 시각 대조는 그대로다.
--   3) office_run_scheduled — 5분 예약 작업이 자동 처리 뒤에 72시간 주소 사본 지우기(office_drop_address_copies, manual/0024)도 부른다.
--      함수가 아직 없으면(manual/0024 전) 건너뛴다.
--
-- manual/0024 와 한쪽만 적용된 상태
--   이 파일만: 마무리 함수는 재출력을 받지만, 봉투를 내주는 함수(revgift_claim_print · return_claim_print)가 확정 뒤에는 여전히 거부한다 → 주소가 열리지 않는다.
--             사본은 지금처럼 확정 순간 지워지고, 예약 작업은 없는 함수를 건너뛴다. 지금과 같다.
--   manual/0024 만: 봉투는 내주지만 마무리 함수가 확정 상자를 55000 으로 거부한다 → 앱이 연 줄을 돌려받으려 하나 돌려주기는 검수 완료·반송 대기 때만이라
--             그 한 번이 횟수에 남는다. 송장은 나가지 않는다. 사본은 남고, 예약 작업이 지우는 함수를 부르지 않아 72시간 뒤에도 남는다 —
--             그래서 이 파일을 먼저(또는 같이) 적용한다. manual/0024 의 첫 검사가 이 파일이 먼저인지 본다.

-- ── 1) 역조공 송장 마무리 ───────────────────────────────

create or replace function public.revgift_finish_print(p_qr text, p_waybill text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  v := public.office_lock_qr(p_qr);
  if v.share_id is null then
    raise exception '역조공 상자가 아니다' using errcode = '22023';
  end if;
  perform 1 from public.revgift_shares s where s.id = v.share_id for update;
  -- 재출력 — 송장 출력함, 그리고 출고 확정 뒤(카드 d120 — 주소 사본이 남은 동안은 봉투 함수가 판정한다). 처음 번호 그대로
  if v.state in ('label_printed', 'shipped') then
    return jsonb_build_object('waybill', v.outbound_waybill_no, 'first', false);
  end if;
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  perform public.office_check_waybill(p_waybill);
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;
revoke all on function public.revgift_finish_print(text, text) from public, anon, authenticated, service_role;
grant execute on function public.revgift_finish_print(text, text) to address_decryptor;

-- ── 2) 반송 송장 마무리 ─────────────────────────────────

create or replace function public.return_finish_print(p_qr text, p_waybill text, p_confirmed_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  v := public.office_lock_qr(p_qr);
  if v.box_id is null and v.share_id is null then
    raise exception '주문에 이어진 상자가 아니다' using errcode = '22023';
  end if;
  if v.state not in ('return_waiting', 'return_printed', 'returned') then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.return_confirmed_at is null then
    raise exception '보낸 사람이 반송 주소를 확인하지 않았다' using errcode = 'P0041';
  end if;
  -- 봉투를 내준 뒤 다시 확인했으면(다른 주소일 수 있다) 먼저 연 주소로 넘기지 않는다 — 앱이 연 줄을 돌려받는다
  if p_confirmed_at is null or p_confirmed_at is distinct from v.return_confirmed_at then
    raise exception '봉투를 내준 뒤 반송 주소 확인이 바뀌었다' using errcode = 'P0041';
  end if;
  -- 재출력 — 반송 송장 출력함, 그리고 반송 확정 뒤(카드 d120). 처음 번호 그대로
  if v.state in ('return_printed', 'returned') then
    return jsonb_build_object('waybill', v.return_waybill_no, 'first', false);
  end if;
  perform public.office_check_waybill(p_waybill);
  update public.office_parcels set state = 'return_printed', return_printed_at = now(), return_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;
revoke all on function public.return_finish_print(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.return_finish_print(text, text, timestamptz) to address_decryptor;

-- ── 3) 5분 예약 작업 ────────────────────────────────────

create or replace function public.office_run_scheduled()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_dropped jsonb;
begin
  -- 이 처리 안에서만(트랜잭션 범위) 요청 정보를 앱 서버 키로 둔다 — 자동 처리 함수의 운영자 판정을 그대로 통과시키려고.
  -- 이 함수는 실행 권한을 아무에게도 주지 않아, 예약 작업 실행자(postgres) 말고는 부를 수 없다.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.office_run_expiry(null);
  -- 출고·반송 확정 + 72시간 주소 사본 지우기(INV-W11 · R9 · P18). 함수는 개인정보 구역을 지우므로 사람이 적용하는 manual/0024 가 만든다 — 없으면 건너뛴다
  if to_regprocedure('public.office_drop_address_copies()') is not null then
    execute 'select public.office_drop_address_copies()' into v_dropped;
    v_result := v_result || jsonb_build_object('address_copies', v_dropped);
  end if;
  return v_result;
end $$;
revoke all on function public.office_run_scheduled() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
