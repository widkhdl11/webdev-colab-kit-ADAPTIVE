# 서브에이전트 「실행 중」이 화면에 안 뜨는 것 고치기 (2026-09-15)

## 지금 하실 일

1. 고쳐 둔 정본이 정말 통과하는지 먼저 봅니다(붙이기 전에 확인하는 것이라 아무것도 안 바뀝니다):

```
node docs/references/pending-patches/2026-09-15-subagent-end-timing/verify.mjs --source
```

**4/4 가 나옵니다.**

2. 훅을 붙입니다:

```
cp .claude/skills/report-dashboard/assets/report-subagent.mjs .claude/hooks/report-subagent.mjs
```

3. 같은 검사를 사본에 대고 돌립니다:

```
node docs/references/pending-patches/2026-09-15-subagent-end-timing/verify.mjs
```

**붙기 전 1/4, 붙은 뒤 4/4 입니다.** 그리고 `node scripts/check-report.mjs` 가 155/155 로
돌아옵니다(지금은 154/155 이고, 실패하는 한 줄이 이 사본 대조입니다).

되돌리기: 이 저장소의 이전 커밋에서 `.claude/hooks/report-subagent.mjs` 를 되돌리면 됩니다.

### 선택 — `settings.json` 정리 (안 해도 됩니다)

`PostToolUse` 의 `Task|Agent` → `report-subagent.mjs` 줄은 이제 아무 일도 안 합니다(훅이 그
이벤트를 버립니다). 빼면 툴 호출마다 프로세스 하나를 덜 띄웁니다. **안 빼도 동작은 같습니다.**

---

## 무엇이 문제였나

**서브에이전트 칸이 언제나 「대기」다.** 실제로 돌고 있을 때도 그렇다.

2026-09-15 에 `code-reviewer` 와 `ui-reviewer` 를 파견하고 `subagents.jsonl` 을 봤다:

```
02:49:32  start  code-reviewer
02:49:33  end    code-reviewer     ← 0.4초 뒤. 이때 에이전트는 아직 돌고 있었다
02:49:51  start  ui-reviewer
02:49:51  end    ui-reviewer
02:54:21  end    code-reviewer     ← 진짜 종료 (SubagentStop)
02:55:28  end    ui-reviewer       ← 진짜 종료 (SubagentStop)
```

훅은 멀쩡히 반응한다. 틀린 것은 **배선의 뜻**이다.

`PostToolUse` 는 「서브에이전트가 끝났다」가 아니라 **「그것을 띄우는 툴 호출이 돌아왔다」**에서
뛴다. 배경으로 도는 에이전트에서는 그게 시작 직후다. 그래서 화면은 시작 0.4초 뒤부터 그
에이전트를 「대기」로 그린다.

**같은 로그가 고치는 방법도 알려 준다** — 02:54:21·02:55:28 의 두 줄이 `SubagentStop` 에서 왔고,
거기에 에이전트 이름이 실려 있다. 이것을 못 봤으면 이 패치를 쓰지 않았을 것이다.
「`PostToolUse` 를 떼면 `SubagentStop` 이 받아 준다」는 추측이었을 테고, 안 뛰면 화면이 영영
「작업 중」으로 남는다 — 지금과 반대 방향의 같은 크기 거짓말이다.

## 무엇이 바뀌나

`report-subagent.mjs` 한 군데다.

```js
// PostToolUse 로 온 것은 버린다 — 시작 직후에 뛰는 이벤트라 종료로 쓸 수 없다.
if (event !== "PreToolUse" && event !== "SubagentStop") return;
```

배선의 뜻이 이렇게 된다:

| 이벤트 | 전 | 후 |
|---|---|---|
| `PreToolUse` (에이전트를 띄우는 툴) | start | start |
| `PostToolUse` (같은 툴) | **end** | 아무것도 안 씀 |
| `SubagentStop` | end | end |

## 부분 적용 — 어느 순서로 해도 안전하다

이 패치는 파일 둘을 건드릴 수 있어서(훅 · 선택적으로 settings.json) 조합을 따로 확인했다.

| 훅 복사 | settings 정리 | 무슨 일이 일어나나 |
|---|---|---|
| ○ | ○ | 정상. `SubagentStop` 만 end 를 쓴다 |
| ○ | ✗ | **정상.** `PostToolUse` 가 훅을 부르지만 훅이 그 입력을 버린다 |
| ✗ | ○ | **정상.** 옛 훅이 그대로지만 `PostToolUse` 로 불리지 않는다 |
| ✗ | ✗ | 지금 상태(버그). 시작 0.4초 뒤에 end 가 찍힌다 |

어느 한쪽만 붙어도 고쳐지는 이유는 **두 변경이 같은 경로를 각각 다른 끝에서 끊기** 때문이다.
그래서 순서를 정해 드리지 않는다.

## 이 패치가 막지 못하는 것

`SubagentStop` 이 어떤 이유로 안 뛰면 그 에이전트는 화면에서 **영영 「작업 중」**으로 남는다.
지금까지의 반대 방향이다. 2026-09-15 실측에서 두 번 다 뛰는 것을 봤지만, 그것은 **배경으로 띄운
에이전트 두 개**의 경우다. 다른 띄우기 방식에서도 뛰는지는 아직 못 봤다.

지켜볼 신호: 서브에이전트 칸이 몇 시간째 「작업 중」인데 아무 일도 안 일어날 때.
그때는 `subagents.jsonl` 의 마지막 줄을 본다 — `start` 만 있고 짝이 없으면 이 경우다.
