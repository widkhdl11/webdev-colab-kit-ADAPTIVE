import { z } from "zod";
import { parcelDetailFromReply, type ParcelDetail } from "@/entities/parcel/model/office-parcel";
import { QR_PATTERN } from "@/entities/parcel/model/scan-code";

// 브라우저 쪽: 입고 스캔 응답을 다시 확인한다 (office-workflow INV-W1·W5). 꼴이 다르면 null — 라벨이 나간 것처럼 그리지 않는다.

export type InboundScanReply =
  | { result: "received" | "reprinted"; qr: string; orderNo: string; parcel: ParcelDetail | null }
  | { result: "unmatched" }
  | { result: "unmatched_recorded" };

const shape = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["received", "reprinted"]), qr: z.string().regex(QR_PATTERN), orderNo: z.string(), parcel: z.unknown() }),
  z.object({ result: z.literal("unmatched") }),
  z.object({ result: z.literal("unmatched_recorded") }),
]);

export function inboundReplyFromBody(body: unknown): InboundScanReply | null {
  const parsed = shape.safeParse(body);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.result === "unmatched") return { result: "unmatched" };
  if (r.result === "unmatched_recorded") return { result: "unmatched_recorded" };
  return { result: r.result, qr: r.qr, orderNo: r.orderNo, parcel: r.parcel === null ? null : parcelDetailFromReply(r.parcel) };
}
