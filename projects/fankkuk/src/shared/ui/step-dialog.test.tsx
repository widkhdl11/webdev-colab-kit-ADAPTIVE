import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BottomSheet } from "./bottom-sheet";
import { StepDialog } from "./step-dialog";

// 단계형 모달 틀 — 열려 있는 동안 뒤 페이지 스크롤을 막고, 닫히면(겹친 창이 모두 닫히면) 원래 값으로 돌린다. 스크롤 위치는 건드리지 않는다.

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
  document.documentElement.style.overflow = "";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function draw(a: boolean, b: boolean) {
  act(() =>
    root.render(
      <>
        {a ? (
          <StepDialog open title="가" footer={null} onRequestClose={() => {}}>
            본문
          </StepDialog>
        ) : null}
        <StepDialog open={b} title="나" footer={null} onRequestClose={() => {}}>
          본문
        </StepDialog>
      </>,
    ),
  );
}

describe("단계형 모달 — 뒤 페이지 스크롤 잠금", () => {
  it("열면 문서 스크롤을 막고, 닫으면 원래 값으로 돌린다", () => {
    document.documentElement.style.overflow = "auto";
    draw(false, false);
    expect(document.documentElement.style.overflow).toBe("auto");
    draw(false, true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    draw(false, false);
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("겹쳐 연 창(만들기 → 신청 관리)은 마지막 창이 닫혀야 풀린다 — 창이 통째로 빠져도 푼다", () => {
    draw(true, false);
    expect(document.documentElement.style.overflow).toBe("hidden");
    draw(true, true);
    draw(false, true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    draw(false, false);
    expect(document.documentElement.style.overflow).toBe("");
  });
});

// 단계형 창 안에 겹쳐 연 창(주소 입력 칸의 「주소 검색」) — 안쪽 창의 Esc 를 바깥 단계형 창이 「닫을까요」 요청으로 가로채지 않는다(2026-11-14).
// React 는 안쪽 <dialog> 의 cancel 이벤트를 바깥 <dialog> 의 처리기에도 올려 보낸다.
describe("단계형 모달 — 겹쳐 연 창의 Esc", () => {
  it("안쪽 창의 Esc 는 막지 않고, 바깥 창의 닫기 요청도 부르지 않는다", () => {
    const requests: string[] = [];
    act(() =>
      root.render(
        <StepDialog open title="받을 주소" footer={null} onRequestClose={() => requests.push("outer")}>
          <BottomSheet open title="주소 검색" onClose={() => {}}>
            <p>검색</p>
          </BottomSheet>
        </StepDialog>,
      ),
    );
    const innerDlg = host.querySelectorAll("dialog")[1];
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      innerDlg.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(false);
    expect(requests).toEqual([]);
  });
});
