-- 탈퇴한 크리에이터의 승인 서명 기록 — 5년을 그 주문이 끝난 때부터 센다 (2026-10-23 카드 d125, 사용자 「C로. 표준법에 맞게 진행해」).
-- 스펙: docs/specs/approval-signature.md INV-S14 (S14c), my-account.md INV-A16 (보관 기간 표 — 「주문 기록은 그 주문이 끝난 때부터」).
--
-- 무엇을 바꾸나
--   retention_purge 의 서명 줄만 — 서명한 때부터 5년이 아니라 그 주문의 마지막 기록(order_ended_at)부터 5년이 지나면 지운다.
--   서명은 주문이 끝나기 전(출고 전)에 하므로 서명한 때부터 세면 거래가 끝난 뒤 5년을 못 채우고 지워질 수 있었다(전자상거래법 시행령 제6조 최소 5년).
--   5년이 지나면 주문이 회원 쪽 내역으로 남아 있어도 탈퇴한 크리에이터의 서명 기록은 지운다(개인정보보호법 제21조 — 보관 이유가 끝나면 파기).
--   나머지 본문은 20261023000006 그대로다.

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
   where r.request_id = s.request_id
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
