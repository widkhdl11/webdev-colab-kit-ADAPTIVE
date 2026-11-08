-- 2026-11-08 송장 출력 방식 「수동 입력」 (address-protection INV-P21 ③, S21d). DECISIONS 2026-11-07 「송장 출력 어댑터 세 가지」.
-- 수동 입력은 대표가 주소를 열어 택배 접수 화면에 옮긴 뒤, 택배사가 준 운송장 번호를 상자에 넣는다. 그래서:
--  ① 송장 출력 단계(label_printed)는 운송장 번호가 비어 있을 수 있다 — 출고 확정(shipped)에는 여전히 번호가 있어야 한다.
--  ② 송장 마무리(invoice_finish_print·revgift_finish_print)는 첫 출력에 번호 없이(null) 넘길 수 있다. 번호를 주면 지금처럼 꼴을 본다.
--  ③ 운송장 번호 저장 함수 office_set_outbound_waybill — 대표만, 상자마다 하나(송장 출력 단계이고 번호가 빈 상자에만).
--     대표가 아니면 거부 줄(「대표 아님」)을 운영자 내부 기록(팬 선물 decrypt_log · 역조공 revgift_decrypt_log)에 남기고 'denied' 를 돌려준다
--     (예외로 끝내면 거부 줄도 같이 사라진다).
--  ④ 출고 확정은 번호가 없는 상자를 따로 거부한다(55000) · 다음 단계는 번호가 없으면 enter_waybill.
-- pii 는 건드리지 않는다 — 주소를 내주는 함수(invoice_claim_print·revgift_claim_print)의 조건은 그대로다(상자 단계로 첫/재출력을 가른다).

-- ① 출력 단계는 번호 없이도 — 출고 확정에는 번호가 있어야 한다
alter table public.office_parcels drop constraint if exists office_parcels_check2;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.office_parcels'::regclass and conname = 'office_parcels_shipped_has_waybill') then
    alter table public.office_parcels add constraint office_parcels_shipped_has_waybill check (state <> 'shipped' or outbound_waybill_no is not null);
  end if;
end $$;

-- ② 송장 마무리 — 첫 출력에 번호가 없으면(수동 입력) 번호 없이 출력 단계로
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
  -- 재출력: 송장 출력 단계 또는 출고 확정(INV-P5) — 처음 번호 그대로(수동 입력에서 아직 안 넣었으면 null), 단계는 그대로
  if v.state in ('label_printed', 'shipped') then
    return jsonb_build_object('waybill', v.outbound_waybill_no, 'first', false);
  end if;
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  -- 번호를 주면 꼴을 본다. 없으면 수동 입력 — 대표가 나중에 넣는다(INV-P21 ③)
  if p_waybill is not null then
    perform public.office_check_waybill(p_waybill);
  end if;
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;

revoke all on function public.invoice_finish_print(text, text) from public, anon, authenticated, service_role;
grant execute on function public.invoice_finish_print(text, text) to address_decryptor;

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
  -- 재출력 — 송장 출력함, 그리고 출고 확정 뒤(카드 d120). 처음 번호 그대로(수동 입력에서 아직 안 넣었으면 null)
  if v.state in ('label_printed', 'shipped') then
    return jsonb_build_object('waybill', v.outbound_waybill_no, 'first', false);
  end if;
  if v.state <> 'inspected' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if p_waybill is not null then
    perform public.office_check_waybill(p_waybill);
  end if;
  if not public.office_parcel_shippable(v) then
    raise exception '출고 조건을 지키지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'label_printed', printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;

revoke all on function public.revgift_finish_print(text, text) from public, anon, authenticated, service_role;
grant execute on function public.revgift_finish_print(text, text) to address_decryptor;

