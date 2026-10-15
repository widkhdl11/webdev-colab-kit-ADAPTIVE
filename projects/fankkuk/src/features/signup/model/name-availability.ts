// 가입 화면의 아이디·닉네임 미리 확인(signup INV-U14) — 입력을 멈춘 뒤 0.4초에 한 번 묻는다(업계 표준, DECISIONS 2026-10-15).
// 입력이 바뀌면 진행 중인 요청을 끊고(AbortController), 늦게 도착한 이전 값의 답은 버린다 — 안내는 언제나 지금 칸의 값에 대한 것이다.
// 미리 확인은 안내일 뿐이다. 최종 판정은 가입 때 DB 제약이 한다(INV-U3·U13).

export const AVAILABILITY_DELAY_MS = 400;

/** 서버의 답 넷 + 요청 자체가 실패함(error). */
export type NameAnswer = "available" | "taken" | "invalid" | "rate_limited" | "error";

export type AvailabilityState = { value: string; status: "checking" | NameAnswer };

export type AvailabilityCheck = (value: string, signal: AbortSignal) => Promise<NameAnswer>;

export function createAvailabilityWatcher(opts: {
  check: AvailabilityCheck;
  onChange: (state: AvailabilityState | null) => void;
  delayMs?: number;
}) {
  const delay = opts.delayMs ?? AVAILABILITY_DELAY_MS;
  let current: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };

  return {
    /** value: 확인할 값(앞뒤 공백 뺀 것). null 이면 묻지 않는다 — 빈칸이거나 화면에서 이미 형식이 틀린 값. */
    update(value: string | null) {
      if (value !== null && value === current) return; // 같은 값 — 기다리는 중이든 답이 왔든 그대로
      stop();
      current = value;
      if (value === null) {
        opts.onChange(null);
        return;
      }
      opts.onChange({ value, status: "checking" });
      timer = setTimeout(() => {
        timer = null;
        const mine = new AbortController();
        controller = mine;
        opts
          .check(value, mine.signal)
          // 값이 바뀌면 stop() 이 이 요청을 끊는다 — 끊긴 요청의 답(늦게 도착한 것 포함)은 버린다
          .then((answer) => {
            if (!mine.signal.aborted) opts.onChange({ value, status: answer });
          })
          .catch(() => {
            if (!mine.signal.aborted) opts.onChange({ value, status: "error" });
          });
      }, delay);
    },
    dispose() {
      stop();
      current = null;
    },
  };
}
