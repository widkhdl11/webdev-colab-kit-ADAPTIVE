-- 크리에이터 처리할 일 (docs/specs/action-center.md 「크리에이터 쪽」 INV-J5~J8, J11 의 「사무실 도착이 늦어요」 판정),
-- 블루투스 상자의 크리에이터 선택(office-workflow INV-W13·W4·W6), 크리에이터의 미확인 상자 찾기(inbound-address-code INV-C4 ②-나·C10),
-- 운영자 몫 옮기기(INV-C11), 역조공 받기 알림(notifications INV-N20, reverse-gift INV-R12) — 2026-10-16 카드 d92·d93.
--
-- 1) 크리에이터 확인 줄(office_creator_checks)에 「선택」 칸(choice·chosen_at)을 둔다. 크리에이터의 받기·거절은 선택만 남기고 상자는 확인 대기 그대로다.
--    answer 는 이제 「처리된 결과」다 — 운영자 처리(answered_by = 그 운영자)·기한 자동 처리(answered_by 빈 칸)·고르지 않은 채 기한 지남(expired).
--    고르기·취소 기록은 office_creator_check_events 에 쌓는다(추가만).
-- 2) choose_creator_check · cancel_creator_check(크리에이터) · office_process_creator_check(운영자, 화면에서 본 선택과 함께) · admin_creator_check_choices(운영자 목록).
--    잠금은 상자 → 승인 요청 → 주문 → 사무소 상자 줄(INV-W12, office_lock_parcel) 다음 확인 줄 — 셋 다 같은 순서라 겹치면 하나만 반영된다.
--    결과 꼴: chosen · already_chosen · cancelled · not_chosen · accepted · returned · no_choice · changed · processed · expired · closed · not_found.
--    바로 넘기던 answer_creator_check 와 옛 목록 읽기 my_creator_checks 는 지운다 — 처리 길은 위 셋뿐, 확인 대기 상자는 처리할 일 읽기 하나로만 읽는다(INV-J6).
-- 3) office_run_expiry — 20261012000011 과 같고, ⑤ 단계가 고른 쪽대로 처리한다(받기 → 검수 완료, 거절 → 반송 대기 + 팬 hold_fan, 없음 → 반송 대기 + 「기한 지남」 + hold_fan).
-- 4) 몫 판정 둘: revgift_share_before_inbound(찾기 후보·옮길 곳·미확인 줄이 같이 쓰는 「결제 끝·입고 전·닫히지 않음」),
--    revgift_share_late(그 판정 + 몫 결제 완료 뒤 336시간 — INV-J11 「사무실 도착이 늦어요」, 다음 묶음의 선물 현황도 이것을 쓴다).
-- 5) my_creator_action_items() — 크리에이터 처리할 일 읽기 하나(INV-J5·J6·J7). 인자 없음, 로그인한 크리에이터 계정 것만.
--    my_revgift_find_candidates() — 미확인 상자 창의 팬 고르기 후보(몫 번호·받는 팬 닉네임·상자 크기).
-- 6) find_held_parcel — 20261016000007 과 같고, 몫 갈래의 후보 판정을 revgift_share_before_inbound 로 바꿨다(받지 않음 뒤 6자리를 살려 둔 몫도 후보 — S4f).
-- 7) 운영자 몫 옮기기(INV-C11): admin_share_move_candidates · admin_move_held_share, 옮긴 기록 office_share_moves(추가만).
--    원래 몫의 6자리를 다시 유효로 돌리는 것은 이 함수만 한다 — 6자리 지킴이가 이 처리 안에서 켠 표시가 있을 때만 사용됨 → 유효를 받는다.
-- 8) 역조공 받기 알림(INV-N20): 알림 줄에 몫 칸(share_id), 종류 revgift_offer(끌 수 없음), 몫 결제 완료 처리에서 1차, 72시간 재알림(2차)은 notification_enqueue_due,
--    꺼낼 때 몫이 받기 대기가 아니면 건너뜀(share_not_waiting). 꺼낸 줄에 보낸 크리에이터 공개 이름(sender_name) 하나를 더한다.
--
-- 운영 적용 순서: 20261016000007 다음. 앱은 이 마이그레이션 뒤에 배포한다(옛 앱의 answer_creator_check·my_creator_checks 호출이 실패한다).
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 제약은 drop if exists 뒤 add, 함수는 create or replace 또는 drop if exists 뒤 create).

-- ── 1) 크리에이터 선택 ─────────────────────────────────────────

alter table public.office_creator_checks add column if not exists choice text check (choice in ('accept', 'return'));
alter table public.office_creator_checks add column if not exists chosen_at timestamptz;
alter table public.office_creator_checks drop constraint if exists office_creator_checks_chosen;
alter table public.office_creator_checks add constraint office_creator_checks_chosen check ((choice is null) = (chosen_at is null));

create table if not exists public.office_creator_check_events (
  id bigint generated always as identity primary key,
  parcel_id uuid not null references public.office_parcels (id),
  action text not null check (action in ('choose', 'cancel')),
  choice text check (choice in ('accept', 'return')),
  actor uuid not null references public.profiles (id),
  at timestamptz not null default now(),
  constraint office_creator_check_events_choice check ((action = 'choose') = (choice is not null))
);
alter table public.office_creator_check_events enable row level security;
revoke all on public.office_creator_check_events from public, anon, authenticated;
create or replace trigger office_creator_check_events_no_update before update on public.office_creator_check_events
  for each row execute function public.append_only_log();
