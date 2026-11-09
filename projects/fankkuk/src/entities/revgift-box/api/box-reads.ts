import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  applicationStatusSchema,
  BOX_VIEWERS,
  boxStatusSchema,
  FAN_BOX_STATES,
  type ApplicationStatus,
  type BoxStatus,
  type BoxViewer,
  type FanBoxState,
} from "../model/box-status";
import { CHOSEN_TIERS, INVOICE_TIERS, SURCHARGE_REGIONS, type ChosenTier, type InvoiceTier, type SurchargeRegion } from "../model/box-tiers";

// 선물함 읽기 (revgift-box INV-GB7·GB9). 누구의 것인지는 DB 읽기 함수가 로그인 토큰으로 정한다 — 주인이 아니면 null.
// 크리에이터에게 보이는 팬 정보는 닉네임·신청 시각·상태뿐이다(INV-GB9). 그 밖의 칸이 섞이면 받지 않는다(strict) —
// DB 가 실수로 칸을 더해도 화면까지 오지 않는다.

type Rpc = Pick<SupabaseClient, "rpc">;

const uuid = z.string().uuid();
/** 서울 날짜 YYYY-MM-DD — 시각이 섞여 오면 받지 않는다 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type MyBoxRow = { id: string; name: string; capacity: number; isPublic: boolean; status: BoxStatus; createdAt: string; activeCount: number };
export type BoxApplication = { id: string; nickname: string; appliedAt: string; status: ApplicationStatus; chosenTier: ChosenTier | null };
/** 명세서 줄 — 크리에이터에게 보이는 것은 닉네임·구간·택배비·할증 구분·할증·서비스료·금액뿐(INV-GB9·GB13) */
/** 줄 진행(4부) — 결제 전 · 결제됨(발송 준비) · 출고 · 출고 전에 끝남(환불 대상) · 환불됨 */
export const LINE_PROGRESS = ["unpaid", "paid", "shipped", "ended", "refunded"] as const;
export type LineProgress = (typeof LINE_PROGRESS)[number];
export type InvoiceLine = {
  nickname: string;
  tier: InvoiceTier;
  shippingFeeKrw: number;
  surchargeRegion: SurchargeRegion;
  surchargeKrw: number;
  serviceFeeKrw: number;
  amountKrw: number;
  progress: LineProgress;
  /** 배송 단계 재료(delivery-status INV-DS1·DS2) — 송장 출력 여부 · 출고한 서울 날짜 · 팬의 받았어요. 송장번호는 없다(INV-DS3) */
  delivery: { printed: boolean; shippedOn: string | null; received: boolean };
};
export type BoxInvoice = {
  amountKrw: number;
  shippingFeeKrw: number;
  serviceFeeKrw: number;
  cartonCodKrw: number;
  createdAt: string;
  /** 결제 기한(명세서 발행 + 72시간, INV-GB18) · 착불 반송 시각(+ 168시간, INV-GB19) */
  payDueAt: string;
  returnAt: string;
  /** 결제사 승인을 기다리는 결제가 있다 — 결제 버튼 대신 「확인 중」 */
  paying: boolean;
  paidAt: string | null;
  lines: InvoiceLine[];
};
export type MyBox = {
  id: string;
  name: string;
  capacity: number;
  isPublic: boolean;
  status: BoxStatus;
  inviteToken: string | null;
  createdAt: string;
  /** 사무실 주소 6자리 — 상자 보내 주세요·도착·확인 필요일 때만(INV-GB10) */
  inboundCode: string | null;
  cartonCount: number | null;
  cartonsReceived: number;
  applications: BoxApplication[];
  invoice: BoxInvoice | null;
};
/** 팬의 내 배송 — 송장을 출력했거나 출고된 내 신청일 때만. 송장번호는 없다(delivery-status INV-DS3). canConfirm = 출고됐고 아직 받았어요 전 */
export type FanBoxDelivery = { shippedOn: string | null; received: boolean; canConfirm: boolean };
export type FanBox = {
  id: string;
  name: string;
  creator: { id: string; slug: string; name: string };
  open: boolean;
  viewer: BoxViewer;
  myState: FanBoxState;
  delivery: FanBoxDelivery | null;
};
export type CreatorOpenBox = { id: string; name: string };

const myBoxRow = z
  .object({
    id: uuid,
    name: z.string(),
    capacity: z.number().int(),
    is_public: z.boolean(),
    status: boxStatusSchema,
    created_at: z.string(),
    active_count: z.number().int(),
  })
  .strict();

const applicationRow = z
  .object({ id: uuid, nickname: z.string(), applied_at: z.string(), status: applicationStatusSchema, chosen_tier: z.enum(CHOSEN_TIERS).nullable() })
  .strict();

