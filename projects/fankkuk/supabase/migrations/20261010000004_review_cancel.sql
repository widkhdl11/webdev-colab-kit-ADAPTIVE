-- 2026-10-10 「확인 필요」 결제의 전액 취소 — 정책 문제집 메모 B16 (DECISIONS 2026-10-10 「전액 취소 하나로」).
-- 스펙: payment INV-M20 · notifications INV-N19.
--
-- 업계 표준: 결제사는 승인됐다는데 금액이 주문 금액과 다르면(또는 부분 취소됨) 그 결제를 전액 취소하고 주문은 결제 실패로, 고객에게 다시 결제를 안내한다.
-- 대표가 관리자 결제 화면에서 누른다. 결제사 취소는 앱 서버가 부른다(비밀 키는 앱 서버만, INV-M4).
--
-- 1) 칸: payments · revgift_sends 에 review_payment_key · review_balance_krw — 표시할 때 결제사 조회 응답의 결제 키와 취소 가능 금액(INV-M20 ①).
-- 2) payment_mark_review(source, toss_order_id, payment_key, balance_krw) — 두 칸을 같이 남긴다. 옛 두 인자 함수는 지운다.
-- 3) review_cancels 표 — 결제번호마다 취소 기록 하나. 멱등 키 = 기록 ID(다시 시도해도 같은 키).
--    amount_krw 는 표시 때 결제사가 알려 준 남은 금액(보여 주기용). 결제사에는 금액을 비워 남은 금액 전부 취소를 보낸다(앱 서버).
--    결제사 응답을 받지 못했거나 알아볼 수 없으면 앱 서버는 결과를 기록하지 않는다 — 「처리 중」으로 남아 늦은 승인을 막는다.
-- 4) admin_claim_review_cancel — 대표 로그인 토큰으로만. 결제 줄 → 취소 기록 순서로 잠근다.
-- 5) settle_review_cancel — 앱 서버 키로만. 같은 순서로 잠그고, 성공이면 결제를 실패로(승인 중인 줄만) + 팬 알림(INV-N19).
-- 6) 결제 줄 트리거 — 취소 기록이 처리 중·완료면 완료로 바꾸지 않는다(INV-M20 ④), 결제번호가 바뀌면(차액 다시 준비) 표시를 비운다(⑤).
-- 7) admin_review_payments — 운영자(직원·대표)가 읽는 확인 필요 결제 목록과 취소 상태·요청 시각
--    (「처리 중」이 2분 넘게 남으면 화면이 다시 누를 수 있게 버튼을 연다).
-- 8) 알림 종류 둘(payment_canceled · difference_canceled).

-- ── 1) 칸 ──────────────────────────────────

alter table public.payments add column if not exists review_payment_key text;
alter table public.payments add column if not exists review_balance_krw integer;
alter table public.revgift_sends add column if not exists review_payment_key text;
alter table public.revgift_sends add column if not exists review_balance_krw integer;
alter table public.payments drop constraint if exists payments_review_balance_positive;
alter table public.payments add constraint payments_review_balance_positive check (review_balance_krw is null or review_balance_krw > 0);
alter table public.revgift_sends drop constraint if exists revgift_sends_review_balance_positive;
alter table public.revgift_sends add constraint revgift_sends_review_balance_positive check (review_balance_krw is null or review_balance_krw > 0);

-- ── 2) 확인 필요 표시 ──────────────────────────────────

drop function if exists public.payment_mark_review(text, text);

