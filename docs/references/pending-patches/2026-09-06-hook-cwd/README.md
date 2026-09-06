# 패치 — 훅이 프로젝트 폴더에서 안 돈다

보호 파일이라 직접 못 고친다. 아래를 직접 적용하고, 검사로 판정하면 된다.

## 무슨 일이 일어나고 있나

`.claude/settings.json` 의 훅 **일곱 개가 전부** `node <상대경로>` 로 적혀 있다.

```
node .claude/hooks/protect-files.mjs
node gates/run-gates.mjs --quick
node gates/graph-stop.mjs
...
```

세션의 작업 폴더가 `projects/study-mate` 로 옮겨가면 그 폴더에 `.claude/` 도 `gates/` 도
없으니 Node 가 파일을 못 찾고 죽는다. 그때 나오는 것이 화면에 계속 뜨던 줄이다:

```
PreToolUse:Bash hook error
Failed with non-blocking status code: node:internal/modules/cjs/loader:1424
```

**`non-blocking` 이라 도구는 그대로 실행된다.** 그래서 명령은 다 성공했고, 훅만 조용히
아무 일도 안 했다. 죽은 것은 셋이 아니라 일곱이다:

| 훅 | 안 돌면 무엇이 없어지나 |
|---|---|
| `protect-secrets` | `.env` 내용 출력·환경변수 덤프 차단 |
| `protect-files` | 보호 파일(gates·graph.mjs·훅·settings.json) 편집 차단 |
| `block-danger` | `rm -rf` · force push · hard reset · 원격 스크립트 파이프 실행 차단 |
| `run-gates --quick` | **편집할 때마다 도는 게이트** |
| `check-hooks-on-edit` | 훅 자체가 성한지 보는 검사 |
| `graph-stop` (Stop) | **턴마다 그래프 상태·프론티어 갱신** |
| `briefing` (SessionStart) | 세션 브리핑 (루트에서 시작하므로 이번엔 돌았다) |

## 고치는 법

훅 명령의 스크립트 경로를 **절대 경로**로 바꾼다. 일곱 줄 전부다.

적용할 파일을 만들어 뒀다 — 그대로 덮어쓰면 된다:

```
docs/references/pending-patches/2026-09-06-hook-cwd/settings.patched.json  →  .claude/settings.json
```

바뀌는 것은 `"command"` 값 일곱 개뿐이고 나머지는 글자 하나 안 건드렸다:

```diff
- "command": "node .claude/hooks/protect-files.mjs"
+ "command": "node \"C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/.claude/hooks/protect-files.mjs\""

- "command": "node gates/run-gates.mjs --quick"
+ "command": "node \"C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/gates/run-gates.mjs\" --quick"
```

(인자 `--quick` 은 따옴표 **밖**에 둔다. 안에 넣으면 그게 파일 이름의 일부가 된다.)

### 왜 `$CLAUDE_PROJECT_DIR` 를 안 쓰나 — 해 보고 뺐다

먼저 `node "$CLAUDE_PROJECT_DIR/.claude/hooks/…"` 로 만들어 검사를 돌렸다. **①은
통과하는데 ②에서 셋 다 죽었다** — 명령을 실행하는 셸이 그 변수를 안 푼다(그러면 경로가
`$CLAUDE_PROJECT_DIR/...` 라는 이름의 폴더가 된다). Windows 라면 `%VAR%` 여야 하고,
그건 반대로 bash 에서 안 풀린다. **어느 한 형태도 셸에 무관하지 않다.**

절대 경로는 셸이 무엇이든 그대로 통한다. 대가는 **레포를 다른 경로로 옮기면 깨지는 것**이고,
그건 아래 검사가 즉시 잡는다(옮긴 뒤 한 번 돌리면 일곱 줄이 전부 ✘ 로 뜬다).

## 판정 — 코드를 안 읽어도 된다

```
cd C:/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE
node docs/references/pending-patches/2026-09-06-hook-cwd/check-hook-cwd.mjs
```

이 검사는 `settings.json` 에 **적힌 명령을 그대로 읽어서** `projects/study-mate` 에서
실행한다. 세 겹이다.

1. **훅 파일이 그 폴더에서 보이는가** — 일곱 개 전부
2. **훅이 실제로 도는가** — 무해한 입력에 종료코드 0 (부작용 없는 셋만 실행한다.
   게이트와 Stop 훅은 파일을 쓰므로 존재만 본다)
3. **훅이 판정까지 하는가** — **일부러 심은 위반 셋**에 종료코드 2 가 나오는지
   (보호 파일 편집 · `rm -rf` · 환경변수 덤프)

3번이 있는 이유: 훅이 죽어서 아무것도 안 막는 상태와, 훅이 돌면서 통과시킨 상태는 겉이 같다.
위반을 심어 봐야 갈린다.

### 적용 전 (지금)

```
실패 13건 — 그 폴더에서 훅이 안 돈다(또는 판정을 못 한다).
```

### 적용 후 (후보 파일로 미리 돌린 결과)

```
③ 훅이 판정하는가 (일부러 심은 위반 → 어느 훅이든 종료코드 2)
  ✔ 보호 파일 편집  →  종료코드 [0, 2, 0]
  ✔ rm -rf         →  종료코드 [0, 0, 2]
  ✔ 환경변수 덤프   →  종료코드 [2, 0, 0]

통과 — 프로젝트 폴더에서도 훅이 보이고, 돌고, 위반을 실제로 막는다.
```

**2 가 매번 다른 자리에 있는 것**이 근거다 — 셋이 각자 제 몫을 잡았다는 뜻이고, 하나가
전부를 막고 있는 것이 아니다.

적용 전에 후보 파일만 따로 검사할 수도 있다:

```
node docs/references/pending-patches/2026-09-06-hook-cwd/check-hook-cwd.mjs "docs/references/pending-patches/2026-09-06-hook-cwd/settings.patched.json"
```

### 절반만 적용되면

일곱 줄 중 몇 개만 고쳐도 검사는 **줄 단위로** 결과를 낸다 — 안 고친 줄이 ✘ 로 남는다.
「몇 건 통과」가 아니라 어느 훅이 아직 상대 경로인지가 그대로 보인다.

## 이 검사를 영구 게이트로 올릴 것인가

지금은 스크래치패드의 일회용 스크립트다. 상시 게이트로 만들려면 `gates/` 에 들어가야 하고
그것도 보호 파일이라 같은 절차를 한 번 더 타야 한다. **먼저 이 패치로 구멍을 닫고,
게이트 승격은 따로 판단하시면 된다** — 하네스 승격 백로그에 올려 두겠다.
