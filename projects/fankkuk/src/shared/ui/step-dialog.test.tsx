import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BottomSheet } from "./bottom-sheet";
import { ConfirmDialog, StepDialog } from "./step-dialog";

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

describe("확인 창 — 겹쳐 연 창의 Esc", () => {
  it("확인 창 안에 연 창의 Esc 는 막지 않고, 확인 창의 onCancel 도 부르지 않는다", () => {
    const calls: string[] = [];
    act(() =>
      root.render(
        <ConfirmDialog open title="지울까요?" onCancel={() => calls.push("confirm")}>
          <BottomSheet open title="안쪽" onClose={() => {}}>
            <p>안</p>
          </BottomSheet>
        </ConfirmDialog>,
      ),
    );
    const innerDlg = host.querySelectorAll("dialog")[1];
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      innerDlg.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });
});

// 단계를 넘길 때만 본문 등장 효과(design-prompt 12-3·12-7) — 처음 열 때는 표시 없음, 넘길 때마다 a·b 를 번갈아 붙여 같은 효과를 다시 시작, 닫으면 처음으로
describe("단계형 모달 — 단계 넘김 등장 표시(data-turn)", () => {
  const prog = (step: number) => ({ step, total: 3, name: `단계${step}`, next: "다음", label: "진행" });
  function drawStep(open: boolean, step: number) {
    act(() =>
      root.render(
        <StepDialog open={open} title="창" footer={null} progress={prog(step)} onRequestClose={() => {}}>
          <input aria-label="이름" />
        </StepDialog>,
      ),
    );
  }
  const turn = () => host.querySelector("input")?.parentElement?.getAttribute("data-turn") ?? null;

  it("처음 열면 표시가 없고, 넘기면 a → b → a 로 번갈아 붙는다(뒤로 가기도 넘김이다)", () => {
    drawStep(true, 1);
    expect(turn()).toBeNull();
    drawStep(true, 2);
    expect(turn()).toBe("a");
    drawStep(true, 3);
    expect(turn()).toBe("b");
    drawStep(true, 2);
    expect(turn()).toBe("a");
  });

  it("같은 단계로 다시 그리면 표시가 바뀌지 않는다(입력할 때마다 효과가 다시 돌지 않음)", () => {
    drawStep(true, 1);
    drawStep(true, 2);
    drawStep(true, 2);
    expect(turn()).toBe("a");
  });

  it("본문을 다시 만들지 않는다 — 넘겨도 입력값이 남는다", () => {
    drawStep(true, 1);
    const input = host.querySelector("input")!;
    input.value = "하루";
    drawStep(true, 2);
    expect(host.querySelector("input")).toBe(input);
    expect(host.querySelector("input")!.value).toBe("하루");
  });

  it("(실패경로) 닫았다 다시 열면 처음처럼 표시가 없다", () => {
    drawStep(true, 1);
    drawStep(true, 2);
    drawStep(false, 1);
    drawStep(true, 1);
    expect(turn()).toBeNull();
  });
});
