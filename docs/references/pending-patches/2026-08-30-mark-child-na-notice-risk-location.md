# 패치 — `--mark` 자식 지정 · n/a 취소 알림 · 위험 표면 감지 위치 (2026-08-30)

보호 파일 둘(`gates/graph-stop.mjs` · `gates/run-gates.mjs`)을 고친다.
**붙이기 전에 검사가 실패하고, 붙인 뒤에 통과한다.**

```
node scripts/check-mark-child.mjs
node scripts/check-na-cancel-notice.mjs
node scripts/check-risk-location.mjs
```

붙이기 전 (지금 이 레포에서 실측):

```
✗ A 수용  --mark design/page-designer 가 종료코드 1 로 거부됐다: 알 수 없는 노드
✗ B 형제  A 가 실패해 판정할 상태가 없다
✗ D 하류  A 가 실패해 판정할 상태가 없다
✓ C 부모  --mark design 는 여전히 자식 둘을 함께 rework 로 만든다      → 1/4

✗ A --mark      deploy 가 dirty 로 취소됐는데 알림이 없다
✗ B 파이프라인  spec 이 clean 로 취소됐는데 알림이 없다
✓ C 오탐없음    n/a 가 유지된 턴에는 알림이 없다                        → 1/3

✗ A 신고  위치 줄(AT)이 없다: ℹ [risk-surface/DETECTED] projects/probe — authz
✓ C 회귀  EXEMPT 경고는 여전히 파일:줄 을 달고 있다
✗ B 안내  안내는 떴는데 감지 위치 줄이 없다                             → 1/3
```

지금도 통과하는 `C` 셋은 **이 패치가 기존 동작을 깨뜨리지 않는지** 보는 검사다.
세 검사기 전부 임시 디렉터리에 킷을 복사해 돌린다 — 이 레포의 파일은 하나도 건드리지 않는다.

---

## 무엇을 고치나 (셋)

| | 지금 | 고친 뒤 |
|---|---|---|
| ① | `--mark design` 밖에 못 쓴다. 시안 하나가 거부돼도 `schema-designer` 까지 같은 사유로 rework 가 된다 | `--mark design/page-designer "사유"` — 형제는 clean 그대로, 부모는 집계로 파생 |
| ③ | 전파가 n/a 를 덮으면 사유째 사라지고 아무 말이 없다 | `↩ deploy n/a 취소 → 지금 dirty (사유였던 것: …) — … 전파가 덮었다` |
| ② | `코드에 authz 표면이 있는데 security-reviewer 가 없다` — 어디인지는 말 안 한다 | `감지된 위험 표면: authz @ projects/signal/supabase/migrations/0001_init.sql:79` |

### ① 왜 자식으로 찍어야 하나

`markRework` 는 부모를 찍으면 **자식 전부에 같은 사유를 복사한다**(`gates/propagate.mjs:101`).
`design` 은 자체 산출물이 없는 집계 노드고 자식이 둘이다 — `page-designer`(시안·design-rules)와
`schema-designer`(마이그레이션·엔티티 모델). 시안 색 대비가 미달이라 시안을 거부했을 뿐인데
스키마 쪽도 rework 가 되고, 그쪽은 재승인을 받아야 풀린다. 손댄 적 없는 자리에 남의 사유가 붙는다.

고친 뒤에도 **부모 상태는 선언하지 않는다** — `recomputeParents` 가 집계로 파생한다
(자식이 전부 rework 면 부모도 rework, 하나라도 순수 dirty 면 dirty). 하류 전파는 그대로다.

### ③ 왜 알림이 필요한가

`markDirty` 는 노드를 `{ status:"dirty", hash:null }` 로 통째로 덮는다(`gates/propagate.mjs:91`).
n/a 였다면 사유도 그때 사라진다. **취소 자체는 옳다** — 판단의 전제가 바뀌었으니까.
문제는 조용하다는 것이다: 다음 세션은 그 노드가 원래부터 dirty 였다고 읽고, 사유는 이미 없어서
되짚을 근거도 없다. `spec` 한 자리만 예외적으로 알림이 있었다(risk-surface 가 잡았을 때).

