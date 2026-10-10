import os, sys
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fndefs')
out_path = sys.argv[1]


def fn(name):
    return open(os.path.join(D, name + '.sql'), encoding='utf-8').read().strip()


def rep(s, old, new):
    assert s.count(old) == 1, old[:100]
    return s.replace(old, new)


head = """-- 2026-10-10 늦게 오는 상자 — 정책 문제집 메모 B8·B9·C10·D10 (DECISIONS 2026-10-10 A~C).
-- 스펙: payment INV-M8·M9·M16·M17·M18 · inbound-address-code INV-C3 · office-workflow INV-W10 · decline-block INV-D3 · notifications INV-N17 · reverse-gift INV-R11.
--
-- 팬 선물: 받는 주소를 본 적이 있는 주문(승인됨 · 「먼저 보내기」 누름 · 도착한 상자 있음)이 끝나면(거절·반려·취소) 안 온 상자의 6자리를 살려 둔다.
--   주문 환불에 그 상자 금액 − 배송비 칸을 먼저 넣고(배송비 칸만 남겨 둠), 늦게 오면 그 주문 상자로 입고 → 반송(더 돌려줄 것 없음),
--   살려 둔 때부터 168시간 안에 안 오면 자동 처리(또는 그 전에 대표)가 닫는다 — 상자 환불 = 남겨 둔 배송비 칸.
--   입고 뒤 취소(대표)는 검수에 걸린 상자가 있어도 받는다 — 걸린 상자 0, 나머지 도착한 상자는 상자 금액 − 검수비 − 배송비.
-- 역조공 몫: 받지 않음·기한 지남이 되면 6자리를 살려 두고 환불을 미룬다(몫마다 환불이 하나라 먼저 일부를 돌려주지 않는다).
--   168시간 안에 오면 입고 → 반송, 환불 = 몫 금액 − 배송비. 안 오면 자동 처리가 6자리를 무효로 하고 환불 = 몫 금액.
--
-- 1) inbound_void_for_order — 살려 두는 갈래를 넓힘(안내 줄은 거절·반려만, 취소는 안내 없음)
-- 2) inbound_void_for_share — 받지 않음·기한 지남은 살려 둠, 취소는 지금처럼 무효
-- 3) refund_due_of_payment — 끝난 주문은 상자마다 정한 몫의 합
-- 4) refund_due_of_box — 닫힌 상자만: 살려 둔 상자는 배송비 칸, 진행 중 주문의 닫힌 상자는 상자 금액
-- 5) refund_due_of_share — 살려 둔 6자리가 아직 유효하면 환불을 정하지 않는다
-- 6) admin_payment_rows — 상자 줄은 닫힌 상자만(늦게 온 상자 줄 'late_box' 는 더 생기지 않는다 — 상자 환불이 없다)
-- 7) office_close_kept_box(상자) — 살려 둔 상자 닫기의 몸통(잠금 순서는 입고와 같다). admin_close_pending_box 는 대표 판정 뒤 이것을 부른다
-- 8) admin_pending_boxes · admin_close_pending_box — 취소된 주문도
-- 9) admin_cancel_received_gift — 검수에 걸린 상자가 있어도 취소한다
-- 10) office_run_expiry — 9단계: 살려 둔 지 168시간 지난 상자·몫 닫기(kept_closed)
-- 11) my_share_boxes — 받지 않음·기한 지남·취소된 몫의 살려 둔 6자리는 크리에이터 화면에 내주지 않는다(reverse-gift INV-R14)

"""

# 1) order trigger
void_order = """create or replace function public.inbound_void_for_order()
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
    -- 보낸 팬에게 안내 한 번(notifications INV-N17) — 거절·반려·차단 거절 모두 같은 종류. 팬이 스스로 취소한 주문에는 보내지 않는다
    if found and new.status in ('rejected', 'expired') then
      perform public.notification_enqueue('gift_pending_box', new.id, null, 1::smallint, new.fan_id, now());
    end if;
    return null;
  end if;

  update public.inbound_codes c
  set state = 'void', voided_at = now()
  from public.boxes b
  where b.order_id = new.id and c.box_id = b.id and c.state = 'valid';
  return null;
end $$;
"""

void_share = """create or replace function public.inbound_void_for_share()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- reverse-gift INV-R11 (2026-10-10): 받지 않음·기한 지남은 크리에이터가 이미 보냈을 수 있어(결제 직후 받는 주소가 보인다) 6자리를 살려 둔다.
  -- 취소는 지금처럼 무효.
  if new.cancelled_at is null and new.reply in ('declined', 'expired') then
    update public.inbound_codes c
    set kept_at = now()
    where c.share_id = new.id and c.state = 'valid' and c.kept_at is null;
    return null;
  end if;
  update public.inbound_codes c
  set state = 'void', voided_at = now()
  where c.share_id = new.id and c.state = 'valid';
  return null;
end $$;
"""

