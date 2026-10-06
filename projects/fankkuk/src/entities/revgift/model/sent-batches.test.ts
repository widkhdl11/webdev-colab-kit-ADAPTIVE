import { describe, expect, it } from "vitest";
import { countBatchStates, toSentBatches } from "./sent-batches";
import type { SentRevgift } from "./revgift-rows";

function share(orderNo: string, sentAt: string, state: SentRevgift["state"], shipToOffice = true): SentRevgift {
  return { orderNo, sentAt, fanLoginId: `fan_${orderNo}`, fanNickname: "팬", tier: "small", state, shipToOffice };
}

const OFFICE = "서울 사무실";

const EARLY = "2026-10-01T03:00:00.000Z";
const LATE = "2026-10-02T03:00:00.000Z";

describe("toSentBatches", () => {
  it("보낸 시각이 같은 몫끼리 묶고, 최근 묶음이 먼저 온다", () => {
    const rows = [share("RG-AAA111", EARLY, "waiting"), share("RG-BBB222", LATE, "accepted"), share("RG-CCC333", EARLY, "not_received")];
    const batches = toSentBatches(rows, OFFICE);
    expect(batches.map((b) => b.sentAt)).toEqual([LATE, EARLY]);
    expect(batches[1]?.shares.map((s) => s.orderNo)).toEqual(["RG-AAA111", "RG-CCC333"]);
    expect(batches[0]?.shares.map((s) => s.orderNo)).toEqual(["RG-BBB222"]);
  });

  it("빈 목록은 빈 묶음", () => {
    expect(toSentBatches([], OFFICE)).toEqual([]);
  });

  it("INV-R14 S14: 사무실로 보낼 상자가 남은 묶음에만 주소가 붙는다", () => {
    const rows = [share("RG-AAA111", EARLY, "waiting", true), share("RG-BBB222", LATE, "not_received", false)];
    const [late, early] = toSentBatches(rows, OFFICE);
    expect(early?.officeAddress).toBe(OFFICE);
    expect(late?.officeAddress).toBeNull();
  });

  it("INV-R14 S14b (실패경로): 묶음의 몫이 모두 보낼 상자가 아니면 주소가 없다", () => {
    const rows = [share("RG-AAA111", EARLY, "not_received", false), share("RG-CCC333", EARLY, "not_received", false)];
    expect(toSentBatches(rows, OFFICE)[0]?.officeAddress).toBeNull();
  });
});

describe("countBatchStates", () => {
  it("상태별로 센다", () => {
    const shares = [share("RG-AAA111", EARLY, "accepted"), share("RG-BBB222", EARLY, "accepted"), share("RG-CCC333", EARLY, "not_received")];
    expect(countBatchStates(shares)).toEqual({ accepted: 2, waiting: 0, not_received: 1 });
  });
});
