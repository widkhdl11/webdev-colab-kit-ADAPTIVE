---
feature: (기능명)
status: draft        # draft → (spec-auditor 감사) → 사람 승인 후 approved. approved 전 구현 금지
surfaces: []         # 이 스펙이 커버하는 위험 표면: auth · payment · authz · concurrency 중 해당하는 것만
                     # 게이트(risk-surface)가 읽는다 — 코드에 그 표면의 패턴이 등장하면
                     # 여기 그 표면을 적은 approved 스펙이 하나는 있어야 통과한다.
                     # 커버하지 않는 표면을 적으면 방벽이 열린다. 실제로 불변식을 쓴 표면만 적을 것.
---
# (기능명) 스펙

## 불변식 — 각각 참/거짓 판정 가능한 문장. 위반 시 무슨 일이 일어나는지, 어디서 강제되는지 명시
- INV-X1: ... (강제 위치: 서버/클라이언트/게이트)

## 시나리오 — 각각 어느 불변식을 검증하는지 ID 참조
- S1 (INV-X1): Given ... / When ... / Then ...

## 신뢰 경계
- 믿는 값: ... / 믿지 않는 값: ...

## 비범위
-
