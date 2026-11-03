// 입력 칸 값을 서버에 미리 확인하는 감시기(이름이 비었는지 등 — 무엇을 묻는지는 부르는 쪽이 check 로 정한다).
// 입력을 멈춘 뒤 0.4초에 한 번 묻는다(업계 표준). 입력이 바뀌면 진행 중인 요청을 끊고(AbortController),
// 늦게 도착한 이전 값의 답은 버린다 — 안내는 언제나 지금 칸의 값에 대한 것이다.
// 「잠시 뒤에」 답(rate_limited·요청 실패) 뒤에는 같은 값도 다시 묻는다 — 그 답은 값에 대한 판정이 아니다.
// 미리 확인은 안내일 뿐이다. 최종 판정은 저장 때 서버가 한다.

export const AVAILABILITY_DELAY_MS = 400;

/** 서버의 답 + 요청 자체가 실패함(error). */
export type AvailabilityAnswer = "available" | "taken" | "invalid" | "reserved" | "rate_limited" | "error";

export type AvailabilityState = { value: string; status: "checking" | AvailabilityAnswer };

export type AvailabilityCheck = (value: string, signal: AbortSignal) => Promise<AvailabilityAnswer>;

/** 칸 아래 안내의 색: ok(맞음) · bad(틀림) · wait(흐린 안내 — 틀렸다는 뜻이 아니다) */
export type AvailabilityTone = "ok" | "bad" | "wait";

const RETRYABLE: ReadonlySet<AvailabilityAnswer> = new Set(["rate_limited", "error"]);

export function createAvailabilityWatcher(opts: {
  check: AvailabilityCheck;
  onChange: (state: AvailabilityState | null) => void;
  delayMs?: number;
}) {
  const delay = opts.delayMs ?? AVAILABILITY_DELAY_MS;
  let current: string | null = null;
  let answer: AvailabilityAnswer | null = null; // current 에 대한 답(아직 없으면 null)
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
      .catch((): AvailabilityAnswer => "error")
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
