# 2026-09-17 — 전환의 자동 기록(A)과 기록 규약의 거부(B)

> **적용 완료 (2026-09-17).** 둘 다 붙었고 `--require-wiring` 판정이 통과한다.
> `check-measurement-gap.mjs` 의 역할도 `standing` 으로 올렸다. 아래는 무엇을 왜 붙였는지의 기록이다.

보호 파일 두 개를 고친다. **둘은 서로를 필요로 하지 않는다** — 하나만 붙여도 안전하고,
어느 쪽이 붙었는지에 따라 무엇이 살아나는지가 아래 표에 있다.

| 무엇 | 파일 | 없으면 |
|---|---|---|
| A. 전환 자동 기록 | `gates/graph-stop.mjs` | 지금과 같다 — 손으로 안 치면 위치가 안 남는다 |
| B. 기록 규약 거부 | `gates/run-gates.mjs` | 규약을 어겨도 아무 일도 안 일어난다(신고만) |

---

## 적용 전 판정 (지금 돌리면 실패한다)

```
node scripts/check-turn-transition.mjs --require-wiring
node scripts/check-measurement-gap.mjs --require-wiring
```

앞엣것은 `FAIL W1 — gates/graph-stop.mjs 가 턴 끝에 이 도구를 부른다`,
뒤엣것은 `FAIL W1 — gates/run-gates.mjs 가 매 턴 이 검사를 부른다` 가 나온다.
붙이고 나면 둘 다 `계약 테스트 통과` 로 끝난다.

**그냥(플래그 없이) 돌리면 통과한다** — 배선은 사용자만 할 수 있는 일이라, 안 붙었다고
다른 모든 작업을 막지 않는다. 대신 「배선 대기」 한 줄이 계속 뜬다.

---

## A. `gates/graph-stop.mjs` — 한 줄 추가

`✎ 계측 멈춤` 을 찍는 줄(`measurement-gap.mjs` 를 동적 import 하는 줄, 현재 485행)
**바로 앞에** 아래 한 줄을 넣는다.

```js
try { const { recordTurnTransition } = await import("../scripts/turn-transition.mjs"); const t = recordTurnTransition(Object.fromEntries(allUnits().filter((u) => !u.signoff).map((u) => [u.id, hashNode(u.produces)]))); if (t) console.log(`* transition: ${t.from_node ?? "(start)"} -> ${t.to_node ?? "(off-graph)"}`); } catch {}
```

붙는 자리의 앞뒤는 이렇게 된다:

```js
persist(state);
...
console.log(`● HANDOFF 갱신 (...). 프론티어: ...`);

// ↓ 여기에 새 줄
try { const { recordTurnTransition } = await import("../scripts/turn-transition.mjs"); ... } catch {}

// ↓ 원래 있던 줄
try { const { reportMeasurementGap } = await import("../scripts/measurement-gap.mjs"); ... } catch {}
```

**세 가지가 그 줄의 모양을 정했다.**

- **동적 import 여야 한다.** `gates/` 에서 `../scripts/` 를 정적으로 import 하면, `gates/` 와
  `graph.mjs` 만 임시 폴더에 복사해 훅을 돌리는 계약 테스트 여덟 개가 모듈을 못 찾아 훅이
  통째로 죽는다(2026-09-17 실측: 게이트 실패 16건).
- **`try/catch` 로 감싼다.** 이 훅에는 최상위 `try/catch` 가 없어서, 여기서 던지면 6단계의
  차단 판정(`exit 2`)에 영영 도달하지 못한다 — 막아야 할 게이트 실패를 안 막는 쪽으로 실패한다.
- **붙여넣는 줄은 ASCII 다.** 사람이 손으로 붙여 넣는 줄에서 한글 식별자가 실제로 깨진 적이
  있다(2026-09-17). 이 수리에서 계측 쪽 코드의 식별자를 전부 ASCII 로 되돌렸으므로
  (`scripts/measurement-gap.mjs`·`turn-transition.mjs`·`lib/record-rules.mjs`),
  이제 붙여넣는 줄에 한글이 섞일 자리가 없다.

**`persist(state)` 뒤에 둔다.** 앞에 두면 여기서 무슨 일이 나도 HANDOFF 가 안 써진다.

### A 가 하는 일

산출물 해시를 직전 턴의 스냅샷(`projects/<슬러그>/report/turn-hashes.json`)과 대조해서
**이번 턴에 실제로 바뀐 노드**를 구하고, 그게 지금 기록된 위치와 다를 때만 전환 한 줄을
남긴다. 같은 노드에서 계속 일하는 턴에는 줄이 안 는다. 제품이 그대로고 킷 파일만 고친
턴이면 그래프 밖(`to_node: null`)으로 적고 사유를 활동 기록에서 채운다.

`task`·`now`·`item` 은 훅이 지어내지 않는다 — 손 기록이 적어 둔 현재 값을 그대로 싣는다.
`result` 는 언제나 `null` 이다(무엇이 끝났는지는 훅이 알 수 없다).

---

## B. `gates/run-gates.mjs` — 블록 하나 추가

훅 배선 검사 블록(`check-hooks.mjs` 를 돌리는 `if (!QUICK) { ... }`) **바로 뒤에** 아래를
넣는다. 같은 모양이다 — 판정은 검사기 한 자리에 있고 여기서는 돌리기만 한다.

