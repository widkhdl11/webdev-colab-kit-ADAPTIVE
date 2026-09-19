---
name: report-dashboard
description: 작업을 시켜 놓고 브라우저 탭 하나로 진행을 지켜보는 실시간 대시보드를 프로젝트에 설치하는 1회성 절차 — 긴 보고문을 읽는 대신 지도와 한 줄 피드를 훑게 만든다. 신호는 사용자가 진행 상황을 상시로 보고 싶다고 할 때, 또는 보고가 길어서 읽히지 않을 때. 설치 후의 동작에는 LLM 이 전혀 관여하지 않는다 — 요약·해석이 필요하면 그건 다른 물건이다.
argument-hint: [프로젝트 slug]
---
# 진행 대시보드 설치

목표: 대상 프로젝트에 `projects/<slug>/report/` 를 세우고, 브라우저 탭 하나로 **지금 어느
노드에서 무엇을 하는 중인지**와 **지금까지 무엇을 했는지**가 보이게 만든다.

**제1 제약: 설치가 끝난 뒤의 대시보드 동작에는 LLM 이 한 번도 끼지 않는다.** 화면은 파일을
읽어서 그리고, 파일은 스크립트와 훅이 쓴다. 서브에이전트로 대시보드를 "돌리는" 구조를 만들지 않는다.

## 데이터 세 층 — 갱신 빈도와 쓰는 주체가 층마다 다르다

| 층 | 파일 | 쓰는 주체 | 언제 |
|---|---|---|---|
| 1 구조 | `report/workflow.json` | `scripts/export-workflow.mjs` | 워크플로우 선언·바인딩·에이전트 정의가 바뀔 때 |
| 2 현재 위치·이력 | `report/state.json` · `report/transitions.jsonl` | `scripts/report-note.mjs` | 노드 전환 · task 시작/종료 · blocker 발생/해소 |
| 2' 요청 | `report/request.json` · `report/requests-history.jsonl` | `scripts/report-request.mjs` | 요청 시작 · 항목 완료 · 상태 변경 · 끝내기 |
| 3 활동 | `report/activity.jsonl` | `.Codex/hooks/report-activity.mjs` (PostToolUse) | 툴이 돌 때마다. 토큰 0 |
| 3' 서브에이전트 | `report/subagents.jsonl` | `.Codex/hooks/report-subagent.mjs` | 서브에이전트 시작·종료. 토큰 0 |

스키마 정본은 `docs/references/report-contract.md` 다. **여기 적힌 것을 바꾸려면 그 문서를 먼저 고친다.**

### 요청 층 — 범위는 시작 시점에 얼어붙는다

화면 맨 위가 답하는 질문은 지도와 다르다. 지도는 「어느 노드에 있나」이고, 요청 층은
**「내가 시킨 것 대비 어디까지 왔고, 시킨 것 밖으로 나갔나」**다.

```
node scripts/report-request.mjs --start --task <식별자> --request "<사람이 시킨 문장 원문>" \
     --items "항목1|항목2|항목3"          # 스펙이 있으면 --spec <스펙 경로>
     --goal "<왜 하는지 한 줄>"           # 스펙·Intent 에 목표가 있으면 옮긴다. 없으면 생략
     --title "<한 줄 제목 40자 이내>"     # 사람에게 확인받은 제목. 확인 전이면 생략
node scripts/report-request.mjs --done I2
node scripts/report-request.mjs --status "승인 대기" --reason "결제 중 새 스펙 발견"
node scripts/report-request.mjs --finish 완료
```

- `--request` 는 **사람이 쓴 문장 그대로** 적는다. 요약하거나 고쳐 쓰지 않는다.
- `--title` 은 화면 맨 위 한 줄을 대표하는 제목이다. 요청 문장에서 제안하고 **사람이 확인한
  뒤에** 적는다. 확인 전이면 생략하고, 화면은 원문 앞 40자를 대신 쓴다. 원문은 그대로 남는다 —
  제목은 원문을 바꾸는 것이 아니라 대표하는 것이다. `items` 처럼 시작 후에는 안 바뀐다.
- `--goal` 은 "왜"다("무엇"인 `--request` 와 다른 칸이다). 스펙이나 `Intent.md` 에 목표 절이
  있으면 거기서 옮기고, 없으면 사람이 말한 한 줄을 적는다. **요청 문장에서 지어내지 않는다** —
  없으면 생략하고, 화면은 「기록 없음」으로 그린다.
