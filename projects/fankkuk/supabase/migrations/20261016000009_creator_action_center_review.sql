-- 크리에이터 처리할 일 리뷰 반영 (2026-10-16). 20261016000008 의 함수 셋과 운영자 보류 목록을 고치고 옛 읽기 하나를 지운다.
-- 1) office_process_creator_check — 기한(검수 완료 + 168시간) 정각부터 'expired'(office-workflow INV-W13 — 고르기·취소와 같은 경계).
-- 2) admin_move_held_share — 원래 몫 6자리를 다시 유효로 돌리는 것은 「닫히지 않은」 몫(받기 대기·받기, 취소·출고·반송 아님)만,
--    6자리가 붙어 온 보류 상자(code_id)는 55000 으로 거부(inbound-address-code INV-C11).
-- 3) my_creator_action_items — 미확인 상자 줄은 결제 끝·336시간 지난 보내기로 먼저 거른 뒤 판정 함수를 부른다(결과 같음),
--    「보낸 선물」 판은 결제(보낸 날)가 이른 순, 같으면 몫(상자) id 순(action-center INV-J5).
-- 4) admin_unmatched_parcels — 20261016000007 과 같고, 줄마다 운영자 몫 옮기기를 받는지(share_movable)를 더한다(화면은 그 줄에만 옮기기 버튼).
--    돌려주는 칸이 바뀌어 지우고 다시 만든다.
-- 5) my_approval_requests 를 지운다 — 승인 요청은 크리에이터 처리할 일 읽기 하나로만 읽는다(INV-J6, 승인 대기만 따로 세는 길 없음).
-- 운영 적용 순서: 20261016000008 다음. 앱도 이 마이그레이션 뒤에 배포한다. 다시 적용해도 결과가 같다(create or replace · drop if exists).

