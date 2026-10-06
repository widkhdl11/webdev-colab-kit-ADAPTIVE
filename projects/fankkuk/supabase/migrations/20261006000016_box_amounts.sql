-- 상자마다 결제 시점 금액 저장 + 팬의 결제 금액 읽기 (payment INV-M14, S14·S14b·S14c). 결정 카드 fankkuk-20261001-1-d35.
--
-- 지금까지 상자 금액은 어디에도 저장되지 않았다 — 선물 상세에 금액을 보이려면 지금 요금표로 다시 계산해야 했고,
-- 대표가 요금을 바꾸면 팬 화면에 낸 돈과 다른 금액이 보인다. 그래서:
--   1) 상자 표에 금액 칸(price_krw)을 둔다. 등록 함수가 그 순간의 요금표 값으로 상자마다 적는다.
--   2) 한 주문의 상자 금액 합 = 그 주문의 첫 결제 금액. 상자 금액·첫 결제 금액이 바뀔 때 처리가 끝나는 시점에 DB 가 확인한다.
--      첫 결제 줄이 아직 없을 때(같은 처리 안에서 상자를 먼저 넣는 순간)는 확인하지 않는다 — 결제 줄이 들어오면 그때 확인한다.
--   3) 팬 읽기(my_gift_payment)는 저장한 값만 돌려준다 — 첫 결제 금액·결제 시각·상자별 금액·환불 금액과 상태.
--      칸 나눔(상품 대금·서비스료·검수비·배송비)은 돌려주지 않는다. 상자별 차액은 이미 저장된 차액 결제 줄을
--      my_difference_payments 가 돌려준다(그 함수는 그대로 쓴다).
--
-- 기존 주문 채우기: 스펙은 이미 있는 주문의 상자 금액을 어떻게 채울지 정하지 않았다. 이 파일은 그 주문의 첫 결제 금액을
-- 상자의 신고 구간 요금(지금 요금표) 비율로 나누고, 원 단위 나머지는 마지막 상자에 더한다. 그래서 합은 언제나 첫 결제 금액과 같다.
-- 상자 구간이 모두 같으면(시드는 전부 소형) 결제 금액을 상자 수로 똑같이 나눈 값이 된다.

-- ── 1) 상자 금액 칸 ──────────────────────────────────────

alter table public.boxes add column price_krw integer check (price_krw > 0);

with base as (
  select b.id, b.order_id, b.seq, tp.price_krw as unit,
         sum(tp.price_krw) over (partition by b.order_id) as unit_sum,
         row_number() over (partition by b.order_id order by b.seq desc) as from_last,
         p.amount_krw as paid
  from public.boxes b
  join public.tier_prices tp on tp.tier = b.declared_tier
  join public.payments p on p.order_id = b.order_id and p.kind = 'initial'
),
shares as (
  select id, order_id, from_last, paid, (paid::bigint * unit / unit_sum)::integer as share from base
),
fixed as (
  select s.id,
         s.share + case when s.from_last = 1 then s.paid - sum(s.share) over (partition by s.order_id) else 0 end as amount
  from shares s
)
update public.boxes b set price_krw = f.amount from fixed f where f.id = b.id;

-- 첫 결제 줄이 없는 주문의 상자(없어야 한다)는 지금 요금으로 채운다 — 못 채운 상자가 남으면 아래 not null 이 실패해 파일 전체가 되돌려진다
update public.boxes b set price_krw = tp.price_krw
from public.tier_prices tp
where tp.tier = b.declared_tier and b.price_krw is null;

alter table public.boxes alter column price_krw set not null;

-- 등록 함수 밖에서 금액 없이 넣는 상자(시드)는 넣는 순간의 요금으로 채운다 — 넣는 순간이 곧 등록 순간이다
create function public.boxes_fill_price()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.price_krw is null then
    select tp.price_krw into new.price_krw from public.tier_prices tp where tp.tier = new.declared_tier;
  end if;
  return new;
end $$;

create trigger boxes_fill_price before insert on public.boxes
  for each row execute function public.boxes_fill_price();

-- ── 2) 상자 금액 합 = 첫 결제 금액 (처리 끝에 확인) ──────────

create function public.order_box_amounts_match(p_order_id uuid)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_paid integer;
  v_sum bigint;
begin
  select p.amount_krw into v_paid from public.payments p where p.order_id = p_order_id and p.kind = 'initial';
  if v_paid is null then
    return; -- 결제 줄이 들어올 때 확인한다
  end if;
  select coalesce(sum(b.price_krw), 0) into v_sum from public.boxes b where b.order_id = p_order_id;
  if v_sum <> v_paid then
    raise exception '상자 금액의 합(%)이 결제 금액(%)과 다르다 (INV-M14)', v_sum, v_paid using errcode = '23514';
  end if;
end $$;

create function public.boxes_amounts_check()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.orders o where o.id = new.order_id) then
    perform public.order_box_amounts_match(new.order_id);
  end if;
  return null;
end $$;

create function public.payments_amounts_check()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind = 'initial' then
    perform public.order_box_amounts_match(new.order_id);
  end if;
  return null;
end $$;

create constraint trigger boxes_amounts_match
  after insert or update of price_krw, order_id on public.boxes
  deferrable initially deferred
  for each row execute function public.boxes_amounts_check();

create constraint trigger payments_amounts_match
  after insert or update of amount_krw, order_id, kind on public.payments
  deferrable initially deferred
  for each row execute function public.payments_amounts_check();

