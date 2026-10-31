// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftScope } from "@/shared/lib/form-draft/use-form-draft";

// 반려·승인 취소·횟수 풀기 확인 창에 붙인 임시 저장 (docs/specs/session-login.md INV-L20).
// 고른 사유·메모가 다시 열면 돌아오고, [닫기]로 버리면 지워지는지. 서버 호출만 가짜로 둔다.
const api = vi.hoisted(() => ({ postCreatorVerify: vi.fn() }));
vi.mock("../api/post-verify-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { DecisionDialog } from "./decision-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STAFF = "00000000-0000-4000-a000-0000000000a1";
const DAY = 24 * 60 * 60 * 1000;
const BASE = "reject-app1";
type Reason = "blurry" | "mismatch";

beforeAll(() => {
  // jsdom 에는 <dialog>.showModal·close 가 없다 — 브라우저처럼 열고, 닫을 때 close 이벤트를 보낸다
  const proto = HTMLDialogElement.prototype as unknown as Record<"showModal" | "close", (this: HTMLDialogElement) => void>;
  proto.showModal = function () {
    this.setAttribute("open", "");
  };
  proto.close = function () {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

let host: HTMLDivElement;
let root: Root | null = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <DraftScope userId={STAFF} maxAgeMs={DAY}>
        <DecisionDialog<Reason>
          idBase={BASE}
          buttonLabel="반려"
          buttonAriaLabel="반려"
          title="반려할까요?"
          body={null}
          confirmLabel="반려 확정"
          busyLabel="반려하는 중…"
          reasons={["blurry", "mismatch"]}
          reasonLabels={{ blurry: "흐림", mismatch: "다름" }}
          memoLabel="메모"
          memoPlaceholder=""
          decision={(reasonCode, memo) => ({ kind: "reject", applicationId: "app1", reasonCode, memo }) as never}
          doneText="반려했어요."
          returnFocusId="x"
          onDone={() => {}}
        />
      </DraftScope>,
    );
  });
}
function unmount() {
  act(() => root?.unmount());
  host.remove();
  root = null;
}
const memo = () => host.querySelector<HTMLTextAreaElement>(`#${BASE}-memo`)!;
const radio = (r: Reason) => host.querySelector<HTMLInputElement>(`input[type="radio"][value="${r}"]`)!;
const buttonNamed = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text)!;
function openAndFill() {
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="반려"]')!.click());
  act(() => radio("mismatch").click());
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(memo(), "채널 주소가 다름");
    memo().dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => vi.advanceTimersByTime(1000));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  if (root) unmount();
  vi.useRealTimers();
});

describe("인증 결정 확인 창 임시 저장 (INV-L20)", () => {
  it("INV-L20 (S18): 적던 중 화면을 떠났다가 다시 열면 고른 사유와 메모가 돌아온다", () => {
    mount();
    openAndFill();
    unmount();
    mount();
    expect(memo().value).toBe("채널 주소가 다름");
    expect(radio("mismatch").checked).toBe(true);
    expect(radio("blurry").checked).toBe(false);
  });

  it("INV-L20 (S18b): [닫기]로 버리면 화면을 새로 열었을 때 비어 있다", () => {
    mount();
    openAndFill();
    act(() => buttonNamed("닫기").click());
    unmount();
    mount();
    expect(memo().value).toBe("");
    expect(radio("mismatch").checked).toBe(false);
  });

  it("INV-L20 (S18b): 처리가 성공하면 화면을 새로 열었을 때 비어 있다", async () => {
    api.postCreatorVerify.mockResolvedValue({ kind: "ok", body: {} });
    mount();
    openAndFill();
    await act(async () => {
      buttonNamed("반려 확정").click();
    });
    expect(api.postCreatorVerify).toHaveBeenCalledTimes(1);
    unmount();
    mount();
    expect(memo().value).toBe("");
  });
});