create or replace trigger office_creator_check_events_no_delete before delete on public.office_creator_check_events
  for each row execute function public.append_only_log();

drop function if exists public.answer_creator_check(text, integer, text);
drop function if exists public.my_creator_checks();

-- 로그인한 크리에이터의 그 주문·상자의 확인 대기 줄(상자 작업 줄 id). 남의 주문·없는 상자·확인 줄 없음은 null(같은 「없음」)
create or replace function public.creator_check_parcel_of(p_order_no text, p_box_seq integer)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select x.id
  from public.orders o
  join public.creators c on c.id = o.creator_id
  join public.profiles me on me.id = c.profile_id
  join public.boxes b on b.order_id = o.id
  join public.office_parcels x on x.box_id = b.id
  join public.office_creator_checks k on k.parcel_id = x.id
  where o.order_no = p_order_no and b.seq = p_box_seq and c.profile_id = auth.uid() and me.role = 'creator';
$$;

-- 잠근 확인 줄의 공통 판정 — 처리됨·끝남·기한 지남. 아무것도 아니면 null.
-- 기한 처리(고르지 않아 기한 지남 · 고른 쪽대로 자동 처리 — 처리한 사람 칸이 빈 줄)가 닫은 줄은 「기한 지남」(INV-W13 S13e), 운영자가 처리한 줄은 「이미 처리됨」
create or replace function public.creator_check_blocked(v public.office_parcels, k public.office_creator_checks)
returns text
language sql stable set search_path = ''
as $$
  select case
    when k.answer = 'expired' or (k.answer is not null and k.answered_by is null) then 'expired'
    when k.answer is not null then 'processed'
    when v.state <> 'held' or public.office_parcel_dead(v) then 'closed'
    when now() >= v.inspected_at + interval '168 hours' then 'expired'
  end;
$$;

