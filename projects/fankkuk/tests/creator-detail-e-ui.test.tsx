import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { CreatorProfilePage, type CreatorProfilePageProps } from "@/widgets/creator-profile/ui/creator-profile-page";
import { VerifyingCreatorPage } from "@/widgets/creator-profile/ui/verifying-creator-page";

// 크리에이터 상세 시안 e판(docs/design/mockups/creator-detail-e-20261112) — 상세 내용 여닫기(처음 닫힘) · 진행 중인 선물함 타일과 상세 창 ·
// 추천 크리에이터 자동 슬라이드(멈춤 버튼) · 배경 기본 면 · verifying 은 상세 내용·선물함·추천이 없다.

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
const other = (n: number) => ({ ...card, id: `00000000-0000-4000-b000-00000000010${n}`, name: `다른${n}`, handle: `other${n}`, photoUrl: null, backgroundUrl: null as string | null });
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400, returnShippingKrw: 6500 } };
const TODAY = { year: 2026, month: 10, day: 12 };
const BOX_A = "00000000-0000-4000-a000-0000000000a1";
const BOX_B = "00000000-0000-4000-a000-0000000000b2";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(extra: Partial<CreatorProfilePageProps> = {}) {
  act(() =>
    root.render(<CreatorProfilePage creator={{ ...card, photoUrl: null }} others={[]} followMode="save" send="open" prices={prices} prohibited={[]} monthFans={0} today={TODAY} {...extra} />),
  );
}
const byText = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);

describe("상세 내용 여닫기", () => {
  it("처음엔 닫혀 있고(hidden) 「상세 정보 펼치기」를 누르면 열리고 문구가 「상세 정보 접기」로 바뀐다", () => {
    render();
    const toggle = byText("상세 정보 펼치기")!;
    const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    expect(body.querySelector("#flow-h")?.textContent).toBe("전달 과정");
    expect(body.querySelector("#guide-h")?.textContent).toBe("보내기 전 안내");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);
    expect(toggle.textContent).toBe("상세 정보 접기");
  });

  it("전달 과정은 다섯 단계 — 검수·크리에이터 승인이 있다", () => {
    render();
    expect([...host.querySelectorAll("#flow-h + ol h3")].map((h) => h.textContent)).toEqual(["등록·결제", "입고", "검수", "크리에이터 승인", "출고·배송"]);
  });

  it("(실패경로) 받고 싶은 선물·나에게 온 감사 카드 영역은 그리지 않는다", () => {
    render();
    expect(host.textContent).not.toContain("받고 싶은 선물");
    expect(host.textContent).not.toContain("나에게 온 감사 카드");
  });
});

describe("진행 중인 선물함 — 타일과 상세 창", () => {
  const boxes = [
    { id: BOX_A, name: "1주년 기념 선물함", description: "편지와 작은 선물", myState: null, waitlistNo: null },
    { id: BOX_B, name: "연말 선물함", description: null, myState: "waitlisted" as const, waitlistNo: 2 },
  ];

  it("타일은 이름 + 내 상태 뱃지만, 누르면 창에 설명과 버튼 하나(「신청」 / 「신청 보기」)", () => {
    render({ openBoxes: boxes, send: "needs_follow", followMode: "login" }); // 로그인 전 — 팔로우 취소 확인 창이 없어 창은 선물함 것 하나
    expect(host.querySelector("#boxes-h")?.textContent).toBe("진행 중인 선물함");
    const tiles = [...host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')];
    expect(tiles.map((t) => t.textContent)).toEqual(["1주년 기념 선물함", "연말 선물함대기 2번"]);
    expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(false);
    act(() => tiles[0]!.click());
    const dlg = host.querySelector("dialog")!;
    expect(dlg.hasAttribute("open")).toBe(true);
    expect(dlg.querySelector("h2")?.textContent).toBe("1주년 기념 선물함");
    expect(dlg.textContent).toContain("편지와 작은 선물");
    const act1 = [...dlg.querySelectorAll("a.btn")];
    expect(act1.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["신청", `/gift-boxes/${BOX_A}`]]);
    act(() => dlg.close());
    act(() => tiles[1]!.click());
    expect([...host.querySelectorAll("dialog a.btn")].map((a) => a.textContent)).toEqual(["신청 보기"]);
    expect(host.querySelector("dialog")?.textContent).toContain("대기 2번");
  });

  it("본인 페이지(self)는 「신청 관리」 → 크리에이터 관리 화면", () => {
    render({ send: "self", followMode: "hidden", openBoxes: boxes });
    act(() => host.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!.click());
    const a = host.querySelector("dialog a.btn");
    expect([a?.textContent, a?.getAttribute("href")]).toEqual(["신청 관리", `/creator/revgift-boxes/${BOX_A}`]);
  });

  it("(실패경로) 선물함이 없으면 칸을 그리지 않는다", () => {
    render();
    expect(host.querySelector("#boxes-h")).toBeNull();
  });
});

