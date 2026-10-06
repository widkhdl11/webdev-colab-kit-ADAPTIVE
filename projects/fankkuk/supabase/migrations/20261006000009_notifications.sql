-- 알림 — DB 층 (docs/specs/notifications.md INV-N2~N13, 카드 d33).
--
-- 1) 발송 대기 줄 표: 사건 하나·받는 계정 하나·통로 하나에 한 줄. 연락처·본문 칸은 없다(INV-N10).
--    줄은 사건(결제 완료·주문 상태 전환·보관)을 일으킨 함수 안에서, 같은 처리로 생긴다(INV-N4). 화면 쪽 키는 읽지도 쓰지도 못하고,
--    앱 서버 키도 직접 넣거나 고치지 못한다 — 아래 일꾼 함수로만 움직인다.
-- 2) 카카오 템플릿 설정 표: 종류 → 승인된 템플릿 코드. 코드가 없는 종류는 카카오 줄을 만들지 않는다(INV-N7).
-- 3) 사건 자리: settle_payment(승인 요청 1차) · office_sync_order(첫 입고 때 승인 요청 2차, 주문 상태가 입고·검수·출고로 바뀔 때 팬) ·
--    office_scan_inspect(보관 — 크리에이터, INV-N13). 받는 계정은 DB 가 주문에서 고른다(INV-N3).
--    배송중·수령은 배송 칸을 쓰는 함수가 없어 만들지 않는다(INV-N12 — 택배사 연결 때 그 함수 안에서 더한다).
-- 4) 3차 재알림(결제 완료 + 72시간, INV-N8)과 보내는 일꾼 함수(꺼내기·끝내기·멈춘 줄 정리, INV-N5). 모두 앱 서버 키 전용.
-- 5) 가짜 발송 표시는 local_dev_flags 에 'allow_fake_notifications' 줄이 있는 DB 에서만 받는다(INV-N11 — 그 줄은 로컬 seed 만 넣는다).
-- 연락처(휴대폰·이메일)를 읽는 함수는 개인정보 구역을 읽으므로 supabase/manual/0011_notification_contact.sql 에 따로 있다(사람이 적용).

-- ── 가짜 발송 허용 줄 ────────────────────────────────────

alter table public.local_dev_flags drop constraint local_dev_flags_flag_check;
alter table public.local_dev_flags add constraint local_dev_flags_flag_check
  check (flag in ('allow_fake_signatures', 'allow_fake_notifications'));

-- ── 표 ──────────────────────────────────────────────────

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold')),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- 승인 요청 종류만 그 요청을 가리킨다(INV-N8 — 꺼낼 때 아직 대기인지 본다)
  approval_request_id uuid references public.approval_requests (id) on delete cascade,
  -- 재알림 차례. 승인 요청만 1~3, 나머지는 1
  round smallint not null default 1,
  account_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('kakao', 'email')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  event_at timestamptz not null,
  finished_at timestamptz,
  -- 대행사가 돌려준 발송 번호. 오류는 코드만(문장은 번호를 되풀이할 수 있어 저장하지 않는다, INV-N10)
  provider_message_id text check (provider_message_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  error_code text check (error_code ~ '^[a-z][a-z0-9_]{0,39}$'),
  fake boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'approval_request') = (approval_request_id is not null)),
  check (round between 1 and 3 and (kind = 'approval_request' or round = 1)),
  check ((status = 'sending') = (claimed_at is not null)),
  check ((status in ('sent', 'failed', 'skipped')) = (finished_at is not null))
);

-- 멱등 키: 종류 + 대상(주문·승인 요청) + 차례 + 받는 계정 + 통로 (INV-N4)
create unique index notification_outbox_once
  on public.notification_outbox (kind, order_id, approval_request_id, round, account_id, channel) nulls not distinct;
create index notification_outbox_due on public.notification_outbox (next_attempt_at) where status = 'pending';
create index notification_outbox_sending on public.notification_outbox (claimed_at) where status = 'sending';

create table public.notification_kakao_templates (
  kind text primary key check (kind in ('approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold')),
  template_code text not null check (template_code ~ '^[A-Za-z0-9_-]{1,64}$'),
  updated_at timestamptz not null default now()
);

