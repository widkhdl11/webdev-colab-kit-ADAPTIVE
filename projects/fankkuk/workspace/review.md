---
project: fankkuk
status: passed
basis: 0c9cf541f026
reviewers: [security-reviewer, test-auditor]
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

## 덧붙임 (2026-10-09, 거절·차단 잠금 순서 — BACKLOG 닫음)

시험만 더했다(함수 정의는 그대로). 크리에이터 거절은 승인 요청 → 주문 → (6자리 트리거) → 사무소 상자 줄로, INV-W12 순서에서 상자만 뺀 꼴이다.

- 더한 시험 셋(lock-order-db): 승인 요청·주문 줄을 쥐면 거절이 그 뒤 단계 줄을 잡기 전에 기다림 · 차단이 함께 거절하는 다른 주문도 승인 요청 줄을 먼저 잠금 ·
  거절과 검수 완료 스캔이 같은 승인 요청 줄 앞에 줄 서도 교착 없이 거절이 끝나고 스캔은 55000(바뀐 상태를 보고 거부).
- test-auditor: medium 2 → 거절이 주문 줄을 승인 요청 줄보다 먼저 잠가도 통과(승인 요청 줄을 쥐고 주문 줄 탐침 추가) · 스캔 결과가 「40P01 아님」만 봄(55000 으로 정확히).
  low 2 → 6자리 줄 쥐기: 입고된 상자의 6자리는 이미 사용됨이라 거절 트리거가 건드리지 않아 해당 없음 · 함께 거절되는 주문에 입고 상자가 없음: 남김(차단 반복의 사무소 상자 줄은 return_inspected_boxes 한 곳이고 주문 줄 잠금 뒤다).
- 사고 하나: 처음 차단 시험이 기본 쌍(별빛 → 하루)을 써서 시드 FC-P4X7N·FC-YVLMH 를 함께 거절했다 → 시험 전 값으로 로컬 복구(6자리 97W9M3 포함), 시험은 시드 주문이 없는 하늘 → 하루 쌍으로.
- 변이 넷(갈래마다 하나): QR 잠금 옛 순서 → 8 실패 · 거절이 사무소 상자 줄을 주문 앞에서 · 거절이 주문 줄을 승인 요청 앞에서 · 차단 반복의 승인 요청 잠금 빠짐 → 각 1 실패. 4/4 빨간불, 실행 전후 시드 주문 해시 같음.
- 실행 근거: `npx vitest run --config vitest.integration.config.mts tests/integration/lock-order-db.integration.test.ts tests/integration/decline-block-db.integration.test.ts` → 55/55 · `tsc --noEmit` 0.

## 덧붙임 (2026-10-09, 임시 송장 출력 함수 삭제 — BACKLOG 닫음)

마이그레이션 20261009000003_drop_office_print_label — 로그인 키에 열려 있던 office_print_label(대표면 주소를 열지 않고 상자를 송장 출력함으로 넘김)을 지웠다.
시험 35곳은 도우미 finishPrint(실제 마무리 함수를 DB 관리자 연결로)로, 앱 주석 한 줄(scan-outbound.ts) 정리. 닿은 표면: authz. ui·code 리뷰어는 뺐다 — 화면·도메인 로직 변화 없음.

- security-reviewer: 결함 0. 주소 열기 없이 label_printed 로 넘기는 다른 길 없음(남은 둘은 address_decryptor 전용), 지운 함수를 부르는 운영 코드 없음.
  low 2 → 마무리 함수가 열람 기록을 직접 보지 않음(BACKLOG) · service_role 의 직접 갱신(Supabase 설계, 이번 변경과 무관).
- test-auditor: medium 1 → 출력 결과를 버리던 호출(revgift-close INV-R9) → 성공 단언 + label_printed 확인. low 2 → 버리던 호출 6곳 모두 성공 단언으로 · 회귀 시험에 pg_proc·has_function_privilege 직접 확인.
  대표만 출력은 주소 열기 함수 시험(invoice-print-db·revgift-print-db)이 붙들고 있음 확인.
- 변이 3(옛 함수 되살림 · invoice_finish_print 를 authenticated 에 · revgift_finish_print 를 authenticated 에) → 3/3 빨간불, 되돌린 뒤 통과.
- 실행 근거: 통합 전체 1247/1248(실패 = read-isolation 시드, BACKLOG 기존) · 감사 반영 뒤 바뀐 4파일 157/157 · `npm test` 1289/1289 · `tsc --noEmit` 0.