const invoiceLineRow = z
  .object({
    nickname: z.string(),
    tier: z.enum(INVOICE_TIERS),
    shipping_fee_krw: z.number().int(),
    surcharge_region: z.enum(SURCHARGE_REGIONS),
    surcharge_krw: z.number().int(),
    service_fee_krw: z.number().int(),
    amount_krw: z.number().int(),
    progress: z.enum(LINE_PROGRESS),
    printed: z.boolean(),
    shipped_on: day.nullable(),
    received: z.boolean(),
  })
  .strict();
const invoiceRow = z
  .object({
    amount_krw: z.number().int(),
    shipping_fee_krw: z.number().int(),
    service_fee_krw: z.number().int(),
    carton_cod_krw: z.number().int(),
    created_at: z.string(),
    pay_due_at: z.string(),
    return_at: z.string(),
    paying: z.boolean(),
    paid_at: z.string().nullable(),
    lines: z.array(invoiceLineRow),
  })
  .strict();

const myBoxSchema = z
  .object({
    id: uuid,
    name: z.string(),
    capacity: z.number().int(),
    is_public: z.boolean(),
    status: boxStatusSchema,
    invite_token: z.string().nullable(),
    created_at: z.string(),
    inbound_code: z.string().regex(/^[0-9A-Z]{6}$/).nullable(),
    carton_count: z.number().int().nullable(),
    cartons_received: z.number().int(),
    applications: z.array(applicationRow),
    invoice: invoiceRow.nullable(),
  })
  .strict();

const fanBoxSchema = z
  .object({
    id: uuid,
    name: z.string(),
    creator: z.object({ id: uuid, slug: z.string(), name: z.string() }).strict(),
    open: z.boolean(),
    viewer: z.enum(BOX_VIEWERS),
    my_state: z.enum(FAN_BOX_STATES),
    delivery: z.object({ shipped_on: day.nullable(), received: z.boolean(), can_confirm: z.boolean() }).strict().nullable(),
  })
  .strict();

const openBoxRow = z.object({ id: uuid, name: z.string() }).strict();

export async function readMyBoxes(client: Rpc): Promise<MyBoxRow[]> {
  const { data, error } = await client.rpc("my_revgift_boxes");
  if (error) throw new Error(`선물함 목록을 읽지 못했다: ${error.code}`);
  return z
    .array(myBoxRow)
    .parse(data)
    .map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, isPublic: r.is_public, status: r.status, createdAt: r.created_at, activeCount: r.active_count }));
}

/** 신청 관리 창 — 주인 본인의 선물함 하나. 없거나 주인이 아니면 null */
export async function readMyBox(client: Rpc, boxId: string): Promise<MyBox | null> {
  if (!uuid.safeParse(boxId).success) return null;
  const { data, error } = await client.rpc("my_revgift_box", { p_box_id: boxId });
  if (error) throw new Error(`선물함을 읽지 못했다: ${error.code}`);
  if (data === null) return null;
  const b = myBoxSchema.parse(data);
  return {
    id: b.id,
    name: b.name,
    capacity: b.capacity,
    isPublic: b.is_public,
    status: b.status,
    inviteToken: b.invite_token,
    createdAt: b.created_at,
    inboundCode: b.inbound_code,
    cartonCount: b.carton_count,
    cartonsReceived: b.cartons_received,
    applications: b.applications.map((a) => ({ id: a.id, nickname: a.nickname, appliedAt: a.applied_at, status: a.status, chosenTier: a.chosen_tier })),
    invoice: b.invoice
      ? {
          amountKrw: b.invoice.amount_krw,
          shippingFeeKrw: b.invoice.shipping_fee_krw,
          serviceFeeKrw: b.invoice.service_fee_krw,
          cartonCodKrw: b.invoice.carton_cod_krw,
          createdAt: b.invoice.created_at,
          payDueAt: b.invoice.pay_due_at,
          returnAt: b.invoice.return_at,
          paying: b.invoice.paying,
          paidAt: b.invoice.paid_at,
          lines: b.invoice.lines.map((l) => ({
            nickname: l.nickname,
            tier: l.tier,
            shippingFeeKrw: l.shipping_fee_krw,
            surchargeRegion: l.surcharge_region,
            surchargeKrw: l.surcharge_krw,
            serviceFeeKrw: l.service_fee_krw,
            amountKrw: l.amount_krw,
            progress: l.progress,
            delivery: { printed: l.printed, shippedOn: l.shipped_on, received: l.received },
          })),
        }
      : null,
  };
}

// ── 3부: 번호 라벨 · 처리할 일 카드 · 예상 금액 요금 (INV-GB9·GB10·GB12·GB13·GB23) ──

export type BoxLabel = { nickname: string; barcode: string };
const labelRow = z.object({ nickname: z.string(), barcode: z.string().regex(/^GB[0-9]{8,12}$/) }).strict();

