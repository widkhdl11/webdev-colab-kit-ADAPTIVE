-- 결과를 모르는 결제 확정 — 결제사 결제 조회로 다시 확인 (payment INV-M19, 카드 d54 「맞아, 추천대로」).
-- 승인 호출이 시간 초과·연결 끊김으로 끝나면 결제는 「승인 중(confirming)」에 남는다. 앱 서버가 결제사 조회로 정리한다.
--
-- 1) 칸 둘(팬 선물·차액 결제 payments, 역조공 결제 revgift_sends 모두):
--    confirming_at — 「승인 중」이 된 시각. 결제 확정 시작 함수(claim_*)가 채운다.
--    review_at     — 「확인 필요」 표시(결제사는 승인됐다는데 금액·주문번호가 기록과 다름). 상태 값을 늘리지 않고 칸으로 둔다 —
--                    status 를 비교하는 기존 함수·화면이 그대로 돈다. 사람이 결제사 관리 화면에서 처리한다.
--    last_checked_at — 다시 확인이 결제사를 마지막으로 부른 시각. 목록이 이 순서로 뽑아 그대로 남는 줄이 앞을 차지하지 않게 한다.
--    이 파일 전에 「승인 중」이 된 줄은 시각이 비어 있다 — 적용할 때 지금 시각으로 채워 10분 뒤 확인 대상이 되게 한다(1의 끝).
--    비어 있는 줄에만 쓰므로 다시 적용해도 이미 채워진 시각은 바뀌지 않는다.
-- 2) 결제 확정 시작 셋(claim_payment · claim_difference_payment · claim_revgift_payment)을 마지막 정의 그대로 두고 confirming_at 만 더한다.
-- 3) payment_reconcile_targets(p_order_no) — 「승인 중」이 된 지 10분이 지났고 확인 필요 표시가 없는 결제. 10분 조건은 여기서 DB 시각으로 본다
--    (막 승인을 부르고 있는 요청과 겹치지 않게). 주문번호를 주면 그 주문(역조공은 그 몫이 든 보내기)만 — 「지금 돌리기」 한 줄.
--    한 번에 6줄까지(조회 10초 제한 × 6 이 예약 입구의 함수 시간 60초 안에 들게), 마지막으로 확인한 시각이 오래된 순(확인한 적 없으면 먼저).
--    그대로 남는 줄은 확인할 때마다 뒤로 가므로 새로 대상이 된 줄이 다음 회차에 확인된다. 남은 줄은 다음 회차가 본다.
--    payment_mark_checked(p_source, p_toss_order_id) — 결제사를 부르기 직전에 그 줄의 last_checked_at 을 지금으로.
-- 4) payment_mark_review(p_source, p_toss_order_id) — 승인 중이고 아직 표시가 없는 줄에만 표시를 단다. 바꿨으면 true.
--    완료·실패 반영은 기존 반영 함수(settle_payment · settle_difference_payment · settle_revgift_payment — 승인 중인 줄만 바꿈)를 그대로 쓴다.
--    3)·4) 는 앱 서버 키만 부른다(직원·팬·크리에이터·익명 거부).
-- 5) admin_payment_rows 에 needs_review 칸을 더한다 — 확인 필요 결제는 결제가 끝나지 않았어도 한 줄로 나온다(환불 대상 아님).
--    확인 필요 = 표시가 있고 아직 승인 중인 결제. 표시 뒤 늦게 돌아온 원래 승인이 완료·실패로 바꿨으면 더는 확인 필요가 아니다.
--    반환 칸이 바뀌어 함수를 지우고 다시 만든다(권한도 다시 준다). 나머지는 20261008000014_partial_reject.sql 과 같다.
-- 6) schedule_reconcile_payments() + 예약 작업 fankkuk-reconcile(5분) — 20261008000012_schedule.sql 의
--    schedule_dispatch_notifications 와 같고 부르는 주소만 /api/cron/payments 다.

-- ── 1) 칸 ──────────────────────────────────

