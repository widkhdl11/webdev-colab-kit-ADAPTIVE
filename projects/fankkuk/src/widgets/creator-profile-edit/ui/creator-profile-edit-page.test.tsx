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
  colors: { personal: "#DCEBFF" },
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
    expect(host.querySelector("#pe-msg")?.textContent).toBe("저장되었습니다.");
  });

  it("INV-E13: 위 머리 미리보기에 테마 색(띠·테두리)과 팬덤 뱃지(테마 색 면)가 보인다", async () => {
    await render();
    expect(host.querySelector<HTMLElement>("[data-creator-head]")?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
    expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
  });
});

describe("프로필 수정 — 배치 (design-rules 27절 「4파트 나머지」, 시안 pilot-2026-10-22/creator-profile.html)", () => {
  it("미리보기는 입력 판들 뒤의 aside 안, 「미리보기」 제목 아래 프로필 머리 하나", async () => {
    await render();
    const aside = host.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.querySelector("h2, h3")?.textContent?.trim()).toBe("미리보기");
    expect(aside!.querySelectorAll("[data-creator-head]")).toHaveLength(1);
    expect(host.querySelectorAll("[data-creator-head]")).toHaveLength(1);
    const form = host.querySelector("form")!;
    // 문서 순서상 입력(소개 판)이 미리보기보다 앞
    expect(form.compareDocumentPosition(aside!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aside!.contains(form)).toBe(false);
  });

  it("「사진」 판과 「소개」 판이 나뉜다 — 사진 칸은 저장 form 밖, 이름·소개·태그·스위치는 form 안", async () => {
    await render();
    const photo = [...host.querySelectorAll("section")].find((el) => el.querySelector("h2")?.textContent?.trim() === "사진")!;
    expect(photo).toBeTruthy();
    const form = host.querySelector("form")!;
    expect(form.contains(photo)).toBe(false);
    expect(photo.contains(form)).toBe(false);
    expect(photo.textContent).toContain("배경 사진 변경");
    expect(photo.textContent).toContain("프로필 사진 변경");
    expect(form.querySelector("h2")?.textContent?.trim()).toBe("소개");
    for (const id of ["pe-name", "pe-bio", "pe-find"]) expect(form.querySelector(`#${id}`)).not.toBeNull();
    expect(form.textContent).not.toContain("배경 사진 변경");
  });

  it("결과 안내(role=status)와 [취소][저장]은 소개 판 안 맨 끝", async () => {
    await render();
    const form = host.querySelector("form")!;
    const end = form.lastElementChild!;
    expect(end.querySelector("[role=status]#pe-msg")).not.toBeNull();
    const labels = [...end.querySelectorAll("a, button")].map((el) => el.textContent?.trim());
    expect(labels).toEqual(["취소", "저장"]);
  });

  it("찾기 노출 스위치는 줄 전체가 누르는 칸 — 글자를 눌러도 켜지고, 저장에 실린다", async () => {
    await render();
    const sw = host.querySelector<HTMLInputElement>("#pe-find")!;
    expect(sw.getAttribute("role")).toBe("switch");
    const row = sw.closest("label");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("크리에이터 찾기에 보이기");
    expect(sw.checked).toBe(false);
    act(() => row!.querySelector<HTMLElement>("strong, span")!.click());
    expect(sw.checked).toBe(true);
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const save = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "저장")!;
    await act(async () => {
      save.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).searchable).toBe(true);
  });

  it("머리 설명은 「미리보기 모양이 그대로 보여요」, 미리보기는 입력하는 대로 바뀐다", async () => {
    await render();
    expect(host.querySelector("header p")?.textContent).toBe("팬에게 공개되는 프로필입니다. 변경할 내용을 미리보기에서 확인해 주세요.");
    const input = host.querySelector<HTMLInputElement>("#pe-name")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(input, "새이름");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("aside [data-creator-head]")?.textContent).toContain("새이름");
  });
});
