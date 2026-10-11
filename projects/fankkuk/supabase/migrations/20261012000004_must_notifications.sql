-- 2026-10-12 정책 문제집 D11·D7 (DECISIONS 2026-10-12 「정책 문제집 메모로 정한 것 D·E」, 사용자 「추천대로 전부」).
-- 스펙: notifications INV-N2·N6·N17·N18·N19 (종류별 표 「알림 종류와 끌 수 있는지」), decline-block INV-D5.
--
-- 1) 알림 종류에 gift_undelivered(거절 알림 「선물이 전해지지 못했어요」)를 더한다 — 발송 대기 줄·카카오 템플릿 표의 종류 제약.
-- 2) notification_kind_must_deliver(종류) — 꼭 가는 알림 판정 하나. 조치가 필요하거나 돈·상자가 걸린 아홉 종류만 참.
--    앱 서버 키 전용(화면 쪽 키는 부르지 못한다). 꺼내기와 연락처 함수가 이것을 읽는다.
-- 3) notification_claim — 꺼낸 줄의 must_deliver 칸을 2) 로 정한다(그 전에는 승인 요청만). 나머지는 20261007000007 그대로.
-- 4) inbound_void_for_order — 받는 주소를 본 적이 없는(상자가 하나도 오지 않은) 결제된 주문이 거절·7일 반려(차단 거절 포함)되면
--    보낸 팬에게 거절 알림 한 줄(INV-N17 ②). 무엇을 보낼지는 상자 사정으로만 정하고 거절한 사람·차단 표시는 읽지 않는다(INV-N2).
--    결제 전 주문(차단으로만 거절된다)에는 거절 순간에 보내지 않고, 그 뒤 결제가 끝나면 20261012000005 가 같은 알림을 넣는다.
--    팬의 취소에는 보내지 않는다. 나머지는 20261010000003 그대로.
--
-- 연락처 함수(public.notification_contact)는 개인정보 구역을 읽어 사람이 적용한다(supabase/manual). 이 마이그레이션만 적용된 상태에서는
-- 꼭 가는 알림을 넓힌 것이 연락처 함수에 아직 반영되지 않는다 — 승인 요청만 설정을 무시하고, 나머지 꼭 가는 알림은 꺼 둔 사람에게 건너뜀으로
-- 끝난다(이전과 같은 동작). 연락처 함수가 2) 를 읽도록 바꾸는 내용은 사람이 적용한다.
--
-- 다시 적용해도 결과가 같다(제약은 drop if exists 뒤 add, 함수는 create or replace).

-- ── 1) 알림 종류 ──────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received'
]));

-- ── 2) 꼭 가는 알림 판정 ──────────────────────────

create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- notifications INV-N6 표: 끌 수 없음 9종. 모르는 종류·빈 값은 거짓.
  select coalesce(p_kind = any (array[
    'approval_request', 'hold', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled'
  ]), false);
$$;

revoke all on function public.notification_kind_must_deliver(text) from public, anon, authenticated;
grant execute on function public.notification_kind_must_deliver(text) to service_role;

-- ── 3) 꺼내기 ──────────────────────────────────────

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
         public.notification_kind_must_deliver(c.kind),
         c.attempts,
         c.claimed_at
  from claimed c
  left join public.orders o on o.id = c.order_id
  left join public.office_parcels pp on pp.id = c.parcel_id
  left join public.revgift_shares rs on rs.id = pp.share_id
  join public.profiles pr on pr.id = c.account_id
  order by c.id;
end $$;

-- ── 4) 거절·반려 때 팬 알림 ────────────────────────

create or replace function public.inbound_void_for_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- payment INV-M18 · inbound-address-code INV-C3 (2026-10-10): 받는 주소를 본 적이 있으면(승인 · 「먼저 보내기」 · 도착한 상자 있음)
  -- 아직 안 온 상자의 6자리는 무효로 하지 않고 살려 둔 시각을 적는다. 도착한 상자의 6자리는 이미 사용됨, 닫힌 상자의 6자리는 이미 무효라
  -- 남은 유효한 6자리가 곧 안 온 상자다.
  if new.approved_at is not null or new.fan_send_ack_at is not null or exists (
    select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
    where b.order_id = new.id and x.state <> 'awaiting'
  ) then
    update public.inbound_codes c
    set kept_at = now()
    from public.boxes b
    where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and c.kept_at is null and b.missing_at is null;
    -- 보낸 팬에게 안내 한 번(notifications INV-N17 ①) — 거절·반려·차단 거절 모두 같은 종류. 팬이 스스로 취소한 주문에는 보내지 않는다
    if found and new.status in ('rejected', 'expired') then
      perform public.notification_enqueue('gift_pending_box', new.id, null, 1::smallint, new.fan_id, now());
    end if;
    return null;
  end if;

  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.boxes b
  where b.order_id = new.id and c.box_id = b.id and c.state = 'valid';
  -- 받는 주소를 본 적이 없는(상자가 하나도 오지 않은) 주문의 거절 알림(notifications INV-N17 ②, 2026-10-12 문제집 D11).
  -- 거절·7일 반려·차단 거절 모두 같은 종류 — 차단 표시(rejected_by_block)는 읽지 않는다(INV-N2).
  -- 결제 전 주문(차단으로만 거절된다)에는 여기서 보내지 않는다 — 거절되는 순간에는 아직 돌려줄 결제 금액이 없다.
  -- 그 뒤 결제가 끝나면(전액 환불 대상) 결제 반영 함수(settle_payment, 20261012000005)가 같은 거절 알림을 한 번 넣는다. 팬의 취소에는 보내지 않는다.
  if new.status in ('rejected', 'expired') and old.status <> 'pending_payment' then
    perform public.notification_enqueue('gift_undelivered', new.id, null, 1::smallint, new.fan_id, now());
  end if;
  return null;
end $$;
