import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { badgeBorderOf, THEME_COLORS, type ThemeColor } from "@/entities/creator/model/creator-color";
import badgeStyles from "@/entities/creator/ui/creator-head.module.css";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { coverPastel } from "@/entities/creator/lib/cover-pastel";
import { FandomSection, type FandomSectionProps } from "./fandom-section";

// 상세 설정 · 팬덤 (creator-link INV-E12·E13·E14, design-rules 12절). 서버로 보내는 길(fetch)만 가짜로 두고 화면이 무엇을 막고 무엇을 보내는지 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "00000000-0000-4000-b000-000000000001";
let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const base: FandomSectionProps = {
  fanName: "달빛지기",
  colors: { personal: null },
  publicName: "하루",
  initial: "하",
  photoUrl: null,
  backgroundUrl: null,
  symbolUrl: null,
  photoBase: "http://photo.test",
  card: { creatorId: ID, channelTitle: "하루의 놀이터", intro: "게임 방송을 해요.", tags: ["치지직"], approvalMinutes: 180, faceTone: "" },
};

async function render(patch: Partial<FandomSectionProps> = {}) {
  act(() => root.render(<FandomSection {...base} {...patch} />));
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

async function choose(input: HTMLInputElement, file: File) {
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

const symbolFile = () => host.querySelector<HTMLInputElement>("#fd-sym")!;
const rights = () => host.querySelector<HTMLInputElement>("#fd-rights")!;
const swatches = () => [...host.querySelectorAll<HTMLInputElement>("input[name='fd-theme']")];
const swatch = (value: string) => swatches().find((i) => i.value === value)!;
const saveBtn = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "저장")!;

describe("INV-E12: 팬마크(팬덤 심볼)는 권리 확인 체크 뒤에만 — 시안에 체크가 없어도 둔다", () => {
  it("INV-E12 (실패경로): 체크 전에는 파일 칸이 꺼져 있고, 꺼진 까닭(권리 확인 문구)을 설명으로 읽어 준다", async () => {
    await render();
    expect(symbolFile().disabled).toBe(true);
    expect((symbolFile().getAttribute("aria-describedby") ?? "").split(" ")).toContain("fd-sym-right");
    expect(host.querySelector("#fd-sym-right")?.textContent).toBe("내가 만들었거나 쓸 권리가 있는 이미지예요");
    expect([...host.querySelectorAll("button")].some((b) => /신고/.test(b.textContent ?? ""))).toBe(false);
  });

  it("INV-E12: 체크하면 칸이 켜지고, 올릴 때 체크가 요청에 같이 실린다", async () => {
    await render();
    await act(async () => rights().click());
    expect(symbolFile().disabled).toBe(false);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ path: `${ID}/sym-1.webp` }), { status: 200 }));
    await choose(symbolFile(), new File([new Uint8Array([1, 2, 3])], "sym.png", { type: "image/png" }));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/creator/image/symbol");
    expect((init.body as FormData).get("rights")).toBe("1");
    expect(host.querySelector("#fd-sym-msg")?.textContent).toBe("팬마크를 올렸어요.");
    // 올린 마크가 미리보기 뱃지에 들어간다
    expect(host.querySelector(`[data-fandom-badge] img[src*="sym-1.webp"]`)).not.toBeNull();
  });
});

