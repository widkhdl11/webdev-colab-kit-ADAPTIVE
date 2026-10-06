-- 차액 결제 (payment INV-M2·M3·M5·M7·M8·M11·M12·M13, admin-console INV-K1, office-workflow INV-W6).
--
-- 지금까지 결제 표의 'difference'(차액) 줄은 표 정의와 읽기에만 있었고 만드는 함수가 없었다. 이 파일이 흐름을 잇는다:
--   1) 운영자가 검수 때 상자의 실측 구간을 기록한다(office_record_measurement, 운영자만 — K1).
--      실측이 신고보다 크면 DB 가 요금표로 칸마다 차를 계산해 차액 결제 대기 줄을 만든다(M11·M7). 상자마다 한 번.
--      실측이 대형을 넘으면 차액이 아니라 검수 불합격 — 그 상자는 나갈 수 없어 검수 스캔에서 반송 대기로 간다.
--   2) 팬이 선물 상세에서 「차액 결제하기」를 누르면 결제창에 넘길 번호·금액을 받는다(prepare_difference_payment, 팬 본인만).
--      결제사가 실패로 끝낸 차액은 새 결제 번호로 다시 낼 수 있다(상자당 차액 줄은 여전히 하나).
--   3) 성공 주소 → 앱 서버가 대조·승인 권리·승인 API·응답 판정(M2·M3·M5)을 첫 결제와 같은 흐름으로 하고,
--      승인 권리(claim_difference_payment)·결과(settle_difference_payment)는 앱 서버 키 전용이다.
--   4) 차액이 끝나기 전에는 송장 출력·주소 열기가 막힌다(M12) — 출고 조건 함수가 이미 미납 차액을 본다(여기서 바꾸지 않는다).
--   5) 요청 뒤 168시간 미납이면 7일 처리(office_run_expiry, W6)가 그 차액 줄에 기한 지남을 적고(조건부 갱신 한 문장),
--      그 주문의 상자는 나갈 수 없게 되어 검수 완료 상자는 반송 대기로 간다(M13). 결제 중(승인 권리를 얻은) 차액은 건드리지 않는다.
--   6) 환불: 차액 미납 반송은 첫 결제의 배송비 칸만(M8 표).
--
-- 오류 꼴: 42501 운영자 아님 · 22023 입력 꼴 · P0002 없음(남의 것 포함 — 같은 답) · 55000 지금 단계에서 할 수 없음
--          · P0022 기한 지남·반송 중 · P0023 이미 냄 · P0024 결제 처리 중

-- ── 표 ──────────────────────────────────────────────────

-- 7일 미납으로 닫힌 차액 줄. 차액 줄에만, 결제 완료가 아닌 줄에만 적힌다.
alter table public.payments add column if not exists expired_at timestamptz;
alter table public.payments add constraint payments_expired_only_unpaid_difference
  check (expired_at is null or (kind = 'difference' and status <> 'done'));

-- ── 공용 판정 ────────────────────────────────────────────

-- 구간의 크기 순서. 표의 enum 순서는 구간이 더해진 순서라 크기 순서와 다르다.
create function public.parcel_tier_rank(p public.parcel_tier)
returns integer
language sql immutable set search_path = ''
as $$
  select case p when 'small' then 1 when 'medium' then 2 when 'large' then 3 when 'oversize' then 4 end;
$$;

-- W3·M12: 출고 조건에 「실측이 대형을 넘지 않음」을 더한다(검수 불합격 상자는 나가지 않는다). 나머지는 그대로.
create or replace function public.office_parcel_shippable(p_parcel public.office_parcels)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when p_parcel.box_id is not null then exists (
      select 1 from public.boxes b join public.orders o on o.id = b.order_id
      where b.id = p_parcel.box_id
        and o.approved_at is not null
        and o.status not in ('rejected', 'expired', 'canceled')
        and b.measured_tier is distinct from 'oversize'
        and exists (select 1 from public.approval_requests r where r.order_id = o.id and r.status = 'approved')
        and not exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done')
    )
    else exists (
      select 1 from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id
      where s.id = p_parcel.share_id and d.status = 'done' and s.reply = 'accepted'
        and s.cancelled_at is null and s.returned_at is null
    )
  end;
