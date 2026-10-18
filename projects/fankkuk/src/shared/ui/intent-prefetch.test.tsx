import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));

const { IntentPrefetch } = await import("./intent-prefetch");

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  prefetch.mockClear();
  const faq = Object.assign(document.createElement("a"), { id: "faq", href: "/faq" });
  faq.append(Object.assign(document.createElement("span"), { id: "inner", textContent: "자주 묻는 질문" }));
  const ext = Object.assign(document.createElement("a"), { id: "ext", href: "https://example.com/x", textContent: "밖" });
  document.body.replaceChildren(faq, ext);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<IntentPrefetch />));
});

afterEach(async () => {
  await act(async () => root.unmount());
});

const over = (id: string) => document.getElementById(id)!.dispatchEvent(new Event("pointerover", { bubbles: true }));

describe("마우스 올리면 미리 받기 — 부품", () => {
  it("링크(안의 글자)에 마우스가 올라오면 그 페이지를 통째로(kind full) 받는다", () => {
    over("inner");
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/faq", { kind: "full" });
  });

  it("키보드 초점이 가도 받는다", () => {
    document.getElementById("faq")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(prefetch).toHaveBeenCalledWith("/faq", { kind: "full" });
  });

  it("(실패경로) 같은 링크 안을 지나며 이벤트가 여러 번 와도 한 번만 부르고, 다른 사이트 링크는 받지 않는다", () => {
    over("inner");
    over("faq");
    over("inner");
    over("ext");
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it("(실패경로) 부품이 사라지면 더 듣지 않는다", async () => {
    await act(async () => root.unmount());
    over("faq");
    expect(prefetch).not.toHaveBeenCalled();
    root = createRoot(host);
  });
});
