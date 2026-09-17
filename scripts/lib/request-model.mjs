// request-model.mjs — 요청 층의 스키마와 판정. 파일 입출력 없는 순수 함수만 둔다.
//
// 요청 층이 답하는 질문은 지도와 다르다. 지도는 "에이전트가 어느 노드에 있나"에 답하고,
// 이 층은 "내가 시킨 것 대비 어디까지 왔고, 시킨 것 밖으로 나갔나"에 답한다.
//
// 정본 규약: docs/references/report-contract.md
//
// 화면이 쓰는 집계(requestView)는 여기 없다 — 브라우저가 scripts/lib 를 못 읽어서
// 자산 쪽 render.mjs 에 둔다. 같은 계산을 두 벌 두면 화면과 검사가 갈라진다.
//
// ★ 이 파일의 핵심은 items 가 **시작 시점에 얼어붙는다**는 것이다.
//   시작 후 items 를 고칠 수 있으면 "요청 밖으로 나갔나"라는 질문이 성립하지 않는다 —
//   나간 것을 목록에 추가하는 순간 안 나간 것이 되기 때문이다. 그래서 파생 판별은
//   사람의 판단도 에이전트의 판단도 아니고 "시작 목록에 있었나"의 기계 대조다.

/**
 * 요청 제목의 길이 한도.
 *
 * 브라우저는 `scripts/lib` 를 못 읽으므로 자산 쪽 `render.mjs` 에도 같은 값이 있다.
 * 두 벌이 갈라지면 기록은 받아들이는데 화면은 자르는(또는 그 반대의) 상태가 되므로,
 * 계약 테스트가 두 값이 같은지 대조한다.
 */
export const TITLE_MAX = 40;

export const REQUEST_STATUS = ["진행 중", "승인 대기", "완료", "중단"];
export const REQUEST_SOURCE = ["spec", "manual"];

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isIso = (v) => isNonEmptyString(v) && Number.isFinite(Date.parse(v));

/** request.json 판정. 반환은 사람이 읽는 실패 줄 목록(빈 배열이면 통과). */
export function validateRequest(req) {
  const errors = [];
  if (req === null || typeof req !== "object" || Array.isArray(req)) return ["request 가 객체가 아니다"];

  for (const field of ["task", "request"]) {
    if (!isNonEmptyString(req[field])) errors.push(`request.${field} 가 비었거나 문자열이 아니다`);
  }
  if (!REQUEST_SOURCE.includes(req.source)) {
    errors.push(`request.source 는 ${REQUEST_SOURCE.join(" | ")} 중 하나다 (지금: ${req.source})`);
  }
  if (req.source === "spec" && !isNonEmptyString(req.spec_path)) {
    errors.push("source 가 spec 이면 spec_path 가 있어야 한다");
  }
  if (req.source === "manual" && req.spec_path !== null && req.spec_path !== undefined) {
    errors.push("source 가 manual 인데 spec_path 가 있다");
  }
  if (!REQUEST_STATUS.includes(req.status)) {
    errors.push(`request.status 는 ${REQUEST_STATUS.join(" | ")} 중 하나다 (지금: ${req.status})`);
  }
  // 승인 대기·중단은 왜 멈췄는지가 있어야 한다. 사유 없는 멈춤은 화면에서 "그냥 멈춤"으로
  // 보이고, 그건 사람이 무엇을 해야 하는지 말해 주지 않는다.
  if ((req.status === "승인 대기" || req.status === "중단") && !isNonEmptyString(req.status_reason)) {
    errors.push(`status 가 ${req.status} 이면 status_reason 에 사유가 있어야 한다`);
  }
  // goal 은 "왜"다. 요청 문장("무엇")과 구분된다 — 스펙·Intent 에 목표 절이 있으면 거기서
  // 옮기고, 없으면 사람이 말한 한 줄이다. **요청 문장에서 지어내지 않는다.** 지어내면 화면이
  // 사람이 말한 적 없는 목표를 사람의 목표로 보여주고, 그건 틀렸다는 신호가 안 뜨는 종류다.
  if (req.goal === undefined) {
    errors.push("request.goal 이 없다 — 목표를 모르면 null 을 적는다(빠뜨림과 구별해야 한다)");
  } else if (req.goal !== null && !isNonEmptyString(req.goal)) {
    errors.push("request.goal 은 한 줄 문자열이거나 null 이다");
  }
  // title — 요청을 대표하는 한 줄. **없어도 된다**: 확정 전에는 화면이 원문 앞 40자를
  // 대신 쓴다. 길이를 막는 이유는 화면 맨 위 한 줄이 이것으로 채워지기 때문이다 —
  // 두 줄로 넘어가면 그 자리가 더는 "한눈에 읽는 한 줄"이 아니다.
  if (req.title !== undefined && req.title !== null) {
    if (!isNonEmptyString(req.title)) {
      errors.push("request.title 은 한 줄 문자열이거나 null 이다(모르면 아예 적지 않는다)");
    } else if ([...req.title].length > TITLE_MAX) {
      errors.push(`request.title 은 ${TITLE_MAX}자 이내다 (지금 ${[...req.title].length}자)`);
    }
  }
  if (!isIso(req.started_at)) errors.push("request.started_at 이 ISO8601 로 안 읽힌다");
  if (req.ended_at !== null && req.ended_at !== undefined && !isIso(req.ended_at)) {
    errors.push("request.ended_at 은 ISO8601 이거나 null 이다");
  }
  if ((req.status === "완료" || req.status === "중단") && !isIso(req.ended_at)) {
    errors.push(`status 가 ${req.status} 이면 ended_at 이 있어야 한다`);
  }

  if (!Array.isArray(req.items) || req.items.length === 0) {
    errors.push("request.items 는 1개 이상의 배열이다");
  } else {
    const seen = new Set();
    const seenLabels = new Set();
    req.items.forEach((it, i) => {
      if (it === null || typeof it !== "object") { errors.push(`items[${i}] 가 객체가 아니다`); return; }
      if (!isNonEmptyString(it.id)) errors.push(`items[${i}].id 가 비었다`);
      if (!isNonEmptyString(it.label)) errors.push(`items[${i}].label 이 비었다`);
      if (typeof it.done !== "boolean") errors.push(`items[${i}].done 이 참/거짓이 아니다`);
      if (isNonEmptyString(it.id)) {
        if (seen.has(it.id)) errors.push(`items 의 id 가 겹친다: ${it.id}`);
        seen.add(it.id);
      }
      // label 이 겹치면 안 되는 이유는 id 와 다르다. **전환과 항목을 잇는 키가 label 뿐**이라
      // (전환 줄의 item 에 들어가는 값이 label 이다) 겹치면 같은 시간이 두 칸에 중복으로
      // 계상된다. 진행률은 맞는데 띠의 시간만 틀리는, 화면만 봐서는 못 잡는 모양이다.
      // 우연한 사고가 아니다 — itemsFromSpec 이 label 을 59자에서 자르므로, 앞부분이 같은
      // 불변식 두 개면 label 이 정확히 같아진다.
      if (isNonEmptyString(it.label)) {
        if (seenLabels.has(it.label)) errors.push(`items 의 label 이 겹친다: ${it.label} — 전환의 item 이 label 로 대조되므로 겹치면 시간이 두 칸에 중복 계상된다`);
        seenLabels.add(it.label);
      }
    });
  }
  return errors;
}