$$;

-- 나갈 수 없는 상자: 거절·반려·취소된 주문 + 실측 대형 초과(M11 검수 불합격) + 7일 미납으로 닫힌 차액이 있는 주문(M13).
create or replace function public.office_parcel_dead(p_parcel public.office_parcels)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when p_parcel.box_id is not null then exists (
      select 1 from public.boxes b join public.orders o on o.id = b.order_id
      where b.id = p_parcel.box_id
        and (o.status in ('rejected', 'expired', 'canceled')
             or b.measured_tier = 'oversize'
             or exists (select 1 from public.payments d
                        where d.order_id = o.id and d.kind = 'difference' and d.expired_at is not null and d.status <> 'done'))
    )
    else exists (
      select 1 from public.revgift_shares s
      where s.id = p_parcel.share_id and (s.reply in ('declined', 'expired') or s.cancelled_at is not null)
    )
  end;
$$;

-- ── 실측 기록 (운영자 · M11) ─────────────────────────────

-- 결과: {"result":"difference","amount_krw":n} · {"result":"none"} · {"result":"inspection_failed"}
-- 입고 뒤·검수 스캔 전(입고 완료·라벨 부착)에만, 상자마다 한 번. 요금은 기록하는 순간의 요금표로 계산한다.
create function public.office_record_measurement(p_qr text, p_tier text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  v_box public.boxes;
  v_order public.orders;
  v_tier public.parcel_tier;
  v_declared public.tier_prices;
  v_measured public.tier_prices;
  v_amount integer;
  v_shipping integer;
  v_inspection integer;
  v_service integer;
begin
  if not public.is_operator() then
    raise exception '운영자만 처리한다' using errcode = '42501';
  end if;
  if p_tier is null or p_tier not in ('small', 'medium', 'large', 'oversize') then
    raise exception '실측 구간 값이 아니다' using errcode = '22023';
  end if;
  v_tier := p_tier::public.parcel_tier;
  v := public.office_lock_qr(p_qr);
  if v.box_id is null then
    raise exception '실측 차액은 팬 선물 상자만' using errcode = '22023';
  end if;
  if v.state not in ('received', 'labeled') then
    raise exception '지금 단계에서 할 수 없다' using errcode = '55000';
  end if;
  select * into v_box from public.boxes where id = v.box_id for update;
  if v_box.measured_tier is not null then
    raise exception '실측은 상자마다 한 번만 기록한다' using errcode = '55000';
  end if;
  select * into v_order from public.orders where id = v_box.order_id;

  update public.boxes set measured_tier = v_tier where id = v_box.id;

  if v_tier = 'oversize' then
    return jsonb_build_object('result', 'inspection_failed');
  end if;
  if public.parcel_tier_rank(v_tier) <= public.parcel_tier_rank(v_box.declared_tier)
     or v_order.status in ('rejected', 'expired', 'canceled') then
    return jsonb_build_object('result', 'none');
  end if;

  select * into v_declared from public.tier_prices where tier = v_box.declared_tier;
  select * into v_measured from public.tier_prices where tier = v_tier;
  v_amount := v_measured.price_krw - v_declared.price_krw;
  v_shipping := v_measured.carrier_cost_krw - v_declared.carrier_cost_krw;
  v_inspection := v_measured.inspection_fee_krw - v_declared.inspection_fee_krw;
  v_service := v_amount - v_shipping - v_inspection;
  if v_amount <= 0 then
    return jsonb_build_object('result', 'none');
  end if;
  -- 요금표가 구간마다 칸별로 커지지 않으면(기본 서비스료 칸이 줄면) 차액 칸이 음수가 된다 — 만들지 않고 거부한다
  if v_shipping < 0 or v_inspection < 0 or v_service < 0 then
    raise exception '요금표의 칸 차이가 음수다' using errcode = '22023';
  end if;

  insert into public.payments (order_id, kind, box_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order.id, 'difference', v_box.id, 'diff_' || replace(gen_random_uuid()::text, '-', ''), v_amount, 0, v_service, v_inspection, v_shipping);
  return jsonb_build_object('result', 'difference', 'amount_krw', v_amount);
end $$;

-- ── 팬: 차액 읽기 · 결제 준비 ────────────────────────────

-- 내 주문의 상자별 차액 요청. 남의 주문이면 빈 결과. 결제 번호는 주지 않는다(결제 준비가 준다).
create function public.my_difference_payments(p_order_no text)
returns table (
  box_id uuid, box_seq smallint, declared_tier text, measured_tier text, amount_krw integer, status text, due_at timestamptz, expired boolean
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.seq, b.declared_tier::text, b.measured_tier::text, p.amount_krw, p.status::text,
         p.created_at + interval '168 hours',
         p.expired_at is not null or now() >= p.created_at + interval '168 hours'
  from public.payments p
  join public.boxes b on b.id = p.box_id
  join public.orders o on o.id = p.order_id
  where p.kind = 'difference' and o.order_no = p_order_no and o.fan_id = auth.uid()
  order by b.seq;
$$;

-- 결제창에 넘길 결제 번호·금액. 팬 본인 상자만. 실패로 끝난 차액은 새 번호로 다시 연다.
create function public.prepare_difference_payment(p_box_id uuid)
returns table (toss_order_id text, amount_krw integer, order_no text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_order public.orders;
  v_pay public.payments;
  v_state public.office_state;
begin
  select o.* into v_order from public.orders o join public.boxes b on b.order_id = o.id where b.id = p_box_id;
  if v_order.id is null or v_order.fan_id is distinct from auth.uid() then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select p.* into v_pay from public.payments p where p.box_id = p_box_id and p.kind = 'difference' for update;
  if v_pay.id is null then
    raise exception '차액을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_pay.status = 'done' then
    raise exception '이미 낸 차액이다' using errcode = 'P0023';
  end if;
  if v_pay.status = 'confirming' then
    raise exception '결제를 처리하고 있다' using errcode = 'P0024';
  end if;
  select x.state into v_state from public.office_parcels x where x.box_id = p_box_id;
  -- M13: 기한(요청 + 168시간)이 지났으면 7일 처리 전이라도 받지 않는다 — 사람 처리 쪽의 기한 확인(W6)
  if v_pay.expired_at is not null or now() >= v_pay.created_at + interval '168 hours'
     or v_order.status in ('rejected', 'expired', 'canceled')
     or v_state in ('held', 'return_waiting', 'return_printed', 'returned', 'label_printed', 'shipped') then
    raise exception '차액을 낼 수 없는 상태다' using errcode = 'P0022';
  end if;
  if v_pay.status = 'failed' then
    update public.payments p
    set toss_order_id = 'diff_' || replace(gen_random_uuid()::text, '-', ''), status = 'pending', payment_key = null, settled_at = null
    where p.id = v_pay.id
    returning p.* into v_pay;
  end if;
  return query select v_pay.toss_order_id, v_pay.amount_krw, v_order.order_no;
end $$;

-- ── 앱 서버 키: 승인 권리 · 결과 ─────────────────────────

-- M5: 결제 대기 → 승인 중, 한 요청만. M13·W6: 기한 전이고 7일 처리가 닫지 않은 차액만 — 7일 처리와 같은 줄을 조건부로 갱신하므로
-- 둘이 겹치면 먼저 잠근 쪽만 반영된다.
create function public.claim_difference_payment(p_toss_order_id text)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.payments p set status = 'confirming'
    where p.toss_order_id = p_toss_order_id and p.kind = 'difference' and p.status = 'pending'
      and p.expired_at is null and now() < p.created_at + interval '168 hours'
      and exists (select 1 from public.orders o where o.id = p.order_id and o.status not in ('rejected', 'expired', 'canceled'))
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- 완료는 승인 중인 줄만, 실패는 대기·승인 중인 줄만. 이미 끝난 줄은 바꾸지 않는다. 바꿨으면 true.
create function public.settle_difference_payment(p_toss_order_id text, p_status public.payment_status, p_payment_key text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('done', 'failed') then
    raise exception 'done 또는 failed 만' using errcode = '22023';
  end if;
  update public.payments
  set status = p_status,
      payment_key = case when p_status = 'done' then p_payment_key end,
      settled_at = now()
  where toss_order_id = p_toss_order_id and kind = 'difference'
    and (status = 'confirming' or (p_status = 'failed' and status = 'pending'));
  return found;
end $$;

-- ── 7일 자동 처리 (W6) — 3) 차액 미납만 바뀐다 ───────────

create or replace function public.office_run_expiry(p_order_no text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_gifts integer;
  v_unmatched integer;
  v_differences integer;
  v_revgifts integer;
begin
  if not (public.is_operator() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception '운영자만 돌린다' using errcode = '42501';
  end if;

  -- 1) 승인하지 않은 팬 선물: 결제 완료 + 168시간 → 반려
  with expired as (
    update public.approval_requests r
    set status = 'expired', decided_at = now()
    from public.orders o
    where o.id = r.order_id and r.status = 'waiting' and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
      and (p_order_no is null or o.order_no = p_order_no)
    returning r.order_id
  )
  update public.orders o set status = 'expired'
  from expired e where o.id = e.order_id and o.approved_at is null;
  get diagnostics v_gifts = row_count;

  -- 2) 매칭 안 된 미확인 입고: 도착 + 168시간
  update public.office_unmatched
  set expired_at = now()
  where matched_parcel_id is null and expired_at is null and arrived_at <= now() - interval '168 hours'
    and p_order_no is null;
  get diagnostics v_unmatched = row_count;

  -- 3) 차액 요청 뒤 168시간 미납(payment INV-M13): 차액 줄에 기한 지남을 적는다. 결제 중(confirming)·완료 줄은 건드리지 않는다.
  --    그 주문의 상자는 나갈 수 없게 되고(office_parcel_dead), 아래에서 검수 완료 상자가 반송 대기로 간다.
  update public.payments d
  set expired_at = now()
  where d.kind = 'difference' and d.status in ('pending', 'failed') and d.expired_at is null
    and d.created_at <= now() - interval '168 hours'
    and (p_order_no is null or d.order_id = (select o.id from public.orders o where o.order_no = p_order_no));
  get diagnostics v_differences = row_count;

  -- 4) 역조공 받기 기한(reverse-gift INV-R10)
  if p_order_no is null then
    v_revgifts := public.expire_revgifts();
  else
    -- 몫 하나만: expire_revgifts 와 같은 조건(결제 완료 + 168시간, 아직 답이 없음)
    update public.revgift_shares s
    set reply = 'expired', replied_at = now()
    from public.revgift_sends d
    where d.id = s.send_id and d.status = 'done' and s.reply = 'waiting'
      and now() >= public.revgift_deadline(d.settled_at) and s.order_no = p_order_no;
    get diagnostics v_revgifts = row_count;
  end if;

  -- 나갈 수 없게 된 상자 중 검수 완료인 것은 반송 대기로(반려된 팬 선물 · 차액 미납 · 받지 않은 역조공)
  update public.office_parcels p
  set state = 'return_waiting'
  where p.state = 'inspected' and public.office_parcel_dead(p)
    and (p_order_no is null
         or exists (select 1 from public.boxes b join public.orders o on o.id = b.order_id where b.id = p.box_id and o.order_no = p_order_no)
         or exists (select 1 from public.revgift_shares s where s.id = p.share_id and s.order_no = p_order_no));

  perform public.office_sync_order(o.id)
  from public.orders o
  where (p_order_no is null or o.order_no = p_order_no)
    and exists (select 1 from public.boxes b join public.office_parcels p on p.box_id = b.id where b.order_id = o.id and p.state = 'return_waiting');

  return jsonb_build_object('gifts', v_gifts, 'unmatched', v_unmatched, 'differences', v_differences, 'revgifts', v_revgifts);
end $$;

-- 자동 처리 현황: 차액 묶음을 7일 처리와 같은 조건(대기·실패, 아직 닫히지 않음, 요청 + 168시간)으로
create or replace function public.admin_expiry_due()
returns table (category text, order_no text, sender_nickname text, receiver_name text, due_at timestamptz, detail text)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select 'gift'::text, o.order_no, f.nickname, c.name, o.registered_at + interval '168 hours', null::text
    from public.orders o
    join public.approval_requests r on r.order_id = o.id and r.status = 'waiting'
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where o.approved_at is null and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.registered_at <= now() - interval '168 hours'
    union all
    select 'revgift', s.order_no, c.name, f.nickname, public.revgift_deadline(d.settled_at), null
    from public.revgift_shares s
    join public.revgift_sends d on d.id = s.send_id and d.status = 'done'
    join public.creators c on c.id = d.creator_id
    join public.profiles f on f.id = s.fan_id
    where s.reply = 'waiting' and now() >= public.revgift_deadline(d.settled_at)
    union all
    select 'difference', o.order_no, f.nickname, c.name, pd.created_at + interval '168 hours',
           '+' || to_char(pd.amount_krw, 'FM999,999,999') || '원'
    from public.payments pd
    join public.orders o on o.id = pd.order_id
    join public.profiles f on f.id = o.fan_id
    join public.creators c on c.id = o.creator_id
    where pd.kind = 'difference' and pd.status in ('pending', 'failed') and pd.expired_at is null
      and pd.created_at <= now() - interval '168 hours'
  ) due
  where public.is_operator()
  order by 5, 2
  limit 500;
