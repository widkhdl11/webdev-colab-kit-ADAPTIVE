import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { restingMessage, type CreatorReceiving } from "@/entities/creator/model/receiving";
import { HARD_REASONS, type HardItems } from "@/entities/gift-item/model/hard-items";
import { ITEM_CATEGORY_LABEL, type ItemCategory } from "@/entities/gift-item/model/item-category";
import type { FollowMode } from "@/features/creator-follow/model/follow-mode";
import type { LinkPageSend } from "@/features/gift-register/model/sender-rule";
import { CreatorProfilePage, type CreatorProfilePageProps } from "@/widgets/creator-profile/ui/creator-profile-page";

// 크리에이터 상세 재디자인(2026-10-25, design-rules 31절 · UX 명세 docs/ux/pages/handle.md 「2026-10-25 재디자인」 상태표).
// needs_follow = 「팔로우」 하나 → 누르면 팔로우만 저장하고 같은 화면에서 「선물 보내기」+「팔로우 중」 / open = 그 둘 / self = 꼬리표 / hidden = 쉬는 기간 한 줄.
// 저장 요청(/api/follows)은 fetch 를 바꿔 끼워 본다 — 화면 부품과 저장 함수는 진짜를 쓴다.

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
const TODAY = { year: 2026, month: 10, day: 12 };
const resting: CreatorReceiving = { resumeOn: "2026-11-03", birthday: null, anniversaries: [] };
const HARD_CATEGORY = Object.keys(ITEM_CATEGORY_LABEL)[0] as ItemCategory;
const hardItems: HardItems = { categories: [HARD_CATEGORY], reason: HARD_REASONS[0], action: "notice" };

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  router.refresh.mockReset();
  router.push.mockReset();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  // jsdom 에는 <dialog>.showModal 이 없다 — 팔로우 취소 확인 창이 열리게만 한다
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function renderProfile(send: LinkPageSend, followMode: FollowMode, extra: Partial<CreatorProfilePageProps> = {}) {
  act(() =>
    root.render(
      <CreatorProfilePage creator={{ ...card, photoUrl: null }} others={[]} followMode={followMode} send={send} prices={prices} prohibited={[]} monthFans={0} today={TODAY} {...extra} />,
    ),
  );
}

