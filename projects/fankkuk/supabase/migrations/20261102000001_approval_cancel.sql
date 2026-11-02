-- 크리에이터의 승인 취소 — 입고 전에는 승인 대기로 되돌리고, 입고 뒤에는 거절로 끝낸다 (2026-11-02).
-- 스펙: docs/specs/approval-cancel.md INV-AC1~AC6 · approval-signature INV-S6·S7·S9·S12 · address-protection INV-P4 (a) · payment INV-M8·M18.
--
-- 이 파일은 개인정보 구역(pii)을 읽지도 고치지도 않는다. 승인 함수(manual/0028 의 settle_approval_sign)는 그대로 두고,
-- 취소 뒤 옛 서명이 다시 쓰이는 길은 이 파일의 표·트리거로 막는다 — manual 파일을 새로 적용하지 않아도 된다.
--
-- 무엇을 바꾸나
--   1) approval_cancellations — 취소 한 번에 줄 하나: 누가(계정 ID)·언제·입고 전/뒤·무효로 만든 서명(INV-AC5·AC2).
--   2) approval_signatures 의 「승인 요청 하나에 서명 하나」 유일 제약을 「살아 있는(취소되지 않은) 서명 하나」로 바꾼다 —
--      취소 뒤 다시 승인하면 같은 승인 요청에 새 서명 줄이 생긴다. 지난 서명 줄은 지우지 않고 취소 기록이 무효로 표시한다(INV-AC2, INV-S12·S14).
--      같은 트리거가 「취소보다 먼저 만들어진 서명 요청」의 서명 줄을 막는다(INV-AC2 — 취소 전 서명으로는 다시 승인되지 않는다).
--   3) order_arrived_box_count · order_invoice_printed · order_approval_cancelable — 입고 판정(INV-AC1)·송장 출력 판정·취소 가능 판정(INV-AC4)을 한 곳씩.
--   4) cancel_approval(사람, 승인 요청) — 취소하는 유일한 입구. 승인 요청 줄 → 주문 줄 순서로 잠근다(승인·거절·자동 반려와 같은 순서, INV-AC5).
--      입고 전: 승인 대기로(승인 기한은 그대로 — 결제 완료부터 168시간, INV-S6). 입고 뒤: 지금의 거절 함수로 거절(INV-AC4).
--      「먼저 보내기」 칸(fan_send_ack_at)은 건드리지 않는다 — 팬이 안내를 보고 누른 기록이다(INV-S9). 승인 이력은 7) 의 판정이 서명 기록으로 본다.
--   5) invoice_print_context — 서명 재료를 「그 주문의 무효가 아닌 가장 최근 서명」에서 읽는다(INV-AC3, INV-P4 (a)).
--      취소된 승인이면 서명 칸이 비어 송장 출력 함수가 거부하고 거부 줄을 남긴다.
--   6) my_approval_cancel_targets(사람) — 화면이 버튼·확인 창을 정하는 값: 취소 가능 여부·도착한 상자 수·승인 기한.
--   7) order_send_guide_shown(주문) — 「받는 주소를 본 적이 있다」 = 승인 중 · 「먼저 보내기」 기록 · 승인 이력(서명 기록이 하나라도 있음)(INV-AC6·S9).
--      팬 상자 읽기(my_gift_boxes)·팬 선물 읽기(my_gifts, send_guide_shown 칸 추가)·주문이 끝날 때 6자리 정리(inbound_void_for_order —
--      환불의 「본 적 있음」과 늦게 오는 상자 규칙, payment INV-M8·M18)가 모두 이 함수 하나로 판정한다.
--
-- 한쪽만 적용된 상태
--   이 파일만(앱은 옛 코드): 취소 입구를 부르는 곳이 없어 아무것도 바뀌지 않는다. 송장 출력 재료는 취소 기록이 없으면 지금과 같은 서명을 고른다.
--   앱만(이 파일 없음): 취소 라우트·화면 값 읽기가 함수를 찾지 못해 실패한다(닫힌 쪽 — 승인은 그대로 남는다).

-- ── 1) 취소 기록 ─────────────────────────────────────────

