import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { RegisterForm, type CreatorOption } from "./register-form";

// 선물 보내기 폼 — 받기 어려운 품목 안내(hard-items INV-H8)와, 결제 직전에 다시 보는 판정(쉬는 중·이사 중·등록 막기).
// 등록은 DB 가 다시 막지만(INV-H7·B2·V12) 화면이 안내 없이 제출하면 팬은 이유를 모른 채 오류만 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HARU = "00000000-0000-4000-b000-000000000001";
const MOMO = "00000000-0000-4000-b000-000000000002";
const NARU = "00000000-0000-4000-b000-000000000003";
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400 }, medium: { priceKrw: 8900, revgiftPriceKrw: 7400 }, large: { priceKrw: 10900, revgiftPriceKrw: 9400 } };
const today = { year: 2026, month: 10, day: 11 };

function creators(action: "notice" | "block"): CreatorOption[] {
  return [
    { id: HARU, name: "하루", platform: "치지직", approvalMinutes: 60, hardItems: { categories: ["flower"], reason: "many", action } },
    { id: MOMO, name: "모모", platform: "치지직", approvalMinutes: 60 },
    { id: NARU, name: "나루", platform: "치지직", approvalMinutes: 60, receiving: { resumeOn: "2026-10-20", birthday: null, anniversaries: [] } },
  ];
}

let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: "x" }), { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("누를 요소가 없다");
  await act(async () => (el as HTMLElement).click());
  await settle();
}

const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const stepButton = (label: string) => [...host.querySelectorAll("nav button")].find((b) => b.textContent?.includes(label));
const radio = (value: string) => host.querySelector<HTMLInputElement>(`input[type=radio][value="${value}"]`);
const visibleStep = () => [1, 2, 3, 4].filter((n) => !host.querySelector(`#h-${n}`)?.closest("[hidden]"));

async function render(action: "notice" | "block", initialCreatorId = HARU) {
  act(() => root.render(<RegisterForm creators={creators(action)} prices={prices} initialCreatorId={initialCreatorId} onRegistered={() => {}} today={today} />));
  await settle();
}

/** 2단계까지 가서 종류·금속 신고를 고른다. */
async function toStep2(category: string) {
  await click(button("다음"));
  await click(radio(category));
  await click(radio("no"));
}

describe("INV-H8: 「등록 막기」 품목이면 2단계에서 넘어가지 않는다", () => {
  it("INV-H8 S8b (실패경로): 막기 + 꽃이면 「다음」을 눌러도 2단계에 머물고, 포커스는 안내 줄로 간다", async () => {
    await render("block");
    await toStep2("flower");
    await click(button("다음"));
    expect(visibleStep()).toEqual([2]);
    const note = host.querySelector("#hard-note");
    expect(note?.textContent).toContain("하루님이 지금 꽃은 받기 어렵대요. 다른 선물을 골라 주세요.");
    expect(document.activeElement).toBe(note);
  });

  it("INV-H8 S8: 안내만 + 꽃이면 안내가 보이고 3단계로 넘어간다", async () => {
    await render("notice");
    await toStep2("flower");
    expect(host.querySelector("#hard-note")?.textContent).toContain("하루님이 지금 꽃은 받기 어렵대요. 다른 선물을 고르시겠어요?");
    await click(button("다음"));
    expect(visibleStep()).toEqual([3]);
  });

  it("INV-H8: 막기여도 겹치지 않는 종류면 3단계로", async () => {
    await render("block");
    await toStep2("stationery");
    await click(button("다음"));
    expect(visibleStep()).toEqual([3]);
  });
});

describe("결제 직전에 다시 본다 — 4단계까지 간 뒤 크리에이터를 바꾸고 단계 버튼으로 결제에 바로 가도", () => {
  async function toPayWith(category: string) {
    await render("block", MOMO);
    await toStep2(category);
    await click(button("다음"));
    await click(button("다음"));
    expect(visibleStep()).toEqual([4]);
  }

  it("INV-H8 (실패경로): 막힌 품목의 크리에이터로 바꾸면 제출하지 않고 2단계로 돌아가 안내한다", async () => {
    await toPayWith("flower");
    await click(stepButton("크리에이터"));
    await click(radio(HARU));
    await click(stepButton("결제"));
    await click([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("결제하기")));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(visibleStep()).toEqual([2]);
    expect(host.querySelector("#hard-note")?.textContent).toContain("다른 선물을 골라 주세요.");
  });

  it("INV-B2 (실패경로): 쉬는 중인 크리에이터로 바꾸면 제출하지 않고 1단계로 돌아가 안내한다", async () => {
    await toPayWith("stationery");
    await click(stepButton("크리에이터"));
    await click(radio(NARU));
    await click(stepButton("결제"));
    await click([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("결제하기")));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(visibleStep()).toEqual([1]);
    expect(host.querySelector("#creator-error")?.textContent).toContain("잠시 선물 받기를 쉬고 있어요");
  });

  it("막힘이 없으면 결제하기가 서버에 보낸다(위 두 시험이 아무것도 안 보내서 통과한 것이 아님을 확인)", async () => {
    await toPayWith("stationery");
    await click([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("결제하기")));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ creatorId: MOMO, itemCategory: "stationery" });
  });
});
