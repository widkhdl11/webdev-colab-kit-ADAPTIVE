import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// 결제 전 동의 시험용 — 등록 요청은 보냈는지만 본다(결제창으로 넘어가지 않게 실패로 돌려준다)
const registerMock = vi.hoisted(() => vi.fn(async () => ({ ok: false as const, reason: "failed" as const, message: "시험" })));
vi.mock("../api/send-requests", () => ({ registerRevgiftRequest: registerMock }));

import type { RevgiftFollower } from "@/entities/revgift/api/revgift-reads";
import { MAX_REVGIFT_SHARES } from "../model/register-revgift";
import { RevgiftSendForm } from "./send-form";

// 역조공 보내기 — 받을 팬을 팔로워 목록에서 체크로 고른다(reverse-gift INV-R2, 한 번에 10명 INV-R3).
// 10명을 고르면 남은 칸은 잠그되 키보드 포커스는 남긴다(design-rules 2절 「끝에 닿으면 흐리게만 하고 포커스는 남긴다」).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400 }, medium: { priceKrw: 8900, revgiftPriceKrw: 6900 }, large: { priceKrw: 10900, revgiftPriceKrw: 8400 } };

const fanId = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const followersOf = (ns: readonly number[]): RevgiftFollower[] => ns.map((n) => ({ fanId: fanId(n), nickname: `팬${n}` }));
const ELEVEN = Array.from({ length: 11 }, (_, i) => i + 1);

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

function render(followers: readonly RevgiftFollower[]) {
  act(() => root.render(<RevgiftSendForm prices={prices} followers={followers} onRegistered={() => {}} />));
}

/** 닉네임으로 그 줄의 체크 칸 */
function box(nickname: string): HTMLInputElement {
  const label = [...host.querySelectorAll("label")].find((l) => l.textContent?.trim() === nickname);
  const input = label?.querySelector<HTMLInputElement>("input[type=checkbox]");
  if (!input) throw new Error(`${nickname} 칸이 없다`);
  return input;
}

function click(el: HTMLElement) {
  act(() => el.click());
}

const pickedCount = () => host.querySelector("#rv-fans-title")?.textContent;
const totalText = () => [...host.querySelectorAll("p")].find((p) => p.textContent?.startsWith("합계"))?.querySelector("strong")?.textContent;
const payButton = () => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "결제하기");

describe("역조공 받을 팬 고르기 (INV-R2·R3)", () => {
  it("한 번에 고를 수 있는 팬은 10명이다", () => {
    expect(MAX_REVGIFT_SHARES).toBe(10);
  });

  it("팔로워 11명 중 10명을 고르면 남은 칸은 aria-disabled 로 잠기고 포커스는 남으며, 눌러도 체크되지 않는다", () => {
    render(followersOf(ELEVEN));
    for (const n of ELEVEN.slice(0, 10)) click(box(`팬${n}`));
    expect(pickedCount()).toBe("받을 팬 10명");

    const rest = box("팬11");
    expect(rest.getAttribute("aria-disabled")).toBe("true");
    expect(rest.disabled).toBe(false);
    rest.focus();
    expect(document.activeElement).toBe(rest);
    click(rest);
    expect(rest.checked).toBe(false);
    expect(pickedCount()).toBe("받을 팬 10명");

    // 고른 칸은 잠기지 않는다(풀 수 있다)
    expect(box("팬1").getAttribute("aria-disabled")).toBeNull();
    const max = host.querySelector("#rv-fans-max");
    expect(max?.textContent).toContain("10명을 모두 골랐어요");
    expect(max?.getAttribute("aria-live")).toBe("polite");
  });

  it("체크 칸마다 최대 인원 안내(#rv-fans-max)를 설명으로 단다", () => {
    render(followersOf([1, 2]));
    for (const n of [1, 2]) expect(box(`팬${n}`).getAttribute("aria-describedby")).toBe("rv-fans-max");
  });

  it("(실패경로) 체크했다 풀면 0명·0원이고 결제 버튼이 잠긴다", () => {
    render(followersOf([1, 2]));
    click(box("팬1"));
    expect(pickedCount()).toBe("받을 팬 1명");
    expect(totalText()).toBe("5,400원");
    expect(payButton()?.disabled).toBe(false);
    click(box("팬1"));
    expect(pickedCount()).toBe("받을 팬 0명");
    expect(totalText()).toBe("0원");
    expect(payButton()?.disabled).toBe(true);
  });

  it("체크 목록은 「받을 팬」 묶음(fieldset·legend)이다", () => {
    render(followersOf([1, 2]));
    const set = box("팬1").closest("fieldset");
    expect(set?.querySelector(":scope > legend")?.textContent).toBe("받을 팬");
  });

  it("팔로워가 없으면 상자 크기 안내를 숨긴다 — 있으면 보인다", () => {
    render([]);
    expect(host.textContent).toContain("아직 나를 팔로우한 팬이 없어요");
    expect(host.textContent).not.toContain("상자는 팬마다 고를 수 있어요");
    render(followersOf([1]));
    expect(host.textContent).toContain("상자는 팬마다 고를 수 있어요");
  });

  it("(실패경로) 목록에서 빠졌던 팬이 다시 나타나도 고른 팬은 10명을 넘지 않는다", () => {
    render(followersOf(ELEVEN));
    for (const n of ELEVEN.slice(0, 10)) click(box(`팬${n}`));
    // 팬1 이 팔로우를 끊어 화면을 다시 그렸다 → 9명, 그 자리에 팬11 을 고른다
    render(followersOf(ELEVEN.slice(1)));
    expect(pickedCount()).toBe("받을 팬 9명");
    click(box("팬11"));
    expect(pickedCount()).toBe("받을 팬 10명");
    // 팬1 이 다시 팔로우해 목록에 돌아왔다 — 예전 체크가 되살아나 11명이 되면 안 된다
    render(followersOf(ELEVEN));
    expect(pickedCount()).toBe("받을 팬 10명");
    expect(box("팬1").checked).toBe(false);
  });
});

describe("결제 전 동의 — 이용약관·개인정보처리방침·취소·환불 규정", () => {
  it("(실패경로) 동의 칸을 체크하지 않고 결제하기를 누르면 등록 요청을 보내지 않고 안내가 보인다", async () => {
    registerMock.mockClear();
    render(followersOf([1]));
    click(box("팬1"));
    await act(async () => payButton()!.click());
    expect(registerMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("결제 전에 이용약관과 취소·환불 규정을 확인하고 동의해 주세요.");
    expect(document.activeElement).toBe(host.querySelector("#rv-consent"));
  });

  it("동의 칸을 체크하면 등록 요청을 보낸다", async () => {
    registerMock.mockClear();
    render(followersOf([1]));
    click(box("팬1"));
    click(host.querySelector<HTMLInputElement>("#rv-consent")!);
    await act(async () => payButton()!.click());
    expect(registerMock).toHaveBeenCalledTimes(1);
  });
});