alter table public.notification_outbox enable row level security;
alter table public.notification_kakao_templates enable row level security;
-- 정책은 만들지 않는다. 화면 쪽 키는 표 권한부터 없다(INV-N10).
revoke all on public.notification_outbox, public.notification_kakao_templates from public, anon, authenticated;
-- 앱 서버 키는 발송 기록을 읽기만 한다 — 줄을 넣고 움직이는 것은 아래 함수뿐이다(INV-N3 「받는 사람을 고르는 길은 없다」).
revoke insert, update, delete, truncate on public.notification_outbox from service_role;

-- ── 줄 지킴이: 끝 상태·이름·상태 전환·가짜 표시 ───────────

create function public.notification_outbox_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.attempts <> 0 then
      raise exception '발송 대기 줄은 대기로만 생긴다' using errcode = '23514';
    end if;
  else
    -- INV-N5: 보냄·실패·건너뜀은 끝이다
    if old.status in ('sent', 'failed', 'skipped') then
      raise exception '끝난 발송 줄은 바꿀 수 없다' using errcode = '55000';
    end if;
    -- 줄의 이름(멱등 키)과 사건 시각은 바꾸지 않는다
    if (new.kind, new.order_id, new.approval_request_id, new.round, new.account_id, new.channel, new.event_at, new.created_at)
       is distinct from (old.kind, old.order_id, old.approval_request_id, old.round, old.account_id, old.channel, old.event_at, old.created_at) then
      raise exception '발송 줄의 이름은 바꿀 수 없다' using errcode = '55000';
    end if;
    -- 대기 → 보내는 중 → 보냄/실패/건너뜀. 보내는 중 → 대기(다시 보냄). 꺼낼 때 끝난 승인 요청은 대기 → 건너뜀.
    if not (
      (old.status = 'pending' and new.status in ('pending', 'sending', 'skipped'))
      or (old.status = 'sending' and new.status in ('pending', 'sent', 'failed', 'skipped'))
    ) then
      raise exception '발송 줄 상태를 % 에서 % 로 바꿀 수 없다', old.status, new.status using errcode = '55000';
    end if;
  end if;
  -- INV-N11: 가짜 표시는 허용 줄이 있는 DB(로컬 — seed.sql 이 넣는다)에서만
  if new.fake and not exists (select 1 from public.local_dev_flags where flag = 'allow_fake_notifications') then
    raise exception '가짜 발송 표시는 이 DB 에서 받지 않는다' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger notification_outbox_guard
  before insert or update on public.notification_outbox
  for each row execute function public.notification_outbox_guard();

-- ── 줄 넣기(사건 처리 안에서만 부른다) ────────────────────

-- 이메일 줄은 늘 만들고, 그 종류의 승인된 템플릿 코드가 있으면 카카오 줄도 만든다(INV-N7).
-- 받는 계정이 없으면(계정 없는 크리에이터) 아무 줄도 만들지 않는다(INV-N3). 같은 이름의 줄이 있으면 그대로 둔다(INV-N4).
create function public.notification_enqueue(
  p_kind text,
  p_order_id uuid,
  p_request_id uuid,
  p_round smallint,
  p_account_id uuid,
  p_event_at timestamptz
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_account_id is null then
    return;
  end if;
  insert into public.notification_outbox (kind, order_id, approval_request_id, round, account_id, channel, event_at)
  select p_kind, p_order_id, p_request_id, p_round, p_account_id, ch.channel, p_event_at
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = p_kind)
  on conflict do nothing;
end $$;

-- ── 사건 자리 1: 결제 완료 → 승인 요청 1차 ────────────────

