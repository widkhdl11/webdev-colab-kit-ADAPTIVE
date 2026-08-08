# webdev-collab-kit v2

![실행 그래프 — product → spec·design → implement → qa → review → deploy](docs/diagrams/00-workflow-share-card.png)

Claude Code 대화형 위에서 사용자와 함께 웹사이트를 만드는 협업 세션 킷.
**오케스트레이터는 사용자다.** 모델은 설득(.md), 코드는 판정(게이트·훅).

구조를 먼저 보려면 → **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** (2분) ·
그림 4장은 [docs/diagrams/](docs/diagrams/) 의 `.json` 을 `archify deliver` 로 열면 인터랙티브 HTML 이 나온다.

## 시작

```
킷을 프로젝트 루트에 복사 → claude 실행 → "이런 웹사이트를 만들고 싶어"
```

kickoff가 인터뷰 → PRODUCT.md 합의 → setup이 하네스 구성 + `projects/<이름>/` 스캐폴딩 → (새 시각 방향이면) 디자인 국면 → 구현.
프로젝트 코드는 `projects/<이름>/`(각자 src/ + 설정)에, 프로젝트 문서는 `projects/<이름>/`(workspace/=과정 기록, docs/=정의·참고)에, 킷은 루트에 산다. 활성 프로젝트는 루트 `ACTIVE` 파일이 가리킨다.

## 생애주기와 스킬

kickoff(제품 정의 PRODUCT.md) → setup(하네스 구성+골격) → /spec(위험 기능 불변식 문서)
→ **디자인 국면**(새 시각 방향인 화면만) → 구현(+checkpoint) → 리뷰(서브에이전트)
→ retro(교훈 승격) → wrap-up(상태 동결)

디자인 국면 (새 방향일 때만 — 이미 승인된 방향의 반복 화면은 건너뛰고 바로 구현):
design-interview(취향 상담, 양식 반복) → design-drafter(정적 시안 HTML)
→ [checkpoint] 시안 승인·수정 반복 → projects/<이름>/docs/design/design-rules.md 확정(status: approved) + tokens.css 갱신 → 구현.
새 방향 판단과 순서는 .claude/rules/design-drafting.md 가 규정한다.

슬래시 전용: /goal(세션 목표) /status(브리핑) /scaffold(projects/<이름>/ 골격 재생성 — 최초는 `scaffold <이름>`)

## 컨텍스트 계층 (규칙의 거처)

0토큰 강제: permissions.deny, 훅(.claude/hooks/), 게이트(gates/)
상시(고정비): CLAUDE.md — 헌법+라우팅만, ~40줄
경로 조건(결정론): .claude/rules/\*.md (paths 매칭 시 자동 로드) — 예: domain-layers·ui-layers(projects/\*/src 레이어별). design-drafting.md 는 paths 없이 design-interview 스킬이 참조하는 시안 규칙
작업 조건: .claude/skills/ (description 매칭 시 로드) — kickoff / setup / design-interview / wrap-up / retro 등
요청 시: 필요할 때 Read — 킷 지식은 루트 docs/(LESSONS·references). 프로젝트 문서는 projects/<이름>/ 아래(workspace/=PROGRESS·DECISIONS, docs/=PRODUCT·specs/·design/). tokens.css 는 projects/<이름>/src/shared/ui/ 아래

## 검증 체계

- 편집 직후: 훅 → run-gates --quick (FSD 레이어·보안 패턴)
- 턴 종료: 훅 → run-gates 전체 (tsc + npm test + spec-coverage)
- spec-coverage: approved 스펙의 모든 INV-\*는 테스트가 참조해야 통과
- design/BEFORE_UI: projects/\*/src/{pages,widgets}에 파일이 있는데 그 프로젝트 docs/design/design-rules.md가 status: approved 아니면 차단 — UI는 디자인 국면 선행(아티팩트 의존 게이트)
- 세션 시작: SessionStart 훅 → briefing (대기 결정·게이트·멈춘 지점·다음 할 일·진행률)
  ※ briefing은 단계를 판단하지 않고 활성 프로젝트(루트 ACTIVE)의 projects/<이름>/workspace/PROGRESS.md에서 "다음 할 일"을 읽어 전달한다.
  흐름이 바뀌어도 briefing 코드는 불변 — PROGRESS.md만 갱신하면 된다(wrap-up이 담당).
- 보호: LESSONS.md/설정/게이트/훅은 직접 수정 차단, 위험 bash 차단, .env는 deny

## 서브에이전트 (전부 읽기 전용 — 만드는 자와 판정하는 자의 분리)

code-reviewer / security-reviewer(스펙 강제위치 검사 포함) / ui-reviewer(design-rules 기준)
/ test-auditor(알리바이 테스트 감사). 탐색은 내장 Explore 사용.
디자인 국면 전용(쓰기 가능 — 시안 산출): design-drafter(정적 시안 HTML), style-scout(레퍼런스 정찰, Playwright 연결 시).
setup 조건부: spec-auditor, doc-drift-auditor.

주의: 훅/스킬 스키마는 Claude Code 버전에 따라 다를 수 있음 — 적용 후 /hooks 와
/context 로 로드 확인 권장.
