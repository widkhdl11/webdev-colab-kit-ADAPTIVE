// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftScope, useFormDraft } from "./use-form-draft";

// 폼 임시 저장 훅을 실제 React 폼에 붙여 본다 (docs/specs/session-login.md INV-L20).
// React 가 관리하는 칸(controlled)도 되돌린 값을 상태로 받는지, 비밀번호는 되돌리지 않는지, 다른 계정이면 되돌리지 않는지.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = "00000000-0000-4000-a000-0000000000a1";
const B = "00000000-0000-4000-a000-0000000000b2";
const DAY = 24 * 60 * 60 * 1000;

let shown: { title: string; pin: boolean } = { title: "", pin: false };
let clearRef: (() => void) | null = null;
/** 그 폼을 열 때의 서버 값(INV-L20 — 서버 값이 바뀌었으면 복원하지 않는다). undefined 면 기준값 없는 폼 */
let serverBaseline: string | undefined;
let rerenderParent: (() => void) | null = null;

function NoticeForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [pin, setPin] = useState(false);
  const [pw, setPw] = useState("");
  const { clear } = useFormDraft(ref, "notice-form", { baseline: serverBaseline });
  clearRef = clear;
  shown = { title, pin };
  return (
    <form ref={ref}>
      <input name="title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
      <input name="pin" type="checkbox" checked={pin} onChange={(e) => setPin(e.currentTarget.checked)} />
      <input name="pw" type="password" value={pw} onChange={(e) => setPw(e.currentTarget.value)} />
    </form>
  );
}

let root: Root | null = null;
let host: HTMLDivElement;

/** 부모가 다시 그려져도(같은 계정) 임시 저장을 다시 되돌리지 않는지 보려고 부모에 상태를 둔다 */
function Parent({ userId }: { userId: string | null }) {
  const [, setN] = useState(0);
  rerenderParent = () => setN((n) => n + 1);
  return (
    <DraftScope userId={userId} maxAgeMs={DAY}>
      <NoticeForm />
    </DraftScope>
  );
}

function mount(userId: string | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<Parent userId={userId} />);
  });
}
function unmount() {
  act(() => root?.unmount());
  host.remove();
  root = null;
}
function type(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector)!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  serverBaseline = undefined;
});
afterEach(() => {
  if (root) unmount();
  vi.useRealTimers();
});

describe("INV-L20: 같은 계정으로 다시 열면 입력이 돌아온다", () => {
  it("INV-L20 (S18): 입력 → 다시 열면 React 상태까지 복원, 비밀번호 칸은 비어 있다", () => {
    mount(A);
    type('input[name="title"]', "점검 공지");
    act(() => host.querySelector<HTMLInputElement>('input[name="pin"]')!.click());
    type('input[name="pw"]', "secret-1234");
    act(() => vi.advanceTimersByTime(1000));
    expect(JSON.stringify(localStorage)).not.toContain("secret-1234");
    unmount();

    mount(A);
    expect(shown).toEqual({ title: "점검 공지", pin: true });
    expect(host.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("점검 공지");
    expect(host.querySelector<HTMLInputElement>('input[name="pw"]')!.value).toBe("");
  });

  it("INV-L20 (S18b, 실패경로): 다른 계정으로 열면 되돌리지 않고 앞 사람의 저장을 지운다", () => {
    mount(A);
    type('input[name="title"]', "A 의 입력");
    act(() => vi.advanceTimersByTime(1000));
    unmount();
    mount(B);
    expect(shown.title).toBe("");
    expect(Object.keys(localStorage).filter((k) => k.includes(A))).toEqual([]);
  });

  it("INV-L20 (S18b): 제출 성공(clear) 뒤 다시 열면 비어 있다", () => {
    mount(A);
    type('input[name="title"]', "보낸 공지");
    act(() => vi.advanceTimersByTime(1000));
    act(() => clearRef!());
    unmount();
    mount(A);
    expect(shown.title).toBe("");
  });

  it("INV-L20 (실패경로): 계정 범위 밖(로그인 안 됨)에서는 저장하지 않는다", () => {
    mount(null);
    type('input[name="title"]', "x");
    act(() => vi.advanceTimersByTime(1000));
    expect(localStorage.length).toBe(0);
  });

  it("INV-L20 (코드 리뷰 4, 실패경로): 서버 값을 고치는 폼은 저장 때의 서버 값과 지금 서버 값이 다르면 복원하지 않는다", () => {
    serverBaseline = "fee=1400";
    mount(A);
    type('input[name="title"]', "고치던 값");
    act(() => vi.advanceTimersByTime(1000));
    unmount();
    serverBaseline = "fee=1500"; // 그사이 다른 운영자가 저장했다
    mount(A);
    expect(shown.title).toBe("");
    expect(Object.keys(localStorage).filter((k) => k.startsWith("fk-draft:"))).toEqual([]);
  });

  it("INV-L20: 서버 값이 같으면 복원한다", () => {
    serverBaseline = "fee=1400";
    mount(A);
    type('input[name="title"]', "고치던 값");
    act(() => vi.advanceTimersByTime(1000));
    unmount();
    mount(A);
    expect(shown.title).toBe("고치던 값");
  });

  it("INV-L20 (코드 리뷰 3): 부모가 다시 그려져도(같은 계정) 되돌리기를 다시 하지 않는다 — 입력 중인 값을 옛 저장으로 덮지 않는다", () => {
    mount(A);
    type('input[name="title"]', "처음 저장");
    act(() => vi.advanceTimersByTime(1000));
    unmount();
    mount(A);
    expect(shown.title).toBe("처음 저장");
    type('input[name="title"]', "처음 저장 고침");
    act(() => rerenderParent!());
    expect(shown.title).toBe("처음 저장 고침");
  });

  it("INV-L20 (보안 리뷰 낮음 2): 운영자 화면 틀(DraftScope)이 열리면 다른 계정·만료된 임시 저장을 지운다 — 폼이 없어도", () => {
    localStorage.setItem(`fk-draft:${B}:x`, JSON.stringify({ savedAt: Date.now(), values: { a: "1" } }));
    localStorage.setItem(`fk-draft:${A}:old`, JSON.stringify({ savedAt: Date.now() - DAY, values: { a: "1" } }));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<DraftScope userId={A} maxAgeMs={DAY}>{null}</DraftScope>));
    expect(Object.keys(localStorage).filter((k) => k.startsWith("fk-draft:"))).toEqual([]);
  });
});
