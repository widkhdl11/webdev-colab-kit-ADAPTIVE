# CLAUDE.md — 협업 규칙 (핵심만, 상세는 라우팅)

이 프로젝트는 사용자와 함께 웹사이트를 만드는 협업 세션이다.
오케스트레이터는 사용자다. 단계를 임의로 넘어가지 않는다.

## 세션 시작 시

1. SessionStart 훅의 브리핑을 확인한다 (대기 결정·게이트·멈춘 지점·다음 할 일·프론티어)
2. 활성 프로젝트(루트 ACTIVE 파일이 가리키는 이름)의 PRODUCT.md가 비어 있거나 활성 프로젝트가 없으면 kickoff 스킬로 시작한다
3. 브리핑의 `◆ 프론티어(지금 작업할 노드)`가 "다음 할 일"의 1차 근거다 — dirty인 최상류 노드부터 작업한다 (실행 그래프: 아래 아키텍처)

## 항상 지키는 규칙 (이 파일에만 존재)

- 불확실하면 진행하지 말고 물어라. 추측 코드가 질문보다 비싸다
- 구현 전: 무엇을 어디에 만들지 한 문단 요약 → 동의 → 시작
- PRODUCT.md의 비범위 기능은 요청받아도 먼저 지적. 필수에 없는 기능 임의 추가 금지
- 결정이 내려지면 즉시 문서 갱신. 대화와 문서가 다르면 문서가 우선
- 재작업 범위를 선언하지 마라. 무엇을 바꾸면 무엇을 다시 하는지는 dirty 전파가 정한다(graph.mjs).
  되돌아갈 때 경로를 임의로 정하지 말고 프론티어를 따른다 (상세: docs/references/graph-engine.md)
- 새 시각 방향(첫 페이지·새 레이아웃 언어)은 디자인 국면으로: design-interview(취향 상담)
  →design-drafter(정적 시안)→checkpoint 승인→projects/<이름>/docs/design/design-rules.md 확정. 크게 만들기 전에
  버려도 싼 시안으로 먼저 반복 — 이미 승인된 방향의 반복은 제외(빠른 경로).
  순서 상세는 .claude/rules/design-drafting.md
- "테스트/검증했다"는 보고는 실행한 명령과 출력을 근거로만
- 사람이 읽을 문서(PRODUCT·design-rules·PROGRESS 서사·docs/references·UI 카피 등)는 자연스러운 한국어로:
  번역투 금지(영어 직역식 어색한 표현 대신 일상어), 압축 전문용어는 비유로 풀되, 코드에서 쓸 고유명사
  (변수·파일명·`status: draft` 등)는 원어 유지. AI가 읽는 문서(CLAUDE.md·.claude/rules·에이전트/스킬 프롬프트)는
  전달력 위해 예외 — 밀도 허용

## 아키텍처 (요약 — 게이트가 자동 강제하므로 상세 암기 불필요)

- FSD 6레이어, import는 아래 방향만. TypeScript strict, any 금지
- 편집 시 훅이 게이트를 실행한다. 실패 메시지가 오면 새 기능 없이 위반만 수정
- 레이어별 상세 규칙은 .claude/rules/ 가 해당 경로 작업 시 자동 로드된다
- 프로젝트 코드는 projects/<이름>/ 아래(각자 src/ + 설정파일). 킷(.claude·gates·scripts, 그리고 루트 docs/의 LESSONS·references)은 루트 상주
- 프로젝트 문서는 projects/<이름>/ 하위(workspace/=과정 기록, docs/=정의·참고). 활성 프로젝트는 루트 ACTIVE 파일이 가리킨다
- 실행 흐름은 의존성 그래프로 관리된다: `product→spec·design→implement→qa→review→deploy`.
  Stop 훅(graph-stop)이 턴마다 dirty 상태(HANDOFF.md)를 갱신하고 프론티어를 파생한다. 상세: docs/references/graph-engine.md

## 작업 등급 — 절차를 리스크에 맞춘다 (구현 전 먼저 판단)

모든 작업에 최대 절차를 걸지 않는다. 시작 전에 등급부터 정하고 한 줄로 알린다
("이건 빠른 경로로 갑니다"). 애매하면 정식. 사용자가 올리면 정식으로 승격.

