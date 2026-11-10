import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
