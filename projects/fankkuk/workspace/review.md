---
project: fankkuk
status: passed
basis: fa390a3408a3
reviewers: [security-reviewer, code-reviewer, test-auditor]
---

# 리뷰 사인오프 — fankkuk (2026-10-09, 잠금 순서 하나)

이번 사인오프가 덮는 변경: 지난 사인오프(basis fa390a3408a3, 커밋 a31c2d9) 뒤 office-workflow INV-W12(S12·S12b) — 같은 주문을 만지는
쓰기 처리가 모두 「상자 → 승인 요청 → 주문(몫) → 6자리 → 사무소 상자 줄」 순으로 잠근다. 마이그레이션 20261009000002_lock_order.

- 닿은 표면: concurrency(잠금 순서) · authz 는 판정 글자 그대로(대표 취소 is_owner·사유 검사, 자동 처리의 운영자 판정 — 본문 복사, 바꾸지 않음).
- ui-reviewer 는 뺐다 — 화면을 건드리지 않았다.
- security-reviewer: 막을 결함 0. 낮음 1 → 다시 읽기 루프의 둘째 바퀴가 사무소 상자 줄을 쥔 채 새 상자를 잠가 순서가 거꾸로 됨 → 루프를 없애고 바로 40001(다시 스캔).
  실행 권한(create or replace 가 revoke 유지)·잠그기 전 읽은 값으로 판단하는 곳 없음 확인. 새 함수 office_lock_parcel 은 public·anon·authenticated revoke.
- code-reviewer: high 1 → 자동 처리(office_run_expiry)의 7일 반려·보관 168시간·나갈 수 없는 상자 단계가 새 순서와 반대(주문 → 상자, 사무소 상자 줄 → 주문)
  → 세 단계를 주문마다·상자마다 반복하며 같은 순서로 잠그고 조건을 다시 봄, 미확인 입고 기한은 맨 뒤로. low 2 → 대표 취소가 6자리 줄을 사무소 상자 줄 앞에서 잠금 · 루프 전제(위와 같이 없앰).
- test-auditor: 빈 갈래 5 → 동시 시험(S12b)을 줄 세우기로 결정적으로 · 상자 줄을 쥔 채 주문 줄도 확인 · 승인 요청·역조공 몫·대표 취소의 상자 갈래 시험 추가.
- 변이 12개(갈래마다 하나): QR 잠금의 주문·승인 요청·상자·몫 잠금 빠짐, 사무소 상자 줄 먼저 · 대표 취소의 사무소 상자 줄 주문 앞, 상자·승인 요청·6자리 빠짐 ·
  자동 처리 1단계 상자 빠짐, 5단계·마지막 단계 잠금 빠짐 → 12/12 빨간불(처음 11/12, 살아남은 6자리 갈래는 시험을 더해 잡음).
- 실행 근거: `npx vitest run --config vitest.integration.config.mts tests/integration/lock-order-db.integration.test.ts` → 10/10 ·
  통합 전체(옛 정의 중간본) 1241/1245(실패 = read-isolation 시드 1건 + 실행 중 추가한 자동 처리 시험 3건이 적용 전 정의에 빨간불) ·
  `npm test` 1289/1289 · `tsc --noEmit` 0. 통합 전체(최종 정의) 1243/1245 — 실패 2: read-isolation 시드(BACKLOG 기존) · INV-W7 무작위 송장번호가 전화번호 꼴과 우연히 맞음(그 파일 단독 57/57, BACKLOG 등재)
