// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftScope } from "@/shared/lib/form-draft/use-form-draft";

// 공지 양식에 붙인 임시 저장 (docs/specs/session-login.md INV-L20 · S18 · S18b).
// 서버 호출(postNotice)만 가짜로 둔다 — 시험 대상은 다시 열었을 때 칸에 무엇이 돌아오는지다.
const api = vi.hoisted(() => ({ postNotice: vi.fn() }));
vi.mock("../api/post-notice-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { NoticeForm } from "./notice-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STAFF = "00000000-0000-4000-a000-0000000000a1";
const DAY = 24 * 60 * 60 * 1000;

let host: HTMLDivElement;
let root: Root | null = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <DraftScope userId={STAFF} maxAgeMs={DAY}>
        <NoticeForm editing={null} onStopEditing={() => {}} onSubmitStart={() => {}} onSaved={() => {}} />
      </DraftScope>,
    );
  });
}
function unmount() {
  act(() => root?.unmount());
  host.remove();
  root = null;
}
const title = () => host.querySelector<HTMLInputElement>("#notice-title")!;
const body = () => host.querySelector<HTMLTextAreaElement>("#notice-body")!;
const pinned = () => host.querySelector<HTMLInputElement>("#notice-pinned")!;
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function fill() {
  type(title(), "점검 안내");
  type(body(), "오늘 밤 점검합니다.");
  act(() => pinned().click());
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

describe("공지 양식 임시 저장 (INV-L20)", () => {
  it("INV-L20 (S18): 같은 계정으로 다시 열면 제목·본문·고정 표시가 돌아온다", () => {
    mount();
    fill();
    unmount();
    mount();
    expect(title().value).toBe("점검 안내");
    expect(body().value).toBe("오늘 밤 점검합니다.");
    expect(pinned().checked).toBe(true);
  });

  it("INV-L20 (S18b): 올리기가 성공한 뒤 다시 열면 비어 있다", async () => {
    api.postNotice.mockResolvedValue({ kind: "ok", body: {} });
    mount();
    fill();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    expect(api.postNotice).toHaveBeenCalledTimes(1);
    unmount();
    mount();
    expect(title().value).toBe("");
    expect(body().value).toBe("");
    expect(pinned().checked).toBe(false);
  });

  it("INV-L20 (S18b, 실패경로): 올리기가 실패하면 저장을 지우지 않는다", async () => {
    api.postNotice.mockResolvedValue({ kind: "failed", status: 500, message: "실패", field: null });
    mount();
    fill();
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    });
    unmount();
    mount();
    expect(title().value).toBe("점검 안내");
  });
});
