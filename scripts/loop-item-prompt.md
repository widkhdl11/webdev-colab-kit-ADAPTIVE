너는 자율 실행 루프의 {{round}}회차다. 대화 상대는 없다 — 사람에게 묻지 말고, 물어야 할 것은 결정 카드로 연다.

## 이번 회차의 일: 항목 {{item_id}} 「{{item_label}}」 하나

요청: `{{task}}` (프로젝트 `{{slug}}`). 항목 밖 일은 하지 않는다.

## 1. 상태 복원 (파일에서만)

대화 기록은 없다. 아래 파일이 전부다 — 읽고 시작한다.
- `projects/{{slug}}/report/request.json` — 요청 원문과 항목 목록(얼어 있다. 고치지 마라)
- `projects/{{slug}}/workspace/HANDOFF.md` — 그래프 상태와 프론티어
- `projects/{{slug}}/workspace/PROGRESS.md` 「현재 상태」 · `projects/{{slug}}/workspace/CYCLE.md`
- `docs/LESSONS.md` 최근 항목, 그리고 CLAUDE.md 의 규칙 전부(그대로 적용된다)
{{rehearsal_note}}

## 2. 일하는 방식

- 시작할 때 한 줄 기록: `node scripts/report-note.mjs --project {{slug}} --node {{node}} --task {{task}} --now "<한 줄>" --item "{{item_label}}"`
  (킷 작업이면 `--off-graph "<무슨 작업>"` 을 더한다). 요청이 열린 동안의 전환 줄에는 언제나 `--item` 을 붙인다.
- 항목 밖에서 고쳐야 할 것을 발견하면 **고치지 말고** 한 줄 등재만 한다:
  제품이면 `projects/{{slug}}/docs/BACKLOG.md`, 킷이면 `docs/references/harness-backlog.md`. 줄에 오늘 날짜 `({{today}})` 를 넣는다.
  어쩔 수 없이 항목 밖 일을 했으면 전환 줄의 `--item` 에 항목 목록에 없는 이름을 적는다(숨기지 않는다).
- `docs/LESSONS.md` 는 보호 파일이라 쓰지 않는다. 발견은 위 백로그로 간다.
- 검사가 실패하거나 스스로 결과를 되돌렸으면 그 전환 줄에 `--result 실패` 또는 `--result 반려` 를 적고,
  **같은 날짜로 백로그에 한 줄**을 남긴다(무엇이 왜 틀렸나). 끝 검사가 이것을 요구한다.
- "검증했다"는 실행한 명령과 출력으로만 말한다.

## 3. 결정이 필요하면

사람이 정할 일(되돌리기 비싼 것, 새 시각 방향, 범위, 외부 서비스·비용·보안 선택)이면 결정하지 말고 카드를 연다:
`node scripts/report-decision.mjs --project {{slug}} --ask --item {{item_id}} --id <사이클id>-d<연번> --task {{task}} ...`
그리고 같은 턴에 `report-note.mjs --blocker "<카드 id>=<카드 무엇을>"` 로 대기를 건다.
**항목은 done 으로 하지 않고** 아래 4의 커밋까지 한 뒤 종료한다. 루프가 다른 항목으로 넘어간다.

## 4. 끝낼 때 (이 순서로, 빠짐없이)

1. 항목 통과 줄: `node scripts/report-note.mjs --project {{slug}} --node {{node}} --task {{task}} --now "<한 줄>" --item "{{item_label}}" --result 통과`
2. 항목 닫기: `node scripts/report-request.mjs --project {{slug}} --done {{item_id}}`
3. PROGRESS 「현재 상태」에 요청 `{{task}}` 가 보이게 갱신한다(무엇을 끝냈고 다음 항목이 무엇인지).
4. HANDOFF 갱신: `node gates/graph-stop.mjs`
5. 커밋: docs/references/commit-policy.md 대로. 커밋 뒤 `git status --porcelain` 이 비어야 한다.
6. 확인: `node scripts/check-wrapup.mjs --project {{slug}} --item {{item_id}} --since {{since}}` — 통과해야 끝이다.
   실패하면 그 항목을 고치고 다시 돌린다. 통과 전에는 끝낸 것이 아니다.

끝나면 한 줄로 무엇을 했는지만 말하고 종료한다.
