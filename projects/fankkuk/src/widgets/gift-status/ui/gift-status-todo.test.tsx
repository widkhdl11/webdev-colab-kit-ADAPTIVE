import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import type { GiftBox } from "@/entities/parcel/model/box-rows";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { GiftStatusPage } from "./gift-status-page";

// 선물 상세 아래쪽 두 구간과 맨 위 「지금 할 일」 칸의 나눔 (action-center INV-J13 — 처리는 「이 칸에서만」).
// 차액 결제 버튼은 칸에만 있고 아래 구간은 결제 확인 중·완료·닫힘 줄과 돌아온 뒤 안내만 보인다.
// 「받는 주소 없이 보냈어요」 구간은 할 일이 아닌(14일 전) 상자를 찾는 자리라 남고, 칸에 이미 있는 상자는 고를 목록에서 빠진다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ORDER = "FC-W5N3T";
const [view] = parseFanGiftRows(
  [
    {
      order_no: ORDER,
      creator_name: "하루",
      item_kind: "인형·굿즈",
      box_count: 2,
      has_electronics_or_metal: false,
      status: "registered",
      registered_at: "2026-10-01T02:00:00+00:00",
      approved_at: "2026-10-01T05:00:00+00:00",
      received_at: null,
      inspection_result: null,
      inspected_at: null,
      shipped_at: null,
      expected_arrival_date: null,
      delivery: null,
      fan_tracking_no: null,
      fan_send_ack_at: null,
    },
  ],
  "사무실 주소",
);

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const box = (boxId: string, seq: number): GiftBox => ({ boxId, label: `${ORDER}-${seq}`, tier: "small", waybillNo: null, state: "no_waybill", addressCode: null, sendAckNeeded: false });
const diff = (boxId: string, boxSeq: number, state: GiftDifference["state"]): GiftDifference => ({
  boxId,
  boxSeq,
  declaredTier: "small",
  measuredTier: "medium",
  amountKrw: 2000,
  dueAt: "2026-10-30T14:59:00+00:00",
  state,
});

function render(p: { differences?: GiftDifference[]; notice?: "paid" | "failed" | "in_progress" | "closed" | null; boxes?: GiftBox[]; todoBoxIds?: string[] }) {
  act(() =>
    root.render(
      <GiftStatusPage
        view={view!}
        boxes={p.boxes ?? []}
        memo={null}
        difference={{ differences: p.differences ?? [], notice: p.notice ?? null }}
        todoBoxIds={p.todoBoxIds ?? []}
      />,
    ),
  );
}

// 구간 제목은 h2, 접는 칸(받는 주소 없이 보냈다면 — design-rules 22절)은 summary
const section = (title: string) => [...host.querySelectorAll("main h2, main summary")].find((h) => h.textContent === title)?.closest("[data-sec]") ?? null;

describe("INV-J13: 차액 결제 버튼은 맨 위 칸에서만", () => {
  it("INV-J13 (실패경로): 결제가 필요한 줄은 아래 구간에서 결제할 수 없다 — 결제 완료 줄은 그대로 보인다", () => {
    render({ differences: [diff(B1, 1, "due"), diff(B2, 2, "paid")] });
    const sec = section("차액 결제");
    expect(sec).not.toBeNull();
    expect(sec?.querySelectorAll("button")).toHaveLength(0);
    expect(sec?.textContent).toContain("결제 완료");
    expect(sec?.textContent).not.toContain("결제 필요");
  });

  it("INV-J13: 보여 줄 줄이 결제가 필요한 줄뿐이면 구간을 그리지 않는다", () => {
    render({ differences: [diff(B1, 1, "due")] });
    expect(section("차액 결제")).toBeNull();
  });

  it("INV-J13: 결제 뒤 돌아온 안내는 줄이 없어도 남는다(결제를 마치지 못했어요)", () => {
    render({ differences: [diff(B1, 1, "due")], notice: "failed" });
    const sec = section("차액 결제");
    expect(sec?.textContent).toContain("차액 결제를 마치지 못했어요.");
    expect(sec?.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("INV-J13: 팬꾹 주소 없이 보냈어요 — 칸에 있는 상자는 아래에서 빠진다", () => {
  const options = () => [...(section("팬꾹 주소 없이 보냈다면")?.querySelectorAll("option") ?? [])].map((o) => o.textContent ?? "");

  it("INV-J13: 칸에 없는 상자는 아래에서 찾을 수 있다 — 칸에 있는 상자(도착이 늦어요)는 고를 목록에 없다", () => {
    render({ boxes: [box(B1, 1), box(B2, 2)], todoBoxIds: [B1] });
    const sec = section("팬꾹 주소 없이 보냈다면");
    expect(sec?.querySelector("form")).not.toBeNull();
    // 고를 상자가 하나면 고르는 칸 없이 그 상자로 정해질 수 있다 — 어느 쪽이든 칸의 상자 이름은 구간에 없다
    expect(sec?.textContent).not.toContain("상자 1 ·");
    expect(options().some((t) => t.startsWith("상자 1"))).toBe(false);
  });

  it("INV-J13: 칸에 아무 상자도 없으면 두 상자 모두 고를 수 있다", () => {
    render({ boxes: [box(B1, 1), box(B2, 2)], todoBoxIds: [] });
    const all = options().join(" ");
    expect(all).toContain("상자 1 · 소형");
    expect(all).toContain("상자 2 · 소형");
  });

  it("INV-J13 (실패경로): 고를 상자가 모두 칸에 있으면 아래 구간을 그리지 않는다 — 같은 상자를 두 곳에서 찾지 않는다", () => {
    render({ boxes: [box(B1, 1)], todoBoxIds: [B1] });
    expect(section("팬꾹 주소 없이 보냈다면")).toBeNull();
  });
});

describe("INV-J13: 찾은 뒤 다시 읽어도 결과 안내가 남는다", () => {
  it("INV-J13: 처음에 보인 찾기 구간은 다시 읽어 고를 상자가 칸의 상자만 남아도 사라지지 않는다(결과 안내 자리)", () => {
    render({ boxes: [box(B1, 1), box(B2, 2)], todoBoxIds: [B1] });
    expect(section("팬꾹 주소 없이 보냈다면")).not.toBeNull();
    // B2 를 찾아 입고 → 다시 읽으면 고를 상자는 칸의 B1 뿐
    render({ boxes: [box(B1, 1), { ...box(B2, 2), state: "received" as GiftBox["state"] }], todoBoxIds: [B1] });
    expect(section("팬꾹 주소 없이 보냈다면")).not.toBeNull();
  });
});
