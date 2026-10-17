import { describe, expect, it } from "vitest";
import { parseCreatorActionItems, splitBoards } from "./creator-action-items";

// 크리에이터 처리할 일 줄 꼴 (action-center INV-J5·J6·J7). DB 읽기 함수 한 번의 결과가 그대로 숫자·목록이 된다 —
// 꼴이 다른 줄을 일부만 버리면 사이드바 숫자와 목록이 다른 수를 말하므로 하나라도 틀리면 전체를 거부한다.

const EMPTY = {
  request_id: null,
  share_id: null,
  box_id: null,
  box_seq: null,
  box_count: null,
  box_label: null,
  item_kind: null,
  tier: null,
  measured_tier: null,
  amount_krw: null,
  has_electronics_or_metal: null,
  bluetooth: null,
  rf: null,
  choice: null,
  received_at: null,
  due_at: null,
  prior_gift_count: null,
  prior_passed_count: null,
  prior_returned_count: null,
};

const bluetooth = {
  ...EMPTY,
  kind: "bluetooth",
  board: "received",
  order_no: "FC-A1",
  box_seq: 1,
  box_count: 2,
  nickname: "별사탕",
  item_kind: "인형·쿠션",
  tier: "medium",
  bluetooth: true,
  rf: false,
  choice: "accept",
  sent_at: "2026-10-12T01:00:00Z",
  received_at: "2026-10-13T01:00:00Z",
  due_at: "2026-10-20T14:59:00Z",
  prior_gift_count: 3,
  prior_passed_count: 3,
  prior_returned_count: 0,
};
const approval = {
  ...EMPTY,
  kind: "approval",
  board: "received",
  order_no: "FC-B2",
  request_id: "apr_FCB2",
  box_count: 1,
  nickname: "다온",
  item_kind: "문구",
  has_electronics_or_metal: false,
  sent_at: "2026-10-15T05:20:00Z",
  due_at: "2026-10-22T05:20:00Z",
  prior_gift_count: 0,
  prior_passed_count: 0,
  prior_returned_count: 0,
};
const unconfirmed = { ...EMPTY, kind: "unconfirmed", board: "sent", order_no: "RG-C3", share_id: "11111111-1111-4111-8111-111111111111", nickname: "모카", tier: "small", sent_at: "2026-10-02T01:00:00Z" };
const missing = {
  ...EMPTY,
  kind: "missing_box",
  board: "sent",
  order_no: "FC-D4",
  box_id: "22222222-2222-4222-8222-222222222222",
  box_label: "FC-D4",
  box_seq: 1,
  nickname: "모모",
  tier: "small",
  sent_at: "2026-09-20T01:00:00Z",
  due_at: "2026-10-20T01:00:00Z",
};

describe("크리에이터 처리할 일 줄 (INV-J5·J6)", () => {
  it("INV-J5: 네 종류를 DB 순서 그대로 읽고, 판으로 나눠도 순서가 같다", () => {
    const items = parseCreatorActionItems([bluetooth, approval, unconfirmed, missing]);
    expect(items.map((i) => i.kind)).toEqual(["bluetooth", "approval", "unconfirmed", "missing_box"]);
    const { received, sent } = splitBoards(items);
    expect(received.map((i) => i.orderNo)).toEqual(["FC-A1", "FC-B2"]);
    expect(sent.map((i) => i.orderNo)).toEqual(["RG-C3", "FC-D4"]);
    expect(items[0]).toMatchObject({ choice: "accept", boxCount: 2, priorHistory: { gifts: 3, passed: 3, returned: 0 } });
    expect(items[1]).toMatchObject({ requestId: "apr_FCB2", hasElectronicsOrMetal: false });
    expect(items[3]).toMatchObject({ creatorName: "모모", declaredTier: "small", boxId: missing.box_id });
  });

  it("INV-J6 (실패경로): 판이 종류와 다르거나 필요한 칸이 빈 줄이 하나라도 있으면 전부 거부한다 — 일부만 버려 숫자와 목록이 달라지지 않게", () => {
    expect(() => parseCreatorActionItems([bluetooth, { ...approval, board: "sent" }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...approval, request_id: null }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...bluetooth, due_at: null }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...unconfirmed, share_id: null }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...approval, kind: "pending_box" }])).toThrow();
  });

  it("INV-J7 (실패경로): 정해진 칸 밖의 칸(팬 주소·실명·6자리 등)이 섞여 오면 거부한다", () => {
    for (const extra of [{ fan_address: "서울" }, { real_name: "김민지" }, { inbound_code: "K7M3QA" }, { operator_id: "x" }]) {
      expect(() => parseCreatorActionItems([{ ...bluetooth, ...extra }])).toThrow();
    }
  });

  it("빈 결과는 빈 목록", () => {
    expect(parseCreatorActionItems(null)).toEqual([]);
    expect(parseCreatorActionItems([])).toEqual([]);
  });
});

