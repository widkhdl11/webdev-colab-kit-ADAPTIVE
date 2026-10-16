-- 규칙 바꾸기 넷 1차 묶음 (DECISIONS 2026-10-17, 카드 d100·d101 「승인」).
-- 스펙: office-workflow INV-W1·W4·W6·W8·W9·W14·W16, notifications INV-N13, action-center INV-J5, payment INV-M8·M9·M21.
--
-- 1) 추적기 보관(INV-W14): 검수에서 위치 추적기로 판정한 팬 선물(결론 hold)은 검수 완료 스캔에서 반송 대기가 아니라 추적기 보관(tracker_held)으로 간다.
--    주문이 이미 끝났어도 같다 — 추적기가 나온 사실은 주문이 끝나도 그대로다. 실측 기록은 필요 없다(S4e).
--    그 처리에서 추적기 기록 줄(office_hold_alerts), 신고 선택 줄(office_creator_checks, kind = 'tracker'), 크리에이터 hold 알림(상자마다 한 번)이 생긴다.
--    보낸 팬에게는 이때 알리지 않는다(hold_fan 없음, notifications INV-N13).
-- 2) 신고 선택은 크리에이터 확인(INV-W13)과 같은 장치를 선택지 종류로 갈라 쓴다 — 확인 줄에 kind(confirm 받기·거절 / tracker 신고하기·신고하지 않기).
--    choose_creator_check · cancel_creator_check · office_process_creator_check · admin_creator_check_choices · creator_check_blocked 가 종류에 따라 판정한다.
--    운영자 처리: 신고하기(report) → 신고 보관(report_held), 신고하지 않기(no_report) → 반송 대기 + 팬 hold_fan. 결과 꼴에 reported · not_reported 를 더한다.
--    추적기 상자는 주문이 끝나도 「끝남」(closed)이 아니다 — 상자가 추적기 보관에 있는 동안은 고르기·처리를 받는다.
-- 3) 기한(INV-W6·W14): 검수 완료 스캔부터 168시간 — office_run_expiry 의 새 단계가 고른 쪽대로(신고하기 → 신고 보관, 신고하지 않기 → 반송 대기 + hold_fan),
--    고른 것이 없으면 반송 대기 + 확인 줄 「기한 지남」 + hold_fan. 결과의 held 수에 더한다(같은 「확인 기한 처리」 칸).
-- 4) 경찰 인계(INV-W14·W8): office_record_police_handover(QR, 메모 1~200자) — 운영자만, 신고 보관 상자만. 경찰 인계(police_handed, 끝)로 바꾸고
--    인계 기록(office_police_handovers, 추가만)과 봉투 파쇄 기록을 같은 처리에서 남긴다. 반송 송장 출력은 반송 대기 상자만이라 이 상자는 출력할 수 없다.
-- 5) 상자 상태 셈(office_sync_order): 추적기 보관·신고 보관은 검수 반송과 같이 「검수 완료」 단계(3)이면서 반송으로 센다 — 주문의 검수 결과가 「반송」이라
--    환불은 검수 불합격 줄(상품 대금 칸만)이고 승인 전 주문은 더 승인할 수 없다(옛 추적기 반송과 같다). 경찰 인계는 반송 확정처럼 셈에서 뺀다.
-- 6) 팬 읽기(INV-W14): my_gifts(따라서 my_gift)·my_gift_boxes·my_together_gifts 는 추적기 보관·신고 보관·경찰 인계 상자와 그 주문의 검수 결과를
--    「확인 중」(checking) 한 값으로만 돌려준다. 반송 대기로 넘어가면 다른 검수 반송과 같다. my_action_items 의 추가 결제 카드는 이 상자에 없다.
--    차액 결제(prepare_difference_payment·claim_difference_payment)도 이 상자에는 받지 않는다 — 나가지 않는 상자다.
-- 7) 크리에이터 읽기: my_incoming_gifts 의 검수 결과는 추적기 보관·신고 보관·경찰 인계면 「보관」(held), 반송 대기로 넘어가면 「반송」(INV-W9).
--    my_creator_action_items 에 「추적 장치 발견」(tracker) 줄 — 추적기 보관 · 운영자 처리 전 · 기한 전, 주문이 끝나도 남는다. 받은 선물 판 맨 위(INV-J5).
-- 8) 개봉 대상(INV-W16): 보낸 팬에게 추적기 판정 기록이 하나라도 있으면(어느 크리에이터 주문이든) 팬 선물 상자의 검수 기록에 개봉 결과(opened: none 장치 없음 ·
--    device 장치 나옴)가 꼭 있고, 대상이 아니면 비어 있다 — 기록 함수와 표(삽입 지킴이 트리거 + 검사 제약)가 함께 지킨다. 장치 나옴이면 판정 칸이 있고
--    블루투스 반응과 같은 짝(INV-W4)을 따른다. 검수 화면 읽기(office_parcel_by_qr)에 open_target 칸. 크리에이터·팬 읽기에는 없다.
-- 9) 크리에이터 사정으로 취소(payment INV-M21): admin_cancel_for_creator(주문번호, 사유) — 대표만, 출고 전 진행 중 주문. 취소 기록에 kind = 'creator'.
--    환불은 거절·반려 줄(도착한 상자는 상자 금액 − 배송비 칸, 검수비를 빼지 않는다). 추적기 보관·신고 보관 상자는 반송 대기로 넘어가지 않는다.
-- 10) 알림 hold 는 상자를 가리킨다(상자마다 한 번) — 상자를 가리키는 종류 목록에 hold 를 더한다. 2026-10-17 전의 hold 줄(주문 단위, 상자 칸 없음)이 있어도
--     적용이 멈추지 않게 이 제약은 NOT VALID 로 건다(새 줄부터 지킨다). 이 마이그레이션 적용 전 로컬 DB 의 상자 없는 hold 줄은 0건이었다(2026-10-17 셈).
--
-- 운영 적용 순서: 20261017000001(상태 값) 다음. 앱은 이 마이그레이션 뒤에 배포한다(검수 화면이 tracker_held 를 받아야 한다).
-- 다시 적용해도 결과가 같다(칸·표는 if not exists, 제약은 drop if exists 뒤 add, 함수는 create or replace 또는 drop if exists 뒤 create).

-- ── 1) 신고 선택 줄 · 경찰 인계 기록 ─────────────────────────────

