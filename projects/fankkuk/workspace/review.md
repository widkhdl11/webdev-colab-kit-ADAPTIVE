---
project: fankkuk
status: passed
basis: 6d9a36ded09c
reviewers: [security-reviewer, code-reviewer, ux-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-10-31, 링크 로그인 · 역할별 로그인 유지 기간 · 링크 주소 308)

- 범위: e34b10e6(알림톡 링크로 바로 로그인 link-login · 역할별 로그인 유지 기간 session-login INV-L16·L17·L19·L20) ·
  5c85a639(링크 주소 넘기기를 응답 전 proxy 로 — 308·404) · 6834e035(느린 연락처 시험 시간 제한).
  DB 는 migrations 20261030000003·20261031000001 — 운영에 사람이 db push, 원격 migration list 로 확인(10-31).
  「다른 기기 로그아웃」(INV-L18)은 사용자 지시로 뺐다.
- security-reviewer: 링크 로그인 — 높음 0. 중간 ① 토큰이 쿼리에 있으면 호스팅 요청 기록에 남음 → # 뒤로 옮김 ·
  중간 ② 남의 링크로 남의 계정에 로그인됨 → 카드 fankkuk-20261031-1-d1 답(로그인 중이면 계정을 바꾸지 않음) · 낮음(실패 기록 증가) BACKLOG.
  로그인 기간 — 높음 0. 중간(판정 재료를 못 읽으면 통과) → 운영자 주소는 닫고 그 밖은 오류 기록 · 낮음 둘(주소의 크리에이터 표시 → 짧은 HttpOnly 쿠키,
  임시 저장 정리 자리 → 사이트 공통) 반영.
- code-reviewer: 중간 4(다른 탭 연장 뒤 안내 남음 · 상태 조회 실패를 끝남으로 봄 · 임시 저장 Provider 값 · 서버 값이 바뀐 폼 복원) 반영,
  낮음 중 중복 읽기는 BACKLOG, 나머지 반영.
- ux-reviewer: 높음 1(코드 리뷰 중간 1과 같음) · 중간 4(닫기 때 임시 저장 남음 · 빠진 입력 4곳 · 다른 이유로 끝난 세션에 안내 · 안내가 aria-invalid) 반영,
  login.md 에 /login/link 상태 추가.
- ui-reviewer 는 돌리지 않았다 — 새 시각 요소는 안내 상자·위 줄 하나로 기존 토큰·상자 모양을 쓴다.
- 실행 근거:
  - `node scripts/integration-baseline.mjs --run`(19:37~, 2시간 13분) → 2,303개 중 통과 2,283 · 실패 20 = 기준선 16 · 새 실패 4
    (`workspace/evidence/integration-20261031/signoff-baseline.txt`).
  - 새 실패 4의 원인: notifications-db S6d·S6e 가 33.6초로 기본 제한(30초)에 끊겨, 별빛의 알림 설정을 되돌리는 코드가 다음 시험 뒤에 돌았다 —
    뒤 시험 셋(notifications-db S6e · notifications-dispatch S6 · signup-nickname INV-U13)이 꺼진 설정을 봄. 그 시험에 120초 제한(6834e035).
    고친 뒤 같은 순서로 다섯 파일(notification-batching-db → notifications-db → notifications-dispatch → notifications-failures → signup-nickname-db)
    155개 통과. 전체 실행은 다시 돌리지 않았다.
  - `npx vitest run` 3,048 통과 · `npx tsc --noEmit` 0 · `npm run copy:lint` 0 · `node gates/run-gates.mjs --quick` 통과.
  - 변이: 로그인 기간 20(앱 16·폼 4) · 링크 308 11 · 링크 로그인(앞 세션) — 모두 시험이 잡음.
  - 3000번 개발 서버(로컬 DB)에서 화면 확인: 링크 로그인(사용자 시연) · 팬 미사용 7일 → 307 로그인 화면 · 직원 [연장] · 두 탭 안내 사라짐 ·
    임시 저장 같은 계정 복원/다른 운영자 지움 · 크리에이터 주소 308·404.
- 운영에서 아직 보지 않은 것: 기간으로 끝낼 때 운영 DB 에서 세션 줄을 지우는 권한, 솔라피 로그인 링크 템플릿(검수 중).
