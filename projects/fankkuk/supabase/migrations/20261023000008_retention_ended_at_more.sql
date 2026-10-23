-- 자동 삭제 재리뷰 반영 (2026-10-23) — public 쪽. 스펙: docs/specs/my-account.md INV-A16, approval-signature.md INV-S14.
--
-- 무엇을 바꾸나
--   1) order_ended_at — 사무실 기록 중 빠져 있던 시각을 더한다: 보류 상자(도착·이어짐·기한 지남), 원래 송장 파쇄, 「내 것 아님」 신고,
--      반송 주소 기록, 몫 옮기기. 이것이 마지막 기록이면 5년을 일찍 세기 시작해 법정 최소 기간을 못 채울 수 있었다.
--   2) retention_purge — 마지막 기록은 주문을 만든 때보다 이를 수 없으므로, 만든 지 5년이 안 된 주문은 비싼 계산(끝난 주문·마지막 기록 시각) 전에 거른다.
--      결과는 같다. 나머지 본문은 20261023000007 그대로다.

-- ── 1) 주문의 마지막 기록 시각 ───────────────────────────

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
    (select max(sm.moved_at) from public.office_share_moves sm where sm.parcel_id in (select id from parcel))
  )
  from public.orders o where o.id = p_order;
$$;
revoke all on function public.order_ended_at(uuid) from public, anon, authenticated, service_role;

-- ── 2) 자동 삭제 ───────────────────────────────────────

create or replace function public.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_shared_fan constant uuid := 'ffffffff-0000-4000-8000-000000000001';
  c_shared_creator constant uuid := 'ffffffff-0000-4000-8000-000000000002';
  v_signatures integer;
  v_inquiries integer;
  v_orders integer;
  v_unlinked integer;
  v_tab regclass;
  v_counts jsonb;
  v_locked regclass[] := array[
    'public.approval_signatures', 'public.decrypt_log', 'public.decrypt_releases', 'public.office_inspections', 'public.office_envelope_shreds',
    'public.office_not_mine_reports', 'public.office_held_links', 'public.office_creator_check_events', 'public.office_share_moves',
    'public.office_police_handovers', 'public.office_disposals', 'public.return_decrypt_log', 'public.return_decrypt_releases',
    'public.return_address_events', 'public.office_unmatched_look_edits'
  ]::regclass[];
