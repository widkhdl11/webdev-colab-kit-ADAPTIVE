# 보류 패치 — 보류(escalation)가 턴을 막지 않게 한다 (v3.3 · B단계)

보호 파일 **셋**을 고치므로 사용자가 직접 붙인다.
붙었는지·동작이 계약대로인지는 `node scripts/check-pending-kind.mjs` 가 판정한다 — 코드를 읽지 않아도 된다.

## 무엇을 하는 패치인가

보류 항목이 실행을 멈추지 않게 하되, 강제력은 남긴다.

- `PENDING.md` 의 열린 항목이 게이트 실패로 나온다 → 그래프가 "안 끝난 것"으로 안다.
- 그 실패는 턴을 막지 않는다 → 사람의 결정을 받으려면 턴이 끝나야 하기 때문이다.
- 프론티어의 모든 노드가 보류에 막히면 사이클을 닫자고 알린다.

| 파일 | 무엇을 |
|---|---|
| `graph.mjs` | `GATE_KIND` 에 `pending` 카테고리(세 번째 kind `escalated`) |
| `gates/graph-stop.mjs` | 낮춤 분기 하나 + 사이클 종료 판정·리포트 발행 |
| `gates/run-gates.mjs` | 열린 보류 항목을 게이트 실패로 신고 |

## 적용 순서 — 이 순서여야 한다

```
1. graph.mjs
2. gates/graph-stop.mjs
3. gates/run-gates.mjs
```

**논증**: 신고하는 쪽(`run-gates`)을 **마지막**에 붙인다. 받을 준비가 다 되기 전에 신고가 시작되면
`downgradeReason()` 의 첫 줄이 그것을 무조건 차단으로 떨어뜨린다.

```js
const def = GATE_KIND[cat];
if (!def) return null;   // 목록에 없는 카테고리는 무조건 차단
```

그래서 권장 순서의 각 중간 상태는 **아무 일도 안 일어나는 상태**가 된다 — 붙이다 멈춰도
하네스가 지금과 똑같이 돈다.

| 상태 | 무슨 일이 일어나나 | 훅 exit | 게이트 pending | 사이클 닫힘 | HANDOFF |
|---|---|---|---|---|---|
| 0. 아무것도 안 붙음 | 현행 그대로 | 0 | 0건 | 아니오 | 기록됨 |
| 1. `graph.mjs` 만 | 카테고리는 생겼는데 아무도 그 에러를 안 낸다 → 무해 | 0 | 0건 | 아니오 | 기록됨 |
| 2. `+ graph-stop` | 낮춤 분기와 종료 판정이 생겼는데 입력이 없다 → 무해. 다만 `graph-stop` 이 `PENDING.md` 를 직접 읽으므로 **사이클 종료 알림은 여기서부터 나온다** | 0 | 0건 | 예 | 기록됨 |
| 3. `+ run-gates` (완료) | 보류가 게이트 실패로 나오고 턴은 안 막힌다 | 0 | 1건 | 예 | 기록됨 |

**역순은 위험하다. 실측으로 확인했다.**

| 잘못된 상태 | 무슨 일이 일어나나 | 훅 exit |
|---|---|---|
| `run-gates` 만 | `pending` 카테고리를 모르는 `graph.mjs` 가 무조건 차단 → **턴이 막힌다** | **2** |
| `run-gates` + `graph-stop` (graph.mjs 없이) | 같은 이유로 **턴이 막힌다** | **2** |

턴이 막히면 푸는 유일한 길은 사용자가 `graph.mjs` 를 붙이는 것이다. 사용자가 자리를 비우면
실행이 멈춘다 — v3.3 이 없애려는 바로 그 상태다. **그래서 순서가 순서다.**

## Stop 훅 안전 — 순환을 만들지 않는가

이 레포는 같은 모양으로 세 번 다쳤다(2026-08-06·08-10·08-11): 게이트를 푸는 유일한 길이
턴을 끝내야 도달하는데 그 게이트가 턴을 못 끝내게 막는 순환. 그래서 셋을 확인했다.

**① 보류 실패는 턴을 막지 않는다.** 세 번째 kind `escalated` 는 owner 노드를 보지 않는다.
기존 두 kind 는 owner 상태로 판정하지만 보류에는 owner 가 없다 — 어느 노드가 덜 끝난 게
아니라 사람의 결정을 기다리는 것이다.

**② 리포트 발행은 `persist` 뒤에 두고 자체 `try/catch` 로 감싼다.**
이 훅에는 최상위 `try/catch` 가 없다. 새 코드가 던지면 훅이 죽고 **6단계(차단 판정, `exit 2`)에
영영 도달하지 못한다** — 막아야 할 게이트 실패를 안 막는 쪽으로 실패한다. 이 레포의 원칙은
"모르면 막는 쪽"이므로 그 방향은 허용하지 않는다.