alter table public.payments add column if not exists confirming_at timestamptz;
alter table public.payments add column if not exists review_at timestamptz;
alter table public.revgift_sends add column if not exists confirming_at timestamptz;
alter table public.revgift_sends add column if not exists review_at timestamptz;
alter table public.payments add column if not exists last_checked_at timestamptz;
alter table public.revgift_sends add column if not exists last_checked_at timestamptz;

-- 시각이 비어 있는 「승인 중」 줄 채우기(다시 적용해도 같다 — 빈 줄에만)
update public.payments set confirming_at = now() where status = 'confirming' and confirming_at is null;
update public.revgift_sends set confirming_at = now() where status = 'confirming' and confirming_at is null;

create index if not exists payments_confirming_idx on public.payments (confirming_at) where status = 'confirming';
create index if not exists revgift_sends_confirming_idx on public.revgift_sends (confirming_at) where status = 'confirming';

-- ── 2) 결제 확정 시작 ──────────────────────────────────

-- 20261002000002_functions.sql 의 claim_payment 와 같고, 「승인 중」이 된 시각을 적는다.
create or replace function public.claim_payment(p_toss_order_id text)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.payments set status = 'confirming', confirming_at = now()
    where toss_order_id = p_toss_order_id and status = 'pending'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- 20261006000014_difference_review_fixes.sql 의 claim_difference_payment 와 같고, 「승인 중」이 된 시각을 적는다.
create or replace function public.claim_difference_payment(p_toss_order_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
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
  if v_state in ('held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped') then
    return false;
  end if;
  update public.payments set status = 'confirming', confirming_at = now() where id = v_pay.id;
  return true;
end $$;

-- 20261004000002_reverse_gifts.sql 의 claim_revgift_payment 와 같고, 「승인 중」이 된 시각을 적는다.
create or replace function public.claim_revgift_payment(p_toss_order_id text)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.revgift_sends set status = 'confirming', confirming_at = now()
    where toss_order_id = p_toss_order_id and status = 'pending'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke all on function public.claim_payment(text) from public, anon, authenticated;
grant execute on function public.claim_payment(text) to service_role;
revoke all on function public.claim_difference_payment(text) from public, anon, authenticated;
grant execute on function public.claim_difference_payment(text) to service_role;
revoke all on function public.claim_revgift_payment(text) from public, anon, authenticated;
grant execute on function public.claim_revgift_payment(text) to service_role;

-- ── 3) 다시 확인할 결제 목록 ──────────────────────────────────