create table public.approval_cancellations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  request_id text not null references public.approval_requests (request_id) on delete cascade,
  -- 이 취소가 무효로 만든 서명(그 승인의 서명 기록). 보관 기한 삭제가 서명 줄을 지우면 이 줄도 같이 지워진다
  signature_id uuid references public.approval_signatures (id) on delete cascade,
  -- 취소한 크리에이터 계정. 탈퇴하면 탈퇴 처리가 가명 계정으로 옮긴다(계정을 가리키는 칸을 모두 옮기는 그 처리)
  canceled_by uuid not null references public.profiles (id),
  canceled_at timestamptz not null default now(),
  phase text not null check (phase in ('before_inbound', 'after_inbound'))
);
create unique index approval_cancellations_signature on public.approval_cancellations (signature_id) where signature_id is not null;
create index approval_cancellations_by_request on public.approval_cancellations (request_id, canceled_at);
alter table public.approval_cancellations enable row level security;
revoke all on public.approval_cancellations from public, anon, authenticated, service_role;

-- 보관 기한 처리가 한쪽만 탈퇴한 주문을 남기며 크리에이터 칸을 「같이 쓰는 크리에이터」로 바꿀 때(retention_purge ①),
-- 그 주문의 취소 기록이 가리키는 계정도 같이 쓰는 표시로 바꾼다 — order_cancellations.canceled_by 와 같은 처리(카드 d123).
-- 취소는 그 주문의 크리에이터만 하므로 취소 기록의 계정은 곧 그 크리에이터다.
create function public.approval_cancellations_unlink()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.approval_cancellations x
     set canceled_by = 'ffffffff-0000-4000-8000-000000000001'
   where x.order_id = new.id and x.canceled_by <> 'ffffffff-0000-4000-8000-000000000001';
  return null;
end $$;

create trigger orders_approval_cancellations_unlink after update of creator_id on public.orders
for each row when (new.creator_id = 'ffffffff-0000-4000-8000-000000000002' and old.creator_id is distinct from new.creator_id)
execute function public.approval_cancellations_unlink();

-- ── 2) 살아 있는 서명은 승인 요청 하나에 하나, 취소 전 서명 요청의 서명은 받지 않는다 ──

alter table public.approval_signatures drop constraint if exists approval_signatures_request_id_key;

create function public.approval_signature_live_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- 승인 요청 하나에 살아 있는 서명은 하나 — 지난 유일 제약이 지키던 것(같은 승인이 두 번 기록되지 않게).
  -- 부분 유일 색인으로는 못 한다: 「취소되지 않음」이 다른 표(취소 기록)에 있고, 서명 표는 추가만이라 표시 칸을 나중에 바꿀 수도 없다.
  -- 그래서 승인 요청 줄을 잠근 뒤 본다 — 같은 요청의 서명 두 건이 동시에 와도 차례로 보고 뒤의 것이 막힌다(승인 함수·취소 함수가 잡는 것과 같은 줄).
  perform 1 from public.approval_requests q where q.request_id = new.request_id for update;
  if exists (
    select 1 from public.approval_signatures s
    where s.request_id = new.request_id
      and not exists (select 1 from public.approval_cancellations x where x.signature_id = s.id)
  ) then
    raise exception '이 승인 요청에는 이미 살아 있는 서명이 있다' using errcode = '23505';
  end if;
  -- INV-AC2: 취소보다 먼저 만들어진 서명 요청의 결과로는 다시 승인되지 않는다
  if new.sign_request_id is not null and exists (
    select 1 from public.approval_cancellations x
    join public.approval_sign_requests r on r.id = new.sign_request_id
    where x.request_id = new.request_id and r.created_at <= x.canceled_at
  ) then
    raise exception '승인 취소 전에 시작된 서명으로는 승인하지 않는다 (INV-AC2)' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger approval_signatures_live_guard before insert on public.approval_signatures
for each row execute function public.approval_signature_live_guard();

-- ── 3) 입고·송장 출력 판정 ───────────────────────────────