/**
 * items 가 얼어붙었는지 대조한다. done 만 바뀔 수 있고, 목록 자체(id·label·개수·순서)는
 * 시작 시점 그대로여야 한다.
 * 반환: 사람이 읽는 실패 줄 목록.
 */
export function frozenItemsErrors(before, after) {
  const a = before ?? [];
  const b = after ?? [];
  if (a.length !== b.length) {
    return [`items 개수가 바뀌었다 (${a.length} → ${b.length}) — 시작 후 요청 범위는 고정이다. 새로 생긴 일은 항목이 아니라 요청 밖 작업이다`];
  }
  const errors = [];
  for (let i = 0; i < a.length; i++) {
    // 요소가 객체가 아닐 수 있다. 여기서 터지면 판정 줄 대신 TypeError 가 나가고,
    // 그러면 "무엇이 잘못됐나"를 사람이 못 읽는다 — 이 함수는 validateRequest 보다 먼저 돈다.
    if (a[i] === null || typeof a[i] !== "object" || b[i] === null || typeof b[i] !== "object") {
      errors.push(`items[${i}] 가 객체가 아니다`);
      continue;
    }
    if (a[i].id !== b[i].id) {
      // 같은 id 가 다른 자리에 있으면 순서를 바꾼 것이다. 순서도 시작 시점에 정한 작업
      // 순서라 얼어붙는다 — 진행 중에 재배열하면 단계 띠가 "무엇을 어떤 순서로" 하기로
      // 했는지를 더는 말해 주지 않는다.
      const moved = a.some((x) => x.id === b[i].id);
      errors.push(moved
        ? `items 의 순서가 바뀌었다 (${i}번 자리: ${a[i].id} → ${b[i].id}) — 시작 시 정한 작업 순서는 고정이다`
        : `items[${i}].id 가 바뀌었다 (${a[i].id} → ${b[i].id}) — 시작 후 요청 범위는 고정이다`);
      continue; // 자리가 통째로 다른데 label 까지 다르다고 또 적으면 줄만 늘고 원인은 같다
    }
    if (a[i].label !== b[i].label) errors.push(`items[${i}].label 이 바뀌었다 (${a[i].label} → ${b[i].label}) — 시작 후 요청 범위는 고정이다`);
  }
  return errors;
}

/**
 * 스펙 파일에서 items 를 뽑는다. 출처는 **불변식 정의 앵커**다(docs-contract 2절).
 *
 * 왜 시나리오가 아니라 불변식인가: 시나리오는 한 불변식을 여러 각도로 쪼갠 것이라 개수가
 * 작성자의 판단이다. 진행률의 분모가 판단에 따라 흔들리면 그 숫자를 못 믿는다.
 * 불변식은 "어기면 사고가 나는 규칙" 하나당 하나라 개수가 스펙에 고정돼 있다.
 *
 * 정의 앵커만 센다 — 줄 맨 앞의 `- INV-...:` 만이고, 본문에서 인용한 것은 항목이 아니다.
 */
export function itemsFromSpec(specText) {
  const items = [];
  const seen = new Set();
  for (const line of String(specText ?? "").split(/\r?\n/)) {
    const m = line.match(/^- (INV-[A-Z0-9]+):\s*(.+)$/);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue; // 같은 ID 가 두 번 정의되면 첫 줄만 센다
    seen.add(id);
    // 라벨은 규칙 문장의 앞부분. 화면 한 줄에 들어가야 하므로 자른다.
    const label = m[2].replace(/\s*\(강제 위치:.*$/, "").trim();
    let short = label.length > 60 ? `${label.slice(0, 59)}…` : label;
    // 앞부분이 같은 불변식 둘이면 잘린 label 이 정확히 같아진다. label 은 전환과 항목을 잇는
    // 키라 겹치면 안 된다 — 겹칠 때만 id 를 앞에 붙여 구분한다(평소엔 안 붙인다).
    if (items.some((x) => x.label === short)) short = `${id} ${short}`.slice(0, 60);
    items.push({ id, label: short, done: false });
  }
  return items;
}
