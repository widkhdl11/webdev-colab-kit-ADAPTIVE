-- 상자별 받는 주소 6자리 — 입고 매칭 · 보류 · 찾기 · 「제가 보낸 게 아니에요」 · 읽기 · 상자 도착 알림
-- (docs/specs/inbound-address-code.md INV-C2·C4~C10, office-workflow INV-W1·W5, notifications INV-N14, 카드 d48).
--
-- 입고(office_scan_inbound): 원 송장 바코드 + 6자리. 인자에 주문번호가 없다(INV-C4).
--   그 상자의 주문(역조공은 몫) 줄을 먼저 잠그고 6자리 줄을 잠가 상태를 본다 — 같은 6자리로 두 상자가 동시에 와도 한쪽은 잠금을
--   기다린 뒤 「사용됨」을 본다(INV-C5). 거절·반려와 같은 잠금 순서다(교착 방지 — 입고 함수 위 설명).
--   유효 → 그 상자에 바코드를 묶고 6자리를 사용됨으로, 입고 완료(같은 처리). 그 밖은 전부 보류(미확인 입고, office_unmatched):
--   6자리 없음 · 없는 값 · 무효 · 사용됨 · 이미 다른 상자에 묶인 바코드 · 분쟁 중인 송장번호.
--   사용된 6자리로 또 오면 — 먼저 온 상자가 출고 전이면 그 상자도 멈추고(code_dispute) 둘 다 보류, 출고 뒤면 둘째만 보류 + 도용 의심.
--   보류로 넣을 때는 택배사·이름 앞 1글자·선반 번호가 있어야 한다 — 없으면 아무것도 바꾸지 않고 'need_details' 를 돌려준다.
-- 찾기(find_held_parcel): 주문 주인이 송장번호·택배사·이름 앞 1글자를 넣어 셋 다 맞는 보류 상자를 자기 상자로 잇는다(INV-C4 ②).
--   다른 사람의 6자리가 붙어 온 보류 상자는 그 6자리 주인만 이을 수 있다. 계정마다 24시간에 5번(성공 포함), 실패가 3번 쌓이면 운영자 확인 표시(INV-C10).
-- 운영자가 주문번호로 상자를 잇는 함수는 만들지 않는다(INV-C9) — 옛 match_unmatched · office_record_unmatched 를 없앤다.
--
-- 오류 꼴: 42501 권한 없음 · 22023 입력 꼴 · P0046 확인 문자 불일치 · P0002 대상 없음(남의 것 포함 — 같은 답) · 55000 지금 단계에서 할 수 없음
--          · P0041 출고 조건 불충족(보류 포함) · P0042 부착 확인 전 다음 입고 · P0045 오늘은 더 찾을 수 없음

-- ── 택배사 ──────────────────────────────────────────────

