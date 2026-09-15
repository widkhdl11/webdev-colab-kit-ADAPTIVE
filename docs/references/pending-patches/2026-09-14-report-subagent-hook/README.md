# 서브에이전트 기록 훅 + 활동 훅 matcher 넓히기 (2026-09-14)

## 지금 하실 일

**순서가 중요하다. ①을 먼저 하고 ②를 한다.** 이유는 아래 「부분 적용」에 있다.

1. 훅 파일을 복사한다:

```
cp .claude/skills/report-dashboard/assets/report-subagent.mjs .claude/hooks/report-subagent.mjs
```

2. 배선된 설정을 만들어 `.claude/settings.json` 에 반영한다:

```
node scripts/report-install-hook.mjs
```

**출력만** 한다. 그 내용으로 `.claude/settings.json` 을 바꾼다. 기존 훅은 하나도 안 지우고,
두 번 돌려도 두 벌이 생기지 않는다.

3. 검사를 돌린다:

```
node docs/references/pending-patches/2026-09-14-report-subagent-hook/verify.mjs
```

**10/10 이면 붙은 것이다. 붙기 전에는 6/10 이 나온다** (A·B·C·D 가 실패한다).

되돌리기: `.claude/hooks/report-subagent.mjs` 를 지우고 `settings.json` 에서 관련 줄을 뺀다.

---

## 무엇이 문제였나

**서브에이전트 호출이 기록에 한 줄도 안 남는다.** 2026-09-14 에 `code-reviewer` 를 실제로
파견했는데 `activity.jsonl` 89줄에 흔적이 없었다(Bash 44 · Write 15 · Edit 15).

**훅이 죽은 게 아니라 배선이 좁았다.** `settings.json` 의 활동 훅 matcher 가

```
"matcher": "Edit|Write|MultiEdit|Bash|PowerShell"
```

이고, 서브에이전트를 띄우는 툴이 그 목록에 없다. 그래서 이 패치는 두 가지를 한다 —
**서브에이전트 전용 훅을 새로 붙이고, 활동 훅의 matcher 를 넓힌다.**

## 훅이 무엇을 하나

`report-subagent.mjs` 는 `projects/<ACTIVE>/report/subagents.jsonl` 에 한 줄을 덧붙인다.

```json
{ "at": "...", "event": "start", "agent": "code-reviewer", "brief": "지시문 첫 줄" }
```

- `PreToolUse` 면 `start`, 그 외(`PostToolUse` · `SubagentStop`)면 `end`.
- **에이전트 이름을 못 찾으면 아무것도 안 쓴다.** 툴 이름을 하나로 박지 않고
  「에이전트 종류처럼 보이는 필드가 입력에 있나」로 판별한다 — 툴 이름은 하네스마다 다르고,
  이름을 박으면 그게 바뀐 날 조용히 멎는다.
- `brief` 는 지시문 **첫 줄을 자른 것**이다. 요약하지 않는다 — 요약하려면 모델을 불러야 하고
  그러면 화면에 LLM 이 끼어든다.
- 모델 컨텍스트에는 아무것도 안 넣는다. 실패해도 종료 코드 0이다.

## 부분 적용 — 조합 넷을 하나씩

이 패치는 파일 둘을 고친다(훅 파일 · 설정).

| 훅 파일 | 배선 | 무슨 일이 일어나나 | 안전한가 |
|---|---|---|---|
| 없음 | 없음 | 지금 상태. 서브에이전트 칸이 전부 「대기」로만 보인다 | 안전 |
| 있음 | 없음 | 아무 일도 안 일어난다. 아무도 그 파일을 안 부른다 | 안전 |
| 없음 | **있음** | **서브에이전트를 띄울 때마다 stderr 에 모듈 없음 오류** | 시끄럽다 |
| 있음 | 있음 | 서브에이전트 칸이 실제로 돈다 | 안전 |

**위험한 조합은 셋째 하나뿐이고, 작업을 막지는 않는다.** 훅이 종료 코드 1로 죽는데 그 값은
차단이 아니라 경고다(차단은 2다). 훅 파일을 복사하면 바로 멎는다.

설계로 없애지 못한 이유는 앞선 활동 훅 패치와 같다 — 훅 스크립트를 안 지켜지는 폴더에 두면
이 조합이 사라지지만, 매 툴 호출마다 도는 코드를 모델이 승인 없이 고칠 수 있게 된다.
**시끄러운 실패를 받고 조용한 우회로를 막는 쪽을 골랐다.** 대신 적용 순서를 ①②로 고정했다.

## 검사가 보는 것 — 열 항목

| 항목 | 무엇 | 붙기 전 |
|---|---|---|
| A 파일 | 훅이 `.claude/hooks/` 에 있다 | 실패 |
| B 내용 | 붙은 훅이 정본과 같다 | 실패 |
| C 배선 | 어느 이벤트든 이 훅을 부른다 | 실패 |
| D matcher | 서브에이전트를 띄우는 툴이 matcher 에 들어 있다 | 실패 |
| E 보존 | 기존 훅 여덟이 전부 남아 있다 | 통과 |
| F 중복 | 배선이 두 벌로 안 들어갔다 | 통과 |
| G 프로브(기록) | start 는 PreToolUse 가, end 는 SubagentStop 이 쓰고 PostToolUse 는 안 쓴다 | 통과 |
| H 프로브(툴 구분) | 서브에이전트가 아닌 툴 호출은 기록 안 한다 | 통과 |
| I 프로브(깨진 입력) | 깨진 입력에도 종료 코드 0이다 | 통과 |
| J 계약 | `scripts/check-report.mjs` 가 여전히 통과한다 | 통과 |

> 2026-09-15: 이 패치의 종료 시점 판정은 `2026-09-15-subagent-end-timing` 패치가 바꿨다
> (PostToolUse → SubagentStop). G·H 는 그 뒤의 동작을 검사하도록 갱신했다. 갱신 전에는
> 올바로 붙은 훅에 대해서도 G·H 가 실패해서, 검사 결과가 「훅이 고장났다」로 읽혔다.

**G~I 는 패치와 무관하게 항상 통과해야 한다.** 검사가 아예 안 도는 것과 「위반 0건」은 겉이
같아서, 잡을 줄 아는지를 따로 봐야 한다.

## 관련 문서

- 스키마와 기록 규약: `docs/references/report-contract.md` 8절
- 화면 기준: `docs/references/devtool-ui-standards.md`
- 계약 테스트: `scripts/check-report.mjs`
