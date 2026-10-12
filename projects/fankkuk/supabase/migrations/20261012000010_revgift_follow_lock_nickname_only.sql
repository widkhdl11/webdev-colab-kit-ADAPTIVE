-- 문제집 E4① 리뷰 반영 (reverse-gift INV-R1·INV-R8).
--
-- 1) 역조공 등록(register_revgift)이 받는 팬의 팔로우를 잠근 자리에서 본다(for share). 함수 본문의 나머지와 권한은 그대로다
--    (create or replace 는 권한을 바꾸지 않는다 — 서버 키만 부른다). 잠금 순서: 이 함수가 잡는 기존 줄은 팔로우 줄뿐이고
--    몫·보내기 줄은 새로 만든다. 주문 쪽 잠금 순서(office-workflow INV-W12 — 상자 → 승인 요청 → 주문·몫 → 6자리 → 사무소 상자)에는
--    팔로우 줄이 없고, 팔로우 줄을 잡는 다른 처리는 팔로우 끊기(그 한 줄만 지움)뿐이라 겹치지 않는다.
-- 2) 보낸 역조공 목록(my_sent_revgifts)에서 팬 로그인 아이디(fan_login_id) 칸을 뺀다 — 크리에이터는 팬 닉네임만 본다(E4 결정:
--    팬이 팔로우할 때 「크리에이터가 내 닉네임을 볼 수 있어요」라고 들은 것보다 많이 보이지 않게). 돌려주는 칸이 줄어
--    create or replace 가 안 되므로 지우고 다시 만들고 권한을 다시 준다.

CREATE OR REPLACE FUNCTION public.register_revgift(p_sender uuid, p_shares jsonb, p_toss_order_id text, p_goods_krw integer, p_service_fee_krw integer, p_inspection_fee_krw integer, p_shipping_fee_krw integer, p_amount_krw integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_creator_id uuid;
  v_send_id uuid;
  v_n integer;
  v_sum integer;
  v_found integer;
  v_total integer;
  v_carrier integer;
  v_bad integer;
begin
  if jsonb_typeof(p_shares) is distinct from 'array' then
    raise exception '몫 목록이 아니다' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_shares);
  if v_n = 0 or v_n > 10 then
    raise exception '받는 팬은 1~10명' using errcode = '22023';
  end if;

  select c.id into v_creator_id
  from public.creators c join public.profiles p on p.id = c.profile_id
  where c.profile_id = p_sender and p.role = 'creator';
  if v_creator_id is null then
    raise exception '역조공은 크리에이터만 보낸다' using errcode = '42501';
  end if;

  -- INV-R1: 받는 팬들의 팔로우 줄을 먼저 잠그고(for share) 아래에서 본다. 팔로우 끊기가 진행 중이면 그것이 끝날 때까지
  -- 기다렸다가 끊긴 뒤의 상태로 판정한다 — 잠그지 않으면 끊기가 막 끝나는 순간에 「팔로우 중」으로 읽고 등록할 수 있다.
  -- 팔로우 줄만 잠근다(계정 줄은 잠그지 않는다). 팔로우 끊기는 그 한 줄만 지우고 다른 줄을 잡지 않아 서로 엇갈려 기다릴 상대가 없다.
  -- 공유 잠금끼리는 막지 않으므로 같은 팬에게 보내는 등록 둘도 서로 기다리지 않는다. 순서는 계정 ID 순으로 고정한다.
  perform 1 from public.follows f
  where f.creator_id = v_creator_id
    and f.fan_id in (select (s ->> 'fan_id')::uuid from jsonb_array_elements(p_shares) s)
  order by f.fan_id
  for share;

  -- INV-R1: 받는 사람은 지금 이 크리에이터를 팔로우하는 팬 계정이다(크리에이터·자기 자신·팔로우 안 한 팬은 아니다)
  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    where not exists (
      select 1 from public.profiles p
      join public.follows f on f.fan_id = p.id and f.creator_id = v_creator_id
      where p.id = (s ->> 'fan_id')::uuid and p.role = 'fan'
    )
  ) then
    raise exception '나를 팔로우하는 팬에게만 보낼 수 있다' using errcode = 'P0021';
  end if;

  select coalesce(sum((s ->> 'amount_krw')::integer), 0) into v_sum from jsonb_array_elements(p_shares) s;
  if v_sum <> p_amount_krw then
    raise exception '몫 금액의 합이 결제 금액과 다르다' using errcode = '22023';
  end if;

  -- INV-K3 · reverse-gift INV-R3: 몫 금액 = 등록 순간 요금표의 받는 값 − 검수비, 배송비 칸 = 택배 원가. 한 문장으로 읽는다.
  select count(tp.tier)::integer, coalesce(sum(tp.price_krw - tp.inspection_fee_krw), 0)::integer, coalesce(sum(tp.carrier_cost_krw), 0)::integer,
         count(*) filter (where tp.tier is not null and ((s ->> 'amount_krw')::integer <> tp.price_krw - tp.inspection_fee_krw
                                                        or (s ->> 'shipping_fee_krw')::integer <> tp.carrier_cost_krw))::integer
  into v_found, v_total, v_carrier, v_bad
  from jsonb_array_elements(p_shares) s left join public.tier_prices tp on tp.tier::text = s ->> 'tier';
  if v_found <> v_n then
    raise exception '받을 수 없는 상자 구간' using errcode = '22023';
  end if;
  if v_bad > 0 or p_goods_krw <> 0 or p_inspection_fee_krw <> 0 or p_amount_krw <> v_total or p_shipping_fee_krw <> v_carrier
     or p_service_fee_krw <> v_total - v_carrier then
    raise exception '요금이 바뀌었다 — 다시 계산해야 한다' using errcode = 'P0031';
  end if;

  insert into public.revgift_sends (sender_id, creator_id, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (p_sender, v_creator_id, p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw)
  returning id into v_send_id;

  insert into public.revgift_shares (send_id, seq, order_no, fan_id, tier, amount_krw, shipping_fee_krw)
  select v_send_id, s.ord::smallint, s.v ->> 'order_no', (s.v ->> 'fan_id')::uuid, (s.v ->> 'tier')::public.parcel_tier,
         (s.v ->> 'amount_krw')::integer, (s.v ->> 'shipping_fee_krw')::integer
  from jsonb_array_elements(p_shares) with ordinality as s(v, ord);

  return v_send_id;
end $function$;

drop function public.my_sent_revgifts();

CREATE FUNCTION public.my_sent_revgifts()
 RETURNS TABLE(order_no text, sent_at timestamp with time zone, fan_nickname text, tier parcel_tier, state text, ship_to_office boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.order_no, d.settled_at, p.nickname, s.tier,
         case
           when s.reply = 'accepted' then 'accepted'
           when s.reply = 'waiting' and now() < public.revgift_deadline(d.settled_at) then 'waiting'
           else 'not_received'
         end,
         exists (
           select 1 from public.revgift_shares x
           where x.send_id = d.id and x.returned_at is null and x.cancelled_at is null
             and (x.reply = 'accepted' or (x.reply = 'waiting' and now() < public.revgift_deadline(d.settled_at)))
         )
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles p on p.id = s.fan_id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$function$;

revoke all on function public.my_sent_revgifts() from public, anon;
grant execute on function public.my_sent_revgifts() to authenticated;
