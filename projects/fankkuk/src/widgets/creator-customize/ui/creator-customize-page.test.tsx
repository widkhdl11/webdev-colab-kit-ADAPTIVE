import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_LOOK } from "@/entities/creator/model/link-images";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreatorCustomizePage, type CreatorCustomizeProps } from "./creator-customize-page";

// 「내 팬꾹 꾸미기」 화면 (creator-link INV-E9·E10·E12, 디자인 기준 10절). 서버로 보내는 길(fetch)만 가짜로 두고 화면이 무엇을 막고 무엇을 보내는지 본다.

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
  intro: "느긋한 방송",
  fanName: "",
  photoPath: null,
  look: NO_LOOK,
  photoBase: "http://photo.test",
  siteOrigin: "http://app.test",
};

async function render(patch: Partial<CreatorCustomizeProps> = {}) {
  act(() => root.render(<CreatorCustomizePage {...base} {...patch} />));
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

const symbolFile = () => host.querySelector<HTMLInputElement>("#cz-sym")!;
const rights = () => host.querySelector<HTMLInputElement>("#cz-rights")!;

async function choose(input: HTMLInputElement, file: File) {
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("INV-E12: 팬덤 심볼은 권리 확인 체크 뒤에만", () => {
  it("INV-E12 (실패경로): 체크 전에는 심볼 파일 칸이 꺼져 있고, 꺼진 까닭(권리 확인 문구)을 설명으로 읽어 준다", async () => {
    await render();
    expect(symbolFile().disabled).toBe(true);
    expect((symbolFile().getAttribute("aria-describedby") ?? "").split(" ")).toContain("cz-sym-right");
    expect(host.querySelector("#cz-sym-right")?.textContent).toBe("내가 만들었거나 쓸 권리가 있는 이미지예요");
    // 신고 버튼은 없다(사용자 2026-10-14)
    expect([...host.querySelectorAll("button")].some((b) => /신고/.test(b.textContent ?? ""))).toBe(false);
  });

  it("INV-E12: 체크하면 칸이 켜지고, 올릴 때 체크가 요청에 같이 실린다", async () => {
    await render();
    await act(async () => rights().click());
    expect(symbolFile().disabled).toBe(false);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ path: `${ID}/sym-1.webp` }), { status: 200 }));
    await choose(symbolFile(), new File([new Uint8Array([1, 2, 3])], "sym.png", { type: "image/png" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/creator/image/symbol");
    expect((init.body as FormData).get("rights")).toBe("1");
    expect(host.querySelector("#cz-sym-msg")?.textContent).toBe("팬덤 심볼을 올렸어요.");
  });
});

describe("INV-E10: 링크 미리보기 이미지 고르기", () => {
  it("INV-E10 (실패경로): 심볼이 없으면 팬덤 심볼을 고를 수 없고 까닭이 보인다", async () => {
    await render();
    const symbol = host.querySelector<HTMLInputElement>("input[name='cz-og'][value='symbol']")!;
    expect(symbol.disabled).toBe(true);
    expect(host.querySelector(`#${symbol.getAttribute("aria-describedby")}`)?.textContent).toBe("심볼을 올리면 고를 수 있어요");
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

  it("INV-E10·E12: 심볼을 지우면 미리보기 고르기는 서버가 돌려준 값으로 바뀐다", async () => {
    await render({ look: { bgPath: null, symbolPath: `${ID}/sym-1.webp`, previewPick: "symbol" } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ path: null, previewPick: "photo" }), { status: 200 }));
    const symGroup = host.querySelector("[aria-labelledby='cz-sym-t']")!;
    const removeBtn = [...symGroup.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "지우기")!;
    await act(async () => {
      removeBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/creator/image/symbol");
    expect(host.querySelector<HTMLInputElement>("input[name='cz-og'][value='photo']")!.checked).toBe(true);
    // 다시 올려도 DB 의 고르기는 프로필 사진이다 — 화면이 지우기 전 값(심볼)을 들고 있으면 여기서 심볼이 켜진다
    await act(async () => rights().click());
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ path: `${ID}/sym-2.webp`, previewPick: "photo" }), { status: 200 }));
    await choose(symbolFile(), new File([new Uint8Array([1, 2, 3])], "sym.png", { type: "image/png" }));
    expect([host.querySelector<HTMLInputElement>("input[name='cz-og'][value='photo']")!.checked, host.querySelector<HTMLInputElement>("input[name='cz-og'][value='symbol']")!.checked]).toEqual([true, false]);
  });
});

describe("INV-A9: 이 화면은 자기가 고치는 칸만 보낸다", () => {
  it("INV-A9: 저장 본문은 공개 이름·한 줄 소개·팬을 부르는 이름 — 찾기 노출은 보내지 않는다(다른 화면의 칸을 덮어쓰지 않게)", async () => {
    await render();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "저장")!;
    await act(async () => save.click());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, JSON.parse(String(init.body))]).toEqual(["/api/creator/profile", { name: "하루", intro: "느긋한 방송", fanName: "" }]);
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

describe("미리보기", () => {
  it("INV-E7: 고친 이름·소개·팬덤 이름이 저장 전에도 미리보기에 보인다 — 배경사진이 없으면 그림 없이 단색 칸", async () => {
    await render();
    const input = host.querySelector<HTMLInputElement>("#cz-fan")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "꿀벌단");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const preview = host.querySelector("aside")!;
    expect(preview.textContent).toContain("꿀벌단 여러분의 마음 늘 감사해요");
    expect(preview.textContent).toContain("fankkuk.kr/haru");
    expect(preview.querySelector(`img[src*="bg-"]`)).toBeNull();
  });
});
