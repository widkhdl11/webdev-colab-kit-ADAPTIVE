---
project: fankkuk
status: passed
basis: c65cf3a2f7d6
reviewers: [security-reviewer, test-auditor, code-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-10-09, 차액 결제 요청 알림)

이번 사인오프가 덮는 변경: 지난 사인오프(basis 0c9cf541f026) 뒤 notifications INV-N18(S18·S18b) — 사무실 실측이 신고보다 커서
차액 결제 줄이 생기면 그 주문의 팬에게 상자마다 알림 한 줄(difference_due). 마이그레이션 20261009000004_difference_alert.
같은 사이에 시험용 휴대폰 번호 꼴을 tests/integration/pii-shape.ts 하나로 모음(시험만 바뀜).

- 닿은 표면: authz(알림을 누구에게 보내는가) · 개인정보(본문에 무엇이 들어가는가). 결제 금액 계산은 글자 그대로(알림 블록 말고 원본과 같음 — 두 리뷰어가 대조).
- ui-reviewer 는 뺐다 — 화면을 건드리지 않았다(알림 본문 문구만).
- security-reviewer: 지적 없음. 받는 사람은 주문의 fan_id 하나뿐이고 인자로 넘길 자리가 없음, 줄에 금액·구간 없음, 상자 칸 제약 변경이 다른 종류에 같은 결과, 권한(security definer·grant) 원본과 같음.
- code-reviewer: 지적 없음. low 1 → 알림 줄 넣는 같은 insert 가 세 곳 — BACKLOG 로.
- test-auditor: 빈 갈래 2 → 거절된 주문엔 알림 없음 · 이메일을 끈 팬에겐 건너뜀(꼭 가는 알림 아님) 시험 추가.
- 변이 5개(갈래마다 하나): 알림 줄 넣기 삭제 · 상자 칸 null · 알림 넣기를 주문 상태 검사 앞으로 · 연락처 함수에서 차액 알림을 꼭 가는 알림으로 · 상자 칸을 첫 상자로 고정 → 모두 빨간불, 되돌린 뒤 통과.
  (표시용 값 notification_claim 의 꼭 가는 알림 칸을 바꾼 변이는 통과 — 실제 판정은 연락처 함수에 있어 발송에 영향이 없다.)
- 실행 근거: `npx vitest run` → 단위 1292/1292 · `npm run test:integration` → 1264/1265(실패 1 = BACKLOG 시드 FC-W5N3T 읽기 격리, 기존) ·
  추가 시험 뒤 INV-N18 묶음 6/6, notifications-dispatch 9/9. 발송 경로 시험(S18)이 가짜 이메일 통로로 실제 본문을 받아 링크·금액 없음 확인.

## 이전 사인오프 (2026-10-09, 잠금 순서 하나 — basis 0c9cf541f026)

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

## 덧붙임 (2026-10-09, 배포 전 개인정보 노출 검사 — BACKLOG 닫음)

새 파일 scripts/pii-exposure.mjs(`npm run check:pii`) · tests/integration/pii-exposure-check.integration.test.ts · package.json 실행 이름 하나. 닿은 표면: authz·개인정보(검사 도구, 운영 코드 변화 없음). ui-reviewer 는 뺐다 — 화면 변화 없음.

- 응답 검사: 권한마다 데이터 API 목록(OpenAPI)에서 열린 표·함수를 모두 찾아 GET(읽기 전용)으로 부르고 개인정보 꼴 칸·값을 찾는다. 인자는 앞선 성공 응답 값으로 채운다.
  성공(2xx)만 부름으로, 함수가 낸 거부(P0002·55000·25006 — 데이터 API 가 500 으로 줌)는 거부로, 코드 없는 5xx·XX/53/57/58/08 계열은 서버 오류로 실패.
- 구조 검사: 로그인 키 함수 중 pii 에 닿는 13개(직접 6 · office_sync → close_revgift_share 로 닿는 사무실 함수 7) 모두 허용 목록 · public 표에 개인정보 꼴 칸 0.
- security-reviewer: high 1(쓰고 돌려주는 함수 못 봄 → 구조 검사) · medium 3(출력에 값 → 자리·종류만 / 읽기 전용 확인이 실제 쓰기 → 같은 값 다시 저장 / 칸·값 꼴 빈틈 → recipient·zip·email·+82·점 구분·「구 로 번지」) · low 4(표 1000줄 넘으면 실패 · 로그아웃 · 허용 칸 함수로 좁힘 · 검사 밖의 길 BACKLOG).
- code-reviewer: high 3(실패 응답을 부름으로 셈 · 목록이 비면 통과 · 인자에 오류 본문 값) · medium 2(못 부름 — 구조 검사로 · 로그인 없으면 바로 멈춤) · low(설정 형식·꺼진 Supabase 안내·로그인 응답 처리) 반영.
- test-auditor: high 2(앱 GET 검사 · 읽기 전용 확인을 붙든 시험 없음) · medium 2(인자 채우기 · 칸 이름 갈래) 반영.
- 변이 17(칸 이름 실명·암호문 / 값 검사 / 표 / 가린 칸 / 로그인 없음 / 참거짓 / 읽기 전용 확인 / 인자 채우기 / 실패를 성공으로 / 구조 닿음·거쳐 닿음·낡은 목록·public 칸 / 앱 돌려보내는 주소 / 서버 오류 / 허용 칸 함수) → 17/17 빨간불(처음 16).
- 실행 근거: `npm run check:pii -- --app http://localhost:3000` → 익명 8·로그인 117 함수, 개인정보 꼴 0건, 구조 통과 · 시험 파일 13/13 · `tsc --noEmit` 0.
