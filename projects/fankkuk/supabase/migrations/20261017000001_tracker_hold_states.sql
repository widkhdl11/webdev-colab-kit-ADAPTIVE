-- 추적기 보관 · 신고 보관 · 경찰 인계 상태 값 (office-workflow INV-W1·W14, 2026-10-17 카드 d100·d101).
--
-- tracker_held  = 추적기 보관 — 검수에서 위치 추적기로 판정된 팬 선물이 검수 완료 스캔에서 가는 곳. 크리에이터가 신고할지 고른다.
-- report_held   = 신고 보관 — 「신고하기」가 처리된 상자. 경찰에 넘길 때까지 선반에 둔다.
-- police_handed = 경찰 인계(끝) — 운영자가 인계를 기록한 상자. 돌려보내지 않는다.
--
-- 값 추가만 따로 둔다 — 같은 처리 안에서 막 더한 enum 값은 쓸 수 없어서(PostgreSQL), 이 값을 쓰는 함수·제약은 다음 마이그레이션(20261017000002)에 있다.
-- 다시 적용해도 결과가 같다(if not exists).

alter type public.office_state add value if not exists 'tracker_held';
alter type public.office_state add value if not exists 'report_held';
alter type public.office_state add value if not exists 'police_handed';