-- 20261005000010_decline_block.sql 의 settle_payment 와 같고, 승인 요청 줄을 넣은 자리에서 크리에이터 몫 알림 줄을 더했다.
create or replace function public.settle_payment(p_toss_order_id text, p_status payment_status, p_payment_key text, p_request_id text, p_payload text, p_requested_at timestamp with time zone)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
  v_request_id uuid;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'settle_payment 는 done 또는 failed 만' using errcode = '22023';
  end if;

  update public.payments
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = now()
  where toss_order_id = p_toss_order_id and status in ('pending', 'confirming')
  returning * into v_payment;

  if not found then
    return false;
  end if;

  if p_status = 'done' and v_payment.kind = 'initial' then
    update public.orders set status = 'registered', registered_at = p_requested_at
    where id = v_payment.order_id and status = 'pending_payment';
    if found then
      insert into public.approval_requests (request_id, order_id, payload, created_at)
      values (p_request_id, v_payment.order_id, p_payload, p_requested_at)
      returning id into v_request_id;
      -- 알림 INV-N3·N8: 승인 요청 1차는 그 주문의 크리에이터 계정에게
      perform public.notification_enqueue('approval_request', v_payment.order_id, v_request_id, 1::smallint,
        (select c.profile_id from public.orders o join public.creators c on c.id = o.creator_id where o.id = v_payment.order_id),
        p_requested_at);
    else
      update public.orders set registered_at = p_requested_at
      where id = v_payment.order_id and status = 'rejected' and registered_at is null;
    end if;
  end if;
  return true;
end $$;

-- ── 사건 자리 2: 주문 상태 전환 → 입고·검수·출고(팬), 첫 입고 → 승인 요청 2차(크리에이터) ──

-- 20261005000007_office_workflow.sql 의 office_sync_order 와 같고 두 가지를 더했다.
--   · 맨 앞에서 주문 줄을 잠근다 — 같은 주문의 상자 둘이 동시에 움직여도 바뀌기 전 상태를 한 번씩만 본다(INV-N4).
--   · 바뀐 뒤 상태와 비교해 넘은 단계마다 알림 줄을 넣는다(주문 단위로 한 번, INV-N3).
create or replace function public.office_sync_order(p_order_id uuid)
returns void
language plpgsql set search_path = ''
as $$
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

  select coalesce(min(case p.state
           when 'received' then 1 when 'labeled' then 2
           when 'inspected' then 3 when 'return_waiting' then 3 when 'return_printed' then 3
           when 'label_printed' then 4 when 'shipped' then 5
           when 'held' then null when 'returned' then null
           else 0 end) filter (where p.state is null or p.state not in ('held', 'returned')), 3),
         bool_or(p.state in ('return_waiting', 'return_printed', 'returned'))
    into v_min, v_returned
  from public.boxes b left join public.office_parcels p on p.box_id = b.id
  where b.order_id = p_order_id;

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
end $$;

-- ── 사건 자리 3: 보관(추적 장치) → 크리에이터 (INV-N13) ────

-- 20261005000007_office_workflow.sql 의 office_scan_inspect 와 같고, 보관 기록 줄을 넣은 자리에서 크리에이터 몫 알림 줄을 더했다.
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
  v_next := case
    when v_outcome = 'hold' then 'held'
    when v_outcome = 'return' or public.office_parcel_dead(v) then 'return_waiting'
    else 'inspected'
  end;
  update public.office_parcels set state = v_next, inspected_at = now() where id = v.id;
  if v_next = 'held' then
    insert into public.office_hold_alerts (parcel_id, creator_id)
    select v.id, o.creator_id from public.boxes b join public.orders o on o.id = b.order_id where b.id = v.box_id;
    -- 알림 INV-N13: 그 주문의 크리에이터 계정에게 주문 단위로 한 번. 팬에게는 보관 알림이 없다.
    perform public.notification_enqueue('hold', o.id, null, 1::smallint, c.profile_id, now())
    from public.boxes b join public.orders o on o.id = b.order_id join public.creators c on c.id = o.creator_id
    where b.id = v.box_id;
  end if;
  perform public.office_sync(v.id);
  return v_next::text;
end $$;

-- ── 3차 재알림 (INV-N8) ──────────────────────────────────

-- 결제 완료 시각(registered_at, 7일 반려와 같은 시계) + 72시간이 지난 대기 승인 요청마다 3차 줄. 몇 번 불러도 차례마다 한 줄(INV-N4).
create function public.notification_enqueue_due()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.notification_outbox where kind = 'approval_request' and round = 3;
  perform public.notification_enqueue('approval_request', o.id, r.id, 3::smallint, c.profile_id, now())
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  where r.status = 'waiting'
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.registered_at <= now() - interval '72 hours';
  select count(*) into v_after from public.notification_outbox where kind = 'approval_request' and round = 3;
  return v_after - v_before;
