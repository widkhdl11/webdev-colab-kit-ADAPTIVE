-- 추적기 아님 블루투스·RF 상자는 크리에이터에게 받을지 묻는다 · 거절 알림 문구 갈래 (2026-10-12 (2) 문제집 D3 ②·D11).
-- 스펙: office-workflow INV-W3·W4·W6, notifications INV-N1·N6·N13·N17, decline-block INV-D5, payment INV-M9·M12.
--
-- 1) 검수 결론에 confirm(크리에이터 확인)을 더한다. 블루투스·RF 반응이 있고 직원이 「추적기 아님」으로 판정한 팬 선물은 결론이
--    「크리에이터 확인」 또는 「반송」뿐이다(바로 통과하지 않는다). confirm 은 「추적기 아님」 판정이 있을 때만(표 검사).
-- 2) office_creator_checks — 크리에이터 확인 한 줄(상자마다 하나). 답은 받기(accept)·돌려보내기(return)·기한 지남(expired),
--    답 전에는 비어 있다. 주문이 끝나 질문이 닫힌 상자는 답이 빈 채로 남는다. 표는 함수로만 읽고 쓴다.
-- 3) 알림 종류 creator_check(크리에이터 「확인할 선물」) — 끌 수 없는 알림(INV-N6 표). 본문에는 상대 닉네임·검출 내용 칸이 없다(INV-N1).
-- 4) office_record_inspection — 20261012000006 과 같고, 「추적기 아님」이면 결론이 confirm·return 만, confirm 은 「추적기 아님」일 때만.
-- 5) office_scan_inspect — 20261012000006 과 같고, confirm 이면 상자 상태를 held(옛 「보관」 값 — 이제 「크리에이터 확인 대기」)로 두고
--    확인 줄과 크리에이터 creator_check 알림(주문 단위 한 번)을 같은 처리에서 넣는다. 받으면 그대로 출고되므로 실측 기록이 있어야 한다.
--    주문이 이미 끝났거나(거절·반려·취소) 나갈 수 없는 상자(중형 초과·차액 기한 지남)면 묻지 않고 반송 대기로 간다(다른 결론과 같다).
-- 6) answer_creator_check(주문번호, 상자 순번, 답) — 그 주문의 크리에이터 계정만. 받기 → 검수 완료, 돌려보내기 → 반송 대기 + 팬 hold_fan.
--    결과: accepted · returned · already(이미 답함) · expired(검수 완료 + 168시간 지남 — 자동 처리 전이라도) · closed(주문이 끝났거나
--    상자가 더 확인 대기가 아님) · not_found(남의 주문·없는 상자·확인 줄 없음). 모르는 답은 22023.
--    잠금은 상자 → 승인 요청 → 주문 → 사무소 상자 줄(INV-W12, office_lock_parcel) 다음 확인 줄.
-- 7) my_creator_checks() — 로그인한 크리에이터의 답을 기다리는 상자만: 주문번호·상자 순번·보낸 팬 닉네임·품목·블루투스/RF 반응·물은 시각·기한.
-- 8) office_sync_order — 20261008000009 와 같고, held(확인 대기)를 「라벨 부착」 단계(2)로 센다. 그 상자가 답을 기다리는 동안 주문은
--    검수 단계에 멈추고, 검수 결과도 비어 있다. 다른 상자의 출고는 상자마다 정해지므로(office_parcel_shippable) 승인된 주문의 나머지 상자는
--    그대로 출고할 수 있다 — 금속 반송과 같다. 전에는 held 를 세지 않아 다른 상자가 출고되면 주문이 출고로 끝나 돌려보낸 상자의 환불이 사라졌다.
-- 9) office_run_expiry — 20261010000003 과 같고, ⑤ 단계(held + 168시간)가 확인 줄에 「기한 지남」을 적고 팬 hold_fan 을 넣는다(돌려보내기와 같다).
--    끝난 주문의 held 상자는 ⑤ 단계에서 빼고, 「나갈 수 없게 된 상자」 단계가 검수 완료와 함께 반송 대기로 넘긴다(답은 빈 채, 팬 알림 없음).
-- 10) return_inspected_boxes(거절)·admin_cancel_received_gift(입고 뒤 취소) — held 상자도 검수 완료 상자처럼 바로 반송 대기로.
-- 11) refund_due_of_payment — 20261010000003 과 같고, 끝난 주문의 상자 몫에서 「검수에 걸림(0)」에 크리에이터가 돌려보냈거나 기한이 지난 상자를 더한다.
--     새 환불 규칙이 아니라 금속·추적기 반송과 같은 검수 불합격 줄이다. 진행 중 주문은 주문의 검수 결과(반송)로 이미 같은 줄을 탄다.
-- 12) prepare_difference_payment·claim_difference_payment — 20261006000014·20261008000015 와 같고, held 를 막는 상태에서 뺐다.
--     확인 대기 상자는 받으면 출고되는 상자라 차액을 낼 수 있어야 한다. 낸 뒤 돌려보내면 금속 반송과 같은 돈 처리다.
-- 13) notification_claim — 20261012000004 와 같고, 돌려주는 칸에 undelivered_reason 을 더한다. gift_undelivered 줄일 때만
--     주문 상태로 정한다: 7일 반려(expired)면 'expired', 거절(rejected — 직접·차단·차단 뒤 결제 모두)이면 'declined'.
--     차단 표시(rejected_by_block)는 읽지 않는다 — 차단 거절과 직접 거절은 같은 값이다(decline-block INV-D5, notifications INV-N2).
--     돌려주는 칸이 바뀌어 함수를 지우고 다시 만든다(권한도 다시 준다).
--
-- 연락처 함수(supabase/manual 0016)는 notification_kind_must_deliver 를 읽으므로 creator_check 를 위해 따로 고칠 것이 없다.
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 제약은 drop if exists 뒤 add, 함수는 create or replace — 13 은 drop if exists 뒤 create).

