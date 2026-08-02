---
paths:
  - "projects/*/src/app/**"
  - "projects/*/src/pages/**"
  - "projects/*/src/widgets/**"
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