-- INV-W13 고르기: 그 주문의 크리에이터만, 운영자 처리 전·기한 전·고른 것이 없을 때. 상자는 움직이지 않는다
create or replace function public.choose_creator_check(p_order_no text, p_box_seq integer, p_choice text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcel uuid;
  v public.office_parcels;
  k public.office_creator_checks;
  v_blocked text;
begin
  if p_choice is null or p_choice not in ('accept', 'return') then
    raise exception '받기 또는 거절' using errcode = '22023';
  end if;
  v_parcel := public.creator_check_parcel_of(p_order_no, p_box_seq);
  if v_parcel is null then
    return 'not_found';
  end if;
  v := public.office_lock_parcel(v_parcel);
  select * into k from public.office_creator_checks x where x.parcel_id = v.id for update;
  v_blocked := public.creator_check_blocked(v, k);
  if v_blocked is not null then
    return v_blocked;
  end if;
  if k.choice is not null then
    return 'already_chosen';
  end if;
  update public.office_creator_checks set choice = p_choice, chosen_at = now() where parcel_id = v.id;
  insert into public.office_creator_check_events (parcel_id, action, choice, actor) values (v.id, 'choose', p_choice, auth.uid());
  return 'chosen';
end $$;

-- INV-W13 취소: 고른 것이 있고 운영자 처리 전·기한 전일 때만. 고르기 전으로 돌아간다(기록은 쌓인다)
create or replace function public.cancel_creator_check(p_order_no text, p_box_seq integer)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcel uuid;
  v public.office_parcels;
  k public.office_creator_checks;
  v_blocked text;
begin
  v_parcel := public.creator_check_parcel_of(p_order_no, p_box_seq);
  if v_parcel is null then
    return 'not_found';
  end if;
  v := public.office_lock_parcel(v_parcel);
  select * into k from public.office_creator_checks x where x.parcel_id = v.id for update;
  v_blocked := public.creator_check_blocked(v, k);
  if v_blocked is not null then
    return v_blocked;
  end if;
  if k.choice is null then
    return 'not_chosen';
  end if;
  update public.office_creator_checks set choice = null, chosen_at = null where parcel_id = v.id;
  insert into public.office_creator_check_events (parcel_id, action, choice, actor) values (v.id, 'cancel', null, auth.uid());
  return 'cancelled';
end $$;

-- INV-W13 운영자 처리: 운영자(직원·대표)만. 화면에서 본 선택이 지금 선택과 다르면 「바뀜」. 처리하면 잠기고
-- 받기 → 검수 완료, 거절 → 반송 대기 + 보낸 팬 「돌려보낼 상자」(INV-N13). 처리한 운영자는 answered_by 에만(크리에이터에게 가지 않는다 — INV-P7)
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

-- 운영자 목록: 크리에이터가 고른 것이 있고 아직 처리 전인 확인 대기 상자. 운영자가 아니면 0줄. 보낸 팬·크리에이터 칸은 없다
create or replace function public.admin_creator_check_choices()
returns table (qr text, order_no text, box_seq integer, choice text, chosen_at timestamptz, due_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select x.qr_code, o.order_no, b.seq::integer, k.choice, k.chosen_at, x.inspected_at + interval '168 hours'
  from public.office_creator_checks k
  join public.office_parcels x on x.id = k.parcel_id
  join public.boxes b on b.id = x.box_id
  join public.orders o on o.id = b.order_id
  where coalesce(public.is_operator(), false)
    and k.choice is not null and k.answer is null and x.state = 'held' and not public.office_parcel_dead(x)
  order by k.chosen_at, x.qr_code
  limit 500;
$$;

-- ── 3) 자동 처리 ──────────────────────────────────────────────

-- 20261012000011 과 같고, ⑤ 단계만 바뀌었다(INV-W13 기한 — 고른 쪽대로).
CREATE OR REPLACE FUNCTION public.office_run_expiry(p_order_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
  v_pending_gifts integer;
  v_pending_revgifts integer;
  v_held integer;
  v_held_parcels integer := 0;
  v_parcel uuid;
  v_order uuid;
  v_boxes_missing integer := 0;
  v_box_missing_alerts integer;
  v_kept_closed integer := 0;
  v_box uuid;
  v_kept_shares integer;
  v_n integer;
  v_p public.office_parcels;
  v_k public.office_creator_checks;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15)
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15)
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  v_gifts := 0;
  for v_order in
    select o.id from public.orders o join public.approval_requests r on r.order_id = o.id
    where r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    order by o.registered_at, o.id
  loop
    perform 1 from public.boxes b where b.order_id = v_order order by b.seq for update;
    perform 1 from public.approval_requests r where r.order_id = v_order for no key update;
    perform 1 from public.orders o where o.id = v_order for update;
    with expired as (
      update public.approval_requests r
      set status = 'expired', decided_at = now()
      from public.orders o
      where o.id = r.order_id and r.order_id = v_order and r.status = 'waiting' and o.approved_at is null
        and o.status in ('registered', 'received', 'labeled', 'inspected')
        and o.registered_at <= now() - interval '168 hours'
      returning r.order_id
    )
    update public.orders o set status = 'expired'
    from expired e where o.id = e.order_id and o.approved_at is null;
    get diagnostics v_n = row_count;
    v_gifts := v_gifts + v_n;
  end loop;

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13)
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and d.created_at <= now() - interval '168 hours'
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 5) 크리에이터 확인 대기 상자: 검수 완료 + 168시간이 지나도 운영자가 처리하지 않았으면 자동 처리가 닫는다(office-workflow INV-W13·W6).
  --    고른 것이 있으면 고른 쪽대로 운영자 처리와 같은 결과(처리한 사람 칸은 비어 있다 = 자동 처리): 받기 → 검수 완료, 거절 → 반송 대기 + 팬 hold_fan.
  --    고른 것이 없으면 반송 대기 + 확인 줄 「기한 지남」 + 팬 hold_fan. 끝난 주문의 상자는 아래 「나갈 수 없게 된 상자」가 맡는다.
  --    상자마다 상자 → 주문(몫) → 사무소 상자 줄 → 확인 줄 순으로 잠그고(INV-W12 — 고르기·취소·운영자 처리와 같다) 다시 본다.
  v_held := 0;
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'held' and p.inspected_at <= now() - interval '168 hours' and not public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    select * into v_k from public.office_creator_checks k where k.parcel_id = v_parcel for update;
    if v_p.state <> 'held' or v_p.inspected_at > now() - interval '168 hours' or public.office_parcel_dead(v_p) or v_k.answer is not null then
      continue;
    end if;
    if v_k.choice = 'accept' then
      update public.office_parcels set state = 'inspected' where id = v_parcel;
      update public.office_creator_checks set answer = 'accept', answered_at = now(), answered_by = null where parcel_id = v_parcel;
      perform public.office_sync(v_parcel);
    else
      update public.office_parcels set state = 'return_waiting' where id = v_parcel;
      if v_k.parcel_id is not null then
        update public.office_creator_checks
        set answer = case when v_k.choice = 'return' then 'return' else 'expired' end, answered_at = now(), answered_by = null
        where parcel_id = v_parcel;
      end if;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    v_held := v_held + 1;
  end loop;

  -- 6) 주문에 묶인 채 보류된 상자: 보류 + 168시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.hold_reason is not null and p.hold_closed_at is null and p.hold_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.hold_at, p.id
  loop
    if public.office_close_held_parcel(v_parcel, null, true) then
      v_held_parcels := v_held_parcels + 1;
    end if;
  end loop;

  -- 7) 승인 뒤 도착하지 않은 상자: 결제 완료 + 720시간 → 그 상자를 닫는다(office-workflow INV-W10)
  for v_order in
    select o.id from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '720 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
    order by o.registered_at, o.id
  loop
    v_boxes_missing := v_boxes_missing + public.office_close_missing_boxes(v_order);
  end loop;

  -- 8) 결제 완료 + 336시간에 아직 안 온 상자가 있는 진행 중 주문 → 보낸 팬에게 한 번(notifications INV-N15)
  select count(*)::integer into v_box_missing_alerts
  from (
    select public.notification_enqueue('box_missing', o.id, null, 1::smallint, o.fan_id, now()) as n
    from public.orders o
    where o.approved_at is not null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and (p_order_no is null or o.order_no = p_order_no)
      and exists (select 1 from public.boxes b
                  where b.order_id = o.id and b.missing_at is null
                    and not exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
  ) q
  where q.n > 0;

  -- 9) 살려 둔 지 168시간 지난 상자·몫(payment INV-M18 ③ · reverse-gift INV-R11)
  for v_box in
    select c.box_id from public.inbound_codes c
    join public.boxes b on b.id = c.box_id
    join public.orders o on o.id = b.order_id
    where c.box_id is not null and c.kept_at is not null and c.state = 'valid' and c.kept_at <= now() - interval '168 hours'
      and b.missing_at is null
      and (p_order_no is null or o.order_no = p_order_no)
    order by c.kept_at, c.box_id
  loop
    if public.office_close_kept_box(v_box) then
      v_kept_closed := v_kept_closed + 1;
    end if;
  end loop;
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.revgift_shares s
  where s.id = c.share_id and c.kept_at is not null and c.state = 'valid' and c.kept_at <= now() - interval '168 hours'
    and (p_order_no is null or s.order_no = p_order_no);
  get diagnostics v_kept_shares = row_count;
  v_kept_closed := v_kept_closed + v_kept_shares;

  -- 나갈 수 없게 된 상자 중 검수 완료·크리에이터 확인 대기인 것은 반송 대기로(답은 빈 채, 팬 알림 없음)
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state in ('inspected', 'held') and public.office_parcel_dead(p)
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
           or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no))
    order by p.id
  loop
    begin
      perform public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    update public.office_parcels p set state = 'return_waiting'
    where p.id = v_parcel and p.state in ('inspected', 'held') and public.office_parcel_dead(p);
  end loop;

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간. 맨 뒤에 둔다 — 찾기 함수가 이 표를 상자·주문·사무소 상자 줄 다음에 잠근다(INV-W12)
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts,
                            'pending_gifts', v_pending_gifts, 'pending_revgifts', v_pending_revgifts, 'held', v_held, 'held_parcels', v_held_parcels,
                            'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts, 'kept_closed', v_kept_closed);