-- ── 1) 검수 결론 ──────────────────────────────────

alter table public.office_inspections drop constraint if exists office_inspections_outcome_check;
alter table public.office_inspections
  add constraint office_inspections_outcome_check check (outcome in ('pass', 'return', 'hold', 'confirm'));
alter table public.office_inspections drop constraint if exists office_inspections_confirm_verdict;
alter table public.office_inspections
  -- 판정 칸이 비면 비교가 NULL 이라 표 검사를 통과해 버린다 — coalesce 로 거짓을 만든다
  add constraint office_inspections_confirm_verdict check (outcome <> 'confirm' or coalesce(tracker_verdict = 'not_tracker', false));

-- ── 2) 크리에이터 확인 줄 ─────────────────────────

create table if not exists public.office_creator_checks (
  parcel_id uuid primary key references public.office_parcels (id),
  asked_at timestamptz not null default now(),
  answer text check (answer in ('accept', 'return', 'expired')),
  answered_at timestamptz,
  -- 크리에이터가 답했을 때만. 기한 지남은 자동 처리라 비어 있다
  answered_by uuid references public.profiles (id),
  constraint office_creator_checks_answered check ((answer is null) = (answered_at is null)),
  constraint office_creator_checks_answered_by check (answered_by is null or answer in ('accept', 'return'))
);
alter table public.office_creator_checks enable row level security;
revoke all on public.office_creator_checks from anon, authenticated;

-- ── 3) 알림 종류 ──────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check'
]));

create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- notifications INV-N6 표: 끌 수 없음 10종. 모르는 종류·빈 값은 거짓.
  select coalesce(p_kind = any (array[
    'approval_request', 'hold', 'creator_check', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled'
  ]), false);
$$;

-- ── 4) 검수 기록 ──────────────────────────────────

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
     or v_outcome is null or v_outcome not in ('pass', 'return', 'hold', 'confirm')
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
    -- 추적기 아님이면 크리에이터 확인 또는 반송 — 바로 통과하지 않는다. 크리에이터 확인은 추적기 아님일 때만(2026-10-12 (2) D3 ②)
    if coalesce(v_verdict = 'not_tracker', false) then
      if v_outcome not in ('confirm', 'return') then
        raise exception '추적기 아님은 크리에이터 확인 또는 반송' using errcode = '22023';
      end if;
    elsif v_outcome = 'confirm' then
      raise exception '크리에이터 확인은 추적기 아님으로 판정했을 때만' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, bluetooth, rf, metal, tracker_verdict, outcome)
    values (v.id, auth.uid(), p_result ->> 'bluetooth', p_result ->> 'rf', p_result ->> 'metal', v_verdict, v_outcome);
  else
    -- 역조공: 겉면·금지 물품만. 하나라도 걸리면 반송, 추적기 반송·크리에이터 확인·판정은 없다.
    if v_keys is distinct from array['outcome', 'prohibited', 'surface'] then
      raise exception '역조공 검수는 겉면·금지 물품이다' using errcode = '22023';
    end if;
    v_found := p_result ->> 'surface' = 'found' or p_result ->> 'prohibited' = 'found';
    if v_outcome in ('hold', 'confirm') or (v_found and v_outcome <> 'return') then
      raise exception '걸리면 반송이다' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, surface, prohibited, outcome)
    values (v.id, auth.uid(), p_result ->> 'surface', p_result ->> 'prohibited', v_outcome);
  end if;
