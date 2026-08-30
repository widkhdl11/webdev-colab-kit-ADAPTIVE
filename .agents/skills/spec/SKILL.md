---
name: spec
description: 어기면 사고가 나는 규칙을 테스트가 참조할 수 있는 문장(불변식)으로 고정하는 절차 — 사고는 나중에 조용히 나기 때문에 코드보다 먼저 판정 기준이 있어야 한다. 신호는 인증·세션·결제·권한·동시성, 시간에 따라 변하거나 다른 값에서 파생되는 상태. 이 하한선은 risk-surface 게이트가 기계로 강제한다(스펙 frontmatter 의 surfaces 로 커버를 판정). 되돌리는 비용이 작은 단순 UI/콘텐츠에는 쓰지 않는다.
argument-hint: [기능명]
---
# 스펙 — 테스트로 컴파일 가능한 불변식 문서
활성 프로젝트(루트 ACTIVE)의 projects/<이름>/docs/specs/_TEMPLATE.md 형식으로 projects/<이름>/docs/specs/$ARGUMENTS.md 를 작성한다.
템플릿 정본은 킷의 docs/references/spec-template.md 다 (스캐폴딩이 새 프로젝트로 복사한다).
프로젝트에 _TEMPLATE.md 가 없으면 정본을 projects/<이름>/docs/specs/_TEMPLATE.md 로 복사한 뒤 시작한다.

## 절차
1. 기능의 "어기면 사고"를 사용자와 함께 나열 → 각각을 불변식 문장으로.
   **데이터 모델 기능(kickoff에서 시변·파생 등으로 플래그된 것)이면
   docs/references/modeling-checklist.md를 깊게 훑어** 필드 단위로 불변식을 도출한다 —
   선택지와 트레이드오프를 제시하는 질문 방식으로.
2. 체크리스트로 각 불변식을 검증: 참/거짓 판정 가능한가 / 위반 시 무슨 일이
   일어나는지 명시됐나 / 신뢰 경계(믿는 값·안 믿는 값)가 적혔나 / 강제 위치가 적혔나
3. 시나리오는 Given/When/Then + INV ID 참조 필수. 불변식마다 실패 경로 시나리오 1개 이상
4. status: draft로 저장 → spec-auditor 서브에이전트가 있으면 감사 →
   사용자에게 승인 요청 → 승인 시 status: approved로 변경
5. approved 후: rules/tdd.md에 따라 테스트 먼저. spec-coverage 게이트가 추적을 강제한다

**승인과 동시에 `approved` 로 적는다 — 테스트가 아직 없어도 미루지 않는다.** 예전엔 그러면 spec-coverage 가
INV 전부의 테스트를 요구해 wrap-up 조차 못 하는 상태가 됐고, 그래서 "승인은 끝났는데 draft" 라는
**문서가 사실과 다른 상태**로 회피했다(2026-08-10). 지금은 `spec-coverage` 가 completion 게이트라
spec 노드가 안 끝난 동안에는 턴을 막지 않는다 — 하류(implement·qa·review·deploy)는 여전히 막혀 있으니
강제력은 그대로다. 승인 시점과 파일 값이 어긋날 이유가 없어졌다. (상세: docs/references/graph-engine.md)

## 승인 단위·보류 (구현 가능 단위로 승인)
- **하나씩 approved.** approved 스펙은 spec-coverage 게이트가 그 INV 전부에 테스트를 요구하고, 게이트는
  npm test green 도 요구한다 → approved 하면 그 스펙 INV를 다 구현할 때까지 **하류가** 닫혀 있다
  (턴은 끝낼 수 있다 — 위 참조).
  그러니 인프라 의존(예: DB·외부 API)이 섞인 스펙은 **구현 가능한 단위로 쪼개** 준비된 것부터 하나씩 approved 한다.
  여러 스펙을 한꺼번에 approved 하면 all-or-nothing 으로 막힌다.
- **보류(합의됐으나 아직 구현 못 함)는 `projects/<이름>/docs/specs/planned/` 에 status: draft 로 둔다.**
  spec 노드 글롭(docs/specs/*.md)은 비재귀라 planned/ 는 안 잡혀 spec 국면을 막지 않는다(spec-coverage 도 draft 는 무시).
  준비되면 파일을 docs/specs/ 로 옮기고 approved → TDD 착수. 주의: spec 노드가 dirty 면 하류(implement/qa/review)
  해시가 null 이 돼 완성된 슬라이스의 리뷰 사인오프조차 막힌다 — 그래서 미준비 스펙은 planned/ 로 내린다.

## 금지
- 산문 명세 금지 — ID 없는 불변식은 테스트가 참조할 수 없다
- 사용자 승인 없이 approved 로 변경 금지 (frontmatter status 값)
