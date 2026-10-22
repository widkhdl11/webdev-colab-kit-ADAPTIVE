import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const saveFollow = vi.fn();
vi.mock("@/features/creator-follow/api/save-follow", () => ({ saveFollow: (...args: unknown[]) => saveFollow(...args) }));

import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";

// 팔로우한 크리에이터 /me/following — 정돈 시범(design-rules 27절, 시안 pilot-2026-10-22/following.html).
// 왼쪽 촘촘한 줄 목록(얼굴·이름 링크 + 채널 칩·소개 한 줄·「선물 보내기」·「팔로우 취소」), 오른쪽 숫자 판(「팔로우」 N명·「크리에이터 더 찾기」·고양이).
// 빈 상태(0명)는 지금 그림·문구 그대로 왼쪽 칸에.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: CreatorCard = {
  id: "00000000-0000-4000-b000-000000000001",
  name: "하루",
  platform: "치지직",
  tags: ["치지직", "유튜브"],
  channelTitle: "하루의 놀이",
  intro: "게임 방송을 해요.",
  alias: "",
  approvalMinutes: 60,
  faceTone: "var(--face-1)",
  following: true,
  handle: "haru",
  photoPath: null,
};
// 이름은 DB 최대 20자(creators.name char_length 1~20)
const longName = "가나다라마바사아자차카타파하가나다라마바";
const second: CreatorCard = { ...base, id: "00000000-0000-4000-b000-000000000002", name: longName, platform: "", channelTitle: "", intro: "", handle: null };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  saveFollow.mockReset();
  saveFollow.mockResolvedValue("ok");
  // jsdom 에는 <dialog>.showModal·close 가 없다 — 브라우저처럼 열고 닫는다
  const proto = HTMLDialogElement.prototype as unknown as Record<"showModal" | "close", (this: HTMLDialogElement) => void>;
  proto.showModal = function () {
    this.setAttribute("open", "");
  };
  proto.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = () => [...host.querySelectorAll("ul > li")];
const count = () => host.querySelector("[data-follow-count]")?.textContent;
const panel = () => host.querySelector('aside[aria-label="팔로우 요약"]');