$$;

-- ── 환불 금액 (M8 표에 「차액 요청 뒤 7일 미납 반송 → 배송비 칸만」 갈래를 더한다) ──

-- 차액 미납 반송: 진행 중이던 주문에 7일 미납으로 닫힌 차액이 있고, 그 주문에 검수 불합격(실측 대형 초과·검수 반송)이 없을 때 → 배송비 칸만.
-- 검수 불합격이 같이 있으면 팬의 위반 갈래(상품 대금 칸만)를 따른다. 나머지 갈래는 20261005000004 와 같다.
create or replace function public.refund_due_of_payment(p_payment_id uuid)
returns integer
language sql stable security definer set search_path = ''
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
      then p.shipping_fee_krw
    when o.received_at is not null and o.inspection_result = 'returned' then p.goods_krw
    when o.status not in ('rejected', 'expired', 'canceled') then null
    when o.received_at is null then p.amount_krw
    when o.status = 'canceled' then p.shipping_fee_krw
    else p.amount_krw - p.shipping_fee_krw
  end
  from public.payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id;
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.parcel_tier_rank(public.parcel_tier) from public, anon, authenticated;
revoke all on function public.office_parcel_shippable(public.office_parcels) from public, anon, authenticated;
revoke all on function public.office_parcel_dead(public.office_parcels) from public, anon, authenticated;
revoke all on function public.office_record_measurement(text, text) from public, anon;
grant execute on function public.office_record_measurement(text, text) to authenticated;
revoke all on function public.my_difference_payments(text) from public, anon;
grant execute on function public.my_difference_payments(text) to authenticated;
revoke all on function public.prepare_difference_payment(uuid) from public, anon;
grant execute on function public.prepare_difference_payment(uuid) to authenticated;
revoke all on function public.claim_difference_payment(text) from public, anon, authenticated;
grant execute on function public.claim_difference_payment(text) to service_role;
revoke all on function public.settle_difference_payment(text, public.payment_status, text) from public, anon, authenticated;
grant execute on function public.settle_difference_payment(text, public.payment_status, text) to service_role;
