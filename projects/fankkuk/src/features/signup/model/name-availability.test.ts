import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_DELAY_MS,
  availabilityBlock,
  createAvailabilityWatcher,
  NAME_STILL_CHECKING,
  type AvailabilityState,
  type NameAnswer,
} from "./name-availability";

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

describe("INV-U14: 「잠시 뒤에」 답 뒤에는 같은 값도 다시 묻는다", () => {
  it.each(["rate_limited", "error"] as const)("INV-U14: %s 뒤에 같은 값으로 부르면 다시 묻는다", async (answer) => {
    const t = setup();
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    t.asked[0]!.resolve(answer);
    await vi.advanceTimersByTimeAsync(0);
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    expect(t.asked.map((a) => a.value)).toEqual(["haru", "haru"]);
  });
});

describe("INV-U14: 「다음」은 지금 값의 답이 올 때까지 기다린다(settle)", () => {
  it("INV-U14: 0.4초를 기다리는 중이면 바로 묻고 그 답을 돌려준다", async () => {
    const t = setup();
    t.w.update("haru");
    const settled = t.w.settle("haru");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.asked.map((a) => a.value)).toEqual(["haru"]);
    t.asked[0]!.resolve("taken");
    await expect(settled).resolves.toEqual({ value: "haru", status: "taken" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.asked).toHaveLength(1);
  });

  it("INV-U14: 묻는 중이면 같은 요청의 답을 기다린다 — 두 번 묻지 않는다", async () => {
    const t = setup();
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    const settled = t.w.settle("haru");
    t.asked[0]!.resolve("available");
    await expect(settled).resolves.toEqual({ value: "haru", status: "available" });
    expect(t.asked).toHaveLength(1);
  });

  it("INV-U14: 이미 답이 있으면 묻지 않고 그 답, 「잠시 뒤에」 답이면 다시 묻는다", async () => {
    const t = setup();
    t.w.update("haru");
    await vi.advanceTimersByTimeAsync(400);
    t.asked[0]!.resolve("available");
    await vi.advanceTimersByTimeAsync(0);
    await expect(t.w.settle("haru")).resolves.toEqual({ value: "haru", status: "available" });
    expect(t.asked).toHaveLength(1);

    t.w.update("byeol");
    await vi.advanceTimersByTimeAsync(400);
    t.asked[1]!.resolve("rate_limited");
    await vi.advanceTimersByTimeAsync(0);
    const again = t.w.settle("byeol");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.asked.map((a) => a.value)).toEqual(["haru", "byeol", "byeol"]);
    t.asked[2]!.resolve("taken");
    await expect(again).resolves.toEqual({ value: "byeol", status: "taken" });
  });

  it("INV-U14: 아직 묻지 않은 값이면 그 값을 바로 묻는다", async () => {
    const t = setup();
    const settled = t.w.settle("haru");
    await vi.advanceTimersByTimeAsync(0);
    expect(t.asked.map((a) => a.value)).toEqual(["haru"]);
    t.asked[0]!.resolve("available");
    await expect(settled).resolves.toEqual({ value: "haru", status: "available" });
  });

  it("INV-U14 (실패경로): 기다리는 사이 값이 바뀌면 이전 값의 답은 돌려주지 않는다(null)", async () => {
    const t = setup();
    t.w.update("haru");
    const settled = t.w.settle("haru");
    await vi.advanceTimersByTimeAsync(0);
    t.w.update("haru2");
    await expect(settled).resolves.toBeNull();
  });
});

describe("INV-U14: 「다음」 판정 — availabilityBlock", () => {
  const values = { loginId: "haru", nickname: "하루" };
  const ok = (value: string): AvailabilityState => ({ value, status: "available" });

  it("INV-U14: 둘 다 쓸 수 있으면 막지 않는다, 「잠시 뒤에」·요청 실패도 막지 않는다(가입 때 서버가 다시 본다)", () => {
    expect(availabilityBlock({ loginId: ok("haru"), nickname: ok("하루") }, values)).toBeNull();
    expect(availabilityBlock({ loginId: { value: "haru", status: "rate_limited" }, nickname: { value: "하루", status: "error" } }, values)).toBeNull();
  });

  it.each([
    ["loginId", "taken", "이미 사용 중입니다."],
    ["loginId", "invalid", "입력 형식을 확인해 주세요."],
    ["nickname", "taken", "이미 사용 중입니다."],
    ["nickname", "invalid", "입력 형식을 확인해 주세요."],
  ] as const)("INV-U14 (실패경로): %s 가 %s 면 그 칸에서 막는다", (field, status, message) => {
    const states = { loginId: ok("haru"), nickname: ok("하루"), [field]: { value: values[field], status } };
    expect(availabilityBlock(states, values)).toEqual({ field, message });
  });

  it("INV-U14 (실패경로): 답이 없거나 다른 값의 답·아직 확인 중이면 「확인 중이에요」로 막는다", () => {
    expect(availabilityBlock({ loginId: null, nickname: ok("하루") }, values)).toEqual({ field: "loginId", message: NAME_STILL_CHECKING });
    expect(availabilityBlock({ loginId: ok("haru"), nickname: ok("하루2") }, values)).toEqual({ field: "nickname", message: NAME_STILL_CHECKING });
    expect(availabilityBlock({ loginId: { value: "haru", status: "checking" }, nickname: ok("하루") }, values)).toEqual({
      field: "loginId",
      message: NAME_STILL_CHECKING,
    });
  });
});
