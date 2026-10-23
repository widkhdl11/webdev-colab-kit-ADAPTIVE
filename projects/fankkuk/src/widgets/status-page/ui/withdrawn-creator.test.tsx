import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusPage } from "./status-page";
import { WithdrawnCreatorStatus } from "./withdrawn-creator";

// 탈퇴한 크리에이터의 크리에이터 페이지 (approval-signature INV-S15, UX 명세 docs/ux/pages/handle.md 의 withdrawn).
// 보이는 것: 제목 「탈퇴한 크리에이터입니다.」 · 「홈으로」 하나. 설명 문장·크리에이터 정보·선물 보내기는 없다.

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

describe("탈퇴한 크리에이터 화면 (INV-S15)", () => {
  it("INV-S15: 제목은 「탈퇴한 크리에이터입니다.」, 누를 것은 홈(/)으로 가는 「홈으로」 하나", () => {
    act(() => root.render(<WithdrawnCreatorStatus />));
    expect(host.querySelector("h1")?.textContent).toBe("탈퇴한 크리에이터입니다.");
    const links = [...host.querySelectorAll("a")];
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([["홈으로", "/"]]);
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("INV-S15 (실패경로): 설명 문장·선물 보내기가 없다", () => {
    act(() => root.render(<WithdrawnCreatorStatus />));
    expect(host.querySelector("p")).toBeNull();
    expect(host.textContent).not.toContain("선물");
  });

  it("상태 화면 부품: 설명을 주면 그 문장이 제목 아래에 있다 — 없는 페이지 화면은 그대로", () => {
    act(() => root.render(<StatusPage title="페이지를 찾을 수 없어요" description="주소가 바뀌었거나 없어진 페이지예요." actions={null} />));
    expect(host.querySelector("h1 + p")?.textContent).toBe("주소가 바뀌었거나 없어진 페이지예요.");
  });
});
