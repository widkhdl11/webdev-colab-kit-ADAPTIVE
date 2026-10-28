import type { AdminInquiry } from "@/entities/inquiry/model/admin-inquiry";
import type { ExpiryDue, RevgiftShare, UnmatchedParcel } from "@/entities/parcel/model/office-lists";
import { parcelTabOf, type OfficeParcel, type ParcelTab } from "@/entities/parcel/model/office-parcel";
import type { PaymentRow, RefundStatus } from "@/entities/payment/model/payment-rows";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";

// 관리자 첫 화면의 숫자 칸 (docs/ux/pages/admin.md). 새 DB 함수 없이, 이미 있는 운영자 전용 목록을 센다.
// 목록 하나를 읽지 못하면 그 목록으로 세는 칸만 「불러오지 못했습니다」— 다른 칸은 그대로 보인다.

/** 관리자 목록 함수(상자·보류 상자·문의·결제·역조공·자동 처리)가 한 번에 주는 최대 줄 수. 이만큼 오면 숫자가 잘렸을 수 있다. */
export const ADMIN_LIST_LIMIT = 500;
const REVGIFT_SOON_MS = 48 * 60 * 60 * 1000;

export type Loaded<T> = { ok: true; value: T } | { ok: false };

export type DashboardSources = {
  parcels: Loaded<OfficeParcel[]>;
  held: Loaded<UnmatchedParcel[]>;
  inquiries: Loaded<AdminInquiry[]>;
  payments: Loaded<PaymentRow[]>;
  shares: Loaded<RevgiftShare[]>;
  expiry: Loaded<ExpiryDue[]>;
};

/** capped: 목록이 한도만큼 와서 잘렸을 수 있다 — count 는 「적어도 이만큼」이다 */
export type TileValue = { kind: "count"; count: number; capped: boolean } | { kind: "failed" };

export type DashboardTile = {
  key: "inbound" | "inspect" | "outbound" | "held" | "inquiries" | "refunds" | "revgifts" | "expiry";
  label: string;
  href: string;
  value: TileValue;
  foot: string;
  /** 1건 이상이면 눈에 띄게 그리는 칸(보류 상자·답 안 한 문의·역조공 기한 임박) */
  hot: boolean;
};

const REFUND_WAITING: readonly RefundStatus[] = ["due", "failed"];
const WATCH: ReadonlySet<DashboardTile["key"]> = new Set(["held", "inquiries", "revgifts"]);

function count<T>(src: Loaded<T[]>, pick: (row: T) => boolean): TileValue {
  if (!src.ok) return { kind: "failed" };
  return { kind: "count", count: src.value.filter(pick).length, capped: src.value.length >= ADMIN_LIST_LIMIT };
}

function oldestOpenInquiry(src: Loaded<AdminInquiry[]>): string {
  if (!src.ok) return "";
  const open = src.value.filter((q) => q.status === "open").map((q) => q.createdAt).sort();
  return open[0] ? `가장 오래된 문의 ${formatMonthDayKo(open[0])}` : "답할 문의 없음";
}

export function buildDashboardTiles(s: DashboardSources, nowIso: string): DashboardTile[] {
  const now = Date.parse(nowIso);
  // 상자 묶음은 「들어온 상자」 탭과 같은 기준(parcelTabOf) — 두 화면의 숫자가 어긋나지 않게
  const parcelCount = (tab: ParcelTab) => count(s.parcels, (p) => parcelTabOf(p.state) === tab);
  const soon = (r: RevgiftShare) => {
    const left = Date.parse(r.deadlineAt) - now;
    return r.reply === "waiting" && left >= 0 && left <= REVGIFT_SOON_MS;
  };

  const tiles: Omit<DashboardTile, "hot">[] = [
    { key: "inbound", label: "입고 대기", href: "/admin/work/inbound", value: parcelCount("inbound"), foot: "사무실 도착 전" },
    { key: "inspect", label: "검수 대기", href: "/admin/work/inspect", value: parcelCount("inspect"), foot: "입고 후 검수 전" },
    { key: "outbound", label: "출고 대기", href: "/admin/work/outbound", value: parcelCount("outbound"), foot: "검수 후 출고 확정 전" },
    {
      key: "held",
      label: "보류 상자",
      href: "/admin/unmatched",
      value: count(s.held, (h) => h.source === "unmatched" && (h.state === "waiting" || h.state === "on_hold")),
      foot: "주문을 찾지 못한 상자",
    },
    { key: "inquiries", label: "답 안 한 문의", href: "/admin/inquiries", value: count(s.inquiries, (q) => q.status === "open"), foot: oldestOpenInquiry(s.inquiries) },
    { key: "refunds", label: "환불 대기", href: "/admin/payments", value: count(s.payments, (p) => REFUND_WAITING.includes(p.refund.status)), foot: "환불 대기·환불 실패" },
    { key: "revgifts", label: "역조공 기한 임박", href: "/admin/revgifts", value: count(s.shares, soon), foot: "받기 기한 48시간 안" },
    { key: "expiry", label: "자동 처리 대기", href: "/admin/automation", value: count(s.expiry, () => true), foot: "기한이 지난 건" },
  ];
  // 읽지 못한 칸은 설명 줄을 비운다 — 숫자가 없는데 「사무실 도착 전」 같은 설명만 남지 않게
  return tiles.map((t) => ({
    ...t,
    foot: t.value.kind === "failed" ? "" : t.foot,
    hot: WATCH.has(t.key) && t.value.kind === "count" && t.value.count > 0,
  }));
}
