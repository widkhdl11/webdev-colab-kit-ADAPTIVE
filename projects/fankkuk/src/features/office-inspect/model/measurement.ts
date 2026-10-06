import { z } from "zod";

// 검수 때 기록하는 상자 실측 구간 (payment INV-M11, admin-console INV-K1·K6).
// 차액 금액은 DB 가 기록하는 순간의 요금표로 정한다 — 화면은 구간만 고른다. 실측이 신고 이하면 차액이 없고,
// 대형을 넘으면 차액이 아니라 검수 불합격(그 상자는 검수 스캔에서 반송 대기로 간다).

export const MEASURED_TIERS = ["small", "medium", "large", "oversize"] as const;
export type MeasuredTier = (typeof MEASURED_TIERS)[number];

export type Measurement = { result: "difference"; amountKrw: number } | { result: "none" } | { result: "inspection_failed" };

const dbShape = z.discriminatedUnion("result", [
  z.object({ result: z.literal("difference"), amount_krw: z.number().int().positive() }),
  z.object({ result: z.literal("none") }),
  z.object({ result: z.literal("inspection_failed") }),
]);

/** DB 실측 함수의 결과 → 화면 값. 꼴이 다르면 null. */
export function measurementFromDb(data: unknown): Measurement | null {
  const r = dbShape.safeParse(data);
  if (!r.success) return null;
  return r.data.result === "difference" ? { result: "difference", amountKrw: r.data.amount_krw } : { result: r.data.result };
}

const bodyShape = z.discriminatedUnion("result", [
  z.object({ result: z.literal("difference"), amountKrw: z.number().int().positive() }),
  z.object({ result: z.literal("none") }),
  z.object({ result: z.literal("inspection_failed") }),
]);

/** 응답 본문의 measurement 칸 → 화면 값. 꼴이 다르면 null. */
export function measurementFromBody(body: Record<string, unknown>): Measurement | null {
  const r = bodyShape.safeParse(body.measurement);
  return r.success ? r.data : null;
}
