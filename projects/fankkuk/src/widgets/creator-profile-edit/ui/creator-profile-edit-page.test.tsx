import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { CreatorProfileEditPage, type CreatorProfileEditProps } from "./creator-profile-edit-page";

// 크리에이터 프로필 수정 (my-account INV-A9, creator-link INV-E13, design-rules 12절). 저장 경로는 예전 그대로 — 탭마다 무엇을 보내는지 본다.
// 2026-11-13 재분류: 탭 셋(프로필 · 채널 · 계정) — 탭마다 자기 구역만 보이는지 본다.

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

const saveButton = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "저장")!;
async function clickSave() {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  await act(async () => {
    saveButton().click();
    await new Promise((r) => setTimeout(r, 0));
  });
  return fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(String((init as RequestInit).body))]);
}

describe("프로필 수정 — 세 탭 (2026-11-13 재분류, UX 명세 creator-profile)", () => {
  it("탭 줄은 프로필 · 채널 · 계정, 주소에 탭을 싣고 지금 탭만 aria-current", async () => {
    await render({ tab: "channel" });
    const tabs = [...host.querySelectorAll<HTMLAnchorElement>("nav.tabs a")];
    expect(tabs.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["프로필", "/creator/profile"],
      ["채널", "/creator/profile?tab=channel"],
      ["계정", "/creator/profile?tab=account"],
    ]);
    expect(tabs.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
  });

  it("탭이 없으면 프로필 탭 — 닉네임·한 줄 소개·미리보기만, 채널·계정 칸은 없다", async () => {
    await render({ channelSections: <p data-x="channel">채널 구역</p>, accountSections: <p data-x="account">계정 구역</p> });
    for (const id of ["pe-name", "pe-bio"]) expect(host.querySelector(`#${id}`)).not.toBeNull();
    expect(host.querySelectorAll("aside [data-creator-head]")).toHaveLength(1);
    for (const id of ["pe-bg", "pe-find", "pe-photo"]) expect(host.querySelector(`#${id}`)).toBeNull();
    expect(host.textContent).not.toContain("태그");
    expect(host.querySelector("[data-x]")).toBeNull();
  });

  it("채널 탭 — 배경 사진·태그·찾기 노출과 넘겨받은 채널 구역만, 닉네임·소개·프로필 사진은 없다", async () => {
    await render({ tab: "channel", channelSections: <p data-x="channel">채널 구역</p>, accountSections: <p data-x="account">계정 구역</p> });
    for (const id of ["pe-bg", "pe-find"]) expect(host.querySelector(`#${id}`)).not.toBeNull();
    expect(host.querySelector("form")?.textContent).toContain("노래");
    for (const id of ["pe-name", "pe-bio", "pe-photo"]) expect(host.querySelector(`#${id}`)).toBeNull();
    expect([...host.querySelectorAll("[data-x]")].map((el) => el.getAttribute("data-x"))).toEqual(["channel"]);
  });

  it("계정 탭 — 프로필 사진과 넘겨받은 계정 구역만, 미리보기·닉네임·배경 사진·태그는 없다", async () => {
    await render({ tab: "account", channelSections: <p data-x="channel">채널 구역</p>, accountSections: <p data-x="account">계정 구역</p> });
    expect(host.querySelector("#pe-photo")).not.toBeNull();
    expect(host.textContent).toContain("프로필 사진 변경");
    for (const id of ["pe-name", "pe-bio", "pe-bg", "pe-find"]) expect(host.querySelector(`#${id}`)).toBeNull();
    expect(host.querySelector("aside")).toBeNull();
    expect([...host.querySelectorAll("[data-x]")].map((el) => el.getAttribute("data-x"))).toEqual(["account"]);
  });
});

describe("프로필 수정 — 미리보기는 탭마다 하나, 오른쪽 열 (2026-11-13 본체 지적)", () => {
  it("채널 탭 미리보기는 넘겨받은 카드 미리보기 하나 — 프로필 머리 미리보기는 없다", async () => {
    await render({ tab: "channel", channelPreview: <aside data-x="card-preview">카드</aside> });
    expect(host.querySelectorAll("aside")).toHaveLength(1);
    expect(host.querySelector("aside")?.getAttribute("data-x")).toBe("card-preview");
    expect(host.querySelector("[data-creator-head]")).toBeNull();
    // 오른쪽 열 — 왼쪽 기둥(입력 판들)의 다음 형제
    const main = host.querySelector("#pe-bg")!.closest("section")!.parentElement!;
    expect(main.nextElementSibling).toBe(host.querySelector("aside"));
  });

  it("프로필 탭 미리보기는 프로필 머리 하나, 계정 탭은 미리보기가 없다", async () => {
    await render({ channelPreview: <aside data-x="card-preview">카드</aside> });
    expect(host.querySelectorAll("aside")).toHaveLength(1);
    expect(host.querySelectorAll("aside [data-creator-head]")).toHaveLength(1);
    await render({ tab: "account", channelPreview: <aside data-x="card-preview">카드</aside> });
    expect(host.querySelector("aside")).toBeNull();
  });

  it("사진 없는 크리에이터의 머리 미리보기는 첫 글자가 아니라 기본 얼굴(2026-11-12 결정)", async () => {
    await render();
    const av = host.querySelector("aside [data-avatar]")!;
    expect(av.textContent).toBe("");
    expect(av.querySelector("img")?.getAttribute("src")).toBe("/img/default-face/cat.webp");
  });

  it("세 탭의 판은 모두 같은 판 모양 · 판마다 h2 제목 하나", async () => {
    const classes = new Set<string>();
    for (const [tab, titles] of [["profile", ["소개"]], ["channel", ["배경 사진", "태그"]], ["account", ["프로필 사진"]]] as const) {
      await render({ tab });
      const panels = [...host.querySelectorAll<HTMLElement>("[data-pe-tab] > div > :is(section, form)")];
      expect(panels.map((el) => el.querySelector("h2")?.textContent?.trim())).toEqual(titles);
      for (const el of panels) {
        expect(el.querySelectorAll("h2")).toHaveLength(1);
        classes.add(el.className);
      }
    }
    expect(classes.size).toBe(1);
  });
});

