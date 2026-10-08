---
project: fankkuk
status: passed
basis: 2ca7a51cdf03
reviewers: [security-reviewer, ui-reviewer, test-auditor, code-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-10-08, 정책 ① 취소)

이번 사인오프가 덮는 변경: 지난 사인오프(basis 692d7bdd6537) 뒤 진행 중 커밋 448e5fa + 이번 반영 커밋.
payment INV-M8 「입고 뒤 취소」 줄 · INV-M16(팬의 입고 전 취소) · INV-M17(대표의 입고 뒤 취소, S17c 카드 d53).

- 닿은 표면: payment(환불 금액) · authz(대표만·보낸 사람만) · concurrency(입고·송장 출력과 취소 겹침) · 새 화면 둘(선물 상세 「취소하기」, 결제·환불 「입고 뒤 취소하기」) · 약관 문구.
- security-reviewer(448e5fa 때): 반영 끝(지난 세션). 이번 변경분(거부 조건·잠금 순서) 다시: 인가·거부 조건 우회·정보 유출 0 · low 1(실측 기록·보관 상자 닫기와 잠금 순서가 엇갈려 동시에 돌면 한쪽이 실패 — 데이터는 안 어긋남) → BACKLOG 기존 「교착」 항목에 덧붙임.
- ui-reviewer(448e5fa 때): 반영 끝(지난 세션).
- test-auditor: 보강 5건 → cancel-db 에 씀. 실행해 보니 1건(S17b 송장 출력 뒤)이 시험 준비 SQL 오류(출고 송장번호 없이 label_printed — DB 제약)로 실패 → 준비만 고침, 9/9.
- code-reviewer: high 0 · medium 2 · low 2.
  medium ① 검수 불합격 상자가 섞인 주문의 취소 환불이 누른 시점에 따라 0원/2,800원 → 스펙 빈칸, 카드 d53 「추천대로」: 걸린 상자가 있으면 취소 거부(P0061), 시험 S17c 를 먼저 써 빨간불 확인 뒤 구현.
  medium ② 송장 출력과 잠금 순서 반대 → 사무소 상자 줄을 주문보다 먼저 잠금. 이 수정을 붙드는 시험은 없다(동시 실행에서만 드러남).
  low 문구 중복 → model 에서 export · 주문번호 칸 오류에 사유 문구 → 칸별 문구(시험 1, 고친 줄 지우면 빨간불).
- 함께 고친 낡은 시험: admin-refund-db 「입고 뒤 팬 취소는 배송비 칸만」(카드 d49 전의 규칙) → 새 줄(도착한 상자가 없으면 결제 금액 전부)로.
- 강제 장치 변이: S17c — 거부 조건 없는 구현에서 빨간불 · 앱 P0061 줄 지움 → 빨간불 · orderNo 칸별 문구 되돌림 → 빨간불. 복원 뒤 초록.

실행 근거:
- `npm test` → 158 파일 1226 통과 · `npx tsc --noEmit` → 오류 0
- `npm run test:integration` (단독) → 1183 통과 · 2 실패: read-isolation 「모모의 요청은 하루에게 안 보인다」(시드 FC-W5N3T, BACKLOG 기존 건) · admin-refund-db 낡은 시험(위에서 고침 → 그 파일 단독 38/38) · cancel-db 단독 10/10
- 화면(addr1008·fankkuk_admin, 로컬): FC-EW4FX9 「취소하기」 → 「취소된 선물이에요」, DB canceled·6자리 void·환불 대상 6,900(전액) ·
  FC-J76W8 「입고 뒤 취소하기」 → 「취소했어요. 환불 대기 줄에서 환불해 주세요」, 환불 대기 줄에 올라옴, 2,800 = 13,800 − 2 × (1,500 + 4,000) ·
  FC-E4RWDD(첫 상자를 사무실 검수에서 불합격 처리) 「입고 뒤 취소하기」 → 「검수에서 걸린 상자가 있어 취소할 수 없어요…」, 주문 그대로·취소 기록 0.
