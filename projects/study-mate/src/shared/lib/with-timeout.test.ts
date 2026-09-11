import { describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "./with-timeout";

// 스펙: docs/specs/ai-assist.md — INV-G5
//
// 「기다린 시간이 상한을 넘지 않는다」를 붙드는 자리. 끊지 않고 결국 받아 오는 것과
// 상한에서 포기하는 것은 화면에서 구별이 안 되므로 여기서 가른다.
//
// 진짜 시간을 쓴다(상한 20ms). 가짜 타이머로는 「상대가 안 끝났는데 우리가 먼저 끝난다」를
// 못 본다 — 타이머를 앞으로 돌리면 상대의 약속도 같이 풀려 버린다.

describe("INV-G5: 모델 호출은 상한 시간을 넘겨 기다리지 않는다", () => {
  it("INV-G5: 상한 안에 끝나면 그 값을 돌려준다", async () => {
    await expect(withTimeout(async () => "다 됐다", 50)).resolves.toBe("다 됐다");
  });

  it("INV-G5 (실패경로): 상한을 넘으면 TimeoutError 로 끝난다", async () => {
    const never = () => new Promise<string>(() => {});
    await expect(withTimeout(never, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("INV-G5 (실패경로): 상한을 넘으면 상대가 나중에 끝나도 그 값을 안 쓴다", async () => {
    let settled = false;
    const slow = () =>
      new Promise<string>((resolve) => {
        setTimeout(() => {
          settled = true;
          resolve("늦게 온 값");
        }, 80);
      });
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(TimeoutError);
    expect(settled).toBe(false);
  });

  it("INV-G5: 상한에 닿으면 넘겨준 신호가 끊긴다 — 상대가 붙잡고 있던 것을 놓을 수 있다", async () => {
    const seen = vi.fn();
    const never = (signal: AbortSignal) =>
      new Promise<string>(() => {
        signal.addEventListener("abort", () => seen(signal.reason));
      });
    await expect(withTimeout(never, 20)).rejects.toBeInstanceOf(TimeoutError);
    expect(seen).toHaveBeenCalledOnce();
  });

  it("INV-G5: 상대가 던진 오류는 시간 초과로 바꾸지 않는다", async () => {
    // 둘을 같이 다루면 「모델이 거부했다」와 「모델이 느리다」가 한 덩어리가 된다.
    const boom = async () => {
      throw new Error("모델이 거부했다");
    };
    await expect(withTimeout(boom, 50)).rejects.toThrow("모델이 거부했다");
    await expect(withTimeout(boom, 50)).rejects.not.toBeInstanceOf(TimeoutError);
  });
});
