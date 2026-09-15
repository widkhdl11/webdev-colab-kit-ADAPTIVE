# 리포트 스킬 제작 프롬프트 2벌 (수정 반영본)

프롬프트 1을 먼저 실행한다.
**프롬프트 2는 보류** — 실전 투입 후 보고 피로가 실측되면 그때 실행한다. 문서만 보고 연달아 실행하지 말 것.
둘 다 킷의 기존 스킬 규약(intake 스킬과 같은 구조: 스킬 문서 + 판정 검사 + 경계 문구 + 백로그 등재)을 따른다.

---

## 프롬프트 1 — report-dashboard 스킬 (설치형, LLM 비관여 실시간 대시보드)

```
# 목표

report-dashboard 스킬을 만든다. 이 스킬은 프로젝트에 "실시간 워크플로우 대시보드"를 설치하는 1회성 스킬이다.
설치 후의 대시보드 동작에는 LLM이 전혀 관여하지 않는다. 이것이 이 스킬의 제1 제약이다.

사용 장면: 사람이 작업을 시켜놓고 브라우저 탭 하나를 열어둔다. 화면 상단에는 하네스 전체
워크플로우 지도가 보이고 현재 작업 중인 노드에 표시가 들어온다. 하단에는 "지금 무엇을 하는지"가
사람용 한 줄 단위로 시간순으로 쌓인다. 사람은 긴 보고문을 읽지 않고 이 화면만 훑는다.

# 데이터 3층 구조

대시보드가 읽는 데이터는 세 층이고, 갱신 빈도와 기록 주체가 층마다 다르다.

1층 — 워크플로우 구조 (거의 불변, 스크립트가 생성)
- 하네스의 워크플로우/노드 선언을 파싱해 report/workflow.json 으로 내보내는 스크립트를 만든다.
- 형식: { nodes: [{ id, label, kind }], edges: [{ from, to }] }
- 워크플로우 선언이 바뀔 때만 다시 실행하면 된다.

2층 — 현재 위치 + 전환 이력 (저빈도, 메인 에이전트가 기록)
- report/state.json: 현재 상태 (덮어쓰기). 스키마:
  {
    "session_id": string,
    "current_node": string,        // workflow.json의 노드 id와 일치해야 함
    "task": string,                // 스펙/task 식별자
    "now": string,                 // 사람용 한 줄. 예: "study-mate 스펙의 DB 마이그레이션 작성 중"
    "since": ISO8601 timestamp,    // 이 상태가 시작된 시각
    "blockers": [{ "id": string, "label": string }]   // 사람 입력 대기 항목
  }
- report/transitions.jsonl: 상태가 바뀔 때마다 한 줄 append. 스키마:
  { "at": ISO8601, "from_node": string, "to_node": string,
    "task": string, "now": string, "result": string|null }
  - result 는 task 종료 전환에만 채운다 (예: "통과", "반려", "실패"). 그 외 전환은 null.
- 기록 시점 규칙: 노드 전환 시, task 시작/종료 시, blocker 발생/해소 시. 그 외에는 기록하지 않는다.
- state.json 을 쓰는 시점마다 transitions.jsonl 에도 한 줄을 쓴다. 두 기록은 항상 쌍으로 이뤄지며,
  한쪽만 기록되는 코드 경로가 있어서는 안 된다.
- 이 규칙과 두 스키마를 docs-contract에 한 절로 추가한다.

3층 — 활동 로그 (고빈도, hook이 자동 기록, 토큰 0)
- Claude Code hook(PostToolUse)으로 셸 스크립트를 등록한다.
- 스크립트는 stdin의 hook 입력에서 시각·툴 이름·대상 파일을 뽑아
  report/activity.jsonl 에 한 줄 append 한다. 모델 컨텍스트에는 아무것도 넣지 않는다.
- 로그 파일이 무한히 자라지 않도록 회전 규칙(예: 일 단위 파일 분리)을 넣는다.

# 렌더링

report/index.html 하나를 만든다. 제약:
- 빌드 도구 없음. 단일 HTML + CDN(Mermaid.js)만 사용.
- 3~5초 간격으로 workflow.json / state.json / transitions.jsonl / activity.jsonl 을 fetch 해 다시 그린다.
- 상단: Mermaid로 워크플로우 지도를 그리고 state.current_node 를 강조 표시.
  blockers 가 비어 있지 않으면 해당 표시를 "사람 입력 대기"로 구분되게 그린다.
- 하단: 피드. 기본 표시는 transitions.jsonl 의 전환 이력(한 줄 = 전환 하나, now 표시)이고,
  각 줄을 펼치면 그 시간 구간의 activity.jsonl 상세가 나온다.
- 모든 항목에 타임스탬프를 표시한다. 이 타임스탬프는 단계별 소요 시간 집계에 쓰인다.

실행 진입점: 로컬 정적 서버 실행 + 브라우저 열기를 명령 하나로 묶는다
(스크립트 또는 슬래시 커맨드, 킷 관례를 따를 것).

# 스킬의 일 (설치 절차)

스킬 실행 = 대상 프로젝트에 다음을 설치하고 종료:
1. report/ 디렉토리와 index.html, 구조 내보내기 스크립트 배치
2. hook 등록 (기존 hook 설정이 있으면 병합, 덮어쓰지 말 것)
3. docs-contract에 state·transitions 기록 규약 절 추가
4. kickoff 문서에 기록 시점 규칙 요약 추가 (에이전트가 규약을 알게)
5. workflow.json 1회 생성 + state.json 초기값 생성 + transitions.jsonl 빈 파일 생성
   (첫 전환 전 fetch에서 404로 렌더가 깨지지 않게)

intake 스킬과의 연계: intake가 프로젝트를 들여올 때 이 설치를 포함하도록
intake 쪽에 훅 지점을 만들거나, 불가하면 백로그로 등재한다.

# 경계 (이 스킬이 하지 않는 것)

- 요약·해석 생성 없음. 그것은 report-brief 스킬(별도, 현재 보류)의 일이다.
- 대시보드 렌더링·갱신 경로에 LLM 호출 없음. 서브에이전트로 "대시보드를 돌리는" 구조 금지.
- state.json 에 산문 보고를 쓰지 않는다. now 는 한 줄(80자 이내)로 제한.
  transitions.jsonl 의 now 에도 같은 제한이 적용된다.

# 완성 판정 — scripts/check-report.mjs 를 만들고 다음 프로브를 통과할 것

1. workflow.json 이 하네스 워크플로우 선언과 노드 수·엣지 수가 일치한다
2. state.json 스키마 검증 통과 (필수 필드, current_node가 workflow 노드에 존재)
3. hook 스크립트에 가짜 hook 입력을 stdin으로 넣으면 activity.jsonl 에 올바른 한 줄이 append 된다
4. index.html 이 외부 의존을 CDN 한 개 이외에 갖지 않는다 (빌드 산출물 없음)
5. state.json 의 current_node 를 바꾼 뒤 렌더 로직이 다른 노드를 강조하는지 확인
   (DOM 검증이 어려우면 렌더 함수를 순수 함수로 분리해 node 단위 테스트)
6. now 필드 80자 초과 시 검증 실패 (state.json·transitions.jsonl 양쪽)
7. 설치 절차를 임시 디렉토리에 돌렸을 때 기존 hook 설정을 보존하며 병합한다
8. 상태 전환을 3회 발생시키면 transitions.jsonl 에 3줄이 append 되고,
   그 줄들로부터 노드별 체류 시간이 계산된다. state.json 기록과 transitions.jsonl
   기록이 쌍으로 이뤄지지 않는 코드 경로가 없어야 한다.

계약 테스트 등재: check-report.mjs 는 이 스킬의 계약 테스트다. 이후 이 스킬의 구성 요소
(hook 스크립트·index.html·설치 절차·기록 규약)를 수정하는 모든 작업은 merge 전에
이 검사를 재통과해야 한다. 이 규칙을 백로그의 "계약 테스트 규약" 항목에 1호로 등재한다.

검사 통과 후: study-mate 에 설치해 드라이런하고, 발견 사항은 백로그에 등재한다.
확신이 없는 결정은 임의로 정하지 말고 질문 목록에 올려라.
```