alter table public.office_creator_checks add column if not exists kind text not null default 'confirm';
alter table public.office_creator_checks drop constraint if exists office_creator_checks_kind_check;
alter table public.office_creator_checks add constraint office_creator_checks_kind_check check (kind in ('confirm', 'tracker'));
-- 선택·처리 결과는 종류의 짝 안에서만: 확인은 받기·거절, 추적기는 신고하기·신고하지 않기. 기한 지남(expired)은 둘 다
alter table public.office_creator_checks drop constraint if exists office_creator_checks_choice_check;
alter table public.office_creator_checks add constraint office_creator_checks_choice_check check (
  choice is null
  or (kind = 'confirm' and choice in ('accept', 'return'))
  or (kind = 'tracker' and choice in ('report', 'no_report'))
);
alter table public.office_creator_checks drop constraint if exists office_creator_checks_answer_check;
alter table public.office_creator_checks add constraint office_creator_checks_answer_check check (
  answer is null
  or answer = 'expired'
  or (kind = 'confirm' and answer in ('accept', 'return'))
  or (kind = 'tracker' and answer in ('report', 'no_report'))
);
alter table public.office_creator_checks drop constraint if exists office_creator_checks_answered_by;
alter table public.office_creator_checks add constraint office_creator_checks_answered_by check (answered_by is null or answer in ('accept', 'return', 'report', 'no_report'));

alter table public.office_creator_check_events drop constraint if exists office_creator_check_events_choice_check;
alter table public.office_creator_check_events add constraint office_creator_check_events_choice_check check (choice in ('accept', 'return', 'report', 'no_report'));

create table if not exists public.office_police_handovers (
  parcel_id uuid primary key references public.office_parcels (id),
  handed_by uuid not null references public.profiles (id),
  -- 실명·주소·전화는 적지 않는다(INV-W7) — 인계한 곳·담당 부서 정도
  memo text not null check (char_length(memo) between 1 and 200),
  at timestamptz not null default now()
);
alter table public.office_police_handovers enable row level security;
revoke all on public.office_police_handovers from public, anon, authenticated;
create or replace trigger office_police_handovers_no_update before update on public.office_police_handovers
  for each row execute function public.append_only_log();
create or replace trigger office_police_handovers_no_delete before delete on public.office_police_handovers
  for each row execute function public.append_only_log();

-- ── 2) 개봉 대상 (INV-W16) ─────────────────────────────────────

-- 그 상자를 보낸 팬에게 추적기 판정 기록이 하나라도 있는가(어느 크리에이터에게 보낸 주문이든). 팬 선물 상자가 아니면 거짓.
-- 등록 때가 아니라 부르는 순간의 기록으로 판정한다 — 등록 뒤에 다른 주문에서 추적기가 나온 팬의 상자도 열린다.
create or replace function public.office_open_target(p_parcel_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1
    from public.office_parcels x
    join public.boxes b on b.id = x.box_id
    join public.orders o on o.id = b.order_id
    join public.orders o2 on o2.fan_id = o.fan_id
    join public.boxes b2 on b2.order_id = o2.id
    join public.office_parcels x2 on x2.box_id = b2.id
    join public.office_inspections i on i.parcel_id = x2.id
    where x.id = p_parcel_id and i.tracker_verdict = 'tracker'
  );
$$;
revoke all on function public.office_open_target(uuid) from public, anon, authenticated;

alter table public.office_inspections add column if not exists opened text;
alter table public.office_inspections drop constraint if exists office_inspections_opened_check;
alter table public.office_inspections add constraint office_inspections_opened_check check (opened in ('none', 'device'));
-- 개봉 결과는 팬 선물 기록에만(역조공은 대상이 아니다)
alter table public.office_inspections drop constraint if exists office_inspections_opened_gift;
alter table public.office_inspections add constraint office_inspections_opened_gift check (opened is null or bluetooth is not null);
-- 장치 나옴이면 판정 칸이 있다(블루투스 반응과 같은 짝)
alter table public.office_inspections drop constraint if exists office_inspections_opened_verdict;
alter table public.office_inspections add constraint office_inspections_opened_verdict check (opened is distinct from 'device' or tracker_verdict is not null);
-- 장치 없음이면 반응이 없는 상자와 같다 — 판정 칸은 반응이 있을 때만
alter table public.office_inspections drop constraint if exists office_inspections_opened_none;
alter table public.office_inspections add constraint office_inspections_opened_none check (
  opened is distinct from 'none' or ((tracker_verdict is not null) = (bluetooth = 'found' or rf = 'found'))
);

-- 표 지킴이: 개봉 대상인 상자의 기록에는 개봉 결과가 있고, 대상이 아닌 상자의 기록에는 없다(표에 직접 넣어도). 다른 줄을 읽어야 해서 검사 제약 대신 삽입 트리거
create or replace function public.office_inspections_open_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_target boolean;
begin
  v_target := new.bluetooth is not null and public.office_open_target(new.parcel_id);
  if v_target and new.opened is null then
    raise exception '개봉 대상 상자는 개봉 결과가 있어야 한다' using errcode = '23514', constraint = 'office_inspections_open_target';
  end if;
  if not v_target and new.opened is not null then
    raise exception '개봉 대상이 아닌 상자에는 개봉 결과가 없다' using errcode = '23514', constraint = 'office_inspections_open_target';
  end if;
  return new;
end $$;
revoke all on function public.office_inspections_open_guard() from public, anon, authenticated;
create or replace trigger office_inspections_open_guard before insert on public.office_inspections
  for each row execute function public.office_inspections_open_guard();

-- ── 3) 취소 기록의 종류 · 알림 hold 의 상자 ───────────────────────

alter table public.order_cancellations add column if not exists kind text not null default 'received';
alter table public.order_cancellations drop constraint if exists order_cancellations_kind_check;
-- received = 대표의 입고 뒤 취소(INV-M17) · creator = 크리에이터 사정으로 취소(INV-M21)
alter table public.order_cancellations add constraint order_cancellations_kind_check check (kind in ('received', 'creator'));

alter table public.notification_outbox drop constraint if exists notification_outbox_parcel_kind;
alter table public.notification_outbox add constraint notification_outbox_parcel_kind
  check ((kind = any (array['box_arrived', 'difference_due', 'gift_reply', 'gift_received', 'creator_check', 'hold'])) = (parcel_id is not null)) not valid;

