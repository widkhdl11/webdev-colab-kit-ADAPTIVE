-- 크리에이터 확인 리뷰 반영 (2026-10-12 (2) 문제집 D3 ② 리뷰). 20261012000011 의 함수 셋을 create or replace 하고 표 제약 둘을 고친다.
-- 스펙: office-workflow INV-W4·W6, notifications INV-N4·N6.
--
-- 1) 「확인할 선물」(creator_check) 알림은 상자마다 한 번 — 줄 이름(notification_outbox_once)에 상자 칸이 들어가도록 상자를 가리킨다.
--    전에는 주문 단위라 같은 주문의 두 번째 확인 대기 상자에는 알림이 가지 않았다(직원 화면은 「알림이 갔어요」라고 보였다).
--    상자를 가리키는 종류 목록(notification_outbox_parcel_kind)에 creator_check 를 더한다. 이 제약을 걸기 전 로컬 DB 의
--    creator_check 줄은 0건이었다(2026-10-12 셈) — 상자 칸이 빈 옛 줄이 있으면 제약 추가가 실패하므로 적용 전에 센다.
-- 2) 검수 기록 표 검사 office_inspections_tracker_verdict_outcome — 「추적기」면 추적기 반송(hold)만, 「추적기 아님」이면 크리에이터 확인(confirm)·반송(return)만.
--    전에는 추적기 아님 + 통과(pass)를 표가 받았다(함수만 막았다). 이 제약을 걸기 전 로컬 DB 의 판정 있는 기록은 0건이었다(2026-10-12 셈).
-- 3) office_scan_inspect — 20261012000011 과 같고, creator_check 알림 줄을 상자 칸과 함께 넣는다(1).
-- 4) answer_creator_check — 20261012000011 과 같고, 자동 처리가 기한 지남으로 닫은 줄에 답하면 already 대신 expired.
-- 5) my_creator_checks — 20261012000011 과 같고, 나갈 수 없게 된 상자(office_parcel_dead)는 목록에서 뺀다 — 답하면 closed 가 나는 상자다.
--
-- 다시 적용해도 결과가 같다(제약은 drop if exists 뒤 add, 함수는 create or replace).

-- ── 1) 상자를 가리키는 알림 종류 ──────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_parcel_kind;
alter table public.notification_outbox add constraint notification_outbox_parcel_kind
  check ((kind = any (array['box_arrived', 'difference_due', 'gift_reply', 'gift_received', 'creator_check'])) = (parcel_id is not null));

-- ── 2) 검수 기록 표 검사 ──────────────────────────

alter table public.office_inspections drop constraint if exists office_inspections_tracker_verdict_outcome;
alter table public.office_inspections
  add constraint office_inspections_tracker_verdict_outcome check (
    tracker_verdict is null
    or (tracker_verdict = 'tracker' and outcome = 'hold')
    or (tracker_verdict = 'not_tracker' and outcome in ('confirm', 'return'))
  );

-- ── 3) 검수 완료 스캔 ─────────────────────────────

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
  -- 추적기 반송(hold)은 보관 없이 바로 반송 대기(INV-W4, 2026-10-12 D2).
  -- 크리에이터 확인(confirm)은 확인 대기(held) — 나갈 수 없는 상자면 묻지 않고 반송 대기(2026-10-12 (2) D3 ②)
  v_next := case
    when v_outcome in ('hold', 'return') or public.office_parcel_dead(v) then 'return_waiting'
    when v_outcome = 'confirm' then 'held'
    else 'inspected'
  end;
  -- 받으면 그대로 출고되므로 확인 대기도 실측 기록이 있어야 한다(INV-W4 S4d)
  if v_next in ('inspected', 'held') and v.box_id is not null
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
  elsif v_next = 'held' then
    insert into public.office_creator_checks (parcel_id) values (v.id) on conflict (parcel_id) do nothing;
    -- INV-N6: 그 주문의 크리에이터 계정에게 「확인할 선물」 — 상자마다 한 번(줄 이름에 이 상자가 들어간다). 같은 주문의 두 번째 상자도
    -- 따로 묻는 것이라 알림도 따로 간다. 보낸 팬·검출 내용은 본문 틀에 칸이 없다(INV-N1). 이메일 줄은 늘, 승인된 카카오 템플릿이 있으면 카카오 줄도(INV-N7)
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select 'creator_check', o.id, v.id, 1, c.profile_id, ch.channel, now()
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.creators c on c.id = o.creator_id
    cross join (values ('email'), ('kakao')) as ch (channel)
    where b.id = v.box_id and c.profile_id is not null
      and (ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'creator_check'))
    on conflict do nothing;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;

