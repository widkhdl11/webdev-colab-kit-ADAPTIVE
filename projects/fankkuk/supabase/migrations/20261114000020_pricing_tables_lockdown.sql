-- 요금 관련 표 잠그기 (admin-console INV-K2·K5, 2026-11-14 팬꾹 주소 security 리뷰가 같은 틀의 선례에서 찾은 빈틈).
-- ① 앱 서버 관리자 키(service_role)도 표를 직접 읽거나 고치지 못한다 — 바꾸는 길은 대표 판정과 기록이 있는 security definer 함수뿐이다.
--    읽기·계산 함수도 모두 security definer 이거나 그 안에서만 불려 표 소유자 권한으로 돈다(2026-11-14 로컬 DB 조회:
--    security definer 가 아닌 함수 넷 — boxes_fill_price(상자 넣는 트리거, 상자는 definer 등록 함수만 넣는다) · fan_charge_of · pricing_problems_of ·
--    tier_prices_check_ascending(요금표 쓰기 트리거) — 은 모두 definer 함수 안에서만 불린다).
-- ② 변경 기록 두 표는 줄 단위 고치기·지우기 트리거만 있어 TRUNCATE 로 통째로 비울 수 있었다 — 표 단위로도 막는다.
-- 다시 돌려도 결과가 같다.

-- 요금을 정하는 사람(대표 설정 표)과 초기 크리에이터 할인을 받는 사람(early_creators·early_creator_counter)도 같이 —
-- 대표를 관리자 키로 바꾸면 위 표를 잠근 것이 대표 함수로 돌아가 무력해진다(같은 날 security 재리뷰).
revoke all on public.tier_prices, public.tier_price_changes, public.pricing_settings, public.pricing_setting_changes,
              public.carrier_route_costs, public.fan_send_fees, public.surcharge_fees,
              public.owner_setting, public.early_creators, public.early_creator_counter
  from service_role;

drop trigger if exists tier_price_changes_no_truncate on public.tier_price_changes;
create trigger tier_price_changes_no_truncate before truncate on public.tier_price_changes
  for each statement execute function public.tier_price_changes_append_only();

drop trigger if exists pricing_setting_changes_no_truncate on public.pricing_setting_changes;
create trigger pricing_setting_changes_no_truncate before truncate on public.pricing_setting_changes
  for each statement execute function public.tier_price_changes_append_only();