-- INV-AC1: 입고 = 그 주문의 상자가 하나라도 사무실에 도착(입고 스캔)한 것. 지금 기록으로 센다.
-- 사무실 상자는 입고 스캔 때 「대기(awaiting)」를 벗어난다 — 환불·6자리 정리(payment INV-M8·M18)가 쓰는 「도착한 상자」와 같은 기준이다.
create function public.order_arrived_box_count(p_order_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(distinct b.id)::integer
  from public.boxes b
  join public.office_parcels x on x.box_id = b.id
  where b.order_id = p_order_id and x.state <> 'awaiting';
$$;

-- INV-AC4: 송장이 한 번이라도 출력된 상자가 있는가 — 출력 단계·출력 시각·송장번호, 그리고 주소를 열고 돌려주지 않은 기록(주소가 나간 순간)
create function public.order_invoice_printed(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.boxes b join public.office_parcels x on x.box_id = b.id
    where b.order_id = p_order_id
      and (x.state in ('label_printed', 'shipped') or x.printed_at is not null or x.outbound_waybill_no is not null)
  ) or exists (
    select 1 from public.decrypt_log l
    where l.order_id = p_order_id and l.result = 'opened'
      and not exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id)
  );
$$;

-- INV-AC4: 승인을 취소할 수 있는 주문인가 — 출고 전 · 진행 중(결제 완료~검수) · 검수 불합격 반송이 아님 · 첫 송장 출력 전.
-- 취소 함수와 화면 값(my_approval_cancel_targets)이 이 함수 하나로 판정한다. 승인 여부·본인 여부는 부르는 쪽이 본다.
create function public.order_approval_cancelable(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and o.shipped_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
  ) and not public.order_invoice_printed(p_order_id);
$$;

-- ── 4) 승인 취소 ─────────────────────────────────────────

-- result: canceled(phase = before_inbound · after_inbound) · not_found(없는 요청·남의 요청 — 같은 답) · not_approved(승인된 주문이 아님)
--         · printed(송장이 출력된 상자가 있음, INV-AC4) · not_cancelable(출고·검수 불합격 반송 등 진행이 끝난 주문)
create function public.cancel_approval(p_actor_id uuid, p_request_id text)
returns table (result text, phase text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_order public.orders;
  v_sig uuid;
  v_phase text;
  v_now timestamptz := now();
begin
  -- INV-AC5: 그 주문의 크리에이터 본인만. 승인 요청 줄을 잠근다 — 승인(서명 결과)·거절·자동 반려와 같은 줄이라 동시에 와도 차례로 본다
  select q.* into v_req
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where q.request_id = p_request_id and p_actor_id is not null and c.profile_id = p_actor_id
  for update of q;
  if v_req.id is null then
    return query select 'not_found'::text, null::text;
    return;
  end if;
  select o.* into v_order from public.orders o where o.id = v_req.order_id for update;

  if v_req.status <> 'approved' or v_order.approved_at is null then
    return query select 'not_approved'::text, null::text;
    return;
  end if;
  -- INV-AC4: 취소할 수 있는 주문인가(화면 값과 같은 함수). 아니면 송장 출력 때문인지만 따로 알린다(그 뒤는 1:1 문의)
  if not public.order_approval_cancelable(v_order.id) then
    return query select case when public.order_invoice_printed(v_order.id) then 'printed' else 'not_cancelable' end, null::text;
    return;
  end if;

  -- INV-AC1: 이 처리 안의 상자 기록으로 판정한다(화면이 보낸 값은 받지 않는다)
  v_phase := case when public.order_arrived_box_count(v_order.id) > 0 then 'after_inbound' else 'before_inbound' end;

  -- INV-AC2: 지금 살아 있는 서명을 무효로 표시한다 — 서명 줄은 지우지 않는다
  select s.id into v_sig
  from public.approval_signatures s
  where s.request_id = v_req.request_id
    and not exists (select 1 from public.approval_cancellations x where x.signature_id = s.id)
  order by s.signed_at desc, s.id desc
  limit 1;
  insert into public.approval_cancellations (order_id, request_id, signature_id, canceled_by, canceled_at, phase)
  values (v_order.id, v_req.request_id, v_sig, p_actor_id, v_now, v_phase);

  -- 승인을 되돌린다 — 승인 표시를 바꾸는 입구라 승인 함수와 같은 표시를 켠다(INV-S7 트리거).
  -- 승인 기한(결제 완료 시각 registered_at)은 건드리지 않는다(INV-S6). 「먼저 보내기」 칸도 건드리지 않는다(INV-S9) —
  -- 받는 주소가 계속 보이는 것(INV-AC6)은 order_send_guide_shown 이 서명 기록(승인 이력)으로 판정한다.
  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests q set status = 'waiting', decided_at = null where q.id = v_req.id;
  update public.orders o set approved_at = null where o.id = v_order.id;
  perform set_config('fankkuk.approving', '', true);

  -- INV-AC2: 그 승인 요청에 기다리는 서명 요청이 있으면 끝낸다 — 취소 전에 시작된 서명의 결과는 받지 않는다
  update public.approval_sign_requests r set state = 'failed', finished_at = v_now
   where r.approval_request_id = v_req.request_id and r.state = 'pending';

  -- INV-AC4: 입고 뒤에는 지금의 거절과 같은 처리(같은 상태·환불·반송·팬 알림) — 거절 함수를 그대로 부른다
  if v_phase = 'after_inbound' and not public.reject_order_for_decline(v_order.id, v_now, false) then
    -- 위에서 거절 조건을 이미 봤다 — 여기 오면 조건이 어긋난 것이라 처리 전체를 되돌린다
    raise exception '입고 뒤 승인 취소를 거절로 끝내지 못했다' using errcode = '55000';
  end if;

  return query select 'canceled'::text, v_phase;
end $$;

-- ── 5) 송장 출력 재검증 재료 — 무효가 아닌 가장 최근 승인의 서명 ──
-- 20261029000011 의 정의 그대로에 서명을 고르는 자리만 바꿨다(승인 요청의 approved 표시 → 그 주문의 무효가 아닌 가장 최근 서명).
-- 취소된 승인은 승인 요청이 대기·거절로 바뀌고 서명이 취소 기록에 걸리므로, 서명이 고르지 않아져 「승인 없음」으로 거부된다(INV-AC3).

