-- 선물함(팬에게 보내기) 4부 — 명세서 결제 · 72/168시간 · 미결제 착불 반송 · 송장 출력·출고 · 줄 환불 · 탈퇴 정리.
-- 스펙: docs/specs/revgift-box.md (INV-GB1 paid~done·returning · GB15 Q15 · GB18 · GB19 · GB20 · GB21 · GB22), 순서: workspace/revgift-box-plan.md 4부.
--
-- 개인정보 구역(pii)을 쓰는 곳은 셋이다 — 사람이 적용하는 supabase/manual/0034_revgift_box_settle.sql 이 만든다.
--   · 송장 출력 때 신청 사본(봉인)을 내주는 함수 public.revgift_box_claim_print(INV-GB20 (a)~(c)·상한). 0034 전에는 출력이 「함수 없음」으로 실패한다.
--   · 사본 삭제 까닭 「unpaid_return」(미결제 반송)·「shipped」(출고 + 72시간). 0034 전에는 그 처리가 실패해 선물함이 그대로 남는다
--     (반송 전환은 다음 회차에 다시 본다 — 결제 시작은 168시간이 지나면 거부되므로 돈이 나가지는 않는다).
-- 그래서 함수 본문 검사를 끄고 만든다.
--
-- 누구인지는 로그인 토큰으로 정한다(크리에이터 = 선물함 주인, 사무실 = is_operator, 대표 = is_owner).
-- 결제 확정 시작·결과 기록은 앱 서버 키(service_role)만 — 결제사 승인 API 를 부르는 것이 앱 서버이기 때문이다(payment INV-M4 와 같은 자리).
-- 송장 출력 쪽은 복호화 전용 역할(address_decryptor)만.
-- 잠금 순서: 선물함 줄 → 결제 줄 → 신청 줄 (INV-GB2, office-workflow INV-W12 의 순서). 환불은 결제 줄 → 환불 줄(admin_claim_refund 와 같다).
--
-- 오류 코드
--   22023 입력 꼴 · 42501 권한 · P0002 찾을 수 없음 · P0022 지금 상태에서 할 수 없음 · 55000 지금 단계에서 할 수 없음 · P0043 이 신청의 송장이 아님
set check_function_bodies = off;

-- ── 규칙 값 ────────────────────────────────────────────
-- 3부 값에 4부 값을 더한다.
create or replace function public.revgift_box_rules()
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'capacity_max', 100,        -- INV-GB3 받을 인원
    'name_max', 40,             -- INV-GB3 이름 (Q3)
    'early_max_rank', 50,       -- INV-GB14 초기 크리에이터
    'early_months', 3,          -- INV-GB14 혜택 기간(달력 개월, Q14)
    'early_monthly_lines', 30,  -- INV-GB15 한 달 300원 줄
    'personal_max_krw', 100000, -- INV-GB16 개인접수 실비 상한 (Q13)
    'cod_max_krw', 100000,      -- INV-GB13 착불 큰 상자 택배비 상한 (Q13)
    'tier_limits', jsonb_build_array(                                   -- INV-GB12 실측 구간(작은 것부터)
      jsonb_build_object('tier', 'xsmall', 'size_cm', 80, 'weight_kg', 2),
      jsonb_build_object('tier', 'small', 'size_cm', 100, 'weight_kg', 5),
      jsonb_build_object('tier', 'medium', 'size_cm', 120, 'weight_kg', 10),
      jsonb_build_object('tier', 'large', 'size_cm', 140, 'weight_kg', 15)),
    'carton_count_max', 100,    -- INV-GB11 보낸 상자 수(1 이상 — 상한은 선물함 받을 인원과 같게)
    'carton_wait_hours', 168,   -- INV-GB11 첫 큰 상자 입고 뒤 도착 안 함까지
    'awaiting_box_hours', 720,  -- INV-GB1 Q10 「다음」 뒤 큰 상자가 하나도 없으면 자동 취소
    'hold_hours', 168,          -- INV-GB12 Q11 확인 필요 카드 기한
    'cancelled_arrival_hours', 168, -- INV-GB23 취소한 선물함 상자 카드 기한
    'pay_due_hours', 72,        -- INV-GB18 결제 기한(명세서 발행 + 72시간 → 결제 기한 지남)
    'unpaid_return_hours', 168, -- INV-GB19 명세서 발행 + 168시간까지 결제가 없으면 착불 반송
    'pending_payment_hours', 24, -- INV-GB18 결제 대기는 만든 지 24시간이 지나면 닫힌다(payment INV-M15)
    'copy_after_ship_hours', 72, -- INV-GB20 출고 확정 + 72시간에 사본 삭제(reverse-gift INV-R9)
    'print_max', 3              -- INV-GB20 한 신청에 주소 열기 최대 3회(다시 출력 포함)
  )
$$;

-- ── 표 ────────────────────────────────────────────────

-- 선물함: 끝난 시각(자동 삭제가 5년을 센다, my-account INV-A16) · 미결제 반송 시작 · 반송 확정과 반송 송장번호(Q16)
alter table public.revgift_boxes add column if not exists ended_at timestamptz;
alter table public.revgift_boxes add column if not exists returning_at timestamptz;
alter table public.revgift_boxes add column if not exists returned_at timestamptz;
alter table public.revgift_boxes add column if not exists return_waybill_no text;
alter table public.revgift_boxes drop constraint if exists revgift_boxes_return_waybill;
alter table public.revgift_boxes add constraint revgift_boxes_return_waybill
  check ((return_waybill_no is null or return_waybill_no ~ '^[0-9]{10,14}$') and (status <> 'returned' or return_waybill_no is not null));

-- 신청: 송장 출력·운송장 번호·출고 확정(INV-GB20) · 출고 + 72시간 사본 삭제 처리 시각 · 출력 때 다시 판정한 할증 구분이 명세서 줄과 다름(INV-GB17)
alter table public.revgift_box_applications add column if not exists printed_at timestamptz;
alter table public.revgift_box_applications add column if not exists outbound_waybill_no text;
alter table public.revgift_box_applications add column if not exists shipped_at timestamptz;
alter table public.revgift_box_applications add column if not exists copy_dropped_at timestamptz;
alter table public.revgift_box_applications add column if not exists region_mismatch boolean not null default false;
alter table public.revgift_box_applications drop constraint if exists revgift_box_applications_outbound;
alter table public.revgift_box_applications add constraint revgift_box_applications_outbound
  check ((outbound_waybill_no is null or outbound_waybill_no ~ '^[0-9]{10,14}$')
         and (status not in ('shipped', 'delivered') or (shipped_at is not null and outbound_waybill_no is not null and printed_at is not null)));

-- 신청 유일 — 같은 선물함에 같은 팬은 하나(INV-GB4). 자동 삭제가 탈퇴한 팬 여럿을 같이 쓰는 「탈퇴한 회원」 하나로 바꾸므로 그 표시만 뺀다(my-account INV-A16).
alter table public.revgift_box_applications drop constraint if exists revgift_box_applications_box_id_fan_id_key;
create unique index if not exists revgift_box_applications_one_per_fan on public.revgift_box_applications (box_id, fan_id)
  where fan_id <> 'ffffffff-0000-4000-8000-000000000001';

-- 명세서 줄: 300원 줄 건수를 그 달 사용에서 돌려준 시각(INV-GB15 Q15 — 반송된 명세서·환불된 줄)
alter table public.revgift_box_invoice_lines add column if not exists early_returned_at timestamptz;
alter table public.revgift_box_invoice_lines drop constraint if exists revgift_box_invoice_lines_early_returned;
alter table public.revgift_box_invoice_lines add constraint revgift_box_invoice_lines_early_returned check (early_returned_at is null or early_rate);

-- 주소 사본 기록의 까닭에 「미결제 반송」·「출고 + 72시간」을 더한다(INV-GB19·GB20)
alter table public.revgift_box_address_events drop constraint revgift_box_address_events_reason_check;
alter table public.revgift_box_address_events add constraint revgift_box_address_events_reason_check
  check (reason in ('excluded_at_close', 'box_cancelled', 'withdrawn', 'missing', 'unpaid_return', 'shipped'));

-- 끝난 시각 — 끝(done·returned·cancelled)으로 들어가는 순간 같은 처리에서 적는다. 상태를 바꾸는 함수가 여럿이라 한 자리에서 잡는다.
create or replace function public.revgift_boxes_mark_ended()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status in ('done', 'returned', 'cancelled') and old.status not in ('done', 'returned', 'cancelled') then
    new.ended_at := now();
  elsif new.status not in ('done', 'returned', 'cancelled') then
    new.ended_at := null; -- 다시 연 선물함(INV-GB23)
  end if;
  return new;
end $$;
revoke all on function public.revgift_boxes_mark_ended() from public, anon, authenticated, service_role;
drop trigger if exists revgift_boxes_mark_ended on public.revgift_boxes;
create trigger revgift_boxes_mark_ended before update of status on public.revgift_boxes
  for each row execute function public.revgift_boxes_mark_ended();
-- 이 파일 전에 끝난 선물함(취소) — 끝난 시각이 비어 있는 줄만, 다시 돌려도 결과가 같다
update public.revgift_boxes set ended_at = created_at where status in ('done', 'returned', 'cancelled') and ended_at is null;

-- 결제 — 명세서 하나에 결제 대기 여럿(결제창을 다시 열 때마다), 완료는 하나(INV-GB18). 칸 꼴은 역조공 보내기 결제와 같다.
create table if not exists public.revgift_box_payments (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.revgift_boxes (id) on delete cascade,
  invoice_id uuid not null references public.revgift_box_invoices (id) on delete cascade,
  toss_order_id text not null unique check (toss_order_id ~ '^gbpay_[0-9a-f]{32}$'),
  amount_krw integer not null check (amount_krw > 0),
  status public.payment_status not null default 'pending',
  payment_key text,
  created_at timestamptz not null default now(),
  confirming_at timestamptz,
  settled_at timestamptz,
  review_at timestamptz,
  last_checked_at timestamptz,
  review_payment_key text,
  review_balance_krw integer,
  check ((status = 'done') = (payment_key is not null)),
  check (status <> 'done' or settled_at is not null),
  check (status <> 'confirming' or confirming_at is not null)
);
-- 명세서마다 결제 완료 하나 · 승인 중 하나(결제사 승인을 동시에 둘 부르지 않는다)
create unique index if not exists revgift_box_payments_one_done on public.revgift_box_payments (invoice_id) where status = 'done';
create unique index if not exists revgift_box_payments_one_confirming on public.revgift_box_payments (invoice_id) where status = 'confirming';
create index if not exists revgift_box_payments_box_idx on public.revgift_box_payments (box_id);
alter table public.revgift_box_payments enable row level security;
revoke all on public.revgift_box_payments from anon, authenticated;

