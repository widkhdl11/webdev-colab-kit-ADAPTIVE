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
const prices = { small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 }, medium: { priceKrw: 8900, revgiftPriceKrw: 7400, returnShippingKrw: 5000 }, large: { priceKrw: 10900, revgiftPriceKrw: 9400, returnShippingKrw: 6500 } };
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

/** 결제 전 동의 칸을 체크하고 결제하기를 누른다. */
async function agreeAndPay() {
  const box = host.querySelector<HTMLInputElement>("#pay-consent");
  if (box && !box.checked) await click(box);
  await click([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("결제하기")));
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
    expect(note?.textContent).toContain("꽃은 현재 하루님이 받기 어려운 선물입니다. 다른 선물을 선택해 주세요.");
    expect(document.activeElement).toBe(note);
  });

  it("INV-H8 S8: 안내만 + 꽃이면 안내가 보이고 3단계로 넘어간다", async () => {
    await render("notice");
    await toStep2("flower");
    expect(host.querySelector("#hard-note")?.textContent).toContain("꽃은 현재 하루님이 받기 어려운 선물입니다. 다른 선물을 선택할까요?");
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
    await agreeAndPay();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(visibleStep()).toEqual([2]);
    expect(host.querySelector("#hard-note")?.textContent).toContain("다른 선물을 선택해 주세요.");
  });

  it("INV-B2 (실패경로): 쉬는 중인 크리에이터는 4단계에서 돌아가도 고를 수 없다 — 눌러도 고른 사람이 그대로이고 결제는 원래 고른 사람으로 간다(d113 D-2)", async () => {
    await toPayWith("stationery");
    await click(stepButton("크리에이터"));
    await click(radio(NARU));
    expect(radio(NARU)?.checked).toBe(false);
    expect(radio(MOMO)?.checked).toBe(true);
    await click(stepButton("결제"));
    await agreeAndPay();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ creatorId: MOMO });
  });

  it("막힘이 없으면 결제하기가 서버에 보낸다(위 두 시험이 아무것도 안 보내서 통과한 것이 아님을 확인)", async () => {
    await toPayWith("stationery");
    await agreeAndPay();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ creatorId: MOMO, itemCategory: "stationery" });
  });
});

describe("d113 D-2: 지금 보낼 수 없는 크리에이터(이사 중·쉬는 중)는 회색 카드 + 이유 한 줄, 고를 수 없다", () => {
  const MOVE = "00000000-0000-4000-b000-000000000005";
  const list: CreatorOption[] = [
    { id: MOMO, name: "모모", platform: "치지직", approvalMinutes: 60 },
    { id: NARU, name: "나루", platform: "치지직", approvalMinutes: 60, receiving: { resumeOn: "2026-10-20", birthday: null, anniversaries: [] } },
    { id: MOVE, name: "모아", platform: "치지직", channelTitle: "모아의 방", approvalMinutes: 60, moving: true },
  ];
  const card = (id: string) => radio(id)?.closest("label");
  async function show(initial = "") {
    act(() => root.render(<RegisterForm creators={list} prices={prices} initialCreatorId={initial} onRegistered={() => {}} today={today} />));
    await settle();
  }

  it("D-2: 쉬는 중·이사 중 크리에이터 — 둘째 줄이 이유, 라디오가 비활성, 같은 회색 카드(팬당 한도는 2026-11-14 없앰 — 한도 안내 줄은 없다)", async () => {
    await show();
    expect(host.textContent).not.toContain("선물 한도");
    expect(radio(NARU)?.disabled).toBe(true);
    expect(radio(MOVE)?.disabled).toBe(true);
    // 2026-11-12 작은 가로 카드(시안 gifts-new-r2): 닉네임 아래 한 줄만 — 플랫폼·승인 시간 없음, 채널 이름도 없음(INV-CN4)
    expect(card(MOVE)?.textContent).toContain("채널 변경 확인 중 · 선물 받기 중단");
    expect(card(MOVE)?.textContent).not.toContain("모아의 방");
    expect(card(MOVE)?.textContent).not.toContain("치지직");
    // 쉬는 중은 「쉬는 중」 한 단어 — 재개 날짜는 카드에 없다
    expect(card(NARU)?.textContent).toBe("나루쉬는 중");
    expect(card(MOMO)?.textContent).toBe("모모");
    expect(card(MOVE)?.className).not.toBe(card(MOMO)?.className);
    expect(card(NARU)?.className).toBe(card(MOVE)?.className);
  });

  it("D-2 (실패경로): 보낼 수 있는 크리에이터는 회색이 아니고 고를 수 있다 — 누르면 고른 값이 된다", async () => {
    await show();
    expect(radio(MOMO)?.disabled).toBe(false);
    expect(card(MOMO)?.className).not.toBe(card(MOVE)?.className);
    await click(radio(MOMO));
    expect(radio(MOMO)?.checked).toBe(true);
    await click(radio(NARU));
    expect(radio(NARU)?.checked).toBe(false);
    expect(radio(MOMO)?.checked).toBe(true);
  });

  it("D-2 (실패경로): 고를 수 없는 크리에이터가 미리 골라져 오면 고른 값이 비어 있고 「다음」은 고르라는 안내", async () => {
    await show(MOVE);
    expect(radio(MOVE)?.checked).toBe(false);
    await click(button("다음"));
    expect(visibleStep()).toEqual([1]);
  });
});