create or replace function public.invoice_print_context(p_qr text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  r jsonb;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v from public.office_parcels where qr_code = p_qr;
  if v.id is null then
    return null;
  end if;
  if v.box_id is null then
    return jsonb_build_object('kind', 'share');
  end if;
  select jsonb_build_object(
    'kind', 'gift',
    'order_id', o.id,
    'box_id', b.id,
    'order_no', o.order_no,
    'order_status', o.status,
    'parcel_state', v.state,
    'creator_profile_id', c.profile_id,
    'difference_unpaid', exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done'),
    -- INV-P5: 이 상자에서 주소를 연 횟수 = 연 줄 − 돌려준 줄(INV-P15)
    'decrypt_count', (select count(*) from public.decrypt_log l where l.box_id = b.id and l.result = 'opened')
                   - (select count(*) from public.decrypt_releases rl where rl.box_id = b.id),
    'signature_present', s.id is not null and (s.signature is not null or s.signed_content is not null),
    -- INV-P4 (a): 서명값 그대로 — kakao 면 송장 출력 함수(게이트웨이)가 전자서명문을 다시 검증한다
    'signature', s.signature,
    'signer_method', s.method,
    'recorded_hash', coalesce(s.content_hash, case when s.signed_content is not null
                       then encode(extensions.digest(convert_to(s.signed_content, 'UTF8'), 'sha256'), 'hex') end),
    'approval_plaintext', coalesce(sr.plaintext, s.signed_content)
  ) into r
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  -- INV-AC3: 그 주문의 무효가 아닌(취소 기록에 걸리지 않은) 가장 최근 서명 하나
  left join lateral (
    select s0.*
    from public.approval_requests q
    join public.approval_signatures s0 on s0.request_id = q.request_id
    where q.order_id = o.id
      and not exists (select 1 from public.approval_cancellations x where x.signature_id = s0.id)
    order by s0.signed_at desc, s0.id desc
    limit 1
  ) s on true
  left join public.approval_sign_requests sr on sr.id = s.sign_request_id and sr.state = 'signed'
  where b.id = v.box_id;
  return r;
end $$;

-- ── 6) 화면 값 — 승인 취소 버튼·확인 창 ───────────────────