end $function$;

-- ── 4) 몫 판정 ─────────────────────────────────────────────────

-- 보낸 크리에이터(p_sender)의 몫이 「결제가 끝났고 아직 입고 전이며 닫히지 않음」인가 (inbound-address-code INV-C4 ②-나 · C11, action-center INV-J7).
-- 닫힘 = 취소됐거나 출고·반송으로 끝났거나, 받지 않음·기한 지남인데 살려 둔 6자리도 없다(무효). 상자 작업 줄이 없거나 대기(awaiting)면 입고 전.
create or replace function public.revgift_share_before_inbound(p_share_id uuid, p_sender uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_share_id and d.sender_id = p_sender and d.status = 'done'
      and s.cancelled_at is null and s.returned_at is null and s.shipped_at is null
      and (s.reply in ('waiting', 'accepted')
           or exists (select 1 from public.inbound_codes c where c.share_id = s.id and c.state = 'valid'))
      and not exists (select 1 from public.office_parcels x where x.share_id = s.id and x.state <> 'awaiting')
  );
$$;

-- 몫의 「사무실 도착이 늦어요」(action-center INV-J11, 카드 d93 ⑥): 입고 전 판정 + 몫 결제 완료 뒤 336시간(office-workflow INV-W10 과 같은 기준)
create or replace function public.revgift_share_late(p_share_id uuid, p_sender uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.revgift_share_before_inbound(p_share_id, p_sender)
     and exists (
       select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
       where s.id = p_share_id and now() >= d.settled_at + interval '336 hours'
     );
$$;

-- ── 5) 크리에이터 처리할 일 읽기 ─────────────────────────────────

-- action-center INV-J5·J6·J7. 줄 종류: bluetooth(블루투스 발견) · approval(승인 요청) — 받은 선물 판 / unconfirmed(미확인 상자) ·
-- difference·missing_box(크리에이터 계정이 보낸 팬 선물 — 팬 처리할 일 읽기 my_action_items 와 같은 판정) — 보낸 선물 판.
-- 보이는 조건은 그 일을 받아 주는 처리와 같다: 블루투스 = 고르기(choose_creator_check)가 받는 상태, 승인 = approve_request 가 받는 상태,
-- 미확인 = revgift_share_late(찾기 후보 판정 + 336시간). 칸은 기존 읽기(승인 요청·확인할 선물·보낸 역조공·팬 처리할 일)가 주던 칸을 넘지 않는다.
-- 순서: 받은 선물(블루투스 → 승인, 각각 기한 짧은 순) → 보낸 선물(보낸 날 이른 순).
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
    where public.revgift_share_late(s.id, me.uid)

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
           case when l.board = 'received' then l.due_at else l.sent_at end, l.order_no, l.box_seq;
$$;

-- 미확인 상자 창의 팬 고르기 후보(INV-J7): 로그인한 크리에이터가 보낸 몫 가운데 결제 끝·입고 전·닫히지 않은 몫. 칸은 몫 번호·받는 팬 닉네임·상자 크기뿐
create or replace function public.my_revgift_find_candidates()
returns table (share_id uuid, fan_nickname text, tier text)
language sql stable security definer set search_path = ''
as $$
  select s.id, fp.nickname, s.tier::text
  from public.profiles me
  join public.revgift_sends d on d.sender_id = me.id
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles fp on fp.id = s.fan_id
  where me.id = auth.uid() and me.role = 'creator' and public.revgift_share_before_inbound(s.id, me.id)
  order by d.settled_at, s.seq
  limit 200;