revoke all on function public.boxes_fill_price() from public, anon, authenticated;
revoke all on function public.order_box_amounts_match(uuid) from public, anon, authenticated;
revoke all on function public.boxes_amounts_check() from public, anon, authenticated;
revoke all on function public.payments_amounts_check() from public, anon, authenticated;

-- ── 3) 등록 함수: 상자마다 그 순간의 요금을 적는다 ────────────
-- 20261006000002_creator_verification_functions.sql 의 register_order 와 같고, 상자를 넣을 때 금액을 같이 넣는 것만 다르다.
-- 금액은 위에서 결제 금액을 검사한 바로 그 요금표(fan_charge_of 와 같은 표)에서 읽는다 — 같은 처리라 그 사이에 바뀌지 않는다.

create or replace function public.register_order(
  p_fan_id uuid,
  p_creator_id uuid,
  p_order_no text,
  p_item_kind text,
  p_has_electronics_or_metal boolean,
  p_tiers public.parcel_tier[],
  p_toss_order_id text,
  p_goods_krw integer,
  p_service_fee_krw integer,
  p_inspection_fee_krw integer,
  p_shipping_fee_krw integer,
  p_amount_krw integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order_id uuid;
  v_n integer := coalesce(array_length(p_tiers, 1), 0);
  v_role public.user_role;
  c record;
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  -- INV-K3: 등록하는 순간의 요금표로 계산한 금액과 칸마다 같아야 한다. 아니면 요금이 바뀐 것이다 — 다시 계산해 오게 한다.
  select * into c from public.fan_charge_of(p_tiers);
  if c.found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if p_goods_krw <> 0 or p_amount_krw <> c.total or p_shipping_fee_krw <> c.carrier or p_inspection_fee_krw <> c.inspection
     or p_service_fee_krw <> c.total - c.carrier - c.inspection then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_fan_id;
  if v_role is null or v_role not in ('fan', 'creator') then
    raise exception '선물을 보낼 수 있는 계정이 아니다' using errcode = '42501';
  end if;
  -- INV-V12: 받는 크리에이터 행을 공유 잠금 — 이사 신청(같은 행 for no key update)이 끝날 때까지 기다리고, 끝난 뒤의 상태로 판단한다
  perform 1 from public.creators cr where cr.id = p_creator_id for share;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if public.cv_moving(p_creator_id) then
    raise exception '채널 이사 중인 크리에이터라 지금은 선물을 등록할 수 없다' using errcode = 'FKV10';
  end if;
  if v_role = 'creator' then
    if exists (select 1 from public.creators c2 where c2.id = p_creator_id and c2.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
    if not public.creators_follow_either_way(p_fan_id, p_creator_id) then
      raise exception '팔로우가 없는 크리에이터에게는 보낼 수 없다' using errcode = 'P0012';
    end if;
  end if;
  -- INV-D7: 차단 쓰기와 같은 쌍 잠금을 잡고 확인한다 — 이 등록이 끝날 때까지 차단은 줄을 서고, 차단 뒤에는 이 확인이 막는다.
  -- 차단을 말하지 않고 본인 확인 전 크리에이터와 같은 오류를 낸다(카드 d26).
  perform public.lock_sender_pair(p_creator_id, p_fan_id);
  if public.sender_blocked(p_creator_id, p_fan_id) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;

  insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal)
  values (p_order_no, p_fan_id, p_creator_id, p_item_kind, p_has_electronics_or_metal)
  returning id into v_order_id;

  -- INV-M14: 상자마다 등록 순간의 요금(신고 구간)을 적는다. 합은 위에서 검사한 결제 금액과 같다(처리 끝에 DB 가 다시 확인).
  insert into public.boxes (order_id, seq, declared_tier, price_krw)
  select v_order_id, t.ord::smallint, t.tier, tp.price_krw
  from unnest(p_tiers) with ordinality as t(tier, ord)
  join public.tier_prices tp on tp.tier = t.tier;

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer) to service_role;

-- ── 4) 팬의 결제 금액 읽기 ───────────────────────────────

-- 사람 ID 를 받지 않는다 — 로그인 토큰이 확인한 계정이 보낸 주문만(보낸 사람이 크리에이터여도 같다, session-login INV-L3).
-- 첫 결제가 끝난 주문만. 남의 주문·결제 전 주문이면 null. 환불은 결제 완료된 결제 줄(첫 결제·차액)에 걸린 것 전부.
create function public.my_gift_payment(p_order_no text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'paid_krw', p.amount_krw,
    'paid_at', p.settled_at,
    'boxes', (
      select jsonb_agg(jsonb_build_object(
               'label', o.order_no || case when n.cnt > 1 then '-' || b.seq else '' end,
               'tier', b.declared_tier::text,
               'amount_krw', b.price_krw) order by b.seq)
      from public.boxes b
      cross join (select count(*) as cnt from public.boxes x where x.order_id = o.id) n
      where b.order_id = o.id
    ),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount_krw', r.amount_krw,
               'status', r.status,
               'at', coalesce(r.settled_at, r.created_at)) order by r.created_at, r.id)
      from public.refunds r
      join public.payments x on x.id = r.payment_id
      where x.order_id = o.id and x.status = 'done'
    ), '[]'::jsonb)
  )
  from public.orders o
  join public.payments p on p.order_id = o.id and p.kind = 'initial' and p.status = 'done'
  where o.order_no = p_order_no
    and o.fan_id = auth.uid()
    and o.registered_at is not null;
$$;

revoke all on function public.my_gift_payment(text) from public, anon;
grant execute on function public.my_gift_payment(text) to authenticated;