-- 입고 때 직원이 고르고, 찾기 때 팬이 고르는 같은 목록. 택배사 연결(배송 조회) 전까지는 대조용 이름표일 뿐이다.
create function public.inbound_carrier_ok(p_carrier text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_carrier in ('cj', 'post', 'hanjin', 'lotte', 'logen', 'kd', 'daesin', 'ilyang', 'cu', 'gs', 'etc');
$$;

-- ── 보류(미확인 입고) 표 넓히기 (INV-C5·W5) ─────────────────

alter table public.office_unmatched
  add column carrier text check (carrier is null or public.inbound_carrier_ok(carrier)),
  add column reason text not null default 'no_code'
    check (reason in ('no_code', 'unknown_code', 'void_code', 'used_code', 'code_dispute', 'barcode_bound', 'waybill_dispute')),
  -- 붙어 온 6자리(있고 발급된 값일 때) — 그 6자리 주인만 이 상자를 찾을 수 있다
  add column code_id uuid references public.inbound_codes (id) on delete set null,
  add column suspected_theft boolean not null default false;
alter table public.office_unmatched alter column reason drop default;

-- 「제가 보낸 게 아니에요」 기록. 추가만, 상자마다 한 번(INV-C8).
create table public.office_not_mine_reports (
  parcel_id uuid primary key references public.office_parcels (id),
  reported_by uuid not null references public.profiles (id),
  parcel_state public.office_state not null,
  at timestamptz not null default now()
);
alter table public.office_not_mine_reports enable row level security;
revoke all on public.office_not_mine_reports from public, anon, authenticated;
create trigger office_not_mine_reports_no_update before update on public.office_not_mine_reports
  for each row execute function public.append_only_log();
create trigger office_not_mine_reports_no_delete before delete on public.office_not_mine_reports
  for each row execute function public.append_only_log();

-- 찾기 실패가 반복된 계정 — 운영자 확인 대상(INV-C10)
create table public.office_find_flags (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  first_flagged_at timestamptz not null default now(),
  last_flagged_at timestamptz not null default now()
);
alter table public.office_find_flags enable row level security;
revoke all on public.office_find_flags from public, anon, authenticated;

-- ── 상자 도착 알림 (INV-N14 · INV-C8) ─────────────────────

-- 상자 하나에 한 번. 역조공 상자는 주문 줄이 없어 상자 줄을 가리킨다.
alter table public.notification_outbox alter column order_id drop not null;
alter table public.notification_outbox add column parcel_id uuid references public.office_parcels (id) on delete cascade;
alter table public.notification_outbox drop constraint notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived'));
alter table public.notification_outbox add constraint notification_outbox_parcel_kind
  check ((kind = 'box_arrived') = (parcel_id is not null));
alter table public.notification_outbox add constraint notification_outbox_order_kind
  check (order_id is not null or kind = 'box_arrived');
drop index public.notification_outbox_once;
create unique index notification_outbox_once
  on public.notification_outbox (kind, order_id, approval_request_id, parcel_id, round, account_id, channel) nulls not distinct;
alter table public.notification_kakao_templates drop constraint notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check
  check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived'));

-- 20261006000011 의 지킴이와 같고, 줄 이름에 상자 칸을 더했다.
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
    if (new.kind, new.order_id, new.approval_request_id, new.parcel_id, new.round, new.account_id, new.channel, new.event_at, new.created_at)
       is distinct from (old.kind, old.order_id, old.approval_request_id, old.parcel_id, old.round, old.account_id, old.channel, old.event_at, old.created_at) then
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

-- 상자 줄 하나 → 그 주문의 주인(팬 선물은 보낸 팬, 역조공은 보낸 크리에이터)에게 상자 도착 줄. 본문 칸은 없다(INV-N1·C2).
create function public.notification_enqueue_box_arrived(p_parcel_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_account uuid;
  v_count integer;
begin
  select o.id, o.fan_id into v_order_id, v_account
  from public.office_parcels p join public.boxes b on b.id = p.box_id join public.orders o on o.id = b.order_id
  where p.id = p_parcel_id;
  if v_account is null then
    select d.sender_id into v_account
    from public.office_parcels p join public.revgift_shares s on s.id = p.share_id join public.revgift_sends d on d.id = s.send_id
    where p.id = p_parcel_id;
  end if;
  if v_account is null then
    return 0;
  end if;
  insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
  select 'box_arrived', v_order_id, p_parcel_id, 1, v_account, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = 'box_arrived')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 20261006000011 의 꺼내기와 같고, 주문 줄이 없는 상자 도착 줄(역조공)도 꺼내도록 주문번호를 몫에서 찾는다.
create or replace function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid,
  kind text,
  channel text,
  round smallint,
  order_no text,
  nickname text,
  auto_reject_at timestamptz,
  must_deliver boolean,
  attempts integer,
  claimed_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
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
         c.kind = 'approval_request',
         c.attempts,
         c.claimed_at
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $$;

-- 20261006000010 의 실패 목록과 같고, 역조공 상자 도착 줄의 주문번호를 몫에서 찾는다.
create or replace function public.notification_failures(p_limit integer default 100)
returns table (
  kind text,
  order_no text,
  round smallint,
  channel text,
  status text,
  attempts integer,
  error_code text,
  finished_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 볼 수 있다' using errcode = '42501';
  end if;
  return query
  select n.kind, coalesce(o.order_no, rs.order_no), n.round, n.channel, n.status, n.attempts, n.error_code, n.finished_at
  from public.notification_outbox n
  left join public.orders o on o.id = n.order_id
  left join public.office_parcels pp on pp.id = n.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  where n.status in ('failed', 'skipped')
  order by n.finished_at desc, n.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

-- ── 출고 판정: 보류는 출고 목록 밖 (INV-C5·C8) ───────────────

-- 20261006000013 의 출고 조건과 같고, 보류(hold_reason)가 없어야 한다는 조건을 맨 앞에 더했다.
-- 송장 출력·주소 열기(manual 0008~0010)가 이 판정을 그대로 쓴다.
create or replace function public.office_parcel_shippable(p_parcel public.office_parcels)
returns boolean
language sql stable set search_path = ''
as $$
  select p_parcel.hold_reason is null and case
    when p_parcel.box_id is not null then exists (
      select 1 from public.boxes b join public.orders o on o.id = b.order_id
      where b.id = p_parcel.box_id
        and o.approved_at is not null
        and o.status not in ('rejected', 'expired', 'canceled')
        and b.measured_tier is distinct from 'oversize'
        and exists (select 1 from public.approval_requests r where r.order_id = o.id and r.status = 'approved')
        and not exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
    )
    when p_parcel.share_id is not null then exists (
      select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
      where s.id = p_parcel.share_id and d.status = 'done' and s.reply = 'accepted'
        and s.cancelled_at is null and s.returned_at is null
    )
    else false
  end;
$$;

-- 20261005000007 의 출고 확정과 같고, 송장 출력 뒤에 보류가 된 상자(「제가 보낸 게 아니에요」·분쟁)는 확정하지 않는다.
create or replace function public.office_confirm_shipment(p_qr text, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  v := public.office_lock_qr(p_qr);
  if v.state <> 'label_printed' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.outbound_waybill_no is distinct from p_waybill then
    raise exception '이 상자의 송장이 아니다' using errcode = 'P0043';
  end if;
  if v.hold_reason is not null then
    raise exception '보류된 상자는 출고하지 않는다' using errcode = 'P0041';
  end if;
  update public.office_parcels set state = 'shipped', shipped_at = now() where id = v.id;
  insert into public.office_envelope_shreds (parcel_id, shredded_by) values (v.id, auth.uid());
  perform public.office_sync(v.id);
end $$;

-- 20261007000001 의 다음 할 일과 같고, 보류된 상자는 출고 차례(검수 완료·송장 출력)에서 'on_hold' 로 멈춘다.
-- 입고 완료·부착 확인 단계는 그대로 진행한다(라벨 부착 확인 없이는 다음 입고를 받지 않는다 — W2).
create or replace function public.office_next_step(p_parcel public.office_parcels, p_kind text)
returns text
language sql stable set search_path = ''
as $$
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
    when 'return_waiting' then 'print_return'
    when 'return_printed' then 'confirm_return'
    when 'label_printed' then 'confirm_shipment'
    else 'done'
    end
  end;
$$;

-- 20261005000007 의 작업 목록과 같고, 결제 때 미리 만든 '입고 전' 줄 중 나갈 수 없게 된 주문(거절·반려·취소)의 것은 뺀다.
create or replace function public.admin_office_parcels()
returns table (
  qr text, kind text, order_no text, sender_nickname text, receiver_name text, tier text,
  state text, received_at timestamptz, next_step text
)
language sql stable security definer set search_path = ''
as $$
  with units as (
    select p as parcel, 'gift'::text as kind,
           o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end as order_no,
           f.nickname as sender, c.name as receiver, b.declared_tier::text as tier, o.registered_at as at
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    left join public.office_parcels p on p.box_id = b.id
    where (p.id is not null and (p.state <> 'awaiting' or not public.office_parcel_dead(p))) or o.status = 'registered'
    union all
    select p, 'revgift', s.order_no, c.name, f.nickname, s.tier::text, d.settled_at
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    left join public.office_parcels p on p.share_id = s.id
    where (p.id is not null and (p.state <> 'awaiting' or not public.office_parcel_dead(p)))
       or (s.cancelled_at is null and s.reply in ('waiting', 'accepted'))
  )
  select (u.parcel).qr_code, u.kind, u.order_no, u.sender, u.receiver, u.tier,
         coalesce((u.parcel).state::text, 'no_waybill'),
         (u.parcel).received_at,
         public.office_next_step(u.parcel, u.kind)
  from units u
  where public.is_operator()
  order by u.at desc nulls last, u.order_no
  limit 500;
$$;

-- ── 송장번호 등록: 선택, 매칭 열쇠가 아니다 (INV-C7) ──────────

-- 같은 번호가 다른 상자에 있으면 거부하지 않고 두 상자 모두 「같은 송장번호 분쟁」으로 표시한다. 그 번호로 이미 입고된 상자가
-- 출고 전이면 보류한다. 등록한 사람에게는 늘 같은 응답이다 — 남의 송장번호 등록 여부를 떠볼 수 없다.
-- 이 상자에 이미 같은 번호가 등록돼 있으면 아무것도 하지 않는다 — 분쟁을 운영자가 정리한 뒤 같은 번호를 다시 넣어
-- 그 상자를 또 보류시키는 길을 막는다(새로 들어온 상대는 그 상대의 등록·입고 때 이미 분쟁으로 잡힌다).
-- 번호 잠금은 부르는 쪽(set_box_waybill·set_share_waybill, 20261007000010)이 처리 시작에서 먼저 건다 — 여기서 다시 걸어도 같은 잠금이다.
create function public.office_register_tracking(p_parcel_id uuid, p_no text)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_no, 0));
  if exists (select 1 from public.office_parcels x where x.id = p_parcel_id and x.tracking_no = p_no) then
    return;
  end if;
  update public.office_parcels set tracking_no = p_no where id = p_parcel_id;
  if exists (select 1 from public.office_parcels x
             where x.id <> p_parcel_id and (x.tracking_no = p_no or x.inbound_waybill_no = p_no)) then
    update public.office_parcels x set tracking_dispute = true
    where x.id = p_parcel_id or x.tracking_no = p_no or x.inbound_waybill_no = p_no;
    update public.office_parcels x
    set hold_reason = coalesce(x.hold_reason, 'waybill_dispute'), hold_at = coalesce(x.hold_at, now())
    where x.id <> p_parcel_id and x.inbound_waybill_no = p_no and x.state not in ('awaiting', 'shipped', 'returned');
  end if;
end $$;

-- 팬·크리에이터가 상자에 송장번호를 넣는 함수(set_box_waybill·set_share_waybill)는 20261007000010 에 있다 —
-- 계정마다 24시간에 10번 제한(시도 기록 표)과 함께 그 파일에서 다시 만든다.

-- ── 입고 (INV-C4·C5, W1 1행·W2·W5) ───────────────────────

drop function public.office_scan_inbound(text);
drop function public.office_record_unmatched(text, text, text);
drop function public.match_unmatched(uuid, text);

-- 돌려주는 값: {result, qr, order_no, reason}
--   received(입고 완료 + 이 작업자의 부착 대기 라벨) · reprinted(찾기로 이어진 상자의 라벨 다시 출력)
--   · hold(보류로 기록, reason = 보류 사유) · hold_recorded(이미 보류로 기록한 바코드) · need_details(보류인데 택배사·이름 앞 1글자·선반 번호가 없음 — 바뀐 것 없음)
-- 잠금 순서(교착 방지): 바코드 번호 잠금 → (유효한 6자리일 때) 상자 줄 → 승인 요청 줄 → 주문 줄(역조공은 몫 줄) → 6자리 줄 → 상자 작업 줄.
--   거절(decline_gift)·7일 반려(office_run_expiry)·무효 트리거가 승인 요청 → 주문 → 6자리 순서로 잠그므로 같은 순서를 따른다.
--   6자리는 잠그지 않고 먼저 읽어 어느 주문의 것인지 알아낸 뒤, 주문을 잠그고 나서 6자리 줄을 잠가 상태를 다시 본다 —
--   그 사이에 거절·반려가 끝났으면 무효를 보고 보류로 넣는다.
--   승인 요청 줄은 가볍게(for key share) 잠근다 — 입고가 넣는 알림 줄(승인 요청 2차)이 그 줄을 가리켜, 나중에 잡으면 거절이 쥔 잠금과 엇갈린다.
--   사용됨·무효(끝난 상태)인 6자리는 다시 바뀌지 않으므로 주문을 잠그지 않는다.
create function public.office_scan_inbound(
  p_barcode text,
  p_code text,
  p_carrier text default null,
  p_sender_initial text default null,
  p_shelf text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
  c public.inbound_codes;    -- 붙어 온 6자리의 줄
  b public.office_parcels;   -- 이 바코드가 이미 묶인 상자 줄
  f public.office_parcels;   -- 이 6자리로 먼저 들어온 상자 줄
  v public.office_parcels;   -- 이 6자리 상자의 줄
  v_order_id uuid;
  v_reason text;
  v_theft boolean := false;
  v_initial text := upper(btrim(coalesce(p_sender_initial, '')));
  v_shelf text := btrim(coalesce(p_shelf, ''));
  v_order_no text;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_barcode);
  -- INV-C1·C5: 꼴(22023)·확인 문자(P0046)가 틀리면 그 자리에서 거부 — 아무것도 바꾸지 않는다
  v_code := public.inbound_code_parse(p_code);
  if p_carrier is not null and not public.inbound_carrier_ok(p_carrier) then
    raise exception '택배사 값이 아니다' using errcode = '22023';
  end if;
  if char_length(v_initial) > 1 or char_length(v_shelf) > 20 then
    raise exception '발신인은 앞 한 글자, 선반 번호는 1~20자다' using errcode = '22023';
  end if;
  -- W2: 붙였다고 확인하지 않은 라벨이 있으면 다음 상자를 받지 않는다
  if exists (select 1 from public.office_label_pending where operator_id = auth.uid()) then
    raise exception '앞 상자의 라벨 부착을 먼저 확인한다' using errcode = 'P0042';
  end if;
  -- 같은 번호의 입고·송장번호 등록·찾기는 하나씩(모두 처리 시작에서 이 잠금을 먼저 건다)
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_barcode, 0));

  -- 6자리 줄은 아직 잠그지 않고 읽는다. 같은 값이 다시 발급된 적이 있으면 지금 유효한 줄, 없으면 가장 최근 줄.
  if v_code is not null then
    select * into c from public.inbound_codes x
    where x.code = v_code
    order by (x.state = 'valid') desc, coalesce(x.used_at, x.voided_at, x.issued_at) desc
    limit 1;
  end if;

  -- 이 바코드를 이미 묶은 상자 — 바코드를 묶는 처리는 모두 위 번호 잠금을 쥐므로 잠그지 않고 읽어도 바뀌지 않는다
  select * into b from public.office_parcels where inbound_waybill_no = p_barcode;
  if b.id is not null and (c.id is null or (c.box_id is not distinct from b.box_id and c.share_id is not distinct from b.share_id)) then
    -- 같은 상자를 다시 스캔: 찾기로 이어져 라벨이 아직 없는 상자면 라벨을 다시 낸다
    select * into b from public.office_parcels where id = b.id for update;
    if b.state = 'received' and b.labeled_at is null
       and not exists (select 1 from public.office_label_pending where parcel_id = b.id) then
      insert into public.office_label_pending (operator_id, parcel_id) values (auth.uid(), b.id);
      select coalesce(o.order_no, s.order_no) into v_order_no
      from public.office_parcels p
      left join public.boxes bx on bx.id = p.box_id left join public.orders o on o.id = bx.order_id
      left join public.revgift_shares s on s.id = p.share_id
      where p.id = b.id;
      return jsonb_build_object('result', 'reprinted', 'qr', b.qr_code, 'order_no', v_order_no, 'reason', null);
    end if;
    raise exception '이미 처리된 상자다' using errcode = '55000';
  end if;
  if exists (select 1 from public.office_unmatched u where u.waybill_no = p_barcode) then
    return jsonb_build_object('result', 'hold_recorded', 'qr', null, 'order_no', null, 'reason', null);
  end if;

  -- INV-C5: 유효한 6자리면 그 주문(몫)을 먼저 잠그고, 그다음 6자리 줄을 잠가 상태를 다시 본다
  if c.id is not null and c.state = 'valid' and b.id is null then
    if c.box_id is not null then
      select bx.order_id into v_order_id from public.boxes bx where bx.id = c.box_id for key share;
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      perform 1 from public.orders o where o.id = v_order_id for update;
    else
      perform 1 from public.revgift_shares s where s.id = c.share_id for update;
    end if;
    select * into c from public.inbound_codes where id = c.id for update;
  end if;

  if b.id is not null then
    v_reason := 'barcode_bound';
  elsif v_code is null then
    v_reason := 'no_code';
  elsif c.id is null then
    v_reason := 'unknown_code';
  elsif c.state = 'void' then
    v_reason := 'void_code';
  elsif c.state = 'used' then
    -- 먼저 온 쪽이 이기지 않게: 첫 상자가 출고 전이면 그 상자도 멈추고 둘 다 분쟁, 출고 뒤면 둘째만 보류 + 도용 의심
    select * into f from public.office_parcels where id = c.first_parcel_id for update;
    if f.id is not null and f.state = 'shipped' then
      v_reason := 'used_code';
      v_theft := true;
    else
      v_reason := 'code_dispute';
    end if;
  elsif exists (
    -- INV-C7: 이 바코드가 다른 상자의 등록 송장번호이거나 분쟁 중인 번호면 보류
    select 1 from public.office_parcels x
    where x.tracking_no = p_barcode
      and (x.tracking_dispute or x.box_id is distinct from c.box_id or x.share_id is distinct from c.share_id)
  ) then
    v_reason := 'waybill_dispute';
  end if;

  if v_reason is null then
    -- 유효: 바코드를 묶고 6자리를 사용됨으로, 입고 완료 — 한 처리
    select * into v from public.office_parcels x
    where (c.box_id is not null and x.box_id = c.box_id) or (c.share_id is not null and x.share_id = c.share_id)
    for update;
    if v.id is null then
      insert into public.office_parcels (box_id, share_id) values (c.box_id, c.share_id) returning * into v;
    end if;
    if v.state <> 'awaiting' then
      raise exception '이미 입고된 상자다' using errcode = '55000';
    end if;
    update public.office_parcels set inbound_waybill_no = p_barcode, state = 'received', received_at = now()
    where id = v.id returning * into v;
    update public.inbound_codes set state = 'used', used_at = now(), first_parcel_id = v.id where id = c.id;
    insert into public.office_label_pending (operator_id, parcel_id) values (auth.uid(), v.id);
    -- 주문 단계 맞추기(office_sync) 뒤에 알림 줄. 주문 줄은 위에서 이미 잠갔다.
    perform public.office_sync(v.id);
    perform public.notification_enqueue_box_arrived(v.id);
    select coalesce(o.order_no, s.order_no) into v_order_no
    from public.office_parcels p
    left join public.boxes bx on bx.id = p.box_id left join public.orders o on o.id = bx.order_id
    left join public.revgift_shares s on s.id = p.share_id
    where p.id = v.id;
    return jsonb_build_object('result', 'received', 'qr', v.qr_code, 'order_no', v_order_no, 'reason', null);
  end if;

  -- 보류: 대조용 값(택배사·이름 앞 1글자)과 선반 번호가 있어야 기록한다
  if p_carrier is null or char_length(v_initial) <> 1 or char_length(v_shelf) = 0 then
    return jsonb_build_object('result', 'need_details', 'qr', null, 'order_no', null, 'reason', v_reason);
  end if;
  if v_reason = 'code_dispute' and f.id is not null then
    update public.office_parcels
    set hold_reason = coalesce(hold_reason, 'code_dispute'), hold_at = coalesce(hold_at, now())
    where id = f.id;
  end if;
  if v_reason = 'waybill_dispute' then
    update public.office_parcels set tracking_dispute = true where tracking_no = p_barcode;
  end if;
  insert into public.office_unmatched (waybill_no, sender_initial, shelf, recorded_by, carrier, reason, code_id, suspected_theft)
  values (p_barcode, v_initial, v_shelf, auth.uid(), p_carrier, v_reason, c.id, v_theft);
  return jsonb_build_object('result', 'hold', 'qr', null, 'order_no', null, 'reason', v_reason);