-- ── 1) 운영자 처리 ──
create or replace function public.office_process_creator_check(p_qr text, p_seen_choice text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcel uuid;
  v public.office_parcels;
  k public.office_creator_checks;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_seen_choice is null or p_seen_choice not in ('accept', 'return') then
    raise exception '본 선택(받기·거절)이 필요하다' using errcode = '22023';
  end if;
  select x.id into v_parcel from public.office_parcels x join public.office_creator_checks c on c.parcel_id = x.id where x.qr_code = p_qr;
  if v_parcel is null then
    return 'not_found';
  end if;
  v := public.office_lock_parcel(v_parcel);
  select * into k from public.office_creator_checks x where x.parcel_id = v.id for update;
  if k.answer is not null then
    return 'processed';
  end if;
  if v.state <> 'held' or public.office_parcel_dead(v) then
    return 'closed';
  end if;
  -- 기한(검수 완료 + 168시간) 정각부터는 운영자도 처리하지 않는다 — 자동 처리가 고른 쪽대로 닫는다(INV-W13·W6, 고르기·취소와 같은 경계)
  if now() >= v.inspected_at + interval '168 hours' then
    return 'expired';
  end if;
  if k.choice is null then
    return 'no_choice';
  end if;
  if k.choice <> p_seen_choice then
    return 'changed';
  end if;
  update public.office_creator_checks set answer = k.choice, answered_at = now(), answered_by = auth.uid() where parcel_id = v.id;
  update public.office_parcels
  set state = case when k.choice = 'accept' then 'inspected'::public.office_state else 'return_waiting'::public.office_state end
  where id = v.id;
  if k.choice = 'return' then
    perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return case when k.choice = 'accept' then 'accepted' else 'returned' end;
end $$;

-- ── 2) 몫 옮기기 ──
create or replace function public.admin_move_held_share(p_id uuid, p_share_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  u public.office_unmatched;
  v public.office_parcels;
  t public.office_parcels;
  c_from public.inbound_codes;
  c_to public.inbound_codes;
  v_from uuid;
  v_sender uuid;
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_id is null or p_share_id is null then
    raise exception '보류 상자와 옮길 몫이 필요하다' using errcode = '22023';
  end if;
  select * into u from public.office_unmatched where id = p_id;
  if u.id is null then
    raise exception '없는 보류 상자다' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || u.waybill_no, 0));
  select x.share_id into v_from from public.office_parcels x where x.id = u.matched_parcel_id;
  if v_from is null then
    raise exception '찾기로 몫에 이은 상자가 아니다' using errcode = '55000';
  end if;
  select d.sender_id into v_sender from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where s.id = v_from;

  perform 1 from public.revgift_shares s where s.id in (v_from, p_share_id) order by s.id for update;
  select * into c_from from public.inbound_codes x where x.share_id = v_from for update;
  select * into c_to from public.inbound_codes x where x.share_id = p_share_id for update;
  select * into t from public.office_parcels x where x.share_id = p_share_id and x.id <> u.matched_parcel_id for update;
  select * into v from public.office_parcels x where x.id = u.matched_parcel_id for update;
  if v.share_id is distinct from v_from then
    raise exception '상자 정보가 바뀌는 중이다 — 다시 한다' using errcode = '40001';
  end if;
  select * into u from public.office_unmatched where id = p_id for update;
  -- 검수 완료 전(입고·라벨 부착)이고 보류·분쟁이 아닌 상자만
  -- 6자리가 붙어 온 보류 상자(분쟁·무효 6자리 갈래)는 옮기지 않는다 — 찾기(②-나)로 이은 6자리 없는 상자만(INV-C11)
  if u.matched_parcel_id is distinct from v.id or v.state not in ('received', 'labeled') or v.hold_reason is not null or u.code_id is not null then
    raise exception '옮길 수 없는 상자다' using errcode = '55000';
  end if;
  if not public.revgift_share_before_inbound(p_share_id, v_sender) then
    raise exception '후보가 아닌 몫이다' using errcode = 'P0047';
  end if;

  -- 옮길 곳에 송장번호만 넣어 둔 대기 줄이 있으면 지운다 — 한 몫에는 상자 작업 줄이 하나다
  if t.id is not null then
    delete from public.office_parcels where id = t.id and state = 'awaiting';
  end if;
  update public.office_parcels set share_id = p_share_id where id = v.id;
  -- 원래 몫: 입고 전으로, 닫히지 않았으면 6자리 다시 유효(INV-C11)
  update public.revgift_shares s set received_at = null, inspected_at = null where s.id = v_from;
  if c_from.id is not null and c_from.state = 'used'
     -- 「닫히지 않았으면」: 받기 대기·받기이고 취소·출고·반송으로 끝나지 않은 몫만 — 받지 않음·기한 지남 몫은 다시 유효로 돌리지 않는다
     and exists (select 1 from public.revgift_shares s where s.id = v_from and s.reply in ('waiting', 'accepted')
                 and s.cancelled_at is null and s.returned_at is null and s.shipped_at is null) then
    perform set_config('fankkuk.share_move_restore', 'on', true);
    update public.inbound_codes set state = 'valid', used_at = null, first_parcel_id = null where id = c_from.id;
    perform set_config('fankkuk.share_move_restore', '', true);
  end if;
  -- 새 몫: 6자리로 입고될 때와 같은 끝(사용됨)
  if c_to.id is not null then
    update public.inbound_codes
    set state = case when state = 'valid' then 'used' else state end,
        used_at = case when state = 'valid' then now() else used_at end,
        first_parcel_id = v.id
    where id = c_to.id;
  end if;
  perform public.office_sync(v.id);
  insert into public.office_share_moves (unmatched_id, parcel_id, from_share_id, to_share_id, moved_by)
  values (u.id, v.id, v_from, p_share_id, auth.uid());
  return 'moved';
end $$;

