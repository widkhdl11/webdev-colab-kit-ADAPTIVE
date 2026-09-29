/**
 * 접속 단계에서 끊긴 요청을 한 번 더 시도한다 (2026-09-29).
 *
 * hnrss.org 피드가 9/20~9/29 실행 23번 중 5번 `fetch failed` 로 실패했다. 서버가 답하기 전에
 * 접속이 끊긴 것이고, 같은 날 12번 연달아 부르면 전부 0.4~1.1초에 200 이었다 — 잠깐 끊기는 것이라
 * 한 번 더 부르면 산다. 지금까지는 한 번 실패하면 그 소스를 그날 통째로 건너뛰었다.
 *
 * **다시 시도하는 것은 접속 실패뿐이다.**
 * - 시간 초과: 한 번 더 기다리면 수집 시간 예산을 두 배로 쓴다.
 * - 서버가 답한 실패(`HTTP 429` 등): 답이 정해져 있다. VentureBeat 의 봇 차단은 몇 번을 해도 429 다.
 * - 공개 주소 검사(fetchPublic)에 막힌 것: 정책이지 사고가 아니다.
 *
 * 범위는 **응답 헤더를 받기까지**다. 본문을 읽다 끊기면 다른 오류가 나고 다시 시도하지 않는다 —
 * 관측된 실패가 전부 헤더 전(`fetch failed`)이었다. 다른 오류로 실패가 보이면 그때 넓힌다.
 */
export function isConnectionFailure(err: unknown): boolean {
  // undici(Node fetch)는 접속 단계 실패를 전부 `TypeError("fetch failed")` 로 감싸 던진다.
  return err instanceof TypeError && err.message === "fetch failed";
}

export interface RetryOptions {
  delayMs: number;
  /** 테스트가 시간을 안 쓰게 바꿔 끼운다. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryOnConnectionFailure<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isConnectionFailure(err)) throw err;
    await (opts.sleep ?? defaultSleep)(opts.delayMs);
    return fn();
  }
}