const actionsText = () => [...host.querySelectorAll<HTMLElement>("a.btn, button.btn")].filter((el) => !el.closest("dialog")).map((el) => el.textContent?.trim());
const filled = () => [...host.querySelectorAll<HTMLElement>("a.btn, button.btn")].filter((el) => !el.closest("dialog") && !el.classList.contains("btn--line"));
const buttonByText = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("크리에이터 상세 — 버튼 자리 상태표 (UX 명세 2026-10-25, INV-L9)", () => {
  it("needs_follow(로그인 팬): 「팔로우」 하나만, 안내 줄 없음", () => {
    renderProfile("needs_follow", "save");
    expect(actionsText()).toEqual(["팔로우"]);
    expect(host.textContent).not.toContain("팔로우한 크리에이터에게만 보낼 수 있어요");
    expect(host.textContent).not.toContain("팔로우하고 선물 보내기");
  });

  it("needs_follow(로그인 전): 「팔로우」 하나가 로그인 화면 링크다", () => {
    renderProfile("needs_follow", "login");
    expect(actionsText()).toEqual(["팔로우"]);
    expect(host.querySelector("a.btn")?.getAttribute("href")).toBe("/login");
  });

  it("「팔로우」를 누르면 팔로우만 저장하고 같은 화면에서 「선물 보내기」+「팔로우 중」으로 바뀐다 — 보내기 화면으로 넘어가지 않는다", async () => {
    renderProfile("needs_follow", "save");
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ creatorId: card.id, following: true });
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(actionsText()).toEqual(["선물 보내기", "팔로우 중"]);
    const gift = host.querySelector<HTMLAnchorElement>("a.btn");
    expect(gift?.getAttribute("href")).toBe(`/gifts/new?creator=${card.id}`);
    expect(document.activeElement).toBe(gift);
  });

  // 버튼 디테일(2026-10-25 사용자 「버튼 디테일 살려줘」, design-rules 24절과 같은 튐) — 처음 그릴 때는 튀지 않고, 저장이 성공해 바뀐 뒤에만 새 글자가 튄다
  const popped = () => [...host.querySelectorAll<HTMLElement>("a.btn span, button.btn span")].filter((el) => /pop/.test(el.className)).map((el) => el.textContent);
  it("처음 그릴 때는 버튼 글자가 튀지 않고, 「팔로우」 저장이 성공한 뒤 새 버튼 글자만 튄다", async () => {
    renderProfile("needs_follow", "save");
    expect(popped()).toEqual([]);
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(popped()).toEqual(["선물 보내기", "팔로우 중"]);
  });

  it("(실패경로) 저장이 실패하면 글자가 튀지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    renderProfile("needs_follow", "save");
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(popped()).toEqual([]);
  });

  it("(실패경로) 팔로우 저장에 실패하면 「팔로우」 그대로 두고 알린다 — 「선물 보내기」가 보이지 않는다", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderProfile("needs_follow", "save");
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(actionsText()).toEqual(["팔로우"]);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("팔로우를 저장하지 못했어요");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("(실패경로) 누른 직후 저장이 끝나기 전에는 여전히 「팔로우」만 — 「선물 보내기」가 먼저 나오지 않는다", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderProfile("needs_follow", "save");
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(actionsText()).toEqual(["팔로우"]);
    // 저장 중 — 글자는 그대로, 흐린 모양(aria-disabled)
    expect(buttonByText("팔로우")?.getAttribute("aria-disabled")).toBe("true");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("(실패경로) 저장 중에 「팔로우」를 다시 눌러도 저장은 한 번만 보낸다", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((res) => (finish = res)));
    renderProfile("needs_follow", "save");
    act(() => buttonByText("팔로우")!.click());
    act(() => buttonByText("팔로우")!.click());
    act(() => buttonByText("팔로우")!.click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(new Response("{}", { status: 200 }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(actionsText()).toEqual(["선물 보내기", "팔로우 중"]);
  });

  it("(실패경로) 세션이 끝나 401 이면 로그인 화면으로 가고 버튼은 「팔로우」 그대로", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 401 }));
    renderProfile("needs_follow", "save");
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(router.push).toHaveBeenCalledWith("/login");
    expect(actionsText()).toEqual(["팔로우"]);
  });

  it("(실패경로) 팔로우 취소를 저장하는 동안 「선물 보내기」를 눌러도 보내기 화면으로 넘어가지 않는다", async () => {
    renderProfile("open", "save");
    const gift = () => host.querySelector<HTMLAnchorElement>("a.btn")!;
    // 저장 중이 아닐 때는 막지 않는다(아래 막힘이 늘 막혀 있어서가 아님을 보인다)
    expect(gift().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))).toBe(true);
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    act(() => buttonByText("팔로우 중")!.click());
    act(() => buttonByText("취소하기")!.click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(gift().getAttribute("aria-disabled")).toBe("true");
    let notPrevented = true;
    act(() => {
      notPrevented = gift().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(notPrevented).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("팔로우 취소가 저장되면 초점이 「팔로우」로 옮겨 간다", async () => {
    renderProfile("open", "save");
    act(() => buttonByText("팔로우 중")!.click());
    act(() => buttonByText("취소하기")!.click());
    await flush();
    expect(actionsText()).toEqual(["팔로우"]);
    expect(document.activeElement).toBe(buttonByText("팔로우"));
  });

  it("(실패경로) 저장이 실패하면 버튼 묶음 바로 아래에 보이는 한 줄로 알린다", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderProfile("needs_follow", "save");
    const status = () => host.querySelector<HTMLElement>('[role="status"]')!;
    expect(status().textContent).toBe("");
    expect(status().classList.contains("sr-only")).toBe(true);
    act(() => buttonByText("팔로우")!.click());
    await flush();
    expect(status().textContent).toBe("팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    expect(status().classList.contains("sr-only")).toBe(false);
    expect(status().parentElement).toBe(buttonByText("팔로우")!.parentElement);
  });

  it("(실패경로) 팔로우 취소 저장이 실패하면 「팔로우 중」 그대로 두고 취소 실패 문구를 보인다", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    const status = () => host.querySelector<HTMLElement>('[role="status"]')!;
    renderProfile("open", "save");
    act(() => buttonByText("팔로우 중")!.click());
    act(() => buttonByText("취소하기")!.click());
    await flush();
    expect(actionsText()).toEqual(["선물 보내기", "팔로우 중"]);
    expect(status().textContent).toBe("팔로우 취소를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    expect(status().classList.contains("sr-only")).toBe(false);
  });

  it("(실패경로) 운영자에게는 팔로우·선물 보내기 버튼이 없다", () => {
    for (const send of ["open", "needs_follow"] as const) {
      renderProfile(send, "hidden");
      expect(actionsText(), send).toEqual([]);
    }
  });

  it("open: 「선물 보내기」(채움) + 「팔로우 중」(테두리) — 채운 버튼은 하나", () => {
    renderProfile("open", "save");
    expect(actionsText()).toEqual(["선물 보내기", "팔로우 중"]);
    expect(filled().map((el) => el.textContent?.trim())).toEqual(["선물 보내기"]);
    expect(buttonByText("팔로우 중")?.classList.contains("btn--line")).toBe(true);
  });

  it("needs_follow 의 「팔로우」도 채운 버튼 하나", () => {
    for (const mode of ["save", "login"] as const) {
      renderProfile("needs_follow", mode);
      expect(filled().map((el) => el.textContent?.trim()), mode).toEqual(["팔로우"]);
    }
  });

  it("「팔로우 중」은 바로 끊지 않고 확인 창을 띄우고, 「취소하기」를 눌러야 끊어져 「팔로우」로 돌아간다", async () => {
    renderProfile("open", "save");
    act(() => buttonByText("팔로우 중")!.click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.querySelector("dialog")?.textContent).toContain("정말 팔로우를 취소하시겠어요?");
    act(() => buttonByText("취소하기")!.click());
    await flush();
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ creatorId: card.id, following: false });
    expect(actionsText()).toEqual(["팔로우"]);
  });

  it("self: 꼬리표 「내 크리에이터 페이지예요」 하나, 버튼 없음", () => {
    renderProfile("self", "hidden");
    const tags = [...host.querySelectorAll("span")].filter((el) => el.textContent === "내 크리에이터 페이지예요");
    expect(tags).toHaveLength(1);
    expect(actionsText()).toEqual([]);
  });

  it("hidden(쉬는 중, INV-B2): 버튼 없이 버튼 자리에 쉬는 기간 한 줄, 받기 어려운 품목 알림 숨김", () => {
    renderProfile("hidden", "save", { receiving: resting, hardItems });
    expect(actionsText()).toEqual([]);
    const line = [...host.querySelectorAll("p")].find((p) => p.textContent === restingMessage("2026-11-03"));
    expect(line?.textContent).toContain("11월 3일");
    expect(line?.closest("section")?.querySelector("#creator-name")).not.toBeNull();
    expect(host.textContent).not.toContain("받기 어려운 품목");
  });

  it("(실패경로) 쉬는 중인데 다시 받는 날을 모르면 빈칸 대신 「잠시 선물 받기를 쉬고 있어요」 한 줄", () => {
    renderProfile("hidden", "save", { receiving: null, hardItems });
    expect(actionsText()).toEqual([]);
    const line = [...host.querySelectorAll("p")].find((p) => p.textContent === "잠시 선물 받기를 쉬고 있어요");
    expect(line?.closest("section")?.querySelector("#creator-name")).not.toBeNull();
    expect(host.textContent).not.toContain("받기 어려운 품목");
  });

  it("받는 중이면 받는 상태 칸이 없고, 받기 어려운 품목은 머리 아래 한 줄 알림", () => {
    renderProfile("open", "save", { hardItems });
    expect(host.textContent).not.toContain("받는 상태");
    expect(host.textContent).not.toContain("지금 선물을 받고 있어요");
    const alert = host.querySelector("aside");
    expect(alert?.querySelector("h2")?.textContent).toBe("받기 어려운 품목");
    expect(alert?.previousElementSibling?.querySelector("#creator-name")).not.toBeNull();
  });

  it("(실패경로) 받기 어려운 품목이 없으면 알림 줄이 없다", () => {
    renderProfile("open", "save");
    expect(host.querySelector("aside")).toBeNull();
  });
});

