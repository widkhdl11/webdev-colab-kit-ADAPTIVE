import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 대표의 크리에이터 사정 취소 양식 (payment INV-M21). 서버 호출(postCreatorCancel)만 가짜로 둔다 — 시험 대상은 화면이 무엇을 막고 무엇을 보내는지다.
const api = vi.hoisted(() => ({ postCreatorCancel: vi.fn() }));
vi.mock("../api/post-creator-cancel-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { CreatorCancelForm } from "./creator-cancel-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (name: string) => {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`버튼 없음: ${name}`);
  return found;
};
const click = async (name: string) => {
  await act(async () => {
    button(name).click();
  });
};
function type(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("크리에이터 사정 취소 양식 (INV-M21)", () => {
  it("INV-M21: 제목은 「크리에이터 사정 취소」, 주문번호·사유를 적어 보내면 대문자 주문번호와 사유를 보낸다", async () => {
    act(() => root.render(<CreatorCancelForm />));
    expect(host.querySelector("h2")?.textContent).toBe("크리에이터 사정 취소");
    await click("크리에이터 사정 취소하기");
    type("#creator-cancel-no", "fc-7k3m9");
    type("#creator-cancel-reason", "1:1 문의로 탈퇴 요청");
    api.postCreatorCancel.mockResolvedValueOnce({ kind: "ok", body: { ok: true } });
    await click("크리에이터 사정으로 취소");
    expect(api.postCreatorCancel).toHaveBeenCalledWith({ orderNo: "FC-7K3M9", reason: "1:1 문의로 탈퇴 요청" });
    expect(host.textContent).toContain("FC-7K3M9 선물을 취소했어요.");
  });

  it("INV-M21 (실패경로): 사유가 비면 보내지 않고 사유 안내 · 서버 거절 문장은 그대로 보인다", async () => {
    act(() => root.render(<CreatorCancelForm />));
    await click("크리에이터 사정 취소하기");
    type("#creator-cancel-no", "FC-7K3M9");
    await click("크리에이터 사정으로 취소");
    expect(api.postCreatorCancel).not.toHaveBeenCalled();
    expect(host.textContent).toContain("사유를 1~200자로 적어 주세요.");
    type("#creator-cancel-reason", "탈퇴");
    api.postCreatorCancel.mockResolvedValueOnce({ kind: "failed", status: 409, message: "크리에이터 사정 취소를 할 수 있는 주문이 아니에요." });
    await click("크리에이터 사정으로 취소");
    expect(host.textContent).toContain("크리에이터 사정 취소를 할 수 있는 주문이 아니에요.");
    expect(host.textContent).not.toContain("not_cancelable");
  });
});