$$;

-- ── 6) 찾기 ─────────────────────────────────────────────────────

-- 20261016000007 과 같고, 몫 갈래의 후보 판정을 revgift_share_before_inbound 로 바꿨다(INV-C4 ②-나 — 받지 않음 뒤 6자리를 살려 둔 몫도 후보, S4f).
create or replace function public.find_held_parcel(p_box_id uuid, p_share_id uuid, p_waybill text, p_carrier text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.inbound_codes;
  t public.office_parcels;
  u public.office_unmatched;
  v public.office_parcels;
  v_order_id uuid;
  v_ok boolean := false;
  v_result text := 'not_found';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if num_nonnulls(p_box_id, p_share_id) <> 1 or p_carrier is null or not public.inbound_carrier_ok(p_carrier) then
    raise exception '상자 하나와 택배사가 필요하다' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.find:' || v_uid::text, 0));
  -- INV-C10: 그날(서울 날짜)의 틀린 시도만 센다
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched
        and a.at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')) >= 5 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;

  -- 잠금 순서(교착 방지 — 입고 함수와 같다): 상자 줄 → 승인 요청 줄 → 주문 줄(역조공은 몫 줄) → 6자리 줄 → 상자 작업 줄 → 보류 줄
  if p_box_id is not null then
    select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = p_box_id and b.missing_at is null and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
    for update of b;
    if v_order_id is not null then
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      perform 1 from public.orders o
      where o.id = v_order_id and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
      for update;
      v_ok := found;
    end if;
  else
    perform 1 from public.revgift_shares s where s.id = p_share_id for update;
    -- 몫 줄을 잠근 뒤 판정 — 내가 보낸 결제 끝·입고 전·닫히지 않은 몫만(INV-C4 ②-나). 후보가 아니면 틀린 시도로 센다(INV-C10)
    v_ok := found and public.revgift_share_before_inbound(p_share_id, v_uid);
  end if;

  if v_ok then
    select * into c from public.inbound_codes x where x.box_id = p_box_id or x.share_id = p_share_id for update;
    select * into t from public.office_parcels x where x.box_id = p_box_id or x.share_id = p_share_id for update;

    if t.id is not null and t.hold_reason in ('code_dispute', 'waybill_dispute') and t.inbound_waybill_no = p_waybill
       and not exists (select 1 from public.office_not_mine_reports r where r.parcel_id = t.id) then
      update public.office_parcels set hold_reason = null, hold_at = null where id = t.id;
      v_result := 'matched';
    elsif t.id is null or t.state = 'awaiting' or t.hold_reason in ('code_dispute', 'waybill_dispute') then
      select * into u from public.office_unmatched x
      where x.waybill_no = p_waybill and x.carrier = p_carrier
        and (p_share_id is not null or x.code_id is not null or x.nickname_profile_id = v_uid)
        and x.matched_parcel_id is null and x.expired_at is null and x.arrived_at > now() - interval '168 hours'
        and (x.code_id is null or x.code_id is not distinct from c.id)
        and not exists (select 1 from public.office_parcels y where y.inbound_waybill_no = p_waybill)
      for update;
      if u.id is not null then
        if t.id is not null and t.state <> 'awaiting' then
          update public.office_parcels set box_id = null, share_id = null, hold_reason = 'detached', hold_at = now()
          where id = t.id;
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        elsif t.id is null then
          insert into public.office_parcels (box_id, share_id, inbound_waybill_no, state, received_at)
          values (p_box_id, p_share_id, p_waybill, 'received', u.arrived_at)
          returning * into v;
        else
          update public.office_parcels set inbound_waybill_no = p_waybill, state = 'received', received_at = u.arrived_at
          where id = t.id returning * into v;
        end if;
        perform public.office_finish_held_receive(u.id, v.id, c.id);
        v_result := 'matched';
      end if;
    end if;
  end if;

  insert into public.office_match_attempts (profile_id, matched) values (v_uid, v_result = 'matched');
  if v_result <> 'matched' and (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and not a.matched and a.at > now() - interval '24 hours') >= 3 then
    insert into public.office_find_flags (profile_id) values (v_uid)
    on conflict (profile_id) do update set last_flagged_at = now();
  end if;
  return v_result;
end $$;

-- ── 7) 운영자 몫 옮기기 (INV-C11) ─────────────────────────────────

create table if not exists public.office_share_moves (
  id bigint generated always as identity primary key,
  unmatched_id uuid not null references public.office_unmatched (id),
  parcel_id uuid not null references public.office_parcels (id),
  from_share_id uuid not null references public.revgift_shares (id),
  to_share_id uuid not null references public.revgift_shares (id),
  moved_by uuid not null references public.profiles (id),
  moved_at timestamptz not null default now()
);
alter table public.office_share_moves enable row level security;
revoke all on public.office_share_moves from public, anon, authenticated;
create or replace trigger office_share_moves_no_update before update on public.office_share_moves
  for each row execute function public.append_only_log();
