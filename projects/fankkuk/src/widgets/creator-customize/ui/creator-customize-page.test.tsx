import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_LOOK } from "@/entities/creator/model/link-images";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreatorCustomizePage, type CreatorCustomizeProps } from "./creator-customize-page";

// 「내 팬꾹 꾸미기」 화면 (creator-link INV-E10, 디자인 기준 10절). 팬덤 심볼(INV-E12)은 상세 설정(widgets/creator-settings/ui/fandom-section.test.tsx)으로 옮겼다. 서버로 보내는 길(fetch)만 가짜로 두고 화면이 무엇을 막고 무엇을 보내는지 본다.

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

const base: CreatorCustomizeProps = {
  creatorId: ID,
  verified: true,
  handle: "haru",
  name: "하루",
  photoPath: null,
  look: NO_LOOK,
  photoBase: "http://photo.test",
  siteOrigin: "http://app.test",
};

async function render(patch: Partial<CreatorCustomizeProps> = {}) {
  act(() => root.render(<CreatorCustomizePage {...base} {...patch} />));
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

describe("INV-E10: 링크 미리보기 이미지 고르기", () => {
  it("INV-E10 (실패경로): 심볼이 없으면 팬덤 심볼을 고를 수 없고 까닭이 보인다", async () => {
    await render();
    const symbol = host.querySelector<HTMLInputElement>("input[name='cz-og'][value='symbol']")!;
    expect(symbol.disabled).toBe(true);
    expect(host.querySelector(`#${symbol.getAttribute("aria-describedby")}`)?.textContent).toBe("심볼을 올리면 고를 수 있어요");
    // 심볼을 올리는 곳(상세 설정 · 팬덤)으로 가는 링크가 그 문장에 걸려 있다
    expect(host.querySelector("a[href='/creator/settings#fandom']")?.textContent).toBe("심볼을 올리면");
  });

  it("INV-E10: 심볼이 있으면 고를 수 있고 고르는 즉시 저장한다", async () => {
    await render({ look: { bgPath: null, symbolPath: `${ID}/sym-1.webp`, previewPick: "photo" } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const symbol = host.querySelector<HTMLInputElement>("input[name='cz-og'][value='symbol']")!;
    expect(symbol.disabled).toBe(false);
    await act(async () => symbol.click());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, JSON.parse(String(init.body))]).toEqual(["/api/creator/preview-pick", { pick: "symbol" }]);
    expect(host.querySelector<HTMLInputElement>("input[name='cz-og'][value='symbol']")!.checked).toBe(true);
  });
});

describe("INV-E10: 고르기를 빠르게 두 번 눌러도 마지막 화면 값과 저장 값이 같다", () => {
  it("INV-E10: 저장하는 동안 다른 쪽을 눌러도 보내지 않는다 — 첫 요청이 실패하면 저장된 값(프로필 사진)으로 돌아간다", async () => {
    await render({ look: { bgPath: null, symbolPath: `${ID}/sym-1.webp`, previewPick: "photo" } });
    let answer: (r: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (answer = r)));
    const radio = (v: string) => host.querySelector<HTMLInputElement>(`input[name='cz-og'][value='${v}']`)!;
    await act(async () => radio("symbol").click());
    await act(async () => radio("photo").click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(radio("symbol").checked).toBe(true);
    await act(async () => answer(new Response(JSON.stringify({ message: "잠시 뒤 다시 해 주세요." }), { status: 400 })));
    expect([radio("photo").checked, host.querySelector("#cz-pick-msg")?.textContent]).toEqual([true, "잠시 뒤 다시 해 주세요."]);
    // 끝난 뒤에는 다시 고를 수 있다
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => radio("symbol").click());
    expect([fetchMock.mock.calls.length, radio("symbol").checked]).toEqual([2, true]);
  });
});

describe("INV-E10: 공지 이미지 받기", () => {
  it("INV-E10 S10: 세 크기마다 내려받기와 링크 복사 — 주소는 공개 공지 이미지 주소", async () => {
    await render();
    const links = [...host.querySelectorAll<HTMLAnchorElement>("a[download]")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([`/api/notice/${ID}?size=square&download=1`, `/api/notice/${ID}?size=story&download=1`, `/api/notice/${ID}?size=wide&download=1`]);
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "링크 복사")).toHaveLength(3);
  });

  it("INV-E10 S10 (실패경로): 링크 주소가 없거나 본인 확인 전이면 받기가 없다", async () => {
    await render({ handle: null });
    expect(host.querySelector("a[download]")).toBeNull();
    await render({ verified: false });
    expect(host.querySelector("a[download]")).toBeNull();
  });
});

