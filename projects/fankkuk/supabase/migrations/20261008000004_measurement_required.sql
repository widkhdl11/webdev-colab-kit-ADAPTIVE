-- 팬 선물은 실측을 기록해야 검수 완료 (office-workflow INV-W4 S4d·S4e, DECISIONS 2026-10-08 — 정책 질문 ⑤).
-- 20261006000009 의 office_scan_inspect 와 같고, 통과(검수 완료)로 넘어가는 팬 선물 상자에 실측 기록이 없으면 거부하는 한 줄을 더했다.
-- 보관·반송으로 가는 상자, 역조공 상자(box_id 없음)는 그대로다.
--
-- 오류 꼴: 42501 운영자 아님 · 55000 지금 단계 아님 · P0044 검수 기록 없음 · P0053 실측 기록 없음

create or replace function public.office_scan_inspect(p_qr text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_outcome text;
  v_next public.office_state;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'labeled' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  select i.outcome into v_outcome from public.office_inspections i
  where i.parcel_id = v.id order by i.at desc, i.id desc limit 1;
  if v_outcome is null then
    raise exception '검수 기록이 없다' using errcode = 'P0044';
  end if;
  v_next := case
    when v_outcome = 'hold' then 'held'
    when v_outcome = 'return' or public.office_parcel_dead(v) then 'return_waiting'
    else 'inspected'
  end;
  if v_next = 'inspected' and v.box_id is not null
     and exists (select 1 from public.boxes b where b.id = v.box_id and b.measured_tier is null) then
    raise exception '실측 기록이 없다' using errcode = 'P0053';
  end if;
  update public.office_parcels set state = v_next, inspected_at = now() where id = v.id;
  if v_next = 'held' then
    insert into public.office_hold_alerts (parcel_id, creator_id)
    select v.id, o.creator_id from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
    -- 알림 INV-N13: 그 주문의 크리에이터 계정에게 주문 단위로 한 번. 팬에게는 보관 알림이 없다.
    perform public.notification_enqueue('hold', o.id, null, 1::smallint, c.profile_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id join public.creators c on c.id = o.creator_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;