create or replace function public.payment_mark_review(p_source text, p_toss_order_id text, p_payment_key text, p_balance_krw integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source in ('initial', 'difference') then
    update public.payments
    set review_at = now(), review_payment_key = nullif(p_payment_key, ''), review_balance_krw = case when p_balance_krw > 0 then p_balance_krw end
    where toss_order_id = p_toss_order_id and kind = p_source and status = 'confirming' and review_at is null;
  elsif p_source = 'revgift' then
    update public.revgift_sends
    set review_at = now(), review_payment_key = nullif(p_payment_key, ''), review_balance_krw = case when p_balance_krw > 0 then p_balance_krw end
    where toss_order_id = p_toss_order_id and status = 'confirming' and review_at is null;
  else
    raise exception '모르는 결제 종류' using errcode = '22023';
  end if;
  return found;
end $$;

revoke all on function public.payment_mark_review(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.payment_mark_review(text, text, text, integer) to service_role;

-- ── 3) 취소 기록 ──────────────────────────────────

create table if not exists public.review_cancels (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('initial', 'difference', 'revgift')),
  toss_order_id text not null unique,
  payment_id uuid references public.payments(id) on delete cascade,
  send_id uuid references public.revgift_sends(id) on delete cascade,
  payment_key text not null check (payment_key <> ''),
  amount_krw integer not null check (amount_krw > 0),
  status text not null check (status in ('requesting', 'done', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  last_error text check (char_length(last_error) <= 200),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((source = 'revgift') = (send_id is not null)),
  check ((source = 'revgift') = (payment_id is null)),
  check ((status = 'requesting') = (finished_at is null))
);

alter table public.review_cancels enable row level security;
revoke all on table public.review_cancels from anon, authenticated;

-- ── 4) 잡기 (대표) ──────────────────────────────────

create or replace function public.admin_claim_review_cancel(p_source text, p_toss_order_id text)
returns table (cancel_id uuid, payment_key text, amount_krw integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
  v_review_at timestamptz;
  v_key text;
  v_balance integer;
  v_payment_id uuid;
  v_send_id uuid;
  v_c public.review_cancels;
begin
  if not public.is_owner() then
    raise exception '확인 필요 결제의 취소는 대표만 한다' using errcode = '42501';
  end if;
  -- 잠금 순서: 결제 줄 → 취소 기록(settle_review_cancel 과 같다). 결제 줄을 먼저 잡아 두 번 누름이 줄을 선다
  if p_source in ('initial', 'difference') then
    select p.status::text, p.review_at, p.review_payment_key, p.review_balance_krw, p.id
      into v_status, v_review_at, v_key, v_balance, v_payment_id
    from public.payments p where p.toss_order_id = p_toss_order_id and p.kind = p_source for update;
  elsif p_source = 'revgift' then
    select d.status::text, d.review_at, d.review_payment_key, d.review_balance_krw, d.id
      into v_status, v_review_at, v_key, v_balance, v_send_id
    from public.revgift_sends d where d.toss_order_id = p_toss_order_id for update;
  else
    raise exception '모르는 결제 종류' using errcode = '22023';
  end if;
  if v_status is null then
    raise exception '그런 결제가 없다' using errcode = 'P0002';
  end if;

  select * into v_c from public.review_cancels c where c.toss_order_id = p_toss_order_id for update;
  if v_c.id is not null and v_c.status = 'done' then
    raise exception '이미 취소했다' using errcode = 'P0023';
  end if;
  if v_c.id is not null and v_c.status = 'requesting' and v_c.requested_at > now() - interval '2 minutes' then
    raise exception '취소를 처리하고 있다' using errcode = 'P0024';
  end if;
  -- 확인 필요이고 아직 승인 중이며 취소할 키·금액을 아는 결제만(INV-M20 ②)
  if v_status <> 'confirming' or v_review_at is null or v_key is null or v_balance is null then
    raise exception '취소할 수 있는 결제가 아니다' using errcode = 'P0022';
  end if;

  if v_c.id is not null then
    -- 실패했거나 처리 중이 2분 넘게 남은 기록 — 같은 기록·같은 키·같은 금액으로 다시
    update public.review_cancels
    set status = 'requesting', attempts = attempts + 1, last_error = null, requested_by = auth.uid(), requested_at = now(), finished_at = null
    where id = v_c.id;
    return query select v_c.id, v_c.payment_key, v_c.amount_krw;
    return;
  end if;

  return query
  insert into public.review_cancels as c (source, toss_order_id, payment_id, send_id, payment_key, amount_krw, status, requested_by)
  values (p_source, p_toss_order_id, v_payment_id, v_send_id, v_key, v_balance, 'requesting', auth.uid())
  returning c.id, c.payment_key, c.amount_krw;
end $$;

revoke all on function public.admin_claim_review_cancel(text, text) from public, anon;
grant execute on function public.admin_claim_review_cancel(text, text) to authenticated;

-- ── 5) 결과 반영 (앱 서버) ──────────────────────────────────

create or replace function public.settle_review_cancel(p_cancel_id uuid, p_ok boolean, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.review_cancels;
  v_order_id uuid;
begin
  select * into v_c from public.review_cancels c where c.id = p_cancel_id;
  if v_c.id is null then
    return false;
  end if;
  -- 잠금 순서: 결제 줄 → 취소 기록(잡기와 같다)
  if v_c.source = 'revgift' then
    perform 1 from public.revgift_sends d where d.id = v_c.send_id for update;
  else
    perform 1 from public.payments p where p.id = v_c.payment_id for update;
  end if;
  select * into v_c from public.review_cancels c where c.id = p_cancel_id for update;
  if v_c.status <> 'requesting' then
    return false;
  end if;

  if not p_ok then
    update public.review_cancels
    set status = 'failed', last_error = left(coalesce(nullif(p_error, ''), '결제사 취소 실패'), 200), finished_at = now()
    where id = v_c.id;
    return true;
  end if;

  update public.review_cancels set status = 'done', last_error = null, finished_at = now() where id = v_c.id;
  -- 결제는 실패로 — 승인 중인 줄만(INV-M5). 그 뒤 흐름은 지금 결제 실패와 같다(INV-M20 ③)
  if v_c.source = 'revgift' then
    update public.revgift_sends set status = 'failed', settled_at = null where id = v_c.send_id and status = 'confirming';
  else
    update public.payments set status = 'failed', payment_key = null, settled_at = now()
    where id = v_c.payment_id and status = 'confirming'
    returning order_id into v_order_id;
    if v_order_id is not null then
      -- notifications INV-N19: 보낸 팬에게 한 번(같은 이름의 줄은 넣지 않는다)
      perform public.notification_enqueue(
        case when v_c.source = 'initial' then 'payment_canceled' else 'difference_canceled' end,
        v_order_id, null, 1::smallint, (select o.fan_id from public.orders o where o.id = v_order_id), now());
    end if;
  end if;
  return true;
end $$;

revoke all on function public.settle_review_cancel(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.settle_review_cancel(uuid, boolean, text) to service_role;

-- ── 6) 결제 줄 지키기 ──────────────────────────────────

create or replace function public.guard_review_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ④ 취소 기록이 처리 중·완료면 완료로 바꾸지 않는다 — 돈을 돌려줬거나 돌려주는 중인 결제다. 줄을 바꾸지 않고 넘긴다(반영 함수는 「안 바뀜」을 돌려준다)
  if new.status = 'done' and old.status is distinct from 'done'
     and exists (select 1 from public.review_cancels c where c.toss_order_id = old.toss_order_id and c.status in ('requesting', 'done')) then
    return null;
  end if;
  -- ⑤ 결제번호가 바뀌면(차액 다시 준비) 지난 결제의 확인 필요 표시와 기록값을 비운다
  if new.toss_order_id is distinct from old.toss_order_id then
    new.review_at := null;
    new.review_payment_key := null;
    new.review_balance_krw := null;
    new.confirming_at := null;
    new.last_checked_at := null;
  end if;
  return new;
end $$;

drop trigger if exists guard_review_cancel on public.payments;
create trigger guard_review_cancel before update on public.payments
for each row execute function public.guard_review_cancel();
drop trigger if exists guard_review_cancel on public.revgift_sends;
create trigger guard_review_cancel before update on public.revgift_sends
for each row execute function public.guard_review_cancel();

-- ── 7) 확인 필요 결제 목록 (운영자) ──────────────────────────────────

-- 반환 칸이 바뀌면 지우고 다시 만든다(이 파일을 다시 적용할 때도 같다)
drop function if exists public.admin_review_payments();
create function public.admin_review_payments()
returns table (source text, toss_order_id text, order_no text, payer_nickname text, amount_krw integer, balance_krw integer,
               review_at timestamptz, cancel_status text, cancel_error text, cancel_attempts integer, cancel_requested_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_operator() then
    raise exception '운영자만 읽는다' using errcode = '42501';
  end if;
  return query
  with rows as (
    select p.kind as source, p.toss_order_id, o.order_no, fp.nickname as payer_nickname, p.amount_krw, p.review_balance_krw as balance_krw, p.review_at
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    where p.status = 'confirming' and p.review_at is not null
    union all
    select 'revgift', d.toss_order_id,
           (select string_agg(s.order_no, ', ' order by s.order_no) from public.revgift_shares s where s.send_id = d.id),
           cp.nickname, d.amount_krw, d.review_balance_krw, d.review_at
    from public.revgift_sends d
    join public.profiles cp on cp.id = d.sender_id
    where d.status = 'confirming' and d.review_at is not null
  )
  select r.source, r.toss_order_id, r.order_no, r.payer_nickname, r.amount_krw, r.balance_krw, r.review_at,
         coalesce(c.status, 'none'), c.last_error, coalesce(c.attempts, 0), c.requested_at
  from rows r
  left join public.review_cancels c on c.toss_order_id = r.toss_order_id
  order by r.review_at desc
  limit 200;
end $$;

revoke all on function public.admin_review_payments() from public, anon;
grant execute on function public.admin_review_payments() to authenticated;

-- ── 8) 알림 종류 ──────────────────────────────────

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'difference_due', 'payment_canceled', 'difference_canceled'
]));
alter table public.notification_kakao_templates drop constraint if exists notification_kakao_templates_kind_check;
alter table public.notification_kakao_templates add constraint notification_kakao_templates_kind_check check (kind = any (array[
  'approval_request', 'arrived', 'inspected', 'shipped', 'in_transit', 'delivered', 'hold', 'box_arrived', 'hold_fan', 'box_missing',
  'gift_pending_box', 'difference_due', 'payment_canceled', 'difference_canceled'
]));

notify pgrst, 'reload schema';