describe("추천 크리에이터 둘러보기", () => {
  it("넘길 것이 있으면(4장 이상) 이전·다음·멈춤 버튼, 멈춤을 누르면 「다시 시작」으로 바뀐다", () => {
    render({ others: [1, 2, 3, 4, 5, 6].map(other) });
    expect(host.querySelector("#similar-title")?.textContent).toBe("추천 크리에이터 둘러보기");
    const pause = host.querySelector<HTMLButtonElement>('button[aria-label="자동 넘김 멈추기"]')!;
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector('button[aria-label="이전 크리에이터"]')).not.toBeNull();
    expect(host.querySelector('button[aria-label="다음 크리에이터"]')).not.toBeNull();
    act(() => pause.click());
    expect(pause.getAttribute("aria-pressed")).toBe("true");
    expect(pause.getAttribute("aria-label")).toBe("자동 넘김 다시 시작");
    expect(host.querySelectorAll("#similar-track > li")).toHaveLength(6);
  });

  it("추천 카드 배경 — 배경사진이 있으면 그 사진, 없으면 그림 없이 기본 배경 칸만", () => {
    render({ others: [{ ...other(1), backgroundUrl: "https://example.test/bg-1.webp" }, other(2)] });
    const covers = host.querySelectorAll("#similar-track > li [aria-hidden='true']:first-child");
    expect(covers).toHaveLength(2);
    expect(covers[0]?.querySelector("img")?.getAttribute("src")).toBe("https://example.test/bg-1.webp");
    expect(covers[1]?.childElementCount).toBe(0);
  });

  it("(실패경로) 3장 이하면 화살표·멈춤 버튼이 없다", () => {
    render({ others: [1, 2, 3].map(other) });
    expect(host.querySelector('button[aria-label="자동 넘김 멈추기"]')).toBeNull();
    expect(host.querySelector('button[aria-label="다음 크리에이터"]')).toBeNull();
    expect(host.querySelectorAll("#similar-track > li")).toHaveLength(3);
  });
});

describe("배경 사진 면", () => {
  it("사진이 있으면 사진, 없으면 그림 없이 기본 면(흐린 고양이·파스텔 변수 없음)", () => {
    render({ backgroundUrl: "https://x.test/bg.webp" });
    expect(host.querySelector("main > div[aria-hidden] img")?.getAttribute("src")).toBe("https://x.test/bg.webp");
    render({ backgroundUrl: null });
    const cover = host.querySelector<HTMLElement>("main > div[aria-hidden]")!;
    expect(cover.querySelector("img")).toBeNull();
    expect(cover.style.getPropertyValue("--pastel")).toBe("");
  });
});

describe("verifying — 채널 확인 중", () => {
  it("이름·소개·안내 한 줄만 — 상세 내용·선물함·추천이 없다", () => {
    act(() => root.render(<VerifyingCreatorPage creator={{ creatorId: card.id, name: "하루", intro: "안녕하세요", photoUrl: null, faceTone: "var(--face-1)" }} signedIn={false} />));
    expect(host.querySelector("h1")?.textContent).toBe("하루");
    expect(host.querySelector("main, div")?.textContent).toContain("채널 확인이 끝나면");
    expect(host.querySelector('[role="status"]')).toBeNull(); // 늘 보이는 고정 문장이라 바뀜 알림이 아니다(UX 리뷰 11-13)
    expect(byText("상세 정보 펼치기")).toBeUndefined();
    expect(host.querySelector("#boxes-h")).toBeNull();
    expect(host.querySelector("#similar-title")).toBeNull();
  });
});