refund_payment = """create or replace function public.refund_due_of_payment(p_payment_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
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
    -- 끝난 주문의 차액 결제: 취소는 그 결제의 검수비·배송비 칸, 거절·반려는 배송비 칸을 뺀다(그대로)
    when o.status = 'canceled' then greatest(p.amount_krw - p.inspection_fee_krw - p.shipping_fee_krw, 0)
    when o.status in ('rejected', 'expired') then p.amount_krw - p.shipping_fee_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    else null
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
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
        -- 검수에 걸림(반송·보관·중형 초과 실측): 검수 불합격 줄 — 상품 대금 칸만인데 상자에는 그 칸이 없다(0)
        when b.measured_tier = 'oversize'
             or exists (select 1 from public.office_parcels x join public.office_inspections i on i.parcel_id = x.id
                        where x.box_id = b.id and i.outcome in ('return', 'hold')) then 0
        -- 입고 뒤 취소(INV-M17): 검수비·배송비 칸을 뺀다
        when o.status = 'canceled' then b.price_krw - b.inspection_fee_krw - b.shipping_fee_krw
        -- 입고 뒤 거절·반려: 배송비 칸을 뺀다
        else b.price_krw - b.shipping_fee_krw
      end
      -- 받는 주소를 본 적이 없어 올 수 없는 상자: 그 상자 금액 전액
      else b.price_krw
    end), 0)::integer as ended_sum
    from public.boxes b
    where b.order_id = o.id
  ) c
  where p.id = p_payment_id;
$$;
"""

refund_box = """create or replace function public.refund_due_of_box(p_box_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  -- 상자 환불은 「도착하지 않음」으로 닫힌 상자에만(INV-M9, 2026-10-10)
  select case
    when p.status <> 'done' or b.missing_at is null then null
    -- 살려 둔 상자가 닫힘(INV-M18 ③): 남겨 둔 배송비 칸 — 상자 금액 − 배송비 칸은 주문 환불이 이미 맡았다
    when exists (select 1 from public.inbound_codes k where k.box_id = b.id and k.kept_at is not null) then b.shipping_fee_krw
    -- 입고 없이 끝났고 살려 둔 상자도 없는 주문은 주문 환불이 결제 금액 전액을 맡는다
    when o.status in ('rejected', 'expired', 'canceled') and o.received_at is null
         and not exists (select 1 from public.boxes x join public.inbound_codes k on k.box_id = x.id
                         where x.order_id = o.id and k.kept_at is not null) then null
    -- 진행 중 주문에서 30일 뒤 닫힌 상자(INV-W10): 택배·검수를 하지 않았으므로 그 상자 금액 전액
    else b.price_krw
  end
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.payments p on p.order_id = o.id and p.kind = 'initial'
  where b.id = p_box_id;
$$;
"""

refund_share = """create or replace function public.refund_due_of_share(p_share_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select case
    when d.status <> 'done' or s.shipped_at is not null or s.reply not in ('declined', 'expired') then null
    -- 입고 뒤(살려 둔 6자리로 늦게 온 상자 포함): 반송 택배비를 뺀 금액
    when s.received_at is not null then s.amount_krw - s.shipping_fee_krw
    -- 살려 둔 6자리가 아직 유효하면(168시간 안) 환불을 정하지 않는다(reverse-gift INV-R11, 2026-10-10)
    when exists (select 1 from public.inbound_codes c where c.share_id = s.id and c.kept_at is not null and c.state = 'valid') then null
    else s.amount_krw
  end
  from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
  where s.id = p_share_id;
$$;
"""

# 6) admin_payment_rows
apr = fn('admin_payment_rows')
apr = rep(apr, """    where b.missing_at is not null
       or (exists (select 1 from public.inbound_codes c where c.box_id = b.id and c.kept_at is not null)
           and exists (select 1 from public.office_parcels x where x.box_id = b.id and x.state <> 'awaiting'))""",
          """    -- 상자 환불은 닫힌 상자에만 있다(INV-M9, 2026-10-10) — 늦게 온 상자 줄은 더 생기지 않는다
    where b.missing_at is not null""")
apr = apr.replace("CREATE OR REPLACE FUNCTION", "create or replace function") + ";\n"

