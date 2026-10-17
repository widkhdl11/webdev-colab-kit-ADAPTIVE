import { z } from "zod";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";

// 처리할 일 카드 (action-center INV-J1·J2·J3). DB 읽기 함수 하나(my_action_items)의 줄을 그대로 카드로 쓴다 — 저장된 목록이 아니라
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
      dueAt: string;
    }
  | { kind: "missing_box"; orderNo: string; boxId: string; boxLabel: string; boxSeq: number; creatorName: string; declaredTier: string; dueAt: string }
  | { kind: "revgift"; orderNo: string; creatorName: string; tier: string; dueAt: string }
  // 반송 주소 확인(office-workflow INV-W15) — 반송 대기 · 확인 전 상자 하나. 기한 = 반송 대기 + 30일(지나면 처분 대상).
  | { kind: "return_address"; orderNo: string; boxId: string; boxLabel: string; boxSeq: number; creatorName: string; declaredTier: string; dueAt: string };

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
  }),
  z.object({ ...base, kind: z.literal("missing_box"), box_id: z.string().uuid(), box_label: z.string(), box_seq: z.number().int() }),
  z.object({ ...base, kind: z.literal("revgift") }),
  z.object({ ...base, kind: z.literal("return_address"), box_id: z.string().uuid(), box_label: z.string(), box_seq: z.number().int() }),
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
      return { kind: r.kind, orderNo: r.order_no, creatorName: r.creator_name, tier: r.tier, dueAt: r.due_at };
    });
}

/** 선물 상세 맨 위 한 줄 — 같은 읽기 결과에서 그 주문의 카드만 */
export function actionItemsOfOrder(items: readonly ActionItem[], orderNo: string): ActionItem[] {
  return items.filter((it) => it.orderNo === orderNo);
}

/** 처리할 일 화면 주소 */
export const ACTION_CENTER_HREF = "/me/actions";

/** 처분 예정 날짜 문장(office-workflow INV-W15, 용어집 dispose_due 행) — 기한은 반송 대기 + 30일, 날짜는 서울 날짜. 팬·크리에이터 처리할 일이 같이 쓴다 */
export function disposeDueText(dueAt: string): string {
  return `${formatMonthDayKo(dueAt)}까지 확인하지 않으면 상자를 처분해요`;
}
