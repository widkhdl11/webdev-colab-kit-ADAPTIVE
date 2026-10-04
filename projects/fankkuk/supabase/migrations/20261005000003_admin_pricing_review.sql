-- 관리자 1단계 리뷰 반영 — 요금 공개 범위를 좁힌다 (admin-console INV-K3·K6).
-- 앞 마이그레이션의 current_tier_prices() 는 로그인 안 한 사람에게도 택배 원가·검수비까지 돌려줬다.
-- 화면에 필요한 것은 구간·받는 값·역조공 값뿐이다. 원가·검수비가 든 전체 표는 앱 서버(등록 계산)만 읽는다.

-- 화면용 공개 요금표: 구간 · 받는 값 · 역조공 값(받는 값 − 검수비, reverse-gift INV-R3). 원가·검수비 칸은 없다.
create function public.public_tier_prices()
returns table (tier text, price_krw integer, revgift_price_krw integer)
language sql stable security definer set search_path = ''
as $$
  select tp.tier::text, tp.price_krw, tp.price_krw - tp.inspection_fee_krw from public.tier_prices tp order by tp.tier;
$$;
revoke all on function public.public_tier_prices() from public;
grant execute on function public.public_tier_prices() to anon, authenticated, service_role;

-- 등록 계산용 전체 요금표: 이름과 칸은 그대로 두고 앱 서버 키만 부른다. 화면 쪽 키로 부르면 권한 오류(42501)다 —
-- 이름을 남겨 두면 옛 호출이 빈 값이 아니라 오류로 드러난다.
revoke all on function public.current_tier_prices() from public, anon, authenticated;
grant execute on function public.current_tier_prices() to service_role;
