-- 무통장 입금(토스 가상계좌)의 DB 쪽 (payment INV-M21~M24, 카드 d87 「추천대로」 1번). 20261015000002(상태 값 추가) 다음.
-- 환불 계좌(INV-M25)는 개인정보 구역이라 supabase/manual/0019_refund_account.sql 에 있다(사람이 적용).
--
-- 흐름: 결제 승인 응답이 「입금 기다리는 중」이면 결제는 입금 대기(waiting_deposit), 주문은 결제 전(pending_payment) 그대로다 —
--   승인 요청·받는 주소 6자리·라벨은 결제 완료 반영(settle_payment done)에서만 생기므로 입금 전에는 나오지 않는다(INV-M21).
--   입금 확인은 앱 서버가 결제사 조회로 「완료」를 본 뒤 settle_payment(done)으로 반영한다(INV-M22). 이 반영과 기한 지남 닫기는
--   둘 다 「입금 대기인 줄만 바꾸기」라 겹쳐도 하나만 반영된다(INV-M22·M23).
--
-- 1) payments 칸 — 결제사 웹훅 비밀 값의 해시(원문은 두지 않는다), 입금 계좌(은행 코드·계좌번호 — 결제사가 이 주문에 발급한 계좌, 팬 본인 것이 아니다),
--    입금 기한(발급 뒤 24시간, DB 시각), 되돌림 표시(INV-M24). payments 는 로그인 키로 읽을 수 없는 표다(20261002000001 의 revoke·RLS).
--    결제 키 칸 규칙: 완료·입금 대기만 결제 키가 있다(입금 대기도 기한 지남 취소에 결제 키가 필요하다).
-- 2) settle_payment — 20261012000005_late_paid_reject_alert.sql 과 같고, 완료 반영은 입금 대기 줄도 바꾼다(실패 반영은 아니다 — 닫기는 4)).
-- 3) settle_payment_waiting — 「승인 중」 → 입금 대기. 승인 응답(또는 INV-M19 조회)이 입금 대기일 때.
-- 4) close_deposit_expired — 입금 대기 → 실패(주문은 결제 전으로 끝남 — 결제 대기 만료와 같다), 보낸 팬에게 deposit_expired 알림 한 번. 앱 서버가 결제사 조회·취소로 기한 지남을 확인한 뒤에만 부른다.
-- 5) deposit_mark_review · payment_deposit_reverted — 확인 필요 표시(입금 대기인데 결제사는 금액이 다른 완료 / 완료 뒤 되돌림).
-- 6) deposit_reconcile_targets — 예약 작업이 조회할 입금 대기 결제(놓친 알림 메우기 30분마다 · 기한 지난 것 먼저).
-- 7) my_deposit_account — 팬 본인 주문의 입금 계좌·기한·금액(입금 대기일 때만).
-- 8) refund_is_deposit — 환불 기록의 결제가 무통장인지(앱 서버 키). 환불 계좌가 필요한지 여기서 정한다.
-- 9) 결제 대기 계열을 세는 두 함수에 입금 대기를 더한다 — 사진 정리(24시간 지난 결제 전 주문)·이번 달 보낸 수.
-- 10) admin_payment_rows — 확인 필요에 입금 대기 표시·되돌림을 더한다. 나머지는 지금 정의와 같다.
-- 11) 알림 종류 deposit_expired(끌 수 없음) — notifications INV-N6 표.
-- 다시 적용해도 같다(칸은 if not exists, 함수는 create or replace, 제약은 지우고 다시).

-- ── 1) 칸 ──────────────────────────────────

alter table public.payments add column if not exists deposit_secret_hash bytea;
alter table public.payments add column if not exists deposit_bank_code text;
alter table public.payments add column if not exists deposit_account_no text;
alter table public.payments add column if not exists deposit_due_at timestamptz;
alter table public.payments add column if not exists deposit_reverted_at timestamptz;