create or replace trigger office_share_moves_no_delete before delete on public.office_share_moves
  for each row execute function public.append_only_log();

-- 6자리 지킴이 — 20261007000006 과 같고, 몫 옮기기(admin_move_held_share)가 이 처리 안에서 켠 표시가 있을 때만
-- 사용됨 → 유효(사용 시각·첫 상자 칸을 비움)를 받는다. 다른 길로는 지금처럼 유효 → 사용됨·무효만.
create or replace function public.inbound_codes_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_restore boolean := coalesce(current_setting('fankkuk.share_move_restore', true), '') = 'on'
                       and old.state = 'used' and new.state = 'valid' and old.share_id is not null
                       and new.used_at is null and new.voided_at is null;
begin
  if (new.code, new.box_id, new.share_id, new.issued_at) is distinct from (old.code, old.box_id, old.share_id, old.issued_at) then
    raise exception '받는 주소 6자리의 값·상자는 바꿀 수 없다' using errcode = '55000';
  end if;
  if v_restore then
    return new;
  end if;
  if new.state <> old.state and not (old.state = 'valid' and new.state in ('used', 'void')) then
    raise exception '받는 주소 6자리 상태를 % 에서 % 로 바꿀 수 없다', old.state, new.state using errcode = '55000';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.voided_at is not null and new.voided_at is distinct from old.voided_at) then
    raise exception '받는 주소 6자리의 사용·무효 시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  if old.kept_at is not null and new.kept_at is distinct from old.kept_at then
    raise exception '살려 둔 시각은 바꿀 수 없다' using errcode = '55000';
  end if;
  if old.kept_at is null and new.kept_at is not null and (old.state <> 'valid' or new.state <> 'valid') then
    raise exception '살려 둔 시각은 유효한 6자리에만 적는다' using errcode = '55000';
  end if;
  return new;
end $$;

-- 옮길 곳 후보: 그 보류 상자를 찾기로 이은 몫의 보낸 크리에이터가 보낸 결제 끝·입고 전 몫. 운영자에게만(아니면 0줄)
create or replace function public.admin_share_move_candidates(p_id uuid)
returns table (share_id uuid, fan_nickname text, tier text, order_no text)
language sql stable security definer set search_path = ''
as $$
  select s.id, fp.nickname, s.tier::text, s.order_no
  from public.office_unmatched u
  join public.office_parcels x on x.id = u.matched_parcel_id
  join public.revgift_shares cur on cur.id = x.share_id
  join public.revgift_sends cd on cd.id = cur.send_id
  join public.revgift_sends d on d.sender_id = cd.sender_id
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles fp on fp.id = s.fan_id
  where coalesce(public.is_operator(), false) and u.id = p_id
    and public.revgift_share_before_inbound(s.id, cd.sender_id)
  order by d.settled_at, s.seq
  limit 200;
$$;

-- 옮기기: 돌려주는 값 'moved'. 오류 꼴 42501 운영자 아님 · 22023 입력 꼴 · P0002 없는 보류 상자 · 55000 옮길 수 없는 상자(찾기로 이은 몫 상자가 아니거나 검수 완료 뒤)
-- · P0047 후보 아님(다른 크리에이터의 몫·이미 입고·닫힘) · 40001 잠그는 사이 상자 연결이 바뀜(다시 하면 된다).
-- 잠금: 송장번호 잠금(찾기와 같다) → 두 몫 줄(id 순) → 두 6자리 줄 → 옮길 곳의 대기 줄 → 상자 작업 줄 → 보류 줄(INV-W12 순서 — 몫 줄이 상자 작업 줄보다 먼저)
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
  if u.matched_parcel_id is distinct from v.id or v.state not in ('received', 'labeled') or v.hold_reason is not null then
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
     and exists (select 1 from public.revgift_shares s where s.id = v_from and s.cancelled_at is null and s.returned_at is null) then
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

-- ── 8) 역조공 받기 알림 (INV-N20) ───────────────────────────────

alter table public.notification_outbox add column if not exists share_id uuid references public.revgift_shares (id) on delete cascade;

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'box_no_code', 'revgift_offer'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'box_no_code', 'revgift_offer'
]));
-- 몫을 가리키는 종류는 역조공 받기 하나 — 몫마다·차례마다 한 번이 줄 이름(notification_outbox_once)으로 지켜진다
alter table public.notification_outbox drop constraint if exists notification_outbox_share_kind;
alter table public.notification_outbox add constraint notification_outbox_share_kind check ((kind = 'revgift_offer') = (share_id is not null));
alter table public.notification_outbox drop constraint if exists notification_outbox_order_kind;
alter table public.notification_outbox add constraint notification_outbox_order_kind check (order_id is not null or kind in ('box_arrived', 'revgift_offer'));
-- 재알림 차례: 승인 요청은 1~3, 역조공 받기는 1~2(결제 완료 · 72시간), 나머지는 1
alter table public.notification_outbox drop constraint if exists notification_outbox_check1;
alter table public.notification_outbox drop constraint if exists notification_outbox_round_check;
alter table public.notification_outbox add constraint notification_outbox_round_check check (
  round between 1 and 3 and (kind = 'approval_request' or (kind = 'revgift_offer' and round <= 2) or round = 1)
);
drop index if exists public.notification_outbox_once;
create unique index notification_outbox_once
  on public.notification_outbox (kind, order_id, approval_request_id, parcel_id, unmatched_id, share_id, round, account_id, channel) nulls not distinct;

