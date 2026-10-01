-- 화면이 읽는 함수와 앱 서버만 부르는 쓰기 함수 (결정 카드 d9).
--
-- 읽기 함수: authenticated 가 부른다. auth.uid() 로 사람을 정하고 보여도 되는 칸만 돌려준다.
--   팬에게 크리에이터행 송장번호(outbound_waybill_no)는 가지 않는다.
-- 쓰기 함수: service_role 만 부른다. 앱 서버가 로그인 확인·입력 검사(parseRegisterInput)·금액 계산(computeCharge)
--   을 마친 뒤 부른다. 브라우저 키(anon·authenticated)로는 실행 권한이 없다.
-- 모든 함수는 search_path 를 비워 두고 이름을 스키마까지 적는다.

-- ── 읽기: 로그인한 사람 ───────────────────────────────────

create function public.my_profile()
returns table (login_id text, nickname text, role public.user_role)
language sql stable security definer set search_path = ''
as $$
  select p.login_id, p.nickname, p.role from public.profiles p where p.id = auth.uid();
$$;

-- ── 읽기: 팬의 선물 ──────────────────────────────────────

-- 결제가 끝나지 않은 주문은 목록에 넣지 않는다. 최신 등록 순.
create function public.my_gifts()
returns table (
  order_no text,
  creator_name text,
  item_kind text,
  box_count integer,
  has_electronics_or_metal boolean,
  status public.order_status,
  registered_at timestamptz,
  approved_at timestamptz,
  received_at timestamptz,
  inspection_result text,
  inspected_at timestamptz,
  shipped_at timestamptz,
  expected_arrival_date date,
  delivery text,
  fan_tracking_no text
)
language sql stable security definer set search_path = ''
as $$
  select o.order_no, c.name, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal, o.status, o.registered_at, o.approved_at, o.received_at,
         o.inspection_result, o.inspected_at, o.shipped_at, o.expected_arrival_date, o.delivery, o.fan_tracking_no
  from public.orders o
  join public.creators c on c.id = o.creator_id
  where o.fan_id = auth.uid() and o.status <> 'pending_payment'
  order by o.registered_at desc;
$$;

create function public.my_gift(p_order_no text)
returns table (
  order_no text,
  creator_name text,
  item_kind text,
  box_count integer,
  has_electronics_or_metal boolean,
  status public.order_status,
  registered_at timestamptz,
  approved_at timestamptz,
  received_at timestamptz,
  inspection_result text,
  inspected_at timestamptz,
  shipped_at timestamptz,
  expected_arrival_date date,
  delivery text,
  fan_tracking_no text
)
language sql stable security definer set search_path = ''
as $$
  select g.* from public.my_gifts() g where g.order_no = p_order_no;
$$;

-- ── 읽기: 크리에이터에게 온 승인 요청 ─────────────────────