-- 그 크리에이터의 승인된 진행 중 주문. cancelable: order_approval_cancelable(INV-AC4 — 취소 함수와 같은 판정). arrived_box_count: 지금 도착한 상자 수(INV-AC1).
-- approval_deadline_at: 결제 완료부터 168시간(INV-S6) — 취소해도 늘지 않는다(INV-AC2). 화면은 이 값으로만 버튼·문구를 정하고, 저장 때는 취소 함수가 다시 판정한다.
create function public.my_approval_cancel_targets(p_actor_id uuid)
returns table (request_id text, order_no text, cancelable boolean, arrived_box_count integer, approval_deadline_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select q.request_id, o.order_no,
         public.order_approval_cancelable(o.id),
         public.order_arrived_box_count(o.id),
         o.registered_at + interval '168 hours'
  from public.approval_requests q
  join public.orders o on o.id = q.order_id
  join public.creators c on c.id = o.creator_id
  where p_actor_id is not null and c.profile_id = p_actor_id
    and q.status = 'approved' and o.approved_at is not null
    and o.status not in ('rejected', 'expired', 'canceled')
  order by o.approved_at desc, o.order_no;
$$;

-- ── 7) 받는 주소를 본 적이 있는가 — 「먼저 보내기」 기록 또는 승인 이력 (INV-AC6 · approval-signature INV-S9) ──
-- 승인 이력 = 그 주문에 서명 기록이 하나라도 있음(취소돼도 서명 줄은 남는다, INV-AC2). 「먼저 보내기」 칸(fan_send_ack_at)은 팬이 안내를 보고 누른 기록 그대로 둔다 —
-- 취소가 그 칸을 채우지 않는다(거절 환불 다툼의 근거, INV-S9). 이 판정을 읽던 자리는 모두 이 함수 하나를 부른다:
-- 팬 상자 읽기(6자리·「먼저 보내기」 필요), 팬 선물 읽기(화면의 「먼저 보내기」 안내), 주문이 끝날 때 안 온 상자의 6자리를 살려 두는 트리거
-- (환불 계산의 「본 적 있음」은 그 트리거가 살려 둔 표시로 센다 — payment INV-M8·M18).
create function public.order_send_guide_shown(p_order_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.orders o where o.id = p_order_id and (o.approved_at is not null or o.fan_send_ack_at is not null))
      or exists (
        select 1 from public.approval_requests q join public.approval_signatures s on s.request_id = q.request_id
        where q.order_id = p_order_id
      );
$$;
revoke all on function public.order_send_guide_shown(uuid) from public, anon, authenticated, service_role;

-- 팬 상자 읽기 — 20261022000001_not_sent_todo.sql 의 정의 그대로에 판정 두 자리만 위 함수로
create or replace function public.my_gift_boxes(p_order_no text)
 RETURNS TABLE(box_id uuid, label text, tier text, waybill_no text, state text, address_code text, reported_not_mine boolean, send_ack_needed boolean, not_sent_at timestamp with time zone)
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
         -- approval-cancel INV-AC6: 승인 이력이 있으면 입고 전 취소로 대기로 돌아가도 그대로 보인다
         case when public.order_send_guide_shown(o.id)
                   and o.status not in ('rejected', 'expired', 'canceled')
              then (select c.code from public.inbound_codes c where c.box_id = b.id and c.state = 'valid') end,
         exists (select 1 from public.office_not_mine_reports r where r.parcel_id = p.id),
         not public.order_send_guide_shown(o.id) and o.status in ('registered', 'received', 'labeled', 'inspected'),
         -- 「아직 보내지 않음」을 누른 시각(office-workflow INV-W10) — 아직 입고 전·닫히지 않은 상자에만. 도착한 상자에는 붙이지 않는다.
         -- 누른 뒤 그 상자에 송장번호를 넣었으면 보낸 상자라 붙이지 않는다(2026-10-22 리뷰)
         case when b.missing_at is null and (p.state is null or p.state = 'awaiting') and p.tracking_no is null then o.fan_not_sent_at end
  from public.orders o
  join public.boxes b on b.order_id = o.id
  left join public.office_parcels p on p.box_id = b.id
  where o.order_no = p_order_no and o.fan_id = auth.uid() and o.registered_at is not null
  order by b.seq;
$function$;

