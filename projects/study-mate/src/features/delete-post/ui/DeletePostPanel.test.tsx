/**
 * **두 단계 확인이 유일한 방벽이라 검사가 있어야 한다.** 승인된 시각 기준이
 * (`docs/design/design-rules.md` 2026-09-06 (2)) 「실수로 지워지는 것을 막는 것은 색이
 * 아니라 두 번 누르게 하는 것」이라고 정했으므로, 그 두 단계가 사라지면 규칙이 통째로
 * 무의미해진다. 이 파일이 없을 때는 `confirming` 삼항을 지워 첫 버튼을 그대로
 * `type="submit"` 으로 만들어도 전 스위트가 초록불이었다 (2026-09-06 test-auditor).
 *
 * **모킹하는 것은 이웃(서버 액션)이지 검증 대상(패널)이 아니다.** 액션 파일은
 * `"use server"` 라 `next/headers` 를 끌고 오므로 이 환경에서 못 부른다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/delete-post", () => ({ deletePostAction: vi.fn(async () => null) }));

const { DeletePostPanel } = await import("./DeletePostPanel");

const 글 = "33333333-3333-4333-8333-333333333333";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<DeletePostPanel postId={글} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const 버튼 = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

describe("DeletePostPanel — 두 단계 확인", () => {
  it("처음에는 제출할 자리가 아예 없다 — 한 번 눌러서는 아무것도 안 지워진다", () => {
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(버튼("모집글 삭제")).toBeDefined();
    // 그 버튼은 제출 버튼이 아니다 — 폼 밖의 `type="button"` 이다
    expect(버튼("모집글 삭제")?.type).toBe("button");
  });

  it("한 번 누르면 확인 문구와 제출 버튼이 나타난다 — 지우는 것은 그다음이다", () => {
    act(() => 버튼("모집글 삭제")?.click());

    expect(container.querySelector("form")).not.toBeNull();
    expect(버튼("지웁니다")?.type).toBe("submit");
    // 어느 글을 지우는지는 숨은 칸으로 간다
    expect(container.querySelector<HTMLInputElement>('input[name="postId"]')?.value).toBe(글);
    // 읽어 주는 기계가 끼어들어 읽도록 — 페이지 이동도 초점 이동도 없는 변화다
    const 알림 = container.querySelector('[role="alert"]');
    expect(알림?.textContent).toContain("되돌릴 수 없습니다");
  });

  it("취소하면 제출할 자리가 다시 사라진다", () => {
    act(() => 버튼("모집글 삭제")?.click());
    act(() => 버튼("취소")?.click());

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(버튼("모집글 삭제")).toBeDefined();
  });

  // 초점을 안 옮기면 `document.body` 로 떨어진다 — 낭독기 사용자는 `role="alert"` 로
  // 듣지만, **화면을 보면서 키보드만 쓰는 사용자**는 알림도 없이 Tab 을 문서 처음부터
  // 다시 눌러야 한다. 두 번 누르게 하는 설계는 두 번째 버튼에 갈 수 있어야 성립한다.
  it("초점이 확인 버튼으로 옮겨 가고, 취소하면 원래 버튼으로 돌아온다", () => {
    act(() => 버튼("모집글 삭제")?.click());
    expect(document.activeElement).toBe(버튼("지웁니다"));

    act(() => 버튼("취소")?.click());
    expect(document.activeElement).toBe(버튼("모집글 삭제"));
  });
});
