// decision-model.mjs — 결정 카드(`report/decision.json`)의 **판정만** 하는 순수 함수들.
//
// 왜 파일을 따로 두나: 판정을 기록 스크립트 안에 두면 검사가 그것을 못 부른다. 그러면
// 검사는 "스크립트를 돌려 보고 종료 코드를 본다"밖에 못 하는데, 그건 어느 규칙이 잡았는지
// 구별하지 못해서 위반을 심어도 "그냥 거부됐다"로만 보인다. report-model·request-model 과
// 같은 자리에 두는 이유도 같다.
//
// 정본 규약: docs/references/report-contract.md 12절

export const FIELD_MAX = 60;
export const RISK_MAX_LINES = 2;
export const DECISION_STATUS = ["대기", "답변됨"];

/** 카드 본문 칸. 문장 규칙(길이·금지 표현·내부 용어)이 걸리는 자리는 여기뿐이다. */
export const BODY_FIELDS = [
  "what", "why", "visible_change", "risk_and_guard", "not_doing", "also_fixing", "done_when",
];

/** 한 줄 60자 칸. `risk_and_guard` 는 두 줄까지라 따로 본다. */
const ONE_LINE = ["what", "why", "visible_change", "not_doing", "also_fixing"];

/** 값이 `null` 이어도 되는 칸. 나머지는 빠지거나 비면 위반이다. */
const NULLABLE = ["also_fixing", "answer", "answered_at"];

export const REQUIRED_KEYS = [
  "id", "task", "asked_at", "answer_options",
  "what", "why", "visible_change", "risk_and_guard", "not_doing", "also_fixing",
  "done_when", "details_ref", "status", "answer", "answered_at",
];

// ── 카드 본문에 나오면 안 되는 것 ────────────────────────────────────────
//
// 규약 12절 문장 규칙 1. 이것들은 `details_ref` 가 가리키는 곳에만 있어야 한다.
// `details_ref` 자체는 검사 대상이 아니다 — 거기는 경로를 적는 자리다.

/** `a/b` 꼴. **ASCII 로만 이뤄진 것만** 경로로 본다 — 한국어 문장의 「찬성/반대」를 잡지 않으려고. */
const PATH_RE = /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/;
/** 규칙 번호. `INV-D6` · `INV-A8` 같은 것. */
const RULE_RE = /\bINV-/i;
/** 파일 이름. 확장자로 판정한다 — `render.mjs` 처럼 경로 없이 파일만 적는 경우가 있다. */
const FILE_RE = /\.(mjs|cjs|js|ts|tsx|jsx|json|jsonl|md|css|html|sql|yml|yaml)\b/i;
/** 실행 그래프의 노드 id. 낱말 전체로 일치할 때만 — 한국어 문장 안에 섞여도 눈에 띈다. */
const NODE_IDS = ["product", "spec", "design", "implement", "qa", "review", "deploy",
  "page-designer", "schema-designer"];

/** 카드 본문 칸 하나에서 「본문에 쓰면 안 되는 것」을 찾는다. 없으면 빈 배열. */
export function forbiddenHits(field, text) {
  const hits = [];
  if (typeof text !== "string" || text === "") return hits;
  if (PATH_RE.test(text)) hits.push({ field, kind: "경로", found: text.match(PATH_RE)[0] });
  if (RULE_RE.test(text)) hits.push({ field, kind: "규칙 번호", found: "INV-" });
  if (FILE_RE.test(text)) hits.push({ field, kind: "파일 이름", found: text.match(FILE_RE)[0] });
  for (const id of NODE_IDS) {
    if (new RegExp(`(^|[^A-Za-z0-9_-])${id}([^A-Za-z0-9_-]|$)`).test(text)) {
      hits.push({ field, kind: "단계 이름", found: id });
    }
  }
  return hits;
}

// ── 금지 표현 표 ─────────────────────────────────────────────────────────

/**
 * 표의 한 줄에서 **찾을 문자열**을 만든다.
 *
 * 사전형 그대로 찾으면 못 잡는다 — 표에 「씻다」라고 적어도 문장에는 「씻어서」로 나온다.
 * 그래서 `다` 로 끝나는 줄은 그것을 떼고 어간으로 찾는다(씻다 → 씻, 닿는다 → 닿는).
 * 활용이 어간까지 바뀌는 말은 표에 `match` 를 직접 적어 덮는다.
 */
export function matchTextOf(entry) {
  if (typeof entry?.match === "string" && entry.match !== "") return entry.match;
  const w = String(entry?.word ?? "");
  return w.endsWith("다") && w.length > 1 ? w.slice(0, -1) : w;
}

