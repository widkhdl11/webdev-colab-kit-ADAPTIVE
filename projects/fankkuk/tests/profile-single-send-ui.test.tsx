import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import type { FollowMode } from "@/features/creator-follow/model/follow-mode";
import type { LinkPageSend } from "@/features/gift-register/model/sender-rule";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";

// DECISIONS 2026-10-18 「사이트 재진단 반영」 — 로그인 후 크리에이터 페이지는 머리의 버튼 하나만 둔다(아래 「선물 보내기」 판 없음).
// 로그인 전은 장식 판을 그대로 둔다. 자기 페이지 안내는 아래 판이 없어져도 머리 자리에 남아야 한다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card: CreatorCard = {
  id: "00000000-0000-4000-b000-000000000001",
  name: "하루",
  platform: "치지직",
  tags: [],
  channelTitle: "하루 채널",
  intro: "안녕하세요",
  alias: "",
  approvalMinutes: 60,
  faceTone: "var(--face-1)",
  following: false,
  handle: "haru",
  photoPath: null,
};
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400, returnShippingKrw: 6500 } };

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

function renderProfile(send: LinkPageSend, followMode: FollowMode, monthFans = 0) {
  act(() =>
    root.render(
      <CreatorProfilePage
        creator={{ ...card, photoUrl: null }}
        others={[]}
        followMode={followMode}
        send={send}
        prices={prices}
        prohibited={[]}
        monthFans={monthFans}
        today={{ year: 2026, month: 10, day: 12 }}
      />,
    ),
  );
}

const sendLinks = () => [...host.querySelectorAll("a")].filter((a) => a.textContent?.trim() === "선물 보내기");

describe("크리에이터 페이지 — 주 버튼 하나(재진단 2026-10-18)", () => {
  it("로그인한 팬에게는 「선물 보내기」가 머리에 한 번만 있고 아래 판이 없다", () => {
    renderProfile("open", "save");
    expect(sendLinks()).toHaveLength(1);
    expect(host.querySelector("#send-h")).toBeNull();
  });

  it("로그인 전에는 아래 장식 판을 그대로 그린다", () => {
    renderProfile("open", "login");
    expect(host.querySelector("#send-h")).not.toBeNull();
  });

  it("크리에이터가 자기 페이지를 보면 아래 판이 없어도 「내 크리에이터 페이지예요」가 한 번 보인다", () => {
    renderProfile("self", "hidden");
    const tags = [...host.querySelectorAll("span")].filter((s) => s.textContent === "내 크리에이터 페이지예요");
    expect(tags).toHaveLength(1);
  });
});

describe("크리에이터 페이지 — 5파트 정돈(2026-10-25)", () => {
  it("로그인 전 아래 장식 판의 버튼은 테두리 버튼이고, 채운 버튼은 머리의 하나뿐이다", () => {
    renderProfile("open", "login");
    const links = sendLinks();
    expect(links).toHaveLength(2);
    const sheetBtn = host.querySelector("#send-h")?.closest("section")?.querySelector("a.btn");
    expect(sheetBtn?.classList.contains("btn--line")).toBe(true);
    const filled = links.filter((a) => !a.classList.contains("btn--line"));
    expect(filled).toHaveLength(1);
  });

  it("넷째 정보 칸(이번 달 팬 수)은 다른 칸처럼 아이콘 다음에 이름 줄 「선물한 팬」을 둔다", () => {
    renderProfile("open", "save", 3);
    const big = [...host.querySelectorAll(".card.info .big")].find((p) => p.textContent?.includes("마음을 보냈어요"));
    const h3 = big?.previousElementSibling;
    expect(h3?.tagName).toBe("H3");
    expect(h3?.textContent).toBe("선물한 팬");
  });
});