취소 경로가 둘이라 두 곳 모두 손댄다 — `--mark` 의 하류 전파, 그리고 파이프라인의 해시 변경 전파.

### ② 왜 위치를 붙이나

`run-gates` 는 이미 파일:줄 을 알고 있다(`hits` 에 담고 EXEMPT 경고에도 찍는다).
`ℹ [risk-surface/DETECTED]` 줄에서만 버려져서, 그걸 받아 쓰는 사인오프 안내가 표면 이름밖에 못 말한다.
감지 범위가 이번 diff 가 아니라 프로젝트 전체라서 "그게 어디 있는데"를 사람이 다시 찾아야 한다.

**감지 범위를 좁히는 근본 수정은 지금 하지 않는다**(2026-08-30 합의). 느슨하게 만드는 변경은
놓친 것이 소리를 안 내서 되돌리기 어렵고, 아직 실제로 겪은 문제가 없다. 위치만 붙이는 절반이다.

---

# `gates/graph-stop.mjs` — 여덟 군데

> 여덟 군데가 한 벌이다. 헬퍼(1)만 빼고 붙이면 `--mark` 가 `naSnapshot is not defined` 로 죽는다.
> 검사기의 실패 메시지가 어느 쪽인지 말해 준다.

## 1) `persist` 앞에 헬퍼 둘 추가 (113~115줄 근처)

### 찾을 것

```js
  return topLevel(GRAPH).filter((n) => state[n].status === "rework").map((n) => `${n}(${state[n].reason ?? "사유 없음"})`);
}
function persist(state) {
```

### 바꿀 것

```js
  return topLevel(GRAPH).filter((n) => state[n].status === "rework").map((n) => `${n}(${state[n].reason ?? "사유 없음"})`);
}
// n/a 취소 감지 — n/a 는 '이번 작업엔 해당 없음'이라는 판단이다. 전파(markDirty)는 그 판단을 사유째 덮어쓴다.
// 덮였다는 사실이 어디에도 안 뜨면 다음 세션은 그 노드가 원래부터 dirty 였다고 읽는다 — 사유는 이미 지워졌다.
function naSnapshot(state) {
  return new Map(
    Object.keys(state)
      .filter((id) => state[id]?.status === "n/a")
      .map((id) => [id, state[id].reason ?? "사유 없음"]),
  );
}
// before 이후 n/a 가 아니게 된 노드를 알린다. 취소는 이미 일어난 뒤다 — 여기서 하는 일은 보고뿐이다.
function reportNaCancelled(before, state, cause) {
  let n = 0;
  for (const [id, why] of before) {
    if (state[id]?.status === "n/a") continue;
    console.error(
      `↩ ${id} n/a 취소 → 지금 ${state[id]?.status ?? "없음"} (사유였던 것: ${why}) — ${cause}. ` +
        `생략 판단의 전제가 바뀌었다: 그대로 작업하거나, 여전히 해당 없으면 --na 로 다시 선언한다.`,
    );
    n++;
  }
  return n;
}

function persist(state) {
```

## 2) `signoffCheck` 의 리뷰어 부족 메시지 — 한 줄 (254줄)

### 찾을 것

```js
          why: `코드에 ${touched.join("·")} 표면이 있는데 ${so.reviewers_field} 에 ${reviewer} 가 없다 ` +
```

### 바꿀 것

```js
          why: `코드에 ${touched.map((s) => `${s}(${detectedSurfaces.get(s)})`).join("·")} 표면이 있는데 ${so.reviewers_field} 에 ${reviewer} 가 없다 ` +
```

## 3) `--mark` 블록 통째로 (262~288줄)

### 찾을 것

