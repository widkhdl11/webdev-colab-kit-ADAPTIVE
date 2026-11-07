import { z } from "zod";
import type { OfficeTier } from "@/entities/parcel/model/office-parcel";

// 검수 때 기록하는 상자 실측 구간 (payment INV-M11, admin-console INV-K1·K6).
// 차액 금액은 DB 가 기록하는 순간의 요금표로 정한다 — 화면은 구간만 고른다. 실측이 신고 이하면 차액이 없고,
// 대형을 넘으면 열린 주문은 개인접수 — 운영자가 넣은 우체국 실비로 차액 결제 요청(payment INV-M23). 닫힌 주문이면 검수 불합격.

export const MEASURED_TIERS = ["small", "medium", "large", "oversize"] as const;

/**
 * 개인접수 우체국 실비 상한(payment INV-M23 ①) — DB 함수 personal_intake_cost_max_krw() 와 같은 값.
 * 하한(대형 택배 원가)은 요금표에 있어 DB 가 기록하는 순간 본다.
 */
export const PERSONAL_INTAKE_COST_MAX_KRW = 100_000;
export type MeasuredTier = (typeof MEASURED_TIERS)[number];

/** 실비 칸의 글자 → 원 단위 정수. 쉼표·공백·「원」은 떼고 읽는다. 숫자만 남지 않으면 null(범위는 서버·DB 가 본다) */
export function parseCostText(text: string): number | null {
  const digits = text.replace(/[,\s원]/g, "");
  return /^\d{1,9}$/.test(digits) ? Number(digits) : null;
}

/**
 * 검수 화면이 열릴 때 실측 구간에 미리 골라 둘 값 — 팬이 신고한 구간(office-workflow INV-W4 S4h, 2026-10-12 문제집 D5).
 * 직원은 재어 보고 다를 때만 바꾼다. 기록은 「실측 기록」을 눌러야 남는다(저장 규칙 그대로).
 */
export function initialMeasuredTier(declared: OfficeTier): MeasuredTier {
  return declared;
}

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