export const DEFAULT_VOCAB = { banned: [] };

/** 표를 읽는다. 모양이 틀렸으면 빈 표가 아니라 **오류**다 — 조용히 통과하면 방벽이 열린다. */
export function parseVocab(raw) {
  if (raw === null || raw === undefined) return { vocab: DEFAULT_VOCAB, errors: ["금지 표현 표가 없다"] };
  if (typeof raw !== "object" || !Array.isArray(raw.banned)) {
    return { vocab: DEFAULT_VOCAB, errors: ["금지 표현 표의 banned 가 배열이 아니다"] };
  }
  const errors = [];
  raw.banned.forEach((e, i) => {
    if (typeof e?.word !== "string" || e.word === "") errors.push(`banned[${i}].word 가 비었다`);
    if (typeof e?.instead !== "string" || e.instead === "") errors.push(`banned[${i}].instead 가 비었다`);
  });
  return { vocab: errors.length ? DEFAULT_VOCAB : raw, errors };
}

/** 카드 본문 칸에서 금지 표현을 찾는다. **본문 칸만 본다** — 화면 라벨은 25번 프로브가 본다. */
export function bannedHits(decision, vocab) {
  const hits = [];
  const table = Array.isArray(vocab?.banned) ? vocab.banned : [];
  for (const field of BODY_FIELDS) {
    const value = decision?.[field];
    const texts = Array.isArray(value) ? value : [value];
    for (const text of texts) {
      if (typeof text !== "string") continue;
      for (const entry of table) {
        const needle = matchTextOf(entry);
        if (needle !== "" && text.includes(needle)) {
          hits.push({ field, word: entry.word, instead: entry.instead });
        }
      }
    }
  }
  return hits;
}

// ── 스키마 ───────────────────────────────────────────────────────────────

const isIso = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const lines = (v) => String(v).split("\n");

/**
 * `done_when` 의 원소가 완결 문장인가.
 *
 * 점(·)으로 이은 조각을 막는 것이 규약의 문장이지만, 점 없이도 명사 조각은 쓸 수 있다
 * (「본문 보임」). 한국어 평서문은 `다` 로 끝나므로 그것을 같이 요구한다 — 명사형
 * 어미(-임·-함·-음)가 여기서 걸린다.
 */
function doneWhenErrors(list) {
  const errors = [];
  if (!Array.isArray(list)) return ["done_when 이 배열이 아니다"];
  if (list.length < 2 || list.length > 5) errors.push(`done_when 은 2~5개다 (지금 ${list.length}개)`);
  list.forEach((s, i) => {
    if (typeof s !== "string" || s.trim() === "") { errors.push(`done_when[${i}] 가 비었다`); return; }
    if (s.includes("·")) errors.push(`done_when[${i}] 가 점(·)으로 이은 조각이다: ${s}`);
    if (!/다\.?$/.test(s.trim())) errors.push(`done_when[${i}] 가 완결 문장이 아니다(「…다」로 끝나야 한다): ${s}`);
    if (s.length > FIELD_MAX) errors.push(`done_when[${i}] 가 ${FIELD_MAX}자를 넘는다 (${s.length}자)`);
  });
  return errors;
}

/**
 * 카드 하나를 판정한다. 오류 문자열 배열을 돌려주고, 빈 배열이면 통과다.
 *
 * `vocab` 을 주면 금지 표현까지 같이 본다. 안 주면 스키마·문장 규칙만 본다 —
 * 표를 못 읽은 것과 표가 비어 있는 것을 부르는 쪽에서 구별해야 해서 여기서 삼키지 않는다.
 */
