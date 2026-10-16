import { z } from "zod";
import { BOX_STATES, type BoxState } from "@/entities/parcel/model/box-rows";

// 크리에이터 선물 현황 (action-center INV-J9~J11). DB 읽기 함수 my_gift_progress 한 번의 줄을 화면 모양으로 바꾼다.
// 저장된 목록이 아니라 읽을 때마다 원천에서 계산한 결과이고(J9), 판·순서는 DB 가 정했다 — 여기서는 순서를 바꾸지 않는다.
// 단계는 기존 읽기의 값만 쓴다(J9 — 현황만의 단계 칸 없음): 받는 선물 = 받은 선물 읽기(my_incoming_gifts, INV-W9)의 stage,
// 보내는 선물 = 보낸 역조공 읽기(my_sent_revgifts)의 받기 상태 + 상자 읽기(my_share_boxes)의 상자 상태.
// 늦음은 DB 의 late 칸(처리할 일 미확인 상자 줄과 같은 함수, J11)에서만 — 화면이 날짜를 다시 재지 않는다.
// 「처리할 일」 버튼 판정은 model/action-targets.ts — 처리할 일 읽기 결과에서만(J11).

/** 진행 중인 받는 선물의 단계(받은 선물 읽기의 stage 중 수령·반송·닫힘을 뺀 것) */
export const RECEIVED_STAGES = ["paid", "received", "inspected", "shipped", "in_transit"] as const;
export type ReceivedStage = (typeof RECEIVED_STAGES)[number];

/** 보낸 역조공 읽기의 받기 상태 — 크리에이터에게 보이는 세 가지(reverse-gift INV-R8) */
export type ReplyState = "waiting" | "accepted" | "not_received";

export type ReceivedProgress = {
  board: "received";
  orderNo: string;
  nickname: string;
  itemKind: string;
  boxCount: number;
  stage: ReceivedStage;
  approvalWaiting: boolean;
  /** 결제 완료(승인 요청) 시각 */
  requestedAt: string;
  approvedAt: string | null;
};

export type SentProgress = {
  board: "sent";
  orderNo: string;
  shareId: string;
  nickname: string;
  tier: string;
  replyState: ReplyState;
  boxState: BoxState;
  /** 그 보내기의 결제 완료 시각(보낸 날) */
  sentAt: string;
  /** 결제 끝·입고 전·닫히지 않음 — 「내 상자 찾기」 자리(J10, 찾기 후보와 같은 판정) */
  beforeInbound: boolean;
  /** 입고 전인데 결제 완료 뒤 336시간이 지남(J11) */
  late: boolean;
};

/** 보낸 날별 소제목 하나 — 같은 보내기의 몫(결제 완료 시각이 같다) */
export type SentGroup = { sentAt: string; rows: SentProgress[] };

export type GiftProgress = { received: ReceivedProgress[]; sent: SentGroup[] };

const iso = z.string().min(1).transform((v) => new Date(v).toISOString());
// 줄마다 오는 칸 전체 — 그 판이 쓰지 않는 칸은 비어 있다. 모르는 칸이 섞이면 거부한다(strict — J10 의 칸 목록)
const rowShape = z
  .object({
    board: z.enum(["received", "sent"]),
    order_no: z.string().min(1),
    share_id: z.string().uuid().nullable(),
    nickname: z.string(),
    item_kind: z.string().nullable(),
    box_count: z.number().int().nonnegative().nullable(),
    tier: z.string().nullable(),
    stage: z.enum(RECEIVED_STAGES).nullable(),
    approval_waiting: z.boolean().nullable(),
    requested_at: iso.nullable(),
    approved_at: iso.nullable(),
    reply_state: z.enum(["waiting", "accepted", "not_received"]).nullable(),
    box_state: z.enum(BOX_STATES).nullable(),
    sent_at: iso.nullable(),
    before_inbound: z.boolean().nullable(),
    late: z.boolean().nullable(),
  })
  .strict();
type Row = z.infer<typeof rowShape>;

const need = <T>(v: T | null, what: string): T => {
  if (v === null) throw new Error(`선물 현황 기록에 ${what} 칸이 없다`);
  return v;
};

function toReceived(r: Row): ReceivedProgress {
  return {
    board: "received",
    orderNo: r.order_no,
    nickname: r.nickname,
    itemKind: need(r.item_kind, "선물 종류"),
    boxCount: need(r.box_count, "상자 수"),
    stage: need(r.stage, "단계"),
    approvalWaiting: need(r.approval_waiting, "승인 대기"),
    requestedAt: need(r.requested_at, "요청 시각"),
    approvedAt: r.approved_at,
  };
}

