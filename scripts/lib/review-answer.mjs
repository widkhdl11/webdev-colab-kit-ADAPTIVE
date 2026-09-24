// review-answer.mjs — 대시보드 서버의 **유일한 쓰기 경로**가 받는 요청을 검증하고 적용한다.
//
// 정본 규약: docs/references/report-contract.md 13·14절.
//
// 서버(report-serve.mjs)는 이 파일의 함수만 부르고 판단을 따로 하지 않는다. 검사
// (scripts/check-report.mjs 43번)도 같은 함수를 부른다 — 검사가 자기 사본을 검사하면
// 서버가 달라져도 검사는 통과한다.
//
// 순수 함수만 둔다. 파일 읽기·쓰기는 서버가 한다.

/** 표본 파일 이름이 되는 주차. ISO 주차 표기(2026-W39) 하나만 받는다 — 경로 조각이 섞일 틈을 없앤다. */
export const WEEK_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

/** 쓰기 경로. 이것 말고는 전부 405 다. */
export const WRITE_PATH_RE = /^\/api\/review-samples\/([^/]+)$/;

export const ANSWERS = ["correct", "wrong", "unsure"];

/**
 * 틀리다의 방향. 판정이 핫이슈였는지에 따라 붙을 수 있는 방향이 다르다(verdict-review INV-VR3).
 * `unknown` 은 방향 없이 닫은 것이다 — 고를 방향이 둘 이상일 때만 생긴다.
 */
export const DIRECTIONS_FOR = {
  hot: ["should_not_be_hot", "wrong_reason", "unknown"],
  not_hot: ["should_be_hot"],
};

/** 요청 본문 상한(바이트). 답 하나는 100바이트 안팎이다. */
export const MAX_BODY_BYTES = 1024;

const BODY_KEYS = new Set(["id", "answer", "direction"]);

/**
 * 이 요청이 **이 PC 의 이 대시보드 화면**에서 왔는가.
 *
 * 127.0.0.1 에만 바인딩해도 막지 못하는 경로가 둘 있다:
 *  - 브라우저에 열린 아무 외부 사이트가 이 주소로 POST 를 보낸다 → `Origin` 이 그 사이트다.
 *  - DNS 재바인딩: 외부 도메인이 127.0.0.1 로 풀리게 해서 같은 출처인 척한다 → `Host` 가 그 도메인이다.
 * 그래서 둘 다 우리 주소여야 한다. `Origin` 이 없는 요청(curl 등 브라우저 밖)도 거부한다 —
 * 이 경로를 부르는 것은 화면 하나뿐이다.
 */
