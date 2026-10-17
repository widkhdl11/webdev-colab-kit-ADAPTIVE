import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BottomSheet } from "./bottom-sheet";

// 확인 창이 닫히면 연 버튼으로 포커스가 돌아온다 — 닫기 버튼으로 닫을 때와, 부르는 쪽이 창을 통째로 지울 때 둘 다(2026-10-17 화면 리뷰).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  // 브라우저처럼 열려 있던 창을 닫으면 close 이벤트를 낸다
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** 조건부로 창을 그리는 부르는 쪽 — 창 안의 「끝내기」는 onClose 를 바로 불러 창을 지운다(확인 성공 뒤 창을 닫는 길과 같다) */
function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      {open ? (
        <BottomSheet open title="창" onClose={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)}>
            끝내기
          </button>
        </BottomSheet>
      ) : null}
    </>
  );
}

const button = (name: string) => [...host.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent) === name);

function openSheet(): HTMLButtonElement {
  const opener = button("열기")!;
  opener.focus();
  act(() => opener.click());
  // 창 안으로 포커스가 옮겨 간 상태(브라우저가 첫 요소에 둔다)
  button("끝내기")!.focus();
  return opener;
}

describe("BottomSheet 포커스 복귀", () => {
  it("닫기 버튼 — 창을 닫고(close 이벤트로 onClose) 연 버튼으로 포커스가 돌아온다", () => {
    act(() => root.render(<Opener />));
    const opener = openSheet();
    act(() => button("닫기")!.click());
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("부르는 쪽이 창을 통째로 지워도 연 버튼으로 포커스가 돌아온다", () => {
    act(() => root.render(<Opener />));
    const opener = openSheet();
    act(() => button("끝내기")!.click());
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("개발 모드의 두 번 실행(StrictMode)에서도 연 창이 열린 채로 있다", () => {
    act(() =>
      root.render(
        <StrictMode>
          <Opener />
        </StrictMode>,
      ),
    );
    const opener = openSheet();
    expect(host.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    act(() => button("닫기")!.click());
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("처리 중에는 닫기 버튼이 막혀 있다", () => {
    act(() =>
      root.render(
        <BottomSheet open busy title="창" onClose={() => undefined}>
          <p>내용</p>
        </BottomSheet>,
      ),
    );
    expect(button("닫기")!.disabled).toBe(true);
  });
});
