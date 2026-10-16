import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";

// 보낸 역조공 화면의 「내 상자 찾기」 (inbound-address-code INV-C4 ②-나·C10, action-center INV-J10 — 2026-10-16 카드 d96 ①).
// 아직 입고 전인 줄(찾기 후보 판정에 든 몫)마다 버튼이 있고, 늦지 않아도 누를 수 있다. 입고된 줄·후보가 아닌 줄에는 없다.
const postFind = vi.fn();
vi.mock("@/features/box-waybill/api/post-waybill-client", async (orig) => ({ ...(await orig<object>()), postFind: (...a: unknown[]) => postFind(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { RevgiftSentPage } from "./revgift-sent-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  postFind.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const SENT = "2026-10-15T01:00:00.000Z";
const row = (orderNo: string, fanNickname: string, state: SentRevgift["state"]): SentRevgift => ({ orderNo, sentAt: SENT, fanNickname, tier: "small", state, shipToOffice: true });
const box = (orderNo: string, shareId: string, fanNickname: string, state: ShareBox["state"]): ShareBox => ({
  shareId,
  orderNo,
  fanNickname,
  tier: "small",
  waybillNo: null,
  state,
  addressCode: null,
  reportedNotMine: false,
});
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";

function render() {
  act(() =>
    root.render(
      <RevgiftSentPage
        rows={[row("RG-A0", "모카", "waiting"), row("RG-A1", "라온", "waiting")]}
        boxes={[box("RG-A0", S1, "모카", "awaiting"), box("RG-A1", S2, "라온", "received")]}
        paid={false}
        officeAddress="사무실 주소"
        candidates={[{ shareId: S1, nickname: "모카", tier: "small" }]}
      />,
    ),
  );
}
const findButtons = () => [...host.querySelectorAll("button")].filter((b) => b.textContent === "내 상자 찾기");

describe("보낸 역조공 화면 — 줄마다 「내 상자 찾기」 (카드 d96 ①)", () => {
  it("INV-C4 ②-나: 아직 입고 전인(후보인) 줄에만 버튼 — 입고된 줄에는 없다", () => {
    render();
    const buttons = findButtons();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest("li")?.textContent).toContain("모카님");
  });

  it("INV-C4 ②-나: 버튼을 누르면 「내 상자 찾기」 창 — 그 줄의 팬이 골라져 있고, 두 값과 함께 한 번에 찾기를 부른다", async () => {
    postFind.mockResolvedValue({ kind: "ok", body: { matched: false, message: "맞는 상자를 못 찾았어요." } });
    render();
    act(() => findButtons()[0]!.click());
    const d = host.querySelector("dialog[open]")!;
    expect(d.querySelector("h2")?.textContent).toBe("내 상자 찾기");
    expect(d.querySelector<HTMLInputElement>("input[type=radio]")?.checked).toBe(true);
    const select = d.querySelector("select")!;
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    d.querySelector<HTMLInputElement>("input[name=waybill]")!.value = "123456789012";
    await act(async () => d.querySelector("form")!.requestSubmit());
    expect(postFind).toHaveBeenCalledWith({ kind: "share", id: S1 }, "123456789012", "cj");
    expect(d.textContent).toContain("아직 못 찾았어요");
  });

  it("찾으면 창에 「사무실에 도착했어요」가 남고, 목록은 창을 닫을 때 새로 읽는다 — 먼저 읽어 창이 사라지지 않게", async () => {
    postFind.mockResolvedValue({ kind: "ok", body: { matched: true } });
    render();
    act(() => findButtons()[0]!.click());
    const d = host.querySelector("dialog[open]")!;
    const select = d.querySelector("select")!;
    act(() => {
      select.value = "cj";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    d.querySelector<HTMLInputElement>("input[name=waybill]")!.value = "123456789012";
    await act(async () => d.querySelector("form")!.requestSubmit());
    expect(d.textContent).toContain("사무실에 도착했어요");
    expect(refresh).not.toHaveBeenCalled();
    act(() => d.querySelector<HTMLButtonElement>("button[aria-label=\"닫기\"]")!.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
