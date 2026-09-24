// verdict-sample.mjs — 판정 검토의 주간 실행이 쓰는 순수 함수 (spec: docs/specs/verdict-review.md).
//
// 파일·네트워크는 여기서 만지지 않는다. 그건 scripts/verdict-review.mjs 가 한다 — 그래야
// 표본 규칙(INV-VR1)과 닫힘 규칙(INV-VR5)을 가짜 DB 없이 테스트할 수 있다.

import { isClosed } from "../../../../scripts/lib/review-answer.mjs";
import { summarize, repeatedKinds, kindLabel, fmtPct, weekLabel, QUESTION_LABELS, REVIEW_WINDOW_MS } from "../../report/review-model.mjs";

export const SAMPLE_WINDOW_MS = 7 * 86_400_000;
export const PER_SIDE = 10;
export const PER_SOURCE_CAP = 5;
/** 마지막 실행이 이만큼 지나면 「실행이 안 돌았다」가 특이사항에 뜬다(INV-VR8). 주 1회 + 하루 여유. */
export const STALE_AFTER_HOURS = 8 * 24;

const QUESTION_ORDER = Object.keys(QUESTION_LABELS);
const SEOUL_OFFSET_MS = 9 * 3600_000;

/** 그 시각이 속한 ISO 주차(한국 시간 기준). 월요일 아침 실행이 그 월요일의 주차를 갖는다. */
export function isoWeekKst(ms) {
  const d = new Date(ms + SEOUL_OFFSET_MS);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7; // 월=0
  const thursday = day + (3 - dow) * 86_400_000;
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** 시드가 있는 난수 — 테스트가 같은 표본을 다시 뽑을 수 있게. 시드는 파일에 남는다. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * DB 행 → 표본 후보. 판정이 없거나(`hot_issue_at` 없음) 질문별 답이 없는 글은 null — 채점할 판정이 없다.
 * 판정 시각이 창 밖이어도 null (INV-VR1).
 */
export function toCandidate(row, nowMs) {
  const judged = Date.parse(row?.hot_issue_at ?? "");
  if (Number.isNaN(judged) || judged > nowMs || nowMs - judged > SAMPLE_WINDOW_MS) return null;
  const answers = row.hot_issue_answers;
  if (typeof answers !== "object" || answers === null) return null;
  const reasonsRaw = typeof row.hot_issue_reasons === "object" && row.hot_issue_reasons !== null ? row.hot_issue_reasons : {};
  const trueQuestions = QUESTION_ORDER.filter((q) => answers[q] === true);
  const reasons = {};
  for (const q of trueQuestions) {
    const r = reasonsRaw[q];
    if (typeof r === "string" && r.trim() !== "") reasons[q] = r.trim();
  }
  return {
    id: String(row.id),
    title: String(row.title_ko || row.title || ""),
    source: String(row.source_id ?? ""),
    source_name: String(row.source_name || row.source_id || ""),
    url: typeof row.original_url === "string" ? row.original_url : null,
    judged_at: row.hot_issue_at,
    verdict: { hot: row.gate !== null && row.gate !== undefined, true_questions: trueQuestions, reasons },
    summary: {
      one_line: typeof row.one_line === "string" ? row.one_line : null,
      points: Array.isArray(row.summary_points) ? row.summary_points.filter((p) => typeof p === "string").slice(0, 3) : [],
    },
  };
}

/**
 * 핫이슈 10 + 아님 10, 각각 무작위, 한 소스 표본 전체 5건 이하 (INV-VR1).
 *
 * 양쪽을 **번갈아** 뽑는다. 한쪽을 먼저 다 채우면 그쪽이 소스 상한을 먼저 써 버려서,
 * 한 매체가 많은 주에는 뒤에 뽑는 쪽만 그 매체를 못 받는다 — 두 쪽의 소스 분포가 달라진다.
 */
export function drawSample(candidates, rng, perSide = PER_SIDE, cap = PER_SOURCE_CAP) {
  // 한 글이 두 주에 뽑히지 않게 호출하는 쪽이 지난 표본의 id 를 빼서 넘긴다(excludeSampled).
  const pools = {
    hot: shuffle(candidates.filter((c) => c.verdict.hot), rng),
    not_hot: shuffle(candidates.filter((c) => !c.verdict.hot), rng),
  };
  const bySource = new Map();
  const picked = { hot: [], not_hot: [] };
  const take = (side) => {
    const pool = pools[side];
    while (pool.length > 0) {
      const c = pool.shift();
      if ((bySource.get(c.source) ?? 0) >= cap) continue;
      bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
      picked[side].push(c);
      return true;
    }
    return false;
  };
  const blocked = { hot: [], not_hot: [] }; // 상한 때문에 못 뽑은 후보 — 아래 맞바꾸기가 쓴다
  const takeOrBlock = (side) => {
    const pool = pools[side];
    while (pool.length > 0) {
      const c = pool[0];
      if ((bySource.get(c.source) ?? 0) >= cap) { blocked[side].push(pool.shift()); continue; }
      return take(side);
    }
    return false;
  };
  let open = { hot: true, not_hot: true };
  while ((open.hot && picked.hot.length < perSide) || (open.not_hot && picked.not_hot.length < perSide)) {
    for (const side of ["hot", "not_hot"]) {
      if (open[side] && picked[side].length < perSide) open[side] = takeOrBlock(side);
    }
  }
  // 맞바꾸기: 한쪽이 모자란데 그 이유가 상한이면, 반대쪽이 같은 출처 글을 내주고 대신 상한이 안 찬
  // 다른 출처 글을 받을 수 있는지 본다. 번갈아 뽑으면 먼저 뽑은 쪽이 출처를 선점해서, 반대쪽은
  // 다른 출처로 채울 수 있었는데도 모자라게 된다.
  const other = { hot: "not_hot", not_hot: "hot" };
  for (const side of ["hot", "not_hot"]) {
    const o = other[side];
    for (const want of [...blocked[side]]) {
      if (picked[side].length >= perSide) break;
      const give = picked[o].findIndex((p) => p.source === want.source);
      if (give < 0) continue;
      const refill = [...pools[o], ...blocked[o]].findIndex((c) => c.source !== want.source && (bySource.get(c.source) ?? 0) < cap);
      if (refill < 0) continue;
      const rest = [...pools[o], ...blocked[o]];
      const sub = rest[refill];
      pools[o] = rest.filter((_, i) => i !== refill);
      blocked[o] = [];
      picked[o][give] = sub; // 같은 출처 하나가 빠지고 다른 출처 하나가 들어왔다 — want.source 수는 그대로
      bySource.set(sub.source, (bySource.get(sub.source) ?? 0) + 1);
      picked[side].push(want);
    }
  }
  // 화면 번호 순서도 섞는다 — 앞 10건이 전부 핫이슈면 사람이 판정을 보기 전에 답을 짐작한다.
  const items = shuffle([...picked.hot, ...picked.not_hot], rng);
  return {
    items,
    shortfall: { hot: perSide - picked.hot.length, not_hot: perSide - picked.not_hot.length },
  };
}

/**
 * 지난 표본에 이미 들어간 글을 뺀다. 실행이 하루 이틀 밀리면 이번 창과 지난 창이 겹쳐서,
 * 같은 판정을 두 주에 두 번 채점하고 두 주 집계에 모두 들어간다.
 */
export function excludeSampled(candidates, samples) {
  const seen = new Set((samples ?? []).flatMap((s) => (s.items ?? []).map((i) => i.id)));
  return candidates.filter((c) => !seen.has(c.id));
}

/**
 * 주를 닫을 때의 상태. 안 닫힐 주면 null.
 *
 * 이번 주가 아닌 표본은 7일이 덜 찼어도 닫는다. 주간 실행은 매주 **같은 시각쯤** 돌아서, 지난주
 * 추출보다 몇 초 이르게 돌면 「7일 경과」가 아직 거짓이다 — 그러면 그 주가 한 주 더 열려 있고
 * 열린 주가 둘이 된다.
 */
export function closeStatus(sample, summaryLines, nowMs, currentWeek) {
  if ((summaryLines ?? []).some((l) => l?.week === sample.week)) return null; // 이미 줄이 있다(INV-VR5 중복 금지)
  const s = summarize(sample);
  if (s.total > 0 && s.answered === s.total) return "reviewed";
  if (isClosed(sample, [], nowMs) || sample.week !== currentWeek) return "unreviewed";
  return null;
}

/**
 * 집계 한 줄 (report-contract 15절). 미검토 주의 정확도는 null 이다 — 답한 것만으로 낸 숫자는
 * 그 주의 판정 정확도가 아니다(INV-VR6). 건수는 남긴다.
 */
export function summaryLine(sample, status, nowIso) {
  const s = summarize(sample);
  // 첫 답 → 전부 답이 생긴 순간. 그 뒤에 고친 답은 걸린 시간에 넣지 않는다.
  const elapsedMs = status === "reviewed" && sample.first_answer_at && sample.completed_at
    ? Date.parse(sample.completed_at) - Date.parse(sample.first_answer_at)
    : null;
  return {
    week: sample.week,
    status,
    closed_at: nowIso,
    total: s.total,
    answered: s.answered,
    correct: s.correct,
    wrong: s.wrong,
    unsure: s.unsure,
    accuracy: status === "reviewed" ? s.accuracy : null,
    by_direction: s.byDirection,
    by_question: s.byQuestion,
    by_source: s.bySource,
    kinds: s.kinds,
    answer_minutes: elapsedMs === null || Number.isNaN(elapsedMs) ? null : Math.round(elapsedMs / 60000),
  };
}

/**
 * 대시보드 특이사항에 띄울 줄 (INV-VR8). 모양은 report-contract 16절 — { tone, text }. tone: warn = 사람이 손쓸 일, info = 상황 설명.
 * openSample: 지금 답을 받는 주(없으면 null). lines: 집계 줄 전부. failure: 실행 실패 메시지(없으면 null).
 */
export function noticeRows(openSample, lines, failure) {
  const rows = [];
  if (failure) rows.push({ tone: "warn", text: `판정 검토 실행 실패 — ${failure}` });
  if (openSample) {
    const s = summarize(openSample);
    // 답한 수도 「대기」도 적지 않는다 — 이 줄은 주간 실행 때만 새로 쓰여서, 다 답한 뒤에도 다음 실행까지
    // 남는다. 그래서 사실(열려 있다·언제까지)만 적는다.
    if (s.answered < s.total) {
      const until = new Date(Date.parse(openSample.extracted_at) + REVIEW_WINDOW_MS + 9 * 3600_000);
      rows.push({ tone: "warn", text: `${weekLabel(openSample.week)} 판정 표본 ${s.total}건이 열려 있다 (${until.getUTCMonth() + 1}/${until.getUTCDate()}까지) — 판정 검토 탭` });
    }
  }
  const reviewed = [...(lines ?? [])].filter((l) => l.status === "reviewed").sort((a, b) => a.week.localeCompare(b.week));
  const last = reviewed[reviewed.length - 1];
  if (last) {
    rows.push({ tone: "info", text: `${weekLabel(last.week)} 판정 정확도 ${fmtPct(last.accuracy)} (${last.correct + last.wrong}건 검토)` });
  }
  for (const r of repeatedKinds(lines)) {
    rows.push({
      tone: "warn",
      text: `판정 수정안 필요 — 「${kindLabel(r.kind)}」 오류가 ${r.weeks.map(weekLabel).join("·")}에 이어서 나왔다 — 판정 문장 수정안을 결정 카드로 올릴 차례`,
    });
  }
  return rows;
}