describe("d113 D-1: 2단계의 선물 사진·나만 보는 메모는 글자 한 줄로 접혀 있다", () => {
  it("D-1: 접힌 줄 「선물 사진·나만 보는 메모 (선택)」 — 처음엔 닫혀 있고 사진·메모 칸이 그 안에 있다, 누르면 펼친다", async () => {
    await render("notice", MOMO);
    await toStep2("doll");
    const fold = host.querySelector<HTMLDetailsElement>("details[data-optional-fold]");
    expect(fold?.querySelector("summary")?.textContent).toBe("선물 사진·나만 보는 메모 (선택)");
    expect(fold?.open).toBe(false);
    expect(fold?.contains(host.querySelector("#gift-photo"))).toBe(true);
    expect(fold?.contains(host.querySelector("#memoTitle"))).toBe(true);
    // 필수 두 칸은 접힌 줄 밖
    expect(fold?.contains(radio("doll"))).toBe(false);
    expect(fold?.contains(radio("no"))).toBe(false);
    await click(fold?.querySelector("summary"));
    expect(fold?.open).toBe(true);
  });

  it("D-1 (실패경로): 메모에 오류가 있으면 접힌 줄이 열려 그 칸이 보인다", async () => {
    await render("notice", MOMO);
    await toStep2("doll");
    const fold = host.querySelector<HTMLDetailsElement>("details[data-optional-fold]");
    await click(fold?.querySelector("summary"));
    const t = host.querySelector<HTMLInputElement>("#memoTitle")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(t, "가".repeat(21));
      t.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(fold?.querySelector("summary"));
    expect(fold?.open).toBe(false);
    await click(button("다음"));
    expect(visibleStep()).toEqual([2]);
    expect(fold?.open).toBe(true);
  });
});