- `--spec` 을 주면 항목이 그 스펙의 **불변식**에서 자동으로 온다.
- **`--items` 의 순서가 곧 작업 순서다.** 화면의 단계 띠가 이 순서를 그대로 그린다. 시작할 때
  순서를 어떻게 잡을지는 되돌리기 싼 결정이라 물어서 정하지 않는다 — 정해서 적는다.
  순서 없는 기록은 없다.
  시작 후 재배열은 항목 추가와 똑같이 거부된다.
- **시작 후 항목은 못 바꾼다.** 새로 생긴 일은 항목이 아니라 전환의 `--item` 에 적고,
  그러면 화면이 「요청 밖 작업」으로 분류한다. 나간 것을 목록에 넣으면 안 나간 것이 되므로,
  이 금지가 곧 파생 판별의 근거다.

작업 줄에 어느 항목인지 같이 적는다:

```
node scripts/report-note.mjs --node implement --task <식별자> --now "<한 줄>" --item "항목1"
```

### 한 항목에 오래 머물 때 — 사유를 한 줄 남긴다

한 항목의 체류가 임계(`report/config.json` 의 `dwell_threshold_min`, 기본 30분)를 넘으면,
그 뒤 **첫 기록에** 왜 오래 걸리는지 한 줄(80자 이내)을 같이 적는다.

```
node scripts/report-note.mjs --node implement --task <식별자> --now "<한 줄>" --item "항목1" \
     --delay-reason "마이그레이션 재실행이 매번 3분 걸린다"
```

- 이 줄은 **판정이 아니라 대조용**이다. 화면은 이것을 기계 집계(검사 실패 횟수·요청 밖 작업
  비중·블로커 대기·활동 공백·서브에이전트) 옆에 나란히 놓고, 원인은 판정하지 않는다.
- 항목이 바뀌면 스크립트가 자동으로 지운다. 손으로 지울 필요도, 지우는 것을 기억할 필요도 없다.

### 스킬 표시 — 출처는 바인딩 파일 하나

「어느 노드에서 어느 스킬을 쓰는가」는 `docs/references/node-skills.json` 에만 있다
(형식은 `docs/references/docs-contract.md` 8절). **스킬 문서도, 스크립트 코드도 이 관계를 모른다** —
스킬이 노드 id 를 알면 노드 구성이 다른 하네스로 그 스킬을 옮길 수 없고, 코드에 묻힌 지도는 낡는다.

`export-workflow.mjs` 가 그 파일을 읽어 `workflow.json` 에 두 방향으로 싣는다: 노드마다
`skills` 배열(지도가 읽는다)과 최상위 `skills` 목록(사이드바가 읽는다).

낡는 것은 검사가 막는다 — 스킬 디렉터리가 생겼는데 바인딩에 없으면, 바인딩이 없는 노드나
스킬을 가리키면, `contract` 경로에 파일이 없으면 각각 다른 항목으로 실패한다.

**지금 쓰는 중인 스킬**은 기록할 때 같이 적는다: `--skill <이름>`. 안 적으면 「안 쓰는 중」이고,
앞 상태에서 물려받지 않는다 — 물려받으면 끝난 스킬이 화면에서 계속 초록으로 남는다.

### 2층의 기록 규칙 — 쓰는 자리는 하나뿐이다

`state.json` 을 쓰는 시점마다 `transitions.jsonl` 에도 한 줄이 붙는다. 이 둘은 **항상 쌍으로**
기록되고, 한쪽만 쓰는 코드 경로가 있어서는 안 된다. 그래서 쓰는 함수를 `scripts/report-note.mjs`
하나로 두고, 다른 자리에서 `state.json` 을 쓰지 않는다는 것을 계약 테스트가 검사한다.

```
node scripts/report-note.mjs --node implement --task auth-session --now "로그인 폼 구현 중"
node scripts/report-note.mjs --node qa --task auth-session --now "INV-A1 테스트 도는 중" --result 통과
node scripts/report-note.mjs --node qa --task auth-session --now "제목 범위 답 기다리는 중" --blocker p17=모집글 제목 범위
```

**제품 그래프 밖의 일**(킷 고치기 등)은 `--node` 대신 `--off-graph` 로 적는다:

```
node scripts/report-note.mjs --off-graph "킷 스크립트 수정" --task <식별자> --now "<한 줄>"
```

그러면 지도에서 아무 상자도 안 빛나고 상단에 그 한 줄이 뜬다. 노드 이름을 하나 골라 적지
않는 이유는 그러면 지도가 틀린 상자를 빛내기 때문이다 — 모른다고 말할 자리가 없으면 아무
값이나 들어가고, 그 값은 틀렸다는 신호를 어디에도 안 남긴다.