alter table public.payments drop constraint if exists payments_check1;
alter table public.payments drop constraint if exists payments_key_when_settled;
alter table public.payments add constraint payments_key_when_settled
  check ((status in ('done', 'waiting_deposit')) = (payment_key is not null));
alter table public.payments drop constraint if exists payments_deposit_shape;
alter table public.payments add constraint payments_deposit_shape check (
  (status <> 'waiting_deposit' or (kind = 'initial' and deposit_due_at is not null and deposit_secret_hash is not null))
  and (deposit_secret_hash is null or octet_length(deposit_secret_hash) = 32)
  and (deposit_bank_code is null or deposit_bank_code ~ '^[0-9A-Z]{2,3}$')
  and (deposit_account_no is null or deposit_account_no ~ '^[0-9A-Za-z-]{6,30}$')
);

create index if not exists payments_waiting_deposit_idx on public.payments (deposit_due_at) where status = 'waiting_deposit';

-- ── 2) 결제 완료 반영 ──────────────────────────────────

create or replace function public.settle_payment(p_toss_order_id text, p_status payment_status, p_payment_key text, p_request_id text, p_payload text, p_requested_at timestamp with time zone)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
  v_request_id uuid;
  v_fan_id uuid;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'settle_payment 는 done 또는 failed 만' using errcode = '22023';
  end if;

  -- 입금 대기 줄은 완료로만 바꾼다 — 실패(닫기)는 기한 지남 확인을 거친 close_deposit_expired 만(INV-M23)
  update public.payments
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = now()
  where toss_order_id = p_toss_order_id
    and (status in ('pending', 'confirming') or (p_status = 'done' and status = 'waiting_deposit'))
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
      -- INV-C1: 상자마다 받는 주소 6자리
      perform public.inbound_issue_for_order(v_payment.order_id);
    else
      update public.orders set registered_at = p_requested_at
      where id = v_payment.order_id and status = 'rejected' and registered_at is null
      returning fan_id into v_fan_id;
      -- 결제 전에 (차단으로) 거절된 주문의 결제가 끝났다 — 전액 환불 대상. 직접 거절·7일 반려와 같은 거절 알림을 보낸 팬에게 한 번
      -- (notifications INV-N2·N17 ②). 거절한 사람·차단 표시는 읽지 않는다 — 상자가 하나도 오지 않은 결제된 거절 주문이라는 사정만 본다.
      if found then
        perform public.notification_enqueue('gift_undelivered', v_payment.order_id, null, 1::smallint, v_fan_id, now());
      end if;
    end if;
  end if;
  return true;
end $$;

revoke all on function public.settle_payment(text, public.payment_status, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.settle_payment(text, public.payment_status, text, text, text, timestamptz) to service_role;

-- ── 3) 입금 대기로 ──────────────────────────────────

