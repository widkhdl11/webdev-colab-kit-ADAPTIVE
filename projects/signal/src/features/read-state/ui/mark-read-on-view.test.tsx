import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MarkReadOnView } from "./mark-read-on-view";
import { loadReadIds } from "../lib/storage";

// 이 기능의 핵심 의도는 "클릭이 아니라 **상세가 뜬 시점**에 기록한다" 이고,
// 그 의도는 지금까지 주석에만 있었다 — MarkReadOnView 를 통째로 지워도, 기록 지점을
// 카드 onClick 으로 되돌려도 테스트가 하나도 깨지지 않았다(2026-08-06 test-auditor 지적).
// 저장소 계층(storage.test.ts)은 원시 동작이지 기능이 아니다.

// React 19 는 act 사용 시 이 플래그를 요구한다.
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

async function mount(node: React.ReactNode): Promise<() => void> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return () => {
    act(() => root.unmount());
    container.remove();
  };
}

describe("MarkReadOnView — 읽음은 상세가 뜬 시점에 기록한다", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("마운트되면 그 id 가 읽음으로 남는다", async () => {
    const unmount = await mount(<MarkReadOnView id="a" />);
    expect(loadReadIds()).toContain("a");
    unmount();
  });

  it("StrictMode 의 이중 실행에도 중복으로 쌓이지 않는다", async () => {
    const unmount = await mount(
      <StrictMode>
        <MarkReadOnView id="a" />
      </StrictMode>,
    );
    expect(loadReadIds()).toEqual(["a"]);
    unmount();
  });

  it("이미 저장돼 있던 다른 글의 읽음을 지우지 않는다", async () => {
    window.localStorage.setItem(
      "signal:read-articles",
      JSON.stringify(["z"]),
    );
    const unmount = await mount(<MarkReadOnView id="a" />);
    expect(loadReadIds()).toEqual(["z", "a"]);
    unmount();
  });

  it("렌더만으로는 화면에 아무것도 그리지 않는다", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<MarkReadOnView id="a" />);
    });
    expect(container.textContent).toBe("");
    act(() => root.unmount());
    container.remove();
  });
});
