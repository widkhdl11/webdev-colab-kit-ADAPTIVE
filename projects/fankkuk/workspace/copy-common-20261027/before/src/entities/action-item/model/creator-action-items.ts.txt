import { z } from "zod";
import { seoulDaysUntil } from "@/shared/lib/format/datetime";
import type { ActionItem } from "./action-items";

// 크리에이터 처리할 일 (action-center INV-J5~J8). DB 읽기 함수 하나(my_creator_action_items)의 줄을 그대로 쓴다 — 저장된 목록이 아니라
// 읽을 때마다 원천(확인 대기 상자·승인 요청·보낸 몫·보낸 팬 선물)에서 계산한 결과다. 사이드바 숫자·홈 한 줄·처리할 일 화면은
// 모두 이 배열 하나에서 나오고, 숫자는 배열 길이다(J6) — 승인 요청이나 확인 대기 상자만 따로 세는 길을 만들지 않는다.
// 판(board)과 순서도 DB 가 정한다 — 받은 선물(블루투스 → 승인, 기한 짧은 순) · 보낸 선물(보낸 날 이른 순). 화면은 순서를 바꾸지 않는다.

/** 크리에이터 처리할 일 화면 주소 — 승인 요청·확인할 선물 알림 링크도 이곳이다(notifications INV-N9) */
export const CREATOR_ACTION_CENTER_HREF = "/creator/actions";

export type CreatorCheckChoice = "accept" | "return";
/** 추적 장치 발견 줄의 선택 — report 신고하기 · no_report 신고하지 않기(office-workflow INV-W14) */
export type TrackerReportChoice = "report" | "no_report";

/** 그 팬이 이 크리에이터에게 보낸 지난 주문 수와 그중 검수 통과·반송 수(decline-block INV-D11) — 주문 쪽 PriorGiftHistory 와 같은 꼴 */
export type PriorHistory = { gifts: number; passed: number; returned: number };

/** 블루투스 발견 — 크리에이터 확인 대기 상자 하나(office-workflow INV-W13). choice 가 있으면 「받기 선택」·「거절 선택」과 취소 */
export type BluetoothItem = {
  kind: "bluetooth";
  orderNo: string;
  boxSeq: number;
  boxCount: number;
  nickname: string;
  itemKind: string;
  tier: string;
  bluetooth: boolean;
  rf: boolean;
  choice: CreatorCheckChoice | null;
  sentAt: string;
  receivedAt: string | null;
  dueAt: string;
  priorHistory: PriorHistory;
};

/** 추적 장치 발견 — 추적기 보관 상자 하나(office-workflow INV-W14, action-center INV-J5). 칸은 블루투스 발견과 같고 선택지만 다르다.
 *  주문이 끝나도 운영자 처리 전·기한 전이면 남는다 */
export type TrackerItem = Omit<BluetoothItem, "kind" | "choice"> & { kind: "tracker"; choice: TrackerReportChoice | null };

/** 승인 요청 — 주문 하나(approval-signature). 승인은 카카오톡 서명, 받지 않기는 서명 없이 */
export type ApprovalItem = {
  kind: "approval";
  orderNo: string;
  requestId: string;
  boxCount: number;
  nickname: string;
  itemKind: string;
  hasElectronicsOrMetal: boolean;
  sentAt: string;
  receivedAt: string | null;
  dueAt: string;
  priorHistory: PriorHistory;
};

/** 미확인 상자 — 보낸 역조공 몫이 늦을 때(INV-J7 — 보류 상자가 있는지와 상관없다). 칸은 받는 팬 닉네임·상자 크기·보낸 날뿐 */
export type UnconfirmedItem = { kind: "unconfirmed"; orderNo: string; shareId: string; nickname: string; tier: string; sentAt: string };

/** 보낸 팬 선물 — 크리에이터 계정이 보낸 선물의 추가 결제·도착하지 않은 상자(팬 처리할 일과 같은 판정, INV-J3) */
export type SentGiftItem =
  | { kind: "difference"; orderNo: string; boxId: string; boxLabel: string; boxSeq: number; creatorName: string; declaredTier: string; measuredTier: string; amountKrw: number; dueAt: string; sentAt: string }
  | { kind: "missing_box"; orderNo: string; boxId: string; boxLabel: string; boxSeq: number; creatorName: string; declaredTier: string; dueAt: string; sentAt: string }
  // 결제를 마치지 않은 선물(payment INV-M22 ⑤) — 크리에이터 계정이 보낸 결제 대기 주문 하나. 금액 = 처음 저장한 금액, 기한 = 처음 결제 대기 + 24시간, sentAt = 주문을 만든 때
  | { kind: "unpaid"; orderNo: string; creatorName: string; amountKrw: number; dueAt: string; sentAt: string };