-- 「승인 중」인 팬 선물 첫 결제만. 기한은 DB 시각으로 지금 + 24시간(INV-M23 — 결제사 쪽 기한과 따로 우리가 지킨다).
-- 비밀 값은 앱 서버가 SHA-256 으로 바꿔 넘긴다(64자 16진수). 바꿨으면 true.
create or replace function public.settle_payment_waiting(p_toss_order_id text, p_payment_key text, p_secret_sha256 text,
                                                         p_bank_code text, p_account_no text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_payment_key is null or char_length(p_payment_key) not between 1 and 200
     or p_secret_sha256 is null or p_secret_sha256 !~ '^[0-9a-f]{64}$'
     or p_bank_code is null or p_bank_code !~ '^[0-9A-Z]{2,3}$'
     or p_account_no is null or p_account_no !~ '^[0-9A-Za-z-]{6,30}$' then
    raise exception '입금 계좌 정보의 꼴이 다르다' using errcode = '22023';
  end if;
  update public.payments
  set status = 'waiting_deposit', payment_key = p_payment_key, deposit_secret_hash = decode(p_secret_sha256, 'hex'),
      deposit_bank_code = p_bank_code, deposit_account_no = p_account_no, deposit_due_at = now() + interval '24 hours'
  where toss_order_id = p_toss_order_id and kind = 'initial' and status = 'confirming';
  return found;
end $$;

revoke all on function public.settle_payment_waiting(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_payment_waiting(text, text, text, text, text) to service_role;

-- ── 4) 기한 지남 닫기 ──────────────────────────────────

-- 입금 대기인 줄만 실패로 바꾼다(settle_payment 의 완료 반영과 같은 줄을 같은 순서로 — 결제 줄 → 주문 줄 — 잠근다, 하나만 반영).
-- 보낸 팬에게 deposit_expired 한 번(같은 이름의 줄은 넣지 않는다). 바꿨으면 true.
create or replace function public.close_deposit_expired(p_toss_order_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_fan_id uuid;
begin
  update public.payments set status = 'failed', payment_key = null, settled_at = now()
  where toss_order_id = p_toss_order_id and kind = 'initial' and status = 'waiting_deposit'
  returning order_id into v_order_id;
  if v_order_id is null then
    return false;
  end if;
  -- 주문은 결제 전(pending_payment) 그대로 끝난다 — 결제가 실패로 닫힌 결제 전 주문은 끝난 주문이다(INV-M15 결제 대기 만료와 같다:
  -- 크리에이터에게 보이지 않고, 사진 정리·이번 달 보낸 수에서 빠진다). 등록된 적이 없어 「취소」 상태로는 바꿀 수 없다(등록 시각 규칙).
  select o.fan_id into v_fan_id from public.orders o where o.id = v_order_id and o.status = 'pending_payment';
  if v_fan_id is not null then
    perform public.notification_enqueue('deposit_expired', v_order_id, null, 1::smallint, v_fan_id, now());
  end if;
  return true;
end $$;

revoke all on function public.close_deposit_expired(text) from public, anon, authenticated;
grant execute on function public.close_deposit_expired(text) to service_role;

-- ── 5) 확인 필요 ──────────────────────────────────

-- 입금 대기인데 결제사 조회가 금액·주문번호가 다른 완료(또는 부분 취소) — 완료도 닫기도 하지 않고 사람이 본다.
create or replace function public.deposit_mark_review(p_toss_order_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.payments set review_at = now()
  where toss_order_id = p_toss_order_id and kind = 'initial' and status = 'waiting_deposit' and review_at is null;
  return found;
end $$;

-- INV-M24: 입금 완료 뒤 결제사 조회가 다시 「입금 기다리는 중」. 입금 반영과 크리에이터에게 가는 것(승인 요청·6자리)이 한 처리라
-- 완료된 무통장 결제는 모두 다음 단계로 간 주문이다 — 되돌리지 않고 표시만 단다(관리자 결제 목록의 확인 필요).
create or replace function public.payment_deposit_reverted(p_toss_order_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.payments set deposit_reverted_at = now()
  where toss_order_id = p_toss_order_id and kind = 'initial' and status = 'done'
    and deposit_secret_hash is not null and deposit_reverted_at is null;
  return found;
end $$;

revoke all on function public.deposit_mark_review(text) from public, anon, authenticated;
grant execute on function public.deposit_mark_review(text) to service_role;
revoke all on function public.payment_deposit_reverted(text) from public, anon, authenticated;
grant execute on function public.payment_deposit_reverted(text) to service_role;

-- ── 6) 예약 작업이 조회할 입금 대기 결제 ──────────────────────────────────

-- 기한이 지난 것 먼저, 그다음 마지막으로 확인한 지 30분이 지난 것(놓친 알림 메우기). 확인 필요 표시가 있는 줄은 뺀다.
-- 한 번에 6줄(결제 다시 확인과 같은 시간 예산). 주문번호를 주면 그 주문만(관리자 「지금 돌리기」 한 줄).
create or replace function public.deposit_reconcile_targets(p_order_no text default null)
returns table (toss_order_id text, amount_krw integer, payment_key text, due_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.toss_order_id, p.amount_krw, p.payment_key, p.deposit_due_at
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.kind = 'initial' and p.status = 'waiting_deposit' and p.review_at is null
    and (p_order_no is not null
         or p.deposit_due_at <= now() or p.last_checked_at is null or p.last_checked_at <= now() - interval '30 minutes')
    and (p_order_no is null or o.order_no = p_order_no)
  order by (p.deposit_due_at <= now()) desc, p.last_checked_at nulls first, p.deposit_due_at, p.toss_order_id
  limit 6;
$$;

revoke all on function public.deposit_reconcile_targets(text) from public, anon, authenticated;
grant execute on function public.deposit_reconcile_targets(text) to service_role;

-- ── 7) 팬: 입금 안내 ──────────────────────────────────

-- 로그인 토큰의 팬이 보낸 주문만, 입금 대기일 때만. 남의 주문·없는 주문·입금 대기가 아닌 주문은 0줄(같은 답).
create or replace function public.my_deposit_account(p_order_no text)
returns table (bank_code text, account_no text, due_at timestamptz, amount_krw integer)
language sql stable security definer set search_path = ''
as $$
  select p.deposit_bank_code, p.deposit_account_no, p.deposit_due_at, p.amount_krw
  from public.orders o
  join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'waiting_deposit'
  where o.order_no = p_order_no and o.fan_id = auth.uid();
$$;

revoke all on function public.my_deposit_account(text) from public, anon;
grant execute on function public.my_deposit_account(text) to authenticated;

-- ── 8) 환불 기록이 무통장 결제인가 ──────────────────────────────────

create or replace function public.refund_is_deposit(p_refund_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.deposit_secret_hash is not null
    from public.refunds r join public.payments p on p.id = r.payment_id
    where r.id = p_refund_id), false);
