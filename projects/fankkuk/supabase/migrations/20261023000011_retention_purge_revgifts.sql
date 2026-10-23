-- 기간 지난 역조공 기록 자동 삭제 (2026-10-23, 배포 전 확인) — public 쪽. 스펙: docs/specs/my-account.md INV-A16, 카드 d123 「추천대로(A)」.
--
-- 무엇이 틀렸나
--   자동 삭제(20261023000004~0008)는 선물 주문만 보고 역조공(보내기·몫·환불·주소 열람 기록·사무실 상자)은 대상에 넣지 않았다.
--   탈퇴할 때 가명 처리는 되어 있지만, 기간이 지나도 지워지지 않아 처리방침의 「5년」 약속을 어긴다.
--
-- 무엇을 바꾸나 — 선물 주문과 같은 규칙을 보내기에 맞춘다
--   1) revgift_send_finished(보내기) — 끝난 보내기: 결제가 닫혔거나(실패), 결제가 끝났고 모든 몫이 끝났으며(받지 않음·기한 지남, 또는 발송·반송·취소·처분)
--      사무실에 남은 상자가 없다. 탈퇴 판정(account_has_open_work)의 「진행 중인 역조공」과 같은 기준이다.
--   2) revgift_send_ended_at(보내기) — 그 보내기의 마지막 기록 시각: 보내기·모든 몫·환불·검수 취소·주소 열람과 돌려줌·주소 기록·받는 주소 6자리·
--      사무실 상자와 그 기록(order_ended_at 과 같은 목록)·몫 옮기기 가운데 가장 늦은 것.
--      보내기 하나에 받는 팬이 여럿이라 5년은 보내기 전체로 센다 — 몫마다 세는 것보다 늦게 지워지므로 법정 최소 기간을 못 채우는 일이 없다.
--   3) retention_purge — 끝났고 마지막 기록이 5년 넘은 보내기 중 크리에이터나 받는 팬 한쪽이라도 탈퇴한 것에서
--      · 크리에이터·팬 둘 다 탈퇴한 몫: 몫과 거기 달린 기록(환불·주소 열람과 돌려줌·받는 주소 6자리·사무실 상자와 그 기록)을 지운다.
--        함께 지워지게 걸린 표(역조공 환불·알림·주소 기록·개인정보 구역의 받는 주소와 반송 주소 사본)는 DB 가 지운다.
--      · 한쪽만 탈퇴한 몫: 몫은 남기고 탈퇴한 팬 칸을 같이 쓰는 「탈퇴한 회원」으로, 크리에이터가 탈퇴했으면 보내기의 크리에이터·보낸 사람 칸을
--        같이 쓰는 「탈퇴한 크리에이터」·「탈퇴한 회원」으로 바꾼다. 사무실 상자 기록의 가명 칸도 주문과 같이 바꾼다.
--      · 크리에이터가 탈퇴했고 몫이 모두 지워진 보내기는 지운다(검수 취소 기록은 DB 가 함께 지운다).
--      사무실 상자 기록을 바꾸고 지우는 문장은 선물 상자와 역조공 상자를 한 목록으로 본다(retention_unlink_parcels · retention_del_parcels).
--      나머지 본문은 20261023000008 그대로다. 지운 건수에 revgift_shares·revgift_sends·revgift_unlinked 를 더한다.
--   0) 「보내기 하나에 팬 한 명당 몫 하나」 고유값은 같이 쓰는 「탈퇴한 회원」 줄을 뺀다 — 한 보내기에서 팬 둘 이상이 탈퇴하면
--      두 몫이 모두 같이 쓰는 표시가 되어야 하는데, 그대로면 자동 삭제 회차 전체가 고유값 충돌로 멈춘다(코드 리뷰 high). 회원끼리는 그대로 하나다.

-- ── 0) 몫 고유값 ───────────────────────────────────────

alter table public.revgift_shares drop constraint if exists revgift_shares_send_id_fan_id_key;
create unique index if not exists revgift_shares_send_fan_key on public.revgift_shares (send_id, fan_id)
  where fan_id <> 'ffffffff-0000-4000-8000-000000000001';

-- ── 1) 끝난 보내기 ─────────────────────────────────────

