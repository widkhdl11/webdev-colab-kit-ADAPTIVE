// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftScope } from "@/shared/lib/form-draft/use-form-draft";

// 주문 취소 양식에 붙인 임시 저장 (docs/specs/session-login.md INV-L20 — [닫기]·[취소]로 버리면 지운다).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { OrderCancelForm } from "./order-cancel-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = "00000000-0000-4000-a000-0000000000a1";
const DAY = 24 * 60 * 60 * 1000;
const FIELD = "cancel-test";

let host: HTMLDivElement;
let root: Root | null = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <DraftScope userId={OWNER} maxAgeMs={DAY}>
        <OrderCancelForm
          fieldId={FIELD}
          title="주문 취소"
          hint="안내"
          openLabel="주문 취소하기"
          reasonPlaceholder="사유"
          submitLabel="취소 처리"
          doneText={(no) => `${no} 취소`}
          send={vi.fn()}
        />
      </DraftScope>,
    );
  });
}
function unmount() {
  act(() => root?.unmount());
  host.remove();
  root = null;
}
const buttonNamed = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
const orderNo = () => host.querySelector<HTMLInputElement>(`#${FIELD}-no`)!;
const reason = () => host.querySelector<HTMLInputElement>(`#${FIELD}-reason`)!;
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function openAndFill() {
  act(() => buttonNamed("주문 취소하기").click());
  type(orderNo(), "FC-7K3M9");
  type(reason(), "크리에이터 요청");
  act(() => vi.advanceTimersByTime(1000));
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  if (root) unmount();
  vi.useRealTimers();
});

describe("주문 취소 양식 임시 저장 (INV-L20)", () => {
  it("INV-L20 (S18): 적던 중 화면을 떠났다가 같은 계정으로 다시 열면 주문번호·사유가 돌아온다", () => {
    mount();
    openAndFill();
    unmount();
    mount();
    act(() => buttonNamed("주문 취소하기").click());
    expect(orderNo().value).toBe("FC-7K3M9");
    expect(reason().value).toBe("크리에이터 요청");
  });

  it("INV-L20 (S18b): [닫기]로 버리면 다시 열 때 비어 있다 — 화면을 새로 열어도", () => {
    mount();
    openAndFill();
    act(() => buttonNamed("닫기").click());
    act(() => buttonNamed("주문 취소하기").click());
    expect(orderNo().value).toBe("");
    expect(reason().value).toBe("");
    unmount();
    mount();
    act(() => buttonNamed("주문 취소하기").click());
    expect(orderNo().value).toBe("");
  });
});
