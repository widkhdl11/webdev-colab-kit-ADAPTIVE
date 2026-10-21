import { z } from "zod";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";

// 지금 할 일 줄 (action-center INV-J1·J2·J3 — 2026-10-21 화면 이름 「처리할 일」 → 「지금 할 일」). DB 읽기 함수 하나(my_action_items)의 줄을 그대로 카드로 쓴다 — 저장된 목록이 아니라
// 읽을 때마다 원천 상태에서 계산된 결과다. 사이드바 숫자·홈 한 줄·처리할 일 화면·선물 상세 맨 위 한 줄은 모두 이 배열 하나에서 나온다(J2).
// 숫자는 배열 길이다 — 따로 세는 길을 만들지 않는다.

export type ActionItem =
  | {
      kind: "difference";
      orderNo: string;
      boxId: string;
      boxLabel: string;
      boxSeq: number;
      creatorName: string;
      declaredTier: string;
      measuredTier: string;
      amountKrw: number;
      /** 기한 = 그 상자의 검수 완료 스캔 + 168시간(payment INV-M13, 2026-10-21). 스캔 전(실측만 있음)이면 null */
      dueAt: string | null;
    }
  | { kind: "missing_box"; orderNo: string; boxId: string; boxLabel: string; boxSeq: number; creatorName: string; declaredTier: string; dueAt: string }
  | { kind: "revgift"; orderNo: string; creatorName: string; tier: string; dueAt: string }
  // 반송 주소 확인(office-workflow INV-W15) — 반송 대기 · 확인 전 상자 하나. 기한 = 반송 대기 + 30일(지나면 처분 대상).
  | { kind: "return_address"; orderNo: string; boxId: string; boxLabel: string; boxSeq: number; creatorName: string; declaredTier: string; dueAt: string }
  // 결제 미완료(payment INV-M22, action-center INV-J1 표) — 결제 대기 주문 하나. 금액 = 처음 결제 대기에 저장한 금액, 기한 = 처음 결제 대기 + 24시간(INV-M15 가 닫는 때)
  | { kind: "unpaid"; orderNo: string; creatorName: string; amountKrw: number; dueAt: string };

const base = { order_no: z.string(), creator_name: z.string(), tier: z.string(), due_at: z.string() };

const rowShape = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("difference"),
    box_id: z.string().uuid(),
    box_label: z.string(),
    box_seq: z.number().int(),
    measured_tier: z.string(),
    amount_krw: z.number().int().positive(),
    due_at: z.string().nullable(),
  }),
  z.object({ ...base, kind: z.literal("missing_box"), box_id: z.string().uuid(), box_label: z.string(), box_seq: z.number().int() }),
  z.object({ ...base, kind: z.literal("revgift") }),
  z.object({ ...base, kind: z.literal("return_address"), box_id: z.string().uuid(), box_label: z.string(), box_seq: z.number().int() }),
  // 결제 미완료는 상자가 아니라 주문 하나의 줄이다 — 상자·구간 칸이 비어 있다
  z.object({ ...base, kind: z.literal("unpaid"), tier: z.null(), amount_krw: z.number().int().positive() }),
]);

/** 꼴이 다른 줄이 하나라도 있으면 예외 — 숫자와 목록이 서로 다른 줄 수를 말하지 않게 일부만 버리지 않는다. */
export function parseActionItems(data: unknown): ActionItem[] {
  return z
    .array(rowShape)
    .parse(data ?? [])
    .map((r): ActionItem => {
      if (r.kind === "difference") {
        return {
          kind: r.kind,
          orderNo: r.order_no,
          boxId: r.box_id,
          boxLabel: r.box_label,
          boxSeq: r.box_seq,
          creatorName: r.creator_name,
          declaredTier: r.tier,
          measuredTier: r.measured_tier,
          amountKrw: r.amount_krw,
          dueAt: r.due_at,
        };
      }
      if (r.kind === "missing_box" || r.kind === "return_address") {
        return {
          kind: r.kind,
          orderNo: r.order_no,
          boxId: r.box_id,
          boxLabel: r.box_label,
          boxSeq: r.box_seq,
          creatorName: r.creator_name,
          declaredTier: r.tier,
          dueAt: r.due_at,
        };
      }
      if (r.kind === "unpaid") return { kind: r.kind, orderNo: r.order_no, creatorName: r.creator_name, amountKrw: r.amount_krw, dueAt: r.due_at };
      return { kind: r.kind, orderNo: r.order_no, creatorName: r.creator_name, tier: r.tier, dueAt: r.due_at };
    });
}

/** 선물 상세 맨 위 「지금 할 일」 칸(action-center INV-J13) — 같은 읽기 결과에서 그 주문(역조공은 몫)의 줄만. 상세가 따로 계산하지 않는다 */
export function actionItemsOfOrder(items: readonly ActionItem[], orderNo: string): ActionItem[] {
  return items.filter((it) => it.orderNo === orderNo);
}

/** 지금 할 일 화면 주소(2026-10-21 카드 d104 — 화면 이름 「지금 할 일」, 주소는 그대로) */
export const ACTION_CENTER_HREF = "/me/actions";

/** 선물 상세의 「지금 할 일」 칸 조각 이름 — 칸의 id 이자 링크의 고정 조각(action-center INV-J13, notifications INV-N9) */
export const TODO_FRAGMENT = "todo";

/**
 * 선물 상세 주소(action-center INV-J12) — 팬 선물(FC-)도 받은 역조공 몫(RG-)도 `/gifts/{주문번호}` 하나다.
 * todo = 지금 할 일 줄·알림에서 갈 때 — 고정 조각 `#todo` 만 붙인다(그 자체로는 아무것도 처리하지 않는다).
 */
export function giftDetailHref(orderNo: string, todo = false): string {
  return `/gifts/${orderNo}${todo ? `#${TODO_FRAGMENT}` : ""}`;
}

/** 가장 급한 줄이 먼저 — 기한이 이른 순, 기한이 아직 없는 줄(검수 완료 스캔 전 차액)은 뒤. 같은 기한이면 읽은 순서 그대로 */
export function byUrgency(items: readonly ActionItem[]): ActionItem[] {
  const at = (it: ActionItem) => (it.dueAt ? Date.parse(it.dueAt) : Number.POSITIVE_INFINITY);
  return [...items].sort((a, b) => at(a) - at(b));
}

/** 선물 상세 요약 상자의 「추가 결제 N원」 — 맨 위 칸(INV-J13)에 뜨는 추가 결제 줄의 금액 합. 칸과 같은 줄에서 세므로 끝난 주문·반송 대기 상자의 차액은 들어가지 않는다 */
export function differenceDueKrw(items: readonly ActionItem[]): number {
  return items.reduce((sum, it) => (it.kind === "difference" ? sum + it.amountKrw : sum), 0);
}

/** 처분 예정 날짜 문장(office-workflow INV-W15, 용어집 dispose_due 행) — 기한은 반송 대기 + 30일, 날짜는 서울 날짜. 팬·크리에이터 처리할 일이 같이 쓴다 */
export function disposeDueText(dueAt: string): string {
  return `${formatMonthDayKo(dueAt)}까지 확인하지 않으면 상자를 처분해요`;
}