-- ── 4) 검수 기록 ──────────────────────────────────────────────

-- 20261012000011 과 같고, 개봉 결과(INV-W16)를 더했다: 개봉 대상이면 opened 가 꼭 있고 아니면 없다. 장치 나옴은 반응과 같이 판정 칸을 요구한다.
create or replace function public.office_record_inspection(p_qr text, p_result jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_keys text[];
  v_outcome text := p_result ->> 'outcome';
  v_verdict text := p_result ->> 'tracker_verdict';
  v_opened text := p_result ->> 'opened';
  v_target boolean;
  v_reacted boolean;
  v_expected text[];
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
             where e.key not in ('outcome', 'tracker_verdict', 'opened') and (e.value is null or e.value not in ('clear', 'found')))
     or v_outcome is null or v_outcome not in ('pass', 'return', 'hold', 'confirm')
     or (p_result ? 'tracker_verdict' and (v_verdict is null or v_verdict not in ('tracker', 'not_tracker')))
     or (p_result ? 'opened' and (v_opened is null or v_opened not in ('none', 'device'))) then
    raise exception '검수 결과 값이 아니다' using errcode = '22023';
  end if;

  if v.box_id is not null then
    -- 개봉 대상(INV-W16): 보낸 팬에게 추적기 판정 기록이 있으면 개봉 결과가 꼭 있고, 아니면 없다 — 판정은 이 기록을 남기는 순간.
    -- 아래 칸 목록 검사가 지킨다(대상이면 opened 칸이 목록에 들어간다)
    v_target := public.office_open_target(v.id);
    -- 팬 선물: 블루투스·RF·금속. 블루투스·RF 반응이 나오거나 개봉에서 장치가 나오면 직원의 추적기 판정이 꼭 있다(INV-W4·W16)
    v_reacted := p_result ->> 'bluetooth' = 'found' or p_result ->> 'rf' = 'found' or coalesce(v_opened = 'device', false);
    v_expected := array['bluetooth', 'metal', 'outcome', 'rf'];
    if v_target then
      v_expected := v_expected || array['opened'];
    end if;
    if v_reacted then
      v_expected := v_expected || array['tracker_verdict'];
    end if;
    select array_agg(k order by k) into v_expected from unnest(v_expected) k;
    if v_keys is distinct from v_expected then
      raise exception '팬 선물 검수는 블루투스·RF·금속이고, 반응이 나오거나 장치가 나오면 추적기 판정이 있다' using errcode = '22023';
    end if;
    -- 추적기면 추적기 보관(hold)뿐이고, 추적기 보관은 추적기로 판정했을 때만
    if coalesce(v_verdict = 'tracker', false) <> (v_outcome = 'hold') then
      raise exception '추적기면 추적기 보관, 추적기 보관은 추적기로 판정했을 때만' using errcode = '22023';
    end if;
    -- 추적기 아님이면 크리에이터 확인 또는 반송 — 바로 통과하지 않는다. 크리에이터 확인은 추적기 아님일 때만(2026-10-12 (2) D3 ②)
    if coalesce(v_verdict = 'not_tracker', false) then
      if v_outcome not in ('confirm', 'return') then
        raise exception '추적기 아님은 크리에이터 확인 또는 반송' using errcode = '22023';
      end if;
    elsif v_outcome = 'confirm' then
      raise exception '크리에이터 확인은 추적기 아님으로 판정했을 때만' using errcode = '22023';
    end if;
    insert into public.office_inspections (parcel_id, inspected_by, bluetooth, rf, metal, tracker_verdict, opened, outcome)
    values (v.id, auth.uid(), p_result ->> 'bluetooth', p_result ->> 'rf', p_result ->> 'metal', v_verdict, v_opened, v_outcome);
  else
    -- 역조공: 겉면·금지 물품만. 하나라도 걸리면 반송, 추적기 보관·크리에이터 확인·판정·개봉 결과는 없다.
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

-- ── 5) 검수 완료 스캔 ─────────────────────────────────────────

-- 20261012000012 와 같고, 추적기(hold)는 반송 대기가 아니라 추적기 보관(INV-W4·W14) — 주문이 끝났어도 같다.
-- 신고 선택 줄과 크리에이터 hold 알림(상자마다)을 같은 처리에서 넣고, 보낸 팬 hold_fan 은 넣지 않는다(INV-N13).
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
  -- 추적기(hold)는 추적기 보관 — 주문이 끝나도 반송 대기로 가지 않는다(INV-W14, 2026-10-17 카드 d100).
  -- 크리에이터 확인(confirm)은 확인 대기(held) — 나갈 수 없는 상자면 묻지 않고 반송 대기(2026-10-12 (2) D3 ②)
  v_next := case
    when v_outcome = 'hold' then 'tracker_held'
    when v_outcome = 'return' or public.office_parcel_dead(v) then 'return_waiting'
    when v_outcome = 'confirm' then 'held'
    else 'inspected'
  end;
  -- 받으면 그대로 출고되므로 확인 대기도 실측 기록이 있어야 한다(INV-W4 S4d). 추적기 보관은 실측 없이(S4e)
  if v_next in ('inspected', 'held') and v.box_id is not null
     and exists (select 1 from public.boxes b where b.id = v.box_id and b.measured_tier is null) then
    raise exception '실측 기록이 없다' using errcode = 'P0053';
  end if;
  update public.office_parcels set state = v_next, inspected_at = now() where id = v.id;
  if v_next = 'tracker_held' then
    insert into public.office_hold_alerts (parcel_id, creator_id)
    select v.id, o.creator_id from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
    insert into public.office_creator_checks (parcel_id, kind) values (v.id, 'tracker') on conflict (parcel_id) do nothing;
    -- INV-N13: 그 주문의 크리에이터 계정에게 「추적 장치 발견」 — 상자마다 한 번(줄 이름에 이 상자가 들어간다). 보낸 팬·나온 것은 본문 틀에 칸이 없다(INV-N1).
    -- 보낸 팬에게는 이때 알리지 않는다 — 반송 대기로 넘어갈 때 hold_fan(신고하지 않기 처리·기한)
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select 'hold', o.id, v.id, 1, c.profile_id, ch.channel, now()
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.creators c on c.id = o.creator_id
    cross join (values ('email'), ('kakao')) as ch (channel)
    where b.id = v.box_id and c.profile_id is not null
      and (ch.channel = 'email' or exists (select 1 from public.notification_kakao_templates t where t.kind = 'hold'))
    on conflict do nothing;
  elsif v_next = 'held' then
    insert into public.office_creator_checks (parcel_id, kind) values (v.id, 'confirm') on conflict (parcel_id) do nothing;
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