describe("metrics INV-Q5: 안내가 뜬 품목을 등록에 같이 보낸다", () => {
  const pay = () => agreeAndPay();
  const sent = () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

  it("INV-Q5 (S5): 꽃에서 안내를 보고 인형으로 바꿔 결제하면 안내 품목 꽃·마지막 인형을 보낸다", async () => {
    await render("notice");
    await toStep2("flower");
    expect(host.querySelector("#hard-note")).not.toBeNull();
    await click(radio("doll"));
    await click(button("다음"));
    await click(button("다음"));
    await pay();
    expect(sent()).toMatchObject({ creatorId: HARU, itemCategory: "doll", hardNoticeCategory: "flower" });
  });

  it("INV-Q5 (실패경로): 안내가 뜨지 않았으면 안내 품목을 보내지 않는다", async () => {
    await render("notice", MOMO);
    await toStep2("flower");
    await click(button("다음"));
    await click(button("다음"));
    await pay();
    expect(sent()).not.toHaveProperty("hardNoticeCategory");
  });

  it("INV-Q5 (실패경로): 꽃이 받기 어려운 크리에이터에게 처음부터 인형을 골라 결제하면 안내 품목을 보내지 않는다", async () => {
    await render("notice");
    await toStep2("doll");
    expect(host.querySelector("#hard-note")).toBeNull();
    await click(button("다음"));
    await click(button("다음"));
    await pay();
    expect(sent()).toMatchObject({ creatorId: HARU, itemCategory: "doll" });
    expect(sent()).not.toHaveProperty("hardNoticeCategory");
  });

  it("INV-Q5 (실패경로): 꽃을 고른 뒤 1단계에서 꽃이 받기 어려운 크리에이터로 바꾸고 결제로 바로 가면 — 안내가 화면에 뜬 적이 없으니 보내지 않는다", async () => {
    await render("notice", MOMO);
    await toStep2("flower");
    await click(button("다음"));
    await click(button("다음"));
    expect(visibleStep()).toEqual([4]);
    await click(stepButton("크리에이터"));
    await click(radio(HARU));
    await click(stepButton("결제"));
    await pay();
    expect(sent()).toMatchObject({ creatorId: HARU, itemCategory: "flower" });
    expect(sent()).not.toHaveProperty("hardNoticeCategory");
  });

  it("INV-Q5 (실패경로): 안내를 본 뒤 다른 크리에이터로 바꾸면 그 안내는 보내지 않는다", async () => {
    await render("notice");
    await toStep2("flower");
    expect(host.querySelector("#hard-note")).not.toBeNull();
    await click(stepButton("크리에이터"));
    await click(radio(MOMO));
    await click(button("다음"));
    await click(button("다음"));
    await click(button("다음"));
    await pay();
    expect(sent()).toMatchObject({ creatorId: MOMO, itemCategory: "flower" });
    expect(sent()).not.toHaveProperty("hardNoticeCategory");
  });
});