```js
// ── 수동 마크 모드: 분류기/사용자가 파일 변경 없이 노드를 dirty 로 (그 뒤 전파) ──
//    사용: node gates/graph-stop.mjs --mark <spec|design|implement|...> ["<사유 한 줄>"]
//    분류기가 판정한 level 을 이걸로 찍으면, 재작업 범위는 전파가 파생한다.
//
//    dirty 냐 rework 냐는 선언하지 않는다 — 지금 상태에서 파생한다.
//    clean 인 노드를 mark = 통과했던 판정을 취소하는 것(rework) / 이미 dirty 인 노드를 mark = 그대로 dirty.
//    그래서 "한 번도 승인 안 받은 것"은 rework 가 될 수 없고, 선행 게이트가 그대로 막는다.
const markIdx = process.argv.indexOf("--mark");
if (markIdx !== -1) {
  const node = process.argv[markIdx + 1];
  const reason = process.argv.slice(markIdx + 2).join(" ").trim();
  if (!topLevel(GRAPH).includes(node)) {
    console.error(`--mark: 알 수 없는 노드 '${node}'. 후보: ${topLevel(GRAPH).join(", ")}`);
    process.exit(1);
  }
  const s = loadState();
  const wasClean = s[node]?.status === "clean";
  if (wasClean) markRework(s, node, reason, GRAPH);         // 자신 + 병렬 자식
  else markDirty(s, node, GRAPH);
  for (const d of descendants(node, GRAPH)) markDirty(s, d, GRAPH);  // 하류는 거부된 게 아니라 상류가 흔들린 것
  persist(s);
  const fr = frontier(s);
  console.log(`● mark(${node}) → ${wasClean ? "rework" : "dirty"} 전파. 프론티어: ${fr.length ? fr.join(", ") : "없음"}`);
  if (wasClean && !reason)
    console.log(`  ↳ 사유가 비었다 — 몇 턴 뒤엔 왜 취소됐는지 아무도 근거를 못 댄다: --mark ${node} "<사유 한 줄>"`);
  process.exit(0);
}
```

### 바꿀 것

```js
// ── 수동 마크 모드: 분류기/사용자가 파일 변경 없이 노드를 dirty 로 (그 뒤 전파) ──
//    사용: node gates/graph-stop.mjs --mark <spec|design|design/page-designer|...> ["<사유 한 줄>"]
//    분류기가 판정한 level 을 이걸로 찍으면, 재작업 범위는 전파가 파생한다.
//
//    dirty 냐 rework 냐는 선언하지 않는다 — 지금 상태에서 파생한다.
//    clean 인 노드를 mark = 통과했던 판정을 취소하는 것(rework) / 이미 dirty 인 노드를 mark = 그대로 dirty.
//    그래서 "한 번도 승인 안 받은 것"은 rework 가 될 수 없고, 선행 게이트가 그대로 막는다.
//
//    집계 노드(design)는 자식 이름으로도 찍을 수 있다 — `--mark design/page-designer "시안 대비 미달"`.
//    부모로 찍으면 markRework 가 자식 전부에 같은 사유를 복사하므로, 시안 하나가 거부됐을 뿐인데
//    손대지 않은 schema-designer 에까지 그 사유가 붙고 그쪽도 재승인을 받아야 풀린다.
//    자식으로 찍으면 형제는 clean 인 채로 남고, 부모 상태는 recomputeParents 가 집계로 파생한다
//    (부모를 손으로 선언하지 않는다 — 자식이 전부 rework 면 부모도 rework, 하나라도 dirty 면 dirty).
const markable = [...topLevel(GRAPH), ...topLevel(GRAPH).flatMap((n) => childrenOf(GRAPH, n))];
const markIdx = process.argv.indexOf("--mark");
if (markIdx !== -1) {
  const node = process.argv[markIdx + 1];
  const reason = process.argv.slice(markIdx + 2).join(" ").trim();
  if (!markable.includes(node)) {
    console.error(`--mark: 알 수 없는 노드 '${node}'. 후보: ${markable.join(", ")}`);
    process.exit(1);
  }
  const s = loadState();
  const naBefore = naSnapshot(s);
  const parent = unitParent(node);
  const wasClean = s[node]?.status === "clean";
  if (wasClean) markRework(s, node, reason, GRAPH);         // 자신 + (톱레벨이면) 병렬 자식
  else markDirty(s, node, GRAPH);
  if (node !== parent) recomputeParents(s, GRAPH);          // 자식만 찍었으면 부모는 집계로 파생
  for (const d of descendants(parent, GRAPH)) markDirty(s, d, GRAPH);  // 하류는 거부된 게 아니라 상류가 흔들린 것
  persist(s);
  const fr = frontier(s);
  console.log(`● mark(${node}) → ${wasClean ? "rework" : "dirty"} 전파. 프론티어: ${fr.length ? fr.join(", ") : "없음"}`);
  if (node !== parent) {
    const sib = childrenOf(GRAPH, parent).filter((c) => c !== node).map((c) => `${c}=${s[c]?.status}`);
    console.log(`  ↳ ${parent} = ${s[parent]?.status} (자식 집계). 형제는 그대로: ${sib.join(", ") || "없음"}`);
  }
  reportNaCancelled(naBefore, s, `--mark ${node} 의 하류 전파가 덮었다`);
  if (wasClean && !reason)
    console.log(`  ↳ 사유가 비었다 — 몇 턴 뒤엔 왜 취소됐는지 아무도 근거를 못 댄다: --mark ${node} "<사유 한 줄>"`);
  process.exit(0);
}
```

