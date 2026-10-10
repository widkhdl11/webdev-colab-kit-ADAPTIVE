-- 2026-10-10 정책 문제집 메모 C13 (DECISIONS 2026-10-10 A~C). 스펙: docs/specs/address-protection.md INV-P4 (c)·INV-P5.
-- 출고 확정 뒤에도 택배사 집하 확인 전(택배사 연결 전에는 계속) 남은 횟수 안에서 대표가 재출력할 수 있다.
-- 송장 마무리는 재출력이면 처음 송장번호를 그대로 돌려주고 상자 단계는 건드리지 않는다 — 출고 확정 상자도 같다.
-- 주소를 내주는 함수(invoice_claim_print)의 조건은 pii 를 읽으므로 manual/0015_reprint_after_ship.sql(사람이 적용).

create or replace function public.invoice_finish_print(p_qr text, p_waybill text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  v := public.office_lock_qr(p_qr);
  if v.box_id is null then
    raise exception '팬 선물 상자가 아니다' using errcode = '22023';
  end if;
  perform 1 from public.orders o join public.boxes b on b.order_id = o.id where b.id = v.box_id for update of o;
  -- 재출력: 송장 출력 단계 또는 출고 확정(INV-P5, 2026-10-10) — 처음 번호 그대로, 단계는 그대로
  if v.state in ('label_printed', 'shipped') then
    return jsonb_build_object('waybill', v.outbound_waybill_no, 'first', false);
  end if;
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  -- 첫 출력에만 송장번호가 필요하다
  perform public.office_check_waybill(p_waybill);
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;

revoke all on function public.invoice_finish_print(text, text) from public, anon, authenticated, service_role;
grant execute on function public.invoice_finish_print(text, text) to address_decryptor;

notify pgrst, 'reload schema';
