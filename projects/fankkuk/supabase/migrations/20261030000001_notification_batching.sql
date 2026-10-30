-- 알림 묶어 보내기 (docs/specs/notification-batching.md INV-NB1~NB5, notifications INV-N1·N4·N8·N9 를 바꿈 — 2026-10-30)
--
-- 1) 승인 요청 10분 창(INV-NB1): 크리에이터마다 창 하나(approval_notice_windows, 계정이 기본 키 = 유일).
--    첫 결제의 승인 요청이 창을 열면 그 자리에서 줄 하나(round 1 = 창 첫 통). 열린 창 안에 온 요청은 줄 없이 queued_request_id 에 쌓는다.
--    창이 끝나고 쌓인 것이 있으면 자동 처리(notification_close_windows)가 줄 하나(round 2 = 창 끝 통). 옛 첫 입고(2차)·72시간(3차) 승인 요청 줄은 없어진다.
-- 2) 승인 재알림(INV-NB2): 새 종류 approval_reminder — 결제 완료 + 72시간(round 1)·144시간(round 2), 요청·차례마다 한 번.
--    재알림은 창을 열지 않고, 그 크리에이터의 창이 재알림 시각을 덮고 있으면(창이 끝나기 전에 재알림 시각이 됨) 만들지 않는다.
-- 3) 하루 묶음(INV-NB5): 상태 알림 다섯은 공통 함수(notification_enqueue_status)를 거친다. 받는 계정의 「바로 받기」를 사건 순간 읽어
--    켜짐이면 사건 알림 줄, 꺼짐(설정 줄 없음 포함)이면 묶음 대기(notification_digest_items). 매일 서울 오후 7시에 계정마다 status_digest 줄 하나.
--    「바로 받기」는 개인정보 구역이 아닌 public 표(notification_preferences) — 화면 쪽 키는 표에 닿지 않고 본인 함수 둘로만 읽고 바꾼다.
-- 4) 꺼내기: 승인 요청은 그 계정의 대기가 0건이면 건너뜀(no_waiting_requests), 재알림은 그 요청이 대기가 아니거나 창이 열려 있으면 건너뜀.
--    돌려주는 칸에 승인 대기 건수·남은 일수·묶음 건수·받는 사람이 크리에이터인지. 주문별 자동 반려 시각 칸은 뺀다(INV-NB3 — 본문에 쓰지 않는다).

-- ── 종류·칸 ──────────────────────────────────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'approval_reminder', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan',
  'box_missing', 'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply',
  'gift_received', 'creator_check', 'box_no_code', 'revgift_offer', 'return_address', 'return_address_reminder', 'status_digest'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'approval_reminder', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan',
  'box_missing', 'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply',
  'gift_received', 'creator_check', 'box_no_code', 'revgift_offer', 'return_address', 'return_address_reminder', 'status_digest'
]));

-- 묶음 줄의 칸: 서울 날짜(멱등 키에 들어간다)와 소식 건수. 묶음 줄에만 있다
alter table public.notification_outbox add column digest_date date;
alter table public.notification_outbox add column item_count integer check (item_count > 0);
alter table public.notification_outbox add constraint notification_outbox_digest_kind
  check ((kind = 'status_digest') = (digest_date is not null) and (kind = 'status_digest') = (item_count is not null));

-- 승인 요청을 가리키는 종류는 승인 요청과 재알림 둘
alter table public.notification_outbox drop constraint if exists notification_outbox_check;
alter table public.notification_outbox add constraint notification_outbox_request_kind
  check ((kind in ('approval_request', 'approval_reminder')) = (approval_request_id is not null));

-- 하루 묶음은 주문·상자를 가리키지 않는다(INV-NB3 — 어느 선물의 소식인지 넣지 않는다)
alter table public.notification_outbox drop constraint if exists notification_outbox_order_kind;
alter table public.notification_outbox add constraint notification_outbox_order_kind check (
  order_id is not null or kind = any (array['box_arrived', 'revgift_offer', 'box_no_code', 'return_address', 'return_address_reminder', 'status_digest'])
);
alter table public.notification_outbox add constraint notification_outbox_digest_target
  check (kind <> 'status_digest' or (order_id is null and parcel_id is null));

