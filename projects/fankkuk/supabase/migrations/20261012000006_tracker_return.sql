-- 추적기는 바로 반송 · 추적기 아님은 직원 판정으로 통과 (office-workflow INV-W4·W6, notifications INV-N13 — 2026-10-12 문제집 D2·D3).
--
-- 1) 검수 기록에 추적기 판정 칸(tracker_verdict: 'tracker' 추적기 · 'not_tracker' 추적기 아님)을 더한다.
--    팬 선물에서 블루투스·RF 반응이 나오면 판정이 꼭 있어야 하고, 반응이 없으면 비어 있다. 역조공에는 없다.
--    결론 값 'hold' 는 이제 「추적기 반송」을 뜻한다 — 값 이름을 바꾸지 않는 것은 환불·취소 함수들(refund_due_of_payment·refund_due_of_box·
--    admin_cancel_received_gift)이 이 값을 「검수에 걸린 상자」로 읽고 있어서다. 돈 처리(B9 검수 불합격 줄)를 건드리지 않는다.
--    옛 기록(판정 칸 없이 'hold')은 그대로 둔다 — 기록은 추가만이고, 표 검사는 판정 칸이 있을 때만 맞는지 본다.
-- 2) office_record_inspection — 20261005000007 과 같고, 팬 선물의 판정 규칙을 바꿨다:
--    반응 있음 ⇔ 판정 있음, 판정 「추적기」 ⇔ 결론 「추적기 반송」(hold). 「추적기 아님」이면 통과·반송.
-- 3) office_scan_inspect — 20261008000007 과 같고, 추적기 반송(hold)이면 보관(held) 대신 바로 반송 대기로 넘긴다.
--    추적기 기록 줄·크리에이터 hold·팬 hold_fan 알림 줄은 지금처럼 같은 처리에서 넣는다(주문 단위 한 번).
-- 4) 이미 보관 중인 상자는 바로 반송 대기로 넘긴다 — 새 규칙(보관 없이 반송)과 같은 끝이고, 알림은 보관 때 이미 갔다.
--    자동 처리(office_run_expiry)의 「보관 + 168시간」 단계는 대상이 없어 아무 일도 하지 않는다. 큰 함수를 다시 쓰는 위험에 비해 얻는 것이 없어 그대로 둔다.

alter table public.office_inspections
  add column tracker_verdict text check (tracker_verdict in ('tracker', 'not_tracker'));
alter table public.office_inspections
  add constraint office_inspections_tracker_verdict_gift check (tracker_verdict is null or bluetooth is not null);
alter table public.office_inspections
  add constraint office_inspections_tracker_verdict_outcome check (tracker_verdict is null or ((tracker_verdict = 'tracker') = (outcome = 'hold')));

create or replace function public.office_record_inspection(p_qr text, p_result jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_keys text[];
  v_outcome text := p_result ->> 'outcome';
  v_verdict text := p_result ->> 'tracker_verdict';
  v_reacted boolean;
  v_found boolean;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'labeled' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if exists (select 1 from public.office_inspections i where i.parcel_id = v.id) then
    raise exception '검수 기록은 한 번만 쓴다' using errcode = '55000';
  end if;
  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception '검수 결과 꼴이 아니다' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_result) k;
  if exists (select 1 from jsonb_each_text(p_result) e
             where e.key not in ('outcome', 'tracker_verdict') and (e.value is null or e.value not in ('clear', 'found')))
     or v_outcome is null or v_outcome not in ('pass', 'return', 'hold')
     or (p_result ? 'tracker_verdict' and (v_verdict is null or v_verdict not in ('tracker', 'not_tracker'))) then
    raise exception '검수 결과 값이 아니다' using errcode = '22023';
  end if;

  if v.box_id is not null then
    -- 팬 선물: 블루투스·RF·금속. 블루투스·RF 반응이 나오면 직원의 추적기 판정이 꼭 있다(INV-W4, 2026-10-12 D2).
    v_reacted := p_result ->> 'bluetooth' = 'found' or p_result ->> 'rf' = 'found';
    if v_keys is distinct from (case when v_reacted then array['bluetooth', 'metal', 'outcome', 'rf', 'tracker_verdict']
                                     else array['bluetooth', 'metal', 'outcome', 'rf'] end) then
      raise exception '팬 선물 검수는 블루투스·RF·금속이고, 반응이 나오면 추적기 판정이 있다' using errcode = '22023';
    end if;
    -- 추적기면 추적기 반송(hold)뿐이고, 추적기 반송은 추적기로 판정했을 때만
    if coalesce(v_verdict = 'tracker', false) <> (v_outcome = 'hold') then
      raise exception '추적기면 추적기 반송, 추적기 반송은 추적기로 판정했을 때만' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, bluetooth, rf, metal, tracker_verdict, outcome)
    values (v.id, auth.uid(), p_result ->> 'bluetooth', p_result ->> 'rf', p_result ->> 'metal', v_verdict, v_outcome);
  else
    -- 역조공: 겉면·금지 물품만. 하나라도 걸리면 반송, 추적기 반송·판정은 없다.
    if v_keys is distinct from array['outcome', 'prohibited', 'surface'] then
      raise exception '역조공 검수는 겉면·금지 물품이다' using errcode = '22023';
    end if;
    v_found := p_result ->> 'surface' = 'found' or p_result ->> 'prohibited' = 'found';
    if v_outcome = 'hold' or (v_found and v_outcome <> 'return') then
      raise exception '걸리면 반송이다' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, surface, prohibited, outcome)
    values (v.id, auth.uid(), p_result ->> 'surface', p_result ->> 'prohibited', v_outcome);
  end if;
end $$;

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
  -- 추적기 반송(hold)은 보관 없이 바로 반송 대기(INV-W4, 2026-10-12 D2)
  v_next := case
    when v_outcome in ('hold', 'return') or public.office_parcel_dead(v) then 'return_waiting'
    else 'inspected'
  end;
  if v_next = 'inspected' and v.box_id is not null
     and exists (select 1 from public.boxes b where b.id = v.box_id and b.measured_tier is null) then
    raise exception '실측 기록이 없다' using errcode = 'P0053';
  end if;
  update public.office_parcels set state = v_next, inspected_at = now() where id = v.id;
  if v_outcome = 'hold' then
    insert into public.office_hold_alerts (parcel_id, creator_id)
    select v.id, o.creator_id from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
    -- 알림 INV-N13: 그 주문의 크리에이터 계정에게 「돌려보내는 선물」 — 주문 단위로 한 번
    perform public.notification_enqueue('hold', o.id, null, 1::smallint, c.profile_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id join public.creators c on c.id = o.creator_id
    where b.id = v.box_id;
    -- INV-N13: 보낸 팬에게 「돌려보낼 상자」 — 주문 단위로 한 번. 무엇이 나왔는지는 본문 틀에 칸이 없다
    perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;

-- 4) 보관 중이던 상자 → 반송 대기. 주문 집계도 다시 맞춘다(검수 결과 「반송」 — 환불은 검수 불합격 줄 그대로).
do $$
declare
  v_order uuid;
begin
  for v_order in
    with moved as (
      update public.office_parcels p set state = 'return_waiting'
      where p.state = 'held'
      returning p.box_id
    )
    select distinct b.order_id from moved m join public.boxes b on b.id = m.box_id
  loop
    perform public.office_sync_order(v_order);
  end loop;
end $$;
