import { z } from "zod";

// 팬이 보는 상자별 차액 요청 (payment INV-M11·M13). 결제 번호·칸 나눔은 오지 않는다 — 금액 한 줄과 기한만.

export type GiftDifferenceState = "due" | "paying" | "paid" | "closed";

export type GiftDifference = {
  boxId: string;
  boxSeq: number;
  declaredTier: string;
  measuredTier: string;
  amountKrw: number;
  dueAt: string;
  state: GiftDifferenceState;
};

const rowShape = z.object({
  box_id: z.string().uuid(),
  box_seq: z.number().int(),
  declared_tier: z.string(),
  measured_tier: z.string(),
  amount_krw: z.number().int().positive(),
  status: z.enum(["pending", "confirming", "done", "failed"]),
  due_at: z.string(),
  expired: z.boolean(),
});

type RowStatus = z.infer<typeof rowShape>["status"];

/** 화면의 상태: 낸 것(paid) · 결제 중(paying) · 기한이 지나 더는 낼 수 없음(closed) · 낼 차액(due — 대기·실패). */
export function differenceState(status: RowStatus, expired: boolean): GiftDifferenceState {
  if (status === "done") return "paid";
  if (status === "confirming") return "paying";
  return expired ? "closed" : "due";
}

export function parseDifferenceRows(data: unknown): GiftDifference[] {
  return z
    .array(rowShape)
    .parse(data ?? [])
    .map((r) => ({
      boxId: r.box_id,
      boxSeq: r.box_seq,
      declaredTier: r.declared_tier,
      measuredTier: r.measured_tier,
      amountKrw: r.amount_krw,
      dueAt: r.due_at,
      state: differenceState(r.status, r.expired),
    }));
}

/**
 * 선물 상세에 보일 차액 줄. 진행 중인 주문은 전부(낼 것·결제 중·낸 것·기한 지남),
 * 끝난 주문(돌려보냄·받지 않음 등)은 낸 기록만 남긴다 — 더는 낼 수 없는 차액을 「결제 필요」로 보이지 않게.
 */
export function visibleDifferences(rows: readonly GiftDifference[], inProgress: boolean): GiftDifference[] {
  return inProgress ? [...rows] : rows.filter((d) => d.state === "paid");
}
