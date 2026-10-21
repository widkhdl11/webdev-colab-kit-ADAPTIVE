import { describe, expect, it } from "vitest";
import {
  canLinkHeld,
  canReturnHeld,
  HELD_WITHOUT_CODE_REASONS,
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
  nickname: "별빛",
  shelf: "A-03",
  reason: "no_code",
  suspected_theft: false,
  state: "waiting",
  deadline_at: "2026-10-10T01:00:00+00:00",
  share_movable: false,
  look: "하늘색 종이 상자",
  tier: "small",
  phone_last4: "5678",
  auto_return_at: "2026-11-02T01:00:00+00:00",
  in_storage: false,
};

const HELD_PARCEL = {
  id: "4f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
  source: "parcel",
  qr: "Q-000123",
  waybill_no: "123456789013",
  carrier: null,
  arrived_at: "2026-10-03T02:00:00+00:00",
  nickname: null,
  shelf: null,
  reason: "not_mine",
  suspected_theft: true,
  state: "on_hold",
  deadline_at: null,
  share_movable: false,
  look: null,
  tier: null,
  phone_last4: null,
  auto_return_at: "2026-11-02T02:00:00+00:00",
  in_storage: false,
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
  it("INV-C9·W7: 보낸 사람은 닉네임 일치면 그 닉네임만 옮긴다 — 주문번호·이름 같은 다른 칸은 버린다", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, sender_name: "별빛나", order_no: "FC-7K3M9" }])).toEqual([
      {
        id: UNMATCHED.id,
        source: "unmatched",
        qr: null,
        waybillNo: "123456789012",
        carrier: "cj",
        arrivedAt: UNMATCHED.arrived_at,
        nickname: "별빛",
        shelf: "A-03",
        reason: "no_code",
        suspectedTheft: false,
        state: "waiting",
        deadlineAt: UNMATCHED.deadline_at,
        shareMovable: false,
        look: "하늘색 종이 상자",
        tier: "small",
        phoneLast4: "5678",
        autoReturnAt: UNMATCHED.auto_return_at,
        inStorage: false,
      },
    ]);
  });

  it("INV-W7·C5 (실패경로): 뒤 4자리 칸에 숫자 넷이 아닌 값(전체 번호·하이픈)이 오면 목록 전체를 읽지 않는다", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, phone_last4: "010-1234-5678" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, phone_last4: "56a8" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, phone_last4: null }])?.[0]?.phoneLast4).toBeNull();
  });

  it("INV-C8·C9: 출고를 멈춘 묶인 상자(「제가 보낸 게 아니에요」 등)도 같은 목록 — 보낸 사람·선반·기한 없이", () => {
    expect(unmatchedFromRows([HELD_PARCEL])?.[0]).toMatchObject({ source: "parcel", qr: "Q-000123", reason: "not_mine", suspectedTheft: true, state: "on_hold", nickname: null, deadlineAt: null });
  });

  it("INV-C9·W7 (실패경로): 닉네임 칸이 문자열·null 이 아니거나(닉네임 꼴 1~12자 밖) 모르는 상태·사유·택배사면 null", () => {
    expect(unmatchedFromRows([{ ...UNMATCHED, nickname: 3 }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, nickname: "가".repeat(21) }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, nickname: "" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, state: "lost" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, reason: "guess" }])).toBeNull();
    expect(unmatchedFromRows([{ ...UNMATCHED, carrier: "fedex" }])).toBeNull();
    expect(unmatchedFromRows("x")).toBeNull();
  });

  it("INV-C9: 「반송으로 넘기기」 — 미확인 입고는 대기 중이면, 이어진 줄·반송 대상은 아니다", () => {
    const now = "2026-10-08T00:00:00Z";
    expect(canReturnHeld({ source: "unmatched", state: "waiting", reason: "no_code", deadlineAt: null }, now)).toBe(true);
    expect(canReturnHeld({ source: "unmatched", state: "matched", reason: "no_code", deadlineAt: null }, now)).toBe(false);
    expect(canReturnHeld({ source: "unmatched", state: "expired", reason: "no_code", deadlineAt: null }, now)).toBe(false);
  });

  it("INV-C9: 닉네임 칸은 DB 닉네임 칸 제약(1~20자)과 같다 — 13~20자 닉네임과 맞은 줄이 있어도 목록 전체가 사라지지 않는다", () => {
    const rows = unmatchedFromRows([{ ...UNMATCHED, nickname: "가".repeat(18) }, { ...UNMATCHED, id: "5f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f", nickname: "가".repeat(20) }, HELD_PARCEL]);
    expect(rows?.map((r) => r.nickname)).toEqual(["가".repeat(18), "가".repeat(20), null]);
  });

  it("INV-C5·C12·N21: 「6자리 없이 온 상자」는 6자리 없음·없는 6자리 둘 — DB 판정(inbound_held_without_code)과 같은 목록", () => {
    expect([...HELD_WITHOUT_CODE_REASONS]).toEqual(["no_code", "unknown_code"]);
  });

  it("INV-C12: 주인 주문으로 입고 버튼은 6자리 없이(또는 없는 6자리로) 온 대기 중 미확인 입고에만, 도착 + 168시간 전까지", () => {
    const now = "2026-10-08T00:00:00Z";
    const left = "2026-10-08T00:00:01Z";
    expect(canLinkHeld({ nickname: null, source: "unmatched", state: "waiting", reason: "no_code", deadlineAt: left }, now)).toBe(true);
    expect(canLinkHeld({ nickname: null, source: "unmatched", state: "waiting", reason: "unknown_code", deadlineAt: left }, now)).toBe(true);
    // 기한 정각부터는 반송 대상(INV-C6) — DB 도 168시간이 지난 상자는 잇지 않는다
    expect(canLinkHeld({ nickname: null, source: "unmatched", state: "waiting", reason: "no_code", deadlineAt: now }, now)).toBe(false);
    for (const reason of ["void_code", "used_code", "code_dispute", "barcode_bound", "waybill_dispute"] as const) {
      expect([reason, canLinkHeld({ nickname: null, source: "unmatched", state: "waiting", reason, deadlineAt: left }, now)]).toEqual([reason, false]);
    }
    for (const state of ["matched", "expired"] as const) {
      expect([state, canLinkHeld({ nickname: null, source: "unmatched", state, reason: "no_code", deadlineAt: left }, now)]).toEqual([state, false]);
    }
    expect(canLinkHeld({ nickname: null, source: "parcel", state: "on_hold", reason: "not_mine", deadlineAt: left }, now)).toBe(false);
    expect(canLinkHeld({ nickname: null, source: "unmatched", state: "waiting", reason: "no_code", deadlineAt: null }, now)).toBe(false);
    // INV-C4 ②-가 (S4h, 2026-10-21): 닉네임이 맞은 상자는 운영자가 잇지 않는다 — 그 회원이 두 값을 넣어야 이어진다(DB 도 거부한다)
    expect(canLinkHeld({ nickname: "별빛", source: "unmatched", state: "waiting", reason: "no_code", deadlineAt: left }, now)).toBe(false);
  });

  it("INV-C9 (S9b·S9c): 주문에 묶인 보류 상자 — 「아니에요」·떼어 낸 상자는 바로, 분쟁은 기한(보류 + 168시간)이 지나야, 넘긴 상자는 아니다", () => {
    const now = "2026-10-08T00:00:00Z";
    const before = "2026-10-08T00:00:01Z";
    const after = "2026-10-07T23:59:59Z";
    for (const reason of ["not_mine", "detached"] as const) {
      expect(canReturnHeld({ source: "parcel", state: "on_hold", reason, deadlineAt: before }, now)).toBe(true);
    }
    for (const reason of ["code_dispute", "waybill_dispute"] as const) {
      expect(canReturnHeld({ source: "parcel", state: "on_hold", reason, deadlineAt: before }, now)).toBe(false);
      expect(canReturnHeld({ source: "parcel", state: "on_hold", reason, deadlineAt: now }, now)).toBe(true);
      expect(canReturnHeld({ source: "parcel", state: "on_hold", reason, deadlineAt: after }, now)).toBe(true);
      expect(canReturnHeld({ source: "parcel", state: "on_hold", reason, deadlineAt: null }, now)).toBe(false);
    }
    expect(canReturnHeld({ source: "parcel", state: "expired", reason: "not_mine", deadlineAt: after }, now)).toBe(false);
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
