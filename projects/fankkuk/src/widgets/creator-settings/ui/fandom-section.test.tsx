import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import badgeStyles from "@/entities/creator/ui/creator-head.module.css";
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
  colors: { personal: null, fan: null },
  publicName: "하루",
  initial: "하",
  photoUrl: null,
  backgroundUrl: null,
  symbolUrl: null,
  photoBase: "http://photo.test",
};

async function render(patch: Partial<FandomSectionProps> = {}) {
  act(() => root.render(<FandomSection {...base} {...patch} />));
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
const fanHex = () => host.querySelector<HTMLInputElement>("#fd-fan-hex")!;
const perHex = () => host.querySelector<HTMLInputElement>("#fd-per-hex")!;
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

describe("INV-E13: 저장은 팬덤 이름·두 색만, 크리에이터 ID 없이", () => {
  it("INV-E13 S12: 소문자로 적어도 대문자로 보내고, 본문은 fanName·fanColor·personalColor 셋뿐", async () => {
    await render();
    await type(fanHex(), "#fff59d");
    await type(perHex(), "#1e3a8a");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, JSON.parse(String(init.body))]).toEqual(["/api/creator/profile", { fanName: "달빛지기", fanColor: "#FFF59D", personalColor: "#1E3A8A" }]);
  });

  it("INV-E13 S12: 빈 칸은 기본 모양으로 되돌리기(빈 문자열)", async () => {
    await render({ colors: { personal: "#1E3A8A", fan: "#FFF59D" } });
    await type(fanHex(), "");
    await type(perHex(), "");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ fanName: "달빛지기", fanColor: "", personalColor: "" });
  });

  it("INV-E13 S12b (실패경로): 꼴이 틀린 색이면 보내지 않고 그 칸을 틀렸다고 표시한다 · 미리보기에도 쓰지 않는다", async () => {
    await render();
    await type(fanHex(), "#123456; background:url(x)");
    await act(async () => saveBtn().click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fanHex().getAttribute("aria-invalid")).toBe("true");
    // 틀린 칸은 오류 문구를 설명으로 이어 읽고, 초점이 그 칸으로 간다
    expect((fanHex().getAttribute("aria-describedby") ?? "").split(" ")).toContain("fd-msg");
    expect(host.querySelector("#fd-msg")?.textContent).toContain("#RRGGBB");
    expect(document.activeElement).toBe(fanHex());
    // 칸에 적은 글자는 그대로 남지만 어느 요소의 스타일에도 들어가지 않는다
    expect([...host.querySelectorAll("[style]")].map((el) => el.getAttribute("style") ?? "").filter((st) => st.includes("url("))).toEqual([]);
    expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.style.getPropertyValue("--fan")).toBe("");
  });

  it("INV-E13 S12b (실패경로): 퍼스널 컬러만 틀리면 초점이 그 칸으로, 맞는 팬컬러 칸은 오류 문구를 읽지 않는다", async () => {
    await render();
    await type(fanHex(), "#1E3A8A");
    await type(perHex(), "#12");
    await act(async () => saveBtn().click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(perHex());
    expect((perHex().getAttribute("aria-describedby") ?? "").split(" ")).toContain("fd-msg");
    expect((fanHex().getAttribute("aria-describedby") ?? "").split(" ")).not.toContain("fd-msg");
  });

  it("INV-E13: 추천 색을 누르면 그 색이 칸과 미리보기에 들어간다", async () => {
    await render();
    const sw = host.querySelector<HTMLButtonElement>("button[aria-label='팬컬러 #1E3A8A']")!;
    await act(async () => sw.click());
    expect(fanHex().value).toBe("#1E3A8A");
    expect(sw.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.style.getPropertyValue("--fan")).toBe("#1E3A8A");
  });
});

describe("INV-E14: 팬덤 뱃지 글자는 진한 회색 고정 — 팬컬러는 테두리·옅은 면에만", () => {
  it("INV-E14 S13: 팬컬러를 넣으면 미리보기 뱃지 모두 팬컬러 모양(.fbFan)·--fan 그 값이 되고 글자색 변수·안내는 없다", async () => {
    await render();
    const badges = () => Array.from(host.querySelectorAll<HTMLElement>("[data-fandom-badge]"));
    expect(badges().length).toBeGreaterThan(0);
    for (const b of badges()) expect(b.classList.contains(badgeStyles.fbFan)).toBe(false);
    for (const fan of ["#FFF59D", "#1E3A8A"]) {
      await type(fanHex(), fan);
      for (const b of badges()) {
        expect(b.classList.contains(badgeStyles.fbFan), fan).toBe(true);
        expect(b.style.getPropertyValue("--fan"), fan).toBe(fan);
        expect(b.style.getPropertyValue("--on-fan"), fan).toBe("");
      }
    }
    expect(host.textContent).not.toMatch(/(검정|흰색) 글자 · 대비/);
    expect(host.textContent).not.toContain("저절로 바뀌어요");
  });

  it("INV-E14 S13b: 경계 색 #777777 도 거부 없이 보낸다", async () => {
    await render();
    await type(fanHex(), "#777777");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).fanColor).toBe("#777777");
  });
});