/** 번호 라벨 — 주인만, 상자 보내 주세요부터. 닉네임 + 바코드(신청 번호)뿐(INV-GB9) */
export async function readBoxLabels(client: Rpc, boxId: string): Promise<{ kind: "ok"; labels: BoxLabel[] } | { kind: "not_found" } | { kind: "not_yet" }> {
  if (!uuid.safeParse(boxId).success) return { kind: "not_found" };
  const { data, error } = await client.rpc("my_revgift_box_labels", { p_box_id: boxId });
  if (error?.code === "P0002") return { kind: "not_found" };
  if (error?.code === "P0022") return { kind: "not_yet" };
  if (error) throw new Error(`번호 라벨을 읽지 못했다: ${error.code}`);
  return { kind: "ok", labels: z.array(labelRow).parse(data) };
}

export type HoldCard = {
  kind: "hold";
  id: string;
  boxId: string;
  boxName: string;
  writtenNickname: string;
  createdAt: string;
  dueAt: string;
  candidates: { applicationId: string; nickname: string }[];
};
export type CancelledArrivalCard = { kind: "cancelled_arrival"; id: string; boxId: string; boxName: string; createdAt: string; dueAt: string };
export type BoxCard = HoldCard | CancelledArrivalCard;

const cardRow = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("hold"),
      id: uuid,
      box_id: uuid,
      box_name: z.string(),
      written_nickname: z.string(),
      created_at: z.string(),
      due_at: z.string(),
      candidates: z.array(z.object({ application_id: uuid, nickname: z.string() }).strict()),
    })
    .strict(),
  z.object({ kind: z.literal("cancelled_arrival"), id: uuid, box_id: uuid, box_name: z.string(), created_at: z.string(), due_at: z.string() }).strict(),
]);

/** 처리할 일 카드 — 확인 필요(INV-GB12)·취소한 선물함 상자(INV-GB23). 주인 본인 것만 */
export async function readBoxCards(client: Rpc): Promise<BoxCard[]> {
  const { data, error } = await client.rpc("my_revgift_box_cards");
  if (error) throw new Error(`선물함 카드를 읽지 못했다: ${error.code}`);
  return z
    .array(cardRow)
    .parse(data)
    .map(
      (c): BoxCard =>
        c.kind === "hold"
          ? {
              kind: "hold",
              id: c.id,
              boxId: c.box_id,
              boxName: c.box_name,
              writtenNickname: c.written_nickname,
              createdAt: c.created_at,
              dueAt: c.due_at,
              candidates: c.candidates.map((x) => ({ applicationId: x.application_id, nickname: x.nickname })),
            }
          : { kind: "cancelled_arrival", id: c.id, boxId: c.box_id, boxName: c.box_name, createdAt: c.created_at, dueAt: c.due_at },
    );
}

export type PriceTable = { fees: Record<ChosenTier, number>; serviceFeeKrw: number; earlyFeeKrw: number; earlyLeft: number };
const priceRow = z
  .object({
    fees: z.object({ xsmall: z.number().int(), small: z.number().int(), medium: z.number().int(), large: z.number().int() }).strict(),
    service_fee_krw: z.number().int(),
    early_fee_krw: z.number().int(),
    early_left: z.number().int(),
  })
  .strict();

/** 2페이지 예상 금액용 요금(표시일 뿐, 명세서는 실측 뒤 서버가 계산 — INV-GB13). 크리에이터가 아니면 null */
export async function readPriceTable(client: Rpc): Promise<PriceTable | null> {
  const { data, error } = await client.rpc("revgift_box_price_table");
  if (error) throw new Error(`요금을 읽지 못했다: ${error.code}`);
  if (data === null) return null;
  const p = priceRow.parse(data);
  return { fees: p.fees, serviceFeeKrw: p.service_fee_krw, earlyFeeKrw: p.early_fee_krw, earlyLeft: Math.max(0, p.early_left) };
}


/** 팬이 보는 선물함 하나 — 비공개는 맞는 초대 토큰이 있어야 하고, 아니면 없는 선물함과 같이 null(INV-GB4) */
export async function readBoxForFan(client: Rpc, boxId: string, token: string | null): Promise<FanBox | null> {
  if (!uuid.safeParse(boxId).success) return null;
  const { data, error } = await client.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: token });
  if (error) throw new Error(`선물함을 읽지 못했다: ${error.code}`);
  if (data === null) return null;
  const b = fanBoxSchema.parse(data);
  const delivery = b.delivery ? { shippedOn: b.delivery.shipped_on, received: b.delivery.received, canConfirm: b.delivery.can_confirm } : null;
  return { id: b.id, name: b.name, creator: b.creator, open: b.open, viewer: b.viewer, myState: b.my_state, delivery };
}

/** 크리에이터 상세의 입구 — 그 크리에이터의 공개·신청 받는 중인 선물함 */
export async function readCreatorOpenBoxes(client: Rpc, creatorId: string): Promise<CreatorOpenBox[]> {
  const { data, error } = await client.rpc("creator_open_revgift_boxes", { p_creator_id: creatorId });
  if (error) throw new Error(`선물함 입구를 읽지 못했다: ${error.code}`);
  return z.array(openBoxRow).parse(data);
}