- **빠른 경로 (저위험):** 이미 승인된 방향의 정적·콘텐츠 작업 — 카피/이미지 교체,
  스타일·토큰 조정, 승인된 디자인의 반복 컴포넌트, 문서 수정.
  - 건너뜀: kickoff 인터뷰, spec, checkpoint.
  - 유지: 한 문단 요약→동의, 자동 게이트(FSD·보안 regex), 완료 시 리뷰어 1개.
  - 그래프: 프론티어를 자동 진행, QA/리뷰 실패 시 qa-classifier 자동 파견 (그 자리 "내가 볼게" 하면 멈춤).
  - wrap-up은 한 줄로.
- **정식 경로 (위험·새 방향):** 위험 기능(결제·인증·권한·동시성·시변/파생 상태), 새 도메인 로직,
  새 시각 방향(첫 페이지·새 레이아웃 언어), 데이터 모델 변경.
  - 전체 절차: (필요시) spec → (새 시각 방향이면) 디자인 국면(design-interview→시안→checkpoint) → 구현 → 리뷰어 3종 → test-auditor.
  - 그래프: 프론티어 진행·실패 분류를 사용자에게 보고·승인 후 (그 자리 "알아서 해" 하면 자동). spec-level·위험표면 실패는 항상 보고.

## 필요할 때만 읽는 문서 (라우팅)

- UI/페이지 작업 시작 전: projects/<이름>/docs/design/design-rules.md (checkpoint로 승인된 기준)
- 새 시각 방향(첫 화면·새 레이아웃) 시작 전: .claude/rules/design-drafting.md — 시안 먼저 절차(design-interview 스킬이 진입점)
- 위험 기능(결제·인증·권한·동시성·시변/파생 상태) 구현 전: projects/<이름>/docs/specs/ 의 해당 스펙 (없으면 /spec 먼저)
- 데이터 모델(엔티티·필드) 설계 시: docs/references/modeling-checklist.md (얕게=kickoff, 깊게=/spec)
- 과거 결정의 이유: projects/<이름>/workspace/DECISIONS.md / 반복 실수 패턴: docs/LESSONS.md
- 실행 그래프·프론티어·재작업 전파·검증 실패 분류: docs/references/graph-engine.md

## 세션 종료 시

- wrap-up 스킬로 projects/<이름>/workspace/PROGRESS.md "현재 상태"를 갱신한다 (5개 필드, 10줄 이내)
- 큰 진전이 있었으면 retro 스킬을 제안한다

## 기능 완성 시 (등급별) — review 노드 사인오프

리뷰어 통과 = 그래프의 `review` 노드를 clean으로 만드는 것. 통과하면 `workspace/review.md`에
`status: passed` + `basis: <해시>`를 기록한다(basis 값은 graph-stop 출력이 안내). 구현이 바뀌면
basis 불일치로 review가 자동으로 낡는다(재리뷰 강제). review가 dirty인 동안 `deploy`는 차단된다.
얕은 qa(테스트)는 매 턴 자동 clean이고, 깊은 리뷰는 이 기능-완성 마일스톤에만 파견한다(잦은 리뷰 방지).

- 정식 경로: code-reviewer + security-reviewer + (UI면) ui-reviewer 서브에이전트.
  테스트 작성 후 test-auditor 서브에이전트로 테스트 품질 감사. → 통과 시 review 마커 기록.
- 빠른 경로: code-reviewer 1개(UI 작업이면 ui-reviewer). 사용자 입력·인가·시크릿 등
  보안 표면이 실제로 닿으면 그때만 security-reviewer 추가 — 없으면 생략. → 통과 시 review 마커 기록.

## 검증 실패 시 (qa 테스트·리뷰어 지적)

- `qa-classifier` 서브에이전트를 파견해 실패를 `impl / design / spec` 레벨로 귀속한다(판정만, 라우팅 X).
- 판정 후 행동: **impl** = evidence 위치 코드 수정(실패한 qa/review가 이미 dirty로 잡음) /
  **design** = design-rules.md `status: draft`(거부) / **spec** = 해당 스펙 `status: draft`(거부).
  거부는 재작업+재승인 전까지 dirty를 유지하고, 재작업 범위는 전파가 파생한다.
- 강제 승격: `spec-level`이거나 위험 표면(인증·결제·권한·격리 INV·security)에 닿으면 등급 무관 사용자에게 먼저 보고.

  ## 참고

- 라이브러리/API 문서, 코드 생성, 설정 또는 구성 단계가 필요할 때 내가 명시적으로 요청하지 않아도 항상 Context7 MCP를 사용하세요.
