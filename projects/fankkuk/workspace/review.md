---
project: fankkuk
status: passed
basis: 692d7bdd6537
reviewers: [security-reviewer, code-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-10-08, 정책 ⑪ 5분마다 자동 처리·알림 발송)

이번 사인오프가 덮는 변경: 지난 사인오프(basis f74fe674d2b7, 커밋 153f0b2) 뒤 커밋 05eb0bc(BACKLOG) · 685f0c4(마이그레이션 20261008000012).
notifications INV-N16(예약 발송 입구) · office-workflow INV-W11(자동 처리 예약).

- 닿은 표면: auth(로그인 없이 비밀 값으로 여는 입구) · authz(자동 처리 함수의 실행자 판정) · concurrency(예약과 운영자 버튼 겹침) · 도메인.
  화면 변경 없음 → ui-reviewer 뺌. test-auditor 는 뺐다 — 새 시험의 강제 장치를 변이로 직접 확인했다(아래).
- security-reviewer: 바로 막을 것 0 · 낮음 2 → http 주소 거부(로컬 주소만 http, 시험 1) · 요청 대기열에 비밀 값이 잠깐 남음 — API 에 노출되지 않는 스키마라 받아들이고 마이그레이션 주석에 적음.
- code-reviewer: high 1(메일 서버가 느리면 한 호출이 60초를 넘겨 같은 메일이 두 번 갈 수 있음) → 메일 연결·응답 시간 제한 + 일꾼이 줄마다 예산 확인(시험 1).
  medium 2 → 두 경로 maxDuration 60 · 재알림 줄 넣기를 자동 처리 예약에서 뺌(실패가 자동 처리 전체를 되돌리지 않게). low 4 → 일꾼 공용화 · 깨진 JSON 400(시험 1) · http 주소(위와 같음) · 보관소에 실제 값이 있는 DB 에서도 시험이 돌게 비켜 두고 되돌림.
- 강제 장치 변이: 비밀 값 길이 확인 지움 → 빨간불 · 비밀 값 비교를 늘 참으로 → 빨간불. 복원 뒤 초록. 6자리·환불 쪽은 앞 사인오프 그대로.
- 순서 고백: 입구·예약 DB 모두 시험을 먼저 써 빨간불을 본 뒤 구현. 실수 — 마이그레이션 고치는 스크립트의 바꿔 넣는 글자에 「$'」가 들어 있어 파일 뒷부분이 세 번 붙음 → 적용 오류로 발견, 바로잡고 트랜잭션 안에서 파일 전체 적용을 돌려 본 뒤 되돌림.

실행 근거:
- `npm test` → 155 파일 1212 통과 · `npx tsc --noEmit` → 오류 0
- `npm run test:integration` → 1174 통과 · 1 실패(read-isolation 「모모의 요청은 하루에게 안 보인다」 — 시드 FC-W5N3T, BACKLOG 기존 건)
- DB → 앱: 보관소에 http://host.docker.internal:3000 과 40자 값을 넣고 schedule_dispatch_notifications() → net._http_response 404(앱 서버에 FANKKUK_SCHEDULE_SECRET 이 없어 설계대로 404) · 앱 직접 호출도 404. 확인용 값은 지움.
  안 해 본 것: 앱 서버 설정에 비밀 값을 넣고 메일이 끝까지 나가는 전체 흐름 — 설정 파일은 보안 훅이 막아 사람이 넣어야 한다(BACKLOG 「예약 실행 켜기」).
