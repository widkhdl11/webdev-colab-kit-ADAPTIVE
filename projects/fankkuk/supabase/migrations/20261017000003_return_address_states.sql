-- 처분 대상 · 처분 상태 값 (office-workflow INV-W1·W15, 2026-10-17 카드 d100·d101).
--
-- dispose_due = 처분 대상 — 주문에 이어진 반송 대기 상자를 보낸 사람이 반송 대기부터 720시간 안에 반송 주소를 확인하지 않았다. 자동 처리가 넘긴다.
-- disposed    = 처분(끝) — 운영자가 처분 대상 상자의 내부 QR 을 스캔해 처분을 기록했다. 원 송장 봉투도 그때 파쇄한다.
--
-- 값 추가만 따로 둔다 — 같은 처리 안에서 막 더한 enum 값은 쓸 수 없어서(PostgreSQL), 이 값을 쓰는 함수·제약은 다음 마이그레이션(20261017000004)에 있다.
-- 다시 적용해도 결과가 같다(if not exists).

alter type public.office_state add value if not exists 'dispose_due';
alter type public.office_state add value if not exists 'disposed';