`--now` 는 **80자 이내 한 줄**이다. 산문 보고를 쓰는 자리가 아니다 — 넘으면 기록이 거부된다.
`--result` 는 task 가 끝나는 전환에만 채운다(`통과`·`반려`·`실패`). 그 외에는 비운다.

## escalate 등급 결정에는 결정 카드를 같이 쓴다

되돌리기 비싼 결정(스펙 승인·사인오프·범위 결정·새 시각 방향)을 채팅으로 올릴 때,
**같은 턴에** 결정 카드와 근거 본문을 같이 기록한다. 등급의 정의는
`docs/references/decision-layer.md` 2절에 있다:

```
node scripts/report-decision.mjs --ask --id <사이클id-d연번> --task <식별자> \
  --options "착수해|아니" --what "…" --why "…" --visible "…" --risk "…" \
  --not-doing "…" [--also-fixing "…"] --done-when "문장1|문장2" \
  --details-ref "…" --detail-file <근거 본문 md>
node scripts/report-note.mjs --blocker "<같은 id>=<무엇을>" --node … --task … --now "…"
```

답이 오면 같은 턴에 `--answer "<사람이 고른 말>"` 로 닫고 `--clear-blockers` 로 대기를 푼다.

칸을 채우는 말은 **사용자 말이어야 한다** — 파일 경로·규칙 번호·단계 이름·라이브러리 이름은
카드에 안 쓰고 근거 본문에만 쓴다. 기계가 판정하므로 어기면 기록이 거부된다.
사소한 판단은 카드 없이 그냥 진행한다. 규약: `docs/references/report-contract.md` 12절.

## 설치 절차

0. **slug 확인** — 인자로 받거나 루트 `ACTIVE` 를 읽는다. `projects/<slug>/` 가 없으면 멈추고 묻는다.
1. **자산 복사** — `assets/index.html` · `assets/render.mjs` · `assets/ui-vocab.mjs` 셋을
   `projects/<slug>/report/` 로 복사한다.
   정본은 이 스킬의 `assets/` 이고 `report/` 쪽은 사본이다. 둘이 갈라지면 계약 테스트가 잡는다 —
   고칠 때는 정본을 고치고 다시 설치한다.
2. **1층 생성** — `node scripts/export-workflow.mjs <slug>`
2'. **임계값 파일** — `projects/<slug>/report/config.json` 을 기본값으로 만든다:
   `{ "dwell_threshold_min": 30, "activity_gap_min": 10 }` (뜻은 report-contract 11절).
   없어도 화면은 기본값으로 돌지만, 파일이 있어야 프로젝트가 값을 바꿀 자리를 안다.
2''. **금지 표현 표** — `assets/decision-vocab.json` 을 `projects/<slug>/report/` 로 복사한다.
   **이미 있으면 덮지 않는다** — 설치본이 정본이고 사람이 한 줄씩 늘리는 파일이라, 재설치가
   늘린 줄을 지우면 아무도 다시 안 늘린다. 이 표는 커밋한다.
3. **2층 초기값** — `state.json` 과 빈 `transitions.jsonl` · `activity.jsonl` 을 만든다.
   빈 파일을 미리 만드는 이유는 첫 전환 전의 `fetch` 가 404 로 화면을 깨뜨리지 않게 하려는 것이다.
   `scripts/report-note.mjs` 의 `seed()` 가 이 일을 한다.
4. **훅 등록은 사용자에게 넘긴다** — 아래 「훅은 내가 붙이지 않는다」 참고.
5. **`.gitignore` 에 기록 파일 제외** — `projects/<slug>/report/*.jsonl` 과 `state.json` 은 과정
   기록이라 커밋하지 않는다. `workflow.json` · `index.html` · `render.mjs` · `ui-vocab.mjs` ·
   `config.json` · `decision-vocab.json` 은 커밋한다. `decision.json` 과
   `decision-detail.md` 는 과정 기록이라 커밋하지 않는다.
6. **검사** — `node scripts/check-report.mjs --project <slug>` 가 전부 통과해야 끝난 것이다.
7. **띄워 보기** — `node scripts/report-serve.mjs --project <slug>`

## 훅은 내가 붙이지 않는다

3층(활동)과 3'층(서브에이전트)을 켜려면 `.Codex/hooks/` 에 훅 파일이 있어야 하고
`.Codex/settings.json` 에 그 명령이 들어가야 한다. 이 레포에서 그 둘은 **사용자가 직접
고치는 자리**다.

그래서 스킬은 설정을 건드리지 않고 두 가지만 한다:

