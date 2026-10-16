import { describe, expect, it } from "vitest";
import { canFind, canTrack, parseGiftProgressRows, receivedStepOf, sentStepOf, type ReceivedProgress, type SentProgress } from "./gift-progress";

// 크리에이터 선물 현황 읽기 응답(action-center INV-J9~J11). DB 가 계산한 칸을 화면 모양으로 바꾸고, 단계 막대 칸 수와 단계 이름 열쇠를 정한다.
// 단계는 받은 선물 읽기(INV-W9)의 stage, 보낸 역조공 읽기의 받기 상태·상자 상태에서만 나온다 — 현황만의 단계 칸은 없다(J9).

const RECEIVED = {
  board: "received", order_no: "FC-A1", share_id: null, nickname: "하루", item_kind: "인형", box_count: 2, tier: null, stage: "paid",
  approval_waiting: true, requested_at: "2026-10-15T05:00:00Z", approved_at: null, reply_state: null, box_state: null, sent_at: null,
  before_inbound: null, late: null,
};
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const S3 = "33333333-3333-4333-8333-333333333333";
const SENT = {
  board: "sent", order_no: "RG-A0", share_id: S1, nickname: "모카", item_kind: null, box_count: null, tier: "small", stage: null,
  approval_waiting: null, requested_at: null, approved_at: null, reply_state: "accepted", box_state: "no_waybill", sent_at: "2026-10-02T01:00:00Z",
  before_inbound: true, late: true,
};

describe("INV-J9: 선물 현황 응답 — 정해진 칸만, 판 둘", () => {
  it("INV-J9: 받는 선물은 줄 그대로, 보내는 선물은 보낸 날(결제 완료 시각)별 소제목으로 묶는다 — 순서는 DB 그대로", () => {
    const v = parseGiftProgressRows([
      RECEIVED,
      SENT,
      { ...SENT, order_no: "RG-A1", share_id: S2, nickname: "라온" },
      { ...SENT, order_no: "RG-B0", share_id: S3, nickname: "윤슬", sent_at: "2026-10-09T01:00:00Z", late: false },
    ]);
    expect(v.received.map((r) => r.orderNo)).toEqual(["FC-A1"]);
    expect(v.sent.map((g) => [g.sentAt, g.rows.map((r) => r.nickname)])).toEqual([
      ["2026-10-02T01:00:00.000Z", ["모카", "라온"]],
      ["2026-10-09T01:00:00.000Z", ["윤슬"]],
    ]);
    expect(v.received[0]).toMatchObject({ itemKind: "인형", boxCount: 2, approvalWaiting: true, approvedAt: null });
  });

  it("INV-J10 (실패경로): 정해지지 않은 칸(받는 주소 6자리·원 송장번호)이 섞여 오면 받지 않는다", () => {
    expect(() => parseGiftProgressRows([{ ...SENT, address_code: "123456" }])).toThrow();
    expect(() => parseGiftProgressRows([{ ...RECEIVED, waybill_no: "123412341234" }])).toThrow();
    expect(parseGiftProgressRows([SENT]).sent).toHaveLength(1);
  });

  it("INV-J9 (실패경로): 끝난 단계(수령·반송·닫힘)나 모르는 단계가 오면 받지 않는다 — 진행 중인 단계는 받는다", () => {
    for (const stage of ["delivered", "returned", "closed", "late"]) expect(() => parseGiftProgressRows([{ ...RECEIVED, stage }])).toThrow();
    for (const stage of ["paid", "received", "inspected", "shipped", "in_transit"]) expect(parseGiftProgressRows([{ ...RECEIVED, stage }]).received).toHaveLength(1);
  });
});

const rec = (over: Partial<ReceivedProgress>): ReceivedProgress => ({ ...parseGiftProgressRows([RECEIVED]).received[0]!, ...over });
const sent = (over: Partial<SentProgress>): SentProgress => ({ ...parseGiftProgressRows([SENT]).sent[0]!.rows[0]!, ...over });

