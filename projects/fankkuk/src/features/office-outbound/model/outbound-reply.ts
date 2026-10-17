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
// 반송 송장: 어느 주문에도 이어지지 않은 상자는 봉투 번호, 주문에 이어진 상자는 보낸 사람이 확인한 주소의 라벨 칸이 온다(address-protection INV-P18)
const returnPrinted = z.union([
  z.object({ waybill: z.string().regex(WAYBILL_PATTERN), envelopeNo: z.string().min(1) }),
  z.object({ waybill: z.string().regex(WAYBILL_PATTERN), reprint: z.boolean().optional(), label: labelShape }),
]);

export function printedReplyFromBody(body: unknown): { waybill: string; reprint: boolean; label: PrintedLabel | null } | null {
  const parsed = printed.safeParse(body);
  if (!parsed.success) return null;
  return { waybill: parsed.data.waybill, reprint: parsed.data.reprint ?? false, label: parsed.data.label ?? null };
}

export function returnPrintedReplyFromBody(body: unknown): { waybill: string; envelopeNo: string | null; label: PrintedLabel | null } | null {
  const parsed = returnPrinted.safeParse(body);
  if (!parsed.success) return null;
  const d = parsed.data;
  return "label" in d ? { waybill: d.waybill, envelopeNo: null, label: d.label } : { waybill: d.waybill, envelopeNo: d.envelopeNo, label: null };
}
