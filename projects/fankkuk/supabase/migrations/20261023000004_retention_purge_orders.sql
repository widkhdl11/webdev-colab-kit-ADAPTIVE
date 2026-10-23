-- 기간 지난 주문 기록 자동 삭제 (2026-10-23, my-account INV-A16 · 카드 d123 「추천대로(A)」) — public 쪽.
-- 스펙: docs/specs/my-account.md INV-A16 (S16~S16c)
--
-- 무엇을 바꾸나 (20261023000003 의 retention_purge 에 주문을 더한다 — 서명·문의 부분은 그대로)
--   1) 같이 쓰는 「탈퇴한 회원」 계정 하나 · 「탈퇴한 크리에이터」 행 하나 — 고정 ID. 로그인 계정 없음, 찾기에 안 나옴.
--   2) order_ended_at(주문) — 그 주문의 마지막 기록 시각: 주문·결제·환불·취소·사무실 상자·검수 취소 요청 시각 중 가장 늦은 것.
--      「끝난 때부터 5년」을 이것으로 센다. 결제 확인 폴링 시각(last_checked_at)은 기록이 아니라 넣지 않는다.
--   3) retention_purge() — 끝난 주문(출고·거절·기한 지남·취소, 사무실에 남은 상자 없음)이고 마지막 기록이 5년 넘었으면
--      · 팬·크리에이터 둘 다 탈퇴: 주문과 거기 달린 기록(결제·환불·승인 요청·서명·상자·사무실 기록·주소 열람 기록)을 지운다.
--        지우면 함께 지워지게 걸린 표(상자·알림·답장·사진·메모·반송 주소 사본 등)는 DB 가 지운다. 선물 사진은 기존 트리거가 휴지통 표로 옮긴다.
--      · 한쪽만 탈퇴: 주문은 남긴다(회원 쪽 내역). 탈퇴한 쪽 칸(주문의 팬·크리에이터, 환불·검수 취소 요청자, 취소한 사람, 보관 알림의 크리에이터)을
--        같이 쓰는 계정·행으로 바꾼다 — 한 탈퇴자의 주문끼리 묶어 볼 수 없게. 남은 회원이 나중에 탈퇴하면 다음 회차에 지워진다.
--      「고치거나 지울 수 없다」 트리거는 이 처리 동안만 끈다(표를 잠그고, 실패하면 함께 되돌아간다).
--      어느 한 표라도 순서가 안 맞아 지우기가 막히면 그 회차 전체가 되돌아가고 cron.job_run_details 에 오류가 남는다.
--   역조공 기록은 아직 대상이 아니다(BACKLOG).

-- ── 1) 같이 쓰는 탈퇴 계정·행 ─────────────────────────────

insert into public.profiles (id, login_id, nickname, role, withdrawn_at)
values ('ffffffff-0000-4000-8000-000000000001', 'withdrawn_shared', '탈퇴한 회원', 'fan', now())
on conflict (id) do nothing;

insert into public.creators (id, profile_id, slug, name, channel, searchable, withdrawn_at)
values ('ffffffff-0000-4000-8000-000000000002', null, 'withdrawn-shared', '탈퇴한 크리에이터', '', false, now())
on conflict (id) do nothing;

-- ── 2) 주문의 마지막 기록 시각 ─────────────────────────────

create or replace function public.order_ended_at(p_order uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  with pay as (select p.id from public.payments p where p.order_id = p_order
               union select p.id from public.payments p join public.boxes b on b.id = p.box_id where b.order_id = p_order)
  select greatest(
    o.created_at, o.registered_at, o.approved_at, o.received_at, o.inspected_at, o.shipped_at, o.delivered_at, o.fan_send_ack_at, o.fan_not_sent_at,
    (select max(greatest(p.created_at, p.settled_at, p.expired_at, p.confirming_at, p.review_at)) from public.payments p where p.id in (select id from pay)),
    (select max(greatest(r.created_at, r.claimed_at, r.settled_at)) from public.refunds r
      where r.payment_id in (select id from pay) or r.box_id in (select b.id from public.boxes b where b.order_id = p_order)),
    (select max(greatest(rc.requested_at, rc.finished_at)) from public.review_cancels rc where rc.payment_id in (select id from pay)),
    (select max(c.canceled_at) from public.order_cancellations c where c.order_id = p_order),
    (select max(greatest(op.received_at, op.labeled_at, op.inspected_at, op.printed_at, op.shipped_at, op.return_printed_at, op.returned_at,
                         op.created_at, op.hold_at, op.hold_closed_at, op.return_waiting_at, op.return_confirmed_at))
       from public.office_parcels op join public.boxes b on b.id = op.box_id where b.order_id = p_order)
  )
  from public.orders o where o.id = p_order;
$$;
revoke all on function public.order_ended_at(uuid) from public, anon, authenticated, service_role;

-- ── 3) 자동 삭제 ───────────────────────────────────────

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
  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  -- 가명 처리된 서명 기록(INV-S14) — 서명 시각부터 5년. 탈퇴하지 않은 크리에이터의 서명은 대상이 아니다.
  delete from public.approval_signatures s
   where s.signed_content is null and s.signer_id is null and s.content_hash is not null
     and s.signed_at < now() - interval '5 years';
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
   where o.status in ('shipped', 'rejected', 'expired', 'canceled')
     and (fp.withdrawn_at is not null or c.withdrawn_at is not null)
     and not exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id
                     where b.order_id = o.id and op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
     and public.order_ended_at(o.id) < now() - interval '5 years';

  -- ① 한쪽만 탈퇴 — 탈퇴한 쪽 칸을 같이 쓰는 계정·행으로(이미 바꾼 주문은 대상이 아니다)
  create temp table retention_unlink on commit drop as
  select * from retention_old_orders
   where not (fan_gone and creator_gone)
     and ((fan_gone and fan_id <> c_shared_fan) or (creator_gone and creator_id <> c_shared_creator));
  get diagnostics v_unlinked = row_count;

  update public.refunds r set requested_by = c_shared_fan
    from retention_unlink u, public.payments p
   where u.fan_gone and p.order_id = u.id and r.payment_id = p.id and r.requested_by = u.fan_id;
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_unlink u, public.payments p
   where u.fan_gone and p.order_id = u.id and rc.payment_id = p.id and rc.requested_by = u.fan_id;
  update public.order_cancellations oc set canceled_by = c_shared_fan
    from retention_unlink u where u.fan_gone and oc.order_id = u.id and oc.canceled_by = u.fan_id;
  update public.office_hold_alerts ha set creator_id = c_shared_creator
    from retention_unlink u, public.boxes b, public.office_parcels op
   where u.creator_gone and b.order_id = u.id and op.box_id = b.id and ha.parcel_id = op.id and ha.creator_id = u.creator_id;
  update public.orders o
     set fan_id = case when u.fan_gone then c_shared_fan else o.fan_id end,
         creator_id = case when u.creator_gone then c_shared_creator else o.creator_id end
    from retention_unlink u where o.id = u.id;

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
