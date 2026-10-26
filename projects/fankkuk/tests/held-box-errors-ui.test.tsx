import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const api = vi.hoisted(() => ({ find: vi.fn(), candidates: vi.fn(), link: vi.fn() }));
vi.mock("@/features/box-waybill/api/post-waybill-client", async (orig) => ({ ...(await orig<object>()), postFind: api.find }));
vi.mock("@/features/admin-held-link/api/post-held-link-client", () => ({ postLinkCandidates: api.candidates, postHeldLink: api.link }));

import { LinkHeldButton } from "@/features/admin-held-link/ui/link-held-button";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";

// 보류 상자 찾기·운영자 입고 창의 오류를 틀린 칸에 잇는다 (inbound-address-code INV-C4 ②·C12, 리뷰 반영 2026-10-16).
// 화면이 틀렸다고 본 칸만 aria-invalid·aria-describedby(오류 줄)를 달고, 초점이 그 칸으로 간다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  api.find.mockReset();
  api.candidates.mockReset();
  api.link.mockReset();
  // jsdom 은 dialog 의 showModal·close 가 없다
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function errorTarget(el: Element | null): string | null {
  const ids = el?.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? "").join("") || null;
}

const BOX = { target: { kind: "box" as const, id: "4f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f" }, label: "FC-7K3M9", name: "FC-7K3M9 · 소형 상자" };

describe("받는 주소 없이 보냈어요 — 오류는 틀린 칸에 (INV-C4 ②)", () => {
  it("INV-C4: 택배사를 안 고르면 택배사 칸에 오류가 이어지고 초점이 간다 — 송장번호 칸은 멀쩡", async () => {
    act(() => root.render(<FindMyBox box={BOX} />));
    const form = host.querySelector("form") as HTMLFormElement;
    (form.querySelector('input[name="waybill"]') as HTMLInputElement).value = "123456789012";
    await act(async () => form.requestSubmit());
    const carrier = form.querySelector("select") as HTMLSelectElement;
    const waybill = form.querySelector('input[name="waybill"]') as HTMLInputElement;
    expect(carrier.getAttribute("aria-invalid")).toBe("true");
    expect(errorTarget(carrier)).toContain("택배사를 선택해 주세요.");
    expect(document.activeElement).toBe(carrier);
    expect(waybill.getAttribute("aria-invalid")).toBeNull();
    expect(api.find).not.toHaveBeenCalled();
  });

  it("INV-C4: 송장번호 꼴이 틀리면 송장번호 칸에 오류, 택배사 칸은 멀쩡", async () => {
    act(() => root.render(<FindMyBox box={BOX} />));
    const form = host.querySelector("form") as HTMLFormElement;
    (form.querySelector('input[name="waybill"]') as HTMLInputElement).value = "12";
    await act(async () => form.requestSubmit());
    const waybill = form.querySelector('input[name="waybill"]') as HTMLInputElement;
    expect(waybill.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(waybill);
    expect((form.querySelector("select") as HTMLSelectElement).getAttribute("aria-invalid")).toBeNull();
  });
});

describe("주인 주문으로 입고 — 오류는 틀린 칸에 (INV-C12)", () => {
  const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
  const two = [
    { boxId: "a1c2b7a0-9d4e-4c1a-8b2f-0a1b2c3d4e5f", label: "FC-AAAA1", tier: "small", paidAt: null },
    { boxId: "b1c2b7a0-9d4e-4c1a-8b2f-0a1b2c3d4e5f", label: "FC-BBBB2", tier: "medium", paidAt: null },
  ];

  async function openDialog() {
    act(() => root.render(<LinkHeldButton id={ID} waybillNo="123456789012" />));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    return host.querySelector("dialog") as HTMLDialogElement;
  }

  function button(d: Element, text: string): HTMLButtonElement {
    return [...d.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;
  }

  it("INV-C12: 빈 닉네임 → 닉네임 칸 / 상자 안 고름 → 상자 고르기 / 확인 표시 안 함 → 체크 칸 — 칸마다 오류가 이어지고 초점이 간다", async () => {
    const d = await openDialog();
    const nick = d.querySelector('input[autocomplete="off"]') as HTMLInputElement;
    await act(async () => (d.querySelector("form") as HTMLFormElement).requestSubmit());
    expect(nick.getAttribute("aria-invalid")).toBe("true");
    expect(errorTarget(nick)).toContain("닉네임");
    expect(document.activeElement).toBe(nick);

    api.candidates.mockResolvedValue({ kind: "ok", body: { candidates: two } });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nick, "별빛");
      nick.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (d.querySelector("form") as HTMLFormElement).requestSubmit());
    expect(api.candidates).toHaveBeenCalledWith(ID, "별빛");
    expect(nick.getAttribute("aria-invalid")).toBeNull();

    await act(async () => button(d, "입고").click());
    const group = d.querySelector("fieldset") as HTMLFieldSetElement;
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(errorTarget(group)).toContain("상자를 골라 주세요.");
    expect(document.activeElement).toBe(group.querySelector('input[type="radio"]'));

    await act(async () => (group.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
    await act(async () => button(d, "입고").click());
    const check = d.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(check.getAttribute("aria-invalid")).toBe("true");
    expect(errorTarget(check)).toContain("송장번호와 내용물");
    expect(document.activeElement).toBe(check);
    expect(group.getAttribute("aria-invalid")).toBeNull();
    expect(api.link).not.toHaveBeenCalled();

    api.link.mockResolvedValue({ kind: "ok", body: { ok: true } });
    await act(async () => check.click());
    await act(async () => button(d, "입고").click());
    expect(api.link).toHaveBeenCalledWith(ID, "별빛", two[1]!.boxId);
  });
});
