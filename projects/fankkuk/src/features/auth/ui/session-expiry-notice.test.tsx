// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_WARNING_MS } from "@/entities/session/model/session-lifetime";
import { SessionExpiryNotice } from "./session-expiry-notice";

// 운영자 화면의 「곧 로그아웃됩니다」 (session-login INV-L19). 시계는 가짜, 서버 답은 시험마다 정한다.
// 다른 탭에서 쓰면 끝나는 시각이 뒤로 간다 — 그때 보이던 안내는 사라져야 한다(코드 리뷰 1·UX 리뷰 높음).
// 서버에 못 물은 것(네트워크·500·JSON 아님)과 끝났다는 답은 다르다 — 못 물었으면 다음에 다시 묻고 로그인 화면으로 보내지 않는다(코드 리뷰 2).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MIN = 60_000;
let host: HTMLDivElement;
let root: Root;
let answers: (() => Promise<Response>)[] = [];
let ended: number;

const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const shown = () => host.querySelector("[data-session-notice]");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-10-31T12:00:00Z"));
  answers = [];
  ended = 0;
  vi.stubGlobal("fetch", async () => {
    const next = answers.shift();
    if (!next) throw new Error("답이 없다");
    return next();
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount(endsInMs: number, extendable = true) {
  const now = Date.now();
  await act(async () => {
    root.render(<SessionExpiryNotice initial={{ endsAt: now + endsInMs, extendable, now }} onEnded={() => (ended += 1)} />);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("INV-L19: 끝나기 5분 전 안내", () => {
  it("INV-L19 (S17): 끝나기 5분 전에 서버에 다시 묻고 같으면 「곧 로그아웃됩니다」와 [연장]", async () => {
    const endsAt = Date.now() + SESSION_WARNING_MS - MIN;
    answers.push(json({ endsAt, extendable: true, now: Date.now() }));
    await mount(SESSION_WARNING_MS - MIN);
    expect(shown()?.textContent).toContain("곧 로그아웃됩니다");
    expect(host.querySelector("button")?.textContent).toBe("연장");
  });

  it("INV-L19 (코드 리뷰 1): 보이는 중에 다른 탭 사용으로 끝나는 시각이 뒤로 가면 안내를 숨긴다", async () => {
    const t0 = Date.now();
    answers.push(json({ endsAt: t0 + 4 * MIN, extendable: true, now: t0 }));
    await mount(4 * MIN);
    expect(shown()).not.toBeNull();
    // 끝나는 시각에 다시 물으니 30분 뒤로 갔다
    answers.push(json({ endsAt: t0 + 34 * MIN, extendable: true, now: t0 + 4 * MIN }));
    await advance(4 * MIN);
    expect(shown()).toBeNull();
    expect(ended).toBe(0);
  });

  it("INV-L19: 서버가 끝났다고 답하면 로그인 화면으로", async () => {
    answers.push(json({ ended: true }));
    await mount(SESSION_WARNING_MS - MIN);
    expect(ended).toBe(1);
  });

  for (const [name, answer] of [
    ["네트워크 오류", async () => Promise.reject(new Error("offline"))],
    ["500", json({ message: "x" }, 500)],
    ["JSON 아님", async () => new Response("<html>", { status: 200 })],
  ] as const) {
    it(`INV-L19 (코드 리뷰 2, 실패경로): 물어보기 실패(${name})는 끝남이 아니다 — 로그인 화면으로 보내지 않고 다음에 다시 묻는다`, async () => {
      const endsAt = Date.now() + SESSION_WARNING_MS - MIN;
      answers.push(answer);
      await mount(SESSION_WARNING_MS - MIN, false);
      expect(ended).toBe(0);
      expect(shown()).toBeNull();
      answers.push(json({ endsAt, extendable: false, now: Date.now() }));
      await advance(30_000);
      expect(ended).toBe(0);
      expect(shown()?.textContent).toContain("곧 로그아웃됩니다");
      expect(host.querySelector("button")).toBeNull();
    });
  }

  it("INV-L19 (코드 리뷰 2, 실패경로): [연장] 요청이 실패해도 로그인 화면으로 보내지 않고 안내를 남긴다", async () => {
    answers.push(json({ endsAt: Date.now() + 3 * MIN, extendable: true, now: Date.now() }));
    await mount(3 * MIN);
    answers.push(json({ message: "x" }, 500));
    await act(async () => {
      host.querySelector("button")!.click();
    });
    expect(ended).toBe(0);
    expect(shown()).not.toBeNull();
  });
});