-- 주소 열람 기록(INV-GB20 — reverse-gift INV-R13·R16 과 같은 꼴). 고치거나 지울 수 없다(자동 삭제만 잠시 풀고 지운다).
create table if not exists public.revgift_box_decrypt_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  application_id uuid not null references public.revgift_box_applications (id),
  requester_id uuid not null,
  result text not null check (result in ('opened', 'denied')),
  print_no smallint check (print_no between 1 and 3),
  deny_reason text check (deny_reason in ('not_owner', 'no_valid_approval', 'order_mismatch', 'order_not_printable', 'decrypt_limit_reached')),
  check ((result = 'opened') = (print_no is not null and deny_reason is null)),
  check ((result = 'denied') = (deny_reason is not null and print_no is null))
);
create index if not exists revgift_box_decrypt_log_app_opened on public.revgift_box_decrypt_log (application_id) where result = 'opened';
create table if not exists public.revgift_box_decrypt_releases (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  opened_log_id bigint not null unique references public.revgift_box_decrypt_log (id),
  application_id uuid not null references public.revgift_box_applications (id),
  requester_id uuid not null
);
create index if not exists revgift_box_decrypt_releases_app on public.revgift_box_decrypt_releases (application_id);
alter table public.revgift_box_decrypt_log enable row level security;
alter table public.revgift_box_decrypt_releases enable row level security;
revoke all on public.revgift_box_decrypt_log from public, anon, authenticated, service_role;
revoke all on public.revgift_box_decrypt_releases from public, anon, authenticated, service_role;
drop trigger if exists revgift_box_decrypt_log_no_update on public.revgift_box_decrypt_log;
create trigger revgift_box_decrypt_log_no_update before delete or update on public.revgift_box_decrypt_log
  for each row execute function public.revgift_decrypt_append_only();
drop trigger if exists revgift_box_decrypt_log_no_truncate on public.revgift_box_decrypt_log;
create trigger revgift_box_decrypt_log_no_truncate before truncate on public.revgift_box_decrypt_log
  for each statement execute function public.revgift_decrypt_append_only();
drop trigger if exists revgift_box_decrypt_releases_no_update on public.revgift_box_decrypt_releases;
create trigger revgift_box_decrypt_releases_no_update before delete or update on public.revgift_box_decrypt_releases
  for each row execute function public.revgift_decrypt_append_only();
drop trigger if exists revgift_box_decrypt_releases_no_truncate on public.revgift_box_decrypt_releases;
create trigger revgift_box_decrypt_releases_no_truncate before truncate on public.revgift_box_decrypt_releases
  for each statement execute function public.revgift_decrypt_append_only();

-- 줄 환불(INV-GB21) — 환불 기록은 팬 선물·역조공과 같은 표. 명세서 줄 하나에 환불 하나.
alter table public.refunds add column if not exists box_line_id uuid unique references public.revgift_box_invoice_lines (id);
alter table public.refunds drop constraint refunds_check;
alter table public.refunds add constraint refunds_check check (num_nonnulls(payment_id, share_id, box_line_id) = 1);

-- ── 공용 처리 ──────────────────────────────────────────

-- 바코드(신청 번호) → 신청. 꼴이 틀리면 없음과 같다.
create or replace function public.revgift_box_app_of_label(p_label text)
returns public.revgift_box_applications
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications;
begin
  if p_label is null or p_label !~ '^GB[0-9]{8,12}$' then
    raise exception '신청 번호 꼴이 틀리다' using errcode = '22023';
  end if;
  select * into v from public.revgift_box_applications a where a.label_no = substr(p_label, 3)::bigint;
  if not found then
    raise exception '신청을 찾을 수 없다' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- 300원 줄 건수 돌려주기(INV-GB15 Q15) — 그 줄을 센 달(명세서를 만든 한국 시간 달)과 지금이 같은 달일 때만, 한 줄에 한 번.
