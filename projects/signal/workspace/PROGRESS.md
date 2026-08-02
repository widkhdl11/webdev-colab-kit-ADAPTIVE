# PROGRESS — signal

## 현재 상태

- **오늘의 목표**: 디자인 국면 마무리(상담→정찰→시안→승인) + 하네스 정비 (달성)
- **완료**: **디자인 국면 종료** — biko.kr 정찰(Playwright) → INTERVIEW.md 확정 → 시안 3장(feed-a/b·article) → 피드백 3회 반영(배경 톤다운·읽음 흐릿·날짜 그룹·안읽은 카드 입체감) → **design-rules.md `status: approved` 생성**(게이트가 UI 구현 허용) · PRODUCT 갱신(읽음표시 MVP 승격·날짜그룹·갱신주기 매일아침) · DECISIONS 3건 · retro 반영(setup 스킬 tools 규칙 · drafter 첫방향 입력 · design-drafting 시안 검증 단계 · scripts/preview.mjs 신설) · 게이트 2건 수정(status 줄앵커 · BEFORE_UI에 App Router 포함) · **architectures/README.md 신설**(스택별 게이트 분기 규칙+체크리스트)
- **멈춘 지점**: 없음 — 디자인 국면이 깨끗이 닫혔다. 구현은 아직 한 줄도 시작 안 함(src/app은 워킹 스켈레톤 그대로)
- **다음 할 일**: 피드 화면 구현 착수 — shared/ui/tokens.css(승인 토큰) → entities/article(타입+더미) → widgets/feed(카드·날짜그룹·필터칩) → features/read-state(localStorage) → app 라우트 조립. 상세는 기존 features/content-render 재사용. **Supabase는 프로비저닝 전이라 데이터는 더미로 두고 나중에 갈아끼운다**
- **대기 중인 결정**: LESSONS.md 2건 붙여넣기(보호 파일 — 훅이 AI 수정 차단. 지난 대화의 "게이트가 스택을 가정할 때는 판정하고 분기한다" 블록)

## 로그

### 2026-08-02
- **킥오프**: 개인용 AI/IT 소식 리더. 읽기형 + 자동수집 + 개인용. 피드+상세 2페이지. 랭킹 포함 → 정식 경로.
- **셋업**: rules/supabase.md를 공통 / wama 전용(supabase-wama.md)으로 분리. security-reviewer에 원문 HTML XSS·키 노출 관점 추가.
- **프로세스 개선 3건**: (1) kickoff에 "파일 우선(인터뷰 전 PRODUCT.md 생성)" 금지 규칙, (2) setup에 "스택 문서 합의(approved) 전 설치 금지 + tech-stack.md", (3) 아키텍처 프로파일 학습 메커니즘(docs/references/architectures/) + setup 포인터.
- **Next.js 채택**: 웹 노출 + 기존 Next+FSD 경험(레퍼런스: Study-Mate-FSD). Vite→Next는 signal만, 전역 게이트·wama 불변. 스택: Next15·React19·Supabase·TanStack Query·Tailwind·Zod.
- **게이트 발견(→ /spec에서 처리)**: ① dangerouslySetInnerHTML 원천 차단 → 원문 전문 표시 방식 재설계 필요, ② 랭킹=시변·파생 불변식, ③ 요약 출처 결정.
- **미해결(킷 백로그)**: 게이트 CROSS_SLICE가 app·shared도 슬라이스로 봄(canonical FSD와 다름) → 지금은 provider를 shared로 우회. nextjs-fsd.md에 기록.