describe("팔로우한 크리에이터 — 줄 목록", () => {
  it("한 사람이 한 줄 — 얼굴 · 이름 링크(전체 이름 title) · 채널 칩 · 「채널 이름 · 소개」 · 「선물 보내기」 · 「팔로우 취소」(이름이 붙은 아이콘 버튼)", () => {
    act(() => root.render(<MyFollowingPanel creators={[base, second]} photos={{ [base.id]: "https://example.test/p.webp" }} />));
    expect(rows()).toHaveLength(2);
    const [first, two] = rows();
    // 크리에이터 찾기 카드(배너·뱃지 줄)는 쓰지 않는다
    expect(host.querySelector("[data-card-head]")).toBeNull();

    // 얼굴 — 사진이 있으면 사진, 없으면 얼굴 자리표시(faceTone)
    expect(first!.querySelector("img.face")?.getAttribute("src")).toBe("https://example.test/p.webp");
    expect(two!.querySelector("img.face")).toBeNull();
    expect(two!.querySelector("svg.face")).not.toBeNull();

    const name = first!.querySelector<HTMLAnchorElement>(`a[href="${creatorPagePath(base)}"]`);
    expect(name?.textContent).toBe("하루");
    expect(name?.getAttribute("title")).toBe("하루");
    // 채널 칩은 이름과 같은 줄(이름 링크의 형제)
    expect(name?.parentElement?.querySelector(".ctag")?.textContent).toBe("치지직");
    expect(first!.textContent).toContain("하루의 놀이 · 게임 방송을 해요.");

    const gift = first!.querySelector<HTMLAnchorElement>('[data-card-btn="main"]');
    expect(gift?.textContent).toBe("선물 보내기");
    expect(gift?.getAttribute("href")).toBe(`/gifts/new?creator=${base.id}`);
    const cancel = first!.querySelector<HTMLButtonElement>('[data-card-btn="sub"]');
    expect(cancel?.getAttribute("aria-label")).toBe("하루 팔로우 취소");
    expect(cancel?.getAttribute("title")).toBe("팔로우 취소");
  });

  it("(빈 값·최대 길이) 채널·소개가 없으면 칩·소개 없이, 20자 이름은 그대로 링크 글자와 title 에", () => {
    act(() => root.render(<MyFollowingPanel creators={[second]} />));
    const [row] = rows();
    const name = row!.querySelector<HTMLAnchorElement>(`a[href="${creatorPagePath(second)}"]`);
    expect(name?.textContent).toBe(longName);
    expect(name?.getAttribute("title")).toBe(longName);
    expect(row!.querySelector(".ctag")).toBeNull();
    expect(row!.querySelector(`[aria-label="${longName} 팔로우 취소"]`)).not.toBeNull();
  });

  it("팔로우 취소를 확정하면 그 줄이 빠지고 숫자 판이 줄고, 초점은 제목으로", async () => {
    await act(async () => root.render(<MyFollowingPanel creators={[base, second]} />));
    expect(count()).toBe("2명");
    await act(async () => rows()[0]!.querySelector<HTMLButtonElement>('[data-card-btn="sub"]')!.click());
    const confirm = [...host.querySelectorAll("dialog button")].find((b) => b.textContent === "취소하기") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(saveFollow).toHaveBeenLastCalledWith(base.id, false);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain(longName);
    expect(count()).toBe("1명");
    expect(document.activeElement).toBe(host.querySelector("h1"));
  });

  it("(실패경로) 저장에 실패하면 줄이 남고 숫자도 그대로다", async () => {
    saveFollow.mockResolvedValue("failed");
    await act(async () => root.render(<MyFollowingPanel creators={[base]} />));
    await act(async () => rows()[0]!.querySelector<HTMLButtonElement>('[data-card-btn="sub"]')!.click());
    const confirm = [...host.querySelectorAll("dialog button")].find((b) => b.textContent === "취소하기") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(rows()).toHaveLength(1);
    expect(count()).toBe("1명");
  });
});

describe("팔로우한 크리에이터 — 숫자 판", () => {
  it("「팔로우」 · 숫자 + 「명」 · 「크리에이터 더 찾기」(크리에이터 찾기로) · 고양이(꾸밈이라 읽지 않음)", () => {
    act(() => root.render(<MyFollowingPanel creators={[base, second]} />));
    const p = panel();
    expect(p).not.toBeNull();
    expect(p!.textContent).toContain("팔로우");
    expect(count()).toBe("2명");
    const more = [...p!.querySelectorAll("a")].find((a) => a.textContent === "크리에이터 더 찾기");
    expect(more?.getAttribute("href")).toBe("/creators");
    const cat = p!.querySelector("img");
    expect(cat?.getAttribute("alt")).toBe("");
    expect(cat?.getAttribute("aria-hidden")).toBe("true");
    // 제목 옆 숫자·머리 버튼은 숫자 판으로 옮겼다 — 제목은 글자만
    expect(host.querySelector("h1")?.textContent).toBe("팔로우한 크리에이터");
  });
});

describe("팔로우한 크리에이터 — 빈 상태(0명)", () => {
  it("줄 목록 대신 지금 그림·문구 그대로, 숫자 판은 0명", () => {
    act(() => root.render(<MyFollowingPanel creators={[]} />));
    expect(host.querySelector("ul")).toBeNull();
    expect(host.querySelector('img[src="/img/illust-empty-follow.png"]')).not.toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe("아직 팔로우한 크리에이터가 없어요");
    expect(host.textContent).toContain("좋아하는 크리에이터를 팔로우하면 여기에 모아 두고, 바로 선물을 보낼 수 있어요.");
    const go = [...host.querySelectorAll("a")].find((a) => a.textContent === "나의 크리에이터 찾으러 가기");
    expect(go?.getAttribute("href")).toBe("/creators");
    expect(count()).toBe("0명");
  });
});