export function validateDecision(d, vocab = null) {
  const errors = [];
  if (d === null || typeof d !== "object" || Array.isArray(d)) return ["결정 카드가 객체가 아니다"];

  for (const key of REQUIRED_KEYS) {
    if (!(key in d)) errors.push(`칸이 빠졌다: ${key}`);
  }

  if (typeof d.id !== "string" || !/-d\d+$/.test(d.id)) {
    errors.push("id 는 「<사이클 id>-d<연번>」 이어야 한다 (예: signal2-20260918-1-d1)");
  }
  if (typeof d.task !== "string" || d.task.trim() === "") errors.push("task 가 비었다");
  if (!isIso(d.asked_at)) errors.push("asked_at 이 ISO8601 이 아니다");

  if (!Array.isArray(d.answer_options)) errors.push("answer_options 가 배열이 아니다");
  else {
    if (d.answer_options.length < 2 || d.answer_options.length > 4) {
      errors.push(`answer_options 는 2~4개다 (지금 ${d.answer_options.length}개)`);
    }
    d.answer_options.forEach((o, i) => {
      if (typeof o !== "string" || o.trim() === "") errors.push(`answer_options[${i}] 가 비었다`);
    });
  }

  for (const key of ONE_LINE) {
    const v = d[key];
    if (v === null || v === undefined) {
      if (!NULLABLE.includes(key)) errors.push(`${key} 가 비었다`);
      continue;
    }
    if (typeof v !== "string" || v.trim() === "") { errors.push(`${key} 가 비었다`); continue; }
    if (v.includes("\n")) errors.push(`${key} 는 한 줄이다`);
    if (v.length > FIELD_MAX) errors.push(`${key} 가 ${FIELD_MAX}자를 넘는다 (${v.length}자)`);
  }

  if (typeof d.risk_and_guard !== "string" || d.risk_and_guard.trim() === "") {
    errors.push("risk_and_guard 가 비었다");
  } else {
    const rows = lines(d.risk_and_guard);
    if (rows.length > RISK_MAX_LINES) errors.push(`risk_and_guard 는 ${RISK_MAX_LINES}줄까지다 (지금 ${rows.length}줄)`);
    rows.forEach((r, i) => {
      if (r.length > FIELD_MAX) errors.push(`risk_and_guard 의 ${i + 1}번째 줄이 ${FIELD_MAX}자를 넘는다 (${r.length}자)`);
    });
  }

  errors.push(...doneWhenErrors(d.done_when));

  if (typeof d.details_ref !== "string" || d.details_ref.trim() === "") errors.push("details_ref 가 비었다");

  if (!DECISION_STATUS.includes(d.status)) {
    errors.push(`status 는 ${DECISION_STATUS.join(" | ")} 중 하나다 (지금 ${JSON.stringify(d.status)})`);
  }
  if (d.status === "대기") {
    if (d.answer !== null) errors.push("아직 대기인데 answer 가 채워져 있다");
    if (d.answered_at !== null) errors.push("아직 대기인데 answered_at 이 채워져 있다");
  }
  if (d.status === "답변됨") {
    if (typeof d.answer !== "string" || d.answer.trim() === "") errors.push("답변됨인데 answer 가 비었다");
    else if (Array.isArray(d.answer_options) && !d.answer_options.includes(d.answer)) {
      errors.push(`answer 가 고를 수 있는 값이 아니다: ${d.answer}`);
    }
    if (!isIso(d.answered_at)) errors.push("답변됨인데 answered_at 이 ISO8601 이 아니다");
  }

  // 문장 규칙 1 — 본문 칸에 경로·규칙 번호·파일 이름·단계 이름이 없다.
  for (const field of BODY_FIELDS) {
    const value = d[field];
    const texts = Array.isArray(value) ? value : [value];
    for (const text of texts) {
      for (const hit of forbiddenHits(field, text)) {
        errors.push(`${hit.field} 에 ${hit.kind}이 들어 있다: ${hit.found} — 그것은 자세히 보는 곳에만 적는다`);
      }
    }
  }

  if (vocab !== null) {
    for (const hit of bannedHits(d, vocab)) {
      errors.push(`${hit.field} 에 쓰지 않는 표현이 있다: ${hit.word} → ${hit.instead}`);
    }
  }

  return errors;
}

/**
 * 결정과 `state.blockers` 가 물려 있는가 (규약 12절).
 *
 * 열린 결정에는 같은 `id` 의 대기 항목이 있어야 하고, 열린 결정이 없으면 결정에서 온
 * 대기 항목도 없어야 한다. 카드를 지우고 대기 항목만 남으면 화면은 영영 사람을 기다린다.
 */
export function blockerLinkErrors(decision, state) {
  const errors = [];
  const blockers = Array.isArray(state?.blockers) ? state.blockers : [];
  const open = decision !== null && decision !== undefined && decision.status === "대기";
  if (open) {
    const found = blockers.find((b) => b?.id === decision.id);
    if (!found) errors.push(`열린 결정 ${decision.id} 에 대응하는 대기 항목이 없다`);
    else if (found.label !== decision.what) {
      errors.push(`대기 항목의 이름이 결정의 「무엇을」과 다르다: ${found.label} ≠ ${decision.what}`);
    }
  } else {
    // 카드는 닫혔는데 대기 항목만 남은 경우. 화면은 영영 사람을 기다린다.
    for (const b of blockers) {
      if (typeof b?.id === "string" && /-d\d+$/.test(b.id)) {
        errors.push(`열린 결정이 없는데 결정에서 온 대기 항목이 남아 있다: ${b.id}`);
      }
    }
  }
  return errors;
}