end $$;

-- ── 5) 검수 완료 스캔 ─────────────────────────────

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
    -- INV-N6: 그 주문의 크리에이터 계정에게 「확인할 선물」 — 주문 단위로 한 번. 보낸 팬·검출 내용은 본문 틀에 칸이 없다(INV-N1)
    perform public.notification_enqueue('creator_check', o.id, null, 1::smallint, c.profile_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id join public.creators c on c.id = o.creator_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;

-- ── 6) 크리에이터의 답 ────────────────────────────

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

-- ── 7) 크리에이터 읽기 ────────────────────────────

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
  order by x.inspected_at asc, b.seq asc;
$$;

revoke all on function public.my_creator_checks() from public, anon;
grant execute on function public.my_creator_checks() to authenticated;

-- ── 8~12) 기존 함수 (위 머리말의 번호) ────────────

-- 8) 주문 집계
CREATE OR REPLACE FUNCTION public.office_sync_order(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_min integer;
  v_now integer;
  v_returned boolean;
  v_old public.orders;
  v_new public.orders;
  v_old_idx integer;
  v_new_idx integer;
  v_creator_account uuid;
begin
  select * into v_old from public.orders o where o.id = p_order_id for update;

  -- 닫힌 상자(도착하지 않음, INV-W10)는 세지 않는다 — 그 상자를 기다리느라 남은 상자가 멈추지 않게.
  -- 크리에이터 확인 대기(held)는 「라벨 부착」(2)으로 센다 — 답이 나기 전에는 주문의 검수가 끝나지 않는다(2026-10-12 (2) D3 ②)
  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then 2 when 'returned' then null
           else 0 end) filter (where p.state is null or p.state <> 'returned'), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned'))
    into v_min, v_returned
  from public.boxes b left join public.office_parcels p on p.box_id = b.id
  where b.order_id = p_order_id and b.missing_at is null;

  select array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], o.status::text) - 1
    into v_now
  from public.orders o where o.id = p_order_id;
  v_min := greatest(v_min, coalesce(v_now, 0));

  update public.orders o
  set received_at = (select min(p.received_at) from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id)
  where o.id = p_order_id and o.received_at is null
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.received_at is not null);

  update public.orders o
  set status = (array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'])[v_min + 1]::public.order_status,
      received_at = case when v_min >= 1 then coalesce(o.received_at, now()) else o.received_at end,
      inspected_at = case when v_min >= 3 then coalesce(o.inspected_at, now()) else o.inspected_at end,
      inspection_result = case when v_min >= 3 then (case when coalesce(v_returned, false) then 'returned' else 'passed' end)
                               else o.inspection_result end,
      shipped_at = case when v_min >= 5 then coalesce(o.shipped_at, now()) else o.shipped_at end
  where o.id = p_order_id
    and o.status in ('registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped');

  -- ── 알림 (notifications INV-N3·N4·N8) ──
  select * into v_new from public.orders o where o.id = p_order_id;
  if v_new.id is null then
    return;
  end if;

  -- 상자가 처음 입고됨 + 승인 요청이 아직 대기 → 승인 요청 2차(크리에이터)
  if v_old.received_at is null and v_new.received_at is not null then
    select c.profile_id into v_creator_account from public.creators c where c.id = v_new.creator_id;
    perform public.notification_enqueue('approval_request', v_new.id, r.id, 2::smallint, v_creator_account, now())
    from public.approval_requests r
    where r.order_id = v_new.id and r.status = 'waiting';
  end if;

  -- 주문 상태가 입고·검수·출고 단계를 넘음 → 팬. 상태는 줄지 않으므로 넘은 단계마다 한 번.
  v_old_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_old.status::text) - 1, -1);
  v_new_idx := coalesce(array_position(array['registered', 'received', 'labeled', 'inspected', 'label_printed', 'shipped'], v_new.status::text) - 1, -1);
  if v_old_idx >= 0 and v_new_idx > v_old_idx then
    if v_old_idx < 1 and v_new_idx >= 1 then
      perform public.notification_enqueue('arrived', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 3 and v_new_idx >= 3 then
      perform public.notification_enqueue('inspected', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
    if v_old_idx < 5 and v_new_idx >= 5 then
      perform public.notification_enqueue('shipped', v_new.id, null, 1::smallint, v_new.fan_id, now());
    end if;
  end if;
end $function$;

-- 9) 자동 처리
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
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 0a) 24시간 지난 팬 선물 결제 대기(payment INV-M15): 결제 대기인 줄만 실패로 닫는다 — 조건부 갱신 한 문장.
  --     결제 확정 시작(claim_payment: 결제 대기 → 승인 중)도 같은 줄의 조건부 갱신이라, 겹치면 먼저 잡은 쪽만 반영되고
  --     뒤에 온 쪽은 바뀐 상태를 다시 보고 아무것도 하지 않는다. 승인 중·완료·실패 줄은 건드리지 않는다. 주문 줄은 지우지 않는다.
  update public.payments p
  set status = 'failed', settled_at = now()
  where p.kind = 'initial' and p.status = 'pending'
    and p.created_at <= now() - interval '24 hours'
    and (p_order_no is null or p.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_pending_gifts = row_count;

  -- 0b) 24시간 지난 역조공 결제 대기(reverse-gift INV-R15): 같은 규칙. 주문번호를 주면 그 몫이 든 보내기만.
  --     보내기의 결제 완료 시각은 받기 기한의 시작이라 결제 완료에만 둔다(표 제약) — 닫을 때는 상태만 바꾼다.
  update public.revgift_sends d
  set status = 'failed'
  where d.status = 'pending'
    and d.created_at <= now() - interval '24 hours'
    and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no));
  get diagnostics v_pending_revgifts = row_count;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  --    주문마다 상자 → 승인 요청 → 주문 순으로 잠그고(INV-W12) 조건을 다시 본다 — 한꺼번에 주문을 잠그면
  --    뒤 단계(보관 상자 넘기기)가 같은 주문의 상자를 주문 뒤에 잠가 QR 처리와 엇갈린다.
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

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13): 차액 줄에 기한 지남을 적는다. 결제 중(confirming)·완료 줄은 건드리지 않는다.
  --    그 주문의 상자는 나갈 수 없게 되고(office_parcel_dead), 아래에서 검수 완료 상자가 반송 대기로 간다.
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
    -- 몫 하나만: expire_revgifts 와 같은 조건(결제 완료 + 168시간, 아직 답이 없음)
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 5) 크리에이터 확인 대기 상자: 검수 완료 시각 + 168시간 안에 답이 없으면 → 반송 대기(office-workflow INV-W4·W6, 2026-10-12 (2) D3 ②).
  --    확인 줄에 「기한 지남」을 적고 보낸 팬에게 「돌려보낼 상자」(돌려보내기와 같다). 끝난 주문의 상자는 여기서 빼고 아래 「나갈 수 없게 된 상자」가 맡는다.
  --    상자마다 상자 → 주문(몫) → 사무소 상자 줄 순으로 잠그고(INV-W12) 다시 본다. 잠그는 사이 상자 연결이 바뀐 상자는 다음 회차로.
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
      perform public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    update public.office_parcels p set state = 'return_waiting'
    where p.id = v_parcel and p.state = 'held' and p.inspected_at <= now() - interval '168 hours' and not public.office_parcel_dead(p);
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.office_creator_checks k set answer = 'expired', answered_at = now()
      where k.parcel_id = v_parcel and k.answer is null;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    v_held := v_held + v_n;
  end loop;

  -- 6) 주문에 묶인 채 보류된 상자: 보류 + 168시간 → 주문에서 떼어 내고 반송 대상(inbound-address-code INV-C9).
  --    상자마다 넘기기 함수를 부른다 — 주인의 확인과 같은 잠금 순서, 이미 넘긴 상자는 그 함수가 건너뛴다(두 번 돌려도 한 번).
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

  -- 7) 승인 뒤 도착하지 않은 상자: 결제 완료 + 720시간 → 그 상자를 닫는다(office-workflow INV-W10).
  --    주문마다 닫기 함수를 부른다 — 입고와 같은 잠금 순서로 잡고 다시 보므로, 그 상자의 입고와 겹쳐도 하나만 반영된다.
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

  -- 8) 결제 완료 + 336시간에 아직 안 온 상자가 있는 진행 중 주문 → 보낸 팬에게 한 번(notifications INV-N15).
  --    같은 이름의 줄은 넣지 않는다(notification_outbox_once) — 두 번 돌려도 한 번. 새로 넣은 주문 수를 센다.
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

  -- 9) 살려 둔 지 168시간 지난 상자·몫(payment INV-M18 ③ · reverse-gift INV-R11): 팬 선물 상자는 닫고(상자 환불 = 남겨 둔 배송비 칸),
  --    역조공 몫은 6자리를 무효로(환불 = 몫 금액). 상자는 상자마다 닫기 함수를 부른다 — 입고와 같은 잠금 순서로 잡고 다시 보므로 겹쳐도 하나만.
  --    몫의 6자리는 조건부 갱신 한 문장 — 입고가 먼저 사용됨으로 바꿨으면 다시 보고 건너뛴다. 두 번 돌려도 한 번.
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

  -- 나갈 수 없게 된 상자 중 검수 완료·크리에이터 확인 대기인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공).
  --    확인 대기 상자의 질문은 닫힌다 — 답은 빈 채로 두고 팬 「돌려보낼 상자」도 넣지 않는다(검수 불합격이 아니라 주문이 끝난 것이다)
  --    5단계와 같이 상자마다 INV-W12 순서로 잠그고 다시 본다.
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

