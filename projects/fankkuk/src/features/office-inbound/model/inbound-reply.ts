import { z } from "zod";
import { HOLD_REASONS, type HoldReason } from "@/entities/parcel/model/office-lists";
import { parcelDetailFromReply, type ParcelDetail } from "@/entities/parcel/model/office-parcel";
import { QR_PATTERN } from "@/entities/parcel/model/scan-code";

// 브라우저 쪽: 입고 스캔 응답을 다시 확인한다 (office-workflow INV-W1·W5, inbound-address-code INV-C5).
// 꼴이 다르면 null — 라벨이 나간 것처럼 그리지 않는다.
//   received·reprinted = 입고 완료(라벨 1장) · hold = 보류로 기록(닉네임 일치면 그 닉네임, 아니면 null — INV-C5) · hold_recorded = 이미 보류로 기록한 바코드
//   · need_details = 보류로 넣어야 하는데 택배사·송장 「보내는 분」 이름·선반 번호가 없어 아무것도 바뀌지 않음

export type InboundScanReply =
  | { result: "received" | "reprinted"; qr: string; orderNo: string; parcel: ParcelDetail | null }
  | { result: "hold"; reason: HoldReason; nickname: string | null }
  | { result: "hold_recorded" }
  | { result: "need_details"; reason: HoldReason };

const shape = z.discriminatedUnion("result", [
  z.object({ result: z.enum(["received", "reprinted"]), qr: z.string().regex(QR_PATTERN), orderNo: z.string(), parcel: z.unknown() }),
  z.object({ result: z.literal("hold"), reason: z.enum(HOLD_REASONS), nickname: z.string().nullable().optional() }),
  z.object({ result: z.literal("hold_recorded") }),
  z.object({ result: z.literal("need_details"), reason: z.enum(HOLD_REASONS) }),
]);

export function inboundReplyFromBody(body: unknown): InboundScanReply | null {
  const parsed = shape.safeParse(body);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (r.result === "hold") return { result: r.result, reason: r.reason, nickname: r.nickname ?? null };
  if (r.result === "need_details") return { result: r.result, reason: r.reason };
  if (r.result === "hold_recorded") return { result: "hold_recorded" };
  return { result: r.result, qr: r.qr, orderNo: r.orderNo, parcel: r.parcel === null ? null : parcelDetailFromReply(r.parcel) };
}