describe("배치 (design-rules 27절 「4파트 나머지 다섯 화면」 다섯째, 시안 pilot-2026-10-22/customize.html)", () => {
  it("2026-10-22: 프로필 카드 미리보기·접기 버튼이 없다 — 이 화면에서 바꿀 입력이 없어서 뺐다", async () => {
    await render({ look: { bgPath: `${ID}/bg-1.webp`, symbolPath: `${ID}/sym-1.webp`, previewPick: "photo" } });
    expect(host.querySelector("aside")).toBeNull();
    expect(host.querySelector("[data-creator-colors]")).toBeNull();
    expect(host.querySelector(`img[src*="bg-"]`)).toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "접기" || b.textContent === "펴기")).toBe(false);
    // 프로필 카드 안 모양만인 「선물 보내기」 버튼도 없다
    expect([...host.querySelectorAll("span, button, a")].some((x) => x.textContent === "선물 보내기")).toBe(false);
  });

  it("2026-10-22: 공유 카드는 「링크 미리보기 이미지」 묶음 안, 라디오와 결과 줄 바로 뒤에 있다", async () => {
    await render();
    const group = host.querySelector("section[aria-labelledby='h-og']")!;
    const radios = group.querySelector("[role='radiogroup']")!;
    const msg = group.querySelector("#cz-pick-msg")!;
    const cap = [...group.querySelectorAll("p")].find((x) => x.textContent === "링크를 공유하면 이렇게 보여요");
    expect(cap).toBeDefined();
    expect(radios.compareDocumentPosition(msg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(msg.compareDocumentPosition(cap!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.querySelector("[data-share-card]")?.textContent).toContain("하루 · 팬꾹");
  });

  it("2026-10-22: 공유 카드 그림은 고른 쪽 — 팬덤 심볼을 고르면 심볼 그림", async () => {
    await render({ photoPath: `${ID}/photo-1.webp`, look: { bgPath: null, symbolPath: `${ID}/sym-1.webp`, previewPick: "symbol" } });
    const img = host.querySelector<HTMLImageElement>("[data-share-card] img")!;
    expect(img.getAttribute("src")).toContain("sym-1");
  });

  it("2026-10-22: 머리 설명은 한 문장 — 「바꾸는 즉시 미리보기에서…」는 없다", async () => {
    await render();
    expect(host.querySelector(".ph-desc")?.textContent).toBe("팬이 보게 될 내 선물 링크 페이지를 직접 다듬어요.");
  });

  it("2026-10-22: 공지 이미지를 받을 수 없으면 안내 속 「설정」이 상세 설정의 선물 링크 칸으로 가는 링크", async () => {
    await render({ handle: null });
    const a = [...host.querySelectorAll<HTMLAnchorElement>("a")].find((x) => x.textContent === "「설정」");
    expect(a?.getAttribute("href")).toBe("/creator/settings#link");
    expect(a?.closest("p")?.textContent).toBe("본인 확인을 마치고 「설정」에서 링크 주소를 정하면 받을 수 있어요.");
  });

  it("2026-10-22: 받을 수 있으면 세 크기 줄 — 이름·크기·내려받기·링크 복사", async () => {
    await render();
    const rows = [...host.querySelectorAll("section[aria-labelledby='h-notice'] li")];
    expect(rows.map((r) => r.querySelector("[data-size-title]")?.textContent)).toEqual(["정사각", "세로 (스토리용)", "가로"]);
    expect(rows.map((r) => r.querySelector("[data-size-px]")?.textContent)).toEqual(["1080 × 1080", "1080 × 1920", "1200 × 675"]);
    for (const r of rows) expect([...r.querySelectorAll("a, button")].map((x) => x.textContent)).toEqual(["내려받기", "링크 복사"]);
  });

  it("2026-10-16 옮김: 이 화면에는 사진·이름·소개·팬덤 이름·심볼 편집 칸이 없다(프로필 수정·상세 설정으로)", async () => {
    await render();
    expect(host.querySelector("input[type='file']")).toBeNull();
    expect(host.querySelector("input[type='text'], textarea")).toBeNull();
  });
});
