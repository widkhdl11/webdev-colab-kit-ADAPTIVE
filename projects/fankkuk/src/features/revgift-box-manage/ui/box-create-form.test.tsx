import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOX_DESCRIPTION_MAX, BOX_NAME_MAX } from "@/entities/revgift-box/model/box-rules";

// 선물함 만들기 모달 1/3 — 이름·간단한 설명 칸의 글자 수 「n / 최대자」(UX 명세 creator-revgifts-new 「만들기 모달」, 2026-11-18).
// 서버로 가는 요청은 가짜로 둔다 — 시험 대상은 칸마다 보이는 글자 수와 낭독기 연결이다.
vi.mock("../api/box-requests", () => ({ sendCreateBox: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { BoxCreateDialog } from "./box-create-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<BoxCreateDialog open onClose={() => {}} onCreated={() => {}} linkFor={() => null} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const count = (id: string) => document.getElementById(id)!;
function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("선물함 만들기 1/3 — 글자 수", () => {
  it("이름·간단한 설명 칸의 라벨 줄에 「n / 최대자」 — 입력하면 바로 바뀐다", () => {
    expect(count("bc-name-count").textContent).toBe(`0 / ${BOX_NAME_MAX}자`);
    expect(count("bc-desc-count").textContent).toBe(`0 / ${BOX_DESCRIPTION_MAX}자`);
    type(input("bc-name"), "겨울 선물");
    expect(count("bc-name-count").textContent).toBe(`5 / ${BOX_NAME_MAX}자`);
    type(input("bc-desc"), "고마운 팬에게");
    expect(count("bc-desc-count").textContent).toBe(`7 / ${BOX_DESCRIPTION_MAX}자`);
  });

  it("한도에 닿았을 때만 글자 수를 진하게(data-full) — 왜 더 안 써지는지 보이게", () => {
    type(input("bc-name"), "가".repeat(BOX_NAME_MAX - 1));
    expect(count("bc-name-count").hasAttribute("data-full")).toBe(false);
    type(input("bc-name"), "가".repeat(BOX_NAME_MAX));
    expect(count("bc-name-count").hasAttribute("data-full")).toBe(true);
  });

  it("낭독기: 입력칸 설명에 글자 수가 연결된다 — 오류가 있을 때도 함께", () => {
    expect(input("bc-name").getAttribute("aria-describedby")?.split(" ")).toContain("bc-name-count");
    expect(input("bc-desc").getAttribute("aria-describedby")?.split(" ")).toContain("bc-desc-count");
    act(() => (document.querySelector("form#bc-form") as HTMLFormElement).requestSubmit());
    expect(input("bc-name").getAttribute("aria-describedby")?.split(" ")).toEqual(["bc-err", "bc-name-count"]);
  });
});