end $$;

-- ── 보내는 일꾼 (INV-N5) ─────────────────────────────────

-- 꺼내기: 대기이고 다음 시도 시각이 된 줄을 잠그고 「대기인 줄만」 보내는 중으로 바꾼다. 같은 줄을 둘이 꺼내려 하면
-- 늦은 쪽은 잠금을 기다린 뒤 그 줄이 더는 대기가 아니라서 빈손으로 돌아간다.
-- 승인 요청 종류는 요청이 아직 대기가 아니면 보내지 않고 건너뜀으로 끝낸다(INV-N8).
-- 돌려주는 값은 본문에 쓸 값뿐이다(INV-N1): 종류·차례·주문번호·받는 사람 닉네임·자동 반려 예정 시각(승인 요청만)·꼭 가는 알림 여부.
create function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid,
  kind text,
  channel text,
  round smallint,
  order_no text,
  nickname text,
  auto_reject_at timestamptz,
  must_deliver boolean,
  attempts integer
)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with picked as (
    select n.id,
           (n.kind = 'approval_request' and not exists (
              select 1 from public.approval_requests r where r.id = n.approval_request_id and r.status = 'waiting')) as closed
    from public.notification_outbox n
    where n.status = 'pending' and n.next_attempt_at <= now()
    order by n.next_attempt_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of n
  ), skipped as (
    update public.notification_outbox n
    set status = 'skipped', error_code = 'request_not_waiting', finished_at = now()
    from picked p
    where n.id = p.id and p.closed and n.status = 'pending'
    returning n.id
  ), claimed as (
    update public.notification_outbox n
    set status = 'sending', claimed_at = now()
    from picked p
    where n.id = p.id and not p.closed and n.status = 'pending'
    returning n.*
  )
  select c.id, c.kind, c.channel, c.round, o.order_no, pr.nickname,
         case when c.kind = 'approval_request' then o.registered_at + interval '168 hours' end,
         c.kind = 'approval_request',
         c.attempts
  from claimed c
  join public.orders o on o.id = c.order_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $$;

