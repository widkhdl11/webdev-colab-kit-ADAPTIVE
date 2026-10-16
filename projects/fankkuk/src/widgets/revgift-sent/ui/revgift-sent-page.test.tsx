import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";

// 보낸 역조공 화면 (action-center INV-J10 — 2026-10-16 카드 d96 ①). 「내 상자 찾기」는 선물 현황 화면이 생기기 전까지만 이 화면에 있었다 —
// 지금은 선물 현황 「보내는 선물」의 입고 전 줄마다 있다(widgets/creator-gift-progress).
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
        // 찾기 후보가 있어도(예전 화면은 이 값으로 버튼을 그렸다) 버튼이 없어야 한다
        {...({ candidates: [{ shareId: S1, nickname: "모카", tier: "small" }] } as object)}
      />,
    ),
  );
}
const findButtons = () => [...host.querySelectorAll("button")].filter((b) => b.textContent === "내 상자 찾기");

describe("보낸 역조공 화면 — 「내 상자 찾기」는 선물 현황으로 옮겼다 (action-center INV-J10)", () => {
  it("INV-J10: 선물 현황 화면이 생긴 뒤에는 보낸 역조공 줄에 「내 상자 찾기」가 없다 — 줄(팬 닉네임·상태)은 그대로", () => {
    render();
    expect(findButtons()).toHaveLength(0);
    const names = [...host.querySelectorAll("ul[aria-label$=\"팬별 지금 상태\"] > li")].map((li) => li.querySelector("p")?.textContent);
    expect(names).toEqual(["모카님", "라온님"]);
  });

  it("화면 리뷰 U6: 사무실에 온 상자는 용어집 4절 라벨 「도착 완료」 — 「입고됨」이라 쓰지 않는다", () => {
    render();
    const fold = host.querySelector("details")!;
    expect(fold.textContent).toContain("도착 완료");
    expect(host.textContent).not.toContain("입고됨");
  });

  it("역조공 수락 라벨(용어집 7절): 줄 상태·묶음 요약·요약 칸은 「수락 대기」 — 「기다리는 중」을 쓰지 않는다", () => {
    render();
    const tags = [...host.querySelectorAll("ul[aria-label$=\"팬별 지금 상태\"] > li")].map((li) => li.querySelector("[class*=tag]")?.textContent);
    expect(tags).toEqual(["수락 대기", "수락 대기"]);
    expect(host.textContent).toContain("팬 2명 · 수락 대기 2명");
    expect([...host.querySelectorAll("aside dt")].map((d) => d.textContent)).toEqual(["보낸 묶음", "보낸 선물", "수락", "수락 대기", "받지 않음"]);
    expect(host.textContent).not.toContain("기다리는 중");
  });
});
