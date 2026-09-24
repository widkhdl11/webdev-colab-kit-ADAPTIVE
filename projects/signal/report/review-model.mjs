// review-model.mjs — 판정 검토의 집계. **화면(review.html)과 주간 실행(scripts/verdict-review.mjs)이
// 같은 함수를 쓴다** (verdict-review INV-VR6). 각자 세면 같은 주에 두 숫자가 뜬다.
//
// 브라우저에서도 읽히므로 의존성 없는 순수 함수만 둔다.
// 파일 모양: docs/references/report-contract.md 14·15절.

/**
 * 저장된 질문 키 → 화면 라벨. 저장 키는 DB 값이라 한글이다(summary-format.ts 의 SIGNAL_STORED_KEYS).
 * 라벨은 상세 화면(article-view.tsx)과 같아야 한다 — tests/verdict-review.test.ts 가 대조한다.
 */
export const QUESTION_LABELS = {
  "변화": "실무 영향",
  "방향": "흐름 변화",
  "기회": "시한 있음",
};

export const ANSWER_LABELS = { correct: "맞다", wrong: "틀리다", unsure: "모르겠다" };

/**
 * 방향 라벨. 버튼에 쓰는 말과 집계에 쓰는 말이 다르다 — 버튼은 사람이 고르는 말, 집계는 오류의 이름.
 * 화면 말은 devtool-ui-standards.md 8절 표를 따른다(「방향 미상」 → 「어느 쪽인지 안 고름」).
 */
export const DIRECTION_LABELS = {
  should_be_hot: "핫이슈여야 함",
  should_not_be_hot: "핫이슈가 아니어야 함",
  wrong_reason: "근거가 엉뚱함",
  unknown: "어느 쪽인지 안 고름",
};
export const DIRECTION_ERROR_LABELS = {
  should_be_hot: "놓친 핫이슈",
  should_not_be_hot: "잘못 뽑음",
  wrong_reason: "근거 오류",
  unknown: "어느 쪽인지 안 고름",
};

/**
 * 판정에 붙을 수 있는 방향 (INV-VR3). 서버의 `DIRECTIONS_FOR`(scripts/lib/review-answer.mjs)와
 * 같아야 한다 — 화면은 킷 폴더를 못 읽어서 사본을 두고, tests/verdict-review.test.ts 가 대조한다.
 * `unknown` 은 고르는 버튼이 아니라 안 고르고 닫은 결과라 여기 없다.
 */
export function directionsFor(item) {
  return item?.verdict?.hot === true ? ["should_not_be_hot", "wrong_reason"] : ["should_be_hot"];
}

/** 한 주의 검토 기간 — 서버의 `REVIEW_WINDOW_MS` 와 같아야 한다(테스트가 대조한다). */
export const REVIEW_WINDOW_MS = 7 * 86_400_000;

/**
 * 화면이 보는 「닫힌 주」. 서버의 `isClosed` 와 같은 판정이다(테스트가 대조한다) — 어긋나면 버튼은
 * 켜져 있는데 누르면 거부된다. 추출 시각을 못 읽으면 닫힌 것으로 본다(서버와 같다).
 */
export function isClosedView(sample, lines, nowMs) {
  if ((lines ?? []).some((l) => l?.week === sample?.week)) return true;
  const at = Date.parse(sample?.extracted_at ?? "");
  return Number.isNaN(at) || nowMs - at >= REVIEW_WINDOW_MS;
}

