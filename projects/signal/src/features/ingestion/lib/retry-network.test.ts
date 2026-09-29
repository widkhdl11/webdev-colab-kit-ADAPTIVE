import { describe, expect, it, vi } from "vitest";
import { isConnectionFailure, retryOnConnectionFailure } from "./retry-network";

/** undici 가 접속 단계에서 끊겼을 때 던지는 모양 그대로. */
const connectionError = () => new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });

describe("isConnectionFailure — 다시 시도할 실패만 고른다", () => {
  it("접속 단계 실패(fetch failed)는 다시 시도한다", () => {
    expect(isConnectionFailure(connectionError())).toBe(true);
  });

  it("시간 초과는 다시 시도하지 않는다 — 수집 시간 예산을 두 배로 쓴다", () => {
    expect(isConnectionFailure(new DOMException("timed out", "TimeoutError"))).toBe(false);
  });

  it("서버가 답한 실패(HTTP 코드)는 다시 시도하지 않는다 — 봇 차단 429 는 몇 번을 해도 같다", () => {
    expect(isConnectionFailure(new Error("HTTP 429"))).toBe(false);
  });

  it("공개 주소 검사에 막힌 것은 다시 시도하지 않는다", () => {
    expect(isConnectionFailure(new Error("공개 주소가 아니라 요청하지 않는다"))).toBe(false);
  });
});

describe("retryOnConnectionFailure", () => {
  it("접속 실패 한 번 뒤 성공하면 그 결과를 돌려준다 — 기다린 뒤에 다시 부른다", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValueOnce(connectionError()).mockResolvedValueOnce("ok");
    await expect(retryOnConnectionFailure(fn, { delayMs: 2000, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("두 번째도 실패하면 그 오류를 그대로 던진다 — 세 번은 부르지 않는다", async () => {
    const second = connectionError();
    const fn = vi.fn().mockRejectedValueOnce(connectionError()).mockRejectedValueOnce(second);
    await expect(retryOnConnectionFailure(fn, { delayMs: 0, sleep: async () => {} })).rejects.toBe(second);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("다시 시도할 실패가 아니면 한 번만 부르고 바로 던진다", async () => {
    const err = new Error("HTTP 429");
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValue(err);
    await expect(retryOnConnectionFailure(fn, { delayMs: 2000, sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("처음에 성공하면 기다리지 않는다", async () => {
    const sleep = vi.fn(async () => {});
    await expect(retryOnConnectionFailure(async () => 1, { delayMs: 2000, sleep })).resolves.toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
