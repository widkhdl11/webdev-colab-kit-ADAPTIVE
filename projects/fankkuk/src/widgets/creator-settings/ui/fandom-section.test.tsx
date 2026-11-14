import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { badgeBorderOf, THEME_COLORS, type ThemeColor } from "@/entities/creator/model/creator-color";
import badgeStyles from "@/entities/creator/ui/creator-head.module.css";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { FandomDraftProvider, FandomForm, FandomPreview, type FandomFormProps, type FandomPreviewProps } from "./fandom-section";

// 팬덤 구역 (creator-link INV-E12·E13·E14, design-rules 12절) — 2026-11-13 프로필 수정 「채널」 탭으로 옮기며 입력 판(FandomForm)과 카드 미리보기(FandomPreview)로 나눴다.
// 둘은 FandomDraftProvider 의 입력 중 값을 같이 본다 — 시험은 채널 탭처럼 셋을 함께 그린다. 서버로 보내는 길(fetch)만 가짜로 두고 화면이 무엇을 막고 무엇을 보내는지 본다.

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

type Props = FandomFormProps & FandomPreviewProps & { symbolUrl: string | null };
const base: Props = {
  fanName: "달빛지기",
  colors: { personal: null },
  publicName: "하루",
  photoUrl: null,
  backgroundUrl: null,
  symbolUrl: null,
  photoBase: "http://photo.test",
  card: { creatorId: ID, channelTitle: "하루의 놀이터", intro: "게임 방송을 해요.", tags: ["치지직"], approvalMinutes: 180, faceTone: "" },
};

