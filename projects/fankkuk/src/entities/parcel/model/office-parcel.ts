import { z } from "zod";
import { BOX_STATES, type BoxState } from "./box-rows";
import { QR_PATTERN } from "./scan-code";

// 사무실 상자 (office-workflow INV-W1·W7). 상태와 「다음 단계」는 DB 가 정한 값을 그대로 쓴다 — 화면은 짐작하지 않는다.
// 사람은 닉네임·크리에이터 이름으로만 나온다(INV-W7). 꼴이 다른 줄이 하나라도 있으면 null.

export const PARCEL_KINDS = ["gift", "revgift"] as const;
export type ParcelKind = (typeof PARCEL_KINDS)[number];

// 상자 상태 목록의 정본은 box-rows.ts(BOX_STATES) — 팬·크리에이터 화면과 같은 목록을 쓴다.
// 도착하지 않음으로 닫힌 상자(INV-W10)는 사무실 목록에 오지 않는다(admin_office_parcels 가 뺀다) — 그 값이 오면 꼴이 다른 줄로 버린다.
export const PARCEL_STATES = BOX_STATES.filter((s): s is Exclude<BoxState, "missing"> => s !== "missing");
export type ParcelState = Exclude<BoxState, "missing">;

export const NEXT_STEPS = [
  "wait_waybill",
  "scan_inbound",
  "confirm_label",
  "inspect",
  "print_label",
  "wait_approval",
  "wait_difference",
  "wait_accept",
  "wait_expiry",
  "held",
  // 보류(inbound-address-code INV-C5·C8): 같은 6자리·같은 송장번호 분쟁이거나 주인이 「제가 보낸 게 아니에요」를 눌러 출고를 멈춘 상자
  "on_hold",
  "print_return",
  "confirm_return",
  "confirm_shipment",
  "done",
] as const;
export type NextStep = (typeof NEXT_STEPS)[number];

export const PARCEL_TIERS = ["small", "medium", "large", "oversize"] as const;
export type OfficeTier = (typeof PARCEL_TIERS)[number];

export type OfficeParcel = {
  qr: string | null;
  kind: ParcelKind;
  orderNo: string;
  senderNickname: string;
  receiverName: string;
  tier: OfficeTier;
  state: ParcelState;
  receivedAt: string | null;
  nextStep: NextStep;
};

/** QR 로 불러온 한 상자. 봉투 번호 = 내부 QR 번호(INV-W8). */
export type ParcelDetail = Omit<OfficeParcel, "qr" | "receivedAt"> & {
  qr: string;
  envelopeNo: string;
  outboundWaybillNo: string | null;
  returnWaybillNo: string | null;
};

const common = {
  kind: z.enum(PARCEL_KINDS),
  order_no: z.string(),
  sender_nickname: z.string(),
  receiver_name: z.string(),
  tier: z.enum(PARCEL_TIERS),
  state: z.enum(PARCEL_STATES),
  next_step: z.enum(NEXT_STEPS),
};

const listRow = z.object({ ...common, qr: z.string().nullable(), received_at: z.string().nullable() });
const detailRow = z.object({
  ...common,
  qr: z.string().regex(QR_PATTERN),
  envelope_no: z.string(),
  outbound_waybill_no: z.string().nullable(),
  return_waybill_no: z.string().nullable(),
});

export function officeParcelsFromRows(rows: unknown): OfficeParcel[] | null {
  const parsed = z.array(listRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    qr: r.qr,
    kind: r.kind,
    orderNo: r.order_no,
    senderNickname: r.sender_nickname,
    receiverName: r.receiver_name,
    tier: r.tier,
    state: r.state,
    receivedAt: r.received_at,
    nextStep: r.next_step,
  }));
}

/** office_parcel_by_qr 의 답 — 한 줄짜리 배열이든 객체 하나든 받는다. 0줄·여러 줄·꼴이 다르면 null. */
export function parcelDetailFromData(data: unknown): ParcelDetail | null {
  const one = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  const parsed = detailRow.safeParse(one);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    qr: r.qr,
    kind: r.kind,
    orderNo: r.order_no,
    senderNickname: r.sender_nickname,
    receiverName: r.receiver_name,
    tier: r.tier,
    state: r.state,
    nextStep: r.next_step,
    envelopeNo: r.envelope_no,
    outboundWaybillNo: r.outbound_waybill_no,
    returnWaybillNo: r.return_waybill_no,
  };
}

export type ParcelTab = "inbound" | "inspect" | "outbound" | "shipped" | "return";

/** 「들어온 상자」 목록의 탭. 승인·받기를 기다리는 검수 완료 상자도 출고 대기에 둔다(INV-W3 S3c — 출고 화면에서만 막힌다). */
export function parcelTabOf(state: ParcelState): ParcelTab {
  switch (state) {
    case "no_waybill":
    case "awaiting":
      return "inbound";
    case "received":
    case "labeled":
    // 크리에이터 확인 대기 — 검수 결론이 아직 나지 않았다(2026-10-12 (2) D3 ②). 받으면 출고 대기, 돌려보내면 반송으로 옮긴다
    case "held":
      return "inspect";
    case "inspected":
    case "label_printed":
      return "outbound";
    case "shipped":
      return "shipped";
    case "return_waiting":
    case "return_printed":
    case "returned":
      return "return";
  }
}

const detailReply = z.object({
  qr: z.string().regex(QR_PATTERN),
  kind: z.enum(PARCEL_KINDS),
  orderNo: z.string(),
  senderNickname: z.string(),
  receiverName: z.string(),
  tier: z.enum(PARCEL_TIERS),
  state: z.enum(PARCEL_STATES),
  nextStep: z.enum(NEXT_STEPS),
  envelopeNo: z.string(),
  outboundWaybillNo: z.string().nullable(),
  returnWaybillNo: z.string().nullable(),
});

/** 브라우저 쪽: 서버 응답(JSON)의 상자를 다시 확인한다. 꼴이 다르면 null. */
export function parcelDetailFromReply(value: unknown): ParcelDetail | null {
  const parsed = detailReply.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 브라우저 쪽: 「QR 로 불러오기」 응답 몸통({ parcel })의 상자. */
export function parcelFromLookupBody(body: unknown): ParcelDetail | null {
  return parcelDetailFromReply(typeof body === "object" && body !== null ? (body as { parcel?: unknown }).parcel : null);
}