-- 차례: 승인 요청은 창 첫 통(1)·창 끝 통(2), 승인 재알림은 3일째(1)·6일째(2). 나머지는 그대로(20261021000001_deadline_clocks).
-- 옛 승인 요청 3차 줄(끝난 줄)이 남아 있을 수 있어 기존 줄은 검사하지 않는다 — 새 줄과 바뀌는 줄만 검사한다.
-- 아직 끝나지 않은(대기·보내는 중) 옛 3차 줄은 검사를 걸기 전에 건너뜀으로 닫는다. 남겨 두면 꺼내기가 그 줄을 바꾸려다 이 검사에 걸려
-- 꺼내기 문장 전체가 실패하고 모든 알림 발송이 멈춘다(2026-10-30 코드 리뷰 높음). 3차 재알림은 승인 재알림(approval_reminder)이 대신한다
update public.notification_outbox
set status = 'skipped', error_code = 'round_retired', finished_at = now(), claimed_at = null
where kind = 'approval_request' and round = 3 and status in ('pending', 'sending');
alter table public.notification_outbox drop constraint if exists notification_outbox_round_check;
alter table public.notification_outbox add constraint notification_outbox_round_check check (
  round between 1 and 3 and (
    kind = any (array['box_missing', 'return_address_reminder'])
    or (kind = any (array['approval_request', 'approval_reminder', 'revgift_offer', 'hold', 'creator_check', 'difference_due']) and round <= 2)
    or round = 1
  )
) not valid;

-- 줄의 이름(INV-N4)에 묶음 날짜를 더한다 — 계정 + 서울 날짜마다 묶음 줄 하나(INV-NB5 ②). 날짜가 없으면 계정마다 묶음이 평생 하나가 된다
drop index if exists public.notification_outbox_once;
create unique index notification_outbox_once
  on public.notification_outbox (kind, order_id, approval_request_id, parcel_id, unmatched_id, share_id, round, account_id, channel, digest_date)
  nulls not distinct;

-- 지킴이: 묶음 날짜·건수도 줄의 이름이다 — 대기 중에도 바꿀 수 없다
create or replace function public.notification_outbox_guard()
returns trigger
language plpgsql
set search_path = ''
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
    if (new.kind, new.order_id, new.approval_request_id, new.parcel_id, new.unmatched_id, new.share_id, new.round, new.account_id, new.channel, new.event_at, new.created_at, new.digest_date, new.item_count)
       is distinct from (old.kind, old.order_id, old.approval_request_id, old.parcel_id, old.unmatched_id, old.share_id, old.round, old.account_id, old.channel, old.event_at, old.created_at, old.digest_date, old.item_count) then
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

-- 꼭 가는 알림(INV-N6 표): 승인 재알림은 꼭 간다, 하루 묶음은 칸을 따른다
create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_kind = any (array[
    'approval_request', 'approval_reminder', 'hold', 'creator_check', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled', 'box_no_code', 'revgift_offer',
    'return_address', 'return_address_reminder'
  ]), false);
$$;

-- ── 표 셋 ────────────────────────────────────────────────────────────────

-- 승인 요청 10분 창(INV-NB1) — 크리에이터 계정마다 한 줄. 창이 끝난 줄은 다음 창이 열릴 때 덮어쓴다
create table public.approval_notice_windows (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  opened_at timestamptz not null,
  ends_at timestamptz not null,
  -- 창 안에 쌓인 요청(가장 나중 것) — 창 끝 통의 대상. 없으면 끝 통도 없다
  queued_request_id uuid references public.approval_requests (id) on delete set null,
  check (ends_at > opened_at)
);

-- 「바로 받기」(INV-NB5) — 받는 사람 각자. 줄이 없으면 꺼짐
create table public.notification_preferences (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  instant boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 하루 묶음을 기다리는 소식(INV-NB5 ②) — 사건 하나에 한 줄(사건 알림 줄과 같은 이름), 묶이면 묶은 시각과 서울 날짜
create table public.notification_digest_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind = any (array['box_arrived', 'shipped', 'in_transit', 'delivered', 'gift_reply'])),
  order_id uuid references public.orders (id) on delete cascade,
  parcel_id uuid references public.office_parcels (id) on delete cascade,
  event_at timestamptz not null,
  created_at timestamptz not null default now(),
  digested_at timestamptz,
  digest_date date,
  check ((digested_at is null) = (digest_date is null)),
  check (order_id is not null or parcel_id is not null)
);
create unique index notification_digest_items_once
  on public.notification_digest_items (kind, order_id, parcel_id, account_id) nulls not distinct;