function toSent(r: Row): SentProgress {
  return {
    board: "sent",
    orderNo: r.order_no,
    shareId: need(r.share_id, "받는 팬별 선물"),
    nickname: r.nickname,
    tier: need(r.tier, "상자 크기"),
    replyState: need(r.reply_state, "받기 상태"),
    boxState: need(r.box_state, "상자 상태"),
    sentAt: need(r.sent_at, "보낸 날"),
    beforeInbound: need(r.before_inbound, "입고 전"),
    late: need(r.late, "늦음"),
  };
}

/** 응답 전체를 받거나 전체를 버린다 — 칸이 빠진 기록 하나 때문에 일부만 보여 주지 않는다 */
export function parseGiftProgressRows(data: unknown): GiftProgress {
  const rows = z.array(rowShape).parse(data ?? []);
  const received: ReceivedProgress[] = [];
  const sent: SentGroup[] = [];
  for (const r of rows) {
    if (r.board === "received") {
      received.push(toReceived(r));
      continue;
    }
    const s = toSent(r);
    const last = sent[sent.length - 1];
    if (last && last.sentAt === s.sentAt) last.rows.push(s);
    else sent.push({ sentAt: s.sentAt, rows: [s] });
  }
  return { received, sent };
}

/** 다섯 칸 막대 — key 는 단계 이름 열쇠(문구는 화면이 고른다), cells 는 왼쪽부터 칠한 칸 수 */
export type ProgressStep = { key: ProgressStepKey; cells: 1 | 2 | 3 | 4 };
export type ProgressStepKey =
  | "approval_waiting"
  | "to_office"
  | "inspecting"
  | "inspected"
  | "shipped"
  | "in_transit"
  | "reply_waiting"
  | "not_received"
  | "late"
  | "returning";

/**
 * 받는 선물 — 승인 → 사무실 도착 → 검수 → 출고·배송 → 수령의 다섯 칸(시안 cre-progress.html).
 * 승인은 단계가 아니라 출고 조건이라(INV-W9) 상자가 아직 오지 않은 동안에만 첫 칸 「승인 대기」로 보인다 — 상자가 오면 상자 단계가 이긴다.
 */
export function receivedStepOf(r: Pick<ReceivedProgress, "stage" | "approvalWaiting">): ProgressStep {
  switch (r.stage) {
    case "paid":
      return r.approvalWaiting ? { key: "approval_waiting", cells: 1 } : { key: "to_office", cells: 2 };
    case "received":
      return { key: "inspecting", cells: 3 };
    case "inspected":
      return { key: "inspected", cells: 3 };
    case "shipped":
      return { key: "shipped", cells: 4 };
    case "in_transit":
      return { key: "in_transit", cells: 4 };
  }
}

const ARRIVED_CHECKING: readonly BoxState[] = ["received", "labeled", "held"];
const ARRIVED_PASSED: readonly BoxState[] = ["inspected", "label_printed"];
const RETURNING: readonly BoxState[] = ["return_waiting", "return_printed"];

/**
 * 보내는 선물 — 팬의 받기 → 사무실 도착 → 검수 → 출고 → 수령의 다섯 칸.
 * 상자가 사무실에 왔으면 상자 상태가, 아직이면 받기 상태가 단계다. 입고 전에 늦으면(DB late) 늦음.
 */
export function sentStepOf(r: Pick<SentProgress, "replyState" | "boxState" | "late">): ProgressStep {
  if (r.boxState === "shipped") return { key: "shipped", cells: 4 };
  if (ARRIVED_PASSED.includes(r.boxState)) return { key: "inspected", cells: 3 };
  if (RETURNING.includes(r.boxState)) return { key: "returning", cells: 3 };
  if (ARRIVED_CHECKING.includes(r.boxState)) return { key: "inspecting", cells: 3 };
  if (r.late) return { key: "late", cells: 2 };
  if (r.replyState === "waiting") return { key: "reply_waiting", cells: 1 };
  if (r.replyState === "not_received") return { key: "not_received", cells: 1 };
  return { key: "to_office", cells: 2 };
}

/** INV-J11: 배송 조회 버튼 — 보내는 선물의 입고 전 몫이 늦을 때만(DB late 칸, 처리할 일 미확인 상자 줄과 같은 함수) */
export function canTrack(r: Pick<SentProgress, "late" | "beforeInbound">): boolean {
  return r.late && r.beforeInbound;
}

/** INV-J10(카드 d96 ①): 「내 상자 찾기」 버튼 — 입고 전 몫이고, 찾기 창 후보(같은 판정의 읽기)에 그 몫이 있을 때. 늦지 않아도 */
export function canFind(r: Pick<SentProgress, "beforeInbound" | "shareId">, candidateShareIds: ReadonlySet<string>): boolean {
  return r.beforeInbound && candidateShareIds.has(r.shareId);
}

/** 진행 중인 줄 수 — 제목 옆 「진행 중 N건」 */
export function countProgress(p: GiftProgress): number {
  return p.received.length + p.sent.reduce((n, g) => n + g.rows.length, 0);
}
