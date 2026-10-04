import { describe, expect, it } from "vitest";
import { daysLeft, dueUrgency, isUnmatchedUrgent, expiryDueFromRows, pendingLabelFromRows, remainingText, revgiftSharesFromRows, unmatchedFromRows } from "./office-lists";

const UNMATCHED = {
  id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
  waybill_no: "123456789012",
  arrived_at: "2026-10-03T01:00:00+00:00",
  sender_initial: "별",
  shelf: "A-03",
  state: "waiting",
  deadline_at: "2026-10-10T01:00:00+00:00",
  matched_order_no: null,
};

const DUE = {
  category: "difference",
  order_no: "FC-260928-0014",
  sender_nickname: "도토리",
  receiver_name: "하루",
  due_at: "2026-10-04T18:00:00+00:00",
  detail: "소형→중형 +2,000원",
};

const SHARE = {
  share_id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
  order_no: "RG-261003-0009",
  creator_name: "하루",
  fan_nickname: "모카",
  tier: "small",
  reply: "declined",
  deadline_at: "2026-10-10T01:00:00+00:00",
  received_at: null,
  refund_status: null,
};

describe("미확인 입고 읽기 (office-workflow INV-W5·W6·W7)", () => {
  it("INV-W5·W7: 보낸 사람은 앞 한 글자만 옮긴다 — 다른 칸은 버린다", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, sender_name: "별빛나" }])).toEqual([
      {
        id: UNMATCHED.id,
        waybillNo: "123456789012",
        arrivedAt: UNMATCHED.arrived_at,
        senderInitial: "별",
        shelf: "A-03",
        state: "waiting",
        deadlineAt: UNMATCHED.deadline_at,
        matchedOrderNo: null,
      },
    ]);
  });

  it("INV-W7 (실패경로): 보낸 사람이 한 글자가 아니거나 모르는 상태면 null", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, sender_initial: "별빛" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, state: "lost" }])).toBeNull();
    expect(unmatchedFromRows("x")).toBeNull();
  });

  it("INV-W6: 남은 날은 168시간 기한까지 올림으로 센다 — 지났으면 0", () => {
    const deadline = "2026-10-10T01:00:00+00:00";
    expect(daysLeft(deadline, new Date("2026-10-03T01:00:00+00:00"))).toBe(7);
    expect(daysLeft(deadline, new Date("2026-10-09T01:00:01+00:00"))).toBe(1);
    expect(daysLeft(deadline, new Date("2026-10-10T01:00:00+00:00"))).toBe(0);
    expect(daysLeft(deadline, new Date("2026-10-12T01:00:00+00:00"))).toBe(0);
  });

  it("INV-W6: 남은 날이 1일 이하면 「곧 처리」", () => {
    expect(isUnmatchedUrgent(1)).toBe(true);
    expect(isUnmatchedUrgent(0)).toBe(true);
    expect(isUnmatchedUrgent(2)).toBe(false);
  });
});

describe("자동 처리 예정 읽기 (office-workflow INV-W6)", () => {
  it("INV-W6: 줄을 옮긴다 — 차액 설명은 있으면 그대로, 없으면 null", () => {
    expect(expiryDueFromRows([DUE, { ...DUE, category: "gift", detail: null }])).toEqual([
      { category: "difference", orderNo: "FC-260928-0014", senderNickname: "도토리", receiverName: "하루", dueAt: DUE.due_at, detail: "소형→중형 +2,000원" },
      { category: "gift", orderNo: "FC-260928-0014", senderNickname: "도토리", receiverName: "하루", dueAt: DUE.due_at, detail: null },
    ]);
  });

  it("INV-W6 (실패경로): 모르는 종류는 null", () => {
    expect(expiryDueFromRows([{ ...DUE, category: "unmatched" }])).toBeNull();
  });

  it("INV-W6: 남은 시간·지난 시간 문구", () => {
    const now = new Date("2026-10-03T14:00:00+00:00");
    expect(remainingText("2026-10-04T03:00:00+00:00", now)).toBe("13시간");
    expect(remainingText("2026-10-05T03:00:00+00:00", now)).toBe("1일 13시간");
    expect(remainingText("2026-10-03T14:30:00+00:00", now)).toBe("1시간 안");
    expect(remainingText("2026-10-03T13:00:00+00:00", now)).toBe("지남");
    expect(remainingText("2026-10-01T13:00:00+00:00", now)).toBe("2일 지남");
  });

  it("INV-W6: 남은 시간이 정확히 N일이면 「N일」(0시간을 붙이지 않는다)", () => {
    const now = new Date("2026-10-03T14:00:00+00:00");
    expect(remainingText("2026-10-05T14:00:00+00:00", now)).toBe("2일");
    expect(remainingText("2026-10-04T14:00:00+00:00", now)).toBe("1일");
  });

  it("INV-W6: 급함 — 지남 / 24시간 안 / 그 밖", () => {
    const now = new Date("2026-10-03T14:00:00+00:00");
    expect(dueUrgency("2026-10-03T14:00:00+00:00", now)).toBe("past");
    expect(dueUrgency("2026-10-04T13:59:00+00:00", now)).toBe("soon");
    expect(dueUrgency("2026-10-04T14:00:00+00:00", now)).toBe("normal");
  });
});

describe("역조공 몫 읽기 (office-workflow INV-W3·W6)", () => {
  it("INV-W3: 줄을 옮긴다", () => {
    expect(revgiftSharesFromRows([SHARE])).toEqual([
      {
        shareId: SHARE.share_id,
        orderNo: "RG-261003-0009",
        creatorName: "하루",
        fanNickname: "모카",
        tier: "small",
        reply: "declined",
        deadlineAt: SHARE.deadline_at,
        receivedAt: null,
        refundStatus: null,
      },
    ]);
  });

  it("INV-W3 (실패경로): 모르는 답·환불 상태는 null", () => {
    expect(revgiftSharesFromRows([{ ...SHARE, reply: "maybe" }])).toBeNull();
    expect(revgiftSharesFromRows([{ ...SHARE, refund_status: "due" }])).toBeNull();
  });
});

describe("내 부착 대기 라벨 (office-workflow INV-W2)", () => {
  it("INV-W2: 0줄이면 없음, 1줄이면 그 라벨", () => {
    expect(pendingLabelFromRows([])).toEqual({ ok: true, pending: null });
    expect(pendingLabelFromRows([{ qr: "Q-000123", order_no: "FC-1" }])).toEqual({ ok: true, pending: { qr: "Q-000123", orderNo: "FC-1" } });
  });

  it("INV-W2 (실패경로): 두 줄 이상이거나 꼴이 다르면 실패", () => {
    expect(pendingLabelFromRows([{ qr: "Q-000123", order_no: "FC-1" }, { qr: "Q-000124", order_no: "FC-2" }])).toEqual({ ok: false });
    expect(pendingLabelFromRows([{ qr: "bad", order_no: "FC-1" }])).toEqual({ ok: false });
    expect(pendingLabelFromRows(null)).toEqual({ ok: false });
  });
});