-- 주문이 끝날 때 6자리 정리 — 20261021000001_deadline_clocks.sql 의 정의 그대로에 「본 적 있음」은 위 함수로, 「도착한 상자 있음」은 입고 판정 함수(3)로
create or replace function public.inbound_void_for_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- payment INV-M18 · inbound-address-code INV-C3 (2026-10-10): 받는 주소를 본 적이 있으면(승인 · 「먼저 보내기」 · 도착한 상자 있음)
  -- 아직 안 온 상자의 6자리는 무효로 하지 않고 살려 둔 시각을 적는다. 도착한 상자의 6자리는 이미 사용됨, 닫힌 상자의 6자리는 이미 무효라
  -- 남은 유효한 6자리가 곧 안 온 상자다.
  -- approval-cancel INV-AC6: 승인 이력(서명 기록)도 「본 적 있음」 — 입고 전 취소로 대기로 돌아간 주문
  if public.order_send_guide_shown(new.id) or public.order_arrived_box_count(new.id) > 0 then
    update public.inbound_codes c
    set kept_at = now()
    from public.boxes b
    where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and c.kept_at is null and b.missing_at is null;
    -- payment INV-M18 ③ (2026-10-21 기한 정리): 살려 둔 상자는 결제 완료 + 720시간에 닫는다 — 끝나는 때 이미 지났으면 살려 두지 않고 이 처리에서 바로 닫는다(S18j).
    -- 살려 둔 시각은 위에서 적었다 — 환불 몫은 살려 둔 상자와 같다(주문 환불에 상자 금액 − 배송비 칸, 상자 환불 대상 = 배송비 칸)
    if new.registered_at <= now() - interval '720 hours' then
      with closed as (
        update public.inbound_codes c
        set state = 'void', voided_at = now()
        from public.boxes b
        where b.order_id = new.id and c.box_id = b.id and c.state = 'valid' and c.kept_at is not null and b.missing_at is null
        returning c.box_id
      )
      update public.boxes b set missing_at = now() from closed where b.id = closed.box_id;
    end if;
    -- 보낸 팬에게 안내 한 번(notifications INV-N17 ①) — 거절·반려·차단 거절 모두 같은 종류. 팬이 스스로 취소한 주문에는 보내지 않는다.
    -- 살려 둔 상자가 남았을 때만(바로 닫힌 상자뿐이면 「도착하는 대로 돌려보내 드려요」가 맞지 않는다)
    if new.status in ('rejected', 'expired') and exists (
      select 1 from public.inbound_codes c join public.boxes b on b.id = c.box_id
      where b.order_id = new.id and c.state = 'valid' and c.kept_at is not null and b.missing_at is null
    ) then
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
end $function$;

-- 팬 선물 읽기 — 20261017000002_tracker_report.sql 의 정의 그대로에 send_guide_shown 칸 하나. 반환 꼴이 바뀌어 지우고 다시 만든다
drop function if exists public.my_gifts();
create function public.my_gifts()
 RETURNS TABLE(order_no text, creator_name text, item_kind text, box_count integer, has_electronics_or_metal boolean, status order_status, registered_at timestamp with time zone, approved_at timestamp with time zone, received_at timestamp with time zone, inspection_result text, inspected_at timestamp with time zone, shipped_at timestamp with time zone, expected_arrival_date date, delivery text, fan_tracking_no text, fan_send_ack_at timestamp with time zone, memo_title text, send_guide_shown boolean)
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
         m.title,
         -- approval-signature INV-S9 · approval-cancel INV-AC6: 받는 주소를 본 적이 있는가(승인 중 · 「먼저 보내기」 · 승인 이력) — 「먼저 보내기」 안내를 다시 띄울지 화면이 이 값으로 정한다
         public.order_send_guide_shown(o.id)
  from public.orders o
  join public.creators c on c.id = o.creator_id
  left join public.gift_memos m on m.order_id = o.id
  where o.fan_id = auth.uid() and o.registered_at is not null
  order by o.registered_at desc;
$function$;

revoke all on function public.my_gifts() from public, anon;
grant execute on function public.my_gifts() to authenticated;

-- ── 권한 ─────────────────────────────────────────────────

revoke all on function public.approval_signature_live_guard() from public, anon, authenticated, service_role;
revoke all on function public.approval_cancellations_unlink() from public, anon, authenticated, service_role;
revoke all on function public.order_arrived_box_count(uuid) from public, anon, authenticated, service_role;
revoke all on function public.order_invoice_printed(uuid) from public, anon, authenticated, service_role;
revoke all on function public.order_approval_cancelable(uuid) from public, anon, authenticated, service_role;
revoke all on function public.cancel_approval(uuid, text) from public, anon, authenticated;
revoke all on function public.my_approval_cancel_targets(uuid) from public, anon, authenticated;
grant execute on function public.cancel_approval(uuid, text) to service_role;
grant execute on function public.my_approval_cancel_targets(uuid) to service_role;