# 7) close kept box body + admin wrapper
close_kept = """create or replace function public.office_close_kept_box(p_box_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order public.orders;
  v_box public.boxes;
  c public.inbound_codes;
  t public.office_parcels;
begin
  select b.order_id into v_order_id from public.boxes b where b.id = p_box_id;
  if v_order_id is null then
    return false;
  end if;
  -- 잠금 순서(office_close_missing_boxes·입고와 같다): 상자 줄 → 승인 요청 → 주문 → 6자리 → 상자 작업 줄
  perform 1 from public.boxes b where b.order_id = v_order_id order by b.seq for update;
  perform 1 from public.approval_requests r where r.order_id = v_order_id for key share;
  select * into v_order from public.orders o where o.id = v_order_id for update;
  select * into v_box from public.boxes b where b.id = p_box_id;
  select * into c from public.inbound_codes x where x.box_id = p_box_id for update;
  select * into t from public.office_parcels x where x.box_id = p_box_id for update;
  -- 잠근 뒤 다시 본다: 끝난 주문 · 살려 둔 유효한 6자리 · 닫히지 않음 · 아직 입고 전(송장번호만 등록한 줄은 아직 안 온 것)
  if v_order.status not in ('rejected', 'expired', 'canceled')
     or c.id is null or c.kept_at is null or c.state <> 'valid'
     or v_box.missing_at is not null
     or (t.id is not null and t.state <> 'awaiting') then
    return false;
  end if;
  update public.boxes set missing_at = now() where id = p_box_id;
  update public.inbound_codes set state = 'void', voided_at = now() where id = c.id;
  return true;
end $$;

revoke all on function public.office_close_kept_box(uuid) from public, anon, authenticated, service_role;

create or replace function public.admin_close_pending_box(p_box_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception '도착하지 않은 상자는 대표만 닫는다' using errcode = '42501';
  end if;
  if not public.office_close_kept_box(p_box_id) then
    raise exception '닫을 수 있는 상자가 아니다' using errcode = 'P0002';
  end if;
end $$;
"""

pend = fn('admin_pending_boxes')
pend = rep(pend, "    and o.status in ('rejected', 'expired')", "    and o.status in ('rejected', 'expired', 'canceled')")
pend = pend.replace("CREATE OR REPLACE FUNCTION", "create or replace function") + ";\n"

# 9) admin cancel
cancel = fn('admin_cancel_received_gift')
cancel = rep(cancel, """  -- 검수에 걸린 상자가 하나라도 있으면 취소하지 않는다 — 그 주문은 검수 불합격 반송으로만 끝난다(INV-M17, 카드 d53)
  if exists (select 1 from public.boxes b
             join public.office_parcels x on x.box_id = b.id
             join public.office_inspections i on i.parcel_id = x.id
             where b.order_id = v_order_id and i.outcome = 'return') then
    raise exception '검수에 걸린 상자가 있는 주문은 취소하지 않는다' using errcode = 'P0061';
  end if;
""", """  -- 검수에 걸린 상자가 있어도 취소한다 — 그 상자는 환불에서 0(검수 불합격 줄)이라 차감을 피하지 못한다(INV-M17, 2026-10-10 B9)
""")
cancel = cancel.replace("CREATE OR REPLACE FUNCTION", "create or replace function") + ";\n"

# 10) expiry
exp = fn('office_run_expiry')
exp = rep(exp, "  v_box_missing_alerts integer;\n", "  v_box_missing_alerts integer;\n  v_kept_closed integer := 0;\n  v_box uuid;\n  v_kept_shares integer;\n")
exp = rep(exp, """  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로""", """  -- 9) 살려 둔 지 168시간 지난 상자·몫(payment INV-M18 ③ · reverse-gift INV-R11): 팬 선물 상자는 닫고(상자 환불 = 남겨 둔 배송비 칸),
  --    역조공 몫은 6자리를 무효로(환불 = 몫 금액). 상자는 상자마다 닫기 함수를 부른다 — 입고와 같은 잠금 순서로 잡고 다시 보므로 겹쳐도 하나만.
  --    몫의 6자리는 조건부 갱신 한 문장 — 입고가 먼저 사용됨으로 바꿨으면 다시 보고 건너뛴다. 두 번 돌려도 한 번.
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

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로""")
exp = rep(exp, "'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts);",
          "'boxes_missing', v_boxes_missing, 'box_missing_alerts', v_box_missing_alerts, 'kept_closed', v_kept_closed);")
exp = exp.replace("CREATE OR REPLACE FUNCTION", "create or replace function") + ";\n"

share_boxes = fn('my_share_boxes')
share_boxes = rep(share_boxes, "         (select c.code from public.inbound_codes c where c.share_id = s.id and c.state = 'valid'),",
                  "         -- 받지 않음·기한 지남·취소된 몫은 살려 둔 6자리도 내주지 않는다(reverse-gift INV-R14)\n"
                  "         case when s.reply not in ('declined', 'expired') and s.cancelled_at is null\n"
                  "              then (select c.code from public.inbound_codes c where c.share_id = s.id and c.state = 'valid') end,")
share_boxes = share_boxes.replace("CREATE OR REPLACE FUNCTION", "create or replace function") + ";\n"

body = "\n".join([head, "-- ── 1) ──", void_order, "-- ── 2) ──", void_share, "-- ── 3) ──", refund_payment, "-- ── 4) ──", refund_box,
                  "-- ── 5) ──", refund_share, "-- ── 6) ──", apr, "-- ── 7) ──", close_kept, "-- ── 8) ──", pend, "-- ── 9) ──", cancel,
                  "-- ── 10) ──", exp, "-- ── 11) ──", share_boxes, "notify pgrst, 'reload schema';\n"])
open(out_path, 'w', encoding='utf-8').write(body)
print("written", len(body))