-- 10) 거절 때 반송 대기
CREATE OR REPLACE FUNCTION public.return_inspected_boxes(p_order_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  update public.office_parcels p
  set state = 'return_waiting'
  from public.boxes b
  -- 크리에이터 확인 대기(held)도 — 주문이 끝나면 질문이 닫히고 검수 완료 상자와 같은 길(2026-10-12 (2) D3 ②)
  where p.box_id = b.id and b.order_id = p_order_id and p.state in ('inspected', 'held');
$function$;

-- 10) 입고 뒤 취소
CREATE OR REPLACE FUNCTION public.admin_cancel_received_gift(p_order_no text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_order_id uuid;
begin
  if not public.is_owner() then
    raise exception '입고 뒤 취소는 대표만 한다' using errcode = '42501';
  end if;
  if char_length(v_reason) < 1 or char_length(v_reason) > 200 then
    raise exception '사유는 1~200자' using errcode = '22023';
  end if;
  select o.id into v_order_id from public.orders o where o.order_no = p_order_no;
  if v_order_id is null then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  perform 1 from public.boxes b where b.order_id = v_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  perform 1 from public.orders o where o.id = v_order_id for update;
  -- 6자리 줄은 주문 뒤·사무소 상자 줄 앞(INV-W12) — 아래 취소가 트리거로 6자리를 무효로 바꾼다
  perform 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id
  where b.order_id = v_order_id order by c.id for update of c;
  -- 사무소 상자 줄은 주문 뒤에(INV-W12) — QR 로 시작하는 처리도 상자 → 주문 → 사무소 상자 줄 순이다
  perform 1 from public.office_parcels x join public.boxes b on b.id = x.box_id
  where b.order_id = v_order_id order by x.id for update of x;
  -- 검수에 걸린 상자가 있어도 취소한다 — 그 상자는 환불에서 0(검수 불합격 줄)이라 차감을 피하지 못한다(INV-M17, 2026-10-10 B9)
  update public.orders o
  set status = 'canceled'
  where o.id = v_order_id
    -- 주문 상태는 가장 늦은 상자를 따른다 — 상자 하나만 왔으면 아직 「등록」이다. 그래서 상태가 아니라 「도착한 상자가 있음」으로 본다
    and o.status in ('registered', 'received', 'labeled', 'inspected') and o.shipped_at is null
    and exists (select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
                where b.order_id = o.id and x.state <> 'awaiting')
    -- 출고 송장을 출력한 상자가 하나라도 있으면 취소하지 않는다
    and not exists (select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
                    where b.order_id = o.id and x.state in ('label_printed', 'shipped'));
  if not found then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  insert into public.order_cancellations (order_id, canceled_by, reason) values (v_order_id, auth.uid(), v_reason);
  -- 검수를 마친 상자·크리에이터 확인 대기 상자는 바로 반송 대기로(나갈 수 없게 된 상자 — 반려된 주문과 같은 길)
  update public.office_parcels x
  set state = 'return_waiting'
  from public.boxes b
  where b.id = x.box_id and b.order_id = v_order_id and x.state in ('inspected', 'held');
end $function$;

-- 11) 환불 금액
CREATE OR REPLACE FUNCTION public.refund_due_of_payment(p_payment_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p.status <> 'done' or o.shipped_at is not null then null
    when o.status not in ('rejected', 'expired', 'canceled')
         and exists (select 1 from public.payments d
                     where d.order_id = o.id and d.kind = 'difference' and d.expired_at is not null and d.status <> 'done')
         and not exists (select 1 from public.boxes b where b.order_id = o.id and b.measured_tier = 'oversize')
         and not exists (select 1 from public.boxes b
                         join public.office_parcels x on x.box_id = b.id
                         join public.office_inspections i on i.parcel_id = x.id
                         where b.order_id = o.id and i.outcome = 'return')
      then p.goods_krw
    -- 끝난 주문(INV-M9, 2026-10-10): 상자마다 정한 몫의 합
    when o.status in ('rejected', 'expired', 'canceled') and p.kind = 'initial' then c.ended_sum
    -- 끝난 주문의 차액 결제: 취소는 그 결제의 검수비·배송비 칸, 거절·반려는 배송비 칸을 뺀다(그대로)
    when o.status = 'canceled' then greatest(p.amount_krw - p.inspection_fee_krw - p.shipping_fee_krw, 0)
    when o.status in ('rejected', 'expired') then p.amount_krw - p.shipping_fee_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    else null
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  cross join lateral (
    -- whole: 입고 없이 끝났고 살려 둔 상자도 없는 주문 — 닫힌 상자까지 주문 환불이 전부 맡는다(상자 환불은 생기지 않는다)
    select (o.received_at is null
            and not exists (select 1 from public.boxes b join public.inbound_codes k on k.box_id = b.id
                            where b.order_id = o.id and k.kept_at is not null)) as whole
  ) w
  cross join lateral (
    select coalesce(sum(case
      -- 살려 둔 상자(INV-M18 ①): 상자 금액 − 배송비 칸 — 그 뒤 도착하든 닫히든 그대로
      when exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null) then b.price_krw - b.shipping_fee_krw
      -- 닫힌 상자: 상자 환불이 맡는다(입고 없이 끝난 주문은 주문 환불이 맡는다)
      when b.missing_at is not null then case when w.whole then b.price_krw else 0 end
      -- 끝날 때 도착해 있던 상자
      when exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting') then case
        -- 검수에 걸림(반송·추적기 반송·중형 초과 실측·크리에이터가 돌려보냄·확인 기한 지남): 검수 불합격 줄 — 상품 대금 칸만인데 상자에는 그 칸이 없다(0)
        when b.measured_tier = 'oversize'
             or exists (select 1 from public.office_parcels x join public.office_inspections i on i.parcel_id = x.id
                        where x.box_id = b.id and i.outcome in ('return', 'hold'))
             or exists (select 1 from public.office_parcels x join public.office_creator_checks k on k.parcel_id = x.id
                        where x.box_id = b.id and k.answer in ('return', 'expired')) then 0
        -- 입고 뒤 취소(INV-M17): 검수비·배송비 칸을 뺀다
        when o.status = 'canceled' then b.price_krw - b.inspection_fee_krw - b.shipping_fee_krw
        -- 입고 뒤 거절·반려: 배송비 칸을 뺀다
        else b.price_krw - b.shipping_fee_krw
      end
      -- 받는 주소를 본 적이 없어 올 수 없는 상자: 그 상자 금액 전액
      else b.price_krw
    end), 0)::integer as ended_sum
    from public.boxes b
    where b.order_id = o.id
  ) c
  where p.id = p_payment_id;