### 2026-08-02 (2세션 — spec·구현·디자인 착수)
- **스펙 결정 확정**: 요약=AI생성(Claude, 실패 시 null 후 재시도) · 원문=sanitize 후 렌더 · 랭킹=시간감쇠×소스weight(앵커 패턴, 점수 저장 안 함) · 중복제거=정규화 원문 URL. PRODUCT.md·DECISIONS.md 반영.
- **스펙 2개**: content-safety.md(INV-D1~5, XSS) approved → TDD 구현(features/content-render: sanitize.ts+article-body.tsx) → 리뷰어 3종 → 지적 반영(D5 레이아웃절 ui-layers로 분리 · D3 테스트 정직화 · 보안회귀 테스트 11개) → review.md 사인오프(basis 17a9beafa141). ingestion-ranking.md는 planned/로 파킹.
- **킷 개선**: spec 템플릿 정본(docs/references/spec-template.md)+scaffold 배선+retro 고도화 루프. retro로 게이트 status 정규식 줄앵커 수정(주석 오매칭 버그) + spec 스킬 "승인단위·보류(planned/)" 명문화 + LESSONS 3건.
- **하네스 빈칸 발견**: ① 정규식이 주석 토큰 오매칭(NO_INNERHTML은 보수 유지·status는 수정) ② 스펙 승인 단위=구현가능 단위(동시승인 all-or-nothing) ③ "합의됐으나 보류" 상태 부재→planned/ 파킹으로 회피. 백로그 반영.
- **디자인 착수**: design-interview(첫 시각 방향). 1회차 답변 → 방향 = 미니멀+플레이풀(귀엽고 가벼운 SNS 느낌, 피로감 낮게)·라이트·살짝라운드·페리윙클/인디고. 레퍼런스 biko.kr(WebFetch 403). Playwright MCP를 user 스코프로 등록(재시작 후 style-scout로 정찰 예정).

### 2026-08-02 (3세션 — 디자인 국면 종료 + 하네스 정비)
- **정찰**: biko.kr을 Playwright로 열어 스타일 프로필 수집(docs/design/refs/). style-scout에 위임하려 했으나 그 에이전트 tools에 MCP가 없어 본체가 수행 → 하네스 빈칸으로 처리. 결론: "뼈대(점선 카드·알약 칩·회색 채움)는 가져오고, 발랄함의 공급원만 캐릭터 대신 포인트색·라운드·마이크로 인터랙션으로 바꾼다".
- **시안 → 승인**: feed-a(인디고)·feed-b(페리윙클)·article 3장 → 사용자가 **톤 a 채택**. 피드백 3라운드: ① 배경이 너무 하얌 → 페이지를 낮추고 카드를 그보다 밝게 **명암을 뒤집음**(레퍼런스와 반대) ② 읽은 글 흐릿하게 → 읽음 상태 도입, 구별이 약해 제목을 4.85:1까지 내리고 **굵기 700→600**까지 사용(색은 4.5:1 바닥) ③ 안 읽은 카드에 입체감 → "그림자 없이 면으로만 분리" 규칙을 **"안 읽은 카드에만 옅은 그림자"로 대체** — 입체감이 '아직 안 봄'의 신호가 됨. 추가로 날짜 그룹(1차) 도입.
- **대비 실측이 설계를 세 번 바꿈**: 레퍼런스 메타색 2.95:1 탈락 · 태그칩 4.23:1 미달 발견 · 읽음 흐릿함이 하한에 막혀 굵기로 우회. 전부 Playwright computed style로 측정. design-rules.md에 최저값(4.57:1)까지 기록해 다음 화면이 물려받게 함.
- **스코프 변경**: 읽음 표시를 후순위 → MVP 승격(사용자 요청). 로그인이 없어 localStorage로 충분 → 서버·스키마 변경 없음, 기기 간 동기화 없음이 대가. PRODUCT·DECISIONS 반영.
- **하네스 4건**: ① setup 스킬에 "tools 최소셋 = 역할이 성립하는 데 필요한 것, MCP는 풀네임·상속 안 됨" ② drafter에 "첫 시각 방향이면 design-rules.md가 없다(정상)" ③ design-drafting에 시안 검증 단계(대비 실측) + scripts/preview.mjs 신설(Playwright가 file: 차단) ④ **architectures/README.md 신설** — 게이트가 스택을 가정할 때 판정하고 분기하는 규칙 + 새 프로파일 체크리스트 6항목.
- **게이트**(사용자 반영): designApproved status 줄앵커 + BEFORE_UI가 Next일 때만 src/app/**/page.* 를 화면으로(라우트 1장은 워킹 스켈레톤 예외). 반영 과정에서 existsSync 단축평가가 깨져 ENOENT로 죽는 상태를 거쳤고 수정됨.
- **하네스 빈칸의 종류**: 이번 것들은 전부 "실패가 조용한" 계열 — 위임해봐야 드러나는 빈 껍데기 에이전트, 안 재면 모르는 대비 미달, 막아야 할 걸 안 막고 통과하는 게이트. 에러가 나는 실수보다 이쪽이 비싸다.