-- 20261016000007 의 지킴이와 같고, 줄 이름에 몫 칸을 더했다.
create or replace function public.notification_outbox_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.attempts <> 0 then
      raise exception '발송 대기 줄은 대기로만 생긴다' using errcode = '23514';
    end if;
  else
    if old.status in ('sent', 'failed', 'skipped') then
      raise exception '끝난 발송 줄은 바꿀 수 없다' using errcode = '55000';
    end if;
    if (new.kind, new.order_id, new.approval_request_id, new.parcel_id, new.unmatched_id, new.share_id, new.round, new.account_id, new.channel, new.event_at, new.created_at)
       is distinct from (old.kind, old.order_id, old.approval_request_id, old.parcel_id, old.unmatched_id, old.share_id, old.round, old.account_id, old.channel, old.event_at, old.created_at) then
      raise exception '발송 줄의 이름은 바꿀 수 없다' using errcode = '55000';
    end if;
    if not (
      (old.status = 'pending' and new.status in ('pending', 'sending', 'skipped', 'failed'))
      or (old.status = 'sending' and new.status in ('pending', 'sent', 'failed', 'skipped'))
    ) then
      raise exception '발송 줄 상태를 % 에서 % 로 바꿀 수 없다', old.status, new.status using errcode = '55000';
    end if;
  end if;
  if new.fake and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_notifications') then
    raise exception '가짜 발송 표시는 이 DB 에서 받지 않는다' using errcode = '42501';
  end if;
  return new;
end $$;

-- notifications INV-N6 표: 끌 수 없음 12종(역조공 받기 — 7일 안에 정하지 않으면 받지 않음이 된다, INV-N20)
create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_kind = any (array[
    'approval_request', 'hold', 'creator_check', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled', 'box_no_code', 'revgift_offer'
  ]), false);
$$;

-- 역조공 받기 줄: 몫 하나 → 그 몫의 받는 팬에게, 차례 p_round. 이메일 줄은 늘, 승인된 카카오 템플릿이 있으면 카카오 줄도(INV-N7). 넣은 줄 수
create or replace function public.notification_enqueue_share(p_share_id uuid, p_round smallint)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notification_outbox (kind, share_id, round, account_id, channel, event_at)
  select 'revgift_offer', s.id, p_round, s.fan_id, ch.channel, now()
  from public.revgift_shares s
  cross join (values ('email'), ('kakao')) as ch (channel)
  where s.id = p_share_id
    and (ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'revgift_offer'))
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 20261007000006 과 같고, 결제가 끝나는 처리에서 받기 대기 몫마다 역조공 받기 1차 줄을 넣는다(INV-N20)
create or replace function public.settle_revgift_payment(p_toss_order_id text, p_status public.payment_status, p_payment_key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_send_id uuid;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'done 또는 failed 만' using errcode = '22023';
  end if;
  update public.revgift_sends
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = case when p_status = 'done' then now() end
  where toss_order_id = p_toss_order_id and status in ('pending', 'confirming')
  returning id into v_send_id;
  if v_send_id is null then
    return false;
  end if;
  if p_status = 'done' then
    perform public.inbound_issue_for_send(v_send_id);
    perform public.notification_enqueue_share(s.id, 1::smallint)
    from public.revgift_shares s
    where s.send_id = v_send_id and s.reply = 'waiting' and s.cancelled_at is null;
  end if;
  return true;
end $$;

-- 20261006000011 과 같고, 결제 완료 + 72시간이 된 받기 대기 몫에 역조공 받기 2차 줄(INV-N20 — 승인 요청과 같은 시계). 줄 이름이 같아 두 번 돌려도 한 번
create or replace function public.notification_enqueue_due()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  v_shares integer;
begin
  select coalesce(sum(public.notification_enqueue('approval_request', o.id, r.id, 3::smallint, c.profile_id, now())), 0)::integer
  into v_count
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  where r.status = 'waiting'
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.registered_at <= now() - interval '72 hours';
  select coalesce(sum(public.notification_enqueue_share(s.id, 2::smallint)), 0)::integer
  into v_shares
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  where d.status = 'done' and s.reply = 'waiting' and s.cancelled_at is null
    and d.settled_at <= now() - interval '72 hours'
    and now() < public.revgift_deadline(d.settled_at);
  return v_count + v_shares;
end $$;

-- 꺼내기 — 20261012000011 과 같고, 역조공 받기 줄은 몫이 아직 받기 대기(결제 끝·취소 안 됨·기한 전)가 아니면 건너뜀(share_not_waiting),
-- 몫 주문번호와 보낸 크리에이터 공개 이름(sender_name — INV-N20 본문의 이름 하나)을 돌려준다. 돌려주는 칸이 바뀌어 지우고 다시 만든다.
drop function if exists public.notification_claim(integer);
create function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid, kind text, channel text, round smallint, order_no text, nickname text, auto_reject_at timestamptz, undelivered_reason text,
  must_deliver boolean, attempts integer, claimed_at timestamptz, sender_name text
)
language plpgsql security definer set search_path = ''
as $function$
begin
  return query
  with picked as (
    select n.id,
           case
             when n.kind = 'approval_request' and not exists (
               select 1 from public.approval_requests r where r.id = n.approval_request_id and r.status = 'waiting') then 'request_not_waiting'
             when n.kind = 'revgift_offer' and not exists (
               select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
               where s.id = n.share_id and s.reply = 'waiting' and s.cancelled_at is null and d.status = 'done'
                 and now() < public.revgift_deadline(d.settled_at)) then 'share_not_waiting'
           end as closed_code,
           (now() >= n.event_at + interval '24 hours') as expired
    from public.notification_outbox n
    where n.status = 'pending' and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of n skip locked
  ), expired as (
    update public.notification_outbox n
    set status = 'failed', error_code = 'expired', finished_at = now()
    from picked p
    where n.id = p.id and p.expired and n.status = 'pending'
    returning n.id
  ), skipped as (
    update public.notification_outbox n
    set status = 'skipped', error_code = p.closed_code, finished_at = now()
    from picked p
    where n.id = p.id and not p.expired and p.closed_code is not null and n.status = 'pending'
    returning n.id
  ), claimed as (
    update public.notification_outbox n
    set status = 'sending', claimed_at = clock_timestamp()
    from picked p
    where n.id = p.id and not p.expired and p.closed_code is null and n.status = 'pending'
    returning n.*
  )
  select c.id, c.kind, c.channel, c.round, coalesce(o.order_no, rs.order_no, ss.order_no), pr.nickname,
         case when c.kind = 'approval_request' then o.registered_at + interval '168 hours' end,
         case when c.kind = 'gift_undelivered' then (case when o.status = 'expired' then 'expired' else 'declined' end) end,
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at,
         -- 역조공 받기만 — 보낸 크리에이터의 공개 이름(크리에이터 줄이 없으면 닉네임). 다른 종류는 비어 있다(INV-N1)
         case when c.kind = 'revgift_offer' then coalesce(cr.name, sp.nickname) end
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = c.share_id
  left join public.revgift_sends sd on sd.id = ss.send_id
  left join public.profiles sp on sp.id = sd.sender_id
  left join public.creators cr on cr.profile_id = sd.sender_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $function$;

