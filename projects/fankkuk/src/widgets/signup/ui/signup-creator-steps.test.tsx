import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { SignupCreatorSteps } from "./signup-creator-steps";

// 크리에이터 3단계 서명 완료(kakao_done) — 계정이 생겨 로그인된 라우트(/signup/creator?step=3)에서 그린다(UX 명세 signup.md 2026-11-10).
// 머리글은 서버가 로그인 상태로 그리고, 가입 화면(/signup)을 다시 그리다 첫 화면으로 넘어가 4단계를 건너뛰는 일이 없다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("kakao_done (signup INV-U19)", () => {
  it("INV-U19 ①: 완료 상자 · 단계 줄 1~3 체크(3 이 지금 단계) · 「다음」 하나가 4단계로 — 「이전」 없음", () => {
    act(() => root.render(<SignupCreatorSteps view="kakao-done" />));
    expect(host.textContent).toContain("카카오톡 인증 알림 연결이 완료되었습니다.");
    const steps = [...host.querySelectorAll("nav li")];
    expect(steps.map((li) => (li.querySelector("svg") ? "체크" : li.textContent?.slice(0, 1)))).toEqual(["체크", "체크", "체크", "4"]);
    expect(steps[2]?.querySelector("[aria-current=step]")).not.toBeNull();
    const actions = [...host.querySelectorAll(".card a, .card button")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(actions).toEqual([["다음", "/signup/creator"]]);
  });
});

// 4단계 채널 만들기 (signup INV-U21 · UX 명세 「2026-11-11 크리에이터 4단계 채널 만들기」 · 시안 creator-channel-create-20261111)
const STATE = {
  creatorId: "11111111-2222-4333-8444-555555555555",
  name: null,
  channelTitle: "",
  verified: false,
  platform: null,
  channelUrl: null,
  verifiedAt: null,
  operatorOnly: false,
  handle: null,
  nextRecheckAt: null,
  graceUntil: null,
  recheckRequestedAt: null,
};
const TAGS = [
  { id: "11111111-1111-4111-8111-000000000001", name: "유튜브" },
  { id: "11111111-1111-4111-8111-000000000002", name: "게임" },
];
const verification = (name: string | null) => ({ state: { ...STATE, name }, rows: [], apiPlatforms: [], loginId: "honeypot" });
const PANEL_TITLE = "채널 소유자 확인";

describe("channel_new / channel_made (signup INV-U21)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("INV-U21 (channel_new): 채널이 없으면 제목 「채널 만들기」 · 닉네임 · 팬덤 이름 · 태그 · 「채널 만들기」 버튼 — 채널 소유자 확인은 그리지 않는다. 단계 줄 4는 「채널 만들기」", () => {
    act(() => root.render(<SignupCreatorSteps verification={verification(null)} channel={{ kind: "none", tagOptions: TAGS }} />));
    expect(host.querySelector(".card h2")?.textContent).toBe("채널 만들기");
    const labels = [...host.querySelectorAll(".card label")].map((l) => l.textContent?.trim());
    expect(labels.slice(0, 2)).toEqual(["닉네임", "팬덤 이름 (선택)"]);
    expect([...host.querySelectorAll(".card button")].map((b) => b.textContent)).toEqual(expect.arrayContaining(["유튜브", "게임", "채널 만들기", "가입 완료"]));
    expect(host.textContent).not.toContain(PANEL_TITLE);
    expect(host.querySelector("nav [aria-current=step]")?.textContent).toContain("채널 만들기");
    // 아래 버튼 줄은 그대로 — 「나중에 하기」 링크 + 꺼진 「가입 완료」
    expect(host.querySelector(".card a")?.textContent).toBe("나중에 하기");
  });

  it("INV-U21 (channel_made): 채널을 만든 뒤에는 초록 요약 줄(체크 + 「채널을 만들었습니다」 + 닉네임 · 팬덤 이름) 아래 채널 소유자 확인 — 만들기 칸은 없다", () => {
    act(() => root.render(<SignupCreatorSteps verification={verification("꿀단지")} channel={{ kind: "made", nickname: "꿀단지", fanName: "꿀벌단" }} />));
    const made = host.querySelector("[role=status]");
    expect(made?.querySelector("svg")).not.toBeNull();
    expect(made?.textContent).toBe("채널을 만들었습니다꿀단지 · 꿀벌단");
    const panel = [...host.querySelectorAll("h2")].find((h) => h.textContent === PANEL_TITLE);
    expect(panel).toBeDefined();
    // 요약 줄이 채널 소유자 확인보다 위
    expect(made!.compareDocumentPosition(panel!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector("input[autocomplete=nickname]")).toBeNull();
  });

  it("INV-U21 (channel_made): 팬덤 이름이 없으면 요약 줄에 닉네임만", () => {
    act(() => root.render(<SignupCreatorSteps verification={verification("꿀단지")} channel={{ kind: "made", nickname: "꿀단지", fanName: null }} />));
    expect(host.querySelector("[role=status]")?.textContent).toBe("채널을 만들었습니다꿀단지");
  });

  it("INV-U21 (실패경로): 빈 닉네임으로 「채널 만들기」를 누르면 서버에 보내지 않고 닉네임 칸 아래에 안내", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(<SignupCreatorSteps verification={verification(null)} channel={{ kind: "none", tagOptions: TAGS }} />));
    const make = [...host.querySelectorAll("button")].find((b) => b.textContent === "채널 만들기")!;
    await act(async () => make.click());
    const nick = host.querySelector<HTMLInputElement>("input[autocomplete=nickname]")!;
    expect(nick.getAttribute("aria-invalid")).toBe("true");
    const msg = document.getElementById(nick.getAttribute("aria-describedby")!.split(" ").at(-1)!);
    expect(msg?.textContent).toBe("닉네임은 1~12자로 입력해 주세요.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("INV-U21 (실패경로): 서버가 칸 오류(이미 쓰는 닉네임 409)를 주면 그 칸 아래에 서버 문구 — 채널 소유자 확인으로 넘어가지 않는다", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/signup/check") return new Response(JSON.stringify({ result: "available" }), { status: 200 });
      return new Response(JSON.stringify({ field: "nickname", message: "이미 사용 중인 닉네임입니다." }), { status: 409 });
    });
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(<SignupCreatorSteps verification={verification(null)} channel={{ kind: "none", tagOptions: TAGS }} />));
    const nick = host.querySelector<HTMLInputElement>("input[autocomplete=nickname]")!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(nick, "꿀단지");
      nick.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const chip = [...host.querySelectorAll("button")].find((b) => b.textContent === "유튜브")!;
    act(() => chip.click());
    const make = [...host.querySelectorAll("button")].find((b) => b.textContent === "채널 만들기")!;
    await act(async () => {
      make.click();
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/creator/channel");
    expect(nick.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector("[role=alert]")?.textContent).toBe("이미 사용 중인 닉네임입니다.");
    expect(host.textContent).not.toContain(PANEL_TITLE);
  });
});