-- 다시 보낼 간격: 1분 · 4분 · 16분 · 64분 (실패한 횟수가 늘수록)
create function public.notification_retry_or_fail(p_row public.notification_outbox, p_error_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_attempts integer := p_row.attempts + 1;
  v_status text;
begin
  v_status := case when v_attempts >= 5 or now() >= p_row.event_at + interval '24 hours' then 'failed' else 'pending' end;
  update public.notification_outbox
  set status = v_status,
      attempts = v_attempts,
      error_code = p_error_code,
      claimed_at = null,
      next_attempt_at = case when v_status = 'pending' then now() + interval '1 minute' * power(4, v_attempts - 1) else next_attempt_at end,
      finished_at = case when v_status = 'failed' then now() end
  where id = p_row.id and status = 'sending';
  return v_status;
end $$;

-- 끝내기: 보내는 중인 줄만. p_outcome = sent(보냄) · skipped(건너뜀 — 이유 코드) · error(이번 시도 실패 — 다시 보내거나 실패로 끝남).
-- 돌려주는 값은 줄의 새 상태.
create function public.notification_finish(
  p_id uuid,
  p_outcome text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_fake boolean default false
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.notification_outbox;
begin
  select * into v from public.notification_outbox n where n.id = p_id for update;
  if v.id is null or v.status <> 'sending' then
    raise exception '보내는 중인 줄이 아니다' using errcode = '55000';
  end if;
  if p_outcome = 'sent' then
    update public.notification_outbox
    set status = 'sent', provider_message_id = p_provider_message_id, fake = coalesce(p_fake, false),
        claimed_at = null, finished_at = now(), error_code = null
    where id = p_id;
    return 'sent';
  elsif p_outcome = 'skipped' then
    if p_error_code is null then
      raise exception '건너뛴 이유 코드가 없다' using errcode = '22023';
    end if;
    update public.notification_outbox
    set status = 'skipped', error_code = p_error_code, claimed_at = null, finished_at = now()
    where id = p_id;
    return 'skipped';
  elsif p_outcome = 'error' then
    if p_error_code is null then
      raise exception '오류 코드가 없다' using errcode = '22023';
    end if;
    return public.notification_retry_or_fail(v, p_error_code);
  end if;
  raise exception '끝내기 결과는 sent · skipped · error 중 하나' using errcode = '22023';
end $$;

-- 발송 조회가 되는 통로인가 — 지금은 카카오(대행사 발송 조회, 대행사를 고를 때 조건으로 넣는다). 메일은 조회가 없다.
create function public.notification_channel_has_lookup(p_channel text)
returns boolean
language sql immutable set search_path = ''
as $$ select p_channel = 'kakao' $$;

-- 멈춘 줄 정리(메일 등 조회가 없는 통로): 꺼낸 지 10분이 지나도 보내는 중인 줄은 대기로 되돌려 다시 보낸다 —
-- 두 번 갈 수 있지만 안 가는 것보다 낫다(결정 d33 ⑤). 시도 횟수가 하나 늘고, 한도를 넘으면 실패로 끝난다.
create function public.notification_requeue_stale()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v public.notification_outbox;
  v_count integer := 0;
begin
  for v in
    select * from public.notification_outbox n
    where n.status = 'sending' and n.claimed_at <= now() - interval '10 minutes'
      and not public.notification_channel_has_lookup(n.channel)
    order by n.claimed_at
    for update skip locked
  loop
    perform public.notification_retry_or_fail(v, 'stale_requeued');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 멈춘 줄 중 발송 조회가 되는 통로의 것 — 앱이 대행사에 우리 발송 번호(줄 id)로 조회한 뒤 notification_resolve_stale 로 끝낸다.
create function public.notification_stale_lookups()
returns table (id uuid, channel text, provider_message_id text)
language sql stable security definer set search_path = ''
as $$
  select n.id, n.channel, n.provider_message_id
  from public.notification_outbox n
  where n.status = 'sending' and n.claimed_at <= now() - interval '10 minutes'
    and public.notification_channel_has_lookup(n.channel)
  order by n.claimed_at;
$$;

-- 조회 결과로 끝내기: 갔으면 보냄(다시 보내지 않는다), 안 갔으면 대기로(시도 +1). 멈춘 줄·조회가 되는 통로만 받는다.
create function public.notification_resolve_stale(p_id uuid, p_delivered boolean, p_provider_message_id text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.notification_outbox;
begin
  select * into v from public.notification_outbox n where n.id = p_id for update;
  if v.id is null or v.status <> 'sending' or v.claimed_at > now() - interval '10 minutes'
     or not public.notification_channel_has_lookup(v.channel) or p_delivered is null then
    raise exception '조회로 끝낼 멈춘 줄이 아니다' using errcode = '55000';
  end if;
  if p_delivered then
    update public.notification_outbox
    set status = 'sent', provider_message_id = coalesce(p_provider_message_id, provider_message_id),
        claimed_at = null, finished_at = now()
    where id = p_id;
    return 'sent';
  end if;
  return public.notification_retry_or_fail(v, 'stale_not_delivered');
end $$;

-- ── 권한 ────────────────────────────────────────────────

revoke all on function public.notification_outbox_guard() from public, anon, authenticated, service_role;
revoke all on function public.notification_enqueue(text, uuid, uuid, smallint, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.notification_retry_or_fail(public.notification_outbox, text) from public, anon, authenticated, service_role;
revoke all on function public.notification_enqueue_due() from public, anon, authenticated;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
revoke all on function public.notification_finish(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.notification_requeue_stale() from public, anon, authenticated;
revoke all on function public.notification_stale_lookups() from public, anon, authenticated;
revoke all on function public.notification_resolve_stale(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.notification_enqueue_due() to service_role;
grant execute on function public.notification_claim(integer) to service_role;
grant execute on function public.notification_finish(uuid, text, text, text, boolean) to service_role;
grant execute on function public.notification_requeue_stale() to service_role;
grant execute on function public.notification_stale_lookups() to service_role;
grant execute on function public.notification_resolve_stale(uuid, boolean, text) to service_role;
