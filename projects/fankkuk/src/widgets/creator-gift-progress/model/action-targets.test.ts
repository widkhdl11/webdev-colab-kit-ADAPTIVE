import { describe, expect, it } from "vitest";
import { parseCreatorActionItems } from "@/entities/action-item/model/creator-action-items";
import { actionTargetsOf, hasActionButton } from "./action-targets";
import { parseGiftProgressRows, type ReceivedProgress, type SentProgress } from "./gift-progress";

// 선물 현황 「처리할 일」 버튼 (action-center INV-J11) — 처리할 일 읽기 결과에서만.

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const RECEIVED = {
  board: "received", order_no: "FC-A1", share_id: null, nickname: "하루", item_kind: "인형", box_count: 2, tier: null, stage: "paid",
  approval_waiting: true, requested_at: "2026-10-15T05:00:00Z", approved_at: null, reply_state: null, box_state: null, sent_at: null,
  before_inbound: null, late: null,
};
const SENT = {
  board: "sent", order_no: "RG-A0", share_id: S1, nickname: "모카", item_kind: null, box_count: null, tier: "small", stage: null,
  approval_waiting: null, requested_at: null, approved_at: null, reply_state: "accepted", box_state: "awaiting", sent_at: "2026-10-02T01:00:00Z",
  before_inbound: true, late: true,
};
const rec = (over: Partial<ReceivedProgress>): ReceivedProgress => ({ ...parseGiftProgressRows([RECEIVED]).received[0]!, ...over });
const sent = (over: Partial<SentProgress>): SentProgress => ({ ...parseGiftProgressRows([SENT]).sent[0]!.rows[0]!, ...over });

const EMPTY = {
  request_id: null, share_id: null, box_id: null, box_seq: null, box_count: null, box_label: null, item_kind: null, tier: null,
  measured_tier: null, amount_krw: null, has_electronics_or_metal: null, bluetooth: null, rf: null, choice: null, received_at: null,
  due_at: null, prior_gift_count: null, prior_passed_count: null, prior_returned_count: null,
};
const approvalItem = {
  ...EMPTY, kind: "approval", board: "received", order_no: "FC-A1", request_id: "apr_FCA1", box_count: 1, nickname: "하루", item_kind: "인형",
  has_electronics_or_metal: false, sent_at: "2026-10-15T05:00:00Z", due_at: "2026-10-22T05:00:00Z", prior_gift_count: 0, prior_passed_count: 0, prior_returned_count: 0,
};
const unconfirmedItem = { ...EMPTY, kind: "unconfirmed", board: "sent", order_no: "RG-A0", share_id: S1, nickname: "모카", tier: "small", sent_at: "2026-10-02T01:00:00Z" };
const sentGiftItem = {
  ...EMPTY, kind: "missing_box", board: "sent", order_no: "FC-A1", box_id: S2, box_label: "상자 1", box_seq: 1, nickname: "모모", tier: "small",
  due_at: "2026-11-01T00:00:00Z", sent_at: "2026-10-01T00:00:00Z",
};

describe("INV-J11: 「처리할 일」 버튼은 처리할 일 읽기 결과에 그 주문(역조공은 몫)이 있을 때만", () => {
  it("INV-J11 S11: 받는 선물은 승인 요청·블루투스 줄의 주문, 보내는 선물은 미확인 상자 줄의 몫", () => {
    const t = actionTargetsOf(parseCreatorActionItems([approvalItem, unconfirmedItem]));
    expect(hasActionButton(rec({ orderNo: "FC-A1" }), t)).toBe(true);
    expect(hasActionButton(rec({ orderNo: "FC-ZZ" }), t)).toBe(false);
    expect(hasActionButton(sent({ orderNo: "RG-A0", shareId: S1 }), t)).toBe(true);
    expect(hasActionButton(sent({ orderNo: "RG-A1", shareId: S2 }), t)).toBe(false);
  });

  it("INV-J11 (실패경로): 처리할 일이 비면 버튼이 없다 — 늦은 몫이라도 현황이 따로 판정하지 않는다", () => {
    const t = actionTargetsOf([]);
    expect(hasActionButton(sent({ late: true }), t)).toBe(false);
    expect(hasActionButton(rec({ approvalWaiting: true }), t)).toBe(false);
  });

  it("INV-J11 (실패경로): 판이 다른 줄은 섞지 않는다 — 내가 보낸 팬 선물(같은 주문번호)이 받는 선물 줄의 버튼이 되지 않는다", () => {
    const t = actionTargetsOf(parseCreatorActionItems([sentGiftItem]));
    expect(hasActionButton(rec({ orderNo: "FC-A1" }), t)).toBe(false);
  });
});

describe("INV-J11 · W14·W15: 추적 장치 발견·보낸 역조공 반송 주소 줄도 같은 판정", () => {
  const trackerItem = {
    ...EMPTY, kind: "tracker", board: "received", order_no: "FC-T1", box_seq: 1, box_count: 1, nickname: "새벽", item_kind: "인형", tier: "small",
    bluetooth: true, rf: false, sent_at: "2026-10-10T00:00:00Z", due_at: "2026-10-20T00:00:00Z", prior_gift_count: 0, prior_passed_count: 0, prior_returned_count: 0,
  };
  const returnShare = { ...EMPTY, kind: "return_address", board: "sent", order_no: "RG-R5", share_id: S2, nickname: "별빛", tier: "small", sent_at: "2026-10-01T00:00:00Z", due_at: "2026-11-16T00:00:00Z" };
  it("INV-J11: 추적 장치 발견 줄의 주문은 받는 선물 버튼, 반송 주소 줄의 몫은 보내는 선물 버튼", () => {
    const t = actionTargetsOf(parseCreatorActionItems([trackerItem, returnShare]));
    expect(hasActionButton(rec({ orderNo: "FC-T1" }), t)).toBe(true);
    expect(hasActionButton(sent({ orderNo: "RG-R5", shareId: S2 }), t)).toBe(true);
    expect(hasActionButton(sent({ orderNo: "RG-A0", shareId: S1 }), t)).toBe(false);
  });
});