describe("INV-J9: 다섯 칸 막대와 단계 이름 열쇠 — 기존 읽기의 단계에서만", () => {
  it("INV-J9: 받는 선물 — 승인 대기 1칸, 사무실로 오는 중 2칸, 검수 중·검수 완료 3칸, 출고·배송 중 4칸", () => {
    expect(receivedStepOf(rec({ stage: "paid", approvalWaiting: true }))).toEqual({ key: "approval_waiting", cells: 1 });
    expect(receivedStepOf(rec({ stage: "paid", approvalWaiting: false }))).toEqual({ key: "to_office", cells: 2 });
    expect(receivedStepOf(rec({ stage: "received", approvalWaiting: true }))).toEqual({ key: "inspecting", cells: 3 });
    expect(receivedStepOf(rec({ stage: "inspected", approvalWaiting: false }))).toEqual({ key: "inspected", cells: 3 });
    expect(receivedStepOf(rec({ stage: "shipped", approvalWaiting: false }))).toEqual({ key: "shipped", cells: 4 });
    expect(receivedStepOf(rec({ stage: "in_transit", approvalWaiting: false }))).toEqual({ key: "in_transit", cells: 4 });
  });

  it("INV-J9·J11: 보내는 선물 — 상자가 왔으면 상자 상태, 안 왔으면 받기 상태, 입고 전에 늦으면 늦음", () => {
    expect(sentStepOf(sent({ replyState: "waiting", boxState: "no_waybill", late: false }))).toEqual({ key: "reply_waiting", cells: 1 });
    expect(sentStepOf(sent({ replyState: "accepted", boxState: "awaiting", late: false }))).toEqual({ key: "to_office", cells: 2 });
    expect(sentStepOf(sent({ replyState: "not_received", boxState: "no_waybill", late: false }))).toEqual({ key: "not_received", cells: 1 });
    expect(sentStepOf(sent({ replyState: "accepted", boxState: "no_waybill", late: true }))).toEqual({ key: "late", cells: 2 });
    expect(sentStepOf(sent({ replyState: "waiting", boxState: "received", late: false }))).toEqual({ key: "inspecting", cells: 3 });
    expect(sentStepOf(sent({ replyState: "accepted", boxState: "labeled", late: false }))).toEqual({ key: "inspecting", cells: 3 });
    expect(sentStepOf(sent({ replyState: "accepted", boxState: "label_printed", late: false }))).toEqual({ key: "inspected", cells: 3 });
    expect(sentStepOf(sent({ replyState: "not_received", boxState: "return_waiting", late: false }))).toEqual({ key: "returning", cells: 3 });
    expect(sentStepOf(sent({ replyState: "accepted", boxState: "shipped", late: false }))).toEqual({ key: "shipped", cells: 4 });
  });

  it("INV-J11 (실패경로): 늦음 표시는 DB 의 늦음 칸에서만 — 날짜를 화면이 다시 재지 않는다(오래된 보내기라도 늦음 칸이 거짓이면 늦음 아님)", () => {
    expect(sentStepOf(sent({ sentAt: "2020-01-01T00:00:00.000Z", replyState: "accepted", boxState: "no_waybill", late: false })).key).toBe("to_office");
    expect(sentStepOf(sent({ sentAt: new Date().toISOString(), replyState: "accepted", boxState: "no_waybill", late: true })).key).toBe("late");
  });
});

describe("INV-J10·J11: 배송 조회·「내 상자 찾기」 자리", () => {
  it("INV-J11: 배송 조회는 늦고 입고 전일 때만 — 늦지 않거나 입고됐으면 없다", () => {
    expect(canTrack({ late: true, beforeInbound: true })).toBe(true);
    expect(canTrack({ late: false, beforeInbound: true })).toBe(false);
    expect(canTrack({ late: true, beforeInbound: false })).toBe(false);
  });

  it("INV-J10 (카드 d96 ①): 찾기는 입고 전이고 후보에 있을 때 — 입고 전이 아니면 후보에 있어도 없고, 후보에 없으면 입고 전이어도 없다", () => {
    const ids = new Set([S1]);
    expect(canFind({ beforeInbound: true, shareId: S1 }, ids)).toBe(true);
    expect(canFind({ beforeInbound: false, shareId: S1 }, ids)).toBe(false);
    expect(canFind({ beforeInbound: true, shareId: S2 }, ids)).toBe(false);
  });
});

