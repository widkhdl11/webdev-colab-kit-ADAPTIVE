// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceTable } from "@/entities/payment/model/price-table";
import { DraftScope } from "@/shared/lib/form-draft/use-form-draft";
import { formatWon } from "../model/price-input";

// 요금표에 붙인 임시 저장 (docs/specs/session-login.md INV-L20 — 서버 값을 고치는 폼).
// 고치던 요금표를 다시 열 때 그사이 서버 요금표가 바뀌었으면 옛 입력으로 덮지 않는다. 서버 호출만 가짜로 둔다.
vi.mock("../api/post-pricing-client", () => ({ postPricing: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { PricingForm } from "./pricing-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = "00000000-0000-4000-a000-0000000000a1";
const DAY = 24 * 60 * 60 * 1000;

/** 시험용 표 — 값 자체는 상관없고, 두 표가 서로 다르기만 하면 된다 */
function tableWith(smallPrice: number): PriceTable {
  return {
    small: { priceKrw: smallPrice, carrierCostKrw: 3000, inspectionFeeKrw: 500 },
    medium: { priceKrw: smallPrice + 2000, carrierCostKrw: 4000, inspectionFeeKrw: 500 },
    large: { priceKrw: smallPrice + 4000, carrierCostKrw: 5000, inspectionFeeKrw: 500 },
  };
}
const SAVED_TABLE = tableWith(5000);
const CHANGED_TABLE = tableWith(5200);

let host: HTMLDivElement;
let root: Root | null = null;

function mount(table: PriceTable) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <DraftScope userId={OWNER} maxAgeMs={DAY}>
        <PricingForm table={table} editable />
      </DraftScope>,
    );
  });
}
function unmount() {
  act(() => root?.unmount());
  host.remove();
  root = null;
}
const smallPrice = () => host.querySelector<HTMLInputElement>("#price-small-priceKrw")!;
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function editAndLeave() {
  mount(SAVED_TABLE);
  type(smallPrice(), "5900");
  act(() => vi.advanceTimersByTime(1000));
  unmount();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  if (root) unmount();
  vi.useRealTimers();
});

describe("요금표 임시 저장 (INV-L20)", () => {
  it("INV-L20 (S18): 서버 요금표가 그대로면 다시 열 때 고치던 값이 돌아온다", () => {
    editAndLeave();
    mount(SAVED_TABLE);
    expect(smallPrice().value).toBe("5900");
  });

  it("INV-L20 (실패경로): 그사이 서버 요금표가 바뀌었으면 고치던 값으로 덮지 않고 지금 서버 값을 보인다", () => {
    editAndLeave();
    mount(CHANGED_TABLE);
    expect(smallPrice().value).toBe(formatWon(CHANGED_TABLE.small.priceKrw));
    expect(Object.keys(localStorage).filter((k) => k.startsWith("fk-draft:"))).toEqual([]);
  });
});
