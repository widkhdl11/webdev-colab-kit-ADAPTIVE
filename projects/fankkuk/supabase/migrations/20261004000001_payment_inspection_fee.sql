-- 결제 기록의 서비스료를 기본 서비스료와 검수비로 나눈다 (payment INV-M7 개정, 사용자 결정 2026-10-03).
-- 검수비 소형 1,500 · 중형 2,000. 역조공은 검수비를 빼고 받으므로(reverse-gift INV-R3) 칸이 따로 있어야 한다.
-- service_fee_krw 는 이제 「기본 서비스료」다. 환불 표(INV-M8)의 「서비스료 칸」은 기본 서비스료 + 검수비를 뜻한다.
-- 이미 있는 행은 검수비 0 으로 남긴다(로컬 시험 데이터뿐이다 — 운영 결제는 아직 없다).

alter table public.payments add column inspection_fee_krw integer not null default 0 check (inspection_fee_krw >= 0);
alter table public.payments alter column inspection_fee_krw drop default;

alter table public.payments drop constraint payments_breakdown_sum;
-- INV-M7: 네 칸의 합 = 결제 금액
alter table public.payments add constraint payments_breakdown_sum
  check (goods_krw + service_fee_krw + inspection_fee_krw + shipping_fee_krw = amount_krw);

-- 선물 등록 함수가 검수비 칸을 받는다. 옛 모양(검수비 없음)은 지운다 — 남겨 두면 검수비가 기본 서비스료에 섞인 채 저장될 수 있다.
drop function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer);

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

  insert into public.payments (order_id, kind, toss_order_id, amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw)
  values (v_order_id, 'initial', p_toss_order_id, p_amount_krw, p_goods_krw, p_service_fee_krw, p_inspection_fee_krw, p_shipping_fee_krw);

  return v_order_id;
end $$;

revoke all on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.register_order(uuid, uuid, text, text, boolean, public.parcel_tier[], text, integer, integer, integer, integer, integer) to service_role;
