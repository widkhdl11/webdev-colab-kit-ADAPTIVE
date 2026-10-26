import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { FollowThenSend } from "@/features/creator-follow/ui/follow-then-send";

// 「팔로우하고 선물 보내기」(FollowThenSend)의 겉 동작 — 팔로우를 저장한 뒤에만 그 크리에이터를 고른 보내기 화면으로 간다(session-login INV-L9).
// 저장 요청(/api/follows)은 fetch 를 바꿔 끼워 본다 — 부품·저장 훅·저장 함수는 진짜를 쓴다(tests/profile-single-send-ui.test.tsx 와 같은 방식).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CREATOR_ID = "00000000-0000-4000-b000-000000000001";

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  router.refresh.mockReset();
  router.push.mockReset();
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function renderAndPress() {
  act(() => root.render(<FollowThenSend creatorId={CREATOR_ID} creatorName="하루" signedIn />));
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("FollowThenSend — 팔로우하고 선물 보내기 (INV-L9)", () => {
  it("INV-L9: 팔로우 저장에 성공하면 그 크리에이터를 고른 선물 보내기 화면으로 간다", async () => {
    renderAndPress();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ creatorId: CREATOR_ID, following: true });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(`/gifts/new?creator=${CREATOR_ID}`);
  });

  it("INV-L9 (실패경로): 저장이 500 으로 실패하면 이동하지 않고 「팔로우 설정을 저장하지 못했습니다」를 알린다", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    renderAndPress();
    await flush();
    expect(router.push).not.toHaveBeenCalled();
    const status = host.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain("팔로우 설정을 저장하지 못했습니다");
  });

  it("INV-L9 (실패경로): 세션이 끝나 401 이면 보내기 화면이 아니라 로그인 화면으로 간다", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 401 }));
    renderAndPress();
    await flush();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith("/login");
  });
});
