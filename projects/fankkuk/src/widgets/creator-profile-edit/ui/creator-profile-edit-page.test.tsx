import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreatorProfileEditPage, type CreatorProfileEditProps } from "./creator-profile-edit-page";

// 크리에이터 프로필 수정 (my-account INV-A9, creator-link INV-E13, design-rules 12절). 저장 경로는 예전 그대로 — 무엇을 보내는지 본다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const TAG = "00000000-0000-4000-a000-000000000001";
const base: CreatorProfileEditProps = {
  name: "하루",
  intro: "느긋한 방송",
  fanName: "달빛지기",
  colors: { personal: "#1E3A8A", fan: "#FFF59D" },
  photoPath: null,
  bgPath: null,
  symbolUrl: null,
  visibleInSearch: false,
  tagIds: [TAG],
  customTag: "",
  tagOptions: [{ id: TAG, name: "노래" }],
  photoBase: "http://photo.test",
};

async function render(patch: Partial<CreatorProfileEditProps> = {}) {
  act(() => root.render(<CreatorProfileEditPage {...base} {...patch} />));
  await act(async () => await new Promise((r) => setTimeout(r, 0)));
}

describe("프로필 수정 — 저장은 예전 두 경로 그대로 (INV-A9)", () => {
  it("INV-A9: 공개 이름·한 줄 소개·찾기 노출만 /api/creator/profile 로, 이어서 태그 — 팬덤 이름·색은 보내지 않는다(상세 설정의 칸을 덮어쓰지 않게)", async () => {
    await render();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "저장")!;
    await act(async () => {
      save.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    const calls = fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(String((init as RequestInit).body))]);
    expect(calls[0]).toEqual(["/api/creator/profile", { name: "하루", intro: "느긋한 방송", searchable: false }]);
    expect(calls[1]?.[0]).toBe("/api/creator/tags");
    expect(host.querySelector("#pe-msg")?.textContent).toBe("저장했어요.");
  });

  it("INV-E13: 위 머리 미리보기에 퍼스널 컬러(띠·테두리)와 팬덤 뱃지(팬컬러)가 보인다", async () => {
    await render();
    expect(host.querySelector<HTMLElement>("[data-creator-head]")?.style.getPropertyValue("--personal")).toBe("#1E3A8A");
    expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.style.getPropertyValue("--fan")).toBe("#FFF59D");
  });
});