**바뀐 것**: `markable`(톱레벨 + 자식) 로 검사 · `unitParent` 로 부모를 잡아 하류 전파의 기준으로 씀 ·
자식 마크면 `recomputeParents` 로 부모 집계 · 형제 상태 한 줄 · n/a 취소 알림 한 줄.

## 4) `detectedSurfaces` 를 Set → Map (333~338줄)

### 찾을 것

```js
// 게이트가 신고한 '코드에 존재하는 위험 표면' — review 사인오프 판정에 쓴다(활성 프로젝트 것만).
const detectedSurfaces = new Set();
for (const line of gateOut.split("\n")) {
  const m = line.match(/^ℹ \[risk-surface\/DETECTED\]\s+(\S+)\s+—\s+(.+)$/);
  if (m && m[1].split("/")[1] === active) for (const s of m[2].split(",")) detectedSurfaces.add(s.trim());
}
```

### 바꿀 것

```js
// 게이트가 신고한 '코드에 존재하는 위험 표면' — review 사인오프 판정에 쓴다(활성 프로젝트 것만).
// 두 줄을 읽는다: DETECTED 는 표면 이름, AT 는 `표면@파일:줄`. 이름 줄만 있는 옛 게이트에서도
// 판정은 그대로 돌고 위치만 '위치 미상'이 된다 — 이름 줄에 위치를 섞으면 그 호환이 깨진다.
const detectedSurfaces = new Map();
for (const line of gateOut.split("\n")) {
  const m = line.match(/^ℹ \[risk-surface\/(?:DETECTED|AT)\]\s+(\S+)\s+—\s+(.+)$/);
  if (!m || m[1].split("/")[1] !== active) continue;   // 다른 프로젝트 신고 → 이 그래프와 무관
  for (const item of m[2].split(",")) {
    const [name, at] = item.trim().split("@");
    if (!name) continue;
    if (!detectedSurfaces.has(name)) detectedSurfaces.set(name, at || "위치 미상");
    else if (at && detectedSurfaces.get(name) === "위치 미상") detectedSurfaces.set(name, at);
  }
}
```

`Map` 도 `.has()` 가 있으므로 이걸 읽는 다른 자리(`surfaces.some((s) => detectedSurfaces.has(s))`)는 그대로 돈다.

## 5) 파이프라인 시작에 n/a 스냅샷 (340줄)

### 찾을 것

```js
const state = loadState();
```

### 바꿀 것

```js
const state = loadState();
// 이번 턴이 시작될 때 살아 있던 n/a 판단. 아래 전파가 이걸 지우면 3.6 이 알린다.
const naBefore = naSnapshot(state);
```

