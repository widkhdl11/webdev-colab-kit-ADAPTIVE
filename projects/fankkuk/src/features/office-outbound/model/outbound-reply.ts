import { z } from "zod";
import { WAYBILL_PATTERN } from "@/entities/parcel/model/waybill-no";

// 브라우저 쪽: 출고 화면의 출력 응답을 다시 확인한다 (office-workflow INV-W1·W8). 꼴이 다르면 null.

const printed = z.object({ waybill: z.string().regex(WAYBILL_PATTERN) });
const returnPrinted = z.object({ waybill: z.string().regex(WAYBILL_PATTERN), envelopeNo: z.string().min(1) });

export function printedReplyFromBody(body: unknown): { waybill: string } | null {
  const parsed = printed.safeParse(body);
  return parsed.success ? { waybill: parsed.data.waybill } : null;
}

export function returnPrintedReplyFromBody(body: unknown): { waybill: string; envelopeNo: string } | null {
  const parsed = returnPrinted.safeParse(body);
  return parsed.success ? { waybill: parsed.data.waybill, envelopeNo: parsed.data.envelopeNo } : null;
}