> 리포트가 안 나가는 것은 불편이고, 차단이 안 되는 것은 사고다.

실측: 발행부에 일부러 예외를 심었을 때 훅 exit=0(크래시 아님), `⚠ [cycle/REPORT]` 한 줄이
찍히고, HANDOFF 는 그대로 기록됐다.

**③ 삽입 위치는 프론티어가 계산된 뒤여야 한다.** 앞에 두면 `Cannot access 'f' before initialization`
으로 죽는다. dry run 에서 실제로 그랬고, `safeEmit` 이 삼켜서 차단 판정에는 도달했다 —
②의 방어가 ③의 실수를 받아낸 셈이다.

## 실패 방향 — 모르는 것은 **막지 않는 쪽**으로

정책 규칙(`read-policy`)과 방향이 반대다. 저기서는 못 읽는 규칙이 근거가 되면 안 되니 버리고
올렸다. 여기서는 **실행을 멈추지 않는 것이 이 층의 전제**라, 모르는 값을 "전부 막는다"로 읽으면
오타 하나가 사이클을 통째로 닫는다.

- `blocks:` 가 없는 항목 → 아무 노드도 막지 않는다. 리포트에는 그대로 나온다.
- 그래프에 없는 노드 이름 → 그 값만 버리고 `⚠` 로 알린다.
- 둘 다 사이클을 닫지 않는다.

## 알려진 한계 (뚫지 말고 알고 쓴다)

- **보류가 clean 노드를 다시 dirty 로 만들지는 않는다.** 막힌 노드는 대개 자기 산출물이 없어
  이미 dirty 다. 보류가 완성된 노드를 되돌려야 하는 경우는 이 패치의 범위 밖이다.
- **스캐폴드 전 프로젝트에서는 게이트가 보류를 신고하지 않는다.** `run-gates` 가 `src/` 가 없으면
  그 전에 통째로 skip 한다. 다만 `graph-stop` 은 `PENDING.md` 를 직접 읽으므로 사이클 종료
  판정과 `⚠` 알림은 그대로 나온다.
- **리포트 파일을 기계가 쓰지는 않는다.** 종료 조건이 성립하면 "여기에 발행하라"고 알리고,
  내용은 사람(에이전트)이 채운다. 1~4 섹션은 판단이라 기계가 만들 수 없다.

---

# 붙일 것

## 1. `graph.mjs`

`GATE_KIND` 의 `"test-notrun"` 줄 **바로 뒤**에 넣는다.

```js
  "test-notrun": { kind: "completion", owner: "qa" },
  // ↓ 여기부터 추가
  // 보류(escalation)로 올라간 항목에서 나온 실패. **owner 를 보지 않는다** — 이 실패를 푸는 것은
  // 사람의 결정이고, 결정을 받으려면 턴이 끝나야 한다. 그래서 owner 상태와 무관하게 낮춘다.
  // 낮춰도 강제력은 그대로다: 막힌 노드는 자기 산출물이 없어 여전히 dirty 이고 하류도 막혀 있다.
  pending: { kind: "escalated", owner: null },
```

## 2-a. `gates/graph-stop.mjs` — 낮춤 분기

`downgradeReason()` 안, `if (!def) return null;` 줄 **바로 뒤**에 넣는다.

```js
  if (!def) return null;                                   // 목록에 없는 카테고리는 무조건 차단
  // ↓ 여기부터 추가
  // 세 번째 kind — owner 를 보지 않는다. 위 두 kind 는 owner 노드의 상태로 판정하지만
  // 보류는 owner 가 없다(사람의 결정을 기다리는 것이지 어느 노드가 덜 끝난 게 아니다).
  if (def.kind === "escalated")
    return "보류로 올라간 항목이라 사람의 결정을 기다린다 — 결정을 받으려면 턴이 끝나야 한다";
```

## 2-b. `gates/graph-stop.mjs` — 사이클 종료 판정

**`● HANDOFF 갱신` 을 찍는 `console.log` 줄 바로 뒤**에 넣는다. 그 자리여야 하는 이유는 둘이다 —
`persist(state)` 가 이미 끝났고(여기서 죽어도 HANDOFF 는 남는다), 프론티어 `f` 가 그 앞 줄에서
계산된다(앞에 두면 초기화 전 접근으로 죽는다).

