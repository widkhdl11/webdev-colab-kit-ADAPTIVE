import { describe, expect, it } from "vitest";
import type { OfficeParcel } from "@/entities/parcel/model/office-parcel";
import type { ExpiryDue, RevgiftShare, UnmatchedParcel } from "@/entities/parcel/model/office-lists";
import type { AdminInquiry } from "@/entities/inquiry/model/admin-inquiry";
import type { PaymentRow } from "@/entities/payment/model/payment-rows";
import { ADMIN_LIST_LIMIT, buildDashboardTiles, type DashboardSources, type Loaded } from "./dashboard-tiles";

// 관리자 첫 화면의 숫자 칸 (docs/ux/pages/admin.md). 이미 있는 운영자 전용 목록을 센다.

const NOW = "2026-10-28T03:00:00.000Z";
const ok = <T>(value: T): Loaded<T> => ({ ok: true, value });
const failed = { ok: false } as const;

const parcel = (state: OfficeParcel["state"]) => ({ state }) as OfficeParcel;
const held = (source: UnmatchedParcel["source"], state: UnmatchedParcel["state"]) => ({ source, state }) as UnmatchedParcel;
const inquiry = (status: AdminInquiry["status"], createdAt: string) => ({ status, createdAt }) as AdminInquiry;
const payment = (status: PaymentRow["refund"]["status"]) => ({ refund: { status, amountKrw: null, error: null } }) as PaymentRow;
const share = (reply: RevgiftShare["reply"], deadlineAt: string) => ({ reply, deadlineAt }) as RevgiftShare;
const due = () => ({}) as ExpiryDue;

const empty: DashboardSources = {
  parcels: ok([]),
  held: ok([]),
  inquiries: ok([]),
  payments: ok([]),
  shares: ok([]),
  expiry: ok([]),
};

const tile = (sources: DashboardSources, key: string) => {
  const t = buildDashboardTiles(sources, NOW).find((x) => x.key === key);
  if (!t) throw new Error(`칸 없음: ${key}`);
  return t;
};

