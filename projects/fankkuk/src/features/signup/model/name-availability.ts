// 가입 화면의 아이디·닉네임 미리 확인(signup INV-U14) — 입력을 멈춘 뒤 0.4초에 한 번 묻는다(업계 표준, DECISIONS 2026-10-15).
// 입력이 바뀌면 진행 중인 요청을 끊고(AbortController), 늦게 도착한 이전 값의 답은 버린다 — 안내는 언제나 지금 칸의 값에 대한 것이다.
// 「잠시 뒤에」 답(rate_limited·요청 실패) 뒤에는 같은 값도 다시 묻는다 — 그 답은 값에 대한 판정이 아니다.
// 「다음」은 settle 로 지금 값의 답이 올 때까지 기다렸다가 availabilityBlock 으로 판정한다(확인 중에 눌러도 넘어가지 않게).
// 미리 확인은 안내일 뿐이다. 최종 판정은 가입 때 DB 제약이 한다(INV-U3·U13).

export const AVAILABILITY_DELAY_MS = 400;

/** 서버의 답 넷 + 요청 자체가 실패함(error). */
export type NameAnswer = "available" | "taken" | "invalid" | "rate_limited" | "error";

export type AvailabilityState = { value: string; status: "checking" | NameAnswer };

export type AvailabilityCheck = (value: string, signal: AbortSignal) => Promise<NameAnswer>;

export type NameField = "loginId" | "nickname";

/** 칸 아래 안내의 색: ok(맞음) · bad(틀림) · wait(흐린 안내 — 틀렸다는 뜻이 아니다) */
export type AvailabilityTone = "ok" | "bad" | "wait";

/** 미리 확인의 답 → 칸 아래 안내. 「잠시 뒤에」는 틀렸다는 뜻이 아니라 흐린 안내로 둔다. */
export const AVAILABILITY_LINE: Record<AvailabilityState["status"], { tone: AvailabilityTone; message: string }> = {
  checking: { tone: "wait", message: "확인 중…" },
  available: { tone: "ok", message: "사용 가능합니다." },
  taken: { tone: "bad", message: "이미 사용 중입니다." },
  invalid: { tone: "bad", message: "입력 형식을 확인해 주세요." },
  rate_limited: { tone: "wait", message: "잠시 후 다시 확인해 주세요." },
  error: { tone: "wait", message: "잠시 후 다시 확인해 주세요." },
};

/** 「다음」을 눌렀는데 지금 값의 답을 끝내 받지 못했을 때(기다리는 사이 값이 바뀜) */
export const NAME_STILL_CHECKING = "아이디와 닉네임을 확인 중입니다. 완료 후 다시 눌러 주세요.";

/** 지금 칸 값에 대한 안내 — 답이 없거나 이전 값의 답이면 「확인 중」 */
export function availabilityLine(state: AvailabilityState | null, value: string): { tone: AvailabilityTone; message: string } {
  if (!state || state.value !== value) return AVAILABILITY_LINE.checking;
  return AVAILABILITY_LINE[state.status];
}

/**
 * 「다음」 판정. states: settle 이 돌려준 답 · values: 지금 칸 값(앞뒤 공백 뺀 것).
 * 이미 씀·형식 틀림이면 그 칸에서 막는다. 지금 값의 답이 없거나 아직 확인 중이면 「확인 중이에요」로 막는다.
 * 「잠시 뒤에」·요청 실패는 막지 않는다 — 가입 때 서버가 다시 본다(INV-U13).
 */
export function availabilityBlock(
  states: Record<NameField, AvailabilityState | null>,
  values: Record<NameField, string>,
): { field: NameField; message: string } | null {
  for (const field of ["loginId", "nickname"] as const) {
    const state = states[field];
    if (!state || state.value !== values[field] || state.status === "checking") return { field, message: NAME_STILL_CHECKING };
    const line = AVAILABILITY_LINE[state.status];
    if (line.tone === "bad") return { field, message: line.message };
  }
  return null;
}

const RETRYABLE: ReadonlySet<NameAnswer> = new Set(["rate_limited", "error"]);

export function createAvailabilityWatcher(opts: {
  check: AvailabilityCheck;
  onChange: (state: AvailabilityState | null) => void;
  delayMs?: number;
}) {
  const delay = opts.delayMs ?? AVAILABILITY_DELAY_MS;
  let current: string | null = null;
  let answer: NameAnswer | null = null; // current 에 대한 답(아직 없으면 null)
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let inFlight: Promise<AvailabilityState | null> | null = null;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    inFlight = null;
  };

  // 지금 값을 바로 묻는다. 끊기면(값이 바뀜) null 로 끝난다 — 끊긴 요청의 답(늦게 도착한 것 포함)은 버린다
  const ask = (value: string): Promise<AvailabilityState | null> => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const mine = new AbortController();
    controller = mine;
    const answered = opts
      .check(value, mine.signal)
      .catch((): NameAnswer => "error")
      .then((got) => {
        if (mine.signal.aborted) return null;
        answer = got;
        inFlight = null;
        const state = { value, status: got };
        opts.onChange(state);
        return state;
      });
    // 끊긴 요청이 끝내 답하지 않아도 기다리는 쪽(settle)은 끊긴 때 null 로 끝난다
    const cut = new Promise<null>((resolve) => mine.signal.addEventListener("abort", () => resolve(null), { once: true }));
    const run = Promise.race([answered, cut]);
    inFlight = run;
    return run;
  };

  const start = (value: string | null) => {
    stop();
    current = value;
    answer = null;
    if (value === null) {
      opts.onChange(null);
      return;
    }
    opts.onChange({ value, status: "checking" });
    timer = setTimeout(() => void ask(value), delay);
  };

  // 같은 값이고 기다리는 중이거나 값에 대한 답이 있으면 그대로 둔다
  const keeps = (value: string | null) => value !== null && value === current && !(answer !== null && RETRYABLE.has(answer));

  return {
    /** value: 확인할 값(앞뒤 공백 뺀 것). null 이면 묻지 않는다 — 빈칸이거나 화면에서 이미 형식이 틀린 값. */
    update(value: string | null) {
      if (keeps(value)) return;
      start(value);
    },
    /** 「다음」용 — value 의 답이 올 때까지 기다린다(0.4초 기다리는 중이면 바로 묻는다). 기다리는 사이 값이 바뀌면 null. */
    settle(value: string | null): Promise<AvailabilityState | null> {
      if (!keeps(value)) start(value);
      if (value === null) return Promise.resolve(null);
      if (answer !== null) return Promise.resolve({ value, status: answer });
      return inFlight ?? ask(value);
    },
    dispose() {
      stop();
      current = null;
      answer = null;
    },
  };
}
