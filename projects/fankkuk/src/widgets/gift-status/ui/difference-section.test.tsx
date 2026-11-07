import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { DifferenceSection } from "./difference-section";

// 선물 상세의 차액 줄 — 개인접수 상자는 실측 크기 자리에 구간 이름(「대형」) 대신 「개인접수」(payment INV-M23 ④).

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

const row = (over: Partial<GiftDifference>): GiftDifference => ({
  boxId: "3f1c2a4e-8b7d-4c6a-9e5f-1a2b3c4d5e6f",
  boxSeq: 1,
  declaredTier: "small",
  measuredTier: "medium",
  amountKrw: 2000,
  dueAt: null,
  state: "paid",
  ...over,
});

const notes = () => [...host.querySelectorAll("p")].map((p) => p.textContent).filter((t) => t?.startsWith("선택한 크기"));

describe("payment INV-M23 ④: 차액 줄의 실측 크기", () => {
  it("개인접수 상자는 「개인접수」, 그 밖은 구간 이름", () => {
    act(() =>
      root.render(
        <DifferenceSection
          notice={null}
          differences={[row({ measuredTier: "personal_intake", amountKrw: 11500 }), row({ boxId: "4f1c2a4e-8b7d-4c6a-9e5f-1a2b3c4d5e6f", boxSeq: 2 })]}
        />,
      ),
    );
    expect(notes()).toEqual(["선택한 크기 소형 → 개인접수", "선택한 크기 소형 → 실측 크기 중형"]);
  });
});