-- ── 6) 고르기·취소·운영자 처리 (INV-W13·W14) ─────────────────────

-- 잠근 확인 줄의 공통 판정 — 처리됨·끝남·기한 지남. 아무것도 아니면 null. 20261016000008 과 같고, 추적기 줄은 상자가 추적기 보관에 있는 동안
-- 끝나지 않는다(주문이 끝나도 — INV-W14).
create or replace function public.creator_check_blocked(v public.office_parcels, k public.office_creator_checks)
returns text
language sql stable set search_path = ''
as $$
  select case
    when k.answer = 'expired' or (k.answer is not null and k.answered_by is null) then 'expired'
    when k.answer is not null then 'processed'
    when k.kind = 'tracker' and v.state <> 'tracker_held' then 'closed'
    when k.kind = 'confirm' and (v.state <> 'held' or public.office_parcel_dead(v)) then 'closed'
    when now() >= v.inspected_at + interval '168 hours' then 'expired'
  end;
$$;

-- 선택지가 그 줄의 종류에 맞는가 — 확인은 받기·거절, 추적기는 신고하기·신고하지 않기
create or replace function public.creator_check_choice_fits(p_kind text, p_choice text)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce((p_kind = 'confirm' and p_choice in ('accept', 'return')) or (p_kind = 'tracker' and p_choice in ('report', 'no_report')), false);
$$;

-- INV-W13·W14 고르기: 그 주문의 크리에이터만, 운영자 처리 전·기한 전·고른 것이 없을 때. 상자는 움직이지 않는다
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
  if p_choice is null or p_choice not in ('accept', 'return', 'report', 'no_report') then
    raise exception '받기·거절 또는 신고하기·신고하지 않기' using errcode = '22023';
  end if;
  v_parcel := public.creator_check_parcel_of(p_order_no, p_box_seq);
  if v_parcel is null then
    return 'not_found';
  end if;
  v := public.office_lock_parcel(v_parcel);
  select * into k from public.office_creator_checks x where x.parcel_id = v.id for update;
  if not public.creator_check_choice_fits(k.kind, p_choice) then
    raise exception '이 상자에서 고를 수 있는 값이 아니다' using errcode = '22023';
  end if;
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

-- INV-W13·W14 취소: 20261016000008 과 같다(판정 함수가 종류를 가른다). 다시 만드는 것은 판정 함수가 바뀐 것을 한 자리에서 보이려는 것
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

-- INV-W13·W14 운영자 처리: 20261016000009 와 같고, 추적기 줄의 처리를 더했다 — 신고하기 → 신고 보관(팬 알림 없음),
-- 신고하지 않기 → 반송 대기 + 보낸 팬 「돌려보낼 상자」(INV-N13). 결과: accepted · returned · reported · not_reported (그 밖은 그대로)
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
  if p_seen_choice is null or p_seen_choice not in ('accept', 'return', 'report', 'no_report') then
    raise exception '본 선택(받기·거절·신고하기·신고하지 않기)이 필요하다' using errcode = '22023';
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
  if (k.kind = 'confirm' and (v.state <> 'held' or public.office_parcel_dead(v))) or (k.kind = 'tracker' and v.state <> 'tracker_held') then
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
  set state = case k.choice
                when 'accept' then 'inspected'::public.office_state
                when 'report' then 'report_held'::public.office_state
                else 'return_waiting'::public.office_state
              end
  where id = v.id;
  if k.choice in ('return', 'no_report') then
    perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return case k.choice when 'accept' then 'accepted' when 'return' then 'returned' when 'report' then 'reported' else 'not_reported' end;
end $$;

-- 운영자 목록: 크리에이터가 고른 것이 있고 아직 처리 전인 확인 대기·추적기 보관 상자. 20261016000008 과 같고 추적기 줄을 더했다(choice 가 report·no_report)
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
    and k.choice is not null and k.answer is null
    and ((k.kind = 'confirm' and x.state = 'held' and not public.office_parcel_dead(x))
         or (k.kind = 'tracker' and x.state = 'tracker_held'))
  order by k.chosen_at, x.qr_code
  limit 500;
$$;

-- ── 7) 경찰 인계 (INV-W14·W8) ────────────────────────────────

-- 운영자만, 신고 보관 상자만. 결과 'handed'. 오류: 42501 운영자 아님 · 22023 메모 1~200자 아님·QR 꼴 · P0002 없는 상자 · 55000 신고 보관이 아님(이미 인계 포함)
create or replace function public.office_record_police_handover(p_qr text, p_memo text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_memo text := btrim(coalesce(p_memo, ''));
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if char_length(v_memo) < 1 or char_length(v_memo) > 200 then
    raise exception '메모는 1~200자' using errcode = '22023';
  end if;
  v := public.office_lock_qr(p_qr);
  if v.state <> 'report_held' then
    raise exception '신고 보관 상자가 아니다' using errcode = '55000';
  end if;
  update public.office_parcels set state = 'police_handed' where id = v.id;
  insert into public.office_police_handovers (parcel_id, handed_by, memo) values (v.id, auth.uid(), v_memo);
  -- 원 송장 봉투는 인계 때 파쇄한다(INV-W8)
  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());
  perform public.office_sync(v.id);
  return 'handed';
end $$;

revoke all on function public.office_record_police_handover(text, text) from public, anon;
grant execute on function public.office_record_police_handover(text, text) to authenticated;

-- ── 8) 자동 처리 ──────────────────────────────────────────────