create or replace function public.revgift_box_give_back_early(p_line_ids uuid[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select c.creator_id, date_trunc('month', i.created_at at time zone 'Asia/Seoul')::date as month, array_agg(l.id) as ids
    from public.revgift_box_invoice_lines l
    join public.revgift_box_invoices i on i.id = l.invoice_id
    join public.revgift_boxes c on c.id = i.box_id
    where l.id = any (coalesce(p_line_ids, '{}')) and l.early_rate and l.early_returned_at is null
      and date_trunc('month', i.created_at at time zone 'Asia/Seoul') = date_trunc('month', now() at time zone 'Asia/Seoul')
    group by c.creator_id, date_trunc('month', i.created_at at time zone 'Asia/Seoul')::date
  loop
    perform 1 from public.early_creator_monthly_usage u where u.creator_id = r.creator_id and u.month = r.month for update;
    update public.revgift_box_invoice_lines set early_returned_at = now() where id = any (r.ids) and early_returned_at is null;
    update public.early_creator_monthly_usage set used = greatest(used - cardinality(r.ids), 0) where creator_id = r.creator_id and month = r.month;
    v_n := v_n + cardinality(r.ids);
  end loop;
  return v_n;
end $$;

-- 줄 환불 금액(INV-GB21 ②) — 결제가 끝났고, 그 줄의 신청이 출고 전에 끝났으면(팬 탈퇴 — Q17) 그 줄 금액(택배비·서비스료·할증). 아니면 null.
-- 착불 큰 상자 택배비는 줄 금액에 없다(돌려주지 않는다). 출고된 줄은 돌려주지 않는다(③).
create or replace function public.revgift_box_line_refund_due(p_line_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select l.amount_krw
  from public.revgift_box_invoice_lines l
  join public.revgift_box_applications a on a.id = l.application_id
  where l.id = p_line_id and a.status = 'ended' and a.shipped_at is null
    and exists (select 1 from public.revgift_box_payments p where p.invoice_id = l.invoice_id and p.status = 'done')
$$;

-- 발송 중 → 끝(INV-GB1) — 명세서 줄마다 출고됐거나, 출고 전에 끝나 환불이 끝났으면. 선물함 줄은 부르는 쪽이 잠갔다.
create or replace function public.revgift_box_try_done(p_box_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.revgift_boxes b where b.id = p_box_id and b.status = 'paid') then
    return false;
  end if;
  if exists (
    select 1 from public.revgift_box_invoice_lines l
    join public.revgift_box_invoices i on i.id = l.invoice_id
    join public.revgift_box_applications a on a.id = l.application_id
    where i.box_id = p_box_id
      and a.status not in ('shipped', 'delivered')
      and not (a.status = 'ended' and exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done'))
  ) then
    return false;
  end if;
  update public.revgift_boxes set status = 'done' where id = p_box_id;
  return true;
end $$;

-- ── 결제 (INV-GB18 · GB19) ─────────────────────────────

-- 결제 대기 만들기 — 선물함 주인만, 결제 요청·결제 기한 지남일 때만, 명세서 발행 + 168시간 전에만. 금액은 저장된 명세서 금액(브라우저 값은 받지 않는다).
-- 돌려주는 값: 결제창에 넘길 주문 ID·금액.
create or replace function public.revgift_box_start_payment(p_box_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes := public.revgift_box_lock_mine(p_box_id);
  v_rules jsonb := public.revgift_box_rules();
  v_invoice public.revgift_box_invoices;
  v_order text := 'gbpay_' || replace(gen_random_uuid()::text, '-', '');
begin
  if v.status not in ('invoiced', 'overdue')
     or clock_timestamp() >= v.invoiced_at + make_interval(hours => (v_rules ->> 'unpaid_return_hours')::integer) then
    raise exception '지금은 결제할 수 없다' using errcode = 'P0022';
  end if;
  select * into v_invoice from public.revgift_box_invoices i where i.box_id = v.id;
  insert into public.revgift_box_payments (box_id, invoice_id, toss_order_id, amount_krw) values (v.id, v_invoice.id, v_order, v_invoice.amount_krw);
  return jsonb_build_object('toss_order_id', v_order, 'amount_krw', v_invoice.amount_krw);
end $$;

-- 결제 확정 시작(결제 대기 → 승인 중) — 앱 서버만. 선물함 줄을 잠근 뒤 본다: 반송 전환(예약 작업)과 겹치면 먼저 잠근 쪽 하나만(INV-GB19 S19b).
-- 결제 요청·결제 기한 지남이 아니거나, 168시간이 지났거나, 같은 명세서에 승인 중·완료가 있으면 false.
create or replace function public.claim_revgift_box_payment(p_toss_order_id text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_pay public.revgift_box_payments;
  v public.revgift_boxes;
begin
  select * into v_pay from public.revgift_box_payments where toss_order_id = p_toss_order_id;
  if not found then
    return false;
  end if;
  select * into v from public.revgift_boxes b where b.id = v_pay.box_id for update;
  if v.status not in ('invoiced', 'overdue')
     or clock_timestamp() >= v.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'unpaid_return_hours')::integer) then
    return false;
  end if;
  update public.revgift_box_payments p set status = 'confirming', confirming_at = now()
  where p.id = v_pay.id and p.status = 'pending'
    and not exists (select 1 from public.revgift_box_payments x where x.invoice_id = v_pay.invoice_id and x.status in ('confirming', 'done'));
  return found;
end $$;

-- 결제 결과 기록 — 앱 서버만(성공 주소의 확정·결제 다시 확인). 결제 대기·승인 중인 줄만 바꾼다 — 두 번·동시에 와도 완료는 하나(S18).
-- 완료면 같은 처리에서 선물함 발송 중, 명세서에 든 실측 신청은 결제됨(이미 끝난 신청은 그대로 — 환불 대상이 된다), 같은 명세서의 다른 결제 대기는 닫는다.
create or replace function public.settle_revgift_box_payment(p_toss_order_id text, p_status public.payment_status, p_payment_key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_pay public.revgift_box_payments;
begin
  if p_status not in ('done', 'failed') then
    raise exception 'done 또는 failed 만' using errcode = '22023';
  end if;
  select * into v_pay from public.revgift_box_payments where toss_order_id = p_toss_order_id;
  if not found then
    return false;
  end if;
  perform 1 from public.revgift_boxes b where b.id = v_pay.box_id for update;
  update public.revgift_box_payments
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = case when p_status = 'done' then now() end
  where id = v_pay.id and status in ('pending', 'confirming');
  if not found then
    return false;
  end if;
  if p_status = 'done' then
    update public.revgift_boxes set status = 'paid' where id = v_pay.box_id and status in ('invoiced', 'overdue');
    perform 1 from public.revgift_box_applications a where a.box_id = v_pay.box_id order by a.id for update;
    update public.revgift_box_applications a set status = 'paid'
    where a.status = 'measured' and exists (select 1 from public.revgift_box_invoice_lines l where l.invoice_id = v_pay.invoice_id and l.application_id = a.id);
    update public.revgift_box_payments set status = 'failed' where invoice_id = v_pay.invoice_id and status = 'pending';
    perform public.revgift_box_try_done(v_pay.box_id);
  end if;
  return true;
end $$;

-- ── 사무실 — 출고 (INV-GB20) ─────────────────────────────
-- 주소를 여는 것은 송장 출력 함수(복호화 전용 역할)뿐이다 — 봉인을 내주는 함수는 manual/0034(revgift_box_claim_print).
-- 아래는 그 앞뒤: 거부 줄 남기기 · 출력 마무리(송장 출력함) · 연 줄 돌려받기 · 출력 때 다시 판정한 할증 구분 · 운송장 번호 넣기 · 출고 확정.

-- 사무실이 바코드로 신청을 불러온다 — 선물함 이름 · 닉네임 · 상태 · 송장 출력·운송장·출고 여부 · 할증 지역 불일치. 주소·실명·전화 칸이 없다.
create or replace function public.office_gift_box_outbound_lookup(p_label text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications;
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  v := public.revgift_box_app_of_label(p_label);
  return (
    select jsonb_build_object(
      'label', public.revgift_box_label_text(v.label_no), 'nickname', p.nickname, 'box_name', b.name, 'box_status', b.status, 'status', v.status,
      'printed', v.printed_at is not null, 'waybill', v.outbound_waybill_no, 'shipped', v.shipped_at is not null, 'region_mismatch', v.region_mismatch,
      'tier', (select l.tier from public.revgift_box_invoice_lines l where l.application_id = v.id))
    from public.revgift_boxes b join public.profiles p on p.id = v.fan_id
    where b.id = v.box_id);
end $$;

-- 송장 출력 함수가 거부 줄을 남긴다(대표가 아님·봉인 대조 실패) — 복호화 전용 역할만.
create or replace function public.revgift_box_log_denied(p_label text, p_requester uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications := public.revgift_box_app_of_label(p_label);
begin
  if p_requester is null then
    raise exception '요청자가 없다' using errcode = '22023';
  end if;
  insert into public.revgift_box_decrypt_log (application_id, requester_id, result, deny_reason) values (v.id, p_requester, 'denied', p_reason);
end $$;

-- 출력 마무리 — 처음이면 송장 출력함으로(운송장 번호는 송장 출력 방식대로 — 수동 입력이면 null), 다시 출력이면 처음 번호를 돌려준다.
create or replace function public.revgift_box_finish_print(p_label text, p_waybill text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications := public.revgift_box_app_of_label(p_label);
begin
  perform 1 from public.revgift_boxes b where b.id = v.box_id for update;
  select * into v from public.revgift_box_applications a where a.id = v.id for update;
  if v.printed_at is not null then
    return jsonb_build_object('waybill', v.outbound_waybill_no, 'first', false);
  end if;
  if v.status <> 'paid' then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if p_waybill is not null and p_waybill !~ '^[0-9]{10,14}$' then
    raise exception '송장번호 꼴이 틀리다' using errcode = '22023';
  end if;
  update public.revgift_box_applications set printed_at = now(), outbound_waybill_no = p_waybill where id = v.id;
  return jsonb_build_object('waybill', p_waybill, 'first', true);
end $$;

-- 연 줄 돌려받기(reverse-gift INV-R13 과 같은 조건) — 봉투를 연 뒤 송장이 나오기 전에 실패했다.
-- (b) 한 번만 (c) 그 신청의 마지막 연 줄·같은 요청자 (d) 아직 송장 출력 전 (e) 한 신청에 두 번까지.
create or replace function public.revgift_box_release_print(p_log_id bigint, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_log public.revgift_box_decrypt_log;
  v public.revgift_box_applications;
  v_reason text;
begin
  if p_log_id is null or p_requester is null then
    raise exception '돌려줄 줄과 요청자가 있어야 한다' using errcode = '22023';
  end if;
  select * into v_log from public.revgift_box_decrypt_log where id = p_log_id;
  if v_log.id is null or v_log.result <> 'opened' then
    return jsonb_build_object('result', 'denied', 'reason', 'not_opened');
  end if;
  select * into v from public.revgift_box_applications a where a.id = v_log.application_id;
  perform 1 from public.revgift_boxes b where b.id = v.box_id for update;
  select * into v from public.revgift_box_applications a where a.id = v.id for update;
  if exists (select 1 from public.revgift_box_decrypt_releases x where x.opened_log_id = v_log.id) then
    v_reason := 'already_released';
  elsif v_log.id <> (select max(l.id) from public.revgift_box_decrypt_log l where l.application_id = v.id and l.result = 'opened') then
    v_reason := 'not_latest';
  elsif v_log.requester_id <> p_requester then
    v_reason := 'not_requester';
  elsif v.printed_at is not null then
    v_reason := 'not_inspected';
  elsif (select count(*) from public.revgift_box_decrypt_releases x where x.application_id = v.id) >= 2 then
    v_reason := 'release_limit_reached';
  end if;
  if v_reason is not null then
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;
  insert into public.revgift_box_decrypt_releases (opened_log_id, application_id, requester_id) values (v_log.id, v.id, p_requester);
  return jsonb_build_object('result', 'released');
end $$;

-- 출력 때 송장 출력 함수가 연 주소로 다시 판정한 할증 구분(INV-GB17 · address-protection INV-P20 ③) — 명세서 줄과 다르면 「할증 지역 불일치」만 남긴다.
-- 출력은 그대로 한다. 차액은 받지 않는다(Q18).
create or replace function public.revgift_box_report_region(p_label text, p_opened_region text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications := public.revgift_box_app_of_label(p_label);
  v_stored text;
begin
  if p_opened_region is null or p_opened_region not in ('none', 'jeju', 'island') then
    raise exception '할증 구분 꼴이 틀리다' using errcode = '22023';
  end if;
  select l.surcharge_region into v_stored from public.revgift_box_invoice_lines l where l.application_id = v.id;
  if v_stored is distinct from p_opened_region then
    update public.revgift_box_applications set region_mismatch = true where id = v.id;
    return true;
  end if;
  return false;
end $$;

-- 운송장 번호 넣기(수동 입력, address-protection INV-P21 ③) — 대표만, 송장 출력한 신청에 번호가 빈 때 한 번.
-- 대표가 아니면 거부 줄을 남기고 denied(예외로 끝내면 그 줄도 사라진다).
create or replace function public.office_gift_box_set_waybill(p_label text, p_waybill text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  v := public.revgift_box_app_of_label(p_label);
  if not public.is_owner() then
    insert into public.revgift_box_decrypt_log (application_id, requester_id, result, deny_reason) values (v.id, auth.uid(), 'denied', 'not_owner');
    return 'denied';
  end if;
  if p_waybill is null or p_waybill !~ '^[0-9]{10,14}$' then
    raise exception '송장번호 꼴이 틀리다' using errcode = '22023';
  end if;
  perform 1 from public.revgift_boxes b where b.id = v.box_id for update;
  select * into v from public.revgift_box_applications a where a.id = v.id for update;
  if v.status <> 'paid' or v.printed_at is null or v.outbound_waybill_no is not null then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  update public.revgift_box_applications set outbound_waybill_no = p_waybill where id = v.id;
  return 'saved';
end $$;

-- 출고 확정 — 출력한 송장 바코드 스캔. 운영자 누구나. 결제됨·송장 출력함·번호가 같은 신청만. 마지막 줄이면 같은 처리에서 선물함이 끝.
create or replace function public.office_gift_box_confirm_shipment(p_label text, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_box_applications;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_waybill is null or p_waybill !~ '^[0-9]{10,14}$' then
    raise exception '송장번호 꼴이 틀리다' using errcode = '22023';
  end if;
  v := public.revgift_box_app_of_label(p_label);
  perform 1 from public.revgift_boxes b where b.id = v.box_id for update;
  select * into v from public.revgift_box_applications a where a.id = v.id for update;
  if v.status <> 'paid' or v.printed_at is null then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  if v.outbound_waybill_no is null then
    raise exception '운송장 번호를 먼저 넣는다' using errcode = '55000';
  end if;
  if v.outbound_waybill_no <> p_waybill then
    raise exception '이 신청의 송장이 아니다' using errcode = 'P0043';
  end if;
  update public.revgift_box_applications set status = 'shipped', shipped_at = now() where id = v.id;
  perform public.revgift_box_try_done(v.box_id);
end $$;

-- ── 사무실 — 미결제 착불 반송 (INV-GB19 · Q16) ─────────

-- 반송할 선물함 — 착불 반송 중인 선물함마다 이름 · 크리에이터 이름 · 큰 상자 원 송장번호(그 송장의 보내는 사람 주소로 착불 반송) · 반송 시작 시각.
create or replace function public.office_gift_box_returns()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_operator() then
    raise exception '운영자만 본다' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'creator_name', c.name, 'returning_at', b.returning_at,
      'carton_waybills', coalesce((select jsonb_agg(x.waybill_no order by x.received_at) from public.revgift_box_cartons x where x.box_id = b.id and x.waybill_no is not null), '[]'::jsonb))
      order by b.returning_at)
    from public.revgift_boxes b join public.creators c on c.id = b.creator_id
    where b.status = 'returning'), '[]'::jsonb);
end $$;

-- 반송 확정 — 착불 반송 송장번호를 넣으면 반송됨(끝). 운영자 누구나.
create or replace function public.office_gift_box_confirm_return(p_box_id uuid, p_waybill text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.revgift_boxes;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_waybill is null or p_waybill !~ '^[0-9]{10,14}$' then
    raise exception '송장번호 꼴이 틀리다' using errcode = '22023';
  end if;
  select * into v from public.revgift_boxes b where b.id = p_box_id for update;
  if not found then
    raise exception '선물함을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v.status <> 'returning' then
    raise exception '착불 반송 중인 선물함만' using errcode = 'P0022';
  end if;
  update public.revgift_boxes set status = 'returned', returned_at = now(), return_waybill_no = p_waybill where id = v.id;
end $$;

-- ── 환불 (INV-GB21) ─────────────────────────────────────

-- 환불 기록 제약 — 줄 환불은 그 줄 금액을 넘지 않고, 한 명세서 결제의 환불 합계는 결제 금액을 넘지 않는다(결제 줄을 잠근 뒤 센다).
-- 팬 선물·역조공 갈래는 20261008000009 본문 그대로다.
create or replace function public.refunds_within_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_share public.revgift_shares;
  v_refunded integer;
  v_line public.revgift_box_invoice_lines;
begin
  if tg_op = 'UPDATE' then
    if new.amount_krw <> old.amount_krw or new.payment_id is distinct from old.payment_id
       or new.share_id is distinct from old.share_id or new.box_id is distinct from old.box_id
       or new.box_line_id is distinct from old.box_line_id then
      raise exception '환불 금액·대상은 바꿀 수 없다' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.box_line_id is not null then
    select * into v_line from public.revgift_box_invoice_lines where id = new.box_line_id;
    if new.amount_krw > v_line.amount_krw then
      raise exception '줄 금액보다 많이 환불할 수 없다' using errcode = '23514';
    end if;
    select p.amount_krw into v_limit from public.revgift_box_payments p where p.invoice_id = v_line.invoice_id and p.status = 'done' for update;
    if v_limit is null then
      raise exception '결제가 없는 명세서는 환불하지 않는다' using errcode = '23514';
    end if;
    select coalesce(sum(r.amount_krw), 0) into v_refunded
    from public.refunds r join public.revgift_box_invoice_lines l on l.id = r.box_line_id
    where l.invoice_id = v_line.invoice_id;
    if v_refunded + new.amount_krw > v_limit then
      raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.payment_id is not null then
    select amount_krw into v_limit from public.payments where id = new.payment_id for update;
    -- 상자 환불은 그 상자 주문의 첫 결제에만 붙는다
    if new.box_id is not null and not exists (
      select 1 from public.boxes b join public.payments p on p.order_id = b.order_id
      where b.id = new.box_id and p.id = new.payment_id and p.kind = 'initial'
    ) then
      raise exception '상자 환불은 그 주문의 첫 결제에만 붙는다' using errcode = '23514';
    end if;
    -- 결제 줄을 잠근 뒤 센다 — 같은 결제의 환불 둘이 동시에 들어와도 합계를 넘지 않는다
    select coalesce(sum(r.amount_krw), 0) into v_refunded from public.refunds r where r.payment_id = new.payment_id;
    if v_refunded + new.amount_krw > v_limit then
      raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
    end if;
    return new;
  end if;

  select * into v_share from public.revgift_shares where id = new.share_id;
  if new.amount_krw > v_share.amount_krw then
    raise exception '몫 금액보다 많이 환불할 수 없다' using errcode = '23514';
  end if;
  select amount_krw into v_limit from public.revgift_sends where id = v_share.send_id for update;
  select coalesce(sum(r.amount_krw), 0) into v_refunded
  from public.refunds r join public.revgift_shares s on s.id = r.share_id
  where s.send_id = v_share.send_id;
  if v_refunded + new.amount_krw > v_limit then
    raise exception '환불 합계가 결제 금액을 넘는다' using errcode = '23514';
  end if;
  return new;
end $$;

-- 환불 잡기 — 대표만. 금액은 DB 가 정한다(INV-K7). 줄 환불(revgift_box)은 그 명세서의 완료 결제 줄을 먼저 잠근다.
-- 팬 선물·상자·역조공 갈래는 20261008000009 본문 그대로다.
create or replace function public.admin_claim_refund(p_kind text, p_unit_id uuid)
returns table (refund_id uuid, payment_key text, amount_krw integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_send_id uuid;
  v_payment_id uuid;
  v_invoice_id uuid;
  v_refund public.refunds;
  v_due integer;
begin
  if not public.is_owner() then
    raise exception '환불은 대표만 한다' using errcode = '42501';
  end if;
  if p_kind = 'gift' then
    select p.payment_key, p.id into v_key, v_payment_id from public.payments p where p.id = p_unit_id for update;
    if not found then
      raise exception '결제를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.payment_id = p_unit_id and r.box_id is null for update;
  elsif p_kind = 'gift_box' then
    -- 결제 줄을 먼저 잠근다(주문 환불과 같은 순서) — 같은 결제의 환불 청구는 하나씩
    select p.payment_key, p.id into v_key, v_payment_id
    from public.boxes b join public.payments p on p.order_id = b.order_id and p.kind = 'initial'
    where b.id = p_unit_id for update of p;
    if not found then
      raise exception '상자를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.box_id = p_unit_id for update;
  elsif p_kind = 'revgift' then
    select d.payment_key, d.id into v_key, v_send_id
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_unit_id for update of s, d;
    if not found then
      raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.share_id = p_unit_id for update;
    if exists (
      select 1 from public.refunds r join public.revgift_shares s on s.id = r.share_id
      where s.send_id = v_send_id and r.share_id <> p_unit_id
        and r.status = 'requesting' and r.claimed_at > now() - interval '2 minutes'
    ) then
      raise exception '같은 결제의 다른 환불을 처리하고 있다' using errcode = 'P0024';
    end if;
  elsif p_kind = 'revgift_box' then
    -- 선물함 명세서 줄(INV-GB21) — 그 명세서의 완료 결제 줄을 먼저 잠근다. 같은 결제의 줄 환불은 하나씩 결제사에 보낸다
    select p.payment_key, l.invoice_id into v_key, v_invoice_id
    from public.revgift_box_invoice_lines l
    left join public.revgift_box_payments p on p.invoice_id = l.invoice_id and p.status = 'done'
    where l.id = p_unit_id for update of l;
    if v_invoice_id is null then
      raise exception '명세서 줄을 찾을 수 없다' using errcode = 'P0002';
    end if;
    perform 1 from public.revgift_box_payments p where p.invoice_id = v_invoice_id and p.status = 'done' for update;
    select * into v_refund from public.refunds r where r.box_line_id = p_unit_id for update;
    if exists (
      select 1 from public.refunds r join public.revgift_box_invoice_lines l on l.id = r.box_line_id
      where l.invoice_id = v_invoice_id and r.box_line_id <> p_unit_id
        and r.status = 'requesting' and r.claimed_at > now() - interval '2 minutes'
    ) then
      raise exception '같은 결제의 다른 환불을 처리하고 있다' using errcode = 'P0024';
    end if;
  else
    raise exception '환불 종류는 gift · gift_box · revgift · revgift_box' using errcode = '22023';
  end if;

  -- 한 결제에 주문 환불과 상자 환불이 함께 있을 수 있다 — 결제사에 부분 취소 둘을 동시에 보내지 않는다
  if v_payment_id is not null and exists (
    select 1 from public.refunds r
    where r.payment_id = v_payment_id and r.id is distinct from v_refund.id
      and r.status = 'requesting' and r.claimed_at > now() - interval '2 minutes'
  ) then
    raise exception '같은 결제의 다른 환불을 처리하고 있다' using errcode = 'P0024';
  end if;

  if v_refund.id is not null then
    if v_refund.status = 'done' then
      raise exception '이미 환불했다' using errcode = 'P0023';
    end if;
    if v_refund.status = 'requesting' and v_refund.claimed_at > now() - interval '2 minutes' then
      raise exception '환불을 처리하고 있다' using errcode = 'P0024';
    end if;
    if v_refund.created_at <= now() - interval '14 days' then
      raise exception '다시 시도 기한(14일)이 지났다 — 결제사에서 확인한다' using errcode = 'P0025';
    end if;
    update public.refunds r
    set status = 'requesting', attempts = r.attempts + 1, claimed_at = now(), requested_by = auth.uid(), last_error = null
    where r.id = v_refund.id;
    return query select v_refund.id, v_key, v_refund.amount_krw;
    return;
  end if;

  v_due := case p_kind
    when 'gift' then public.refund_due_of_payment(p_unit_id)
    when 'gift_box' then public.refund_due_of_box(p_unit_id)
    when 'revgift_box' then public.revgift_box_line_refund_due(p_unit_id)
    else public.refund_due_of_share(p_unit_id)
  end;
  if v_due is null or v_due <= 0 or v_key is null then
    raise exception '환불할 수 있는 상태가 아니다' using errcode = 'P0022';
  end if;
  insert into public.refunds (payment_id, share_id, box_id, box_line_id, amount_krw, requested_by)
  values (case when p_kind in ('gift', 'gift_box') then v_payment_id end,
          case when p_kind = 'revgift' then p_unit_id end,
          case when p_kind = 'gift_box' then p_unit_id end,
          case when p_kind = 'revgift_box' then p_unit_id end,
          v_due, auth.uid())
  returning * into v_refund;
  return query select v_refund.id, v_key, v_refund.amount_krw;
end $$;

-- 줄 환불이 끝나면 — 같은 처리에서 그 줄의 300원 건수를 그 달 안이면 돌려주고(Q15), 선물함이 끝났는지 본다(INV-GB1 paid → done).
create or replace function public.refunds_box_line_done()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_box uuid;
begin
  select i.box_id into v_box from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id where l.id = new.box_line_id;
  perform 1 from public.revgift_boxes b where b.id = v_box for update;
  perform public.revgift_box_give_back_early(array[new.box_line_id]);
  perform public.revgift_box_try_done(v_box);
  return null;
end $$;
revoke all on function public.refunds_box_line_done() from public, anon, authenticated, service_role;
drop trigger if exists refunds_box_line_done on public.refunds;
create trigger refunds_box_line_done after update of status on public.refunds
  for each row when (new.box_line_id is not null and new.status = 'done' and old.status is distinct from 'done')
  execute function public.refunds_box_line_done();

-- 관리자 「결제·환불」 내역 — 선물함 명세서 줄을 한 줄씩 더한다(unit_kind revgift_box, 줄 번호 = 신청 번호). 나머지는 20261024000003 본문 그대로다.
create or replace function public.admin_payment_rows()
 RETURNS TABLE(unit_kind text, unit_id uuid, order_no text, payment_kind text, payer_nickname text, amount_krw integer, goods_krw integer, service_fee_krw integer, inspection_fee_krw integer, shipping_fee_krw integer, paid_at timestamp with time zone, refund_status text, refund_krw integer, refund_error text, needs_review boolean, refund_retry_closed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with units as (
    -- 확인 필요(INV-M19) 결제는 끝나지 않았어도 나온다 — 시각은 「승인 중」이 된 시각, 환불 대상은 아니다
    select 'gift'::text as unit_kind, p.id as unit_id, o.order_no, p.kind as payment_kind, fp.nickname as payer_nickname,
           p.amount_krw, p.goods_krw, p.service_fee_krw, p.inspection_fee_krw, p.shipping_fee_krw,
           coalesce(p.settled_at, p.confirming_at) as paid_at,
           case when p.status = 'done' then public.refund_due_of_payment(p.id) else 0 end as due,
           r.status as refund_state, r.amount_krw as refunded, r.last_error, r.created_at as refund_created_at,
           p.review_at is not null and p.status = 'confirming' as needs_review
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    left join public.refunds r on r.payment_id = p.id and r.box_id is null
    where p.status = 'done' or (p.review_at is not null and p.status = 'confirming')
    union all
    -- 상자마다 한 줄(INV-M8·M9): 도착하지 않음으로 닫힌 상자('missing_box'). 늦게 온 상자는 주문 환불에서 배송비를 뺀 몫으로만 돌려주고 상자 줄을 따로 만들지 않는다.
    -- 금액은 그 상자 금액, 칸은 상자에 저장한 값(INV-M14).
    select 'gift_box', b.id, o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
           'missing_box', fp.nickname,
           b.price_krw, 0, b.price_krw - b.shipping_fee_krw - b.inspection_fee_krw, b.inspection_fee_krw, b.shipping_fee_krw, p.settled_at,
           public.refund_due_of_box(b.id), r.status, r.amount_krw, r.last_error, r.created_at, false
    from public.boxes b
    join public.orders o on o.id = b.order_id
    join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
    join public.profiles fp on fp.id = o.fan_id
    cross join lateral (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
    left join public.refunds r on r.box_id = b.id
    -- 상자 환불은 닫힌 상자에만 있다(INV-M9, 2026-10-10)
    where b.missing_at is not null
    union all
    select 'revgift', s.id, s.order_no, 'revgift', coalesce(cr.name, cp.nickname),
           s.amount_krw, 0, s.amount_krw - s.shipping_fee_krw, 0, s.shipping_fee_krw, coalesce(d.settled_at, d.confirming_at),
           case when d.status = 'done' then public.refund_due_of_share(s.id) else 0 end, r.status, r.amount_krw, r.last_error, r.created_at,
           d.review_at is not null and d.status = 'confirming'
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    left join public.refunds r on r.share_id = s.id
    where d.status = 'done' or (d.review_at is not null and d.status = 'confirming')
    union all
    -- 선물함 명세서 줄(revgift-box INV-GB21) — 결제가 끝난 명세서의 줄마다. 배송비 칸 = 택배비 + 할증, 서비스료 칸 = 서비스료(INV-GB13)
    select 'revgift_box', l.id, public.revgift_box_label_text(a.label_no), 'revgift_box', cr.name,
           l.amount_krw, 0, l.service_fee_krw, 0, l.shipping_fee_krw + l.surcharge_krw, bp.settled_at,
           coalesce(public.revgift_box_line_refund_due(l.id), 0), r.status, r.amount_krw, r.last_error, r.created_at, false
    from public.revgift_box_invoice_lines l
    join public.revgift_box_applications a on a.id = l.application_id
    join public.revgift_box_payments bp on bp.invoice_id = l.invoice_id and bp.status = 'done'
    join public.revgift_boxes gb on gb.id = bp.box_id
    join public.creators cr on cr.id = gb.creator_id
    left join public.refunds r on r.box_line_id = l.id
  )
  select u.unit_kind, u.unit_id, u.order_no, u.payment_kind, u.payer_nickname,
         u.amount_krw, u.goods_krw, u.service_fee_krw, u.inspection_fee_krw, u.shipping_fee_krw, u.paid_at,
         coalesce(u.refund_state, case when u.due > 0 then 'due' else 'none' end),
         coalesce(u.refunded, case when u.due > 0 then u.due end),
         u.last_error, u.needs_review,
         -- admin_claim_refund 가 P0025 로 거부하는 기준과 같다(처음 누른 지 14일)
         coalesce(u.refund_created_at <= now() - interval '14 days', false)
  from units u
  where public.is_operator()
  order by u.paid_at desc, u.order_no
  limit 500;
$function$;

-- ── 결제 다시 확인 (payment INV-M19) — 선물함 결제(revgift_box)를 더한다. 나머지 갈래는 원래 본문 그대로다. ──

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
    union all
    -- 선물함 결제 — 주문번호로 고르는 「지금 돌리기」에는 나오지 않는다(주문번호가 없다)
    select 'revgift_box', bp.toss_order_id, bp.amount_krw, bp.confirming_at, bp.last_checked_at
    from public.revgift_box_payments bp
    where bp.status = 'confirming' and bp.review_at is null
      and bp.confirming_at <= now() - interval '10 minutes'
      and p_order_no is null
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
  elsif p_source = 'revgift_box' then
    update public.revgift_box_payments set last_checked_at = now() where toss_order_id = p_toss_order_id;
  else
    raise exception '모르는 결제 종류' using errcode = '22023';
  end if;
end $$;

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
  elsif p_source = 'revgift_box' then
    update public.revgift_box_payments
    set review_at = now(), review_payment_key = nullif(p_payment_key, ''), review_balance_krw = case when p_balance_krw > 0 then p_balance_krw end
    where toss_order_id = p_toss_order_id and status = 'confirming' and review_at is null;
  else
    raise exception '모르는 결제 종류' using errcode = '22023';
  end if;
  return found;
end $$;

-- ── 크리에이터 읽기 (INV-GB9 · GB13 · GB18 · GB19) ────────
-- 3부 칸에 더해: 결제 기한(발행 + 72시간)·반송 시각(발행 + 168시간), 결제 「승인 중」 여부, 줄마다 진행(결제됨·출고·출고 전에 끝남·환불됨).
-- 사람 칸은 닉네임뿐이다 — 운송장 번호도 내주지 않는다(INV-GB9).
create or replace function public.my_revgift_box(p_box_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'capacity', b.capacity, 'is_public', b.is_public, 'status', b.status,
    'invite_token', b.invite_token, 'created_at', b.created_at,
    'inbound_code', case when b.code_voided_at is null and b.status in ('awaiting_box', 'arrived', 'held') then b.inbound_code end,
    'carton_count', b.carton_count,
    'cartons_received', (select count(*) from public.revgift_box_cartons c where c.box_id = b.id),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nickname', p.nickname, 'applied_at', a.applied_at, 'status', a.status, 'chosen_tier', a.chosen_tier)
                       order by a.applied_at, a.id)
      from public.revgift_box_applications a
      join public.profiles p on p.id = a.fan_id
      where a.box_id = b.id and a.status <> 'withdrawn'
    ), '[]'::jsonb),
    'invoice', (
      select jsonb_build_object(
        'amount_krw', i.amount_krw, 'shipping_fee_krw', i.shipping_fee_krw, 'service_fee_krw', i.service_fee_krw,
        'carton_cod_krw', i.carton_cod_krw, 'created_at', i.created_at,
        'pay_due_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'pay_due_hours')::integer),
        'return_at', b.invoiced_at + make_interval(hours => (public.revgift_box_rules() ->> 'unpaid_return_hours')::integer),
        'paying', exists (select 1 from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'confirming'),
        'paid_at', (select x.settled_at from public.revgift_box_payments x where x.invoice_id = i.id and x.status = 'done'),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nickname', p.nickname, 'tier', l.tier, 'shipping_fee_krw', l.shipping_fee_krw, 'surcharge_region', l.surcharge_region,
                   'surcharge_krw', l.surcharge_krw, 'service_fee_krw', l.service_fee_krw, 'amount_krw', l.amount_krw,
                   'progress', case
                     when a.status in ('shipped', 'delivered') then 'shipped'
                     when a.status = 'ended' and exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done') then 'refunded'
                     when a.status = 'ended' then 'ended'
                     when a.status = 'paid' then 'paid'
                     else 'unpaid' end) order by l.line_no)
          from public.revgift_box_invoice_lines l
          join public.revgift_box_applications a on a.id = l.application_id
          join public.profiles p on p.id = a.fan_id
          where l.invoice_id = i.id), '[]'::jsonb))
      from public.revgift_box_invoices i where i.box_id = b.id))
  from public.revgift_boxes b
  where b.id = p_box_id and auth.uid() is not null and b.owner_id = auth.uid();
$$;

-- ── 자동 처리 (INV-GB1 · GB11 · GB12 · GB18 · GB19 · GB20 · GB23) ──
-- 5분마다. 선물함마다 따로 처리한다 — 한 선물함이 실패해도(0033·0034 전의 사본 삭제 등) 나머지는 진행하고, 실패한 것은 다음 회차에 다시 본다.
--   ①~⑤ 3부 그대로
--   ⑥ 명세서 발행 + 72시간 → 결제 기한 지남(INV-GB18)
--   ⑦ 명세서 발행 + 168시간, 결제 승인 중 없음 → 착불 반송(INV-GB19): 끝나지 않은 신청은 끝나고, 결제 대기는 닫히고,
--      300원 건수는 그 달 안이면 돌려주고(Q15), 모든 신청의 사본을 지운다. 6자리는 명세서 때 이미 무효다(Q7).
--   ⑧ 만든 지 24시간 지난 결제 대기 → 실패(INV-GB18 — 명세서는 그대로라 다시 결제할 수 있다)
--   ⑨ 출고 확정 + 72시간 → 그 신청의 사본 삭제(INV-GB20 · reverse-gift INV-R9)
create or replace function public.revgift_box_tick()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_rules jsonb := public.revgift_box_rules();
  r record;
  v public.revgift_boxes;
  v_ids uuid[];
  n_cancel integer := 0;
  n_missing integer := 0;
  n_hold integer := 0;
  n_card integer := 0;
  n_overdue integer := 0;
  n_return integer := 0;
  n_pending integer := 0;
  n_dropped integer := 0;
  n_failed integer := 0;
begin
  for r in select b.id from public.revgift_boxes b
           where b.status = 'awaiting_box' and now() >= b.box_requested_at + make_interval(hours => (v_rules ->> 'awaiting_box_hours')::integer) loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      if v.status = 'awaiting_box' and not exists (select 1 from public.revgift_box_cartons c where c.box_id = v.id) then
        perform public.revgift_box_cancel_locked(v.id);
        n_cancel := n_cancel + 1;
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 자동 취소 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select b.id from public.revgift_boxes b
           where b.status in ('arrived', 'held') and now() >= b.first_received_at + make_interval(hours => (v_rules ->> 'carton_wait_hours')::integer)
             and exists (select 1 from public.revgift_box_applications a where a.box_id = b.id and a.status = 'selected') loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      with gone as (
        update public.revgift_box_applications set status = 'missing' where box_id = v.id and status = 'selected' returning id
      ) select array_agg(id) into v_ids from gone;
      if v_ids is not null then
        perform pii.revgift_box_drop_copies(v_ids, 'missing');
        n_missing := n_missing + cardinality(v_ids);
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 도착 안 함 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  for r in select h.id, h.box_id from public.revgift_box_holds h
           where h.resolved_at is null and h.expired_at is null and now() >= h.created_at + make_interval(hours => (v_rules ->> 'hold_hours')::integer) loop
    select * into v from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_holds set expired_at = now() where id = r.id and resolved_at is null and expired_at is null;
    if v.status = 'held' and not exists (select 1 from public.revgift_box_holds h where h.box_id = v.id and h.resolved_at is null and h.expired_at is null) then
      update public.revgift_boxes set status = 'arrived' where id = v.id;
    end if;
    n_hold := n_hold + 1;
  end loop;

  for r in select c.id, c.box_id, c.unmatched_id from public.revgift_box_cancelled_arrivals c
           where c.choice is null and now() >= c.created_at + make_interval(hours => (v_rules ->> 'cancelled_arrival_hours')::integer) loop
    perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_cancelled_arrivals set choice = 'return', chosen_at = now(), auto = true where id = r.id and choice is null;
    update public.office_unmatched set expired_at = coalesce(expired_at, now()) where id = r.unmatched_id and matched_at is null;
    n_card := n_card + 1;
  end loop;

  for r in select b.id from public.revgift_boxes b where b.status = 'arrived' loop
    begin
      perform public.revgift_box_try_invoice(r.id);
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 명세서 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ⑥ 결제 기한 지남 — 조건부 갱신 한 문장(결제 완료가 같은 줄을 잠그고 바꾸면 이 문장은 그 줄을 건너뛴다)
  update public.revgift_boxes b set status = 'overdue'
  where b.status = 'invoiced' and now() >= b.invoiced_at + make_interval(hours => (v_rules ->> 'pay_due_hours')::integer);
  get diagnostics n_overdue = row_count;

  -- ⑦ 착불 반송 — 선물함 줄을 잠근 뒤 다시 본다(결제 확정 시작과 같은 잠금, S19b). 승인 중이 있으면 그대로(S19c)
  for r in select b.id from public.revgift_boxes b
           where b.status in ('invoiced', 'overdue') and now() >= b.invoiced_at + make_interval(hours => (v_rules ->> 'unpaid_return_hours')::integer) loop
    begin
      select * into v from public.revgift_boxes b where b.id = r.id for update;
      if v.status in ('invoiced', 'overdue')
         and clock_timestamp() >= v.invoiced_at + make_interval(hours => (v_rules ->> 'unpaid_return_hours')::integer)
         and not exists (select 1 from public.revgift_box_payments p where p.box_id = v.id and p.status in ('confirming', 'done')) then
        update public.revgift_box_payments set status = 'failed' where box_id = v.id and status = 'pending';
        perform 1 from public.revgift_box_applications a where a.box_id = v.id order by a.id for update;
        update public.revgift_box_applications set status_before_end = status, status = 'ended'
        where box_id = v.id and status in ('selected', 'measured');
        update public.revgift_boxes set status = 'returning', returning_at = now(), code_voided_at = coalesce(code_voided_at, now()) where id = v.id;
        perform public.revgift_box_give_back_early(array(
          select l.id from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id where i.box_id = v.id));
        perform pii.revgift_box_drop_copies(array(select a.id from public.revgift_box_applications a where a.box_id = v.id), 'unpaid_return');
        n_return := n_return + 1;
      end if;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 착불 반송 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  -- ⑧ 24시간 지난 결제 대기 — 결제 대기인 줄만 실패로(결제 확정 시작과 같은 줄의 조건부 갱신이라 겹치면 먼저 잡은 쪽만)
  update public.revgift_box_payments set status = 'failed'
  where status = 'pending' and created_at <= now() - make_interval(hours => (v_rules ->> 'pending_payment_hours')::integer);
  get diagnostics n_pending = row_count;

  -- ⑨ 출고 + 72시간 사본 삭제 — 출력 함수도 같은 시각으로 72시간을 보므로 이 처리가 늦게 돌아도 그 뒤에는 열리지 않는다
  for r in select a.id, a.box_id from public.revgift_box_applications a
           where a.status in ('shipped', 'delivered') and a.copy_dropped_at is null
             and a.shipped_at <= now() - make_interval(hours => (v_rules ->> 'copy_after_ship_hours')::integer) loop
    begin
      perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
      perform pii.revgift_box_drop_copies(array[r.id], 'shipped');
      update public.revgift_box_applications set copy_dropped_at = now() where id = r.id;
      n_dropped := n_dropped + 1;
    exception when others then
      n_failed := n_failed + 1;
      raise warning 'revgift_box_tick 출고 사본 삭제 실패 %: %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('cancelled', n_cancel, 'missing', n_missing, 'holds_expired', n_hold, 'cards_returned', n_card,
                            'overdue', n_overdue, 'returning', n_return, 'pending_closed', n_pending, 'copies_dropped', n_dropped, 'failed', n_failed);
end $$;

-- ── 탈퇴 (my-account INV-A15 · revgift-box Q17) ──────────
-- 크리에이터: 끝나지 않은 선물함이 있거나, 줄 환불이 끝나지 않았으면 탈퇴되지 않는다(진행 중 주문을 먼저 끝낸다 · S15d).
-- 팬: 신청이 있어도 탈퇴된다 — 탈퇴 처리가 같은 처리에서 그 팬의 신청을 끝낸다(아래 revgift_box_end_for_withdrawal).
--   결제 뒤 출고 전이면 그 줄이 환불 대상이 된다(정할 것 Q17 「팬 탈퇴」). 사본은 pii 의 탈퇴 정리(manual/0032)가 지운다.
create or replace function public.account_has_open_work(p_account uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with my_orders as (
    select o.id from public.orders o where o.fan_id = p_account or (p_creator is not null and o.creator_id = p_creator)
  ), my_shares as (
    select s.id, s.reply, s.shipped_at, s.returned_at, s.cancelled_at, s.disposed_at
    from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where (s.fan_id = p_account or (p_creator is not null and d.creator_id = p_creator))
      and d.status <> 'failed'
  )
  select exists (select 1 from my_orders m where not public.order_is_finished(m.id))
    or exists (select 1 from public.office_parcels op join public.boxes b on b.id = op.box_id join my_orders m on m.id = b.order_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from public.office_parcels op join my_shares m on m.id = op.share_id
               where op.state not in ('awaiting', 'shipped', 'returned', 'disposed', 'police_handed'))
    or exists (select 1 from my_shares where reply in ('waiting', 'accepted')
               and shipped_at is null and returned_at is null and cancelled_at is null and disposed_at is null)
    or exists (select 1 from public.revgift_sends d where p_creator is not null and d.creator_id = p_creator and d.status in ('pending', 'confirming'))
    -- 돌려줄 환불이 끝나지 않음(INV-A15 S15d): 주문 결제 · 닫힌 상자 · 역조공 몫.
    --   금액 함수를 부르기 전의 조건은 그 함수가 null 을 돌려주는 경우를 미리 거르는 것뿐이다(결과는 같고 줄마다 부르지 않는다)
    or exists (select 1 from public.payments p join my_orders m on m.id = p.order_id join public.orders o on o.id = p.order_id
               where p.status = 'done' and o.shipped_at is null
                 and coalesce(public.refund_due_of_payment(p.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.payment_id = p.id and r.box_id is null and r.status = 'done'))
    or exists (select 1 from public.boxes b join my_orders m on m.id = b.order_id
               where b.missing_at is not null
                 and coalesce(public.refund_due_of_box(b.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_id = b.id and r.status = 'done'))
    or exists (select 1 from my_shares m
               where m.reply in ('declined', 'expired') and m.shipped_at is null
                 and coalesce(public.refund_due_of_share(m.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.share_id = m.id and r.status = 'done'))
    -- 6자리를 살려 둔 동안은 환불 금액이 아직 정해지지 않았다 — 닫히면 환불이 생기고, 늦게 오면 사무실에 상자가 생긴다(보안·코드 리뷰 중간)
    or exists (select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id join my_orders m on m.id = b.order_id
               where c.kept_at is not null and c.state = 'valid')
    or exists (select 1 from public.inbound_codes c join my_shares m on m.id = c.share_id
               where c.kept_at is not null and c.state = 'valid')
    -- 선물함(revgift-box) — 내가 만든 선물함이 끝나지 않았거나(끝 = 완료·반송됨·취소), 그 줄 환불이 끝나지 않았다
    or exists (select 1 from public.revgift_boxes gb where gb.owner_id = p_account and gb.status not in ('done', 'returned', 'cancelled'))
    or exists (select 1 from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id
               join public.revgift_boxes gb on gb.id = i.box_id
               where gb.owner_id = p_account and coalesce(public.revgift_box_line_refund_due(l.id), 0) > 0
                 and not exists (select 1 from public.refunds r where r.box_line_id = l.id and r.status = 'done'));
$$;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;

-- 탈퇴하는 팬의 신청을 끝낸다 — 탈퇴 처리 함수가 같은 처리에서 부른다. 선물함 줄 → 신청 줄 순서로 잠근다.
--   신청 받는 중(applied·excluded) → 신청 취소와 같다(withdrawn — 자리가 빈다)
--   마감 뒤 담길 차례·실측됨·결제됨 → 끝(ended, 끝나기 전 상태를 남긴다). 명세서에 든 줄은 결제가 끝났으면 환불 대상이 된다(INV-GB21 ② · Q17)
--   결제됨이 끝났으면 그 선물함이 끝났는지 본다. 출고·도착 안 함·끝난 신청은 그대로(가명으로만 바뀐다).
create or replace function public.revgift_box_end_for_withdrawal(p_account uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select a.id, a.box_id from public.revgift_box_applications a
           where a.fan_id = p_account and a.status in ('applied', 'excluded', 'selected', 'measured', 'paid') order by a.box_id, a.id loop
    perform 1 from public.revgift_boxes b where b.id = r.box_id for update;
    update public.revgift_box_applications
    set status_before_end = case when status in ('applied', 'excluded') then status_before_end else status end,
        status = case when status in ('applied', 'excluded') then 'withdrawn' else 'ended' end
    where id = r.id and status in ('applied', 'excluded', 'selected', 'measured', 'paid');
    if found then
      v_n := v_n + 1;
    end if;
    perform public.revgift_box_try_done(r.box_id);
  end loop;
  return v_n;
end $$;
revoke all on function public.revgift_box_end_for_withdrawal(uuid) from public, anon, authenticated, service_role;

-- ── 권한 ─────────────────────────────────────────
-- 화면에서 부르는 것은 로그인한 사람만(판정은 함수 안에서 로그인 토큰으로). 내부 처리는 아무도 직접 부르지 못한다.

revoke all on function public.revgift_box_app_of_label(text) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_give_back_early(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_line_refund_due(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_try_done(uuid) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_tick() from public, anon, authenticated, service_role;

revoke all on function public.revgift_box_start_payment(uuid) from public, anon, service_role;
grant execute on function public.revgift_box_start_payment(uuid) to authenticated;
revoke all on function public.claim_revgift_box_payment(text) from public, anon, authenticated;
grant execute on function public.claim_revgift_box_payment(text) to service_role;
revoke all on function public.settle_revgift_box_payment(text, public.payment_status, text) from public, anon, authenticated;
grant execute on function public.settle_revgift_box_payment(text, public.payment_status, text) to service_role;

revoke all on function public.office_gift_box_outbound_lookup(text) from public, anon, service_role;
revoke all on function public.office_gift_box_set_waybill(text, text) from public, anon, service_role;
revoke all on function public.office_gift_box_confirm_shipment(text, text) from public, anon, service_role;
revoke all on function public.office_gift_box_returns() from public, anon, service_role;
revoke all on function public.office_gift_box_confirm_return(uuid, text) from public, anon, service_role;
grant execute on function public.office_gift_box_outbound_lookup(text) to authenticated;
grant execute on function public.office_gift_box_set_waybill(text, text) to authenticated;
grant execute on function public.office_gift_box_confirm_shipment(text, text) to authenticated;
grant execute on function public.office_gift_box_returns() to authenticated;
grant execute on function public.office_gift_box_confirm_return(uuid, text) to authenticated;

-- 송장 출력 함수(복호화 전용 역할)만
revoke all on function public.revgift_box_log_denied(text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_finish_print(text, text) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_release_print(bigint, uuid) from public, anon, authenticated, service_role;
revoke all on function public.revgift_box_report_region(text, text) from public, anon, authenticated, service_role;
grant execute on function public.revgift_box_log_denied(text, uuid, text) to address_decryptor;
grant execute on function public.revgift_box_finish_print(text, text) to address_decryptor;
grant execute on function public.revgift_box_release_print(bigint, uuid) to address_decryptor;
grant execute on function public.revgift_box_report_region(text, text) to address_decryptor;

revoke all on function public.my_revgift_box(uuid) from public, anon, service_role;
grant execute on function public.my_revgift_box(uuid) to authenticated;
revoke all on function public.admin_claim_refund(text, uuid) from public, anon;
grant execute on function public.admin_claim_refund(text, uuid) to authenticated;
revoke all on function public.admin_payment_rows() from public, anon;
grant execute on function public.admin_payment_rows() to authenticated;
revoke all on function public.payment_reconcile_targets(text) from public, anon, authenticated;
grant execute on function public.payment_reconcile_targets(text) to service_role;
revoke all on function public.payment_mark_checked(text, text) from public, anon, authenticated;
grant execute on function public.payment_mark_checked(text, text) to service_role;
revoke all on function public.payment_mark_review(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.payment_mark_review(text, text, text, integer) to service_role;

-- 탈퇴 처리 — 20261023000003 본문 그대로에 선물함 신청 끝내기 한 줄(판정 바로 뒤)을 더한다.
create or replace function public.withdraw_account(p_login_id text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.profiles;
  v_creator public.creators;
  v_pseudonym uuid := gen_random_uuid();
  v_fan_paths text[];
  v_creator_paths text[];
  v_tables regclass[];
  v_tab regclass;
  fk record;
begin
  if not public.is_owner() then
    raise exception '대표만 탈퇴를 처리한다' using errcode = '42501';
  end if;
  select * into v_old from public.profiles p where p.login_id = p_login_id and p.withdrawn_at is null for update;
  if not found or v_old.role not in ('fan', 'creator') then
    raise exception '탈퇴할 수 있는 회원이 아니다' using errcode = 'P0002';
  end if;
  select * into v_creator from public.creators c where c.profile_id = v_old.id for update;
  if public.account_has_open_work(v_old.id, v_creator.id) then
    raise exception '진행 중인 선물·역조공이 있다' using errcode = '55000';
  end if;
  -- 선물함 신청은 탈퇴를 막지 않는다 — 같은 처리에서 끝낸다(revgift-box Q17, 위 판정 함수 주석)
  perform public.revgift_box_end_for_withdrawal(v_old.id);
  if v_creator.id is not null and exists (
    select 1 from public.approval_signatures s join public.approval_requests r on r.request_id = s.request_id
    join public.orders o on o.id = r.order_id where o.creator_id = v_creator.id and s.method <> 'fake' and s.signed_content is not null
  ) then
    -- 카카오 서명 묶음에는 인증서(이름)가 들어 있어 떼는 방법은 카카오 연결 때 정한다(external-connections). 그 전에는 지우지 않고 멈춘다.
    raise exception '카카오 서명 기록의 가명 처리는 아직 없다' using errcode = '0A000';
  end if;

  -- 가명 계정 — 로그인 계정 없음, 닉네임은 「탈퇴한 회원」
  insert into public.profiles (id, login_id, nickname, role, withdrawn_at)
  values (v_pseudonym, 'withdrawn_' || substr(replace(v_pseudonym::text, '-', ''), 1, 16), '탈퇴한 회원', v_old.role, now());
  insert into public.account_withdrawals (pseudonym_id, role, processed_by) values (v_pseudonym, v_old.role, auth.uid());

  -- 개인정보 구역(연락처·주소·주소 암호문과 키·확인 기록) — manual/0025. 없으면 여기서 실패하고 아무것도 남지 않는다.
  perform pii.withdraw_account(v_old.id, v_pseudonym, v_creator.id);

  -- 지울 사진(저장소) — 서버가 이 처리 뒤에 지운다
  v_fan_paths := array_remove(array[v_old.fan_photo_path, v_old.fan_bg_path], null);
  v_creator_paths := array_remove(array[v_creator.photo_path, v_creator.bg_path, v_creator.symbol_path], null);

  -- 계정을 가리키는 칸이 있는 표 전부의 「고치거나 지울 수 없다」 트리거를 잠시 끈다
  select array_agg(distinct c.conrelid) into v_tables
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('public.profiles'::regclass, 'public.creators'::regclass);
  v_tables := v_tables || array['public.approval_signatures'::regclass];
  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  if v_creator.id is not null then
    -- 서명 기록 — 원문은 해시만 남기고 서명자 식별값·원문을 비운다(INV-S14)
    update public.approval_signatures s
       set content_hash = encode(extensions.digest(convert_to(s.signed_content, 'UTF8'), 'sha256'), 'hex'),
           signed_content = null, signer_id = null
      from public.approval_requests r join public.orders o on o.id = r.order_id
     where r.request_id = s.request_id and o.creator_id = v_creator.id and s.signed_content is not null;

    -- 크리에이터 개인 기록(채널·이름 바꾼 기록·확인 신청·기념일)은 보관 대상이 아니라 지운다
    delete from public.creator_name_changes where creator_id = v_creator.id;
    delete from public.creator_channel_claims where creator_id = v_creator.id;
    delete from public.creator_verification_events where creator_id = v_creator.id;
    delete from public.creator_anniversaries where creator_id = v_creator.id;
    delete from public.creator_verification_unlocks where account_id = v_old.id;
    delete from public.creator_verification_applications where account_id = v_old.id;

    -- 크리에이터 행은 주문이 가리키므로 남기고 비운다. 계정 칸이 비면 「탈퇴한 크리에이터」로 읽힌다(gift-reply).
    perform set_config('fankkuk.verifying', 'on', true);
    update public.creators c
       set profile_id = null, withdrawn_at = now(), name = '탈퇴한 크리에이터', channel = '', channel_title = '', intro = '', alias = '',
           platform = null, channel_url = null, channel_key = null, identity_verified = false, searchable = false,
           x_handle = null, fan_name = null, fan_color = null, birthday_month = null, birthday_day = null,
           photo_path = null, bg_path = null, preview_pick = 'photo', symbol_path = null, symbol_rights_at = null
     where c.id = v_creator.id;
    perform set_config('fankkuk.verifying', '', true);
  end if;

  -- 계정을 가리키는 칸(지우면 함께 지워지는 칸 말고)을 가명 계정으로 옮긴다. 크리에이터 행은 위에서 비웠다.
  for fk in
    select c.conrelid::regclass as tab, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype <> 'c' and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.creators'::regclass and c.conrelid <> 'public.account_withdrawals'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tab, fk.col, fk.col) using v_pseudonym, v_old.id;
  end loop;

  -- 1:1 문의는 3년 보관(INV-A16) — 계정을 지우면 함께 지워지는 칸이라 위 반복이 옮기지 않는다.
  -- 답이 달린 문의를 고치지 못하게 하는 트리거는 이 처리 동안만 끈다(표를 잠그고, 실패하면 함께 되돌아간다).
  alter table public.inquiries disable trigger inquiries_freeze_answered;
  update public.inquiries set author_id = v_pseudonym where author_id = v_old.id;
  alter table public.inquiries enable trigger inquiries_freeze_answered;

  delete from public.profiles where id = v_old.id;
  delete from auth.users where id = v_old.id;

  foreach v_tab in array v_tables loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  return jsonb_build_object('pseudonym', v_pseudonym, 'fan_photo_paths', to_jsonb(v_fan_paths), 'creator_photo_paths', to_jsonb(v_creator_paths));
end $$;

revoke all on function public.withdraw_account(text) from public, anon;
grant execute on function public.withdraw_account(text) to authenticated;

-- 자동 삭제(my-account INV-A16) — 20261029000010 본문 그대로에 선물함 갈래(위 ①②)와 새 열람 기록 표 둘을 더한다.
create or replace function public.retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_shared_fan constant uuid := 'ffffffff-0000-4000-8000-000000000001';
  c_shared_creator constant uuid := 'ffffffff-0000-4000-8000-000000000002';
  v_signatures integer;
  v_inquiries integer;
  v_orders integer;
  v_unlinked integer;
  v_rg_shares integer;
  v_rg_sends integer;
  v_rg_unlinked integer;
  v_gb_unlinked integer := 0;
  v_gb_boxes integer := 0;
  v_n integer;
  v_tab regclass;
  v_counts jsonb;
  v_locked regclass[] := array[
    'public.approval_signatures', 'public.decrypt_log', 'public.decrypt_releases', 'public.office_inspections', 'public.office_envelope_shreds',
    'public.office_not_mine_reports', 'public.office_held_links', 'public.office_creator_check_events', 'public.office_share_moves',
    'public.office_police_handovers', 'public.office_disposals', 'public.return_decrypt_log', 'public.return_decrypt_releases',
    'public.return_address_events', 'public.office_unmatched_look_edits', 'public.revgift_decrypt_log', 'public.revgift_decrypt_releases',
    'public.revgift_box_decrypt_log', 'public.revgift_box_decrypt_releases'
  ]::regclass[];
begin
  -- 한 처리 안에서 두 번 불려도 되게(예약 작업은 회차마다 따로 처리다)
  drop table if exists retention_old_orders, retention_unlink, retention_gone, retention_del_orders, retention_del_boxes,
    retention_del_parcels, retention_del_unmatched, retention_del_payments,
    retention_old_sends, retention_rg_shares, retention_unlink_parcels, retention_del_shares,
    retention_old_gboxes, retention_del_gboxes;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, false);
  end loop;

  -- 가명 처리된 서명 기록(INV-S14) — 그 주문이 끝난 때(마지막 기록)부터 5년. 주문이 회원 쪽 내역으로 남아도 서명은 지운다(카드 d125).
  delete from public.approval_signatures s
   using public.approval_requests r
    join public.orders o on o.id = r.order_id
   where r.request_id = s.request_id
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and s.signed_content is null and s.signer_id is null and s.content_hash is not null
     -- 탈퇴한 크리에이터의 서명만 — 새 서명 기록은 처음부터 원문·서명자 식별값이 비어 있어 꼴로는 가명 처리된 줄과 같다(INV-S14 S14c)
     and exists (select 1 from public.creators wc where wc.id = o.creator_id and wc.withdrawn_at is not null)
     and public.order_is_finished(r.order_id)
     and public.order_ended_at(r.order_id) < now() - interval '5 years';
  get diagnostics v_signatures = row_count;

  -- 탈퇴한 사람이 쓴 1:1 문의(INV-A16 — 3년)
  delete from public.inquiries i
   using public.profiles p
   where p.id = i.author_id and p.withdrawn_at is not null
     and i.created_at < now() - interval '3 years';
  get diagnostics v_inquiries = row_count;

  -- 끝났고 마지막 기록이 5년 넘은 주문 중 한쪽이라도 탈퇴한 것
  create temp table retention_old_orders on commit drop as
  select o.id, (fp.withdrawn_at is not null) as fan_gone, (c.withdrawn_at is not null) as creator_gone, o.fan_id, o.creator_id
    from public.orders o
    join public.profiles fp on fp.id = o.fan_id
    join public.creators c on c.id = o.creator_id
   where (fp.withdrawn_at is not null or c.withdrawn_at is not null)
     and o.created_at < now() - interval '5 years' -- 마지막 기록은 주문을 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.order_is_finished(o.id)
     and public.order_ended_at(o.id) < now() - interval '5 years';

  -- 끝났고 마지막 기록이 5년 넘은 보내기 중 크리에이터나 받는 팬 한쪽이라도 탈퇴한 것 · 그 보내기에서 손댈 몫
  create temp table retention_old_sends on commit drop as
  select d.id, (c.withdrawn_at is not null) as creator_gone, d.creator_id
    from public.revgift_sends d
    join public.creators c on c.id = d.creator_id
   where (c.withdrawn_at is not null
          or exists (select 1 from public.revgift_shares s join public.profiles p on p.id = s.fan_id where s.send_id = d.id and p.withdrawn_at is not null))
     and d.created_at < now() - interval '5 years' -- 마지막 기록은 보내기를 만든 때보다 이르지 않다 — 비싼 계산 전에 거른다
     and public.revgift_send_finished(d.id)
     and public.revgift_send_ended_at(d.id) < now() - interval '5 years';
  create temp table retention_rg_shares on commit drop as
  select s.id, (p.withdrawn_at is not null) as fan_gone, o.creator_gone, o.creator_id
    from public.revgift_shares s
    join retention_old_sends o on o.id = s.send_id
    join public.profiles p on p.id = s.fan_id
   where p.withdrawn_at is not null or o.creator_gone;

  -- ① 한쪽만 탈퇴 — 주문·몫은 남기고, 그 기록에 든 가명(탈퇴한 사람)을 같이 쓰는 표시로 바꾼다
  create temp table retention_unlink on commit drop as
  select * from retention_old_orders where not (fan_gone and creator_gone);
  create temp table retention_gone on commit drop as
  select p.id from public.profiles p where p.withdrawn_at is not null and p.id <> c_shared_fan;
  -- 남는 주문·몫의 사무실 상자(선물·역조공 한 목록)
  create temp table retention_unlink_parcels on commit drop as
  select op.id, u.creator_gone, u.creator_id
    from retention_unlink u join public.boxes b on b.order_id = u.id join public.office_parcels op on op.box_id = b.id
  union all
  select op.id, r.creator_gone, r.creator_id
    from retention_rg_shares r join public.office_parcels op on op.share_id = r.id
   where not (r.fan_gone and r.creator_gone);

  update public.orders o
     set fan_id = case when u.fan_gone then c_shared_fan else o.fan_id end,
         creator_id = case when u.creator_gone then c_shared_creator else o.creator_id end
    from retention_unlink u
   where o.id = u.id and ((u.fan_gone and o.fan_id <> c_shared_fan) or (u.creator_gone and o.creator_id <> c_shared_creator));
  get diagnostics v_unlinked = row_count;

  update public.order_cancellations oc set canceled_by = c_shared_fan
    from retention_unlink u where oc.order_id = u.id and oc.canceled_by in (select id from retention_gone);
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_unlink u, public.payments p
   where p.order_id = u.id and rc.payment_id = p.id and rc.requested_by in (select id from retention_gone);

  update public.revgift_shares s set fan_id = c_shared_fan
    from retention_rg_shares r
   where s.id = r.id and r.fan_gone and not r.creator_gone and s.fan_id <> c_shared_fan;
  get diagnostics v_rg_unlinked = row_count;
  update public.revgift_sends d
     set creator_id = c_shared_creator,
         sender_id = case when d.sender_id in (select id from retention_gone) then c_shared_fan else d.sender_id end
    from retention_old_sends o
   where d.id = o.id and o.creator_gone and d.creator_id <> c_shared_creator;
  get diagnostics v_n = row_count;
  v_rg_unlinked := v_rg_unlinked + v_n;
  update public.review_cancels rc set requested_by = c_shared_fan
    from retention_old_sends o
   where rc.send_id = o.id and rc.requested_by in (select id from retention_gone);

  update public.office_creator_checks cc set answered_by = c_shared_fan
    from retention_unlink_parcels up where cc.parcel_id = up.id and cc.answered_by in (select id from retention_gone);
  update public.office_creator_check_events ce set actor = c_shared_fan
    from retention_unlink_parcels up where ce.parcel_id = up.id and ce.actor in (select id from retention_gone);
  update public.office_held_links hl set account_id = c_shared_fan
    from retention_unlink_parcels up where hl.parcel_id = up.id and hl.account_id in (select id from retention_gone);
  update public.office_unmatched um set nickname_profile_id = c_shared_fan
    from retention_unlink_parcels up where um.matched_parcel_id = up.id and um.nickname_profile_id in (select id from retention_gone);
  update public.office_hold_alerts ha set creator_id = c_shared_creator
    from retention_unlink_parcels up where up.creator_gone and ha.parcel_id = up.id and ha.creator_id = up.creator_id;

  -- ② 둘 다 탈퇴 — 주문·몫과 거기 달린 기록을 아래에서부터 지운다
  create temp table retention_del_orders on commit drop as select id from retention_old_orders where fan_gone and creator_gone;
  create temp table retention_del_shares on commit drop as select id from retention_rg_shares where fan_gone and creator_gone;
  create temp table retention_del_boxes on commit drop as select b.id from public.boxes b where b.order_id in (select id from retention_del_orders);
  create temp table retention_del_parcels on commit drop as
    select op.id from public.office_parcels op
     where op.box_id in (select id from retention_del_boxes) or op.share_id in (select id from retention_del_shares);
  create temp table retention_del_unmatched on commit drop as select u.id from public.office_unmatched u where u.matched_parcel_id in (select id from retention_del_parcels);
  create temp table retention_del_payments on commit drop as
    select p.id from public.payments p where p.order_id in (select id from retention_del_orders) or p.box_id in (select id from retention_del_boxes);

  delete from public.office_held_links where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched);
  -- 지우는 몫을 가리키는 옮기기 기록은 남는 몫 쪽 상자의 것이어도 함께 지운다(두 칸 모두 그 몫을 가리켜야 하는 외래 키라 남길 수 없다)
  delete from public.office_share_moves where parcel_id in (select id from retention_del_parcels) or unmatched_id in (select id from retention_del_unmatched)
     or from_share_id in (select id from retention_del_shares) or to_share_id in (select id from retention_del_shares);
  delete from public.office_unmatched_look_edits where unmatched_id in (select id from retention_del_unmatched);
  delete from public.office_unmatched where id in (select id from retention_del_unmatched);
  delete from public.office_inspections where parcel_id in (select id from retention_del_parcels);
  delete from public.office_hold_alerts where parcel_id in (select id from retention_del_parcels);
  delete from public.office_envelope_shreds where parcel_id in (select id from retention_del_parcels);
  delete from public.office_not_mine_reports where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_check_events where parcel_id in (select id from retention_del_parcels);
  delete from public.office_creator_checks where parcel_id in (select id from retention_del_parcels);
  delete from public.office_police_handovers where parcel_id in (select id from retention_del_parcels);
  delete from public.office_disposals where parcel_id in (select id from retention_del_parcels);
  delete from public.return_address_events where parcel_id in (select id from retention_del_parcels);
  delete from public.return_decrypt_releases where parcel_id in (select id from retention_del_parcels)
     or opened_log_id in (select l.id from public.return_decrypt_log l where l.parcel_id in (select id from retention_del_parcels));
  delete from public.return_decrypt_log where parcel_id in (select id from retention_del_parcels);
  delete from public.decrypt_releases where box_id in (select id from retention_del_boxes)
     or opened_log_id in (select l.id from public.decrypt_log l where l.order_id in (select id from retention_del_orders) or l.box_id in (select id from retention_del_boxes));
  delete from public.decrypt_log where order_id in (select id from retention_del_orders) or box_id in (select id from retention_del_boxes);
  delete from public.refunds where box_id in (select id from retention_del_boxes) or payment_id in (select id from retention_del_payments);
  delete from public.payments where id in (select id from retention_del_payments);
  delete from public.approval_signatures where request_id in (select r.request_id from public.approval_requests r where r.order_id in (select id from retention_del_orders));
  delete from public.approval_requests where order_id in (select id from retention_del_orders);
  delete from public.orders where id in (select id from retention_del_orders);
  get diagnostics v_orders = row_count;

  -- 역조공 — 받는 주소 6자리를 먼저 지운다(사무실 상자가 지워질 때 그 줄을 고치려 들지 않게)
  delete from public.inbound_codes where share_id in (select id from retention_del_shares);
  delete from public.revgift_decrypt_releases where share_id in (select id from retention_del_shares)
     or opened_log_id in (select l.id from public.revgift_decrypt_log l where l.share_id in (select id from retention_del_shares));
  delete from public.revgift_decrypt_log where share_id in (select id from retention_del_shares);
  delete from public.refunds where share_id in (select id from retention_del_shares);
  -- 사무실 상자는 몫과 함께 지워진다(그 상자의 기록은 위에서 지웠다)
  delete from public.revgift_shares where id in (select id from retention_del_shares);
  get diagnostics v_rg_shares = row_count;
  delete from public.revgift_sends d
   where d.id in (select id from retention_old_sends where creator_gone)
     and not exists (select 1 from public.revgift_shares s where s.send_id = d.id);
  get diagnostics v_rg_sends = row_count;

  -- 선물함(revgift-box) — 끝났고(완료·반송됨·취소) 끝난 지 5년 넘은 선물함 중 만든 크리에이터나 신청한 팬 한쪽이라도 탈퇴한 것.
  -- ① 크리에이터만 탈퇴했거나 탈퇴하지 않은 팬이 남아 있으면 선물함·신청은 남기고 탈퇴한 쪽 가명을 같이 쓰는 표시로 바꾼다.
  --    같은 선물함에 탈퇴한 팬이 여럿이어도 같은 표시 하나가 된다(신청 유일 색인이 그 표시를 뺀다).
  -- ② 크리에이터가 탈퇴했고 남은 신청이 모두 탈퇴한 팬이면 선물함과 거기 달린 기록을 지운다.
  create temp table retention_old_gboxes on commit drop as
  select gb.id, (cp.withdrawn_at is not null) as creator_gone,
         not exists (select 1 from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id
                     where a.box_id = gb.id and p.withdrawn_at is null) as fans_gone
    from public.revgift_boxes gb
    join public.profiles cp on cp.id = gb.owner_id
   where gb.status in ('done', 'returned', 'cancelled') and gb.ended_at < now() - interval '5 years'
     and (cp.withdrawn_at is not null
          or exists (select 1 from public.revgift_box_applications a join public.profiles p on p.id = a.fan_id where a.box_id = gb.id and p.withdrawn_at is not null));

  update public.revgift_box_applications a set fan_id = c_shared_fan
    from retention_old_gboxes o, public.profiles p
   where a.box_id = o.id and not (o.creator_gone and o.fans_gone) and p.id = a.fan_id and p.withdrawn_at is not null and a.fan_id <> c_shared_fan;
  get diagnostics v_gb_unlinked = row_count;
  update public.revgift_boxes gb set owner_id = c_shared_fan, creator_id = c_shared_creator
    from retention_old_gboxes o
   where gb.id = o.id and o.creator_gone and not o.fans_gone and gb.owner_id <> c_shared_fan;
  get diagnostics v_n = row_count;
  v_gb_unlinked := v_gb_unlinked + v_n;

  create temp table retention_del_gboxes on commit drop as select id from retention_old_gboxes where creator_gone and fans_gone;
  delete from public.revgift_box_decrypt_releases x using public.revgift_box_applications a
   where a.id = x.application_id and a.box_id in (select id from retention_del_gboxes);
  delete from public.revgift_box_decrypt_log x using public.revgift_box_applications a
   where a.id = x.application_id and a.box_id in (select id from retention_del_gboxes);
  delete from public.refunds r using public.revgift_box_invoice_lines l, public.revgift_box_invoices i
   where r.box_line_id = l.id and l.invoice_id = i.id and i.box_id in (select id from retention_del_gboxes);
  delete from public.revgift_box_address_events e using public.revgift_box_applications a
   where a.id = e.application_id and a.box_id in (select id from retention_del_gboxes);
  -- 신청·큰 상자·명세서·결제·확인 필요·취소 상자 카드는 선물함과 함께 지워진다
  delete from public.revgift_boxes where id in (select id from retention_del_gboxes);
  get diagnostics v_gb_boxes = row_count;

  foreach v_tab in array v_locked loop
    perform public.withdrawal_toggle_append_only(v_tab, true);
  end loop;

  v_counts := jsonb_build_object('signatures', v_signatures, 'inquiries', v_inquiries, 'orders', v_orders, 'unlinked', v_unlinked, 'access_logs', 0,
                                 'revgift_shares', v_rg_shares, 'revgift_sends', v_rg_sends, 'revgift_unlinked', v_rg_unlinked,
                                 'gift_boxes', v_gb_boxes, 'gift_box_unlinked', v_gb_unlinked);
  insert into public.retention_purge_runs (counts) values (v_counts);
  return v_counts;
end $$;

revoke all on function public.retention_purge() from public, anon, authenticated, service_role;

-- 직접 환불함(admin-console INV-K7 S7f) — 선물함 명세서 줄(revgift_box)을 더한다. 나머지는 20261024000002 본문 그대로다.
create or replace function public.admin_mark_refund_manual(p_kind text, p_unit_id uuid, p_memo text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_memo text := btrim(coalesce(p_memo, ''));
  v_refund public.refunds;
begin
  if not public.is_owner() then
    raise exception '직접 환불 완료는 대표만 적는다' using errcode = '42501';
  end if;
  if char_length(v_memo) not between 1 and 200 then
    raise exception '메모는 1~200자' using errcode = 'P0026';
  end if;
  -- 숫자 10자리 이상 — 휴대폰·계좌번호(날짜·시각은 빼고 센다)
  if public.refund_memo_has_long_number(v_memo) then
    raise exception '메모에 연락처·계좌번호를 쓰지 않는다' using errcode = 'P0027';
  end if;

  -- admin_claim_refund 와 같은 순서로 잠근다
  if p_kind = 'gift' then
    perform 1 from public.payments p where p.id = p_unit_id for update;
    if not found then
      raise exception '결제를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.payment_id = p_unit_id and r.box_id is null for update;
  elsif p_kind = 'gift_box' then
    perform 1 from public.boxes b join public.payments p on p.order_id = b.order_id and p.kind = 'initial'
    where b.id = p_unit_id for update of p;
    if not found then
      raise exception '상자를 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.box_id = p_unit_id for update;
  elsif p_kind = 'revgift' then
    perform 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
    where s.id = p_unit_id for update of s, d;
    if not found then
      raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.share_id = p_unit_id for update;
  elsif p_kind = 'revgift_box' then
    perform 1 from public.revgift_box_invoice_lines l
    join public.revgift_box_payments p on p.invoice_id = l.invoice_id and p.status = 'done'
    where l.id = p_unit_id for update of p;
    if not found then
      raise exception '명세서 줄을 찾을 수 없다' using errcode = 'P0002';
    end if;
    select * into v_refund from public.refunds r where r.box_line_id = p_unit_id for update;
  else
    raise exception '환불 종류는 gift · gift_box · revgift · revgift_box' using errcode = '22023';
  end if;

  if v_refund.id is null then
    raise exception '아직 환불을 누르지 않았다 — 결제사 취소부터 해 본다' using errcode = 'P0022';
  end if;
  if v_refund.status = 'done' then
    raise exception '이미 환불했다' using errcode = 'P0023';
  end if;
  if v_refund.status = 'requesting' and v_refund.claimed_at > now() - interval '2 minutes' then
    raise exception '환불을 처리하고 있다' using errcode = 'P0024';
  end if;

  update public.refunds r
  set status = 'done', settled_at = now(), manual_memo = v_memo, manual_by = auth.uid(), manual_at = now()
  where r.id = v_refund.id;
  return v_refund.amount_krw;
end
$$;

revoke all on function public.admin_mark_refund_manual(text, uuid, text) from public, anon;
grant execute on function public.admin_mark_refund_manual(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