create index notification_digest_items_open on public.notification_digest_items (account_id) where digested_at is null;

alter table public.approval_notice_windows enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_digest_items enable row level security;
revoke all on public.approval_notice_windows, public.notification_preferences, public.notification_digest_items from public, anon, authenticated;
revoke insert, update, delete, truncate on public.approval_notice_windows, public.notification_preferences, public.notification_digest_items from service_role;

-- ── 줄 넣기 ──────────────────────────────────────────────────────────────

-- 상태 알림 다섯의 공통 입구(INV-NB5 ①②③): 「바로 받기」를 사건 순간 읽어 사건 알림 줄 또는 묶음 대기 하나로.
-- 같은 사건이 다시 와도 이미 다른 쪽에 들어간 소식은 다시 넣지 않는다 — 같은 소식이 두 번 가지 않는다
-- 승인 요청이 아직 대기인가 — 크리에이터 처리할 일 목록(my_creator_action_items, action-center INV-J5)이 승인 요청 줄을 보이는 조건과 같다.
-- 알림의 「승인 대기 N건」·가장 이른 반려·재알림·0건 건너뜀이 모두 이 판정 하나를 쓴다 — 알림 건수와 목록 건수가 어긋나지 않게(2026-10-30 코드 리뷰 중간)
create or replace function public.approval_request_open(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.approval_requests r join public.orders o on o.id = r.order_id
    where r.id = p_request_id
      and r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
      and now() < o.registered_at + interval '168 hours'
  )
$$;
revoke all on function public.approval_request_open(uuid) from public, anon, authenticated;

