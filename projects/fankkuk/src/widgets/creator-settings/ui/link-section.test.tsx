import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { LinkSection } from "./link-section";

// 설정의 선물 링크 칸 (creator-link INV-E4·E10). 잠금 남은 날이 보이는지, 공지 이미지 내려받기가 언제 보이는지, 읽어 주는 연결이 맞는지 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const handleInput = () => host.querySelector<HTMLInputElement>("#link-handle");
const describedTexts = (el: Element | null) =>
  (el?.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => host.querySelector(`#${id}`));

async function render(props: Parameters<typeof LinkSection>[0]) {
  act(() => root.render(<LinkSection {...props} />));
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

describe("INV-E4: 아이디 잠금 남은 날", () => {
  it("INV-E4 S4 (실패경로): 잠겨 있으면 남은 날이 칸 안내로 보이고, 입력은 막히고 바꾸기 버튼이 없다", async () => {
    await render({ initial: { handle: "haru", lockedDays: 12, photoPath: null }, photoBase: "http://photo.test", verified: true });
    const hint = host.querySelector("#link-handle-hint");
    expect(hint?.textContent).toBe("링크 주소는 12일 뒤에 바꿀 수 있어요.");
    expect(handleInput()?.disabled).toBe(true);
    expect(describedTexts(handleInput())).toContain(hint);
    expect(button("링크 주소 바꾸기")).toBeUndefined();
  });

  it("INV-E4: 잠금이 없으면 바꾸기 버튼이 있고, 안내에 남은 날 대신 꼴과 주소 앞부분이 보인다", async () => {
    await render({ initial: { handle: "haru", lockedDays: 0, photoPath: null }, photoBase: "http://photo.test", verified: true });
    expect(handleInput()?.disabled).toBe(false);
    expect(button("링크 주소 바꾸기")).toBeDefined();
    const hint = host.querySelector("#link-handle-hint")?.textContent ?? "";
    expect(hint).not.toMatch(/일 뒤에/);
    // 화면에 보이는 「fankkuk.kr/」 앞부분을 읽어 주는 안내에도 넣는다
    expect(hint).toContain("fankkuk.kr/");
  });

  it("INV-E4: 지금 주소와 같은 값(대소문자·앞뒤 공백만 다름)은 확인 창 없이 「같아요」", async () => {
    await render({ initial: { handle: "haru", lockedDays: 0, photoPath: null }, photoBase: "http://photo.test", verified: true });
    const input = handleInput()!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "  HARU ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("링크 주소 바꾸기")!.click());
    expect(host.querySelector("#link-msg")?.textContent).toContain("지금 쓰는 링크 주소와 같아요.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("INV-E10: 공지 이미지 내려받기", () => {
  it("INV-E10 S10 (실패경로): 링크 주소가 없거나 본인 확인 전이면 내려받기가 없다", async () => {
    await render({ initial: { handle: null, lockedDays: 0, photoPath: null }, photoBase: "http://photo.test", verified: true });
    expect(host.querySelector("a[href='/api/creator/notice-image']")).toBeNull();
    act(() => root.render(<LinkSection initial={{ handle: "haru", lockedDays: 0, photoPath: null }} photoBase="http://photo.test" verified={false} />));
    expect(host.querySelector("a[href='/api/creator/notice-image']")).toBeNull();
  });

  it("INV-E10 S10: 링크 주소가 있고 본인 확인을 마쳤으면 내려받기가 있다", async () => {
    await render({ initial: { handle: "haru", lockedDays: 0, photoPath: null }, photoBase: "http://photo.test", verified: true });
    expect(host.querySelector("a[href='/api/creator/notice-image']")?.textContent?.trim()).toBe("내려받기");
  });
});

describe("INV-E9: 사진 오류를 파일 칸과 이어 읽어 준다", () => {
  it("INV-E9 (실패경로): 사진 없이 올리기를 누르면 오류 문구가 나오고, 파일 칸이 그 문구를 설명으로 가리킨다", async () => {
    await render({ initial: { handle: null, lockedDays: 0, photoPath: null }, photoBase: "http://photo.test", verified: true });
    await act(async () => button("사진 올리기")!.click());
    const file = host.querySelector("#link-photo");
    const described = describedTexts(file).map((el) => el?.textContent ?? "");
    expect(described.some((t) => t.includes("올릴 사진을 먼저 골라 주세요."))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