-- 로그인한 사람이 크리에이터 계정일 때만 행이 나온다. 열린 요청만, 오래 기다린 것부터.
-- 승인할 수 없는 상태(INV-S6)와 검수 반송된 주문은 빠진다. 팬의 송장번호·결제 정보는 넣지 않는다.
create function public.my_approval_requests()
returns table (
  request_id text,
  order_no text,
  fan_nickname text,
  item_kind text,
  box_count integer,
  has_electronics_or_metal boolean,
  registered_at timestamptz,
  received_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.request_id, o.order_no, f.nickname, o.item_kind,
         (select count(*)::integer from public.boxes b where b.order_id = o.id),
         o.has_electronics_or_metal, o.registered_at, o.received_at
  from public.approval_requests r
  join public.orders o on o.id = r.order_id
  join public.creators c on c.id = o.creator_id
  join public.profiles f on f.id = o.fan_id
  where c.profile_id = auth.uid()
    and r.status = 'waiting'
    and o.approved_at is null
    and o.status in ('registered', 'received', 'labeled', 'inspected')
    and o.inspection_result is distinct from 'returned'
  order by o.registered_at asc;
$$;

revoke all on function public.my_profile() from public, anon;
revoke all on function public.my_gifts() from public, anon;
revoke all on function public.my_gift(text) from public, anon;
revoke all on function public.my_approval_requests() from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.my_gifts() to authenticated;
grant execute on function public.my_gift(text) to authenticated;
grant execute on function public.my_approval_requests() to authenticated;

-- ── 쓰기(앱 서버 전용): 선물 등록 = 주문 + 상자 + 결제 대기 ───

-- 금액 칸은 앱 서버가 서버 요금표로 계산해 넘긴다(INV-M1). 세 칸 합계는 표 제약이 다시 막는다(INV-M7).
create function public.register_order(
  p_fan_id uuid,
  p_creator_id uuid,
  p_order_no text,
  p_item_kind text,
  p_has_electronics_or_metal boolean,
  p_tiers public.parcel_tier[],
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_fan_id and role = 'fan') then
    raise exception '팬 계정이 아니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal)
  values (p_order_no, p_fan_id, p_creator_id, p_item_kind, p_has_electronics_or_metal)
  returning id into v_order_id;

  insert into public.boxes (order_id, seq, declared_tier)
  select v_order_id, t.ord::smallint, t.tier
  from unnest(p_tiers) with ordinality as t(tier, ord);

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

-- ── 쓰기(앱 서버 전용): 결제 승인 권리 얻기(INV-M5) ─────────

-- 결제 대기 → 승인 중 전환은 한 요청만 성공한다. 조건부 갱신 한 문장이라 동시에 와도 하나만 true.
create function public.claim_payment(p_toss_order_id text)
returns boolean
language sql security definer set search_path = ''
as $$
  with claimed as (
    update public.payments set status = 'confirming'
    where toss_order_id = p_toss_order_id and status = 'pending'
    returning 1
  )
  select exists (select 1 from claimed);
$$;

-- ── 쓰기(앱 서버 전용): 결제 결과 반영 ─────────────────────

-- done 이면 같은 트랜잭션에서 주문을 「등록」으로 넘기고 승인 요청을 만든다.
-- 서명 원문은 앱 서버가 buildSigningPayload 로 만든다(INV-S1 — 원문 규칙의 정본은 한 곳).
-- 이미 끝난 결제(done·failed)는 아무것도 바꾸지 않는다.
create function public.settle_payment(
  p_toss_order_id text,
  p_status public.payment_status,
  p_payment_key text,
  p_request_id text,
  p_payload text,
  p_requested_at timestamptz
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments;
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

    insert into public.approval_requests (request_id, order_id, payload, created_at)
    values (p_request_id, v_payment.order_id, p_payload, p_requested_at);
  end if;
  return true;
end $$;

-- ── 쓰기(앱 서버 전용): 승인 처리 — 승인 상태를 바꾸는 유일한 입구(INV-S7) ──

-- 서명 검증(INV-S2~S4)은 앱 서버가 evaluateApproval 로 마친 뒤 부른다.
-- 결과: approved = 이번에 승인함 / already = 이미 승인된 요청(아무것도 안 바꿈, INV-S5)
--       not_approvable = 열린 요청이 아니거나 주문이 승인 불가 상태(INV-S6) / not_found
create function public.approve_request(p_request_id text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.approval_requests;
  v_now timestamptz := now();
begin
  select * into v_req from public.approval_requests where request_id = p_request_id for update;
  if not found then
    return 'not_found';
  end if;
  if v_req.status = 'approved' then
    return 'already';
  end if;
  if v_req.status <> 'waiting' or not exists (
    select 1 from public.orders o
    where o.id = v_req.order_id
      and o.approved_at is null
      and o.status in ('registered', 'received', 'labeled', 'inspected')
      and o.inspection_result is distinct from 'returned'
  ) then
    return 'not_approvable';
  end if;

  perform set_config('fankkuk.approving', 'on', true);
  update public.approval_requests set status = 'approved', decided_at = v_now where id = v_req.id;
  update public.orders set approved_at = v_now where id = v_req.order_id;
  perform set_config('fankkuk.approving', '', true);
  return 'approved';
end $$;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_payment(text) from public, anon, authenticated;
revoke all on function public.settle_payment(text, public.payment_status, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.approve_request(text) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer) to service_role;
grant execute on function public.claim_payment(text) to service_role;
grant execute on function public.settle_payment(text, public.payment_status, text, text, text, timestamptz) to service_role;
grant execute on function public.approve_request(text) to service_role;

-- 트리거 함수는 아무도 직접 부를 일이 없다
revoke all on function public.decrypt_log_append_only() from public, anon, authenticated;
revoke all on function public.approval_request_requires_payment() from public, anon, authenticated;
revoke all on function public.guard_approval_change() from public, anon, authenticated;
revoke all on function public.guard_approval_insert() from public, anon, authenticated;