create or replace function public.notification_enqueue_status(p_kind text, p_order_id uuid, p_parcel_id uuid, p_account_id uuid, p_event_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instant boolean;
  v_count integer;
begin
  if p_account_id is null then
    return 0;
  end if;
  if p_kind not in ('box_arrived', 'shipped', 'in_transit', 'delivered', 'gift_reply') then
    raise exception '하루 묶음 대상이 아닌 종류: %', p_kind using errcode = '22023';
  end if;
  select p.instant into v_instant from public.notification_preferences p where p.account_id = p_account_id;
  if coalesce(v_instant, false) then
    if exists (
      select 1 from public.notification_digest_items d
      where d.kind = p_kind and d.order_id is not distinct from p_order_id and d.parcel_id is not distinct from p_parcel_id and d.account_id = p_account_id
    ) then
      return 0;
    end if;
    insert into public.notification_outbox (kind, order_id, parcel_id, round, account_id, channel, event_at)
    select p_kind, p_order_id, p_parcel_id, 1, p_account_id, ch.channel, p_event_at
    from (values ('email'), ('kakao')) as ch (channel)
    where ch.channel = 'email'
       or exists (select 1 from public.notification_kakao_templates t where t.kind = p_kind)
    on conflict do nothing;
  else
    if exists (
      select 1 from public.notification_outbox n
      where n.kind = p_kind and n.order_id is not distinct from p_order_id and n.parcel_id is not distinct from p_parcel_id and n.account_id = p_account_id
    ) then
      return 0;
    end if;
    insert into public.notification_digest_items (account_id, kind, order_id, parcel_id, event_at)
    values (p_account_id, p_kind, p_order_id, p_parcel_id, p_event_at)
    on conflict do nothing;
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 줄 넣기 공통 함수. 승인 요청은 10분 창(INV-NB1), 상태 알림 다섯은 묶음 입구(INV-NB5)를 거친다
create or replace function public.notification_enqueue(p_kind text, p_order_id uuid, p_request_id uuid, p_round smallint, p_account_id uuid, p_event_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_opened uuid;
begin
  if p_account_id is null then
    return 0;
  end if;
  if p_kind = 'approval_request' then
    -- 첫 결제 말고는 승인 요청 줄을 만들지 않는다 — 옛 첫 입고(2차)·72시간(3차) 호출은 아무것도 하지 않는다(INV-NB2: 첫 입고 재알림 없어짐)
    if p_round <> 1 then
      return 0;
    end if;
    -- 창 열기: 창이 없거나 끝났으면 지금부터 10분 창을 연다. 열린 창이 있으면 갱신되지 않아 아무것도 돌아오지 않는다.
    -- 결제 둘이 동시에 끝나도 계정 줄은 하나라(기본 키) 진 쪽은 이긴 쪽이 끝난 뒤 열린 창을 보고 쌓기로 간다(INV-NB1, S1c)
    insert into public.approval_notice_windows as w (account_id, opened_at, ends_at, queued_request_id)
    -- 시각은 처리가 시작된 때(now())가 아니라 지금(clock_timestamp()) — 결제 처리가 창 끝을 걸쳐 돌아도 새 창의 첫 건이 바로 간다(2026-10-30 코드 리뷰 낮음)
    values (p_account_id, clock_timestamp(), clock_timestamp() + interval '10 minutes', null)
    on conflict (account_id) do update
      set opened_at = excluded.opened_at, ends_at = excluded.ends_at, queued_request_id = null
      where w.ends_at <= clock_timestamp()
    returning w.account_id into v_opened;
    if v_opened is null then
      -- 열린 창 안 — 줄 없이 쌓는다. 창 끝에 한 통이 더 간다(INV-NB1 ②③)
      update public.approval_notice_windows set queued_request_id = p_request_id where account_id = p_account_id;
      return 0;
    end if;
  elsif p_kind in ('box_arrived', 'shipped', 'in_transit', 'delivered', 'gift_reply') then
    return public.notification_enqueue_status(p_kind, p_order_id, null, p_account_id, p_event_at);
  end if;
  insert into public.notification_outbox (kind, order_id, approval_request_id, round, account_id, channel, event_at)
  select p_kind, p_order_id, p_request_id, p_round, p_account_id, ch.channel, p_event_at
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = p_kind)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- 상자 도착(INV-C8)도 묶음 입구로
create or replace function public.notification_enqueue_box_arrived(p_parcel_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_account uuid;
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
  return public.notification_enqueue_status('box_arrived', v_order_id, p_parcel_id, v_account, now());
end $$;

-- 답장(gift_reply)은 묶음 입구로, 받았다고 확인됐어요(gift_received)는 묶지 않는다(INV-NB5 ④)
create or replace function public.gift_reply_enqueue(p_kind text, p_order_id uuid, p_parcel_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind = 'gift_reply' then
    perform public.notification_enqueue_status(p_kind, p_order_id, p_parcel_id, p_account_id, now());
    return;
  end if;
  insert into public.notification_outbox (kind, order_id, parcel_id, account_id, channel, event_at)
  select p_kind, p_order_id, p_parcel_id, p_account_id, ch.channel, now()
  from (values ('email'), ('kakao')) as ch (channel)
  where ch.channel = 'email'
     or exists (select 1 from public.notification_kakao_templates t where t.kind = p_kind)
  on conflict do nothing;
end $$;

-- 창 끝 통(INV-NB1 ③): 끝난 창에 쌓인 요청이 있으면 그 계정에 승인 요청 줄 하나(round 2) — 쌓임 표시는 같은 처리에서 비운다.
-- 보낼지(대기 0건이면 건너뜀)와 건수는 꺼낼 때 다시 읽는다
create or replace function public.notification_close_windows()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_rows integer;
  v_count integer := 0;
begin
  for r in
    select w.account_id, w.queued_request_id, q.order_id
    from public.approval_notice_windows w
    join public.approval_requests q on q.id = w.queued_request_id
    where w.ends_at <= now() and w.queued_request_id is not null
    for update of w skip locked
  loop
    update public.approval_notice_windows set queued_request_id = null where account_id = r.account_id;
    insert into public.notification_outbox (kind, order_id, approval_request_id, round, account_id, channel, event_at)
    select 'approval_request', r.order_id, r.queued_request_id, 2, r.account_id, ch.channel, now()
    from (values ('email'), ('kakao')) as ch (channel)
    where ch.channel = 'email'
       or exists (select 1 from public.notification_kakao_templates t where t.kind = 'approval_request')
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end $$;

-- 기한 알림 줄(일꾼이 꺼내기 전에 부른다): 창 끝 통 + 승인 재알림(INV-NB2) + 역조공 받기 재알림(INV-N20, 그대로)
create or replace function public.notification_enqueue_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_windows integer;
  v_count integer;
  v_shares integer;
begin
  -- 창 끝 통을 여기서도 만든다 — 꺼내기 바로 앞이라 끝 통이 창이 끝나고 5분 안에 간다(INV-NB1 ③). 자동 처리(office_run_scheduled)도 같은 함수를 부른다
  v_windows := public.notification_close_windows();
  -- 승인 재알림: 결제 완료 + 72시간(1)·144시간(2)이 된 대기 요청, 요청·차례마다 한 번(줄의 이름).
  -- 6일째가 이미 지난 요청에 3일째를 뒤늦게 만들지 않는다. 그 크리에이터의 창이 재알림 시각을 덮고 있으면(창이 끝나기 전에 재알림 시각이 됨)
  -- 만들지 않는다 — 10분 안에 승인 요청 알림이 이미 갔다(INV-NB2). 재알림은 창을 열지 않는다
  select coalesce(sum(public.notification_enqueue('approval_reminder', o.id, r.id, k.round::smallint, c.profile_id, now())), 0)::integer
  into v_count
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  cross join (values (1, 72), (2, 144)) as k (round, hours)
  where public.approval_request_open(r.id)
    and o.registered_at <= now() - make_interval(hours => k.hours)
    and (k.round = 2 or o.registered_at > now() - interval '144 hours')
    and not exists (
      select 1 from public.approval_notice_windows w
      where w.account_id = c.profile_id and w.ends_at > o.registered_at + make_interval(hours => k.hours)
    );
  select coalesce(sum(public.notification_enqueue_share(s.id, 2::smallint)), 0)::integer
  into v_shares
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  where d.status = 'done' and s.reply = 'waiting' and s.cancelled_at is null
    and d.settled_at <= now() - interval '72 hours'
    and now() < public.revgift_deadline(d.settled_at);
  return v_windows + v_count + v_shares;
end $$;

-- 하루 묶음(INV-NB5 ②): 묶이지 않은 소식이 있는 계정마다 status_digest 줄 하나(이메일 + 템플릿이 있으면 카카오), 소식 수를 줄에 적는다.
-- 계정 + 서울 날짜마다 하나 — 오늘 묶음이 이미 있으면 그 계정의 소식은 묶지 않고 남겨 내일 묶음으로 보낸다(묶음 표시를 되돌림)
create or replace function public.notification_enqueue_digest()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  r record;
  v_items integer;
  v_rows integer;
  v_count integer := 0;
begin
  for r in select distinct d.account_id from public.notification_digest_items d where d.digested_at is null loop
    begin
      with marked as (
        update public.notification_digest_items d
        set digested_at = now(), digest_date = v_date
        where d.account_id = r.account_id and d.digested_at is null
        returning 1
      )
      select count(*) into v_items from marked;
      -- 다른 처리가 먼저 묶었다
      continue when v_items = 0;
      insert into public.notification_outbox (kind, round, account_id, channel, event_at, digest_date, item_count)
      select 'status_digest', 1, r.account_id, ch.channel, now(), v_date, v_items
      from (values ('email'), ('kakao')) as ch (channel)
      where ch.channel = 'email'
         or exists (select 1 from public.notification_kakao_templates t where t.kind = 'status_digest')
      on conflict do nothing;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        -- 오늘 묶음이 이미 있다 — 위의 묶음 표시를 되돌린다
        raise exception 'digest_exists' using errcode = 'NB001';
      end if;
      v_count := v_count + v_rows;
    exception when sqlstate 'NB001' then
      null;
    end;
  end loop;
  return v_count;
end $$;

-- 자동 처리(5분마다)가 창 끝 통도 만든다(INV-NB1 ③)
create or replace function public.office_run_scheduled()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_dropped jsonb;
begin
  -- 이 처리 안에서만(트랜잭션 범위) 요청 정보를 앱 서버 키로 둔다 — 자동 처리 함수의 운영자 판정을 그대로 통과시키려고.
  -- 이 함수는 실행 권한을 아무에게도 주지 않아, 예약 작업 실행자(postgres) 말고는 부를 수 없다.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.office_run_expiry(null);
  -- 출고·반송 확정 + 72시간 주소 사본 지우기(INV-W11 · R9 · P18). 함수는 개인정보 구역을 지우므로 사람이 적용하는 manual/0024 가 만든다 — 없으면 건너뛴다
  if to_regprocedure('public.office_drop_address_copies()') is not null then
    execute 'select public.office_drop_address_copies()' into v_dropped;
    v_result := v_result || jsonb_build_object('address_copies', v_dropped);
  end if;
  v_result := v_result || jsonb_build_object('approval_windows', public.notification_close_windows());
  return v_result;
end $$;

-- ── 「바로 받기」 본인 함수 ─────────────────────────────────────────────────

create or replace function public.set_notification_instant(p_instant boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if p_instant is null then
    raise exception '바로 받기 값이 비었다' using errcode = '22004';
  end if;
  insert into public.notification_preferences (account_id, instant, updated_at)
  values (v_uid, p_instant, now())
  on conflict (account_id) do update set instant = excluded.instant, updated_at = excluded.updated_at;
  return p_instant;
end $$;

create or replace function public.my_notification_instant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.instant from public.notification_preferences p where p.account_id = auth.uid()), false);
$$;

-- ── 꺼내기 ───────────────────────────────────────────────────────────────

drop function if exists public.notification_claim(integer);
create function public.notification_claim(p_limit integer default 20)
returns table (
  id uuid, kind text, channel text, round smallint, order_no text, nickname text, undelivered_reason text, must_deliver boolean,
  attempts integer, claimed_at timestamptz, sender_name text, dispose_due_at timestamptz,
  waiting_count integer, days_left integer, item_count integer, recipient_is_creator boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select n.id,
           case
             -- 승인 요청(창 첫 통·끝 통): 보내는 순간 그 크리에이터의 대기가 0건이면 보내지 않는다(INV-NB1)
             when n.kind = 'approval_request' and not exists (
               select 1 from public.approval_requests r join public.orders o on o.id = r.order_id join public.creators cr on cr.id = o.creator_id
               where cr.profile_id = n.account_id and public.approval_request_open(r.id)) then 'no_waiting_requests'
             -- 승인 재알림: 그 요청이 대기가 아니면 보내지 않는다. 그 크리에이터의 창이 열려 있어도(10분 안에 승인 요청 알림이 갔다) 보내지 않는다(INV-NB2)
             when n.kind = 'approval_reminder' and not public.approval_request_open(n.approval_request_id) then 'request_not_waiting'
             when n.kind = 'approval_reminder' and exists (
               select 1 from public.approval_notice_windows w where w.account_id = n.account_id and w.ends_at > now()) then 'approval_window_open'
             when n.kind = 'revgift_offer' and not exists (
               select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
               where s.id = n.share_id and s.reply = 'waiting' and s.cancelled_at is null and d.status = 'done'
                 and now() < public.revgift_deadline(d.settled_at)) then 'share_not_waiting'
             -- 반송 주소 재알림: 그 사이 확인했거나 반송 대기가 아니면 보내지 않는다(INV-N22 「이미 확인한 상자에는 가지 않는다」)
             when n.kind = 'return_address_reminder' and not exists (
               select 1 from public.office_parcels x where x.id = n.parcel_id and x.state = 'return_waiting' and x.return_confirmed_at is null) then 'return_not_waiting'
             -- 추적 장치 발견·확인할 선물 재알림(차례 2, INV-N13 — 2026-10-21): 그 사이 골랐거나 처리·기한 지남·질문이 닫혔으면 보내지 않는다
             when n.kind in ('hold', 'creator_check') and n.round = 2 and not exists (
               select 1 from public.office_parcels x join public.office_creator_checks k on k.parcel_id = x.id
               where x.id = n.parcel_id
                 and x.state = (case when n.kind = 'hold' then 'tracker_held' else 'held' end)::public.office_state
                 and k.choice is null and k.answer is null and now() < x.inspected_at + interval '168 hours'
                 and (n.kind = 'hold' or not public.office_parcel_dead(x))) then 'check_not_waiting'
             -- 추가 결제 재알림(차례 2, INV-N18 — 2026-10-21): 그 주문에 아직 낼 수 있는 차액이 없으면(모두 결제·반송 대상·주문 끝남) 보내지 않는다
             when n.kind = 'difference_due' and n.round = 2 and not exists (
               select 1 from public.payments d join public.orders o on o.id = d.order_id
               where d.order_id = n.order_id and d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
                 and o.status in ('registered', 'received', 'labeled', 'inspected')
                 and coalesce(now() < public.difference_due_at(d.box_id), true)) then 'difference_not_due'
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
  ), waiting as (
    -- 받는 크리에이터의 대기 승인 요청 — 건수와 가장 이른 자동 반려 시각(결제 완료 + 168시간)을 보내는 순간에 센다(INV-NB1·NB2)
    select cr.profile_id as account_id, count(*)::integer as n, min(o.registered_at) + interval '168 hours' as first_reject_at
    from public.approval_requests r join public.orders o on o.id = r.order_id join public.creators cr on cr.id = o.creator_id
    where public.approval_request_open(r.id) and cr.profile_id in (select c.account_id from claimed c where c.kind in ('approval_request', 'approval_reminder'))
    group by cr.profile_id
  )
  select c.id, c.kind, c.channel, c.round,
         -- 묶음 알림은 주문번호를 내주지 않는다(INV-NB3)
         case when c.kind not in ('approval_request', 'approval_reminder', 'status_digest') then coalesce(o.order_no, rs.order_no, ss.order_no) end,
         pr.nickname,
         case when c.kind = 'gift_undelivered' then (case when o.status = 'expired' then 'expired' else 'declined' end) end,
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at,
         -- 역조공 받기만 — 보낸 크리에이터의 공개 이름(크리에이터 줄이 없으면 닉네임). 다른 종류는 비어 있다(INV-N1)
         case when c.kind = 'revgift_offer' then coalesce(cr.name, sp.nickname) end,
         -- 반송 주소 재알림만 — 처분 예정 시각(반송 대기 + 720시간, INV-N22). 다른 종류는 비어 있다
         case when c.kind = 'return_address_reminder' then pp.return_waiting_at + interval '720 hours' end,
         -- 승인 요청·재알림만 — 보내는 순간의 승인 대기 건수(INV-NB1·NB3)
         case when c.kind in ('approval_request', 'approval_reminder') then coalesce(wt.n, 0) end,
         -- 재알림만 — 가장 빨리 자동 반려될 건까지 남은 시간을 하루 단위로 올림, 최소 1(INV-NB2)
         case when c.kind = 'approval_reminder' then
           greatest(1, ceil(extract(epoch from (wt.first_reject_at - now())) / 86400.0))::integer end,
         -- 하루 묶음만 — 소식 건수(INV-NB5)
         case when c.kind = 'status_digest' then c.item_count end,
         -- 받는 사람이 크리에이터인가 — 하루 묶음 링크(팬 /gifts · 크리에이터 /creator/actions)
         exists (select 1 from public.creators x where x.profile_id = c.account_id)
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  left join public.revgift_shares ss on ss.id = c.share_id
  left join public.revgift_sends sd on sd.id = ss.send_id
  left join public.profiles sp on sp.id = sd.sender_id
  left join public.creators cr on cr.profile_id = sd.sender_id
  left join waiting wt on wt.account_id = c.account_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $$;

-- ── 권한 ─────────────────────────────────────────────────────────────────

revoke all on function public.notification_enqueue_status(text, uuid, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.notification_close_windows() from public, anon, authenticated;
revoke all on function public.notification_enqueue_digest() from public, anon, authenticated;
revoke all on function public.notification_claim(integer) from public, anon, authenticated;
revoke all on function public.set_notification_instant(boolean) from public, anon;
revoke all on function public.my_notification_instant() from public, anon;
grant execute on function public.notification_close_windows() to service_role;
grant execute on function public.notification_enqueue_digest() to service_role;
grant execute on function public.notification_claim(integer) to service_role;
grant execute on function public.set_notification_instant(boolean) to authenticated;
grant execute on function public.my_notification_instant() to authenticated;

-- 하루 묶음은 매일 서울 오후 7시(UTC 10시, INV-NB5 ②)
select cron.schedule('fankkuk-digest', '0 10 * * *', 'select public.notification_enqueue_digest()');

notify pgrst, 'reload schema';