describe("together INV-F7: 2단계 「나만 보는 메모」(선물 이름·내용, 둘 다 선택)", () => {
  const pay = () => agreeAndPay();
  const sent = () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
  async function type(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
    if (!el) throw new Error("입력 칸이 없다");
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }
  const title = () => host.querySelector<HTMLInputElement>("#memoTitle");
  const body = () => host.querySelector<HTMLTextAreaElement>("#memoBody");

  it("INV-F7: 메모 칸 둘은 2단계에 있고, 「나에게만 공개」 안내가 붙는다 — 「기타」 물품 이름 칸에는 공개 안내를 붙이지 않는다", async () => {
    await render("notice", MOMO);
    await toStep2("other");
    const memo = title()?.closest("section");
    expect(memo?.closest("[hidden]")).toBeNull();
    expect(memo?.querySelector("h2, h3")?.textContent).toContain("나만 보는 메모");
    expect(memo?.textContent).toContain("나에게만 공개");
    expect(memo?.contains(body())).toBe(true);
    expect(host.querySelector('label[for="memoTitle"]')?.textContent).toContain("선물 이름");
    expect(host.querySelector('label[for="memoBody"]')?.textContent).toContain("내용");
    // 메모 칸은 「기타」 칸과 다른 덩어리다
    expect(memo?.contains(host.querySelector("#itemOther"))).toBe(false);
    expect(host.querySelector('label[for="itemOther"]')?.textContent).not.toContain("크리에이터에게 보여요");
  });

  it("INV-F7 S7: 적은 선물 이름·내용을 등록에 보낸다 — 물품 이름 칸과 섞지 않는다", async () => {
    await render("notice", MOMO);
    await toStep2("other");
    await type(host.querySelector<HTMLInputElement>("#itemOther"), "손편지");
    await type(title(), "생일 편지와 인형");
    await type(body(), "첫 줄\n둘째 줄\n셋째 줄");
    await click(button("다음"));
    await click(button("다음"));
    await pay();
    expect(sent()).toMatchObject({ itemOther: "손편지", memoTitle: "생일 편지와 인형", memoBody: "첫 줄\n둘째 줄\n셋째 줄" });
  });

  it("INV-F7 S7b (실패경로): 선물 이름이 21자면 2단계에서 넘어가지 않고 그 칸에 오류가 붙는다", async () => {
    await render("notice", MOMO);
    await toStep2("doll");
    await type(title(), "가".repeat(21));
    await click(button("다음"));
    expect(visibleStep()).toEqual([2]);
    expect(title()?.getAttribute("aria-invalid")).toBe("true");
  });

  it("INV-F7: 칸 최대 길이는 시안대로 선물 이름 20·내용 200·「기타」 30 — 한글 21자째는 칸이 받지 않는다", async () => {
    await render("notice", MOMO);
    await toStep2("other");
    expect(title()?.maxLength).toBe(20);
    expect(body()?.maxLength).toBe(200);
    expect(host.querySelector<HTMLInputElement>("#itemOther")?.maxLength).toBe(30);
  });

  it("INV-F7: 글자 수는 라벨과 같은 줄에 있고 바뀌면 읽어 준다(aria-live polite) — 넘치면 표시가 바로 바뀐다", async () => {
    await render("notice", MOMO);
    await toStep2("other");
    for (const id of ["memoTitle", "memoBody", "itemOther"]) {
      const label = host.querySelector(`label[for="${id}"]`);
      const count = host.querySelector(`#${id}-count`);
      expect(count, id).not.toBeNull();
      expect(label?.parentElement, id).toBe(count?.parentElement);
      expect(label?.parentElement?.contains(host.querySelector(`#${id}`)), id).toBe(false);
      expect(count?.getAttribute("aria-live"), id).toBe("polite");
    }
    await type(title(), "가".repeat(20));
    expect(host.querySelector("#memoTitle-count")?.textContent).toContain("20 / 20");
    expect(host.querySelector("#memoTitle-count")?.hasAttribute("data-over")).toBe(false);
    // 「다음」을 누르기 전, 넣기만 해도 넘침이 보인다
    await type(title(), "가".repeat(21));
    expect(visibleStep()).toEqual([2]);
    expect(host.querySelector("#memoTitle-count")?.getAttribute("data-over")).toBe("true");
  });
});

describe("결제 전 동의 — 이용약관·개인정보처리방침·취소·환불 규정", () => {
  async function toPay() {
    await render("block", MOMO);
    await toStep2("stationery");
    await click(button("다음"));
    await click(button("다음"));
  }

  it("(실패경로) 동의 칸을 체크하지 않고 결제하기를 누르면 보내지 않고, 안내가 보이고 동의 칸으로 간다", async () => {
    await toPay();
    await click([...host.querySelectorAll("button")].find((b) => b.textContent?.includes("결제하기")));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("결제 전에 이용약관과 취소·환불 규정을 확인하고 동의해 주세요.");
    expect(document.activeElement).toBe(host.querySelector("#pay-consent"));
  });

  it("동의 칸 옆에 세 규정의 링크가 새 탭으로 걸려 있다", async () => {
    await toPay();
    const links = [...host.querySelectorAll<HTMLAnchorElement>("#pay-consent-links a")];
    expect(links.map((a) => [a.getAttribute("href"), a.textContent, a.target])).toEqual([
      ["/terms", "이용약관", "_blank"],
      ["/privacy", "개인정보처리방침", "_blank"],
      ["/refund", "취소·환불 규정", "_blank"],
    ]);
  });
});

