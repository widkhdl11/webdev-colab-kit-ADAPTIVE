---
paths:
  - "projects/*/src/app/**"
  - "projects/*/src/pages/**"
  - "projects/*/src/widgets/**"
  # 화면은 위 세 레이어에만 있지 않다. FSD 에서 features/entities 의 `ui/` 와 shared/ui 가
  # 폼·버튼·필드를 들고 있고, 접근성·토큰·간격 규칙이 가장 자주 깨지는 자리가 거기다.
  # 2026-09-06 study-mate 의 ui-reviewer 지적 셋(성공 알림 라이브 리전·힌트 연결·파일 칸 크기)이
  # 전부 이 밖이라 편집 시점에 규칙이 도착하지 않았다. `ui/` 폴더만 집어서 넓힌다 —
  # features/entities 전체를 넣으면 도메인 로직 파일에도 UI 규칙이 뜬다.
  - "projects/*/src/features/*/ui/**"
  - "projects/*/src/entities/*/ui/**"
  - "projects/*/src/shared/ui/**"
---
# UI 레이어 규칙
- 비즈니스 규칙 금지 — 판단은 features/entities에서 가져오고 여기선 조합·표시만
- 작업 전 projects/<이름>/docs/design/design-rules.md를 읽는다. checkpoint로 승인된 기준이 취향보다 우선
- **pages/widgets 구현은 승인된 projects/<이름>/docs/design/design-rules.md(status: approved)를 전제로 한다 — 게이트가 강제(design/BEFORE_UI). 미승인이면 화면 구현 전 디자인 국면 먼저.**
- 접근성 기본: 본문 대비 4.5:1 이상, 본문 16px 이상, 이미지 alt, 폼 label 연결
- 외부 링크 target=_blank에는 rel="noopener noreferrer"
- 외부·원문에서 온 이미지는 본문 칸을 넘지 않게(max-width:100%; height:auto) + 내재 치수(width/height) 보존 —
  로드 실패·과대 이미지의 레이아웃 붕괴 방지 (2026-08-02 content-safety 스펙에서 이관: 보안 아닌 UI 사안)
- 색/radius/shadow: 하드코딩 금지 — 디자인 토큰(CSS 변수)으로
- 간격(spacing): 반복되는 공통 레이아웃은 spacing 토큰(--space-*) 사용, 일회성은 px 허용 — 단 모든 간격은 짝수(2의 배수)만 (1px 헤어라인·-1px sr-only 제외)
