-- 배송 조회 원본은 저장하지 않는다 — DECISIONS 2026-11-09 「배송 조회 원본은 저장하지 않는다 — 단계·시각만, 거래 기록과 함께 5년」,
-- docs/specs/delivery-status.md INV-DS10 · my-account INV-A16.
-- 하는 일:
--  ① 원본 표(delivery_tracking_raw)·원본 정리 예약 작업·정리 함수·보관 일수 설정 칸(delivery_settings.raw_keep_days)을 없앤다.
--     원본 표에 이미 들어간 줄(대리점·수령인 포함)도 표와 함께 지워진다.
--  ② 수신 처리(delivery_ingest)를 20261109000010 본문에서 원본 저장 부분만 뺀 것으로 바꾼다 — 넘겨받은 항목에 다른 칸(raw 등)이 섞여 와도
--     단계·상태 코드·이력의 시각·상태 코드만 읽는다. 출처(p_origin)는 꼴 검사만 하고 저장하지 않는다(부르는 쪽 꼴을 그대로 둔다).
--  ③ 단계·시각 기록(delivery_trackings·delivery_tracking_events)은 송장의 사무실 상자·선물함 신청이 지워질 때 함께 지워진다(외래 키 cascade —
--     20261109000010 그대로). 그래서 주문 기록과 같은 자동 삭제(retention_purge, my-account INV-A16)를 따른다.
--     기간을 세는 「마지막 기록 시각」에 배송 단계 수신 시각을 넣는다 — 배달 완료는 출고보다 늦게 오므로, 넣지 않으면 그 기록이 5년을 못 채우고 지워진다.
--     order_ended_at(20261023000008)·revgift_send_ended_at(20261023000011) 본문 그대로에 한 줄씩 더했다.
-- 일반 마이그레이션이다 — pii 구역을 건드리지 않는다. 여러 번 돌아도 결과가 같다(if exists·create or replace).

-- revgift_send_ended_at 이 사람이 넣는 manual 0006 의 표를 읽는다 — 빈 DB 를 처음부터 만들 때 멈추지 않게 함수 본문 검사를 이 파일 안에서만 끈다(20261023000011 과 같다)
set local check_function_bodies = off;

-- ── ① 원본 없애기 ──────────────────────────────────

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fankkuk-delivery-raw-purge') then
    perform cron.unschedule('fankkuk-delivery-raw-purge');
  end if;
end $$;
drop function if exists public.delivery_raw_purge();
drop table if exists public.delivery_tracking_raw;
alter table public.delivery_settings drop column if exists raw_keep_days;

-- ── ② 수신 처리 ──────────────────────────────────