```js
console.log(`● HANDOFF 갱신 (${relative(ROOT, HANDOFF)}). 프론티어: ${f.length ? f.join(", ") : "없음(전부 clean)"}`);
// ↓ 여기부터 추가

// 4.5) 사이클 종료 판정과 리포트 발행
//
// **persist 뒤에 둔다.** 여기서 죽으면 HANDOFF 가 안 써진다.
// **그리고 자체 try/catch 로 감싼다.** 이 훅에는 최상위 try/catch 가 없어서, 여기서 던지면
// 훅이 죽고 6단계(차단 판정, exit 2)에 영영 도달하지 못한다 — 막아야 할 게이트 실패를
// 안 막는 쪽으로 실패한다. 이 레포의 원칙은 "모르면 막는 쪽"이므로 그 방향은 허용하지 않는다.
// 리포트가 안 나가는 것은 불편이고, 차단이 안 되는 것은 사고다.
function readPendingText(src, knownNodes = []) {
  const items = [], problems = [];
  let open = false, cur = null;
  const flush = () => { if (cur) items.push(cur); cur = null; };
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const h = raw.match(/^##\s+(.*)$/);
    if (h) { flush(); open = /열린/.test(h[1]); continue; }
    if (!open) continue;
    const t = raw.match(/^-\s+\*\*(.+?)\*\*/);
    if (t) { flush(); cur = { title: t[1].trim(), blocks: [] }; continue; }
    const b = raw.match(/^[ \t]*blocks:[ \t]*(.*)$/);
    if (b && cur) for (const v of b[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      if (knownNodes.length === 0 || knownNodes.includes(v)) cur.blocks.push(v);
      else problems.push(`'${cur.title}' 의 blocks 값 '${v}' 은 그래프에 없는 노드다 → 그 값만 버린다`);
    }
  }
  flush();
  return { items, blocked: new Set(items.flatMap((i) => i.blocks)), problems };
}
function safeEmit(fn) {
  try { fn(); return true; }
  catch (e) {
    console.error(`⚠ [cycle/REPORT] 리포트 발행 실패 — ${e.message}. 차단 판정은 그대로 진행한다.`);
    return false;
  }
}
safeEmit(() => {
  const pf = join(projDir, "workspace", "PENDING.md");
  if (!existsSync(pf)) return;
  const { items, blocked, problems } = readPendingText(readFileSync(pf, "utf-8"), Object.keys(GRAPH));
  for (const p of problems) console.error(`⚠ [cycle/PENDING] ${p}`);
  if (items.length === 0) return;
  console.error(`⚠ [cycle/PENDING] 열린 보류 ${items.length}건 — 실행을 막지 않는다. 막힌 노드: ${[...blocked].join("·") || "없음"}`);

  // 조기 종료 조건 1 — 프론티어의 **모든** 노드가 보류에 막혔나.
  // 프론티어가 비어 있으면 닫지 않는다(그건 조건 2, 그래프 종단이 판정한다).
  if (f.length === 0 || !f.every((n) => blocked.has(n))) return;

  const cf = join(projDir, "workspace", "CYCLE.md");
  const cid = existsSync(cf) ? (readFileSync(cf, "utf-8").match(/^-\s+`([^`]+)`/m)?.[1] ?? "") : "";
  if (!cid) return;
  console.error(`⚠ [cycle/CLOSE] 사이클 ${cid} 종료 조건 1 성립 — 프론티어(${f.join(", ")})가 전부 보류에 막혔다.`);
  console.error(`   리포트를 workspace/reports/CYCLE_REPORT.${cid}.md 에 발행하고 CYCLE.md 의 그 줄을 닫힌 사이클로 옮긴다.`);
});
```

## 3. `gates/run-gates.mjs`

파일 끝의 `if (errors.length > 0) {` **바로 앞**에 넣는다.

```js
// ↓ 여기부터 추가
// ── 보류 항목: `## 열린 항목` 아래의 것을 게이트 실패로 낸다.
//    실행을 막지 않는 것은 graph-stop 이 GATE_KIND 로 낮춰서 하는 일이고, 여기서는 신고만 한다.
//    **graph.mjs 가 먼저 붙어 있어야 한다** — 목록에 없는 카테고리는 무조건 차단이기 때문이다.
//    읽는 것은 줄 맨 앞 `blocks:` 하나뿐이고 나머지 본문은 파싱하지 않는다.
//
//    **--quick(편집 훅)에서는 신고하지 않는다.** PostToolUse 훅이 편집마다 `--quick` 을 돌리고
//    exit 2 면 편집을 막는데, 보류는 저절로 사라지는 종류가 아니라서 한 건만 열려 있어도
//    편집이 영구히 막힌다. 보류를 닫아서 푸는 것조차 편집이라 같이 막힌다(2026-09-03 실측).
//    보류는 코드 위반이 아니라 그래프 층의 사정이므로 편집 훅에 나갈 것이 아니다.
//
//    **projectDirs 를 쓰지 않는다.** 그 목록은 `src/` 가 있는 폴더만 세는데, 킥오프만 끝나고
//    코드가 아직 없는 프로젝트에도 보류 항목은 생긴다. 그때 조용히 건너뛰면 보류가 있는데
//    게이트에는 안 보이는 상태가 된다(dry run 에서 실제로 그랬다).
if (!QUICK) {
const pendingRoot = join(ROOT, "projects");
const pendingDirs = existsSync(pendingRoot)
  ? readdirSync(pendingRoot).map((n) => join(pendingRoot, n)).filter((p) => existsSync(join(p, "workspace", "PENDING.md")))
  : [];
for (const projDir of pendingDirs) {
  const pendingFile = join(projDir, "workspace", "PENDING.md");
  const pendingLabel = relative(ROOT, projDir).split("\\").join("/");
  const openItems = [];
  let inOpen = false, item = null;
  const flushItem = () => { if (item) openItems.push(item); item = null; };
  for (const raw of readFileSync(pendingFile, "utf-8").replace(/\r\n/g, "\n").split("\n")) {
    const head = raw.match(/^##\s+(.*)$/);
    if (head) { flushItem(); inOpen = /열린/.test(head[1]); continue; }
    if (!inOpen) continue;
    const title = raw.match(/^-\s+\*\*(.+?)\*\*/);
    if (title) { flushItem(); item = { title: title[1].trim(), blocks: [] }; continue; }
    const blk = raw.match(/^[ \t]*blocks:[ \t]*(.*)$/);
    if (blk && item) item.blocks.push(...blk[1].split(",").map((x) => x.trim()).filter(Boolean));
  }
  flushItem();
  for (const it of openItems)
    errors.push(
      `[pending/BLOCKED] ${pendingLabel}/workspace/PENDING.md — ${it.title}` +
        (it.blocks.length ? ` (막는 노드: ${it.blocks.join("·")})` : " (막는 노드 없음)"),
    );
}
}          // ← if (!QUICK) 를 닫는다

if (errors.length > 0) {
```

---

## 붙은 뒤 확인

```
node scripts/check-pending-kind.mjs        → 11/11
node gates/run-gates.mjs --quick           → exit 0 (보류 신고 없음)
node gates/run-gates.mjs                   → 열린 보류가 있으면 exit 2 (정상)
```

붙기 전 **8/11**(A1·A2·A3 실패, A4 는 신고 자체가 없어 통과), 붙은 뒤 **11/11**.
그 밖의 숫자가 나오면 붙이다 만 것이고, 어느 파일이 빠졌는지는 A1~A4 가 각각 알려준다.

기존 검사도 그대로여야 한다: `check-read-policy` 9/9 · `check-read-spec` 8/8 ·
`check-docs-boundary` 7/7 · `check-mirror-sync` 5/5 · `check-handover-rehearsal` 3/3.

**붙은 뒤 `run-gates` 단독 실행은 열린 보류가 있는 동안 exit 2 가 된다.** 이건 정상이다 —
보류는 안 끝난 조건이고, 턴을 막지 않는 것은 `graph-stop` 이 낮춰서 하는 일이다.
"게이트 통과"라는 문장의 뜻이 그만큼 바뀌므로 알고 있어야 한다.
**`--quick` 은 그대로 exit 0 이어야 한다.** 거기서 exit 2 가 나면 편집이 전부 막힌다.

## 붙이다 막혔을 때 빠져나오는 길

부분 적용 상태에서 턴이 막히면(`run-gates` 만 붙은 상태 등) 그것을 푸는 유일한 길은 보호 파일
편집이고, 그건 사용자만 할 수 있다. **그동안 세션은 같은 차단 메시지를 반복한다** — 2026-09-03 에
실제로 그렇게 됐다. 조합표가 "턴이 막힌다"까지는 예측했지만 세션이 못 쓰게 되는 것까지는 안 적혀 있었다.

빠져나오는 길은 둘이고, 둘 다 사용자가 파일 하나를 고치는 일이다.

- **앞으로**: 빠진 파일을 마저 붙인다(권장 순서상 `graph.mjs` 가 빠져 있을 가능성이 높다).
- **뒤로**: `run-gates.mjs` 에 넣은 블록을 다시 뺀다. 나머지 둘은 입력이 없어 무해하므로 그대로 둬도 된다.
