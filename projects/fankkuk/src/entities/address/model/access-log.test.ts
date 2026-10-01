import { describe, expect, it } from "vitest";
import { summarizeAccessLog, type AddressAccessEntry } from "./access-log";

const opened = (printNo: number): AddressAccessEntry => ({
  at: "2026-09-30T05:32:00.000Z",
  orderNo: "FC-TEST1",
  requester: "owner",
  result: { kind: "opened", printNo },
});
const denied: AddressAccessEntry = {
  at: "2026-09-30T05:40:00.000Z",
  orderNo: "FC-TEST1",
  requester: "owner",
  result: { kind: "denied", reason: "order_not_printable" },
};

describe("summarizeAccessLog — 열람 기록 화면의 이번 달 숫자", () => {
  it("열림은 첫 출력과 재출력을 모두 센다", () => {
    expect(summarizeAccessLog([opened(1), opened(2), opened(1)]).openedCount).toBe(3);
  });

  it("재출력은 2번째 출력부터만 센다", () => {
    expect(summarizeAccessLog([opened(1), opened(2), opened(3)]).reprintCount).toBe(2);
  });

  it("거부는 열림에 넣지 않고 따로 센다", () => {
    const s = summarizeAccessLog([opened(1), denied]);
    expect(s.openedCount).toBe(1);
    expect(s.deniedCount).toBe(1);
  });

  it("기록이 없으면 전부 0", () => {
    expect(summarizeAccessLog([])).toEqual({ openedCount: 0, reprintCount: 0, deniedCount: 0 });
  });
});