-- 받은 항목 처리. p_items 는 앱이 서명을 확인하고 정리한 꼴: [{courier_code, tracking_number, status, progresses:[{at, status}]}]
-- 서버(service_role)만 부른다. 돌려주는 것은 수만. 택배사가 준 원본(대리점·수령인 등)은 어디에도 저장하지 않는다(INV-DS10).
create or replace function public.delivery_ingest(p_items jsonb, p_origin text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  it jsonb;
  pg jsonb;
  t public.delivery_trackings;
  v_progresses jsonb;
  v_state text;
  v_status text;
  v_source text := public.delivery_status_source();
  n_saved integer := 0;
  n_ignored integer := 0;
begin
  if p_origin is null or p_origin not in ('webhook', 'trace') then
    raise exception '출처가 목록에 없다' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception '항목 꼴이 아니다' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    t := null;
    select * into t from public.delivery_trackings d
    where d.courier_code = it ->> 'courier_code' and d.waybill_no = it ->> 'tracking_number' for update;
    -- 팬꾹이 등록하지 않은 송장은 아무것도 남기지 않는다(INV-DS9)
    if t.id is null then
      n_ignored := n_ignored + 1;
      continue;
    end if;
    v_status := case when (it ->> 'status') ~ '^[A-Z_]{1,30}$' then it ->> 'status' end;
    v_progresses := case when jsonb_typeof(it -> 'progresses') = 'array' then it -> 'progresses' else '[]'::jsonb end;

    -- 이력은 (시각, 상태 코드)만 — 위치·설명·사람 칸은 읽지 않는다(INV-DS10)
    for pg in select * from jsonb_array_elements(v_progresses) loop
      if (pg ->> 'status') ~ '^[A-Z_]{1,30}$' and (pg ->> 'at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then
        insert into public.delivery_tracking_events (tracking_id, at, status) values (t.id, (pg ->> 'at')::timestamptz, pg ->> 'status')
        on conflict do nothing;
      end if;
    end loop;

    -- 단계는 앞으로만(INV-DS8): 지금 단계 · 받은 상태 · 이력의 상태 중 가장 앞선 것
    select z.s into v_state from (
      select t.carrier_state as s
      union all select public.delivery_state_of(v_status)
      union all select public.delivery_state_of(e ->> 'status') from jsonb_array_elements(v_progresses) e
    ) z where z.s is not null order by public.delivery_state_rank(z.s) desc limit 1;

    update public.delivery_trackings d
       set carrier_state = v_state,
           last_status = coalesce(v_status, d.last_status),
           last_event_at = now(),
           delivered_at = case when v_state = 'delivered' then coalesce(d.delivered_at, now()) else d.delivered_at end
     where d.id = t.id;

    if v_source = 'webhook' then
      perform public.delivery_project(t.id);
    end if;
    n_saved := n_saved + 1;
  end loop;
  return jsonb_build_object('saved', n_saved, 'ignored', n_ignored);
end $$;
revoke all on function public.delivery_ingest(jsonb, text) from public, anon, authenticated;
grant execute on function public.delivery_ingest(jsonb, text) to service_role;

-- ── ③ 자동 삭제의 「마지막 기록 시각」에 배송 단계 수신을 넣는다 ──────────────────────────────────

-- 20261023000008 본문 그대로 + 마지막 줄(배송 단계 수신·배달 완료 시각)
create or replace function public.order_ended_at(p_order uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  with pay as (select p.id from public.payments p where p.order_id = p_order
               union select p.id from public.payments p join public.boxes b on b.id = p.box_id where b.order_id = p_order),
       parcel as (select op.* from public.office_parcels op join public.boxes b on b.id = op.box_id where b.order_id = p_order)
  select greatest(
    o.created_at, o.registered_at, o.approved_at, o.received_at, o.inspected_at, o.shipped_at, o.delivered_at, o.fan_send_ack_at, o.fan_not_sent_at,
    (select max(greatest(p.created_at, p.settled_at, p.expired_at, p.confirming_at, p.review_at)) from public.payments p where p.id in (select id from pay)),
    (select max(greatest(r.created_at, r.claimed_at, r.settled_at)) from public.refunds r
      where r.payment_id in (select id from pay) or r.box_id in (select b.id from public.boxes b where b.order_id = p_order)),
    (select max(greatest(rc.requested_at, rc.finished_at)) from public.review_cancels rc where rc.payment_id in (select id from pay)),
    (select max(c.canceled_at) from public.order_cancellations c where c.order_id = p_order),
    (select max(greatest(op.received_at, op.labeled_at, op.inspected_at, op.printed_at, op.shipped_at, op.return_printed_at, op.returned_at,
                         op.created_at, op.hold_at, op.hold_closed_at, op.return_waiting_at, op.return_confirmed_at)) from parcel op),
    (select max(i.at) from public.office_inspections i where i.parcel_id in (select id from parcel)),
    (select max(greatest(cc.asked_at, cc.answered_at)) from public.office_creator_checks cc where cc.parcel_id in (select id from parcel)),
    (select max(ce.at) from public.office_creator_check_events ce where ce.parcel_id in (select id from parcel)),
    (select max(hl.linked_at) from public.office_held_links hl where hl.parcel_id in (select id from parcel)),
    (select max(d.at) from public.office_disposals d where d.parcel_id in (select id from parcel)),
    (select max(ph.at) from public.office_police_handovers ph where ph.parcel_id in (select id from parcel)),
    (select max(greatest(um.arrived_at, um.matched_at, um.expired_at)) from public.office_unmatched um where um.matched_parcel_id in (select id from parcel)),
    (select max(es.at) from public.office_envelope_shreds es where es.parcel_id in (select id from parcel)),
    (select max(nm.at) from public.office_not_mine_reports nm where nm.parcel_id in (select id from parcel)),
    (select max(ra.at) from public.return_address_events ra where ra.parcel_id in (select id from parcel)),
    (select max(sm.moved_at) from public.office_share_moves sm where sm.parcel_id in (select id from parcel)),
    (select max(greatest(dt.last_event_at, dt.delivered_at)) from public.delivery_trackings dt where dt.parcel_id in (select id from parcel))
  )
  from public.orders o where o.id = p_order;
$$;
revoke all on function public.order_ended_at(uuid) from public, anon, authenticated, service_role;

-- 20261023000011 본문 그대로 + 마지막 줄(배송 단계 수신·배달 완료 시각)
create or replace function public.revgift_send_ended_at(p_send uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  with sh as (select s.* from public.revgift_shares s where s.send_id = p_send),
       parcel as (select op.* from public.office_parcels op where op.share_id in (select id from sh))
  select greatest(
    d.created_at, d.settled_at, d.confirming_at, d.review_at,
    -- 닫힌(실패) 결제는 닫은 시각 칸이 없다 — 닫기는 만든 지 24시간이 지나야 일어나므로 그 시각을 아래 한도로 둔다(코드 리뷰 low)
    case when d.status = 'failed' then d.created_at + interval '24 hours' end,
    (select max(greatest(s.replied_at, s.received_at, s.inspected_at, s.shipped_at, s.returned_at, s.cancelled_at, s.delivered_at, s.disposed_at)) from sh s),
    (select max(greatest(r.created_at, r.claimed_at, r.settled_at)) from public.refunds r where r.share_id in (select id from sh)),
    (select max(rr.created_at) from public.revgift_refunds rr where rr.share_id in (select id from sh)),
    (select max(greatest(rc.requested_at, rc.finished_at)) from public.review_cancels rc where rc.send_id = p_send),
    (select max(l.at) from public.revgift_decrypt_log l where l.share_id in (select id from sh)),
    (select max(l.at) from public.revgift_decrypt_releases l where l.share_id in (select id from sh)),
    (select max(e.at) from public.revgift_address_events e where e.share_id in (select id from sh)),
    (select max(greatest(ic.issued_at, ic.used_at, ic.voided_at, ic.kept_at)) from public.inbound_codes ic where ic.share_id in (select id from sh)),
    (select max(greatest(op.received_at, op.labeled_at, op.inspected_at, op.printed_at, op.shipped_at, op.return_printed_at, op.returned_at,
                         op.created_at, op.hold_at, op.hold_closed_at, op.return_waiting_at, op.return_confirmed_at)) from parcel op),
    (select max(i.at) from public.office_inspections i where i.parcel_id in (select id from parcel)),
    (select max(greatest(cc.asked_at, cc.answered_at)) from public.office_creator_checks cc where cc.parcel_id in (select id from parcel)),
    (select max(ce.at) from public.office_creator_check_events ce where ce.parcel_id in (select id from parcel)),
    (select max(hl.linked_at) from public.office_held_links hl where hl.parcel_id in (select id from parcel)),
    (select max(x.at) from public.office_disposals x where x.parcel_id in (select id from parcel)),
    (select max(ph.at) from public.office_police_handovers ph where ph.parcel_id in (select id from parcel)),
    (select max(greatest(um.arrived_at, um.matched_at, um.expired_at)) from public.office_unmatched um where um.matched_parcel_id in (select id from parcel)),
    (select max(es.at) from public.office_envelope_shreds es where es.parcel_id in (select id from parcel)),
    (select max(nm.at) from public.office_not_mine_reports nm where nm.parcel_id in (select id from parcel)),
    (select max(ra.at) from public.return_address_events ra where ra.parcel_id in (select id from parcel)),
    (select max(sm.moved_at) from public.office_share_moves sm
      where sm.parcel_id in (select id from parcel) or sm.from_share_id in (select id from sh) or sm.to_share_id in (select id from sh)),
    (select max(greatest(dt.last_event_at, dt.delivered_at)) from public.delivery_trackings dt where dt.parcel_id in (select id from parcel))
  )
  from public.revgift_sends d where d.id = p_send;
$$;
revoke all on function public.revgift_send_ended_at(uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