/** 보낸 선물의 반송 주소 확인(office-workflow INV-W15, action-center INV-J5·J3) — 보낸 역조공 몫(shareId) 또는 보낸 팬 선물의 상자(boxId) 하나.
 *  nickname 은 몫이면 받는 팬, 팬 선물이면 받는 크리에이터. 기한 = 반송 대기 + 30일 */
export type ReturnAddressItem = {
  kind: "return_address";
  orderNo: string;
  shareId: string | null;
  boxId: string | null;
  boxSeq: number | null;
  boxLabel: string | null;
  nickname: string;
  tier: string;
  dueAt: string;
  sentAt: string;
};

export type CreatorActionItem = TrackerItem | BluetoothItem | ApprovalItem | UnconfirmedItem | SentGiftItem | ReturnAddressItem;

const iso = z.string().min(1).transform((v) => new Date(v).toISOString());
const count = z.number().int().nonnegative();
const prior = { prior_gift_count: count, prior_passed_count: count, prior_returned_count: count };
// 줄마다 오는 칸 전체 — 그 종류가 쓰지 않는 칸은 비어 있다. 모르는 칸이 섞이면 거부한다(strict — 칸이 늘면 시험과 이 꼴을 같이 고친다, INV-J7)
const common = {
  order_no: z.string().min(1),
  request_id: z.string().nullable(),
  share_id: z.string().nullable(),
  box_id: z.string().nullable(),
  box_seq: z.number().int().nullable(),
  box_count: z.number().int().nullable(),
  box_label: z.string().nullable(),
  nickname: z.string(),
  item_kind: z.string().nullable(),
  tier: z.string().nullable(),
  measured_tier: z.string().nullable(),
  amount_krw: z.number().int().nullable(),
  has_electronics_or_metal: z.boolean().nullable(),
  bluetooth: z.boolean().nullable(),
  rf: z.boolean().nullable(),
  choice: z.enum(["accept", "return", "report", "no_report"]).nullable(),
  sent_at: iso,
  received_at: iso.nullable(),
  due_at: iso.nullable(),
  prior_gift_count: count.nullable(),
  prior_passed_count: count.nullable(),
  prior_returned_count: count.nullable(),
};
const rowShape = z.object({ ...common, kind: z.enum(["tracker", "bluetooth", "approval", "unconfirmed", "difference", "missing_box", "return_address", "unpaid"]), board: z.enum(["received", "sent"]) }).strict();
type Row = z.infer<typeof rowShape>;

const need = <T>(v: T | null, what: string): T => {
  if (v === null) throw new Error(`처리할 일 줄에 ${what} 칸이 없다`);
  return v;
};
const priorOf = (r: Row): PriorHistory => {
  const h = z.object(prior).parse(r);
  return { gifts: h.prior_gift_count, passed: h.prior_passed_count, returned: h.prior_returned_count };
};

