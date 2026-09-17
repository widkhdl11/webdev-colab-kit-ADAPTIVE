// record-rules.mjs — 기록 규약을 **거부로** 지키는 판정들.
//
// 무엇을 푸는가:
//   `transitions.jsonl`·`state.json`·`request.json` 은 규약이 있는데 그 규약을 보는 검사가
//   하나도 없었다(2026-09-17 백로그). 지금까지 있던 것은 격차 신고 하나뿐이고, 신고는
//   막지 않는다. 여기 있는 판정들은 **막는다** — 게이트가 부르고, 위반이 있으면 편집이 멈춘다.
//
// 무엇을 안 보나:
//   「`now` 가 갱신됐는가」는 안 본다. 한 항목을 여러 턴에 걸쳐 하는 동안 `now` 는 안 바뀌는
//   것이 정상이라, 그것을 요구하면 의미 없는 문구 수정을 부른다. 위치가 바뀌었는지는
//   `turn-transition.mjs` 가 자동으로 기록하므로 사람에게 다시 물을 일이 아니다.
//
// 순수 함수다 — 파일도 시계도 안 본다. 읽는 쪽이 세 덩어리를 넘긴다.
//
// 정본 규약: docs/references/report-contract.md

/**
 * `result` 의 어휘. **여기가 코드 쪽 정본이고**, 문장 쪽 정본은 report-contract.md 3절이다.
 * 늘리려면 두 곳을 같이 고친다 — 화면의 지연 진단이 `실패`·`반려` 를 정확히 일치로 센다.
 */
export const RESULT_VOCAB = ["통과", "반려", "실패"];

/** 끝난 요청. 이 상태면 열린 요청이 아니다. */
const CLOSED = new Set(["완료", "중단"]);

export function isRequestOpen(request) {
  return Boolean(request) && !CLOSED.has(request.status);
}

const toTime = (v) => Date.parse(v ?? "");
const rowsSince = (transitions, startedAt) => {
  const t0 = toTime(startedAt);
  return Number.isFinite(t0) ? transitions.filter((r) => toTime(r?.at) >= t0) : transitions;
};

/**
 * 기록 규약 위반을 센다.
 *
 * @param transitions  transitions.jsonl 의 줄들
 * @param state   state.json (없으면 null)
 * @param request request.json (열린 요청이 없으면 null)
 * @returns [{ code, line }] — 빈 배열이면 통과. `line` 은 사람이 읽고 바로 고칠 수 있는 한 문장이다.
 */