describe("남은 날 (INV-J5 — 서울 시간)", () => {
  it("서울 날짜로 세고 3일 이하는 강조, 당일은 「오늘까지」", async () => {
    const { daysLeftOf } = await import("./creator-action-items");
    expect(daysLeftOf("2026-10-20T14:59:00Z", "2026-10-16T03:00:00Z")).toEqual({ text: "4일 남음", soon: false });
    expect(daysLeftOf("2026-10-19T14:59:00Z", "2026-10-16T03:00:00Z")).toEqual({ text: "3일 남음", soon: true });
    // 서울 10월 16일 23시 → 같은 날 기한
    expect(daysLeftOf("2026-10-16T14:59:00Z", "2026-10-16T14:00:00Z")).toEqual({ text: "오늘까지", soon: true });
  });
});

describe("추적 장치 발견 줄 (action-center INV-J5, office-workflow INV-W14)", () => {
  const tracker = { ...bluetooth, kind: "tracker", order_no: "FC-T9", choice: "no_report" };

  it("INV-J5 (S5d): 추적 장치 발견 줄은 받은 선물 판의 따로 묶음(tracker)이고 신고 선택을 옮긴다 — 줄 수(J6)에도 들어간다", () => {
    const items = parseCreatorActionItems([tracker, bluetooth, approval]);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: "tracker", orderNo: "FC-T9", choice: "no_report", boxSeq: 1 });
    const boards = splitBoards(items);
    expect(boards.tracker.map((t) => t.orderNo)).toEqual(["FC-T9"]);
    expect(boards.received.map((r) => r.kind)).toEqual(["bluetooth", "approval"]);
    expect(parseCreatorActionItems([{ ...tracker, choice: null }])[0]).toMatchObject({ kind: "tracker", choice: null });
  });

  it("INV-J5 (실패경로): 선택지가 종류와 짝이 맞지 않거나(추적기 줄에 받기, 블루투스 줄에 신고하기) 판이 보낸 선물이면 전체를 거부한다", () => {
    expect(() => parseCreatorActionItems([{ ...tracker, choice: "accept" }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...bluetooth, choice: "report" }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...tracker, board: "sent" }])).toThrow();
  });
});

describe("보낸 선물의 반송 주소 줄 (action-center INV-J5·J3, office-workflow INV-W15)", () => {
  const revgiftReturn = {
    ...EMPTY,
    kind: "return_address",
    board: "sent",
    order_no: "RG-R5",
    share_id: "33333333-3333-4333-8333-333333333333",
    nickname: "별빛",
    tier: "small",
    sent_at: "2026-10-01T01:00:00Z",
    due_at: "2026-11-16T01:00:00Z",
  };
  const giftReturn = {
    ...EMPTY,
    kind: "return_address",
    board: "sent",
    order_no: "FC-R6",
    box_id: "44444444-4444-4444-8444-444444444444",
    box_label: "FC-R6-2",
    box_seq: 2,
    nickname: "하루",
    tier: "medium",
    sent_at: "2026-10-01T01:00:00Z",
    due_at: "2026-11-16T01:00:00Z",
  };

  it("INV-J5 · J3: 보낸 역조공 몫(상자 칸 없이 몫)과 보낸 팬 선물의 상자 둘 다 보낸 선물 판에 반송 주소 줄로 읽고, 줄 수(J6)에 들어간다", () => {
    const items = parseCreatorActionItems([revgiftReturn, giftReturn]);
    expect(items).toEqual([
      { kind: "return_address", orderNo: "RG-R5", shareId: revgiftReturn.share_id, boxId: null, boxSeq: null, boxLabel: null, nickname: "별빛", tier: "small", dueAt: "2026-11-16T01:00:00.000Z", sentAt: "2026-10-01T01:00:00.000Z" },
      { kind: "return_address", orderNo: "FC-R6", shareId: null, boxId: giftReturn.box_id, boxSeq: 2, boxLabel: "FC-R6-2", nickname: "하루", tier: "medium", dueAt: "2026-11-16T01:00:00.000Z", sentAt: "2026-10-01T01:00:00.000Z" },
    ]);
    // 화면 줄은 다음 묶음에서 그린다 — 판을 나눌 때 반송 주소 줄은 따로(returns) 묶여 지금의 보낸 선물 줄 그리기에 섞이지 않는다
    const boards = splitBoards(items);
    expect(boards.returns.map((r) => r.orderNo)).toEqual(["RG-R5", "FC-R6"]);
    expect(boards.sent).toEqual([]);
  });

  it("INV-J5 (실패경로): 반송 주소 줄이 받은 선물 판이거나, 몫도 상자도 없거나 둘 다 있거나, 기한이 없으면 전체를 거부한다", () => {
    expect(() => parseCreatorActionItems([{ ...revgiftReturn, board: "received" }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...revgiftReturn, share_id: null }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...giftReturn, share_id: revgiftReturn.share_id }])).toThrow();
    expect(() => parseCreatorActionItems([{ ...giftReturn, due_at: null }])).toThrow();
  });
});