/** 종류와 판이 맞지 않거나 필요한 칸이 빈 줄이 하나라도 있으면 예외 — 숫자와 목록이 서로 다른 줄 수를 말하지 않게 일부만 버리지 않는다(INV-J6) */
export function parseCreatorActionItems(data: unknown): CreatorActionItem[] {
  return z
    .array(rowShape)
    .parse(data ?? [])
    .map((r): CreatorActionItem => {
      const board = r.kind === "tracker" || r.kind === "bluetooth" || r.kind === "approval" ? "received" : "sent";
      if (r.board !== board) throw new Error(`처리할 일 줄의 판이 종류와 다르다: ${r.kind}`);
      if (r.kind === "tracker" || r.kind === "bluetooth") {
        const box = {
          orderNo: r.order_no,
          boxSeq: need(r.box_seq, "상자 순번"),
          boxCount: need(r.box_count, "상자 수"),
          nickname: r.nickname,
          itemKind: need(r.item_kind, "물품"),
          tier: need(r.tier, "상자 크기"),
          bluetooth: need(r.bluetooth, "블루투스"),
          rf: need(r.rf, "RF"),
          sentAt: r.sent_at,
          receivedAt: r.received_at,
          dueAt: need(r.due_at, "기한"),
          priorHistory: priorOf(r),
        };
        // 선택지는 종류의 짝 안에서만 — 다른 종류의 선택이 오면 꼴이 다른 줄이다
        if (r.kind === "tracker") {
          if (r.choice !== null && r.choice !== "report" && r.choice !== "no_report") throw new Error("추적 장치 줄의 선택이 신고하기·신고하지 않기가 아니다");
          return { kind: "tracker", ...box, choice: r.choice };
        }
        if (r.choice !== null && r.choice !== "accept" && r.choice !== "return") throw new Error("블루투스 줄의 선택이 받기·거절이 아니다");
        return { kind: "bluetooth", ...box, choice: r.choice };
      }
      if (r.kind === "approval") {
        return {
          kind: r.kind,
          orderNo: r.order_no,
          requestId: need(r.request_id, "승인 요청"),
          boxCount: need(r.box_count, "상자 수"),
          nickname: r.nickname,
          itemKind: need(r.item_kind, "물품"),
          hasElectronicsOrMetal: need(r.has_electronics_or_metal, "전자기기·금속"),
          sentAt: r.sent_at,
          receivedAt: r.received_at,
          dueAt: need(r.due_at, "기한"),
          priorHistory: priorOf(r),
        };
      }
      if (r.kind === "unconfirmed") {
        return { kind: r.kind, orderNo: r.order_no, shareId: need(r.share_id, "팬별 선물"), nickname: r.nickname, tier: need(r.tier, "상자 크기"), sentAt: r.sent_at };
      }
      if (r.kind === "return_address") {
        // 몫이거나 상자이거나 하나만 — 둘 다·둘 다 없음은 꼴이 다른 줄이다
        if ((r.share_id === null) === (r.box_id === null)) throw new Error("반송 주소 줄은 팬별 선물과 상자 중 하나만 가리킨다");
        return {
          kind: r.kind,
          orderNo: r.order_no,
          shareId: r.share_id,
          boxId: r.box_id,
          boxSeq: r.box_id === null ? null : need(r.box_seq, "상자 순번"),
          boxLabel: r.box_id === null ? null : need(r.box_label, "상자 이름"),
          nickname: r.nickname,
          tier: need(r.tier, "상자 크기"),
          dueAt: need(r.due_at, "기한"),
          sentAt: r.sent_at,
        };
      }
      if (r.kind === "unpaid") {
        return { kind: r.kind, orderNo: r.order_no, creatorName: r.nickname, amountKrw: need(r.amount_krw, "금액"), dueAt: need(r.due_at, "기한"), sentAt: r.sent_at };
      }
      const box = {
        orderNo: r.order_no,
        boxId: need(r.box_id, "상자"),
        boxLabel: need(r.box_label, "상자 이름"),
        boxSeq: need(r.box_seq, "상자 순번"),
        creatorName: r.nickname,
        declaredTier: need(r.tier, "상자 크기"),
        dueAt: need(r.due_at, "기한"),
        sentAt: r.sent_at,
      };
      if (r.kind === "difference") {
        return { kind: r.kind, ...box, measuredTier: need(r.measured_tier, "실측 크기"), amountKrw: need(r.amount_krw, "금액") };
      }
      return { kind: r.kind, ...box };
    });
}

/** 받은 선물 판(추적 장치 발견 · 블루투스 발견 · 승인 요청)과 보낸 선물 판(미확인 상자 · 보낸 팬 선물 · 반송 주소) — DB 가 정한 순서 그대로 나눈다(INV-J5) */
export function splitBoards(items: readonly CreatorActionItem[]): {
  received: (TrackerItem | BluetoothItem | ApprovalItem)[];
  sent: (UnconfirmedItem | SentGiftItem | ReturnAddressItem)[];
} {
  const received: (TrackerItem | BluetoothItem | ApprovalItem)[] = [];
  const sent: (UnconfirmedItem | SentGiftItem | ReturnAddressItem)[] = [];
  for (const it of items) {
    if (it.kind === "tracker" || it.kind === "bluetooth" || it.kind === "approval") received.push(it);
    else sent.push(it);
  }
  return { received, sent };
}

/** 남은 날 — 서울 날짜로 센다(줄·창에 보이는 기한은 서울 시간, INV-J5). 3일 이하는 강조색(design-rules 13절) */
export function daysLeftOf(dueAt: string, now: string): { text: string; soon: boolean } {
  const days = seoulDaysUntil(dueAt, now);
  return { text: days > 0 ? `${days}일 남음` : "오늘까지", soon: days <= 3 };
}

/**
 * 크리에이터 계정이 보낸 선물 상세의 맨 위 「지금 할 일」 칸(action-center INV-J13 · payment INV-M22 ⑤) — 크리에이터 지금 할 일 읽기 결과(사이드바 숫자와 같은 결과, INV-J6)에서
 * 그 주문의 보낸 선물 줄(결제 대기·추가 결제·상자 찾기)을 모두 팬 칸과 같은 꼴로 옮긴다 — 같은 주문의 일이 여럿이면 모두(INV-J13).
 * 상세가 따로 「할 일이 있는가」를 계산하지 않는다. 팬 칸에 없는 sentAt 만 뗀다.
 */
export function sentGiftTodoOf(items: readonly CreatorActionItem[], orderNo: string): ActionItem[] {
  return items.flatMap((it): ActionItem[] => {
    if (!("orderNo" in it) || it.orderNo !== orderNo) return [];
    if (it.kind === "unpaid" || it.kind === "difference" || it.kind === "missing_box") {
      const { sentAt: _sentAt, ...todo } = it;
      return [todo];
    }
    return [];
  });
}
