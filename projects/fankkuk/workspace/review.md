---
project: fankkuk
status: passed
basis: 13ead88caa43
reviewers: [code-reviewer, ux-reviewer, security-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-10-30, 알림 묶어 보내기 · 통합 시험 기준선)

- 범위: notification-batching(사이클 fankkuk-20261030-1) 구현 300d12aa — 승인 요청 10분 창·3일째·6일째 재알림·상태 알림 하루 묶음·「바로 받기」, 처리할 일 순서·남은 날 2일 이하. DB 는 migrations 20261030000001·000002(로컬 적용). 같은 날 통합 시험 기준선·관련 시험 고르기(카드 d2)와 옛 규칙을 기대하던 시험 고침.
- code-reviewer·ux-reviewer: 앞 세션(같은 날)에서 돌리고 지적을 반영했다(PROGRESS 「완료」).
- security-reviewer: 지적 없음. 확인한 것 — 「바로 받기」 설정 함수는 계정을 인자로 받지 않고 auth.uid() 로만 정한다 · 알림 꺼내기 함수는 서비스 키 전용 · 승인 요청·재알림·하루 묶음 본문에 주소·전화·실명이 없고 묶음은 계정별이라 다른 계정의 건이 섞이지 않는다.
- ui-reviewer 는 돌리지 않았다 — 화면 변경은 계정 설정의 스위치 한 칸과 목록 순서로, 기존 스위치 모양을 그대로 쓴다.
- 실행 근거:
  - `npx vitest run --config vitest.integration.config.mts` 전체(20:42~) → 2,268개 중 통과 2,246 · 실패 22 · `node scripts/integration-baseline.mjs` → 「기준선 22 · 새 실패 0 · 기준선 검사 통과」(`workspace/evidence/integration-20261030/signoff-baseline.txt`).
  - 기준선 22건: 기한 정리(10-21) 뒤 옛 시간을 기대하는 시험 16 · 링크 주소 308 넘기기가 200 으로 오는 코드 문제 6(10-18 발견, **고칠 기한 11-01**) — 시험마다 이유·발견일·기한이 `tests/integration/known-failures.json` 에 있다.
  - `npx tsc --noEmit` 0 · `npm test` 2,898 통과.
- 같이 고친 시험(옛 규칙을 기대하던 것): 시험용 크리에이터 넷의 승인 서명 연결 누락(48건) · creator-settings INV-A11 S11(승인 요청을 아직 대기일 때 꺼냄) · 문구 수정본 둘 · 번호 바꾸기 응답의 channel · 가입 약관 만 14세 · 탈퇴 시험의 칸별 조회(시간 초과) · 시드 주문 세기 · 가입 경로 집계 분모 · 주문 이름을 바꿔 정리에서 빠지던 시험.