-- ③ 운송장 번호 저장 — 대표만, 상자마다 하나
create or replace function public.office_set_outbound_waybill(p_qr text, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  -- 대표가 아니면 거부 줄을 남기고 끝낸다(INV-P7·P8 과 같은 운영자 내부 기록) — 예외로 끝내면 그 줄도 사라진다
  if not public.is_owner() then
    if v.box_id is not null then
      insert into public.decrypt_log (order_id, box_id, requester_id, result, deny_reason)
      select b.order_id, b.id, auth.uid(), 'denied', 'not_owner' from public.boxes b where b.id = v.box_id;
    elsif v.share_id is not null then
      insert into public.revgift_decrypt_log (share_id, requester_id, result, deny_reason)
      values (v.share_id, auth.uid(), 'denied', 'not_owner');
    end if;
    return 'denied';
  end if;
  perform public.office_check_waybill(p_waybill);
  -- 주소를 연 상자(송장 출력 단계)에만, 번호가 빈 때 한 번
  if v.state <> 'label_printed' or v.outbound_waybill_no is not null then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  update public.office_parcels set outbound_waybill_no = p_waybill where id = v.id;
  perform public.office_sync(v.id);
  return 'saved';
end $$;

revoke all on function public.office_set_outbound_waybill(text, text) from public, anon, service_role;
grant execute on function public.office_set_outbound_waybill(text, text) to authenticated;

-- ④ 출고 확정 — 번호가 없는 상자는 따로 거부
create or replace function public.office_confirm_shipment(p_qr text, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'label_printed' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  -- 수동 입력에서 운송장 번호를 아직 넣지 않은 상자(INV-P21)
  if v.outbound_waybill_no is null then
    raise exception '운송장 번호를 먼저 넣는다' using errcode = '55000';
  end if;
  if v.outbound_waybill_no is distinct from p_waybill then
    raise exception '이 상자의 송장이 아니다' using errcode = 'P0043';
  end if;
  if v.hold_reason is not null then
    raise exception '보류된 상자는 출고하지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'shipped', shipped_at = now() where id = v.id;
  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());
  perform public.office_sync(v.id);
end $$;

-- ⑤ 다음 단계 — 20261021000001 의 정의에서 송장 출력 단계 한 줄만 바뀐다
create or replace function public.office_next_step(p_parcel public.office_parcels, p_kind text)
returns text
language sql stable set search_path = ''
as $$
  select case
    when p_parcel.hold_reason is not null and p_parcel.state in ('inspected', 'label_printed') then 'on_hold'
    else case coalesce(p_parcel.state::text, 'no_waybill')
    when 'no_waybill' then 'wait_waybill'
    when 'awaiting' then 'scan_inbound'
    when 'received' then 'confirm_label'
    when 'labeled' then 'inspect'
    when 'inspected' then case when public.office_parcel_shippable(p_parcel) then 'print_label'
                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.payments d on d.order_id = b.order_id
                                 where b.id = p_parcel.box_id and d.kind = 'difference' and d.status in ('pending', 'failed')
                                   and d.expired_at is null and public.difference_due_at(d.box_id) <= now()
                               ) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.orders o on o.id = b.order_id
                                 where b.id = p_parcel.box_id and o.approved_at is not null
                                   and exists (select 1 from public.payments d
                                               where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
                               ) then 'wait_difference'
                               when p_kind = 'gift' then 'wait_approval' else 'wait_accept' end
    when 'held' then 'held'
    when 'tracker_held' then 'tracker_held'
    when 'report_held' then 'report_held'
    -- 주문에 이어진 상자는 보낸 사람이 반송 주소를 확인해야 출력한다(INV-W15)
    when 'return_waiting' then case when (p_parcel.box_id is not null or p_parcel.share_id is not null) and p_parcel.return_confirmed_at is null
                                    then 'wait_return_address' else 'print_return' end
    when 'return_printed' then 'confirm_return'
    -- 수동 입력에서 운송장 번호를 넣기 전이면 번호 입력(INV-P21)
    when 'label_printed' then case when p_parcel.outbound_waybill_no is null then 'enter_waybill' else 'confirm_shipment' end
    when 'dispose_due' then 'record_disposal'
    else 'done'
    end
  end;
$$;

notify pgrst, 'reload schema';
