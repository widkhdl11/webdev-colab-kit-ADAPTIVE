-- 크리에이터도 다른 크리에이터에게 선물을 보낸다 (session-login INV-L3·INV-L8·INV-L9, 카드 d16).
-- - 선물 등록: 보내는 사람은 팬 또는 크리에이터. 운영자는 거부(INV-L3).
-- - 크리에이터는 자기 자신에게 못 보낸다(INV-L8).
-- - 크리에이터 → 크리에이터는 둘 사이 팔로우가 한쪽이라도 있어야 한다(INV-L9). 팬이 보내는 선물에는 이 조건이 없다.
-- - 팔로우: 크리에이터도 다른 크리에이터를 팔로우한다. 자기 자신은 팔로우하지 못한다.
-- 앱 서버도 같은 판정을 따로 한다 — 이 파일은 그 판정이 빠져도 남는 두 번째 장치다(스펙: 두 곳이 각각).
-- 주문 표의 fan_id 칸은 「보내는 사람」으로 읽는다(이름은 그대로).

-- 크리에이터 p_sender(계정)가 크리에이터 p_creator 에게 보낼 수 있는가. 팔로우가 한쪽이라도 있으면 참.
-- 자기 자신인지는 여기서 보지 않는다 — 부르는 쪽이 먼저 거른다.
create function public.creators_follow_either_way(p_sender uuid, p_creator uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.follows f where f.fan_id = p_sender and f.creator_id = p_creator)
      or exists (
           select 1
           from public.creators receiver
           join public.follows f on f.fan_id = receiver.profile_id
           join public.creators sender_page on sender_page.id = f.creator_id
           where receiver.id = p_creator and sender_page.profile_id = p_sender
         );
$$;

revoke all on function public.creators_follow_either_way(uuid, uuid) from public, anon, authenticated;

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
begin
  if v_n = 0 or v_n > 10 then
    raise exception '상자는 1~10개 (입력 경계와 같다)' using errcode = '22023';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_fan_id;
  if v_role is null or v_role not in ('fan', 'creator') then
    raise exception '선물을 보낼 수 있는 계정이 아니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.creators where id = p_creator_id and identity_verified) then
    raise exception '선물을 받을 수 없는 크리에이터' using errcode = '22023';
  end if;
  if v_role = 'creator' then
    if exists (select 1 from public.creators c where c.id = p_creator_id and c.profile_id = p_fan_id) then
      raise exception '자기 자신에게는 선물을 보낼 수 없다' using errcode = 'P0011';
    end if;
    if not public.creators_follow_either_way(p_fan_id, p_creator_id) then
      raise exception '팔로우가 없는 크리에이터에게는 보낼 수 없다' using errcode = 'P0012';
    end if;
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

-- 팔로우 저장 — 팬과 크리에이터. 크리에이터는 자기 자신을 팔로우하지 못한다.
create or replace function public.set_follow(p_creator_id uuid, p_following boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role in ('fan', 'creator')) then
    raise exception '팬·크리에이터 계정만 팔로우한다' using errcode = '42501';
  end if;

  if p_following then
    if not exists (select 1 from public.creators c where c.id = p_creator_id and c.identity_verified) then
      raise exception '팔로우할 수 없는 크리에이터다' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.creators c where c.id = p_creator_id and c.profile_id = v_uid) then
      raise exception '자기 자신은 팔로우할 수 없다' using errcode = 'P0011';
    end if;
    begin
      insert into public.follows (fan_id, creator_id) values (v_uid, p_creator_id);
    exception when unique_violation then
      null; -- 이미 팔로우 중
    end;
  else
    delete from public.follows f where f.fan_id = v_uid and f.creator_id = p_creator_id;
  end if;
  return p_following;
end;
$$;

-- 로그인한 크리에이터 자신의 크리에이터 id(없으면 행 없음). 자기 페이지에서 팔로우·선물 보내기를 숨기는 데 쓴다.
create function public.my_creator_id()
returns table (creator_id uuid)
language sql stable security definer set search_path = ''
as $$
  select c.id from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

-- 로그인한 크리에이터가 크리에이터 한 명에게 지금 선물을 보낼 수 있는가(자기 자신 아님, 팔로우가 한쪽이라도 있음, 본인 확인 완료).
-- 목록으로 돌려주지 않는다 — 목록이면 「나를 팔로우하는 크리에이터」 명단이 한 번에 나온다(보안 리뷰).
-- 한 명씩 묻는 것은 선물 등록을 시도해 거부되는지 보는 것과 같은 정보다. 크리에이터가 아니면 거짓.
create function public.can_send_gift_to(p_creator_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'creator')
     and exists (select 1 from public.creators c where c.id = p_creator_id and c.identity_verified
                   and c.profile_id is distinct from auth.uid())
     and public.creators_follow_either_way(auth.uid(), p_creator_id);
$$;

revoke all on function public.my_creator_id() from public, anon;
revoke all on function public.can_send_gift_to(uuid) from public, anon;
grant execute on function public.my_creator_id() to authenticated;
grant execute on function public.can_send_gift_to(uuid) to authenticated;