-- ── 3) 처리할 일 읽기 ──
create or replace function public.my_creator_action_items()
returns table (
  kind text,
  board text,
  order_no text,
  request_id text,
  share_id uuid,
  box_id uuid,
  box_seq integer,
  box_count integer,
  box_label text,
  nickname text,
  item_kind text,
  tier text,
  measured_tier text,
  amount_krw integer,
  has_electronics_or_metal boolean,
  bluetooth boolean,
  rf boolean,
  choice text,
  sent_at timestamptz,
  received_at timestamptz,
  due_at timestamptz,
  prior_gift_count integer,
  prior_passed_count integer,
  prior_returned_count integer
)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select p.id as uid from public.profiles p where p.id = auth.uid() and p.role = 'creator'
  ),
  lines as (
    -- 블루투스 발견: 확인 대기 · 운영자 처리 전 · 기한(검수 완료 + 168시간) 전 · 주문 진행 중 · 나갈 수 있는 상자
    select 'bluetooth'::text as kind, 'received'::text as board, o.order_no, null::text as request_id, null::uuid as share_id, b.id as box_id,
           b.seq::integer as box_seq, (select count(*)::integer from public.boxes bx where bx.order_id = o.id) as box_count, null::text as box_label,
           f.nickname, o.item_kind, coalesce(b.measured_tier, b.declared_tier)::text as tier, null::text as measured_tier, null::integer as amount_krw,
           o.has_electronics_or_metal, coalesce(i.bluetooth = 'found', false) as bluetooth, coalesce(i.rf = 'found', false) as rf, k.choice,
           o.registered_at as sent_at, x.received_at, x.inspected_at + interval '168 hours' as due_at,
           h.gifts as prior_gift_count, h.passed as prior_passed_count, h.returned as prior_returned_count
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.boxes b on b.order_id = o.id
    join public.office_parcels x on x.box_id = b.id
    join public.office_creator_checks k on k.parcel_id = x.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select ii.bluetooth, ii.rf from public.office_inspections ii where ii.parcel_id = x.id order by ii.at desc, ii.id desc limit 1
    ) i on true
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where x.state = 'held' and k.answer is null and now() < x.inspected_at + interval '168 hours'
      and o.status not in ('rejected', 'expired', 'canceled') and not public.office_parcel_dead(x)

    union all

    -- 승인 요청: 대기 · 승인 전 · 진행 중 · 검수 반송 아님 · 결제 완료 + 168시간 전(approve_request 와 같은 판정)
    select 'approval', 'received', o.order_no, r.request_id, null, null, null,
           (select count(*)::integer from public.boxes bx where bx.order_id = o.id), null,
           f.nickname, o.item_kind, null, null, null, o.has_electronics_or_metal, null, null, null,
           o.registered_at, o.received_at, o.registered_at + interval '168 hours',
           h.gifts, h.passed, h.returned
    from me
    join public.creators c on c.profile_id = me.uid
    join public.orders o on o.creator_id = c.id
    join public.approval_requests r on r.order_id = o.id
    join public.profiles f on f.id = o.fan_id
    left join lateral (
      select count(*)::integer as gifts,
             (count(*) filter (where p.inspection_result = 'passed'))::integer as passed,
             (count(*) filter (where p.inspection_result = 'returned'))::integer as returned
      from public.orders p
      where p.creator_id = o.creator_id and p.fan_id = o.fan_id and p.id <> o.id and p.registered_at is not null and p.status <> 'pending_payment'
    ) h on true
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and now() < o.registered_at + interval '168 hours'

    union all

    -- 미확인 상자: 내가 보낸 몫이 늦을 때만(INV-J7 — 보류 상자가 있는지와 상관없다). 칸은 받는 팬 닉네임·상자 크기·보낸 날뿐
    select 'unconfirmed', 'sent', s.order_no, null, s.id, null, null, null, null,
           fp.nickname, null, s.tier::text, null, null, null, null, null, null,
           d.settled_at, null, null, null, null, null
    from me
    join public.revgift_sends d on d.sender_id = me.uid
    join public.revgift_shares s on s.send_id = d.id
    join public.profiles fp on fp.id = s.fan_id
    -- 결제 끝·336시간 지난 보내기만 먼저 거른 뒤 판정 함수를 부른다(같은 결과, 부르는 수만 줄인다 — INV-J11 판정은 그 함수 하나)
    where d.status = 'done' and d.settled_at <= now() - interval '336 hours'
      and public.revgift_share_late(s.id, me.uid)

    union all

    -- 보낸 팬 선물: 팬 처리할 일과 같은 함수의 같은 줄(action-center INV-J3 · 카드 d93 ⑩)
    select a.kind, 'sent', a.order_no, null, null, a.box_id, a.box_seq::integer, null, a.box_label,
           a.creator_name, null, a.tier, a.measured_tier, a.amount_krw, null, null, null, null,
           o.registered_at, null, a.due_at, null, null, null
    from me
    cross join public.my_action_items() a
    join public.orders o on o.order_no = a.order_no
    where a.kind in ('difference', 'missing_box')
  )
  select l.kind, l.board, l.order_no, l.request_id, l.share_id, l.box_id, l.box_seq, l.box_count, l.box_label, l.nickname, l.item_kind, l.tier,
         l.measured_tier, l.amount_krw, l.has_electronics_or_metal, l.bluetooth, l.rf, l.choice, l.sent_at, l.received_at, l.due_at,
         l.prior_gift_count, l.prior_passed_count, l.prior_returned_count
  from lines l
  order by (l.board = 'sent'), (l.kind <> 'bluetooth'),
           case when l.board = 'received' then l.due_at else l.sent_at end,
           -- 같은 시각이면 받은 선물은 주문번호·상자 순, 보낸 선물은 몫(상자) id 순
           case when l.board = 'received' then l.order_no end, l.box_seq, coalesce(l.share_id, l.box_id);
