import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FoldStartOpen } from "./fold-start-open";

// 처음부터 펼친 접기는 사람이 처음 접거나 펼칠 때 data-start-open 표시를 잃는다 — 그 뒤로 등장 효과가 걸린다

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function draw() {
  act(() =>
    root.render(
      <>
        <FoldStartOpen />
        <details open data-start-open="" id="a">
          <summary>가</summary>
          <p>내용</p>
        </details>
        <details id="b">
          <summary>나</summary>
          <p>내용</p>
        </details>
      </>,
    ),
  );
}

describe("처음 펼친 접기 표시", () => {
  it("그리기만 하면 표시가 남는다(처음 열 때 움직이지 않음)", () => {
    draw();
    expect(host.querySelector("#a")?.hasAttribute("data-start-open")).toBe(true);
  });

  it("그 접기의 toggle 이 오면 표시를 지운다", () => {
    draw();
    const a = host.querySelector<HTMLDetailsElement>("#a")!;
    act(() => {
      a.open = false;
      a.dispatchEvent(new Event("toggle"));
    });
    expect(a.hasAttribute("data-start-open")).toBe(false);
  });

  it("(실패경로) 부품이 빠진 뒤에는 듣지 않는다 — 표시가 남는다", () => {
    draw();
    act(() => root.render(<details open data-start-open="" id="c"><summary>다</summary></details>));
    act(() => root.unmount());
    root = createRoot(host);
    const c = document.createElement("details");
    c.setAttribute("data-start-open", "");
    host.appendChild(c);
    c.dispatchEvent(new Event("toggle"));
    expect(c.hasAttribute("data-start-open")).toBe(true);
  });
});
