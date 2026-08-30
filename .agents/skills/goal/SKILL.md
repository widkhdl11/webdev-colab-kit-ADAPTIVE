---
name: goal
description: 세션 목표를 설정하거나 확인한다
disable-model-invocation: true
argument-hint: [목표 내용 — 비우면 현재 목표 확인]
allowed-tools: Read, Edit
---
# 세션 목표 관리
## 컨텍스트 (호출 시점 자동 주입)
- 현재 진행 상태: !`head -20 projects/$(cat ACTIVE)/workspace/PROGRESS.md`
- 입력된 목표: $ARGUMENTS

## 작업
$ARGUMENTS가 비어 있으면: 위 상태를 근거로 현재 목표와 남은 일을 3줄로 보고하고 끝낸다.
$ARGUMENTS가 있으면:
1. 활성 프로젝트의 PRODUCT.md(projects/<이름>/docs/)와 대조 — 비범위 충돌이나 필수 기능과의 정합을 확인.
   충돌 시 지적하고 사용자 판단을 기다린다 (임의 수정 금지)
2. 목표를 검증 가능한 완료 조건 1~3개로 쪼개 제안
3. 동의받으면 projects/<이름>/workspace/PROGRESS.md "오늘의 목표" 갱신
4. 첫 완료 조건부터 시작할지 묻는다
