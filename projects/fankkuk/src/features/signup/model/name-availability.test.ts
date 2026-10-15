import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVAILABILITY_DELAY_MS, createAvailabilityWatcher, type AvailabilityState, type NameAnswer } from "./name-availability";

// 가입 화면의 아이디·닉네임 미리 확인(signup INV-U14) — 입력을 멈춘 뒤 0.4초에 묻고, 입력이 바뀌면 이전 답은 버린다.

type Pending = { value: string; signal: AbortSignal; resolve: (a: NameAnswer) => void };

function setup() {
  const asked: Pending[] = [];
  const states: (AvailabilityState | null)[] = [];
  const w = createAvailabilityWatcher({
    check: (value, signal) => new Promise<NameAnswer>((resolve) => asked.push({ value, signal, resolve })),
    onChange: (s) => states.push(s),
  });
  return { w, asked, states, last: () => states.at(-1) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("INV-U14: 미리 확인은 입력을 멈춘 뒤 0.4초에", () => {
  it("INV-U14: 0.4초가 되기 전에는 묻지 않고 「확인 중」, 0.4초에 한 번 묻는다", async () => {
    const t = setup();
    expect(AVAILABILITY_DELAY_MS).toBe(400);
    t.w.update("haru");
    expect(t.last()).toEqual({ value: "haru", status: "checking" });
    await vi.advanceTimersByTimeAsync(399);
    expect(t.asked).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.asked.map((a) => a.value)).toEqual(["haru"]);
    t.asked[0]!.resolve("taken");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last()).toEqual({ value: "haru", status: "taken" });
  });

  it("INV-U14: 0.4초 안에 계속 치면 마지막 값 하나만 묻는다", async () => {
    const t = setup();
    for (const v of ["h", "ha", "har", "haru"]) {
      t.w.update(v);
      await vi.advanceTimersByTimeAsync(300);
    }
    await vi.advanceTimersByTimeAsync(100);
    expect(t.asked.map((a) => a.value)).toEqual(["haru"]);
  });

  it("INV-U14 (실패경로): 답이 오기 전에 입력이 바뀌면 이전 요청을 끊고, 늦게 온 이전 답은 버린다", async () => {
    const t = setup();
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    t.w.update("haru2");
    expect(t.asked[0]!.signal.aborted).toBe(true);
    t.asked[0]!.resolve("taken"); // 끊겼어도 늦게 도착한 답
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last()).toEqual({ value: "haru2", status: "checking" });
    expect(t.states).not.toContainEqual({ value: "haru", status: "taken" });
    await vi.advanceTimersByTimeAsync(400);
    t.asked[1]!.resolve("available");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.last()).toEqual({ value: "haru2", status: "available" });
  });

  it("INV-U14: 확인할 값이 없으면(빈칸·형식 틀림) 묻지 않고 안내를 내린다 — 진행 중인 요청도 끊는다", async () => {
    const t = setup();
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    t.w.update(null);
    expect(t.asked[0]!.signal.aborted).toBe(true);
    expect(t.last()).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.asked).toHaveLength(1);
  });

  it("INV-U14: 같은 값으로 다시 부르면 다시 묻지 않는다(답을 그대로 둔다)", async () => {
    const t = setup();
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    t.asked[0]!.resolve("available");
    await vi.advanceTimersByTimeAsync(0);
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.asked).toHaveLength(1);
    expect(t.last()).toEqual({ value: "haru", status: "available" });
  });
});
