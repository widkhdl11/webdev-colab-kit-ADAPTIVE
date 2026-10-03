-- 대형 상자 구간 (admin-console INV-K6, DECISIONS 2026-10-03 「관리자 페이지와 대형 상자」 — d8 「중형 초과는 받지 않는다」를 대체).
-- 대형 = 세 변 합 160cm·20kg 이하. 그 위(oversize)는 여전히 받지 않는다.
-- enum 값 추가는 같은 처리 안에서 바로 쓸 수 없어 파일을 나눈다 — 요금표는 다음 파일.

alter type public.parcel_tier add value if not exists 'large' before 'oversize';