create or replace function public.revgift_send_finished(p_send uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.revgift_sends d
    where d.id = p_send
      and (
        d.status = 'failed'
        or (d.status = 'done'
            and not exists (
              select 1 from public.revgift_shares s
              where s.send_id = d.id and s.reply in ('waiting', 'accepted')
                and s.shipped_at is null and s.returned_at is null and s.cancelled_at is null and s.disposed_at is null
            )
            and not exists (
              select 1 from public.office_parcels op join public.revgift_shares s on s.id = op.share_id
              where s.send_id = d.id and op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed')
            ))
      )
  );
$$;
revoke all on function public.revgift_send_finished(uuid) from public, anon, authenticated, service_role;

-- ── 2) 보내기의 마지막 기록 시각 ───────────────────────────

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
      where sm.parcel_id in (select id from parcel) or sm.from_share_id in (select id from sh) or sm.to_share_id in (select id from sh))
  )
  from public.revgift_sends d where d.id = p_send;
$$;
revoke all on function public.revgift_send_ended_at(uuid) from public, anon, authenticated, service_role;

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
  v_rg_shares integer;
  v_rg_sends integer;
  v_rg_unlinked integer;
  v_n integer;
  v_tab regclass;
  v_counts jsonb;
  v_locked regclass[] := array[
    'public.approval_signatures', 'public.decrypt_log', 'public.decrypt_releases', 'public.office_inspections', 'public.office_envelope_shreds',
    'public.office_not_mine_reports', 'public.office_held_links', 'public.office_creator_check_events', 'public.office_share_moves',
    'public.office_police_handovers', 'public.office_disposals', 'public.return_decrypt_log', 'public.return_decrypt_releases',
    'public.return_address_events', 'public.office_unmatched_look_edits', 'public.revgift_decrypt_log', 'public.revgift_decrypt_releases'
  ]::regclass[];
