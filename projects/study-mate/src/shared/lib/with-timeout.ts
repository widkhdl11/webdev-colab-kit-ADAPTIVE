/**
 * 상한 시간 안에 안 끝나면 기다리기를 멈춘다.
 *
 * 두 가지를 같이 한다: ① 넘겨준 신호를 끊어 상대가 붙잡고 있던 것을 놓게 하고
 * ② 우리 쪽 약속을 `TimeoutError` 로 끝낸다. ②만 하면 상대가 계속 돌고, ①만 하면
 * 신호를 안 보는 상대에게는 아무 일도 안 일어난다.
 *
 * **상대가 던진 오류는 시간 초과로 바꾸지 않는다** — 「상대가 거부했다」와 「상대가 느리다」는
 * 다른 일이고, 한 덩어리로 만들면 어느 쪽인지 로그에서 못 가른다.
 */
export class TimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`${timeoutMs}ms 안에 끝나지 않아 기다리기를 멈췄다`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort(new TimeoutError(timeoutMs));
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);

    // `run` 이 **동기적으로** 던지면 아래 두 핸들러가 안 돌아 타이머가 상한만큼 살아남는다.
    // 지금 제공자는 async 함수라 도달하지 않지만, 한 줄로 닫히는 자리다.
    try {
      run(controller.signal).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (cause) => {
          clearTimeout(timer);
          reject(cause);
        },
      );
    } catch (cause) {
      clearTimeout(timer);
      reject(cause);
    }
  });
}