$$;

revoke all on function public.refund_is_deposit(uuid) from public, anon, authenticated;
grant execute on function public.refund_is_deposit(uuid) to service_role;

-- ── 9) 결제 대기 계열에 입금 대기 ──────────────────────────────────

-- 20261012000001_together_fix.sql 과 같고, 입금 대기도 기다린다(발급 뒤 24시간 안에 입금하면 사진이 남아 있어야 한다).
create or replace function public.gift_photo_order_dead(p_order_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select o.status = 'canceled'
        or (o.status = 'pending_payment' and (
              exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'initial' and p.status = 'failed')
              or (o.created_at < now() - interval '24 hours'
                  and not exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'initial'
                                    and p.status in ('confirming', 'waiting_deposit', 'done')))))
    from public.orders o where o.id = p_order_id), true);
$$;

-- 20261010000006_creator_receiving.sql 과 같고, 입금 대기도 센다.
create or replace function public.receiving_counted_orders(p_sender_id uuid, p_creator_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.orders o
  where o.fan_id = p_sender_id and o.creator_id = p_creator_id
    and o.created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    and o.status not in ('rejected', 'expired', 'canceled')
    and (o.status <> 'pending_payment'
         or exists (select 1 from public.payments p
                     where p.order_id = o.id and p.kind = 'initial' and p.status in ('pending', 'confirming', 'waiting_deposit', 'done')));
$$;

revoke all on function public.gift_photo_order_dead(uuid) from public, anon, authenticated;
revoke all on function public.receiving_counted_orders(uuid, uuid) from public, anon, authenticated;
grant execute on function public.gift_photo_order_dead(uuid) to service_role;
grant execute on function public.receiving_counted_orders(uuid, uuid) to service_role;

-- ── 10) 관리자 결제·환불 내역 ──────────────────────────────────