describe("프로필 수정 — 탭마다 「저장」이 보내는 칸 (INV-A9 — 서버는 보낸 칸만 바꾼다)", () => {
  it("INV-A9·INV-CN2: 프로필 탭 「저장」은 닉네임·한 줄 소개만 /api/creator/profile 로 — 찾기 노출·태그·팬덤은 보내지 않는다", async () => {
    await render();
    const calls = await clickSave();
    expect(calls).toEqual([["/api/creator/profile", { nickname: "하루", intro: "느긋한 방송" }]]);
    expect(host.querySelector("#pe-msg")?.textContent).toBe("저장되었습니다.");
  });

  it("INV-A9·INV-T3: 채널 탭 「저장」은 찾기 노출만 /api/creator/profile 로, 이어서 태그 — 닉네임·소개는 보내지 않는다", async () => {
    await render({ tab: "channel" });
    const calls = await clickSave();
    expect(calls[0]).toEqual(["/api/creator/profile", { searchable: false }]);
    expect(calls[1]).toEqual(["/api/creator/tags", { tagIds: [TAG], customTag: "" }]);
    expect(calls).toHaveLength(2);
    expect(host.querySelector("#pe-msg")?.textContent).toBe("저장되었습니다.");
  });

  it("INV-E13: 미리보기 머리에 테마 색(띠·테두리)과 팬덤 뱃지(테마 색 면)가 보인다", async () => {
    await render();
    expect(host.querySelector<HTMLElement>("[data-creator-head]")?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
    expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
  });
});

describe("프로필 수정 — 배치 (design-rules 27절 「4파트 나머지」)", () => {
  it("미리보기는 입력 판 뒤의 aside 안, 「미리보기」 제목 아래 프로필 머리 하나", async () => {
    await render();
    const aside = host.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside!.querySelector("h2, h3")?.textContent?.trim()).toBe("미리보기");
    expect(host.querySelectorAll("[data-creator-head]")).toHaveLength(1);
    const form = host.querySelector("form")!;
    expect(form.compareDocumentPosition(aside!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(aside!.contains(form)).toBe(false);
  });

  it("채널 탭 — 배경 사진 칸은 저장 form 밖(고르는 즉시 저장), 태그·스위치는 form 안", async () => {
    await render({ tab: "channel" });
    const form = host.querySelector("form")!;
    expect(form.querySelector("#pe-find")).not.toBeNull();
    expect(form.textContent).not.toContain("배경 사진 변경");
    expect(host.textContent).toContain("배경 사진 변경");
  });

  it("결과 안내(role=status)와 [취소][저장]은 저장 판 안 맨 끝", async () => {
    for (const tab of ["profile", "channel"] as const) {
      await render({ tab });
      const end = host.querySelector("form")!.lastElementChild!;
      expect(end.querySelector("[role=status]#pe-msg")).not.toBeNull();
      expect([...end.querySelectorAll("a, button")].map((el) => el.textContent?.trim())).toEqual(["취소", "저장"]);
    }
  });

  it("찾기 노출 스위치는 줄 전체가 누르는 칸 — 글자를 눌러도 켜지고, 저장에 실린다", async () => {
    await render({ tab: "channel" });
    const sw = host.querySelector<HTMLInputElement>("#pe-find")!;
    expect(sw.getAttribute("role")).toBe("switch");
    const row = sw.closest("label")!;
    expect(row.textContent).toContain("크리에이터 찾기에 보이기");
    act(() => row.querySelector<HTMLElement>("strong, span")!.click());
    expect(sw.checked).toBe(true);
    const calls = await clickSave();
    expect(calls[0]?.[1]).toEqual({ searchable: true });
  });

  it("머리 설명 — 미리보기가 있는 프로필·채널 탭은 두 문장, 계정 탭은 앞 문장만", async () => {
    for (const tab of ["profile", "channel"] as const) {
      await render({ tab });
      expect(host.querySelector("header p")?.textContent).toBe("팬에게 공개되는 프로필입니다. 변경할 내용을 미리보기에서 확인해 주세요.");
    }
    await render({ tab: "account" });
    expect(host.querySelector("header p")?.textContent).toBe("팬에게 공개되는 프로필입니다.");
  });

  it("머리 설명은 그대로, 미리보기는 입력하는 대로 바뀐다", async () => {
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
