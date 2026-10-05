import { z } from "zod";
import { WAYBILL_PATTERN } from "@/entities/parcel/model/waybill-no";

// 브라우저 쪽: 출고 화면의 출력 응답을 다시 확인한다 (office-workflow INV-W1·W8). 꼴이 다르면 null.

const labelShape = z.object({
  recipientName: z.string().min(1),
  phone: z.string().min(1),
  zipCode: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string(),
});
export type PrintedLabel = z.infer<typeof labelShape>;

// 팬 선물은 라벨 칸(받는 사람·전화·주소)이 함께 온다 — 송장 인쇄에만 쓰고 저장하지 않는다. 역조공은 아직 송장번호뿐이다.
const printed = z.object({ waybill: z.string().regex(WAYBILL_PATTERN), reprint: z.boolean().optional(), label: labelShape.optional() });
const returnPrinted = z.object({ waybill: z.string().regex(WAYBILL_PATTERN), envelopeNo: z.string().min(1) });

export function printedReplyFromBody(body: unknown): { waybill: string; reprint: boolean; label: PrintedLabel | null } | null {
  const parsed = printed.safeParse(body);
  if (!parsed.success) return null;
  return { waybill: parsed.data.waybill, reprint: parsed.data.reprint ?? false, label: parsed.data.label ?? null };
}

export function returnPrintedReplyFromBody(body: unknown): { waybill: string; envelopeNo: string } | null {
  const parsed = returnPrinted.safeParse(body);
  return parsed.success ? { waybill: parsed.data.waybill, envelopeNo: parsed.data.envelopeNo } : null;
}