-- 지금 정의와 같고, 확인 필요에 「입금 대기 + 표시」(5 의 deposit_mark_review)와 「완료 뒤 되돌림」(INV-M24)을 더한다.
create or replace function public.admin_payment_rows()
returns table (unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text, amount_krw integer,
               goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer,
               paid_at timestamptz, refund_status text, refund_krw integer, refund_error text, needs_review boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with units as (
    -- 확인 필요(INV-M19·M22·M24) 결제는 끝나지 않았어도 나온다 — 시각은 「승인 중」이 된 시각, 환불 대상은 아니다
    select 'gift'::text as unit_kind, p.id as unit_id, o.order_no, p.kind as payment_kind, fp.nickname as payer_nickname,
           p.amount_krw, p.goods_krw, p.service_fee_krw, p.inspection_fee_krw, p.shipping_fee_krw,
           coalesce(p.settled_at, p.confirming_at) as paid_at,
           case when p.status = 'done' then public.refund_due_of_payment(p.id) else 0 end as due,
           r.status as refund_state, r.amount_krw as refunded, r.last_error,
           (p.review_at is not null and p.status in ('confirming', 'waiting_deposit'))
             or (p.status = 'done' and p.deposit_reverted_at is not null) as needs_review
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    left join public.refunds r on r.payment_id = p.id and r.box_id is null
    where p.status = 'done' or (p.review_at is not null and p.status in ('confirming', 'waiting_deposit'))
    union all
    -- 상자마다 한 줄(INV-M8·M9): 도착하지 않음으로 닫힌 상자('missing_box'). 늦게 온 상자는 주문 환불에서 배송비를 뺀 몫으로만 돌려주고 상자 줄을 따로 만들지 않는다.
    -- 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
           'missing_box', fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error, false
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    -- 상자 환불은 닫힌 상자에만 있다(INV-M9, 2026-10-10)
    where b.missing_at is not null
    union all
    -- 역조공을 낸 사람은 크리에이터 — 공개 이름(creators.name)으로 보인다(가입 닉네임과 다를 수 있다)
    select 'revgift', s.id, s.order_no, 'revgift', coalesce(cr.name, cp.nickname),
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, coalesce(d.settled_at, d.confirming_at),
           case when d.status = 'done' then public.refund_due_of_share(s.id) else 0 end, r.status, r.amount_krw, r.last_error,
           d.review_at is not null and d.status = 'confirming'
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    left join public.refunds r on r.share_id = s.id
    where d.status = 'done' or (d.review_at is not null and d.status = 'confirming')
  )
  select u.unit_kind, u.unit_id, u.order_no, u.payment_kind, u.payer_nickname,
         u.amount_krw, u.goods_krw, u.service_fee_krw, u.inspection_fee_krw, u.shipping_fee_krw, u.paid_at,
         coalesce(u.refund_state, case when u.due > 0 then 'due' else 'none' end),
         coalesce(u.refunded, case when u.due > 0 then u.due end),
         u.last_error, u.needs_review
  from units u
  where public.is_operator()
  order by u.paid_at desc, u.order_no
  limit 500;
$$;

revoke all on function public.admin_payment_rows() from public, anon;
grant execute on function public.admin_payment_rows() to authenticated;

-- ── 11) 알림 종류 deposit_expired ──────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'deposit_expired'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'gift_undelivered', 'difference_due', 'payment_canceled', 'difference_canceled', 'gift_reply', 'gift_received',
  'creator_check', 'deposit_expired'
]));

create or replace function public.notification_kind_must_deliver(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- notifications INV-N6 표: 끌 수 없음 11종. 모르는 종류·빈 값은 거짓.
  select coalesce(p_kind = any (array[
    'approval_request', 'hold', 'creator_check', 'hold_fan', 'box_missing', 'gift_pending_box', 'gift_undelivered',
    'difference_due', 'payment_canceled', 'difference_canceled', 'deposit_expired'
  ]), false);
$$;
