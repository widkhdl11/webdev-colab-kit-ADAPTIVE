import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { parseFanGiftRows } from "@/entities/order/api/fan-gift-rows";
import { GiftStatusPage } from "./gift-status-page";

// 선물 상세의 「나만 보는 메모」(together INV-F7, 시안 v21-addendum3/fan-gift-status.html) — 보낸 사람 본인 화면에만 온다.

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

const [view] = parseFanGiftRows(
  [
    {
      order_no: "FC-W5N3T",
      creator_name: "하루",
      item_kind: "인형·굿즈",
      box_count: 1,
      has_electronics_or_metal: false,
      status: "registered",
      registered_at: "2026-10-12T02:00:00+00:00",
      approved_at: null,
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

function render(memo: { title: string | null; body: string | null } | null) {
  act(() => root.render(<GiftStatusPage view={view!} boxes={[]} memo={memo} />));
}

describe("together INV-F7: 선물 상세의 나만 보는 메모", () => {
  it("INV-F7 S7: 선물 이름과 내용(줄바꿈 그대로)이 「나만 보는 메모」 덩어리로 나온다", () => {
    render({ title: "생일 편지와 인형", body: "첫 줄\n둘째 줄\n셋째 줄" });
    const memo = host.querySelector('[aria-labelledby="gift-memo-title"]');
    expect(memo?.querySelector("#gift-memo-title")?.textContent).toBe("생일 편지와 인형");
    expect(memo?.textContent).toContain("나만 보는 메모");
    expect(memo?.textContent).toContain("첫 줄\n둘째 줄\n셋째 줄");
  });

  it("INV-F7: 이름만 있으면 내용 칸을 그리지 않고, 내용만 있으면 이름 줄을 그리지 않는다", () => {
    render({ title: "이름만", body: null });
    expect(host.textContent).toContain("이름만");
    expect(host.textContent).not.toContain("나만 보는 메모");
    act(() => root.render(<GiftStatusPage view={view!} boxes={[]} memo={{ title: null, body: "내용만" }} />));
    expect(host.textContent).toContain("내용만");
    expect(host.textContent).not.toContain("선물 이름");
  });

  it("INV-F8 (실패경로): 메모가 없으면(남의 주문·안 적음) 메모 덩어리를 그리지 않는다", () => {
    render(null);
    expect(host.querySelector('[aria-labelledby="gift-memo-title"]')).toBeNull();
    expect(host.textContent).not.toContain("나만 보는 메모");
    expect(host.textContent).not.toContain("선물 이름");
  });
});