export function recordViolations({ transitions = [], state = null, request = null } = {}) {
  const out = [];
  const add = (code, line) => out.push({ code, line });

  // ── ① result 어휘 ────────────────────────────────────────────────────
  //    「통과」만 기록하는 경로가 있으면 안 된다. 그래서 어휘 자체를 좁게 고정한다 —
  //    자유 문자열이면 화면의 지연 진단(정확히 일치로 센다)이 조용히 아무것도 못 센다.
  for (const r of transitions) {
    if (r?.result === null || r?.result === undefined) continue;
    if (!RESULT_VOCAB.includes(r.result)) {
      add("RESULT_VOCAB",
        `전환의 result 값 '${r.result}' 는 규약의 어휘가 아니다(${RESULT_VOCAB.join("·")}). ` +
        `어휘를 늘리려면 docs/references/report-contract.md 3절에 먼저 적는다`);
    }
  }

  if (!isRequestOpen(request)) {
    // 열린 요청이 없으면 아래 둘은 대조할 상대가 없다. 있지도 않은 요청을 근거로 막지 않는다.
    if (state?.off_graph === "미기재") add(...unknownReasonLine());
    return out;
  }

  const rows = rowsSince(transitions, request.started_at);
  const items = Array.isArray(request.items) ? request.items : [];
  const labels = new Set(items.map((i) => i.label));

  // ── ② 통과 ↔ done 은 쌍이다 ──────────────────────────────────────────
  //    한쪽만 남으면 화면의 n/m 과 이력이 서로 다른 말을 한다. 어느 쪽이 맞는지 아무도 모른다.
  //    **`통과` 인 줄만 쌍을 요구한다** — `반려`·`실패` 로 끝난 항목은 닫힌 것이 아니다.
  const passedItems = new Set(
    rows.filter((r) => r?.result === "통과" && r?.item != null && labels.has(r.item)).map((r) => r.item),
  );
  for (const it of items) {
    if (passedItems.has(it.label) && !it.done) {
      add("PAIR_NOT_DONE",
        `'${it.label}' 를 통과로 기록했는데 항목이 안 닫혔다. ` +
        `node scripts/report-request.mjs --done ${it.id}`);
    }
    if (it.done && !passedItems.has(it.label)) {
      add("PAIR_NO_RESULT",
        `'${it.label}' 를 done 으로 닫았는데 통과 전환 줄이 없다. 항목마다 줄 하나가 규약이다 — ` +
        `node scripts/report-note.mjs --node <노드> --task ${request.task} --now "<한 줄>" --item "${it.label}" --result 통과`);
    }
  }

  // ── ③ 요청이 열려 있는데 item 이 null ────────────────────────────────
  //    요청 밖 작업이면 items 에 없는 이름을 적는 것이 규약이다. `null` 은 「밖」이 아니라
  //    「잊었다」이고, 그 줄의 시간은 어느 항목의 체류에도 안 들어간다.
  //    그래프 밖 구간(to_node = null)은 원래 item 이 null 이므로 보지 않는다.
  for (const r of rows) {
    if (r?.to_node !== null && r?.to_node !== undefined && (r?.item ?? null) === null) {
      add("ITEM_NULL",
        `요청 '${request.task}' 가 열려 있는데 ${r.at} 전환 줄의 item 이 비었다. ` +
        `요청 밖 작업이면 items 에 없는 이름을 적는다 — 비워 두면 「잊었다」와 구별되지 않는다`);
    }
  }

  // ── ④ 그래프 밖 사유가 「미기재」 ────────────────────────────────────
  if (state?.off_graph === "미기재") add(...unknownReasonLine());

  return out;
}

function unknownReasonLine() {
  return [
    "OFFGRAPH_UNKNOWN",
    "그래프 밖 구간의 사유가 「미기재」다 — 훅이 무엇을 고쳤는지 못 읽었다. " +
      '한 줄을 직접 적는다: node scripts/report-note.mjs --off-graph "<무슨 작업인지>" --task <식별자> --now "<한 줄>"',
  ];
}

/**
 * `--finish` 잔재 검사. **「마감 내용인가」는 기계가 못 센다** — 셀 수 있는 것은
 * 「**다른 요청의 랩업이 그대로 남아 있나**」뿐이고, 이 검사의 목적이 그것이다.
 *
 * 판정: PROGRESS 의 「현재 상태」 절에 그 요청의 `task` 나 항목 label 조각이 글자로 있으면 통과.
 *
 * @returns 통과면 null, 아니면 사람이 읽는 한 줄
 */
export function progressResidue(progressText, request) {
  const section = currentStateSection(progressText ?? "");
  if (section === null) return "PROGRESS.md 에 「현재 상태」 절이 없다 — 마감을 적을 자리가 없다";
  const needles = [request?.task, ...(request?.items ?? []).map((i) => i.label)]
    .map((s) => String(s ?? "").trim())
    .filter((s) => s.length >= 2);
  if (needles.some((s) => section.includes(s))) return null;
  return (
    `PROGRESS 의 「현재 상태」에 이번 요청('${request?.task}')이 한 글자도 안 보인다 — ` +
    "앞 요청의 랩업이 그대로 남아 있는 상태다. 마감 내용으로 갱신하고 다시 --finish 한다"
  );
}

/** `## 현재 상태` 절의 본문. 없으면 null. */
export function currentStateSection(text) {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  let inside = false;
  const out = [];
  for (const raw of lines) {
    const h = raw.match(/^##\s+(.*)$/);
    if (h) {
      if (inside) break;
      inside = h[1].trim().startsWith("현재 상태");
      continue;
    }
    if (inside) out.push(raw);
  }
  return inside || out.length > 0 ? out.join("\n") : null;
}