describe("INV-E13: 테마 색은 8색 견본 + 「선택 안 함」, 저장은 팬덤 이름·테마 색만(크리에이터 ID·팬컬러 없이)", () => {
  it("INV-E13 S12: 견본은 8색(정본 순서) + 「선택 안 함」 한 무리 라디오 — 직접 입력 칸·팬컬러 칸은 없다", async () => {
    await render();
    expect(swatches().map((i) => i.value)).toEqual([...THEME_COLORS, ""]);
    expect(host.querySelector("[role='radiogroup']")?.getAttribute("aria-labelledby")).toBe("fd-theme-l");
    expect(host.querySelector("#fd-theme-l")?.textContent).toBe("테마 색");
    expect(swatch("").checked).toBe(true);
    expect(host.querySelector("input[type='color']")).toBeNull();
    expect(host.querySelector("input[type='text'][maxlength='7']")).toBeNull();
    expect(host.textContent).not.toContain("팬컬러");
    expect(host.textContent).not.toContain("퍼스널 컬러");
  });

  it("INV-E13 S12: 견본을 고르면 본문은 fanName·personalColor 둘뿐(팬컬러 없음)이고 미리보기 카드·뱃지에 그 색", async () => {
    await render();
    await act(async () => swatch("#DCEBFF").click());
    expect(swatch("#DCEBFF").checked).toBe(true);
    for (const b of host.querySelectorAll<HTMLElement>("[data-fandom-badge]")) expect(b.style.getPropertyValue("--personal")).toBe("#DCEBFF");
    expect(host.querySelector<HTMLElement>("[data-card-head]")?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, JSON.parse(String(init.body))]).toEqual(["/api/creator/profile", { fanName: "달빛지기", personalColor: "#DCEBFF" }]);
  });

  it("INV-E13 S12: 「선택 안 함」은 기본 모양으로 되돌리기(빈 문자열)", async () => {
    await render({ colors: { personal: "#DCEBFF" } });
    expect(swatch("#DCEBFF").checked).toBe(true);
    await act(async () => swatch("").click());
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ fanName: "달빛지기", personalColor: "" });
  });

  it("INV-E13 S12c (실패경로): 8색 밖 값(옛 #1E3A8A)이 들어와도 견본은 하나도 고르지 않고 미리보기에도 그리지 않는다", async () => {
    await render({ colors: { personal: "#1E3A8A" as ThemeColor } });
    expect(swatches().some((i) => i.checked && i.value !== "")).toBe(false);
    expect(host.innerHTML).not.toContain("#1E3A8A");
    expect(host.querySelector<HTMLElement>("[data-card-head]")?.style.getPropertyValue("--personal")).toBe("");
  });

  it("INV-E13: 「되돌리기」는 저장된 색으로 돌아간다", async () => {
    await render({ colors: { personal: "#FFF1B8" } });
    await act(async () => swatch("#E6E0FF").click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "되돌리기")!.click());
    expect(swatch("#FFF1B8").checked).toBe(true);
  });
});

describe("카드 미리보기 — 찾기 화면 카드 그대로(design-rules 17절)", () => {
  it("INV-E13: 채널 이름·소개 · 칩 · 실제 평균 승인 시간 · 누를 수 없는 「팔로우」 모양, 링크 없음", async () => {
    await render();
    const card = host.querySelector<HTMLElement>("[data-card-preview]")!;
    expect(card.textContent).toContain("하루의 놀이터 · 게임 방송을 해요.");
    expect(card.textContent).toContain("치지직");
    expect(card.querySelector("[data-card-foot]")?.textContent).toBe(`${approvalTimeText(180)}팔로우`);
    expect(card.querySelector("a, button")).toBeNull();
  });

  it("INV-E13: 테마 색이 없으면 실제 카드처럼 크리에이터 ID 파스텔, 고르면 그 색", async () => {
    await render();
    const cover = () => host.querySelector<HTMLElement>("[data-card-preview] [data-card-cover]")!;
    expect(cover().style.getPropertyValue("--pastel")).toBe(coverPastel(ID));
    await act(async () => swatch("#D3F0EC").click());
    expect(host.querySelector<HTMLElement>("[data-card-preview] [data-card-head]")?.style.getPropertyValue("--personal")).toBe("#D3F0EC");
  });
});

describe("INV-E14: 팬덤 뱃지는 테마 색 — 글자는 #111827 고정(CSS), 글자색 안내 없음", () => {
  it("INV-E14 S13: 테마 색이 없으면 기본 뱃지, 고르면 미리보기 뱃지 모두 테마 모양(.fbTheme) · 테두리 변수 · 글자색 안내는 없다", async () => {
    await render();
    const badges = () => Array.from(host.querySelectorAll<HTMLElement>("[data-fandom-badge]"));
    expect(badges().length).toBeGreaterThan(0);
    for (const b of badges()) expect(b.classList.contains(badgeStyles.fbTheme)).toBe(false);
    for (const c of ["#FDE2E4", "#F6DFF0"]) {
      await act(async () => swatch(c).click());
      for (const b of badges()) {
        expect(b.classList.contains(badgeStyles.fbTheme), c).toBe(true);
        expect(b.style.getPropertyValue("--personal"), c).toBe(c);
        expect(b.style.getPropertyValue("--personal-line"), c).toBe(badgeBorderOf(c as ThemeColor));
      }
    }
    expect(host.textContent).not.toMatch(/(검정|흰색) 글자 · 대비/);
    expect(host.textContent).not.toContain("저절로 바뀌어요");
  });
});
