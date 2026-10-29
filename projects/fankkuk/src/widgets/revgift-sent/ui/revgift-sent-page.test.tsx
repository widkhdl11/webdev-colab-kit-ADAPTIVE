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
  // 브라우저처럼 열려 있던 창을 닫으면 close 이벤트를 낸다(BottomSheet 는 onClose 를 이 이벤트로만 부른다)
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
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
    const names = [...host.querySelectorAll("ul[aria-label$=\"팬별 상태\"] > li")].map((li) => li.querySelector("p")?.textContent);
    expect(names).toEqual(["모카님", "라온님"]);
  });

  it("화면 리뷰 U6: 사무실에 온 상자는 용어집 4절 라벨 「도착 완료」 — 「입고됨」이라 쓰지 않는다", () => {
    render();
    const fold = [...host.querySelectorAll("details")].find((d) => d.querySelector(":scope > summary")?.textContent === "송장번호 등록 (선택)")!;
    expect(fold.textContent).toContain("도착 완료");
    expect(host.textContent).not.toContain("입고됨");
  });

  it("역조공 수락 라벨(용어집 7절): 줄 상태·묶음 요약·요약 칸은 「수락 대기」 — 「기다리는 중」을 쓰지 않는다", () => {
    render();
    const tags = [...host.querySelectorAll("ul[aria-label$=\"팬별 상태\"] > li")].map((li) => li.querySelector("[class*=tag]")?.textContent);
    expect(tags).toEqual(["수락 대기", "수락 대기"]);
    expect(host.textContent).toContain("팬 2명 · 수락 대기 2명");
    // 맨 위 상태 띠(design-rules 25절 — 오른쪽 요약 칸을 대신한다): 라벨 세 개와 몫마다 한 칸
    const strip = host.querySelector("[role=img]")!;
    expect(strip.getAttribute("aria-label")).toBe("수락 0개, 수락 대기 2개, 받지 않음 0개");
    expect(strip.children).toHaveLength(2);
    expect(host.querySelector("aside")).toBeNull();
    expect(host.textContent).not.toContain("기다리는 중");
  });

  it("v39(design-rules 25절): 상태 띠 칸은 몫의 상태 그대로 — 묶음마다 최근 묶음만 펼친다", () => {
    const OLD = "2026-10-01T01:00:00.000Z";
    act(() =>
      root.render(
        <RevgiftSentPage
          rows={[
            { ...row("RG-B0", "별", "accepted"), sentAt: OLD },
            row("RG-A0", "모카", "waiting"),
            row("RG-A1", "라온", "not_received"),
          ]}
          boxes={[]}
          paid={false}
          officeAddress="사무실 주소"
        />,
      ),
    );
    const strip = host.querySelector("[role=img]")!;
    expect(strip.getAttribute("aria-label")).toBe("수락 1개, 수락 대기 1개, 받지 않음 1개");
    // 칸 순서 = 묶음(최근 먼저) 안 몫 순서. 같은 상태 칸끼리는 같은 class, 다른 상태끼리는 다른 class
    const cls = [...strip.children].map((c) => c.className);
    expect(cls).toHaveLength(3);
    expect(new Set(cls).size).toBe(3);
    const batches = [...host.querySelectorAll("details")].filter((d) => d.querySelector(":scope > summary h2"));
    expect(batches.map((d) => d.open)).toEqual([true, false]);
    expect(batches[0]!.querySelector("h2")!.textContent).not.toBe(batches[1]!.querySelector("h2")!.textContent);
    expect(host.textContent).not.toContain("역조공 보내기");
  });
});