describe("크리에이터 상세 — 없앤 것·남긴 것 (design-rules 31절)", () => {
  it("링크 주소 줄·맨 아래 선물 판·감사 답장 설명 문장이 없다", () => {
    for (const mode of ["login", "save"] as const) {
      renderProfile("open", mode, { replies: [{ phrase: "thanks", line: null, repliedOn: "2026-10-01", fanNickname: null }] });
      expect(host.textContent, mode).not.toContain("fankkuk.kr/haru");
      expect(host.querySelector("#send-h"), mode).toBeNull();
      expect(host.textContent, mode).not.toContain("팬이 공개를 허락한 것만");
      expect(host.querySelector("#replies-h")?.textContent, mode).toBe("감사 답장 모음");
    }
  });

  it("숫자 띠 이름은 「평균 승인 시간」·「요금」(·기념일은 30일 안일 때만)", () => {
    renderProfile("open", "save");
    expect([...host.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["평균 승인 시간", "요금"]);
    expect(host.querySelector("dl")?.textContent).toContain("6,900원부터");
  });

  it("INV-E8: 이번 달 팬 수가 있으면 「이번 달 N명의 팬이 마음을 보냈어요」 그대로, 0이면 없다", () => {
    renderProfile("open", "save", { monthFans: 3 });
    expect([...host.querySelectorAll("p")].map((p) => p.textContent)).toContain("이번 달 3명의 팬이 마음을 보냈어요");
    renderProfile("open", "save", { monthFans: 0 });
    expect(host.textContent).not.toContain("마음을 보냈어요");
  });

  it("INV-K9: 보낼 수 없는 것 목록은 DB 에서 받은 것을 펼쳐 보여 준다", () => {
    renderProfile("open", "save", { prohibited: [{ id: "p1", name: "음식물", description: "" }, { id: "p2", name: "위험물", description: "불이 붙는 것" }] });
    const details = host.querySelector<HTMLDetailsElement>("details[data-prohibited]");
    expect(details?.open).toBe(true);
    expect([...details!.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["음식물", "위험물 (불이 붙는 것)"]);
  });

  it("(실패경로) 운영자가 목록을 다 지웠으면 「보낼 수 없는 것」 줄이 없다", () => {
    renderProfile("open", "save");
    expect(host.querySelector("details[data-prohibited]")).toBeNull();
    expect(host.textContent).toContain("상자는 이렇게 확인해요");
  });
});
