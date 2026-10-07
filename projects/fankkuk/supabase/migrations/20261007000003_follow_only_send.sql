-- 팔로우한 크리에이터에게만 선물을 보낸다 (session-login INV-L9, 2026-10-07 바뀜 — 결정 카드 d41 「추천대로」).
-- - 팬·크리에이터 모두: 보내는 사람이 받는 크리에이터를 팔로우하고 있어야 등록된다. 받는 쪽이 보내는 쪽을 팔로우한 것은 세지 않는다.
-- - 판정은 등록하는 순간의 팔로우로 한다. 등록 뒤 팔로우를 끊어도 이미 만든 주문은 그대로다(주문 표는 건드리지 않는다).
-- - 앱 서버도 같은 판정을 따로 한다 — 이 함수는 그 판정이 빠져도 남는 두 번째 장치다.
-- register_order 는 20261006000016_box_amounts.sql 의 것과 같고, 팔로우 조건 줄만 다르다.
-- 「한쪽이라도 팔로우」를 보던 creators_follow_either_way 와, 그것을 한 명씩 묻던 can_send_gift_to 는 쓸 곳이 없어 지운다.

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
  end if;
  -- INV-L9: 팬·크리에이터 모두 — 보내는 사람이 받는 크리에이터를 팔로우하고 있어야 한다
  if not exists (select 1 from public.follows f where f.fan_id = p_fan_id and f.creator_id = p_creator_id) then
    raise exception '팔로우한 크리에이터에게만 보낼 수 있다' using errcode = 'P0012';
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

drop function public.can_send_gift_to(uuid);
drop function public.creators_follow_either_way(uuid, uuid);

-- 선물 보내기 목록의 순서용 — 로그인한 사람이 선물을 보낸 크리에이터, 마지막으로 보낸 순.
-- 사람 ID 를 받지 않는다(로그인 토큰의 계정이 보낸 주문만). 결제 전 주문도 센다 — 결제를 마치지 못하고 다시 보내는 사람이 위에 오게.
create function public.my_recent_recipients()
returns table (creator_id uuid)
language sql stable security definer set search_path = ''
as $$
  select o.creator_id
  from public.orders o
  where o.fan_id = auth.uid()
  group by o.creator_id
  order by max(o.created_at) desc, o.creator_id;
$$;
revoke all on function public.my_recent_recipients() from public, anon;
grant execute on function public.my_recent_recipients() to authenticated;