-- 운영자 발송 실패 목록 — 20261006000010 과 같고, 역조공 받기 줄의 몫 주문번호도 보인다
create or replace function public.notification_failures(p_limit integer default 100)
returns table (kind text, order_no text, round smallint, channel text, status text, attempts integer, error_code text, finished_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 볼 수 있다' using errcode = '42501';
  end if;
  return query
  select n.kind, coalesce(o.order_no, rs.order_no, ss.order_no), n.round, n.channel, n.status, n.attempts, n.error_code, n.finished_at
  from public.notification_outbox n
  left join public.orders o on o.id = n.order_id
  left join public.office_parcels pp on pp.id = n.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = n.share_id
  where n.status in ('failed', 'skipped')
  order by n.finished_at desc, n.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end $function$;

-- ── 실행 권한 ────────────────────────────────────────────────

revoke all on function public.creator_check_parcel_of(text, integer) from public, anon, authenticated;
revoke all on function public.creator_check_blocked(public.office_parcels, public.office_creator_checks) from public, anon, authenticated;
revoke all on function public.revgift_share_before_inbound(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revgift_share_late(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notification_enqueue_share(uuid, smallint) from public, anon, authenticated, service_role;
revoke all on function public.choose_creator_check(text, integer, text) from public, anon;
revoke all on function public.cancel_creator_check(text, integer) from public, anon;
revoke all on function public.office_process_creator_check(text, text) from public, anon;
revoke all on function public.admin_creator_check_choices() from public, anon;
revoke all on function public.my_creator_action_items() from public, anon;
revoke all on function public.my_revgift_find_candidates() from public, anon;
revoke all on function public.find_held_parcel(uuid, uuid, text, text) from public, anon;
revoke all on function public.admin_share_move_candidates(uuid) from public, anon;
revoke all on function public.admin_move_held_share(uuid, uuid) from public, anon;
revoke all on function public.settle_revgift_payment(text, public.payment_status, text) from public, anon, authenticated;
revoke all on function public.notification_enqueue_due() from public, anon, authenticated;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
grant execute on function public.choose_creator_check(text, integer, text) to authenticated;
grant execute on function public.cancel_creator_check(text, integer) to authenticated;
grant execute on function public.office_process_creator_check(text, text) to authenticated;
grant execute on function public.admin_creator_check_choices() to authenticated;
grant execute on function public.my_creator_action_items() to authenticated;
grant execute on function public.my_revgift_find_candidates() to authenticated;
grant execute on function public.find_held_parcel(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_share_move_candidates(uuid) to authenticated;
grant execute on function public.admin_move_held_share(uuid, uuid) to authenticated;
grant execute on function public.settle_revgift_payment(text, public.payment_status, text) to service_role;
grant execute on function public.notification_enqueue_due() to service_role;
grant execute on function public.notification_claim(integer) to service_role;