async function render(patch: Partial<Props> = {}) {
  const p = { ...base, ...patch };
  act(() =>
    root.render(
      <FandomDraftProvider fanName={p.fanName} colors={p.colors} symbolUrl={p.symbolUrl}>
        <div data-col="main">
          <FandomForm fanName={p.fanName} colors={p.colors} photoBase={p.photoBase} />
        </div>
        <FandomPreview publicName={p.publicName} photoUrl={p.photoUrl} backgroundUrl={p.backgroundUrl} card={p.card} />
      </FandomDraftProvider>,
    ),
  );
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
/** 글자 칸에 값을 넣는다 — React 가 듣는 input 사건까지 */
function typeInto(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const saveBtn = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "저장")!;

describe("INV-E12: 팬마크(팬덤 심볼)는 권리 확인 체크 뒤에만 — 시안에 체크가 없어도 둔다", () => {
  it("INV-E12 (실패경로): 체크 전에는 파일 칸이 꺼져 있고, 꺼진 까닭(권리 확인 문구)을 설명으로 읽어 준다", async () => {
    await render();
    expect(symbolFile().disabled).toBe(true);
    expect((symbolFile().getAttribute("aria-describedby") ?? "").split(" ")).toContain("fd-sym-right");
    expect(host.querySelector("#fd-sym-right")?.textContent).toBe("직접 제작했거나 사용 권한이 있는 이미지입니다");
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
    expect(host.querySelector("#fd-sym-msg")?.textContent).toBe("팬마크가 등록되었습니다.");
    // 올린 마크가 미리보기 뱃지에 들어간다
    expect(host.querySelector(`[data-fandom-badge] img[src*="sym-1.webp"]`)).not.toBeNull();
  });
});

describe("INV-E13: 테마 색은 8색 견본 + 「직접 고르기」 + 「선택 안 함」, 저장은 팬덤 이름·테마 색만(크리에이터 ID·팬컬러 없이)", () => {
  it("INV-E13 S12: 견본은 8색(정본 순서) + 「직접 고르기」 + 「선택 안 함」 한 무리 라디오 — 고르개는 접혀 있고 팬컬러 칸은 없다", async () => {
    await render();
    expect(swatches().map((i) => i.value)).toEqual([...THEME_COLORS, "custom", ""]);
    expect(host.querySelector("[role='radiogroup']")?.getAttribute("aria-labelledby")).toBe("fd-theme-l");
    expect(host.querySelector("#fd-theme-l")?.textContent).toBe("테마 색");
    expect(swatch("").checked).toBe(true);
    expect(host.querySelector("input[type='color']")).toBeNull();
    expect(host.querySelector("#fd-picker")).toBeNull();
    expect(host.querySelector("#fd-hex")).toBeNull();
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

  it("INV-E13 (실패경로): 꼴이 틀린 값(소문자 #dcebff)이 들어와도 견본은 하나도 고르지 않고 미리보기에도 그리지 않는다", async () => {
    await render({ colors: { personal: "#dcebff" as ThemeColor } });
    expect(swatches().some((i) => i.checked && i.value !== "")).toBe(false);
    expect(host.innerHTML).not.toContain("#dcebff");
    expect(host.querySelector<HTMLElement>("[data-card-head]")?.style.getPropertyValue("--personal")).toBe("");
  });

  it("INV-E13 S12: 저장된 색이 8색 밖(#2B4C9B)이면 「직접 고르기」가 골라져 펼쳐 있고 색 코드 칸에 그 색 · 미리보기 뱃지는 흰 글자(INV-E14)", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    expect(swatch("custom").checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>("#fd-hex")?.value).toBe("#2B4C9B");
    expect(host.querySelector<HTMLInputElement>("#fd-fit")?.checked).toBe(false);
    const badge = host.querySelector<HTMLElement>("aside [data-fandom-badge]");
    expect(badge?.style.getPropertyValue("--personal")).toBe("#2B4C9B");
    expect(badge?.style.getPropertyValue("--personal-ink")).toBe("#FFFFFF");
    // 고르개 막대 이름은 한국어로 바꿔 단다
    expect([...host.querySelectorAll("#fd-picker [role='slider']")].map((el) => el.getAttribute("aria-label"))).toEqual(["채도와 밝기", "색상"]);
  });

  it("INV-E13 S12: 「직접 고르기」에서 색 코드를 넣으면(소문자·# 없이도) 그 색 그대로 저장된다", async () => {
    await render();
    await act(async () => swatch("custom").click());
    const hex = host.querySelector<HTMLInputElement>("#fd-hex")!;
    typeInto(hex, "e8467c");
    expect(host.querySelector<HTMLElement>("aside [data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#E8467C");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ fanName: "달빛지기", personalColor: "#E8467C" });
  });

  it("INV-E13 (실패경로): 색 코드 칸에 꼴이 틀린 값(#12·스타일 문장)을 넣으면 저장될 색은 그대로다", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    const hex = host.querySelector<HTMLInputElement>("#fd-hex")!;
    for (const bad of ["#12", "#2B4C9B; x", "#GGGGGG"]) {
      typeInto(hex, bad);
      expect(host.querySelector<HTMLElement>("aside [data-fandom-badge]")?.style.getPropertyValue("--personal"), bad).toBe("#2B4C9B");
    }
  });

  it("INV-E13: 「옅게 맞추기」를 켜면 맞춘 색(#D4DAEA)이 미리보기·「적용 색」·저장 본문에, 끄면 고른 색 그대로", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    const fit = host.querySelector<HTMLInputElement>("#fd-fit")!;
    await act(async () => fit.click());
    const badge = () => host.querySelector<HTMLElement>("aside [data-fandom-badge]");
    expect(badge()?.style.getPropertyValue("--personal")).toBe("#D4DAEA");
    expect(badge()?.style.getPropertyValue("--personal-ink")).toBe("#000000");
    expect(host.querySelector("#fd-picker")?.textContent).toContain("적용 색 #D4DAEA");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ fanName: "달빛지기", personalColor: "#D4DAEA" });
    await act(async () => fit.click());
    expect(badge()?.style.getPropertyValue("--personal")).toBe("#2B4C9B");
    expect(host.querySelector("#fd-picker")?.textContent).not.toContain("적용 색");
  });

  it("INV-E13: 저장 값이 없을 때 「직접 고르기」를 누르면 견본 「하늘」에서 시작하고, 펼친 판은 이름 있는 묶음이다", async () => {
    await render();
    await act(async () => swatch("custom").click());
    expect(host.querySelector<HTMLInputElement>("#fd-hex")?.value).toBe("#DCEBFF");
    const pk = host.querySelector("#fd-picker");
    expect([pk?.getAttribute("role"), pk?.getAttribute("aria-label")]).toEqual(["group", "테마 색 직접 고르기"]);
    expect(swatch("custom").hasAttribute("aria-expanded")).toBe(false);
    expect(pk?.querySelector("[aria-live='polite']")).not.toBeNull();
  });

  it("INV-E13: 색 코드 칸을 떠나면 칸은 마지막으로 받아들인 색으로 돌아간다", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    const hex = host.querySelector<HTMLInputElement>("#fd-hex")!;
    typeInto(hex, "#12");
    act(() => {
      hex.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(hex.value).toBe("#2B4C9B");
  });

  it("INV-E13: 체크를 켠 채 견본으로 갔다가 「직접 고르기」로 돌아오면 다시 맞춘 색이 저장될 색", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    await act(async () => host.querySelector<HTMLInputElement>("#fd-fit")!.click());
    await act(async () => swatch("#DCEBFF").click());
    await act(async () => swatch("custom").click());
    expect(host.querySelector<HTMLElement>("aside [data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#D4DAEA");
  });

  it("INV-E13: 이미 밝은 색은 「옅게 맞추기」를 켜도 그대로이고 「적용 색」 줄도 없다", async () => {
    await render({ colors: { personal: "#FFD6A5" } });
    await act(async () => host.querySelector<HTMLInputElement>("#fd-fit")!.click());
    expect(host.querySelector<HTMLElement>("aside [data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#FFD6A5");
    expect(host.querySelector("#fd-picker")?.textContent).not.toContain("적용 색");
  });

  it("INV-E13: 「직접 고르기」에서 견본으로 돌아가면 고르개가 접히고 견본 색이 저장될 색", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    await act(async () => swatch("#DCEBFF").click());
    expect(host.querySelector("#fd-picker")).toBeNull();
    expect(host.querySelector<HTMLElement>("aside [data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
  });

  it("INV-E13: 「되돌리기」는 저장된 색으로 돌아간다", async () => {
    await render({ colors: { personal: "#FFF1B8" } });
    await act(async () => swatch("#E6E0FF").click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "되돌리기")!.click());
    expect(swatch("#FFF1B8").checked).toBe(true);
  });

  it("INV-E13: 「되돌리기」는 직접 고른 색·「옅게 맞추기」도 저장된 값으로 돌린다", async () => {
    await render({ colors: { personal: "#2B4C9B" } });
    await act(async () => host.querySelector<HTMLInputElement>("#fd-fit")!.click());
    await act(async () => swatch("#E6E0FF").click());
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "되돌리기")!.click());
    expect(swatch("custom").checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>("#fd-fit")?.checked).toBe(false);
    expect(host.querySelector<HTMLElement>("aside [data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#2B4C9B");
  });
});