## 6) 3.5 블록 끝 — 중복 보고 막기 (389~390줄)

### 찾을 것

```js
      : `↩ spec → dirty — risk-surface 가 위험 패턴 ${riskErrors.length}건을 잡았다(스펙 없이 위험 표면 진입). /spec 으로 불변식부터 쓴다.`,
  );
}
```

### 바꿀 것

```js
      : `↩ spec → dirty — risk-surface 가 위험 패턴 ${riskErrors.length}건을 잡았다(스펙 없이 위험 표면 진입). /spec 으로 불변식부터 쓴다.`,
  );
  naBefore.delete("spec");   // 위 메시지가 이 취소를 이미 보고했다 — 3.6 에서 두 번 말하지 않는다
}
```

## 7) 저장 직전에 3.6 알림 (392~393줄)

### 찾을 것

```js
// 4) 저장
persist(state);
```

### 바꿀 것

```js
// 3.6) n/a 취소 알림 — 취소 자체는 위(sync 전파·3.5)에서 이미 일어났다. 여기서 막는 건 '조용히' 뿐이다.
reportNaCancelled(
  naBefore,
  state,
  changed.length ? `${changed.join(", ")} 산출물이 바뀌어 전파됐다` : "상류 상태가 바뀌어 전파됐다",
);

// 4) 저장
persist(state);
```

## 8) 사인오프 대기 안내에 감지 위치 (419줄)

### 찾을 것

```js
  console.log(`     ${so.marker} 에 ${need.join(" + ")} 기록 시 clean`);
}
```

### 바꿀 것

```js
  console.log(`     ${so.marker} 에 ${need.join(" + ")} 기록 시 clean`);
  // 어디서 감지됐는지까지 말한다 — 표면 이름만 주면 "그게 어디 있는데"부터 다시 찾아야 한다.
  if (detectedSurfaces.size)
    console.log(`     감지된 위험 표면: ${[...detectedSurfaces].map(([s, at]) => `${s} @ ${at}`).join(" · ")}`);
}
```

---

# `gates/run-gates.mjs` — 세 군데

## 1) `detected` 를 Set → Map (361줄)

### 찾을 것

```js
  const detected = new Set();
```

### 바꿀 것

```js
  const detected = new Map();   // 표면 → 처음 감지된 위치(파일:줄). graph-stop 이 사인오프 안내에 그대로 쓴다
```

## 2) 감지 시 위치를 같이 담는다 (380줄)

### 찾을 것

```js
          detected.add(surface);
```

### 바꿀 것

```js
          if (!detected.has(surface)) detected.set(surface, `${rel}:${i + 1}`);
```

`rel`·`i` 는 바로 위 루프의 변수다(파일 상대경로 · 0부터 세는 줄 번호). 같은 파일에서 같은 표면이
여러 줄에 걸려도 **처음 하나만** 담는다 — 신고 줄은 목록이 아니라 "여기부터 보라"는 표지다.

## 3) 신고 목록에 위치를 함께 담는다 (409줄)

### 찾을 것

```js
  if (detected.size > 0) detectedByProject.set(label, [...detected]);
```

### 바꿀 것

```js
  // [표면, 위치] 쌍으로 넘긴다. 신고 줄의 형식은 아래에서 정한다 — 이름 줄과 위치 줄로 나눠 낸다.
  if (detected.size > 0) detectedByProject.set(label, [...detected]);
```

**코드는 한 글자도 안 바뀐다** — `detected` 가 Map 이 되면서 `[...detected]` 가
문자열 배열에서 `[표면, 위치]` 쌍 배열로 바뀔 뿐이다. 주석만 더한다(다음 사람이 이 줄만 보고
"왜 쌍이지"를 알 수 있게). **이 항목은 건너뛰어도 동작은 같다.**

## 4) 이름 줄과 위치 줄을 따로 낸다 (560~561줄)

### 찾을 것

```js
for (const [label, surfaces] of detectedByProject)
  console.log(`ℹ [risk-surface/DETECTED] ${label} — ${surfaces.join(", ")}`);
```

