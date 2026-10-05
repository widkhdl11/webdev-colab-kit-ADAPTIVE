-- 송장 마무리가 「이 상자의 첫 송장인지」를 함께 돌려준다 (address-protection INV-P5, 코드 리뷰 2026-10-06).
--
-- 지금까지 앱은 재출력 여부를 「몇 번째로 주소를 열었나」로 정했다. 그런데 주소를 연 뒤 송장 마무리 전에 실패한 시도가 있으면
-- 다음 시도는 2번째 열기라 「재출력」으로 표시됐다 — 송장은 아직 한 장도 안 나왔는데. 또 재출력 때도 새 송장번호를 받아 넘겼다가
-- 버렸다(택배사가 붙으면 실제 번호를 낭비한다).
-- 이제 재출력이면 송장번호 없이(null) 불러도 되고, 돌려주는 값은 {waybill, first} 다. first = 이번에 상자를 송장 출력 단계로 넘겼다.

drop function public.invoice_finish_print(text, text);

create function public.invoice_finish_print(p_qr text, p_waybill text)
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
  if v.state = 'label_printed' then
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