$$;

-- ── 4) 운영자 보류 목록 ──
drop function if exists public.admin_unmatched_parcels();
create function public.admin_unmatched_parcels()
returns table (
  id uuid, source text, qr text, waybill_no text, carrier text, arrived_at timestamptz, nickname text, shelf text,
  reason text, suspected_theft boolean, state text, deadline_at timestamptz, share_movable boolean
)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select u.id, 'unmatched'::text, null::text, u.waybill_no, u.carrier, u.arrived_at, pr.nickname, u.shelf,
           u.reason, u.suspected_theft,
           case when u.matched_parcel_id is not null then 'matched' when u.expired_at is not null then 'expired' else 'waiting' end,
           u.arrived_at + interval '168 hours',
           -- 운영자 몫 옮기기(INV-C11)를 받는 줄 — 찾기(②-나)로 이은 6자리 없는 역조공 상자이고 검수 완료 전·보류 아님(admin_move_held_share 와 같은 판정)
           coalesce(u.code_id is null and mp.share_id is not null and mp.state in ('received', 'labeled') and mp.hold_reason is null, false)
    from public.office_unmatched u
    left join public.office_parcels mp on mp.id = u.matched_parcel_id
    left join public.profiles pr on pr.id = u.nickname_profile_id
    union all
    select p.id, 'parcel', p.qr_code, p.inbound_waybill_no, null, p.received_at, null, null,
           p.hold_reason,
           p.hold_reason in ('not_mine', 'detached') or exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
           case when p.hold_closed_at is not null then 'expired' else 'on_hold' end,
           p.hold_at + interval '168 hours',
           false
    from public.office_parcels p
    where p.hold_reason is not null
  ) h (id, source, qr, waybill_no, carrier, arrived_at, nickname, shelf, reason, suspected_theft, state, deadline_at, share_movable)
  where public.is_operator()
  order by (h.state in ('waiting', 'on_hold')) desc, h.arrived_at desc nulls last
  limit 500;
$$;

-- ── 5) 옛 승인 요청 읽기 ──
drop function if exists public.my_approval_requests();

revoke all on function public.office_process_creator_check(text, text) from public, anon;
revoke all on function public.admin_move_held_share(uuid, uuid) from public, anon;
revoke all on function public.my_creator_action_items() from public, anon;
revoke all on function public.admin_unmatched_parcels() from public, anon;
grant execute on function public.office_process_creator_check(text, text) to authenticated;
grant execute on function public.admin_move_held_share(uuid, uuid) to authenticated;
grant execute on function public.my_creator_action_items() to authenticated;
grant execute on function public.admin_unmatched_parcels() to authenticated;