describe("buildDashboardTiles", () => {
  it("칸 여덟 개가 늘 같은 순서로 나온다 — 0건이어도 숨기지 않는다", () => {
    const tiles = buildDashboardTiles(empty, NOW);
    expect(tiles.map((t) => t.key)).toEqual(["inbound", "inspect", "outbound", "held", "inquiries", "refunds", "revgifts", "expiry"]);
    expect(tiles.every((t) => t.value.kind === "count" && t.value.count === 0)).toBe(true);
    expect(tiles.map((t) => t.href)).toEqual([
      "/admin/work/inbound",
      "/admin/work/inspect",
      "/admin/work/outbound",
      "/admin/unmatched",
      "/admin/inquiries",
      "/admin/payments",
      "/admin/revgifts",
      "/admin/automation",
    ]);
  });

  it("상자는 「들어온 상자」 탭과 같은 기준으로 입고·검수·출고 대기를 나눠 센다", () => {
    const parcels = ok(
      (["awaiting", "no_waybill", "received", "labeled", "held", "inspected", "label_printed", "shipped", "returned", "return_waiting"] as const).map(parcel),
    );
    const s = { ...empty, parcels };
    expect(tile(s, "inbound").value).toEqual({ kind: "count", count: 2, capped: false });
    expect(tile(s, "inspect").value).toEqual({ kind: "count", count: 3, capped: false });
    expect(tile(s, "outbound").value).toEqual({ kind: "count", count: 2, capped: false });
  });

  it("목록이 한도만큼 오면 그 목록으로 세는 칸은 「적어도 이만큼」(capped) — 상자만이 아니라 모든 목록", () => {
    const full = ok(Array.from({ length: ADMIN_LIST_LIMIT }, () => parcel("shipped")));
    expect(tile({ ...empty, parcels: full }, "inbound").value).toEqual({ kind: "count", count: 0, capped: true });
    const under = ok(Array.from({ length: ADMIN_LIST_LIMIT - 1 }, () => parcel("awaiting")));
    expect(tile({ ...empty, parcels: under }, "inbound").value).toEqual({ kind: "count", count: ADMIN_LIST_LIMIT - 1, capped: false });
    const many = <T>(row: T) => ok(Array.from({ length: ADMIN_LIST_LIMIT }, () => row));
    const s: DashboardSources = {
      parcels: ok([]),
      held: many(held("unmatched", "waiting")),
      inquiries: many(inquiry("open", NOW)),
      payments: many(payment("done")),
      shares: many(share("accepted", NOW)),
      expiry: many(due()),
    };
    for (const key of ["held", "inquiries", "refunds", "revgifts", "expiry"]) {
      const v = tile(s, key).value;
      expect(v.kind === "count" && v.capped, key).toBe(true);
    }
  });

  it("보류 상자는 주문을 못 찾은 상자 중 끝나지 않은 것만 — 출고를 멈춘 상자·처리 끝난 것은 뺀다", () => {
    const s = { ...empty, held: ok([held("unmatched", "waiting"), held("unmatched", "on_hold"), held("unmatched", "matched"), held("unmatched", "expired"), held("parcel", "waiting")]) };
    expect(tile(s, "held").value).toEqual({ kind: "count", count: 2, capped: false });
  });

  it("답 안 한 문의는 open 만 세고, 가장 오래된 것의 날짜를 쓴다", () => {
    const s = {
      ...empty,
      inquiries: ok([inquiry("open", "2026-10-26T01:00:00.000Z"), inquiry("open", "2026-10-25T01:00:00.000Z"), inquiry("answered", "2026-10-01T01:00:00.000Z")]),
    };
    const t = tile(s, "inquiries");
    expect(t.value).toEqual({ kind: "count", count: 2, capped: false });
    expect(t.foot).toBe("가장 오래된 문의 10월 25일");
    expect(tile(empty, "inquiries").foot).toBe("답할 문의 없음");
  });

  it("환불 대기는 환불 대기·환불 실패를 센다", () => {
    const s = { ...empty, payments: ok((["due", "failed", "requesting", "done", "none"] as const).map(payment)) };
    expect(tile(s, "refunds").value).toEqual({ kind: "count", count: 2, capped: false });
  });

  it("역조공 기한 임박은 받기 대기이고 기한이 48시간 안인 것 — 이미 지난 것·48시간 넘게 남은 것은 뺀다", () => {
    const s = {
      ...empty,
      shares: ok([
        share("waiting", NOW), // 꼭 지금 — 아직 지나지 않았다
        share("waiting", "2026-10-29T03:00:00.000Z"), // 24시간 남음
        share("waiting", "2026-10-30T03:00:00.000Z"), // 꼭 48시간
        share("waiting", "2026-10-30T03:00:01.000Z"), // 48시간 넘음
        share("waiting", "2026-10-28T02:59:59.000Z"), // 이미 지남 — 자동 처리 대기 쪽
        share("accepted", "2026-10-29T03:00:00.000Z"),
      ]),
    };
    expect(tile(s, "revgifts").value).toEqual({ kind: "count", count: 3, capped: false });
  });

  it("자동 처리 대기는 기한이 지난 건 전부", () => {
    expect(tile({ ...empty, expiry: ok([due(), due(), due()]) }, "expiry").value).toEqual({ kind: "count", count: 3, capped: false });
  });

  it("실패경로: 읽지 못한 목록의 칸만 failed — 나머지 칸은 그대로", () => {
    const s = { ...empty, parcels: failed, inquiries: failed, payments: ok([payment("due")]) };
    const tiles = buildDashboardTiles(s, NOW);
    const failedKeys = tiles.filter((t) => t.value.kind === "failed").map((t) => t.key);
    expect(failedKeys).toEqual(["inbound", "inspect", "outbound", "inquiries"]);
    expect(tile(s, "refunds").value).toEqual({ kind: "count", count: 1, capped: false });
    // 읽지 못한 칸은 설명 줄이 없다 — 문의 칸만이 아니라 전부
    expect(tiles.filter((t) => t.value.kind === "failed").every((t) => t.foot === "")).toBe(true);
    expect(tile(s, "refunds").foot).toBe("환불 대기·환불 실패");
  });

  it("주의 칸(보류·문의·역조공)은 1건 이상일 때만 강조한다", () => {
    expect(buildDashboardTiles(empty, NOW).some((t) => t.hot)).toBe(false);
    const s = {
      ...empty,
      parcels: ok([parcel("awaiting")]),
      held: ok([held("unmatched", "waiting")]),
      inquiries: ok([inquiry("open", NOW)]),
      payments: ok([payment("due")]),
      shares: ok([share("waiting", NOW)]),
      expiry: ok([due()]),
    };
    expect(buildDashboardTiles(s, NOW).filter((t) => t.hot).map((t) => t.key)).toEqual(["held", "inquiries", "revgifts"]);
  });
});