begin
  -- 한 처리 안에서 두 번 불려도 되게(예약 작업은 회차마다 따로 처리다)
  drop table if exists retention_old_orders, retention_unlink, retention_gone, retention_del_orders, retention_del_boxes,
    retention_del_parcels, retention_del_unmatched, retention_del_payments;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  -- 가명 처리된 서명 기록(INV-S14) — 그 주문이 끝난 때(마지막 기록)부터 5년. 주문이 회원 쪽 내역으로 남아도 서명은 지운다(카드 d125).
  delete from public.approval_signatures s
   using public.approval_requests r
    join public.orders o on o.id = r.order_id
   where r.request_id = s.request_id
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and s.signed_content is null and s.signer_id is null and s.content_hash is not null
     and public.order_is_finished(r.order_id)
     and public.order_ended_at(r.order_id) < now() - interval '5 years';
  get diagnostics v_signatures = row_count;

  -- 탈퇴한 사람이 쓴 1:1 문의(INV-A16 — 3년)
  delete from public.inquiries i
   using public.profiles p
   where p.id = i.author_id and p.withdrawn_at is not null
     and i.created_at < now() - interval '3 years';
  get diagnostics v_inquiries = row_count;

  -- 끝났고 마지막 기록이 5년 넘은 주문 중 한쪽이라도 탈퇴한 것
  create temp table retention_old_orders on commit drop as
  select o.id, (fp.withdrawn_at is not null) as fan_gone, (c.withdrawn_at is not null) as creator_gone, o.fan_id, o.creator_id
    from public.orders o
    join public.profiles fp on fp.id = o.fan_id
    join public.creators c on c.id = o.creator_id
   where (fp.withdrawn_at is not null or c.withdrawn_at is not null)
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.order_is_finished(o.id)
     and public.order_ended_at(o.id) < now() - interval '5 years';

  -- ① 한쪽만 탈퇴 — 주문은 남기고, 주문과 그 상자 기록에 든 가명(탈퇴한 사람)을 같이 쓰는 표시로 바꾼다
  create temp table retention_unlink on commit drop as
  select * from retention_old_orders where not (fan_gone and creator_gone);
  create temp table retention_gone on commit drop as
  select p.id from public.profiles p where p.withdrawn_at is not null and p.id <> c_shared_fan;

  update public.orders o
     set fan_id = case when u.fan_gone then c_shared_fan else o.fan_id end,
         creator_id = case when u.creator_gone then c_shared_creator else o.creator_id end
    from retention_unlink u
   where o.id = u.id and ((u.fan_gone and o.fan_id <> c_shared_fan) or (u.creator_gone and o.creator_id <> c_shared_creator));
  get diagnostics v_unlinked = row_count;

  update public.order_cancellations oc set canceled_by = c_shared_fan
    from retention_unlink u where oc.order_id = u.id and oc.canceled_by in (select id from retention_gone);
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_unlink u, public.payments p
   where p.order_id = u.id and rc.payment_id = p.id and rc.requested_by in (select id from retention_gone);
  update public.office_creator_checks cc set answered_by = c_shared_fan
    from retention_unlink u, public.boxes b, public.office_parcels op
   where b.order_id = u.id and op.box_id = b.id and cc.parcel_id = op.id and cc.answered_by in (select id from retention_gone);
  update public.office_creator_check_events ce set actor = c_shared_fan
    from retention_unlink u, public.boxes b, public.office_parcels op
   where b.order_id = u.id and op.box_id = b.id and ce.parcel_id = op.id and ce.actor in (select id from retention_gone);
  update public.office_held_links hl set account_id = c_shared_fan
    from retention_unlink u, public.boxes b, public.office_parcels op
   where b.order_id = u.id and op.box_id = b.id and hl.parcel_id = op.id and hl.account_id in (select id from retention_gone);
  update public.office_unmatched um set nickname_profile_id = c_shared_fan
    from retention_unlink u, public.boxes b, public.office_parcels op
   where b.order_id = u.id and op.box_id = b.id and um.matched_parcel_id = op.id and um.nickname_profile_id in (select id from retention_gone);
  update public.office_hold_alerts ha set creator_id = c_shared_creator
    from retention_unlink u, public.boxes b, public.office_parcels op
   where u.creator_gone and b.order_id = u.id and op.box_id = b.id and ha.parcel_id = op.id and ha.creator_id = u.creator_id;

  -- ② 둘 다 탈퇴 — 주문과 거기 달린 기록을 아래에서부터 지운다
  create temp table retention_del_orders on commit drop as select id from retention_old_orders where fan_gone and creator_gone;
  create temp table retention_del_boxes on commit drop as select b.id from public.boxes b where b.order_id in (select id from retention_del_orders);
  create temp table retention_del_parcels on commit drop as select op.id from public.office_parcels op where op.box_id in (select id from retention_del_boxes);
  create temp table retention_del_unmatched on commit drop as select u.id from public.office_unmatched u where u.matched_parcel_id in (select id from retention_del_parcels);
  create temp table retention_del_payments on commit drop as
    select p.id from public.payments p where p.order_id in (select id from retention_del_orders) or p.box_id in (select id from retention_del_boxes);

  delete from public.office_held_links where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched);
  delete from public.office_share_moves where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched);
  delete from public.office_unmatched_look_edits where unmatched_id in (select id from retention_del_unmatched);
  delete from public.office_unmatched where id in (select id from retention_del_unmatched);
  delete from public.office_inspections where parcel_id in (select id from retention_del_parcels);
  delete from public.office_hold_alerts where parcel_id in (select id from retention_del_parcels);
  delete from public.office_envelope_shreds where parcel_id in (select id from retention_del_parcels);
  delete from public.office_not_mine_reports where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_check_events where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_checks where parcel_id in (select id from retention_del_parcels);
  delete from public.office_police_handovers where parcel_id in (select id from retention_del_parcels);
  delete from public.office_disposals where parcel_id in (select id from retention_del_parcels);
  delete from public.return_address_events where parcel_id in (select id from retention_del_parcels);
  delete from public.return_decrypt_releases where parcel_id in (select id from retention_del_parcels)
     or opened_log_id in (select l.id from public.return_decrypt_log l where l.parcel_id in (select id from retention_del_parcels));
  delete from public.return_decrypt_log where parcel_id in (select id from retention_del_parcels);
  delete from public.decrypt_releases where box_id in (select id from retention_del_boxes)
     or opened_log_id in (select l.id from public.decrypt_log l where l.order_id in (select id from retention_del_orders) or l.box_id in (select id from retention_del_boxes));
  delete from public.decrypt_log where order_id in (select id from retention_del_orders) or box_id in (select id from retention_del_boxes);
  delete from public.refunds where box_id in (select id from retention_del_boxes) or payment_id in (select id from retention_del_payments);
  delete from public.payments where id in (select id from retention_del_payments);
  delete from public.approval_signatures where request_id in (select r.request_id from public.approval_requests r where r.order_id in (select id from retention_del_orders));
  delete from public.approval_requests where order_id in (select id from retention_del_orders);
  delete from public.orders where id in (select id from retention_del_orders);
  get diagnostics v_orders = row_count;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  v_counts := jsonb_build_object('signatures', v_signatures, 'inquiries', v_inquiries, 'orders', v_orders, 'unlinked', v_unlinked, 'access_logs', 0);
  insert into public.retention_purge_runs (counts) values (v_counts);
  return v_counts;
end $$;

revoke all on function public.retention_purge() from public, anon, authenticated, service_role;