### 바꿀 것

```js
// 이름 줄과 위치 줄을 따로 낸다. 이름 줄에 위치를 섞으면 그걸 읽는 옛 graph-stop 이 표면 이름을
// "authz@경로:줄" 로 통째로 읽어 require_reviewer 대조에 실패한다 — security-reviewer 요구가
// 조용히 사라진다(2026-08-30 실측). 줄을 나누면 옛 판본은 AT 줄을 그냥 무시한다.
for (const [label, entries] of detectedByProject) {
  console.log(`ℹ [risk-surface/DETECTED] ${label} — ${entries.map(([s]) => s).join(", ")}`);
  console.log(`ℹ [risk-surface/AT] ${label} — ${entries.map(([s, at]) => `${s}@${at}`).join(", ")}`);
}
```

**`DETECTED` 줄의 출력은 지금과 한 글자도 안 달라진다**(실측 — signal·wama 양쪽에서 대조).
`AT` 줄이 하나 늘 뿐이다.

---

## 절반만 붙으면 어떻게 되나

| 붙은 것 | 결과 |
|---|---|
| `graph-stop` 1~8 중 3(`--mark`)만, 1(헬퍼)이 빠짐 | `--mark` 가 `naSnapshot is not defined` 로 죽는다. **소리 나게 실패한다** — 검사기 A 가 그 문구를 그대로 보여 준다 |
| `graph-stop` 만 (`run-gates` 없음) | `AT` 줄이 안 나오니 위치가 `위치 미상` 이 된다. 판정은 그대로 |
| `run-gates` 만 (`graph-stop` 없음) | 옛 `graph-stop` 은 `AT` 줄을 읽지 않는다(정규식이 `DETECTED` 만 본다). **지금과 같음** |

**네 조합(안 붙임 · gs 만 · rg 만 · 둘 다) 전부에서 `security-reviewer` 요구가 그대로 살아 있는 것을
실제로 확인했다.** 처음 설계는 `DETECTED` 줄 자체에 `authz@경로:줄` 을 싣는 것이었는데,
그러면 `run-gates` 만 붙은 상태에서 옛 `graph-stop` 이 그 문자열 통째를 표면 이름으로 읽어
`require_reviewer` 의 `"authz"` 와 안 맞고 **security-reviewer 요구가 조용히 사라졌다**(실측).
그래서 줄을 나눴다 — 붙이는 순서를 사람이 기억해야 하는 설계를 없앤 것이다.

## 붙인 뒤

```
node scripts/check-mark-child.mjs          # 4/4
node scripts/check-na-cancel-notice.mjs    # 3/3
node scripts/check-risk-location.mjs       # 3/3
node scripts/check-parked-status.mjs       # 4/4 (기존 — 안 깨졌는지)
node scripts/check-basis-message.mjs       # 통과 (기존)
node scripts/check-hooks.mjs               # 56/56 (기존, 이 패치와 무관)
node scripts/check-doc-refs.mjs            # 줄 참조가 밀린다 — 아래 참조
```

`graph-stop.mjs` 는 460→519줄, `run-gates.mjs` 는 578→584줄이 된다. 문서에 박힌 줄 참조
(`graph-stop.mjs` 28개 · `run-gates.mjs` 14개)가 그만큼 밀리므로 **붙인 뒤 참조를 고쳐야 한다.**
`check-doc-refs` 는 "확실히 틀린 것"(범위 밖·빈 줄·닫는 괄호)만 잡으므로 조용히 밀린 것은 못 잡는다.
고치는 방법은 줄 번호 산술이 아니다 — 옛 판본(`git show HEAD:gates/graph-stop.mjs`)에서 그 줄의
**내용**을 꺼내 새 파일에서 같은 내용을 찾는다. 내용이 한 번만 나오면 그게 새 줄 번호고,
없거나 여러 번 나오면 사람이 봐야 한다(고쳐 쓴 블록 안을 가리키던 참조가 그렇다).