-- 20261016000008 과 같고, ⑤-2 단계(추적기 보관 + 168시간, INV-W14·W6)를 더했다.
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

  -- 5-2) 추적기 보관 상자: 검수 완료 + 168시간이 지나도 운영자가 처리하지 않았으면 고른 쪽대로(office-workflow INV-W14·W6).
  --      신고하기 → 신고 보관(팬 알림 없음), 신고하지 않기 → 반송 대기 + 팬 hold_fan, 고른 것이 없으면 신고하지 않기와 같고 확인 줄은 「기한 지남」.
  --      주문이 끝났어도 같다 — 추적기 보관 상자는 「나갈 수 없게 된 상자」 단계가 건드리지 않는다. 잠금은 5) 와 같은 순서.
  for v_parcel in
    select p.id from public.office_parcels p
    where p.state = 'tracker_held' and p.inspected_at <= now() - interval '168 hours'
      and (p_order_no is null
           or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no))
    order by p.id
  loop
    begin
      v_p := public.office_lock_parcel(v_parcel);
    exception when serialization_failure then
      continue;
    end;
    select * into v_k from public.office_creator_checks k where k.parcel_id = v_parcel for update;
    if v_p.state <> 'tracker_held' or v_p.inspected_at > now() - interval '168 hours' or v_k.answer is not null then
      continue;
    end if;
    if v_k.choice = 'report' then
      update public.office_parcels set state = 'report_held' where id = v_parcel;
      update public.office_creator_checks set answer = 'report', answered_at = now(), answered_by = null where parcel_id = v_parcel;
    else
      update public.office_parcels set state = 'return_waiting' where id = v_parcel;
      if v_k.parcel_id is not null then
        update public.office_creator_checks
        set answer = case when v_k.choice = 'no_report' then 'no_report' else 'expired' end, answered_at = now(), answered_by = null
        where parcel_id = v_parcel;
      end if;
      perform public.notification_enqueue('hold_fan', o.id, null, 1::smallint, o.fan_id, now())
      from public.office_parcels x join public.boxes b on b.id = x.box_id join public.orders o on o.id = b.order_id
      where x.id = v_parcel;
    end if;
    perform public.office_sync(v_parcel);
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

  -- 나갈 수 없게 된 상자 중 검수 완료·크리에이터 확인 대기인 것은 반송 대기로(답은 빈 채, 팬 알림 없음). 추적기 보관·신고 보관은 넘기지 않는다(INV-W14)
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

-- ── 9) 주문 집계 · 다음 단계 · 검수 화면 읽기 ─────────────────────

-- 20261012000011 과 같고, 추적기 보관·신고 보관을 검수 반송과 같이 「검수 완료」(3) 단계의 반송으로, 경찰 인계를 반송 확정처럼 셈 밖(반송으로는 센다)으로 둔다.
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
  -- 추적기 보관·신고 보관은 검수 반송과 같이 3, 경찰 인계는 반송 확정처럼 세지 않는다 — 셋 다 검수 결과는 「반송」(검수 불합격 줄, INV-W14)
  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3
           when 'tracker_held' then 3 when 'report_held' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then 2 when 'returned' then null when 'police_handed' then null
           else 0 end) filter (where p.state is null or p.state not in ('returned', 'police_handed')), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned', 'tracker_held', 'report_held', 'police_handed'))
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

