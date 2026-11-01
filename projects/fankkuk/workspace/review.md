---
project: fankkuk
status: passed
basis: 81469bd0f2d0
reviewers: [ui-reviewer, security-reviewer]
---

# 리뷰 사인오프 — fankkuk (2026-11-01, 로그인 전 메인 시안 4)

- 범위: c389d578(로그인 전 메인을 시안 4로 — landing-page·landing.module.css, 머리 「회원가입」 테두리 버튼, STEPS export, tests/landing-ui) · b5bf5990(ui-reviewer 반영). 서버 코드·API·DB 변경 없음. 승인: 카드 fankkuk-20261031-2-d1 답 「메인도 시안 4로 가자. 실제 화면에 반영해줘.」, design-rules 34절.
- ui-reviewer: 높음 0 · 중간 2(「팬꾹 주소」 표시 12 → 설계 기준 충돌 결정 「보조 글자 12 허용」으로 34절에 예외 기록 · 홀수 -11 → -12) · 낮음 4(옛 간격 이름 → --space-6 · 화살표 간격 20 → 24 · 움직임 시간 토큰 · 검색 단추 포커스 → 사이트 공통) 반영. 화살표 색은 시안 청회색에 맞는 토큰이 없어 --gray-500 유지.
- security-reviewer: 지적 없음(검색 폼은 /creators 로 GET 만, q 를 서버가 읽지 않음 · 고정 내부 링크뿐). 참고로 짚은 「/creators 가 q 를 안 읽어 검색어가 버려짐」은 화면에서 확인 — 이전부터 있던 동작, BACKLOG 1순위로 등재.
- code-reviewer 는 돌리지 않았다 — 도메인 로직·상태 변경 없음(배치·스타일과 정적 문구). ux-reviewer 는 돌리지 않았다 — 메인 UX 명세(docs/ux/pages/home.md)가 없어 기준이 없다(BACKLOG). 노출 조건(신규 크리에이터 0명 숨김·배너 없으면 칸 없음·공지 0건 문구)은 그대로다.
- 실행 근거:
  - `npx vitest run` 355 파일 3,052 통과 · `npx tsc --noEmit` 0 · `npm run copy:lint` 0 · `node gates/run-gates.mjs --quick` 통과.
  - tests/landing-ui 4개: 옛 landing-page 로 되돌려 돌리면 4개 모두 실패, 새 화면에서 통과.
  - 화면(localhost:3000 개발 서버, 로그인 전): 320·359·360·389·390·767·768·879·880·1024·1440 가로 넘침 0 · 대비 미달 0 · 12 미만 글자 0 · 제목 세 줄 0 · 화살표 중심 차 0(양쪽 24/24, 767 이하 위아래 16/16) · 캡션 시작 높이 한 값 · 바로가기 설명 한 줄(390 미만 1열). 44 미만 누르는 칸은 공용 크리에이터 카드 이름 링크(19, 카드 전체가 누르는 칸)뿐. 검색 「꾹냥」 → /creators?q=꾹냥, 끝 띠 Enter 「모모」 → /creators?q=모모(이동만 확인 — 걸러지지 않음, 위 참고). 머리 회원가입 흰 바탕 + 테두리. 캡처 `workspace/home-landing-check/live-d-pc-1440.jpg`.
  - 최대 길이 데이터는 넣어 보지 않았다 — 이 화면의 가변 길이 글자는 공용 크리에이터 카드·공지 줄뿐이고 둘 다 바뀌지 않았다.
  - 통합 시험은 돌리지 않았다 — DB·API 변경 없음.