- `assets/report-activity.mjs` 를 그대로 두고 **어디에 복사하면 되는지** 알려 준다
- `node scripts/report-install-hook.mjs` 로 **병합된 settings.json 을 출력만** 한다.
  기존 훅을 하나도 지우지 않고, 두 번 돌려도 두 벌이 생기지 않는다.

붙이기 전까지 `activity.jsonl` 은 빈 파일이고, **1·2층만으로 대시보드는 그대로 돈다** —
지도와 전환 피드가 보이고 각 줄을 펼쳤을 때 "이 구간의 활동 기록 없음"이 나올 뿐이다.
패치를 넘길 때는 붙기 전에 실패하고 붙은 뒤에 통과하는 검사를 같이 준다.

## 경계 — 이 스킬이 하지 않는 것

- **요약·해석을 만들지 않는다.** 화면은 기록된 것만 보여 준다. "지금 상황 요약해 줘"에 답하는
  것은 별개의 물건이고 지금은 만들지 않는다 — 실전에서 보고 피로가 실측된 뒤에 연다.
- **대시보드 렌더링·갱신 경로에 LLM 호출이 없다.**
- **`state.json` 에 산문을 쓰지 않는다.** `now` 는 80자 한 줄이다.
- **원본 프로젝트 코드를 건드리지 않는다.** 산출물은 `report/` 안과 `.gitignore` 한 줄뿐이다.

## 화면 기준 — 읽는 순서와 어휘

화면은 **사람이 묻는 순서**로 놓인다: 지금 뭐 하나 → 어디까지 왔나 → 막힌 것 있나 → 나머지.
절 순서는 「지금」·「진행」·「특이사항」이 먼저고, 서브에이전트·파이프라인 지도·활동 피드는
접힌 절이다(서브에이전트는 실행 중인 것이 있으면 자동으로 펼쳐진다).

규칙 둘이 렌더 전체에 걸린다.

1. **모든 값에 라벨이 붙는다.** 값만 있는 칸도, 점(·)으로 이어 붙인 무라벨 나열도 없다.
   그래서 `render.mjs` 의 절 함수들은 문자열이 아니라 `{ label, value }` 줄의 배열을 돌려준다.
2. **화면에 나가는 말은 `assets/ui-vocab.mjs` 에서만 온다.** 하네스 내부 용어는 화면에
   나오지 않는다. 문구가 어색하면 고칠 자리는 그 파일 한 곳이고, 화면 코드를 읽을 일이 없다.

계약 테스트가 둘 다 전수로 본다(24·25절) — 어휘표 밖의 라벨이나 내부 용어가 화면 문자열로
나가면 잡힌다. 기록 파일에서 실려 온 값(요청 원문·`now`·항목 이름)은 그 규칙 밖이다:
사람이 적은 문장을 화면이 고쳐 쓰지 않는다.

## 화면 기준

대비·글자 크기·키보드·스크린리더·폭의 기준은 `docs/references/devtool-ui-standards.md` 다.
**제품용 `design-rules.md` 와 별개 문서다** — 개발 도구는 시각 정체성이 필요 없고 읽히는가만
필요하다. 화면을 고친 뒤 그 문서 7절의 체크리스트를 사람이 본다(대비·키보드·스크린리더는
이 레포에 자동 검사가 없다).

## 계약 테스트

`scripts/check-report.mjs` 가 이 스킬의 계약 테스트다. 훅 스크립트·`index.html`·`render.mjs`·
설치 절차·기록 규약 중 **무엇을 고치든 고친 뒤에 이 검사를 다시 통과해야 한다.**

항목마다 위반을 일부러 심어 잡히는 것까지 본다. 이 화면은 틀렸을 때의 증상이 에러가 아니라
**그럴듯한 화면**이라서 — 노드가 엉뚱한 데서 빛나거나 체류 시간이 조용히 틀리거나 활동 줄이
그냥 안 쌓인다 — "위반 0건"과 "검사가 안 돌았다"를 눈으로 구별할 수 없다.

## 규약이 없는 자리는 등급으로 가른다

설치 중에 규약이 안 정해진 자리를 만나면 되돌리는 비용으로 가른다. 파일 이름·문구·검사 구성처럼
되돌리기 싼 것은 실무 표준으로 정하고 로그에 남긴다. 화면이 무엇을 말하는지를 바꾸는 것 —
어느 값을 어느 칸에 넣을지, 무엇을 「요청 밖」으로 볼지 — 은 되돌리기 비싸므로 결정 카드로
올린다(올려도 나머지 설치는 계속 간다). 이 화면은 사람이 보고 대신 믿는 물건이라, 틀린 채로
돌아가면 틀렸다는 사실 자체가 안 보인다.