-- ── 4) 크리에이터의 답 ────────────────────────────

create or replace function public.answer_creator_check(p_order_no text, p_box_seq integer, p_answer text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_parcel uuid;
  v public.office_parcels;
  v_check public.office_creator_checks;
begin
  if p_answer is null or p_answer not in ('accept', 'return') then
    raise exception '받기 또는 돌려보내기' using errcode = '22023';
  end if;
  -- 그 주문의 크리에이터 계정일 때만. 아니면 없는 상자와 같은 답
  select x.id into v_parcel
  from public.orders o
  join public.creators c on c.id = o.creator_id
  join public.profiles me on me.id = c.profile_id
  join public.boxes b on b.order_id = o.id
  join public.office_parcels x on x.box_id = b.id
  join public.office_creator_checks k on k.parcel_id = x.id
  where o.order_no = p_order_no and b.seq = p_box_seq and c.profile_id = auth.uid() and me.role = 'creator';
  if v_parcel is null then
    return 'not_found';
  end if;

  -- 상자 → 승인 요청 → 주문 → 사무소 상자 줄(INV-W12), 그다음 확인 줄
  v := public.office_lock_parcel(v_parcel);
  select * into v_check from public.office_creator_checks k where k.parcel_id = v.id for update;
  -- 자동 처리가 기한 지남으로 닫은 줄은 「이미 답함」이 아니라 「기한 지남」(크리에이터가 답한 적이 없다)
  if v_check.answer = 'expired' then
    return 'expired';
  end if;
  if v_check.answer is not null then
    return 'already';
  end if;
  if v.state <> 'held' or public.office_parcel_dead(v) then
    return 'closed';
  end if;
  -- 기한(검수 완료 + 168시간)이 지났으면 자동 처리 전이라도 받지 않는다(INV-W6)
  if now() >= v.inspected_at + interval '168 hours' then
    return 'expired';
  end if;

  update public.office_creator_checks
  set answer = p_answer, answered_at = now(), answered_by = auth.uid()
  where parcel_id = v.id;
  update public.office_parcels
  set state = case when p_answer = 'accept' then 'inspected'::public.office_state else 'return_waiting'::public.office_state end
  where id = v.id;
  if p_answer = 'return' then
    -- INV-N13: 보낸 팬에게 「돌려보낼 상자」 — 추적기 반송과 같은 종류·같은 본문(크리에이터가 돌려보냈다는 사실은 쓰지 않는다)
    perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return case when p_answer = 'accept' then 'accepted' else 'returned' end;
end $$;

revoke all on function public.answer_creator_check(text, integer, text) from public, anon;
grant execute on function public.answer_creator_check(text, integer, text) to authenticated;

-- ── 5) 크리에이터 읽기 ────────────────────────────

create or replace function public.my_creator_checks()
returns table (
  order_no text,
  box_seq integer,
  sender_nickname text,
  item_kind text,
  bluetooth boolean,
  rf boolean,
  asked_at timestamptz,
  due_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select o.order_no,
         b.seq::integer,
         f.nickname,
         o.item_kind,
         coalesce(i.bluetooth = 'found', false),
         coalesce(i.rf = 'found', false),
         k.asked_at,
         x.inspected_at + interval '168 hours'
  from public.office_creator_checks k
  join public.office_parcels x on x.id = k.parcel_id
  join public.boxes b on b.id = x.box_id
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles me on me.id = c.profile_id
  join public.profiles f on f.id = o.fan_id
  left join lateral (
    select ii.bluetooth, ii.rf from public.office_inspections ii
    where ii.parcel_id = x.id order by ii.at desc, ii.id desc limit 1
  ) i on true
  where c.profile_id = auth.uid()
    and me.role = 'creator'
    -- 답하면(받기 → 검수 완료, 돌려보내기·기한 지남 → 반송 대기) 상자가 확인 대기를 떠나므로 상태만 보면 된다
    and x.state = 'held'
    and o.status not in ('rejected', 'expired', 'canceled')
    -- 나갈 수 없게 된 상자(차액 기한 지남 등)는 답을 받지 않는다(answer_creator_check 의 closed) — 목록에도 내지 않는다
    and not public.office_parcel_dead(x)
  order by x.inspected_at asc, b.seq asc;
$$;

revoke all on function public.my_creator_checks() from public, anon;
grant execute on function public.my_creator_checks() to authenticated;
