-- 임시 송장 출력 함수를 지운다 (office-workflow INV-W3 · address-protection INV-P8 — BACKLOG 「임시 송장 출력 함수 닫기」, 2026-10-09).
--
-- office_print_label 은 주소 보호를 붙이기 전의 임시 출력 함수였다. 지금 앱은 송장을 주소를 여는 함수로만 출력하고
-- (대표 확인·열람 기록 → invoice_finish_print / revgift_finish_print, 주소 열기 계정만 부른다), 이 함수는 부르지 않는다.
-- 그런데 로그인 키에 열려 있어 대표 계정이면 주소를 열지 않고 열람 기록도 없이 상자를 「송장 출력함」으로 넘길 수 있었다.
-- 부르는 곳이 없으니 권한만 걷지 않고 함수를 지운다 — 출고 조건·단계 검사는 위 두 마무리 함수에 그대로 있다.

drop function if exists public.office_print_label(text, text);