```js
// 기록 규약: 전환·상태·요청이 규약을 지키는가. (전체 실행 전용)
//    판정은 scripts/check-measurement-gap.mjs 한 자리에 있다.
//    기록은 매 턴의 일이라 여기 있다 — on-change 로 두면 기록이 멈춘 턴에는 아무도 안 본다.
//    --quick 에 넣지 않는다: 편집마다 볼 것이 아니고, 턴 끝에 한 번이면 충분하다.
if (!QUICK) {
  const recordCheck = join(ROOT, "scripts", "check-measurement-gap.mjs");
  if (!existsSync(recordCheck)) {
    console.error("⚠ [record/SKIP] scripts/check-measurement-gap.mjs 가 없다 — 기록 규약 검사를 건너뛴다.");
  } else {
    const rr2 = spawnSync(process.execPath, [recordCheck], { cwd: ROOT, encoding: "utf-8" });
    const rout2 = (rr2.stdout ?? "") + "\n" + (rr2.stderr ?? "");
    if (rr2.status === null) {
      console.error("⚠ [record/SKIP] 기록 규약 검사가 실행되지 않았다 — 나머지 게이트는 그대로 판정한다.");
    } else if (rr2.status !== 0) {
      const bad2 = rout2.split("\n").filter((l) => l.trim().startsWith("[record/")).map((l) => l.trim());
      if (bad2.length) for (const line of bad2) errors.push(line);
      else errors.push("[record/FAIL] 기록 규약 검사가 실패했는데 이유 줄이 없다 — 'node scripts/check-measurement-gap.mjs' 로 직접 본다");
    }
  }
}
```

### B 가 막는 것 (다섯)

| 코드 | 언제 막나 | 푸는 법 |
|---|---|---|
| `RESULT_VOCAB` | `result` 가 `통과`·`반려`·`실패` 가 아니다 | 어휘를 쓰거나, 늘리려면 `docs/references/report-contract.md` 3절에 먼저 적는다 |
| `PAIR_NOT_DONE` | 통과로 적어 놓고 항목을 안 닫았다 | `report-request.mjs --done <id>` |
| `PAIR_NO_RESULT` | 항목을 닫았는데 통과 전환 줄이 없다 | 그 항목으로 `report-note.mjs ... --result 통과` |
| `ITEM_NULL` | 요청이 열린 동안 그래프 안 전환의 `item` 이 비었다 | 항목 이름을 적는다(요청 밖 일이면 `items` 에 없는 이름) |
| `OFFGRAPH_UNKNOWN` | 그래프 밖 사유가 「미기재」다 | `report-note.mjs --off-graph "<무슨 작업인지>"` |

`now` 가 갱신됐는지는 **안 본다.** 한 항목을 여러 턴에 걸쳐 하는 동안 `now` 는 안 바뀌는 것이
정상이라, 그것을 요구하면 의미 없는 문구 수정을 부른다. 위치는 A 가 자동으로 적는다.

여섯째(요청을 닫을 때 PROGRESS 가 앞 요청의 랩업 그대로인지)는 게이트가 아니라
`scripts/report-request.mjs` 의 `--finish` 안에 있다. 보호 파일이 아니라 이미 붙어 있다.

---

## 부분 적용 — 네 조합을 하나씩 밟았다

**어느 조합에서도 안전하게 실패하도록 설계했다.** 위험한 조합은 없다.

| 붙은 것 | 무슨 일이 일어나나 | 안전한가 |
|---|---|---|
| 둘 다 없음 (지금) | 격차 신고 한 줄만 뜬다. 기록은 손으로 쳐야 남는다 | 예 — 지금 상태 |
| **A만** | 전환이 자동으로 남는다. 규약 위반은 안 막힌다 | 예 — 기록이 늘 뿐 막는 것이 없다 |
| **B만** | 규약 위반이 편집을 막는다. 위치는 여전히 손 기록뿐 | 예 — 지금 이 레포의 위반은 0건이고, 자동 기록이 없으니 「미기재」가 생길 일도 없다 |
| 둘 다 | 위치는 기계가 적고, 의미 필드의 누락은 게이트가 막는다 | 예 — 의도한 상태 |

**B만 붙었을 때 등록부가 실패하지 않는지 확인했다.** `check-measurement-gap.mjs` 의 역할은
아직 `pending` 이다(`@check-backlog: 기록 규약을 강제하는 검사가 하나도 없다`). `standing` 으로
먼저 올렸다면 부르는 곳이 없는 동안 `[registry/UNWIRED]` 가 **모든 편집을 막았을 것**이다
(`scripts/check-registry.mjs:197`). 배선이 붙은 뒤에 역할을 올린다 — 그건 보호 파일이 아니라
제가 고친다.

---

## 적용 후 확인

```
node scripts/check-turn-transition.mjs --require-wiring    # W1·W2·W3 통과
node scripts/check-measurement-gap.mjs --require-wiring    # W1·W2 통과
node gates/run-gates.mjs                                   # 게이트가 그대로 통과하는지
node scripts/check-mark-child.mjs                          # 샌드박스에서 훅이 안 죽는지(정적 import 사고의 재현 검사)
node scripts/check-report.mjs                              # state.json 단일 기록자 규약이 유지되는지
node scripts/check-registry.mjs                            # 역할 선언과 배선이 맞는지
```

그리고 **실측**: 제품 파일 하나에 빈 줄을 더하고 `node gates/graph-stop.mjs` 를 돌리면
`projects/study-mate/report/transitions.jsonl` 의 줄 수가 하나 늘고, 같은 파일을 한 번 더
고쳐 다시 돌리면 **안 는다**. 원복은 빈 줄을 지우는 것으로 끝난다.