export function isLocalRequest(headers, port, remoteAddress) {
  const origin = String(headers?.origin ?? "").toLowerCase();
  return isLocalHost(headers, port, remoteAddress)
    && (origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`);
}

/**
 * 읽기(GET)에도 거는 검사 — 접속 주소가 루프백이고 `Host` 가 우리 주소인가.
 * `Origin` 은 요구하지 않는다(같은 출처 GET 에는 보통 안 붙는다). 이것이 없으면 DNS 재바인딩한
 * 외부 페이지가 `activity.jsonl`(실행한 명령 원문)을 같은 출처인 척 읽어 간다.
 */
export function isLocalHost(headers, port, remoteAddress) {
  const host = String(headers?.host ?? "").toLowerCase();
  const loopback = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
  return loopback && (host === `localhost:${port}` || host === `127.0.0.1:${port}`);
}

/** 한 주의 검토 기간. 추출 후 이만큼 지나면 답을 안 받는다(verdict-review INV-VR5). */
export const REVIEW_WINDOW_MS = 7 * 86_400_000;

/**
 * 이 주가 닫혔나. 두 경우다 — 집계 줄이 이미 있거나(`review-summary.jsonl` 에 그 주차),
 * 추출 후 7일이 지났다. **표본 파일에 닫힘 표시를 쓰지 않는다** — 그 파일을 쓰는 자리가 서버
 * 하나여야 쓰기를 한 줄로 세울 수 있다. 주간 실행이 같은 파일을 쓰면 두 프로세스가 서로의
 * 쓰기를 덮는다.
 */
export function isClosed(sample, summaryLines, nowMs, closing = false) {
  // closing: 주간 실행이 이 주를 닫기 시작했다는 표지(`review-samples/<주차>.closing`)가 있다.
  // 실행이 표본을 읽은 뒤 집계 줄을 쓰기 전 사이에 들어온 답은 줄에 안 들어간다 — 그 틈을 막는다.
  if (closing) return true;
  if ((summaryLines ?? []).some((l) => l?.week === sample?.week)) return true;
  const at = Date.parse(sample?.extracted_at ?? "");
  return Number.isNaN(at) || nowMs - at >= REVIEW_WINDOW_MS;
}

/**
 * 본문 문자열 → 검증된 답 요청. 실패하면 `{ ok: false, status, error }`.
 * 표본 파일(sample)과 대조해야 판정할 수 있는 것(없는 id·판정과 안 맞는 방향·닫힌 주)도 여기서 본다.
 */
export function validateAnswer(sample, rawBody, closed = false) {
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "본문이 JSON 이 아니다" };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: "본문은 객체여야 한다" };
  }
  for (const k of Object.keys(body)) {
    if (!BODY_KEYS.has(k)) return { ok: false, status: 400, error: `모르는 칸: ${k}` };
  }
  if (typeof body.id !== "string" || body.id === "") return { ok: false, status: 400, error: "id 가 문자열이 아니다" };
  if (!ANSWERS.includes(body.answer)) return { ok: false, status: 400, error: "answer 는 correct·wrong·unsure 중 하나다" };
  if (closed) return { ok: false, status: 409, error: "닫힌 주다 — 답을 받지 않는다" };

  const item = (sample?.items ?? []).find((i) => i.id === body.id);
  if (!item) return { ok: false, status: 404, error: "표본에 없는 id 다" };

  const allowed = DIRECTIONS_FOR[item.verdict?.hot === true ? "hot" : "not_hot"];
  let direction = null;
  if (body.answer === "wrong") {
    if (body.direction === undefined) {
      // 고를 방향이 하나뿐이면 그것이다. 둘 이상인데 안 골랐으면 방향 미상.
      direction = allowed.length === 1 ? allowed[0] : "unknown";
    } else if (allowed.includes(body.direction)) {
      direction = body.direction;
    } else {
      return { ok: false, status: 400, error: "이 판정에 붙을 수 없는 방향이다" };
    }
  } else if (body.direction !== undefined) {
    return { ok: false, status: 400, error: "방향은 틀리다에만 붙는다" };
  }
  return { ok: true, id: body.id, answer: body.answer, direction };
}

/**
 * 검증된 답을 표본에 적용한 **새 객체**를 돌려준다. 표본 칸(items)은 그대로 둔다(INV-VR2).
 * 걸린 시간은 `first_answer_at`(첫 답) → `completed_at`(전부 답이 생긴 순간, 한 번만 적힌다)이다.
 * 마지막 답의 시각으로 재면 며칠 뒤 한 건을 고친 것까지 「답하는 데 걸린 시간」에 들어간다.
 */
export function applyAnswer(sample, v, nowIso) {
  const answers = { ...(sample.answers ?? {}) };
  answers[v.id] = v.direction === null
    ? { answer: v.answer, at: nowIso }
    : { answer: v.answer, direction: v.direction, at: nowIso };
  const items = sample.items ?? [];
  const allAnswered = items.length > 0 && items.every((i) => answers[i.id] !== undefined);
  return {
    ...sample,
    answers,
    first_answer_at: sample.first_answer_at ?? nowIso,
    ...(sample.completed_at || allAnswered ? { completed_at: sample.completed_at ?? nowIso } : {}),
  };
}
