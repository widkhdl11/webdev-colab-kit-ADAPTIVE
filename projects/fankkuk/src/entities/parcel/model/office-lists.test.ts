import { describe, expect, it } from "vitest";
import {
  canReturnHeld,
  daysLeft,
  dueUrgency,
  expiryDueFromRows,
  findFlagsFromRows,
  inboundMetricsFromRows,
  isUnmatchedUrgent,
  pendingLabelFromRows,
  ratePercent,
  remainingText,
  revgiftSharesFromRows,
  unmatchedFromRows,
} from "./office-lists";

const UNMATCHED = {
  id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
  source: "unmatched",
  qr: null,
  waybill_no: "123456789012",
  carrier: "cj",
  arrived_at: "2026-10-03T01:00:00+00:00",
  sender_initial: "별",
  shelf: "A-03",
  reason: "no_code",
  suspected_theft: false,
  state: "waiting",
  deadline_at: "2026-10-10T01:00:00+00:00",
};

const HELD_PARCEL = {
  id: "4f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
  source: "parcel",
  qr: "Q-000123",
  waybill_no: "123456789013",
  carrier: null,
  arrived_at: "2026-10-03T02:00:00+00:00",
  sender_initial: null,
  shelf: null,
  reason: "not_mine",
  suspected_theft: true,
  state: "on_hold",
  deadline_at: null,
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

describe("보류 상자 읽기 (office-workflow INV-W5·W6·W7, inbound-address-code INV-C9)", () => {
  it("INV-C9·W7: 보낸 사람은 앞 한 글자만 옮긴다 — 주문번호·닉네임 같은 다른 칸은 버린다", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, sender_name: "별빛나", order_no: "FC-7K3M9" }])).toEqual([
      {
        id: UNMATCHED.id,
        source: "unmatched",
        qr: null,
        waybillNo: "123456789012",
        carrier: "cj",
        arrivedAt: UNMATCHED.arrived_at,
        senderInitial: "별",
        shelf: "A-03",
        reason: "no_code",
        suspectedTheft: false,
        state: "waiting",
        deadlineAt: UNMATCHED.deadline_at,
      },
    ]);
  });

  it("INV-C8·C9: 출고를 멈춘 묶인 상자(「제가 보낸 게 아니에요」 등)도 같은 목록 — 보낸 사람·선반·기한 없이", () => {
    expect(unmatchedFromRows([HELD_PARCEL])?.[0]).toMatchObject({ source: "parcel", qr: "Q-000123", reason: "not_mine", suspectedTheft: true, state: "on_hold", senderInitial: null, deadlineAt: null });
  });

  it("INV-W7 (실패경로): 보낸 사람이 한 글자가 아니거나 모르는 상태·사유·택배사면 null", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, sender_initial: "별빛" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, state: "lost" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, reason: "guess" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, carrier: "fedex" }])).toBeNull();
    expect(unmatchedFromRows("x")).toBeNull();
  });

  it("INV-C9: 「반송으로 넘기기」는 아직 이어지지 않은 미확인 입고에만 — 묶인 상자·이어진 줄·반송 대상은 아니다", () => {
    expect(canReturnHeld({ source: "unmatched", state: "waiting" })).toBe(true);
    expect(canReturnHeld({ source: "unmatched", state: "matched" })).toBe(false);
    expect(canReturnHeld({ source: "unmatched", state: "expired" })).toBe(false);
    expect(canReturnHeld({ source: "parcel", state: "on_hold" })).toBe(false);
  });

  it("INV-C10: 찾기 실패가 반복된 계정은 닉네임·24시간 실패 수만", () => {
    expect(findFlagsFromRows([{ nickname: "달토끼", failures_24h: 3, last_flagged_at: "2026-10-03T01:00:00+00:00", profile_id: "x" }])).toEqual([
      { nickname: "달토끼", failures24h: 3, lastFlaggedAt: "2026-10-03T01:00:00+00:00" },
    ]);
    expect(findFlagsFromRows([{ nickname: "달토끼", failures_24h: -1, last_flagged_at: "x" }])).toBeNull();
  });

  it("측정: 한 줄짜리 답을 숫자로 — 0줄(운영자 아님)이면 null, 비율은 분모 0이면 null", () => {
    const row = { since: "2026-09-08T00:00:00+00:00", arrived_total: 40, arrived_without_code: 6, code_inputs: 37, code_check_rejects: 3, code_format_rejects: 1, not_mine_reports: 2 };
    expect(inboundMetricsFromRows([row])).toEqual({ since: row.since, arrivedTotal: 40, arrivedWithoutCode: 6, codeInputs: 37, codeCheckRejects: 3, codeFormatRejects: 1, notMineReports: 2 });
    expect(inboundMetricsFromRows([])).toBeNull();
    expect(ratePercent(6, 40)).toBe(15);
    expect(ratePercent(3, 37)).toBe(8.1);
    expect(ratePercent(0, 0)).toBeNull();
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