begin
  -- 한 처리 안에서 두 번 불려도 되게(예약 작업은 회차마다 따로 처리다)
  drop table if exists retention_old_orders, retention_unlink, retention_gone, retention_del_orders, retention_del_boxes,
    retention_del_parcels, retention_del_unmatched, retention_del_payments,
    retention_old_sends, retention_rg_shares, retention_unlink_parcels, retention_del_shares;

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

  -- 끝났고 마지막 기록이 5년 넘은 보내기 중 크리에이터나 받는 팬 한쪽이라도 탈퇴한 것 · 그 보내기에서 손댈 몫
  create temp table retention_old_sends on commit drop as
  select d.id, (c.withdrawn_at is not null) as creator_gone, d.creator_id
    from public.revgift_sends d
    join public.creators c on c.id = d.creator_id
   where (c.withdrawn_at is not null
          or exists (select 1 from public.revgift_shares s join public.profiles p on p.id = s.fan_id where s.send_id = d.id and p.withdrawn_at is not null))
     and d.created_at < now() - interval '5 years' -- 마지막 기록은 보내기를 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.revgift_send_finished(d.id)
     and public.revgift_send_ended_at(d.id) < now() - interval '5 years';
  create temp table retention_rg_shares on commit drop as
  select s.id, (p.withdrawn_at is not null) as fan_gone, o.creator_gone, o.creator_id
    from public.revgift_shares s
    join retention_old_sends o on o.id = s.send_id
    join public.profiles p on p.id = s.fan_id
   where p.withdrawn_at is not null or o.creator_gone;

  -- ① 한쪽만 탈퇴 — 주문·몫은 남기고, 그 기록에 든 가명(탈퇴한 사람)을 같이 쓰는 표시로 바꾼다
  create temp table retention_unlink on commit drop as
  select * from retention_old_orders where not (fan_gone and creator_gone);
  create temp table retention_gone on commit drop as
  select p.id from public.profiles p where p.withdrawn_at is not null and p.id <> c_shared_fan;
  -- 남는 주문·몫의 사무실 상자(선물·역조공 한 목록)
  create temp table retention_unlink_parcels on commit drop as
  select op.id, u.creator_gone, u.creator_id
    from retention_unlink u join public.boxes b on b.order_id = u.id join public.office_parcels op on op.box_id = b.id
  union all
  select op.id, r.creator_gone, r.creator_id
    from retention_rg_shares r join public.office_parcels op on op.share_id = r.id
   where not (r.fan_gone and r.creator_gone);

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

  update public.revgift_shares s set fan_id = c_shared_fan
    from retention_rg_shares r
   where s.id = r.id and r.fan_gone and not r.creator_gone and s.fan_id <> c_shared_fan;
  get diagnostics v_rg_unlinked = row_count;
  update public.revgift_sends d
     set creator_id = c_shared_creator,
         sender_id = case when d.sender_id in (select id from retention_gone) then c_shared_fan else d.sender_id end
    from retention_old_sends o
   where d.id = o.id and o.creator_gone and d.creator_id <> c_shared_creator;
  get diagnostics v_n = row_count;
  v_rg_unlinked := v_rg_unlinked + v_n;
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_old_sends o
   where rc.send_id = o.id and rc.requested_by in (select id from retention_gone);

  update public.office_creator_checks cc set answered_by = c_shared_fan
    from retention_unlink_parcels up where cc.parcel_id = up.id and cc.answered_by in (select id from retention_gone);
  update public.office_creator_check_events ce set actor = c_shared_fan
    from retention_unlink_parcels up where ce.parcel_id = up.id and ce.actor in (select id from retention_gone);
  update public.office_held_links hl set account_id = c_shared_fan
    from retention_unlink_parcels up where hl.parcel_id = up.id and hl.account_id in (select id from retention_gone);
  update public.office_unmatched um set nickname_profile_id = c_shared_fan
    from retention_unlink_parcels up where um.matched_parcel_id = up.id and um.nickname_profile_id in (select id from retention_gone);
  update public.office_hold_alerts ha set creator_id = c_shared_creator
    from retention_unlink_parcels up where up.creator_gone and ha.parcel_id = up.id and ha.creator_id = up.creator_id;

  -- ② 둘 다 탈퇴 — 주문·몫과 거기 달린 기록을 아래에서부터 지운다
  create temp table retention_del_orders on commit drop as select id from retention_old_orders where fan_gone and creator_gone;
  create temp table retention_del_shares on commit drop as select id from retention_rg_shares where fan_gone and creator_gone;
  create temp table retention_del_boxes on commit drop as select b.id from public.boxes b where b.order_id in (select id from retention_del_orders);
  create temp table retention_del_parcels on commit drop as
    select op.id from public.office_parcels op
     where op.box_id in (select id from retention_del_boxes) or op.share_id in (select id from retention_del_shares);
  create temp table retention_del_unmatched on commit drop as select u.id from public.office_unmatched u where u.matched_parcel_id in (select id from retention_del_parcels);
  create temp table retention_del_payments on commit drop as
    select p.id from public.payments p where p.order_id in (select id from retention_del_orders) or p.box_id in (select id from retention_del_boxes);

  delete from public.office_held_links where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched);
  -- 지우는 몫을 가리키는 옮기기 기록은 남는 몫 쪽 상자의 것이어도 함께 지운다(두 칸 모두 그 몫을 가리켜야 하는 외래 키라 남길 수 없다)
  delete from public.office_share_moves where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched)
     or from_share_id in (select id from retention_del_shares) or to_share_id in (select id from retention_del_shares);
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

  -- 역조공 — 받는 주소 6자리를 먼저 지운다(사무실 상자가 지워질 때 그 줄을 고치려 들지 않게)
  delete from public.inbound_codes where share_id in (select id from retention_del_shares);
  delete from public.revgift_decrypt_releases where share_id in (select id from retention_del_shares)
     or opened_log_id in (select l.id from public.revgift_decrypt_log l where l.share_id in (select id from retention_del_shares));
  delete from public.revgift_decrypt_log where share_id in (select id from retention_del_shares);
  delete from public.refunds where share_id in (select id from retention_del_shares);
  -- 사무실 상자는 몫과 함께 지워진다(그 상자의 기록은 위에서 지웠다)
  delete from public.revgift_shares where id in (select id from retention_del_shares);
  get diagnostics v_rg_shares = row_count;
  delete from public.revgift_sends d
   where d.id in (select id from retention_old_sends where creator_gone)
     and not exists (select 1 from public.revgift_shares s where s.send_id = d.id);
  get diagnostics v_rg_sends = row_count;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  v_counts := jsonb_build_object('signatures', v_signatures, 'inquiries', v_inquiries, 'orders', v_orders, 'unlinked', v_unlinked, 'access_logs', 0,
                                 'revgift_shares', v_rg_shares, 'revgift_sends', v_rg_sends, 'revgift_unlinked', v_rg_unlinked);
  insert into public.retention_purge_runs (counts) values (v_counts);
  return v_counts;
end $$;

revoke all on function public.retention_purge() from public, anon, authenticated, service_role;
