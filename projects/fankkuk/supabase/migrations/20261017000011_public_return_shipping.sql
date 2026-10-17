-- 환불 규정에 반송 택배비를 상자 크기별 숫자로 보인다 (카드 d98 ①, DECISIONS 2026-10-17).
-- 반송 때 환불에서 빼는 금액은 그 구간의 택배 원가다(payment INV-M8 표 아래 줄). 공개 요금표에 그 값을 「반송 택배비」 칸으로 더한다.
-- 검수비 칸은 여전히 돌려주지 않는다(admin-console INV-K3 읽기 — 화면이 쓰는 칸만).
-- 반환 꼴이 바뀌므로 지우고 다시 만든다. 권한은 20261005000003 과 같다. 다시 돌려도 결과가 같다.

drop function if exists public.public_tier_prices();

create function public.public_tier_prices()
returns table (tier text, price_krw integer, revgift_price_krw integer, return_shipping_krw integer)
language sql stable security definer set search_path = ''
as $$
  select tp.tier::text, tp.price_krw, tp.price_krw - tp.inspection_fee_krw, tp.carrier_cost_krw
  from public.tier_prices tp
  order by tp.tier;
$$;

revoke all on function public.public_tier_prices() from public;
grant execute on function public.public_tier_prices() to anon, authenticated, service_role;
