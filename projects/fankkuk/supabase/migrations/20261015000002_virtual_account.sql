-- 무통장 입금(토스 가상계좌) — 결제 상태 「입금 대기」 (payment INV-M21, 카드 d87 「추천대로」 1번).
-- enum 값 추가는 같은 처리 안에서 바로 쓸 수 없어 파일을 나눈다 — 칸·함수는 다음 파일(20261015000003_virtual_account_flow.sql).
-- 다시 적용해도 같다(if not exists).

alter type public.payment_status add value if not exists 'waiting_deposit';