describe("카드 미리보기 — 찾기 화면 카드 그대로(design-rules 17절)", () => {
  it("미리보기는 카드 하나 — 팬덤 뱃지는 카드 안에 하나뿐, 따로 뱃지 상자를 두지 않는다(2026-10-22 사용자 「카드 3개라 투머치」)", async () => {
    await render();
    const aside = host.querySelector<HTMLElement>("aside[aria-labelledby='pv-t']")!;
    const badges = aside.querySelectorAll("[data-fandom-badge]");
    expect(badges.length).toBe(1);
    expect(aside.querySelector("[data-card-preview]")?.contains(badges[0])).toBe(true);
    // 제목 다음이 곧바로 카드 — 카드를 감싸는 상자가 없다
    expect(aside.querySelector("#pv-t")?.nextElementSibling?.hasAttribute("data-card-preview")).toBe(true);
  });

  it("INV-E13·INV-CN4: 소개(채널 이름 없음) · 아래 띠에 누를 수 없는 「팔로우」 모양(평균 승인 시간 없음), 링크 없음", async () => {
    await render();
    const card = host.querySelector<HTMLElement>("[data-card-preview]")!;
    expect(card.textContent).toContain("게임 방송을 해요.");
    expect(card.textContent).not.toContain("하루의 놀이터");
    expect(card.textContent).toContain("치지직");
    const foot = card.querySelector("[data-card-foot]");
    expect(foot?.textContent).toContain("치지직");
    expect(foot?.textContent).not.toContain("팔로우");
    const acts = foot?.nextElementSibling as HTMLElement | null;
    expect(acts?.hasAttribute("data-card-actions")).toBe(true);
    // 아래 띠가 카드 마지막 자식 — 위 배너와 세트
    expect(card.lastElementChild).toBe(acts);
    expect(acts?.hasAttribute("data-card-band")).toBe(true);
    // 처음 보는 팬에게 보이는 모양 — 「팔로우」 하나(하트 더하기 아이콘)
    expect(Array.from(acts?.children ?? []).map((el) => el.textContent)).toEqual(["팔로우"]);
    expect(acts?.querySelector("svg[data-icon='heart-plus']")).not.toBeNull();
    expect(acts?.hasAttribute("style")).toBe(false);
    expect(card.textContent).not.toContain(approvalTimeText(180));
    expect(card.querySelector("a, button")).toBeNull();
  });

  it("INV-E13: 테마 색이 없으면 실제 카드처럼 기본 회색(색 변수 없음), 고르면 머리에 그 색 — 버튼 줄에는 쓰지 않는다", async () => {
    await render();
    const cover = () => host.querySelector<HTMLElement>("[data-card-preview] [data-card-cover]")!;
    expect(cover().hasAttribute("style")).toBe(false);
    await act(async () => swatch("#D3F0EC").click());
    expect(host.querySelector<HTMLElement>("[data-card-preview] [data-card-head]")?.style.getPropertyValue("--personal")).toBe("#D3F0EC");
    const acts = host.querySelector<HTMLElement>("[data-card-preview] [data-card-actions]")!;
    expect(acts.outerHTML).not.toContain("#D3F0EC");
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

describe("입력 한 판 + 따로 놓는 카드 미리보기(2026-11-13 채널 탭)", () => {
  it("입력 판은 제목 「팬덤」(h2) 하나 아래 소제목 셋(번호 없음), 미리보기는 판 밖 aside — 판 안에 미리보기가 없다", async () => {
    await render();
    const formPanel = host.querySelector("#fandom")!;
    expect(formPanel.querySelector("h2")?.textContent?.trim()).toBe("팬덤");
    expect([...formPanel.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["팬덤 이름4/10", "팬마크", "테마 색"]);
    expect([...host.querySelectorAll("i")].some((i) => /^\d$/.test(i.textContent ?? ""))).toBe(false);
    const aside = host.querySelector("aside[aria-labelledby='pv-t']");
    expect(aside).not.toBeNull();
    expect(formPanel.contains(aside)).toBe(false);
    expect(formPanel.querySelector("[data-card-preview]")).toBeNull();
    expect(aside?.contains(host.querySelector("[data-card-preview]"))).toBe(true);
  });

  it("입력 판에서 팬덤 이름을 바꾸면 따로 놓인 카드 미리보기 뱃지가 따라 바뀐다(같은 입력 중 값을 본다)", async () => {
    await render();
    const input = host.querySelector<HTMLInputElement>("#fd-name")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(input, "별빛");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("aside [data-fandom-badge]")?.textContent).toContain("별빛");
  });

  it("저장 결과 안내(role=status)는 입력 판 끝, 되돌리기·저장 바로 위에 있고 저장하면 그 자리에 뜬다", async () => {
    await render();
    const status = host.querySelector<HTMLElement>("#fd-msg")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.nextElementSibling?.contains(saveBtn())).toBe(true);
    // 입력 판 안이다 — 미리보기(aside) 밖
    expect(status.closest("aside")).toBeNull();
    // 입력 칸과 같은 판의 마지막 칸
    const panel = host.querySelector("#fandom")!;
    expect(status.parentElement?.parentElement).toBe(panel);
    expect(panel.lastElementChild).toBe(status.parentElement);
    expect(status.textContent).toBe("");
    expect(saveBtn().getAttribute("aria-disabled")).toBe("true");
    typeInto(host.querySelector<HTMLInputElement>("#fd-name")!, "하루단");
    expect(saveBtn().getAttribute("aria-disabled")).toBe("false");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => saveBtn().click());
    expect(status.textContent).toBe("저장되었습니다.");
  });
  it("팬마크 칸 묶음은 보이는 소제목으로 이름을 읽는다 — 같은 이름을 숨긴 글자로 한 번 더 두지 않는다", async () => {
    await render();
    const group = symbolFile().closest("[role='group']")!;
    const heading = host.querySelector(`#${group.getAttribute("aria-labelledby")}`);
    expect(heading?.tagName).toBe("H3");
    expect(heading?.textContent).toBe("팬마크");
    expect([...host.querySelectorAll(".sr-only")].some((e) => e.textContent === "팬마크")).toBe(false);
  });
});