---

## 프롬프트 2 — report-brief 스킬 (on-demand 요약, 유일한 LLM 구간) — 보류 중

> 실행 조건: 실전 투입 후 보고 피로가 실측될 것. 조건 충족 전에는 실행하지 않는다.

```
# 목표

report-brief 스킬을 만든다. 사람이 "지금 상황 요약해줘" 류의 요청을 했을 때만
서브에이전트가 상태 파일들을 읽고 짧게 답하는 스킬이다. 상시 실행 없음, 호출당 1회.

# 입력 (읽기 전용)

서브에이전트가 읽는 파일과 우선순위:
1. report/state.json — 현재 위치·now·blockers
2. report/transitions.jsonl — 마지막 N줄(기본 50)만. "직전 완료"와 result 의 유일한 출처.
3. report/activity.jsonl — 마지막 N줄(기본 50)만. 전체를 읽지 않는다.
4. 최신 HANDOFF.md — 존재하면
5. 프론티어/질문 목록 — 노드를 막는 항목만 추린다

이 스킬은 어떤 파일도 쓰지 않는다. 읽기 전용이 제1 제약이다.

# 출력 형식 (고정)

모드 2개:
- brief (기본): 정확히 4항목, 각 1~2문장.
  1) 현재 위치: 어느 노드에서 무엇을 하는 중인지
  2) 직전 완료: transitions.jsonl 에서 마지막으로 result 가 채워진 전환의 task와 그 결과
     (통과/실패 수치가 있으면 수치로)
  3) 다음 할 일: state와 프론티어에서 읽히는 다음 단계
  4) 사람 대기: blockers와 노드를 막는 질문. 없으면 "없음"이라고 명시.
- detail (요청 시): brief 4항목 + 항목별로 근거가 된 파일·줄을 덧붙인다.

형식 규칙:
- brief 는 전체 12문장을 넘지 않는다.
- 파일에 없는 내용을 추정으로 채우지 않는다. 모르면 "기록 없음"이라고 쓴다.
  activity.jsonl 로부터 완료 여부를 추측하는 것도 금지 — 완료의 출처는 transitions.jsonl 뿐이다.
- 수치(검사 통과 수, 보류 건수 등)는 원문 그대로 옮기고 반올림·재해석하지 않는다.

# 경계

- 조언·계획 제안 없음. 상태 서술만 한다. (계획은 사람이 메인 세션에서 묻는다)
- state 파일이 없거나 스키마가 깨져 있으면 요약을 지어내지 말고
  "report-dashboard 미설치 또는 state 손상"을 보고하고 종료한다.

# 완성 판정 — check-report.mjs 에 프로브 추가

1. 정상 state + transitions + 로그를 주면 brief 4항목이 전부 존재한다
2. blockers 가 빈 배열이면 4번 항목이 "없음"으로 나온다
3. state.json 을 지운 상태에서 호출하면 미설치 보고로 종료한다 (요약 생성 금지 확인)
4. activity.jsonl 이 1만 줄이어도 마지막 N줄만 읽는다 (읽기 범위 확인)
5. transitions.jsonl 에 result 가 채워진 줄이 하나도 없으면 2번 항목이 "기록 없음"으로 나온다

검사 통과 후 study-mate 에서 1회 호출해 출력 형식을 확인하고, HANDOFF에 결과를 남겨라.
```