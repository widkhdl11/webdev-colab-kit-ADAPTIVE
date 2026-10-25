import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Sentences } from "./sentences";

// 여러 문장 안내를 문장마다 한 줄로(design-rules 29절 줄바꿈 3) · 화면 이름은 쪼개지지 않게 묶는다(줄바꿈 1).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLParagraphElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("p");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function show(text: string, keep?: readonly string[]) {
  act(() => root.render(<Sentences text={text} keep={keep} />));
}

describe("Sentences: 문장마다 한 줄", () => {
  it("첫 문장은 감싸지 않고, 둘째 문장부터 .brk 하나씩으로 감싼다", () => {
    show("링크가 올바르지 않아요. 메일을 다시 받아 주세요. 1시간 동안 쓸 수 있어요.");
    const first = host.firstChild;
    expect(first?.nodeType).toBe(Node.TEXT_NODE);
    expect(first?.textContent).toBe("링크가 올바르지 않아요.");
    const brks = [...host.children].filter((el) => el.classList.contains("brk"));
    expect(brks.map((el) => el.textContent)).toEqual([" 메일을 다시 받아 주세요.", " 1시간 동안 쓸 수 있어요."]);
    expect(first?.nextSibling).toBe(brks[0]);
  });

  it("한 문장이면 .brk 가 없다", () => {
    show("메일을 보냈어요.");
    expect(host.querySelector(".brk")).toBeNull();
    expect(host.textContent).toBe("메일을 보냈어요.");
  });
});

describe("Sentences: keep 의 말은 .nw 로 묶는다", () => {
  it("첫 문장 안의 덩어리를 .nw 하나로 묶고 앞뒤 글은 그대로", () => {
    show("비밀번호 찾기에서 다시 받아 주세요.", ["비밀번호 찾기"]);
    const nw = host.querySelectorAll(".nw");
    expect([...nw].map((el) => el.textContent)).toEqual(["비밀번호 찾기"]);
    expect(nw[0].parentElement).toBe(host);
    expect(nw[0].nextSibling?.textContent).toBe("에서 다시 받아 주세요.");
  });

  it("둘째 문장 안의 덩어리는 .brk 안에서 묶는다", () => {
    show("이 링크는 쓸 수 없어요. 비밀번호 찾기에서 다시 받아 주세요.", ["비밀번호 찾기"]);
    const nw = host.querySelector(".nw");
    expect(nw?.textContent).toBe("비밀번호 찾기");
    expect(nw?.parentElement?.classList.contains("brk")).toBe(true);
  });

  it("keep 을 안 주면 .nw 가 없다", () => {
    show("비밀번호 찾기에서 다시 받아 주세요.");
    expect(host.querySelector(".nw")).toBeNull();
  });
});
