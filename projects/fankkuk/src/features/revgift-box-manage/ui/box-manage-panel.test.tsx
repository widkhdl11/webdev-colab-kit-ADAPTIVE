import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyBox } from "@/entities/revgift-box/api/box-reads";

// 신청 관리 창 (revgift-box INV-GB7·GB8·GB9). 서버로 가는 요청은 가짜로 둔다 — 시험 대상은 상태마다 보이는 것과 보내는 값이다.
const sendSetExcluded = vi.fn();
const sendCloseBox = vi.fn();
const sendCancelBox = vi.fn();
const sendRenewInvite = vi.fn();
const refresh = vi.fn();
vi.mock("../api/box-requests", () => ({
  sendSetExcluded: (...a: unknown[]) => sendSetExcluded(...a),
  sendCloseBox: (...a: unknown[]) => sendCloseBox(...a),
  sendCancelBox: (...a: unknown[]) => sendCancelBox(...a),
  sendRenewInvite: (...a: unknown[]) => sendRenewInvite(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

import { BoxManagePanel } from "./box-manage-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

const A = "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";
const B = "1d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";
const BOX: MyBox = {
  id: "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10",
  name: "겨울 선물",
  capacity: 30,
  isPublic: false,
  status: "open",
  inviteToken: "a".repeat(32),
  createdAt: "2026-11-08T01:00:00Z",
  inboundCode: null,
  cartonCount: null,
  cartonsReceived: 0,
  invoice: null,
  applications: [
    { id: A, nickname: "별빛", appliedAt: "2026-11-08T02:00:00Z", status: "applied", chosenTier: null, waitlistNo: null },
    { id: B, nickname: "달토끼", appliedAt: "2026-11-08T03:00:00Z", status: "excluded", chosenTier: null, waitlistNo: null },
  ],
};
const URL_ = `http://localhost:3100/gift-boxes/${BOX.id}?invite=${"a".repeat(32)}`;

let host: HTMLDivElement;
let root: Root;
let mount = 0;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  for (const f of [sendSetExcluded, sendCloseBox, sendCancelBox, sendRenewInvite, refresh]) f.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function render(box: Partial<MyBox> = {}) {
  mount += 1;
  act(() => root.render(<BoxManagePanel key={mount} box={{ ...BOX, ...box }} applyUrl={URL_} />));
}
const boxes = () => [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
/** 화면의 버튼(확인 창 안 버튼은 뺀다) */
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text && !b.closest("dialog"));

describe("신청 관리 창", () => {
  it("INV-GB7 S7: 줄마다 「제외」 체크 — 제외된 줄은 체크된 채 흐리게 남고, 누르면 그 신청 번호로 다시 넣기를 보낸다", async () => {
    render();
    expect(boxes().map((b) => b.checked)).toEqual([false, true]);
    const rows = [...host.querySelectorAll("li")];
    expect(rows[1].className).not.toBe(rows[0].className);
    expect(host.textContent).toContain("1명 / 30명");
    sendSetExcluded.mockResolvedValue({ kind: "ok", data: "applied" });
    await act(async () => boxes()[1].click());
    expect(sendSetExcluded).toHaveBeenCalledWith(BOX.id, B, false);
    expect(boxes().map((b) => b.checked)).toEqual([false, false]);
    expect(host.textContent).toContain("2명 / 30명");
  });

  it("INV-GB5: 다시 넣기가 「다 참」으로 거부되면 그 문구, 체크는 그대로", async () => {
    render();
    sendSetExcluded.mockResolvedValue({ kind: "refused", message: "받을 인원이 다 찼습니다." });
    await act(async () => boxes()[1].click());
    expect(host.textContent).toContain("받을 인원이 다 찼습니다.");
    expect(boxes()[1].checked).toBe(true);
  });

  it("INV-GB9 S9: 줄에는 닉네임·신청 시각만 — 초대 링크는 주인 화면에만", () => {
    render();
    expect(host.textContent).toContain(URL_);
    expect(button("링크 다시 만들기")).toBeDefined();
    render({ isPublic: true, inviteToken: null });
    expect(button("링크 다시 만들기")).toBeUndefined();
  });

  it("INV-GB8: 마감은 확인 창의 「마감」을 눌러야 보낸다. 제외 안 된 신청이 없으면 마감 버튼이 눌리지 않는다", async () => {
    sendCloseBox.mockResolvedValue({ kind: "ok", data: null });
    render();
    await act(async () => button("마감")!.click());
    expect(sendCloseBox).not.toHaveBeenCalled();
    const confirm = [...host.querySelectorAll("dialog button")].find((b) => b.textContent === "마감")!;
    await act(async () => (confirm as HTMLButtonElement).click());
    expect(sendCloseBox).toHaveBeenCalledWith(BOX.id);
    expect(refresh).toHaveBeenCalled();
    render({ applications: [{ ...BOX.applications[1] }] });
    expect(button("마감")!.hasAttribute("disabled")).toBe(true);
  });

  it("INV-GB7 · INV-GB1: 마감 뒤에는 체크·마감·링크가 없고 선물함 취소만, 결제 요청 뒤에는 취소도 없다", () => {
    render({ status: "closed", applications: [{ ...BOX.applications[0], status: "selected" }, BOX.applications[1]] });
    expect(boxes()).toEqual([]);
    expect(button("마감")).toBeUndefined();
    expect(host.textContent).not.toContain(URL_);
    expect(button("선물함 취소")).toBeDefined();
    expect(host.querySelector(".tag")?.textContent).toBe("제외");
    render({ status: "invoiced" });
    expect(button("선물함 취소")).toBeUndefined();
  });
});