-- 20261007000007 과 같고, 추적기 보관·신고 보관에 다음 단계 값을 더했다(경찰 인계는 끝 — done)
CREATE OR REPLACE FUNCTION public.office_next_step(p_parcel office_parcels, p_kind text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_parcel.hold_reason is not null and p_parcel.state in ('inspected', 'label_printed') then 'on_hold'
    else case coalesce(p_parcel.state::text, 'no_waybill')
    when 'no_waybill' then 'wait_waybill'
    when 'awaiting' then 'scan_inbound'
    when 'received' then 'confirm_label'
    when 'labeled' then 'inspect'
    when 'inspected' then case when public.office_parcel_shippable(p_parcel) then 'print_label'
                               when public.office_parcel_dead(p_parcel) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.payments d on d.order_id = b.order_id
                                 where b.id = p_parcel.box_id and d.kind = 'difference' and d.status in ('pending', 'failed')
                                   and d.expired_at is null and d.created_at <= now() - interval '168 hours'
                               ) then 'wait_expiry'
                               when p_kind = 'gift' and exists (
                                 select 1 from public.boxes b join public.orders o on o.id = b.order_id
                                 where b.id = p_parcel.box_id and o.approved_at is not null
                                   and exists (select 1 from public.payments d
                                               where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
                               ) then 'wait_difference'
                               when p_kind = 'gift' then 'wait_approval' else 'wait_accept' end
    when 'held' then 'held'
    -- 추적기 보관: 크리에이터가 신고 여부를 고르면 처리 / 신고 보관: 경찰 인계를 기록(INV-W14)
    when 'tracker_held' then 'tracker_held'
    when 'report_held' then 'report_held'
    when 'return_waiting' then 'print_return'
    when 'return_printed' then 'confirm_return'
    when 'label_printed' then 'confirm_shipment'
    else 'done'
    end
  end;
$function$;

-- 20261005000007 과 같고, 개봉 대상 여부(open_target, INV-W16)를 더했다. 돌려주는 칸이 바뀌어 지우고 다시 만든다(권한도 다시 준다)
drop function if exists public.office_parcel_by_qr(text);
create function public.office_parcel_by_qr(p_qr text)
returns table (qr text, kind text, order_no text, sender_nickname text, receiver_name text, tier text, state text, next_step text,
               envelope_no text, outbound_waybill_no text, return_waybill_no text, open_target boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    return;
  end if;
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  return query
  select p.qr_code,
         case when p.box_id is not null then 'gift' else 'revgift' end,
         case when p.box_id is not null
              then o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end
              else s.order_no end,
         case when p.box_id is not null then f.nickname else c2.name end,
         case when p.box_id is not null then c.name else sf.nickname end,
         coalesce(b.declared_tier, s.tier)::text,
         p.state::text,
         public.office_next_step(p, case when p.box_id is not null then 'gift' else 'revgift' end),
         p.qr_code, p.outbound_waybill_no, p.return_waybill_no,
         -- 검수 화면이 「개봉 대상 — 추적기 판정 이력」을 띄우는 값. 기록 함수와 같은 판정(INV-W16)
         public.office_open_target(p.id)
  from public.office_parcels p
  left join public.boxes b on b.id = p.box_id
  left join public.orders o on o.id = b.order_id
  left join public.profiles f on f.id = o.fan_id
  left join public.creators c on c.id = o.creator_id
  left join public.revgift_shares s on s.id = p.share_id
  left join public.revgift_sends d on d.id = s.send_id
  left join public.creators c2 on c2.id = d.creator_id
  left join public.profiles sf on sf.id = s.fan_id
  where p.qr_code = p_qr;
  if not found then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.office_parcel_by_qr(text) from public, anon;
grant execute on function public.office_parcel_by_qr(text) to authenticated;

-- ── 10) 팬 읽기 — 추적기 보관·신고 보관·경찰 인계는 「확인 중」(INV-W14) ─────

-- 그 주문에 추적기 보관·신고 보관·경찰 인계 상자가 있는가 — 팬 읽기가 검수 결과를 「확인 중」으로 바꾸는 판정 하나
create or replace function public.order_has_tracker_box(p_order_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                 where b.order_id = p_order_id and p.state in ('tracker_held', 'report_held', 'police_handed'));
$$;
revoke all on function public.order_has_tracker_box(uuid) from public, anon, authenticated;

-- 20261016000002 과 같고, 검수 결과를 그 판정으로 바꿨다
CREATE OR REPLACE FUNCTION public.my_gifts()
 RETURNS TABLE(order_no text, creator_name text, item_kind text, box_count integer, has_electronics_or_metal boolean, status order_status, registered_at timestamp with time zone, approved_at timestamp with time zone, received_at timestamp with time zone, inspection_result text, inspected_at timestamp with time zone, shipped_at timestamp with time zone, expected_arrival_date date, delivery text, fan_tracking_no text, fan_send_ack_at timestamp with time zone, memo_title text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.order_no, c.name, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal,
         -- decline-block INV-D5 (2026-10-10): 직접 거절·차단 거절은 둘 다 rejected 라 구분되지 않고, 7일 자동 반려(expired)만 따로 보인다
         o.status,
         o.registered_at,
         case when o.status in ('rejected', 'expired') then null else o.approved_at end,
         o.received_at,
         -- INV-W14: 추적기 보관·신고 보관·경찰 인계 상자가 있는 주문은 「확인 중」 하나 — 무엇이 나왔는지·신고했는지는 어디에도 없다
         case when public.order_has_tracker_box(o.id) then 'checking' else o.inspection_result end,
         o.inspected_at, o.shipped_at, o.expected_arrival_date, o.delivery, o.fan_tracking_no,
         o.fan_send_ack_at,
         -- together INV-F8: 보낸 사람 본인 목록에만 선물 이름(나만 보는 메모) — 아래 fan_id = auth.uid() 가 본인 줄만 남긴다
         m.title
  from public.orders o
  join public.creators c on c.id = o.creator_id
  left join public.gift_memos m on m.order_id = o.id
  where o.fan_id = auth.uid() and o.registered_at is not null
  order by o.registered_at desc;
$function$;

-- 20261008000014 와 같고, 상자 상태의 추적기 보관·신고 보관·경찰 인계를 「확인 중」 하나로 바꿨다
CREATE OR REPLACE FUNCTION public.my_gift_boxes(p_order_no text)
 RETURNS TABLE(box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean, send_ack_needed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.tracking_no,
         case when b.missing_at is not null then 'missing'
              when p.state in ('tracker_held', 'report_held', 'police_handed') then 'checking'
              else coalesce(p.state::text, 'no_waybill') end,
         -- 승인 전이면 「먼저 보내기」를 누른 뒤에만(INV-S9). 거절·반려·취소된 주문은 살려 둔 6자리도 보이지 않는다(INV-C3).
         case when (o.approved_at is not null or o.fan_send_ack_at is not null)
                   and o.status not in ('rejected', 'expired', 'canceled')
              then (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
         o.approved_at is null and o.fan_send_ack_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$function$;

-- 20261011000006 과 같고, 결과에 「확인 중」(추적기 보관·신고 보관·경찰 인계 상자가 있는 진행 중 주문)을 더했다
CREATE OR REPLACE FUNCTION public.my_together_gifts(p_creator_id uuid)
 RETURNS TABLE(order_no text, gift_no integer, registered_on date, item_kind text, item_category text, anniversary_name text, box_count integer, outcome text, stage text, approved boolean, shipped_on date, has_photo boolean, photo_version integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.order_no,
         (row_number() over (order by o.registered_at, o.order_no))::integer,
         public.receiving_today_at(o.registered_at),
         o.item_kind, o.item_category, o.anniversary_name,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         case when o.status = 'rejected' then 'declined'
              when o.status = 'expired' then 'expired'
              when public.order_has_tracker_box(o.id) then 'checking'
              when o.inspection_result = 'returned' then 'returned'
              else 'in_progress' end,
         case when o.delivery = 'delivered' then 'delivered'
              when o.delivery = 'in_transit' then 'in_transit'
              when o.shipped_at is not null then 'shipped'
              when o.inspection_result = 'passed' then 'inspected'
              when o.received_at is not null then 'received'
              else 'registered' end,
         (o.approved_at is not null and o.status not in ('rejected', 'expired')),
         public.receiving_today_at(o.shipped_at),
         (g.order_id is not null),
         coalesce(g.version, 0)
  from public.orders o
  left join public.gift_photos g on g.order_id = o.id
  where o.fan_id = auth.uid()
    and o.creator_id = p_creator_id
    and public.together_counted(o.registered_at, o.status)
  order by o.registered_at desc, o.order_no desc;
$function$;

-- 20261016000006 과 같고, 추가 결제 카드에서 추적기 보관·신고 보관·경찰 인계 상자를 뺐다(나가지 않는 상자 — prepare_difference_payment 와 같은 판정)
CREATE OR REPLACE FUNCTION public.my_action_items()
 RETURNS TABLE(kind text, order_no text, box_id uuid, box_label text, box_seq smallint, creator_name text, tier text, measured_tier text, amount_krw integer, due_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with mine as (
    select auth.uid() as uid
  ),
  cards as (
    -- 추가 결제 — prepare_difference_payment 가 받아 주는 상태
    select 'difference'::text as kind, o.order_no, b.id as box_id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end as box_label,
           b.seq as box_seq, c.name as creator_name, b.declared_tier::text as tier, b.measured_tier::text as measured_tier,
           p.amount_krw, p.created_at + interval '168 hours' as due_at
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.payments p on p.order_id = o.id and p.kind = 'difference'
    join public.boxes b on b.id = p.box_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels op on op.box_id = b.id
    where p.status in ('pending', 'failed')
      and p.expired_at is null
      and now() < p.created_at + interval '168 hours'
      and o.status not in ('rejected', 'expired', 'canceled')
      and (op.state is null or op.state not in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped',
                                                'tracker_held', 'report_held', 'police_handed'))

    union all

    -- 도착하지 않은 상자 — 「아직 도착하지 않은 상자」 알림 조건 + find_held_parcel 이 받아 주는 상태
    select 'missing_box', o.order_no, b.id,
           o.order_no || case when (select count(*) from public.boxes bx where bx.order_id = o.id) > 1 then '-' || b.seq else '' end,
           b.seq, c.name, b.declared_tier::text, null::text, null::integer, o.registered_at + interval '720 hours'
    from mine
    join public.orders o on o.fan_id = mine.uid
    join public.boxes b on b.order_id = o.id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is not null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '336 hours'
      and b.missing_at is null
      and not exists (select 1 from public.office_parcels op where op.box_id = b.id and op.state <> 'awaiting')

    union all

    -- 역조공 받기 — decline_revgift·accept_revgift 가 받아 주는 상태
    select 'revgift', s.order_no, null::uuid, null::text, null::smallint, coalesce(cr.name, cp.nickname), s.tier::text, null::text, null::integer,
           public.revgift_deadline(d.settled_at)
    from mine
    join public.revgift_shares s on s.fan_id = mine.uid
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    where d.status = 'done'
      and s.reply = 'waiting'
      and s.returned_at is null
      and s.cancelled_at is null
      and now() < public.revgift_deadline(d.settled_at)
  )
  select kind, order_no, box_id, box_label, box_seq, creator_name, tier, measured_tier, amount_krw, due_at
  from cards
  order by due_at, order_no, box_seq;
$function$;

-- 20261012000011 과 같고, 추적기 보관·신고 보관·경찰 인계 상자도 막는다(나가지 않는 상자)
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
     or v_state in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped', 'tracker_held', 'report_held', 'police_handed') then
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
  if v_state in ('return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped', 'tracker_held', 'report_held', 'police_handed') then
    return false;
  end if;
  update public.payments set status = 'confirming', confirming_at = now() where id = v_pay.id;
  return true;
end $function$;

-- ── 11) 크리에이터 읽기 ──────────────────────────────────────

-- 20261016000012 와 같고, 추적기 보관·신고 보관·경찰 인계를 반송처럼 「남은 상자」에서 빼고, 그 상자가 있으면 검수 결과를 「보관」(held)으로(INV-W9).
CREATE OR REPLACE FUNCTION public.my_incoming_gifts()
 RETURNS TABLE(order_no text, sender_nickname text, box_count integer, stage text, paid_at timestamp with time zone, received_at timestamp with time zone, inspected_at timestamp with time zone, shipped_at timestamp with time zone, inspection_result text, delivery text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with mine as (
    select o.*,
           -- 반송되지 않은 상자들의 가장 늦은 단계(주문 상태 계산과 같은 순서) — 0 입고 전 · 1 입고 · 3 검수 완료 · 5 출고
           (select min(case p.state
                         when 'received' then 1 when 'labeled' then 1 when 'held' then 1
                         when 'inspected' then 3 when 'label_printed' then 3
                         when 'shipped' then 5
                         else 0 end)
            from public.boxes b left join public.office_parcels p on p.box_id = b.id
            where b.order_id = o.id and b.missing_at is null
              and (p.state is null or p.state not in ('return_waiting', 'return_printed', 'returned', 'tracker_held', 'report_held', 'police_handed'))) as live_min,
           -- 남은 상자가 있고 그 전부가 반송(반송 대기 포함)·추적기 보관인가
           exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id
                   where b.order_id = o.id and b.missing_at is null
                     and p.state in ('return_waiting', 'return_printed', 'returned', 'tracker_held', 'report_held', 'police_handed'))
           and not exists (select 1 from public.boxes b left join public.office_parcels p on p.box_id = b.id
                           where b.order_id = o.id and b.missing_at is null
                             and (p.state is null or p.state not in ('return_waiting', 'return_printed', 'returned', 'tracker_held', 'report_held', 'police_handed'))) as all_returned,
           public.order_has_tracker_box(o.id) as any_tracker
    from public.orders o
    join public.creators c on c.id = o.creator_id
    join public.profiles me on me.id = c.profile_id
    where c.profile_id = auth.uid()
      and me.role = 'creator'
      and o.registered_at is not null
      and o.status <> 'pending_payment'
  ),
  staged as (
    select m.*,
           case
             when m.status in ('rejected', 'expired', 'canceled') then 'closed'
             when m.all_returned then 'returned'
             when m.delivery = 'delivered' then 'delivered'
             when m.delivery = 'in_transit' then 'in_transit'
             when m.live_min = 5 or m.status = 'shipped' then 'shipped'
             when m.live_min = 3 then 'inspected'
             when m.live_min = 1 then 'received'
             -- 남은 상자가 없으면(전부 닫힘) 주문 상태로
             when m.live_min is null and m.status in ('inspected', 'label_printed') then 'inspected'
             when m.live_min is null and m.status in ('received', 'labeled') then 'received'
             else 'paid'
           end as stage
    from mine m
  )
  select m.order_no,
         f.nickname,
         (select count(*)::integer from public.boxes b where b.order_id = m.id),
         m.stage,
         m.registered_at,
         m.received_at,
         m.inspected_at,
         m.shipped_at,
         case
           -- 위치 추적기 상자: 신고를 고르는 동안·신고 보관·경찰 인계 뒤에는 보관(INV-W9·W14), 반송 대기로 넘어가면 아래 반송
           when m.any_tracker then 'held'
           when m.all_returned or (m.live_min is null and m.inspection_result = 'returned') then 'returned'
           when m.stage in ('inspected', 'shipped', 'in_transit', 'delivered') then 'passed'
           else null
         end,
         m.delivery
  from staged m
  join public.profiles f on f.id = m.fan_id
  order by m.registered_at desc;
$function$;

-- 20261016000009 와 같고, 「추적 장치 발견」(tracker) 줄을 더했다(action-center INV-J5): 추적기 보관 · 운영자 처리 전 · 기한(검수 완료 + 168시간) 전.
-- 주문이 끝나도 남는다(INV-W14). 받은 선물 판의 순서는 추적 장치 발견 → 블루투스 발견 → 승인 요청, 각각 기한이 짧은 순.
CREATE OR REPLACE FUNCTION public.my_creator_action_items()
 RETURNS TABLE(kind text, board text, order_no text, request_id text, share_id uuid, box_id uuid, box_seq integer, box_count integer, box_label text, nickname text, item_kind text, tier text, measured_tier text, amount_krw integer, has_electronics_or_metal boolean, bluetooth boolean, rf boolean, choice text, sent_at timestamp with time zone, received_at timestamp with time zone, due_at timestamp with time zone, prior_gift_count integer, prior_passed_count integer, prior_returned_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select p.id as uid from public.profiles p where p.id = auth.uid() and p.role = 'creator'
  ),
  lines as (
    -- 추적 장치 발견 / 블루투스 발견: 그 일을 받아 주는 고르기(choose_creator_check)와 같은 판정 —
    -- 추적기 보관 · 운영자 처리 전 · 기한 전(주문이 끝나도) / 확인 대기 · 운영자 처리 전 · 기한 전 · 주문 진행 중 · 나갈 수 있는 상자
    select case when k.kind = 'tracker' then 'tracker' else 'bluetooth' end::text as kind, 'received'::text as board, o.order_no, null::text as request_id,
           null::uuid as share_id, b.id as box_id,
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
    where k.answer is null and now() < x.inspected_at + interval '168 hours'
      and ((k.kind = 'tracker' and x.state = 'tracker_held')
           or (k.kind = 'confirm' and x.state = 'held'
               and o.status not in ('rejected', 'expired', 'canceled') and not public.office_parcel_dead(x)))

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
  order by (l.board = 'sent'),
           case l.kind when 'tracker' then 0 when 'bluetooth' then 1 else 2 end,
           case when l.board = 'received' then l.due_at else l.sent_at end,
           -- 같은 시각이면 받은 선물은 주문번호·상자 순, 보낸 선물은 몫(상자) id 순
           case when l.board = 'received' then l.order_no end, l.box_seq, coalesce(l.share_id, l.box_id);
$function$;

-- ── 12) 환불 금액 · 크리에이터 사정으로 취소 (payment INV-M8·M9·M21) ──────

-- 20261012000011 과 같고, 크리에이터 사정으로 취소된 주문(취소 기록 kind = 'creator')은 거절·반려 줄을 탄다 — 검수비를 빼지 않는다.
-- 추적기 보관·신고 보관·경찰 인계 상자는 검수 결론이 hold 라 지금처럼 검수에 걸린 상자(0)다.
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
    -- 끝난 주문의 차액 결제: 입고 뒤 취소는 그 결제의 검수비·배송비 칸, 거절·반려·크리에이터 사정 취소는 배송비 칸을 뺀다
    when o.status = 'canceled' and not cc.creator then greatest(p.amount_krw - p.inspection_fee_krw - p.shipping_fee_krw, 0)
    when o.status in ('rejected', 'expired', 'canceled') then p.amount_krw - p.shipping_fee_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    else null
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  cross join lateral (
    -- 크리에이터 사정으로 취소(INV-M21) — 팬 탓이 아니라 거절·반려와 같은 줄
    select exists (select 1 from public.order_cancellations x where x.order_id = o.id and x.kind = 'creator') as creator
  ) cc
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
        -- 검수에 걸림(반송·추적기 보관·중형 초과 실측·크리에이터가 돌려보냄·확인 기한 지남): 검수 불합격 줄 — 상품 대금 칸만인데 상자에는 그 칸이 없다(0)
        when b.measured_tier = 'oversize'
             or exists (select 1 from public.office_parcels x join public.office_inspections i on i.parcel_id = x.id
                        where x.box_id = b.id and i.outcome in ('return', 'hold'))
             or exists (select 1 from public.office_parcels x join public.office_creator_checks k on k.parcel_id = x.id
                        where x.box_id = b.id and k.kind = 'confirm' and k.answer in ('return', 'expired')) then 0
        -- 입고 뒤 취소(INV-M17): 검수비·배송비 칸을 뺀다
        when o.status = 'canceled' and not cc.creator then b.price_krw - b.inspection_fee_krw - b.shipping_fee_krw
        -- 입고 뒤 거절·반려·크리에이터 사정 취소(INV-M21): 배송비 칸을 뺀다
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

-- INV-M21: 대표만. 출고 전 진행 중 주문(상자가 아직 하나도 오지 않았어도). 사유 1~200자, 취소 기록 한 줄(kind = 'creator').
-- 오류 꼴은 입고 뒤 취소와 같다: 42501 대표 아님 · 22023 사유 · P0002 없는 주문이거나 취소할 수 있는 주문이 아님(출고·송장 출력·이미 끝남).
-- 잠금은 INV-W12 순서(상자 줄 → 승인 요청 → 주문 → 6자리 → 사무소 상자 줄) — admin_cancel_received_gift 와 같다.
create or replace function public.admin_cancel_for_creator(p_order_no text, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_order_id uuid;
begin
  if not public.is_owner() then
    raise exception '크리에이터 사정으로 취소는 대표만 한다' using errcode = '42501';
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
  -- 6자리 줄은 주문 뒤·사무소 상자 줄 앞(INV-W12) — 아래 취소가 트리거로 6자리를 무효로 하거나 살려 둔다(INV-M18)
  perform 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id
  where b.order_id = v_order_id order by c.id for update of c;
  perform 1 from public.office_parcels x join public.boxes b on b.id = x.box_id
  where b.order_id = v_order_id order by x.id for update of x;
  update public.orders o
  set status = 'canceled'
  where o.id = v_order_id
    and o.status in ('registered', 'received', 'labeled', 'inspected') and o.shipped_at is null
    -- 출고 송장을 출력한 상자가 하나라도 있으면 취소하지 않는다
    and not exists (select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
                    where b.order_id = o.id and x.state in ('label_printed', 'shipped'));
  if not found then
    raise exception '취소할 수 있는 주문이 아니다' using errcode = 'P0002';
  end if;
  insert into public.order_cancellations (order_id, canceled_by, reason, kind) values (v_order_id, auth.uid(), v_reason, 'creator');
  -- 검수를 마친 상자·크리에이터 확인 대기 상자는 바로 반송 대기로(반려된 주문과 같은 길). 추적기 보관·신고 보관은 그대로(INV-W14)
  update public.office_parcels x
  set state = 'return_waiting'
  from public.boxes b
  where b.id = x.box_id and b.order_id = v_order_id and x.state in ('inspected', 'held');
end $$;

revoke all on function public.admin_cancel_for_creator(text, text) from public, anon;
grant execute on function public.admin_cancel_for_creator(text, text) to authenticated;