end $$;

-- ── 찾기: 「받는 주소 없이 보냈어요」 (INV-C4 ②·C9·C10) ─────────

-- 주문 주인(팬 선물 상자는 보낸 팬, 역조공 몫은 보낸 크리에이터)이 자기 상자 하나를 고르고 송장번호·택배사·보낸 사람 이름 앞 1글자를 넣는다.
-- 결과: 'matched' · 'not_found'(내 상자가 아님·셋 중 하나라도 다름·기한 지남·남의 6자리가 붙은 상자 — 같은 답).
--   · 보류 상자와 셋 다 맞으면 그 상자를 내 상자로 입고(도착 시각 = 보류 기록 시각).
--   · 같은 6자리 분쟁으로 멈춘 내 상자의 바코드가 내 송장번호와 같으면 멈춤을 푼다. 분쟁 상대(보류 상자)가 셋 다 맞으면
--     먼저 와 있던 상자를 주문에서 떼어 내(도용 의심) 보류 상자를 내 상자로 입고한다.
-- 시도는 성공·실패 모두 센다 — 24시간에 5번이 넘으면 P0045. 실패를 오류로 내면 시도 기록이 되돌려지므로 값으로 돌려준다.
create function public.find_held_parcel(
  p_box_id uuid,
  p_share_id uuid,
  p_waybill text,
  p_carrier text,
  p_sender_initial text
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_initial text := upper(btrim(coalesce(p_sender_initial, '')));
  c public.inbound_codes;
  t public.office_parcels;
  u public.office_unmatched;
  v public.office_parcels;
  v_order_id uuid;
  v_result text := 'not_found';
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  perform public.office_check_waybill(p_waybill);
  if num_nonnulls(p_box_id, p_share_id) <> 1 or p_carrier is null or not public.inbound_carrier_ok(p_carrier)
     or char_length(v_initial) <> 1 then
    raise exception '상자 하나와 택배사·보낸 사람 이름 앞 한 글자가 필요하다' using errcode = '22023';
  end if;
  -- 같은 번호의 입고·송장번호 등록·찾기는 하나씩 — 이 번호의 보류 상자를 잇는 동안 같은 바코드의 입고가 끼어들지 않게
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.tracking:' || p_waybill, 0));
  -- INV-C10: 시도 기록과 횟수 확인을 한 처리로 — 같은 계정의 찾기는 하나씩.
  -- 프로필 줄을 잠그지 않고 계정마다 처리 잠금을 쓴다 — 입고가 넣는 알림 줄이 주인 프로필을 가리켜(가벼운 잠금) 줄 잠금과 엇갈린다.
  perform pg_advisory_xact_lock(hashtextextended('fankkuk.find:' || v_uid::text, 0));
  if (select count(*) from public.office_match_attempts a
      where a.profile_id = v_uid and a.at > now() - interval '24 hours') >= 5 then
    raise exception '오늘은 더 찾을 수 없다' using errcode = 'P0045';
  end if;

  -- 잠금 순서(교착 방지 — 입고 함수와 같다): 상자 줄 → 승인 요청 줄 → 주문 줄(역조공은 몫 줄) → 6자리 줄 → 상자 작업 줄
  if p_box_id is not null then
    select b.order_id into v_order_id from public.boxes b join public.orders o on o.id = b.order_id
    where b.id = p_box_id and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
    for update of b;
    if v_order_id is not null then
      perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
      -- 잠근 뒤 조건을 다시 본다 — 그 사이 거절·반려가 끝났으면 찾지 않는다
      perform 1 from public.orders o
      where o.id = v_order_id and o.fan_id = v_uid and o.status in ('registered', 'received', 'labeled', 'inspected')
      for update;
    end if;
  else
    perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_share_id and d.sender_id = v_uid and d.status = 'done' and s.cancelled_at is null
      and s.reply in ('waiting', 'accepted')
    for update of s;
  end if;

  if found then
    select * into c from public.inbound_codes x where x.box_id = p_box_id or x.share_id = p_share_id for update;
    select * into t from public.office_parcels x where x.box_id = p_box_id or x.share_id = p_share_id for update;

    if t.id is not null and t.hold_reason in ('code_dispute', 'waybill_dispute') and t.inbound_waybill_no = p_waybill
       and not exists (select 1 from public.office_not_mine_reports r where r.parcel_id = t.id) then
      update public.office_parcels set hold_reason = null, hold_at = null where id = t.id;
      v_result := 'matched';
    elsif t.id is null or t.state = 'awaiting' or t.hold_reason in ('code_dispute', 'waybill_dispute') then
      select * into u from public.office_unmatched x
      where x.waybill_no = p_waybill and x.carrier = p_carrier and x.sender_initial = v_initial
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
        update public.office_unmatched set matched_parcel_id = v.id, matched_at = now() where id = u.id;
        if c.id is not null then
          update public.inbound_codes
          set state = case when state = 'valid' then 'used' else state end,
              used_at = case when state = 'valid' then now() else used_at end,
              first_parcel_id = v.id
          where id = c.id;
        end if;
        -- 주문 행을 먼저 무겁게 잠근다(office_sync). 알림 줄을 먼저 넣으면 주문 행에 가벼운 잠금이 걸려,
        -- 같은 주문의 상자 둘이 동시에 오면 서로의 가벼운 잠금을 기다리다 교착(40P01)이 난다.
        perform public.office_sync(v.id);
        perform public.notification_enqueue_box_arrived(v.id);
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

-- ── 「제가 보낸 게 아니에요」 (INV-C8) ─────────────────────

-- 주문 주인만, 입고된 뒤 출고 확정 전만. 누르면 그 상자는 보류(출고 목록 밖)가 되고 운영자 확인 목록에 도용 의심으로 남는다.
-- 남의 상자·입고 전 상자는 「없다」(P0002), 출고 확정·반송 확정 뒤는 55000.
create function public.report_not_mine(p_box_id uuid, p_share_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if num_nonnulls(p_box_id, p_share_id) <> 1 then
    raise exception '상자 하나를 고른다' using errcode = '22023';
  end if;
  select p.* into v
  from public.office_parcels p
  left join public.boxes b on b.id = p.box_id
  left join public.orders o on o.id = b.order_id
  left join public.revgift_shares s on s.id = p.share_id
  left join public.revgift_sends d on d.id = s.send_id
  where (p_box_id is not null and p.box_id = p_box_id and o.fan_id = auth.uid())
     or (p_share_id is not null and p.share_id = p_share_id and d.sender_id = auth.uid())
  for update of p;
  if v.id is null or v.state = 'awaiting' then
    raise exception '없는 상자다' using errcode = 'P0002';
  end if;
  if v.state in ('shipped', 'returned') then
    raise exception '출고 확정 뒤에는 할 수 없다' using errcode = '55000';
  end if;
  insert into public.office_not_mine_reports (parcel_id, reported_by, parcel_state)
  values (v.id, auth.uid(), v.state)
  on conflict (parcel_id) do nothing;
  update public.office_parcels
  set hold_reason = coalesce(hold_reason, 'not_mine'), hold_at = coalesce(hold_at, now())
  where id = v.id;
end $$;

-- ── 읽기 ────────────────────────────────────────────────

-- 팬: 내 주문의 상자마다 배송 조회용 송장번호·단계·받는 주소 6자리(INV-C2 — 로그인한 주문 주인에게만, 유효할 때만).
drop function public.my_gift_boxes(text);
create function public.my_gift_boxes(p_order_no text)
returns table (box_id uuid, label text, tier text, waybill_no text, state text, address_code text)
language sql stable security definer set search_path = ''
as $$
  select b.id,
         o.order_no || case when (select count(*) from public.boxes x where x.order_id = o.id) > 1 then '-' || b.seq else '' end,
         b.declared_tier::text, p.tracking_no, coalesce(p.state::text, 'no_waybill'),
         (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid')
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$$;

-- 크리에이터: 내가 보낸 역조공 몫마다 배송 조회용 송장번호·단계·받는 주소 6자리(INV-C2 — 보낸 크리에이터 본인에게만)
drop function public.my_share_boxes();
create function public.my_share_boxes()
returns table (share_id uuid, order_no text, fan_nickname text, tier text, waybill_no text, state text, address_code text)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.order_no, f.nickname, s.tier::text, p.tracking_no, coalesce(p.state::text, 'no_waybill'),
         (select c.code from public.inbound_codes c where c.share_id = s.id and c.state = 'valid')
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles f on f.id = s.fan_id
  left join public.office_parcels p on p.share_id = s.id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$$;

-- 운영자 확인 목록(INV-C9·W5·W7): 보류 상자(미확인 입고) + 보류가 걸린 상자 줄. 도착 시각·원 송장 바코드·택배사·보류 사유·
-- 발신인 앞 한 글자(+ 선반 번호·봉투 번호)만. 주문번호·닉네임·6자리는 돌려주지 않는다.
drop function public.admin_unmatched_parcels();
create function public.admin_unmatched_parcels()
returns table (
  id uuid, source text, qr text, waybill_no text, carrier text, arrived_at timestamptz, sender_initial text, shelf text,
  reason text, suspected_theft boolean, state text, deadline_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select u.id, 'unmatched'::text, null::text, u.waybill_no, u.carrier, u.arrived_at, u.sender_initial, u.shelf,
           u.reason, u.suspected_theft,
           case when u.matched_parcel_id is not null then 'matched' when u.expired_at is not null then 'expired' else 'waiting' end,
           u.arrived_at + interval '168 hours'
    from public.office_unmatched u
    union all
    select p.id, 'parcel', p.qr_code, p.inbound_waybill_no, null, p.received_at, null, null,
           p.hold_reason,
           p.hold_reason in ('not_mine', 'detached') or exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
           'on_hold', null::timestamptz
    from public.office_parcels p
    where p.hold_reason is not null
  ) h (id, source, qr, waybill_no, carrier, arrived_at, sender_initial, shelf, reason, suspected_theft, state, deadline_at)
  where public.is_operator()
  order by (h.state in ('waiting', 'on_hold')) desc, h.arrived_at desc nulls last
  limit 500;
$$;

-- 찾기 실패가 반복된 계정(INV-C10) — 운영자만. 사람은 닉네임으로만.
create function public.admin_find_flags()
returns table (nickname text, failures_24h integer, last_flagged_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select pr.nickname,
         (select count(*) from public.office_match_attempts a
          where a.profile_id = f.profile_id and not a.matched and a.at > now() - interval '24 hours')::integer,
         f.last_flagged_at
  from public.office_find_flags f
  join public.profiles pr on pr.id = f.profile_id
  where public.is_operator()
  order by f.last_flagged_at desc
  limit 200;
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.inbound_carrier_ok(text) from public, anon, authenticated;
revoke all on function public.notification_enqueue_box_arrived(uuid) from public, anon, authenticated, service_role;
revoke all on function public.office_register_tracking(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.office_scan_inbound(text, text, text, text, text) from public, anon;
revoke all on function public.find_held_parcel(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.report_not_mine(uuid, uuid) from public, anon;
revoke all on function public.my_gift_boxes(text) from public, anon;
revoke all on function public.my_share_boxes() from public, anon;
revoke all on function public.admin_unmatched_parcels() from public, anon;
revoke all on function public.admin_find_flags() from public, anon;

grant execute on function public.office_scan_inbound(text, text, text, text, text) to authenticated;
grant execute on function public.find_held_parcel(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.report_not_mine(uuid, uuid) to authenticated;
grant execute on function public.my_gift_boxes(text) to authenticated;
grant execute on function public.my_share_boxes() to authenticated;
grant execute on function public.admin_unmatched_parcels() to authenticated;
grant execute on function public.admin_find_flags() to authenticated;