describe("payment INV-M25: 결제 단계의 반송 주소 칸(팬)", () => {
  const ACCOUNT = "00000000-0000-4000-a000-000000000001";
  let pem = "";

  async function renderFan() {
    if (!pem) {
      const pair = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true,
        ["encrypt", "decrypt"],
      );
      const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
      pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...spki))}\n-----END PUBLIC KEY-----`;
    }
    act(() =>
      root.render(
        <RegisterForm creators={creators("block")} prices={prices} initialCreatorId={MOMO} onRegistered={() => {}} today={today} returnAddress={{ accountId: ACCOUNT, sealingKeyPem: pem }} />,
      ),
    );
    await settle();
    await toStep2("stationery");
    await click(button("다음"));
    await click(button("다음"));
    expect(visibleStep()).toEqual([4]);
  }

  function type(id: string, value: string) {
    const input = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`칸 없음: ${id}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function fillAddress() {
    type("ra-zipCode", "63100");
    type("ra-address1", "제주특별자치도 제주시 첨단로 242");
    type("ra-address2", "101호");
    type("ra-recipientName", "김별빛");
    type("ra-phone", "010-1234-5678");
    await click(button("입력 완료"));
    // 봉인(Web Crypto)이 끝날 때까지
    for (let i = 0; i < 20 && !host.textContent?.includes("반송 주소를 입력했습니다."); i += 1) await settle();
  }

  it("INV-M25 S25: 입력한 반송 주소는 봉인된 값과 할증 구분만 등록 요청에 실린다 — 이름·번호·주소·우편번호 평문은 없다", async () => {
    await renderFan();
    expect(host.querySelector('[role="group"][aria-label="반송 주소"]')).not.toBeNull();
    await fillAddress();
    expect(host.textContent).toContain("반송 주소를 입력했습니다.");
    await agreeAndPay();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const raw = String(fetchMock.mock.calls[0]?.[1]?.body);
    const sent = JSON.parse(raw) as { returnAddress?: Record<string, unknown>; returnRegion?: string };
    expect(Object.keys(sent.returnAddress ?? {}).sort()).toEqual(["alg", "ciphertext", "iv", "v", "wrappedKey"]);
    expect(sent.returnRegion).toBe("jeju");
    for (const plain of ["63100", "첨단로", "101호", "김별빛", "01012345678", "010-1234-5678"]) expect(raw).not.toContain(plain);
  });

  it("INV-M25 S25b (실패경로): 반송 주소를 입력하지 않고 결제하기를 누르면 보내지 않고 안내가 보인다", async () => {
    await renderFan();
    await agreeAndPay();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("반송 주소를 입력해 주세요.");
    expect(document.activeElement?.id).toBe("return-address-title");
  });

  it("INV-M25: 칸 안에서 Enter 는 결제(바깥 폼)가 아니라 이 칸의 봉인으로 간다 — 기본 동작(제출)을 막는다", async () => {
    await renderFan();
    type("ra-zipCode", "63100");
    type("ra-address1", "제주특별자치도 제주시 첨단로 242");
    type("ra-recipientName", "김별빛");
    type("ra-phone", "01012345678");
    const name = host.querySelector<HTMLInputElement>("#ra-recipientName")!;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => name.dispatchEvent(enter));
    for (let i = 0; i < 20 && !host.textContent?.includes("반송 주소를 입력했습니다."); i += 1) await settle();
    expect(enter.defaultPrevented).toBe(true);
    expect(host.textContent).toContain("반송 주소를 입력했습니다.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("INV-M25: 크리에이터가 보낼 때(returnAddress 없음)는 반송 주소 칸이 없고 그대로 결제로 간다", async () => {
    await render("block", MOMO);
    await toStep2("stationery");
    await click(button("다음"));
    await click(button("다음"));
    expect(host.querySelector("#return-address-title")).toBeNull();
    await agreeAndPay();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty("returnAddress");
  });
});