$function$;

-- 12) 차액 결제 — 크리에이터 확인 대기(held) 상자는 막지 않는다
CREATE OR REPLACE FUNCTION public.prepare_difference_payment(p_box_id uuid)
 RETURNS TABLE(toss_order_id text, amount_krw integer, order_no text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_order public.orders;
  v_pay public.payments;
  v_state public.office_state;
begin
  select o.* into v_order from public.orders o join public.boxes b on b.order_id = o.id where b.id = p_box_id;
  if v_order.id is null or v_order.fan_id is distinct from auth.uid() then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select p.* into v_pay from public.payments p where p.box_id = p_box_id and p.kind = 'difference' for update;
  if v_pay.id is null then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_pay.status = 'done' then
    raise exception '이미 낸 차액이다' using errcode = 'P0023';
  end if;
  if v_pay.status = 'confirming' then
    raise exception '결제를 처리하고 있다' using errcode = 'P0024';
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = p_box_id;
  -- M13: 기한(요청 + 168시간)이 지났으면 7일 처리 전이라도 받지 않는다 — 사람 처리 쪽의 기한 확인(W6)
  if v_pay.expired_at is not null or now() >= v_pay.created_at + interval '168 hours'
     or v_order.status in ('rejected', 'expired', 'canceled')
     or v_state in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped') then
    raise exception '차액을 낼 수 없는 상태다' using errcode = 'P0022';
  end if;
  if v_pay.status = 'failed' then
    update public.payments p
    set toss_order_id = 'diff_' || replace(gen_random_uuid()::text, '-', ''), status = 'pending', payment_key = null, settled_at = null
    where p.id = v_pay.id
    returning p.* into v_pay;
  end if;
  return query select v_pay.toss_order_id, v_pay.amount_krw, v_order.order_no;
end $function$;

-- 12) 차액 결제 — 크리에이터 확인 대기(held) 상자는 막지 않는다
CREATE OR REPLACE FUNCTION public.claim_difference_payment(p_toss_order_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pay public.payments;
  v_state public.office_state;
begin
  select * into v_pay from public.payments p
  where p.toss_order_id = p_toss_order_id and p.kind = 'difference'
  for update;
  if v_pay.id is null or v_pay.status <> 'pending'
     or v_pay.expired_at is not null or now() >= v_pay.created_at + interval '168 hours' then
    return false;
  end if;
  if exists (select 1 from public.orders o where o.id = v_pay.order_id and o.status in ('rejected', 'expired', 'canceled')) then
    return false;
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = v_pay.box_id for share;
  if v_state in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped') then
    return false;
  end if;
  update public.payments set status = 'confirming', confirming_at = now() where id = v_pay.id;
  return true;
end $function$;

-- 13) 꺼내기
drop function if exists public.notification_claim(integer);
CREATE FUNCTION public.notification_claim(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, kind text, channel text, round smallint, order_no text, nickname text, auto_reject_at timestamp with time zone, undelivered_reason text, must_deliver boolean, attempts integer, claimed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with picked as (
    select n.id,
           (n.kind = 'approval_request' and not exists (
              select 1 from public.approval_requests r where r.id = n.approval_request_id and r.status = 'waiting')) as closed,
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
    set status = 'skipped', error_code = 'request_not_waiting', finished_at = now()
    from picked p
    where n.id = p.id and not p.expired and p.closed and n.status = 'pending'
    returning n.id
  ), claimed as (
    update public.notification_outbox n
    set status = 'sending', claimed_at = clock_timestamp()
    from picked p
    where n.id = p.id and not p.expired and not p.closed and n.status = 'pending'
    returning n.*
  )
  select c.id, c.kind, c.channel, c.round, coalesce(o.order_no, rs.order_no), pr.nickname,
         case when c.kind = 'approval_request' then o.registered_at + interval '168 hours' end,
         -- 거절 알림의 문구 갈래(2026-10-12 (2) D11): 7일 반려면 expired, 거절이면 declined. 차단 표시는 읽지 않는다(decline-block INV-D5)
         case when c.kind = 'gift_undelivered' then (case when o.status = 'expired' then 'expired' else 'declined' end) end,
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $function$;

revoke all on function public.notification_claim(integer) from public, anon, authenticated;
grant execute on function public.notification_claim(integer) to service_role;