/** 2026-W39 → 「9/21 주」. 화면에 ISO 주차 표기를 그대로 내보내지 않는다(8절 원칙 1). */
export function weekLabel(week) {
  const m = weekMonday(week);
  if (m === null) return String(week ?? "");
  const d = new Date(m);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} 주`;
}

const inc = (obj, key) => { obj[key] = (obj[key] ?? 0) + 1; };

/**
 * 틀린 답 하나가 만드는 오류 종류(INV-VR7). 방향 × 질문이다.
 * 놓친 핫이슈는 참인 질문이 없으니 방향만으로 한 종류. 방향 미상은 종류가 없다.
 * 핫이슈인데 참인 질문이 비어 있는 글(저장이 어긋난 판정)도 방향만으로 센다 — 안 세면 그 오류가
 * 매주 나와도 반복 표시가 영영 안 뜬다.
 */
export function errorKinds(item, answer) {
  if (answer?.answer !== "wrong") return [];
  const d = answer.direction ?? "unknown";
  if (d === "should_be_hot") return ["should_be_hot"];
  if (d === "unknown") return [];
  const qs = item.verdict?.true_questions ?? [];
  return qs.length === 0 ? [d] : qs.map((q) => `${d}:${q}`);
}

/** 오류 종류 → 사람이 읽는 이름. 「잘못 뽑음 · 시한 있음」 */
export function kindLabel(kind) {
  const [d, q] = kind.split(":");
  const head = DIRECTION_ERROR_LABELS[d] ?? d;
  return q === undefined ? head : `${head} · ${QUESTION_LABELS[q] ?? q}`;
}

/**
 * 한 주 표본의 집계 (INV-VR6).
 * accuracy = 맞다 / (맞다 + 틀리다). 모르겠다는 분모에서 뺀다. 분모가 0 이면 null — 0% 가 아니다.
 */
export function summarize(sample) {
  const items = sample?.items ?? [];
  const answers = sample?.answers ?? {};
  const counts = { correct: 0, wrong: 0, unsure: 0 };
  const byDirection = {};
  const byQuestion = {};
  const bySource = {};
  const kinds = {};
  let answered = 0;
  for (const item of items) {
    const a = answers[item.id];
    if (!a || !(a.answer in counts)) continue;
    answered += 1;
    counts[a.answer] += 1;
    if (a.answer !== "wrong") continue;
    inc(byDirection, a.direction ?? "unknown");
    inc(bySource, item.source);
    // 질문별은 핫이슈 글의 오류만 센다. 아님 글에도 참인 질문이 남아 있을 수 있다 — 같은 사건이
    // 이미 있어 빠진 글(INV-G4)과 배정이 실패한 글이 그렇다. 그 오류는 질문 탓이 아니다.
    if (item.verdict?.hot === true) for (const q of item.verdict.true_questions ?? []) inc(byQuestion, q);
    for (const k of errorKinds(item, a)) inc(kinds, k);
  }
  const denom = counts.correct + counts.wrong;
  return {
    total: items.length,
    answered,
    ...counts,
    accuracy: denom === 0 ? null : counts.correct / denom,
    byDirection,
    byQuestion,
    bySource,
    kinds,
  };
}

/**
 * 수정안이 필요한 오류 종류 (INV-VR7). 집계 줄(review-summary.jsonl)을 주차 순으로 훑는다.
 *
 * - **켜짐**: 연속한 두 검토됨 주에 같은 종류가 모두 나왔다. 사이에 미검토 주가 끼거나 주가 비면
 *   (실행이 안 돈 주) 짝이 아니다.
 * - **꺼짐**: 그 뒤 검토된 주에서 그 종류가 안 나왔다. 수정안을 승인해 문장을 고쳤으면 다음 검토 주에서
 *   줄어드는지가 판정이라(설계 C) 그때 꺼지는 것이 맞다.
 * - 미검토 주는 끄지 않는다. 한 주를 못 봤다고 표시가 사라지면 원인은 그대로인데 신호만 없어진다.
 *
 * weeks 는 그 종류가 나온 검토됨 주들(켜진 짝부터).
 */
export function repeatedKinds(lines) {
  const sorted = [...(lines ?? [])].filter((l) => typeof l?.week === "string").sort((a, b) => a.week.localeCompare(b.week));
  const active = new Map();
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    if (cur.status !== "reviewed") continue;
    const now = cur.kinds ?? {};
    for (const [kind, v] of active) {
      if ((now[kind] ?? 0) > 0) { v.weeks.push(cur.week); v.counts.push(now[kind]); } else active.delete(kind);
    }
    const prev = sorted[i - 1];
    if (!prev || prev.status !== "reviewed" || !consecutiveWeeks(prev.week, cur.week)) continue;
    const before = prev.kinds ?? {};
    for (const kind of Object.keys(now)) {
      if (active.has(kind) || !((before[kind] ?? 0) > 0 && now[kind] > 0)) continue;
      active.set(kind, { weeks: [prev.week, cur.week], counts: [before[kind], now[kind]] });
    }
  }
  return [...active.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([kind, v]) => ({ kind, ...v }));
}

/** 2026-W39 → 그 주 월요일(UTC 자정 기준 날짜). ISO 주차: 1월 4일이 든 주가 1주다. */
export function weekMonday(week) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const jan4Dow = (new Date(jan4).getUTCDay() + 6) % 7; // 월=0
  return jan4 - jan4Dow * 86_400_000 + (Number(m[2]) - 1) * 7 * 86_400_000;
}

export function consecutiveWeeks(a, b) {
  const ma = weekMonday(a);
  const mb = weekMonday(b);
  return ma !== null && mb !== null && mb - ma === 7 * 86_400_000;
}

/** 목록 순서: 안 답한 것이 위, 답한 것이 아래. 각 묶음 안에서는 표본 번호 순. */
export function orderItems(sample) {
  const answers = sample?.answers ?? {};
  const all = (sample?.items ?? []).map((item, i) => ({ item, no: i + 1, answer: answers[item.id] ?? null }));
  return [...all.filter((r) => r.answer === null), ...all.filter((r) => r.answer !== null)];
}

/** 0.8 → "80%". null → "—" (값 없음). */
export const fmtPct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