create or replace function public.payment_reconcile_targets(p_order_no text default null)
returns table (source text, toss_order_id text, amount_krw integer, confirming_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.source, t.toss_order_id, t.amount_krw, t.confirming_at
  from (
    select p.kind as source, p.toss_order_id, p.amount_krw, p.confirming_at, p.last_checked_at
    from public.payments p
    join public.orders o on o.id = p.order_id
    where p.status = 'confirming' and p.review_at is null
      and p.confirming_at <= now() - interval '10 minutes'
      and (p_order_no is null or o.order_no = p_order_no)
    union all
    select 'revgift', d.toss_order_id, d.amount_krw, d.confirming_at, d.last_checked_at
    from public.revgift_sends d
    where d.status = 'confirming' and d.review_at is null
      and d.confirming_at <= now() - interval '10 minutes'
      and (p_order_no is null or exists (select 1 from public.revgift_shares s where s.send_id = d.id and s.order_no = p_order_no))
  ) t
  order by t.last_checked_at nulls first, t.confirming_at, t.toss_order_id
  limit 6;
$$;

create or replace function public.payment_mark_checked(p_source text, p_toss_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source in ('initial', 'difference') then
    update public.payments set last_checked_at = now() where toss_order_id = p_toss_order_id and kind = p_source;
  elsif p_source = 'revgift' then
    update public.revgift_sends set last_checked_at = now() where toss_order_id = p_toss_order_id;
  else
    raise exception '모르는 결제 종류' using errcode = '22023';
  end if;
end $$;

-- ── 4) 확인 필요 표시 ──────────────────────────────────

create or replace function public.payment_mark_review(p_source text, p_toss_order_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source in ('initial', 'difference') then
    update public.payments set review_at = now()
    where toss_order_id = p_toss_order_id and kind = p_source and status = 'confirming' and review_at is null;
  elsif p_source = 'revgift' then
    update public.revgift_sends set review_at = now()
    where toss_order_id = p_toss_order_id and status = 'confirming' and review_at is null;
  else
    raise exception '모르는 결제 종류' using errcode = '22023';
  end if;
  return found;
end $$;

revoke all on function public.payment_reconcile_targets(text) from public, anon, authenticated;
grant execute on function public.payment_reconcile_targets(text) to service_role;
revoke all on function public.payment_mark_checked(text, text) from public, anon, authenticated;
grant execute on function public.payment_mark_checked(text, text) to service_role;
revoke all on function public.payment_mark_review(text, text) from public, anon, authenticated;
grant execute on function public.payment_mark_review(text, text) to service_role;

-- ── 5) 관리자 결제·환불 내역 ──────────────────────────────────

drop function if exists public.admin_payment_rows();

create function public.admin_payment_rows()
returns table (unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text, amount_krw integer,
               goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer,
               paid_at timestamptz, refund_status text, refund_krw integer, refund_error text, needs_review boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with units as (
    -- 확인 필요(INV-M19) 결제는 끝나지 않았어도 나온다 — 시각은 「승인 중」이 된 시각, 환불 대상은 아니다
    select 'gift'::text as unit_kind, p.id as unit_id, o.order_no, p.kind as payment_kind, fp.nickname as payer_nickname,
           p.amount_krw, p.goods_krw, p.service_fee_krw, p.inspection_fee_krw, p.shipping_fee_krw,
           coalesce(p.settled_at, p.confirming_at) as paid_at,
           case when p.status = 'done' then public.refund_due_of_payment(p.id) else 0 end as due,
           r.status as refund_state, r.amount_krw as refunded, r.last_error,
           p.review_at is not null and p.status = 'confirming' as needs_review
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    left join public.refunds r on r.payment_id = p.id and r.box_id is null
    where p.status = 'done' or (p.review_at is not null and p.status = 'confirming')
    union all
    -- 상자마다 한 줄(INV-M8·M18): 도착하지 않음으로 닫힌 상자('missing_box'), 거절·반려 뒤 늦게 도착한 상자('late_box').
    -- 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
           case when b.missing_at is not null then 'missing_box' else 'late_box' end, fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error, false
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    where b.missing_at is not null
       or (exists (select 1 from public.inbound_codes c where c.box_id = b.id and c.kept_at is not null)
           and exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))
    union all
    select 'revgift', s.id, s.order_no, 'revgift', cp.nickname,
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, coalesce(d.settled_at, d.confirming_at),
           case when d.status = 'done' then public.refund_due_of_share(s.id) else 0 end, r.status, r.amount_krw, r.last_error,
           d.review_at is not null and d.status = 'confirming'
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
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

-- ── 6) 예약 실행 ──────────────────────────────────

create or replace function public.schedule_reconcile_payments()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_secret text;
begin
  select s.decrypted_secret into v_origin from vault.decrypted_secrets s where s.name = 'fankkuk_app_origin';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'fankkuk_schedule_secret';
  if v_origin is null or v_secret is null or char_length(v_secret) < 32
     or not (v_origin ~ '^https://[^/?#@]+$' or v_origin ~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{1,5})?$') then
    return null;
  end if;
  return net.http_post(
    url := v_origin || '/api/cron/payments',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function public.schedule_reconcile_payments() from public, anon, authenticated, service_role;

select cron.schedule('fankkuk-reconcile', '*/5 * * * *', 'select public.schedule_reconcile_payments()');
