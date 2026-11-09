import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceivedBox } from "@/entities/gift-reply/api/gift-reply-reads";

// 크리에이터 받은 선물 — 상자마다 배송 단계(delivery-status INV-DS1·DS2). 받는 쪽은 크리에이터라, 받았어요(답장 포함)를 남긴 상자는 답장 상태 그대로,
// 아직 남기지 않은 상자는 출고 날 뒤에 배송 단계가 붙는다. 저장 요청은 가짜로 둔다 — 시험 대상은 보이는 글이다.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../api/send-gift-reply", () => ({ sendConfirmGiftBox: vi.fn(), sendDeleteGiftReply: vi.fn() }));

import { ReceivedBoxList } from "./received-box-list";

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

const box = (over: Partial<ReceivedBox>): ReceivedBox => ({
  boxId: "b1",
  orderNo: "FC-7K3M9",
  boxSeq: 1,
  boxCount: 1,
  senderNickname: "별빛",
  itemCategory: null,
  itemKind: "인형",
  shippedOn: "2026-11-09",
  receivedOn: null,
  replyState: "none",
  reply: null,
  ...over,
});
/** 서울 11월 (9 + days)일 0시 + 분 */
const seoul = (days: number, minutes = 0) => new Date(Date.parse("2026-11-08T15:00:00Z") + days * 86_400_000 + minutes * 60_000).toISOString();

function render(b: ReceivedBox, now: string) {
  act(() => root.render(<ReceivedBoxList boxes={[b]} pending={0} now={now} />));
}
const foot = () => host.querySelector("[data-delivery-stage]");

describe("delivery-status: 크리에이터 받은 선물의 배송 단계", () => {
  it("INV-DS1 (경계): 출고한 날 → 팬꾹에서 보냈어요, 다음 날 → 보통 1~2일, +3일 → 도착했어요(예상) 흐리게", () => {
    render(box({}), seoul(1, -1));
    expect(foot()?.textContent).toBe("11월 9일 출고 · 팬꾹에서 보냈어요");
    render(box({}), seoul(1));
    expect(foot()?.textContent).toBe("11월 9일 출고 · 보통 1~2일 안에 도착해요");
    render(box({}), seoul(3));
    expect(foot()?.textContent).toBe("11월 9일 출고 · 도착했어요(예상)");
    expect(foot()!.className).toMatch(/estimated/);
  });

  it("INV-DS2: 받았어요를 남긴 상자는 단계가 「도착했어요」로 정해지고, 글은 답장 상태 그대로 — 흐리지 않다", () => {
    render(box({ replyState: "confirmed", receivedOn: "2026-11-10" }), seoul(5));
    expect(foot()?.getAttribute("data-delivery-stage")).toBe("arrived");
    expect(foot()?.textContent).toBe("11월 9일 출고 · 수령 확인");
    expect(foot()!.className).not.toMatch(/estimated/);
  });

  it("INV-DS2 (실패경로): 받았어요 전에는 몇 날이 지나도 확정이 아니다 — [받았어요] 버튼이 남는다", () => {
    render(box({}), seoul(10));
    expect(foot()?.getAttribute("data-delivery-stage")).toBe("arrived_estimated");
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("받았어요");
  });
});
